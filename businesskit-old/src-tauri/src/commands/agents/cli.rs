// src-tauri/src/commands/agents/cli.rs
//
// Headless CLI Subprocess Runner for BusinessKit (Claude Code & OpenAI Codex).
// Spawns local CLI binaries in headless mode with Model Context Protocol (MCP) toolbelt,
// translates streaming NDJSON output into standard chat events, and persists messages to UserDB.
//
// HARD RULES:
// - UserDB only (&TursoConn for active profile). Zero Central DB calls.
// - Workspace at ~/.businesskit/profiles/{profile_id}/workspace/ is a disposable cache.
// - Emits identical Tauri events: 'chat-token', 'chat-tool-call', 'chat-done', 'chat-error'.
// - Processes cancel flag cooperatively and terminates child subprocesses.

use super::analytics::{aggregate_agent_analytics, estimate_cost, estimate_tokens};
use crate::commands::agents::chat::{DoneEvent, ErrorEvent, TokenEvent, ToolCallEvent};
use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliModelStatus {
    pub provider: String,
    pub model_id: String,
    pub active_model: String,
    pub active_effort: String,
    pub thinking_enabled: bool,
    pub source_path: String,
}

pub fn read_active_agy_model() -> CliModelStatus {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let settings_path = home.join(".gemini").join("antigravity-cli").join("settings.json");
    let source_path = settings_path.to_string_lossy().to_string();

    let mut model_id = "cli:antigravity:gemini-3.7-flash".to_string();
    let mut active_model = "Gemini 3.7 Flash".to_string();
    let mut active_effort = "low".to_string();
    let thinking_enabled = false;

    if settings_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                if let Some(m_str) = val.get("model").and_then(|v| v.as_str()) {
                    let m_lower = m_str.to_lowercase();
                    
                    if m_lower.contains("(low)") || m_lower.ends_with("-low") {
                        active_effort = "low".to_string();
                    } else if m_lower.contains("(high)") || m_lower.ends_with("-high") {
                        active_effort = "high".to_string();
                    } else if m_lower.contains("(medium)") || m_lower.ends_with("-medium") {
                        active_effort = "medium".to_string();
                    }

                    if m_lower.contains("3.1 pro") || m_lower.contains("gemini-3.1-pro") {
                        model_id = "cli:antigravity:gemini-3.1-pro".to_string();
                        active_model = "Gemini 3.1 Pro".to_string();
                    } else if m_lower.contains("3.8 flash") || m_lower.contains("gemini-3.8-flash") {
                        model_id = "cli:antigravity:gemini-3.8-flash".to_string();
                        active_model = "Gemini 3.8 Flash".to_string();
                    } else if m_lower.contains("3.7 flash") || m_lower.contains("gemini-3.7-flash") {
                        model_id = "cli:antigravity:gemini-3.7-flash".to_string();
                        active_model = "Gemini 3.7 Flash".to_string();
                    } else if m_lower.contains("3.6 flash") || m_lower.contains("gemini-3.6-flash") {
                        model_id = "cli:antigravity:gemini-3.6-flash".to_string();
                        active_model = "Gemini 3.6 Flash".to_string();
                    } else if m_lower.contains("claude sonnet") || m_lower.contains("sonnet-4-6") {
                        model_id = "cli:antigravity:claude-sonnet-4-6".to_string();
                        active_model = "Claude Sonnet 4.6".to_string();
                    } else if m_lower.contains("claude opus") || m_lower.contains("opus-4-6") {
                        model_id = "cli:antigravity:claude-opus-4-6-thinking".to_string();
                        active_model = "Claude Opus 4.6".to_string();
                    } else if m_lower.contains("gpt-oss") {
                        model_id = "cli:antigravity:gpt-oss-120b-medium".to_string();
                        active_model = "GPT-OSS 120B".to_string();
                    } else {
                        active_model = m_str
                            .replace("(Low)", "")
                            .replace("(Medium)", "")
                            .replace("(High)", "")
                            .trim()
                            .to_string();
                    }
                }
            }
        }
    }

    CliModelStatus {
        provider: "cli_antigravity".to_string(),
        model_id,
        active_model,
        active_effort,
        thinking_enabled,
        source_path,
    }
}

pub fn read_active_claude_model() -> CliModelStatus {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let settings_path = home.join(".claude").join("settings.json");
    let source_path = settings_path.to_string_lossy().to_string();

    let mut model_id = "cli:claude:claude-5-sonnet".to_string();
    let mut active_model = "Claude Sonnet 5".to_string();
    let mut active_effort = "low".to_string();
    let thinking_enabled = false;

    if settings_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                if let Some(effort) = val.get("effortLevel").and_then(|v| v.as_str()) {
                    if effort != "off" && !effort.is_empty() {
                        active_effort = effort.to_string();
                    }
                }
                if let Some(m_str) = val.get("model").and_then(|v| v.as_str()) {
                    let m_lower = m_str.to_lowercase();
                    if m_lower.contains("sonnet-5") || m_lower == "sonnet" {
                        model_id = "cli:claude:claude-5-sonnet".to_string();
                        active_model = "Claude Sonnet 5".to_string();
                    } else if m_lower.contains("fable") {
                        model_id = "cli:claude:claude-5-1-fable".to_string();
                        active_model = "Claude Fable 5.1".to_string();
                    } else if m_lower.contains("opus-4-8") || m_lower == "opus" || m_lower.contains("opus") {
                        model_id = "cli:claude:claude-opus-4-8".to_string();
                        active_model = "Claude Opus 4.8".to_string();
                    } else if m_lower.contains("haiku") {
                        model_id = "cli:claude:claude-haiku-4-5".to_string();
                        active_model = "Claude Haiku 4.5".to_string();
                    } else if m_lower.contains("1m") {
                        model_id = "cli:claude:claude-sonnet-4-6-1m".to_string();
                        active_model = "Claude Sonnet 4.6 (1M context)".to_string();
                    } else if m_lower.contains("sonnet-4-6") || m_lower.contains("sonnet-4.6") {
                        model_id = "cli:claude:claude-sonnet-4-6".to_string();
                        active_model = "Claude Sonnet 4.6".to_string();
                    } else {
                        active_model = m_str.to_string();
                    }
                }
            }
        }
    }

    CliModelStatus {
        provider: "cli_claude".to_string(),
        model_id,
        active_model,
        active_effort,
        thinking_enabled,
        source_path,
    }
}

pub fn read_active_codex_model() -> CliModelStatus {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let config_path = home.join(".codex").join("config.toml");
    let source_path = config_path.to_string_lossy().to_string();

    let mut model_id = "cli:codex:gpt-5.6-luna".to_string();
    let mut active_model = "GPT-5.6 Luna".to_string();
    let mut active_effort = "low".to_string();
    let thinking_enabled = false;

    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("model ") || trimmed.starts_with("model=") {
                    if let Some(val) = trimmed.split('=').nth(1) {
                        let m = val.trim().trim_matches('"').trim_matches('\'');
                        if m.contains("terra") {
                            model_id = "cli:codex:gpt-5.6-terra".to_string();
                            active_model = "GPT-5.6 Terra".to_string();
                        } else if m.contains("luna") {
                            model_id = "cli:codex:gpt-5.6-luna".to_string();
                            active_model = "GPT-5.6 Luna".to_string();
                        } else if m == "gpt-5.5" {
                            model_id = "cli:codex:gpt-5.5".to_string();
                            active_model = "GPT-5.5".to_string();
                        } else if !m.is_empty() {
                            model_id = "cli:codex:gpt-5.6-luna".to_string();
                            active_model = "GPT-5.6 Luna".to_string();
                        }
                    }
                } else if trimmed.starts_with("model_reasoning_effort") {
                    if let Some(val) = trimmed.split('=').nth(1) {
                        let eff = val.trim().trim_matches('"').trim_matches('\'');
                        if !eff.is_empty() && eff != "off" {
                            active_effort = eff.to_string();
                        }
                    }
                }
            }
        }
    }

    CliModelStatus {
        provider: "cli_codex".to_string(),
        model_id,
        active_model,
        active_effort,
        thinking_enabled,
        source_path,
    }
}

#[tauri::command]
pub async fn get_active_cli_models() -> Result<HashMap<String, CliModelStatus>, String> {
    let mut map = HashMap::new();
    map.insert("cli_antigravity".to_string(), read_active_agy_model());
    map.insert("cli_claude".to_string(), read_active_claude_model());
    map.insert("cli_codex".to_string(), read_active_codex_model());
    Ok(map)
}

#[tauri::command]
pub async fn set_cli_active_model(
    provider: String,
    model_id: String,
    effort: Option<String>,
) -> Result<CliModelStatus, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine home dir".to_string())?;

    match provider.as_str() {
        "cli_antigravity" | "antigravity" => {
            let dir = home.join(".gemini").join("antigravity-cli");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let settings_path = dir.join("settings.json");

            let mut val: Value = if settings_path.exists() {
                let content = std::fs::read_to_string(&settings_path).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
            } else {
                json!({})
            };

            let raw_model = extract_cli_model_name(Some(&model_id)).unwrap_or(&model_id);
            let formatted_model = match raw_model {
                "claude-sonnet-4-6" | "claude-4-6-sonnet" => "Claude Sonnet 4.6 (Thinking)".to_string(),
                "claude-opus-4-6-thinking" | "claude-opus-4-6" | "claude-4-6-opus" => "Claude Opus 4.6 (Thinking)".to_string(),
                "gpt-oss-120b-medium" | "gpt-oss-120b" => "GPT-OSS 120B (Medium)".to_string(),
                "gemini-3.1-pro" => match effort.as_deref().map(|e| e.trim().to_lowercase()).as_deref() {
                    Some("high") | Some("extra") | Some("max") => "Gemini 3.1 Pro (High)".to_string(),
                    _ => "Gemini 3.1 Pro (Low)".to_string(),
                },
                "gemini-3.8-flash" => match effort.as_deref().map(|e| e.trim().to_lowercase()).as_deref() {
                    Some("medium") => "Gemini 3.8 Flash (Medium)".to_string(),
                    Some("high") | Some("extra") | Some("max") => "Gemini 3.8 Flash (High)".to_string(),
                    _ => "Gemini 3.8 Flash (Low)".to_string(),
                },
                "gemini-3.7-flash" => match effort.as_deref().map(|e| e.trim().to_lowercase()).as_deref() {
                    Some("medium") => "Gemini 3.7 Flash (Medium)".to_string(),
                    Some("high") | Some("extra") | Some("max") => "Gemini 3.7 Flash (High)".to_string(),
                    _ => "Gemini 3.7 Flash (Low)".to_string(),
                },
                "gemini-3.6-flash" => match effort.as_deref().map(|e| e.trim().to_lowercase()).as_deref() {
                    Some("medium") => "Gemini 3.6 Flash (Medium)".to_string(),
                    Some("high") | Some("extra") | Some("max") => "Gemini 3.6 Flash (High)".to_string(),
                    _ => "Gemini 3.6 Flash (Low)".to_string(),
                },
                other => match effort.as_deref().map(|e| e.trim().to_lowercase()).as_deref() {
                    Some("medium") => format!("{} (Medium)", other),
                    Some("high") | Some("extra") | Some("max") => format!("{} (High)", other),
                    _ => format!("{} (Low)", other),
                },
            };

            if let Some(obj) = val.as_object_mut() {
                obj.insert("model".to_string(), json!(formatted_model));
            }

            let new_content = serde_json::to_string_pretty(&val).map_err(|e| e.to_string())?;
            std::fs::write(&settings_path, new_content).map_err(|e| e.to_string())?;

            Ok(read_active_agy_model())
        }
        "cli_claude" | "claude" => {
            let dir = home.join(".claude");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let settings_path = dir.join("settings.json");

            let mut val: Value = if settings_path.exists() {
                let content = std::fs::read_to_string(&settings_path).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
            } else {
                json!({})
            };

            let raw_model = extract_cli_model_name(Some(&model_id)).unwrap_or(&model_id);
            let claude_model_val = match raw_model {
                "claude-5-sonnet" | "sonnet" => "us.anthropic.claude-sonnet-5",
                "claude-5-1-fable" | "fable" => "us.anthropic.claude-5-1-fable",
                "claude-opus-4-8" | "opus" => "us.anthropic.claude-opus-4-8",
                "claude-haiku-4-5" | "haiku" => "us.anthropic.claude-haiku-4-5",
                "claude-sonnet-4-6-1m" => "us.anthropic.claude-sonnet-4-6-1m",
                "claude-sonnet-4-6" => "us.anthropic.claude-sonnet-4-6",
                other => other,
            };

            let eff_val = match effort.as_deref().map(|e| e.trim().to_lowercase()).as_deref() {
                Some("medium") => "medium",
                Some("high") | Some("extra") | Some("max") => "high",
                _ => "low",
            };

            if let Some(obj) = val.as_object_mut() {
                obj.insert("model".to_string(), json!(claude_model_val));
                obj.insert("effortLevel".to_string(), json!(eff_val));
            }

            let new_content = serde_json::to_string_pretty(&val).map_err(|e| e.to_string())?;
            std::fs::write(&settings_path, new_content).map_err(|e| e.to_string())?;

            Ok(read_active_claude_model())
        }
        "cli_codex" | "codex" => {
            let dir = home.join(".codex");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let config_path = dir.join("config.toml");

            let raw_model = extract_cli_model_name(Some(&model_id)).unwrap_or(&model_id);
            let codex_model_val = match raw_model {
                "gpt-5.6-terra" | "terra" => "gpt-5.6-terra",
                "gpt-5.6-luna" | "luna" => "gpt-5.6-luna",
                "gpt-5.5" => "gpt-5.5",
                _ => "gpt-5.6-luna",
            };

            let codex_effort_val = match effort.as_deref().map(|e| e.trim().to_lowercase()).as_deref() {
                Some("medium") => "medium",
                Some("high") | Some("extra") | Some("max") => "high",
                _ => "low",
            };

            let mut lines = Vec::new();
            let mut model_written = false;
            let mut effort_written = false;

            if config_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&config_path) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("model ") || trimmed.starts_with("model=") {
                            lines.push(format!("model = \"{}\"", codex_model_val));
                            model_written = true;
                        } else if trimmed.starts_with("model_reasoning_effort") {
                            lines.push(format!("model_reasoning_effort = \"{}\"", codex_effort_val));
                            effort_written = true;
                        } else {
                            lines.push(line.to_string());
                        }
                    }
                }
            }

            if !model_written {
                lines.insert(0, format!("model = \"{}\"", codex_model_val));
            }
            if !effort_written {
                lines.insert(1, format!("model_reasoning_effort = \"{}\"", codex_effort_val));
            }

            std::fs::write(&config_path, lines.join("\n")).map_err(|e| e.to_string())?;

            Ok(read_active_codex_model())
        }
        other => Err(format!("Unsupported CLI provider: {}", other)),
    }
}

/// Resolves the workspace path for the given profile.
pub fn get_profile_workspace_dir(profile_id: &str) -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine user home directory".to_string())?;
    let workspace = home
        .join(".businesskit")
        .join("profiles")
        .join(profile_id)
        .join("workspace");
    std::fs::create_dir_all(&workspace)
        .map_err(|e| format!("Failed to create profile workspace directory: {}", e))?;
    Ok(workspace)
}

/// Locates a CLI binary by name, searching PATH and common user installation paths.
pub fn find_cli_binary(bin_name: &str) -> Option<PathBuf> {
    // 1. Direct which lookup in PATH
    if let Ok(out) = Command::new("which").arg(bin_name).output() {
        if out.status.success() {
            let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path_str.is_empty() && Path::new(&path_str).exists() {
                return Some(PathBuf::from(path_str));
            }
        }
    }

    // 2. Check standard installation directories
    let mut candidate_dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        candidate_dirs.push(home.join(".npm-global").join("bin"));
        candidate_dirs.push(home.join(".local").join("bin"));
        candidate_dirs.push(home.join(".cargo").join("bin"));
        candidate_dirs.push(home.join("bin"));
    }
    candidate_dirs.push(PathBuf::from("/usr/local/bin"));
    candidate_dirs.push(PathBuf::from("/opt/homebrew/bin"));
    candidate_dirs.push(PathBuf::from("/usr/bin"));

    for dir in candidate_dirs {
        let p = dir.join(bin_name);
        if p.exists() {
            return Some(p);
        }
    }

    None
}

static INITIALIZED_PROFILES: Mutex<Option<HashSet<String>>> = Mutex::new(None);
static AGY_MCP_REGISTERED: OnceLock<bool> = OnceLock::new();

fn is_profile_initialized(profile_id: &str, marker_file: &Path) -> bool {
    let mut lock = INITIALIZED_PROFILES.lock().unwrap();
    let set = lock.get_or_insert_with(HashSet::new);
    if set.contains(profile_id) && marker_file.exists() {
        return true;
    }
    if marker_file.exists() {
        set.insert(profile_id.to_string());
        return true;
    }
    false
}

fn mark_profile_initialized(profile_id: &str) {
    let mut lock = INITIALIZED_PROFILES.lock().unwrap();
    let set = lock.get_or_insert_with(HashSet::new);
    set.insert(profile_id.to_string());
}

/// Writes `.mcp.json` and `CLAUDE.md` into the workspace for Claude Code (cached per profile).
fn write_claude_mcp_config(workspace: &Path, profile_id: &str, system_prompt: &str) -> Result<PathBuf, String> {
    let config_path = workspace.join(".mcp.json");
    if is_profile_initialized(profile_id, &config_path) {
        return Ok(config_path);
    }

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Could not get current executable path: {}", e))?;
    let current_exe_str = current_exe.to_string_lossy().to_string();

    let mcp_config = json!({
        "mcpServers": {
            "businesskit": {
                "command": current_exe_str,
                "args": ["--mcp", "--profile", profile_id]
            }
        }
    });

    let content = serde_json::to_string_pretty(&mcp_config)
        .map_err(|e| format!("Failed to serialize .mcp.json: {}", e))?;
    std::fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write .mcp.json: {}", e))?;

    let _ = std::fs::write(workspace.join("CLAUDE.md"), system_prompt);
    let _ = std::fs::write(workspace.join("AGENTS.md"), system_prompt);
    mark_profile_initialized(profile_id);

    Ok(config_path)
}

/// Writes `AGENTS.md`, `GEMINI.md`, rules, and MCP server configs for Antigravity CLI (cached per profile).
fn write_antigravity_workspace_config(
    workspace: &Path,
    profile_id: &str,
    system_prompt: &str,
) -> Result<(), String> {
    let marker = workspace.join(".agents").join("mcp_config.json");
    if is_profile_initialized(profile_id, &marker) {
        return Ok(());
    }

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Could not get current executable path: {}", e))?;
    let current_exe_str = current_exe.to_string_lossy().to_string();

    // 1. Root instruction markdown files
    let _ = std::fs::write(workspace.join("AGENTS.md"), system_prompt);
    let _ = std::fs::write(workspace.join("GEMINI.md"), system_prompt);

    // 2. Antigravity rules directories (.agents/rules/ and .gemini/rules/)
    let agents_rules = workspace.join(".agents").join("rules");
    let _ = std::fs::create_dir_all(&agents_rules);
    let _ = std::fs::write(agents_rules.join("businesskit.md"), system_prompt);

    let gemini_rules = workspace.join(".gemini").join("rules");
    let _ = std::fs::create_dir_all(&gemini_rules);
    let _ = std::fs::write(gemini_rules.join("businesskit.md"), system_prompt);

    // 3. Antigravity skill directory (.agents/skills/businesskit/SKILL.md)
    let skill_dir = workspace.join(".agents").join("skills").join("businesskit");
    let _ = std::fs::create_dir_all(&skill_dir);
    let skill_content = format!(
        "---\nname: businesskit\ndescription: BusinessKit autonomous business operations, inventory, invoices, contacts, and ERP management.\n---\n\n{}",
        system_prompt
    );
    let _ = std::fs::write(skill_dir.join("SKILL.md"), &skill_content);

    // 4. MCP config in .agents/ and .gemini/ and workspace root
    let mcp_config = json!({
        "mcpServers": {
            "businesskit": {
                "command": current_exe_str,
                "args": ["--mcp", "--profile", profile_id]
            }
        }
    });
    let content = serde_json::to_string_pretty(&mcp_config)
        .map_err(|e| format!("Failed to serialize mcp_config.json: {}", e))?;

    let agents_dir = workspace.join(".agents");
    let _ = std::fs::create_dir_all(&agents_dir);
    let _ = std::fs::write(agents_dir.join("mcp_config.json"), &content);

    let gemini_dir = workspace.join(".gemini");
    let _ = std::fs::create_dir_all(&gemini_dir);
    let _ = std::fs::write(gemini_dir.join("mcp_config.json"), &content);

    let _ = std::fs::write(workspace.join("mcp_config.json"), &content);
    mark_profile_initialized(profile_id);

    Ok(())
}

/// Ensures the businesskit MCP server is registered for Antigravity CLI once per process lifecycle.
fn ensure_businesskit_mcp_registered_for_agy(agy_bin: &Path, current_exe_str: &str, profile_id: &str) {
    AGY_MCP_REGISTERED.get_or_init(|| {
        let _ = Command::new(agy_bin)
            .arg("mcp")
            .arg("add")
            .arg("businesskit")
            .arg(current_exe_str)
            .arg("--")
            .arg("--mcp")
            .arg("--profile")
            .arg(profile_id)
            .output();
        true
    });
}

/// Writes `AGENTS.md` and instructions for OpenAI Codex CLI (cached per profile).
fn write_codex_workspace_config(workspace: &Path, profile_id: &str, system_prompt: &str) -> Result<(), String> {
    let marker = workspace.join("instructions.md");
    if is_profile_initialized(profile_id, &marker) {
        return Ok(());
    }

    let _ = std::fs::write(workspace.join("AGENTS.md"), system_prompt);
    let _ = std::fs::write(workspace.join("instructions.md"), system_prompt);
    mark_profile_initialized(profile_id);
    Ok(())
}

/// Enriches environment PATH for spawned child processes and strips API keys that would hijack local subscription auth.
fn enrich_child_env(cmd: &mut Command) {
    let current_path = std::env::var("PATH").unwrap_or_default();
    let mut extra_paths = Vec::new();

    if let Some(home) = dirs::home_dir() {
        let npm_bin = home.join(".npm-global").join("bin");
        if npm_bin.exists() {
            extra_paths.push(npm_bin.to_string_lossy().to_string());
        }
        let local_bin = home.join(".local").join("bin");
        if local_bin.exists() {
            extra_paths.push(local_bin.to_string_lossy().to_string());
        }
        let cargo_bin = home.join(".cargo").join("bin");
        if cargo_bin.exists() {
            extra_paths.push(cargo_bin.to_string_lossy().to_string());
        }
    }
    extra_paths.push("/opt/homebrew/bin".into());
    extra_paths.push("/usr/local/bin".into());

    let combined_path = format!("{}:{}", extra_paths.join(":"), current_path);
    cmd.env("PATH", combined_path);

    // Explicitly remove ANTHROPIC_API_KEY so Claude Code CLI uses subscription login (/login managed key)
    // rather than silently billing against an inherited API key from .env, parent process, or shell.
    cmd.env_remove("ANTHROPIC_API_KEY");
    cmd.env_remove("ANTHROPIC_AUTH_TOKEN");
}

/// Extracts the raw model identifier passed to the CLI process.
fn extract_cli_model_name<'a>(model: Option<&'a str>) -> Option<&'a str> {
    if let Some(m) = model {
        let trimmed = m.trim();
        if trimmed.is_empty()
            || trimmed == "cli:claude"
            || trimmed == "cli:antigravity"
            || trimmed == "cli:codex"
            || trimmed == "cli_claude"
            || trimmed == "cli_antigravity"
            || trimmed == "cli_codex"
        {
            return None;
        }
        if let Some(last) = trimmed
            .strip_prefix("cli:claude:")
            .or_else(|| trimmed.strip_prefix("cli:antigravity:"))
            .or_else(|| trimmed.strip_prefix("cli:codex:"))
        {
            if !last.trim().is_empty() {
                return Some(last.trim());
            }
        }
        Some(trimmed)
    } else {
        None
    }
}

/// Normalizes model identifier for Claude Code CLI.
fn normalize_claude_model_name(model_name: &str) -> Option<String> {
    let raw = model_name.trim();
    if raw.is_empty() || raw == "default" || raw == "claude-default" {
        return None; // Let claude CLI use its default Opus 4.8 / Sonnet
    }
    let lower = raw.to_lowercase();
    match lower.as_str() {
        "claude-5-sonnet" | "claude-sonnet-5" | "sonnet" | "sonnet-5" | "claude-4-6-sonnet"
        | "claude-sonnet-4-6" | "sonnet-4.6" | "claude-4-6-sonnet-1m" | "claude-sonnet-4-6-1m"
        | "sonnet-4.6-1m" | "sonnet-1m" | "claude-sonnet" => Some("sonnet".into()),
        "claude-5-1-fable" | "claude-fable-5-1" | "fable" | "fable-5.1" | "claude-fable-5"
        | "claude-fable" => Some("fable".into()),
        "claude-4-8-opus" | "claude-opus-4-8" | "opus-4.8" | "opus" | "claude-5-opus"
        | "opus-5" | "claude-opus" => Some("opus".into()),
        "claude-4-5-haiku" | "claude-haiku-4-5" | "haiku-4.5" | "haiku" | "claude-haiku" => {
            Some("haiku".into())
        }
        _ => Some(raw.to_string()),
    }
}

/// Normalizes model identifier for OpenAI Codex CLI.
fn normalize_codex_model_name(model_name: &str) -> String {
    let raw = model_name.trim();
    match raw {
        "gpt-5.6-terra" | "terra" => "gpt-5.6-terra".to_string(),
        "gpt-5.5" => "gpt-5.5".to_string(),
        _ => "gpt-5.6-luna".to_string(),
    }
}

/// Normalizes model identifier to exact Antigravity CLI supported model names.
fn normalize_agy_model_name(model_name: &str, effort: Option<&str>) -> String {
    let raw = model_name.trim();
    let eff = effort.map(|e| e.trim().to_lowercase()).unwrap_or_default();

    match raw {
        "claude-4-6-sonnet" | "claude-sonnet-4-6" => "claude-sonnet-4-6".to_string(),
        "claude-4-6-opus" | "claude-opus-4-6" | "claude-opus-4-6-thinking" => {
            "claude-opus-4-6-thinking".to_string()
        }
        "gpt-oss-120b" | "gpt-oss-120b-medium" => "gpt-oss-120b-medium".to_string(),
        "gemini-3.8-flash" => match eff.as_str() {
            "high" | "extra" | "max" => "gemini-3.8-flash-high".to_string(),
            "medium" => "gemini-3.8-flash-medium".to_string(),
            _ => "gemini-3.8-flash-low".to_string(),
        },
        "gemini-3.7-flash" => match eff.as_str() {
            "high" | "extra" | "max" => "gemini-3.7-flash-high".to_string(),
            "medium" => "gemini-3.7-flash-medium".to_string(),
            _ => "gemini-3.7-flash-low".to_string(),
        },
        "gemini-3.6-flash" => match eff.as_str() {
            "high" | "extra" | "max" => "gemini-3.6-flash-high".to_string(),
            "medium" => "gemini-3.6-flash-medium".to_string(),
            _ => "gemini-3.6-flash-low".to_string(),
        },
        "gemini-3.1-pro" => match eff.as_str() {
            "high" | "extra" | "max" => "gemini-3.1-pro-high".to_string(),
            _ => "gemini-3.1-pro-low".to_string(),
        },
        other => {
            if other.ends_with("-low") || other.ends_with("-medium") || other.ends_with("-high") {
                other.to_string()
            } else if other.starts_with("gemini-") {
                match eff.as_str() {
                    "high" | "extra" | "max" => format!("{}-high", other),
                    "medium" => format!("{}-medium", other),
                    _ => format!("{}-low", other),
                }
            } else {
                other.to_string()
            }
        }
    }
}

/// Builds the argument list for spawning a Claude Code CLI process.
pub fn build_claude_args(
    mcp_config_path: &Path,
    model: Option<&str>,
    reasoning_effort: Option<&str>,
    system_prompt: &str,
    resume_ref: Option<&str>,
    contextual_message: &str,
) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        contextual_message.to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--mcp-config".to_string(),
        mcp_config_path.to_string_lossy().to_string(),
        "--allowedTools".to_string(),
        "mcp__businesskit__*".to_string(),
        "--permission-mode".to_string(),
        "bypassPermissions".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    if let Some(r_id) = resume_ref {
        let trimmed = r_id.trim();
        if !trimmed.is_empty() {
            args.push("--resume".to_string());
            args.push(trimmed.to_string());
        }
    }

    if let Some(cli_model) = extract_cli_model_name(model) {
        if let Some(normalized) = normalize_claude_model_name(cli_model) {
            args.push("--model".to_string());
            args.push(normalized);
        }
    }

    if let Some(effort) = reasoning_effort {
        let effort_trimmed = effort.trim();
        if !effort_trimmed.is_empty() && effort_trimmed != "off" && effort_trimmed != "auto" {
            let lowered = effort_trimmed.to_lowercase();
            let norm = match lowered.as_str() {
                "extra" | "max" => "high",
                "fast" => "low",
                other => other,
            };
            args.push("--effort".to_string());
            args.push(norm.to_string());
        }
    }

    if !system_prompt.trim().is_empty() {
        args.push("--append-system-prompt".to_string());
        args.push(system_prompt.to_string());
    }

    args
}

/// Builds the argument list for spawning an OpenAI Codex CLI process.
pub fn build_codex_args(
    workspace_dir: &Path,
    current_exe_str: &str,
    profile_id: &str,
    model: Option<&str>,
    reasoning_effort: Option<&str>,
    resume_ref: Option<&str>,
    contextual_message: &str,
) -> Vec<String> {
    let mut args = vec!["exec".to_string()];

    let valid_resume_ref = resume_ref.and_then(|r| {
        let t = r.trim();
        if t.is_empty() { None } else { Some(t) }
    });

    if valid_resume_ref.is_some() {
        args.push("resume".to_string());
    }

    args.push("--json".to_string());
    args.push("-C".to_string());
    args.push(workspace_dir.to_string_lossy().to_string());
    args.push("--skip-git-repo-check".to_string());
    args.push("--dangerously-bypass-approvals-and-sandbox".to_string());
    args.push("-c".to_string());
    args.push(format!("mcp_servers.businesskit.command=\"{}\"", current_exe_str));
    args.push("-c".to_string());
    args.push(format!("mcp_servers.businesskit.args=[\"--mcp\", \"--profile\", \"{}\"]", profile_id));

    if let Some(cli_model) = extract_cli_model_name(model) {
        let normalized = normalize_codex_model_name(cli_model);
        args.push("-m".to_string());
        args.push(normalized);
    }

    if let Some(effort) = reasoning_effort {
        let effort_trimmed = effort.trim();
        if !effort_trimmed.is_empty() && effort_trimmed != "off" && effort_trimmed != "auto" {
            let lowered = effort_trimmed.to_lowercase();
            let norm = match lowered.as_str() {
                "fast" => "low",
                "extra" | "max" => "high",
                other => other,
            };
            args.push("-c".to_string());
            args.push(format!("model_reasoning_effort=\"{}\"", norm));
        }
    }

    if let Some(thread_id) = valid_resume_ref {
        args.push(thread_id.to_string());
    }

    args.push(contextual_message.to_string());
    args
}

/// Builds the argument list for spawning an Antigravity CLI process.
pub fn build_agy_args(
    model: Option<&str>,
    reasoning_effort: Option<&str>,
    resume_ref: Option<&str>,
    contextual_message: &str,
) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        contextual_message.to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    if let Some(conv_id) = resume_ref {
        let trimmed = conv_id.trim();
        if !trimmed.is_empty() && trimmed.len() >= 8 {
            args.push("--conversation".to_string());
            args.push(trimmed.to_string());
        }
    }

    let cli_model = extract_cli_model_name(model).unwrap_or("gemini-3.7-flash");
    let normalized_model = normalize_agy_model_name(cli_model, reasoning_effort);
    args.push("--model".to_string());
    args.push(normalized_model);

    args
}

/// Streams text chunks to the frontend with word-by-word pacing for authentic real-time responsiveness.
async fn emit_stream_words(
    app: &AppHandle,
    request_id: &str,
    session_id: &str,
    text: &str,
    total_assistant_text: &mut String,
    cancel_flag: &Arc<AtomicBool>,
) {
    if text.is_empty() {
        return;
    }

    // Split text into tokens preserving whitespace and formatting
    let mut words = Vec::new();
    let mut current_word = String::new();

    for ch in text.chars() {
        current_word.push(ch);
        if ch.is_whitespace() {
            words.push(current_word.clone());
            current_word.clear();
        }
    }
    if !current_word.is_empty() {
        words.push(current_word);
    }

    if words.len() <= 1 {
        total_assistant_text.push_str(text);
        let _ = app.emit(
            "chat-token",
            TokenEvent {
                request_id: request_id.to_string(),
                session_id: session_id.to_string(),
                token: text.to_string(),
            },
        );
    } else {
        for w in words {
            if cancel_flag.load(Ordering::SeqCst) {
                break;
            }
            total_assistant_text.push_str(&w);
            let _ = app.emit(
                "chat-token",
                TokenEvent {
                    request_id: request_id.to_string(),
                    session_id: session_id.to_string(),
                    token: w,
                },
            );
            tokio::time::sleep(tokio::time::Duration::from_millis(15)).await;
        }
    }
}

/// Executes a single CLI turn (Claude Code, Antigravity, or Codex) and streams events to the frontend.
pub async fn run_cli_turn(
    session_id: &str,
    message: &str,
    request_id: &str,
    provider: &str,
    model: Option<&str>,
    reasoning_effort: Option<&str>,
    app: &AppHandle,
    state: &State<'_, Arc<AppState>>,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let workspace_dir = get_profile_workspace_dir(&profile_id)?;
    let system_prompt = crate::commands::agents::chat::build_system_prompt(&conn, &profile_id).await;

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Could not get current executable path: {}", e))?;
    let current_exe_str = current_exe.to_string_lossy().to_string();

    let is_claude = provider.contains("claude");
    let is_antigravity = provider.contains("antigravity") || provider.contains("agy");
    let is_codex = provider.contains("codex");

    let mut total_assistant_text = String::new();
    let mut all_tool_results: Vec<Value> = Vec::new();
    let mut tool_names_map: HashMap<String, String> = HashMap::new();

    // Look up existing cli_resume_ref for this session
    let mut captured_resume_ref: Option<String> = None;
    if let Ok(mut resume_rows) = conn
        .query(
            "SELECT cli_resume_ref FROM agent_chat_sessions WHERE id = ?1",
            crate::turso_params![session_id.to_string()],
        )
        .await
    {
        if let Ok(Some(row)) = resume_rows.next().await {
            if let Ok(Some(r)) = row.get::<Option<String>>(0) {
                if !r.trim().is_empty() {
                    captured_resume_ref = Some(r.trim().to_string());
                }
            }
        }
    }

    // Contextual message wrapper ensuring single-turn CLIs always have live identity & business context
    let contextual_message = format!(
        "[System: You are the BusinessKit Autonomous Assistant. You are directly connected to the user's UserDB via BusinessKit MCP tools. Answer questions and run tools directly.]\n\n{}",
        message
    );

    if is_claude {
        let claude_bin = find_cli_binary("claude").ok_or_else(|| {
            "Claude Code CLI ('claude') not found in PATH or standard directories. Please install it globally via: npm install -g @anthropic-ai/claude-code".to_string()
        })?;

        let mcp_config_path = write_claude_mcp_config(&workspace_dir, &profile_id, &system_prompt)?;

        let mut cmd = Command::new(&claude_bin);
        cmd.current_dir(&workspace_dir);
        let args = build_claude_args(
            &mcp_config_path,
            model,
            reasoning_effort,
            &system_prompt,
            captured_resume_ref.as_deref(),
            &contextual_message,
        );
        cmd.args(&args);

        enrich_child_env(&mut cmd);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        log::info!("[CLI Chat] Spawning Claude Code CLI: {:?} (resume: {:?})", claude_bin, captured_resume_ref);

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude CLI: {}", e))?;
        let stdout = child.stdout.take().ok_or_else(|| "Failed to capture claude stdout".to_string())?;

        let reader = std::io::BufReader::new(stdout);

        for line_res in reader.lines() {
            if cancel_flag.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = app.emit(
                    "chat-error",
                    ErrorEvent {
                        request_id: request_id.to_string(),
                        session_id: session_id.to_string(),
                        error: "Chat cancelled".into(),
                    },
                );
                return Ok(());
            }

            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(event) = serde_json::from_str::<Value>(trimmed) {
                // Capture session ID if present
                if let Some(s_id) = event.get("session_id").or_else(|| event.get("sessionId")).and_then(Value::as_str) {
                    if !s_id.trim().is_empty() {
                        captured_resume_ref = Some(s_id.trim().to_string());
                    }
                }

                // Check for immediate auth failures
                let err_str = event.get("error").and_then(Value::as_str).unwrap_or("");
                let is_403 = event.get("error_status") == Some(&json!(403));
                if err_str == "authentication_failed" || is_403 {
                    let _ = child.kill();
                    let _ = app.emit(
                        "chat-error",
                        ErrorEvent {
                            request_id: request_id.to_string(),
                            session_id: session_id.to_string(),
                            error: "Claude Code CLI authentication required. Please run 'claude login' in your terminal.".into(),
                        },
                    );
                    return Ok(());
                }

                let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");

                match event_type {
                    "content_block_delta" => {
                        if let Some(delta) = event.get("delta") {
                            if let Some(txt) = delta.get("text").and_then(Value::as_str) {
                                emit_stream_words(app, request_id, session_id, txt, &mut total_assistant_text, cancel_flag).await;
                            }
                        }
                    }

                    "assistant" => {
                        // Check for text deltas or content blocks
                        if let Some(msg) = event.get("message") {
                            if let Some(content_blocks) = msg.get("content").and_then(Value::as_array) {
                                for block in content_blocks {
                                    let b_type = block.get("type").and_then(Value::as_str).unwrap_or("");
                                    if b_type == "text" {
                                        if let Some(txt) = block.get("text").and_then(Value::as_str) {
                                            if !txt.is_empty() && !total_assistant_text.contains(txt) {
                                                emit_stream_words(app, request_id, session_id, txt, &mut total_assistant_text, cancel_flag).await;
                                            }
                                        }
                                    } else if b_type == "tool_use" {
                                        let tool_id = block.get("id").and_then(Value::as_str).unwrap_or("tool_1").to_string();
                                        let tool_name = block.get("name").and_then(Value::as_str).unwrap_or("").to_string();
                                        let input_args = block.get("input").cloned().unwrap_or(json!({}));

                                        tool_names_map.insert(tool_id.clone(), tool_name.clone());

                                        let _ = app.emit(
                                            "chat-tool-call",
                                            ToolCallEvent {
                                                request_id: request_id.to_string(),
                                                session_id: session_id.to_string(),
                                                tool_name: tool_name.clone(),
                                                tool_id: tool_id.clone(),
                                                args: input_args.clone(),
                                                result: None,
                                                status: "executing".into(),
                                            },
                                        );
                                    }
                                }
                            }
                        }
                    }

                    "user" => {
                        // User message in stream-json typically echoes tool_result blocks
                        if let Some(msg) = event.get("message") {
                            if let Some(content_blocks) = msg.get("content").and_then(Value::as_array) {
                                for block in content_blocks {
                                    if block.get("type").and_then(Value::as_str) == Some("tool_result") {
                                        let tool_id = block.get("tool_use_id").and_then(Value::as_str).unwrap_or("").to_string();
                                        let content = block.get("content").cloned().unwrap_or(Value::Null);
                                        let is_err = block.get("is_error").and_then(Value::as_bool).unwrap_or(false);
                                        let resolved_tool_name = tool_names_map.get(&tool_id).cloned().unwrap_or_else(|| "businesskit_tool".into());

                                        let _ = app.emit(
                                            "chat-tool-call",
                                            ToolCallEvent {
                                                request_id: request_id.to_string(),
                                                session_id: session_id.to_string(),
                                                tool_name: resolved_tool_name.clone(),
                                                tool_id: tool_id.clone(),
                                                args: json!({}),
                                                result: Some(content.clone()),
                                                status: if is_err { "failed".into() } else { "completed".into() },
                                            },
                                        );

                                        all_tool_results.push(json!({
                                            "id": tool_id,
                                            "tool": resolved_tool_name,
                                            "result": content,
                                            "is_error": is_err
                                        }));
                                    }
                                }
                            }
                        }
                    }

                    "result" => {
                        // Final result event
                        if let Some(s_id) = event.get("session_id").and_then(Value::as_str) {
                            if !s_id.trim().is_empty() {
                                captured_resume_ref = Some(s_id.trim().to_string());
                            }
                        }
                        if let Some(res_txt) = event.get("result").and_then(Value::as_str) {
                            if total_assistant_text.is_empty() {
                                emit_stream_words(app, request_id, session_id, res_txt, &mut total_assistant_text, cancel_flag).await;
                            }
                        }
                    }

                    _ => {}
                }
            }
        }

        let _ = child.wait();
    } else if is_codex {
        let codex_bin = find_cli_binary("codex").ok_or_else(|| {
            "OpenAI Codex CLI ('codex') not found in PATH or standard directories. Please install it via: npm install -g @openai/codex".to_string()
        })?;

        let _ = write_codex_workspace_config(&workspace_dir, &profile_id, &system_prompt);

        let mut cmd = Command::new(&codex_bin);
        cmd.current_dir(&workspace_dir);
        let args = build_codex_args(
            &workspace_dir,
            &current_exe_str,
            &profile_id,
            model,
            reasoning_effort,
            captured_resume_ref.as_deref(),
            &contextual_message,
        );
        cmd.args(&args);

        enrich_child_env(&mut cmd);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        log::info!("[CLI Chat] Spawning Codex CLI: {:?} (resume: {:?})", codex_bin, captured_resume_ref);

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn codex CLI: {}", e))?;
        let stdout = child.stdout.take().ok_or_else(|| "Failed to capture codex stdout".to_string())?;

        let reader = std::io::BufReader::new(stdout);

        for line_res in reader.lines() {
            if cancel_flag.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = app.emit(
                    "chat-error",
                    ErrorEvent {
                        request_id: request_id.to_string(),
                        session_id: session_id.to_string(),
                        error: "Chat cancelled".into(),
                    },
                );
                return Ok(());
            }

            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(event) = serde_json::from_str::<Value>(trimmed) {
                // Capture thread/session ID from Codex events
                if let Some(t_id) = event.get("thread_id").or_else(|| event.get("session_id")).and_then(Value::as_str) {
                    if !t_id.trim().is_empty() {
                        captured_resume_ref = Some(t_id.trim().to_string());
                    }
                }
                if let Some(item) = event.get("item") {
                    if let Some(t_id) = item.get("thread_id").and_then(Value::as_str) {
                        if !t_id.trim().is_empty() {
                            captured_resume_ref = Some(t_id.trim().to_string());
                        }
                    }
                }

                let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");

                match event_type {
                    "item.created" | "item.completed" | "item.streaming_chunk" | "response.text.delta" => {
                        if let Some(item) = event.get("item") {
                            let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
                            let role = item.get("role").and_then(Value::as_str).unwrap_or("");

                            // Direct agent_message or role == assistant text
                            if item_type == "agent_message" || role == "assistant" {
                                if let Some(txt) = item.get("text").and_then(Value::as_str) {
                                    if !txt.is_empty() && !total_assistant_text.contains(txt) {
                                        emit_stream_words(app, request_id, session_id, txt, &mut total_assistant_text, cancel_flag).await;
                                    }
                                } else if let Some(content_array) = item.get("content").and_then(Value::as_array) {
                                    for part in content_array {
                                        if let Some(txt) = part.get("text").and_then(Value::as_str) {
                                            if !txt.is_empty() && !total_assistant_text.contains(txt) {
                                                emit_stream_words(app, request_id, session_id, txt, &mut total_assistant_text, cancel_flag).await;
                                            }
                                        }
                                    }
                                }
                            } else if item_type == "tool_call" || item_type == "command_execution" {
                                let tool_name = item.get("name").or_else(|| item.get("command")).and_then(Value::as_str).unwrap_or("tool").to_string();
                                let tool_id = item.get("id").and_then(Value::as_str).unwrap_or("tool_1").to_string();
                                let args = item.get("arguments").or_else(|| item.get("args")).cloned().unwrap_or(json!({}));

                                let _ = app.emit(
                                    "chat-tool-call",
                                    ToolCallEvent {
                                        request_id: request_id.to_string(),
                                        session_id: session_id.to_string(),
                                        tool_name: tool_name.clone(),
                                        tool_id: tool_id.clone(),
                                        args: args.clone(),
                                        result: None,
                                        status: "executing".into(),
                                    },
                                );
                            }
                        } else if let Some(delta) = event.get("delta") {
                            let delta_str = if let Some(s) = delta.as_str() {
                                Some(s)
                            } else {
                                delta.get("text").and_then(Value::as_str)
                            };
                            if let Some(d) = delta_str {
                                if !d.is_empty() {
                                    emit_stream_words(app, request_id, session_id, d, &mut total_assistant_text, cancel_flag).await;
                                }
                            }
                        }
                    }

                    "error" | "turn.failed" => {
                        let err_msg = event.get("message").and_then(Value::as_str)
                            .or_else(|| event.get("error").and_then(|e| e.get("message")).and_then(Value::as_str))
                            .unwrap_or("Codex execution failed");
                        log::warn!("[CLI Chat] Codex event error: {}", err_msg);
                        let _ = app.emit(
                            "chat-error",
                            ErrorEvent {
                                request_id: request_id.to_string(),
                                session_id: session_id.to_string(),
                                error: format!("Codex error: {}", err_msg),
                            },
                        );
                    }

                    _ => {}
                }
            }
        }

        let _ = child.wait();
    } else if is_antigravity {
        let agy_bin = find_cli_binary("agy")
            .or_else(|| find_cli_binary("antigravity"))
            .ok_or_else(|| {
                "Antigravity CLI ('agy') not found in PATH or standard directories. Please install it to use Antigravity CLI Chat.".to_string()
            })?;

        let _ = write_antigravity_workspace_config(&workspace_dir, &profile_id, &system_prompt);
        ensure_businesskit_mcp_registered_for_agy(&agy_bin, &current_exe_str, &profile_id);

        let mut cmd = Command::new(&agy_bin);
        cmd.current_dir(&workspace_dir);
        let args = build_agy_args(
            model,
            reasoning_effort,
            captured_resume_ref.as_deref(),
            &contextual_message,
        );
        cmd.args(&args);

        enrich_child_env(&mut cmd);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        log::info!("[CLI Chat] Spawning Antigravity CLI: {:?} (resume: {:?})", agy_bin, captured_resume_ref);

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn agy CLI: {}", e))?;
        let stdout = child.stdout.take().ok_or_else(|| "Failed to capture agy stdout".to_string())?;

        let reader = std::io::BufReader::new(stdout);

        for line_res in reader.lines() {
            if cancel_flag.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = app.emit(
                    "chat-error",
                    ErrorEvent {
                        request_id: request_id.to_string(),
                        session_id: session_id.to_string(),
                        error: "Chat cancelled".into(),
                    },
                );
                return Ok(());
            }

            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(event) = serde_json::from_str::<Value>(trimmed) {
                // Capture conversation ID from agy events
                if let Some(c_id) = event.get("conversation_id").and_then(Value::as_str) {
                    if !c_id.trim().is_empty() {
                        captured_resume_ref = Some(c_id.trim().to_string());
                    }
                }

                let event_type = event.get("event").and_then(Value::as_str).unwrap_or("");

                match event_type {
                    "step_update" => {
                        if let Some(update) = event.get("step_update") {
                            if let Some(c_id) = update.get("conversation_id").and_then(Value::as_str) {
                                if !c_id.trim().is_empty() {
                                    captured_resume_ref = Some(c_id.trim().to_string());
                                }
                            }
                            if let Some(delta) = update.get("text_delta").and_then(Value::as_str) {
                                emit_stream_words(app, request_id, session_id, delta, &mut total_assistant_text, cancel_flag).await;
                            }

                            let step_type = update.get("step_type").and_then(Value::as_str).unwrap_or("");
                            let tool_name_opt = update.get("tool_name")
                                .or_else(|| update.get("tool"))
                                .and_then(Value::as_str);

                            if step_type == "tool_call" || step_type == "call_mcp_tool" || tool_name_opt.is_some() || step_type.contains("tool") {
                                let tool_name = tool_name_opt.unwrap_or("mcp_tool").to_string();
                                let tool_id = update.get("tool_id")
                                    .or_else(|| update.get("call_id"))
                                    .or_else(|| update.get("id"))
                                    .and_then(Value::as_str)
                                    .unwrap_or("tool_1")
                                    .to_string();
                                let args = update.get("args")
                                    .or_else(|| update.get("arguments"))
                                    .cloned()
                                    .unwrap_or(json!({}));
                                let state = update.get("state").and_then(Value::as_str).unwrap_or("executing");
                                let has_result = update.get("result").is_some() || update.get("output").is_some();
                                let is_done = state == "DONE" || state == "SUCCESS" || state == "FINISHED" || has_result;
                                let result_val = update.get("result").or_else(|| update.get("output")).cloned();

                                let _ = app.emit(
                                    "chat-tool-call",
                                    ToolCallEvent {
                                        request_id: request_id.to_string(),
                                        session_id: session_id.to_string(),
                                        tool_name: tool_name.clone(),
                                        tool_id: tool_id.clone(),
                                        args: args.clone(),
                                        result: result_val.clone(),
                                        status: if is_done { "completed".into() } else { "executing".into() },
                                    },
                                );

                                if is_done {
                                    all_tool_results.push(json!({
                                        "id": tool_id,
                                        "tool": tool_name,
                                        "result": result_val.unwrap_or(Value::Null)
                                    }));
                                }
                            }
                        }
                    }
                    "result" => {
                        if let Some(res) = event.get("result") {
                            if let Some(c_id) = res.get("conversation_id").and_then(Value::as_str) {
                                if !c_id.trim().is_empty() {
                                    captured_resume_ref = Some(c_id.trim().to_string());
                                }
                            }
                            let status = res.get("status").and_then(Value::as_str).unwrap_or("");
                            if status == "ERROR" || res.get("error").is_some() {
                                let err_text = res.get("error").and_then(Value::as_str).unwrap_or("Antigravity execution failed");
                                log::warn!("[CLI Chat] Antigravity result error: {}", err_text);
                                let _ = app.emit(
                                    "chat-error",
                                    ErrorEvent {
                                        request_id: request_id.to_string(),
                                        session_id: session_id.to_string(),
                                        error: format!("Antigravity error: {}", err_text),
                                    },
                                );
                                return Err(format!("Antigravity error: {}", err_text));
                            }
                            if let Some(resp) = res.get("response").and_then(Value::as_str) {
                                if total_assistant_text.is_empty() {
                                    emit_stream_words(app, request_id, session_id, resp, &mut total_assistant_text, cancel_flag).await;
                                }
                            }
                        }
                    }
                    _ => {}
                }
            } else {
                // Fallback for non-JSON lines
                if trimmed.starts_with("error:") || trimmed.starts_with("fatal:") {
                    log::warn!("[CLI Chat] Antigravity raw stderr: {}", trimmed);
                } else {
                    emit_stream_words(app, request_id, session_id, &format!("{}\n", trimmed), &mut total_assistant_text, cancel_flag).await;
                }
            }
        }

        let _ = child.wait();
    } else {
        return Err(format!("Unsupported CLI provider: {}", provider));
    }

    // Check if total_assistant_text is empty
    if total_assistant_text.trim().is_empty() && all_tool_results.is_empty() {
        let err_msg = "Antigravity/CLI command completed without generating a response. Please verify model availability or run 'agy' in terminal.";
        let _ = app.emit(
            "chat-error",
            ErrorEvent {
                request_id: request_id.to_string(),
                session_id: session_id.to_string(),
                error: err_msg.to_string(),
            },
        );
        return Err(err_msg.to_string());
    }

    // Persist assistant message to UserDB
    let assistant_msg_id = format!("msg_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let tool_calls_json = if all_tool_results.is_empty() {
        None
    } else {
        Some(json!(all_tool_results).to_string())
    };

    conn.execute(
        "INSERT INTO agent_chat_messages (id, session_id, role, content, tool_calls_json, created_at) \
         VALUES (?1, ?2, 'assistant', ?3, ?4, strftime('%s','now'))",
        crate::turso_params![
            assistant_msg_id,
            session_id.to_string(),
            total_assistant_text.clone(),
            tool_calls_json.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Token & Cost accounting for CLI runs (tracked at model rates for accurate business analytics)
    let prompt_tokens = estimate_tokens(&system_prompt) + estimate_tokens(message);
    let completion_tokens = estimate_tokens(&total_assistant_text)
        + if let Some(ref tj) = tool_calls_json { estimate_tokens(tj) } else { 0 };
    let total_turn_tokens = prompt_tokens + completion_tokens;
    let eff_model = model.unwrap_or(provider);
    let turn_cost = estimate_cost(eff_model, provider, prompt_tokens, completion_tokens);
    let preview = if total_assistant_text.chars().count() > 120 {
        format!("{}...", total_assistant_text.chars().take(117).collect::<String>())
    } else {
        total_assistant_text.clone()
    };
    let tool_count = all_tool_results.len() as i64;

    let _ = conn.execute(
        "UPDATE agent_chat_sessions SET \
            model = COALESCE(?2, model), \
            provider = COALESCE(?3, provider), \
            mode = 'cli', \
            cli_resume_ref = COALESCE(?4, cli_resume_ref), \
            prompt_tokens = prompt_tokens + ?5, \
            completion_tokens = completion_tokens + ?6, \
            total_tokens = total_tokens + ?7, \
            total_cost = total_cost + ?8, \
            message_count = message_count + 2, \
            tool_call_count = tool_call_count + ?9, \
            last_message_preview = ?10, \
            updated_at = strftime('%s','now') \
         WHERE id = ?1",
        crate::turso_params![
            session_id.to_string(),
            eff_model.to_string(),
            provider.to_string(),
            captured_resume_ref,
            prompt_tokens,
            completion_tokens,
            total_turn_tokens,
            turn_cost,
            tool_count,
            preview,
        ],
    ).await;

    let _ = aggregate_agent_analytics(&conn, &profile_id).await;

    // Emit chat-done event
    let _ = app.emit(
        "chat-done",
        DoneEvent {
            request_id: request_id.to_string(),
            session_id: session_id.to_string(),
            content: total_assistant_text,
            tool_results: all_tool_results,
        },
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_claude_model_name() {
        assert_eq!(normalize_claude_model_name("default"), None);
        assert_eq!(normalize_claude_model_name("claude-5-1-fable"), Some("fable".to_string()));
        assert_eq!(normalize_claude_model_name("fable"), Some("fable".to_string()));
        assert_eq!(normalize_claude_model_name("claude-5-sonnet"), Some("sonnet".to_string()));
        assert_eq!(normalize_claude_model_name("sonnet"), Some("sonnet".to_string()));
        assert_eq!(normalize_claude_model_name("sonnet-4.6"), Some("sonnet".to_string()));
        assert_eq!(normalize_claude_model_name("sonnet-4.6-1m"), Some("sonnet".to_string()));
        assert_eq!(normalize_claude_model_name("claude-opus-4-8"), Some("opus".to_string()));
        assert_eq!(normalize_claude_model_name("haiku"), Some("haiku".to_string()));
    }

    #[test]
    fn test_normalize_codex_model_name() {
        assert_eq!(normalize_codex_model_name("default"), "gpt-5.6-luna");
        assert_eq!(normalize_codex_model_name("gpt-5.6-terra"), "gpt-5.6-terra");
        assert_eq!(normalize_codex_model_name("gpt-5.6-luna"), "gpt-5.6-luna");
        assert_eq!(normalize_codex_model_name("gpt-5.5"), "gpt-5.5");
        assert_eq!(normalize_codex_model_name("other"), "gpt-5.6-luna");
    }

    #[test]
    fn test_normalize_agy_model_name() {
        assert_eq!(normalize_agy_model_name("gemini-3.7-flash", Some("low")), "gemini-3.7-flash-low");
        assert_eq!(normalize_agy_model_name("gemini-3.7-flash", Some("high")), "gemini-3.7-flash-high");
        assert_eq!(normalize_agy_model_name("gemini-3.8-flash", Some("medium")), "gemini-3.8-flash-medium");
        assert_eq!(normalize_agy_model_name("gemini-3.1-pro", Some("medium")), "gemini-3.1-pro-low");
        assert_eq!(normalize_agy_model_name("gemini-3.1-pro", Some("high")), "gemini-3.1-pro-high");
        assert_eq!(normalize_agy_model_name("claude-sonnet-4-6", Some("low")), "claude-sonnet-4-6");
        assert_eq!(normalize_agy_model_name("claude-opus-4-6-thinking", Some("high")), "claude-opus-4-6-thinking");
        assert_eq!(normalize_agy_model_name("gpt-oss-120b", Some("low")), "gpt-oss-120b-medium");
    }

    #[test]
    fn test_extract_cli_model_name() {
        assert_eq!(extract_cli_model_name(Some("cli:claude:claude-5-sonnet")), Some("claude-5-sonnet"));
        assert_eq!(extract_cli_model_name(Some("cli:codex:gpt-5.6-terra")), Some("gpt-5.6-terra"));
        assert_eq!(extract_cli_model_name(Some("cli:antigravity:gemini-3.7-flash")), Some("gemini-3.7-flash"));
        assert_eq!(extract_cli_model_name(Some("cli:claude")), None);
        assert_eq!(extract_cli_model_name(None), None);
    }

    #[test]
    fn test_build_codex_args_fresh_turn() {
        let ws = PathBuf::from("/tmp/ws");
        let args = build_codex_args(
            &ws,
            "/usr/bin/businesskit",
            "prof_123",
            Some("cli:codex:gpt-5.6-terra"),
            Some("medium"),
            None,
            "Hello world",
        );

        assert_eq!(args[0], "exec");
        assert_ne!(args[1], "resume", "Fresh turn should NOT have resume subcommand");
        assert_eq!(args[1], "--json");
        assert!(args.contains(&"--skip-git-repo-check".to_string()));
        assert!(args.contains(&"--dangerously-bypass-approvals-and-sandbox".to_string()));
        assert!(!args.contains(&"--ephemeral".to_string()), "Codex should not have --ephemeral");
        assert_eq!(args.last().unwrap(), "Hello world");
    }

    #[test]
    fn test_build_codex_args_resume_turn() {
        let ws = PathBuf::from("/tmp/ws");
        let thread_id = "01a0bb22-699f-7690-94c2-f3bfe53f4961";
        let args = build_codex_args(
            &ws,
            "/usr/bin/businesskit",
            "prof_123",
            Some("cli:codex:gpt-5.6-terra"),
            Some("high"),
            Some(thread_id),
            "What was my secret code?",
        );

        assert_eq!(args[0], "exec");
        assert_eq!(args[1], "resume", "Resume turn MUST have resume subcommand");
        assert_eq!(args[2], "--json");
        // thread_id must be present right before the prompt message
        let len = args.len();
        assert_eq!(args[len - 2], thread_id, "Thread ID must be second-to-last arg");
        assert_eq!(args[len - 1], "What was my secret code?", "Prompt must be last arg");
    }

    #[test]
    fn test_build_claude_args_fresh_and_resume() {
        let mcp_cfg = PathBuf::from("/tmp/claude_mcp.json");
        
        // Fresh turn (no resume ref)
        let fresh_args = build_claude_args(
            &mcp_cfg,
            Some("cli:claude:claude-5-sonnet"),
            Some("high"),
            "System instructions",
            None,
            "Hello fresh",
        );
        assert!(!fresh_args.contains(&"--resume".to_string()));
        assert!(fresh_args.contains(&"-p".to_string()));
        assert!(fresh_args.contains(&"--model".to_string()));
        assert!(fresh_args.contains(&"sonnet".to_string()));

        // Resume turn
        let resume_args = build_claude_args(
            &mcp_cfg,
            Some("cli:claude:claude-5-sonnet"),
            None,
            "System instructions",
            Some("d2301b40-939e-44bb-b5bb-3f3c496da1b1"),
            "Hello resumed",
        );
        let resume_idx = resume_args.iter().position(|r| r == "--resume").expect("Must contain --resume");
        assert_eq!(resume_args[resume_idx + 1], "d2301b40-939e-44bb-b5bb-3f3c496da1b1");
    }

    #[test]
    fn test_build_agy_args_fresh_and_resume() {
        // Fresh turn
        let fresh_args = build_agy_args(
            Some("cli:antigravity:gemini-3.7-flash"),
            Some("low"),
            None,
            "Hello fresh agy",
        );
        assert!(!fresh_args.contains(&"--conversation".to_string()));
        assert!(fresh_args.contains(&"-p".to_string()));
        assert!(fresh_args.contains(&"--model".to_string()));
        assert!(fresh_args.contains(&"gemini-3.7-flash-low".to_string()));

        // Resume turn
        let resume_args = build_agy_args(
            Some("cli:antigravity:gemini-3.7-flash"),
            None,
            Some("3815df83-a2a0-4d8f-a66d-b7f312a8643e"),
            "Hello resumed agy",
        );
        let conv_idx = resume_args.iter().position(|r| r == "--conversation").expect("Must contain --conversation");
        assert_eq!(resume_args[conv_idx + 1], "3815df83-a2a0-4d8f-a66d-b7f312a8643e");
    }

    #[test]
    fn test_enrich_child_env_strips_anthropic_api_keys() {
        // Simulate parent environment having ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN set
        std::env::set_var("ANTHROPIC_API_KEY", "sk-ant-test-key-should-be-stripped");
        std::env::set_var("ANTHROPIC_AUTH_TOKEN", "ant-auth-token-should-be-stripped");

        let mut cmd = Command::new("env");
        enrich_child_env(&mut cmd);

        // Run the command to inspect the actual environment received by the spawned child process
        let output = cmd.output().expect("Failed to execute env command");
        let stdout = String::from_utf8_lossy(&output.stdout);

        assert!(
            !stdout.contains("ANTHROPIC_API_KEY"),
            "ANTHROPIC_API_KEY must not be present in spawned child process environment"
        );
        assert!(
            !stdout.contains("ANTHROPIC_AUTH_TOKEN"),
            "ANTHROPIC_AUTH_TOKEN must not be present in spawned child process environment"
        );
    }
}

