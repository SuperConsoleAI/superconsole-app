const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

code = code.replace(
`    pub skill_ids: String,
    pub command_ids: String,
    pub connector_ids: String,
    pub skills_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
    pub mcp_url: Option<String>,`,
`    pub skill_ids: String,
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
    pub mcp_url: Option<String>,`
);

const newQuery = `         "INSERT INTO plugins \\
         (id, name, description, author, version, icon_url, docs_url, github_url, \\
          category, mcp_ids, connector_auth, featured, \\
          skill_ids, agent_ids, command_ids, hook_ids, rule_ids, connector_ids, skills_url, agents_url, commands_url, hooks_url, rules_url, mcp_url) \\
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \\
         ON CONFLICT(id) DO UPDATE SET \\
           name=excluded.name, description=excluded.description, \\
           author=excluded.author, version=excluded.version, \\
           icon_url=excluded.icon_url, docs_url=excluded.docs_url, \\
           github_url=excluded.github_url, category=excluded.category, \\
           mcp_ids=excluded.mcp_ids, \\
           connector_auth=excluded.connector_auth, featured=excluded.featured, \\
           skill_ids=excluded.skill_ids, agent_ids=excluded.agent_ids, command_ids=excluded.command_ids, \\
           hook_ids=excluded.hook_ids, rule_ids=excluded.rule_ids, connector_ids=excluded.connector_ids, \\
           skills_url=excluded.skills_url, agents_url=excluded.agents_url, commands_url=excluded.commands_url, \\
           hooks_url=excluded.hooks_url, rules_url=excluded.rules_url, mcp_url=excluded.mcp_url, \\
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
            Some(input.agent_ids),
            Some(input.command_ids),
            Some(input.hook_ids),
            Some(input.rule_ids),
            Some(input.connector_ids),
            input.skills_url.or_else(|| Some("[]".to_string())),
            input.agents_url.or_else(|| Some("[]".to_string())),
            input.commands_url.or_else(|| Some("[]".to_string())),
            input.hooks_url.or_else(|| Some("[]".to_string())),
            input.rules_url.or_else(|| Some("[]".to_string())),
            input.mcp_url.or_else(|| Some("[]".to_string())),
        ],`;

const oldQueryRegex = /"INSERT INTO plugins \\[\s\S]*?hooks_url\.or_else\(\|\| Some\("\[\]"\.to_string\(\)\)\),\n            input\.mcp_url\.or_else\(\|\| Some\("\[\]"\.to_string\(\)\)\),\n        ],/;

code = code.replace(oldQueryRegex, newQuery);

fs.writeFileSync('src-tauri/src/plugins.rs', code);
