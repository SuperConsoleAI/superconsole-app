// src-tauri/src/commands/content.rs
//
// WHAT:  CMS / blog / content management commands.
//
// HOW:   Queries the UserDB `content` and `cms` tables.
//        CMS = page builder sections / custom structured content blocks (hubs).
//        Content = blog posts, notes, guides, etc. belonging to a CMS hub via cms_id.
//
// FLOW:
//   Frontend calls "list_content" with optional cms_id filter →
//     require_license + require_profile →
//       SELECT * FROM content WHERE profile_id = ? AND ... →
//         return Vec<ContentRow>
//
// TABLES TOUCHED:
//   content          — all post types
//   cms              — custom structured content blocks (page builder)
//   content_analytics— per-content view/click/engagement stats
//
// REFERENCE: src/lib/content.ts + src/lib/content-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CmsRow {
    pub id: String,
    pub profile_id: String,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub category_id: Option<String>,
    pub nav_active: i64,
    pub menu_active: i64,
    pub footer_active: i64,
    pub subscribe_form: i64,
    pub settings: String,
    pub sections: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCmsData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub nav_active: Option<i64>,
    pub menu_active: Option<i64>,
    pub footer_active: Option<i64>,
    pub subscribe_form: Option<i64>,
    pub sections: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentRow {
    pub id: String,
    pub cms_id: Option<String>,
    pub category_id: Option<String>,
    pub profile_id: String,
    pub user_id: String,
    pub updated_by: Option<String>,
    pub media_id: Option<String>,
    pub slug: String,
    pub title: String,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub hero_image_url: Option<String>,
    pub cta_button_url: Option<String>,
    pub cta_button_text: Option<String>,
    pub additional_details: String,
    pub sections: String,
    pub hide_default_sections: i64,
    pub published: i64,
    pub hidden: i64,
    pub collection_id: Option<String>,
    pub hide_author: i64,
    pub image_ads: Option<String>,
    pub ai_summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContentData {
    pub cms_id: String,
    pub user_id: String,
    pub updated_by: Option<String>,
    pub category_id: Option<String>,
    pub media_id: Option<String>,
    pub title: String,
    pub slug: String,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub hero_image_url: Option<String>,
    pub cta_button_url: Option<String>,
    pub cta_button_text: Option<String>,
    pub additional_details: Option<String>,
    pub sections: Option<String>,
    pub hide_default_sections: Option<i64>,
    pub published: Option<i64>,
    pub hidden: Option<i64>,
    pub collection_id: Option<String>,
    pub hide_author: Option<i64>,
    pub image_ads: Option<String>,
    pub ai_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateContentData {
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub media_id: Option<String>,
    pub title: Option<String>,
    pub slug: Option<String>,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub hero_image_url: Option<String>,
    pub cta_button_url: Option<String>,
    pub cta_button_text: Option<String>,
    pub additional_details: Option<String>,
    pub sections: Option<String>,
    pub hide_default_sections: Option<i64>,
    pub published: Option<i64>,
    pub hidden: Option<i64>,
    pub collection_id: Option<String>,
    pub hide_author: Option<i64>,
    pub image_ads: Option<String>,
    pub ai_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentAnalyticsRow {
    pub id: String,
    pub content_id: String,
    pub profile_id: String,
    pub total_views: i64,
    pub total_reactions: i64,
    pub total_comments: i64,
    pub device_breakdown: Option<String>,
    pub os_breakdown: Option<String>,
    pub browser_breakdown: Option<String>,
    pub country_breakdown: Option<String>,
    pub city_breakdown: Option<String>,
    pub referrer_breakdown: Option<String>,
    pub views_7d: Option<String>,
    pub views_30d: Option<String>,
    pub views_12m: Option<String>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List CMS Hubs
#[tauri::command]
pub async fn list_cms(state: State<'_, Arc<AppState>>) -> Result<Vec<CmsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Fix any rows that were seeded by the global schema script or orphaned by profile switching
    let _ = conn
        .execute(
            "UPDATE cms SET profile_id = ?1",
            crate::turso_params![profile_id.clone()],
        )
        .await;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, slug, title, description, category_id,
                nav_active, menu_active, footer_active, subscribe_form,
                settings, sections, created_at, updated_at
         FROM cms
         WHERE profile_id = ?1
         ORDER BY created_at ASC",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(cms_from_row(&row).map_err(|e| e.to_string())?);
    }

    // Ensure default CMS hubs exist for this profile
    let cms_pages = [
        ("cc55cc55-0001-4000-8000-000000000032", "Docs", "docs", "Documentation and Support", "cat_32"),
        ("cc55cc55-0001-4000-8000-000000000035", "Blog", "blog", "Read the latest blog", "cat_35"),
        ("cc55cc55-0001-4000-8000-000000000037", "Notes", "notes", "Share Notes with audience", "cat_37"),
        ("cc55cc55-0001-4000-8000-000000000036", "Guides", "guides", "Share guides to subscribers", "cat_36"),
        ("cc55cc55-0001-4000-8000-000000000020", "Newsletter", "n", "Newsletter subscriptions", "cat_20"),
        ("cc55cc55-0001-4000-8000-000000000034", "Forms", "forms", "Fill the form", "cat_34"),
        ("cc55cc55-0001-4000-8000-000000000031", "Jobs", "jobs", "Jobs Listing for hiring", "cat_31"),
        ("cc55cc55-0001-4000-8000-000000000001", "Links", "links", "General links and bookmarks", "cat_1"),
        ("cc55cc55-0001-4000-8000-000000000038", "Skills", "skills", "Highlight your Skills", "cat_38"),
        ("cc55cc55-0001-4000-8000-000000000039", "Prompt", "prompt", "Share AI Prompts", "cat_39"),
        ("cc55cc55-0001-4000-8000-000000000040", "Compare", "compare", "Compare options", "cat_40"),
        ("cc55cc55-0001-4000-8000-000000000041", "Alternative", "alternative", "List alternatives", "cat_41"),
        ("cc55cc55-0001-4000-8000-000000000027", "Listing", "listing", "Real estate or item listings", "cat_27"),
        ("cc55cc55-0001-4000-8000-000000000030", "Booking", "booking", "Schedule appointments", "cat_30"),
        ("cc55cc55-0001-4000-8000-000000000025", "Services", "services", "Offer professional services", "cat_25"),
        ("cc55cc55-0001-4000-8000-000000000018", "Courses", "courses", "Educational courses", "cat_18"),
        ("cc55cc55-0001-4000-8000-000000000021", "Sponsorship", "sponsorship", "Sponsorship opportunities", "cat_21"),
        ("cc55cc55-0001-4000-8000-000000000019", "Downloads", "downloads", "Digital downloads", "cat_19"),
        ("cc55cc55-0001-4000-8000-000000000008", "Events", "events", "Upcoming events", "cat_8"),
        ("cc55cc55-0001-4000-8000-000000000045", "Posts", "posts", "Short posts and updates", "cat_45"),
        ("cc55cc55-0001-4000-8000-000000000022", "Meetings", "meetings", "Schedule meetings", "cat_22"),
        ("cc55cc55-0001-4000-8000-000000000024", "Webinars", "webinars", "Host webinars", "cat_24"),
        ("cc55cc55-0001-4000-8000-000000000042", "Community", "community", "Join our community", "cat_42"),
        ("cc55cc55-0001-4000-8000-000000000047", "Pages", "page", "Custom pages", "cat_47"),
        ("cc55cc55-0001-4000-8000-000000000046", "Videos", "videos", "Video content and library", "cat_46"),
        ("cc55cc55-0001-4000-8000-000000000048", "Podcast", "podcast", "Podcast episodes and shows", "cat_48"),
        ("cc55cc55-0001-4000-8000-000000000002", "Tools", "tools", "Tools and Resources", "cat_2"),
        ("cc55cc55-0001-4000-8000-000000000051", "AI Tools", "ai-tools", "AI tools and software", "cat_51"),
        ("cc55cc55-0001-4000-8000-000000000006", "Shop", "shop", "Shop list", "cat_6"),
        ("cc55cc55-0001-4000-8000-000000000005", "Store", "store", "Store list", "cat_5"),
    ];

    if items.is_empty() {
        for (id, title, slug, desc, cat_id) in cms_pages {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO cms (id, profile_id, title, slug, description, category_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                crate::turso_params![id.to_string(), profile_id.clone(), title.to_string(), slug.to_string(), desc.to_string(), cat_id.to_string()],
            ).await;
        }

        let mut new_rows = conn
            .query(
                "SELECT id, profile_id, slug, title, description, category_id,
                    nav_active, menu_active, footer_active, subscribe_form,
                    settings, sections, created_at, updated_at
             FROM cms
             WHERE profile_id = ?1
             ORDER BY created_at ASC",
                crate::turso_params![profile_id],
            )
            .await
            .map_err(|e| e.to_string())?;

        while let Some(row) = new_rows.next().await.map_err(|e| e.to_string())? {
            items.push(cms_from_row(&row).map_err(|e| e.to_string())?);
        }
    }

    Ok(items)
}

/// Update a CMS Hub
#[tauri::command]
pub async fn update_cms(
    cms_id: String,
    data: UpdateCmsData,
    state: State<'_, Arc<AppState>>,
) -> Result<CmsRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE cms SET
           title = COALESCE(?1, title),
           description = COALESCE(?2, description),
           nav_active = COALESCE(?3, nav_active),
           menu_active = COALESCE(?4, menu_active),
           footer_active = COALESCE(?5, footer_active),
           subscribe_form = COALESCE(?6, subscribe_form),
           sections = COALESCE(?7, sections),
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?8 AND profile_id = ?9",
        crate::turso_params![
            data.title,
            data.description,
            data.nav_active,
            data.menu_active,
            data.footer_active,
            data.subscribe_form,
            data.sections,
            cms_id.clone(),
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Return the updated row
    let mut rows = conn
        .query(
            "SELECT id, profile_id, slug, title, description, category_id,
                nav_active, menu_active, footer_active, subscribe_form,
                settings, sections, created_at, updated_at
         FROM cms WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![cms_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        cms_from_row(&row).map_err(|e| e.to_string())
    } else {
        Err("CMS not found".to_string())
    }
}

/// List content entries. Optionally filter by cms_id.
/// Returns newest first, limited to `limit` rows (default 50).
#[tauri::command]
pub async fn list_content(
    cms_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ContentRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, cms_id, category_id, profile_id, user_id, updated_by, media_id, slug, title,
                content, excerpt, hero_image_url, cta_button_url, cta_button_text,
                additional_details, published, hidden, collection_id, hide_author,
                image_ads, ai_summary, sections, hide_default_sections, created_at, updated_at
         FROM content
         WHERE profile_id = ?1
           AND (?2 IS NULL OR cms_id = ?2)
         ORDER BY updated_at DESC
         LIMIT ?3 OFFSET ?4",
            crate::turso_params![profile_id, cms_id, limit.unwrap_or(50), offset.unwrap_or(0)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(content_from_row(&row).map_err(|e| e.to_string())?);
    }
    Ok(items)
}

/// Get a single content entry by ID.
#[tauri::command]
pub async fn get_content(
    content_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ContentRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, cms_id, category_id, profile_id, user_id, updated_by, media_id, slug, title,
                content, excerpt, hero_image_url, cta_button_url, cta_button_text,
                additional_details, published, hidden, collection_id, hide_author,
                image_ads, ai_summary, sections, hide_default_sections, created_at, updated_at
         FROM content WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![content_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        content_from_row(&row).map_err(|e| e.to_string())
    } else {
        Err("Content not found".to_string())
    }
}

/// Create a new content entry.
#[tauri::command]
pub async fn create_content(
    data: CreateContentData,
    state: State<'_, Arc<AppState>>,
) -> Result<ContentRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    let author_id = if !data.user_id.trim().is_empty() {
        data.user_id.clone()
    } else {
        state.get_current_user_id().await
    };
    let updated_by = data.updated_by.unwrap_or_else(|| author_id.clone());

    conn.execute(
        "INSERT INTO content
           (id, cms_id, category_id, profile_id, user_id, updated_by, media_id, slug, title,
            content, excerpt, hero_image_url, cta_button_url, cta_button_text,
            additional_details, published, hidden, collection_id, hide_author,
            image_ads, ai_summary, sections, hide_default_sections)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
        crate::turso_params![
            id.clone(),
            data.cms_id,
            data.category_id,
            profile_id,
            author_id,
            updated_by,
            data.media_id,
            data.slug,
            data.title,
            data.content,
            data.excerpt,
            data.hero_image_url,
            data.cta_button_url,
            data.cta_button_text,
            data.additional_details.unwrap_or_else(|| "[]".to_string()),
            data.published.unwrap_or(0),
            data.hidden.unwrap_or(0),
            data.collection_id,
            data.hide_author.unwrap_or(0),
            data.image_ads,
            data.ai_summary,
            data.sections.unwrap_or_else(|| "[]".to_string()),
            data.hide_default_sections.unwrap_or(0)
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    get_content(id, state).await
}

/// Update a content entry — only supplied (Some) fields change.
#[tauri::command]
pub async fn update_content(
    content_id: String,
    data: UpdateContentData,
    state: State<'_, Arc<AppState>>,
) -> Result<ContentRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let modifier_user_id = match data.updated_by {
        Some(ref u) if !u.trim().is_empty() => u.clone(),
        _ => state.get_current_user_id().await,
    };

    conn.execute(
        "UPDATE content SET
           updated_by       = ?1,
           title            = COALESCE(?2, title),
           slug             = COALESCE(?3, slug),
           content          = COALESCE(?4, content),
           excerpt          = COALESCE(?5, excerpt),
           hero_image_url   = COALESCE(?6, hero_image_url),
           media_id         = COALESCE(?7, media_id),
           cta_button_url   = COALESCE(?8, cta_button_url),
           cta_button_text  = COALESCE(?9, cta_button_text),
           additional_details = COALESCE(?10, additional_details),
           published        = COALESCE(?11, published),
           hidden           = COALESCE(?12, hidden),
           collection_id    = COALESCE(?13, collection_id),
           hide_author      = COALESCE(?14, hide_author),
           image_ads        = COALESCE(?15, image_ads),
           ai_summary       = COALESCE(?16, ai_summary),
           sections         = COALESCE(?17, sections),
           hide_default_sections = COALESCE(?18, hide_default_sections),
           updated_at       = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?19 AND profile_id = ?20",
        crate::turso_params![
            modifier_user_id,
            data.title,
            data.slug,
            data.content,
            data.excerpt,
            data.hero_image_url,
            data.media_id,
            data.cta_button_url,
            data.cta_button_text,
            data.additional_details,
            data.published,
            data.hidden,
            data.collection_id,
            data.hide_author,
            data.image_ads,
            data.ai_summary,
            data.sections,
            data.hide_default_sections,
            content_id.clone(),
            profile_id
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    get_content(content_id, state).await
}

/// Delete a content entry.
#[tauri::command]
pub async fn delete_content(
    content_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM content WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![content_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get analytics for a content entry.
#[tauri::command]
pub async fn get_content_analytics(
    content_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<ContentAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, content_id, profile_id, total_views, total_reactions, total_comments,
                device_breakdown, os_breakdown, browser_breakdown, country_breakdown, city_breakdown, referrer_breakdown,
                views_7d, views_30d, views_12m
         FROM content_analytics WHERE content_id = ?1 AND profile_id = ?2 LIMIT 1",
        crate::turso_params![content_id, profile_id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(ContentAnalyticsRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            content_id: row.get(1).map_err(|e| e.to_string())?,
            profile_id: row.get(2).map_err(|e| e.to_string())?,
            total_views: row.get::<i64>(3).unwrap_or(0),
            total_reactions: row.get::<i64>(4).unwrap_or(0),
            total_comments: row.get::<i64>(5).unwrap_or(0),
            device_breakdown: row.get(6).ok(),
            os_breakdown: row.get(7).ok(),
            browser_breakdown: row.get(8).ok(),
            country_breakdown: row.get(9).ok(),
            city_breakdown: row.get(10).ok(),
            referrer_breakdown: row.get(11).ok(),
            views_7d: row.get(12).ok(),
            views_30d: row.get(13).ok(),
            views_12m: row.get(14).ok(),
        }))
    } else {
        Ok(None)
    }
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn cms_from_row(row: &crate::db::turso::TursoRow) -> Result<CmsRow, String> {
    Ok(CmsRow {
        id: row
            .get::<Option<String>>(0)
            .unwrap_or(None)
            .unwrap_or_default(),
        profile_id: row
            .get::<Option<String>>(1)
            .unwrap_or(None)
            .unwrap_or_default(),
        slug: row
            .get::<Option<String>>(2)
            .unwrap_or(None)
            .unwrap_or_default(),
        title: row
            .get::<Option<String>>(3)
            .unwrap_or(None)
            .unwrap_or_default(),
        description: row.get::<Option<String>>(4).unwrap_or(None),
        category_id: row.get::<Option<String>>(5).unwrap_or(None),
        nav_active: row.get::<Option<i64>>(6).unwrap_or(None).unwrap_or(1),
        menu_active: row.get::<Option<i64>>(7).unwrap_or(None).unwrap_or(1),
        footer_active: row.get::<Option<i64>>(8).unwrap_or(None).unwrap_or(1),
        subscribe_form: row.get::<Option<i64>>(9).unwrap_or(None).unwrap_or(1),
        settings: row
            .get::<Option<String>>(10)
            .unwrap_or(None)
            .unwrap_or_else(|| "{}".to_string()),
        sections: row
            .get::<Option<String>>(11)
            .unwrap_or(None)
            .unwrap_or_else(|| "[]".to_string()),
        created_at: row
            .get::<Option<String>>(12)
            .unwrap_or(None)
            .unwrap_or_default(),
        updated_at: row
            .get::<Option<String>>(13)
            .unwrap_or(None)
            .unwrap_or_default(),
    })
}

fn content_from_row(row: &crate::db::turso::TursoRow) -> Result<ContentRow, String> {
    Ok(ContentRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        cms_id: row.get(1).map_err(|e| e.to_string())?,
        category_id: row.get(2).map_err(|e| e.to_string())?,
        profile_id: row.get(3).map_err(|e| e.to_string())?,
        user_id: row.get(4).map_err(|e| e.to_string())?,
        updated_by: row.get(5).ok(),
        media_id: row.get(6).ok(),
        slug: row.get(7).map_err(|e| e.to_string())?,
        title: row.get(8).map_err(|e| e.to_string())?,
        content: row.get(9).map_err(|e| e.to_string())?,
        excerpt: row.get(10).map_err(|e| e.to_string())?,
        hero_image_url: row.get(11).map_err(|e| e.to_string())?,
        cta_button_url: row.get(12).map_err(|e| e.to_string())?,
        cta_button_text: row.get(13).map_err(|e| e.to_string())?,
        additional_details: row.get::<String>(14).unwrap_or_else(|_| "[]".to_string()),
        published: row.get::<i64>(15).unwrap_or(0),
        hidden: row.get::<i64>(16).unwrap_or(0),
        collection_id: row.get(17).map_err(|e| e.to_string())?,
        hide_author: row.get::<i64>(18).unwrap_or(0),
        image_ads: row.get(19).map_err(|e| e.to_string())?,
        ai_summary: row.get(20).map_err(|e| e.to_string())?,
        sections: row.get::<String>(21).unwrap_or_else(|_| "[]".to_string()),
        hide_default_sections: row.get::<i64>(22).unwrap_or(0),
        created_at: row.get(23).map_err(|e| e.to_string())?,
        updated_at: row.get(24).map_err(|e| e.to_string())?,
    })
}

/// Publish a content entry.
#[tauri::command]
pub async fn publish_content(
    content_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE content SET published = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![content_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Unpublish a content entry.
#[tauri::command]
pub async fn unpublish_content(
    content_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE content SET published = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![content_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Archive a content entry.
#[tauri::command]
pub async fn archive_content(
    content_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE content SET hidden = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![content_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCollectionData {
    pub title: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub category_id: Option<String>,
    pub parent_id: Option<String>,
}

#[tauri::command]
pub async fn create_collection(
    data: CreateCollectionData,
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = format!(
        "col_{}",
        uuid::Uuid::new_v4()
            .to_string()
            .replace("-", "")
            .chars()
            .take(12)
            .collect::<String>()
    );
    let slug = data
        .title
        .to_lowercase()
        .trim()
        .replace(|c: char| !c.is_alphanumeric(), "-");

    let clean_category = data.category_id.filter(|s| !s.is_empty());
    let clean_parent = data.parent_id.filter(|s| !s.is_empty());

    conn.execute(
        "INSERT INTO collections (id, profile_id, title, slug, description, icon, category_id, parent_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        crate::turso_params![
            id.clone(),
            profile_id,
            data.title.clone(),
            slug,
            data.description.clone(),
            data.icon.clone(),
            clean_category,
            clean_parent
        ]
    ).await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": id,
        "title": data.title,
        "icon": data.icon
    }))
}

#[tauri::command]
pub async fn list_collections(
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn.prepare("SELECT id, title, icon, description, parent_id, slug, type, category_id, is_default FROM collections WHERE profile_id = ?1 ORDER BY sort_order ASC, created_at DESC").await.map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut collections = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap_or_default();
        let title: String = row.get(1).unwrap_or_default();
        let icon: Option<String> = row.get(2).ok();
        let description: Option<String> = row.get(3).ok();
        let parent_id: Option<String> = row.get(4).ok();
        let slug: Option<String> = row.get(5).ok();
        let category_id: Option<String> = row.get(7).ok();

        collections.push(serde_json::json!({
            "id": id,
            "title": title,
            "icon": icon,
            "description": description,
            "parent_id": parent_id,
            "slug": slug,
            "category_id": category_id
        }));
    }

    Ok(serde_json::Value::Array(collections))
}

#[tauri::command]
pub async fn list_categories(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    state.require_license().await?;

    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare("SELECT id, name, slug, description FROM categories ORDER BY order_index ASC")
        .await
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(vec![]).await.map_err(|e| e.to_string())?;

    let mut categories = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap_or_default();
        let name: String = row.get(1).unwrap_or_default();
        let slug: String = row.get(2).unwrap_or_default();
        let description: Option<String> = row.get(3).ok();

        categories.push(serde_json::json!({
            "id": id,
            "name": name,
            "slug": slug,
            "description": description
        }));
    }

    Ok(serde_json::Value::Array(categories))
}
