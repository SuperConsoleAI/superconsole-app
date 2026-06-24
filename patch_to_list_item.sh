cat << 'INNER_EOF' > /tmp/to_list_item.rs
fn to_list_item(
    e: PluginCacheEntry,
    installed: &std::collections::HashSet<String>,
) -> PluginListItem {
    // The lists inside e.skill_ids etc. are arrays of objects now, e.g. [{"id":"...", "github_url":"..."}]
    // Let's count them by parsing into Vec<serde_json::Value>.
    let skill_arr: Vec<serde_json::Value> = serde_json::from_str(&e.skill_ids).unwrap_or_default();
    let mcp_arr: Vec<serde_json::Value> = serde_json::from_str(&e.mcp_ids).unwrap_or_default();
    let hook_arr: Vec<serde_json::Value> = serde_json::from_str(&e.hook_ids).unwrap_or_default();
    let connector_auth: Vec<ConnectorAuth> =
        serde_json::from_str(&e.connector_auth).unwrap_or_default();
    PluginListItem {
        installed: installed.contains(&e.id),
        id: e.id,
        name: e.name,
        description: e.description,
        author: e.author,
        version: e.version,
        icon_url: e.icon_url,
        category: e.category,
        featured: e.featured,
        skill_count: skill_arr.len(),
        mcp_count: mcp_arr.len(),
        hook_count: hook_arr.len(),
        skill_ids: e.skill_ids,
        mcp_ids: e.mcp_ids,
        command_ids: e.command_ids,
        github_url: e.github_url,
        docs_url: e.docs_url,
        connector_auth,
    }
}
INNER_EOF

# Replace the old `to_list_item` block with the new one
sed -i '' -e '/fn to_list_item(/,/connector_auth,/'c\
'@@REPLACE_ME@@' src-tauri/src/plugins.rs

sed -i '' -e '/@@REPLACE_ME@@/r /tmp/to_list_item.rs' -e '/@@REPLACE_ME@@/d' src-tauri/src/plugins.rs
