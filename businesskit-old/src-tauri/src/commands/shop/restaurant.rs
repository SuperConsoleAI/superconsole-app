// src-tauri/src/commands/shop/restaurant.rs
//
// WHAT:  Restaurant, Café & Cloud Kitchen management commands — Phase 5 (Book Time).
//
// DOMAIN SCHEMA TARGETS:
//   shop_locations      — Physical dining spots (tables, counters, private rooms)
//   shop_reservations   — Anti-double-booking time slot reservation ledger
//   shop_documents      — Used for KOT (doc_type='kot') & Restaurant Invoices
//   shop_document_lines — Items included in KOT / Bill
//   shop_bom_headers    — Recipe header for finished menu dishes
//   shop_bom_lines      — Raw ingredients required per recipe yield
//
// RULES: No server$, pure Rust Tauri commands using AppState. Zero system keychain dependencies.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

// ── Structs & Data Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopTable {
    pub id: String,
    pub profile_id: String,
    pub location_type: String, // 'table' | 'room' | 'counter'
    pub name: String,          // e.g. "Table 4"
    pub number: Option<String>,
    pub floor: Option<String>, // e.g. "Main Floor", "Terrace"
    pub capacity: i64,
    pub base_rate: f64,
    pub amenities: String,     // JSON string e.g. '["AC", "Window"]'
    pub rate_overrides: String, // JSON string e.g. '{"2026-12-24": 5000}'
    pub booking_rules: String,  // JSON string e.g. '{"min_nights": 1}'
    pub status: String,        // 'available' | 'occupied' | 'reserved' | 'maintenance'
    pub is_active: i64,
    pub sort_order: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateTableData {
    pub name: String,
    pub number: Option<String>,
    pub floor: Option<String>,
    pub capacity: Option<i64>,
    pub base_rate: Option<f64>,
    pub amenities: Option<Vec<String>>,
    pub rate_overrides: Option<String>,
    pub booking_rules: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopReservation {
    pub id: String,
    pub profile_id: String,
    pub item_id: String,
    pub item_type: String,     // 'table' | 'service' | 'stay'
    pub location_id: Option<String>,
    pub staff_id: Option<String>,
    pub order_id: Option<String>,
    pub document_id: Option<String>,
    pub customer_id: Option<String>,
    pub source_channel: String, // 'direct' | 'walk_in' | 'zomato' | 'eazydiner' | 'airbnb'
    pub status: String,        // 'hold' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
    pub slot_start: i64,
    pub slot_end: i64,
    pub party_size: i64,
    pub notes: Option<String>,
    pub meta: String,
    pub confirmed_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateReservationData {
    pub item_id: String,
    pub location_id: Option<String>,
    pub staff_id: Option<String>,
    pub customer_id: Option<String>,
    pub source_channel: Option<String>,
    pub slot_start: i64,
    pub slot_end: i64,
    pub party_size: Option<i64>,
    pub notes: Option<String>,
    pub meta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KOTLineItem {
    pub id: String,
    pub item_id: String,
    pub item_name: String,
    pub qty: f64,
    pub unit_price: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopKOT {
    pub id: String,
    pub profile_id: String,
    pub doc_number: String,
    pub location_id: Option<String>,
    pub location_name: Option<String>,
    pub waiter_name: Option<String>,
    pub status: String, // 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled'
    pub lines: Vec<KOTLineItem>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct SendKOTData {
    pub location_id: Option<String>,
    pub waiter_name: Option<String>,
    pub service_mode: Option<String>,
    pub lines: Vec<KOTLineItem>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BOMLine {
    pub id: String,
    pub component_item_id: String,
    pub component_item_name: String,
    pub qty_required: f64,
    pub unit: Option<String>,
    pub wastage_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopRecipe {
    pub id: String,
    pub profile_id: String,
    pub item_id: String,
    pub item_name: String,
    pub yield_qty: f64,
    pub yield_unit: Option<String>,
    pub lines: Vec<BOMLine>,
    pub notes: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct SaveRecipeData {
    pub item_id: String,
    pub yield_qty: f64,
    pub yield_unit: Option<String>,
    pub lines: Vec<BOMLine>,
    pub notes: Option<String>,
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn now_micros() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros()
}



// ── Tables / Locations Commands ───────────────────────────────────────────────

#[tauri::command]
pub async fn shop_list_restaurant_tables(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopTable>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, location_type, name, number, floor, capacity, \
                    base_rate, amenities, COALESCE(rate_overrides, '{}'), COALESCE(booking_rules, '{}'), status, is_active, sort_order \
             FROM shop_locations \
             WHERE profile_id = ? AND (location_type = 'table' OR location_type = 'counter' OR location_type IS NULL OR location_type = '') AND (archived = 0 OR archived IS NULL) \
             ORDER BY sort_order ASC, name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut tables = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        tables.push(ShopTable {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            location_type: row.get(2).unwrap_or_else(|_| "table".into()),
            name: row.get(3).unwrap_or_default(),
            number: row.get(4).ok(),
            floor: row.get(5).ok(),
            capacity: row.get(6).unwrap_or(1),
            base_rate: row.get(7).unwrap_or(0.0),
            amenities: row.get(8).unwrap_or_else(|_| "[]".into()),
            rate_overrides: row.get(9).unwrap_or_else(|_| "{}".into()),
            booking_rules: row.get(10).unwrap_or_else(|_| "{}".into()),
            status: row.get(11).unwrap_or_else(|_| "available".into()),
            is_active: row.get(12).unwrap_or(1),
            sort_order: row.get(13).unwrap_or(0),
        });
    }
    Ok(tables)
}

#[tauri::command]
pub async fn shop_create_restaurant_table(
    data: CreateTableData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopTable, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = format!("tbl-{}", now_micros());
    let amenities_json = serde_json::to_string(&data.amenities.unwrap_or_default())
        .unwrap_or_else(|_| "[]".into());
    let rate_overrides_json = data.rate_overrides.unwrap_or_else(|| "{}".into());
    let booking_rules_json = data.booking_rules.unwrap_or_else(|| "{}".into());
    let capacity = data.capacity.unwrap_or(4);
    let base_rate = data.base_rate.unwrap_or(0.0);

    conn.execute(
        "INSERT INTO shop_locations \
         (id, profile_id, location_type, name, number, floor, capacity, base_rate, amenities, rate_overrides, booking_rules, status, is_active) \
         VALUES (?, ?, 'table', ?, ?, ?, ?, ?, ?, ?, ?, 'available', 1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.name.clone(),
            data.number.clone(),
            data.floor.clone(),
            capacity,
            base_rate,
            amenities_json.clone(),
            rate_overrides_json.clone(),
            booking_rules_json.clone(),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ShopTable {
        id,
        profile_id,
        location_type: "table".into(),
        name: data.name,
        number: data.number,
        floor: data.floor,
        capacity,
        base_rate,
        amenities: amenities_json,
        rate_overrides: rate_overrides_json,
        booking_rules: booking_rules_json,
        status: "available".into(),
        is_active: 1,
        sort_order: 0,
    })
}

#[tauri::command]
pub async fn shop_update_table_status(
    table_id: String,
    status: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_locations SET status = ?, updated_at = (strftime('%s','now')) \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![status, table_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_delete_restaurant_table(
    table_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_locations SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![table_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Reservations & Availability Commands ──────────────────────────────────────

#[tauri::command]
pub async fn shop_check_table_availability(
    location_id: String,
    slot_start: i64,
    slot_end: i64,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM shop_reservations \
             WHERE profile_id = ? AND location_id = ? AND status IN ('hold', 'confirmed', 'checked_in') \
               AND ((slot_start <= ? AND slot_end > ?) OR (slot_start < ? AND slot_end >= ?) OR (slot_start >= ? AND slot_end <= ?))",
            crate::turso_params![
                profile_id,
                location_id,
                slot_start,
                slot_start,
                slot_end,
                slot_end,
                slot_start,
                slot_end
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        let count: i64 = row.get(0).unwrap_or(0);
        return Ok(count == 0);
    }

    Ok(true)
}

#[tauri::command]
pub async fn shop_list_restaurant_reservations(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopReservation>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, item_id, item_type, location_id, staff_id, order_id, document_id, \
                    customer_id, COALESCE(source_channel, 'direct'), status, slot_start, slot_end, party_size, notes, COALESCE(meta, '{}'), confirmed_at, created_at \
             FROM shop_reservations \
             WHERE profile_id = ? \
             ORDER BY slot_start DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(ShopReservation {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            item_id: row.get(2).unwrap_or_default(),
            item_type: row.get(3).unwrap_or_else(|_| "table".into()),
            location_id: row.get(4).ok(),
            staff_id: row.get(5).ok(),
            order_id: row.get(6).ok(),
            document_id: row.get(7).ok(),
            customer_id: row.get(8).ok(),
            source_channel: row.get(9).unwrap_or_else(|_| "direct".into()),
            status: row.get(10).unwrap_or_else(|_| "confirmed".into()),
            slot_start: row.get(11).unwrap_or(0),
            slot_end: row.get(12).unwrap_or(0),
            party_size: row.get(13).unwrap_or(1),
            notes: row.get(14).ok(),
            meta: row.get(15).unwrap_or_else(|_| "{}".into()),
            confirmed_at: row.get(16).ok(),
            created_at: row.get(17).unwrap_or(0),
        });
    }
    Ok(list)
}

#[tauri::command]
pub async fn shop_create_table_reservation(
    data: CreateReservationData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopReservation, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    if let Some(loc_id) = &data.location_id {
        let is_avail = shop_check_table_availability(
            loc_id.clone(),
            data.slot_start,
            data.slot_end,
            state.clone(),
        )
        .await?;
        if !is_avail {
            return Err("Selected table is already reserved or occupied for this time slot".into());
        }
    }

    let id = format!("res-{}", now_micros());
    let ts = now_ts();
    let source_chan = data.source_channel.unwrap_or_else(|| "direct".into());
    let meta_json = data.meta.unwrap_or_else(|| "{}".into());

    conn.execute(
        "INSERT INTO shop_reservations \
         (id, profile_id, item_id, item_type, location_id, staff_id, customer_id, source_channel, status, slot_start, slot_end, party_size, notes, meta, confirmed_at, created_at) \
         VALUES (?, ?, ?, 'table', ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.item_id.clone(),
            data.location_id.clone(),
            data.staff_id.clone(),
            data.customer_id.clone(),
            source_chan.clone(),
            data.slot_start,
            data.slot_end,
            data.party_size.unwrap_or(1),
            data.notes.clone(),
            meta_json.clone(),
            ts,
            ts,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // If location assigned, update table status to 'reserved'
    if let Some(loc_id) = &data.location_id {
        let _ = conn.execute(
            "UPDATE shop_locations SET status = 'reserved' WHERE id = ? AND profile_id = ?",
            crate::turso_params![loc_id.clone(), profile_id.clone()],
        ).await;
    }

    Ok(ShopReservation {
        id,
        profile_id,
        item_id: data.item_id,
        item_type: "table".into(),
        location_id: data.location_id,
        staff_id: data.staff_id,
        order_id: None,
        document_id: None,
        customer_id: data.customer_id,
        source_channel: source_chan,
        status: "confirmed".into(),
        slot_start: data.slot_start,
        slot_end: data.slot_end,
        party_size: data.party_size.unwrap_or(1),
        notes: data.notes,
        meta: meta_json,
        confirmed_at: Some(ts),
        created_at: ts,
    })
}

#[tauri::command]
pub async fn shop_update_reservation_status(
    reservation_id: String,
    status: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_reservations SET status = ?, updated_at = (strftime('%s','now')) WHERE id = ? AND profile_id = ?",
        crate::turso_params![status, reservation_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Kitchen Order Tickets (KOT) Commands ─────────────────────────────────────

#[tauri::command]
pub async fn shop_send_kot(
    data: SendKOTData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopKOT, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let ts = now_ts();
    let id = format!("kot-{}", now_micros());
    let doc_number = format!("KOT-{}", ts % 100000);
    let service_mode = data.service_mode.clone().unwrap_or_else(|| "dine_in".to_string());

    // Save master document (doc_type = 'kot') with waiter_name stored in staff_id column
    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, doc_type, doc_number, location_id, staff_id, service_mode, status, notes, created_at, updated_at) \
         VALUES (?, ?, 'kot', ?, ?, ?, ?, 'pending', ?, ?, ?)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            doc_number.clone(),
            data.location_id.clone(),
            data.waiter_name.clone(),
            service_mode,
            data.notes.clone(),
            ts,
            ts,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Get location name if provided
    let mut loc_name = None;
    if let Some(loc_id) = &data.location_id {
        let mut r = conn
            .query(
                "SELECT name FROM shop_locations WHERE id = ? AND profile_id = ?",
                crate::turso_params![loc_id.clone(), profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        if let Ok(Some(row)) = r.next().await {
            loc_name = row.get::<String>(0).ok();
        }
        // Mark table as occupied
        let _ = conn.execute(
            "UPDATE shop_locations SET status = 'occupied' WHERE id = ? AND profile_id = ?",
            crate::turso_params![loc_id.clone(), profile_id.clone()],
        ).await;
    }

    // Save lines (dish name is stored in description, custom notes in line_meta)
    let mut inserted_lines = Vec::new();
    for line in &data.lines {
        let line_id = if !line.id.is_empty() && !line.id.starts_with("line-") {
            line.id.clone()
        } else {
            format!("line-{}", now_micros())
        };
        let notes_str = line.notes.clone().unwrap_or_default();
        let uprice = line.unit_price.unwrap_or(0.0);
        let ltotal = uprice * line.qty;
        let _ = conn
            .execute(
                "INSERT INTO shop_document_lines \
                 (id, profile_id, document_id, item_id, description, qty, unit_price, line_meta, line_total) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                crate::turso_params![
                    line_id.clone(),
                    profile_id.clone(),
                    id.clone(),
                    line.item_id.clone(),
                    line.item_name.clone(),
                    line.qty,
                    uprice,
                    notes_str,
                    ltotal,
                ],
            )
            .await;
        inserted_lines.push(KOTLineItem {
            id: line_id,
            item_id: line.item_id.clone(),
            item_name: line.item_name.clone(),
            qty: line.qty,
            unit_price: if uprice > 0.0 { Some(uprice) } else { None },
            notes: line.notes.clone(),
        });
    }

    Ok(ShopKOT {
        id,
        profile_id,
        doc_number,
        location_id: data.location_id,
        location_name: loc_name,
        waiter_name: data.waiter_name,
        status: "pending".into(),
        lines: inserted_lines,
        notes: data.notes,
        created_at: ts,
    })
}

#[tauri::command]
pub async fn shop_list_kots(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopKOT>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT d.id, d.profile_id, d.doc_number, d.status, d.notes, d.created_at, d.location_id, l.name, d.staff_id \
             FROM shop_documents d \
             LEFT JOIN shop_locations l ON l.id = d.location_id \
             WHERE d.profile_id = ? AND d.doc_type = 'kot' \
             ORDER BY d.created_at DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut kots = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let kot_id: String = row.get(0).unwrap_or_default();
        let prof_id: String = row.get(1).unwrap_or_default();
        let doc_num: String = row.get(2).unwrap_or_default();
        let status: String = row.get(3).unwrap_or_else(|_| "pending".into());
        let notes: Option<String> = row.get(4).ok();
        let created_at: i64 = row.get(5).unwrap_or(0);
        let loc_id: Option<String> = row.get(6).ok();
        let loc_name: Option<String> = row.get(7).ok();
        let waiter_name: Option<String> = row.get::<Option<String>>(8).unwrap_or(None).filter(|s| !s.trim().is_empty());

        // Fetch lines for this KOT with dish name and unit price fallback from shop_items
        let mut line_rows = conn
            .query(
                "SELECT l.id, l.item_id, COALESCE(NULLIF(l.description, ''), i.name, 'Dish'), l.qty, l.line_meta, COALESCE(NULLIF(l.unit_price, 0), i.price, 0) \
                 FROM shop_document_lines l \
                 LEFT JOIN shop_items i ON l.item_id = i.id \
                 WHERE l.document_id = ?",
                crate::turso_params![kot_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut lines = Vec::new();
        while let Ok(Some(lr)) = line_rows.next().await {
            let note_val: Option<String> = lr.get(4).ok();
            let uprice: f64 = lr.get(5).unwrap_or(0.0);
            lines.push(KOTLineItem {
                id: lr.get(0).unwrap_or_default(),
                item_id: lr.get(1).unwrap_or_default(),
                item_name: lr.get(2).unwrap_or_default(),
                qty: lr.get(3).unwrap_or(1.0),
                unit_price: if uprice > 0.0 { Some(uprice) } else { None },
                notes: if note_val.as_deref() == Some("") || note_val.as_deref() == Some("{}") { None } else { note_val },
            });
        }

        kots.push(ShopKOT {
            id: kot_id,
            profile_id: prof_id,
            doc_number: doc_num,
            location_id: loc_id,
            location_name: loc_name,
            waiter_name,
            status,
            lines,
            notes,
            created_at,
        });
    }

    Ok(kots)
}

#[tauri::command]
pub async fn shop_update_kot_status(
    kot_id: String,
    status: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_documents SET status = ?, updated_at = (strftime('%s','now')) WHERE id = ? AND profile_id = ?",
        crate::turso_params![status, kot_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_update_kot_line(
    line_id: String,
    kot_id: Option<String>,
    item_id: Option<String>,
    qty: f64,
    notes: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let _profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    if qty <= 0.0 {
        if let (Some(k), Some(i)) = (&kot_id, &item_id) {
            let _ = conn.execute(
                "DELETE FROM shop_document_lines WHERE id = ? OR (document_id = ? AND item_id = ?)",
                crate::turso_params![line_id, k, i],
            ).await;
        } else {
            let _ = conn.execute(
                "DELETE FROM shop_document_lines WHERE id = ?",
                crate::turso_params![line_id],
            ).await;
        }
    } else {
        if let (Some(k), Some(i)) = (&kot_id, &item_id) {
            if let Some(n) = notes {
                let _ = conn.execute(
                    "UPDATE shop_document_lines SET qty = ?, line_total = ? * COALESCE(unit_price, 0), line_meta = ? WHERE id = ? OR (document_id = ? AND item_id = ?)",
                    crate::turso_params![qty, qty, n, line_id, k, i],
                ).await;
            } else {
                let _ = conn.execute(
                    "UPDATE shop_document_lines SET qty = ?, line_total = ? * COALESCE(unit_price, 0) WHERE id = ? OR (document_id = ? AND item_id = ?)",
                    crate::turso_params![qty, qty, line_id, k, i],
                ).await;
            }
        } else {
            if let Some(n) = notes {
                let _ = conn.execute(
                    "UPDATE shop_document_lines SET qty = ?, line_total = ? * COALESCE(unit_price, 0), line_meta = ? WHERE id = ?",
                    crate::turso_params![qty, qty, n, line_id],
                ).await;
            } else {
                let _ = conn.execute(
                    "UPDATE shop_document_lines SET qty = ?, line_total = ? * COALESCE(unit_price, 0) WHERE id = ?",
                    crate::turso_params![qty, qty, line_id],
                ).await;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn shop_delete_kot_line(
    line_id: String,
    kot_id: Option<String>,
    item_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let _profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    if let (Some(k), Some(i)) = (&kot_id, &item_id) {
        let _ = conn.execute(
            "DELETE FROM shop_document_lines WHERE id = ? OR (document_id = ? AND item_id = ?)",
            crate::turso_params![line_id, k, i],
        ).await;
    } else {
        let _ = conn.execute(
            "DELETE FROM shop_document_lines WHERE id = ?",
            crate::turso_params![line_id],
        ).await;
    }

    Ok(())
}

// ── Recipe / BOM Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn shop_list_recipes(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopRecipe>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT b.id, b.profile_id, b.item_id, COALESCE(i.name, 'Dish') AS item_name, b.yield_qty, b.yield_unit_id, b.notes, b.is_active \
             FROM shop_bom_headers b \
             LEFT JOIN shop_items i ON b.item_id = i.id \
             WHERE b.profile_id = ? AND b.is_active = 1 \
             ORDER BY b.created_at DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut recipes = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let bom_id: String = row.get(0).unwrap_or_default();
        let prof_id: String = row.get(1).unwrap_or_default();
        let item_id: String = row.get(2).unwrap_or_default();
        let item_name: String = row.get(3).unwrap_or_else(|_| "Dish".into());
        let yield_qty: f64 = row.get(4).unwrap_or(1.0);
        let yield_unit: Option<String> = row.get(5).ok();
        let notes: Option<String> = row.get(6).ok();
        let is_active: i64 = row.get(7).unwrap_or(1);

        // Fetch ingredients
        let mut line_rows = conn
            .query(
                "SELECT l.id, l.component_item_id, COALESCE(i.name, 'Ingredient') AS comp_name, l.qty_required, l.unit_id, l.wastage_pct \
                 FROM shop_bom_lines l \
                 LEFT JOIN shop_items i ON l.component_item_id = i.id \
                 WHERE l.bom_id = ?",
                crate::turso_params![bom_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut lines = Vec::new();
        while let Ok(Some(lr)) = line_rows.next().await {
            lines.push(BOMLine {
                id: lr.get(0).unwrap_or_default(),
                component_item_id: lr.get(1).unwrap_or_default(),
                component_item_name: lr.get(2).unwrap_or_else(|_| "Ingredient".into()),
                qty_required: lr.get(3).unwrap_or(0.0),
                unit: lr.get(4).ok(),
                wastage_pct: lr.get(5).unwrap_or(0.0),
            });
        }

        recipes.push(ShopRecipe {
            id: bom_id,
            profile_id: prof_id,
            item_id,
            item_name,
            yield_qty,
            yield_unit,
            lines,
            notes,
            is_active,
        });
    }

    Ok(recipes)
}

#[tauri::command]
pub async fn shop_save_recipe(
    data: SaveRecipeData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopRecipe, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let bom_id = format!("bom-{}", now_micros());

    // Deactivate previous active recipes for this item
    let _ = conn.execute(
        "UPDATE shop_bom_headers SET is_active = 0 WHERE item_id = ? AND profile_id = ?",
        crate::turso_params![data.item_id.clone(), profile_id.clone()],
    ).await;

    conn.execute(
        "INSERT INTO shop_bom_headers \
         (id, profile_id, item_id, version, yield_qty, yield_unit_id, notes, is_active) \
         VALUES (?, ?, ?, 'v1', ?, ?, ?, 1)",
        crate::turso_params![
            bom_id.clone(),
            profile_id.clone(),
            data.item_id.clone(),
            data.yield_qty,
            data.yield_unit.clone(),
            data.notes.clone(),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Insert lines
    for line in &data.lines {
        let line_id = format!("boml-{}", now_micros());
        let _ = conn
            .execute(
                "INSERT INTO shop_bom_lines \
                 (id, profile_id, bom_id, component_item_id, qty_required, unit_id, wastage_pct) \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                crate::turso_params![
                    line_id,
                    profile_id.clone(),
                    bom_id.clone(),
                    line.component_item_id.clone(),
                    line.qty_required,
                    line.unit.clone(),
                    line.wastage_pct,
                ],
            )
            .await;
    }

    // Get dish name
    let mut dish_name = "Dish".to_string();
    let mut r = conn
        .query(
            "SELECT name FROM shop_items WHERE id = ? AND profile_id = ?",
            crate::turso_params![data.item_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    if let Ok(Some(row)) = r.next().await {
        dish_name = row.get(0).unwrap_or_else(|_| "Dish".into());
    }

    Ok(ShopRecipe {
        id: bom_id,
        profile_id,
        item_id: data.item_id,
        item_name: dish_name,
        yield_qty: data.yield_qty,
        yield_unit: data.yield_unit,
        lines: data.lines,
        notes: data.notes,
        is_active: 1,
    })
}

#[tauri::command]
pub async fn shop_delete_recipe(
    recipe_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_bom_headers SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![recipe_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Staff Management ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopStaff {
    pub id: String,
    pub profile_id: String,
    pub user_id: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub display_name: Option<String>,
    pub name: String,
    pub role: String, // 'waiter' | 'chef' | 'manager' | 'cashier' | 'driver' | 'staff'
    pub department: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub commission_pct: f64,
    pub is_active: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateStaffData {
    pub name: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub display_name: Option<String>,
    pub user_id: Option<String>,
    pub role: Option<String>,
    pub department: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub commission_pct: Option<f64>,
}

#[tauri::command]
pub async fn shop_list_staff(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopStaff>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT id, profile_id, user_id, first_name, last_name, display_name, name, role, department, phone, email, commission_pct, is_active, created_at, updated_at
             FROM shop_staff
             WHERE profile_id = ?1 AND is_active = 1
             ORDER BY name ASC",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(ShopStaff {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            user_id: row.get::<Option<String>>(2).unwrap_or(None),
            first_name: row.get::<Option<String>>(3).unwrap_or(None),
            last_name: row.get::<Option<String>>(4).unwrap_or(None),
            display_name: row.get::<Option<String>>(5).unwrap_or(None),
            name: row.get::<String>(6).unwrap_or_default(),
            role: row.get::<String>(7).unwrap_or_else(|_| "staff".into()),
            department: row.get::<Option<String>>(8).unwrap_or(None),
            phone: row.get::<Option<String>>(9).unwrap_or(None),
            email: row.get::<Option<String>>(10).unwrap_or(None),
            commission_pct: row.get::<f64>(11).unwrap_or(0.0),
            is_active: row.get::<i64>(12).unwrap_or(1),
            created_at: row.get::<i64>(13).unwrap_or(0),
            updated_at: row.get::<i64>(14).unwrap_or(0),
        });
    }

    Ok(list)
}

#[tauri::command]
pub async fn shop_create_staff(
    data: CreateStaffData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopStaff, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = format!("staff-{}", uuid::Uuid::new_v4());
    let now = chrono::Utc::now().timestamp();

    let full_name = data.name
        .or_else(|| {
            let f = data.first_name.clone().unwrap_or_default();
            let l = data.last_name.clone().unwrap_or_default();
            let combined = format!("{f} {l}").trim().to_string();
            if combined.is_empty() { None } else { Some(combined) }
        })
        .unwrap_or_else(|| "Staff Member".into());

    let role = data.role.unwrap_or_else(|| "waiter".into());
    let commission_pct = data.commission_pct.unwrap_or(0.0);

    conn.execute(
        "INSERT INTO shop_staff (id, profile_id, user_id, first_name, last_name, display_name, name, role, department, phone, email, commission_pct, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?13)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.user_id.clone(),
            data.first_name.clone(),
            data.last_name.clone(),
            data.display_name.clone(),
            full_name.clone(),
            role.clone(),
            data.department.clone(),
            data.phone.clone(),
            data.email.clone(),
            commission_pct,
            now
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ShopStaff {
        id,
        profile_id,
        user_id: data.user_id,
        first_name: data.first_name,
        last_name: data.last_name,
        display_name: data.display_name,
        name: full_name,
        role,
        department: data.department,
        phone: data.phone,
        email: data.email,
        commission_pct,
        is_active: 1,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn shop_update_staff(
    staff_id: String,
    data: CreateStaffData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    let full_name = data.name
        .or_else(|| {
            let f = data.first_name.clone().unwrap_or_default();
            let l = data.last_name.clone().unwrap_or_default();
            let combined = format!("{f} {l}").trim().to_string();
            if combined.is_empty() { None } else { Some(combined) }
        })
        .unwrap_or_else(|| "Staff Member".into());

    let role = data.role.unwrap_or_else(|| "waiter".into());
    let commission_pct = data.commission_pct.unwrap_or(0.0);

    conn.execute(
        "UPDATE shop_staff
         SET user_id = ?1, first_name = ?2, last_name = ?3, display_name = ?4, name = ?5, role = ?6, department = ?7, phone = ?8, email = ?9, commission_pct = ?10, updated_at = ?11
         WHERE id = ?12 AND profile_id = ?13",
        crate::turso_params![
            data.user_id,
            data.first_name,
            data.last_name,
            data.display_name,
            full_name,
            role,
            data.department,
            data.phone,
            data.email,
            commission_pct,
            now,
            staff_id,
            profile_id
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_delete_staff(
    staff_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_staff SET is_active = 0 WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![staff_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_update_table_waiter(
    table_id: String,
    waiter_name: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let tid = table_id.trim();

    conn.execute(
        "UPDATE shop_documents SET staff_id = ?, updated_at = (strftime('%s','now')) \
         WHERE profile_id = ? AND doc_type = 'kot' AND status != 'cancelled' AND \
         (location_id = ? OR LOWER(location_id) = LOWER(?) OR \
          location_id IN (SELECT id FROM shop_locations WHERE id = ? OR LOWER(name) = LOWER(?)))",
        crate::turso_params![waiter_name, profile_id, tid, tid, tid, tid],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Food Aggregator Orders Ingestion (Zomato / Swiggy / DoorDash / Uber Eats) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregatorOrderItem {
    pub item_id: Option<String>,
    pub item_name: String,
    pub qty: f64,
    pub unit_price: f64,
    pub discount_pct: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AggregatorOrderPayload {
    pub aggregator: String, // "zomato" | "swiggy" | "doordash" | "ubereats"
    pub order_id: String,   // Platform order ID (maps to order_number / doc_number)
    pub service_mode: Option<String>, // "delivery" (default) | "takeaway"
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub delivery_address: Option<String>,
    pub items: Vec<AggregatorOrderItem>,
    pub subtotal: f64,
    pub discount_amt: Option<f64>,
    pub tax_amount: Option<f64>,
    pub delivery_fee: Option<f64>,
    pub grand_total: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AggregatorOrderResult {
    pub invoice_id: String,
    pub doc_number: String,
    pub channel: String,
    pub service_mode: String,
    pub grand_total: f64,
    pub is_duplicate: bool,
}

#[tauri::command]
pub async fn shop_ingest_aggregator_order(
    data: AggregatorOrderPayload,
    state: State<'_, Arc<AppState>>,
) -> Result<AggregatorOrderResult, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let channel = data.aggregator.to_lowercase();
    let service_mode = data.service_mode.unwrap_or_else(|| "delivery".into());
    let raw_order_id = data.order_id.trim();

    if raw_order_id.is_empty() {
        return Err("Aggregator order_id cannot be empty".into());
    }

    let prefix = match channel.as_str() {
        "zomato" => "ZOM",
        "swiggy" => "SWIGGY",
        "doordash" => "DD",
        "ubereats" => "UBER",
        other => other,
    };

    let is_already_prefixed = raw_order_id.to_uppercase().starts_with(&format!("{}-", prefix.to_uppercase()))
        || raw_order_id.to_uppercase().starts_with(&format!("{}-", channel.to_uppercase()))
        || raw_order_id.to_uppercase().starts_with("ZOM-")
        || raw_order_id.to_uppercase().starts_with("SW-")
        || raw_order_id.to_uppercase().starts_with("DD-")
        || raw_order_id.to_uppercase().starts_with("UBER-");

    let doc_number = if is_already_prefixed {
        raw_order_id.to_string()
    } else {
        format!("{}-{}", prefix, raw_order_id)
    };

    // 1. Idempotency Check: Check if document already exists for (profile_id, doc_type='invoice', doc_number)
    let mut check_rows = conn
        .query(
            "SELECT id, grand_total FROM shop_documents WHERE profile_id = ? AND doc_type = 'invoice' AND doc_number = ?",
            crate::turso_params![profile_id.clone(), doc_number.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = check_rows.next().await {
        let inv_id: String = row.get(0).unwrap_or_default();
        let total: f64 = row.get(1).unwrap_or(0.0);
        return Ok(AggregatorOrderResult {
            invoice_id: inv_id,
            doc_number,
            channel,
            service_mode,
            grand_total: total,
            is_duplicate: true,
        });
    }

    // 2. Link or create customer if phone/name provided and increment stats
    let mut customer_id: Option<String> = None;
    if let Some(ref phone) = data.customer_phone {
        if !phone.trim().is_empty() {
            let mut cust_rows = conn
                .query(
                    "SELECT id FROM shop_customers WHERE profile_id = ? AND phone = ?",
                    crate::turso_params![profile_id.clone(), phone.clone()],
                )
                .await
                .ok();
            if let Some(ref mut rows) = cust_rows {
                if let Ok(Some(row)) = rows.next().await {
                    customer_id = row.get(0).ok();
                }
            }

            if let Some(ref cid) = customer_id {
                let _ = conn.execute(
                    "UPDATE shop_customers SET total_orders = total_orders + 1, total_spent = total_spent + ?, updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
                    crate::turso_params![data.grand_total, cid.clone(), profile_id.clone()],
                ).await;
            } else {
                let new_cid = format!("cust-{}", now_micros());
                let cname = data.customer_name.as_deref().unwrap_or("Aggregator Guest");
                let _ = conn.execute(
                    "INSERT INTO shop_customers (id, profile_id, name, phone, address, total_orders, total_spent, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, ?, 1, ?, unixepoch(), unixepoch())",
                    crate::turso_params![new_cid.clone(), profile_id.clone(), cname, phone.clone(), data.delivery_address.clone(), data.grand_total],
                ).await;
                customer_id = Some(new_cid);
            }
        }
    }

    let invoice_id = format!("doc-{}", now_micros());
    let ts = now_ts();

    let notes_combined = format!(
        "[{}] Order #{}{}{}",
        channel.to_uppercase(),
        doc_number,
        data.customer_name.as_ref().map(|n| format!(" | Customer: {}", n)).unwrap_or_default(),
        data.notes.as_ref().map(|n| format!(" | Note: {}", n)).unwrap_or_default()
    );

    // 3. Tax Breakdown Component Split (Regime-aware: GST / VAT / Sales Tax / Exempt)
    let tax_amt = data.tax_amount.unwrap_or(0.0);
    let mut biz_regime = "GST".to_string();
    if let Ok(mut reg_rows) = conn
        .query(
            "SELECT regime FROM fin_tax_configs WHERE profile_id = ? LIMIT 1",
            crate::turso_params![profile_id.clone()],
        )
        .await
    {
        if let Ok(Some(r)) = reg_rows.next().await {
            biz_regime = r.get::<String>(0).unwrap_or_else(|_| "GST".into());
        }
    }
    let regime_norm = biz_regime.trim().to_uppercase().replace(['-', '_', ' '], "");

    let tax_breakdown_json = if tax_amt > 0.0 {
        if regime_norm == "VAT" {
            serde_json::json!({
                "vat": tax_amt,
                "tax_type": "vat"
            }).to_string()
        } else if regime_norm == "SALESTAX" {
            serde_json::json!({
                "sales_tax": tax_amt,
                "tax_type": "sales_tax"
            }).to_string()
        } else if regime_norm == "EXEMPT" {
            "{}".to_string()
        } else {
            // Default: India GST intra-state CGST + SGST component split
            let half = (tax_amt / 2.0 * 100.0).round() / 100.0;
            serde_json::json!({
                "cgst": half,
                "sgst": ((tax_amt - half) * 100.0).round() / 100.0,
                "igst": 0.0,
                "tax_type": "gst"
            }).to_string()
        }
    } else {
        "{}".to_string()
    };

    // 4. Lookup aggregator commission rate and calculation base from connections.extra JSON
    // e.g. {"commission_pct": 22, "commission_base": "net"} (or "gross")
    let mut commission_pct = 0.0_f64;
    let mut commission_base = "net".to_string(); // "net" = subtotal - discount; "gross" = gross subtotal
    let mut conn_rows = conn
        .query(
            "SELECT extra FROM connections WHERE profile_id = ? AND (LOWER(service) = ? OR LOWER(service) = ? OR LOWER(name) = ? OR LOWER(name) LIKE ?) LIMIT 1",
            crate::turso_params![
                profile_id.clone(),
                format!("{}_api", channel),
                channel.clone(),
                channel.clone(),
                format!("{}%", channel)
            ],
        )
        .await
        .ok();

    if let Some(ref mut rows) = conn_rows {
        if let Ok(Some(r)) = rows.next().await {
            if let Ok(extra_str) = r.get::<String>(0) {
                if let Ok(extra_json) = serde_json::from_str::<serde_json::Value>(&extra_str) {
                    if let Some(pct) = extra_json.get("commission_pct").and_then(|v| v.as_f64()) {
                        commission_pct = pct;
                    }
                    if let Some(base) = extra_json.get("commission_base").and_then(|v| v.as_str()) {
                        commission_base = base.to_lowercase();
                    }
                }
            }
        }
    }

    // Discount Treatment Assumption:
    // 1. Merchant-Funded Discounts (Default "net"): In typical Indian aggregator contracts (Zomato/Swiggy),
    //    commission is calculated on net food value after merchant promo discounts (subtotal - discount_amt).
    // 2. Platform-Funded Promos ("gross"): If an aggregator contract or promo is platform-funded, set
    //    `"commission_base": "gross"` in connections.extra to calculate commission against gross subtotal.
    let effective_subtotal = if commission_base == "gross" {
        data.subtotal.max(0.0)
    } else {
        (data.subtotal - data.discount_amt.unwrap_or(0.0)).max(0.0)
    };

    let commission_amount = if commission_pct > 0.0 {
        ((effective_subtotal * commission_pct / 100.0) * 100.0).round() / 100.0
    } else {
        0.0
    };

    // 5. Insert invoice document
    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, doc_type, doc_number, doc_date, status, channel, service_mode, customer_id, \
          subtotal, discount_amt, tax_amount, tax_breakdown, grand_total, amount_paid, amount_due, commission_amount, notes, created_at, updated_at) \
         VALUES (?, ?, 'invoice', ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
        crate::turso_params![
            invoice_id.clone(),
            profile_id.clone(),
            doc_number.clone(),
            ts,
            channel.clone(),
            service_mode.clone(),
            customer_id.clone(),
            data.subtotal,
            data.discount_amt.unwrap_or(0.0),
            tax_amt,
            tax_breakdown_json,
            data.grand_total,
            data.grand_total,
            commission_amount,
            notes_combined.clone(),
            ts,
            ts,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 6. Post accounting entry for commission: DR Aggregator Commission Expense (5300), CR Accounts Receivable — Aggregator (1250)
    if commission_amount > 0.0 {
        let exp_id = format!("exp-{}", now_micros());
        let expense_account_id = crate::commands::fin::journal::resolve_account_id(&conn, &profile_id, "5350", "expense").await.unwrap_or_else(|_| format!("{}_5350", profile_id));
        let receivable_account_id = crate::commands::fin::journal::resolve_account_id(&conn, &profile_id, "1250", "asset").await.unwrap_or_else(|_| format!("{}_1250", profile_id));

        let narration = format!("[{}] Commission for Order #{} ({}%)", channel.to_uppercase(), doc_number, commission_pct);

        let journal_id = crate::commands::fin::journal::post_journal_entry(
            &conn,
            &profile_id,
            &narration,
            Some(&invoice_id),
            &[
                (expense_account_id.clone(), commission_amount, 0.0, Some(format!("Aggregator commission on Order #{}", doc_number))),
                (receivable_account_id.clone(), 0.0, commission_amount, Some(format!("Commission netted from {} receivable", channel.to_uppercase()))),
            ],
        ).await.ok();

        let _ = conn.execute(
            "INSERT INTO fin_expenses \
             (id, profile_id, expense_date, category, account_id, amount, tax_amount, total_amount, payment_mode, description, document_id, journal_entry_id, created_at) \
             VALUES (?, ?, ?, 'Aggregator Commission', ?, ?, 0, ?, 'aggregator_deduction', ?, ?, ?, ?)",
            crate::turso_params![
                exp_id,
                profile_id.clone(),
                ts,
                expense_account_id,
                commission_amount,
                commission_amount,
                narration,
                invoice_id.clone(),
                journal_id,
                ts,
            ],
        ).await;
    }

    // 7. Insert lines and deduct stock ledger if inventory tracked
    for (idx, item) in data.items.iter().enumerate() {
        let line_id = format!("dln-{}-{}", invoice_id, idx + 1);
        let mut resolved_item_id = item.item_id.clone().unwrap_or_default();
        let mut track_inv = 0_i64;

        if !resolved_item_id.is_empty() {
            let mut item_chk = conn.query(
                "SELECT id, track_inventory FROM shop_items WHERE id = ? AND profile_id = ?",
                crate::turso_params![resolved_item_id.clone(), profile_id.clone()],
            ).await.ok();
            if let Some(ref mut rows) = item_chk {
                if let Ok(Some(row)) = rows.next().await {
                    track_inv = row.get::<i64>(1).unwrap_or(0);
                }
            }
        } else {
            let mut item_chk = conn.query(
                "SELECT id, track_inventory FROM shop_items WHERE LOWER(name) = LOWER(?) AND profile_id = ? LIMIT 1",
                crate::turso_params![item.item_name.clone(), profile_id.clone()],
            ).await.ok();
            if let Some(ref mut rows) = item_chk {
                if let Ok(Some(row)) = rows.next().await {
                    resolved_item_id = row.get::<String>(0).unwrap_or_default();
                    track_inv = row.get::<i64>(1).unwrap_or(0);
                }
            }
        }

        if resolved_item_id.is_empty() {
            resolved_item_id = format!("agg-item-{}", idx + 1);
        }

        let line_total = (item.qty * item.unit_price) * (1.0 - item.discount_pct.unwrap_or(0.0) / 100.0);

        conn.execute(
            "INSERT INTO shop_document_lines \
             (id, profile_id, document_id, line_number, item_id, description, qty, unit_price, discount_pct, line_total, notes) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            crate::turso_params![
                line_id,
                profile_id.clone(),
                invoice_id.clone(),
                (idx + 1) as i64,
                resolved_item_id.clone(),
                item.item_name.clone(),
                item.qty,
                item.unit_price,
                item.discount_pct.unwrap_or(0.0),
                line_total,
                item.notes.clone(),
            ],
        ).await.map_err(|e| e.to_string())?;

        // Deduct inventory stock if track_inventory = 1
        if track_inv == 1 {
            let mut cur_bal = 0.0_f64;
            let mut bal_rows = conn.query(
                "SELECT balance_after FROM shop_stock_ledger WHERE profile_id = ? AND item_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
                crate::turso_params![profile_id.clone(), resolved_item_id.clone()],
            ).await.ok();
            if let Some(ref mut rows) = bal_rows {
                if let Ok(Some(row)) = rows.next().await {
                    cur_bal = row.get::<f64>(0).unwrap_or(0.0);
                }
            }

            let sl_id = format!("sl-{}", now_micros());
            let _ = conn.execute(
                "INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, document_id, notes, created_at) \
                 VALUES (?, ?, ?, 'wh_default', 'sale', 0, ?, ?, ?, 'Aggregator Sale', unixepoch())",
                crate::turso_params![sl_id, profile_id.clone(), resolved_item_id.clone(), item.qty, cur_bal - item.qty, invoice_id.clone()],
            ).await;
        }
    }

    // 8. Automatically create a KOT for the kitchen
    let kot_id = format!("kot-{}", now_micros());
    let kot_number = format!("KOT-{}", doc_number);
    let _ = conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, doc_type, doc_number, doc_date, status, channel, service_mode, staff_id, location_id, notes, created_at, updated_at) \
         VALUES (?, ?, 'kot', ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            kot_id.clone(),
            profile_id.clone(),
            kot_number,
            ts,
            channel.clone(),
            service_mode.clone(),
            format!("{} Aggregator", channel.to_uppercase()),
            format!("Online Delivery ({})", channel.to_uppercase()),
            notes_combined.clone(),
            ts,
            ts,
        ],
    ).await;

    for (idx, item) in data.items.iter().enumerate() {
        let kot_line_id = format!("dln-{}-{}", kot_id, idx + 1);
        let item_id = item.item_id.clone().unwrap_or_else(|| format!("agg-item-{}", idx + 1));
        let _ = conn.execute(
            "INSERT INTO shop_document_lines \
             (id, profile_id, document_id, line_number, item_id, description, qty, unit_price, line_total, notes) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            crate::turso_params![
                kot_line_id,
                profile_id.clone(),
                kot_id.clone(),
                (idx + 1) as i64,
                item_id,
                item.item_name.clone(),
                item.qty,
                item.unit_price,
                item.qty * item.unit_price,
                item.notes.clone(),
            ],
        ).await;
    }

    Ok(AggregatorOrderResult {
        invoice_id,
        doc_number,
        channel,
        service_mode,
        grand_total: data.grand_total,
        is_duplicate: false,
    })
}

#[tauri::command]
pub async fn shop_cancel_aggregator_order(
    order_id: String,
    reason: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let oid = order_id.trim();
    let mut doc_rows = conn.query(
        "SELECT id, status, customer_id, grand_total FROM shop_documents WHERE profile_id = ? AND doc_type = 'invoice' AND (doc_number = ? OR doc_number LIKE ?)",
        crate::turso_params![profile_id.clone(), oid, format!("%-{}", oid)],
    ).await.map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = doc_rows.next().await {
        let doc_id: String = row.get(0).unwrap_or_default();
        let customer_id: Option<String> = row.get(2).ok();
        let grand_total: f64 = row.get(3).unwrap_or(0.0);
        let cancel_note = format!(" | Cancelled by Aggregator: {}", reason.as_deref().unwrap_or("Customer request"));

        // Cancel invoice
        conn.execute(
            "UPDATE shop_documents SET status = 'cancelled', notes = notes || ?, updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
            crate::turso_params![cancel_note.clone(), doc_id.clone(), profile_id.clone()],
        ).await.map_err(|e| e.to_string())?;

        // Cancel associated KOT
        let _ = conn.execute(
            "UPDATE shop_documents SET status = 'cancelled', updated_at = unixepoch() WHERE profile_id = ? AND doc_type = 'kot' AND notes LIKE ?",
            crate::turso_params![profile_id.clone(), format!("%{}%", oid)],
        ).await;

        // Reverse customer stats (total_orders, total_spent) & loyalty points if customer was linked
        if let Some(ref cid) = customer_id {
            if !cid.is_empty() {
                let _ = conn.execute(
                    "UPDATE shop_customers SET total_orders = MAX(0, total_orders - 1), total_spent = MAX(0.0, total_spent - ?), updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
                    crate::turso_params![grand_total, cid.clone(), profile_id.clone()],
                ).await;

                // Check and reverse any loyalty points earned from this order
                let mut loyalty_rows = conn.query(
                    "SELECT points FROM shop_loyalty_ledger WHERE profile_id = ? AND customer_id = ? AND document_id = ? AND entry_type = 'earn'",
                    crate::turso_params![profile_id.clone(), cid.clone(), doc_id.clone()],
                ).await.ok();

                if let Some(ref mut lrows) = loyalty_rows {
                    let mut pts_to_revert = 0_i64;
                    while let Ok(Some(lrow)) = lrows.next().await {
                        pts_to_revert += lrow.get::<i64>(0).unwrap_or(0);
                    }
                    if pts_to_revert > 0 {
                        // Fetch customer's current balance to clamp deduction and preserve ledger invariant
                        let mut cur_pts = 0_i64;
                        let mut cust_pts_rows = conn.query(
                            "SELECT loyalty_pts FROM shop_customers WHERE id = ? AND profile_id = ?",
                            crate::turso_params![cid.clone(), profile_id.clone()],
                        ).await.ok();
                        if let Some(ref mut c_rows) = cust_pts_rows {
                            if let Ok(Some(cr)) = c_rows.next().await {
                                cur_pts = cr.get::<i64>(0).unwrap_or(0);
                            }
                        }

                        let pts_deducted = pts_to_revert.min(cur_pts);
                        if pts_deducted > 0 {
                            let note = if pts_to_revert > pts_deducted {
                                format!(
                                    "Aggregator Order Cancellation Point Reversal (Clamped: {} of {} pts deducted; {} previously redeemed)",
                                    pts_deducted, pts_to_revert, pts_to_revert - pts_deducted
                                )
                            } else {
                                "Aggregator Order Cancellation Point Reversal".to_string()
                            };

                            let lid = format!("loy-{}", now_micros());
                            let _ = conn.execute(
                                "INSERT INTO shop_loyalty_ledger (id, profile_id, customer_id, entry_type, points, document_id, notes, created_at) \
                                 VALUES (?, ?, ?, 'refund', ?, ?, ?, unixepoch())",
                                crate::turso_params![lid, profile_id.clone(), cid.clone(), -pts_deducted, doc_id.clone(), note],
                            ).await;
                            let _ = conn.execute(
                                "UPDATE shop_customers SET loyalty_pts = loyalty_pts - ?, updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
                                crate::turso_params![pts_deducted, cid.clone(), profile_id.clone()],
                            ).await;
                        }
                    }
                }
            }
        }

        // Reversal of aggregator commission fin_expenses and journal entries (append-only reversal, never delete)
        let mut exp_rows = conn.query(
            "SELECT id, amount, total_amount, category FROM fin_expenses WHERE profile_id = ? AND document_id = ? AND amount > 0 AND category = 'Aggregator Commission'",
            crate::turso_params![profile_id.clone(), doc_id.clone()],
        ).await.ok();

        if let Some(ref mut erows) = exp_rows {
            while let Ok(Some(erow)) = erows.next().await {
                let orig_id: String = erow.get(0).unwrap_or_default();
                let orig_amt: f64 = erow.get(1).unwrap_or(0.0);
                if orig_amt > 0.0 {
                    let rev_exp_id = format!("exp-rev-{}", now_micros());
                    let rev_note = format!("Reversal of {} on aggregator cancellation: {}", orig_id, reason.as_deref().unwrap_or("Customer request"));
                    let expense_account_id = crate::commands::fin::journal::resolve_account_id(&conn, &profile_id, "5350", "expense").await.unwrap_or_else(|_| format!("{}_5350", profile_id));
                    let receivable_account_id = crate::commands::fin::journal::resolve_account_id(&conn, &profile_id, "1250", "asset").await.unwrap_or_else(|_| format!("{}_1250", profile_id));

                    // Post reversing double-entry journal entry: DR Accounts Receivable — Aggregator (1250), CR Aggregator Commission Expense (5350)
                    // Assumption: Aggregator waives commission on customer cancellation. If an aggregator charges cancellation penalties, that is reconciled via settlement payout.
                    let rev_journal_id = crate::commands::fin::journal::post_journal_entry(
                        &conn,
                        &profile_id,
                        &rev_note,
                        Some(&doc_id),
                        &[
                            (receivable_account_id.clone(), orig_amt, 0.0, Some("Restore receivable on commission waiver".to_string())),
                            (expense_account_id.clone(), 0.0, orig_amt, Some("Reverse commission expense on order cancellation".to_string())),
                        ],
                    ).await.ok();

                    let _ = conn.execute(
                        "INSERT INTO fin_expenses \
                         (id, profile_id, expense_date, category, account_id, amount, tax_amount, total_amount, payment_mode, description, document_id, journal_entry_id, created_at) \
                         VALUES (?, ?, unixepoch(), 'Aggregator Commission', ?, ?, 0, ?, 'aggregator_deduction', ?, ?, ?, unixepoch())",
                        crate::turso_params![
                            rev_exp_id,
                            profile_id.clone(),
                            expense_account_id,
                            -orig_amt,
                            -orig_amt,
                            rev_note,
                            doc_id.clone(),
                            rev_journal_id,
                        ],
                    ).await;
                }
            }
        }

        // Reverse stock ledger movements if any
        let mut sl_rows = conn.query(
            "SELECT item_id, warehouse_id, qty_out FROM shop_stock_ledger WHERE profile_id = ? AND document_id = ? AND movement_type = 'sale'",
            crate::turso_params![profile_id.clone(), doc_id.clone()],
        ).await.map_err(|e| e.to_string())?;

        while let Ok(Some(sl_row)) = sl_rows.next().await {
            let item_id: String = sl_row.get(0).unwrap_or_default();
            let wh_id: String = sl_row.get(1).unwrap_or_else(|_| "wh_default".into());
            let qty: f64 = sl_row.get(2).unwrap_or(0.0);

            let mut cur_bal = 0.0_f64;
            let mut bal_rows = conn.query(
                "SELECT balance_after FROM shop_stock_ledger WHERE profile_id = ? AND item_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
                crate::turso_params![profile_id.clone(), item_id.clone()],
            ).await.ok();
            if let Some(ref mut rows) = bal_rows {
                if let Ok(Some(r)) = rows.next().await {
                    cur_bal = r.get::<f64>(0).unwrap_or(0.0);
                }
            }

            let ret_sl_id = format!("sl-{}", now_micros());
            let _ = conn.execute(
                "INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, document_id, notes, created_at) \
                 VALUES (?, ?, ?, ?, 'return', ?, 0, ?, ?, 'Aggregator Order Cancellation Return', unixepoch())",
                crate::turso_params![ret_sl_id, profile_id.clone(), item_id, wh_id, qty, cur_bal + qty, doc_id.clone()],
            ).await;
        }

        Ok(())
    } else {
        Err(format!("Order {} not found", oid))
    }
}

