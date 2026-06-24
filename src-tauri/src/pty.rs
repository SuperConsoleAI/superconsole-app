use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct Session {
    pub workspace_id: i64,
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct SessionManager(pub Mutex<HashMap<String, Session>>);

#[derive(Clone, Serialize)]
struct PtyOutput {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExit {
    session_id: String,
}

#[derive(Clone, Serialize)]
struct SessionUsage {
    session_id: String,
    tokens: i64,
    cost_usd: f64,
}

#[derive(Clone, Serialize)]
struct LlmKeyError {
    session_id: String,
    providers: Vec<String>,
}

// Best-effort signatures of provider auth failures in CLI output.
const AUTH_ERROR_SIGNATURES: &[&str] = &[
    "invalid api key",
    "invalid x-api-key",
    "incorrect api key",
    "invalid_api_key",
    "authentication_error",
    "authentication error",
    "401 unauthorized",
    "error 401",
    "status 401",
    "http 401",
    "403 forbidden",
];

fn looks_like_auth_error(text: &str) -> bool {
    let lower = text.to_lowercase();
    AUTH_ERROR_SIGNATURES.iter().any(|s| lower.contains(s))
}

#[derive(Clone, Serialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub context_files: Vec<String>,
    pub env_loaded: bool,
}

pub fn parse_env_file(path: &Path) -> Vec<(String, String)> {
    let Ok(content) = std::fs::read_to_string(path) else {
        return vec![];
    };
    content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let line = line.strip_prefix("export ").unwrap_or(line);
            let (key, value) = line.split_once('=')?;
            let value = value.trim().trim_matches('"').trim_matches('\'');
            Some((key.trim().to_string(), value.to_string()))
        })
        .collect()
}

/// Parse a JSON array of `{ "key", "value" }` env var objects (account-scope
/// variables stored in settings) into ordered key/value pairs.
pub fn parse_env_vars_json(json: &str) -> Vec<(String, String)> {
    let parsed: Vec<serde_json::Value> = serde_json::from_str(json).unwrap_or_default();
    parsed
        .into_iter()
        .filter_map(|v| {
            let key = v.get("key")?.as_str()?.trim().to_string();
            if key.is_empty() {
                return None;
            }
            let value = v.get("value").and_then(|x| x.as_str()).unwrap_or("").to_string();
            Some((key, value))
        })
        .collect()
}

/// Parse the user-registered extra env files (a JSON array of paths stored on
/// the workspace) into ordered key/value pairs. Relative paths resolve against
/// the workspace root; later files override earlier ones.
pub fn extra_env_files(workspace_path: &str, env_files_json: &str) -> Vec<(String, String)> {
    let paths: Vec<String> = serde_json::from_str(env_files_json).unwrap_or_default();
    let mut out = Vec::new();
    for p in paths {
        let path = if Path::new(&p).is_absolute() {
            PathBuf::from(&p)
        } else {
            Path::new(workspace_path).join(&p)
        };
        out.extend(parse_env_file(&path));
    }
    out
}

// macOS GUI apps launched from Finder/Launchpad inherit a minimal PATH
// (`/usr/bin:/bin:/usr/sbin:/sbin`), so CLIs installed via Homebrew, npm, bun,
// cargo, etc. are not found. Resolve the user's real login-shell PATH once and
// merge it with the current PATH plus well-known install dirs.
static USER_PATH: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    // Run a login+interactive shell so profile/rc files (where PATH is usually
    // exported) are sourced; bracket the value to ignore any rc-file noise.
    let out = std::process::Command::new(&shell)
        .args(["-ilc", "printf '__SC__%s__SC__' \"$PATH\""])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let start = s.find("__SC__")? + "__SC__".len();
    let rest = &s[start..];
    let end = rest.find("__SC__")?;
    let path = &rest[..end];
    if path.trim().is_empty() {
        None
    } else {
        Some(path.to_string())
    }
}

/// PATH suitable for spawning user-installed CLIs from a bundled GUI app.
pub fn enriched_path() -> String {
    USER_PATH
        .get_or_init(|| {
            let mut seen = std::collections::HashSet::new();
            let mut dirs: Vec<String> = Vec::new();
            let mut push = |p: &str| {
                if !p.is_empty() && seen.insert(p.to_string()) {
                    dirs.push(p.to_string());
                }
            };
            if let Some(lp) = login_shell_path() {
                for p in lp.split(':') {
                    push(p);
                }
            }
            if let Ok(cur) = std::env::var("PATH") {
                for p in cur.split(':') {
                    push(p);
                }
            }
            let home = std::env::var("HOME").unwrap_or_default();
            for d in [
                "/opt/homebrew/bin",
                "/opt/homebrew/sbin",
                "/usr/local/bin",
                "/usr/bin",
                "/bin",
                "/usr/sbin",
                "/sbin",
            ] {
                push(d);
            }
            if !home.is_empty() {
                for sub in [
                    ".local/bin",
                    ".bun/bin",
                    ".cargo/bin",
                    ".npm-global/bin",
                    ".volta/bin",
                    ".deno/bin",
                ] {
                    push(&format!("{}/{}", home, sub));
                }
            }
            dirs.join(":")
        })
        .clone()
}

const CONTEXT_FILE_CANDIDATES: &[&str] = &["CLAUDE.md", "README.md", "AGENTS.md", "HEARTBEAT.md"];

pub fn cli_command(cli: &str, workspace: &Path, resume_id: Option<&str>) -> CommandBuilder {
    let mut cmd = match cli {
        "claude" => {
            let mut c = CommandBuilder::new("claude");
            // claude auto-loads CLAUDE.md; inject README.md as extra system context
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
            c
        }
        "droid" => {
            let mut c = CommandBuilder::new("droid");
            if let Some(id) = resume_id {
                c.arg("--resume");
                c.arg(id);
            }
            c
        }
        "antigravity" => CommandBuilder::new("agy"),
        "codex" => {
            let mut c = CommandBuilder::new("codex");
            if let Some(id) = resume_id {
                c.arg("resume");
                c.arg(id);
            }
            c
        }
        "shell" => {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
            let mut c = CommandBuilder::new(shell);
            c.arg("-l");
            c
        }
        other => CommandBuilder::new(other),
    };
    cmd.cwd(workspace);
    cmd
}

#[allow(clippy::too_many_arguments)]
pub fn start_session(
    app: &AppHandle,
    manager: &SessionManager,
    session_id: &str,
    workspace_id: i64,
    workspace_path: &str,
    cli: &str,
    rows: u16,
    cols: u16,
    llm_env: &[(String, String)],
    key_providers: &[String],
    resume_id: Option<&str>,
) -> Result<SessionInfo, String> {
    let workspace = Path::new(workspace_path);
    let info = SessionInfo {
        session_id: session_id.to_string(),
        context_files: detect_context_files(workspace),
        env_loaded: workspace.join(".env").exists(),
    };

    let mut sessions = manager.0.lock().unwrap();
    if sessions.contains_key(session_id) {
        return Ok(info);
    }

    if !workspace.is_dir() {
        return Err(format!("Workspace folder not found: {}", workspace_path));
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = cli_command(cli, workspace, resume_id);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("PATH", enriched_path());

    // Precedence: project > org > account > .env. Apply .env first, then the
    // resolved LLM env (account->org->project order) so LLM keys override .env.
    for (k, v) in parse_env_file(&workspace.join(".env")) {
        cmd.env(k, v);
    }
    for (k, v) in llm_env {
        cmd.env(k, v);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to start '{}': {}", cli, e))?;
    let killer = child.clone_killer();
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // SessionStart hook — best-effort, non-blocking.
    {
        let mut hook_env = std::collections::HashMap::new();
        hook_env.insert("SUPERCONSOLE_SESSION_ID".into(), session_id.to_string());
        hook_env.insert("SUPERCONSOLE_CLI".into(), cli.to_string());
        hook_env.insert("SUPERCONSOLE_WORKSPACE_NAME".into(), workspace_path.split('/').last().unwrap_or("").to_string());
        crate::hooks::run_hook(workspace_path, crate::hooks::HookType::SessionStart, &hook_env);
    }

    let app_handle = app.clone();
    let sid = session_id.to_string();
    let providers: Vec<String> = key_providers.to_vec();
    let cli_name = cli.to_string();
    let ws_id = workspace_id;
    let ws_path_for_hook = workspace_path.to_string();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut auth_error_reported = false;
        // Rolling tail of recent output for end-of-session usage parsing.
        let mut tail = String::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    tail.push_str(&data);
                    if tail.len() > 6000 {
                        tail = tail.chars().skip(tail.chars().count().saturating_sub(4000)).collect();
                    }
                    if !auth_error_reported
                        && !providers.is_empty()
                        && looks_like_auth_error(&data)
                    {
                        auth_error_reported = true;
                        let _ = app_handle.emit(
                            "llm-key-error",
                            LlmKeyError {
                                session_id: sid.clone(),
                                providers: providers.clone(),
                            },
                        );
                    }
                    let _ = app_handle.emit(
                        "pty-output",
                        PtyOutput {
                            session_id: sid.clone(),
                            data,
                        },
                    );
                }
            }
        }
        // Best-effort usage capture from the CLI's end-of-session summary.
        if let Some((prompt, completion, cost)) = crate::usage::parse_cli_usage(&tail) {
            let cost = cost.unwrap_or_else(|| {
                crate::usage::estimate_cost(&cli_name, "", prompt, 0, completion, 0)
            });
            // Surface the session total in the UI footer (cloud or not).
            let _ = app_handle.emit(
                "session-usage",
                SessionUsage {
                    session_id: sid.clone(),
                    tokens: prompt + completion,
                    cost_usd: cost,
                },
            );
            if let Some(project_id) = {
                let db = app_handle.state::<crate::db::Db>();
                db.get_workspace(ws_id).ok().and_then(|w| w.project_id)
            } {
                let ev = crate::db::UsageEvent {
                    project_id,
                    session_id: Some(sid.clone()),
                    cli: Some(cli_name.clone()),
                    tokens_prompt: prompt,
                    tokens_completion: completion,
                    cost_usd: cost,
                    estimated: true,
                    ..Default::default()
                };
                crate::usage::record_usage(&app_handle, ev);
            }
        }
        // SessionEnd hook — best-effort, non-blocking.
        {
            let mut hook_env = std::collections::HashMap::new();
            hook_env.insert("SUPERCONSOLE_SESSION_ID".into(), sid.clone());
            hook_env.insert("SUPERCONSOLE_CLI".into(), cli_name.clone());
            hook_env.insert("SUPERCONSOLE_WORKSPACE_NAME".into(),
                ws_path_for_hook.split('/').last().unwrap_or("").to_string());
            crate::hooks::run_hook(&ws_path_for_hook, crate::hooks::HookType::SessionEnd, &hook_env);
        }
        let _ = app_handle.emit("pty-exit", PtyExit { session_id: sid });
    });

    sessions.insert(
        session_id.to_string(),
        Session {
            workspace_id,
            writer,
            master: pair.master,
            killer,
        },
    );

    Ok(info)
}

pub fn detect_context_files(workspace: &Path) -> Vec<String> {
    CONTEXT_FILE_CANDIDATES
        .iter()
        .filter(|f| workspace.join(f).exists())
        .map(|f| f.to_string())
        .collect()
}

pub fn write_session(manager: &SessionManager, session_id: &str, data: &str) -> Result<(), String> {
    let mut sessions = manager.0.lock().unwrap();
    let session = sessions
        .get_mut(session_id)
        .ok_or("No active session")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

pub fn resize_session(
    manager: &SessionManager,
    session_id: &str,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = manager.0.lock().unwrap();
    let session = sessions.get(session_id).ok_or("No active session")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

pub fn stop_session(manager: &SessionManager, session_id: &str) -> Result<(), String> {
    let mut sessions = manager.0.lock().unwrap();
    if let Some(mut session) = sessions.remove(session_id) {
        let _ = session.killer.kill();
    }
    Ok(())
}

pub fn stop_workspace_sessions(manager: &SessionManager, workspace_id: i64) {
    let mut sessions = manager.0.lock().unwrap();
    let ids: Vec<String> = sessions
        .iter()
        .filter(|(_, s)| s.workspace_id == workspace_id)
        .map(|(id, _)| id.clone())
        .collect();
    for id in ids {
        if let Some(mut session) = sessions.remove(&id) {
            let _ = session.killer.kill();
        }
    }
}

pub fn session_active(manager: &SessionManager, session_id: &str) -> bool {
    manager.0.lock().unwrap().contains_key(session_id)
}
