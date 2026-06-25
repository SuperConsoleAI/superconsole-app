const fs = require('fs');

let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// Replace base_path
code = code.replace(
  'let client = reqwest::Client::new();\n    let db = app.state::<Db>();',
  `let client = reqwest::Client::new();
    let db = app.state::<Db>();

    let base_path = match scope {
        "project" => format!("{}/.superconsole", ws_path),
        "org" | "account" => ws_path.to_string(),
        _ => return Err("Unknown scope".into()),
    };`
);

// SKILLS
const oldSkillLoop = `    for skill in skills {
        if let (Some(slug), Some(github_url)) = (skill.get("id").and_then(|v| v.as_str()), skill.get("github_url").and_then(|v| v.as_str())) {
            let raw_url = if github_url.contains("raw.githubusercontent.com") {
                github_url.to_string()
            } else {
                crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
            };
            
            let fetch_url = if raw_url.ends_with(".md") { raw_url } else { format!("{}/SKILL.md", raw_url.trim_end_matches('/')) };

            if let Ok(resp) = client.get(&fetch_url).send().await {
                if let Ok(content) = resp.text().await {
                    let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
                    let skill_dir = format!("{}/skills/{}", base_dir, slug);
                    let skill_file = format!("{}/SKILL.md", skill_dir);
                    if !std::path::Path::new(&skill_file).exists() {
                        let _ = std::fs::create_dir_all(&skill_dir);
                        let _ = std::fs::write(&skill_file, &content);
                        let (desc, tags) = crate::plugins::parse_skill_frontmatter(&content);
                        let _ = db.upsert_skill_index(
                            0, // Global scope uses 0 for workspace_id in project_skills currently
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
    }`;

const newSkillLoop = `    for skill in skills {
        let (slug, github_url) = if let Some(url_str) = skill.as_str() {
            let slug = url_str.split('/').last().unwrap_or("unknown").to_string();
            (slug, url_str.to_string())
        } else if let (Some(slug), Some(url_str)) = (skill.get("id").and_then(|v| v.as_str()), skill.get("github_url").and_then(|v| v.as_str())) {
            (slug.to_string(), url_str.to_string())
        } else {
            continue;
        };

        {
            let raw_url = if github_url.contains("raw.githubusercontent.com") {
                github_url.to_string()
            } else {
                crate::plugins::github_url_to_raw_base(&github_url).unwrap_or_else(|_| github_url.to_string())
            };
            
            let fetch_url = if raw_url.ends_with(".md") { raw_url } else { format!("{}/SKILL.md", raw_url.trim_end_matches('/')) };

            if let Ok(resp) = client.get(&fetch_url).send().await {
                if let Ok(content) = resp.text().await {
                    let skill_dir = format!("{}/skills/{}", base_path, slug);
                    let skill_file = format!("{}/SKILL.md", skill_dir);
                    if !std::path::Path::new(&skill_file).exists() {
                        let _ = std::fs::create_dir_all(&skill_dir);
                        let _ = std::fs::write(&skill_file, &content);
                        let (desc, tags) = crate::plugins::parse_skill_frontmatter(&content);
                        let _ = db.upsert_skill_index(
                            0, // Global scope uses 0 for workspace_id in project_skills currently
                            &slug,
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
    }`;
code = code.replace(oldSkillLoop, newSkillLoop);

// COMMANDS
const oldCmdLoop = `    for cmd in commands {
        if let Some(slug) = cmd.get("id").and_then(|v| v.as_str()) {
            let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
            let dest = format!("{}/commands/{}.md", base_dir, slug);
            if !std::path::Path::new(&dest).exists() {
                if let Some(content) = cmd.get("content").and_then(|v| v.as_str()) {
                    let _ = std::fs::create_dir_all(format!("{}/commands", base_dir));
                    let _ = std::fs::write(&dest, content);
                } else if let Some(github_url) = cmd.get("github_url").and_then(|v| v.as_str()) {
                    let raw_url = if github_url.contains("raw.githubusercontent.com") {
                        github_url.to_string()
                    } else {
                        crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
                    };
                    if let Ok(resp) = client.get(&raw_url).send().await {
                        if let Ok(content) = resp.text().await {
                            let _ = std::fs::create_dir_all(format!("{}/commands", base_dir));
                            let _ = std::fs::write(&dest, content);
                        }
                    }
                }
            }
        }
    }`;

const newCmdLoop = `    for cmd in commands {
        let (slug, github_url) = if let Some(url_str) = cmd.as_str() {
            let slug = url_str.split('/').last().unwrap_or("unknown").trim_end_matches(".md").to_string();
            (slug, Some(url_str.to_string()))
        } else if let Some(slug) = cmd.get("id").and_then(|v| v.as_str()) {
            (slug.to_string(), cmd.get("github_url").and_then(|v| v.as_str()).map(|s| s.to_string()))
        } else {
            continue;
        };

        let dest = format!("{}/commands/{}.md", base_path, slug);
        if !std::path::Path::new(&dest).exists() {
            if let Some(content) = cmd.get("content").and_then(|v| v.as_str()) {
                let _ = std::fs::create_dir_all(format!("{}/commands", base_path));
                let _ = std::fs::write(&dest, content);
            } else if let Some(url) = github_url {
                let raw_url = if url.contains("raw.githubusercontent.com") {
                    url.to_string()
                } else {
                    crate::plugins::github_url_to_raw_base(&url).unwrap_or_else(|_| url.to_string())
                };
                if let Ok(resp) = client.get(&raw_url).send().await {
                    if let Ok(content) = resp.text().await {
                        let _ = std::fs::create_dir_all(format!("{}/commands", base_path));
                        let _ = std::fs::write(&dest, content);
                    }
                }
            }
        }
    }`;
code = code.replace(oldCmdLoop, newCmdLoop);

// HOOKS
const oldHookLoop = `    for hook in hooks {
        if let Some(hook_type) = hook.get("id").and_then(|v| v.as_str()) {
            let base_dir = if scope == "project" { format!("{}/.superconsole", ws_path) } else { ws_path.to_string() };
            if crate::hooks::read_hook(&base_dir, hook_type).is_err() {
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
                        let _ = crate::hooks::write_hook(&base_dir, hook_type, &content);
                    }
                }
            }
        }
    }`;

const newHookLoop = `    for hook in hooks {
        let (hook_type, github_url) = if let Some(url_str) = hook.as_str() {
            let hook_type = url_str.split('/').last().unwrap_or("unknown").trim_end_matches(".sh").to_string();
            (hook_type, url_str.to_string())
        } else if let (Some(hook_type), Some(url_str)) = (hook.get("id").and_then(|v| v.as_str()), hook.get("github_url").and_then(|v| v.as_str())) {
            (hook_type.to_string(), url_str.to_string())
        } else {
            continue;
        };

        if crate::hooks::read_hook(&base_path, &hook_type).is_err() {
            continue;
        }

        let raw_url = if github_url.contains("raw.githubusercontent.com") {
            github_url.to_string()
        } else {
            crate::plugins::github_url_to_raw_base(&github_url).unwrap_or_else(|_| github_url.to_string())
        };
        if let Ok(resp) = client.get(&raw_url).send().await {
            if let Ok(content) = resp.text().await {
                let _ = crate::hooks::write_hook(&base_path, &hook_type, &content);
            }
        }
    }`;
code = code.replace(oldHookLoop, newHookLoop);

// MCP
const mcpOld = `    for mcp in mcps {
        if let Some(_slug) = mcp.get("id").and_then(|v| v.as_str()) {
            if let Some(typ) = mcp.get("type").and_then(|v| v.as_str()) {
                match typ {
                    "http" => {
                        if let Some(_url) = mcp.get("url").and_then(|v| v.as_str()) {
                            // crate::mcp::add_http_mcp_to_config(workspace_id, slug, _url);
                        }
                    }
                    "stdio" => {
                        if let Some(_cmd) = mcp.get("command").and_then(|v| v.as_str()) {
                            let _args: Vec<String> = mcp.get("args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
                            let _env: std::collections::HashMap<String, String> = mcp.get("env").and_then(|v| v.as_object()).map(|m| m.iter().map(|(k,v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect()).unwrap_or_default();
                            // crate::mcp::add_stdio_mcp_to_config(workspace_id, slug, _cmd, &_args, _env);
                        }
                    }
                    _ => eprintln!("Unknown MCP type: {}", typ),
                }
            }
        }
    }`;

const mcpNew = `    for mcp in mcps {
        if let Some(slug) = mcp.get("id").and_then(|v| v.as_str()) {
            if let Some(typ) = mcp.get("type").and_then(|v| v.as_str()) {
                if typ == "stdio" {
                    if let Some(cmd) = mcp.get("command").and_then(|v| v.as_str()) {
                        let args: Vec<String> = mcp.get("args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
                        let env: std::collections::HashMap<String, String> = mcp.get("env").and_then(|v| v.as_object()).map(|m| m.iter().map(|(k,v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect()).unwrap_or_default();
                        
                        let mcp_path = match scope {
                            "project" => std::path::Path::new(ws_path).join(".mcp.json"),
                            "org" | "account" => std::path::Path::new(ws_path).join("mcp.json"),
                            _ => return Err("Unknown scope".into()),
                        };
                        
                        if let Err(e) = add_stdio_mcp_to_config(&mcp_path, slug, cmd, &args, &env) {
                            eprintln!("Failed to add MCP to config: {}", e);
                        }
                        
                        // Also add to .factory/mcp.json for project
                        if scope == "project" {
                            let droid_path = std::path::Path::new(ws_path).join(".factory").join("mcp.json");
                            let _ = add_stdio_mcp_to_config(&droid_path, slug, cmd, &args, &env);
                        }
                    }
                }
            }
        }
    }`;
code = code.replace(mcpOld, mcpNew);

code += `

fn add_stdio_mcp_to_config(
    path: &std::path::Path,
    slug: &str,
    cmd: &str,
    args: &[String],
    env: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let mut root: serde_json::Value = std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !root.is_object() {
        root = serde_json::json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let servers = obj.entry("mcpServers").or_insert_with(|| serde_json::json!({}));
    if !servers.is_object() {
        *servers = serde_json::json!({});
    }
    servers.as_object_mut().unwrap().insert(
        slug.to_string(),
        serde_json::json!({ "command": cmd, "args": args, "env": env }),
    );
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(path, serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
`;

fs.writeFileSync('src-tauri/src/plugins.rs', code);
