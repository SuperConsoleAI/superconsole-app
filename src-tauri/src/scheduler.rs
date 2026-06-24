use crate::db::{Db, Job, Workspace};
use chrono::{Local, Utc};
use cron::Schedule;
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
struct InboxNew {
    workspace_id: i64,
    title: String,
}

pub fn now_utc() -> String {
    Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Accepts standard 5-field cron; the cron crate requires a seconds field.
pub fn next_run(schedule: &str) -> Result<String, String> {
    let normalized = if schedule.split_whitespace().count() == 5 {
        format!("0 {}", schedule)
    } else {
        schedule.to_string()
    };
    let parsed = Schedule::from_str(&normalized)
        .map_err(|e| format!("Invalid cron expression '{}': {}", schedule, e))?;
    parsed
        .upcoming(Local)
        .next()
        .map(|dt| dt.with_timezone(&Utc).format("%Y-%m-%d %H:%M:%S").to_string())
        .ok_or_else(|| "Schedule has no upcoming runs".into())
}

fn job_command(cli: &str, prompt: &str) -> (String, Vec<String>) {
    match cli {
        "claude" => ("claude".into(), vec!["-p".into(), prompt.into()]),
        "droid" => ("droid".into(), vec!["exec".into(), prompt.into()]),
        "antigravity" => ("agy".into(), vec![prompt.into()]),
        "codex" => ("codex".into(), vec!["exec".into(), prompt.into()]),
        other => (other.to_string(), vec![prompt.to_string()]),
    }
}

/// Runs a command headless in a workspace, records the output in the inbox,
/// and notifies remote channels. Shared by the scheduler, HTTP triggers,
/// and the Telegram bot.
pub async fn exec_in_workspace(
    app: &AppHandle,
    workspace_id: i64,
    command: &str,
    title_suffix: &str,
    job_id: Option<i64>,
) -> Result<String, String> {
    let ws = {
        let db = app.state::<Db>();
        db.get_workspace(workspace_id)?
    };

    // Ad-hoc triggers (HTTP / Telegram) carry no job and keep the cli path.
    let job = job_id.and_then(|jid| app.state::<Db>().get_job(jid).ok());
    let mut run_mode = job.as_ref().map(|j| j.run_mode.clone()).unwrap_or_else(|| "cli".into());
    let run_config: serde_json::Value = job
        .as_ref()
        .and_then(|j| serde_json::from_str(&j.run_config).ok())
        .unwrap_or_default();
    let mut command = command.to_string();

    // An "agent" job supplies its instructions from a file; the harness/model
    // come from the job's run_config (chosen at job creation), not the agent.
    if run_mode == "agent" {
        let mode = run_config["mode"].as_str().unwrap_or("cli").to_string();
        if let Some(name) = run_config["agent"].as_str() {
            if let Ok(agent) = crate::agents::read_agent(&ws.path, name) {
                command = agent.instructions.clone();
            }
        }
        run_mode = mode;
    }
    // Surface referenced resources without inlining them — the agent fetches
    // them on demand via MCP tools at runtime.
    command = with_available_resources(&command);

    run_and_record(app, &ws, &run_mode, &run_config, &command, title_suffix, job_id, None).await
}

/// Run a file-defined agent directly (manual "Run now"), using the agent's
/// default CLI/provider/model from the local `agents` row if available,
/// falling back to workspace defaults. Stamps `agent_id` on the session row.
pub async fn exec_agent(app: &AppHandle, workspace_id: i64, agent: &crate::agents::Agent) -> Result<String, String> {
    let ws = {
        let db = app.state::<Db>();
        db.get_workspace(workspace_id)?
    };
    // Prefer per-agent defaults from the DB row; fall back to workspace.
    let (run_mode, cli) = {
        let db = app.state::<Db>();
        match db.get_agent_row_by_name(workspace_id, &agent.name) {
            Ok(row) if !row.default_cli.is_empty() => (row.default_run_mode, row.default_cli),
            _ => ("cli".to_string(), ws.cli.clone()),
        }
    };
    let run_config = serde_json::json!({ "cli": cli, "model": serde_json::Value::Null });
    let command = with_available_resources(&agent.instructions);
    let result = run_and_record(
        app,
        &ws,
        &run_mode,
        &run_config,
        &command,
        &format!("agent: {}", agent.name),
        None,
        Some(&agent.name),
    )
    .await?;
    // Update last_run on the metadata row.
    {
        let db = app.state::<Db>();
        let now = now_utc();
        let _ = db.mark_agent_ran(workspace_id, &agent.name, &now, None);
    }
    Ok(result)
}

/// Parse `@skill:` / `@context:` / `@connector:` / `@agent:` tokens from an
/// agent's instructions and prepend a single availability hint line. Tokens are
/// NOT inlined: the agent fetches each resource on demand via MCP tools at
/// runtime (skill_view, context_read, etc.). The original instructions are kept
/// unchanged below the hint.
fn with_available_resources(instructions: &str) -> String {
    match crate::mcp::available_resources_hint(instructions) {
        Some(hint) => format!("{}\n\n{}", hint, instructions),
        None => instructions.to_string(),
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_and_record(
    app: &AppHandle,
    ws: &Workspace,
    run_mode: &str,
    run_config: &serde_json::Value,
    command: &str,
    title_suffix: &str,
    job_id: Option<i64>,
    agent_name: Option<&str>,
) -> Result<String, String> {
    let workspace_id = ws.id;
    let body = if run_mode == "chat" {
        // Native chat one-shot executor: headless completion → inbox.
        let provider = run_config["provider"].as_str().unwrap_or("anthropic");
        let model = run_config["model"].as_str().unwrap_or("claude-sonnet-4-5");
        let system = crate::chat::build_system_prompt(app, workspace_id);
        match crate::llm::one_shot_completion(app, workspace_id, provider, model, &system, command)
            .await
        {
            Ok(t) => t,
            Err(e) => format!("**Chat job failed**: {}", e),
        }
    } else {
        let cli = run_config["cli"].as_str().unwrap_or(&ws.cli).to_string();
        let (program, args) = job_command(&cli, command);
        let ws_path = ws.path.clone();
        let env_files = ws.env_files.clone();
        let account_env_files = app
            .state::<Db>()
            .get_setting("account_env_files")
            .unwrap_or_default();
        let account_env_vars = app
            .state::<Db>()
            .get_setting("account_env_vars")
            .unwrap_or_default();
        let ws_path_for_hook = ws_path.clone();
        let command_for_hook = command.to_string();
        let output = tauri::async_runtime::spawn_blocking(move || {
            let mut cmd = Command::new(&program);
            cmd.args(&args).current_dir(&ws_path);
            cmd.env("PATH", crate::pty::enriched_path());
            for (k, v) in crate::pty::parse_env_file(&Path::new(&ws_path).join(".env")) {
                cmd.env(k, v);
            }
            for (k, v) in crate::pty::parse_env_vars_json(&account_env_vars) {
                cmd.env(k, v);
            }
            for (k, v) in crate::pty::extra_env_files(&ws_path, &account_env_files) {
                cmd.env(k, v);
            }
            for (k, v) in crate::pty::extra_env_files(&ws_path, &env_files) {
                cmd.env(k, v);
            }
            // Before-shell hook — non-blocking, 10s timeout.
            {
                let mut hook_env = std::collections::HashMap::new();
                hook_env.insert("SUPERCONSOLE_COMMAND".into(), command_for_hook.clone());
                hook_env.insert("SUPERCONSOLE_WORKSPACE_NAME".into(),
                    ws_path_for_hook.split('/').last().unwrap_or("").to_string());
                crate::hooks::run_hook(&ws_path_for_hook, crate::hooks::HookType::BeforeShell, &hook_env);
            }
            cmd.output()
        })
        .await
        .map_err(|e| e.to_string())?;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);
                if out.status.success() {
                    stdout.trim().to_string()
                } else {
                    format!(
                        "**Job failed** (exit {})\n\n{}\n{}",
                        out.status.code().unwrap_or(-1),
                        stdout.trim(),
                        stderr.trim()
                    )
                }
            }
            Err(e) => format!("**Failed to launch {}**: {}", cli, e),
        }
    };

    let title = format!("{} — {}", ws.name, title_suffix);
    {
        let db = app.state::<Db>();
        db.add_inbox_item(workspace_id, job_id, &title, &body)?;
        // Tag the most-recent session_history row from this session with agent_name.
        // exec_in_workspace runs headless (no PTY), so we log a synthetic entry here.
        if let Some(aname) = agent_name {
            let session_id = format!("agent-{}-{}", aname, chrono::Utc::now().timestamp_millis());
            let _ = db.log_session(workspace_id, &session_id, "cli", job_id, Some(aname));
        }
    }

    let _ = app.emit(
        "inbox-new",
        InboxNew {
            workspace_id,
            title: title.clone(),
        },
    );

    crate::remote::notify_telegram(app, &format!("{}\n\n{}", title, body)).await;
    // Also notify the project-specific Telegram topic if configured.
    {
        let db = app.state::<Db>();
        if let Some((token, chat_id, thread_id)) =
            crate::remote::get_telegram_route_for_workspace(&db, workspace_id)
        {
            let client = reqwest::Client::new();
            crate::remote::notify_telegram_topic(
                &client, &token, &chat_id, &thread_id,
                &format!("{}\n\n{}", title, body),
            )
            .await;
        }
    }
    Ok(body)
}

pub async fn run_job(app: &AppHandle, job: Job) -> Result<(), String> {
    // Use a timestamp-scoped synthetic session_id so usage_events written during
    // this run can be aggregated. The run_and_record path doesn't create a PTY
    // session, but it may call usage::record_usage for chat-mode jobs.
    let session_id = format!("job-{}-{}", job.id, chrono::Utc::now().timestamp_millis());
    exec_in_workspace(app, job.workspace_id, &job.command, &job.name, Some(job.id)).await?;
    {
        let db = app.state::<Db>();
        db.finalize_job_cost(job.id, &session_id);
    }
    let next = next_run(&job.schedule).ok();
    let db = app.state::<Db>();
    db.mark_job_ran(job.id, &now_utc(), next.as_deref())?;
    Ok(())
}

/// Tick loop instead of an in-memory cron scheduler: due jobs are computed
/// from SQLite on every tick, so edits apply instantly and runs missed
/// during sleep fire on the next tick after wake.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let due = {
                let db = app.state::<Db>();
                db.due_jobs(&now_utc()).unwrap_or_default()
            };
            for job in due {
                let job_id = job.id;
                if let Err(e) = run_job(&app, job).await {
                    eprintln!("job {} failed: {}", job_id, e);
                    let db = app.state::<Db>();
                    let _ = db.mark_job_ran(job_id, &now_utc(), None);
                }
            }
        }
    });
}
