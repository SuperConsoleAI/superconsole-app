const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

// I also need to make sure the instantiation of PluginCacheEntry works.
code = code.replace(/rule_ids: manifest\.rule_ids\.clone\(\)\.unwrap_or_else\(\|\| "\[\]"\.into\(\)\),/, 
`rule_ids: manifest.rule_ids.clone().unwrap_or_else(|| "[]".into()),
        mcp_ids: manifest.mcp_ids.clone().unwrap_or_else(|| "[]".into()),
        connector_ids: manifest.connector_ids.clone().unwrap_or_else(|| "[]".into()),`);
        
code = code.replace(/mcp_url: manifest\.mcp_url\.clone\(\),/, 
`mcp_url: manifest.mcp_url.clone(),`);

fs.writeFileSync('src-tauri/src/plugins.rs', code);
