import re

with open("src/agents.rs", "r") as f:
    content = f.read()

# 1. Add author to CatalogAgentInput
content = content.replace(
    "    pub files: Vec<String>,\n}",
    "    pub files: Vec<String>,\n    pub author: String,\n}"
)

# 2. agent_catalog table creation
content = content.replace(
    "readme TEXT NOT NULL DEFAULT '', \\\n",
    "readme TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '', \\\n"
)

# 3. upsert_catalog_row query update
content = content.replace(
    "INSERT INTO agent_catalog \\\n            (id, name, description, category, image_url, skills, connectors, tags, repo, git_ref, base_path, files, version) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    "INSERT INTO agent_catalog \\\n            (id, name, description, category, image_url, skills, connectors, tags, repo, git_ref, base_path, files, author, version) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
)
content = content.replace(
    "base_path = excluded.base_path, files = excluded.files, \\\n",
    "base_path = excluded.base_path, files = excluded.files, author = excluded.author, \\\n"
)
content = content.replace(
    "Some(json(&input.files)),\n        ],",
    "Some(json(&input.files)),\n            Some(input.author.clone()),\n        ],"
)

# 4. project_agents table creation
content = content.replace(
    "is_active INTEGER NOT NULL DEFAULT 1, \\\n",
    "is_active INTEGER NOT NULL DEFAULT 1, agent_catalog_id TEXT, author TEXT NOT NULL DEFAULT '', \\\n"
)

# 5. project_agents INSERT query (push_agent_to_cloud)
content = content.replace(
    "pub async fn push_agent_to_cloud(\n    app: &AppHandle,\n    project_id: Option<&str>,\n    agent_name: &str,",
    "pub async fn push_agent_to_cloud(\n    app: &AppHandle,\n    project_id: Option<&str>,\n    agent_name: &str,\n    agent_catalog_id: Option<&str>,\n    author: &str,"
)

# Replace the INSERT query
content = content.replace(
    "INSERT INTO project_agents \\\n            (id, project_id, name, description, schedule, default_run_mode, \\\n             default_cli, default_provider, default_model, skills, connectors, \\\n             is_active, last_run, updated_at) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "INSERT INTO project_agents \\\n            (id, project_id, name, description, schedule, default_run_mode, \\\n             default_cli, default_provider, default_model, skills, connectors, \\\n             is_active, agent_catalog_id, author, last_run, updated_at) \\\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

# ON CONFLICT DO UPDATE
content = content.replace(
    "connectors       = excluded.connectors, \\\n",
    "connectors       = excluded.connectors, \\\n            agent_catalog_id = excluded.agent_catalog_id, \\\n            author           = excluded.author, \\\n"
)

# Add params
content = content.replace(
    "Some(if is_active { \"1\".into() } else { \"0\".into() }),\n            Some(last_run),\n            Some(ts),\n        ],",
    "Some(if is_active { \"1\".into() } else { \"0\".into() }),\n            agent_catalog_id.map(|s| s.to_string()),\n            Some(author.to_string()),\n            Some(last_run),\n            Some(ts),\n        ],"
)

# Find all instantiations of CatalogAgentInput and add author
content = re.sub(r'CatalogAgentInput\s*\{\s*(.*?)\s*\}', lambda m: "CatalogAgentInput { " + m.group(1) + ", author: String::new() }" if "author:" not in m.group(1) else m.group(0), content, flags=re.DOTALL)

with open("src/agents.rs", "w") as f:
    f.write(content)
