// src-tauri/src/commands/analytics.rs
//
// WHAT:  Analytics read commands — profile visits, link clicks, product views,
//        social icon clicks, and aggregate breakdowns.
//
// HOW:   All data is already stored in UserDB by the CF Worker (which handles
//        public traffic). The desktop app reads these tables to power the
//        analytics dashboard. No writes here — analytics are recorded by the
//        deployed Worker, not the desktop app.
//
// FLOW:
//   Frontend calls get_analytics_summary →
//     reads profile_analytics (1 row per profile, trigger-maintained totals)
//     reads link_analytics  (1 row per link)
//     reads product_analytics (1 row per product)
//   Returns typed aggregate structs.
//
// TABLES READ (never written by desktop):
//   profile_analytics  — total visits, unique visits, clicks, link clicks, revenue
//   link_analytics     — per-link click count + referrer breakdown
//   product_analytics  — per-product views, sales, revenue, email stats
//   page_analytics     — per-page views, unique views, bot views

use crate::commands::content::ContentAnalyticsRow;
use crate::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ProfileAnalyticsRow {
    pub profile_id: String,
    pub total_visits: i64,
    pub unique_visits: i64,
    pub total_link_clicks: i64,
    pub total_product_views: i64,
    pub total_revenue: i64,       // cents
    pub top_countries: String,    // JSON {}
    pub top_referrers: String,    // JSON {}
    pub device_breakdown: String, // JSON {}
    pub visits_7d: String,        // JSON []
    pub visits_30d: String,       // JSON []
    pub visits_12m: Option<String>,
    pub views_7d: Option<String>,
    pub views_30d: Option<String>,
    pub views_12m: Option<String>,
    pub clicks_7d: Option<String>,
    pub clicks_30d: Option<String>,
    pub clicks_12m: Option<String>,
    pub device_clicks: Option<String>,
    pub os_clicks: Option<String>,
    pub browser_clicks: Option<String>,
    pub country_clicks: Option<String>,
    pub city_clicks: Option<String>,
    pub referrer_clicks: Option<String>,
    pub updated_at: i64,
    pub last_aggregated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkAnalyticsRow {
    pub link_id: String,
    pub profile_id: String,
    pub total_clicks: i64,
    pub device_clicks: Option<String>,
    pub os_clicks: Option<String>,
    pub browser_clicks: Option<String>,
    pub country_clicks: Option<String>,
    pub city_clicks: Option<String>,
    pub referrer_clicks: Option<String>,
    pub clicks_lifetime: Option<String>,
    pub clicks_7d: Option<String>,
    pub clicks_30d: Option<String>,
    pub clicks_12m: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProductAnalyticsRow {
    pub product_id: String,
    pub profile_id: String,
    pub total_views: i64,
    pub unique_views: i64,
    pub total_sales: i64,
    pub total_revenue: i64,
    pub email_open: i64,
    pub email_clicks: i64,
    pub updated_at: i64,
    pub views_7d: Option<String>,
    pub views_30d: Option<String>,
    pub views_12m: Option<String>,
    pub sales_7d: Option<String>,
    pub sales_30d: Option<String>,
    pub sales_12m: Option<String>,
    pub revenue_7d: Option<String>,
    pub revenue_30d: Option<String>,
    pub revenue_12m: Option<String>,
    pub visits_7d: Option<String>,
    pub visits_30d: Option<String>,
    pub visits_12m: Option<String>,
    pub device_breakdown: Option<String>,
    pub os_breakdown: Option<String>,
    pub browser_breakdown: Option<String>,
    pub views_country_breakdown: Option<String>,
    pub views_city_breakdown: Option<String>,
    pub views_referrer_breakdown: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageAnalyticsRow {
    pub page_id: String,
    pub profile_id: String,
    pub views: i64,
    pub unique_views: i64,
    pub bot_views: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryAnalyticsRow {
    pub category_id: String,
    pub category_slug: Option<String>,
    pub profile_id: String,
    pub total_links: i64,
    pub active_links: i64,
    pub total_clicks: i64,
    pub total_views: i64,
    pub total_visits: i64,
    pub views_7d: Option<String>,
    pub views_30d: Option<String>,
    pub views_12m: Option<String>,
    pub views_lifetime: Option<String>,
    pub visits_device_breakdown: Option<String>,
    pub visits_os_breakdown: Option<String>,
    pub visits_browser_breakdown: Option<String>,
    pub visits_country_breakdown: Option<String>,
    pub visits_city_breakdown: Option<String>,
    pub visits_referrer_breakdown: Option<String>,
    pub visits_7d: Option<String>,
    pub visits_30d: Option<String>,
    pub visits_12m: Option<String>,
    pub visits_lifetime: Option<String>,
    pub device_clicks: Option<String>,
    pub os_clicks: Option<String>,
    pub browser_clicks: Option<String>,
    pub country_clicks: Option<String>,
    pub city_clicks: Option<String>,
    pub referrer_clicks: Option<String>,
    pub clicks_lifetime: Option<String>,
    pub clicks_7d: Option<String>,
    pub clicks_30d: Option<String>,
    pub clicks_12m: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobAnalyticsRow {
    pub id: String,
    pub job_id: String,
    pub profile_id: String,
    pub bot_views: i64,
    pub total_views: i64,
    pub total_visits: i64,
    pub total_applications: i64,
    pub device_breakdown: String,
    pub os_breakdown: String,
    pub browser_breakdown: String,
    pub country_breakdown: String,
    pub city_breakdown: String,
    pub referrer_breakdown: String,
    pub utm_source_breakdown: String,
    pub utm_medium_breakdown: String,
    pub utm_campaign_breakdown: String,
    pub views_device_breakdown: String,
    pub views_os_breakdown: String,
    pub views_browser_breakdown: String,
    pub views_country_breakdown: String,
    pub views_city_breakdown: String,
    pub views_referrer_breakdown: String,
    pub views_7d: String,
    pub views_30d: String,
    pub views_12m: String,
    pub views_lifetime: String,
    pub applications_7d: String,
    pub applications_30d: String,
    pub applications_12m: String,
    pub applications_lifetime: String,
    pub last_aggregated_at: Option<i64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CmsAnalyticsRow {
    pub id: Option<String>,
    pub cms_id: String,
    pub slug: Option<String>,
    pub total_posts: i64,
    pub total_published: i64,
    pub total_sales: i64,
    pub total_revenue: i64,
    pub views_7d: Option<String>,
    pub views_30d: Option<String>,
    pub views_12m: Option<String>,
    pub sales_7d: Option<String>,
    pub sales_30d: Option<String>,
    pub sales_12m: Option<String>,
    pub revenue_7d: Option<String>,
    pub revenue_30d: Option<String>,
    pub revenue_12m: Option<String>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Get the top-level profile analytics row (visits, clicks, revenue totals).
#[tauri::command]
pub async fn get_profile_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<ProfileAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Ensure a row exists so the UI can always display last_aggregated_at
    conn.execute(
        "INSERT OR IGNORE INTO profile_analytics (id, profile_id) VALUES (hex(randomblob(16)), ?1)",
        crate::turso_params![profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT profile_id, total_visits, 0 as unique_visits, total_clicks as total_link_clicks,
                total_views as total_product_views, total_earnings as total_revenue,
                COALESCE(visits_country_breakdown,'{}'), COALESCE(visits_referrer_breakdown,'{}'),
                COALESCE(visits_device_breakdown,'{}'),
                COALESCE(visits_7d,'[]'), COALESCE(visits_30d,'[]'), visits_12m,
                views_7d, views_30d, views_12m,
                clicks_7d, clicks_30d, clicks_12m,
                device_clicks, os_clicks, browser_clicks, country_clicks, city_clicks, referrer_clicks,
                updated_at, last_aggregated_at
         FROM profile_analytics WHERE profile_id = ?1 LIMIT 1",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(ProfileAnalyticsRow {
            profile_id: row.get(0).map_err(|e| e.to_string())?,
            total_visits: row.get::<i64>(1).unwrap_or(0),
            unique_visits: row.get::<i64>(2).unwrap_or(0),
            total_link_clicks: row.get::<i64>(3).unwrap_or(0),
            total_product_views: row.get::<i64>(4).unwrap_or(0),
            total_revenue: row.get::<i64>(5).unwrap_or(0),
            top_countries: row.get::<String>(6).unwrap_or_else(|_| "{}".into()),
            top_referrers: row.get::<String>(7).unwrap_or_else(|_| "{}".into()),
            device_breakdown: row.get::<String>(8).unwrap_or_else(|_| "{}".into()),
            visits_7d: row.get::<String>(9).unwrap_or_else(|_| "[]".into()),
            visits_30d: row.get::<String>(10).unwrap_or_else(|_| "[]".into()),
            visits_12m: row.get(11).unwrap_or(None),
            views_7d: row.get(12).unwrap_or(None),
            views_30d: row.get(13).unwrap_or(None),
            views_12m: row.get(14).unwrap_or(None),
            clicks_7d: row.get(15).unwrap_or(None),
            clicks_30d: row.get(16).unwrap_or(None),
            clicks_12m: row.get(17).unwrap_or(None),
            device_clicks: row.get(18).unwrap_or(None),
            os_clicks: row.get(19).unwrap_or(None),
            browser_clicks: row.get(20).unwrap_or(None),
            country_clicks: row.get(21).unwrap_or(None),
            city_clicks: row.get(22).unwrap_or(None),
            referrer_clicks: row.get(23).unwrap_or(None),
            updated_at: row.get::<i64>(24).unwrap_or(0),
            last_aggregated_at: row.get::<i64>(25).unwrap_or(0),
        }))
    } else {
        Ok(None)
    }
}

/// Get link analytics for all links belonging to the active profile (summary).
#[tauri::command]
pub async fn get_link_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LinkAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT link_id, profile_id, total_clicks, updated_at
         FROM link_analytics WHERE profile_id = ?1
         ORDER BY total_clicks DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(LinkAnalyticsRow {
            link_id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            total_clicks: row.get::<i64>(2).unwrap_or(0),
            device_clicks: None,
            os_clicks: None,
            browser_clicks: None,
            country_clicks: None,
            city_clicks: None,
            referrer_clicks: None,
            clicks_lifetime: None,
            clicks_7d: None,
            clicks_30d: None,
            clicks_12m: None,
            updated_at: row.get::<i64>(3).unwrap_or(0),
        });
    }
    Ok(items)
}

/// Get detailed link analytics for a specific link.
#[tauri::command]
pub async fn get_single_link_analytics(
    link_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<LinkAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT link_id, profile_id, total_clicks,
                device_clicks, os_clicks, browser_clicks, country_clicks, city_clicks, referrer_clicks,
                clicks_lifetime, clicks_7d, clicks_30d, clicks_12m, updated_at
         FROM link_analytics
         WHERE link_id = ?1 AND profile_id = ?2",
        crate::turso_params![link_id, profile_id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(LinkAnalyticsRow {
            link_id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            total_clicks: row.get::<i64>(2).unwrap_or(0),
            device_clicks: row.get(3).unwrap_or(None),
            os_clicks: row.get(4).unwrap_or(None),
            browser_clicks: row.get(5).unwrap_or(None),
            country_clicks: row.get(6).unwrap_or(None),
            city_clicks: row.get(7).unwrap_or(None),
            referrer_clicks: row.get(8).unwrap_or(None),
            clicks_lifetime: row.get(9).unwrap_or(None),
            clicks_7d: row.get(10).unwrap_or(None),
            clicks_30d: row.get(11).unwrap_or(None),
            clicks_12m: row.get(12).unwrap_or(None),
            updated_at: row.get::<i64>(13).unwrap_or(0),
        }))
    } else {
        Ok(None)
    }
}

/// Get category analytics for all categories belonging to the active profile.
#[tauri::command]
pub async fn get_category_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CategoryAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT a.category_id, a.profile_id, a.total_links, a.active_links,
                a.total_clicks, a.total_views, a.updated_at, c.slug, a.total_visits
         FROM link_analytics_by_category a
         LEFT JOIN categories c ON c.id = a.category_id
         WHERE a.profile_id = ?1
         ORDER BY a.total_clicks DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(CategoryAnalyticsRow {
            category_id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            total_links: row.get::<i64>(2).unwrap_or(0),
            active_links: row.get::<i64>(3).unwrap_or(0),
            total_clicks: row.get::<i64>(4).unwrap_or(0),
            total_views: row.get::<i64>(5).unwrap_or(0),
            total_visits: row.get::<i64>(8).unwrap_or(0),
            views_7d: None,
            views_30d: None,
            views_12m: None,
            views_lifetime: None,
            visits_device_breakdown: None,
            visits_os_breakdown: None,
            visits_browser_breakdown: None,
            visits_country_breakdown: None,
            visits_city_breakdown: None,
            visits_referrer_breakdown: None,
            visits_7d: None,
            visits_30d: None,
            visits_12m: None,
            visits_lifetime: None,
            device_clicks: None,
            os_clicks: None,
            browser_clicks: None,
            country_clicks: None,
            city_clicks: None,
            referrer_clicks: None,
            clicks_lifetime: None,
            clicks_7d: None,
            clicks_30d: None,
            clicks_12m: None,
            updated_at: row.get::<String>(6).unwrap_or_else(|_| "".into()),
            category_slug: row.get(7).ok(),
        });
    }
    Ok(items)
}

/// Get detailed category analytics for a specific category slug.
#[tauri::command]
pub async fn get_single_category_analytics(
    slug: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<CategoryAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT a.category_id, a.profile_id, a.total_links, a.active_links,
                a.total_clicks, a.total_views, a.updated_at, c.slug,
                a.views_7d, a.views_30d, a.views_12m, a.views_lifetime,
                a.visits_device_breakdown, a.visits_os_breakdown, a.visits_browser_breakdown,
                a.visits_country_breakdown, a.visits_city_breakdown, a.visits_referrer_breakdown,
                a.visits_7d, a.visits_30d, a.visits_12m, a.visits_lifetime,
                a.device_clicks, a.os_clicks, a.browser_clicks,
                a.country_clicks, a.city_clicks, a.referrer_clicks,
                a.clicks_lifetime, a.clicks_7d, a.clicks_30d, a.clicks_12m, a.total_visits
         FROM link_analytics_by_category a
         LEFT JOIN categories c ON c.id = a.category_id
         WHERE a.profile_id = ?1 AND c.slug = ?2",
            crate::turso_params![profile_id, slug],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(CategoryAnalyticsRow {
            category_id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            total_links: row.get::<i64>(2).unwrap_or(0),
            active_links: row.get::<i64>(3).unwrap_or(0),
            total_clicks: row.get::<i64>(4).unwrap_or(0),
            total_views: row.get::<i64>(5).unwrap_or(0),
            total_visits: row.get::<i64>(32).unwrap_or(0),
            updated_at: row.get::<String>(6).unwrap_or_else(|_| "".into()),
            category_slug: row.get(7).ok(),
            views_7d: row.get(8).unwrap_or(None),
            views_30d: row.get(9).unwrap_or(None),
            views_12m: row.get(10).unwrap_or(None),
            views_lifetime: row.get(11).unwrap_or(None),
            visits_device_breakdown: row.get(12).unwrap_or(None),
            visits_os_breakdown: row.get(13).unwrap_or(None),
            visits_browser_breakdown: row.get(14).unwrap_or(None),
            visits_country_breakdown: row.get(15).unwrap_or(None),
            visits_city_breakdown: row.get(16).unwrap_or(None),
            visits_referrer_breakdown: row.get(17).unwrap_or(None),
            visits_7d: row.get(18).unwrap_or(None),
            visits_30d: row.get(19).unwrap_or(None),
            visits_12m: row.get(20).unwrap_or(None),
            visits_lifetime: row.get(21).unwrap_or(None),
            device_clicks: row.get(22).unwrap_or(None),
            os_clicks: row.get(23).unwrap_or(None),
            browser_clicks: row.get(24).unwrap_or(None),
            country_clicks: row.get(25).unwrap_or(None),
            city_clicks: row.get(26).unwrap_or(None),
            referrer_clicks: row.get(27).unwrap_or(None),
            clicks_lifetime: row.get(28).unwrap_or(None),
            clicks_7d: row.get(29).unwrap_or(None),
            clicks_30d: row.get(30).unwrap_or(None),
            clicks_12m: row.get(31).unwrap_or(None),
        }))
    } else {
        Ok(None)
    }
}

/// Get cms analytics for a specific item/category (slug).
#[tauri::command]
pub async fn get_cms_analytics(
    slug: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<CmsAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT a.cms_id, a.total_posts, a.total_published, a.total_sales, a.total_revenue,
                a.views_7d, a.views_30d, a.views_12m,
                a.sales_7d, a.sales_30d, a.sales_12m,
                a.revenue_7d, a.revenue_30d, a.revenue_12m
         FROM cms_analytics a
         JOIN cms c ON c.id = a.cms_id
         WHERE c.slug = ?1 AND a.profile_id = ?2 LIMIT 1",
            crate::turso_params![slug.clone(), profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(CmsAnalyticsRow {
            id: None,
            cms_id: row.get::<String>(0).unwrap_or_default(),
            slug: Some(slug),
            total_posts: row.get::<i64>(1).unwrap_or(0),
            total_published: row.get::<i64>(2).unwrap_or(0),
            total_sales: row.get::<i64>(3).unwrap_or(0),
            total_revenue: row.get::<i64>(4).unwrap_or(0),
            views_7d: row.get(5).ok(),
            views_30d: row.get(6).ok(),
            views_12m: row.get(7).ok(),
            sales_7d: row.get(8).ok(),
            sales_30d: row.get(9).ok(),
            sales_12m: row.get(10).ok(),
            revenue_7d: row.get(11).ok(),
            revenue_30d: row.get(12).ok(),
            revenue_12m: row.get(13).ok(),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn get_all_cms_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CmsAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT a.id, a.cms_id, c.slug, a.total_posts, a.total_published, a.total_sales, a.total_revenue,
                a.views_7d, a.views_30d, a.views_12m,
                a.sales_7d, a.sales_30d, a.sales_12m,
                a.revenue_7d, a.revenue_30d, a.revenue_12m
         FROM cms_analytics a
         JOIN cms c ON c.id = a.cms_id
         WHERE a.profile_id = ?1",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(CmsAnalyticsRow {
            id: row.get(0).ok(),
            cms_id: row.get::<String>(1).unwrap_or_default(),
            slug: row.get(2).ok(),
            total_posts: row.get::<i64>(3).unwrap_or(0),
            total_published: row.get::<i64>(4).unwrap_or(0),
            total_sales: row.get::<i64>(5).unwrap_or(0),
            total_revenue: row.get::<i64>(6).unwrap_or(0),
            views_7d: row.get(7).ok(),
            views_30d: row.get(8).ok(),
            views_12m: row.get(9).ok(),
            sales_7d: row.get(10).ok(),
            sales_30d: row.get(11).ok(),
            sales_12m: row.get(12).ok(),
            revenue_7d: row.get(13).ok(),
            revenue_30d: row.get(14).ok(),
            revenue_12m: row.get(15).ok(),
        });
    }
    Ok(items)
}

#[tauri::command]
pub async fn get_all_content_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ContentAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, content_id, profile_id, total_views, total_reactions, total_comments,
                device_breakdown, os_breakdown, browser_breakdown, country_breakdown, city_breakdown, referrer_breakdown,
                views_7d, views_30d, views_12m
         FROM content_analytics WHERE profile_id = ?1",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(ContentAnalyticsRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            content_id: row.get(1).map_err(|e| e.to_string())?,
            profile_id: row.get(2).map_err(|e| e.to_string())?,
            total_views: row.get(3).unwrap_or(0),
            total_reactions: row.get(4).unwrap_or(0),
            total_comments: row.get(5).unwrap_or(0),
            device_breakdown: row.get(6).ok(),
            os_breakdown: row.get(7).ok(),
            browser_breakdown: row.get(8).ok(),
            country_breakdown: row.get(9).ok(),
            city_breakdown: row.get(10).ok(),
            referrer_breakdown: row.get(11).ok(),
            views_7d: row.get(12).ok(),
            views_30d: row.get(13).ok(),
            views_12m: row.get(14).ok(),
            // Set defaults for the rest as they might not be fetched or exist on the rust struct
        });
    }
    Ok(items)
}

#[tauri::command]
pub async fn get_job_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<JobAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = r#"
        SELECT id, job_id, profile_id, bot_views, total_views, total_visits, total_applications,
               device_breakdown, os_breakdown, browser_breakdown, country_breakdown, city_breakdown, referrer_breakdown,
               utm_source_breakdown, utm_medium_breakdown, utm_campaign_breakdown,
               views_device_breakdown, views_os_breakdown, views_browser_breakdown, views_country_breakdown, views_city_breakdown, views_referrer_breakdown,
               views_7d, views_30d, views_12m, views_lifetime,
               applications_7d, applications_30d, applications_12m, applications_lifetime,
               last_aggregated_at, updated_at
        FROM job_analytics
        WHERE profile_id = ?1
        ORDER BY updated_at DESC
    "#;

    let mut rows = conn
        .query(sql, crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(JobAnalyticsRow {
            id: row.get(0).unwrap_or_default(),
            job_id: row.get(1).unwrap_or_default(),
            profile_id: row.get(2).unwrap_or_default(),
            bot_views: row.get(3).unwrap_or(0),
            total_views: row.get(4).unwrap_or(0),
            total_visits: row.get(5).unwrap_or(0),
            total_applications: row.get(6).unwrap_or(0),
            device_breakdown: row.get(7).unwrap_or_else(|_| "{}".into()),
            os_breakdown: row.get(8).unwrap_or_else(|_| "{}".into()),
            browser_breakdown: row.get(9).unwrap_or_else(|_| "{}".into()),
            country_breakdown: row.get(10).unwrap_or_else(|_| "{}".into()),
            city_breakdown: row.get(11).unwrap_or_else(|_| "{}".into()),
            referrer_breakdown: row.get(12).unwrap_or_else(|_| "{}".into()),
            utm_source_breakdown: row.get(13).unwrap_or_else(|_| "{}".into()),
            utm_medium_breakdown: row.get(14).unwrap_or_else(|_| "{}".into()),
            utm_campaign_breakdown: row.get(15).unwrap_or_else(|_| "{}".into()),
            views_device_breakdown: row.get(16).unwrap_or_else(|_| "{}".into()),
            views_os_breakdown: row.get(17).unwrap_or_else(|_| "{}".into()),
            views_browser_breakdown: row.get(18).unwrap_or_else(|_| "{}".into()),
            views_country_breakdown: row.get(19).unwrap_or_else(|_| "{}".into()),
            views_city_breakdown: row.get(20).unwrap_or_else(|_| "{}".into()),
            views_referrer_breakdown: row.get(21).unwrap_or_else(|_| "{}".into()),
            views_7d: row.get(22).unwrap_or_else(|_| "[]".into()),
            views_30d: row.get(23).unwrap_or_else(|_| "[]".into()),
            views_12m: row.get(24).unwrap_or_else(|_| "[]".into()),
            views_lifetime: row.get(25).unwrap_or_else(|_| "{}".into()),
            applications_7d: row.get(26).unwrap_or_else(|_| "[]".into()),
            applications_30d: row.get(27).unwrap_or_else(|_| "[]".into()),
            applications_12m: row.get(28).unwrap_or_else(|_| "[]".into()),
            applications_lifetime: row.get(29).unwrap_or_else(|_| "{}".into()),
            last_aggregated_at: row.get(30).unwrap_or_default(),
            updated_at: row.get(31).unwrap_or_default(),
        });
    }
    Ok(items)
}
/// Get product analytics for all products belonging to the active profile.
#[tauri::command]
pub async fn get_product_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ProductAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT product_id, profile_id, total_views, 0 as unique_views,
                total_sales, total_revenue_cents, 0 as email_open, 0 as email_clicks, updated_at,
                views_7d, views_30d, views_12m, views_device_breakdown, views_os_breakdown,
                views_browser_breakdown, views_country_breakdown, views_city_breakdown, views_referrer_breakdown,
                sales_7d, sales_30d, sales_12m,
                revenue_7d, revenue_30d, revenue_12m,
                visits_7d, visits_30d, visits_12m
         FROM product_analytics WHERE profile_id = ?1
         ORDER BY total_revenue_cents DESC",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(ProductAnalyticsRow {
            product_id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            total_views: row.get::<i64>(2).unwrap_or(0),
            unique_views: 0,
            total_sales: row.get::<i64>(4).unwrap_or(0),
            total_revenue: row.get::<i64>(5).unwrap_or(0),
            email_open: 0,
            email_clicks: 0,
            updated_at: row.get::<i64>(8).unwrap_or(0),
            views_7d: row.get(9).ok(),
            views_30d: row.get(10).ok(),
            views_12m: row.get(11).ok(),
            device_breakdown: row.get(12).ok(),
            os_breakdown: row.get(13).ok(),
            browser_breakdown: row.get(14).ok(),
            views_country_breakdown: row.get(15).ok(),
            views_city_breakdown: row.get(16).ok(),
            views_referrer_breakdown: row.get(17).ok(),
            sales_7d: row.get(18).ok(),
            sales_30d: row.get(19).ok(),
            sales_12m: row.get(20).ok(),
            revenue_7d: row.get(21).ok(),
            revenue_30d: row.get(22).ok(),
            revenue_12m: row.get(23).ok(),
            visits_7d: row.get(24).ok(),
            visits_30d: row.get(25).ok(),
            visits_12m: row.get(26).ok(),
        });
    }
    Ok(items)
}

/// Get page analytics for all pages belonging to the active profile.
#[tauri::command]
pub async fn get_page_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PageAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT page_id, profile_id, views, unique_views, bot_views, updated_at
         FROM page_analytics WHERE profile_id = ?1
         ORDER BY views DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(PageAnalyticsRow {
            page_id: row.get(0).map_err(|e| e.to_string())?,
            profile_id: row.get(1).map_err(|e| e.to_string())?,
            views: row.get::<i64>(2).unwrap_or(0),
            unique_views: row.get::<i64>(3).unwrap_or(0),
            bot_views: row.get::<i64>(4).unwrap_or(0),
            updated_at: row.get::<i64>(5).unwrap_or(0),
        });
    }
    Ok(items)
}

/// Run background aggregation of analytics data. Throttled to 60 minutes unless force_refresh is true.
#[tauri::command]
pub async fn aggregate_analytics(
    force_refresh: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    if !force_refresh {
        // Throttle check (60 min = 3600s)
        let throttle_stmt = conn
            .prepare("SELECT MAX(last_aggregated_at) FROM profile_analytics WHERE profile_id = ?1")
            .await
            .map_err(|e| e.to_string())?;
        let mut rows = throttle_stmt
            .query(crate::turso_params![profile_id.clone()])
            .await
            .map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let last_agg: i64 = row.get(0).unwrap_or(0);
            if now - last_agg < 3600 {
                return Ok(());
            }
        }
    }

    // 1. Self-heal product_analytics scalar counters (sales, revenue) from purchases table
    // This ensures that products with purchases (but before triggers were enabled) still get tracked
    let heal_sales_sql = r#"
        INSERT INTO product_analytics (id, product_id, profile_id, total_sales, total_revenue_cents)
        SELECT hex(randomblob(16)), product_id, profile_id, COUNT(*), SUM(amount_cents)
        FROM purchases
        WHERE payment_status = 'completed' AND profile_id = ?1
        GROUP BY product_id, profile_id
        ON CONFLICT(product_id) DO UPDATE SET
            total_sales = EXCLUDED.total_sales,
            total_revenue_cents = EXCLUDED.total_revenue_cents,
            updated_at = strftime('%s','now');
    "#;
    conn.execute(heal_sales_sql, crate::turso_params![profile_id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    // 2. We use SQLite's json_group_object to natively aggregate the breakdowns across product visits
    let sql = r#"
        WITH product_views AS (
            SELECT 
                entity_id as product_id,
                json_group_object(device, c) as device_breakdown,
                json_group_object(os, c) as os_breakdown,
                json_group_object(browser, c) as browser_breakdown,
                json_group_object(country, c) as country_breakdown
            FROM (
                SELECT entity_id, COALESCE(device, 'Unknown') as device, COALESCE(os, 'Unknown') as os, COALESCE(browser, 'Unknown') as browser, COALESCE(country, 'Unknown') as country, count(*) as c 
                FROM visits_analytics 
                WHERE entity_type = 'product' AND profile_id = ?1
                GROUP BY entity_id, device, os, browser, country
            ) GROUP BY entity_id
        )
        UPDATE product_analytics 
        SET 
            views_device_breakdown = COALESCE((SELECT device_breakdown FROM product_views pv WHERE pv.product_id = product_analytics.product_id), '{}'),
            views_os_breakdown = COALESCE((SELECT os_breakdown FROM product_views pv WHERE pv.product_id = product_analytics.product_id), '{}'),
            views_browser_breakdown = COALESCE((SELECT browser_breakdown FROM product_views pv WHERE pv.product_id = product_analytics.product_id), '{}'),
            views_country_breakdown = COALESCE((SELECT country_breakdown FROM product_views pv WHERE pv.product_id = product_analytics.product_id), '{}'),
            last_aggregated_at = ?2
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(sql, crate::turso_params![profile_id.clone(), now])
        .await
    {
        log::error!("product_analytics sql failed: {}", e);
    }

    // We use the same json_group_object approach to natively aggregate click breakdowns for links
    let link_sql = r#"
        WITH link_clicks AS (
            SELECT 
                link_id,
                json_group_object(device, c) as device_clicks,
                json_group_object(os, c) as os_clicks,
                json_group_object(browser, c) as browser_clicks,
                json_group_object(country, c) as country_clicks,
                json_group_object(city, c) as city_clicks,
                json_group_object(referrer, c) as referrer_clicks
            FROM (
                SELECT 
                    link_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    count(*) as c 
                FROM clicks_analytics 
                WHERE profile_id = ?1
                GROUP BY link_id, device, os, browser, country, city, referrer
            ) GROUP BY link_id
        )
        UPDATE link_analytics 
        SET 
            device_clicks = COALESCE((SELECT device_clicks FROM link_clicks lc WHERE lc.link_id = link_analytics.link_id), '{}'),
            os_clicks = COALESCE((SELECT os_clicks FROM link_clicks lc WHERE lc.link_id = link_analytics.link_id), '{}'),
            browser_clicks = COALESCE((SELECT browser_clicks FROM link_clicks lc WHERE lc.link_id = link_analytics.link_id), '{}'),
            country_clicks = COALESCE((SELECT country_clicks FROM link_clicks lc WHERE lc.link_id = link_analytics.link_id), '{}'),
            city_clicks = COALESCE((SELECT city_clicks FROM link_clicks lc WHERE lc.link_id = link_analytics.link_id), '{}'),
            referrer_clicks = COALESCE((SELECT referrer_clicks FROM link_clicks lc WHERE lc.link_id = link_analytics.link_id), '{}'),
            last_aggregated_at = ?2
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(link_sql, crate::turso_params![profile_id.clone(), now])
        .await
    {
        log::error!("link_analytics sql failed: {}", e);
    }

    // Aggregate clicks for link_analytics_by_category
    let link_cat_clicks_sql = r#"
        WITH cat_clicks AS (
            SELECT 
                l.category_id,
                json_group_object(c.device, c_count) as device_clicks,
                json_group_object(c.os, c_count) as os_clicks,
                json_group_object(c.browser, c_count) as browser_clicks,
                json_group_object(c.country, c_count) as country_clicks,
                json_group_object(c.city, c_count) as city_clicks,
                json_group_object(c.referrer, c_count) as referrer_clicks
            FROM (
                SELECT 
                    link_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    count(*) as c_count 
                FROM clicks_analytics 
                WHERE profile_id = ?1
                GROUP BY link_id, device, os, browser, country, city, referrer
            ) c
            JOIN links l ON c.link_id = l.id
            GROUP BY l.category_id
        )
        UPDATE link_analytics_by_category 
        SET 
            device_clicks = COALESCE((SELECT device_clicks FROM cat_clicks cc WHERE cc.category_id = link_analytics_by_category.category_id), '{}'),
            os_clicks = COALESCE((SELECT os_clicks FROM cat_clicks cc WHERE cc.category_id = link_analytics_by_category.category_id), '{}'),
            browser_clicks = COALESCE((SELECT browser_clicks FROM cat_clicks cc WHERE cc.category_id = link_analytics_by_category.category_id), '{}'),
            country_clicks = COALESCE((SELECT country_clicks FROM cat_clicks cc WHERE cc.category_id = link_analytics_by_category.category_id), '{}'),
            city_clicks = COALESCE((SELECT city_clicks FROM cat_clicks cc WHERE cc.category_id = link_analytics_by_category.category_id), '{}'),
            referrer_clicks = COALESCE((SELECT referrer_clicks FROM cat_clicks cc WHERE cc.category_id = link_analytics_by_category.category_id), '{}'),
            last_aggregated_at = ?2
        WHERE profile_id = ?1;
    "#;
    if let Err(e) = conn
        .execute(
            link_cat_clicks_sql,
            crate::turso_params![profile_id.clone(), now],
        )
        .await
    {
        log::error!("link_cat_clicks_sql failed: {}", e);
    }

    // Aggregate views for link_analytics_by_category
    let link_cat_views_sql = r#"
        WITH cat_views AS (
            SELECT 
                lp.category_id,
                json_group_object(v.device, c_count) as device_breakdown,
                json_group_object(v.os, c_count) as os_breakdown,
                json_group_object(v.browser, c_count) as browser_breakdown,
                json_group_object(v.country, c_count) as country_breakdown,
                json_group_object(v.city, c_count) as city_breakdown,
                json_group_object(v.referrer, c_count) as referrer_breakdown
            FROM (
                SELECT 
                    link_page_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    count(*) as c_count 
                FROM views_analytics 
                WHERE profile_id = ?1 AND link_page_id IS NOT NULL
                GROUP BY link_page_id, device, os, browser, country, city, referrer
            ) v
            JOIN link_pages lp ON v.link_page_id = lp.id
            GROUP BY lp.category_id
        )
        UPDATE link_analytics_by_category 
        SET 
            views_device_breakdown = COALESCE((SELECT device_breakdown FROM cat_views cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            views_os_breakdown = COALESCE((SELECT os_breakdown FROM cat_views cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            views_browser_breakdown = COALESCE((SELECT browser_breakdown FROM cat_views cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            views_country_breakdown = COALESCE((SELECT country_breakdown FROM cat_views cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            views_city_breakdown = COALESCE((SELECT city_breakdown FROM cat_views cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            views_referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM cat_views cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}')
        WHERE profile_id = ?1;
    "#;
    if let Err(e) = conn
        .execute(link_cat_views_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("link_cat_views_sql failed: {}", e);
    }

    // Aggregate visits for link_analytics_by_category
    let link_cat_visits_sql = r#"
        WITH cat_visits AS (
            SELECT 
                lp.category_id,
                json_group_object(v.device, c_count) as device_breakdown,
                json_group_object(v.os, c_count) as os_breakdown,
                json_group_object(v.browser, c_count) as browser_breakdown,
                json_group_object(v.country, c_count) as country_breakdown,
                json_group_object(v.city, c_count) as city_breakdown,
                json_group_object(v.referrer, c_count) as referrer_breakdown
            FROM (
                SELECT 
                    entity_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    count(*) as c_count 
                FROM visits_analytics 
                WHERE profile_id = ?1 AND entity_type = 'link_page'
                GROUP BY entity_id, device, os, browser, country, city, referrer
            ) v
            JOIN link_pages lp ON v.entity_id = lp.id
            GROUP BY lp.category_id
        )
        UPDATE link_analytics_by_category 
        SET 
            visits_device_breakdown = COALESCE((SELECT device_breakdown FROM cat_visits cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            visits_os_breakdown = COALESCE((SELECT os_breakdown FROM cat_visits cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            visits_browser_breakdown = COALESCE((SELECT browser_breakdown FROM cat_visits cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            visits_country_breakdown = COALESCE((SELECT country_breakdown FROM cat_visits cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            visits_city_breakdown = COALESCE((SELECT city_breakdown FROM cat_visits cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}'),
            visits_referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM cat_visits cv WHERE cv.category_id = link_analytics_by_category.category_id), '{}')
        WHERE profile_id = ?1;
    "#;
    if let Err(e) = conn
        .execute(link_cat_visits_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("link_cat_visits_sql failed: {}", e);
    }

    // 3. We use the same json_group_object approach to natively aggregate view breakdowns for CMS hubs
    let cms_sql = r#"
        WITH cms_views AS (
            SELECT 
                cms_id,
                json_group_object(device, c) as device_breakdown,
                json_group_object(os, c) as os_breakdown,
                json_group_object(browser, c) as browser_breakdown,
                json_group_object(country, c) as country_breakdown,
                json_group_object(city, c) as city_breakdown,
                json_group_object(referrer, c) as referrer_breakdown
            FROM (
                SELECT 
                    cms_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    count(*) as c 
                FROM views_analytics 
                WHERE profile_id = ?1 AND cms_id IS NOT NULL
                GROUP BY cms_id, device, os, browser, country, city, referrer
            ) GROUP BY cms_id
        )
        UPDATE cms_analytics 
        SET 
            views_device_breakdown = COALESCE((SELECT device_breakdown FROM cms_views cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            views_os_breakdown = COALESCE((SELECT os_breakdown FROM cms_views cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            views_browser_breakdown = COALESCE((SELECT browser_breakdown FROM cms_views cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            views_country_breakdown = COALESCE((SELECT country_breakdown FROM cms_views cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            views_city_breakdown = COALESCE((SELECT city_breakdown FROM cms_views cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            views_referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM cms_views cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            last_aggregated_at = ?2
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(cms_sql, crate::turso_params![profile_id.clone(), now])
        .await
    {
        log::error!("cms_sql failed: {}", e);
    }

    // 4. Aggregate visit breakdowns for CMS hubs
    let cms_visits_sql = r#"
        WITH cms_visits AS (
            SELECT 
                cms_id,
                json_group_object(device, c) as device_breakdown,
                json_group_object(os, c) as os_breakdown,
                json_group_object(browser, c) as browser_breakdown,
                json_group_object(country, c) as country_breakdown,
                json_group_object(city, c) as city_breakdown,
                json_group_object(referrer, c) as referrer_breakdown
            FROM (
                SELECT 
                    cms_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    count(*) as c 
                FROM visits_analytics 
                WHERE profile_id = ?1 AND cms_id IS NOT NULL
                GROUP BY cms_id, device, os, browser, country, city, referrer
            ) GROUP BY cms_id
        )
        UPDATE cms_analytics 
        SET 
            visits_device_breakdown = COALESCE((SELECT device_breakdown FROM cms_visits cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            visits_os_breakdown = COALESCE((SELECT os_breakdown FROM cms_visits cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            visits_browser_breakdown = COALESCE((SELECT browser_breakdown FROM cms_visits cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            visits_country_breakdown = COALESCE((SELECT country_breakdown FROM cms_visits cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            visits_city_breakdown = COALESCE((SELECT city_breakdown FROM cms_visits cv WHERE cv.cms_id = cms_analytics.cms_id), '{}'),
            visits_referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM cms_visits cv WHERE cv.cms_id = cms_analytics.cms_id), '{}')
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(cms_visits_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("cms_visits_sql failed: {}", e);
    }

    // 5. Aggregate sales breakdowns for CMS hubs
    let cms_sales_sql = r#"
        WITH cms_sales AS (
            SELECT 
                c.cms_id,
                json_group_object(p.device, c_count) as device_breakdown,
                json_group_object(p.os, c_count) as os_breakdown,
                json_group_object(p.browser, c_count) as browser_breakdown,
                json_group_object(p.country, c_count) as country_breakdown,
                json_group_object(p.city, c_count) as city_breakdown,
                json_group_object(p.referrer, c_count) as referrer_breakdown,
                json_group_object(p.utm_source, c_count) as utm_source_breakdown,
                json_group_object(p.utm_medium, c_count) as utm_medium_breakdown,
                json_group_object(p.utm_campaign, c_count) as utm_campaign_breakdown,
                SUM(p.sum_revenue) as total_revenue,
                SUM(p.c_count) as total_sales
            FROM (
                SELECT 
                    product_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    COALESCE(utm_source, 'Unknown') as utm_source, 
                    COALESCE(utm_medium, 'Unknown') as utm_medium, 
                    COALESCE(utm_campaign, 'Unknown') as utm_campaign, 
                    count(*) as c_count,
                    sum(amount_cents) as sum_revenue
                FROM purchases 
                WHERE profile_id = ?1 AND payment_status = 'completed'
                GROUP BY product_id, device, os, browser, country, city, referrer, utm_source, utm_medium, utm_campaign
            ) p
            JOIN content c ON p.product_id = c.id
            WHERE c.cms_id IS NOT NULL
            GROUP BY c.cms_id
        )
        UPDATE cms_analytics 
        SET 
            sales_device_breakdown = COALESCE((SELECT device_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_os_breakdown = COALESCE((SELECT os_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_browser_breakdown = COALESCE((SELECT browser_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_country_breakdown = COALESCE((SELECT country_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_city_breakdown = COALESCE((SELECT city_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_utm_source = COALESCE((SELECT utm_source_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_utm_medium = COALESCE((SELECT utm_medium_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            sales_utm_campaign = COALESCE((SELECT utm_campaign_breakdown FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), '{}'),
            total_sales = COALESCE((SELECT total_sales FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), 0),
            total_revenue = COALESCE((SELECT total_revenue FROM cms_sales cs WHERE cs.cms_id = cms_analytics.cms_id), 0)
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(cms_sales_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("cms_sales_sql failed: {}", e);
    }

    // 6. Aggregate global clicks breakdowns for the entire profile (used in global analytics view)
    let profile_clicks_sql = r#"
        WITH global_clicks AS (
            SELECT 
                profile_id,
                json_group_object(device, c_count) as device_clicks,
                json_group_object(os, c_count) as os_clicks,
                json_group_object(browser, c_count) as browser_clicks,
                json_group_object(country, c_count) as country_clicks,
                json_group_object(city, c_count) as city_clicks,
                json_group_object(referrer, c_count) as referrer_clicks
            FROM (
                SELECT 
                    profile_id, 
                    COALESCE(device, 'Unknown') as device, 
                    COALESCE(os, 'Unknown') as os, 
                    COALESCE(browser, 'Unknown') as browser, 
                    COALESCE(country, 'Unknown') as country, 
                    COALESCE(city, 'Unknown') as city, 
                    COALESCE(referrer, 'Unknown') as referrer, 
                    count(*) as c_count 
                FROM clicks_analytics 
                WHERE profile_id = ?1
                GROUP BY profile_id, device, os, browser, country, city, referrer
            )
            GROUP BY profile_id
        )
        UPDATE profile_analytics 
        SET 
            device_clicks = COALESCE((SELECT device_clicks FROM global_clicks gc WHERE gc.profile_id = profile_analytics.profile_id), '{}'),
            os_clicks = COALESCE((SELECT os_clicks FROM global_clicks gc WHERE gc.profile_id = profile_analytics.profile_id), '{}'),
            browser_clicks = COALESCE((SELECT browser_clicks FROM global_clicks gc WHERE gc.profile_id = profile_analytics.profile_id), '{}'),
            country_clicks = COALESCE((SELECT country_clicks FROM global_clicks gc WHERE gc.profile_id = profile_analytics.profile_id), '{}'),
            city_clicks = COALESCE((SELECT city_clicks FROM global_clicks gc WHERE gc.profile_id = profile_analytics.profile_id), '{}'),
            referrer_clicks = COALESCE((SELECT referrer_clicks FROM global_clicks gc WHERE gc.profile_id = profile_analytics.profile_id), '{}')
        WHERE profile_id = ?1;
    "#;
    if let Err(e) = conn
        .execute(profile_clicks_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("profile_clicks_sql failed: {}", e);
    }

    // Update profile_analytics throttle cursor so we don't spam this on every route visit
    // Ensure a row exists first
    conn.execute(
        "INSERT OR IGNORE INTO profile_analytics (id, profile_id) VALUES (hex(randomblob(16)), ?1)",
        crate::turso_params![profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE profile_analytics SET last_aggregated_at = ?2 WHERE profile_id = ?1",
        crate::turso_params![profile_id, now],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn aggregate_content_analytics(
    force_refresh: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    if !force_refresh {
        // Throttle check (60 min)
        let throttle_stmt = conn
            .prepare("SELECT MAX(last_aggregated_at) FROM content_analytics WHERE profile_id = ?1")
            .await
            .map_err(|e| e.to_string())?;
        let mut rows = throttle_stmt
            .query(crate::turso_params![profile_id.clone()])
            .await
            .map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let last_agg: i64 = row.get(0).unwrap_or(0);
            if now - last_agg < 3600 {
                return Ok(());
            }
        }
    }

    // 1. Aggregate views_analytics into content_analytics
    let content_views_sql = r#"
        WITH content_views AS (
            SELECT 
                content_id,
                json_group_object(device, c) as device_breakdown,
                json_group_object(os, c) as os_breakdown,
                json_group_object(browser, c) as browser_breakdown,
                json_group_object(country, c) as country_breakdown,
                json_group_object(city, c) as city_breakdown,
                json_group_object(referrer, c) as referrer_breakdown
            FROM (
                SELECT content_id, COALESCE(device, 'Unknown') as device, COALESCE(os, 'Unknown') as os, COALESCE(browser, 'Unknown') as browser, COALESCE(country, 'Unknown') as country, COALESCE(city, 'Unknown') as city, COALESCE(referrer, 'Unknown') as referrer, count(*) as c 
                FROM views_analytics 
                WHERE content_id IS NOT NULL AND profile_id = ?1
                GROUP BY content_id, device, os, browser, country, city, referrer
            ) GROUP BY content_id
        )
        UPDATE content_analytics 
        SET 
            device_breakdown = COALESCE((SELECT device_breakdown FROM content_views cv WHERE cv.content_id = content_analytics.content_id), '{}'),
            os_breakdown = COALESCE((SELECT os_breakdown FROM content_views cv WHERE cv.content_id = content_analytics.content_id), '{}'),
            browser_breakdown = COALESCE((SELECT browser_breakdown FROM content_views cv WHERE cv.content_id = content_analytics.content_id), '{}'),
            country_breakdown = COALESCE((SELECT country_breakdown FROM content_views cv WHERE cv.content_id = content_analytics.content_id), '{}'),
            city_breakdown = COALESCE((SELECT city_breakdown FROM content_views cv WHERE cv.content_id = content_analytics.content_id), '{}'),
            referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM content_views cv WHERE cv.content_id = content_analytics.content_id), '{}'),
            total_views = COALESCE((SELECT COUNT(*) FROM views_analytics va WHERE va.content_id = content_analytics.content_id AND va.is_bot = 0), total_views),
            bot_views = COALESCE((SELECT COUNT(*) FROM views_analytics va WHERE va.content_id = content_analytics.content_id AND va.is_bot = 1), bot_views),
            last_aggregated_at = ?2
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(
            content_views_sql,
            crate::turso_params![profile_id.clone(), now.to_string()],
        )
        .await
    {
        log::error!("content_analytics views sql failed: {}", e);
    }

    // 2. Aggregate content_reaction into content_analytics
    let content_reactions_sql = r#"
        UPDATE content_analytics 
        SET 
            total_reactions = COALESCE((SELECT COUNT(*) FROM content_reaction cr WHERE cr.content_id = content_analytics.content_id), 0),
            happy = COALESCE((SELECT COUNT(*) FROM content_reaction cr WHERE cr.content_id = content_analytics.content_id AND cr.reaction_type = 'happy'), 0),
            neutral = COALESCE((SELECT COUNT(*) FROM content_reaction cr WHERE cr.content_id = content_analytics.content_id AND cr.reaction_type = 'neutral'), 0),
            sad = COALESCE((SELECT COUNT(*) FROM content_reaction cr WHERE cr.content_id = content_analytics.content_id AND cr.reaction_type = 'sad'), 0)
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(content_reactions_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("content_analytics reactions sql failed: {}", e);
    }

    // 3. Aggregate content_comment into content_analytics
    let content_comments_sql = r#"
        UPDATE content_analytics 
        SET 
            total_comments = COALESCE((SELECT COUNT(*) FROM content_comment cc WHERE cc.content_id = content_analytics.content_id AND cc.status = 'published'), 0)
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(content_comments_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("content_analytics comments sql failed: {}", e);
    }

    // 4. Roll up to cms_analytics
    let cms_rollup_sql = r#"
        WITH cms_totals AS (
            SELECT 
                c.cms_id,
                SUM(ca.total_views) as sum_views,
                SUM(ca.bot_views) as sum_bot_views,
                SUM(ca.total_reactions) as sum_reactions,
                SUM(ca.total_comments) as sum_comments
            FROM content_analytics ca
            JOIN content c ON c.id = ca.content_id
            WHERE ca.profile_id = ?1 AND c.cms_id IS NOT NULL
            GROUP BY c.cms_id
        )
        UPDATE cms_analytics
        SET 
            total_views = COALESCE((SELECT sum_views FROM cms_totals ct WHERE ct.cms_id = cms_analytics.cms_id), total_views),
            bot_views = COALESCE((SELECT sum_bot_views FROM cms_totals ct WHERE ct.cms_id = cms_analytics.cms_id), bot_views),
            total_reactions = COALESCE((SELECT sum_reactions FROM cms_totals ct WHERE ct.cms_id = cms_analytics.cms_id), total_reactions),
            total_comments = COALESCE((SELECT sum_comments FROM cms_totals ct WHERE ct.cms_id = cms_analytics.cms_id), total_comments),
            last_aggregated_at = ?2
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(
            cms_rollup_sql,
            crate::turso_params![profile_id.clone(), now.to_string()],
        )
        .await
    {
        log::error!("cms_analytics rollup sql failed: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub async fn aggregate_job_analytics(
    force_refresh: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    if !force_refresh {
        // Throttle check (60 min)
        let throttle_stmt = conn
            .prepare("SELECT MAX(last_aggregated_at) FROM job_analytics WHERE profile_id = ?1")
            .await
            .map_err(|e| e.to_string())?;
        let mut rows = throttle_stmt
            .query(crate::turso_params![profile_id.clone()])
            .await
            .map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let last_agg: i64 = row.get(0).unwrap_or(0);
            if now - last_agg < 3600 {
                return Ok(());
            }
        }
    }

    // 1. Aggregate visits_analytics into job_analytics (unique visits json breakdowns only)
    let job_visits_sql = r#"
        WITH job_visits AS (
            SELECT 
                entity_id as job_id,
                json_group_object(device, c) as device_breakdown,
                json_group_object(os, c) as os_breakdown,
                json_group_object(browser, c) as browser_breakdown,
                json_group_object(country, c) as country_breakdown,
                json_group_object(city, c) as city_breakdown,
                json_group_object(referrer, c) as referrer_breakdown
            FROM (
                SELECT entity_id, COALESCE(device, 'Unknown') as device, COALESCE(os, 'Unknown') as os, COALESCE(browser, 'Unknown') as browser, COALESCE(country, 'Unknown') as country, COALESCE(city, 'Unknown') as city, COALESCE(referrer, 'Unknown') as referrer, count(*) as c 
                FROM visits_analytics 
                WHERE entity_type = 'job' AND profile_id = ?1
                GROUP BY entity_id, device, os, browser, country, city, referrer
            ) GROUP BY entity_id
        )
        UPDATE job_analytics 
        SET 
            device_breakdown = COALESCE((SELECT device_breakdown FROM job_visits jv WHERE jv.job_id = job_analytics.job_id), '{}'),
            os_breakdown = COALESCE((SELECT os_breakdown FROM job_visits jv WHERE jv.job_id = job_analytics.job_id), '{}'),
            browser_breakdown = COALESCE((SELECT browser_breakdown FROM job_visits jv WHERE jv.job_id = job_analytics.job_id), '{}'),
            country_breakdown = COALESCE((SELECT country_breakdown FROM job_visits jv WHERE jv.job_id = job_analytics.job_id), '{}'),
            city_breakdown = COALESCE((SELECT city_breakdown FROM job_visits jv WHERE jv.job_id = job_analytics.job_id), '{}'),
            referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM job_visits jv WHERE jv.job_id = job_analytics.job_id), '{}')
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(job_visits_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("job_analytics visits sql failed: {}", e);
    }

    // 2. Aggregate views_analytics into job_analytics (raw views json breakdowns only)
    let job_views_sql = r#"
        WITH job_views AS (
            SELECT 
                job_listing_id,
                json_group_object(device, c) as device_breakdown,
                json_group_object(os, c) as os_breakdown,
                json_group_object(browser, c) as browser_breakdown,
                json_group_object(country, c) as country_breakdown,
                json_group_object(city, c) as city_breakdown,
                json_group_object(referrer, c) as referrer_breakdown
            FROM (
                SELECT job_listing_id, COALESCE(device, 'Unknown') as device, COALESCE(os, 'Unknown') as os, COALESCE(browser, 'Unknown') as browser, COALESCE(country, 'Unknown') as country, COALESCE(city, 'Unknown') as city, COALESCE(referrer, 'Unknown') as referrer, count(*) as c 
                FROM views_analytics 
                WHERE job_listing_id IS NOT NULL AND profile_id = ?1
                GROUP BY job_listing_id, device, os, browser, country, city, referrer
            ) GROUP BY job_listing_id
        )
        UPDATE job_analytics 
        SET 
            views_device_breakdown = COALESCE((SELECT device_breakdown FROM job_views jv WHERE jv.job_listing_id = job_analytics.job_id), '{}'),
            views_os_breakdown = COALESCE((SELECT os_breakdown FROM job_views jv WHERE jv.job_listing_id = job_analytics.job_id), '{}'),
            views_browser_breakdown = COALESCE((SELECT browser_breakdown FROM job_views jv WHERE jv.job_listing_id = job_analytics.job_id), '{}'),
            views_country_breakdown = COALESCE((SELECT country_breakdown FROM job_views jv WHERE jv.job_listing_id = job_analytics.job_id), '{}'),
            views_city_breakdown = COALESCE((SELECT city_breakdown FROM job_views jv WHERE jv.job_listing_id = job_analytics.job_id), '{}'),
            views_referrer_breakdown = COALESCE((SELECT referrer_breakdown FROM job_views jv WHERE jv.job_listing_id = job_analytics.job_id), '{}')
        WHERE profile_id = ?1;
    "#;

    if let Err(e) = conn
        .execute(job_views_sql, crate::turso_params![profile_id.clone()])
        .await
    {
        log::error!("job_analytics views sql failed: {}", e);
    }

    Ok(())
}
