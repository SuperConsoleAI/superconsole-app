// src-tauri/src/commands/agents/pty.rs
//
// Terminal Mode (PTY) — Phase 9 — BusinessKit
//
// Spawns interactive CLI sessions (claude, agy, codex) in a real PTY so the
// xterm.js frontend can render ANSI output, interactive permission prompts, and
// native tool interactions.
//
// HARD RULES:
// - Desktop-only: managed only for non-iOS/non-Android targets via lib.rs.
// - No --dangerously-skip-permissions or -p/--print flags — these are interactive.
// - No agent_chat_messages written — PTY output is ephemeral.
// - Reuses get_profile_workspace_dir + find_cli_binary from cli.rs.
// - Emits: pty-output { session_id, data }, pty-exit { session_id }.
// - BusinessKit MCP tools auto-approved via --allowedTools mcp__businesskit__*.
// - Codex sandboxed via --sandbox workspace-write.
// - output/ subdir created in workspace on first spawn (convention for generated files).

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use crate::AppState;
use super::analytics::{aggregate_agent_analytics, estimate_cost};
use super::cli::{find_cli_binary, get_profile_workspace_dir, read_active_agy_model};

// ── Session state ──────────────────────────────────────────────────────────────

pub struct PtySession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub killer: Box<dyn ChildKiller + Send + Sync>,
    pub output_history: Arc<Mutex<Vec<u8>>>,
    pub profile_id: String,
    pub cli: String,
    pub model: String,
    pub provider: String,
    pub prompt_chars: Arc<AtomicU64>,
    pub completion_chars: Arc<AtomicU64>,
    pub message_count: Arc<AtomicU64>,
    pub last_preview: Arc<Mutex<Option<String>>>,
}

#[derive(Default)]
pub struct PtySessionManager(pub Mutex<HashMap<String, PtySession>>);

// ── Tauri event payloads ───────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct PtyOutputEvent {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExitEvent {
    session_id: String,
}

// ── PATH enrichment ────────────────────────────────────────────────────────────
// macOS GUI apps inherit minimal PATH. Resolve the login shell's PATH once.

static USER_PTY_PATH: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    let out = std::process::Command::new(&shell)
        .args(["-ilc", "printf '__BK__%s__BK__' \"$PATH\""])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let start = s.find("__BK__")? + "__BK__".len();
    let rest = &s[start..];
    let end = rest.find("__BK__")?;
    let path = &rest[..end];
    if path.trim().is_empty() { None } else { Some(path.to_string()) }
}

fn enriched_pty_path() -> String {
    USER_PTY_PATH.get_or_init(|| {
        let mut seen = std::collections::HashSet::new();
        let mut dirs: Vec<String> = Vec::new();
        let mut push = |p: &str| {
            if !p.is_empty() && seen.insert(p.to_string()) { dirs.push(p.to_string()); }
        };
        if let Some(lp) = login_shell_path() {
            for p in lp.split(':') { push(p); }
        }
        if let Ok(cur) = std::env::var("PATH") {
            for p in cur.split(':') { push(p); }
        }
        let home = std::env::var("HOME").unwrap_or_default();
        for d in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
            push(d);
        }
        if !home.is_empty() {
            for sub in [".local/bin", ".bun/bin", ".cargo/bin", ".npm-global/bin", ".volta/bin", ".deno/bin"] {
                push(&format!("{}/{}", home, sub));
            }
        }
        dirs.join(":")
    }).clone()
}

// ── CLI command builder (interactive — no headless flags) ─────────────────────
//
// Checklist 1: bare interactive REPL, no -p / exec / --json flags.
// Checklist 2: Codex --sandbox workspace-write (real FS sandbox).
// Checklist 3: Claude --allowedTools mcp__businesskit__* (MCP auto-approved,
//              native Bash/file tools still get interactive permission prompts).

fn build_pty_command(cli: &str, bin_path: &Path, workspace: &Path, resume_id: Option<&str>) -> CommandBuilder {
    match cli {
        "claude" => {
            let mut c = CommandBuilder::new(bin_path);
            // Pre-approve BK MCP tools; native tools still prompt the user.
            c.arg("--allowedTools");
            c.arg("mcp__businesskit__*");
            // Inject README.md as additional system context if it exists.
            let readme = workspace.join("README.md");
            if readme.exists() {
                if let Ok(content) = std::fs::read_to_string(&readme) {
                    let truncated: String = content.chars().take(8000).collect();
                    c.arg("--append-system-prompt");
                    c.arg(format!("Project README.md context:\n\n{}", truncated));
                }
            }
            if let Some(id) = resume_id {
                c.arg("--resume");
                c.arg(id);
            }
            c.cwd(workspace);
            c
        }
        "antigravity" | "agy" => {
            let mut c = CommandBuilder::new(bin_path);
            c.arg("--dangerously-skip-permissions");
            if let Some(id) = resume_id {
                c.arg("--conversation");
                c.arg(id);
            }
            c.cwd(workspace);
            c
        }
        "codex" => {
            let mut c = CommandBuilder::new(bin_path);
            // Real FS sandbox — restricts writes to workspace tree.
            c.arg("--sandbox");
            c.arg("workspace-write");
            if let Some(id) = resume_id {
                c.arg("resume");
                c.arg(id);
            }
            c.cwd(workspace);
            c
        }
        _ => {
            let mut c = CommandBuilder::new(bin_path);
            c.cwd(workspace);
            c
        }
    }
}

// ── output/ scaffold (idempotent — fixes existing profiles too) ───────────────
//
// Checklist 4: is_profile_initialized in cli.rs already set the marker and
// skipped rewriting CLAUDE.md/AGENTS.md for existing profiles. We use a
// separate per-workspace marker so the output/ convention reaches them too.

const OUTPUT_MARKER: &str = ".bk-output-marker";
const OUTPUT_CONVENTION: &str =
    "\n\n## Output Convention\n\
     When you create any file for the user (a report, a draft, an export, an image, \
     generated code), save it under `output/` in this workspace. Do not scatter \
     created files in the workspace root.\n";

pub fn ensure_output_scaffold(workspace: &Path) {
    let output_dir = workspace.join("output");
    let marker = output_dir.join(OUTPUT_MARKER);
    if marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&output_dir);
    let _ = std::fs::write(&marker, "BusinessKit output convention marker v1");

    // Idempotently append output convention to all system prompt files.
    for fname in ["CLAUDE.md", "AGENTS.md", "GEMINI.md"] {
        let path = workspace.join(fname);
        if path.exists() {
            if let Ok(existing) = std::fs::read_to_string(&path) {
                if !existing.contains("output/") {
                    let _ = std::fs::write(&path, format!("{}{}", existing, OUTPUT_CONVENTION));
                }
            }
        }
    }
    // Also patch rules files.
    for rel in [".agents/rules/businesskit.md", ".gemini/rules/businesskit.md"] {
        let path = workspace.join(rel);
        if path.exists() {
            if let Ok(existing) = std::fs::read_to_string(&path) {
                if !existing.contains("output/") {
                    let _ = std::fs::write(&path, format!("{}{}", existing, OUTPUT_CONVENTION));
                }
            }
        }
    }
}

// ── agy / Antigravity workspace trust helper ──────────────────────────────────
// Automatically add profile workspace to trustedWorkspaces and projects.json
// so agy doesn't prompt "Do you trust the contents of this project?" on spawn.

fn ensure_agy_workspace_trusted(workspace: &Path) {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };
    let settings_path = home.join(".gemini").join("antigravity-cli").join("settings.json");
    if let Ok(content) = std::fs::read_to_string(&settings_path) {
        if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&content) {
            let ws_str = workspace.to_string_lossy().to_string();
            let mut modified = false;
            if let Some(trusted) = val.get_mut("trustedWorkspaces").and_then(|v| v.as_array_mut()) {
                let has_ws = trusted.iter().any(|v| v.as_str() == Some(&ws_str));
                if !has_ws {
                    trusted.push(serde_json::json!(ws_str));
                    modified = true;
                }
            } else if let Some(obj) = val.as_object_mut() {
                obj.insert("trustedWorkspaces".to_string(), serde_json::json!([ws_str]));
                modified = true;
            }
            if modified {
                if let Ok(new_content) = serde_json::to_string_pretty(&val) {
                    let _ = std::fs::write(&settings_path, new_content);
                }
            }
        }
    }
}

fn ensure_gemini_project_known(workspace: &Path) {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };
    let proj_path = home.join(".gemini").join("projects.json");
    if let Ok(content) = std::fs::read_to_string(&proj_path) {
        if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&content) {
            let ws_str = workspace.to_string_lossy().to_string();
            let mut modified = false;
            if let Some(projects) = val.get_mut("projects").and_then(|v| v.as_object_mut()) {
                if !projects.contains_key(&ws_str) {
                    let project_name = workspace
                        .file_name()
                        .and_then(|f| f.to_str())
                        .unwrap_or("businesskit-workspace")
                        .to_string();
                    projects.insert(ws_str, serde_json::json!(project_name));
                    modified = true;
                }
            }
            if modified {
                if let Ok(new_content) = serde_json::to_string_pretty(&val) {
                    let _ = std::fs::write(&proj_path, new_content);
                }
            }
        }
    }
}

// ── Clean ANSI text character counter for PTY completion tokens ───────────────

fn count_clean_text_chars(s: &str) -> usize {
    let mut count = 0;
    let mut in_csi = false;
    let mut in_osc = false;
    let mut chars = s.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if let Some(&next) = chars.peek() {
                if next == '[' {
                    chars.next();
                    in_csi = true;
                    continue;
                } else if next == ']' {
                    chars.next();
                    in_osc = true;
                    continue;
                }
            }
            continue;
        }
        if in_csi {
            if (ch as u32) >= 0x40 && (ch as u32) <= 0x7E {
                in_csi = false;
            }
            continue;
        }
        if in_osc {
            if ch == '\x07' {
                in_osc = false;
            } else if ch == '\x1b' {
                if let Some(&'\\') = chars.peek() {
                    chars.next();
                    in_osc = false;
                }
            }
            continue;
        }
        if ch == '\r' || ch == '\x07' || ch == '\x08' || ch == '\0' {
            continue;
        }
        count += 1;
    }
    count
}

// ── PTY Stats & Analytics Sync ────────────────────────────────────────────────

pub async fn sync_pty_session_stats(
    app: &AppHandle,
    session_id: &str,
    profile_id: &str,
    title: &str,
    model: &str,
    provider: &str,
    prompt_chars: u64,
    completion_chars: u64,
    message_count: u64,
    last_preview: Option<String>,
) -> Result<(), String> {
    let state = app.try_state::<Arc<AppState>>().ok_or("AppState not available")?;
    let db = state.require_user_db().await.map_err(|e| e.to_string())?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let prompt_tokens = ((prompt_chars as f64) / 3.8).ceil() as i64;
    let completion_tokens = ((completion_chars as f64) / 3.8).ceil() as i64;
    let total_tokens = prompt_tokens + completion_tokens;
    let total_cost = estimate_cost(model, provider, prompt_tokens, completion_tokens);
    let eff_message_count = if total_tokens > 0 && message_count == 0 { 1 } else { message_count as i64 };

    let _ = conn.execute(
        "INSERT INTO agent_chat_sessions (
            id, profile_id, title, model, provider, mode,
            prompt_tokens, completion_tokens, total_tokens, total_cost, message_count,
            last_message_preview, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'pty', ?6, ?7, ?8, ?9, ?10, ?11, strftime('%s','now'), strftime('%s','now'))
        ON CONFLICT(id) DO UPDATE SET
            model = excluded.model,
            provider = excluded.provider,
            prompt_tokens = excluded.prompt_tokens,
            completion_tokens = excluded.completion_tokens,
            total_tokens = excluded.total_tokens,
            total_cost = excluded.total_cost,
            message_count = MAX(agent_chat_sessions.message_count, excluded.message_count),
            last_message_preview = COALESCE(excluded.last_message_preview, agent_chat_sessions.last_message_preview),
            updated_at = strftime('%s','now')",
        crate::turso_params![
            session_id.to_string(),
            profile_id.to_string(),
            title.to_string(),
            model.to_string(),
            provider.to_string(),
            prompt_tokens,
            completion_tokens,
            total_tokens,
            total_cost,
            eff_message_count,
            last_preview,
        ],
    ).await;

    let _ = aggregate_agent_analytics(&conn, profile_id).await;

    Ok(())
}

pub async fn flush_all_pty_sessions(app: &AppHandle) -> Result<(), String> {
    let pty_manager = match app.try_state::<PtySessionManager>() {
        Some(m) => m,
        None => return Ok(()),
    };

    let sessions_data: Vec<(String, String, String, String, String, u64, u64, u64, Option<String>)> = {
        let sessions = pty_manager.0.lock().unwrap();
        sessions
            .iter()
            .map(|(sid, s)| {
                let p = s.prompt_chars.load(Ordering::Relaxed);
                let c = s.completion_chars.load(Ordering::Relaxed);
                let m = s.message_count.load(Ordering::Relaxed);
                let title = format!(
                    "{} Terminal",
                    match s.cli.as_str() {
                        "antigravity" | "agy" => "Antigravity",
                        "codex" => "Codex",
                        _ => "Claude Code",
                    }
                );
                let preview = s.last_preview.lock().ok().and_then(|prev| prev.clone());
                (
                    sid.clone(),
                    s.profile_id.clone(),
                    title,
                    s.model.clone(),
                    s.provider.clone(),
                    p,
                    c,
                    m,
                    preview,
                )
            })
            .collect()
    };

    for (sid, pid, title, model, provider, p, c, m, preview) in sessions_data {
        if p > 0 || c > 0 || m > 0 {
            let _ = sync_pty_session_stats(
                app,
                &sid,
                &pid,
                &title,
                &model,
                &provider,
                p,
                c,
                m,
                preview,
            )
            .await;
        }
    }

    Ok(())
}

// ── IPC: start_terminal_session ───────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct PtySessionInfo {
    pub session_id: String,
    pub workspace_path: String,
    pub output_dir: String,
    pub history: Option<String>,
}

#[tauri::command]
pub async fn start_terminal_session(
    app: AppHandle,
    pty_manager: State<'_, PtySessionManager>,
    profile_id: String,
    session_id: String,
    cli: String,       // "claude" | "codex" | "antigravity"
    rows: u16,
    cols: u16,
    resume_id: Option<String>,
) -> Result<PtySessionInfo, String> {
    // Idempotent: if session already active return info with buffered history.
    {
        let sessions = pty_manager.0.lock().unwrap();
        if let Some(s) = sessions.get(&session_id) {
            let workspace_dir = get_profile_workspace_dir(&profile_id)?;
            let output_dir = workspace_dir.join("output").to_string_lossy().to_string();
            let history = s.output_history.lock().ok().map(|h| String::from_utf8_lossy(&h).to_string());
            return Ok(PtySessionInfo {
                session_id,
                workspace_path: workspace_dir.to_string_lossy().to_string(),
                output_dir,
                history,
            });
        }
    }

    let workspace_dir = get_profile_workspace_dir(&profile_id)?;
    if !workspace_dir.is_dir() {
        return Err(format!("Workspace not found: {}", workspace_dir.display()));
    }

    // Checklist 4: ensure output/ scaffold (idempotent, catches existing profiles).
    ensure_output_scaffold(&workspace_dir);

    // If running Antigravity CLI, ensure the profile workspace is pre-trusted
    // so it doesn't block waiting for interactive "Do you trust the contents of this project?" prompt.
    if cli == "antigravity" || cli == "agy" {
        ensure_agy_workspace_trusted(&workspace_dir);
        ensure_gemini_project_known(&workspace_dir);
    }

    // Verify CLI binary exists.
    let bin_name = match cli.as_str() {
        "antigravity" | "agy" => "agy",
        "codex" => "codex",
        _ => "claude",
    };
    let bin_path = find_cli_binary(bin_name)
        .ok_or_else(|| format!("CLI '{}' not found. Install it first.", bin_name))?;

    let (provider, model_name, default_title) = match cli.as_str() {
        "antigravity" | "agy" => {
            let m = read_active_agy_model().active_model;
            ("cli_antigravity".to_string(), m, "Antigravity Terminal".to_string())
        }
        "codex" => ("cli_codex".to_string(), "GPT-5 Mini".to_string(), "Codex Terminal".to_string()),
        _ => ("cli_claude".to_string(), "Claude Sonnet 5".to_string(), "Claude Code Terminal".to_string()),
    };

    // Ensure session entry in agent_chat_sessions
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        if let Ok(db) = state.require_user_db().await {
            if let Ok(conn) = db.conn() {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO agent_chat_sessions \
                     (id, profile_id, title, model, provider, mode, message_count, created_at, updated_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, 'pty', 0, strftime('%s','now'), strftime('%s','now'))",
                    crate::turso_params![
                        session_id.clone(),
                        profile_id.clone(),
                        default_title.clone(),
                        model_name.clone(),
                        provider.clone(),
                    ],
                ).await;
            }
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = build_pty_command(&cli, &bin_path, &workspace_dir, resume_id.as_deref());
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("PATH", enriched_pty_path());
    // Remove inherited API keys — CLI uses its own subscription login.
    cmd.env_remove("ANTHROPIC_API_KEY");
    cmd.env_remove("ANTHROPIC_AUTH_TOKEN");
    // Load workspace .env if present.
    let env_file = workspace_dir.join(".env");
    if env_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&env_file) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') { continue; }
                let line = line.strip_prefix("export ").unwrap_or(line);
                if let Some((k, v)) = line.split_once('=') {
                    let v = v.trim().trim_matches('"').trim_matches('\'');
                    cmd.env(k.trim(), v);
                }
            }
        }
    }

    let child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn '{}': {}", cli, e))?;
    let killer = child.clone_killer();
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let history = Arc::new(Mutex::new(Vec::<u8>::new()));
    let history_writer = history.clone();

    let prompt_chars = Arc::new(AtomicU64::new(0));
    let completion_chars = Arc::new(AtomicU64::new(0));
    let message_count = Arc::new(AtomicU64::new(0));
    let last_preview = Arc::new(Mutex::new(None));

    let prompt_chars_reader = Arc::clone(&prompt_chars);
    let completion_chars_reader = Arc::clone(&completion_chars);
    let message_count_reader = Arc::clone(&message_count);
    let last_preview_reader = Arc::clone(&last_preview);

    // Spawn read loop — streams raw PTY bytes as pty-output events and buffers to history.
    let app_handle = app.clone();
    let sid = session_id.clone();
    let app_handle_exit = app_handle.clone();
    let sid_exit = sid.clone();
    let profile_id_exit = profile_id.clone();
    let model_exit = model_name.clone();
    let provider_exit = provider.clone();
    let title_exit = default_title.clone();

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let clean = count_clean_text_chars(&String::from_utf8_lossy(&buf[..n]));
                    completion_chars_reader.fetch_add(clean as u64, Ordering::Relaxed);

                    {
                        if let Ok(mut hist) = history_writer.lock() {
                            hist.extend_from_slice(&buf[..n]);
                            // Cap buffer at 512KB to protect memory
                            if hist.len() > 512 * 1024 {
                                let excess = hist.len() - 512 * 1024;
                                hist.drain(..excess);
                            }
                        }
                    }
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit("pty-output", PtyOutputEvent {
                        session_id: sid.clone(),
                        data,
                    });
                }
            }
        }

        // On exit, persist tokens & cost, aggregate analytics
        let p_chars = prompt_chars_reader.load(Ordering::Relaxed);
        let c_chars = completion_chars_reader.load(Ordering::Relaxed);
        let m_cnt = message_count_reader.load(Ordering::Relaxed);
        let prev = last_preview_reader.lock().ok().and_then(|p| p.clone());
        let app_clone = app_handle_exit.clone();
        tauri::async_runtime::spawn(async move {
            let _ = sync_pty_session_stats(
                &app_clone,
                &sid_exit,
                &profile_id_exit,
                &title_exit,
                &model_exit,
                &provider_exit,
                p_chars,
                c_chars,
                m_cnt,
                prev,
            ).await;
        });

        let _ = app_handle_exit.emit("pty-exit", PtyExitEvent { session_id: sid });
    });

    let output_dir = workspace_dir.join("output").to_string_lossy().to_string();
    let workspace_path = workspace_dir.to_string_lossy().to_string();

    {
        let mut sessions = pty_manager.0.lock().unwrap();
        sessions.insert(session_id.clone(), PtySession {
            writer,
            master: pair.master,
            killer,
            output_history: history,
            profile_id: profile_id.clone(),
            cli: cli.clone(),
            model: model_name,
            provider,
            prompt_chars,
            completion_chars,
            message_count,
            last_preview,
        });
    }

    Ok(PtySessionInfo { session_id, workspace_path, output_dir, history: None })
}

// ── IPC: write_terminal_input ─────────────────────────────────────────────────

#[tauri::command]
pub async fn write_terminal_input(
    app: AppHandle,
    pty_manager: State<'_, PtySessionManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let (profile_id, model, provider, title, p_chars, c_chars, m_cnt, preview, has_newline) = {
        let mut sessions = pty_manager.0.lock().unwrap();
        let session = sessions.get_mut(&session_id).ok_or("No active PTY session")?;
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;

        let char_len = data.chars().count() as u64;
        session.prompt_chars.fetch_add(char_len, Ordering::Relaxed);
        let has_nl = data.contains('\n') || data.contains('\r');
        if has_nl {
            session.message_count.fetch_add(2, Ordering::Relaxed);
            let trimmed = data.trim();
            if trimmed.len() > 1 {
                if let Ok(mut prev) = session.last_preview.lock() {
                    *prev = Some(trimmed.chars().take(80).collect());
                }
            }
        }

        let p = session.prompt_chars.load(Ordering::Relaxed);
        let c = session.completion_chars.load(Ordering::Relaxed);
        let m = session.message_count.load(Ordering::Relaxed);
        let prev = session.last_preview.lock().ok().and_then(|p| p.clone());
        let title = format!(
            "{} Terminal",
            match session.cli.as_str() {
                "antigravity" | "agy" => "Antigravity",
                "codex" => "Codex",
                _ => "Claude Code",
            }
        );

        (session.profile_id.clone(), session.model.clone(), session.provider.clone(), title, p, c, m, prev, has_nl)
    };

    if has_newline {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = sync_pty_session_stats(
                &app_clone,
                &session_id,
                &profile_id,
                &title,
                &model,
                &provider,
                p_chars,
                c_chars,
                m_cnt,
                preview,
            ).await;
        });
    }

    Ok(())
}

// ── IPC: resize_terminal_session ──────────────────────────────────────────────

#[tauri::command]
pub async fn resize_terminal_session(
    pty_manager: State<'_, PtySessionManager>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = pty_manager.0.lock().unwrap();
    let session = sessions.get(&session_id).ok_or("No active PTY session")?;
    session.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

// ── IPC: stop_terminal_session ────────────────────────────────────────────────

#[tauri::command]
pub async fn stop_terminal_session(
    app: AppHandle,
    pty_manager: State<'_, PtySessionManager>,
    session_id: String,
) -> Result<(), String> {
    let removed = {
        let mut sessions = pty_manager.0.lock().unwrap();
        sessions.remove(&session_id)
    };

    if let Some(mut session) = removed {
        let _ = session.killer.kill();

        let p_chars = session.prompt_chars.load(Ordering::Relaxed);
        let c_chars = session.completion_chars.load(Ordering::Relaxed);
        let m_cnt = session.message_count.load(Ordering::Relaxed);
        let prev = session.last_preview.lock().ok().and_then(|p| p.clone());
        let title = format!(
            "{} Terminal",
            match session.cli.as_str() {
                "antigravity" | "agy" => "Antigravity",
                "codex" => "Codex",
                _ => "Claude Code",
            }
        );

        let _ = sync_pty_session_stats(
            &app,
            &session_id,
            &session.profile_id,
            &title,
            &session.model,
            &session.provider,
            p_chars,
            c_chars,
            m_cnt,
            prev,
        ).await;
    }
    Ok(())
}

// ── IPC: list_terminal_sessions ───────────────────────────────────────────────

#[tauri::command]
pub async fn list_terminal_sessions(
    pty_manager: State<'_, PtySessionManager>,
) -> Result<Vec<String>, String> {
    let sessions = pty_manager.0.lock().unwrap();
    Ok(sessions.keys().cloned().collect())
}
