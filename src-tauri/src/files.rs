use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
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
        return Err("File too large to edit in Dockyard".into());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Cannot read file: {}", e))
}

pub fn write_file(workspace: &str, rel: &str, content: &str) -> Result<(), String> {
    let path = resolve(workspace, rel)?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
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
