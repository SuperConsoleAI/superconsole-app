// src-tauri/src/commands/shop/items.rs
//
// Shop item (product) commands — Phase 1
//
// Tables used: shop_items
// Commands: shop_list_items, shop_get_item, shop_create_item, shop_update_item, shop_delete_item

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopItem {
    pub id: String,
    pub profile_id: String,
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub link_id: Option<String>,
    pub affiliate_id: Option<String>,
    pub item_type: String,
    pub category_id: String,
    pub shop_category_id: Option<String>,
    pub parent_id: Option<String>,
    pub collection_id: Option<String>,
    pub brand_id: Option<String>,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub external_url: Option<String>,
    pub sku: Option<String>,
    pub unit_id: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub media_id: Option<String>,
    pub slider_id: Option<String>,
    pub video_url: Option<String>,
    pub video_media_id: Option<String>,
    pub price: f64,
    pub cost_price: f64,
    pub compare_price: Option<f64>,
    pub default_mrp: f64,
    pub unit_price: f64,
    pub discount_pct: f64,
    pub extra_discount: f64,
    pub currency: String,
    pub tax_rate_id: Option<String>,
    pub is_taxable: i64,
    pub tax_inclusive: i64,
    pub is_active: i64,
    pub published: i64,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub track_inventory: i64,
    pub sections: Option<String>,
    pub hide_default_sections: i64,
    pub faq: Option<String>,
    pub additional_details: Option<String>,
    pub ai_summary: Option<String>,
    pub options: Option<String>,
    pub variant_group_by: Option<String>,
    pub has_variants: i64,
    pub weight: Option<f64>,
    pub weight_unit: Option<String>,
    pub dim_length: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dimension_unit: Option<String>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub country_of_origin: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: i64,
    pub archived: i64,
    pub notes: Option<String>,
    pub agent_notes: Option<String>,
    pub creator_name: Option<String>,
    pub updater_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateItemData {
    pub name: String,
    pub price: f64,
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub link_id: Option<String>,
    pub affiliate_id: Option<String>,
    pub cost_price: Option<f64>,
    pub compare_price: Option<f64>,
    pub default_mrp: Option<f64>,
    pub unit_price: Option<f64>,
    pub discount_pct: Option<f64>,
    pub extra_discount: Option<f64>,
    pub currency: Option<String>,
    pub category_id: Option<String>,
    pub shop_category_id: Option<String>,
    pub parent_id: Option<String>,
    pub collection_id: Option<String>,
    pub brand_id: Option<String>,
    pub unit_id: Option<String>,
    pub item_type: Option<String>,
    pub description: Option<String>,
    pub external_url: Option<String>,
    pub sku: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub media_id: Option<String>,
    pub slider_id: Option<String>,
    pub video_url: Option<String>,
    pub video_media_id: Option<String>,
    pub tax_rate_id: Option<String>,
    pub is_taxable: Option<bool>,
    pub tax_inclusive: Option<bool>,
    pub track_inventory: Option<i64>,
    pub sections: Option<String>,
    pub hide_default_sections: Option<i64>,
    pub faq: Option<String>,
    pub additional_details: Option<String>,
    pub ai_summary: Option<String>,
    pub options: Option<String>,
    pub variant_group_by: Option<String>,
    pub has_variants: Option<i64>,
    pub weight: Option<f64>,
    pub weight_unit: Option<String>,
    pub dim_length: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dimension_unit: Option<String>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub country_of_origin: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: Option<i64>,
    pub notes: Option<String>,
    pub agent_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateItemData {
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub name: Option<String>,
    pub price: Option<f64>,
    pub link_id: Option<String>,
    pub affiliate_id: Option<String>,
    pub cost_price: Option<f64>,
    pub compare_price: Option<f64>,
    pub default_mrp: Option<f64>,
    pub unit_price: Option<f64>,
    pub discount_pct: Option<f64>,
    pub extra_discount: Option<f64>,
    pub currency: Option<String>,
    pub category_id: Option<String>,
    pub shop_category_id: Option<String>,
    pub parent_id: Option<String>,
    pub collection_id: Option<String>,
    pub brand_id: Option<String>,
    pub unit_id: Option<String>,
    pub description: Option<String>,
    pub external_url: Option<String>,
    pub sku: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub media_id: Option<String>,
    pub slider_id: Option<String>,
    pub video_url: Option<String>,
    pub video_media_id: Option<String>,
    pub tax_rate_id: Option<String>,
    pub is_taxable: Option<bool>,
    pub tax_inclusive: Option<bool>,
    pub is_active: Option<bool>,
    pub track_inventory: Option<i64>,
    pub published: Option<i64>,
    pub sections: Option<String>,
    pub hide_default_sections: Option<i64>,
    pub faq: Option<String>,
    pub additional_details: Option<String>,
    pub ai_summary: Option<String>,
    pub options: Option<String>,
    pub variant_group_by: Option<String>,
    pub has_variants: Option<i64>,
    pub weight: Option<f64>,
    pub weight_unit: Option<String>,
    pub dim_length: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dimension_unit: Option<String>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub country_of_origin: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub seo_og_image: Option<String>,
    pub seo_robots: Option<String>,
    pub seo_block_indexing: Option<i64>,
    pub archived: Option<i64>,
    pub notes: Option<String>,
    pub agent_notes: Option<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("item-{}", ts)
}

/// Row → ShopItem from a SELECT with columns in this order:
/// 0:id 1:profile_id 2:user_id 3:updated_by 4:link_id 5:affiliate_id 6:item_type 7:category_id 8:shop_category_id 9:parent_id 10:collection_id 11:brand_id 12:name 13:slug
/// 14:description 15:external_url 16:sku 17:unit_id 18:hsn_sac_code
/// 19:media_id 20:slider_id 21:video_url 22:video_media_id 23:price 24:cost_price 25:compare_price 26:default_mrp 27:unit_price 28:discount_pct 29:extra_discount 30:currency
/// 31:tax_rate_id 32:is_taxable 33:tax_inclusive 34:is_active 35:published 36:sort_order
/// 37:created_at 38:updated_at 39:track_inventory 40:sections 41:hide_default_sections 42:faq 43:additional_details 44:ai_summary 45:options 46:variant_group_by 47:has_variants
/// 48:weight 49:weight_unit 50:dim_length 51:width 52:height 53:dimension_unit 54:pack_size 55:conversion_factor 56:scheme_on 57:scheme_free 58:country_of_origin
/// 59:seo_title 60:seo_description 61:seo_og_image 62:seo_robots 63:seo_block_indexing 64:archived
fn row_to_item(row: crate::db::turso::TursoRow) -> ShopItem {
    ShopItem {
        id: row.get(0).unwrap_or_default(),
        profile_id: row.get(1).unwrap_or_default(),
        user_id: row.get(2).ok(),
        updated_by: row.get(3).ok(),
        link_id: row.get(4).ok(),
        affiliate_id: row.get(5).ok(),
        item_type: row.get(6).unwrap_or_else(|_| "physical".to_string()),
        category_id: row.get(7).unwrap_or_else(|_| "cat_6".to_string()),
        shop_category_id: row.get(8).ok(),
        parent_id: row.get(9).ok(),
        collection_id: row.get(10).ok(),
        brand_id: row.get(11).ok(),
        name: row.get(12).unwrap_or_default(),
        slug: row.get(13).unwrap_or_default(),
        description: row.get(14).ok(),
        external_url: row.get(15).ok(),
        sku: row.get(16).ok(),
        unit_id: row.get(17).ok(),
        hsn_sac_code: row.get(18).ok(),
        media_id: row.get(19).ok(),
        slider_id: row.get(20).ok(),
        video_url: row.get(21).ok(),
        video_media_id: row.get(22).ok(),
        price: row.get(23).unwrap_or(0.0),
        cost_price: row.get(24).unwrap_or(0.0),
        compare_price: row.get(25).ok(),
        default_mrp: row.get(26).unwrap_or(0.0),
        unit_price: row.get(27).unwrap_or(0.0),
        discount_pct: row.get(28).unwrap_or(0.0),
        extra_discount: row.get(29).unwrap_or(0.0),
        currency: row.get(30).unwrap_or_else(|_| "INR".to_string()),
        tax_rate_id: row.get(31).ok(),
        is_taxable: row.get(32).unwrap_or(1),
        tax_inclusive: row.get(33).unwrap_or(0),
        is_active: row.get(34).unwrap_or(1),
        published: row.get(35).unwrap_or(0),
        sort_order: row.get(36).unwrap_or(0),
        created_at: row.get(37).unwrap_or(0),
        updated_at: row.get(38).unwrap_or(0),
        track_inventory: row.get(39).unwrap_or(0),
        sections: row.get(40).ok(),
        hide_default_sections: row.get(41).unwrap_or(0),
        faq: row.get(42).ok(),
        additional_details: row.get(43).ok(),
        ai_summary: row.get(44).ok(),
        options: row.get(45).ok(),
        variant_group_by: row.get(46).ok(),
        has_variants: row.get(47).unwrap_or(0),
        weight: row.get(48).ok(),
        weight_unit: row.get(49).ok(),
        dim_length: row.get(50).ok(),
        width: row.get(51).ok(),
        height: row.get(52).ok(),
        dimension_unit: row.get(53).ok(),
        pack_size: row.get(54).ok(),
        conversion_factor: row.get(55).ok(),
        scheme_on: row.get(56).ok(),
        scheme_free: row.get(57).ok(),
        country_of_origin: row.get(58).ok(),
        seo_title: row.get(59).ok(),
        seo_description: row.get(60).ok(),
        seo_og_image: row.get(61).ok(),
        seo_robots: row.get(62).ok(),
        seo_block_indexing: row.get(63).unwrap_or(0),
        archived: row.get(64).unwrap_or(0),
        notes: row.get(65).ok(),
        agent_notes: row.get(66).ok(),
        creator_name: row.get(67).ok(),
        updater_name: row.get(68).ok(),
    }
}

const SELECT_COLS: &str = "i.id, i.profile_id, i.user_id, i.updated_by, i.link_id, i.affiliate_id, i.item_type, i.category_id, i.shop_category_id, i.parent_id, i.collection_id, i.brand_id, i.name, i.slug, i.description, i.external_url, i.sku, \
     i.unit_id, i.hsn_sac_code, i.media_id, i.slider_id, i.video_url, i.video_media_id, i.price, i.cost_price, i.compare_price, i.default_mrp, i.unit_price, i.discount_pct, i.extra_discount, i.currency, \
     i.tax_rate_id, i.is_taxable, i.tax_inclusive, i.is_active, i.published, i.sort_order, i.created_at, i.updated_at, i.track_inventory, i.sections, i.hide_default_sections, i.faq, i.additional_details, i.ai_summary, \
     i.options, i.variant_group_by, i.has_variants, \
     i.weight, i.weight_unit, i.dim_length, i.width, i.height, i.dimension_unit, i.pack_size, i.conversion_factor, i.scheme_on, i.scheme_free, i.country_of_origin, \
     i.seo_title, i.seo_description, i.seo_og_image, i.seo_robots, i.seo_block_indexing, i.archived, \
     i.notes, i.agent_notes, \
     COALESCE((SELECT name FROM shop_staff WHERE id = i.user_id), NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email) as creator_name, \
     COALESCE((SELECT name FROM shop_staff WHERE id = i.updated_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email) as updater_name";

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all items for the active profile. Optionally filter by item_type and include_archived.
#[tauri::command]
pub async fn shop_list_items(
    item_type: Option<String>,
    include_archived: Option<bool>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopItem>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let allow_archived = include_archived.unwrap_or(false);

    let mut rows = match (item_type, allow_archived) {
        (Some(ref t), true) => {
            conn.query(
                &format!(
                    "SELECT {SELECT_COLS} FROM shop_items i \
                          LEFT JOIN users uc ON uc.id = i.user_id \
                          LEFT JOIN users uu ON uu.id = i.updated_by \
                          WHERE i.profile_id = ?1 AND i.item_type = ?2 \
                          ORDER BY i.sort_order ASC, i.name ASC"
                ),
                crate::turso_params![profile_id, t.clone()],
            )
            .await
            .map_err(|e| e.to_string())?
        }
        (Some(ref t), false) => {
            conn.query(
                &format!(
                    "SELECT {SELECT_COLS} FROM shop_items i \
                          LEFT JOIN users uc ON uc.id = i.user_id \
                          LEFT JOIN users uu ON uu.id = i.updated_by \
                          WHERE i.profile_id = ?1 AND i.item_type = ?2 AND (i.archived = 0 OR i.archived IS NULL) AND (i.is_active = 1 OR i.is_active IS NULL) \
                          ORDER BY i.sort_order ASC, i.name ASC"
                ),
                crate::turso_params![profile_id, t.clone()],
            )
            .await
            .map_err(|e| e.to_string())?
        }
        (None, true) => {
            conn.query(
                &format!(
                    "SELECT {SELECT_COLS} FROM shop_items i \
                          LEFT JOIN users uc ON uc.id = i.user_id \
                          LEFT JOIN users uu ON uu.id = i.updated_by \
                          WHERE i.profile_id = ?1 \
                          ORDER BY i.sort_order ASC, i.name ASC"
                ),
                crate::turso_params![profile_id],
            )
            .await
            .map_err(|e| e.to_string())?
        }
        (None, false) => {
            conn.query(
                &format!(
                    "SELECT {SELECT_COLS} FROM shop_items i \
                          LEFT JOIN users uc ON uc.id = i.user_id \
                          LEFT JOIN users uu ON uu.id = i.updated_by \
                          WHERE i.profile_id = ?1 AND (i.archived = 0 OR i.archived IS NULL) AND (i.is_active = 1 OR i.is_active IS NULL) \
                          ORDER BY i.sort_order ASC, i.name ASC"
                ),
                crate::turso_params![profile_id],
            )
            .await
            .map_err(|e| e.to_string())?
        }
    };

    let mut items = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        items.push(row_to_item(row));
    }
    Ok(items)
}

/// Get a single item by id.
#[tauri::command]
pub async fn shop_get_item(
    item_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopItem, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!(
                "SELECT {SELECT_COLS} FROM shop_items i \
                 LEFT JOIN users uc ON uc.id = i.user_id \
                 LEFT JOIN users uu ON uu.id = i.updated_by \
                 WHERE i.id = ?1 AND i.profile_id = ?2"
            ),
            crate::turso_params![item_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_item(row))
    } else {
        Err("Item not found".into())
    }
}

/// Create a new shop item.
#[tauri::command]
pub async fn shop_create_item(
    data: CreateItemData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopItem, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = new_id();
    let slug_base = slugify(&data.name);
    let ts_suffix = {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    };
    let slug = format!("{}-{}", slug_base, ts_suffix);
    let user_id = match data.user_id {
        Some(ref u) if !u.trim().is_empty() => u.clone(),
        _ => state.get_current_user_id().await,
    };
    let item_type = data.item_type.unwrap_or_else(|| "physical".to_string());
    let item_currency = data.currency.unwrap_or_else(|| "INR".to_string());
    let cost_price = data.cost_price.unwrap_or(0.0);
    let compare_price = data.compare_price.filter(|&cp| cp > 0.0);
    let default_mrp = data.default_mrp.unwrap_or(0.0);
    let unit_price = data.unit_price.unwrap_or(0.0);
    let discount_pct = data.discount_pct.unwrap_or(0.0);
    let extra_discount = data.extra_discount.unwrap_or(0.0);
    let is_taxable: i64 = if data.is_taxable.unwrap_or(true) {
        1
    } else {
        0
    };
    let tax_inclusive: i64 = if data.tax_inclusive.unwrap_or(false) {
        1
    } else {
        0
    };
    let track_inventory: i64 = data.track_inventory.unwrap_or(1);
    let sections = data.sections.unwrap_or_else(|| "[]".to_string());
    let hide_default_sections: i64 = data.hide_default_sections.unwrap_or(0);
    let faq = data.faq.unwrap_or_else(|| "[]".to_string());
    let additional_details = data.additional_details.unwrap_or_else(|| "{}".to_string());
    let options = data.options.unwrap_or_else(|| "[]".to_string());
    let variant_group_by = data.variant_group_by;
    let has_variants: i64 = data.has_variants.unwrap_or(0);

    let raw_cat = data.category_id.unwrap_or_default();
    let category_id = if raw_cat.trim().is_empty() {
        "cat_6".to_string()
    } else {
        raw_cat
    };

    conn.execute(
        "INSERT INTO shop_items \
         (id, profile_id, user_id, updated_by, link_id, affiliate_id, item_type, category_id, shop_category_id, parent_id, collection_id, brand_id, name, slug, description, external_url, sku, \
          hsn_sac_code, unit_id, media_id, slider_id, video_url, video_media_id, price, cost_price, compare_price, default_mrp, unit_price, discount_pct, extra_discount, \
          currency, tax_rate_id, is_taxable, tax_inclusive, is_active, sort_order, track_inventory, sections, hide_default_sections, faq, additional_details, ai_summary, \
          options, variant_group_by, has_variants, \
          weight, weight_unit, dim_length, width, height, dimension_unit, pack_size, conversion_factor, scheme_on, scheme_free, country_of_origin, \
          seo_title, seo_description, seo_og_image, seo_robots, seo_block_indexing, notes, agent_notes) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,1,0,?35,?36,?37,?38,?39,?40,?41,?42,?43,?44,?45,?46,?47,?48,?49,?50,?51,?52,?53,?54,?55,?56,?57,?58,?59,?60,?61)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            user_id.clone(),
            user_id,
            data.link_id,
            data.affiliate_id,
            item_type.clone(),
            category_id,
            data.shop_category_id,
            data.parent_id,
            data.collection_id,
            data.brand_id,
            data.name.clone(),
            slug,
            data.description,
            data.external_url,
            data.sku,
            data.hsn_sac_code,
            data.unit_id,
            data.media_id,
            data.slider_id,
            data.video_url,
            data.video_media_id,
            data.price,
            cost_price,
            compare_price,
            default_mrp,
            unit_price,
            discount_pct,
            extra_discount,
            item_currency,
            data.tax_rate_id,
            is_taxable,
            tax_inclusive,
            track_inventory,
            sections,
            hide_default_sections,
            faq,
            additional_details,
            data.ai_summary,
            options,
            variant_group_by,
            has_variants,
            data.weight.unwrap_or(0.0),
            data.weight_unit.unwrap_or_else(|| "kg".to_string()),
            data.dim_length.unwrap_or(0.0),
            data.width.unwrap_or(0.0),
            data.height.unwrap_or(0.0),
            data.dimension_unit.unwrap_or_else(|| "cm".to_string()),
            data.pack_size,
            data.conversion_factor.unwrap_or(1.0),
            data.scheme_on.unwrap_or(0.0),
            data.scheme_free.unwrap_or(0.0),
            data.country_of_origin,
            data.seo_title,
            data.seo_description,
            data.seo_og_image,
            data.seo_robots,
            data.seo_block_indexing.unwrap_or(0),
            data.notes,
            data.agent_notes
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    if item_type == "stay" || item_type == "booking" {
        conn.execute(
            "INSERT OR REPLACE INTO shop_locations \
             (id, profile_id, location_type, name, base_rate, status, is_active) \
             VALUES (?, ?, 'room', ?, ?, 'available', 1)",
            crate::turso_params![
                id.clone(),
                profile_id.clone(),
                data.name,
                data.price,
            ],
        )
        .await
        .ok();
    }

    shop_get_item(id, state).await
}

/// Update an existing shop item (only provided fields are changed).
#[tauri::command]
pub async fn shop_update_item(
    item_id: String,
    data: UpdateItemData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopItem, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let active_user_id = match data.updated_by {
        Some(ref u) if !u.trim().is_empty() => u.clone(),
        _ => state.get_current_user_id().await,
    };

    let mut sets: Vec<&'static str> = Vec::with_capacity(60);
    let mut params: Vec<crate::db::turso::TursoParam> = Vec::with_capacity(60);

    sets.push("updated_by = ?");
    params.push(active_user_id.into());

    sets.push("updated_at = strftime('%s','now')");

    if let Some(ref name) = data.name {
        let slug = slugify(name);
        sets.push("name = ?");
        params.push(name.clone().into());
        sets.push("slug = ?");
        params.push(slug.into());
    }
    if let Some(ref v) = data.link_id {
        sets.push("link_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.affiliate_id {
        sets.push("affiliate_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.external_url {
        sets.push("external_url = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.media_id {
        sets.push("media_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.slider_id {
        sets.push("slider_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.video_url {
        sets.push("video_url = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.video_media_id {
        sets.push("video_media_id = ?");
        params.push(v.clone().into());
    }
    if let Some(v) = data.price {
        sets.push("price = ?");
        params.push(v.into());
    }
    if let Some(v) = data.cost_price {
        sets.push("cost_price = ?");
        params.push(v.into());
    }
    if let Some(v) = data.compare_price {
        sets.push("compare_price = ?");
        if v <= 0.0 {
            params.push(Option::<f64>::None.into());
        } else {
            params.push(v.into());
        }
    }
    if let Some(v) = data.default_mrp {
        sets.push("default_mrp = ?");
        params.push(v.into());
    }
    if let Some(v) = data.unit_price {
        sets.push("unit_price = ?");
        params.push(v.into());
    }
    if let Some(v) = data.discount_pct {
        sets.push("discount_pct = ?");
        params.push(v.into());
    }
    if let Some(v) = data.extra_discount {
        sets.push("extra_discount = ?");
        params.push(v.into());
    }
    if let Some(ref v) = data.category_id {
        sets.push("category_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.shop_category_id {
        sets.push("shop_category_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.parent_id {
        sets.push("parent_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.collection_id {
        sets.push("collection_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.brand_id {
        sets.push("brand_id = ?");
        if v.trim().is_empty() || v == "none" {
            params.push(Option::<String>::None.into());
        } else {
            params.push(Some(v.clone()).into());
        }
    }
    if let Some(ref v) = data.unit_id {
        sets.push("unit_id = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.description {
        sets.push("description = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.sku {
        sets.push("sku = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.hsn_sac_code {
        sets.push("hsn_sac_code = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.currency {
        sets.push("currency = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.tax_rate_id {
        sets.push("tax_rate_id = ?");
        if v.trim().is_empty() || v == "none" {
            params.push(Option::<String>::None.into());
        } else {
            params.push(Some(v.clone()).into());
        }
    }
    if let Some(v) = data.is_taxable {
        sets.push("is_taxable = ?");
        params.push((if v { 1_i64 } else { 0_i64 }).into());
    }
    if let Some(v) = data.tax_inclusive {
        sets.push("tax_inclusive = ?");
        params.push((if v { 1_i64 } else { 0_i64 }).into());
    }
    if let Some(v) = data.is_active {
        sets.push("is_active = ?");
        params.push((if v { 1_i64 } else { 0_i64 }).into());
    }
    if let Some(v) = data.track_inventory {
        sets.push("track_inventory = ?");
        params.push(v.into());
    }
    if let Some(v) = data.published {
        sets.push("published = ?");
        params.push(v.into());
    }
    if let Some(ref v) = data.sections {
        sets.push("sections = ?");
        params.push(v.clone().into());
    }
    if let Some(v) = data.hide_default_sections {
        sets.push("hide_default_sections = ?");
        params.push(v.into());
    }
    if let Some(ref v) = data.faq {
        sets.push("faq = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.additional_details {
        sets.push("additional_details = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.ai_summary {
        sets.push("ai_summary = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.options {
        sets.push("options = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.variant_group_by {
        sets.push("variant_group_by = ?");
        params.push(v.clone().into());
    }
    if let Some(v) = data.has_variants {
        sets.push("has_variants = ?");
        params.push(v.into());
    }
    if let Some(v) = data.weight {
        sets.push("weight = ?");
        params.push(v.into());
    }
    if let Some(ref v) = data.weight_unit {
        sets.push("weight_unit = ?");
        params.push(v.clone().into());
    }
    if let Some(v) = data.dim_length {
        sets.push("dim_length = ?");
        params.push(v.into());
    }
    if let Some(v) = data.width {
        sets.push("width = ?");
        params.push(v.into());
    }
    if let Some(v) = data.height {
        sets.push("height = ?");
        params.push(v.into());
    }
    if let Some(ref v) = data.dimension_unit {
        sets.push("dimension_unit = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.pack_size {
        sets.push("pack_size = ?");
        params.push(v.clone().into());
    }
    if let Some(v) = data.conversion_factor {
        sets.push("conversion_factor = ?");
        params.push(v.into());
    }
    if let Some(v) = data.scheme_on {
        sets.push("scheme_on = ?");
        params.push(v.into());
    }
    if let Some(v) = data.scheme_free {
        sets.push("scheme_free = ?");
        params.push(v.into());
    }
    if let Some(ref v) = data.country_of_origin {
        sets.push("country_of_origin = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.seo_title {
        sets.push("seo_title = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.seo_description {
        sets.push("seo_description = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.seo_og_image {
        sets.push("seo_og_image = ?");
        params.push(v.clone().into());
    }
    if let Some(ref v) = data.seo_robots {
        sets.push("seo_robots = ?");
        params.push(v.clone().into());
    }
    if let Some(v) = data.seo_block_indexing {
        sets.push("seo_block_indexing = ?");
        params.push(v.into());
    }
    if let Some(v) = data.archived {
        sets.push("archived = ?");
        params.push(v.into());
    }
    if let Some(ref v) = data.notes {
        sets.push("notes = ?");
        if v.trim().is_empty() {
            params.push(Option::<String>::None.into());
        } else {
            params.push(Some(v.clone()).into());
        }
    }
    if let Some(ref v) = data.agent_notes {
        sets.push("agent_notes = ?");
        if v.trim().is_empty() {
            params.push(Option::<String>::None.into());
        } else {
            params.push(Some(v.clone()).into());
        }
    }

    params.push(item_id.clone().into());
    params.push(profile_id.clone().into());

    let sql = format!(
        "UPDATE shop_items SET {} WHERE id = ? AND profile_id = ?",
        sets.join(", ")
    );

    conn.execute(&sql, params)
        .await
        .map_err(|e| e.to_string())?;

    shop_get_item(item_id, state).await
}

// ── Batch Item Commands ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemBatch {
    pub id: String,
    pub profile_id: String,
    pub item_id: String,
    pub batch_no: String,
    pub mfg_date: Option<i64>,
    pub expiry_date: Option<i64>,
    pub qty_received: f64,
    pub qty_remaining: f64,
    pub purchase_price: f64,
    pub mrp: f64,
    pub landing_cost: f64,
    pub pack_size: Option<String>,
    pub conversion_factor: f64,
    pub shelf_location: Option<String>,
    pub is_active: i64,
    pub created_at: i64,
}

/// List active batches with available stock for a specific item (FEFO ordered).
#[tauri::command]
pub async fn shop_list_item_batches(
    item_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ItemBatch>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, item_id, batch_no, mfg_date, expiry_date, \
             qty_received, qty_remaining, purchase_price, mrp, landing_cost, \
             pack_size, conversion_factor, shelf_location, is_active, created_at \
             FROM shop_item_batches \
             WHERE profile_id = ?1 AND item_id = ?2 AND is_active = 1 \
             ORDER BY expiry_date ASC, created_at ASC",
            crate::turso_params![profile_id, item_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(ItemBatch {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            item_id: row.get(2).unwrap_or_default(),
            batch_no: row.get(3).unwrap_or_default(),
            mfg_date: row.get(4).ok(),
            expiry_date: row.get(5).ok(),
            qty_received: row.get(6).unwrap_or(0.0),
            qty_remaining: row.get(7).unwrap_or(0.0),
            purchase_price: row.get(8).unwrap_or(0.0),
            mrp: row.get(9).unwrap_or(0.0),
            landing_cost: row.get(10).unwrap_or(0.0),
            pack_size: row.get(11).ok(),
            conversion_factor: row.get(12).unwrap_or(1.0),
            shelf_location: row.get(13).ok(),
            is_active: row.get(14).unwrap_or(1),
            created_at: row.get(15).unwrap_or(0),
        });
    }
    Ok(list)
}

/// List all active batches with qty_remaining > 0 across all items for fast in-memory POS billing.
#[tauri::command]
pub async fn shop_list_all_active_batches(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ItemBatch>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, item_id, batch_no, mfg_date, expiry_date, \
             qty_received, qty_remaining, purchase_price, mrp, landing_cost, \
             pack_size, conversion_factor, shelf_location, is_active, created_at \
             FROM shop_item_batches \
             WHERE profile_id = ?1 AND is_active = 1 \
             ORDER BY expiry_date ASC, created_at ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(ItemBatch {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            item_id: row.get(2).unwrap_or_default(),
            batch_no: row.get(3).unwrap_or_default(),
            mfg_date: row.get(4).ok(),
            expiry_date: row.get(5).ok(),
            qty_received: row.get(6).unwrap_or(0.0),
            qty_remaining: row.get(7).unwrap_or(0.0),
            purchase_price: row.get(8).unwrap_or(0.0),
            mrp: row.get(9).unwrap_or(0.0),
            landing_cost: row.get(10).unwrap_or(0.0),
            pack_size: row.get(11).ok(),
            conversion_factor: row.get(12).unwrap_or(1.0),
            shelf_location: row.get(13).ok(),
            is_active: row.get(14).unwrap_or(1),
            created_at: row.get(15).unwrap_or(0),
        });
    }
    Ok(list)
}

/// Soft-delete / archive (set archived = 1) a shop item.
#[tauri::command]
pub async fn shop_delete_item(
    item_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_items SET archived = 1, archived_at = strftime('%s','now'), updated_at = strftime('%s','now') \
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![item_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_locations SET archived = 1, archived_at = strftime('%s','now'), updated_at = strftime('%s','now') \
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![item_id, profile_id],
    )
    .await
    .ok();

    Ok(())
}
