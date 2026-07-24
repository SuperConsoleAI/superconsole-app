use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvEntry {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub is_secret: bool,
}

fn key_is_secret(key: &str) -> bool {
    let upper = key.to_uppercase();
    ["PASSWORD", "SECRET", "KEY", "TOKEN", "API"]
        .iter()
        .any(|p| upper.contains(p))
}

/// Read the workspace `.env` into ordered key/value entries, preserving inline
/// comments and flagging secret-looking keys. Comment-only and blank lines are
/// skipped. Returns an empty list if the file doesn't exist.
pub fn read_env_file(workspace: &str) -> Result<Vec<EnvEntry>, String> {
    let path = resolve(workspace, ".env")?;
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Ok(vec![]);
    };
    let mut entries = Vec::new();
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((key, rest)) = line.split_once('=') else {
            continue;
        };
        // Split off an inline comment that follows an unquoted value.
        let (value_part, comment) = match rest.find(" #") {
            Some(idx) => (rest[..idx].trim(), Some(rest[idx + 2..].trim().to_string())),
            None => (rest.trim(), None),
        };
        let value = value_part.trim_matches('"').trim_matches('\'').to_string();
        let key = key.trim().to_string();
        let is_secret = key_is_secret(&key);
        entries.push(EnvEntry {
            key,
            value,
            comment,
            is_secret,
        });
    }
    Ok(entries)
}

fn serialize_env(entries: &[EnvEntry]) -> String {
    let mut out = String::new();
    for e in entries {
        let needs_quotes = e.value.contains(' ') || e.value.contains('#');
        let value = if needs_quotes {
            format!("\"{}\"", e.value)
        } else {
            e.value.clone()
        };
        out.push_str(&e.key);
        out.push('=');
        out.push_str(&value);
        if let Some(c) = &e.comment {
            if !c.is_empty() {
                out.push_str(" # ");
                out.push_str(c);
            }
        }
        out.push('\n');
    }
    out
}

pub fn write_env_file(workspace: &str, entries: &[EnvEntry]) -> Result<(), String> {
    let path = resolve(workspace, ".env")?;
    std::fs::write(&path, serialize_env(entries)).map_err(|e| e.to_string())
}

pub fn set_env_entry(workspace: &str, key: &str, value: &str) -> Result<(), String> {
    let mut entries = read_env_file(workspace)?;
    if let Some(existing) = entries.iter_mut().find(|e| e.key == key) {
        existing.value = value.to_string();
    } else {
        entries.push(EnvEntry {
            key: key.to_string(),
            value: value.to_string(),
            comment: None,
            is_secret: key_is_secret(key),
        });
    }
    write_env_file(workspace, &entries)
}

pub fn delete_env_entry(workspace: &str, key: &str) -> Result<(), String> {
    let mut entries = read_env_file(workspace)?;
    entries.retain(|e| e.key != key);
    write_env_file(workspace, &entries)
}

fn resolve(workspace: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("Invalid path".into());
    }
    Ok(Path::new(workspace).join(rel_path))
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    ".next",
    "__pycache__",
];

pub fn list_dir(workspace: &str, rel: &str) -> Result<Vec<FileEntry>, String> {
    let dir = resolve(workspace, rel)?;
    let mut entries: Vec<FileEntry> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().ok()?.is_dir();
            if is_dir && SKIP_DIRS.contains(&name.as_str()) {
                return None;
            }
            let rel_path = if rel.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", rel, name)
            };
            Some(FileEntry {
                name,
                rel_path,
                is_dir,
            })
        })
        .collect();
    entries.sort_by_key(|e| (!e.is_dir, e.name.to_lowercase()));
    Ok(entries)
}

pub fn read_file(workspace: &str, rel: &str) -> Result<String, String> {
    let path = resolve(workspace, rel)?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 2_000_000 {
        return Err("File too large to edit in SuperConsole".into());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Cannot read file: {}", e))
}

pub fn write_file(workspace: &str, rel: &str, content: &str) -> Result<(), String> {
    let path = resolve(workspace, rel)?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Read an arbitrary file picked via the OS dialog (absolute path, outside the
/// workspace sandbox) for chat attachments. Text only, size-capped.
pub fn read_attachment(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > 1_000_000 {
        return Err("File too large to attach (max 1 MB)".into());
    }
    std::fs::read_to_string(p).map_err(|_| "Cannot read this file as text".to_string())
}

pub fn create_entry(workspace: &str, rel: &str, is_dir: bool) -> Result<(), String> {
    let path = resolve(workspace, rel)?;
    if path.exists() {
        return Err("Already exists".into());
    }
    if is_dir {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())
    } else {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, "").map_err(|e| e.to_string())
    }
}

pub fn delete_entry(workspace: &str, rel: &str) -> Result<(), String> {
    if rel.is_empty() {
        return Err("Cannot delete workspace root".into());
    }
    let path = resolve(workspace, rel)?;
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────

/// Auto-generates the `.superconsole/` default structure + `HEARTBEAT.md` for a
/// new or imported workspace. Never overwrites existing files — safe to call on
/// every workspace creation. Returns the list of relative paths that were created.
pub fn scaffold_superconsole_dir(workspace_path: &str) -> Result<Vec<String>, String> {
    let base = format!("{}/.superconsole", workspace_path);
    let mut created = vec![];

    // Create all required folders.
    for dir in &[
        "memory",
        "context",
        "rules",
        "hooks",
        "agents/router",
        "skills",
        "commands",
        "sessions",
    ] {
        std::fs::create_dir_all(format!("{}/{}", base, dir)).map_err(|e| e.to_string())?;
    }

    // Write defaults — never overwrite existing files.
    let files: &[(&str, &str)] = &[
        ("HEARTBEAT.md", HEARTBEAT),
        (".superconsole/memory/preferences.md", MEMORY_PREFERENCES),
        (".superconsole/memory/decisions.md", MEMORY_DECISIONS),
        (".superconsole/memory/facts.md", MEMORY_FACTS),
        (".superconsole/memory/patterns.md", MEMORY_PATTERNS),
        (".superconsole/memory/recent.md", MEMORY_RECENT),
        (".superconsole/context/about.md", CONTEXT_ABOUT),
        (".superconsole/rules/minimal-code.mdc", RULE_MINIMAL_CODE),
        (
            ".superconsole/rules/no-destructive-ops.mdc",
            RULE_NO_DESTRUCTIVE,
        ),
        (".superconsole/hooks/session-end.sh", HOOK_SESSION_END),
        (".superconsole/hooks/before-prompt.sh", HOOK_BEFORE_PROMPT),
        (".superconsole/agents/router/agent.md", AGENT_ROUTER),
    ];

    for (rel_path, content) in files {
        let full_path = format!("{}/{}", workspace_path, rel_path);
        if !std::path::Path::new(&full_path).exists() {
            if let Some(parent) = std::path::Path::new(&full_path).parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(&full_path, content).map_err(|e| e.to_string())?;
            created.push(rel_path.to_string());
        }
    }

    // Make hooks executable (unix only).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for hook in &["session-end.sh", "before-prompt.sh"] {
            let path = format!("{}/.superconsole/hooks/{}", workspace_path, hook);
            if std::path::Path::new(&path).exists() {
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).ok();
            }
        }
    }

    Ok(created)
}

// ─── Template constants ────────────────────────────────────────────────────────

const HEARTBEAT: &str = r#"# Project Heartbeat

Last updated: (auto-updated by hooks)
Last session: none
Status: ready

## Recent
(auto-updated — last 5 actions appear here)
"#;

const MEMORY_PREFERENCES: &str = r#"# Preferences

How this project likes things done.
Agents read this to match your style.

<!-- Add entries when you establish preferences: -->
<!-- ## [DATE] Preference -->
<!-- Description. -->
<!-- Tags: #category -->
"#;

const MEMORY_DECISIONS: &str = r#"# Decisions

Key decisions made and why.
Prevents relitigating the same questions.

<!-- ## [DATE] Decision -->
<!-- What was decided and why. -->
"#;

const MEMORY_FACTS: &str = r#"# Key Facts

Important facts agents should know about this project.

<!-- ## [DATE] Fact -->
<!-- The fact. -->
"#;

const MEMORY_PATTERNS: &str = r#"# Patterns

What works in this project. What doesn't.
Auto-updated by agents after successful runs.

<!-- ## [DATE] Pattern: name -->
<!-- What worked and why. -->
<!-- Tags: #category -->
"#;

const MEMORY_RECENT: &str = r#"# Recent Actions

Rolling log of last 20 significant actions.
Auto-updated by session-end hook.
"#;

const CONTEXT_ABOUT: &str = r#"# About This Project

Fill this in once. Agents read it every session.

Project name:
Owner / client:
Purpose:
Tech stack:
Key constraints:
Links:
"#;

const RULE_MINIMAL_CODE: &str = r#"---
name: Minimal Code
description: Write the least code that works. Stdlib over custom. One line over fifty.
always_apply: true
---

Stop at the first rung that holds:

1. Does this need to exist? Speculative need → skip. (YAGNI)
2. Already in this codebase? → reuse the helper/pattern
3. Standard library does it? → use it
4. Native platform feature? → use it (e.g. <input type="date"> not a picker lib)
5. Already-installed dependency solves it? → use it, don't add a new one
6. Can it be one line? → one line
7. Only then: the minimum code that works

Never simplify away: validation, error handling, security, accessibility.
Name the lazier alternative even if you proceed with more code.
"#;

const RULE_NO_DESTRUCTIVE: &str = r#"---
name: No Destructive Operations
description: Never delete, drop, or truncate without explicit confirmation
always_apply: true
---

Never perform:
- DELETE, DROP, TRUNCATE SQL operations
- rm -rf or file deletion without confirmation
- Overwriting files without backing up
- Publishing or sending without inbox approval

Always:
- Use soft deletes (deleted_at timestamp)
- Confirm with user before irreversible actions
- Send output to inbox for approval before publishing
- Archive instead of delete
"#;

const HOOK_SESSION_END: &str = r#"#!/bin/bash
# SuperConsole session-end hook
# Runs automatically after every CLI session
# Updates HEARTBEAT + memory — the learning loop

WORKSPACE="$SUPERCONSOLE_WORKSPACE"
DATE=$(date '+%Y-%m-%d %H:%M')
CLI="$SUPERCONSOLE_CLI"

# Update HEARTBEAT.md
HEARTBEAT="$WORKSPACE/HEARTBEAT.md"
if [ -f "$HEARTBEAT" ]; then
    sed -i.bak "s/Last updated:.*/Last updated: $DATE/" "$HEARTBEAT"
    sed -i.bak "s/Last session:.*/Last session: $CLI — $DATE/" "$HEARTBEAT"
    rm -f "$HEARTBEAT.bak"
fi

# Append to recent actions (keep last 20)
RECENT="$WORKSPACE/.superconsole/memory/recent.md"
if [ -f "$RECENT" ]; then
    printf "\n## [%s] %s session\n" "$DATE" "$CLI" >> "$RECENT"

    # Trim to last 20 entries
    python3 -c "
import re
content = open('$RECENT').read()
parts = re.split(r'(?=^## \[)', content, flags=re.MULTILINE)
header = '' if parts[0].startswith('## [') else parts.pop(0)
entries = [p for p in parts if p.startswith('## [')]
open('$RECENT', 'w').write(header + ''.join(entries[-20:]))
" 2>/dev/null || true
fi
"#;

const HOOK_BEFORE_PROMPT: &str = r#"#!/bin/bash
# SuperConsole before-prompt hook
# Output appended to system prompt before every LLM call
# Keep SHORT — every line costs tokens

WORKSPACE="$SUPERCONSOLE_WORKSPACE"

# Date/time context
echo "Date: $(date '+%Y-%m-%d %H:%M %Z')"

# Git branch
BRANCH=$(git -C "$WORKSPACE" branch --show-current 2>/dev/null)
[ -n "$BRANCH" ] && echo "Branch: $BRANCH"

# Project heartbeat (first 4 lines only)
[ -f "$WORKSPACE/HEARTBEAT.md" ] && head -4 "$WORKSPACE/HEARTBEAT.md"
"#;

const AGENT_ROUTER: &str = r#"---
name: router
description: Routes tasks to the right agent or skill based on memory
connectors: []
---

You are the task router for this project.

When given a task:
1. Read /memory:patterns — what worked for similar tasks before?
2. Read /memory:recent — what was done last?
3. Check available agents in .superconsole/agents/
4. Check available skills in .superconsole/skills/
5. Route to the best approach:
   - Specialized agent exists → /agent:<name>
   - Skill covers it → use /skill:<name>
   - Simple command → /command:<name>
   - Otherwise → handle directly, minimal code

Rules:
- Check memory FIRST — don't repeat what failed
- Write successful approach to /memory:patterns after completion
- One action at a time — don't over-plan
- If uncertain → send to inbox for approval, don't guess
- Follow rules in .superconsole/rules/ always

After completing any task successfully, call memory_write to record what worked in patterns category. Keep it to 2 sentences max.
"#;
