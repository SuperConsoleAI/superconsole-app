cat << 'INNER_EOF' >> src-tauri/src/plugins.rs

// --- Helper Functions ---

pub fn github_url_to_raw_base(url: &str) -> Result<String, String> {
    if url.contains("raw.githubusercontent.com") {
        return Ok(url.to_string());
    }
    // https://github.com/owner/repo/tree/main/path
    let parts: Vec<&str> = url.split('/').collect();
    if parts.len() < 7 {
        return Err("Invalid github url".to_string());
    }
    let owner = parts[3];
    let repo = parts[4];
    let branch = parts[6];
    let path = parts[7..].join("/");
    if path.is_empty() {
        Ok(format!("https://raw.githubusercontent.com/{}/{}/{}", owner, repo, branch))
    } else {
        Ok(format!("https://raw.githubusercontent.com/{}/{}/{}/{}", owner, repo, branch, path))
    }
}

pub fn parse_skill_frontmatter(content: &str) -> (String, String) {
    let mut desc = String::new();
    let mut tags = String::new();
    if let Some(start) = content.find("---") {
        if let Some(end) = content[start + 3..].find("---") {
            let yaml = &content[start + 3..start + 3 + end];
            for line in yaml.lines() {
                if line.starts_with("description:") {
                    desc = line.trim_start_matches("description:").trim().to_string();
                } else if line.starts_with("tags:") {
                    tags = line.trim_start_matches("tags:").trim().to_string();
                }
            }
        }
    }
    (desc, tags)
}

// --- submit_connector_to_cloud ---

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitConnectorInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub auth_type: String,
    pub oauth_url: Option<String>,
    pub api_key_fields: String, // JSON array string
    pub docs_url: Option<String>,
    pub icon_url: Option<String>,
    pub scope: String,
}

#[tauri::command]
pub async fn submit_connector_to_cloud(input: SubmitConnectorInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO connector_catalog \
         (id, name, description, category, auth_type, oauth_url, api_key_fields, \
          docs_url, icon_url, scope) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, description=excluded.description, \
           category=excluded.category, auth_type=excluded.auth_type, \
           oauth_url=excluded.oauth_url, api_key_fields=excluded.api_key_fields, \
           docs_url=excluded.docs_url, icon_url=excluded.icon_url, \
           scope=excluded.scope, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.description),
            Some(input.category),
            Some(input.auth_type),
            input.oauth_url,
            Some(input.api_key_fields),
            input.docs_url,
            input.icon_url,
            Some(input.scope),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- submit_mcp_to_cloud ---

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitMcpInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub github_url: String,
    pub install_command: String,
    pub install_args: String, // JSON array string
    pub required_env_vars: String, // JSON array string
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
}

#[tauri::command]
pub async fn submit_mcp_to_cloud(input: SubmitMcpInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO mcp_catalog \
         (id, name, description, author, category, github_url, install_command, \
          install_args, required_env_vars, icon_url, docs_url) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, description=excluded.description, \
           author=excluded.author, category=excluded.category, \
           github_url=excluded.github_url, install_command=excluded.install_command, \
           install_args=excluded.install_args, required_env_vars=excluded.required_env_vars, \
           icon_url=excluded.icon_url, docs_url=excluded.docs_url",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.description),
            Some(input.author),
            Some(input.category),
            Some(input.github_url),
            Some(input.install_command),
            Some(input.install_args),
            Some(input.required_env_vars),
            input.icon_url,
            input.docs_url,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- submit_command_to_cloud ---

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitCommandInput {
    pub id: String,
    pub name: String,
    pub slash: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub github_url: String,
    pub content: Option<String>,
    pub icon_url: Option<String>,
}

#[tauri::command]
pub async fn submit_command_to_cloud(input: SubmitCommandInput) -> Result<(), String> {
    let Ok(cfg) = crate::cloud::turso_config() else {
        return Err("Turso not configured".to_string());
    };
    let client = reqwest::Client::new();
    crate::cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO commands_catalog \
         (id, name, slash, description, author, category, github_url, content, icon_url) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           name=excluded.name, slash=excluded.slash, description=excluded.description, \
           author=excluded.author, category=excluded.category, \
           github_url=excluded.github_url, content=excluded.content, \
           icon_url=excluded.icon_url",
        vec![
            Some(input.id),
            Some(input.name),
            Some(input.slash),
            Some(input.description),
            Some(input.author),
            Some(input.category),
            Some(input.github_url),
            input.content,
            input.icon_url,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

INNER_EOF
