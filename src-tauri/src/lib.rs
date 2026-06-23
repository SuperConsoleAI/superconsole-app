mod agents;
mod auth;
mod chat;
mod cli_sessions;
mod cloud;
mod commands;
mod connectors;
mod context;
mod crypto;
mod db;
mod files;
mod llm;
mod memory;
mod pty;
mod remote;
mod scheduler;
mod session_logs;
mod skills;
mod mcp;
mod mcp_server;
mod sync_manager;
mod team;
mod usage;
mod wiki;

use auth::AuthState;

use db::{AgentRow, ChatMessage, Db, InboxItem, Job, Organization, SessionFeedItem, SessionLog, Workspace};
use files::FileEntry;
use pty::{SessionInfo, SessionManager};
use std::path::Path;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn list_workspaces(db: State<Db>) -> Result<Vec<Workspace>, String> {
    db.list_workspaces()
}

#[tauri::command]
fn add_workspace(
    db: State<Db>,
    name: String,
    path: String,
    cli: String,
    organization_id: i64,
) -> Result<Workspace, String> {
    let p = Path::new(&path);
    if p.exists() {
        if !p.is_dir() {
            return Err(format!("Not a folder: {}", path));
        }
    } else {
        std::fs::create_dir_all(p).map_err(|e| format!("Could not create folder: {}", e))?;
    }
    db.add_workspace(&name, &path, &cli, organization_id)
}

#[tauri::command]
fn list_organizations(db: State<Db>) -> Result<Vec<Organization>, String> {
    db.list_organizations()
}

#[tauri::command]
fn add_organization(db: State<Db>, name: String) -> Result<Organization, String> {
    db.add_organization(&name)
}

#[tauri::command]
fn remove_workspace(
    db: State<Db>,
    sessions: State<SessionManager>,
    id: i64,
) -> Result<(), String> {
    pty::stop_workspace_sessions(&sessions, id);
    db.remove_workspace(id)
}

#[tauri::command]
async fn start_session(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    workspace_id: i64,
    session_id: String,
    cli: String,
    rows: u16,
    cols: u16,
    resume_session_id: Option<String>,
) -> Result<SessionInfo, String> {
    let (ws_path, env_files, account_env_files, account_env_vars, was_active) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        let account_files = db.get_setting("account_env_files").unwrap_or_default();
        let account_vars = db.get_setting("account_env_vars").unwrap_or_default();
        (
            ws.path,
            ws.env_files,
            account_files,
            account_vars,
            pty::session_active(&sessions, &session_id),
        )
    };
    // Refresh the SuperConsole MCP config (fresh token, pre-approved) so the
    // launching CLI can reach skills/memory/wiki/connector tools.
    if cli == "claude" || cli == "droid" {
        if let Some(ctx) = mcp::native_ctx(&app, workspace_id) {
            let mcps = connectors::workspace_connector_mcps(&app, workspace_id);
            let _ = mcp::write_mcp_config(&ctx, &mcps);
        }
    } else if cli == "codex" {
        // Codex has no project-scoped MCP config; register superconsole in the
        // global ~/.codex/config.toml (last-launched workspace wins on token).
        if let Some(ctx) = mcp::native_ctx(&app, workspace_id) {
            let _ = mcp::write_codex_mcp_config(&ctx);
        }
    } else if cli == "antigravity" {
        // Antigravity CLI (project .gemini/settings.json) + editor
        // (global ~/.gemini/config/mcp_config.json), both trusted.
        if let Some(ctx) = mcp::native_ctx(&app, workspace_id) {
            let _ = mcp::write_antigravity_mcp_config(&ctx);
        }
    }
    let resolved = llm::session_env(&app, workspace_id);
    // Env loads after the workspace .env (applied inside pty::start_session) but
    // before cloud LLM keys/connectors, which win. Account scope is the base;
    // per-workspace files override it.
    let mut env = pty::parse_env_vars_json(&account_env_vars);
    env.extend(pty::extra_env_files(&ws_path, &account_env_files));
    env.extend(pty::extra_env_files(&ws_path, &env_files));
    env.extend(resolved.env);
    env.extend(connectors::session_env(&app, workspace_id));
    let info = pty::start_session(
        &app,
        &sessions,
        &session_id,
        workspace_id,
        &ws_path,
        &cli,
        rows,
        cols,
        &env,
        &resolved.providers,
        resume_session_id.as_deref(),
    )?;
    if !was_active {
        let db = app.state::<Db>();
        let _ = db.log_session(workspace_id, &session_id, &cli, None, None);
    }
    Ok(info)
}

#[tauri::command]
fn write_session(sessions: State<SessionManager>, session_id: String, data: String) -> Result<(), String> {
    pty::write_session(&sessions, &session_id, &data)
}

/// Read one usage aggregate row from the local display cache (mirror of the
/// Turso shared totals). `level` is project|org|account.
#[tauri::command]
fn get_usage(app: AppHandle, level: String, id: String) -> Result<serde_json::Value, String> {
    let table = match level.as_str() {
        "project" => "project_usage",
        "org" => "org_usage",
        "account" => "account_usage",
        _ => return Err("invalid usage level".into()),
    };
    let db = app.state::<Db>();
    Ok(db.get_usage_row(table, &id).unwrap_or_else(|| crate::usage::zero_row(&id)))
}

#[tauri::command]
fn resize_session(
    sessions: State<SessionManager>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    pty::resize_session(&sessions, &session_id, rows, cols)
}

#[tauri::command]
fn stop_session(db: State<Db>, sessions: State<SessionManager>, session_id: String) -> Result<(), String> {
    let _ = db.close_session_log(&session_id);
    db.finalize_cli_session_cost(&session_id);
    pty::stop_session(&sessions, &session_id)
}

#[tauri::command]
fn session_active(sessions: State<SessionManager>, session_id: String) -> bool {
    pty::session_active(&sessions, &session_id)
}

#[tauri::command]
fn update_workspace_cli(db: State<Db>, id: i64, cli: String) -> Result<(), String> {
    db.update_workspace_cli(id, &cli)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn update_workspace(
    app: AppHandle,
    id: i64,
    default_run_mode: String,
    default_cli: String,
    default_provider: String,
    default_model: String,
    script_setup: String,
    script_run: String,
    script_teardown: String,
    script_auto_run: bool,
    repo_url: String,
    description: String,
) -> Result<(), String> {
    let (project_id, ws) = {
        let db = app.state::<Db>();
        db.update_workspace(
            id,
            &default_run_mode,
            &default_cli,
            &default_provider,
            &default_model,
            &script_setup,
            &script_run,
            &script_teardown,
            script_auto_run,
            &repo_url,
            &description,
        )?;
        (db.get_workspace_project_id(id), db.get_workspace(id).ok())
    };
    // Mirror the shareable subset to the cloud projects row when linked.
    if let (Some(pid), Some(ws)) = (project_id, ws) {
        llm::push_project_settings(&pid, &ws).await;
    }
    Ok(())
}

#[tauri::command]
fn set_workspace_env_files(
    db: State<Db>,
    workspace_id: i64,
    env_files: Vec<String>,
) -> Result<(), String> {
    let json = serde_json::to_string(&env_files).map_err(|e| e.to_string())?;
    db.set_workspace_env_files(workspace_id, &json)
}

#[tauri::command]
fn read_env_file(db: State<Db>, workspace_id: i64) -> Result<Vec<files::EnvEntry>, String> {
    let ws = db.get_workspace(workspace_id)?;
    files::read_env_file(&ws.path)
}

#[tauri::command]
fn write_env_file(
    db: State<Db>,
    workspace_id: i64,
    entries: Vec<files::EnvEntry>,
) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    files::write_env_file(&ws.path, &entries)
}

#[tauri::command]
fn set_env_entry(
    db: State<Db>,
    workspace_id: i64,
    key: String,
    value: String,
) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    files::set_env_entry(&ws.path, &key, &value)
}

#[tauri::command]
fn delete_env_entry(db: State<Db>, workspace_id: i64, key: String) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    files::delete_env_entry(&ws.path, &key)
}

#[tauri::command]
fn list_dir(db: State<Db>, workspace_id: i64, rel: String) -> Result<Vec<FileEntry>, String> {
    let ws = db.get_workspace(workspace_id)?;
    files::list_dir(&ws.path, &rel)
}

#[tauri::command]
fn read_file(db: State<Db>, workspace_id: i64, rel: String) -> Result<String, String> {
    let ws = db.get_workspace(workspace_id)?;
    files::read_file(&ws.path, &rel)
}

#[tauri::command]
fn write_file(db: State<Db>, workspace_id: i64, rel: String, content: String) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    files::write_file(&ws.path, &rel, &content)
}

#[tauri::command]
fn create_entry(db: State<Db>, workspace_id: i64, rel: String, is_dir: bool) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    files::create_entry(&ws.path, &rel, is_dir)
}

#[tauri::command]
fn delete_entry(db: State<Db>, workspace_id: i64, rel: String) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    files::delete_entry(&ws.path, &rel)
}

#[tauri::command]
fn list_cli_sessions(
    app: AppHandle,
    workspace_path: String,
    cli: String,
) -> Result<Vec<cli_sessions::CliSession>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    cli_sessions::list_sessions(&home, &workspace_path, &cli)
}

#[tauri::command]
fn read_cli_session(
    app: AppHandle,
    file_path: String,
    cli: String,
) -> Result<Vec<cli_sessions::CliSessionMessage>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    cli_sessions::read_session(&home, &file_path, &cli)
}

#[tauri::command]
fn list_jobs(db: State<Db>, workspace_id: i64) -> Result<Vec<Job>, String> {
    db.list_jobs(workspace_id)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn add_job(
    db: State<Db>,
    workspace_id: i64,
    name: String,
    command: String,
    schedule: String,
    run_mode: Option<String>,
    run_config: Option<String>,
    trigger_type: Option<String>,
    trigger_config: Option<String>,
    allowed_connectors: Option<String>,
) -> Result<Job, String> {
    let trigger_type = trigger_type.unwrap_or_else(|| "cron".into());
    let next = if trigger_type == "cron" {
        Some(scheduler::next_run(&schedule)?)
    } else {
        None
    };
    db.add_job(
        workspace_id,
        &name,
        &command,
        &schedule,
        next.as_deref(),
        &run_mode.unwrap_or_else(|| "cli".into()),
        &run_config.unwrap_or_else(|| "{}".into()),
        &trigger_type,
        &trigger_config.unwrap_or_else(|| "{}".into()),
        &allowed_connectors.unwrap_or_else(|| "[]".into()),
    )
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn update_job(
    db: State<Db>,
    id: i64,
    name: String,
    command: String,
    schedule: String,
    run_mode: String,
    run_config: String,
    trigger_type: String,
    trigger_config: String,
    allowed_connectors: String,
) -> Result<Job, String> {
    let existing = db.get_job(id)?;
    let next = if trigger_type == "cron" {
        if existing.enabled {
            Some(scheduler::next_run(&schedule)?)
        } else {
            existing.next_run.clone()
        }
    } else {
        None
    };
    db.update_job(
        id,
        &name,
        &command,
        &schedule,
        next.as_deref(),
        &run_mode,
        &run_config,
        &trigger_type,
        &trigger_config,
        &allowed_connectors,
    )
}

#[tauri::command]
fn list_workspace_connectors(
    app: AppHandle,
    workspace_id: i64,
) -> Result<Vec<connectors::WorkspaceConnector>, String> {
    Ok(connectors::workspace_connectors(&app, workspace_id))
}

#[tauri::command]
fn set_job_enabled(db: State<Db>, id: i64, enabled: bool) -> Result<(), String> {
    let next = if enabled {
        let job = db.get_job(id)?;
        Some(scheduler::next_run(&job.schedule)?)
    } else {
        None
    };
    db.set_job_enabled(id, enabled, next.as_deref())
}

#[tauri::command]
fn delete_job(db: State<Db>, id: i64) -> Result<(), String> {
    db.delete_job(id)
}

#[tauri::command]
async fn run_job_now(app: AppHandle, id: i64) -> Result<(), String> {
    let job = {
        let db = app.state::<Db>();
        db.get_job(id)?
    };
    scheduler::run_job(&app, job).await
}

// --- agents (file-defined workers in .superconsole/agents/<name>/agent.md) ---

#[tauri::command]
fn list_agents(db: State<Db>, workspace_id: i64) -> Result<Vec<agents::Agent>, String> {
    let ws = db.get_workspace(workspace_id)?;
    Ok(agents::list_agents(&ws.path))
}

#[tauri::command]
fn read_agent(db: State<Db>, workspace_id: i64, name: String) -> Result<agents::Agent, String> {
    let ws = db.get_workspace(workspace_id)?;
    agents::read_agent(&ws.path, &name)
}

#[tauri::command]
fn save_agent(db: State<Db>, workspace_id: i64, agent: agents::Agent) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    agents::write_agent(&ws.path, &agent)
}

#[tauri::command]
fn delete_agent(db: State<Db>, workspace_id: i64, name: String) -> Result<(), String> {
    let ws = db.get_workspace(workspace_id)?;
    agents::delete_agent(&ws.path, &name)
}

#[tauri::command]
async fn list_catalog_agents() -> Result<Vec<agents::CatalogAgent>, String> {
    agents::list_catalog_agents().await
}

#[tauri::command]
async fn upsert_catalog_agent(input: agents::CatalogAgentInput) -> Result<(), String> {
    agents::upsert_catalog_agent(input).await
}

#[tauri::command]
async fn import_repo_agents(repo: String, git_ref: String) -> Result<u32, String> {
    agents::import_repo_agents(repo, git_ref).await
}

#[tauri::command]
async fn detect_repo_agents(
    repo: String,
    git_ref: String,
) -> Result<Vec<agents::CatalogAgentInput>, String> {
    agents::detect_repo_agents(repo, git_ref).await
}

#[tauri::command]
async fn delete_catalog_agent(id: String) -> Result<(), String> {
    agents::delete_catalog_agent(id).await
}

#[tauri::command]
async fn install_catalog_agent(app: AppHandle, workspace_id: i64, id: String) -> Result<(), String> {
    let ws_path = app.state::<Db>().get_workspace(workspace_id)?.path;
    agents::install_catalog_agent(&ws_path, &id).await
}

#[tauri::command]
async fn install_repo_agent(
    app: AppHandle,
    workspace_id: i64,
    repo: String,
    git_ref: String,
) -> Result<String, String> {
    let ws_path = app.state::<Db>().get_workspace(workspace_id)?.path;
    agents::install_repo_agent(&ws_path, repo, git_ref).await
}

#[tauri::command]
async fn scaffold_project_from_repo(
    parent_dir: String,
    repo: String,
    git_ref: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        agents::scaffold_project_from_repo(&parent_dir, repo, git_ref)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn run_agent_now(app: AppHandle, workspace_id: i64, name: String) -> Result<(), String> {
    let agent = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        agents::read_agent(&ws.path, &name)?
    };
    scheduler::exec_agent(&app, workspace_id, &agent).await?;
    Ok(())
}

/// List the local agent metadata rows for a workspace (merged with file presence).
#[tauri::command]
fn list_workspace_agents(db: State<Db>, workspace_id: i64) -> Result<Vec<AgentRow>, String> {
    db.list_agent_rows(workspace_id)
}

/// Upsert an agent metadata row — called when saving an agent from the UI.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn upsert_agent_metadata(
    app: AppHandle,
    workspace_id: i64,
    name: String,
    description: String,
    schedule: String,
    default_run_mode: String,
    default_cli: String,
    default_provider: String,
    default_model: String,
    skills: String,
    connectors: String,
    is_active: bool,
) -> Result<AgentRow, String> {
    let (row, project_id) = {
        let db = app.state::<Db>();
        let id = ulid::Ulid::new().to_string();
        let row = db.upsert_agent_row(
            &id,
            workspace_id,
            &name,
            &description,
            &schedule,
            &default_run_mode,
            &default_cli,
            &default_provider,
            &default_model,
            &skills,
            &connectors,
            is_active,
            None,
        )?;
        let pid = db.get_workspace_project_id(workspace_id);
        (row, pid)
    };
    // Mirror to Turso if the workspace is linked to a cloud project.
    agents::push_agent_to_cloud(
        &app,
        project_id.as_deref(),
        &row.id,
        &name,
        &description,
        &schedule,
        &default_run_mode,
        &default_cli,
        &default_provider,
        &default_model,
        &skills,
        &connectors,
        is_active,
        row.last_run.as_deref(),
    )
    .await;
    Ok(row)
}

/// Delete an agent metadata row (does NOT delete the agent.md file).
#[tauri::command]
async fn delete_agent_metadata(app: AppHandle, workspace_id: i64, name: String) -> Result<(), String> {
    let project_id = {
        let db = app.state::<Db>();
        db.delete_agent_row(workspace_id, &name)?;
        db.get_workspace_project_id(workspace_id)
    };
    agents::delete_agent_from_cloud(&app, project_id.as_deref(), &name).await;
    Ok(())
}

/// Toggle an agent's active flag (pauses/resumes scheduled runs).
#[tauri::command]
fn set_agent_active(db: State<Db>, workspace_id: i64, name: String, is_active: bool) -> Result<(), String> {
    db.set_agent_active(workspace_id, &name, is_active)
}

/// List sessions attributed to a specific agent (for the Activity tab).
#[tauri::command]
fn list_agent_sessions(
    db: State<Db>,
    workspace_id: i64,
    agent_name: String,
) -> Result<Vec<SessionFeedItem>, String> {
    db.list_agent_sessions(workspace_id, &agent_name)
}

#[tauri::command]
fn list_inbox(db: State<Db>) -> Result<Vec<InboxItem>, String> {
    db.list_inbox()
}

#[tauri::command]
fn inbox_unread_count(db: State<Db>) -> Result<i64, String> {
    db.unread_count()
}

#[tauri::command]
fn mark_inbox_read(db: State<Db>, id: i64) -> Result<(), String> {
    db.mark_inbox_read(id)
}

#[tauri::command]
fn delete_inbox_item(db: State<Db>, id: i64) -> Result<(), String> {
    db.delete_inbox_item(id)
}

#[tauri::command]
fn set_inbox_status(db: State<Db>, id: i64, status: String) -> Result<(), String> {
    db.set_inbox_status(id, &status)
}

#[tauri::command]
fn list_session_history(db: State<Db>, workspace_id: i64) -> Result<Vec<SessionLog>, String> {
    db.list_session_history(workspace_id)
}

#[tauri::command]
fn list_user_sessions(db: State<Db>, workspace_id: Option<i64>) -> Result<Vec<SessionFeedItem>, String> {
    db.list_user_sessions(workspace_id)
}

#[tauri::command]
fn list_job_sessions(db: State<Db>, job_id: i64) -> Result<Vec<SessionFeedItem>, String> {
    db.list_job_sessions(job_id)
}

#[tauri::command]
fn list_all_job_sessions(db: State<Db>, workspace_id: Option<i64>) -> Result<Vec<SessionFeedItem>, String> {
    db.list_all_job_sessions(workspace_id)
}

#[tauri::command]
fn get_inbox_session(db: State<Db>, inbox_id: i64) -> Result<Option<SessionFeedItem>, String> {
    db.get_inbox_session(inbox_id)
}

#[tauri::command]
fn get_settings(db: State<Db>) -> Result<std::collections::HashMap<String, String>, String> {
    remote::ensure_api_token(&db);
    db.all_settings()
}

#[tauri::command]
fn set_setting(db: State<Db>, key: String, value: String) -> Result<(), String> {
    const ALLOWED: &[&str] = &[
        "telegram_token",
        "telegram_chat_id",
        "http_enabled",
        "http_port",
    ];
    if !ALLOWED.contains(&key.as_str()) {
        return Err(format!("Unknown setting '{}'", key));
    }
    db.set_setting(&key, &value)
}

#[tauri::command]
fn list_slash_commands(app: AppHandle, workspace_id: i64) -> Result<Vec<String>, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    let mut commands: Vec<String> = vec![
        "/clear", "/compact", "/config", "/cost", "/help", "/init", "/memory",
        "/model", "/resume", "/review", "/status",
    ]
    .into_iter()
    .map(String::from)
    .collect();

    let commands_dir = Path::new(&ws.path).join(".claude").join("commands");
    if let Ok(entries) = std::fs::read_dir(commands_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    commands.push(format!("/{}", stem));
                }
            }
        }
    }
    for (name, _) in skills::active_skills(&app, workspace_id) {
        commands.push(format!("/{}", name));
    }
    for c in commands::all(&app, &ws.path) {
        commands.push(c.slash);
    }
    commands.sort();
    commands.dedup();
    Ok(commands)
}

#[tauri::command]
async fn sync_cloud_cache(app: AppHandle) -> Result<(), String> {
    sync_manager::sync_on_startup(&app).await;
    Ok(())
}

#[tauri::command]
fn list_chat_sessions(db: State<Db>, project_id: String) -> Result<Vec<db::ChatSession>, String> {
    db.list_chat_sessions(&project_id)
}

#[tauri::command]
fn create_chat_session(db: State<Db>, project_id: String) -> Result<db::ChatSession, String> {
    db.create_chat_session(&project_id)
}

#[tauri::command]
fn list_chat_messages(db: State<Db>, session_id: String) -> Result<Vec<ChatMessage>, String> {
    db.list_chat_messages(&session_id)
}

#[tauri::command]
fn add_chat_message(
    db: State<Db>,
    session_id: String,
    role: String,
    content: String,
    provider: Option<String>,
    model: Option<String>,
) -> Result<ChatMessage, String> {
    db.add_chat_message(&session_id, &role, &content, provider.as_deref(), model.as_deref())
}

#[tauri::command]
fn delete_cli_session(db: State<Db>, id: i64) -> Result<(), String> {
    db.delete_session_log(id)
}

#[tauri::command]
fn rename_cli_session(db: State<Db>, id: i64, label: Option<String>) -> Result<(), String> {
    db.rename_session_log(id, label.as_deref())
}

#[tauri::command]
fn rename_chat_session(db: State<Db>, id: String, name: String) -> Result<(), String> {
    db.rename_chat_session(&id, &name)
}

#[tauri::command]
fn star_chat_session(db: State<Db>, id: String, is_star: bool) -> Result<(), String> {
    db.star_chat_session(&id, is_star)
}

#[tauri::command]
fn delete_chat_session(db: State<Db>, id: String) -> Result<(), String> {
    db.delete_chat_session(&id)
}

#[tauri::command]
fn delete_chat_message(db: State<Db>, id: i64) -> Result<(), String> {
    db.delete_chat_message(id)
}

#[tauri::command]
fn read_attachment(path: String) -> Result<String, String> {
    files::read_attachment(&path)
}

#[derive(serde::Serialize)]
struct GitInfo {
    branch: Option<String>,
    insertions: i64,
    deletions: i64,
}

#[tauri::command]
fn git_info(db: State<Db>, workspace_id: i64) -> Result<GitInfo, String> {
    let ws = db.get_workspace(workspace_id).map_err(|e| e.to_string())?;
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .arg("-C")
            .arg(&ws.path)
            .args(args)
            .env("PATH", pty::enriched_path())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };

    let branch = git(&["rev-parse", "--abbrev-ref", "HEAD"]).filter(|b| !b.is_empty());

    // Total working-tree changes vs HEAD (staged + unstaged).
    let mut insertions = 0;
    let mut deletions = 0;
    if let Some(stat) = git(&["diff", "HEAD", "--shortstat"]) {
        for part in stat.split(',') {
            let p = part.trim();
            let n: i64 = p
                .split_whitespace()
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            if p.contains("insertion") {
                insertions = n;
            } else if p.contains("deletion") {
                deletions = n;
            }
        }
    }

    Ok(GitInfo {
        branch,
        insertions,
        deletions,
    })
}

#[tauri::command]
fn move_chat_session(db: State<Db>, id: String, to_project: String) -> Result<(), String> {
    db.move_chat_session(&id, &to_project)
}

#[tauri::command]
async fn refresh_telegram_bots(app: AppHandle) {
    remote::refresh_telegram_bots(&app);
}

#[tauri::command]
async fn detect_telegram_chat(app: AppHandle) -> Result<remote::TelegramChatDetected, String> {
    remote::detect_telegram_chat(app).await
}

/// Remove all locally cached cloud data + the derived encryption key from this
/// machine. Does not sign out and does not touch Turso.
#[tauri::command]
fn clear_local_cloud_data(db: State<Db>) -> Result<(), String> {
    db.clear_cloud_cache()?;
    crypto::clear_cached_key()
}

#[tauri::command]
async fn sync_org_cache(app: AppHandle, org_id: String) -> Result<(), String> {
    sync_manager::sync_on_update(&app, "org", &org_id).await;
    Ok(())
}

#[tauri::command]
fn eval_webview(app: AppHandle, label: String, script: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())
    } else {
        Err(format!("Webview {} not found", label))
    }
}

#[tauri::command]
fn open_webview_devtools(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.open_devtools();
        Ok(())
    } else {
        Err(format!("Webview {} not found", label))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Headless MCP stdio server: `superconsole mcp --session <token>`.
    // Spawned by Claude Code / Droid from the auto-generated .mcp.json.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(|s| s.as_str()) == Some("mcp") {
        let token = args
            .iter()
            .position(|a| a == "--session")
            .and_then(|i| args.get(i + 1))
            .cloned()
            .unwrap_or_default();
        mcp_server::run_stdio(token);
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let db = Db::init(data_dir).map_err(|e| std::io::Error::other(e))?;
            app.manage(db);
            app.manage(SessionManager::default());
            app.manage(chat::ChatCancel::default());
            app.manage(AuthState::load_from_keyring());
            app.manage(remote::TelegramState::default());
            scheduler::spawn(app.handle().clone());
            sync_manager::spawn(app.handle().clone());
            remote::spawn_http(app.handle().clone());
            remote::spawn_telegram(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_workspaces,
            add_workspace,
            remove_workspace,
            start_session,
            write_session,
            get_usage,
            resize_session,
            stop_session,
            session_active,
            list_slash_commands,
            update_workspace_cli,
            update_workspace,
            set_workspace_env_files,
            read_env_file,
            write_env_file,
            set_env_entry,
            delete_env_entry,
            list_dir,
            read_file,
            write_file,
            create_entry,
            delete_entry,
            list_cli_sessions,
            read_cli_session,
            list_jobs,
            add_job,
            update_job,
            list_workspace_connectors,
            set_job_enabled,
            delete_job,
            run_job_now,
            list_agents,
            read_agent,
            save_agent,
            delete_agent,
            run_agent_now,
            list_catalog_agents,
            upsert_catalog_agent,
            import_repo_agents,
            detect_repo_agents,
            delete_catalog_agent,
            install_catalog_agent,
            install_repo_agent,
            scaffold_project_from_repo,
            list_inbox,
            inbox_unread_count,
            mark_inbox_read,
            delete_inbox_item,
            get_settings,
            set_setting,
            list_organizations,
            add_organization,
            set_inbox_status,
            list_session_history,
            auth::sign_in,
            auth::auth_status,
            auth::sign_out,
            llm::ensure_workspace_project,
            llm::list_llm_keys,
            llm::set_llm_key,
            llm::delete_llm_key,
            llm::list_openrouter_models,
            sync_cloud_cache,
            sync_org_cache,
            chat::chat_send,
            chat::stop_chat,
            chat::has_provider_key,
            list_chat_sessions,
            create_chat_session,
            list_chat_messages,
            add_chat_message,
            delete_cli_session,
            rename_cli_session,
            rename_chat_session,
            star_chat_session,
            delete_chat_session,
            delete_chat_message,
            read_attachment,
            git_info,
            move_chat_session,
            clear_local_cloud_data,
            team::list_org_members,
            team::invite_org_member,
            team::update_org_member_role,
            team::remove_org_member,
            team::cancel_org_invitation,
            team::list_project_members,
            team::list_addable_project_members,
            team::add_project_member,
            team::update_project_member_role,
            team::remove_project_member,
            connectors::list_connectors,
            connectors::set_connector,
            connectors::delete_connector,
            skills::list_skills,
            skills::scan_detected_skills,
            skills::read_workspace_skill,
            skills::create_skill,
            skills::update_skill,
            skills::delete_skill,
            skills::set_skill_active,
            skills::attach_skill_to_project,
            skills::detach_skill_from_project,
            skills::materialize_skill_to_workspace,
            skills::list_skill_library,
            skills::list_global_skills,
            skills::get_global_skill,
            skills::create_global_skill,
            skills::update_global_skill,
            skills::delete_global_skill,
            skills::install_library_skill_global,
            skills::import_global_skill_from_url,
            skills::list_org_skills,
            skills::attach_org_skill,
            skills::detach_org_skill,
            memory::list_memory,
            memory::search_memory,
            memory::write_memory,
            memory::delete_memory,
            memory::wipe_memory,
            memory::list_org_memory,
            memory::write_org_memory,
            memory::delete_org_memory,
            wiki::list_wiki,
            wiki::read_wiki,
            wiki::search_wiki,
            wiki::write_wiki,
            wiki::delete_wiki,
            wiki::seed_wiki_from_files,
            context::list_context_files,
            context::read_context_file,
            context::write_context_file,
            context::delete_context_file,
            context::seed_context_files,
            commands::list_commands,
            commands::read_command,
            commands::write_command,
            commands::delete_command,
            commands::list_global_commands,
            commands::read_global_command,
            commands::write_global_command,
            commands::delete_global_command,
            mcp::ensure_mcp_config,
            list_user_sessions,
            list_job_sessions,
            list_all_job_sessions,
            get_inbox_session,
            refresh_telegram_bots,
            detect_telegram_chat,
            list_workspace_agents,
            upsert_agent_metadata,
            delete_agent_metadata,
            set_agent_active,
            list_agent_sessions,
            // Phase B — session log files
            session_logs::save_session_log,
            session_logs::list_session_logs,
            session_logs::delete_session_log,
            // Phase C — skill GitHub library + catalog
            skills::install_skill_from_github_url,
            skills::fetch_skill_catalog,
            skills::submit_to_skill_catalog,
            eval_webview,
            open_webview_devtools,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
