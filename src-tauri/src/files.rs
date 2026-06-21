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
        entries.push(EnvEntry { key, value, comment, is_secret });
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
    if rel_path
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
    {
        return Err("Invalid path".into());
    }
    Ok(Path::new(workspace).join(rel_path))
}

const SKIP_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", ".next", "__pycache__"];

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
            Some(FileEntry { name, rel_path, is_dir })
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
