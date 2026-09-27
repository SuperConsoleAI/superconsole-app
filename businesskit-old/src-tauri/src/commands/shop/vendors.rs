// src-tauri/src/commands/shop/vendors.rs
//
// Phase 3 — Know Your People: Vendors
//
// Commands:
//   shop_create_vendor      → save new vendor (+ crm_contacts row)
//   shop_list_vendors       → list all active vendors
//   shop_get_vendor_detail  → single vendor + purchase history
//   shop_update_vendor      → update vendor fields
//   shop_link_vendor_item   → link vendor to item with price (shop_vendor_items)
//   shop_list_vendors_for_item → which vendors supply an item

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("{}-{}", prefix, ts)
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vendor {
    pub id: String,
    pub contact_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub payment_terms: String,
    pub lead_time_days: i64,
    pub credit_used: f64,
    pub gst_compliance_rating: Option<i64>,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
    pub is_active: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VendorDetail {
    #[serde(flatten)]
    pub vendor: Vendor,
    pub supplied_items: Vec<VendorItem>,
    pub recent_receipts: Vec<RecentReceipt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VendorItem {
    pub item_id: String,
    pub item_name: String,
    pub purchase_price: f64,
    pub is_preferred: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentReceipt {
    pub id: String,
    pub doc_number: String,
    pub doc_date: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateVendorData {
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub payment_terms: Option<String>,
    pub gst_compliance_rating: Option<i64>,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateVendorData {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub payment_terms: Option<String>,
    pub gst_compliance_rating: Option<i64>,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LinkVendorItemData {
    pub vendor_id: String,
    pub item_id: String,
    pub purchase_price: f64,
    pub is_preferred: Option<bool>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create a new vendor.
#[tauri::command]
pub async fn shop_create_vendor(
    data: CreateVendorData,
    state: State<'_, Arc<AppState>>,
) -> Result<Vendor, String> {
    if data.name.trim().is_empty() {
        return Err("Name is required".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let contact_id = new_id("ctc");
    let vendor_id = new_id("vnd");
    let terms = data
        .payment_terms
        .as_deref()
        .unwrap_or("immediate")
        .to_string();

    // 1. crm_contacts row (best-effort)
    let _ = conn
        .execute(
            "INSERT OR IGNORE INTO crm_contacts \
         (id, profile_id, name, phone, email, contact_type) \
         VALUES (?, ?, ?, ?, ?, 'vendor')",
            crate::turso_params![
                contact_id.clone(),
                profile_id.clone(),
                data.name.trim().to_string(),
                data.phone.clone().unwrap_or_default(),
                data.email.clone().unwrap_or_default()
            ],
        )
        .await;

    // 2. shop_vendors
    conn.execute(
        "INSERT INTO shop_vendors \
         (id, profile_id, contact_id, name, phone, email, gstin, payment_terms, gst_compliance_rating, media_id, image_url, is_active) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        crate::turso_params![
            vendor_id.clone(),
            profile_id.clone(),
            contact_id,
            data.name.trim().to_string(),
            data.phone.clone().unwrap_or_default(),
            data.email.clone().unwrap_or_default(),
            data.gstin.clone().unwrap_or_default(),
            terms.clone(),
            data.gst_compliance_rating,
            data.media_id.clone(),
            data.image_url.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(Vendor {
        id: vendor_id,
        contact_id: None,
        name: data.name.trim().to_string(),
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
        payment_terms: terms,
        lead_time_days: 3,
        credit_used: 0.0,
        gst_compliance_rating: data.gst_compliance_rating,
        media_id: data.media_id,
        image_url: data.image_url,
        is_active: 1,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
    })
}

/// List all active vendors.
#[tauri::command]
pub async fn shop_list_vendors(state: State<'_, Arc<AppState>>) -> Result<Vec<Vendor>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, contact_id, name, phone, email, gstin, \
                payment_terms, lead_time_days, credit_used, gst_compliance_rating, is_active, created_at, \
                media_id, image_url \
         FROM shop_vendors \
         WHERE profile_id = ? AND is_active = 1 \
         ORDER BY name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(Vendor {
            id: row.get(0).unwrap_or_default(),
            contact_id: row.get(1).ok(),
            name: row.get(2).unwrap_or_default(),
            phone: row.get::<String>(3).ok().filter(|s| !s.is_empty()),
            email: row.get::<String>(4).ok().filter(|s| !s.is_empty()),
            gstin: row.get::<String>(5).ok().filter(|s| !s.is_empty()),
            payment_terms: row.get(6).unwrap_or_else(|_| "immediate".into()),
            lead_time_days: row.get(7).unwrap_or(3),
            credit_used: row.get(8).unwrap_or(0.0),
            gst_compliance_rating: row.get(9).ok(),
            media_id: row.get::<Option<String>>(12).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(13).ok().flatten().filter(|s| !s.is_empty()),
            is_active: row.get(10).unwrap_or(1),
            created_at: row.get(11).unwrap_or(0),
        });
    }
    Ok(out)
}

/// Get a single vendor with items they supply and recent receipts.
#[tauri::command]
pub async fn shop_get_vendor_detail(
    vendor_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<VendorDetail, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, contact_id, name, phone, email, gstin, \
                payment_terms, lead_time_days, credit_used, gst_compliance_rating, is_active, created_at, \
                media_id, image_url \
         FROM shop_vendors WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![vendor_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let vendor = if let Ok(Some(row)) = rows.next().await {
        Vendor {
            id: row.get(0).unwrap_or_default(),
            contact_id: row.get(1).ok(),
            name: row.get(2).unwrap_or_default(),
            phone: row.get::<String>(3).ok().filter(|s| !s.is_empty()),
            email: row.get::<String>(4).ok().filter(|s| !s.is_empty()),
            gstin: row.get::<String>(5).ok().filter(|s| !s.is_empty()),
            payment_terms: row.get(6).unwrap_or_else(|_| "immediate".into()),
            lead_time_days: row.get(7).unwrap_or(3),
            credit_used: row.get(8).unwrap_or(0.0),
            gst_compliance_rating: row.get(9).ok(),
            media_id: row.get::<Option<String>>(12).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(13).ok().flatten().filter(|s| !s.is_empty()),
            is_active: row.get(10).unwrap_or(1),
            created_at: row.get(11).unwrap_or(0),
        }
    } else {
        return Err("Vendor not found".into());
    };

    // Items this vendor supplies
    let mut vi_rows = conn
        .query(
            "SELECT vi.item_id, i.name, vi.purchase_price, vi.is_preferred \
         FROM shop_vendor_items vi \
         JOIN shop_items i ON i.id = vi.item_id \
         WHERE vi.vendor_id = ? AND vi.profile_id = ? \
         ORDER BY i.name ASC",
            crate::turso_params![vendor_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut supplied_items = Vec::new();
    while let Ok(Some(row)) = vi_rows.next().await {
        supplied_items.push(VendorItem {
            item_id: row.get(0).unwrap_or_default(),
            item_name: row.get(1).unwrap_or_default(),
            purchase_price: row.get(2).unwrap_or(0.0),
            is_preferred: row.get(3).unwrap_or(0),
        });
    }

    // Recent goods receipts mentioning this vendor (stored in notes as "Vendor: NAME")
    let vendor_note = format!("Vendor: {}%", vendor.name);
    let mut rec_rows = conn
        .query(
            "SELECT id, doc_number, doc_date, notes \
         FROM shop_documents \
         WHERE profile_id = ? AND doc_type = 'goods_receipt' AND notes LIKE ? \
         ORDER BY doc_date DESC LIMIT 10",
            crate::turso_params![profile_id, vendor_note],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut recent_receipts = Vec::new();
    while let Ok(Some(row)) = rec_rows.next().await {
        recent_receipts.push(RecentReceipt {
            id: row.get(0).unwrap_or_default(),
            doc_number: row.get(1).unwrap_or_default(),
            doc_date: row.get(2).unwrap_or(0),
            notes: row.get::<String>(3).ok(),
        });
    }

    Ok(VendorDetail {
        vendor,
        supplied_items,
        recent_receipts,
    })
}

/// Update vendor fields.
#[tauri::command]
pub async fn shop_update_vendor(
    data: UpdateVendorData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    if data.name.trim().is_empty() {
        return Err("Name is required".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_vendors \
         SET name = ?, phone = ?, email = ?, gstin = ?, payment_terms = ?, gst_compliance_rating = ?, \
             media_id = COALESCE(?, media_id), image_url = COALESCE(?, image_url), \
             updated_at = strftime('%s','now') \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.name.trim().to_string(),
            data.phone.unwrap_or_default(),
            data.email.unwrap_or_default(),
            data.gstin.unwrap_or_default(),
            data.payment_terms.unwrap_or_else(|| "immediate".into()),
            data.gst_compliance_rating,
            data.media_id,
            data.image_url,
            data.id,
            profile_id
        ],
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// Link a vendor to an item with a purchase price.
#[tauri::command]
pub async fn shop_link_vendor_item(
    data: LinkVendorItemData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let is_preferred = data.is_preferred.unwrap_or(false) as i64;
    let vi_id = new_id("vi");

    conn.execute(
        "INSERT INTO shop_vendor_items \
         (id, profile_id, vendor_id, item_id, purchase_price, is_preferred) \
         VALUES (?, ?, ?, ?, ?, ?) \
         ON CONFLICT(vendor_id, item_id) DO UPDATE SET \
           purchase_price = excluded.purchase_price, \
           is_preferred = excluded.is_preferred",
        crate::turso_params![
            vi_id,
            profile_id,
            data.vendor_id,
            data.item_id,
            data.purchase_price,
            is_preferred
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// List vendors who supply a given item (for the product detail view).
#[tauri::command]
pub async fn shop_list_vendors_for_item(
    item_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<VendorItem>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT vi.item_id, v.name, vi.purchase_price, vi.is_preferred \
         FROM shop_vendor_items vi \
         JOIN shop_vendors v ON v.id = vi.vendor_id \
         WHERE vi.item_id = ? AND vi.profile_id = ? \
         ORDER BY vi.is_preferred DESC, v.name ASC",
            crate::turso_params![item_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(VendorItem {
            item_id: row.get(0).unwrap_or_default(),
            item_name: row.get(1).unwrap_or_default(),
            purchase_price: row.get(2).unwrap_or(0.0),
            is_preferred: row.get(3).unwrap_or(0),
        });
    }
    Ok(out)
}
