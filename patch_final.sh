cat << 'INNER_EOF' > /tmp/do_install_plugin.rs
async fn do_install_plugin(
    app: &AppHandle,
    workspace_id: i64,
    ws_path: &str,
    entry: &PluginCacheEntry,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let db = app.state::<Db>();

    // ── 1. Install skills ────────────────────────────────────────────────────
    let skills: Vec<serde_json::Value> = serde_json::from_str(&entry.skill_ids).unwrap_or_default();
    for skill in skills {
        if let (Some(slug), Some(github_url)) = (skill.get("id").and_then(|v| v.as_str()), skill.get("github_url").and_then(|v| v.as_str())) {
            let raw_url = if github_url.contains("raw.githubusercontent.com") {
                github_url.to_string()
            } else {
                crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
            };
            
            let fetch_url = if raw_url.ends_with(".md") { raw_url } else { format!("{}/SKILL.md", raw_url.trim_end_matches('/')) };

            if let Ok(resp) = client.get(&fetch_url).send().await {
                if let Ok(content) = resp.text().await {
                    let skill_dir = format!("{}/.superconsole/skills/{}", ws_path, slug);
                    let skill_file = format!("{}/SKILL.md", skill_dir);
                    if !std::path::Path::new(&skill_file).exists() {
                        let _ = std::fs::create_dir_all(&skill_dir);
                        let _ = std::fs::write(&skill_file, &content);
                        let (desc, tags) = crate::plugins::parse_skill_frontmatter(&content);
                        let _ = db.upsert_skill_index(
                            workspace_id,
                            slug,
                            &desc,
                            &tags,
                            &skill_file,
                            "project",
                            false,  // auto
                            1,      // version
                            "plugin",
                            true,   // active
                        );
                    }
                }
            }
        }
    }

    // ── 2. Install commands ──────────────────────────────────────────────────
    let commands: Vec<serde_json::Value> = serde_json::from_str(&entry.command_ids).unwrap_or_default();
    for cmd in commands {
        if let Some(slug) = cmd.get("id").and_then(|v| v.as_str()) {
            let dest = format!("{}/.superconsole/commands/{}.md", ws_path, slug);
            if !std::path::Path::new(&dest).exists() {
                if let Some(content) = cmd.get("content").and_then(|v| v.as_str()) {
                    let _ = std::fs::create_dir_all(format!("{}/.superconsole/commands", ws_path));
                    let _ = std::fs::write(&dest, content);
                } else if let Some(github_url) = cmd.get("github_url").and_then(|v| v.as_str()) {
                    let raw_url = if github_url.contains("raw.githubusercontent.com") {
                        github_url.to_string()
                    } else {
                        crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
                    };
                    if let Ok(resp) = client.get(&raw_url).send().await {
                        if let Ok(content) = resp.text().await {
                            let _ = std::fs::create_dir_all(format!("{}/.superconsole/commands", ws_path));
                            let _ = std::fs::write(&dest, content);
                        }
                    }
                }
            }
        }
    }

    // ── 3. Install hooks ─────────────────────────────────────────────────────
    let hooks: Vec<serde_json::Value> = serde_json::from_str(&entry.hook_ids).unwrap_or_default();
    for hook in hooks {
        if let Some(hook_type) = hook.get("id").and_then(|v| v.as_str()) {
            if crate::hooks::read_hook(ws_path, hook_type).is_err() {
                continue;
            }
            if let Some(github_url) = hook.get("github_url").and_then(|v| v.as_str()) {
                let raw_url = if github_url.contains("raw.githubusercontent.com") {
                    github_url.to_string()
                } else {
                    crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
                };
                if let Ok(resp) = client.get(&raw_url).send().await {
                    if let Ok(content) = resp.text().await {
                        let _ = crate::hooks::write_hook(ws_path, hook_type, &content);
                    }
                }
            }
        }
    }

    // ── 4. Connectors (Handled dynamically via connector_ids) ───────────────
    let connectors: Vec<String> = serde_json::from_str(&entry.connector_ids).unwrap_or_default();
    for cid in connectors {
        let _ = db.add_workspace_connector(workspace_id, &cid);
    }

    // ── 5. MCP Tools ────────────────────────────────────────────────────────
    let mcps: Vec<serde_json::Value> = serde_json::from_str(&entry.mcp_ids).unwrap_or_default();
    for mcp in mcps {
        if let Some(mcp_id) = mcp.get("id").and_then(|v| v.as_str()) {
            let cmd = mcp.get("install_command").and_then(|v| v.as_str()).unwrap_or("npx");
            let args = mcp.get("install_args").and_then(|v| v.as_str()).unwrap_or("");
            let _ = crate::mcp_registry::add_mcp_tool(
                workspace_id,
                mcp_id,
                cmd,
                args,
                &crate::mcp_registry::get_global_mcp_config_path(),
            );
        }
    }

    // ── 6. Record installation ───────────────────────────────────────────────
    db.record_workspace_plugin(workspace_id, &entry.id, &entry.version)?;

    Ok(())
}
INNER_EOF

# Replace the block
sed -i '' -e '/async fn do_install_plugin(/,/Ok(())\n}/c\
@@REPLACE_ME@@
' src-tauri/src/plugins.rs

# Insert the file where @@REPLACE_ME@@ is
sed -i '' -e '/@@REPLACE_ME@@/r /tmp/do_install_plugin.rs' -e '/@@REPLACE_ME@@/d' src-tauri/src/plugins.rs

