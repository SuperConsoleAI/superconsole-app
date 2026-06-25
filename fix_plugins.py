import re

with open('src-tauri/src/plugins.rs', 'r') as f:
    content = f.read()

# 1. Fix PluginCacheEntry instantiation in list_plugins_catalog (around line 104)
# Add rule_ids, agents_url, rules_url
content = re.sub(
    r'(skills_url: cell_opt\(row, 15\),)',
    r'rule_ids: "[]".into(),\n            \1',
    content
)
content = re.sub(
    r'(mcp_url: cell_opt\(row, 18\),)',
    r'\1\n            agents_url: None,\n            rules_url: None,',
    content
)

# 2. Fix PluginCacheEntry instantiation around line 276 (PluginManifest -> PluginCacheEntry)
content = re.sub(
    r'(hooks_url: manifest\.hooks_url\.clone\(\),)',
    r'\1\n        agents_url: manifest.agents_url.clone(),\n        rules_url: manifest.rules_url.clone(),',
    content
)
content = re.sub(
    r'(hook_ids: manifest\.hook_ids\.clone\(\)\.unwrap_or_else\(\|\| "\[\]"\.into\(\)\),)',
    r'\1\n        rule_ids: manifest.rule_ids.clone().unwrap_or_else(|| "[]".into()),',
    content
)

# 3. Fix upsert_skill_index call around line 551
content = re.sub(
    r'(1,\n\s*"plugin",\n\s*true,\n\s*\);)',
    r'1,\n                            "plugin",\n                            true,\n                            "",\n                        );',
    content
)

# 4. Fix record_installed_plugin call around line 655
content = re.sub(
    r'db\.record_installed_plugin\(scope, scope_id, &entry\.id, &entry\.version\)\?;',
    r'db.record_installed_plugin(scope, scope_id, &entry)?;',
    content
)

# 5. Fix SubmitPluginInput schema
submit_plugin_input = """pub struct SubmitPluginInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub category: String,
    pub github_url: Option<String>,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
    pub mcp_ids: String,
    pub skill_ids: String,
    pub agent_ids: String,
    pub command_ids: String,
    pub hook_ids: String,
    pub rule_ids: String,
    pub connector_ids: String,
    pub skills_url: Option<String>,
    pub agents_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
    pub rules_url: Option<String>,
    pub mcp_url: Option<String>,
    pub connector_auth: String, // JSON array string
    pub featured: bool,
}"""

content = re.sub(
    r'pub struct SubmitPluginInput \{[^}]+\}',
    submit_plugin_input,
    content
)

with open('src-tauri/src/plugins.rs', 'w') as f:
    f.write(content)
