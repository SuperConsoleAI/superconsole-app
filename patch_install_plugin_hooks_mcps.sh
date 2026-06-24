cat << 'INNER_EOF' >> /tmp/replace_install_plugin.rs
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
        // Just record that the workspace requires this connector (if not already mapped).
        // Since auth isn't provided directly, the user will see it pending.
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
