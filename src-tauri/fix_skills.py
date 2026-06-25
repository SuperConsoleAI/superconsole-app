import re

with open("src/skills.rs", "r") as f:
    content = f.read()

# 1. Update project_skill_index table creation
content = content.replace(
    "tags TEXT, scope TEXT NOT NULL DEFAULT 'project', active INTEGER NOT NULL DEFAULT 1, \\\n            updated_at TEXT NOT NULL DEFAULT",
    "tags TEXT, scope TEXT NOT NULL DEFAULT 'project', active INTEGER NOT NULL DEFAULT 1, \\\n            skill_catalog_id TEXT, author TEXT NOT NULL DEFAULT '', \\\n            updated_at TEXT NOT NULL DEFAULT"
)

# 2. Update push_skill_to_cloud signature
content = content.replace(
    "pub async fn push_skill_to_cloud(\n    app: &AppHandle,\n    project_id: Option<&str>,\n    skill_name: &str,\n    tags: &[String],\n    scope: &str,\n    active: bool,\n    author: &str,\n)",
    "pub async fn push_skill_to_cloud(\n    app: &AppHandle,\n    project_id: Option<&str>,\n    skill_name: &str,\n    tags: &[String],\n    scope: &str,\n    active: bool,\n    skill_catalog_id: Option<&str>,\n    author: &str,\n)"
)

# 3. Update push_skill_to_cloud query
content = content.replace(
    "INSERT INTO project_skill_index \\\n            (id, project_id, skill_name, tags, scope, active, author, updated_at) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "INSERT INTO project_skill_index \\\n            (id, project_id, skill_name, tags, scope, active, skill_catalog_id, author, updated_at) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

content = content.replace(
    "active = excluded.active, author = excluded.author, updated_at = excluded.updated_at",
    "active = excluded.active, skill_catalog_id = excluded.skill_catalog_id, author = excluded.author, updated_at = excluded.updated_at"
)

content = content.replace(
    "Some(if active { \"1\".into() } else { \"0\".into() }),\n            Some(author.to_string()),\n            Some(ts),",
    "Some(if active { \"1\".into() } else { \"0\".into() }),\n            skill_catalog_id.map(|s| s.to_string()),\n            Some(author.to_string()),\n            Some(ts),"
)

# 4. Update org_skill_index table creation
content = content.replace(
    "tags TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    "tags TEXT, skill_catalog_id TEXT, author TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
)

with open("src/skills.rs", "w") as f:
    f.write(content)
