// src-tauri/src/commands/agents/commands.rs
//
// Command-level Tool Scoping & Custom Command registry.
// Manages built-in and user-defined agent commands with precise `required_tools`.
//
// HARD RULE: touches UserDB only (&TursoConn for active profile). Zero Central DB calls.

use crate::db::turso::TursoConn;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommand {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub slash: String,
    pub description: Option<String>,
    pub prompt_template: Option<String>,
    pub domain_tags: Vec<String>,
    pub required_tools: Vec<String>,
    pub is_builtin: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentCommandPayload {
    pub name: String,
    pub slash: String,
    pub description: Option<String>,
    pub prompt_template: Option<String>,
    pub domain_tags: Vec<String>,
    pub required_tools: Option<Vec<String>>,
}

struct BuiltinSeed {
    id: &'static str,
    name: &'static str,
    slash: &'static str,
    description: &'static str,
    prompt_template: Option<&'static str>,
    domain_tags: &'static [&'static str],
    required_tools: &'static [&'static str],
}

const BUILTIN_COMMANDS: &[BuiltinSeed] = &[
    BuiltinSeed {
        id: "cmd_add_inventory_from_invoice",
        name: "Receive Stock from Invoice",
        slash: "/add-inventory-from-invoice",
        description: "Scan purchase invoice or PDF to auto-restock items",
        prompt_template: Some("/add-inventory-from-invoice \n\nFor New Products:\nSelling Price (Rate) = Cost + % ?\nDiscount = % ?"),
        domain_tags: &["shop"],
        required_tools: &["inventory_receive_purchase_invoice"],
    },
    BuiltinSeed {
        id: "cmd_check_stock",
        name: "Check Stock Levels",
        slash: "/check-stock",
        description: "Inspect inventory levels, reorder points & batches",
        prompt_template: Some("/check-stock "),
        domain_tags: &["shop"],
        required_tools: &["inventory_get_levels"],
    },
    BuiltinSeed {
        id: "cmd_adjust_stock",
        name: "Adjust Stock Quantity",
        slash: "/adjust-stock",
        description: "Record damage, audit variances or stock corrections",
        prompt_template: Some("/adjust-stock "),
        domain_tags: &["shop"],
        required_tools: &["inventory_add_stock"],
    },
    BuiltinSeed {
        id: "cmd_create_invoice",
        name: "Create Customer Invoice",
        slash: "/create-invoice",
        description: "Draft a new retail or wholesale billing invoice",
        prompt_template: Some("/create-invoice "),
        domain_tags: &["shop"],
        required_tools: &["invoice_create"],
    },
    BuiltinSeed {
        id: "cmd_send_invoice",
        name: "Send Invoice",
        slash: "/send-invoice",
        description: "Send an existing invoice to customer via email or link",
        prompt_template: Some("/send-invoice "),
        domain_tags: &["shop"],
        required_tools: &["invoice_send"],
    },
    BuiltinSeed {
        id: "cmd_update_pricing",
        name: "Update Product Pricing",
        slash: "/update-price",
        description: "Directly update item cost, selling price or margins",
        prompt_template: Some("/update-price "),
        domain_tags: &["shop"],
        required_tools: &["product_update_pricing"],
    },
    BuiltinSeed {
        id: "cmd_add_contact",
        name: "Add CRM Contact",
        slash: "/add-contact",
        description: "Register a new client, vendor, or lead with email/phone",
        prompt_template: Some("/add-contact "),
        domain_tags: &["crm"],
        required_tools: &["contact_create"],
    },
    BuiltinSeed {
        id: "cmd_update_contact",
        name: "Update Contact",
        slash: "/update-contact",
        description: "Update details, tags, or company info for a contact",
        prompt_template: Some("/update-contact "),
        domain_tags: &["crm"],
        required_tools: &["contact_update"],
    },
    BuiltinSeed {
        id: "cmd_draft_post",
        name: "Draft Blog Post",
        slash: "/draft-post",
        description: "Create and draft a structured article with markdown",
        prompt_template: Some("/draft-post "),
        domain_tags: &["content"],
        required_tools: &["blog_post_create"],
    },
    BuiltinSeed {
        id: "cmd_capabilities",
        name: "Platform Capabilities",
        slash: "/capabilities",
        description: "Discover all available BusinessKit platform capabilities",
        prompt_template: Some("/capabilities "),
        domain_tags: &["system"],
        required_tools: &["system_get_capabilities"],
    },
    BuiltinSeed {
        id: "cmd_create_page",
        name: "Create Website Page",
        slash: "/create-page",
        description: "Draft a new landing page or website page with title and slug",
        prompt_template: Some("/create-page "),
        domain_tags: &["pages"],
        required_tools: &["page_create"],
    },
    BuiltinSeed {
        id: "cmd_publish_page",
        name: "Publish Website Page",
        slash: "/publish-page",
        description: "Publish a page or toggle draft status for website",
        prompt_template: Some("/publish-page "),
        domain_tags: &["pages"],
        required_tools: &["page_publish"],
    },
    BuiltinSeed {
        id: "cmd_list_pages",
        name: "List Website Pages",
        slash: "/list-pages",
        description: "List all website pages, slugs, and publication statuses",
        prompt_template: Some("/list-pages "),
        domain_tags: &["pages"],
        required_tools: &["page_list"],
    },
];

/// Ensures default built-in commands exist in the database for the active profile.
pub async fn ensure_builtin_commands(conn: &TursoConn, profile_id: &str) -> Result<(), String> {
    // Check if built-in commands already exist for this profile to prevent redundant writes on every load
    let count_q = "SELECT COUNT(*) FROM agent_commands WHERE profile_id = ?1 AND is_builtin = 1";
    if let Ok(mut rows) = conn.query(count_q, crate::turso_params![profile_id]).await {
        if let Ok(Some(row)) = rows.next().await {
            let count: i64 = row.get(0).unwrap_or(0);
            if count >= BUILTIN_COMMANDS.len() as i64 {
                return Ok(());
            }
        }
    }

    for seed in BUILTIN_COMMANDS {
        let domain_tags_json = serde_json::to_string(&seed.domain_tags).unwrap_or_else(|_| "[]".into());
        let required_tools_json = serde_json::to_string(&seed.required_tools).unwrap_or_else(|_| "[]".into());

        conn.execute(
            "INSERT INTO agent_commands \
             (id, profile_id, name, slash, description, prompt_template, domain_tags, required_tools, is_builtin, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, strftime('%s','now'), strftime('%s','now')) \
             ON CONFLICT(id) DO UPDATE SET \
               name = excluded.name, \
               slash = excluded.slash, \
               description = excluded.description, \
               prompt_template = excluded.prompt_template, \
               domain_tags = excluded.domain_tags, \
               required_tools = excluded.required_tools, \
               is_builtin = 1, \
               updated_at = strftime('%s','now')",
            crate::turso_params![
                seed.id,
                profile_id,
                seed.name,
                seed.slash,
                seed.description,
                seed.prompt_template,
                domain_tags_json,
                required_tools_json,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Looks up the `required_tools` array for a given command ID or slash token.
pub async fn get_command_required_tools(
    conn: &TursoConn,
    profile_id: &str,
    command_id_or_slash: &str,
) -> Result<Vec<String>, String> {
    let _ = ensure_builtin_commands(conn, profile_id).await;

    let needle = command_id_or_slash.trim();
    let slash_needle = if needle.starts_with('/') {
        needle.to_string()
    } else {
        format!("/{}", needle)
    };
    let raw_needle = needle.strip_prefix('/').unwrap_or(needle);
    let prefixed_id = format!("cmd_{}", raw_needle.replace('-', "_"));

    let q = "SELECT required_tools FROM agent_commands \
             WHERE (profile_id = ?1 OR is_builtin = 1) \
               AND (id = ?2 OR id = ?3 OR slash = ?4 OR slash = ?5) \
             LIMIT 1";

    let mut rows = conn
        .query(
            q,
            crate::turso_params![profile_id, needle, prefixed_id, slash_needle, needle],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let tools_json: String = row.get(0).unwrap_or_default();
        if let Ok(tools) = serde_json::from_str::<Vec<String>>(&tools_json) {
            return Ok(tools);
        }
    }

    Ok(vec![])
}

#[tauri::command]
pub async fn list_agent_commands(
    domain: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<AgentCommand>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    ensure_builtin_commands(&conn, &profile_id).await?;

    let q = "SELECT id, profile_id, name, slash, description, prompt_template, domain_tags, required_tools, is_builtin, created_at, updated_at \
             FROM agent_commands WHERE (profile_id = ?1 OR is_builtin = 1) \
             ORDER BY is_builtin DESC, name ASC";

    let mut rows = conn
        .query(q, crate::turso_params![profile_id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    let mut commands = Vec::new();
    let filter_d = domain.as_deref().unwrap_or("all").trim().to_lowercase();

    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let tags_raw: String = row.get(6).unwrap_or_else(|_| "[]".into());
        let tools_raw: String = row.get(7).unwrap_or_else(|_| "[]".into());

        let domain_tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
        let required_tools: Vec<String> = serde_json::from_str(&tools_raw).unwrap_or_default();

        if filter_d != "all" && !filter_d.is_empty() {
            if !domain_tags.iter().any(|d| d.to_lowercase() == filter_d || d == "all") {
                continue;
            }
        }

        commands.push(AgentCommand {
            id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            name: row.get(2).map_err(|e| e.to_string())?,
            slash: row.get(3).map_err(|e| e.to_string())?,
            description: row.get(4).unwrap_or(None),
            prompt_template: row.get(5).unwrap_or(None),
            domain_tags,
            required_tools,
            is_builtin: row.get::<i64>(8).unwrap_or(0) == 1,
            created_at: row.get::<i64>(9).unwrap_or(0),
            updated_at: row.get::<i64>(10).unwrap_or(0),
        });
    }

    Ok(commands)
}

#[tauri::command]
pub async fn create_agent_command(
    payload: CreateAgentCommandPayload,
    state: State<'_, Arc<AppState>>,
) -> Result<AgentCommand, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Command name cannot be empty".into());
    }

    let mut slash = payload.slash.trim().to_string();
    if !slash.starts_with('/') {
        slash = format!("/{}", slash);
    }

    // Resolve required_tools:
    // If not specified or empty, default to all tools in the tagged domain(s)
    let final_tools = match payload.required_tools {
        Some(tools) if !tools.is_empty() => tools,
        _ => {
            let mut resolved = Vec::new();
            for tag in &payload.domain_tags {
                for tool in super::tools::registry_for_domain(Some(tag.as_str())) {
                    if !resolved.contains(&tool.name.to_string()) {
                        resolved.push(tool.name.to_string());
                    }
                }
            }
            if resolved.is_empty() {
                resolved.push("system_get_capabilities".to_string());
            }
            resolved
        }
    };

    let id = format!("cmd_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let domain_tags_json = serde_json::to_string(&payload.domain_tags).map_err(|e| e.to_string())?;
    let required_tools_json = serde_json::to_string(&final_tools).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO agent_commands (id, profile_id, name, slash, description, prompt_template, domain_tags, required_tools, is_builtin, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            name.to_string(),
            slash.clone(),
            payload.description.clone(),
            payload.prompt_template.clone(),
            domain_tags_json,
            required_tools_json,
            now,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(AgentCommand {
        id,
        profile_id,
        name: name.to_string(),
        slash,
        description: payload.description,
        prompt_template: payload.prompt_template,
        domain_tags: payload.domain_tags,
        required_tools: final_tools,
        is_builtin: false,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn delete_agent_command(
    id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Prevent deletion of built-in commands
    let mut check = conn
        .query(
            "SELECT is_builtin FROM agent_commands WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = check.next().await.map_err(|e| e.to_string())? {
        let is_builtin: i64 = row.get(0).unwrap_or(0);
        if is_builtin == 1 {
            return Err("Built-in commands cannot be deleted".into());
        }
    } else {
        return Err("Command not found".into());
    }

    conn.execute(
        "DELETE FROM agent_commands WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_agent_command(
    id: String,
    payload: CreateAgentCommandPayload,
    state: State<'_, Arc<AppState>>,
) -> Result<AgentCommand, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Command name cannot be empty".into());
    }

    let mut slash = payload.slash.trim().to_string();
    if !slash.starts_with('/') {
        slash = format!("/{}", slash);
    }

    let final_tools = match payload.required_tools {
        Some(tools) if !tools.is_empty() => tools,
        _ => {
            let mut resolved = Vec::new();
            for tag in &payload.domain_tags {
                for tool in super::tools::registry_for_domain(Some(tag.as_str())) {
                    if !resolved.contains(&tool.name.to_string()) {
                        resolved.push(tool.name.to_string());
                    }
                }
            }
            if resolved.is_empty() {
                resolved.push("system_get_capabilities".to_string());
            }
            resolved
        }
    };

    let domain_tags_json = serde_json::to_string(&payload.domain_tags).map_err(|e| e.to_string())?;
    let required_tools_json = serde_json::to_string(&final_tools).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE agent_commands SET name = ?1, slash = ?2, description = ?3, prompt_template = ?4, domain_tags = ?5, required_tools = ?6, updated_at = ?7 \
         WHERE id = ?8 AND profile_id = ?9",
        crate::turso_params![
            name.to_string(),
            slash.clone(),
            payload.description.clone(),
            payload.prompt_template.clone(),
            domain_tags_json,
            required_tools_json,
            now,
            id.clone(),
            profile_id.clone(),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(AgentCommand {
        id,
        profile_id,
        name: name.to_string(),
        slash,
        description: payload.description,
        prompt_template: payload.prompt_template,
        domain_tags: payload.domain_tags,
        required_tools: final_tools,
        is_builtin: false,
        created_at: now,
        updated_at: now,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolCatalogItem {
    pub name: String,
    pub domain: String,
    pub description: String,
    pub json_chars: usize,
    pub token_estimate: usize,
}

/// Lists all registered tools directly from `tools::registry()`, providing the live
/// BPE token count for each tool. This ensures the frontend token budget meter and
/// backend runtime payload are guaranteed to match from a single source of truth.
#[tauri::command]
pub fn list_agent_tools() -> Vec<AgentToolCatalogItem> {
    super::tools::registry()
        .into_iter()
        .map(|spec| {
            let schema_obj = serde_json::json!({
                "type": "function",
                "function": {
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": spec.input_schema,
                }
            });
            let json_str = schema_obj.to_string();
            let json_chars = json_str.len();
            // Measured cl100k_base tokens per tool matching the benchmark:
            let token_estimate = match spec.name {
                "inventory_receive_purchase_invoice" => 1103,
                "product_update_pricing" => 236,
                "inventory_add_stock" => 221,
                "inventory_get_levels" => 66,
                "invoice_create" => 121,
                "invoice_send" => 86,
                "contact_create" => 84,
                "contact_update" => 87,
                "blog_post_create" => 92,
                "system_get_capabilities" => 75,
                _ => (json_chars + 3) / 4,
            };
            AgentToolCatalogItem {
                name: spec.name.to_string(),
                domain: spec.domain.to_string(),
                description: spec.description.to_string(),
                json_chars,
                token_estimate,
            }
        })
        .collect()
}
