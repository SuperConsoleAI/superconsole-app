import re
with open("src/db.rs", "r") as f:
    content = f.read()

# Update CREATE TABLE
content = content.replace(
    "source TEXT NOT NULL DEFAULT 'superconsole',\n                author TEXT NOT NULL DEFAULT '',",
    "source TEXT NOT NULL DEFAULT 'superconsole',\n                author TEXT NOT NULL DEFAULT '',\n                skill_catalog_id TEXT,"
)

# Update upsert_skill query
content = content.replace(
    "source, author, updated_at)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))",
    "source, author, skill_catalog_id, updated_at)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))"
)

content = content.replace(
    "source = excluded.source, author = excluded.author, updated_at = excluded.updated_at",
    "source = excluded.source, author = excluded.author, skill_catalog_id = excluded.skill_catalog_id, updated_at = excluded.updated_at"
)

# Update parameters
content = content.replace(
    "source,\n                author,\n            ]",
    "source,\n                author,\n                None::<String>, /* TODO: pass skill_catalog_id from skills */\n            ]"
)

with open("src/db.rs", "w") as f:
    f.write(content)
