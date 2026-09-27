// src-tauri/src/commands/agents/tools/content.rs
// Content Domain Tools: Blog Posts and Content Publishing.

use super::ToolCtx;
use crate::turso_params;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn blog_post_create(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let title = args
        .get("title")
        .and_then(Value::as_str)
        .ok_or("Missing required field: title")?;
    let body_or_brief = args
        .get("body_or_brief")
        .and_then(Value::as_str)
        .ok_or("Missing required field: body_or_brief")?;
    let status_str = args.get("status").and_then(Value::as_str).unwrap_or("draft");

    let published = if status_str == "publish" || status_str == "published" {
        1i64
    } else {
        0i64
    };

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    let post_id = format!("post_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let slug = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-");
    let clean_slug = if slug.is_empty() {
        format!("post-{}", &post_id[5..10])
    } else {
        slug
    };

    conn.execute(
        "INSERT INTO content \
         (id, profile_id, slug, title, content, published, hidden, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        turso_params![
            post_id.clone(),
            profile_id,
            clean_slug.clone(),
            title,
            body_or_brief,
            published
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(json!({
        "post_id": post_id,
        "title": title,
        "slug": clean_slug,
        "status": if published == 1 { "published" } else { "draft" }
    }))
}
