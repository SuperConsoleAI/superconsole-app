const fs = require('fs');

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

// Update installed_plugins_cache alteration
db = db.replace(
  /for \(col, decl\) in \[\s*\("installed_by", "TEXT NOT NULL DEFAULT ''"\),[\s\S]*?\("rule_ids", "TEXT NOT NULL DEFAULT ''\[\]'"\),\s*\]/,
  `for (col, decl) in [
            ("installed_by", "TEXT NOT NULL DEFAULT ''"),
            ("skills_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("commands_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("agents_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("hooks_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("rules_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("mcp_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("skill_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("mcp_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("command_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("connector_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("agent_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("hook_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("rule_ids", "TEXT NOT NULL DEFAULT '[]'"),
        ]`
);

// Update plugins_cache alteration just to be safe
db = db.replace(
  /for \(col, decl\) in \[\s*\("agent_ids", "TEXT NOT NULL DEFAULT ''\[\]'"\),[\s\S]*?\("rules_url", "TEXT NOT NULL DEFAULT ''\[\]'"\),\s*\]/,
  `for (col, decl) in [
            ("agent_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("hook_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("rule_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("agents_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("hooks_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("rules_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("skill_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("mcp_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("command_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("connector_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("connector_auth", "TEXT NOT NULL DEFAULT '[]'"),
            ("featured", "INTEGER NOT NULL DEFAULT 0"),
        ]`
);

fs.writeFileSync('src-tauri/src/db.rs', db);
