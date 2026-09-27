// src-tauri/src/commands/shop/stays.rs
//
// WHAT:  Hotel, Stay, Homestay & Villa management commands — Phase 5 (Book Time).
//
// DOMAIN SCHEMA TARGETS:
//   shop_locations      — Rooms, suites, villas, dorm beds (location_type='room')
//   shop_reservations   — Room bookings with anti-double-booking slot overlap check (item_type='stay')
//   shop_booking_guests — Guest details per reservation (ID type, ID number, nationality, primary guest)
//   shop_folios         — Running stay tabs for room service, minibar, laundry, room rate
//   shop_documents      — Used for Check-out settlement invoices (doc_type='checkout')
//
// RULES: No server$, pure Rust Tauri commands using AppState. Zero system keychain dependencies.

use crate::AppState;
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

// ── Structs & Data Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NightlyRateBreakdown {
    pub date: String,          // "YYYY-MM-DD"
    pub rate: f64,
    pub is_override: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StayPricingCalculation {
    pub location_id: String,
    pub room_name: String,
    pub base_rate: f64,
    pub slot_start: i64,
    pub slot_end: i64,
    pub nights: i64,
    pub nightly_rates: Vec<NightlyRateBreakdown>,
    pub total_room_charge: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BookingRulesConfig {
    pub min_nights: Option<i64>,
    pub max_nights: Option<i64>,
    pub checkin_time: Option<String>,   // e.g. "14:00"
    pub checkout_time: Option<String>,  // e.g. "11:00"
    pub house_rules: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRateCalendarData {
    pub location_id: String,
    pub rate_overrides: HashMap<String, f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBookingRulesData {
    pub location_id: String,
    pub rules: BookingRulesConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StayRoom {
    pub id: String,
    pub profile_id: String,
    pub location_type: String, // 'room'
    pub name: String,          // e.g. "Room 101", "Deluxe Suite"
    pub number: Option<String>,
    pub floor: Option<String>, // e.g. "1st Floor", "East Wing"
    pub capacity: i64,
    pub base_rate: f64,        // Rate per night
    pub amenities: String,     // JSON string e.g. '["AC", "WiFi", "TV", "Sea View"]'
    pub rate_overrides: String, // JSON map e.g. '{"2026-12-24": 5000}'
    pub booking_rules: String,  // JSON config e.g. '{"min_nights": 2}'
    pub status: String,        // 'available' | 'occupied' | 'reserved' | 'maintenance' | 'blocked'
    pub is_active: i64,
    pub sort_order: i64,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoomData {
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
pub struct StayReservation {
    pub id: String,
    pub profile_id: String,
    pub item_id: String,
    pub item_type: String,     // 'stay'
    pub location_id: Option<String>,
    pub room_name: Option<String>,
    pub staff_id: Option<String>,
    pub order_id: Option<String>,
    pub document_id: Option<String>,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub source_channel: String, // 'direct' | 'airbnb' | 'booking_com' | 'walk_in'
    pub external_booking_id: Option<String>,
    pub status: String,        // 'hold' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
    pub slot_start: i64,       // Check-in unix timestamp
    pub slot_end: i64,         // Check-out unix timestamp
    pub party_size: i64,
    pub notes: Option<String>,
    pub meta: String,          // Arbitrary JSON metadata
    pub confirmed_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateStayReservationData {
    pub item_id: Option<String>,
    pub location_id: Option<String>,
    pub staff_id: Option<String>,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub source_channel: Option<String>,
    pub external_booking_id: Option<String>,
    pub slot_start: i64,
    pub slot_end: i64,
    pub party_size: Option<i64>,
    pub notes: Option<String>,
    pub meta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookingGuest {
    pub id: String,
    pub profile_id: String,
    pub reservation_id: String,
    pub contact_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub id_type: Option<String>,    // 'passport' | 'aadhaar' | 'driving_license' | 'voter_id'
    pub id_number: Option<String>,
    pub nationality: Option<String>,
    pub dob: Option<i64>,
    pub is_primary: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct AddGuestData {
    pub reservation_id: String,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub id_type: Option<String>,
    pub id_number: Option<String>,
    pub nationality: Option<String>,
    pub dob: Option<i64>,
    pub is_primary: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolioLine {
    pub id: String,
    pub date: i64,
    pub description: String,
    pub amount: f64,
    pub category: String, // 'room_rate' | 'room_service' | 'laundry' | 'minibar' | 'tax' | 'other'
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StayFolio {
    pub id: String,
    pub profile_id: String,
    pub reservation_id: String,
    pub room_name: Option<String>,
    pub guest_name: Option<String>,
    pub customer_id: Option<String>,
    pub status: String, // 'open' | 'settled' | 'void'
    pub total_charges: f64,
    pub total_paid: f64,
    pub folio_lines: Vec<FolioLine>,
    pub settlement_doc_id: Option<String>,
    pub opened_at: i64,
    pub settled_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct AddFolioChargeData {
    pub folio_id: String,
    pub description: String,
    pub amount: f64,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SettleFolioData {
    pub folio_id: String,
    pub payment_mode: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StayAnalytics {
    pub total_rooms: i64,
    pub occupied_rooms: i64,
    pub available_rooms: i64,
    pub reserved_rooms: i64,
    pub occupancy_rate: f64,
    pub today_arrivals: i64,
    pub today_departures: i64,
    pub open_folios_count: i64,
    pub total_folio_charges: f64,
    pub avg_daily_rate: f64,
    pub revpar: f64,
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



// ── Room Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn shop_list_stay_rooms(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StayRoom>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT l.id, l.profile_id, l.location_type, l.name, l.number, l.floor, l.capacity, \
                    l.base_rate, l.amenities, COALESCE(l.rate_overrides, '{}'), COALESCE(l.booking_rules, '{}'), l.status, l.is_active, l.sort_order, \
                    COALESCE(i.seo_og_image, m.local_url, m.url, i.external_url) as image_url \
             FROM shop_locations l \
             LEFT JOIN shop_items i ON l.id = i.id AND l.profile_id = i.profile_id \
             LEFT JOIN media m ON i.media_id = m.id AND l.profile_id = m.profile_id \
             WHERE l.profile_id = ? AND l.location_type = 'room' AND (l.archived = 0 OR l.archived IS NULL) \
             ORDER BY l.sort_order ASC, l.name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rooms = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        rooms.push(StayRoom {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            location_type: row.get(2).unwrap_or_else(|_| "room".into()),
            name: row.get(3).unwrap_or_default(),
            number: row.get(4).ok(),
            floor: row.get(5).ok(),
            capacity: row.get(6).unwrap_or(2),
            base_rate: row.get(7).unwrap_or(0.0),
            amenities: row.get(8).unwrap_or_else(|_| "[]".into()),
            rate_overrides: row.get(9).unwrap_or_else(|_| "{}".into()),
            booking_rules: row.get(10).unwrap_or_else(|_| "{}".into()),
            status: row.get(11).unwrap_or_else(|_| "available".into()),
            is_active: row.get(12).unwrap_or(1),
            sort_order: row.get(13).unwrap_or(0),
            image_url: row.get(14).ok(),
        });
    }
    Ok(rooms)
}

#[tauri::command]
pub async fn shop_create_stay_room(
    data: CreateRoomData,
    state: State<'_, Arc<AppState>>,
) -> Result<StayRoom, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = format!("rm-{}", now_micros());
    let amenities_json = serde_json::to_string(&data.amenities.unwrap_or_default())
        .unwrap_or_else(|_| "[]".into());
    let rate_overrides_json = data.rate_overrides.unwrap_or_else(|| "{}".into());
    let booking_rules_json = data.booking_rules.unwrap_or_else(|| "{}".into());
    let capacity = data.capacity.unwrap_or(2);
    let base_rate = data.base_rate.unwrap_or(0.0);

    // 1. First create entry in shop_items (Item Master Catalog)
    let slug = data.name.to_lowercase().replace(' ', "-");
    conn.execute(
        "INSERT OR REPLACE INTO shop_items \
         (id, profile_id, item_type, category_id, name, slug, price, cost_price, description, is_active) \
         VALUES (?, ?, 'stay', 'cat_30', ?, ?, ?, 0, ?, 1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.name.clone(),
            slug,
            base_rate,
            format!("{} (Floor: {}, Cap: {})", data.name, data.floor.as_deref().unwrap_or("Main"), capacity),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 2. Then create entry in shop_locations (Physical Spatial Location Grid)
    conn.execute(
        "INSERT INTO shop_locations \
         (id, profile_id, location_type, name, number, floor, capacity, base_rate, amenities, rate_overrides, booking_rules, status, is_active) \
         VALUES (?, ?, 'room', ?, ?, ?, ?, ?, ?, ?, ?, 'available', 1)",
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

    Ok(StayRoom {
        id,
        profile_id,
        location_type: "room".into(),
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
        image_url: None,
    })
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoomData {
    pub id: String,
    pub name: String,
    pub number: Option<String>,
    pub floor: Option<String>,
    pub capacity: Option<i64>,
    pub base_rate: Option<f64>,
    pub amenities: Option<Vec<String>>,
    pub rate_overrides: Option<String>,
    pub booking_rules: Option<String>,
}

#[tauri::command]
pub async fn shop_update_stay_room(
    data: UpdateRoomData,
    state: State<'_, Arc<AppState>>,
) -> Result<StayRoom, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let amenities_json = serde_json::to_string(&data.amenities.unwrap_or_default())
        .unwrap_or_else(|_| "[]".into());
    let rate_overrides = data.rate_overrides.unwrap_or_else(|| "{}".into());
    let booking_rules = data.booking_rules.unwrap_or_else(|| "{}".into());
    let capacity = data.capacity.unwrap_or(2);
    let base_rate = data.base_rate.unwrap_or(0.0);

    // 1. First update shop_items (Item Master Catalog)
    let slug = data.name.to_lowercase().replace(' ', "-");
    conn.execute(
        "UPDATE shop_items SET \
         name = ?, slug = ?, price = ?, description = ? \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.name.clone(),
            slug,
            base_rate,
            format!("{} (Floor: {}, Cap: {})", data.name, data.floor.as_deref().unwrap_or("Main"), capacity),
            data.id.clone(),
            profile_id.clone(),
        ],
    )
    .await
    .ok();

    // 2. Then update shop_locations (Physical Spatial Location Grid)
    conn.execute(
        "UPDATE shop_locations SET \
         name = ?, number = ?, floor = ?, capacity = ?, base_rate = ?, amenities = ?, rate_overrides = ?, booking_rules = ?, \
         updated_at = (strftime('%s','now')) \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.name.clone(),
            data.number.clone(),
            data.floor.clone(),
            capacity,
            base_rate,
            amenities_json.clone(),
            rate_overrides.clone(),
            booking_rules.clone(),
            data.id.clone(),
            profile_id.clone(),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT status FROM shop_locations WHERE id = ?",
            crate::turso_params![data.id.clone()],
        )
        .await
        .ok();

    let status = if let Some(ref mut r) = rows {
        if let Ok(Some(row)) = r.next().await {
            row.get(0).unwrap_or_else(|_| "available".into())
        } else {
            "available".to_string()
        }
    } else {
        "available".to_string()
    };

    Ok(StayRoom {
        id: data.id,
        profile_id,
        location_type: "room".into(),
        name: data.name,
        number: data.number,
        floor: data.floor,
        capacity,
        base_rate,
        amenities: amenities_json,
        rate_overrides,
        booking_rules,
        status,
        is_active: 1,
        sort_order: 0,
        image_url: None,
    })
}

#[tauri::command]
pub async fn shop_update_room_status(
    room_id: String,
    status: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_locations SET status = ?, updated_at = (strftime('%s','now')) \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![status, room_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_delete_stay_room(
    room_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Archive in shop_locations (archived = 1, archived_at = timestamp)
    conn.execute(
        "UPDATE shop_locations SET archived = 1, archived_at = (strftime('%s','now')) WHERE id = ? AND profile_id = ?",
        crate::turso_params![room_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Archive in shop_items catalog table (archived = 1, archived_at = timestamp)
    conn.execute(
        "UPDATE shop_items SET archived = 1, archived_at = (strftime('%s','now')) WHERE id = ? AND profile_id = ?",
        crate::turso_params![room_id, profile_id],
    )
    .await
    .ok();

    Ok(())
}

pub fn compute_stay_pricing_internal(
    location_id: &str,
    room_name: &str,
    base_rate: f64,
    rate_overrides_json: &str,
    slot_start: i64,
    slot_end: i64,
) -> StayPricingCalculation {
    let overrides: HashMap<String, f64> = serde_json::from_str(rate_overrides_json).unwrap_or_default();
    let nights = std::cmp::max(1, ((slot_end - slot_start) as f64 / 86400.0).round() as i64);

    let mut nightly_rates = Vec::new();
    let mut total_room_charge = 0.0_f64;

    for i in 0..nights {
        let night_ts = slot_start + (i * 86400);
        let date_str = DateTime::from_timestamp(night_ts, 0)
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| "1970-01-01".to_string());

        let (rate, is_override) = if let Some(&override_rate) = overrides.get(&date_str) {
            (override_rate, true)
        } else {
            (base_rate, false)
        };

        total_room_charge += rate;
        nightly_rates.push(NightlyRateBreakdown {
            date: date_str,
            rate,
            is_override,
        });
    }

    StayPricingCalculation {
        location_id: location_id.to_string(),
        room_name: room_name.to_string(),
        base_rate,
        slot_start,
        slot_end,
        nights,
        nightly_rates,
        total_room_charge,
    }
}

#[tauri::command]
pub async fn shop_calculate_stay_pricing(
    location_id: String,
    slot_start: i64,
    slot_end: i64,
    state: State<'_, Arc<AppState>>,
) -> Result<StayPricingCalculation, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut r = conn
        .query(
            "SELECT name, base_rate, COALESCE(rate_overrides, '{}') FROM shop_locations WHERE id = ? AND profile_id = ?",
            crate::turso_params![location_id.clone(), profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = r.next().await {
        let room_name: String = row.get(0).unwrap_or_else(|_| "Room".into());
        let base_rate: f64 = row.get(1).unwrap_or(0.0);
        let rate_overrides_raw: String = row.get(2).unwrap_or_else(|_| "{}".into());

        Ok(compute_stay_pricing_internal(
            &location_id,
            &room_name,
            base_rate,
            &rate_overrides_raw,
            slot_start,
            slot_end,
        ))
    } else {
        Err("Location not found".into())
    }
}

#[tauri::command]
pub async fn shop_update_stay_rate_calendar(
    data: UpdateRateCalendarData,
    state: State<'_, Arc<AppState>>,
) -> Result<StayRoom, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let json_str = serde_json::to_string(&data.rate_overrides).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_locations SET rate_overrides = ?, updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
        crate::turso_params![json_str, data.location_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Fetch updated room
    let mut rows = conn
        .query(
            "SELECT l.id, l.profile_id, l.location_type, l.name, l.number, l.floor, l.capacity, \
                    l.base_rate, l.amenities, COALESCE(l.rate_overrides, '{}'), COALESCE(l.booking_rules, '{}'), l.status, l.is_active, l.sort_order, \
                    (SELECT image_url FROM shop_items WHERE id = l.id) as image_url \
             FROM shop_locations l \
             WHERE l.id = ? AND l.profile_id = ?",
            crate::turso_params![data.location_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(StayRoom {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            location_type: row.get(2).unwrap_or_else(|_| "room".into()),
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
            image_url: row.get(14).ok(),
        })
    } else {
        Err("Location not found".into())
    }
}

#[tauri::command]
pub async fn shop_update_stay_booking_rules(
    data: UpdateBookingRulesData,
    state: State<'_, Arc<AppState>>,
) -> Result<StayRoom, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let json_str = serde_json::to_string(&data.rules).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_locations SET booking_rules = ?, updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
        crate::turso_params![json_str, data.location_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Fetch updated room
    let mut rows = conn
        .query(
            "SELECT l.id, l.profile_id, l.location_type, l.name, l.number, l.floor, l.capacity, \
                    l.base_rate, l.amenities, COALESCE(l.rate_overrides, '{}'), COALESCE(l.booking_rules, '{}'), l.status, l.is_active, l.sort_order, \
                    (SELECT image_url FROM shop_items WHERE id = l.id) as image_url \
             FROM shop_locations l \
             WHERE l.id = ? AND l.profile_id = ?",
            crate::turso_params![data.location_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(StayRoom {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            location_type: row.get(2).unwrap_or_else(|_| "room".into()),
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
            image_url: row.get(14).ok(),
        })
    } else {
        Err("Location not found".into())
    }
}

// ── Reservation & Availability Commands ──────────────────────────────────────

#[tauri::command]
pub async fn shop_check_room_availability(
    location_id: String,
    slot_start: i64,
    slot_end: i64,
    exclude_reservation_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = if let Some(ex_id) = exclude_reservation_id {
        format!(
            "SELECT COUNT(*) FROM shop_reservations \
             WHERE profile_id = '{}' AND location_id = '{}' AND id != '{}' AND status IN ('hold', 'confirmed', 'checked_in') \
               AND ((slot_start < {} AND slot_end > {}))",
            profile_id, location_id, ex_id, slot_end, slot_start
        )
    } else {
        format!(
            "SELECT COUNT(*) FROM shop_reservations \
             WHERE profile_id = '{}' AND location_id = '{}' AND status IN ('hold', 'confirmed', 'checked_in') \
               AND ((slot_start < {} AND slot_end > {}))",
            profile_id, location_id, slot_end, slot_start
        )
    };

    let mut rows = conn
        .query(&sql, vec![])
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        let count: i64 = row.get(0).unwrap_or(0);
        return Ok(count == 0);
    }

    Ok(true)
}

#[tauri::command]
pub async fn shop_list_stay_reservations(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StayReservation>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT r.id, r.profile_id, r.item_id, r.item_type, r.location_id, l.name, r.staff_id, \
                    r.order_id, r.document_id, r.customer_id, COALESCE(c.name, g.name), COALESCE(r.source_channel, 'direct'), \
                    r.external_booking_id, r.status, r.slot_start, r.slot_end, \
                    r.party_size, r.notes, COALESCE(r.meta, '{}'), r.confirmed_at, r.created_at \
             FROM shop_reservations r \
             LEFT JOIN shop_locations l ON l.id = r.location_id \
             LEFT JOIN shop_customers c ON c.id = r.customer_id \
             LEFT JOIN shop_booking_guests g ON g.reservation_id = r.id AND g.is_primary = 1 \
             WHERE r.profile_id = ? \
             ORDER BY r.slot_start DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(StayReservation {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            item_id: row.get(2).unwrap_or_default(),
            item_type: row.get(3).unwrap_or_else(|_| "stay".into()),
            location_id: row.get(4).ok(),
            room_name: row.get(5).ok(),
            staff_id: row.get(6).ok(),
            order_id: row.get(7).ok(),
            document_id: row.get(8).ok(),
            customer_id: row.get(9).ok(),
            customer_name: row.get(10).ok(),
            source_channel: row.get(11).unwrap_or_else(|_| "direct".into()),
            external_booking_id: row.get(12).ok(),
            status: row.get(13).unwrap_or_else(|_| "confirmed".into()),
            slot_start: row.get(14).unwrap_or(0),
            slot_end: row.get(15).unwrap_or(0),
            party_size: row.get(16).unwrap_or(1),
            notes: row.get(17).ok(),
            meta: row.get(18).unwrap_or_else(|_| "{}".into()),
            confirmed_at: row.get(19).ok(),
            created_at: row.get(20).unwrap_or(0),
        });
    }
    Ok(list)
}

#[tauri::command]
pub async fn shop_create_stay_reservation(
    data: CreateStayReservationData,
    state: State<'_, Arc<AppState>>,
) -> Result<StayReservation, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let loc_id = data.location_id.clone().unwrap_or_default();
    if !loc_id.is_empty() {
        let is_avail = shop_check_room_availability(
            loc_id.clone(),
            data.slot_start,
            data.slot_end,
            None,
            state.clone(),
        )
        .await?;
        if !is_avail {
            return Err("Selected room or table is already booked for these dates/times".into());
        }
    }

    let id = format!("res-{}", now_micros());
    let ts = now_ts();
    let item_id = data.item_id.unwrap_or_else(|| "item_stay_default".into());
    let source_chan = data.source_channel.unwrap_or_else(|| "direct".into());
    let meta_json = data.meta.unwrap_or_else(|| "{}".into());

    let nights = std::cmp::max(1, ((data.slot_end - data.slot_start) as f64 / 86400.0).round() as i64);

    let mut item_type = "stay".to_string();
    let mut loc_name = "Room".to_string();
    let mut base_rate = 0.0_f64;
    let mut rate_overrides_raw = "{}".to_string();
    let mut booking_rules_raw = "{}".to_string();

    if !loc_id.is_empty() {
        let mut loc_rows = conn
            .query(
                "SELECT location_type, name, base_rate, COALESCE(rate_overrides, '{}'), COALESCE(booking_rules, '{}') FROM shop_locations WHERE id = ?",
                crate::turso_params![loc_id.clone()],
            )
            .await
            .ok();
        if let Some(ref mut rows) = loc_rows {
            if let Ok(Some(row)) = rows.next().await {
                if let Ok(lt) = row.get::<String>(0) {
                    if !lt.is_empty() {
                        item_type = lt;
                    }
                }
                loc_name = row.get(1).unwrap_or_else(|_| "Room".into());
                base_rate = row.get(2).unwrap_or(0.0);
                rate_overrides_raw = row.get(3).unwrap_or_else(|_| "{}".into());
                booking_rules_raw = row.get(4).unwrap_or_else(|_| "{}".into());
            }
        }
    }

    // 1. Enforce booking rules (min_nights, max_nights)
    if let Ok(rules) = serde_json::from_str::<BookingRulesConfig>(&booking_rules_raw) {
        if let Some(min_n) = rules.min_nights {
            if min_n > 0 && nights < min_n {
                return Err(format!("Stay duration ({} night{}) is less than the required minimum of {} nights", nights, if nights > 1 { "s" } else { "" }, min_n));
            }
        }
        if let Some(max_n) = rules.max_nights {
            if max_n > 0 && nights > max_n {
                return Err(format!("Stay duration ({} night{}) exceeds the maximum allowed stay of {} nights", nights, if nights > 1 { "s" } else { "" }, max_n));
            }
        }
    }

    // 2. Calculate and LOCK pricing into reservation meta JSON
    let pricing_calc = compute_stay_pricing_internal(
        &loc_id,
        &loc_name,
        base_rate,
        &rate_overrides_raw,
        data.slot_start,
        data.slot_end,
    );

    let mut meta_val: serde_json::Value = serde_json::from_str(&meta_json).unwrap_or(serde_json::json!({}));
    meta_val["pricing"] = serde_json::to_value(&pricing_calc).unwrap_or_default();
    let locked_meta_json = serde_json::to_string(&meta_val).unwrap_or_else(|_| meta_json.clone());

    conn.execute(
        "INSERT INTO shop_reservations \
         (id, profile_id, item_id, item_type, location_id, staff_id, customer_id, source_channel, external_booking_id, status, slot_start, slot_end, party_size, notes, meta, confirmed_at, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            item_id.clone(),
            item_type.clone(),
            data.location_id.clone(),
            data.staff_id.clone(),
            data.customer_id.clone(),
            source_chan.clone(),
            data.external_booking_id.clone(),
            data.slot_start,
            data.slot_end,
            data.party_size.unwrap_or(1),
            data.notes.clone(),
            locked_meta_json.clone(),
            ts,
            ts,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // If customer name provided and primary guest name needed, insert primary guest
    if let Some(cust_name) = &data.customer_name {
        if !cust_name.trim().is_empty() {
            let guest_id = format!("gst-{}", now_micros());
            let _ = conn.execute(
                "INSERT INTO shop_booking_guests (id, profile_id, reservation_id, name, is_primary, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                crate::turso_params![guest_id, profile_id.clone(), id.clone(), cust_name.clone(), ts],
            ).await;
        }
    }

    // Update room status to 'reserved' if starting today
    if !loc_id.is_empty() && data.slot_start <= ts {
        let _ = conn.execute(
            "UPDATE shop_locations SET status = 'reserved' WHERE id = ? AND profile_id = ?",
            crate::turso_params![loc_id.clone(), profile_id.clone()],
        ).await;
    }

    let mut room_name = None;
    if !loc_id.is_empty() {
        let mut r = conn
            .query(
                "SELECT name FROM shop_locations WHERE id = ? AND profile_id = ?",
                crate::turso_params![loc_id.clone(), profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        if let Ok(Some(row)) = r.next().await {
            room_name = row.get::<String>(0).ok();
        }
    }

    Ok(StayReservation {
        id,
        profile_id,
        item_id,
        item_type,
        location_id: data.location_id,
        room_name,
        staff_id: data.staff_id,
        order_id: None,
        document_id: None,
        customer_id: data.customer_id,
        customer_name: data.customer_name,
        source_channel: source_chan,
        external_booking_id: data.external_booking_id,
        status: "confirmed".into(),
        slot_start: data.slot_start,
        slot_end: data.slot_end,
        party_size: data.party_size.unwrap_or(1),
        notes: data.notes,
        meta: locked_meta_json,
        confirmed_at: Some(ts),
        created_at: ts,
    })
}

#[tauri::command]
pub async fn shop_update_stay_reservation_status(
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

// ── Guest Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn shop_add_booking_guest(
    data: AddGuestData,
    state: State<'_, Arc<AppState>>,
) -> Result<BookingGuest, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = format!("gst-{}", now_micros());
    let ts = now_ts();
    let is_primary = if data.is_primary.unwrap_or(false) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO shop_booking_guests \
         (id, profile_id, reservation_id, name, phone, email, id_type, id_number, nationality, dob, is_primary, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.reservation_id.clone(),
            data.name.clone(),
            data.phone.clone(),
            data.email.clone(),
            data.id_type.clone(),
            data.id_number.clone(),
            data.nationality.clone(),
            data.dob,
            is_primary,
            ts,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(BookingGuest {
        id,
        profile_id,
        reservation_id: data.reservation_id,
        contact_id: None,
        name: data.name,
        phone: data.phone,
        email: data.email,
        id_type: data.id_type,
        id_number: data.id_number,
        nationality: data.nationality,
        dob: data.dob,
        is_primary,
        created_at: ts,
    })
}

#[tauri::command]
pub async fn shop_list_booking_guests(
    reservation_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<BookingGuest>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, reservation_id, contact_id, name, phone, email, id_type, id_number, nationality, dob, is_primary, created_at \
             FROM shop_booking_guests \
             WHERE profile_id = ? AND reservation_id = ? \
             ORDER BY is_primary DESC, name ASC",
            crate::turso_params![profile_id, reservation_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut guests = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        guests.push(BookingGuest {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            reservation_id: row.get(2).unwrap_or_default(),
            contact_id: row.get(3).ok(),
            name: row.get(4).unwrap_or_default(),
            phone: row.get(5).ok(),
            email: row.get(6).ok(),
            id_type: row.get(7).ok(),
            id_number: row.get(8).ok(),
            nationality: row.get(9).ok(),
            dob: row.get(10).ok(),
            is_primary: row.get(11).unwrap_or(0),
            created_at: row.get(12).unwrap_or(0),
        });
    }
    Ok(guests)
}

#[tauri::command]
pub async fn shop_list_all_stay_guests(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<BookingGuest>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, reservation_id, contact_id, name, phone, email, id_type, id_number, nationality, dob, is_primary, created_at \
             FROM shop_booking_guests \
             WHERE profile_id = ? \
             ORDER BY created_at DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut guests = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        guests.push(BookingGuest {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            reservation_id: row.get(2).unwrap_or_default(),
            contact_id: row.get(3).ok(),
            name: row.get(4).unwrap_or_default(),
            phone: row.get(5).ok(),
            email: row.get(6).ok(),
            id_type: row.get(7).ok(),
            id_number: row.get(8).ok(),
            nationality: row.get(9).ok(),
            dob: row.get(10).ok(),
            is_primary: row.get(11).unwrap_or(0),
            created_at: row.get(12).unwrap_or(0),
        });
    }
    Ok(guests)
}

// ── Check-in, Check-out & Folio Commands ──────────────────────────────────────

#[tauri::command]
pub async fn shop_check_in_guest(
    reservation_id: String,
    primary_guest_name: String,
    id_type: Option<String>,
    id_number: Option<String>,
    nationality: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<StayFolio, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let ts = now_ts();

    // 1. Fetch reservation & room details
    let mut res_rows = conn
        .query(
            "SELECT location_id, customer_id, slot_start, slot_end FROM shop_reservations WHERE id = ? AND profile_id = ?",
            crate::turso_params![reservation_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (location_id, customer_id, slot_start, slot_end) = if let Ok(Some(row)) = res_rows.next().await {
        (
            row.get::<Option<String>>(0).unwrap_or(None),
            row.get::<Option<String>>(1).unwrap_or(None),
            row.get::<i64>(2).unwrap_or(ts),
            row.get::<i64>(3).unwrap_or(ts + 86400),
        )
    } else {
        return Err("Reservation not found".into());
    };

    // 2. Mark reservation as 'checked_in'
    conn.execute(
        "UPDATE shop_reservations SET status = 'checked_in', updated_at = ? WHERE id = ? AND profile_id = ?",
        crate::turso_params![ts, reservation_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 3. Mark room location as 'occupied'
    let mut base_rate = 0.0;
    let mut room_name = None;
    if let Some(ref loc_id) = location_id {
        conn.execute(
            "UPDATE shop_locations SET status = 'occupied', updated_at = ? WHERE id = ? AND profile_id = ?",
            crate::turso_params![ts, loc_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

        let mut r = conn
            .query(
                "SELECT name, base_rate FROM shop_locations WHERE id = ? AND profile_id = ?",
                crate::turso_params![loc_id.clone(), profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        if let Ok(Some(row)) = r.next().await {
            room_name = row.get::<String>(0).ok();
            base_rate = row.get::<f64>(1).unwrap_or(0.0);
        }
    }

    // 4. Save/Update guest record
    let guest_id = format!("gst-{}", now_micros());
    let _ = conn.execute(
        "INSERT INTO shop_booking_guests (id, profile_id, reservation_id, name, id_type, id_number, nationality, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
        crate::turso_params![guest_id, profile_id.clone(), reservation_id.clone(), primary_guest_name.clone(), id_type.clone(), id_number.clone(), nationality.clone(), ts],
    ).await;

    // 5. Initialize Folio with locked room charge from reservation meta
    let folio_id = format!("fol-{}", now_micros());
    let nights = std::cmp::max(1, ((slot_end - slot_start) as f64 / 86400.0).round() as i64);

    // Read locked pricing from reservation meta if present (prevents rate changes post-booking from altering agreed price)
    let mut total_room_charge = base_rate * (nights as f64);
    let mut meta_rows = conn
        .query(
            "SELECT meta FROM shop_reservations WHERE id = ? AND profile_id = ?",
            crate::turso_params![reservation_id.clone(), profile_id.clone()],
        )
        .await
        .ok();
    if let Some(ref mut mrows) = meta_rows {
        if let Ok(Some(mrow)) = mrows.next().await {
            if let Ok(mstr) = mrow.get::<String>(0) {
                if let Ok(mjson) = serde_json::from_str::<serde_json::Value>(&mstr) {
                    if let Some(locked_total) = mjson.get("pricing").and_then(|p| p.get("total_room_charge")).and_then(|v| v.as_f64()) {
                        total_room_charge = locked_total;
                    }
                }
            }
        }
    }

    let initial_line = FolioLine {
        id: format!("fline-{}", now_micros()),
        date: ts,
        description: format!("Room Charge ({} night{} @ ₹{:.2})", nights, if nights > 1 { "s" } else { "" }, total_room_charge),
        amount: total_room_charge,
        category: "room_rate".into(),
    };
    let lines_json = serde_json::to_string(&vec![initial_line.clone()]).unwrap_or_else(|_| "[]".into());

    conn.execute(
        "INSERT INTO shop_folios \
         (id, profile_id, reservation_id, customer_id, status, total_charges, total_paid, folio_lines, opened_at, created_at) \
         VALUES (?, ?, ?, ?, 'open', ?, 0, ?, ?, ?)",
        crate::turso_params![
            folio_id.clone(),
            profile_id.clone(),
            reservation_id.clone(),
            customer_id.clone(),
            total_room_charge,
            lines_json.clone(),
            ts,
            ts,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(StayFolio {
        id: folio_id,
        profile_id,
        reservation_id,
        room_name,
        guest_name: Some(primary_guest_name),
        customer_id,
        status: "open".into(),
        total_charges: total_room_charge,
        total_paid: 0.0,
        folio_lines: vec![initial_line],
        settlement_doc_id: None,
        opened_at: ts,
        settled_at: None,
        created_at: ts,
    })
}

#[tauri::command]
pub async fn shop_list_open_folios(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StayFolio>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT f.id, f.profile_id, f.reservation_id, f.customer_id, f.status, f.total_charges, f.total_paid, \
                    f.folio_lines, f.settlement_doc_id, f.opened_at, f.settled_at, f.created_at, \
                    l.name, g.name \
             FROM shop_folios f \
             LEFT JOIN shop_reservations r ON r.id = f.reservation_id \
             LEFT JOIN shop_locations l ON l.id = r.location_id \
             LEFT JOIN shop_booking_guests g ON (g.reservation_id = f.reservation_id AND g.is_primary = 1) \
             WHERE f.profile_id = ? \
             ORDER BY f.opened_at DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut folios = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let lines_raw: String = row.get(7).unwrap_or_else(|_| "[]".into());
        let lines: Vec<FolioLine> = serde_json::from_str(&lines_raw).unwrap_or_default();

        folios.push(StayFolio {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            reservation_id: row.get(2).unwrap_or_default(),
            customer_id: row.get(3).ok(),
            status: row.get(4).unwrap_or_else(|_| "open".into()),
            total_charges: row.get(5).unwrap_or(0.0),
            total_paid: row.get(6).unwrap_or(0.0),
            folio_lines: lines,
            settlement_doc_id: row.get(8).ok(),
            opened_at: row.get(9).unwrap_or(0),
            settled_at: row.get(10).ok(),
            created_at: row.get(11).unwrap_or(0),
            room_name: row.get(12).ok(),
            guest_name: row.get(13).ok(),
        });
    }
    Ok(folios)
}

#[tauri::command]
pub async fn shop_add_folio_charge(
    data: AddFolioChargeData,
    state: State<'_, Arc<AppState>>,
) -> Result<StayFolio, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, reservation_id, customer_id, status, total_charges, total_paid, folio_lines, opened_at, created_at \
             FROM shop_folios WHERE id = ? AND profile_id = ?",
            crate::turso_params![data.folio_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        let f_id: String = row.get(0).unwrap_or_default();
        let res_id: String = row.get(1).unwrap_or_default();
        let cust_id: Option<String> = row.get(2).ok();
        let status: String = row.get(3).unwrap_or_else(|_| "open".into());
        let current_total: f64 = row.get(4).unwrap_or(0.0);
        let total_paid: f64 = row.get(5).unwrap_or(0.0);
        let lines_raw: String = row.get(6).unwrap_or_else(|_| "[]".into());
        let opened_at: i64 = row.get(7).unwrap_or(0);
        let created_at: i64 = row.get(8).unwrap_or(0);

        let mut lines: Vec<FolioLine> = serde_json::from_str(&lines_raw).unwrap_or_default();
        let new_charge = FolioLine {
            id: format!("fline-{}", now_micros()),
            date: now_ts(),
            description: data.description,
            amount: data.amount,
            category: data.category.unwrap_or_else(|| "other".into()),
        };
        lines.push(new_charge);

        let new_total = current_total + data.amount;
        let new_lines_json = serde_json::to_string(&lines).unwrap_or_else(|_| "[]".into());

        conn.execute(
            "UPDATE shop_folios SET total_charges = ?, folio_lines = ? WHERE id = ? AND profile_id = ?",
            crate::turso_params![new_total, new_lines_json, f_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

        return Ok(StayFolio {
            id: f_id,
            profile_id,
            reservation_id: res_id,
            room_name: None,
            guest_name: None,
            customer_id: cust_id,
            status,
            total_charges: new_total,
            total_paid,
            folio_lines: lines,
            settlement_doc_id: None,
            opened_at,
            settled_at: None,
            created_at,
        });
    }

    Err("Folio not found".into())
}

#[tauri::command]
pub async fn shop_settle_folio(
    data: SettleFolioData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let ts = now_ts();

    // 1. Fetch Folio details
    let mut f_rows = conn
        .query(
            "SELECT reservation_id, customer_id, total_charges FROM shop_folios WHERE id = ? AND profile_id = ?",
            crate::turso_params![data.folio_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (reservation_id, customer_id, total_charges) = if let Ok(Some(row)) = f_rows.next().await {
        (
            row.get::<String>(0).unwrap_or_default(),
            row.get::<Option<String>>(1).unwrap_or(None),
            row.get::<f64>(2).unwrap_or(0.0),
        )
    } else {
        return Err("Folio not found".into());
    };

    // 2. Create Invoice Document (doc_type = 'checkout')
    let doc_id = format!("doc-{}", now_micros());
    let doc_number = format!("INV-STAY-{}", ts % 100000);
    let pmode = data.payment_mode.unwrap_or_else(|| "cash".into());

    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, doc_type, doc_number, customer_id, payment_method, status, grand_total, amount_paid, notes, created_at, updated_at) \
         VALUES (?, ?, 'checkout', ?, ?, ?, 'paid', ?, ?, ?, ?, ?)",
        crate::turso_params![
            doc_id.clone(),
            profile_id.clone(),
            doc_number,
            customer_id,
            pmode,
            total_charges,
            total_charges,
            data.notes,
            ts,
            ts,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 3. Mark Folio as settled
    conn.execute(
        "UPDATE shop_folios SET status = 'settled', total_paid = total_charges, settlement_doc_id = ?, settled_at = ? WHERE id = ? AND profile_id = ?",
        crate::turso_params![doc_id, ts, data.folio_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 4. Update Reservation to 'checked_out'
    conn.execute(
        "UPDATE shop_reservations SET status = 'checked_out', updated_at = ? WHERE id = ? AND profile_id = ?",
        crate::turso_params![ts, reservation_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 5. Update Room status to 'available'
    let mut res_rows = conn
        .query(
            "SELECT location_id FROM shop_reservations WHERE id = ? AND profile_id = ?",
            crate::turso_params![reservation_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = res_rows.next().await {
        if let Ok(Some(loc_id)) = row.get::<Option<String>>(0) {
            let _ = conn.execute(
                "UPDATE shop_locations SET status = 'available', updated_at = ? WHERE id = ? AND profile_id = ?",
                crate::turso_params![ts, loc_id, profile_id.clone()],
            ).await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn shop_list_todays_arrivals(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StayReservation>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let ts = now_ts();
    let day_start = ts - (ts % 86400);
    let day_end = day_start + 86400;

    let mut rows = conn
        .query(
            "SELECT r.id, r.profile_id, r.item_id, r.item_type, r.location_id, l.name, r.staff_id, \
                    r.order_id, r.document_id, r.customer_id, g.name, COALESCE(r.source_channel, 'direct'), \
                    r.external_booking_id, r.status, r.slot_start, r.slot_end, \
                    r.party_size, r.notes, COALESCE(r.meta, '{}'), r.confirmed_at, r.created_at \
             FROM shop_reservations r \
             LEFT JOIN shop_locations l ON l.id = r.location_id \
             LEFT JOIN shop_booking_guests g ON (g.reservation_id = r.id AND g.is_primary = 1) \
             WHERE r.profile_id = ? AND r.status = 'confirmed' AND r.slot_start >= ? AND r.slot_start < ? \
             ORDER BY r.slot_start ASC",
            crate::turso_params![profile_id, day_start, day_end],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(StayReservation {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            item_id: row.get(2).unwrap_or_default(),
            item_type: row.get(3).unwrap_or_else(|_| "stay".into()),
            location_id: row.get(4).ok(),
            room_name: row.get(5).ok(),
            staff_id: row.get(6).ok(),
            order_id: row.get(7).ok(),
            document_id: row.get(8).ok(),
            customer_id: row.get(9).ok(),
            customer_name: row.get(10).ok(),
            source_channel: row.get(11).unwrap_or_else(|_| "direct".into()),
            external_booking_id: row.get(12).ok(),
            status: row.get(13).unwrap_or_else(|_| "confirmed".into()),
            slot_start: row.get(14).unwrap_or(0),
            slot_end: row.get(15).unwrap_or(0),
            party_size: row.get(16).unwrap_or(1),
            notes: row.get(17).ok(),
            meta: row.get(18).unwrap_or_else(|_| "{}".into()),
            confirmed_at: row.get(19).ok(),
            created_at: row.get(20).unwrap_or(0),
        });
    }
    Ok(list)
}

#[tauri::command]
pub async fn shop_list_todays_departures(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StayReservation>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let ts = now_ts();
    let day_start = ts - (ts % 86400);
    let day_end = day_start + 86400;

    let mut rows = conn
        .query(
            "SELECT r.id, r.profile_id, r.item_id, r.item_type, r.location_id, l.name, r.staff_id, \
                    r.order_id, r.document_id, r.customer_id, g.name, COALESCE(r.source_channel, 'direct'), \
                    r.external_booking_id, r.status, r.slot_start, r.slot_end, \
                    r.party_size, r.notes, COALESCE(r.meta, '{}'), r.confirmed_at, r.created_at \
             FROM shop_reservations r \
             LEFT JOIN shop_locations l ON l.id = r.location_id \
             LEFT JOIN shop_booking_guests g ON (g.reservation_id = r.id AND g.is_primary = 1) \
             WHERE r.profile_id = ? AND r.status = 'checked_in' AND r.slot_end >= ? AND r.slot_end < ? \
             ORDER BY r.slot_end ASC",
            crate::turso_params![profile_id, day_start, day_end],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(StayReservation {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            item_id: row.get(2).unwrap_or_default(),
            item_type: row.get(3).unwrap_or_else(|_| "stay".into()),
            location_id: row.get(4).ok(),
            room_name: row.get(5).ok(),
            staff_id: row.get(6).ok(),
            order_id: row.get(7).ok(),
            document_id: row.get(8).ok(),
            customer_id: row.get(9).ok(),
            customer_name: row.get(10).ok(),
            source_channel: row.get(11).unwrap_or_else(|_| "direct".into()),
            external_booking_id: row.get(12).ok(),
            status: row.get(13).unwrap_or_else(|_| "checked_in".into()),
            slot_start: row.get(14).unwrap_or(0),
            slot_end: row.get(15).unwrap_or(0),
            party_size: row.get(16).unwrap_or(1),
            notes: row.get(17).ok(),
            meta: row.get(18).unwrap_or_else(|_| "{}".into()),
            confirmed_at: row.get(19).ok(),
            created_at: row.get(20).unwrap_or(0),
        });
    }
    Ok(list)
}

// ── Analytics & Master Calendar Commands ──────────────────────────────────────

#[tauri::command]
pub async fn shop_get_stay_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<StayAnalytics, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let ts = now_ts();
    let day_start = ts - (ts % 86400);
    let day_end = day_start + 86400;

    // Room counts
    let rooms = shop_list_stay_rooms(state.clone()).await.unwrap_or_default();
    let total_rooms = rooms.len() as i64;
    let occupied_rooms = rooms.iter().filter(|r| r.status == "occupied").count() as i64;
    let reserved_rooms = rooms.iter().filter(|r| r.status == "reserved").count() as i64;
    let available_rooms = total_rooms - occupied_rooms - reserved_rooms;

    let occupancy_rate = if total_rooms > 0 {
        (occupied_rooms as f64 / total_rooms as f64) * 100.0
    } else {
        0.0
    };

    // Today's arrivals count
    let mut arr_rows = conn
        .query(
            "SELECT COUNT(*) FROM shop_reservations WHERE profile_id = ? AND status = 'confirmed' AND slot_start >= ? AND slot_start < ?",
            crate::turso_params![profile_id.clone(), day_start, day_end],
        )
        .await
        .map_err(|e| e.to_string())?;
    let today_arrivals = if let Ok(Some(row)) = arr_rows.next().await { row.get::<i64>(0).unwrap_or(0) } else { 0 };

    // Today's departures count
    let mut dep_rows = conn
        .query(
            "SELECT COUNT(*) FROM shop_reservations WHERE profile_id = ? AND status = 'checked_in' AND slot_end >= ? AND slot_end < ?",
            crate::turso_params![profile_id.clone(), day_start, day_end],
        )
        .await
        .map_err(|e| e.to_string())?;
    let today_departures = if let Ok(Some(row)) = dep_rows.next().await { row.get::<i64>(0).unwrap_or(0) } else { 0 };

    // Open folios summary
    let mut fol_rows = conn
        .query(
            "SELECT COUNT(*), COALESCE(SUM(total_charges), 0) FROM shop_folios WHERE profile_id = ? AND status = 'open'",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    let (open_folios_count, total_folio_charges) = if let Ok(Some(row)) = fol_rows.next().await {
        (row.get::<i64>(0).unwrap_or(0), row.get::<f64>(1).unwrap_or(0.0))
    } else {
        (0, 0.0)
    };

    // Calculate ADR & RevPAR from paid checkouts & running folios
    let mut rev_rows = conn
        .query(
            "SELECT COALESCE(SUM(grand_total), 0) FROM shop_documents WHERE profile_id = ? AND doc_type = 'checkout' AND status = 'paid'",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    let settled_revenue = if let Ok(Some(row)) = rev_rows.next().await { row.get::<f64>(0).unwrap_or(0.0) } else { 0.0 };

    let combined_revenue = settled_revenue + total_folio_charges;

    let avg_daily_rate = if occupied_rooms > 0 {
        combined_revenue / occupied_rooms as f64
    } else if total_rooms > 0 {
        rooms.iter().map(|r| r.base_rate).sum::<f64>() / total_rooms as f64
    } else {
        0.0
    };

    let revpar = if total_rooms > 0 {
        (occupancy_rate / 100.0) * avg_daily_rate
    } else {
        0.0
    };

    Ok(StayAnalytics {
        total_rooms,
        occupied_rooms,
        available_rooms,
        reserved_rooms,
        occupancy_rate,
        today_arrivals,
        today_departures,
        open_folios_count,
        total_folio_charges,
        avg_daily_rate,
        revpar,
    })
}

// ── OTA iCal Synchronization (Airbnb / Booking.com / VRBO) ───────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct IcalSyncResult {
    pub total_events: usize,
    pub created_count: usize,
    pub updated_count: usize,
    pub cancelled_count: usize,
    pub conflict_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct SyncOtaIcalData {
    pub location_id: String,
    pub service: Option<String>, // "airbnb_ics" | "booking_com_ics" | "vrbo_ics"
    pub ical_url: Option<String>,
    pub ical_content: Option<String>,
}

fn parse_ical_dt(s: &str) -> Option<i64> {
    use chrono::{NaiveDate, NaiveDateTime};
    let clean = s.trim();
    if clean.contains('T') {
        let no_z = clean.trim_end_matches('Z');
        if let Ok(dt) = NaiveDateTime::parse_from_str(no_z, "%Y%m%dT%H%M%S") {
            return Some(dt.and_utc().timestamp());
        }
    }
    if let Ok(d) = NaiveDate::parse_from_str(clean, "%Y%m%d") {
        return Some(d.and_hms_opt(12, 0, 0)?.and_utc().timestamp());
    }
    None
}

#[tauri::command]
pub async fn shop_sync_ota_ical(
    data: SyncOtaIcalData,
    state: State<'_, Arc<AppState>>,
) -> Result<IcalSyncResult, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let raw_ics = if let Some(ref content) = data.ical_content {
        content.clone()
    } else if let Some(ref url) = data.ical_url {
        let client = crate::db::turso::create_shared_http_client();
        let res = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch iCal feed from {}: {}", url, e))?;
        res.text()
            .await
            .map_err(|e| format!("Failed to read iCal body: {}", e))?
    } else {
        return Err("Either ical_url or ical_content must be provided".into());
    };

    let source_channel = data.service.clone().unwrap_or_else(|| "airbnb_ics".into());

    // Save or update connection record
    if let Some(ref url) = data.ical_url {
        let conn_id = format!("conn-ota-{}", now_micros());
        let _ = conn.execute(
            "INSERT INTO connections (id, profile_id, name, label, service, url, external_profile_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT (profile_id, name) DO UPDATE SET url = excluded.url, updated_at = strftime('%s','now')",
            crate::turso_params![
                conn_id,
                profile_id.clone(),
                format!("{}-{}", source_channel, data.location_id),
                format!("OTA iCal Feed - {}", source_channel),
                source_channel.clone(),
                url.clone(),
                data.location_id.clone(),
            ],
        ).await;
    }

    let mut total_events = 0;
    let mut created_count = 0;
    let mut updated_count = 0;
    let mut conflict_count = 0;
    let mut seen_ext_ids = Vec::new();

    let events: Vec<&str> = raw_ics.split("BEGIN:VEVENT").skip(1).collect();

    for ev in events {
        let block = if let Some(idx) = ev.find("END:VEVENT") {
            &ev[..idx]
        } else {
            ev
        };

        total_events += 1;

        let mut uid: Option<String> = None;
        let mut dtstart: Option<i64> = None;
        let mut dtend: Option<i64> = None;
        let mut summary: Option<String> = None;
        let mut description: Option<String> = None;

        for line in block.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("UID:") {
                uid = Some(rest.trim().to_string());
            } else if line.starts_with("DTSTART") {
                if let Some(val) = line.split(':').nth(1) {
                    dtstart = parse_ical_dt(val);
                }
            } else if line.starts_with("DTEND") {
                if let Some(val) = line.split(':').nth(1) {
                    dtend = parse_ical_dt(val);
                }
            } else if let Some(rest) = line.strip_prefix("SUMMARY:") {
                summary = Some(rest.trim().to_string());
            } else if let Some(rest) = line.strip_prefix("DESCRIPTION:") {
                description = Some(rest.trim().to_string());
            }
        }

        let ext_id = match uid {
            Some(u) if !u.is_empty() => u,
            _ => continue,
        };

        seen_ext_ids.push(ext_id.clone());

        let start = match dtstart {
            Some(s) => s,
            None => continue,
        };
        let end = dtend.unwrap_or(start + 86400);

        let base_notes = format!(
            "{}{}",
            summary.as_deref().unwrap_or("OTA Booking"),
            description.map(|d| format!(" - {}", d)).unwrap_or_default()
        );

        // B5: Double-Booking Overlap Check
        let mut has_overlap = false;
        let mut overlap_conflict_text = String::new();
        let mut overlap_rows = conn
            .query(
                "SELECT id, source_channel, slot_start, slot_end FROM shop_reservations \
                 WHERE profile_id = ? AND location_id = ? AND status IN ('confirmed', 'checked_in', 'hold', 'conflict') \
                   AND (external_booking_id IS NULL OR external_booking_id != ?) \
                   AND slot_start < ? AND slot_end > ? \
                 LIMIT 1",
                crate::turso_params![profile_id.clone(), data.location_id.clone(), ext_id.clone(), end, start],
            )
            .await
            .ok();

        if let Some(ref mut rows) = overlap_rows {
            if let Ok(Some(row)) = rows.next().await {
                has_overlap = true;
                let conflict_id: String = row.get(0).unwrap_or_default();
                let conflict_chan: String = row.get(1).unwrap_or_default();
                overlap_conflict_text = format!("[DOUBLE BOOKING CONFLICT with {} ({})] ", conflict_id, conflict_chan);
                conflict_count += 1;
            }
        }

        let (final_status, final_notes) = if has_overlap {
            ("conflict".to_string(), format!("{}{}", overlap_conflict_text, base_notes))
        } else {
            ("confirmed".to_string(), base_notes)
        };

        // Check if existing reservation with this external_booking_id
        let mut check_rows = conn
            .query(
                "SELECT id FROM shop_reservations WHERE profile_id = ? AND source_channel = ? AND external_booking_id = ?",
                crate::turso_params![profile_id.clone(), source_channel.clone(), ext_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Ok(Some(row)) = check_rows.next().await {
            let res_id: String = row.get(0).unwrap_or_default();
            conn.execute(
                "UPDATE shop_reservations SET status = ?, slot_start = ?, slot_end = ?, notes = ?, updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
                crate::turso_params![final_status, start, end, final_notes, res_id, profile_id.clone()],
            ).await.map_err(|e| e.to_string())?;
            updated_count += 1;
        } else {
            let res_id = format!("res-ota-{}", now_micros());
            conn.execute(
                "INSERT INTO shop_reservations \
                 (id, profile_id, item_id, item_type, location_id, source_channel, external_booking_id, status, slot_start, slot_end, party_size, notes, confirmed_at, created_at, updated_at) \
                 VALUES (?, ?, 'item_stay_default', 'stay', ?, ?, ?, ?, ?, ?, 1, ?, unixepoch(), unixepoch(), unixepoch())",
                crate::turso_params![
                    res_id.clone(),
                    profile_id.clone(),
                    data.location_id.clone(),
                    source_channel.clone(),
                    ext_id.clone(),
                    final_status,
                    start,
                    end,
                    final_notes,
                ],
            ).await.map_err(|e| e.to_string())?;
            created_count += 1;
        }
    }

    // B4: Cancelled / Missing Event Detection
    let mut cancelled_count = 0;
    let mut existing_ota_rows = conn
        .query(
            "SELECT id, external_booking_id FROM shop_reservations \
             WHERE profile_id = ? AND location_id = ? AND source_channel = ? \
               AND status IN ('confirmed', 'conflict') AND external_booking_id IS NOT NULL",
            crate::turso_params![profile_id.clone(), data.location_id.clone(), source_channel.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    while let Ok(Some(row)) = existing_ota_rows.next().await {
        let res_id: String = row.get(0).unwrap_or_default();
        let ext_id: String = row.get(1).unwrap_or_default();
        if !seen_ext_ids.contains(&ext_id) {
            conn.execute(
                "UPDATE shop_reservations SET status = 'cancelled', cancelled_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND profile_id = ?",
                crate::turso_params![res_id, profile_id.clone()],
            ).await.map_err(|e| e.to_string())?;
            cancelled_count += 1;
        }
    }

    Ok(IcalSyncResult {
        total_events,
        created_count,
        updated_count,
        cancelled_count,
        conflict_count,
    })
}

#[tauri::command]
pub async fn shop_export_stay_ical(
    location_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut sql = "SELECT r.id, r.location_id, COALESCE(l.name, 'Room'), r.slot_start, r.slot_end, r.source_channel, r.notes \
                   FROM shop_reservations r \
                   LEFT JOIN shop_locations l ON l.id = r.location_id \
                   WHERE r.profile_id = ? AND r.status IN ('confirmed', 'checked_in', 'hold', 'conflict')".to_string();
    let mut params = vec![crate::db::turso::TursoParam::from(profile_id)];

    if let Some(ref loc_id) = location_id {
        if !loc_id.trim().is_empty() {
            sql.push_str(" AND r.location_id = ?");
            params.push(crate::db::turso::TursoParam::from(loc_id.clone()));
        }
    }

    sql.push_str(" ORDER BY r.slot_start ASC");

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;

    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut ics = String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BusinessKit//Hospitality Calendar//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n");

    while let Ok(Some(row)) = rows.next().await {
        let id: String = row.get(0).unwrap_or_default();
        let room_name: String = row.get(2).unwrap_or_else(|_| "Room".into());
        let start_ts: i64 = row.get(3).unwrap_or(0);
        let end_ts: i64 = row.get(4).unwrap_or(0);
        let channel: String = row.get(5).unwrap_or_else(|_| "direct".into());

        use chrono::DateTime;
        let start_dt = DateTime::from_timestamp(start_ts, 0).unwrap_or_default();
        let end_dt = DateTime::from_timestamp(end_ts, 0).unwrap_or_default();
        let now_dt = DateTime::from_timestamp(now_ts as i64, 0).unwrap_or_default();

        ics.push_str("BEGIN:VEVENT\r\n");
        ics.push_str(&format!("UID:{}@businesskit\r\n", id));
        ics.push_str(&format!("DTSTAMP:{}\r\n", now_dt.format("%Y%m%dT%H%M%SZ")));
        ics.push_str(&format!("DTSTART:{}\r\n", start_dt.format("%Y%m%dT%H%M%SZ")));
        ics.push_str(&format!("DTEND:{}\r\n", end_dt.format("%Y%m%dT%H%M%SZ")));
        ics.push_str(&format!("SUMMARY:Reserved - {} ({})\r\n", room_name, channel));
        ics.push_str("STATUS:CONFIRMED\r\n");
        ics.push_str("END:VEVENT\r\n");
    }

    ics.push_str("END:VCALENDAR\r\n");
    Ok(ics)
}
