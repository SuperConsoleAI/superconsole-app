const fs = require('fs');

let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// Replace `let client = reqwest::Client::new();` to also define `base_path`
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

// Fix skills
code = code.replace(
  /let base_dir = if scope == "project" \{ format!\("\{}\/\.superconsole", ws_path\) \} else \{ ws_path\.to_string\(\) \};\n\s*let skill_dir = format!\("\{}\/skills\/\{}", base_dir, slug\);/g,
  'let skill_dir = format!("{}/skills/{}", base_path, slug);'
);

// Fix commands
code = code.replace(
  /let base_dir = if scope == "project" \{ format!\("\{}\/\.superconsole", ws_path\) \} else \{ ws_path\.to_string\(\) \};\n\s*let dest = format!\("\{}\/commands\/\{}\.md", base_dir, slug\);/g,
  'let dest = format!("{}/commands/{}.md", base_path, slug);'
);
code = code.replace(
  /let _ = std::fs::create_dir_all\(format!\("\{}\/commands", base_dir\)\);/g,
  'let _ = std::fs::create_dir_all(format!("{}/commands", base_path));'
);

// Fix hooks
code = code.replace(
  /let base_dir = if scope == "project" \{ format!\("\{}\/\.superconsole", ws_path\) \} else \{ ws_path\.to_string\(\) \};\n\s*if crate::hooks::read_hook\(&base_dir, hook_type\)\.is_err\(\) \{/g,
  'if crate::hooks::read_hook(&base_path, hook_type).is_err() {'
);
code = code.replace(
  /let _ = crate::hooks::write_hook\(&base_dir, hook_type, &content\);/g,
  'let _ = crate::hooks::write_hook(&base_path, hook_type, &content);'
);

// Fix MCP
const mcpOld = `    let mcps: Vec<serde_json::Value> = serde_json::from_str(entry.mcp_url.as_deref().unwrap_or("[]")).unwrap_or_default();
    for mcp in mcps {
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

const mcpNew = `    let mcps: Vec<serde_json::Value> = serde_json::from_str(entry.mcp_url.as_deref().unwrap_or("[]")).unwrap_or_default();
    for mcp in mcps {
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

// Append add_stdio_mcp_to_config at the end
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
