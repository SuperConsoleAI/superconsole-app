// src-tauri/src/commands/agents/tools/helpers.rs
// Shared DB resolution helpers for agent tools.
// HARD RULE: only touches UserDB tables via active profile_id. Never touches CentralConn.

use crate::db::turso::TursoConn;
use crate::turso_params;
use uuid::Uuid;

/// Resolves the default active warehouse for the given profile, or creates "Main Warehouse" if none exist.
pub async fn get_or_create_default_warehouse(conn: &TursoConn, profile_id: &str) -> Result<String, String> {
    let mut rows = conn
        .query(
            "SELECT id FROM shop_warehouses WHERE profile_id = ?1 AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1",
            turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        return row.get::<String>(0).map_err(|e| e.to_string());
    }

    let wh_id = format!("wh_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    conn.execute(
        "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) \
         VALUES (?1, ?2, 'Main Warehouse', 'general', 1, 1)",
        turso_params![wh_id.clone(), profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(wh_id)
}

/// Resolves an existing vendor from shop_vendors by name (exact or substring), or creates a new vendor record.
pub async fn resolve_or_create_vendor(
    conn: &TursoConn,
    profile_id: &str,
    vendor_name: &str,
    payment_terms: Option<&str>,
) -> Result<(String, String), String> {
    let clean_name = vendor_name.trim();
    if clean_name.is_empty() {
        return Err("Vendor name cannot be empty".into());
    }
    let terms = payment_terms.unwrap_or("Net 30").trim();

    let mut rows = conn
        .query(
            "SELECT id, name, payment_terms FROM shop_vendors WHERE profile_id = ?1 AND (LOWER(name) = LOWER(?2) OR name LIKE ?3) ORDER BY CASE WHEN LOWER(name) = LOWER(?2) THEN 0 ELSE 1 END LIMIT 1",
            turso_params![profile_id, clean_name, format!("%{}%", clean_name)],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let vid = row.get::<String>(0).map_err(|e| e.to_string())?;
        let vname = row.get::<String>(1).unwrap_or_else(|_| clean_name.to_string());
        if !terms.is_empty() {
            let _ = conn
                .execute(
                    "UPDATE shop_vendors SET payment_terms = ?1, updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                    turso_params![terms, vid.clone(), profile_id],
                )
                .await;
        }
        return Ok((vid, vname));
    }

    let new_vid = format!("vend_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    conn.execute(
        "INSERT INTO shop_vendors (id, profile_id, name, payment_terms, is_active) \
         VALUES (?1, ?2, ?3, ?4, 1)",
        turso_params![new_vid.clone(), profile_id, clean_name, terms],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok((new_vid, clean_name.to_string()))
}

/// Generates a 10-character uppercase alphanumeric SKU without any prefix (e.g. "7PKFJ7I5ND").
pub fn generate_sku() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..10)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

fn is_pure_sku_code(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.len() < 3 || trimmed.len() > 16 {
        return false;
    }
    // Must not contain spaces and must be alphanumeric (allowing dashes)
    trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') && !trimmed.contains(' ')
}

#[derive(Debug, Default, Clone)]
pub struct ItemCreationParams {
    pub user_id: Option<String>,
    pub explicit_sku: Option<String>,
    pub cost_price: f64,
    pub selling_price: Option<f64>,
    pub markup_pct: Option<f64>,
    pub mrp: Option<f64>,
    pub compare_price: Option<f64>,
    pub tax_rate_id: Option<String>,
    pub barcode: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub category_id: Option<String>,
    pub shop_category_id: Option<String>,
    pub collection_id: Option<String>,
    pub unit_id: Option<String>,
    pub notes: Option<String>,
    pub agent_notes: Option<String>,
}

/// Resolves an item from shop_items or shop_item_variants by SKU, ID, exact name, or partial name.
/// If not found anywhere in the profile catalog, creates a new shop_items record with full schema parameters.
pub async fn resolve_or_create_item_with_params(
    conn: &TursoConn,
    profile_id: &str,
    item_ref: &str,
    params: ItemCreationParams,
) -> Result<(String, String, String), String> {
    let query_ref = item_ref.trim();
    if query_ref.is_empty() {
        return Err("Item identifier cannot be empty".into());
    }

    // 1. Check shop_items
    let mut rows = conn
        .query(
            "SELECT id, name, sku FROM shop_items WHERE profile_id = ?1 AND (sku = ?2 OR id = ?2 OR LOWER(name) = LOWER(?2) OR name LIKE ?3) ORDER BY CASE WHEN sku = ?2 THEN 0 WHEN id = ?2 THEN 1 WHEN LOWER(name) = LOWER(?2) THEN 2 ELSE 3 END LIMIT 1",
            turso_params![profile_id, query_ref, format!("%{}%", query_ref)],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let item_id = row.get::<String>(0).map_err(|e| e.to_string())?;
        let item_name = row.get::<String>(1).unwrap_or_else(|_| query_ref.to_string());
        let sku_str = row.get::<Option<String>>(2).unwrap_or(None).unwrap_or_default();
        return Ok((item_id, item_name, sku_str));
    }

    // 2. Check shop_item_variants
    let mut vrows = conn
        .query(
            "SELECT v.item_id, i.name, v.sku FROM shop_item_variants v \
             JOIN shop_items i ON v.item_id = i.id \
             WHERE i.profile_id = ?1 AND (v.sku = ?2 OR LOWER(v.name) = LOWER(?2) OR v.name LIKE ?3) LIMIT 1",
            turso_params![profile_id, query_ref, format!("%{}%", query_ref)],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = vrows.next().await.map_err(|e| e.to_string())? {
        let item_id = row.get::<String>(0).map_err(|e| e.to_string())?;
        let item_name = row.get::<String>(1).unwrap_or_else(|_| query_ref.to_string());
        let sku_str = row.get::<Option<String>>(2).unwrap_or(None).unwrap_or_default();
        return Ok((item_id, item_name, sku_str));
    }

    // 3. Auto-create item in shop_items with full schema
    let new_id = format!("item_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let new_name = query_ref.to_string();

    let clean_sku = if let Some(s) = params.explicit_sku.filter(|s| !s.trim().is_empty()) {
        s.trim().to_uppercase()
    } else if is_pure_sku_code(query_ref) {
        query_ref.to_uppercase()
    } else {
        generate_sku()
    };

    let slug = format!(
        "item-{}",
        query_ref
            .to_lowercase()
            .replace(' ', "-")
            .replace(|c: char| !c.is_alphanumeric() && c != '-', "")
    );

    let cost_price = params.cost_price;
    let selling_price = if let Some(sp) = params.selling_price.filter(|&p| p > 0.0) {
        sp
    } else if let Some(m_pct) = params.markup_pct.filter(|&m| m > 0.0) {
        if cost_price > 0.0 {
            ((cost_price * (1.0 + m_pct / 100.0)) * 100.0).round() / 100.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    let default_mrp = params.mrp.unwrap_or(0.0);
    let compare_price = params.compare_price.unwrap_or(0.0);
    let tax_rate_id = params.tax_rate_id.unwrap_or_default();
    let barcode = params.barcode.unwrap_or_default();
    let hsn_sac_code = params.hsn_sac_code.unwrap_or_default();
    let pack_size = params.pack_size.unwrap_or_default();
    let conversion_factor = params.conversion_factor.unwrap_or(1.0);
    let scheme_on = params.scheme_on.unwrap_or(0.0);
    let scheme_free = params.scheme_free.unwrap_or(0.0);
    let category_id = params.category_id.unwrap_or_else(|| "cat_6".to_string());
    let notes = params.notes;
    let agent_notes = params.agent_notes;

    // Resolve shop_category_id (custom or fallback to default shop_categories where is_default = 1)
    let shop_category_id = if let Some(sc_id) = params.shop_category_id.filter(|s| !s.trim().is_empty()) {
        Some(sc_id)
    } else if let Ok(mut cat_rows) = conn.query(
        "SELECT id FROM shop_categories WHERE profile_id = ?1 AND is_active = 1 ORDER BY is_default DESC, sort_order ASC LIMIT 1",
        turso_params![profile_id],
    ).await {
        cat_rows.next().await.ok().flatten().and_then(|r| r.get::<String>(0).ok())
    } else {
        None
    };

    // Resolve collection_id (custom or fallback to default collections where is_default = 1)
    let collection_id = if let Some(c_id) = params.collection_id.filter(|s| !s.trim().is_empty()) {
        Some(c_id)
    } else if let Ok(mut col_rows) = conn.query(
        "SELECT id FROM collections WHERE profile_id = ?1 AND is_active = 1 AND archived = 0 ORDER BY is_default DESC, sort_order ASC LIMIT 1",
        turso_params![profile_id],
    ).await {
        col_rows.next().await.ok().flatten().and_then(|r| r.get::<String>(0).ok())
    } else {
        None
    };

    // Resolve unit_id (custom or fallback to default shop_units where is_default = 1)
    let unit_id = if let Some(u_id) = params.unit_id.filter(|s| !s.trim().is_empty()) {
        Some(u_id)
    } else if let Ok(mut unit_rows) = conn.query(
        "SELECT id FROM shop_units WHERE profile_id = ?1 AND is_active = 1 ORDER BY is_default DESC LIMIT 1",
        turso_params![profile_id],
    ).await {
        unit_rows.next().await.ok().flatten().and_then(|r| r.get::<String>(0).ok())
    } else {
        None
    };

    let effective_user_id = params.user_id.as_deref().unwrap_or("owner");

    conn.execute(
        "INSERT INTO shop_items (\
            id, profile_id, user_id, updated_by, item_type, category_id, \
            shop_category_id, collection_id, unit_id, \
            name, slug, sku, barcode, hsn_sac_code, cost_price, price, compare_price, \
            default_mrp, tax_rate_id, is_taxable, pack_size, conversion_factor, \
            scheme_on, scheme_free, track_inventory, is_active, published, \
            notes, agent_notes, \
            created_at, updated_at \
         ) VALUES (\
            ?1, ?2, ?3, ?4, 'physical', ?5, \
            ?6, ?7, ?8, \
            ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, \
            ?17, ?18, 1, ?19, ?20, \
            ?21, ?22, 1, 1, 1, \
            ?23, ?24, \
            strftime('%s','now'), strftime('%s','now')\
         )",
        turso_params![
            new_id.clone(),
            profile_id,
            effective_user_id,
            effective_user_id,
            category_id,
            shop_category_id,
            collection_id,
            unit_id,
            new_name.clone(),
            slug,
            clean_sku.clone(),
            barcode,
            hsn_sac_code,
            cost_price,
            selling_price,
            compare_price,
            default_mrp,
            tax_rate_id,
            pack_size,
            conversion_factor,
            scheme_on,
            scheme_free,
            notes,
            agent_notes
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok((new_id, new_name, clean_sku))
}

/// Resolves an item from shop_items or shop_item_variants by SKU, ID, exact name, or partial name.
/// Backward-compatible wrapper calling resolve_or_create_item_with_params.
pub async fn resolve_or_create_item(
    conn: &TursoConn,
    profile_id: &str,
    item_ref: &str,
    default_cost: f64,
) -> Result<(String, String, String), String> {
    resolve_or_create_item_with_params(
        conn,
        profile_id,
        item_ref,
        ItemCreationParams {
            cost_price: default_cost,
            ..Default::default()
        },
    )
    .await
}

/// Computes live stock on hand for a given item in a warehouse from shop_stock_ledger.
pub async fn get_stock_balance(
    conn: &TursoConn,
    profile_id: &str,
    item_id: &str,
    warehouse_id: &str,
) -> Result<f64, String> {
    let mut bal_rows = conn
        .query(
            "SELECT COALESCE(SUM(qty_in - qty_out), 0.0) FROM shop_stock_ledger \
             WHERE profile_id = ?1 AND item_id = ?2 AND warehouse_id = ?3",
            turso_params![profile_id, item_id, warehouse_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = bal_rows.next().await.map_err(|e| e.to_string())? {
        Ok(row.get::<f64>(0).unwrap_or(0.0))
    } else {
        Ok(0.0)
    }
}

/// Parses date string into Unix epoch timestamp, defaulting to now.
pub fn parse_date_to_timestamp(date_str: Option<&str>) -> i64 {
    if let Some(ds) = date_str {
        let trimmed = ds.trim();
        if let Ok(ndt) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
            if let Some(dt) = ndt.and_hms_opt(0, 0, 0) {
                return dt.and_utc().timestamp();
            }
        } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
            return dt.timestamp();
        }
    }
    chrono::Utc::now().timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_sku_format() {
        let sku = generate_sku();
        assert_eq!(sku.len(), 10);
        assert!(sku.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
        assert!(!sku.starts_with("SKU-"));
        assert!(!sku.starts_with("SKU_"));
    }

    #[test]
    fn test_is_pure_sku_code() {
        assert!(is_pure_sku_code("7PKFJ7I5ND"));
        assert!(is_pure_sku_code("SKU12345"));
        assert!(!is_pure_sku_code("Apple Mac Mini"));
        assert!(!is_pure_sku_code("URISPAS TAB"));
    }
}
