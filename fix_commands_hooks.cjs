const fs = require('fs');

let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// Fix commands
const oldCmdLoop = `    for cmd in commands {
        if let Some(slug) = cmd.get("id").and_then(|v| v.as_str()) {
            let dest = format!("{}/commands/{}.md", base_path, slug);
            if !std::path::Path::new(&dest).exists() {
                if let Some(content) = cmd.get("content").and_then(|v| v.as_str()) {
                    let _ = std::fs::create_dir_all(format!("{}/commands", base_path));
                    let _ = std::fs::write(&dest, content);
                } else if let Some(github_url) = cmd.get("github_url").and_then(|v| v.as_str()) {
                    let raw_url = if github_url.contains("raw.githubusercontent.com") {
                        github_url.to_string()
                    } else {
                        crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
                    };
                    if let Ok(resp) = client.get(&raw_url).send().await {
                        if let Ok(content) = resp.text().await {
                            let _ = std::fs::create_dir_all(format!("{}/commands", base_path));
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

// Fix hooks
const oldHookLoop = `    for hook in hooks {
        if let Some(hook_type) = hook.get("id").and_then(|v| v.as_str()) {
            if crate::hooks::read_hook(&base_path, hook_type).is_err() {
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
                        let _ = crate::hooks::write_hook(&base_path, hook_type, &content);
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

fs.writeFileSync('src-tauri/src/plugins.rs', code);
