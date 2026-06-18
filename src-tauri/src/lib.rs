mod auth;
mod chat;
mod cli_sessions;
mod cloud;
mod connectors;
mod crypto;
mod db;
mod files;
mod llm;
mod memory;
mod pty;
mod remote;
mod scheduler;
mod skills;
mod mcp;
mod mcp_server;
mod sync_manager;
mod team;
mod usage;
mod wiki;

use auth::AuthState;

use db::{ChatMessage, Db, InboxItem, Job, Organization, SessionLog, Workspace};
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
    if !Path::new(&path).is_dir() {
        return Err(format!("Not a folder: {}", path));
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
    let (ws_path, was_active) = {
        let db = app.state::<Db>();
        let ws = db.get_workspace(workspace_id)?;
        (ws.path, pty::session_active(&sessions, &session_id))
    };
    // Refresh the SuperConsole MCP config (fresh token, pre-approved) so the
    // launching CLI can reach skills/memory/wiki/connector tools.
    if cli == "claude" || cli == "droid" {
        if let Some(ctx) = mcp::native_ctx(&app, workspace_id) {
            let _ = mcp::write_mcp_config(&ctx);
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
    let mut env = resolved.env;
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
        let _ = db.log_session(workspace_id, &session_id, &cli);
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
fn list_chat_messages(db: State<Db>, project_id: String) -> Result<Vec<ChatMessage>, String> {
    db.list_chat_messages(&project_id)
}

#[tauri::command]
fn add_chat_message(
    db: State<Db>,
    project_id: String,
    role: String,
    content: String,
    provider: Option<String>,
    model: Option<String>,
) -> Result<ChatMessage, String> {
    db.add_chat_message(&project_id, &role, &content, provider.as_deref(), model.as_deref())
}

#[tauri::command]
fn clear_chat_messages(db: State<Db>, project_id: String) -> Result<(), String> {
    db.clear_chat_messages(&project_id)
}

#[tauri::command]
fn delete_cli_session(db: State<Db>, id: i64) -> Result<(), String> {
    db.delete_session_log(id)
}

#[tauri::command]
fn get_chat_thread(db: State<Db>, project_id: String) -> Result<db::ChatThreadMeta, String> {
    db.get_chat_thread(&project_id)
}

#[tauri::command]
fn rename_chat_thread(db: State<Db>, project_id: String, name: String) -> Result<(), String> {
    db.rename_chat_thread(&project_id, &name)
}

#[tauri::command]
fn star_chat_thread(db: State<Db>, project_id: String, is_star: bool) -> Result<(), String> {
    db.star_chat_thread(&project_id, is_star)
}

#[tauri::command]
fn delete_chat_thread(db: State<Db>, project_id: String) -> Result<(), String> {
    db.delete_chat_thread(&project_id)
}

#[tauri::command]
fn move_chat_thread(db: State<Db>, from_project: String, to_project: String) -> Result<(), String> {
    db.move_chat_thread(&from_project, &to_project)
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
            app.manage(AuthState::load_from_keyring());
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
            sync_cloud_cache,
            sync_org_cache,
            chat::chat_send,
            chat::has_provider_key,
            list_chat_messages,
            add_chat_message,
            clear_chat_messages,
            delete_cli_session,
            get_chat_thread,
            rename_chat_thread,
            star_chat_thread,
            delete_chat_thread,
            move_chat_thread,
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
            mcp::ensure_mcp_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
