// Lifecycle hooks for SuperConsole agent sessions.
//
// Hooks are shell scripts in .superconsole/hooks/<event>.sh that run at defined
// points in the session lifecycle. They NEVER block the main operation:
//   - Always run with a 10-second timeout
//   - If a hook fails or times out → log error → continue silently
//   - Hook output (stdout) from before-prompt is appended to the system prompt
//   - Hook exit code 1 from before-mcp can abort tool execution

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::time::Duration;

pub enum HookType {
    SessionStart,
    SessionEnd,
    BeforePrompt,
    BeforeMcp,
    BeforeShell,
}

impl HookType {
    pub fn filename(&self) -> &str {
        match self {
            HookType::SessionStart => "session-start.sh",
            HookType::SessionEnd => "session-end.sh",
            HookType::BeforePrompt => "before-prompt.sh",
            HookType::BeforeMcp => "before-mcp.sh",
            HookType::BeforeShell => "before-shell.sh",
        }
    }

    #[allow(dead_code)]
    fn from_str(s: &str) -> Option<HookType> {
        match s {
            "session-start" => Some(HookType::SessionStart),
            "session-end" => Some(HookType::SessionEnd),
            "before-prompt" => Some(HookType::BeforePrompt),
            "before-mcp" => Some(HookType::BeforeMcp),
            "before-shell" => Some(HookType::BeforeShell),
            _ => None,
        }
    }

    #[allow(dead_code)]
    fn type_key(&self) -> &str {
        match self {
            HookType::SessionStart => "session-start",
            HookType::SessionEnd => "session-end",
            HookType::BeforePrompt => "before-prompt",
            HookType::BeforeMcp => "before-mcp",
            HookType::BeforeShell => "before-shell",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookFile {
    pub hook_type: String,
    pub filename: String,
    pub content: String,
    pub exists: bool,
}

/// Run a hook script if it exists. Never blocks — 10s timeout.
/// Returns stdout output or empty string if hook doesn't exist or times out.
pub fn run_hook(
    workspace_path: &str,
    hook_type: HookType,
    env_vars: &HashMap<String, String>,
) -> String {
    let hook_path = format!(
        "{}/.superconsole/hooks/{}",
        workspace_path,
        hook_type.filename()
    );

    if !std::path::Path::new(&hook_path).exists() {
        return String::new();
    }

    // Ensure executable bit is set on Unix.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&hook_path, std::fs::Permissions::from_mode(0o755));
    }

    // Run with a 10-second wall-clock timeout using a thread.
    let hook_path_clone = hook_path.clone();
    let workspace_clone = workspace_path.to_string();
    let hook_name = hook_type.filename().to_string();
    let env_clone = env_vars.clone();

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut cmd = std::process::Command::new("bash");
        cmd.arg(&hook_path_clone)
            .envs(&env_clone)
            .env("SUPERCONSOLE_WORKSPACE", &workspace_clone)
            .env("SUPERCONSOLE_HOOK", &hook_name)
            .current_dir(&workspace_clone)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());

        match cmd.output() {
            Ok(out) => {
                let _ = tx.send(String::from_utf8_lossy(&out.stdout).to_string());
            }
            Err(e) => {
                eprintln!("superconsole hook {} failed: {}", hook_name, e);
                let _ = tx.send(String::new());
            }
        }
    });

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(output) => output,
        Err(_) => {
            eprintln!(
                "superconsole hook {} timed out (10s), skipping",
                hook_type.filename()
            );
            String::new()
        }
    }
}

/// Run before-mcp hook; returns true if the tool execution should proceed,
/// false if the hook exited non-zero (safety gate). Always non-blocking.
pub fn run_before_mcp_hook(workspace_path: &str, tool_name: &str, tool_input_json: &str) -> bool {
    let hook_path = format!("{}/.superconsole/hooks/before-mcp.sh", workspace_path);
    if !std::path::Path::new(&hook_path).exists() {
        return true; // no hook → proceed
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&hook_path, std::fs::Permissions::from_mode(0o755));
    }

    let hook_path_clone = hook_path.clone();
    let workspace_clone = workspace_path.to_string();
    let tool_name = tool_name.to_string();
    let tool_input = tool_input_json.to_string();

    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    std::thread::spawn(move || {
        let status = std::process::Command::new("bash")
            .arg(&hook_path_clone)
            .env("SUPERCONSOLE_WORKSPACE", &workspace_clone)
            .env("SUPERCONSOLE_HOOK", "before-mcp.sh")
            .env("SUPERCONSOLE_TOOL_NAME", &tool_name)
            .env("SUPERCONSOLE_TOOL_INPUT", &tool_input)
            .current_dir(&workspace_clone)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        let proceed = match status {
            Ok(s) => s.success(),
            Err(e) => {
                eprintln!("superconsole before-mcp hook failed: {}", e);
                true // fail-open: don't block tool on hook error
            }
        };
        let _ = tx.send(proceed);
    });

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(proceed) => proceed,
        Err(_) => {
            eprintln!("superconsole before-mcp hook timed out, proceeding");
            true // timeout → proceed
        }
    }
}

/// List all known hook slots for a workspace, reporting existence + content.
pub fn list_hooks(workspace_path: &str) -> Vec<HookFile> {
    let all_types = [
        ("session-start", "session-start.sh"),
        ("session-end", "session-end.sh"),
        ("before-prompt", "before-prompt.sh"),
        ("before-mcp", "before-mcp.sh"),
        ("before-shell", "before-shell.sh"),
    ];

    all_types
        .iter()
        .map(|(type_key, filename)| {
            let path = format!("{}/.superconsole/hooks/{}", workspace_path, filename);
            let exists = std::path::Path::new(&path).exists();
            let content = if exists {
                std::fs::read_to_string(&path).unwrap_or_default()
            } else {
                default_hook_template(type_key)
            };
            HookFile {
                hook_type: type_key.to_string(),
                filename: filename.to_string(),
                content,
                exists,
            }
        })
        .collect()
}

/// Read the content of a specific hook script. Returns the default template if
/// the hook doesn't exist yet (so the editor has a starting point).
pub fn read_hook(workspace_path: &str, hook_type_key: &str) -> Result<String, String> {
    let filename = hook_filename(hook_type_key)?;
    let path = format!("{}/.superconsole/hooks/{}", workspace_path, filename);
    if std::path::Path::new(&path).exists() {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok(default_hook_template(hook_type_key))
    }
}

/// Write a hook script, creating the hooks directory if needed.
pub fn write_hook(workspace_path: &str, hook_type_key: &str, content: &str) -> Result<(), String> {
    let filename = hook_filename(hook_type_key)?;
    let hooks_dir = format!("{}/.superconsole/hooks", workspace_path);
    std::fs::create_dir_all(&hooks_dir).map_err(|e| e.to_string())?;
    let path = format!("{}/{}", hooks_dir, filename);
    let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;

    // Set executable bit on Unix.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755));
    }

    Ok(())
}

/// Delete a hook script. Silent no-op if it doesn't exist.
pub fn delete_hook(workspace_path: &str, hook_type_key: &str) -> Result<(), String> {
    let filename = hook_filename(hook_type_key)?;
    let path = format!("{}/.superconsole/hooks/{}", workspace_path, filename);
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn hook_filename(hook_type_key: &str) -> Result<&'static str, String> {
    match hook_type_key {
        "session-start" => Ok("session-start.sh"),
        "session-end" => Ok("session-end.sh"),
        "before-prompt" => Ok("before-prompt.sh"),
        "before-mcp" => Ok("before-mcp.sh"),
        "before-shell" => Ok("before-shell.sh"),
        other => Err(format!("Unknown hook type: {}", other)),
    }
}

fn default_hook_template(hook_type_key: &str) -> String {
    match hook_type_key {
        "session-start" => r#"#!/bin/bash
# Runs when a CLI session opens
# Environment variables available:
#   SUPERCONSOLE_WORKSPACE, SUPERCONSOLE_SESSION_ID, SUPERCONSOLE_CLI
echo "Session started: $SUPERCONSOLE_CLI in $SUPERCONSOLE_WORKSPACE_NAME"
"#,
        "session-end" => r#"#!/bin/bash
# Runs when a CLI session closes
# Environment variables available:
#   SUPERCONSOLE_WORKSPACE, SUPERCONSOLE_SESSION_ID, SUPERCONSOLE_CLI

# Update HEARTBEAT.md with last session timestamp
echo "Last session: $(date)" >> "$SUPERCONSOLE_WORKSPACE/HEARTBEAT.md"

# Optional: notify Telegram
# curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
#   -d "chat_id=$TELEGRAM_CHAT_ID" \
#   -d "text=Session ended in $SUPERCONSOLE_WORKSPACE_NAME"
"#,
        "before-prompt" => r#"#!/bin/bash
# Runs before every LLM call in native chat
# Output is appended to the system prompt
# Environment variables available:
#   SUPERCONSOLE_WORKSPACE, SUPERCONSOLE_PROMPT_LENGTH

# Inject current date and git status
echo "Current date: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "Git branch: $(git -C "$SUPERCONSOLE_WORKSPACE" branch --show-current 2>/dev/null)"
"#,
        "before-mcp" => r#"#!/bin/bash
# Runs before every MCP tool execution
# Exit code 1 = abort tool execution (safety gate)
# Environment variables available:
#   SUPERCONSOLE_TOOL_NAME, SUPERCONSOLE_TOOL_INPUT

# Example: log all tool calls
echo "[$(date -u '+%H:%M:%S')] MCP: $SUPERCONSOLE_TOOL_NAME" >> "$SUPERCONSOLE_WORKSPACE/.superconsole/mcp.log"

# Exit 1 to block specific tools:
# if [ "$SUPERCONSOLE_TOOL_NAME" = "delete_file" ]; then exit 1; fi
"#,
        "before-shell" => r#"#!/bin/bash
# Runs before shell commands execute in scheduled jobs
# Environment variables available:
#   SUPERCONSOLE_WORKSPACE, SUPERCONSOLE_COMMAND

echo "Running: $SUPERCONSOLE_COMMAND"
"#,
        _ => "#!/bin/bash\n# Hook script\n",
    }
    .to_string()
}
