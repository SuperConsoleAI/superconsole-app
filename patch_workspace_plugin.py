import sys

def patch():
    with open('src-tauri/src/db.rs', 'r') as f:
        content = f.read()

    # 1. Update struct WorkspacePlugin
    old_struct = """pub struct WorkspacePlugin {
    pub id: String,
    pub scope: String,
    pub scope_id: String,
    pub plugin_id: String,
    pub installed_at: String,
}"""
    new_struct = """pub struct WorkspacePlugin {
    pub id: String,
    pub scope: String,
    pub scope_id: String,
    pub plugin_id: String,
    pub installed_at: String,
    pub version: String,
    pub skill_ids: String,
    pub agent_ids: String,
    pub mcp_ids: String,
    pub command_ids: String,
    pub hook_ids: String,
    pub rule_ids: String,
    pub connector_ids: String,
}"""
    content = content.replace(old_struct, new_struct)

    # 2. Update list_installed_plugins
    old_query = """             "SELECT id, scope, scope_id, plugin_id, installed_at
             FROM installed_plugins_cache WHERE scope = ?1 AND scope_id = ?2 ORDER BY installed_at DESC","""
    new_query = """             "SELECT id, scope, scope_id, plugin_id, installed_at, version, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids
             FROM installed_plugins_cache WHERE scope = ?1 AND scope_id = ?2 ORDER BY installed_at DESC","""
    content = content.replace(old_query, new_query)

    old_row_map = """            Ok(WorkspacePlugin {
                id: r.get(0)?,
                scope: r.get(1)?,
                scope_id: r.get(2)?,
                plugin_id: r.get(3)?,
                installed_at: r.get(4)?,
            })"""
    new_row_map = """            Ok(WorkspacePlugin {
                id: r.get(0)?,
                scope: r.get(1)?,
                scope_id: r.get(2)?,
                plugin_id: r.get(3)?,
                installed_at: r.get(4)?,
                version: r.get(5)?,
                skill_ids: r.get(6)?,
                agent_ids: r.get(7)?,
                mcp_ids: r.get(8)?,
                command_ids: r.get(9)?,
                hook_ids: r.get(10)?,
                rule_ids: r.get(11)?,
                connector_ids: r.get(12)?,
            })"""
    content = content.replace(old_row_map, new_row_map)
    
    with open('src-tauri/src/db.rs', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    patch()
