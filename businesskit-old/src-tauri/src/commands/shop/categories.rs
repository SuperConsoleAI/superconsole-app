// src-tauri/src/commands/shop/categories.rs
//
// Shop category commands — Phase 1
//
// Commands:
//   shop_list_categories   — flat list (with parent_id) for active profile
//   shop_create_category   — insert new row, returns full ShopCategory
//   shop_update_category   — name / slug / parent_id update
//   shop_delete_category   — soft-deactivate (is_active = 0)

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopCategory {
    pub id: String,
    pub profile_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub slug: String,
    pub sort_order: i64,
    pub is_default: i64,
    pub is_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryData {
    pub name: String,
    pub slug: Option<String>,
    pub parent_id: Option<String>,
    pub is_default: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryData {
    pub name: String,
    pub slug: Option<String>,
    pub parent_id: Option<String>,
    pub is_default: Option<i64>,
}

fn make_slug(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── Commands ──────────────────────────────────────────────────────────────────

pub struct PresetCategory {
    pub id: &'static str,
    pub parent_id: Option<&'static str>,
    pub name: &'static str,
    pub slug: &'static str,
}

pub const PRESET_SHOP_CATEGORIES: &[PresetCategory] = &[
    // ── Standard Shopify / Google Product Taxonomy Top-Level Parent Categories ──
    PresetCategory { id: "pet_supplies", parent_id: None, name: "Animals & Pet Supplies", slug: "animals-pet-supplies" },

    PresetCategory { id: "apparel", parent_id: None, name: "Apparel & Accessories", slug: "apparel-accessories" },
    PresetCategory { id: "apparel_clothing", parent_id: Some("apparel"), name: "Clothing & Wear", slug: "clothing-wear" },
    PresetCategory { id: "apparel_shoes", parent_id: Some("apparel"), name: "Footwear & Shoes", slug: "footwear-shoes" },

    PresetCategory { id: "arts_entertainment", parent_id: None, name: "Arts & Entertainment", slug: "arts-entertainment" },
    PresetCategory { id: "baby_toddler", parent_id: None, name: "Baby & Toddler", slug: "baby-toddler" },
    PresetCategory { id: "business_industrial", parent_id: None, name: "Business & Industrial", slug: "business-industrial" },
    PresetCategory { id: "cameras_optics", parent_id: None, name: "Cameras & Optics", slug: "cameras-optics" },

    PresetCategory { id: "electronics", parent_id: None, name: "Electronics", slug: "electronics" },
    PresetCategory { id: "elec_mobile", parent_id: Some("electronics"), name: "Mobiles & Accessories", slug: "mobiles-accessories" },
    PresetCategory { id: "elec_computers", parent_id: Some("electronics"), name: "Computers & Tech", slug: "computers-tech" },

    PresetCategory { id: "food_beverage", parent_id: None, name: "Food, Beverages & Tobacco", slug: "food-beverages-tobacco" },
    PresetCategory { id: "food_dishes", parent_id: Some("food_beverage"), name: "Dishes & Main Course", slug: "dishes-main-course" },
    PresetCategory { id: "food_starters", parent_id: Some("food_beverage"), name: "Appetizers & Starters", slug: "appetizers-starters" },
    PresetCategory { id: "food_drinks", parent_id: Some("food_beverage"), name: "Beverages & Drinks", slug: "beverages-drinks" },
    PresetCategory { id: "food_desserts", parent_id: Some("food_beverage"), name: "Desserts & Bakery", slug: "desserts-bakery" },

    PresetCategory { id: "furniture", parent_id: None, name: "Furniture", slug: "furniture" },
    PresetCategory { id: "hardware", parent_id: None, name: "Hardware", slug: "hardware" },
    PresetCategory { id: "health_beauty", parent_id: None, name: "Health & Beauty", slug: "health-beauty" },
    PresetCategory { id: "health_personal_care", parent_id: Some("health_beauty"), name: "Personal Care & Hygiene", slug: "personal-care-hygiene" },
    PresetCategory { id: "health_cosmetics", parent_id: Some("health_beauty"), name: "Cosmetics & Skincare", slug: "cosmetics-skincare" },

    // ── Medicine, Pharmacy & Healthcare ──
    PresetCategory { id: "medical_pharma", parent_id: None, name: "Medicine & Pharmacy", slug: "medicine-pharmacy" },
    PresetCategory { id: "med_rx", parent_id: Some("medical_pharma"), name: "Prescription Medicines (Rx)", slug: "prescription-medicines" },
    PresetCategory { id: "med_otc", parent_id: Some("medical_pharma"), name: "Over-the-Counter (OTC)", slug: "over-the-counter" },
    PresetCategory { id: "med_supplements", parent_id: Some("medical_pharma"), name: "Vitamins & Supplements", slug: "vitamins-supplements" },
    PresetCategory { id: "med_supplies", parent_id: Some("medical_pharma"), name: "Medical Devices & Supplies", slug: "medical-devices-supplies" },
    PresetCategory { id: "med_first_aid", parent_id: Some("medical_pharma"), name: "First Aid & Wound Care", slug: "first-aid-wound-care" },
    PresetCategory { id: "med_ayurveda", parent_id: Some("medical_pharma"), name: "Ayurvedic & Herbal Care", slug: "ayurvedic-herbal-care" },

    PresetCategory { id: "home_garden", parent_id: None, name: "Home & Garden", slug: "home-garden" },
    PresetCategory { id: "home_decor", parent_id: Some("home_garden"), name: "Furniture & Decor", slug: "furniture-decor" },

    PresetCategory { id: "luggage_bags", parent_id: None, name: "Luggage & Bags", slug: "luggage-bags" },
    PresetCategory { id: "mature", parent_id: None, name: "Mature", slug: "mature" },
    PresetCategory { id: "media", parent_id: None, name: "Media", slug: "media" },
    PresetCategory { id: "office_supplies", parent_id: None, name: "Office Supplies", slug: "office-supplies" },
    PresetCategory { id: "religious_ceremonial", parent_id: None, name: "Religious & Ceremonial", slug: "religious-ceremonial" },
    PresetCategory { id: "software", parent_id: None, name: "Software", slug: "software" },
    PresetCategory { id: "sporting_goods", parent_id: None, name: "Sporting Goods", slug: "sporting-goods" },
    PresetCategory { id: "toys_games", parent_id: None, name: "Toys & Games", slug: "toys-games" },
    PresetCategory { id: "vehicles_parts", parent_id: None, name: "Vehicles & Parts", slug: "vehicles-parts" },

    PresetCategory { id: "gift_cards", parent_id: None, name: "Gift Cards", slug: "gift-cards" },
    PresetCategory { id: "uncategorized", parent_id: None, name: "Uncategorized", slug: "uncategorized" },
    PresetCategory { id: "services", parent_id: None, name: "Services", slug: "services" },
    PresetCategory { id: "product_addons", parent_id: None, name: "Product Add-Ons", slug: "product-add-ons" },
    PresetCategory { id: "bundles", parent_id: None, name: "Bundles", slug: "bundles" },

    // ── Hotel & Accommodations (Stays / Rooms) ──
    PresetCategory { id: "accommodations", parent_id: None, name: "Hotel & Accommodations", slug: "hotel-accommodations" },
    PresetCategory { id: "stay_rooms", parent_id: Some("accommodations"), name: "Rooms & Suites", slug: "rooms-suites" },
    PresetCategory { id: "stay_villas", parent_id: Some("accommodations"), name: "Villas & Cabins", slug: "villas-cabins" },
    PresetCategory { id: "stay_events", parent_id: Some("accommodations"), name: "Banquet & Event Spaces", slug: "banquet-event-spaces" },
];

/// Seed standard preset categories (Shopify-style taxonomy) for the active profile.
#[tauri::command]
pub async fn shop_seed_categories(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopCategory>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    for (idx, cat) in PRESET_SHOP_CATEGORIES.iter().enumerate() {
        let cat_id = format!("{}_{}", profile_id, cat.id);
        let parent_cat_id = cat.parent_id.map(|pid| format!("{}_{}", profile_id, pid));
        let _ = conn
            .execute(
                "INSERT INTO shop_categories \
                 (id, profile_id, parent_id, name, slug, sort_order, is_active) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1) \
                 ON CONFLICT(id) DO UPDATE SET \
                   name=excluded.name, \
                   slug=excluded.slug, \
                   parent_id=excluded.parent_id, \
                   sort_order=excluded.sort_order, \
                   is_active=1",
                crate::turso_params![
                    cat_id,
                    profile_id.clone(),
                    parent_cat_id,
                    cat.name.to_string(),
                    cat.slug.to_string(),
                    idx as i64
                ],
            )
            .await;
    }

    let mut rows = conn
        .query(
            "SELECT id, profile_id, parent_id, name, slug, sort_order, is_default, is_active \
         FROM shop_categories \
         WHERE profile_id = ? AND is_active = 1 \
         ORDER BY is_default DESC, sort_order ASC, name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut cats = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        cats.push(ShopCategory {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            parent_id: row.get(2).ok(),
            name: row.get(3).unwrap_or_default(),
            slug: row.get(4).unwrap_or_default(),
            sort_order: row.get(5).unwrap_or(0),
            is_default: row.get(6).unwrap_or(0),
            is_active: row.get(7).unwrap_or(1),
        });
    }
    Ok(cats)
}

/// List all active categories for the active profile, ordered by sort_order then name.
/// Auto-seeds preset standard taxonomy if no categories exist yet.
#[tauri::command]
pub async fn shop_list_categories(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopCategory>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, parent_id, name, slug, sort_order, is_default, is_active \
         FROM shop_categories \
         WHERE profile_id = ? AND is_active = 1 \
         ORDER BY is_default DESC, sort_order ASC, name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut cats = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        cats.push(ShopCategory {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            parent_id: row.get(2).ok(),
            name: row.get(3).unwrap_or_default(),
            slug: row.get(4).unwrap_or_default(),
            sort_order: row.get(5).unwrap_or(0),
            is_default: row.get(6).unwrap_or(0),
            is_active: row.get(7).unwrap_or(1),
        });
    }

    if cats.is_empty() {
        return shop_seed_categories(state).await;
    }

    Ok(cats)
}

/// Create a new category for the active profile.
#[tauri::command]
pub async fn shop_create_category(
    data: CreateCategoryData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopCategory, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let id = format!("cat-{}", ts);
    let slug = data
        .slug
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| make_slug(&data.name));
    let is_default = data.is_default.unwrap_or(0);

    if is_default == 1 {
        let _ = conn
            .execute(
                "UPDATE shop_categories SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    conn.execute(
        "INSERT INTO shop_categories \
         (id, profile_id, parent_id, name, slug, sort_order, is_default, is_active) \
         VALUES (?, ?, ?, ?, ?, 0, ?, 1)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.parent_id.clone(),
            data.name.clone(),
            slug.clone(),
            is_default,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ShopCategory {
        id,
        profile_id,
        parent_id: data.parent_id,
        name: data.name,
        slug,
        sort_order: 0,
        is_default,
        is_active: 1,
    })
}

/// Update an existing category's name, slug, or parent.
#[tauri::command]
pub async fn shop_update_category(
    category_id: String,
    data: UpdateCategoryData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopCategory, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let slug = data
        .slug
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| make_slug(&data.name));

    if let Some(1) = data.is_default {
        let _ = conn
            .execute(
                "UPDATE shop_categories SET is_default = 0 WHERE profile_id = ?",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    if let Some(def) = data.is_default {
        conn.execute(
            "UPDATE shop_categories \
             SET name = ?, slug = ?, parent_id = ?, is_default = ? \
             WHERE id = ? AND profile_id = ?",
            crate::turso_params![
                data.name.clone(),
                slug.clone(),
                data.parent_id.clone(),
                def,
                category_id.clone(),
                profile_id.clone(),
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE shop_categories \
             SET name = ?, slug = ?, parent_id = ? \
             WHERE id = ? AND profile_id = ?",
            crate::turso_params![
                data.name.clone(),
                slug.clone(),
                data.parent_id.clone(),
                category_id.clone(),
                profile_id.clone(),
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    let is_default = data.is_default.unwrap_or(0);

    Ok(ShopCategory {
        id: category_id,
        profile_id,
        parent_id: data.parent_id,
        name: data.name,
        slug,
        sort_order: 0,
        is_default,
        is_active: 1,
    })
}

/// Set a category as default for the active profile.
#[tauri::command]
pub async fn shop_set_default_category(
    category_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_categories SET is_default = 0 WHERE profile_id = ?",
        crate::turso_params![profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_categories SET is_default = 1 WHERE id = ? AND profile_id = ?",
        crate::turso_params![category_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Soft-delete a category (sets is_active = 0). Products keep their category_id.
#[tauri::command]
pub async fn shop_delete_category(
    category_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_categories SET is_active = 0 WHERE id = ? AND profile_id = ?",
        crate::turso_params![category_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
