const fs = require('fs');

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

const oldHooksCmd = `#[tauri::command]
pub fn list_hooks_catalog_cmd(
    db: tauri::State<Db>,
    hook_type: Option<String>,
) -> Vec<crate::db::HooksCatalogEntry> {
    db.list_hooks_catalog(hook_type.as_deref())
}`;

const newHooksCmd = `#[tauri::command]
pub async fn list_hooks_catalog_cmd(
    app: tauri::AppHandle,
    hook_type: Option<String>,
) -> Result<Vec<crate::db::HooksCatalogEntry>, String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Ok(app.state::<crate::db::Db>().list_hooks_catalog(hook_type.as_deref()));
    };
    let client = reqwest::Client::new();
    let result = crate::cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id, name, description, author, hook_type, github_url, content, icon_url FROM hooks_catalog ORDER BY name",
        vec![],
    ).await;
    if let Ok(res) = result {
        use crate::cloud::{cell_text, cell_opt, rows};
        let now = chrono::Utc::now().to_rfc3339();
        let entries: Vec<crate::db::HooksCatalogEntry> = rows(&res).iter().map(|row| crate::db::HooksCatalogEntry {
            id: cell_text(row, 0),
            name: cell_text(row, 1),
            description: cell_text(row, 2),
            author: cell_text(row, 3),
            hook_type: cell_text(row, 4),
            github_url: cell_text(row, 5),
            content: cell_opt(row, 6),
            icon_url: cell_opt(row, 7),
            install_count: 0,
            created_at: None,
            synced_at: Some(now.clone()),
        }).collect();
        let db = app.state::<crate::db::Db>();
        for e in &entries { let _ = db.upsert_hooks_catalog(e); }
        return Ok(entries);
    }
    Ok(app.state::<crate::db::Db>().list_hooks_catalog(hook_type.as_deref()))
}`;

plugins = plugins.replace(oldHooksCmd, newHooksCmd);
fs.writeFileSync('src-tauri/src/plugins.rs', plugins);
