with open("src/db.rs", "r") as f:
    content = f.read()

# Update AGENT_SELECT
content = content.replace(
    "is_active, agent_id, last_run, next_run, created_at, updated_at",
    "is_active, agent_id, agent_catalog_id, author, last_run, next_run, created_at, updated_at"
)

# Update upsert_agent_row signature
content = content.replace(
    "is_active: bool,\n        agent_id: Option<&str>,\n    ) -> Result<AgentRow, String> {",
    "is_active: bool,\n        agent_id: Option<&str>,\n        agent_catalog_id: Option<&str>,\n        author: &str,\n    ) -> Result<AgentRow, String> {"
)

# Update INSERT INTO
content = content.replace(
    "is_active, agent_id, updated_at)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'))",
    "is_active, agent_id, agent_catalog_id, author, updated_at)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, datetime('now'))"
)

# Update ON CONFLICT
content = content.replace(
    "agent_id         = COALESCE(excluded.agent_id, agents.agent_id),\n                updated_at       = excluded.updated_at",
    "agent_id         = COALESCE(excluded.agent_id, agents.agent_id),\n                agent_catalog_id = excluded.agent_catalog_id,\n                author           = excluded.author,\n                updated_at       = excluded.updated_at"
)

# Update params
content = content.replace(
    "skills, connectors, is_active as i64, agent_id,\n            ],",
    "skills, connectors, is_active as i64, agent_id,\n                agent_catalog_id, author,\n            ],"
)

# Fix agent_from_row
content = content.replace(
    "agent_id: r.get(12)?,\n            last_run: r.get(13)?,\n            next_run: r.get(14)?,\n            created_at: r.get(15)?,\n            updated_at: r.get(16)?,",
    "agent_id: r.get(12)?,\n            agent_catalog_id: r.get(13)?,\n            author: r.get(14)?,\n            last_run: r.get(15)?,\n            next_run: r.get(16)?,\n            created_at: r.get(17)?,\n            updated_at: r.get(18)?,"
)

with open("src/db.rs", "w") as f:
    f.write(content)
