// src-tauri/src/commands/shop/price_lists.rs
//
// Phase 3 — Price List management
//
// Commands:
//   shop_create_price_list     → create a named price tier
//   shop_list_price_lists      → list all active price lists for the profile
//   shop_get_price_list        → get one price list + item overrides
//   shop_update_price_list     → edit name, discount_pct, or item prices
//   shop_assign_customer_price_list → set crm_contacts.price_list_id
//   shop_resolve_item_price    → given item_id + customer_id → effective unit price
//
// Data model:
//   price_list_items = JSON map: { "item_id": override_price_f64, ... }
//   discount_pct     = global % off for any item NOT in price_list_items
//   customer has price_list_id → resolved at billing time

use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tauri::State;

// ── Helpers ───────────────────────────────────────────────────────────────────

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("{}-{}", prefix, ts)
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct PriceList {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub discount_pct: f64,
    pub price_list_items: String, // raw JSON map
    pub is_active: bool,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreatePriceListData {
    pub name: String,
    pub description: Option<String>,
    pub discount_pct: Option<f64>,
    pub price_list_items: Option<String>, // JSON map { item_id: price }
}

#[derive(Debug, Deserialize)]
pub struct UpdatePriceListData {
    pub name: Option<String>,
    pub description: Option<String>,
    pub discount_pct: Option<f64>,
    pub price_list_items: Option<String>,
    pub is_active: Option<bool>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create a new price list (e.g. "Wholesale", "Staff").
#[tauri::command]
pub async fn shop_create_price_list(
    data: CreatePriceListData,
    state: State<'_, Arc<AppState>>,
) -> Result<PriceList, String> {
    if data.name.trim().is_empty() {
        return Err("Price list name is required".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = new_id("pl");
    let disc = data.discount_pct.unwrap_or(0.0);
    let items_json = data.price_list_items.unwrap_or_else(|| "{}".into());
    let description = data.description.clone();

    conn.execute(
        "INSERT INTO shop_price_lists \
         (id, profile_id, name, description, discount_pct, price_list_items) \
         VALUES (?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            id.clone(),
            profile_id,
            data.name.trim().to_string(),
            description,
            disc,
            items_json.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(PriceList {
        id,
        name: data.name.trim().to_string(),
        description: data.description,
        discount_pct: disc,
        price_list_items: items_json,
        is_active: true,
        created_at: 0,
    })
}

/// List all active price lists for the current profile.
#[tauri::command]
pub async fn shop_list_price_lists(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PriceList>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, name, description, discount_pct, price_list_items, is_active, created_at \
         FROM shop_price_lists \
         WHERE profile_id = ? AND is_active = 1 \
         ORDER BY name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut lists = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        lists.push(PriceList {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            description: row.get(2).ok(),
            discount_pct: row.get(3).unwrap_or(0.0),
            price_list_items: row.get(4).unwrap_or_else(|_| "{}".into()),
            is_active: row.get::<i64>(5).unwrap_or(1) != 0,
            created_at: row.get(6).unwrap_or(0),
        });
    }
    Ok(lists)
}

/// Update a price list's name, discount, or item overrides.
#[tauri::command]
pub async fn shop_update_price_list(
    id: String,
    data: UpdatePriceListData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Build SET clause dynamically
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<crate::db::turso::TursoParam> = Vec::new();

    if let Some(name) = &data.name {
        sets.push("name = ?".into());
        params.push(crate::db::turso::TursoParam::Text(name.trim().to_string()));
    }
    if let Some(desc) = &data.description {
        sets.push("description = ?".into());
        params.push(crate::db::turso::TursoParam::Text(desc.clone()));
    }
    if let Some(disc) = data.discount_pct {
        sets.push("discount_pct = ?".into());
        params.push(crate::db::turso::TursoParam::Float(disc));
    }
    if let Some(items) = &data.price_list_items {
        sets.push("price_list_items = ?".into());
        params.push(crate::db::turso::TursoParam::Text(items.clone()));
    }
    if let Some(active) = data.is_active {
        sets.push("is_active = ?".into());
        params.push(crate::db::turso::TursoParam::Integer(if active { 1 } else { 0 }));
    }

    if sets.is_empty() {
        return Ok(());
    }

    params.push(crate::db::turso::TursoParam::Text(id));
    params.push(crate::db::turso::TursoParam::Text(profile_id));

    let sql = format!(
        "UPDATE shop_price_lists SET {} WHERE id = ? AND profile_id = ?",
        sets.join(", ")
    );
    conn.execute(&sql, params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Assign (or clear) a price list on a customer contact.
#[tauri::command]
pub async fn shop_assign_customer_price_list(
    customer_id: String,
    price_list_id: Option<String>, // None = clear the assignment
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let clean_pl = price_list_id.filter(|s| !s.trim().is_empty() && s != "none");

    conn.execute(
        "UPDATE shop_customers SET price_list_id = ? WHERE id = ? AND profile_id = ?",
        crate::turso_params![clean_pl.clone(), customer_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Best-effort sync to crm_contacts if linked/present
    let _ = conn.execute(
        "UPDATE crm_contacts SET price_list_id = ? WHERE id = ? AND profile_id = ?",
        crate::turso_params![clean_pl, customer_id, profile_id],
    ).await;

    Ok(())
}

/// Resolve the effective unit price for an item given a customer.
/// Called at billing time — returns base_price if no override.
/// Logic: if customer has price_list_id → look up item in price_list_items JSON;
///        if not found there, apply discount_pct to base_price.
#[tauri::command]
pub async fn shop_resolve_item_price(
    item_id: String,
    customer_id: String,
    base_price: f64,
    state: State<'_, Arc<AppState>>,
) -> Result<f64, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Step 1: get customer's price_list_id from shop_customers (with crm_contacts fallback)
    let price_list_id: Option<String> = {
        let mut rows = conn
            .query(
                "SELECT price_list_id FROM shop_customers WHERE id = ? AND profile_id = ?",
                crate::turso_params![customer_id.clone(), profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        let mut pl = if let Ok(Some(row)) = rows.next().await {
            row.get::<String>(0).ok().filter(|s| !s.is_empty())
        } else {
            None
        };
        while rows.next().await.map(|r| r.is_some()).unwrap_or(false) {}

        if pl.is_none() {
            if let Ok(mut crm_rows) = conn
                .query(
                    "SELECT price_list_id FROM crm_contacts WHERE id = ? AND profile_id = ?",
                    crate::turso_params![customer_id.clone(), profile_id.clone()],
                )
                .await
            {
                if let Ok(Some(crow)) = crm_rows.next().await {
                    pl = crow.get::<String>(0).ok().filter(|s| !s.is_empty());
                }
                while crm_rows.next().await.map(|r| r.is_some()).unwrap_or(false) {}
            }
        }
        pl
    };

    let Some(pl_id) = price_list_id else {
        return Ok(base_price); // no price list → use base
    };

    // Step 2: get price list (scoped Rows)
    let (items_json, discount_pct): (String, f64) = {
        let mut rows = conn
            .query(
                "SELECT price_list_items, discount_pct \
             FROM shop_price_lists WHERE id = ? AND profile_id = ? AND is_active = 1",
                crate::turso_params![pl_id, profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        let result = if let Ok(Some(row)) = rows.next().await {
            let items: String = row.get(0).unwrap_or_else(|_| "{}".into());
            let disc: f64 = row.get(1).unwrap_or(0.0);
            (items, disc)
        } else {
            return Ok(base_price); // price list deleted or inactive
        };
        while rows.next().await.map(|r| r.is_some()).unwrap_or(false) {}
        result
    };

    // Step 3: resolve price
    if let Ok(JsonValue::Object(map)) = serde_json::from_str::<JsonValue>(&items_json) {
        if let Some(override_val) = map.get(&item_id) {
            let override_price = override_val.as_f64().unwrap_or(base_price);
            return Ok(override_price);
        }
    }

    // No specific override → apply global discount
    let effective = base_price * (1.0 - discount_pct / 100.0);
    Ok(effective.max(0.0))
}
