use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::db::Db;

const RULES_DIR: &str = ".superconsole/rules";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleFile {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub always_apply: bool,
    pub author: Option<String>,
}

#[derive(Default)]
struct RuleFrontmatter {
    name: String,
    description: String,
    always_apply: bool,
    author: Option<String>,
}

fn parse_frontmatter(content: &str) -> RuleFrontmatter {
    let mut fm = RuleFrontmatter {
        name: String::new(),
        description: String::new(),
        always_apply: true,
        author: None,
    };
    if content.starts_with("---\n") {
        if let Some(end) = content[4..].find("\n---") {
            let block = &content[4..4 + end];
            for line in block.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let key = k.trim().to_lowercase();
                    let val = v.trim();
                    match key.as_str() {
                        "name" => fm.name = val.trim_matches('"').trim_matches('\'').to_string(),
                        "description" => {
                            fm.description = val.trim_matches('"').trim_matches('\'').to_string()
                        }
                        "always_apply" => fm.always_apply = val.to_lowercase() == "true",
                        "author" => {
                            fm.author = Some(val.trim_matches('"').trim_matches('\'').to_string())
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    fm
}

fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in name.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let s = out.trim_matches('-').to_string();
    if s.is_empty() {
        "rule".into()
    } else {
        s.chars().take(60).collect()
    }
}

fn rules_dir(ws_path: &str) -> PathBuf {
    Path::new(ws_path).join(RULES_DIR)
}

pub fn list_rules(ws_path: &str) -> Vec<RuleFile> {
    let mut out = Vec::new();
    let dir = rules_dir(ws_path);
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("mdc") {
                continue;
            }
            if let Some(slug) = path.file_stem().and_then(|s| s.to_str()) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    let fm = parse_frontmatter(&content);
                    out.push(RuleFile {
                        slug: slug.to_string(),
                        name: if fm.name.is_empty() {
                            slug.to_string()
                        } else {
                            fm.name
                        },
                        description: fm.description,
                        content,
                        always_apply: fm.always_apply,
                        author: fm.author,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    out
}

#[tauri::command]
pub fn tauri_list_rules(app: AppHandle, workspace_id: i64) -> Result<Vec<RuleFile>, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    Ok(list_rules(&ws.path))
}

pub fn read_rule(ws_path: &str, slug: &str) -> Result<String, String> {
    let path = rules_dir(ws_path).join(format!("{}.mdc", slug));
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tauri_read_rule(app: AppHandle, workspace_id: i64, slug: String) -> Result<String, String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    read_rule(&ws.path, &slug)
}

pub fn write_rule(ws_path: &str, slug: &str, content: &str) -> Result<(), String> {
    let slug = slugify(slug);
    let dir = rules_dir(ws_path);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.mdc", slug));
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tauri_write_rule(
    app: AppHandle,
    workspace_id: i64,
    slug: String,
    content: String,
) -> Result<(), String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    write_rule(&ws.path, &slug, &content)
}

pub fn delete_rule(ws_path: &str, slug: &str) -> Result<(), String> {
    let path = rules_dir(ws_path).join(format!("{}.mdc", slug));
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn tauri_delete_rule(app: AppHandle, workspace_id: i64, slug: String) -> Result<(), String> {
    let ws = app.state::<Db>().get_workspace(workspace_id)?;
    delete_rule(&ws.path, &slug)
}
