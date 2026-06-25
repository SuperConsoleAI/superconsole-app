const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

const newManifest = `struct PluginManifest {
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub category: Option<String>,
    pub skills_url: Option<String>,
    pub agents_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
    pub rules_url: Option<String>,
    pub mcp_url: Option<String>,
    pub skill_ids: Option<String>,
    pub agent_ids: Option<String>,
    pub command_ids: Option<String>,
    pub hook_ids: Option<String>,
    pub rule_ids: Option<String>,
    pub mcp_ids: Option<String>,
    pub connector_ids: Option<String>,
    pub connector_auth: Option<Vec<ConnectorAuth>>,
}`;

code = code.replace(/struct PluginManifest \{[\s\S]*? connector_auth: Option<Vec<ConnectorAuth>>,\n\}/, newManifest);

fs.writeFileSync('src-tauri/src/plugins.rs', code);
