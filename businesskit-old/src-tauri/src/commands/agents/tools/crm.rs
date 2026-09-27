// src-tauri/src/commands/agents/tools/crm.rs
// CRM Domain Tools: Contacts and Leads Management.

use super::ToolCtx;
use crate::db::turso::TursoParam;
use crate::turso_params;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn contact_create(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let name = args
        .get("name")
        .and_then(Value::as_str)
        .ok_or("Missing required field: name")?;
    let email = args.get("email").and_then(Value::as_str).unwrap_or("");
    let phone = args.get("phone").and_then(Value::as_str).unwrap_or("");
    let tags = args
        .get("tags")
        .map(|t| t.to_string())
        .unwrap_or_else(|| "[]".to_string());

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // Split name into first and last
    let parts: Vec<&str> = name.split_whitespace().collect();
    let first_name = parts.first().copied().unwrap_or(name);
    let last_name = if parts.len() > 1 {
        parts[1..].join(" ")
    } else {
        String::new()
    };

    let contact_id = format!("ct_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);

    conn.execute(
        "INSERT INTO crm_contacts \
         (id, profile_id, first_name, last_name, email, phone, tags, status, outreach_status, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'lead', 'not_contacted', strftime('%s','now'), strftime('%s','now'))",
        turso_params![
            contact_id.clone(),
            profile_id,
            first_name,
            last_name,
            email,
            phone,
            tags
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({
        "contact_id": contact_id,
        "name": name,
        "email": email,
        "phone": phone,
        "status": "created"
    }))
}

pub async fn contact_update(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let contact_id = args
        .get("contact_id")
        .and_then(Value::as_str)
        .ok_or("Missing required field: contact_id")?;
    let fields = args
        .get("fields")
        .and_then(Value::as_object)
        .ok_or("Missing required field: fields")?;

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    if fields.is_empty() {
        return Ok(json!({ "contact_id": contact_id, "status": "no_changes" }));
    }

    let mut set_clauses = Vec::new();
    let mut params: Vec<TursoParam> = Vec::new();
    let mut idx = 1;

    for (k, v) in fields {
        let val_str = match v {
            Value::String(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => {
                if *b {
                    "1".into()
                } else {
                    "0".into()
                }
            }
            other => other.to_string(),
        };

        // Allowed safe columns in crm_contacts
        match k.as_str() {
            "first_name" | "last_name" | "email" | "phone" | "company" | "job_title"
            | "website" | "bio" | "status" | "outreach_status" | "notes" | "tags" => {
                set_clauses.push(format!("{} = ?{}", k, idx));
                params.push(TursoParam::Text(val_str));
                idx += 1;
            }
            _ => {}
        }
    }

    if set_clauses.is_empty() {
        return Err("No valid contact fields provided to update".into());
    }

    set_clauses.push("updated_at = strftime('%s','now')".to_string());

    let sql = format!(
        "UPDATE crm_contacts SET {} WHERE profile_id = ?{} AND (id = ?{} OR email = ?{})",
        set_clauses.join(", "),
        idx,
        idx + 1,
        idx + 1
    );
    params.push(TursoParam::Text(profile_id.to_string()));
    params.push(TursoParam::Text(contact_id.to_string()));

    conn.execute(&sql, params).await.map_err(|e| e.to_string())?;

    Ok(json!({ "contact_id": contact_id, "status": "updated" }))
}
