const fs = require('fs');

let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

const oldCmdWrite = `        if !std::path::Path::new(&dest).exists() {
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
        }`;

const newCmdWrite = `        if !std::path::Path::new(&dest).exists() {
            if let Some(url) = github_url {
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
        }`;

code = code.replace(oldCmdWrite, newCmdWrite);

fs.writeFileSync('src-tauri/src/plugins.rs', code);
