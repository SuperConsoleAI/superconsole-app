// src-tauri/src/commands/app_commands.rs
//
// Installable-app management commands.
//
// What this file does:
//   Exposes 3 Tauri commands that power the Apps page install flow:
//     get_installed_apps  — returns the JSON array of installed app slugs for the active profile
//     install_app         — provisions schema for the requested app, then records it as installed
//     uninstall_app       — removes the app slug from the installed list (tables are NEVER dropped)
//
// Installable apps (Phase 0 — Foundation):
//   "shop"    → SHOP_SCHEMA (8 tables)  + SHOP_OPS_SCHEMA (35 tables) + seeds
//   "tax"     → TAX_SCHEMA  (8 tables)
//   "accounts"→ ACCOUNTS_SCHEMA (6 tables)
//   "payroll" → PAYROLL_SCHEMA  (5 tables)
//
// Storage: profile_apps table (1 row per profile) in UserDB.
//   id = "apps-{profile_id}", installed = JSON array e.g. '["shop","tax"]'

use crate::AppState;
use std::sync::Arc;
use tauri::State;

// ── Schema slices ─────────────────────────────────────────────────────────────
use crate::db::schema::accounts::ACCOUNTS_SCHEMA;
use crate::db::schema::ads::SCHEMA_SQL as ADS_SCHEMA;
use crate::db::schema::affiliate::SCHEMA_SQL as AFFILIATE_SCHEMA;
use crate::db::schema::agents::SCHEMA_SQL as AGENTS_SCHEMA;
use crate::db::schema::chat_agent::SCHEMA_SQL as CHAT_AGENT_SCHEMA;
use crate::db::schema::community::SCHEMA_SQL as COMMUNITY_SCHEMA;
use crate::db::schema::community_triggers::SCHEMA_SQL as COMMUNITY_TRIGGERS_SCHEMA;
use crate::db::schema::feedback::SCHEMA_SQL as FEEDBACK_SCHEMA;
use crate::db::schema::forms::SCHEMA_SQL as FORMS_SCHEMA;
use crate::db::schema::gsc::SCHEMA_SQL as GSC_SCHEMA;
use crate::db::schema::jobs::SCHEMA_SQL as JOBS_SCHEMA;
use crate::db::schema::links::SCHEMA_SQL as LINKS_SCHEMA;
use crate::db::schema::payroll::PAYROLL_SCHEMA;
use crate::db::schema::products::SCHEMA_SQL as PRODUCTS_SCHEMA;
use crate::db::schema::product_triggers::SCHEMA_SQL as PRODUCT_TRIGGERS_SCHEMA;
use crate::db::schema::review::SCHEMA_SQL as REVIEW_SCHEMA;
use crate::db::schema::shop::SHOP_SCHEMA;
use crate::db::schema::shop_ops::SHOP_OPS_SCHEMA;
use crate::db::schema::social::SCHEMA_SQL as SOCIAL_SCHEMA;
use crate::db::schema::tax::TAX_SCHEMA;

// ─────────────────────────────────────────────────────────────────────────────

/// Return the list of installed app slugs for the active profile.
/// Returns an empty Vec if the profile has no row in profile_apps yet.
#[tauri::command]
pub async fn get_installed_apps(state: State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT installed FROM profile_apps WHERE profile_id = ?",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        let installed_json: String = row.get(0).unwrap_or_else(|_| "[]".to_string());
        let installed: Vec<String> = serde_json::from_str(&installed_json).unwrap_or_default();

        Ok(installed)
    } else {
        Ok(vec![])
    }
}

/// Install an app: provision its schema then record the slug in profile_apps.
/// Safe to call multiple times — all schema statements are CREATE IF NOT EXISTS.
#[tauri::command]
pub async fn install_app(
    app_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<String>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let plan = {
        let lic = state.license.read().await;
        lic.plan.clone()
    };

    let is_free_app = matches!(
        app_id.as_str(),
        "store" | "store-digital" | "store_digital" | "links" | "link-in-bio" | "link_in_bio"
    );
    if plan.to_uppercase() == "FREE" && !is_free_app {
        return Err("Plan limit reached: Please upgrade your plan to install this app.".to_string());
    }

    // 1. Resolve schema slices for this app
    let schema_slices: &[&[&str]] = match app_id.as_str() {
        "shop" => &[SHOP_SCHEMA, SHOP_OPS_SCHEMA],
        "tax" => &[TAX_SCHEMA],
        "accounts" => &[ACCOUNTS_SCHEMA],
        "payroll" => &[PAYROLL_SCHEMA],
        "chat" | "chat-agent" | "chat_agent" => &[CHAT_AGENT_SCHEMA],
        "social" => &[SOCIAL_SCHEMA],
        "community" => &[COMMUNITY_SCHEMA, COMMUNITY_TRIGGERS_SCHEMA],
        "agents" => &[AGENTS_SCHEMA],
        "gsc" => &[GSC_SCHEMA],
        "feedback" => &[FEEDBACK_SCHEMA],
        "review" => &[REVIEW_SCHEMA],
        "ads" => &[ADS_SCHEMA],
        "affiliate" => &[AFFILIATE_SCHEMA],
        "forms" => &[FORMS_SCHEMA],
        "jobs" => &[JOBS_SCHEMA],
        "links" | "link-in-bio" | "link_in_bio" => &[LINKS_SCHEMA],
        "store" | "store-digital" | "store_digital" => &[PRODUCTS_SCHEMA, PRODUCT_TRIGGERS_SCHEMA],
        other => return Err(format!("Unknown app: {}", other)),
    };

    // 2. Run all schema statements (idempotent, safe for triggers)
    log::info!("[app_install] provisioning schema for '{}'", app_id);
    for group in schema_slices {
        if let Err(e) = conn.execute_statements(group).await {
            log::warn!("[app_install] batch execute failed ({}), running sequential fallback...", e);
            for stmt in *group {
                if let Err(e) = conn.execute(stmt, crate::turso_params![]).await {
                    log::warn!("[app_install] schema stmt failed (safe to ignore): {}", e);
                }
            }
        }
    }

    // 3. Seed defaults when installing "shop"
    if app_id == "shop" {
        seed_shop_defaults(&conn, &profile_id).await;
        // Migration: add `published` column if it doesn't exist yet (safe to fail)
        let _ = conn
            .execute(
                "ALTER TABLE shop_items ADD COLUMN published INTEGER NOT NULL DEFAULT 0",
                crate::turso_params![],
            )
            .await;
    }

    // 4. Read current installed list
    let mut rows = conn
        .query(
            "SELECT installed FROM profile_apps WHERE profile_id = ?",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut installed: Vec<String> = if let Ok(Some(row)) = rows.next().await {
        let json: String = row.get(0).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        vec![]
    };

    // 5. Append slug if not already present
    if !installed.contains(&app_id) {
        installed.push(app_id.clone());
    }

    let installed_json = serde_json::to_string(&installed).map_err(|e| e.to_string())?;
    let row_id = format!("apps-{}", profile_id);

    conn.execute(
        "INSERT INTO profile_apps (id, profile_id, installed, updated_at)
         VALUES (?, ?, ?, strftime('%s','now'))
         ON CONFLICT(profile_id) DO UPDATE SET
           installed  = excluded.installed,
           updated_at = excluded.updated_at",
        crate::turso_params![row_id, profile_id.clone(), installed_json],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Invalidate schema cache
    state.schema_cache.write().await.remove(&profile_id);

    log::info!(
        "[app_install] '{}' installed. installed = {:?}",
        app_id,
        installed
    );
    Ok(installed)
}

/// Uninstall an app: remove its slug from the installed list.
/// Schema tables are NOT dropped — data is preserved.
#[tauri::command]
pub async fn uninstall_app(
    app_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<String>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT installed FROM profile_apps WHERE profile_id = ?",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut installed: Vec<String> = if let Ok(Some(row)) = rows.next().await {
        let json: String = row.get(0).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        return Ok(vec![]);
    };

    installed.retain(|s| s != &app_id);

    let installed_json = serde_json::to_string(&installed).map_err(|e| e.to_string())?;
    let row_id = format!("apps-{}", profile_id);

    conn.execute(
        "INSERT INTO profile_apps (id, profile_id, installed, updated_at)
         VALUES (?, ?, ?, strftime('%s','now'))
         ON CONFLICT(profile_id) DO UPDATE SET
           installed  = excluded.installed,
           updated_at = excluded.updated_at",
        crate::turso_params![row_id, profile_id.clone(), installed_json],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Invalidate schema cache
    state.schema_cache.write().await.remove(&profile_id);

    Ok(installed)
}

// ── Private helpers ───────────────────────────────────────────────────────────

/// Seed units and default categories for Shop.
/// All INSERT OR IGNORE — safe to call on re-install or upgrade.
async fn seed_shop_defaults(conn: &crate::db::turso::TursoConn, profile_id: &str) {
    // ── Units ─────────────────────────────────────────────────────────────────
    // suffix, display name, symbol, is_decimal (1 = allow fractions)
    let units: &[(&str, &str, &str, i64)] = &[
        // ── Count / packaging ─────────────────────
        ("pcs", "Piece", "pcs", 0),
        ("dozen", "Dozen", "dz", 0),
        ("box", "Box", "box", 0),
        ("pack", "Pack", "pack", 0),
        ("carton", "Carton", "ctn", 0),
        ("strip", "Strip", "strip", 0), // pharma blister strips
        ("bottle", "Bottle", "btl", 0),
        ("vial", "Vial", "vial", 0),    // pharma injections
        ("ampule", "Ampule", "amp", 0), // pharma injectables
        ("sachet", "Sachet", "sach", 0),
        ("tube", "Tube", "tube", 0),
        ("can", "Can", "can", 0),
        ("pair", "Pair", "pr", 0),
        // ── Weight ────────────────────────────────
        ("kg", "Kilogram", "kg", 1),
        ("g", "Gram", "g", 1),
        ("mg", "Milligram", "mg", 1),     // pharma dosage
        ("quintal", "Quintal", "qtl", 1), // grain trade
        ("tonne", "Tonne", "MT", 1),
        // ── Volume ────────────────────────────────
        ("litre", "Litre", "ltr", 1),
        ("ml", "Millilitre", "ml", 1),
        ("mcg", "Microgram", "mcg", 1), // pharma (μg)
        // ── Length / Area ─────────────────────────
        ("metre", "Metre", "m", 1),
        ("cm", "Centimetre", "cm", 1),
        ("sqft", "Sq. Foot", "sqft", 1),
        ("sqm", "Sq. Metre", "sqm", 1),
        ("yard", "Yard", "yd", 1), // textile
        // ── Time / Service ────────────────────────
        ("hour", "Hour", "hr", 1),
        ("min", "Minute", "min", 0),
        ("day", "Day", "day", 0),
        ("week", "Week", "wk", 0),
        ("month", "Month", "mo", 0),
        ("session", "Session", "ses", 0),
        ("night", "Night", "ngt", 0), // hotel
        // ── Restaurant ────────────────────────────
        ("plate", "Plate", "plt", 0),
        ("portion", "Portion", "ptn", 0),
        ("serving", "Serving", "srv", 0),
        ("glass", "Glass", "gl", 0),
        ("cup", "Cup", "cup", 0),
    ];

    for (suffix, name, symbol, is_decimal) in units {
        let unit_id = format!("unit-{}-{}", suffix, profile_id);
        let _ = conn
            .execute(
                "INSERT OR IGNORE INTO shop_units \
                 (id, profile_id, name, symbol, unit_type, is_decimal, is_active) \
                 VALUES (?, ?, ?, ?, 'count', ?, 1)",
                crate::turso_params![
                    unit_id,
                    profile_id.to_string(),
                    name.to_string(),
                    symbol.to_string(),
                    *is_decimal,
                ],
            )
            .await;
    }

    // ── Shop categories ───────────────────────────────────────────────────────
    // (id_suffix, name, slug, sort_order)
    let cats: &[(&str, &str, &str, i64)] = &[
        ("general", "General", "general", 0),
        ("medicines", "Medicines", "medicines", 1),
        ("grocery", "Grocery", "grocery", 2),
        ("beverages", "Beverages", "beverages", 3),
        ("food", "Food & Snacks", "food", 4),
        ("electronics", "Electronics", "electronics", 5),
        ("clothing", "Clothing", "clothing", 6),
        ("footwear", "Footwear", "footwear", 7),
        ("home", "Home & Kitchen", "home", 8),
        ("beauty", "Beauty & Personal", "beauty", 9),
        ("stationery", "Stationery", "stationery", 10),
        ("hardware", "Hardware", "hardware", 11),
        ("services", "Services", "services", 12),
        ("supplements", "Health Supplements", "supplements", 13),
        ("surgical", "Surgical / Equipment", "surgical", 14),
    ];

    for (suffix, name, slug, sort) in cats {
        let cat_id = format!("scat-{}-{}", suffix, profile_id);
        let _ = conn
            .execute(
                "INSERT OR IGNORE INTO shop_categories \
                 (id, profile_id, name, slug, sort_order, is_active) \
                 VALUES (?, ?, ?, ?, ?, 1)",
                crate::turso_params![
                    cat_id,
                    profile_id.to_string(),
                    name.to_string(),
                    slug.to_string(),
                    *sort,
                ],
            )
            .await;
    }

    log::info!(
        "[app_install] shop defaults seeded — {} units, {} categories",
        units.len(),
        cats.len()
    );

    // ── Default warehouse ─────────────────────────────────────────────────────
    // One "Main Store" with is_default=1 so stock commands always have a home.
    let wh_id = format!("wh-main-{}", profile_id);
    let _ = conn
        .execute(
            "INSERT OR IGNORE INTO shop_warehouses \
             (id, profile_id, name, warehouse_type, ownership_type, is_default, is_active) \
             VALUES (?, ?, 'Main Store', 'store', 'own', 1, 1)",
            crate::turso_params![wh_id, profile_id.to_string()],
        )
        .await;
}
