// src-tauri/src/commands/shop/units.rs
//
// Shop units commands — Phase 1
//
// What this file does:
//   Units define how quantity is measured (pcs, kg, litre, hour, etc.).
//   Auto-seeds preset standard measurement units if no units exist yet.
//   Supports CRUD for shop_units.
//
// Tables used: shop_units
// Commands: shop_list_units, shop_seed_units, shop_create_unit, shop_update_unit, shop_delete_unit

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopUnit {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub symbol: String,
    pub unit_type: String,
    pub is_decimal: i64,
    pub is_default: i64,
    pub is_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateUnitData {
    pub name: String,
    pub symbol: String,
    pub unit_type: Option<String>,
    pub is_decimal: Option<i64>,
    pub is_default: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUnitData {
    pub name: String,
    pub symbol: String,
    pub unit_type: Option<String>,
    pub is_decimal: Option<i64>,
    pub is_default: Option<i64>,
}

pub struct PresetUnit {
    pub suffix: &'static str,
    pub name: &'static str,
    pub symbol: &'static str,
    pub unit_type: &'static str,
    pub is_decimal: i64,
    pub is_default: i64,
}

pub const PRESET_SHOP_UNITS: &[PresetUnit] = &[
    PresetUnit { suffix: "pcs", name: "Piece", symbol: "pcs", unit_type: "count", is_decimal: 0, is_default: 1 },
    PresetUnit { suffix: "box", name: "Box", symbol: "box", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "pack", name: "Pack", symbol: "pk", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "strip", name: "Strip", symbol: "strip", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "tab", name: "Tablet", symbol: "tab", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "cap", name: "Capsule", symbol: "cap", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "btl", name: "Bottle", symbol: "btl", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "vial", name: "Vial", symbol: "vial", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "amp", name: "Ampoule", symbol: "amp", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "tube", name: "Tube", symbol: "tube", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "sachet", name: "Sachet", symbol: "sachet", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "doz", name: "Dozen", symbol: "dz", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "set", name: "Set", symbol: "set", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "pair", name: "Pair", symbol: "pr", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "person", name: "Person / Guest", symbol: "pax", unit_type: "count", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "kg", name: "Kilogram", symbol: "kg", unit_type: "weight", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "gm", name: "Gram", symbol: "g", unit_type: "weight", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "mg", name: "Milligram", symbol: "mg", unit_type: "weight", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "ton", name: "Metric Ton", symbol: "t", unit_type: "weight", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "lb", name: "Pound", symbol: "lb", unit_type: "weight", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "oz", name: "Ounce", symbol: "oz", unit_type: "weight", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "ltr", name: "Litre", symbol: "L", unit_type: "volume", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "ml", name: "Millilitre", symbol: "mL", unit_type: "volume", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "gal", name: "Gallon", symbol: "gal", unit_type: "volume", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "cu_m", name: "Cubic Metre", symbol: "cu.m", unit_type: "volume", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "m", name: "Metre", symbol: "m", unit_type: "length", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "cm", name: "Centimetre", symbol: "cm", unit_type: "length", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "mm", name: "Millimetre", symbol: "mm", unit_type: "length", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "ft", name: "Feet", symbol: "ft", unit_type: "length", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "in", name: "Inch", symbol: "in", unit_type: "length", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "sqm", name: "Square Metre", symbol: "sq.m", unit_type: "area", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "sqft", name: "Square Feet", symbol: "sq.ft", unit_type: "area", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "hr", name: "Hour", symbol: "hr", unit_type: "time", is_decimal: 1, is_default: 0 },
    PresetUnit { suffix: "day", name: "Day", symbol: "day", unit_type: "time", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "night", name: "Night", symbol: "night", unit_type: "time", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "month", name: "Month", symbol: "mo", unit_type: "time", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "session", name: "Session", symbol: "sess", unit_type: "service", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "visit", name: "Visit", symbol: "visit", unit_type: "service", is_decimal: 0, is_default: 0 },
    PresetUnit { suffix: "service", name: "Service", symbol: "srv", unit_type: "service", is_decimal: 0, is_default: 0 },
];

// ── Commands ──────────────────────────────────────────────────────────────────

/// Seed standard preset units of measurement for the active profile.
#[tauri::command]
pub async fn shop_seed_units(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopUnit>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    for unit in PRESET_SHOP_UNITS.iter() {
        let unit_id = format!("{}_{}", profile_id, unit.suffix);
        let _ = conn
            .execute(
                "INSERT INTO shop_units \
                 (id, profile_id, name, symbol, unit_type, is_decimal, is_default, is_active) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1) \
                 ON CONFLICT(id) DO UPDATE SET \
                   name=excluded.name, \
                   symbol=excluded.symbol, \
                   unit_type=excluded.unit_type, \
                   is_decimal=excluded.is_decimal, \
                   is_active=1",
                crate::turso_params![
                    unit_id,
                    profile_id.clone(),
                    unit.name.to_string(),
                    unit.symbol.to_string(),
                    unit.unit_type.to_string(),
                    unit.is_decimal,
                    unit.is_default
                ],
            )
            .await;
    }

    let mut rows = conn
        .query(
            "SELECT id, profile_id, name, symbol, unit_type, is_decimal, is_default, is_active \
             FROM shop_units \
             WHERE profile_id = ? AND is_active = 1 \
             ORDER BY is_default DESC, unit_type ASC, name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut units = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        units.push(ShopUnit {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            name: row.get(2).unwrap_or_default(),
            symbol: row.get(3).unwrap_or_default(),
            unit_type: row.get(4).unwrap_or_else(|_| "count".to_string()),
            is_decimal: row.get(5).unwrap_or(0),
            is_default: row.get(6).unwrap_or(0),
            is_active: row.get(7).unwrap_or(1),
        });
    }

    Ok(units)
}

/// List all active units for the active profile.
/// Auto-seeds preset standard measurement units if no units exist yet.
#[tauri::command]
pub async fn shop_list_units(state: State<'_, Arc<AppState>>) -> Result<Vec<ShopUnit>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, name, symbol, unit_type, is_decimal, is_default, is_active \
         FROM shop_units \
         WHERE profile_id = ? AND is_active = 1 \
         ORDER BY is_default DESC, unit_type ASC, name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut units = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        units.push(ShopUnit {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            name: row.get(2).unwrap_or_default(),
            symbol: row.get(3).unwrap_or_default(),
            unit_type: row.get(4).unwrap_or_else(|_| "count".to_string()),
            is_decimal: row.get(5).unwrap_or(0),
            is_default: row.get(6).unwrap_or(0),
            is_active: row.get(7).unwrap_or(1),
        });
    }

    if units.is_empty() {
        return shop_seed_units(state).await;
    }

    Ok(units)
}

/// Create a new measurement unit for the active profile.
#[tauri::command]
pub async fn shop_create_unit(
    data: CreateUnitData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopUnit, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let id = format!("unit-{}", ts);
    let unit_type = data.unit_type.unwrap_or_else(|| "count".to_string());
    let is_decimal = data.is_decimal.unwrap_or(0);
    let is_default = data.is_default.unwrap_or(0);

    if is_default == 1 {
        let _ = conn
            .execute(
                "UPDATE shop_units SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    conn.execute(
        "INSERT INTO shop_units \
         (id, profile_id, name, symbol, unit_type, is_decimal, is_default, is_active) \
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.name.clone(),
            data.symbol.clone(),
            unit_type.clone(),
            is_decimal,
            is_default,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ShopUnit {
        id,
        profile_id,
        name: data.name,
        symbol: data.symbol,
        unit_type,
        is_decimal,
        is_default,
        is_active: 1,
    })
}

/// Update an existing measurement unit.
#[tauri::command]
pub async fn shop_update_unit(
    unit_id: String,
    data: UpdateUnitData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopUnit, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let unit_type = data.unit_type.unwrap_or_else(|| "count".to_string());
    let is_decimal = data.is_decimal.unwrap_or(0);

    if let Some(1) = data.is_default {
        let _ = conn
            .execute(
                "UPDATE shop_units SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    if let Some(def) = data.is_default {
        conn.execute(
            "UPDATE shop_units \
             SET name = ?, symbol = ?, unit_type = ?, is_decimal = ?, is_default = ? \
             WHERE id = ? AND profile_id = ?",
            crate::turso_params![
                data.name.clone(),
                data.symbol.clone(),
                unit_type.clone(),
                is_decimal,
                def,
                unit_id.clone(),
                profile_id.clone(),
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE shop_units \
             SET name = ?, symbol = ?, unit_type = ?, is_decimal = ? \
             WHERE id = ? AND profile_id = ?",
            crate::turso_params![
                data.name.clone(),
                data.symbol.clone(),
                unit_type.clone(),
                is_decimal,
                unit_id.clone(),
                profile_id.clone(),
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    let is_default = data.is_default.unwrap_or(0);

    Ok(ShopUnit {
        id: unit_id,
        profile_id,
        name: data.name,
        symbol: data.symbol,
        unit_type,
        is_decimal,
        is_default,
        is_active: 1,
    })
}

/// Set a measurement unit as default for the active profile.
#[tauri::command]
pub async fn shop_set_default_unit(
    unit_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_units SET is_default = 0 WHERE profile_id = ?",
        crate::turso_params![profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_units SET is_default = 1 WHERE id = ? AND profile_id = ?",
        crate::turso_params![unit_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Soft-delete a measurement unit (sets is_active = 0).
#[tauri::command]
pub async fn shop_delete_unit(
    unit_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_units SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![unit_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
