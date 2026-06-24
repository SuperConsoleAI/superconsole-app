const fs = require('fs');
let content = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// 1. SubmitPluginInput
content = content.replace(
  '    pub mcp_ids: String,       // JSON array string e.g. "[\\"figma-mcp\\"]"\n    pub skill_ids: String,     // JSON array string\n    pub command_ids: String,   // JSON array string',
  '    pub mcp_ids: String,\n    pub skill_ids: String,\n    pub command_ids: String,\n    pub skills_url: Option<String>,\n    pub commands_url: Option<String>,\n    pub hooks_url: Option<String>,\n    pub mcp_url: Option<String>,'
);

// 2. submit_plugin_to_cloud insert statement
content = content.replace(
  "         (id, name, description, author, version, icon_url, docs_url, github_url, \\\n          category, mcp_ids, connector_auth, featured, \\\n          skill_ids, agent_ids, command_ids, hook_ids, connector_ids) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', ?) \\",
  "         (id, name, description, author, version, icon_url, docs_url, github_url, \\\n          category, mcp_ids, connector_auth, featured, \\\n          skill_ids, agent_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', ?, ?, ?, ?, ?) \\"
);
content = content.replace(
  "           skill_ids=excluded.skill_ids, command_ids=excluded.command_ids, \\\n           connector_ids=excluded.connector_ids, \\\n           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')\",",
  "           skill_ids=excluded.skill_ids, command_ids=excluded.command_ids, \\\n           connector_ids=excluded.connector_ids, \\\n           skills_url=excluded.skills_url, commands_url=excluded.commands_url, \\\n           hooks_url=excluded.hooks_url, mcp_url=excluded.mcp_url, \\\n           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')\","
);

// Also need to push the extra fields into vec![...]
content = content.replace(
  "            Some(input.command_ids),\n            Some(connector_ids_json),\n        ],",
  "            Some(input.command_ids),\n            Some(connector_ids_json),\n            input.skills_url.or_else(|| Some(\"[]\".to_string())),\n            input.commands_url.or_else(|| Some(\"[]\".to_string())),\n            input.hooks_url.or_else(|| Some(\"[]\".to_string())),\n            input.mcp_url.or_else(|| Some(\"[]\".to_string())),\n        ],"
);

// 3. list_plugins_catalog query
content = content.replace(
  "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, connector_auth, featured FROM plugins ORDER BY name",
  "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured FROM plugins ORDER BY name"
);

// list_plugins_catalog mapping to PluginCacheEntry
content = content.replace(
  /skills_url: if let crate::cloud::SqlValue::Text\(s\) = &r\.cols\[15\] \{ Some\(s\.clone\(\)\) \} else \{ None \},\s*commands_url: if let crate::cloud::SqlValue::Text\(s\) = &r\.cols\[16\] \{ Some\(s\.clone\(\)\) \} else \{ None \},\s*hooks_url: if let crate::cloud::SqlValue::Text\(s\) = &r\.cols\[17\] \{ Some\(s\.clone\(\)\) \} else \{ None \},\s*connector_auth: if let crate::cloud::SqlValue::Text\(s\) = &r\.cols\[18\] \{ s\.clone\(\) \} else \{ "\[\]"\.to_string\(\) \},\s*featured: if let crate::cloud::SqlValue::Integer\(i\) = &r\.cols\[19\] \{ \*i != 0 \} else \{ false \},/,
  `skills_url: if let crate::cloud::SqlValue::Text(s) = &r.cols[15] { Some(s.clone()) } else { None },
                        commands_url: if let crate::cloud::SqlValue::Text(s) = &r.cols[16] { Some(s.clone()) } else { None },
                        hooks_url: if let crate::cloud::SqlValue::Text(s) = &r.cols[17] { Some(s.clone()) } else { None },
                        mcp_url: if let crate::cloud::SqlValue::Text(s) = &r.cols[18] { Some(s.clone()) } else { None },
                        connector_auth: if let crate::cloud::SqlValue::Text(s) = &r.cols[19] { s.clone() } else { "[]".to_string() },
                        featured: if let crate::cloud::SqlValue::Integer(i) = &r.cols[20] { *i != 0 } else { false },`
);

fs.writeFileSync('src-tauri/src/plugins.rs', content);
