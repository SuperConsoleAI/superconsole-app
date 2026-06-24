cat << 'INNER_EOF' > /tmp/replace_install_plugin.rs
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
            // Note: In an ideal world, we call install_skill_from_github_url. 
            // For now, we manually fetch and scaffold if github_url points to a raw markdown file.
            // (Assuming github_url from the frontend is already the direct raw markdown or we convert it).
            let raw_url = if github_url.contains("raw.githubusercontent.com") {
                github_url.to_string()
            } else {
                crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
            };
            
            // To be safe, if raw_url is a directory base, we might need to append SKILL.md.
            // For simplicity, let's just fetch exactly what is given.
            let fetch_url = if raw_url.ends_with(".md") { raw_url } else { format!("{}/SKILL.md", raw_url.trim_end_matches('/')) };

            if let Ok(resp) = client.get(&fetch_url).send().await {
                if let Ok(content) = resp.text().await {
                    let skill_dir = format!("{}/.superconsole/skills/{}", ws_path, slug);
                    let skill_file = format!("{}/SKILL.md", skill_dir);
                    if !Path::new(&skill_file).exists() {
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
            if !Path::new(&dest).exists() {
                // If content is provided in JSON, use it directly!
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

    // ── 3. Record installation ───────────────────────────────────────────────
    db.record_workspace_plugin(workspace_id, &entry.id, &entry.version)?;

    Ok(())
}
INNER_EOF
