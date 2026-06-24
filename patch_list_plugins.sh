cat << 'INNER_EOF' > /tmp/replace.rs
#[tauri::command]
pub async fn list_plugins_catalog(
    app: tauri::AppHandle,
    workspace_id: i64,
    category: Option<String>,
) -> Result<Vec<PluginListItem>, String> {
    let db = app.state::<Db>();
    let Ok(cfg) = crate::cloud::turso_config() else {
        let all = db.list_plugins_cache(category.as_deref());
        let installed: std::collections::HashSet<String> = db
            .list_workspace_plugins(workspace_id)
            .into_iter()
            .map(|p| p.plugin_id)
            .collect();
        return Ok(all.into_iter().map(|e| to_list_item(e, &installed)).collect());
    };
    let client = reqwest::Client::new();
    let result = crate::cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, connector_auth, featured FROM plugins ORDER BY name",
        vec![],
    ).await;
    
    if let Ok(res) = result {
        use crate::cloud::{cell_text, cell_opt, cell_bool, rows};
        let now = chrono::Utc::now().to_rfc3339();
        let entries: Vec<crate::db::PluginCacheEntry> = rows(&res).iter().map(|row| crate::db::PluginCacheEntry {
            id: cell_text(row, 0),
            name: cell_text(row, 1),
            description: cell_text(row, 2),
            author: cell_text(row, 3),
            version: cell_text(row, 4),
            icon_url: cell_opt(row, 5),
            docs_url: cell_opt(row, 6),
            github_url: cell_opt(row, 7),
            category: cell_text(row, 8),
            scope: cell_text(row, 9),
            skill_ids: cell_text(row, 10),
            mcp_ids: cell_text(row, 11),
            command_ids: cell_text(row, 12),
            hook_ids: cell_text(row, 13),
            connector_ids: cell_text(row, 14),
            skills_url: cell_opt(row, 15),
            commands_url: cell_opt(row, 16),
            hooks_url: cell_opt(row, 17),
            connector_auth: cell_text(row, 18),
            featured: cell_bool(row, 19),
            synced_at: now.clone(),
        }).collect();
        
        for e in &entries { let _ = db.upsert_plugins_cache(e); }
    }
    
    let all = db.list_plugins_cache(category.as_deref());
    let installed: std::collections::HashSet<String> = db
        .list_workspace_plugins(workspace_id)
        .into_iter()
        .map(|p| p.plugin_id)
        .collect();
    Ok(all.into_iter().map(|e| to_list_item(e, &installed)).collect())
}
INNER_EOF
