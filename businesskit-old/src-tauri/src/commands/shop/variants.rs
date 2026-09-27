// src-tauri/src/commands/shop/variants.rs
//
// Shop item variants management commands.
//
// Tables used: shop_item_variants
// Commands:
//   shop_list_variants       — list variants for an item_id
//   shop_get_variant        — get a single variant by id
//   shop_create_variant     — insert new variant row
//   shop_update_variant     — update variant price, stock, attributes
//   shop_delete_variant     — delete variant row
//   shop_save_item_variants — batch sync all variants for a product item
//   shop_list_all_active_variants — list all active variants across items

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopItemVariant {
    pub id: String,
    pub profile_id: String,
    pub item_id: String,
    pub name: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub price: Option<f64>,
    pub price_delta: f64,
    pub cost_price: f64,
    pub compare_price: Option<f64>,
    pub default_mrp: f64,
    pub unit_price: f64,
    pub discount_pct: f64,
    pub extra_discount: f64,
    pub stock_qty: f64,
    pub media_id: Option<String>,
    pub media_url: Option<String>,
    pub slider_id: Option<String>,
    pub seo_og_image: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub weight: f64,
    pub weight_unit: String,
    #[serde(alias = "dim_length")]
    pub length: f64,
    pub width: f64,
    pub height: f64,
    pub dimension_unit: String,
    pub pack_size: Option<String>,
    pub conversion_factor: f64,
    pub scheme_on: f64,
    pub scheme_free: f64,
    pub country_of_origin: Option<String>,
    pub allow_backorder: i64,
    pub track_inventory: i64,
    pub tax_rate_id: Option<String>,
    pub is_taxable: i64,
    pub tax_inclusive: i64,
    pub attributes: String, // JSON e.g. {"color": "Red", "size": "M"}
    pub color_hex: Option<String>,
    pub is_active: i64,
    pub sort_order: i64,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateVariantData {
    pub id: Option<String>,
    pub item_id: Option<String>,
    pub name: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub price: Option<f64>,
    pub price_delta: Option<f64>,
    pub cost_price: Option<f64>,
    pub compare_price: Option<f64>,
    pub default_mrp: Option<f64>,
    pub unit_price: Option<f64>,
    pub discount_pct: Option<f64>,
    pub extra_discount: Option<f64>,
    pub stock_qty: Option<f64>,
    pub media_id: Option<String>,
    pub media_url: Option<String>,
    pub slider_id: Option<String>,
    pub seo_og_image: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub weight: Option<f64>,
    pub weight_unit: Option<String>,
    #[serde(alias = "dim_length")]
    pub length: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dimension_unit: Option<String>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub country_of_origin: Option<String>,
    pub allow_backorder: Option<i64>,
    pub track_inventory: Option<i64>,
    pub tax_rate_id: Option<String>,
    pub is_taxable: Option<i64>,
    pub tax_inclusive: Option<i64>,
    pub attributes: Option<String>,
    pub color_hex: Option<String>,
    pub sort_order: Option<i64>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateVariantData {
    pub name: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub price: Option<f64>,
    pub price_delta: Option<f64>,
    pub cost_price: Option<f64>,
    pub compare_price: Option<f64>,
    pub default_mrp: Option<f64>,
    pub unit_price: Option<f64>,
    pub discount_pct: Option<f64>,
    pub extra_discount: Option<f64>,
    pub stock_qty: Option<f64>,
    pub media_id: Option<String>,
    pub media_url: Option<String>,
    pub slider_id: Option<String>,
    pub seo_og_image: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub weight: Option<f64>,
    pub weight_unit: Option<String>,
    #[serde(alias = "dim_length")]
    pub length: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dimension_unit: Option<String>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub country_of_origin: Option<String>,
    pub allow_backorder: Option<i64>,
    pub track_inventory: Option<i64>,
    pub tax_rate_id: Option<String>,
    pub is_taxable: Option<i64>,
    pub tax_inclusive: Option<i64>,
    pub attributes: Option<String>,
    pub color_hex: Option<String>,
    pub is_active: Option<i64>,
    pub sort_order: Option<i64>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: Option<i64>,
}

fn new_variant_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("var-{}", ts)
}

const SELECT_COLS: &str = "\
    id, profile_id, item_id, name, sku, barcode, price, price_delta, cost_price, compare_price, \
    default_mrp, unit_price, discount_pct, extra_discount, stock_qty, media_id, media_url, slider_id, \
    seo_og_image, hsn_sac_code, weight, weight_unit, dim_length, width, height, dimension_unit, \
    pack_size, conversion_factor, scheme_on, scheme_free, \
    country_of_origin, allow_backorder, track_inventory, tax_rate_id, is_taxable, tax_inclusive, attributes, color_hex, \
    is_active, sort_order, seo_title, seo_description, seo_robots, seo_block_indexing, \
    created_at, updated_at";

fn row_to_variant(row: &crate::db::turso::TursoRow) -> ShopItemVariant {
    ShopItemVariant {
        id: row.get(0).unwrap_or_default(),
        profile_id: row.get(1).unwrap_or_default(),
        item_id: row.get(2).unwrap_or_default(),
        name: row.get(3).unwrap_or_default(),
        sku: row.get(4).ok(),
        barcode: row.get(5).ok(),
        price: row.get(6).ok(),
        price_delta: row.get(7).unwrap_or(0.0),
        cost_price: row.get(8).unwrap_or(0.0),
        compare_price: row.get(9).ok(),
        default_mrp: row.get(10).unwrap_or(0.0),
        unit_price: row.get(11).unwrap_or(0.0),
        discount_pct: row.get(12).unwrap_or(0.0),
        extra_discount: row.get(13).unwrap_or(0.0),
        stock_qty: row.get(14).unwrap_or(0.0),
        media_id: row.get(15).ok(),
        media_url: row.get(16).ok(),
        slider_id: row.get(17).ok(),
        seo_og_image: row.get(18).ok(),
        hsn_sac_code: row.get(19).ok(),
        weight: row.get(20).unwrap_or(0.0),
        weight_unit: row.get(21).unwrap_or_else(|_| "kg".to_string()),
        length: row.get(22).unwrap_or(0.0),
        width: row.get(23).unwrap_or(0.0),
        height: row.get(24).unwrap_or(0.0),
        dimension_unit: row.get(25).unwrap_or_else(|_| "cm".to_string()),
        pack_size: row.get(26).ok(),
        conversion_factor: row.get(27).unwrap_or(1.0),
        scheme_on: row.get(28).unwrap_or(0.0),
        scheme_free: row.get(29).unwrap_or(0.0),
        country_of_origin: row.get(30).ok(),
        allow_backorder: row.get(31).unwrap_or(0),
        track_inventory: row.get(32).unwrap_or(1),
        tax_rate_id: row.get(33).ok(),
        is_taxable: row.get(34).unwrap_or(1),
        tax_inclusive: row.get(35).unwrap_or(0),
        attributes: row.get(36).unwrap_or_else(|_| "{}".to_string()),
        color_hex: row.get(37).ok(),
        is_active: row.get(38).unwrap_or(1),
        sort_order: row.get(39).unwrap_or(0),
        seo_title: row.get(40).ok(),
        seo_description: row.get(41).ok(),
        seo_robots: row.get(42).ok(),
        seo_block_indexing: row.get(43).unwrap_or(0),
        created_at: row.get(44).unwrap_or(0),
        updated_at: row.get(45).unwrap_or(0),
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all active variants for a parent item_id.
#[tauri::command]
pub async fn shop_list_variants(
    item_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopItemVariant>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = format!(
        "SELECT {} FROM shop_item_variants WHERE item_id = ? AND profile_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC",
        SELECT_COLS
    );

    let mut rows = conn
        .query(&sql, crate::turso_params![item_id, profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(row_to_variant(&row));
    }

    Ok(list)
}

/// Create a new variant for a parent item.
#[tauri::command]
pub async fn shop_create_variant(
    data: CreateVariantData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopItemVariant, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = new_variant_id();
    let price_delta = data.price_delta.unwrap_or(0.0);
    let price = data.price.unwrap_or(price_delta);
    let cost_price = data.cost_price.unwrap_or(0.0);
    let compare_price = data.compare_price.filter(|&cp| cp > 0.0);
    let default_mrp = data.default_mrp.unwrap_or(0.0);
    let unit_price = data.unit_price.unwrap_or(0.0);
    let discount_pct = data.discount_pct.unwrap_or(0.0);
    let extra_discount = data.extra_discount.unwrap_or(0.0);
    let stock_qty = data.stock_qty.unwrap_or(0.0);
    let weight = data.weight.unwrap_or(0.0);
    let weight_unit = data.weight_unit.unwrap_or_else(|| "kg".to_string());
    let length = data.length.unwrap_or(0.0);
    let width = data.width.unwrap_or(0.0);
    let height = data.height.unwrap_or(0.0);
    let dimension_unit = data.dimension_unit.unwrap_or_else(|| "cm".to_string());
    let pack_size = data.pack_size;
    let conversion_factor = data.conversion_factor.unwrap_or(1.0);
    let scheme_on = data.scheme_on.unwrap_or(0.0);
    let scheme_free = data.scheme_free.unwrap_or(0.0);
    let allow_backorder = data.allow_backorder.unwrap_or(0);
    let track_inventory = data.track_inventory.unwrap_or(1);
    let is_taxable = data.is_taxable.unwrap_or(1);
    let tax_inclusive = data.tax_inclusive.unwrap_or(0);
    let attributes = data.attributes.unwrap_or_else(|| "{}".to_string());
    let sort_order = data.sort_order.unwrap_or(0);
    let seo_block_indexing = data.seo_block_indexing.unwrap_or(0);

    conn.execute(
        "INSERT INTO shop_item_variants \
         (id, profile_id, item_id, name, sku, barcode, price, price_delta, cost_price, compare_price, default_mrp, unit_price, discount_pct, extra_discount, stock_qty, media_id, media_url, slider_id, seo_og_image, hsn_sac_code, weight, weight_unit, dim_length, width, height, dimension_unit, pack_size, conversion_factor, scheme_on, scheme_free, country_of_origin, allow_backorder, track_inventory, tax_rate_id, is_taxable, tax_inclusive, attributes, color_hex, is_active, sort_order, seo_title, seo_description, seo_robots, seo_block_indexing) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.item_id.unwrap_or_default(),
            data.name.clone(),
            data.sku.clone(),
            data.barcode.clone(),
            price,
            price_delta,
            cost_price,
            compare_price,
            default_mrp,
            unit_price,
            discount_pct,
            extra_discount,
            stock_qty,
            data.media_id.clone(),
            data.media_url.clone(),
            data.slider_id.clone(),
            data.seo_og_image.clone(),
            data.hsn_sac_code.clone(),
            weight,
            weight_unit.clone(),
            length,
            width,
            height,
            dimension_unit.clone(),
            pack_size.clone(),
            conversion_factor,
            scheme_on,
            scheme_free,
            data.country_of_origin.clone(),
            allow_backorder,
            track_inventory,
            data.tax_rate_id.clone(),
            is_taxable,
            tax_inclusive,
            attributes.clone(),
            data.color_hex.clone(),
            sort_order,
            data.seo_title.clone(),
            data.seo_description.clone(),
            data.seo_robots.clone(),
            seo_block_indexing,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let sql = format!(
        "SELECT {} FROM shop_item_variants WHERE id = ? AND profile_id = ?",
        SELECT_COLS
    );
    let mut rows = conn
        .query(&sql, crate::turso_params![id, profile_id])
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_variant(&row))
    } else {
        Err("Failed to load created variant".into())
    }
}

/// Update an existing variant by id.
#[tauri::command]
pub async fn shop_update_variant(
    variant_id: String,
    data: UpdateVariantData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopItemVariant, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let price_delta = data.price_delta.unwrap_or(0.0);
    let cost_price = data.cost_price.unwrap_or(0.0);
    let compare_price = data.compare_price.filter(|&cp| cp > 0.0);
    let default_mrp = data.default_mrp.unwrap_or(0.0);
    let unit_price = data.unit_price.unwrap_or(0.0);
    let discount_pct = data.discount_pct.unwrap_or(0.0);
    let extra_discount = data.extra_discount.unwrap_or(0.0);
    let stock_qty = data.stock_qty.unwrap_or(0.0);
    let weight = data.weight.unwrap_or(0.0);
    let weight_unit = data.weight_unit.unwrap_or_else(|| "kg".to_string());
    let length = data.length.unwrap_or(0.0);
    let width = data.width.unwrap_or(0.0);
    let height = data.height.unwrap_or(0.0);
    let dimension_unit = data.dimension_unit.unwrap_or_else(|| "cm".to_string());
    let pack_size = data.pack_size;
    let conversion_factor = data.conversion_factor.unwrap_or(1.0);
    let scheme_on = data.scheme_on.unwrap_or(0.0);
    let scheme_free = data.scheme_free.unwrap_or(0.0);
    let allow_backorder = data.allow_backorder.unwrap_or(0);
    let track_inventory = data.track_inventory.unwrap_or(1);
    let is_taxable = data.is_taxable.unwrap_or(1);
    let tax_inclusive = data.tax_inclusive.unwrap_or(0);
    let attributes = data.attributes.unwrap_or_else(|| "{}".to_string());
    let is_active = data.is_active.unwrap_or(1);
    let sort_order = data.sort_order.unwrap_or(0);
    let seo_block_indexing = data.seo_block_indexing.unwrap_or(0);

    conn.execute(
        "UPDATE shop_item_variants \
         SET name = ?, sku = ?, barcode = ?, price = ?, price_delta = ?, cost_price = ?, compare_price = ?, default_mrp = ?, unit_price = ?, discount_pct = ?, extra_discount = ?, stock_qty = ?, media_id = ?, media_url = ?, slider_id = ?, seo_og_image = ?, hsn_sac_code = ?, weight = ?, weight_unit = ?, dim_length = ?, width = ?, height = ?, dimension_unit = ?, pack_size = ?, conversion_factor = ?, scheme_on = ?, scheme_free = ?, country_of_origin = ?, allow_backorder = ?, track_inventory = ?, tax_rate_id = ?, is_taxable = ?, tax_inclusive = ?, attributes = ?, color_hex = ?, is_active = ?, sort_order = ?, seo_title = ?, seo_description = ?, seo_robots = ?, seo_block_indexing = ?, updated_at = (strftime('%s','now')) \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.name.clone(),
            data.sku.clone(),
            data.barcode.clone(),
            data.price,
            price_delta,
            cost_price,
            compare_price,
            default_mrp,
            unit_price,
            discount_pct,
            extra_discount,
            stock_qty,
            data.media_id.clone(),
            data.media_url.clone(),
            data.slider_id.clone(),
            data.seo_og_image.clone(),
            data.hsn_sac_code.clone(),
            weight,
            weight_unit,
            length,
            width,
            height,
            dimension_unit,
            pack_size,
            conversion_factor,
            scheme_on,
            scheme_free,
            data.country_of_origin.clone(),
            allow_backorder,
            track_inventory,
            data.tax_rate_id.clone(),
            is_taxable,
            tax_inclusive,
            attributes.clone(),
            data.color_hex.clone(),
            is_active,
            sort_order,
            data.seo_title.clone(),
            data.seo_description.clone(),
            data.seo_robots.clone(),
            seo_block_indexing,
            variant_id.clone(),
            profile_id.clone(),
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Fetch updated row
    let sql = format!(
        "SELECT {} FROM shop_item_variants WHERE id = ? AND profile_id = ?",
        SELECT_COLS
    );
    let mut rows = conn
        .query(&sql, crate::turso_params![variant_id, profile_id])
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_variant(&row))
    } else {
        Err("Variant not found".into())
    }
}

/// Delete a variant row.
#[tauri::command]
pub async fn shop_delete_variant(
    variant_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM shop_item_variants WHERE id = ? AND profile_id = ?",
        crate::turso_params![variant_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Batch sync all variants for a parent product item.
#[tauri::command]
pub async fn shop_save_item_variants(
    item_id: String,
    variants: Vec<CreateVariantData>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopItemVariant>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Delete existing variants for this item
    if let Err(e) = conn
        .execute(
            "DELETE FROM shop_item_variants WHERE item_id = ?1 AND profile_id = ?2",
            crate::turso_params![item_id.clone(), profile_id.clone()],
        )
        .await
    {
        log::warn!("[shop_save_item_variants] failed to delete existing variants: {}", e);
        return Err(e.to_string());
    }

    // Insert new list
    for (idx, v) in variants.into_iter().enumerate() {
        let id = v.id.filter(|s| !s.trim().is_empty()).unwrap_or_else(new_variant_id);
        let price_delta = v.price_delta.unwrap_or(0.0);
        let price = v.price.unwrap_or(price_delta);
        let cost_price = v.cost_price.unwrap_or(0.0);
        let compare_price = v.compare_price.filter(|&cp| cp > 0.0);
        let default_mrp = v.default_mrp.unwrap_or(0.0);
        let unit_price = v.unit_price.unwrap_or(0.0);
        let discount_pct = v.discount_pct.unwrap_or(0.0);
        let extra_discount = v.extra_discount.unwrap_or(0.0);
        let stock_qty = v.stock_qty.unwrap_or(0.0);
        let weight = v.weight.unwrap_or(0.0);
        let weight_unit = v.weight_unit.unwrap_or_else(|| "kg".to_string());
        let length = v.length.unwrap_or(0.0);
        let width = v.width.unwrap_or(0.0);
        let height = v.height.unwrap_or(0.0);
        let dimension_unit = v.dimension_unit.unwrap_or_else(|| "cm".to_string());
        let pack_size = v.pack_size;
        let conversion_factor = v.conversion_factor.unwrap_or(1.0);
        let scheme_on = v.scheme_on.unwrap_or(0.0);
        let scheme_free = v.scheme_free.unwrap_or(0.0);
        let allow_backorder = v.allow_backorder.unwrap_or(0);
        let track_inventory = v.track_inventory.unwrap_or(1);
        let is_taxable = v.is_taxable.unwrap_or(1);
        let tax_inclusive = v.tax_inclusive.unwrap_or(0);
        let attributes = v.attributes.unwrap_or_else(|| "{}".to_string());
        let seo_block_indexing = v.seo_block_indexing.unwrap_or(0);

        if let Err(e) = conn
            .execute(
                "INSERT INTO shop_item_variants \
                 (id, profile_id, item_id, name, sku, barcode, price, price_delta, cost_price, compare_price, default_mrp, unit_price, discount_pct, extra_discount, stock_qty, media_id, media_url, slider_id, seo_og_image, hsn_sac_code, weight, weight_unit, dim_length, width, height, dimension_unit, pack_size, conversion_factor, scheme_on, scheme_free, country_of_origin, allow_backorder, track_inventory, tax_rate_id, is_taxable, tax_inclusive, attributes, color_hex, is_active, sort_order, seo_title, seo_description, seo_robots, seo_block_indexing) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
                crate::turso_params![
                    id,
                    profile_id.clone(),
                    item_id.clone(),
                    v.name.clone(),
                    v.sku,
                    v.barcode,
                    price,
                    price_delta,
                    cost_price,
                    compare_price,
                    default_mrp,
                    unit_price,
                    discount_pct,
                    extra_discount,
                    stock_qty,
                    v.media_id,
                    v.media_url,
                    v.slider_id,
                    v.seo_og_image,
                    v.hsn_sac_code,
                    weight,
                    weight_unit,
                    length,
                    width,
                    height,
                    dimension_unit,
                    pack_size,
                    conversion_factor,
                    scheme_on,
                    scheme_free,
                    v.country_of_origin,
                    allow_backorder,
                    track_inventory,
                    v.tax_rate_id,
                    is_taxable,
                    tax_inclusive,
                    attributes,
                    v.color_hex,
                    idx as i64,
                    v.seo_title,
                    v.seo_description,
                    v.seo_robots,
                    seo_block_indexing,
                ],
            )
            .await
        {
            log::warn!("[shop_save_item_variants] failed to insert variant {}: {}", v.name, e);
            return Err(format!("Failed to insert variant {}: {}", v.name, e));
        }
    }

    shop_list_variants(item_id, state).await
}

/// List all active variants across all items for the profile.
#[tauri::command]
pub async fn shop_list_all_active_variants(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopItemVariant>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = format!(
        "SELECT {} FROM shop_item_variants WHERE profile_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC",
        SELECT_COLS
    );

    let mut rows = conn
        .query(&sql, crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(row_to_variant(&row));
    }
    Ok(list)
}
