const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// 1. Fix PluginCacheEntry around 289
const oldCacheEntry = `connector_ids: manifest.connector_ids.clone().unwrap_or_else(|| "[]".into()),
        skills_url: manifest.skills_url.clone(),
        commands_url: manifest.commands_url.clone(),
        hooks_url: manifest.hooks_url.clone(),
        mcp_url: manifest.mcp_url.clone(),
        connector_auth: serde_json::to_string(&manifest.connector_auth.unwrap_or_default()).unwrap_or_default(),`;

const newCacheEntry = `connector_ids: manifest.connector_ids.clone().unwrap_or_else(|| "[]".into()),
        skills_url: manifest.skills_url.clone(),
        agents_url: manifest.agents_url.clone(),
        commands_url: manifest.commands_url.clone(),
        hooks_url: manifest.hooks_url.clone(),
        rules_url: manifest.rules_url.clone(),
        mcp_url: manifest.mcp_url.clone(),
        connector_auth: serde_json::to_string(&manifest.connector_auth.unwrap_or_default()).unwrap_or_default(),`;
code = code.replace(oldCacheEntry, newCacheEntry);

// 2. Fix upsert_skill_index missing author
const oldUpsert = `                            1,
                            "plugin",
                            true,
                        );`;
const newUpsert = `                            1,
                            "plugin",
                            true,
                            "",
                        );`;
code = code.replace(oldUpsert, newUpsert);

// 3. Fix unused connector_ids_json
code = code.replace(`        connector_ids: input.connector_ids, // Use the string directly from input`, `        connector_ids: connector_ids_json, // Use the JSON parsed string`);

fs.writeFileSync('src-tauri/src/plugins.rs', code);
