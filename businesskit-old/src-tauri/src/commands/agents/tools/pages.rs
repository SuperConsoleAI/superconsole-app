// src-tauri/src/commands/agents/tools/pages.rs
// Agent tool implementations for the "pages" domain (Website / Pages management).

use super::ToolCtx;
use serde_json::{json, Value};
use uuid::Uuid;

/// Draft or create a new website page.
pub async fn page_create(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let title = args
        .get("title")
        .and_then(Value::as_str)
        .ok_or_else(|| "Missing required parameter: title".to_string())?
        .trim();

    if title.is_empty() {
        return Err("Title cannot be empty".to_string());
    }

    let default_slug = title
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-");

    let slug = args
        .get("slug")
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(default_slug);

    let excerpt = args
        .get("excerpt")
        .and_then(Value::as_str)
        .map(|s| s.to_string());

    let published = args
        .get("published")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let content_markdown = args
        .get("content")
        .or_else(|| args.get("body"))
        .or_else(|| args.get("content_markdown"))
        .and_then(Value::as_str)
        .unwrap_or("");

    let sections = if content_markdown.is_empty() {
        "[]".to_string()
    } else {
        serde_json::to_string(&vec![json!({
            "type": "markdown",
            "content": content_markdown
        })])
        .unwrap_or_else(|_| "[]".to_string())
    };

    let id = format!("page_{}", Uuid::new_v4().simple());
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    ctx.user_db
        .execute(
            "INSERT INTO pages
               (id, profile_id, user_id, slug, title, excerpt, sections, faq,
                published, nav_active, menu_active, footer_active,
                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '[]', ?8, 1, 1, 1, ?9, ?9)",
            crate::turso_params![
                id.clone(),
                ctx.profile_id.clone(),
                ctx.agent_user_id.clone(),
                slug.clone(),
                title.to_string(),
                excerpt,
                sections,
                if published { 1 } else { 0 },
                now
            ],
        )
        .await
        .map_err(|e| format!("Failed to create page: {e}"))?;

    Ok(json!({
        "success": true,
        "page": {
            "id": id,
            "title": title,
            "slug": slug,
            "published": published,
            "url": format!("/dashboard/pages/{}", id)
        },
        "message": format!("Website page '{}' created successfully (slug: /{})", title, slug)
    }))
}

/// Publish or unpublish a website page.
pub async fn page_publish(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let target = args
        .get("page_id_or_slug")
        .or_else(|| args.get("id"))
        .or_else(|| args.get("slug"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Missing required parameter: page_id_or_slug".to_string())?
        .trim();

    let publish_state = args
        .get("published")
        .or_else(|| args.get("publish"))
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let affected = ctx
        .user_db
        .execute(
            "UPDATE pages
             SET published = ?1, updated_at = ?2
             WHERE profile_id = ?3 AND (id = ?4 OR slug = ?4)",
            crate::turso_params![
                if publish_state { 1 } else { 0 },
                now,
                ctx.profile_id.clone(),
                target
            ],
        )
        .await
        .map_err(|e| format!("Failed to update page status: {e}"))?;

    if affected == 0 {
        return Err(format!("Page with id or slug '{target}' not found"));
    }

    Ok(json!({
        "success": true,
        "target": target,
        "published": publish_state,
        "message": format!(
            "Page '{}' is now {}",
            target,
            if publish_state { "published" } else { "draft" }
        )
    }))
}

/// List website pages for the profile.
pub async fn page_list(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let published_only = args
        .get("published_only")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let query = if published_only {
        "SELECT id, title, slug, excerpt, published, updated_at
         FROM pages
         WHERE profile_id = ?1 AND published = 1
         ORDER BY updated_at DESC LIMIT 30"
    } else {
        "SELECT id, title, slug, excerpt, published, updated_at
         FROM pages
         WHERE profile_id = ?1
         ORDER BY updated_at DESC LIMIT 30"
    };

    let mut rows = ctx
        .user_db
        .query(query, crate::turso_params![ctx.profile_id.clone()])
        .await
        .map_err(|e| format!("Failed to query pages: {e}"))?;

    let mut pages = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let id: String = row.get(0).unwrap_or_default();
        let title: String = row.get(1).unwrap_or_default();
        let slug: String = row.get(2).unwrap_or_default();
        let excerpt: Option<String> = row.get(3).ok();
        let pub_val: i64 = row.get(4).unwrap_or(0);
        let updated_at: i64 = row.get(5).unwrap_or(0);

        pages.push(json!({
            "id": id,
            "title": title,
            "slug": slug,
            "excerpt": excerpt,
            "published": pub_val != 0,
            "updated_at": updated_at
        }));
    }

    Ok(json!({
        "total": pages.len(),
        "pages": pages
    }))
}
