const fs = require('fs');

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

// Use string replacement for the first block
const oldBlock1 = `        // Alterations for installed_plugins schema
        for (col, decl) in [
            ("installed_by", "TEXT NOT NULL DEFAULT ''"),
            ("skills_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("commands_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("agents_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("hooks_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("rules_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("mcp_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("agent_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("hook_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("rule_ids", "TEXT NOT NULL DEFAULT '[]'"),
        ] {`;
const newBlock1 = `        // Alterations for installed_plugins schema
        for (col, decl) in [
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
        ] {`;

db = db.replace(oldBlock1, newBlock1);

// Use string replacement for the second block
const oldBlock2 = `        for (col, decl) in [
            ("agent_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("hook_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("rule_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("agents_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("hooks_url", "TEXT NOT NULL DEFAULT '[]'"),
            ("rules_url", "TEXT NOT NULL DEFAULT '[]'"),
        ] {`;
const newBlock2 = `        for (col, decl) in [
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
        ] {`;

db = db.replace(oldBlock2, newBlock2);

fs.writeFileSync('src-tauri/src/db.rs', db);
