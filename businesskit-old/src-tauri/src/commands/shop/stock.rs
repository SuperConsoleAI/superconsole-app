// src-tauri/src/commands/shop/stock.rs
//
// Phase 2 — Know Your Stock
//
// Commands:
//   shop_list_warehouses       → list all warehouses
//   shop_get_stock_position    → current qty per item+warehouse (from ledger sum)
//   shop_receive_stock         → create goods_receipt doc + ledger rows
//   shop_adjust_stock          → adjustment record + ledger row
//   shop_transfer_stock        → two ledger rows (transfer_out + transfer_in)
//   shop_get_low_stock_items   → items below their reorder min_qty
//   shop_set_reorder_rule      → upsert reorder rule for item+warehouse
//   shop_find_item_by_barcode  → lookup item via shop_barcodes

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warehouse {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub warehouse_type: String,
    pub is_default: i64,
    pub is_active: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockPosition {
    pub item_id: String,
    pub item_name: String,
    pub sku: Option<String>,
    pub warehouse_id: String,
    pub warehouse_name: String,
    pub qty_on_hand: f64,
    pub reorder_min: Option<f64>,
    pub is_low: bool,
}

#[derive(Debug, Deserialize)]
pub struct ReceiveStockData {
    pub warehouse_id: Option<String>,
    pub staff_id: Option<String>,
    pub vendor_id: Option<String>, // actual FK to crm_contacts/shop_vendors
    pub vendor_name: Option<String>, // kept for notes display
    pub lines: Vec<ReceiveStockLine>,
    pub notes: Option<String>,
    pub ref_number: Option<String>,      // Vendor Invoice / Bill / Order #
    pub vendor_bill_date: Option<i64>,   // Vendor Invoice Date
    pub cash_discount_pct: Option<f64>,  // Cash discount % (CD)
    pub cash_discount_amt: Option<f64>,  // Cash discount amount
    pub inward_expense: Option<f64>,     // Inward freight/handling/loading charges
    pub transporter_name: Option<String>,// Transporter / Courier name
    pub lr_number: Option<String>,       // Lorry Receipt / Bilty #
    pub vehicle_number: Option<String>,  // Vehicle #
    pub transaction_id: Option<String>,  // Payment Txn / UTR #
    pub payment_method: Option<String>,  // cash, upi, bank_transfer, card, credit
    pub media_id: Option<String>,        // Invoice attachment / screenshot media_id
    pub amount_paid: Option<f64>,        // Amount paid (partial or full)
}

#[derive(Debug, Deserialize)]
pub struct ReceiveStockLine {
    pub item_id: String,
    pub item_name: String,
    pub qty: f64,
    pub free_qty: Option<f64>, // free scheme units — not billed but physical stock
    pub cost: Option<f64>,
    pub selling_price: Option<f64>, // PTR / Selling price update
    pub mrp: Option<f64>,
    pub landing_cost: Option<f64>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub batch_no: Option<String>,
    pub expiry_date: Option<i64>, // unix timestamp
    pub shelf_location: Option<String>,
    pub pricing_snapshot: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdjustStockData {
    pub item_id: String,
    pub warehouse_id: Option<String>,
    pub qty_change: f64,
    pub adjustment_type: String,
    pub reason: String,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TransferStockData {
    pub from_warehouse_id: String,
    pub to_warehouse_id: String,
    pub item_id: String,
    pub qty: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderRuleData {
    pub item_id: String,
    pub warehouse_id: Option<String>,
    pub min_qty: f64,
    pub reorder_qty: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LowStockItem {
    pub item_id: String,
    pub item_name: String,
    pub sku: Option<String>,
    pub warehouse_id: String,
    pub warehouse_name: String,
    pub qty_on_hand: f64,
    pub min_qty: f64,
    pub reorder_qty: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundItem {
    pub id: String,
    pub name: String,
    pub price: f64,
    pub sku: Option<String>,
    pub barcode: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateWarehouseData {
    pub name: String,
    pub warehouse_type: Option<String>,
    pub address: Option<String>,
    pub is_default: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWarehouseData {
    pub name: String,
    pub warehouse_type: Option<String>,
    pub address: Option<String>,
    pub is_default: Option<i64>,
}

pub struct PresetWarehouse {
    pub suffix: &'static str,
    pub name: &'static str,
    pub warehouse_type: &'static str,
    pub is_default: i64,
}

pub const PRESET_SHOP_WAREHOUSES: &[PresetWarehouse] = &[
    PresetWarehouse {
        suffix: "main",
        name: "Main Warehouse",
        warehouse_type: "store",
        is_default: 1,
    },
];

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("{}-{}", prefix, ts)
}

/// Get the default warehouse id, falling back to any active one, or auto-seeding default if none exists.
/// IMPORTANT: returns immediately after consuming all rows so the
/// connection is free for the next query.
async fn get_default_warehouse(conn: &crate::db::turso::TursoConn, profile_id: &str) -> Option<String> {
    // 1. Look for explicit is_default = 1
    let id = {
        let mut rows = conn
            .query(
                "SELECT id FROM shop_warehouses \
             WHERE profile_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1",
                crate::turso_params![profile_id.to_string()],
            )
            .await
            .ok()?;
        if let Ok(Some(row)) = rows.next().await {
            while rows.next().await.map(|r| r.is_some()).unwrap_or(false) {}
            row.get::<String>(0).ok()
        } else {
            None
        }
    };

    if id.is_some() {
        return id;
    }

    // 2. Fall back to any active warehouse
    let id2 = {
        let mut rows2 = conn
            .query(
                "SELECT id FROM shop_warehouses \
             WHERE profile_id = ? AND is_active = 1 ORDER BY name ASC LIMIT 1",
                crate::turso_params![profile_id.to_string()],
            )
            .await
            .ok()?;
        if let Ok(Some(row)) = rows2.next().await {
            while rows2.next().await.map(|r| r.is_some()).unwrap_or(false) {}
            row.get::<String>(0).ok()
        } else {
            None
        }
    };

    if id2.is_some() {
        return id2;
    }

    // 3. None exist yet — auto-insert default Main Warehouse
    let default_id = format!("{}_main", profile_id);
    let _ = conn
        .execute(
            "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) \
             VALUES (?1, ?2, 'Main Warehouse', 'store', 1, 1) \
             ON CONFLICT(id) DO UPDATE SET is_active = 1",
            crate::turso_params![default_id.clone(), profile_id.to_string()],
        )
        .await;

    Some(default_id)
}

/// Get current balance for item+warehouse from the ledger.
/// Always scopes `rows` so the connection is freed immediately.
async fn get_balance(conn: &crate::db::turso::TursoConn, item_id: &str, warehouse_id: &str) -> f64 {
    let Ok(mut rows) = conn
        .query(
            "SELECT COALESCE(SUM(qty_in) - SUM(qty_out), 0.0) \
         FROM shop_stock_ledger WHERE item_id = ? AND warehouse_id = ?",
            crate::turso_params![item_id.to_string(), warehouse_id.to_string()],
        )
        .await
    else {
        return 0.0;
    };

    let result = if let Ok(Some(row)) = rows.next().await {
        row.get::<f64>(0).unwrap_or(0.0)
    } else {
        0.0
    };
    // Drain so rows is properly closed before drop
    while rows.next().await.map(|r| r.is_some()).unwrap_or(false) {}
    result
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Seed default preset warehouse ("Main Warehouse") for the active profile.
#[tauri::command]
pub async fn shop_seed_warehouses(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Warehouse>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    for wh in PRESET_SHOP_WAREHOUSES.iter() {
        let wh_id = format!("{}_{}", profile_id, wh.suffix);
        let _ = conn
            .execute(
                "INSERT INTO shop_warehouses \
                 (id, profile_id, name, warehouse_type, is_default, is_active) \
                 VALUES (?1, ?2, ?3, ?4, ?5, 1) \
                 ON CONFLICT(id) DO UPDATE SET \
                   name=excluded.name, \
                   warehouse_type=excluded.warehouse_type, \
                   is_default=excluded.is_default, \
                   is_active=1",
                crate::turso_params![
                    wh_id,
                    profile_id.clone(),
                    wh.name.to_string(),
                    wh.warehouse_type.to_string(),
                    wh.is_default
                ],
            )
            .await;
    }

    let mut rows = conn
        .query(
            "SELECT id, profile_id, name, warehouse_type, is_default, is_active \
             FROM shop_warehouses WHERE profile_id = ? AND is_active = 1 ORDER BY is_default DESC, name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(Warehouse {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            name: row.get(2).unwrap_or_default(),
            warehouse_type: row.get(3).unwrap_or_else(|_| "store".into()),
            is_default: row.get(4).unwrap_or(0),
            is_active: row.get(5).unwrap_or(1),
        });
    }
    Ok(out)
}

/// List all warehouses for the active profile.
/// Auto-seeds "Main Warehouse" if no warehouses exist yet.
#[tauri::command]
pub async fn shop_list_warehouses(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Warehouse>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, profile_id, name, warehouse_type, is_default, is_active \
         FROM shop_warehouses WHERE profile_id = ? AND is_active = 1 ORDER BY is_default DESC, name ASC",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(Warehouse {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            name: row.get(2).unwrap_or_default(),
            warehouse_type: row.get(3).unwrap_or_else(|_| "store".into()),
            is_default: row.get(4).unwrap_or(0),
            is_active: row.get(5).unwrap_or(1),
        });
    }

    if out.is_empty() {
        return shop_seed_warehouses(state).await;
    }

    Ok(out)
}

/// Create a new warehouse.
#[tauri::command]
pub async fn shop_create_warehouse(
    data: CreateWarehouseData,
    state: State<'_, Arc<AppState>>,
) -> Result<Warehouse, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = new_id("wh");
    let wh_type = data.warehouse_type.unwrap_or_else(|| "store".to_string());
    let is_default = data.is_default.unwrap_or(0);

    if is_default == 1 {
        let _ = conn
            .execute(
                "UPDATE shop_warehouses SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    conn.execute(
        "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, address, is_default, is_active) \
         VALUES (?, ?, ?, ?, ?, ?, 1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.name.clone(),
            wh_type.clone(),
            data.address,
            is_default,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(Warehouse {
        id,
        profile_id,
        name: data.name,
        warehouse_type: wh_type,
        is_default,
        is_active: 1,
    })
}

/// Update an existing warehouse.
#[tauri::command]
pub async fn shop_update_warehouse(
    warehouse_id: String,
    data: UpdateWarehouseData,
    state: State<'_, Arc<AppState>>,
) -> Result<Warehouse, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let wh_type = data.warehouse_type.unwrap_or_else(|| "store".to_string());
    let is_default = data.is_default.unwrap_or(0);

    if is_default == 1 {
        let _ = conn
            .execute(
                "UPDATE shop_warehouses SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    conn.execute(
        "UPDATE shop_warehouses \
         SET name = ?, warehouse_type = ?, address = ?, is_default = ? \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.name.clone(),
            wh_type.clone(),
            data.address,
            is_default,
            warehouse_id.clone(),
            profile_id.clone(),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(Warehouse {
        id: warehouse_id,
        profile_id,
        name: data.name,
        warehouse_type: wh_type,
        is_default,
        is_active: 1,
    })
}

/// Soft-delete a warehouse (sets is_active = 0).
#[tauri::command]
pub async fn shop_delete_warehouse(
    warehouse_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_warehouses SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![warehouse_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get current stock position for all tracked items.
/// Calculates live from the ledger — always correct.
#[tauri::command]
pub async fn shop_get_stock_position(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StockPosition>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Resolve default warehouse first for any unledgred items
    let (def_wh_id, def_wh_name) = {
        let mut wh_rows = conn.query(
            "SELECT id, name FROM shop_warehouses WHERE profile_id = ? ORDER BY is_default DESC, name ASC LIMIT 1",
            crate::turso_params![profile_id.clone()],
        ).await.ok();
        if let Some(ref mut r) = wh_rows {
            if let Ok(Some(row)) = r.next().await {
                (row.get::<String>(0).unwrap_or_else(|_| "default".into()), row.get::<String>(1).unwrap_or_else(|_| "Main Warehouse".into()))
            } else {
                ("default".to_string(), "Main Warehouse".to_string())
            }
        } else {
            ("default".to_string(), "Main Warehouse".to_string())
        }
    };

    // First query: items with ledger rows (scoped so Rows drops before next query)
    let mut positions: Vec<StockPosition> = {
        let mut rows = conn.query(
            "SELECT l.item_id, \
                    COALESCE(CASE WHEN v.id IS NOT NULL THEN (pi.name || ' - ' || v.name) ELSE NULL END, i.name, v.name, l.item_id), \
                    COALESCE(v.sku, i.sku), \
                    l.warehouse_id, \
                    COALESCE(w.name, l.warehouse_id), \
                    CASE WHEN v.id IS NOT NULL AND COALESCE(SUM(l.qty_in), 0.0) = 0.0 THEN v.stock_qty ELSE (COALESCE(SUM(l.qty_in), 0.0) - COALESCE(SUM(l.qty_out), 0.0)) END as qty_on_hand, \
                    COALESCE(r.min_qty, rv.min_qty) \
             FROM shop_stock_ledger l \
             LEFT JOIN shop_items i ON i.id = l.item_id \
             LEFT JOIN shop_item_variants v ON v.id = l.item_id \
             LEFT JOIN shop_items pi ON pi.id = v.item_id \
             LEFT JOIN shop_warehouses w ON w.id = l.warehouse_id \
             LEFT JOIN shop_reorder_rules r ON r.item_id = l.item_id AND (r.warehouse_id = l.warehouse_id OR r.warehouse_id = '' OR r.warehouse_id IS NULL) AND r.is_active = 1 \
             LEFT JOIN shop_reorder_rules rv ON rv.item_id = v.id AND (rv.warehouse_id = l.warehouse_id OR rv.warehouse_id = '' OR rv.warehouse_id IS NULL) AND rv.is_active = 1 \
             WHERE l.profile_id = ? \
             GROUP BY l.item_id, l.warehouse_id \
             ORDER BY COALESCE(CASE WHEN v.id IS NOT NULL THEN (pi.name || ' - ' || v.name) ELSE NULL END, i.name, v.name, l.item_id) ASC",
            crate::turso_params![profile_id.clone()],
        ).await.map_err(|e| e.to_string())?;

        let mut v = Vec::new();
        while let Ok(Some(row)) = rows.next().await {
            let qty: f64 = row.get(5).unwrap_or(0.0);
            let min_qty: Option<f64> = row.get(6).ok();
            let is_low = min_qty.map(|m| qty <= m).unwrap_or(false);
            v.push(StockPosition {
                item_id: row.get(0).unwrap_or_default(),
                item_name: row.get(1).unwrap_or_default(),
                sku: row.get(2).ok(),
                warehouse_id: row.get(3).unwrap_or_default(),
                warehouse_name: row.get(4).unwrap_or_default(),
                qty_on_hand: qty,
                reorder_min: min_qty,
                is_low,
            });
        }
        v
    }; // first Rows dropped here

    // Second query: items & variants with track_inventory=1 (or with reorder rule) but NO ledger rows yet.
    {
        let mut zero_rows = conn.query(
            "SELECT i.id, i.name, i.sku, 0.0 as qty, r.min_qty \
             FROM shop_items i \
             LEFT JOIN shop_reorder_rules r ON r.item_id = i.id AND r.is_active = 1 \
             WHERE i.profile_id = ? AND (i.track_inventory = 1 OR r.id IS NOT NULL) AND (i.archived = 0 OR i.archived IS NULL) \
             AND (i.has_variants = 0 OR i.has_variants IS NULL) \
             AND NOT EXISTS ( \
                 SELECT 1 FROM shop_stock_ledger l \
                 WHERE l.item_id = i.id AND l.profile_id = i.profile_id \
             ) \
             GROUP BY i.id \
             UNION ALL \
             SELECT v.id, (pi.name || ' - ' || v.name) as name, COALESCE(v.sku, pi.sku) as sku, COALESCE(v.stock_qty, 0.0) as qty, r.min_qty \
             FROM shop_item_variants v \
             JOIN shop_items pi ON pi.id = v.item_id \
             LEFT JOIN shop_reorder_rules r ON r.item_id = v.id AND r.is_active = 1 \
             WHERE v.profile_id = ? AND (v.track_inventory = 1 OR r.id IS NOT NULL) AND v.is_active = 1 \
             AND (pi.archived = 0 OR pi.archived IS NULL) \
             AND NOT EXISTS ( \
                 SELECT 1 FROM shop_stock_ledger l \
                 WHERE l.item_id = v.id AND l.profile_id = v.profile_id \
             ) \
             GROUP BY v.id \
             ORDER BY name ASC",
            crate::turso_params![profile_id.clone(), profile_id.clone()],
        ).await.map_err(|e| e.to_string())?;

        while let Ok(Some(row)) = zero_rows.next().await {
            let qty: f64 = row.get(3).unwrap_or(0.0);
            let min_qty: Option<f64> = row.get(4).ok();
            let is_low = min_qty.map(|m| qty <= m).unwrap_or(false);
            positions.push(StockPosition {
                item_id: row.get(0).unwrap_or_default(),
                item_name: row.get(1).unwrap_or_default(),
                sku: row.get(2).ok(),
                warehouse_id: def_wh_id.clone(),
                warehouse_name: def_wh_name.clone(),
                qty_on_hand: qty,
                reorder_min: min_qty,
                is_low,
            });
        }
    } // second Rows dropped here

    Ok(positions)
}

/// Receive goods from a vendor.
/// Creates a goods_receipt document + one ledger row per line (movement_type='purchase').
#[tauri::command]
pub async fn shop_receive_stock(
    data: ReceiveStockData,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    if data.lines.is_empty() {
        return Err("No items to receive".into());
    }

    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Step 1: resolve warehouse (scoped so Rows is dropped)
    let warehouse_id = match data.warehouse_id {
        Some(w) if !w.is_empty() => w,
        _ => get_default_warehouse(&conn, &profile_id)
            .await
            .ok_or_else(|| {
                "No warehouse found. Run seed_shop_defaults or add one first.".to_string()
            })?,
    };

    // Step 2: generate GR doc number (scoped)
    let seq: i64 = {
        let mut seq_rows = conn.query(
            "SELECT COUNT(*) FROM shop_documents WHERE profile_id = ? AND doc_type = 'goods_receipt'",
            crate::turso_params![profile_id.clone()],
        ).await.map_err(|e| format!("seq query: {}", e))?;
        let n = if let Ok(Some(row)) = seq_rows.next().await {
            row.get::<i64>(0).unwrap_or(0)
        } else {
            0
        };
        while seq_rows.next().await.map(|r| r.is_some()).unwrap_or(false) {}
        n + 1
    }; // seq_rows dropped here
    let doc_number = format!("GR-{:04}", seq);

    let doc_id = new_id("gr");
    let notes = data
        .vendor_name
        .as_ref()
        .map(|v| format!("Vendor: {}", v))
        .or_else(|| data.notes.clone());

    // Calculate totals
    let mut subtotal: f64 = 0.0;
    for line in &data.lines {
        let cost = line.cost.unwrap_or(0.0);
        subtotal += line.qty * cost;
    }
    let cd_amt = data.cash_discount_amt.unwrap_or_else(|| {
        if let Some(cd_pct) = data.cash_discount_pct {
            (subtotal * cd_pct) / 100.0
        } else {
            0.0
        }
    });
    let inward_exp = data.inward_expense.unwrap_or(0.0);
    let grand_total = (subtotal - cd_amt + inward_exp).max(0.0);
    let paid_amt = data.amount_paid.unwrap_or(0.0);
    let due_amt = (grand_total - paid_amt).max(0.0);
    let doc_status = if grand_total > 0.0 && paid_amt >= grand_total {
        "paid"
    } else if paid_amt > 0.0 {
        "partial"
    } else {
        "confirmed"
    };

    let active_uid = state.get_current_user_id().await;
    let staff_id = data.staff_id.clone();

    // Step 3: insert goods_receipt document
    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, user_id, updated_by, staff_id, doc_type, doc_number, ref_number, vendor_bill_date, transaction_id, payment_method, media_id, \
          warehouse_id, channel, status, vendor_id, \
          subtotal, discount_amt, cash_discount_pct, cash_discount_amt, inward_expense, \
          taxable_amt, tax_amount, grand_total, amount_paid, amount_due, \
          transporter_name, lr_number, vehicle_number, notes) \
         VALUES (?, ?, ?, ?, ?, 'goods_receipt', ?, ?, ?, ?, ?, ?, ?, 'dashboard', ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            doc_id.clone(),
            profile_id.clone(),
            active_uid.clone(),
            active_uid.clone(),
            staff_id,
            doc_number,
            data.ref_number,
            data.vendor_bill_date,
            data.transaction_id.clone(),
            data.payment_method.clone(),
            data.media_id,
            warehouse_id.clone(),
            doc_status,
            data.vendor_id.clone(),
            subtotal,
            data.cash_discount_pct.unwrap_or(0.0),
            cd_amt,
            inward_exp,
            subtotal,
            grand_total,
            paid_amt,
            due_amt,
            data.transporter_name,
            data.lr_number,
            data.vehicle_number,
            notes.unwrap_or_default()
        ],
    ).await.map_err(|e| format!("insert doc: {}", e))?;

    // Step 3b: If payment made, insert into shop_document_payments
    if paid_amt > 0.0 {
        let pay_id = new_id("pay");
        let pay_mode = data.payment_method.unwrap_or_else(|| "cash".to_string());
        conn.execute(
            "INSERT INTO shop_document_payments \
             (id, profile_id, document_id, amount, payment_mode, reference) \
             VALUES (?, ?, ?, ?, ?, ?)",
            crate::turso_params![
                pay_id,
                profile_id.clone(),
                doc_id.clone(),
                paid_amt,
                pay_mode,
                data.transaction_id
            ],
        )
        .await
        .ok();
    }

    // Step 4: insert ledger rows (one at a time, each get_balance call is scoped internally)
    for line in &data.lines {
        let free = line.free_qty.unwrap_or(0.0);
        let total_in = line.qty + free; // billed + free = physical units received
        let balance = get_balance(&conn, &line.item_id, &warehouse_id).await;
        let new_balance = balance + total_in;
        let ledger_id = new_id("sl");
        let cost = line.cost.unwrap_or(0.0);

        // Effective landed cost computation per physical unit
        let landing_cost = line.landing_cost.unwrap_or_else(|| {
            if total_in > 0.0 {
                (line.qty * cost) / total_in
            } else {
                cost
            }
        });

        conn.execute(
            "INSERT INTO shop_stock_ledger \
             (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, \
              balance_after, unit_cost, document_id) \
             VALUES (?, ?, ?, ?, 'purchase', ?, 0, ?, ?, ?)",
            crate::turso_params![
                ledger_id,
                profile_id.clone(),
                line.item_id.clone(),
                warehouse_id.clone(),
                total_in,
                new_balance,
                landing_cost,
                doc_id.clone()
            ],
        )
        .await
        .map_err(|e| format!("insert ledger: {}", e))?;

        // If this item is a variant, update shop_item_variants.stock_qty
        let _ = conn.execute(
            "UPDATE shop_item_variants SET stock_qty = stock_qty + ?1 WHERE id = ?2 AND profile_id = ?3",
            crate::turso_params![total_in, line.item_id.clone(), profile_id.clone()],
        ).await;

        // Step 4b: insert/track batch record in shop_item_batches if batch_no is provided
        let mut batch_id_opt: Option<String> = None;
        if let Some(ref batch_no) = line.batch_no {
            let b_trimmed = batch_no.trim();
            if !b_trimmed.is_empty() {
                let batch_id = new_id("batch");
                conn.execute(
                    "INSERT INTO shop_item_batches \
                     (id, profile_id, item_id, batch_no, expiry_date, qty_received, qty_remaining, \
                      purchase_price, mrp, landing_cost, pack_size, conversion_factor, warehouse_id, shelf_location, is_active) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
                    crate::turso_params![
                        batch_id.clone(),
                        profile_id.clone(),
                        line.item_id.clone(),
                        b_trimmed.to_string(),
                        line.expiry_date,
                        total_in,
                        total_in,
                        cost,
                        line.mrp.unwrap_or(0.0),
                        landing_cost,
                        line.pack_size.clone(),
                        line.conversion_factor.unwrap_or(1.0),
                        warehouse_id.clone(),
                        line.shelf_location.clone()
                    ],
                )
                .await
                .ok(); // batch creation is non-blocking for ledger
                batch_id_opt = Some(batch_id);
            }
        }

        // Step 4c: record document line item
        let doc_line_id = new_id("docl");
        let line_total = line.qty * cost;
        let _ = conn.execute(
            "INSERT INTO shop_document_lines \
             (id, profile_id, document_id, item_id, description, batch_id, qty, free_qty, unit_cost, landing_cost, mrp, \
              pack_size, conversion_factor, scheme_on, scheme_free, line_total, pricing_snapshot) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            crate::turso_params![
                doc_line_id,
                profile_id.clone(),
                doc_id.clone(),
                line.item_id.clone(),
                line.item_name.clone(),
                batch_id_opt,
                line.qty,
                free,
                cost,
                landing_cost,
                line.mrp.unwrap_or(0.0),
                line.pack_size.clone(),
                line.conversion_factor.unwrap_or(1.0),
                line.scheme_on.unwrap_or(0.0),
                line.scheme_free.unwrap_or(0.0),
                line_total,
                line.pricing_snapshot.clone()
            ],
        ).await;

        // Step 4d: Update master shop_items table with latest selling_price, cost_price, mrp, pack_size, schemes
        if let Some(sp) = line.selling_price {
            if sp > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET price = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![sp, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
        if let Some(c) = line.cost {
            if c > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET cost_price = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![c, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
        if let Some(m) = line.mrp {
            if m > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET default_mrp = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![m, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
        if let Some(ref ps) = line.pack_size {
            if !ps.trim().is_empty() {
                conn.execute(
                    "UPDATE shop_items SET pack_size = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![ps.clone(), line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
        if let Some(cf) = line.conversion_factor {
            if cf > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET conversion_factor = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![cf, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
        if let Some(so) = line.scheme_on {
            if so > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET scheme_on = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![so, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
        if let Some(sf) = line.scheme_free {
            if sf > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET scheme_free = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![sf, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
    }

    Ok(doc_id)
}

/// Adjust stock (physical count correction, damage, theft, expiry).
/// Writes to shop_stock_adjustments AND the ledger (single source of truth).
#[tauri::command]
pub async fn shop_adjust_stock(
    data: AdjustStockData,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let warehouse_id = match data.warehouse_id {
        Some(w) => w,
        None => get_default_warehouse(&conn, &profile_id)
            .await
            .ok_or("No warehouse found")?,
    };

    let adj_id = new_id("adj");
    conn.execute(
        "INSERT INTO shop_stock_adjustments \
         (id, profile_id, item_id, warehouse_id, adjustment_type, qty_change, reason) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            adj_id.clone(),
            profile_id.clone(),
            data.item_id.clone(),
            warehouse_id.clone(),
            data.adjustment_type.clone(),
            data.qty_change,
            data.reason.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let balance = get_balance(&conn, &data.item_id, &warehouse_id).await;
    let (qty_in, qty_out) = if data.qty_change >= 0.0 {
        (data.qty_change, 0.0_f64)
    } else {
        (0.0_f64, -data.qty_change)
    };
    let new_balance = balance + data.qty_change;
    let ledger_id = new_id("sl");
    let notes = format!("{} — {}", data.adjustment_type, data.reason);

    conn.execute(
        "INSERT INTO shop_stock_ledger \
         (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, \
          balance_after, unit_cost, notes) \
         VALUES (?, ?, ?, ?, 'adjustment', ?, ?, ?, 0, ?)",
        crate::turso_params![
            ledger_id,
            profile_id.clone(),
            data.item_id.clone(),
            warehouse_id,
            qty_in,
            qty_out,
            new_balance,
            notes
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // If this item is a variant, update shop_item_variants.stock_qty
    let _ = conn.execute(
        "UPDATE shop_item_variants SET stock_qty = MAX(0, stock_qty + ?1) WHERE id = ?2 AND profile_id = ?3",
        crate::turso_params![data.qty_change, data.item_id, profile_id],
    ).await;

    Ok(adj_id)
}

/// Move stock between two warehouses.
/// Writes two ledger rows: transfer_out from source, transfer_in to destination.
#[tauri::command]
pub async fn shop_transfer_stock(
    data: TransferStockData,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let transfer_id = new_id("xfr");

    // Insert transfer record
    conn.execute(
        "INSERT INTO shop_stock_transfers \
         (id, profile_id, from_warehouse_id, to_warehouse_id, item_id, qty, status, notes) \
         VALUES (?, ?, ?, ?, ?, ?, 'received', ?)",
        crate::turso_params![
            transfer_id.clone(),
            profile_id.clone(),
            data.from_warehouse_id.clone(),
            data.to_warehouse_id.clone(),
            data.item_id.clone(),
            data.qty,
            data.notes.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Ledger: transfer_out from source
    let from_balance = get_balance(&conn, &data.item_id, &data.from_warehouse_id).await;
    conn.execute(
        "INSERT INTO shop_stock_ledger \
         (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost) \
         VALUES (?, ?, ?, ?, 'transfer_out', 0, ?, ?, 0)",
        crate::turso_params![
            new_id("sl"), profile_id.clone(), data.item_id.clone(),
            data.from_warehouse_id.clone(), data.qty, from_balance - data.qty
        ],
    ).await.map_err(|e| e.to_string())?;

    // Ledger: transfer_in to destination
    let to_balance = get_balance(&conn, &data.item_id, &data.to_warehouse_id).await;
    conn.execute(
        "INSERT INTO shop_stock_ledger \
         (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost) \
         VALUES (?, ?, ?, ?, 'transfer_in', ?, 0, ?, 0)",
        crate::turso_params![
            new_id("sl"), profile_id, data.item_id,
            data.to_warehouse_id, data.qty, to_balance + data.qty
        ],
    ).await.map_err(|e| e.to_string())?;

    Ok(transfer_id)
}

/// Get items where current stock is at or below their reorder min_qty.
#[tauri::command]
pub async fn shop_get_low_stock_items(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LowStockItem>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT r.item_id, COALESCE(i.name, r.item_id), i.sku, r.warehouse_id, COALESCE(w.name, 'Main Warehouse'), r.min_qty, r.reorder_qty, \
                (COALESCE(SUM(l.qty_in), 0.0) - COALESCE(SUM(l.qty_out), 0.0)) as qty_on_hand \
             FROM shop_reorder_rules r \
             LEFT JOIN shop_items i ON i.id = r.item_id \
             LEFT JOIN shop_warehouses w ON w.id = r.warehouse_id \
             LEFT JOIN shop_stock_ledger l ON l.item_id = r.item_id AND (l.warehouse_id = r.warehouse_id OR r.warehouse_id = '' OR r.warehouse_id IS NULL) \
             WHERE (r.profile_id = ? OR r.profile_id = '' OR r.profile_id IS NULL) AND r.is_active = 1 \
             GROUP BY r.id, r.item_id, r.warehouse_id \
             HAVING (COALESCE(SUM(l.qty_in), 0.0) - COALESCE(SUM(l.qty_out), 0.0)) <= r.min_qty \
             ORDER BY qty_on_hand ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(LowStockItem {
            item_id: row.get(0).unwrap_or_default(),
            item_name: row.get(1).unwrap_or_default(),
            sku: row.get(2).ok(),
            warehouse_id: row.get(3).unwrap_or_default(),
            warehouse_name: row.get(4).unwrap_or_default(),
            min_qty: row.get(5).unwrap_or(0.0),
            reorder_qty: row.get(6).unwrap_or(0.0),
            qty_on_hand: row.get(7).unwrap_or(0.0),
        });
    }
    Ok(out)
}

/// Get all configured reorder rules regardless of whether currently low stock or not.
#[tauri::command]
pub async fn shop_get_all_reorder_rules(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LowStockItem>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT r.item_id, COALESCE(i.name, r.item_id), i.sku, r.warehouse_id, COALESCE(w.name, 'Main Warehouse'), r.min_qty, r.reorder_qty, \
                (COALESCE(SUM(l.qty_in), 0.0) - COALESCE(SUM(l.qty_out), 0.0)) as qty_on_hand \
             FROM shop_reorder_rules r \
             LEFT JOIN shop_items i ON i.id = r.item_id \
             LEFT JOIN shop_warehouses w ON w.id = r.warehouse_id \
             LEFT JOIN shop_stock_ledger l ON l.item_id = r.item_id AND (l.warehouse_id = r.warehouse_id OR r.warehouse_id = '' OR r.warehouse_id IS NULL) \
             WHERE (r.profile_id = ? OR r.profile_id = '' OR r.profile_id IS NULL) AND r.is_active = 1 \
             GROUP BY r.id, r.item_id, r.warehouse_id \
             ORDER BY COALESCE(i.name, r.item_id) ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(LowStockItem {
            item_id: row.get(0).unwrap_or_default(),
            item_name: row.get(1).unwrap_or_default(),
            sku: row.get(2).ok(),
            warehouse_id: row.get(3).unwrap_or_default(),
            warehouse_name: row.get(4).unwrap_or_default(),
            min_qty: row.get(5).unwrap_or(0.0),
            reorder_qty: row.get(6).unwrap_or(0.0),
            qty_on_hand: row.get(7).unwrap_or(0.0),
        });
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderRuleRecord {
    pub id: String,
    pub item_id: String,
    pub warehouse_id: String,
    pub min_qty: f64,
    pub reorder_qty: f64,
    pub is_active: i32,
}

/// Get a single reorder rule for an item + optional warehouse.
#[tauri::command]
pub async fn shop_get_reorder_rule(
    item_id: String,
    warehouse_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<ReorderRuleRecord>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = if let Some(ref wid) = warehouse_id {
        conn.query(
            "SELECT id, item_id, warehouse_id, min_qty, reorder_qty, is_active \
             FROM shop_reorder_rules \
             WHERE (profile_id = ? OR profile_id = '' OR profile_id IS NULL) AND item_id = ? AND (warehouse_id = ? OR warehouse_id = '' OR warehouse_id IS NULL) AND is_active = 1 \
             ORDER BY (CASE WHEN warehouse_id = ? THEN 0 ELSE 1 END) ASC LIMIT 1",
            crate::turso_params![profile_id, item_id, wid.clone(), wid.clone()],
        )
        .await
        .map_err(|e| e.to_string())?
    } else {
        conn.query(
            "SELECT id, item_id, warehouse_id, min_qty, reorder_qty, is_active \
             FROM shop_reorder_rules \
             WHERE (profile_id = ? OR profile_id = '' OR profile_id IS NULL) AND item_id = ? AND is_active = 1 LIMIT 1",
            crate::turso_params![profile_id, item_id],
        )
        .await
        .map_err(|e| e.to_string())?
    };

    if let Ok(Some(row)) = rows.next().await {
        Ok(Some(ReorderRuleRecord {
            id: row.get(0).unwrap_or_default(),
            item_id: row.get(1).unwrap_or_default(),
            warehouse_id: row.get(2).unwrap_or_default(),
            min_qty: row.get(3).unwrap_or(0.0),
            reorder_qty: row.get(4).unwrap_or(0.0),
            is_active: row.get(5).unwrap_or(1),
        }))
    } else {
        Ok(None)
    }
}

/// Delete a reorder rule.
#[tauri::command]
pub async fn shop_delete_reorder_rule(
    item_id: String,
    warehouse_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM shop_reorder_rules WHERE (profile_id = ? OR profile_id = '' OR profile_id IS NULL) AND item_id = ? AND (warehouse_id = ? OR warehouse_id = '' OR warehouse_id IS NULL)",
        crate::turso_params![profile_id, item_id, warehouse_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Set (upsert) a reorder rule for an item + warehouse.
#[tauri::command]
pub async fn shop_set_reorder_rule(
    data: ReorderRuleData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    if data.item_id.trim().is_empty() {
        return Err("Item ID is required".to_string());
    }

    let warehouse_id = match data.warehouse_id {
        Some(ref w) if !w.trim().is_empty() => w.trim().to_string(),
        _ => get_default_warehouse(&conn, &profile_id)
            .await
            .unwrap_or_else(|| format!("{}_main", profile_id)),
    };

    // Ensure warehouse exists in shop_warehouses so joins don't fail
    let wh_exists: bool = {
        let mut r = conn.query(
            "SELECT 1 FROM shop_warehouses WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![warehouse_id.clone(), profile_id.clone()],
        ).await.map_err(|e| e.to_string())?;
        r.next().await.map_err(|e| e.to_string())?.is_some()
    };

    if !wh_exists {
        let _ = conn.execute(
            "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) \
             VALUES (?, ?, 'Main Warehouse', 'store', 1, 1) \
             ON CONFLICT(id) DO UPDATE SET is_active = 1",
            crate::turso_params![warehouse_id.clone(), profile_id.clone()],
        ).await;
    }

    // Auto-enable track_inventory on this item
    let _ = conn.execute(
        "UPDATE shop_items SET track_inventory = 1 WHERE id = ?",
        crate::turso_params![data.item_id.clone()],
    ).await;

    // Check if an existing rule row exists for this item and warehouse
    let existing_id: Option<String> = {
        let mut r = conn.query(
            "SELECT id FROM shop_reorder_rules WHERE item_id = ? AND (warehouse_id = ? OR warehouse_id = '' OR warehouse_id IS NULL) LIMIT 1",
            crate::turso_params![data.item_id.clone(), warehouse_id.clone()],
        ).await.map_err(|e| e.to_string())?;
        if let Ok(Some(row)) = r.next().await {
            while r.next().await.map(|r| r.is_some()).unwrap_or(false) {}
            row.get::<String>(0).ok()
        } else {
            None
        }
    };

    if let Some(eid) = existing_id {
        conn.execute(
            "UPDATE shop_reorder_rules \
             SET profile_id = ?, warehouse_id = ?, min_qty = ?, reorder_qty = ?, is_active = 1 \
             WHERE id = ?",
            crate::turso_params![
                profile_id,
                warehouse_id,
                data.min_qty,
                data.reorder_qty,
                eid,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        let rule_id = new_id("rr");
        conn.execute(
            "INSERT INTO shop_reorder_rules \
             (id, profile_id, item_id, warehouse_id, min_qty, reorder_qty, is_active) \
             VALUES (?, ?, ?, ?, ?, ?, 1)",
            crate::turso_params![
                rule_id,
                profile_id,
                data.item_id,
                warehouse_id,
                data.min_qty,
                data.reorder_qty,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Find an item by barcode — used by POS scanner.
#[tauri::command]
pub async fn shop_find_item_by_barcode(
    barcode: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<FoundItem>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT i.id, i.name, i.price, i.sku, b.barcode \
         FROM shop_barcodes b \
         JOIN shop_items i ON i.id = b.item_id \
         WHERE b.profile_id = ? AND b.barcode = ? AND i.is_active = 1 LIMIT 1",
            crate::turso_params![profile_id, barcode],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(Some(FoundItem {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            price: row.get(2).unwrap_or(0.0),
            sku: row.get(3).ok(),
            barcode: row.get(4).unwrap_or_default(),
        }))
    } else {
        Ok(None)
    }
}

// ── Stock Ledger History ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub id: String,
    pub item_id: String,
    pub item_name: String,
    pub sku: Option<String>,
    pub warehouse_id: String,
    pub warehouse_name: String,
    pub movement_type: String, // purchase | sale | adjustment | transfer_in | transfer_out | opening
    pub qty_in: f64,
    pub qty_out: f64,
    pub unit_cost: f64,
    pub total_cost: f64, // qty_in * unit_cost (or qty_out * unit_cost)
    pub balance_after: f64,
    pub notes: Option<String>,
    pub document_id: Option<String>,
    pub created_at: i64, // unix timestamp (seconds)
}

/// Return the stock ledger for the active profile.
/// Optional filters: item_id, warehouse_id.
/// limit defaults to 80, max 500. offset for pagination (load more).
/// Ordered newest-first.
#[tauri::command]
pub async fn shop_get_stock_ledger(
    item_id: Option<String>,
    warehouse_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LedgerEntry>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(80).min(500);
    let off = offset.unwrap_or(0).max(0);

    // Build dynamic WHERE clause (profile is always required)
    let (extra_filter, params_extra): (String, Vec<crate::db::turso::TursoParam>) = match (&item_id, &warehouse_id)
    {
        (Some(iid), Some(wid)) => (
            " AND l.item_id = ? AND l.warehouse_id = ?".into(),
            vec![
                crate::db::turso::TursoParam::Text(iid.clone()),
                crate::db::turso::TursoParam::Text(wid.clone()),
            ],
        ),
        (Some(iid), None) => (
            " AND l.item_id = ?".into(),
            vec![crate::db::turso::TursoParam::Text(iid.clone())],
        ),
        (None, Some(wid)) => (
            " AND l.warehouse_id = ?".into(),
            vec![crate::db::turso::TursoParam::Text(wid.clone())],
        ),
        (None, None) => ("".into(), vec![]),
    };

    let sql = format!(
        "SELECT l.id, l.item_id, \
                COALESCE(CASE WHEN v.id IS NOT NULL THEN (pi.name || ' - ' || v.name) ELSE NULL END, i.name, v.name, l.item_id), \
                COALESCE(v.sku, i.sku), \
                l.warehouse_id, \
                COALESCE(w.name, l.warehouse_id), \
                l.movement_type, l.qty_in, l.qty_out, l.unit_cost, l.balance_after, \
                l.notes, l.document_id, l.created_at \
         FROM shop_stock_ledger l \
         LEFT JOIN shop_items i ON i.id = l.item_id \
         LEFT JOIN shop_item_variants v ON v.id = l.item_id \
         LEFT JOIN shop_items pi ON pi.id = v.item_id \
         LEFT JOIN shop_warehouses w ON w.id = l.warehouse_id \
         WHERE l.profile_id = ?{} \
         ORDER BY l.created_at DESC \
         LIMIT {} OFFSET {}",
        extra_filter, lim, off
    );

    // Build params: start with profile_id, append any extras
    let mut all_params: Vec<crate::db::turso::TursoParam> = vec![crate::db::turso::TursoParam::Text(profile_id)];
    all_params.extend(params_extra);

    let mut rows = conn
        .query(&sql, all_params)
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let qty_in: f64 = row.get(7).unwrap_or(0.0);
        let qty_out: f64 = row.get(8).unwrap_or(0.0);
        let unit_cost: f64 = row.get(9).unwrap_or(0.0);
        let total_cost = (qty_in + qty_out) * unit_cost;
        entries.push(LedgerEntry {
            id: row.get(0).unwrap_or_default(),
            item_id: row.get(1).unwrap_or_default(),
            item_name: row.get(2).unwrap_or_default(),
            sku: row.get(3).ok(),
            warehouse_id: row.get(4).unwrap_or_default(),
            warehouse_name: row.get(5).unwrap_or_default(),
            movement_type: row.get(6).unwrap_or_else(|_| "unknown".into()),
            qty_in,
            qty_out,
            unit_cost,
            total_cost,
            balance_after: row.get(10).unwrap_or(0.0),
            notes: row.get(11).ok(),
            document_id: row.get(12).ok(),
            created_at: row.get(13).unwrap_or(0),
        });
    }
    Ok(entries)
}

// ── Goods Receipts / Purchases ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoodsReceiptSummary {
    pub id: String,
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub creator_name: Option<String>,
    pub updater_name: Option<String>,
    pub staff_id: Option<String>,
    pub staff_name: Option<String>,
    pub doc_number: String,
    pub ref_number: Option<String>,
    pub doc_date: i64,
    pub vendor_bill_date: Option<i64>,
    pub status: String,
    pub subtotal: f64,
    pub cash_discount_pct: f64,
    pub cash_discount_amt: f64,
    pub inward_expense: f64,
    pub grand_total: f64,
    pub amount_paid: f64,
    pub amount_due: f64,
    pub payment_method: Option<String>,
    pub warehouse_id: Option<String>,
    pub warehouse_name: Option<String>,
    pub vendor_id: Option<String>,
    pub vendor_name: Option<String>,
    pub vendor_phone: Option<String>,
    pub vendor_email: Option<String>,
    pub vendor_gstin: Option<String>,
    pub vendor_pan: Option<String>,
    pub vendor_address: Option<String>,
    pub vendor_city: Option<String>,
    pub vendor_state: Option<String>,
    pub vendor_country: Option<String>,
    pub vendor_dl_no: Option<String>,
    pub line_count: i64,
    pub total_qty: f64,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub is_modified: Option<bool>,
    pub modified_at: Option<i64>,
    pub modified_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoodsReceiptDetail {
    #[serde(flatten)]
    pub summary: GoodsReceiptSummary,
    pub transaction_id: Option<String>,
    pub transporter_name: Option<String>,
    pub lr_number: Option<String>,
    pub vehicle_number: Option<String>,
    pub media_id: Option<String>,
    pub lines: Vec<GoodsReceiptLineDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoodsReceiptLineDetail {
    pub id: String,
    pub item_id: String,
    pub item_name: String,
    pub qty: f64,
    pub free_qty: Option<f64>,
    pub cost: Option<f64>,
    pub unit_price: Option<f64>,
    pub mrp: Option<f64>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub batch_no: Option<String>,
    pub expiry_date: Option<i64>,
    pub shelf_location: Option<String>,
    pub pricing_snapshot: Option<String>,
    pub line_total: f64,
    pub hsn_sac_code: Option<String>,
    pub brand_name: Option<String>,
    pub line_meta: Option<String>,
    pub tax_rate_id: Option<String>,
    pub tax_rate_pct: Option<f64>,
    pub discount_pct: Option<f64>,
    pub discount_amt: Option<f64>,
    pub tax_amount: Option<f64>,
}

/// List goods receipt / purchase entry documents.
#[tauri::command]
pub async fn shop_list_goods_receipts(
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<GoodsReceiptSummary>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(50);
    let off = offset.unwrap_or(0);

    let mut rows = conn
        .query(
            "SELECT d.id, d.doc_number, d.ref_number, d.doc_date, d.vendor_bill_date, d.status, \
             COALESCE(d.subtotal, 0.0), COALESCE(d.cash_discount_pct, 0.0), COALESCE(d.cash_discount_amt, 0.0), \
             COALESCE(d.inward_expense, 0.0), COALESCE(d.grand_total, 0.0), COALESCE(d.amount_paid, 0.0), \
             COALESCE(d.amount_due, 0.0), d.payment_method, d.warehouse_id, \
             COALESCE(w.name, 'Main Warehouse') as warehouse_name, \
             d.vendor_id, \
             COALESCE(v.name, CASE WHEN d.notes LIKE 'Vendor: %' THEN SUBSTR(d.notes, 9) ELSE NULL END) as vendor_name, \
             v.phone as vendor_phone, v.email as vendor_email, v.gstin as vendor_gstin, v.pan as vendor_pan, \
             v.address as vendor_address, v.city as vendor_city, v.state as vendor_state, v.country as vendor_country, v.dl_no as vendor_dl_no, \
             (SELECT COUNT(*) FROM shop_document_lines WHERE document_id = d.id) as line_count, \
             (SELECT COALESCE(SUM(qty + COALESCE(free_qty, 0)), 0.0) FROM shop_document_lines WHERE document_id = d.id) as total_qty, \
             d.notes, d.created_at, d.updated_at, d.user_id, d.updated_by, d.staff_id, \
             COALESCE((SELECT name FROM shop_staff WHERE id = d.staff_id), NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, (SELECT name FROM shop_staff WHERE id = d.user_id)) as creator_name, \
             COALESCE((SELECT name FROM shop_staff WHERE id = d.modified_by), NULLIF(TRIM(COALESCE(um.first_name, '') || ' ' || COALESCE(um.last_name, '')), ''), um.username, um.email, (SELECT name FROM shop_staff WHERE id = d.updated_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email, (SELECT name FROM shop_staff WHERE id = d.staff_id)) as updater_name, \
             (SELECT name FROM shop_staff WHERE id = d.staff_id) as staff_name, \
             CASE WHEN COALESCE(d.is_modified, 0) = 1 OR json_extract(d.meta, '$.is_modified') = 1 OR d.notes LIKE '%Modified%' THEN 1 ELSE 0 END as is_modified, \
             COALESCE(d.modified_at, json_extract(d.meta, '$.modified_at')) as modified_at, \
             d.modified_by \
             FROM shop_documents d \
             LEFT JOIN shop_warehouses w ON w.id = d.warehouse_id \
             LEFT JOIN shop_vendors v ON v.id = d.vendor_id \
             LEFT JOIN users uc ON uc.id = d.user_id \
             LEFT JOIN users uu ON uu.id = d.updated_by \
             LEFT JOIN users um ON um.id = d.modified_by \
             WHERE d.profile_id = ? AND d.doc_type = 'goods_receipt' \
             ORDER BY d.created_at DESC LIMIT ? OFFSET ?",
            crate::turso_params![profile_id, lim, off],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(GoodsReceiptSummary {
            id: row.get(0).unwrap_or_default(),
            doc_number: row.get(1).unwrap_or_default(),
            ref_number: row.get(2).ok(),
            doc_date: row.get(3).unwrap_or(0),
            vendor_bill_date: row.get(4).ok(),
            status: row.get(5).unwrap_or_else(|_| "confirmed".into()),
            subtotal: row.get(6).unwrap_or(0.0),
            cash_discount_pct: row.get(7).unwrap_or(0.0),
            cash_discount_amt: row.get(8).unwrap_or(0.0),
            inward_expense: row.get(9).unwrap_or(0.0),
            grand_total: row.get(10).unwrap_or(0.0),
            amount_paid: row.get(11).unwrap_or(0.0),
            amount_due: row.get(12).unwrap_or(0.0),
            payment_method: row.get(13).ok(),
            warehouse_id: row.get(14).ok(),
            warehouse_name: row.get(15).ok(),
            vendor_id: row.get(16).ok(),
            vendor_name: row.get(17).ok(),
            vendor_phone: row.get(18).ok(),
            vendor_email: row.get(19).ok(),
            vendor_gstin: row.get(20).ok(),
            vendor_pan: row.get(21).ok(),
            vendor_address: row.get(22).ok(),
            vendor_city: row.get(23).ok(),
            vendor_state: row.get(24).ok(),
            vendor_country: row.get(25).ok(),
            vendor_dl_no: row.get(26).ok(),
            line_count: row.get(27).unwrap_or(0),
            total_qty: row.get(28).unwrap_or(0.0),
            notes: row.get(29).ok(),
            created_at: row.get(30).unwrap_or(0),
            updated_at: row.get(31).ok(),
            user_id: row.get(32).ok(),
            updated_by: row.get(33).ok(),
            staff_id: row.get(34).ok(),
            creator_name: row.get(35).ok(),
            updater_name: row.get(36).ok(),
            staff_name: row.get(37).ok(),
            is_modified: row.get::<i64>(38).map(|v| v == 1).ok(),
            modified_at: row.get::<i64>(39).ok(),
            modified_by: row.get::<String>(40).ok(),
        });
    }

    Ok(list)
}

/// Get a single goods receipt / purchase entry with all lines (including pricing_snapshot).
#[tauri::command]
pub async fn shop_get_goods_receipt(
    doc_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<GoodsReceiptDetail, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut doc_rows = conn
        .query(
            "SELECT d.id, d.doc_number, d.ref_number, d.doc_date, d.vendor_bill_date, d.status, \
             COALESCE(d.subtotal, 0.0), COALESCE(d.cash_discount_pct, 0.0), COALESCE(d.cash_discount_amt, 0.0), \
             COALESCE(d.inward_expense, 0.0), COALESCE(d.grand_total, 0.0), COALESCE(d.amount_paid, 0.0), \
             COALESCE(d.amount_due, 0.0), d.payment_method, d.warehouse_id, \
             COALESCE(w.name, 'Main Warehouse') as warehouse_name, \
             d.vendor_id, \
             COALESCE(v.name, CASE WHEN d.notes LIKE 'Vendor: %' THEN SUBSTR(d.notes, 9) ELSE NULL END) as vendor_name, \
             v.phone as vendor_phone, v.email as vendor_email, v.gstin as vendor_gstin, v.pan as vendor_pan, \
             v.address as vendor_address, v.city as vendor_city, v.state as vendor_state, v.country as vendor_country, v.dl_no as vendor_dl_no, \
             (SELECT COUNT(*) FROM shop_document_lines WHERE document_id = d.id) as line_count, \
             (SELECT COALESCE(SUM(qty + COALESCE(free_qty, 0)), 0.0) FROM shop_document_lines WHERE document_id = d.id) as total_qty, \
             d.notes, d.created_at, d.updated_at, d.user_id, d.updated_by, d.staff_id, \
             COALESCE((SELECT name FROM shop_staff WHERE id = d.staff_id), NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, (SELECT name FROM shop_staff WHERE id = d.user_id)) as creator_name, \
             COALESCE((SELECT name FROM shop_staff WHERE id = d.modified_by), NULLIF(TRIM(COALESCE(um.first_name, '') || ' ' || COALESCE(um.last_name, '')), ''), um.username, um.email, (SELECT name FROM shop_staff WHERE id = d.updated_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email, (SELECT name FROM shop_staff WHERE id = d.staff_id)) as updater_name, \
             (SELECT name FROM shop_staff WHERE id = d.staff_id) as staff_name, \
             CASE WHEN COALESCE(d.is_modified, 0) = 1 OR json_extract(d.meta, '$.is_modified') = 1 OR d.notes LIKE '%Modified%' THEN 1 ELSE 0 END as is_modified, \
             COALESCE(d.modified_at, json_extract(d.meta, '$.modified_at')) as modified_at, \
             d.modified_by, \
             d.transaction_id, d.transporter_name, d.lr_number, d.vehicle_number, d.media_id \
             FROM shop_documents d \
             LEFT JOIN shop_warehouses w ON w.id = d.warehouse_id \
             LEFT JOIN shop_vendors v ON v.id = d.vendor_id \
             LEFT JOIN users uc ON uc.id = d.user_id \
             LEFT JOIN users uu ON uu.id = d.updated_by \
             LEFT JOIN users um ON um.id = d.modified_by \
             WHERE d.id = ? AND d.profile_id = ? AND d.doc_type = 'goods_receipt'",
            crate::turso_params![doc_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let summary = if let Ok(Some(row)) = doc_rows.next().await {
        GoodsReceiptDetail {
            summary: GoodsReceiptSummary {
                id: row.get(0).unwrap_or_default(),
                doc_number: row.get(1).unwrap_or_default(),
                ref_number: row.get(2).ok(),
                doc_date: row.get(3).unwrap_or(0),
                vendor_bill_date: row.get(4).ok(),
                status: row.get(5).unwrap_or_else(|_| "confirmed".into()),
                subtotal: row.get(6).unwrap_or(0.0),
                cash_discount_pct: row.get(7).unwrap_or(0.0),
                cash_discount_amt: row.get(8).unwrap_or(0.0),
                inward_expense: row.get(9).unwrap_or(0.0),
                grand_total: row.get(10).unwrap_or(0.0),
                amount_paid: row.get(11).unwrap_or(0.0),
                amount_due: row.get(12).unwrap_or(0.0),
                payment_method: row.get(13).ok(),
                warehouse_id: row.get(14).ok(),
                warehouse_name: row.get(15).ok(),
                vendor_id: row.get(16).ok(),
                vendor_name: row.get(17).ok(),
                vendor_phone: row.get(18).ok(),
                vendor_email: row.get(19).ok(),
                vendor_gstin: row.get(20).ok(),
                vendor_pan: row.get(21).ok(),
                vendor_address: row.get(22).ok(),
                vendor_city: row.get(23).ok(),
                vendor_state: row.get(24).ok(),
                vendor_country: row.get(25).ok(),
                vendor_dl_no: row.get(26).ok(),
                line_count: row.get(27).unwrap_or(0),
                total_qty: row.get(28).unwrap_or(0.0),
                notes: row.get(29).ok(),
                created_at: row.get(30).unwrap_or(0),
                updated_at: row.get(31).ok(),
                user_id: row.get(32).ok(),
                updated_by: row.get(33).ok(),
                staff_id: row.get(34).ok(),
                creator_name: row.get(35).ok(),
                updater_name: row.get(36).ok(),
                staff_name: row.get(37).ok(),
                is_modified: row.get::<i64>(38).map(|v| v == 1).ok(),
                modified_at: row.get::<i64>(39).ok(),
                modified_by: row.get::<String>(40).ok(),
            },
            transaction_id: row.get(41).ok(),
            transporter_name: row.get(42).ok(),
            lr_number: row.get(43).ok(),
            vehicle_number: row.get(44).ok(),
            media_id: row.get(45).ok(),
            lines: Vec::new(),
        }
    } else {
        return Err("Goods receipt not found".to_string());
    };

    let mut line_rows = conn
        .query(
            "SELECT l.id, l.item_id, COALESCE(l.description, i.name, '') as item_name, \
             l.qty, l.free_qty, l.unit_cost, i.price as unit_price, l.mrp, \
             l.pack_size, l.conversion_factor, l.scheme_on, l.scheme_free, \
             b.batch_no, b.expiry_date, b.shelf_location, l.pricing_snapshot, l.line_total, \
             COALESCE(l.hsn_sac_code, i.hsn_sac_code) as resolved_hsn, \
             sb.name as resolved_brand_name, \
             l.line_meta, \
             l.tax_rate_id, l.tax_rate_pct, l.discount_pct, l.discount_amt, l.tax_amount \
             FROM shop_document_lines l \
             LEFT JOIN shop_items i ON i.id = l.item_id \
             LEFT JOIN shop_item_batches b ON b.id = l.batch_id \
             LEFT JOIN shop_brands sb ON sb.id = i.brand_id \
             WHERE l.document_id = ? \
             ORDER BY l.created_at ASC",
            crate::turso_params![doc_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut lines = Vec::new();
    while let Ok(Some(row)) = line_rows.next().await {
        lines.push(GoodsReceiptLineDetail {
            id: row.get(0).unwrap_or_default(),
            item_id: row.get(1).unwrap_or_default(),
            item_name: row.get(2).unwrap_or_default(),
            qty: row.get(3).unwrap_or(0.0),
            free_qty: row.get(4).ok(),
            cost: row.get(5).ok(),
            unit_price: row.get(6).ok(),
            mrp: row.get(7).ok(),
            pack_size: row.get(8).ok(),
            conversion_factor: row.get(9).ok(),
            scheme_on: row.get(10).ok(),
            scheme_free: row.get(11).ok(),
            batch_no: row.get(12).ok(),
            expiry_date: row.get(13).ok(),
            shelf_location: row.get(14).ok(),
            pricing_snapshot: row.get(15).ok(),
            line_total: row.get(16).unwrap_or(0.0),
            hsn_sac_code: row.get(17).ok(),
            brand_name: row.get(18).ok(),
            line_meta: row.get(19).ok(),
            tax_rate_id: row.get(20).ok(),
            tax_rate_pct: row.get(21).ok(),
            discount_pct: row.get(22).ok(),
            discount_amt: row.get(23).ok(),
            tax_amount: row.get(24).ok(),
        });
    }

    let mut result = summary;
    result.lines = lines;
    Ok(result)
}

/// Updates an existing goods_receipt document, rolls back and reapplies stock ledger & batches.
#[tauri::command]
pub async fn shop_update_receive_stock(
    doc_id: String,
    data: ReceiveStockData,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    if data.lines.is_empty() {
        return Err("No items in receipt".into());
    }

    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Step 1: Verify doc exists
    let existing_doc_opt: Option<(String, Option<String>)> = {
        let mut rows = conn
            .query(
                "SELECT id, warehouse_id FROM shop_documents WHERE id = ? AND profile_id = ? AND doc_type = 'goods_receipt'",
                crate::turso_params![doc_id.clone(), profile_id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        if let Ok(Some(row)) = rows.next().await {
            Some((row.get(0).unwrap_or_default(), row.get(1).ok()))
        } else {
            None
        }
    };

    let (_existing_id, existing_wh) = existing_doc_opt.ok_or_else(|| "Goods receipt not found".to_string())?;

    let warehouse_id = match data.warehouse_id {
        Some(w) if !w.is_empty() => w,
        _ => existing_wh.unwrap_or_else(|| "".to_string()),
    };
    let warehouse_id = if warehouse_id.is_empty() {
        get_default_warehouse(&conn, &profile_id)
            .await
            .ok_or_else(|| "No warehouse found.".to_string())?
    } else {
        warehouse_id
    };

    // Step 2: Capture previous lines for audit delta tracking
    #[derive(Clone, Default)]
    struct PrevGrLineSnapshot {
        qty: f64,
        free_qty: f64,
        cost: f64,
        batch_no: Option<String>,
    }

    let mut prev_gr_lines: std::collections::HashMap<String, PrevGrLineSnapshot> = std::collections::HashMap::new();
    let mut prev_grand_total: f64 = 0.0;
    if let Ok(mut doc_r) = conn
        .query(
            "SELECT grand_total FROM shop_documents WHERE id = ? AND profile_id = ?",
            crate::turso_params![doc_id.clone(), profile_id.clone()],
        )
        .await
    {
        if let Ok(Some(row)) = doc_r.next().await {
            prev_grand_total = row.get(0).unwrap_or(0.0);
        }
    }
    if let Ok(mut prev_rows) = conn
        .query(
            "SELECT l.item_id, l.qty, COALESCE(l.free_qty, 0.0), COALESCE(l.unit_cost, 0.0), \
                    (SELECT batch_no FROM shop_item_batches WHERE id = l.batch_id LIMIT 1) \
             FROM shop_document_lines l WHERE l.document_id = ? AND l.profile_id = ?",
            crate::turso_params![doc_id.clone(), profile_id.clone()],
        )
        .await
    {
        while let Ok(Some(row)) = prev_rows.next().await {
            let i_id: String = row.get(0).unwrap_or_default();
            let q: f64 = row.get(1).unwrap_or(0.0);
            let f: f64 = row.get(2).unwrap_or(0.0);
            let c: f64 = row.get(3).unwrap_or(0.0);
            let b: Option<String> = row.get(4).ok();
            prev_gr_lines.insert(i_id, PrevGrLineSnapshot {
                qty: q,
                free_qty: f,
                cost: c,
                batch_no: b,
            });
        }
    }

    // Step 2.5: Delete old ledger entries for this doc_id
    let _ = conn
        .execute(
            "DELETE FROM shop_stock_ledger WHERE profile_id = ? AND document_id = ?",
            crate::turso_params![profile_id.clone(), doc_id.clone()],
        )
        .await;

    // Delete old batches linked to this document
    let _ = conn
        .execute(
            "DELETE FROM shop_item_batches WHERE id IN (SELECT batch_id FROM shop_document_lines WHERE document_id = ? AND batch_id IS NOT NULL)",
            crate::turso_params![doc_id.clone()],
        )
        .await;

    // Delete old document lines
    let _ = conn
        .execute(
            "DELETE FROM shop_document_lines WHERE document_id = ?",
            crate::turso_params![doc_id.clone()],
        )
        .await;

    // Delete old document payments
    let _ = conn
        .execute(
            "DELETE FROM shop_document_payments WHERE document_id = ?",
            crate::turso_params![doc_id.clone()],
        )
        .await;

    // Step 3: Calculate new totals
    let mut subtotal: f64 = 0.0;
    for line in &data.lines {
        let cost = line.cost.unwrap_or(0.0);
        subtotal += line.qty * cost;
    }
    let cd_amt = data.cash_discount_amt.unwrap_or_else(|| {
        if let Some(cd_pct) = data.cash_discount_pct {
            (subtotal * cd_pct) / 100.0
        } else {
            0.0
        }
    });
    let inward_exp = data.inward_expense.unwrap_or(0.0);
    let grand_total = (subtotal - cd_amt + inward_exp).max(0.0);
    let paid_amt = data.amount_paid.unwrap_or(0.0);
    let due_amt = (grand_total - paid_amt).max(0.0);
    let doc_status = if grand_total > 0.0 && paid_amt >= grand_total {
        "paid"
    } else if paid_amt > 0.0 {
        "partial"
    } else {
        "confirmed"
    };

    let notes = data
        .vendor_name
        .as_ref()
        .map(|v| format!("Vendor: {}", v))
        .or_else(|| data.notes.clone());

    let active_uid = state.get_current_user_id().await;
    let staff_id = data.staff_id.clone();

    // Step 4: Update document header
    let active_uid_opt = if active_uid.trim().is_empty() { None } else { Some(active_uid.clone()) };
    let modifier_uid = staff_id.clone().or_else(|| active_uid_opt.clone());
    let updated_by = modifier_uid.clone().unwrap_or_else(|| active_uid.clone());
    let mut has_gr_changes = false;
    if !prev_gr_lines.is_empty() {
        if (grand_total - prev_grand_total).abs() > 0.005 {
            has_gr_changes = true;
        } else if data.lines.len() != prev_gr_lines.len() {
            has_gr_changes = true;
        } else {
            for l in &data.lines {
                let cost = l.cost.unwrap_or(0.0);
                let free = l.free_qty.unwrap_or(0.0);
                if let Some(prev) = prev_gr_lines.get(&l.item_id) {
                    if (l.qty - prev.qty).abs() > 0.001
                        || (free - prev.free_qty).abs() > 0.001
                        || (cost - prev.cost).abs() > 0.005
                    {
                        has_gr_changes = true;
                        break;
                    }
                    if let Some(ref prev_b) = prev.batch_no {
                        if let Some(ref new_b) = l.batch_no {
                            if prev_b.trim() != new_b.trim() && !prev_b.trim().is_empty() {
                                has_gr_changes = true;
                                break;
                            }
                        }
                    }
                } else {
                    has_gr_changes = true;
                    break;
                }
            }
        }
    }

    let is_mod_val = if has_gr_changes { 1 } else { 0 };

    conn.execute(
        "UPDATE shop_documents SET \
         ref_number = ?, vendor_bill_date = ?, transaction_id = ?, payment_method = ?, media_id = ?, \
         warehouse_id = ?, status = ?, vendor_id = ?, \
         subtotal = ?, discount_amt = 0, cash_discount_pct = ?, cash_discount_amt = ?, inward_expense = ?, \
         taxable_amt = ?, grand_total = ?, amount_paid = ?, amount_due = ?, \
         transporter_name = ?, lr_number = ?, vehicle_number = ?, notes = ?, \
         updated_by = ?, staff_id = ?, \
         is_modified = CASE WHEN ? = 1 THEN 1 ELSE is_modified END, \
         modified_at = CASE WHEN ? = 1 THEN strftime('%s','now') ELSE modified_at END, \
         modified_by = CASE WHEN ? = 1 THEN ? ELSE modified_by END, \
         meta = CASE WHEN ? = 1 THEN json_set(COALESCE(NULLIF(meta, ''), '{}'), '$.is_modified', 1, '$.modified_at', strftime('%s','now'), '$.modified_by', ?) ELSE meta END, \
         updated_at = strftime('%s','now') \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.ref_number,
            data.vendor_bill_date,
            data.transaction_id.clone(),
            data.payment_method.clone(),
            data.media_id,
            warehouse_id.clone(),
            doc_status,
            data.vendor_id.clone(),
            subtotal,
            data.cash_discount_pct.unwrap_or(0.0),
            cd_amt,
            inward_exp,
            subtotal,
            grand_total,
            paid_amt,
            due_amt,
            data.transporter_name,
            data.lr_number,
            data.vehicle_number,
            notes.unwrap_or_default(),
            updated_by,
            staff_id,
            is_mod_val,
            is_mod_val,
            is_mod_val,
            modifier_uid.clone(),
            is_mod_val,
            modifier_uid.unwrap_or_default(),
            doc_id.clone(),
            profile_id.clone()
        ],
    ).await.map_err(|e| format!("update doc: {}", e))?;

    // Step 5: Record payment if any
    if paid_amt > 0.0 {
        let pay_id = new_id("pay");
        let pay_mode = data.payment_method.unwrap_or_else(|| "cash".to_string());
        conn.execute(
            "INSERT INTO shop_document_payments \
             (id, profile_id, document_id, amount, payment_mode, reference) \
             VALUES (?, ?, ?, ?, ?, ?)",
            crate::turso_params![
                pay_id,
                profile_id.clone(),
                doc_id.clone(),
                paid_amt,
                pay_mode,
                data.transaction_id
            ],
        )
        .await
        .ok();
    }

    // Step 6: Re-insert ledger rows, batches, and document lines
    for line in &data.lines {
        let free = line.free_qty.unwrap_or(0.0);
        let total_in = line.qty + free;
        let balance = get_balance(&conn, &line.item_id, &warehouse_id).await;
        let new_balance = balance + total_in;
        let ledger_id = new_id("sl");
        let cost = line.cost.unwrap_or(0.0);

        let landing_cost = line.landing_cost.unwrap_or_else(|| {
            if total_in > 0.0 {
                (line.qty * cost) / total_in
            } else {
                cost
            }
        });

        conn.execute(
            "INSERT INTO shop_stock_ledger \
             (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, \
              balance_after, unit_cost, document_id) \
             VALUES (?, ?, ?, ?, 'purchase', ?, 0, ?, ?, ?)",
            crate::turso_params![
                ledger_id,
                profile_id.clone(),
                line.item_id.clone(),
                warehouse_id.clone(),
                total_in,
                new_balance,
                landing_cost,
                doc_id.clone()
            ],
        )
        .await
        .map_err(|e| format!("insert ledger: {}", e))?;

        let mut batch_id_opt: Option<String> = None;
        if let Some(ref batch_no) = line.batch_no {
            let b_trimmed = batch_no.trim();
            if !b_trimmed.is_empty() {
                let batch_id = new_id("batch");
                conn.execute(
                    "INSERT INTO shop_item_batches \
                     (id, profile_id, item_id, batch_no, expiry_date, qty_received, qty_remaining, \
                      purchase_price, mrp, landing_cost, pack_size, conversion_factor, warehouse_id, shelf_location, is_active) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
                    crate::turso_params![
                        batch_id.clone(),
                        profile_id.clone(),
                        line.item_id.clone(),
                        b_trimmed.to_string(),
                        line.expiry_date,
                        total_in,
                        total_in,
                        cost,
                        line.mrp.unwrap_or(0.0),
                        landing_cost,
                        line.pack_size.clone(),
                        line.conversion_factor.unwrap_or(1.0),
                        warehouse_id.clone(),
                        line.shelf_location.clone()
                    ],
                )
                .await
                .ok();
                batch_id_opt = Some(batch_id);
            }
        }

        let doc_line_id = new_id("docl");
        let line_total = line.qty * cost;

        let line_meta_str = {
            let mut meta_val = serde_json::json!({});
            if let Some(prev) = prev_gr_lines.get(&line.item_id) {
                meta_val["original_qty"] = serde_json::json!(prev.qty);
                if (line.qty - prev.qty).abs() > 0.001 {
                    meta_val["new_qty"] = serde_json::json!(line.qty);
                    meta_val["qty_diff"] = serde_json::json!(line.qty - prev.qty);
                    if line.qty > prev.qty {
                        meta_val["increased_qty"] = serde_json::json!(line.qty - prev.qty);
                    } else if line.qty < prev.qty {
                        meta_val["reduced_qty"] = serde_json::json!(prev.qty - line.qty);
                    }
                }
                if (cost - prev.cost).abs() > 0.005 {
                    meta_val["original_cost"] = serde_json::json!(prev.cost);
                    meta_val["new_cost"] = serde_json::json!(cost);
                    meta_val["cost_diff"] = serde_json::json!(cost - prev.cost);
                }
                if (free - prev.free_qty).abs() > 0.001 {
                    meta_val["original_free_qty"] = serde_json::json!(prev.free_qty);
                    meta_val["new_free_qty"] = serde_json::json!(free);
                }
                if let Some(ref prev_b) = prev.batch_no {
                    if let Some(ref new_b) = line.batch_no {
                        if prev_b.trim() != new_b.trim() && !prev_b.trim().is_empty() {
                            meta_val["original_batch_no"] = serde_json::json!(prev_b);
                            meta_val["new_batch_no"] = serde_json::json!(new_b);
                        }
                    }
                }
            } else if !prev_gr_lines.is_empty() {
                meta_val["is_added"] = serde_json::json!(true);
                meta_val["original_qty"] = serde_json::json!(0.0);
            }
            if meta_val.as_object().map_or(false, |o| !o.is_empty()) {
                Some(serde_json::to_string(&meta_val).unwrap_or_default())
            } else {
                None
            }
        };

        let _ = conn.execute(
            "INSERT INTO shop_document_lines \
             (id, profile_id, document_id, item_id, description, batch_id, qty, free_qty, unit_cost, landing_cost, mrp, \
              pack_size, conversion_factor, scheme_on, scheme_free, line_total, pricing_snapshot, line_meta) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            crate::turso_params![
                doc_line_id,
                profile_id.clone(),
                doc_id.clone(),
                line.item_id.clone(),
                line.item_name.clone(),
                batch_id_opt,
                line.qty,
                free,
                cost,
                landing_cost,
                line.mrp.unwrap_or(0.0),
                line.pack_size.clone(),
                line.conversion_factor.unwrap_or(1.0),
                line.scheme_on.unwrap_or(0.0),
                line.scheme_free.unwrap_or(0.0),
                line_total,
                line.pricing_snapshot.clone(),
                line_meta_str
            ],
        ).await;

        if let Some(sp) = line.selling_price {
            if sp > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET price = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![sp, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
        if let Some(c) = line.cost {
            if c > 0.0 {
                conn.execute(
                    "UPDATE shop_items SET cost_price = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![c, line.item_id.clone(), profile_id.clone()],
                ).await.ok();
            }
        }
    }

    Ok(doc_id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct B2BHoldStats {
    pub units_on_hold: f64,
    pub pending_orders_count: i64,
    pub total_hold_value: f64,
}

/// Get aggregated B2B stock reservation stats (units on hold across pending online sales orders)
#[tauri::command]
pub async fn shop_get_b2b_hold_stats(
    state: State<'_, Arc<AppState>>,
) -> Result<B2BHoldStats, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT \
                COUNT(DISTINCT d.id) as pending_orders, \
                COALESCE(SUM(l.qty + COALESCE(l.free_qty, 0.0)), 0.0) as units_on_hold, \
                COALESCE((SELECT SUM(d2.grand_total) FROM shop_documents d2 \
                          WHERE d2.profile_id = ?1 \
                            AND (d2.doc_type IN ('sales_order', 'order') OR (d2.channel = 'online' AND d2.doc_type != 'invoice')) \
                            AND d2.status NOT IN ('invoiced', 'rejected', 'cancelled')), 0.0) as total_hold_value \
             FROM shop_documents d \
             LEFT JOIN shop_document_lines l ON l.document_id = d.id \
             WHERE d.profile_id = ?1 \
               AND (d.doc_type IN ('sales_order', 'order') OR (d.channel = 'online' AND d.doc_type != 'invoice')) \
               AND d.status NOT IN ('invoiced', 'rejected', 'cancelled')",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(B2BHoldStats {
            pending_orders_count: row.get(0).unwrap_or(0),
            units_on_hold: row.get(1).unwrap_or(0.0),
            total_hold_value: row.get(2).unwrap_or(0.0),
        })
    } else {
        Ok(B2BHoldStats {
            pending_orders_count: 0,
            units_on_hold: 0.0,
            total_hold_value: 0.0,
        })
    }
}
