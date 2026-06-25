import sys

def patch():
    with open('src-tauri/src/db.rs', 'r') as f:
        content = f.read()

    old_sig = """    pub fn record_installed_plugin(
        &self,
        scope: &str,
        scope_id: &str,
        plugin_id: &str,
        version: &str,
    ) -> Result<(), String> {"""
    
    new_sig = """    pub fn record_installed_plugin(
        &self,
        scope: &str,
        scope_id: &str,
        entry: &PluginCacheEntry,
    ) -> Result<(), String> {"""
    
    content = content.replace(old_sig, new_sig)
    
    old_exec = """        let _ = conn.execute(
            "DELETE FROM installed_plugins_cache WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
            rusqlite::params![scope, scope_id, plugin_id],
        );
        
        conn.execute(
            "INSERT INTO installed_plugins_cache (id, scope, scope_id, plugin_id, version)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, scope, scope_id, plugin_id, version],
        )"""

    new_exec = """        let _ = conn.execute(
            "DELETE FROM installed_plugins_cache WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
            rusqlite::params![scope, scope_id, &entry.id],
        );
        
        conn.execute(
            "INSERT INTO installed_plugins_cache (
                id, scope, scope_id, plugin_id, version,
                skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids,
                skills_url, agents_url, mcp_url, commands_url, hooks_url, rules_url
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5,
                ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16, ?17, ?18
            )",
            rusqlite::params![
                id, scope, scope_id, &entry.id, &entry.version,
                &entry.skill_ids, &entry.agent_ids, &entry.mcp_ids, &entry.command_ids, &entry.hook_ids, &entry.rule_ids, &entry.connector_ids,
                &entry.skills_url.clone().unwrap_or_else(|| "[]".into()), 
                &entry.agents_url.clone().unwrap_or_else(|| "[]".into()), 
                &entry.mcp_url.clone().unwrap_or_else(|| "[]".into()), 
                &entry.commands_url.clone().unwrap_or_else(|| "[]".into()), 
                &entry.hooks_url.clone().unwrap_or_else(|| "[]".into()),
                &entry.rules_url
            ],
        )"""

    content = content.replace(old_exec, new_exec)
    
    with open('src-tauri/src/db.rs', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    patch()
