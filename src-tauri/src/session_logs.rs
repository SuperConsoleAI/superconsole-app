// Phase B — Session log files.
//
// Opt-in log file saved by the user from the Sessions UI.
// File location: <workspace>/.superconsole/sessions/YYYY-MM-DD-<slug>.md
//
// Format:
//   ---
//   date: 2026-06-22
//   agent: newsletter-agent
//   model: claude-sonnet-4-6
//   cost: $0.42
//   tokens: 45000
//   ---
//
//   [summary — max 120 lines, trimmed to that on save]
//
// SQLite: `project_session_logs` table (metadata index, no file content stored in DB).
// 3-Tier: `project_session_logs` (project), `org_session_logs` (org), `session_logs` (account).

use crate::db::{Db, SessionLogFile};
use std::path::Path;
use tauri::{AppHandle, Manager};
use ulid::Ulid;

const SESSIONS_DIR: &str = ".superconsole/sessions";

// ── helpers ───────────────────────────────────────────────────────────────────

fn sessions_dir(ws_path: &str) -> std::path::PathBuf {
    Path::new(ws_path).join(SESSIONS_DIR)
}

fn log_file_path(ws_path: &str, date: &str, slug: &str) -> std::path::PathBuf {
    sessions_dir(ws_path).join(format!("{}-{}.md", date, slug))
}

/// Trim summary to at most 120 lines.
fn trim_summary(summary: &str) -> String {
    summary.lines().take(120).collect::<Vec<_>>().join("\n")
}

fn build_log_md(
    date: &str,
    agent_name: &str,
    model: &str,
    cost_usd: f64,
    tokens: i64,
    summary: &str,
) -> String {
    format!(
        "---\ndate: {}\nagent: {}\nmodel: {}\ncost: ${:.4}\ntokens: {}\n---\n\n{}\n",
        date,
        agent_name,
        model,
        cost_usd,
        tokens,
        trim_summary(summary),
    )
}

#[tauri::command]
pub async fn save_session_log(
    app: AppHandle,
    workspace_id: i64,
    session_id: String,
    agent_name: String,
    model: String,
    cost_usd: f64,
    tokens: i64,
    summary: String,
    slug: String,
) -> Result<SessionLogFile, String> {
    // Resolve workspace path
    let ws_path = {
        let db = app.state::<Db>();
        db.get_workspace(workspace_id)?.path
    };

    // Sanitise slug (alphanumeric + dashes)
    let slug_clean: String = slug
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug_clean.is_empty() {
        return Err("Invalid slug".into());
    }

    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let id = Ulid::new().to_string();

    // Write the markdown file
    let dir = sessions_dir(&ws_path);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = log_file_path(&ws_path, &date, &slug_clean);
    if file.exists() {
        return Err(format!(
            "A log file for '{}' on {} already exists",
            slug_clean, date
        ));
    }
    let md = build_log_md(&date, &agent_name, &model, cost_usd, tokens, &summary);
    std::fs::write(&file, &md).map_err(|e| e.to_string())?;

    let rel_path = format!("{}/{}-{}.md", SESSIONS_DIR, date, slug_clean);

    // Index in SQLite
    let log = app.state::<Db>().insert_session_log(
        workspace_id,
        &id,
        &rel_path,
        None, // agent_id — not tracked at this level yet
        Some(&session_id),
        &date,
        &agent_name,
        &model,
        cost_usd,
        tokens,
        &trim_summary(&summary),
    )?;

    Ok(log)
}

#[tauri::command]
pub fn list_session_logs(app: AppHandle, workspace_id: i64) -> Result<Vec<SessionLogFile>, String> {
    Ok(app.state::<Db>().list_session_logs(workspace_id))
}

#[tauri::command]
pub fn delete_session_log(app: AppHandle, workspace_id: i64, id: String) -> Result<(), String> {
    let db = app.state::<Db>();

    // Find the file path so we can delete the file too
    let logs = db.list_session_logs(workspace_id);
    if let Some(log) = logs.iter().find(|l| l.id == id) {
        let ws_path = db.get_workspace(workspace_id)?.path;
        let file = Path::new(&ws_path).join(&log.file_path);
        if file.exists() {
            std::fs::remove_file(&file).map_err(|e| e.to_string())?;
        }
    }

    db.delete_session_log_file(&id)
}
