const fs = require('fs');
let content = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

content = content.replace(
  'let skills: Vec<serde_json::Value> = serde_json::from_str(&entry.skill_ids).unwrap_or_default();',
  'let skills: Vec<serde_json::Value> = serde_json::from_str(entry.skills_url.as_deref().unwrap_or("[]")).unwrap_or_default();'
);
content = content.replace(
  'let commands: Vec<serde_json::Value> = serde_json::from_str(&entry.command_ids).unwrap_or_default();',
  'let commands: Vec<serde_json::Value> = serde_json::from_str(entry.commands_url.as_deref().unwrap_or("[]")).unwrap_or_default();'
);
content = content.replace(
  'let hooks: Vec<serde_json::Value> = serde_json::from_str(&entry.hook_ids).unwrap_or_default();',
  'let hooks: Vec<serde_json::Value> = serde_json::from_str(entry.hooks_url.as_deref().unwrap_or("[]")).unwrap_or_default();'
);

// We didn't have MCP logic yet in do_install_plugin. We should add it after hooks (step 3) and before Record installation (step 4).
let mcpBlock = `    // ── 4. Install MCPs ──────────────────────────────────────────────────────
    let mcps: Vec<serde_json::Value> = serde_json::from_str(entry.mcp_url.as_deref().unwrap_or("[]")).unwrap_or_default();
    for mcp in mcps {
        if let Some(slug) = mcp.get("id").and_then(|v| v.as_str()) {
            if let Some(typ) = mcp.get("type").and_then(|v| v.as_str()) {
                if typ == "npx" {
                    if let Some(pkg) = mcp.get("package").and_then(|v| v.as_str()) {
                        let _ = crate::mcp::add_mcp_config(
                            ws_path,
                            slug,
                            "npx",
                            &["-y", pkg],
                            mcp.get("env").and_then(|v| v.as_object()).map(|m| m.iter().map(|(k,v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect()).unwrap_or_default()
                        );
                    }
                } else if typ == "stdio" {
                    if let Some(cmd) = mcp.get("command").and_then(|v| v.as_str()) {
                        let args: Vec<String> = mcp.get("args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
                        let _ = crate::mcp::add_mcp_config(
                            ws_path,
                            slug,
                            cmd,
                            &args.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
                            mcp.get("env").and_then(|v| v.as_object()).map(|m| m.iter().map(|(k,v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect()).unwrap_or_default()
                        );
                    }
                } else if typ == "http" {
                    if let Some(url) = mcp.get("url").and_then(|v| v.as_str()) {
                        let _ = crate::mcp::add_mcp_config(
                            ws_path,
                            slug,
                            "sse",
                            &[url],
                            std::collections::HashMap::new()
                        );
                    }
                }
            }
        }
    }

    // ── 5. Record installation ───────────────────────────────────────────────`;

content = content.replace(
  '    // ── 4. Record installation ───────────────────────────────────────────────',
  mcpBlock
);

fs.writeFileSync('src-tauri/src/plugins.rs', content);
