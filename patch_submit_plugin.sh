cat << 'INNER_EOF' > /tmp/replace_submit_plugin.rs
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitPluginInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub category: String,
    pub github_url: Option<String>,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
    pub mcp_ids: String,       // JSON array string
    pub skill_ids: String,     // JSON array string
    pub command_ids: String,   // JSON array string
    pub connector_auth: String, // JSON array string
    pub featured: bool,
    pub skills_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
}

/// Write a plugin row directly to the Turso `plugins` table.
#[tauri::command]
pub async fn submit_plugin_to_cloud(input: SubmitPluginInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    let featured_int = if input.featured { "1" } else { "0" };

    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO plugins \
         (id, name, description, author, version, icon_url, docs_url, github_url, \
          category, mcp_ids, connector_auth, featured, \
          skill_ids, agent_ids, command_ids, hook_ids, connector_ids, \
          skills_url, commands_url, hooks_url) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', '[]', ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, description=excluded.description, \
           author=excluded.author, version=excluded.version, \
           icon_url=excluded.icon_url, docs_url=excluded.docs_url, \
           github_url=excluded.github_url, category=excluded.category, \
           mcp_ids=excluded.mcp_ids, \
           connector_auth=excluded.connector_auth, featured=excluded.featured, \
           skill_ids=excluded.skill_ids, command_ids=excluded.command_ids, \
           skills_url=excluded.skills_url, commands_url=excluded.commands_url, \
           hooks_url=excluded.hooks_url, \
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.description),
            Some(input.author),
            Some(input.version),
            input.icon_url,
            input.docs_url,
            input.github_url,
            Some(input.category),
            Some(input.mcp_ids),
            Some(input.connector_auth),
            Some(featured_int.to_string()),
            Some(input.skill_ids),
            Some(input.command_ids),
            input.skills_url,
            input.commands_url,
            input.hooks_url,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
INNER_EOF
