use crate::db::{Db, Job};
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

    let (program, args) = job_command(&ws.cli, command);
    let ws_path = ws.path.clone();

    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&program);
        cmd.args(&args).current_dir(&ws_path);
        for (k, v) in crate::pty::parse_env_file(&Path::new(&ws_path).join(".env")) {
            cmd.env(k, v);
        }
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?;

    let body = match output {
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
        Err(e) => format!("**Failed to launch {}**: {}", ws.cli, e),
    };

    let title = format!("{} — {}", ws.name, title_suffix);
    {
        let db = app.state::<Db>();
        db.add_inbox_item(workspace_id, job_id, &title, &body)?;
    }

    let _ = app.emit(
        "inbox-new",
        InboxNew {
            workspace_id,
            title: title.clone(),
        },
    );

    crate::remote::notify_telegram(app, &format!("{}\n\n{}", title, body)).await;
    Ok(body)
}

pub async fn run_job(app: &AppHandle, job: Job) -> Result<(), String> {
    exec_in_workspace(app, job.workspace_id, &job.command, &job.name, Some(job.id)).await?;
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
