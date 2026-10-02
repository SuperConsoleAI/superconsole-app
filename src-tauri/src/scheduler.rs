// Scheduler — 30-second tick loop + headless job execution.
//
// Architecture: SQLite is the source of truth for due jobs (computed on each tick),
// so edits apply instantly and missed runs fire on the next tick after wake.
// Loop jobs (exit_condition IS NOT NULL) retry up to max_attempts times, scheduling
// a 30-second retry on each failure. The hard cap prevents infinite loops.
// Decrypted credentials NEVER leave memory (injected per-session, never written).

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
        .map(|dt| {
            dt.with_timezone(&Utc)
                .format("%Y-%m-%d %H:%M:%S")
                .to_string()
        })
        .ok_or_else(|| "Schedule has no upcoming runs".into())
}

fn job_command(cli: &str, prompt: &str) -> (String, Vec<String>) {
    match cli {
        "claude" => ("claude".into(), vec!["-p".into(), prompt.into()]),
        "droid" => ("droid".into(), vec!["exec".into(), prompt.into()]),
        "antigravity" => ("agy".into(), vec![prompt.into()]),
        "codex" => ("codex".into(), vec!["exec".into(), prompt.into()]),
        "warp" | "warp-agent" => ("warp".into(), vec!["agent".into(), prompt.into()]),
        "cursor" | "cursor-agent" => ("cursor".into(), vec!["agent".into(), prompt.into()]),
        "opencode" => ("opencode".into(), vec!["run".into(), prompt.into()]),
        "grok" | "grok-build" | "xai" | "x-ai" => ("grok".into(), vec![prompt.into()]),
        other => (other.to_string(), vec![prompt.to_string()]),
    }
}

// ── Exit condition evaluator ──────────────────────────────────────────────────
//
// Called after each job run. Returns true = condition met (done), false = retry.
// Supported types:
//   command       — run a shell command in workspace dir, check exit code
//   inbox_approved — check if a specific inbox item has been approved
//   llm_score     — ask LLM to score output; pass if score >= threshold
//   contains      — check if output contains a string
//   file_exists   — check if a file was created by the agent
//
// Unknown type returns true (safe default — don't loop forever on a typo).

pub async fn check_exit_condition(
    condition: &serde_json::Value,
    output: &str,
    workspace_path: &str,
    inbox_item_id: Option<i64>,
    db: &Db,
    app: &AppHandle,
    workspace_id: i64,
) -> bool {
    match condition["type"].as_str().unwrap_or("") {
        "command" => {
            let cmd = condition["command"].as_str().unwrap_or("true");
            let status = std::process::Command::new("bash")
                .arg("-c")
                .arg(cmd)
                .current_dir(workspace_path)
                .env("PATH", crate::pty::enriched_path())
                .status();
            match status {
                Ok(s) => s.success(),
                Err(e) => {
                    eprintln!("Loop: exit condition command error: {}", e);
                    false
                }
            }
        }

        "inbox_approved" => {
            if let Some(id) = inbox_item_id {
                db.get_inbox_status(id)
                    .map(|s| s == "approved")
                    .unwrap_or(false)
            } else {
                false
            }
        }

        "llm_score" => {
            let threshold = condition["threshold"].as_f64().unwrap_or(4.0);
            let max_score = condition["max"].as_f64().unwrap_or(5.0) as i64;
            let prompt = condition["prompt"]
                .as_str()
                .unwrap_or("Rate this output 1-5 for quality.");
            let score_prompt = format!(
                "{}\n\nOutput to rate:\n{}\n\nReply with ONLY a number from 1 to {}.",
                prompt,
                &output[..output.len().min(2000)],
                max_score
            );
            // Use the workspace's default provider/model for scoring.
            let db_ref = app.state::<Db>();
            let (provider, model) = match db_ref.get_workspace(workspace_id) {
                Ok(ws) => (ws.default_provider.clone(), ws.default_model.clone()),
                Err(_) => ("anthropic".to_string(), "claude-haiku-4-5".to_string()),
            };
            let model = if model.is_empty() {
                "claude-haiku-4-5".to_string()
            } else {
                model
            };
            let system = "You are a quality scorer. Reply with only a number.";
            match crate::llm::one_shot_completion(
                app,
                workspace_id,
                &provider,
                &model,
                system,
                &score_prompt,
            )
            .await
            {
                Ok(s) => s
                    .trim()
                    .parse::<f64>()
                    .map(|n| n >= threshold)
                    .unwrap_or(false),
                Err(e) => {
                    eprintln!("Loop: llm_score error: {}", e);
                    false
                }
            }
        }

        "contains" => {
            let text = condition["text"].as_str().unwrap_or("");
            output.contains(text)
        }

        "file_exists" => {
            let rel = condition["path"].as_str().unwrap_or("");
            let full = format!("{}/{}", workspace_path, rel);
            std::path::Path::new(&full).exists()
        }

        _ => {
            eprintln!("Loop: unknown exit condition type — treating as met");
            true
        }
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
    let mut run_mode = job
        .as_ref()
        .map(|j| j.run_mode.clone())
        .unwrap_or_else(|| "cli".into());
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
        if mode == "auto" {
            // Agent→Auto: prepend router instructions so the router picks the
            // best execution approach, then run via chat.
            if let Ok(router) = crate::agents::read_agent(&ws.path, "router") {
                command = format!(
                    "{}\n\nAgent instructions:\n{}",
                    router.instructions, command
                );
            }
            run_mode = "chat".to_string();
        } else {
            run_mode = mode;
        }
    } else if run_mode == "auto" {
        // Top-level Auto: router picks the best approach from project memory.
        if let Ok(router) = crate::agents::read_agent(&ws.path, "router") {
            command = format!("{}\n\nTask: {}", router.instructions, command);
        }
        run_mode = "chat".to_string();
    }
    // Surface referenced resources without inlining them — the agent fetches
    // them on demand via MCP tools at runtime.
    command = with_available_resources(&command);

    run_and_record(
        app,
        &ws,
        &run_mode,
        &run_config,
        &command,
        title_suffix,
        job_id,
        None,
    )
    .await
}

/// Run a file-defined agent directly (manual "Run now"), using the agent's
/// default CLI/provider/model from the local `agents` row if available,
/// falling back to workspace defaults. Stamps `agent_id` on the session row.
pub async fn exec_agent(
    app: &AppHandle,
    workspace_id: i64,
    agent: &crate::agents::Agent,
) -> Result<String, String> {
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
        let mut account_env_pairs = app.state::<Db>().get_account_env_pairs();
        if account_env_pairs.is_empty() {
            account_env_pairs = crate::pty::parse_env_vars_json(&account_env_vars);
        }
        let ws_path_for_hook = ws_path.clone();
        let command_for_hook = command.to_string();
        let output = tauri::async_runtime::spawn_blocking(move || {
            let mut cmd = Command::new(&program);
            cmd.args(&args).current_dir(&ws_path);
            cmd.env("PATH", crate::pty::enriched_path());
            for (k, v) in crate::pty::parse_env_file(&Path::new(&ws_path).join(".env")) {
                cmd.env(k, v);
            }
            for (k, v) in account_env_pairs {
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
                hook_env.insert(
                    "SUPERCONSOLE_WORKSPACE_NAME".into(),
                    ws_path_for_hook.split('/').last().unwrap_or("").to_string(),
                );
                crate::hooks::run_hook(
                    &ws_path_for_hook,
                    crate::hooks::HookType::BeforeShell,
                    &hook_env,
                );
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

    // ── Tag session history row ───────────────────────────────────────────────
    {
        let db = app.state::<Db>();
        if let Some(aname) = agent_name {
            let session_id = format!("agent-{}-{}", aname, chrono::Utc::now().timestamp_millis());
            let _ = db.log_session(workspace_id, &session_id, "cli", job_id, Some(aname));
        }
    }

    let title = format!("{} — {}", ws.name, title_suffix);

    // ── Loop system: handle exit condition / retries ──────────────────────────
    //
    // If the job has no exit_condition this is a simple run-once and we write
    // to inbox + telegram immediately (existing behavior, unchanged).
    //
    // If there IS an exit_condition:
    //   1. For inbox_approved: send to inbox first so the human can review.
    //   2. Evaluate condition.
    //   3. Condition met → reset attempt counter, telegram notify.
    //   4. Max attempts hit → write ⚠️ failure to inbox, reset, NO telegram spam.
    //   5. Still looping → schedule retry in 30s (one scheduler tick).

    let exit_condition: Option<serde_json::Value> = job_id
        .and_then(|jid| app.state::<Db>().get_job(jid).ok())
        .and_then(|j| j.exit_condition)
        .and_then(|s| serde_json::from_str(&s).ok());

    if let Some(condition) = exit_condition {
        let db = app.state::<Db>();
        let job = db.get_job(job_id.unwrap())?;
        let max = job.max_attempts.max(1);
        let attempt = job.current_attempt + 1;

        db.set_job_attempt(job.id, attempt)?;

        // For inbox_approved: send to inbox FIRST so the human can approve or reject.
        let inbox_item_id = if condition["type"] == "inbox_approved" {
            Some(db.add_inbox_item(workspace_id, job_id, &title, &body)?)
        } else {
            None
        };

        let _ = app.emit(
            "inbox-new",
            InboxNew {
                workspace_id,
                title: title.clone(),
            },
        );

        let condition_met = check_exit_condition(
            &condition,
            &body,
            &ws.path,
            inbox_item_id,
            &db,
            app,
            workspace_id,
        )
        .await;

        if condition_met {
            // Done — write to inbox (skip if inbox_approved already wrote it).
            if inbox_item_id.is_none() {
                db.add_inbox_item(workspace_id, job_id, &title, &body)?;
                let _ = app.emit(
                    "inbox-new",
                    InboxNew {
                        workspace_id,
                        title: title.clone(),
                    },
                );
            }
            db.reset_job_attempt(job.id)?;
            notify_and_telegram(app, ws, &title, &body).await;
        } else if attempt >= max {
            // Exhausted — write ⚠️ failure, reset, don't retry.
            let failed_output = format!(
                "⚠️ Max attempts ({}) reached without meeting exit condition.\n\nLast output:\n{}",
                max, body
            );
            db.add_inbox_item(workspace_id, job_id, &title, &failed_output)?;
            let _ = app.emit(
                "inbox-new",
                InboxNew {
                    workspace_id,
                    title: title.clone(),
                },
            );
            db.reset_job_attempt(job.id)?;
            eprintln!("Loop: job {} gave up after {} attempts", job.id, max);
        } else {
            // Condition not met, attempts remaining — retry in 30s.
            db.set_job_next_run_relative(job.id, 30)?;
            eprintln!(
                "Loop: job {} attempt {}/{} failed condition, retrying in 30s",
                job.id, attempt, max
            );
        }
    } else {
        // No exit condition — run-once behavior (existing, unchanged).
        let db = app.state::<Db>();
        db.add_inbox_item(workspace_id, job_id, &title, &body)?;
        let _ = app.emit(
            "inbox-new",
            InboxNew {
                workspace_id,
                title: title.clone(),
            },
        );
        notify_and_telegram(app, ws, &title, &body).await;
    }

    Ok(body)
}

/// Send global + project-scoped Telegram notifications.
async fn notify_and_telegram(app: &AppHandle, ws: &Workspace, title: &str, body: &str) {
    crate::remote::notify_telegram(app, &format!("{}\n\n{}", title, body)).await;
    let db = app.state::<Db>();
    if let Some((token, chat_id, thread_id)) =
        crate::remote::get_telegram_route_for_workspace(&db, ws.id)
    {
        let client = reqwest::Client::new();
        crate::remote::notify_telegram_topic(
            &client,
            &token,
            &chat_id,
            &thread_id,
            &format!("{}\n\n{}", title, body),
        )
        .await;
    }
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
    // Only advance next_run for jobs NOT currently in a retry loop.
    // Loop retries have already set next_run via set_job_next_run_relative.
    let db = app.state::<Db>();
    let refreshed = db.get_job(job.id).ok();
    let still_looping = refreshed
        .as_ref()
        .map(|j| j.current_attempt > 0)
        .unwrap_or(false);
    if !still_looping {
        let next = next_run(&job.schedule).ok();
        db.mark_job_ran(job.id, &now_utc(), next.as_deref())?;
    }
    Ok(())
}

/// Tick loop instead of an in-memory cron scheduler: due jobs are computed
/// from SQLite on every tick, so edits apply instantly and runs missed
/// during sleep fire on the next tick after wake.
///
/// Also runs check_email_triggers on every tick (same 30s cadence).
/// The Telegram long-poll lives in its own independent spawned task
/// (remote::spawn_telegram) and is completely unaffected.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;

            // ── Due cron/manual/api/github jobs ──────────────────────────────
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

            // ── Email-triggered jobs (polling, 30s cadence) ──────────────────
            // Runs alongside the jobs runner; independent of Telegram long-poll.
            crate::remote::check_email_triggers(&app).await;
        }
    });
}
