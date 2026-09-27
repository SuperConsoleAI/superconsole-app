// src-tauri/src/commands/shop/discounts.rs
//
// Shop Discount Codes & Coupons management.
// Backed by `shop_discount_codes` table in `shop-ops.rs`.
//
// Commands:
//   shop_list_discount_codes     → list all discount codes for the current profile
//   shop_create_discount_code   → create a new coupon code
//   shop_update_discount_code   → update existing discount code
//   shop_delete_discount_code   → delete a discount code by ID
//   shop_validate_discount_code → validate a code against an order amount

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopDiscountCode {
    pub id: String,
    pub profile_id: String,
    pub user_id: String,
    pub updated_by: String,
    pub code: String,
    pub discount_type: String, // 'percent' | 'flat' | 'free_shipping' | 'bogo'
    pub value: f64,
    pub min_order_value: f64,
    pub max_discount: Option<f64>,
    pub usage_limit: Option<i64>,
    pub usage_count: i64,
    pub per_customer_limit: i64,
    pub eligible_items: String,
    pub valid_from: Option<i64>,
    pub valid_until: Option<i64>,
    pub is_active: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub creator_name: Option<String>,
    pub updater_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDiscountCodeData {
    pub user_id: Option<String>,
    pub code: String,
    pub discount_type: Option<String>,
    pub value: Option<f64>,
    pub min_order_value: Option<f64>,
    pub max_discount: Option<f64>,
    pub usage_limit: Option<i64>,
    pub per_customer_limit: Option<i64>,
    pub eligible_items: Option<String>,
    pub valid_from: Option<i64>,
    pub valid_until: Option<i64>,
    pub is_active: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDiscountCodeData {
    pub id: String,
    pub updated_by: Option<String>,
    pub code: Option<String>,
    pub discount_type: Option<String>,
    pub value: Option<f64>,
    pub min_order_value: Option<f64>,
    pub max_discount: Option<f64>,
    pub usage_limit: Option<i64>,
    pub per_customer_limit: Option<i64>,
    pub eligible_items: Option<String>,
    pub valid_from: Option<i64>,
    pub valid_until: Option<i64>,
    pub is_active: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateDiscountResult {
    pub is_valid: bool,
    pub reason: Option<String>,
    pub discount_code: Option<ShopDiscountCode>,
    pub discount_amount: f64,
}

/// List all discount codes for the current active profile.
#[tauri::command]
pub async fn shop_list_discount_codes(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopDiscountCode>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.code, d.discount_type, d.value, d.min_order_value, \
                    d.max_discount, d.usage_limit, d.usage_count, d.per_customer_limit, \
                    d.eligible_items, d.valid_from, d.valid_until, d.is_active, d.created_at, d.updated_at, \
                    COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email) as creator_name, \
                    COALESCE(NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email) as updater_name \
             FROM shop_discount_codes d \
             LEFT JOIN users uc ON uc.id = d.user_id \
             LEFT JOIN users uu ON uu.id = d.updated_by \
             WHERE d.profile_id = ? \
             ORDER BY d.created_at DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(ShopDiscountCode {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            user_id: row.get(2).unwrap_or_else(|_| "owner".to_string()),
            updated_by: row.get(3).unwrap_or_else(|_| "owner".to_string()),
            code: row.get(4).unwrap_or_default(),
            discount_type: row.get(5).unwrap_or_else(|_| "percent".to_string()),
            value: row.get(6).unwrap_or(0.0),
            min_order_value: row.get(7).unwrap_or(0.0),
            max_discount: row.get(8).ok(),
            usage_limit: row.get(9).ok(),
            usage_count: row.get(10).unwrap_or(0),
            per_customer_limit: row.get(11).unwrap_or(1),
            eligible_items: row.get(12).unwrap_or_else(|_| "[]".to_string()),
            valid_from: row.get(13).ok(),
            valid_until: row.get(14).ok(),
            is_active: row.get(15).unwrap_or(1),
            created_at: row.get(16).unwrap_or(0),
            updated_at: row.get(17).unwrap_or(0),
            creator_name: row.get(18).ok(),
            updater_name: row.get(19).ok(),
        });
    }
    Ok(out)
}

/// Create a new discount code.
#[tauri::command]
pub async fn shop_create_discount_code(
    data: CreateDiscountCodeData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopDiscountCode, String> {
    let normalized_code = data.code.trim().to_uppercase();
    if normalized_code.is_empty() {
        return Err("Discount code cannot be empty".into());
    }

    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Check duplicate code within profile
    let mut check_rows = conn
        .query(
            "SELECT id FROM shop_discount_codes WHERE profile_id = ? AND code = ? LIMIT 1",
            crate::turso_params![profile_id.clone(), normalized_code.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    if let Ok(Some(_)) = check_rows.next().await {
        return Err(format!("Discount code '{}' already exists", normalized_code));
    }

    let user_id = match data.user_id {
        Some(ref u) if !u.trim().is_empty() => u.clone(),
        _ => state.get_current_user_id().await,
    };
    let updated_by = user_id.clone();
    let id = new_id("disc");
    let discount_type = data.discount_type.unwrap_or_else(|| "percent".to_string());
    let value = data.value.unwrap_or(0.0).max(0.0);
    let min_order_value = data.min_order_value.unwrap_or(0.0).max(0.0);
    let max_discount = data.max_discount.filter(|v| *v > 0.0);
    let usage_limit = data.usage_limit.filter(|l| *l > 0);
    let per_customer_limit = data.per_customer_limit.unwrap_or(1).max(1);
    let eligible_items = data.eligible_items.unwrap_or_else(|| "[]".to_string());
    let valid_from = data.valid_from;
    let valid_until = data.valid_until;
    let is_active = data.is_active.unwrap_or(1);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO shop_discount_codes \
         (id, profile_id, user_id, updated_by, code, discount_type, value, min_order_value, \
          max_discount, usage_limit, usage_count, per_customer_limit, \
          eligible_items, valid_from, valid_until, is_active, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            user_id.clone(),
            updated_by.clone(),
            normalized_code.clone(),
            discount_type.clone(),
            value,
            min_order_value,
            max_discount,
            usage_limit,
            per_customer_limit,
            eligible_items.clone(),
            valid_from,
            valid_until,
            is_active,
            now,
            now
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ShopDiscountCode {
        id,
        profile_id,
        user_id,
        updated_by,
        code: normalized_code,
        discount_type,
        value,
        min_order_value,
        max_discount,
        usage_limit,
        usage_count: 0,
        per_customer_limit,
        eligible_items,
        valid_from,
        valid_until,
        is_active,
        created_at: now,
        updated_at: now,
        creator_name: None,
        updater_name: None,
    })
}

/// Update an existing discount code.
#[tauri::command]
pub async fn shop_update_discount_code(
    data: UpdateDiscountCodeData,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopDiscountCode, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Check duplicate code if code was changed
    if let Some(code_val) = &data.code {
        let normalized = code_val.trim().to_uppercase();
        if normalized.is_empty() {
            return Err("Discount code cannot be empty".into());
        }
        let mut check_rows = conn
            .query(
                "SELECT id FROM shop_discount_codes WHERE profile_id = ? AND code = ? AND id != ? LIMIT 1",
                crate::turso_params![profile_id.clone(), normalized, data.id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        if let Ok(Some(_)) = check_rows.next().await {
            return Err("Another discount code with this name already exists".into());
        }
    }

    let active_user_id = match data.updated_by {
        Some(ref u) if !u.trim().is_empty() => u.clone(),
        _ => state.get_current_user_id().await,
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let mut sets = Vec::new();
    let mut params = Vec::new();

    if let Some(code) = data.code {
        sets.push("code = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(code.trim().to_uppercase()));
    }
    if let Some(dtype) = data.discount_type {
        sets.push("discount_type = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(dtype));
    }
    if let Some(val) = data.value {
        sets.push("value = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(val.max(0.0)));
    }
    if let Some(mov) = data.min_order_value {
        sets.push("min_order_value = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(mov.max(0.0)));
    }
    if let Some(md) = data.max_discount {
        sets.push("max_discount = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(if md > 0.0 { Some(md) } else { None }));
    }
    if let Some(ul) = data.usage_limit {
        sets.push("usage_limit = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(if ul > 0 { Some(ul) } else { None }));
    }
    if let Some(pcl) = data.per_customer_limit {
        sets.push("per_customer_limit = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(pcl.max(1)));
    }
    if let Some(ei) = data.eligible_items {
        sets.push("eligible_items = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(ei));
    }
    if let Some(vf) = data.valid_from {
        sets.push("valid_from = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(if vf > 0 { Some(vf) } else { None }));
    }
    if let Some(vu) = data.valid_until {
        sets.push("valid_until = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(if vu > 0 { Some(vu) } else { None }));
    }
    if let Some(active) = data.is_active {
        sets.push("is_active = ?".to_string());
        params.push(crate::db::turso::TursoParam::from(active));
    }

    sets.push("updated_by = ?".to_string());
    params.push(crate::db::turso::TursoParam::from(active_user_id));
    sets.push("updated_at = ?".to_string());
    params.push(crate::db::turso::TursoParam::from(now));

    params.push(crate::db::turso::TursoParam::from(data.id.clone()));
    params.push(crate::db::turso::TursoParam::from(profile_id.clone()));
    let sql = format!(
        "UPDATE shop_discount_codes SET {} WHERE id = ? AND profile_id = ?",
        sets.join(", ")
    );
    conn.execute(&sql, params).await.map_err(|e| e.to_string())?;

    // Return updated record
    let mut rows = conn
        .query(
            "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.code, d.discount_type, d.value, d.min_order_value, \
                    d.max_discount, d.usage_limit, d.usage_count, d.per_customer_limit, \
                    d.eligible_items, d.valid_from, d.valid_until, d.is_active, d.created_at, d.updated_at, \
                    COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email) as creator_name, \
                    COALESCE(NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email) as updater_name \
             FROM shop_discount_codes d \
             LEFT JOIN users uc ON uc.id = d.user_id \
             LEFT JOIN users uu ON uu.id = d.updated_by \
             WHERE d.id = ? AND d.profile_id = ? LIMIT 1",
            crate::turso_params![data.id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(ShopDiscountCode {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            user_id: row.get(2).unwrap_or_else(|_| "owner".to_string()),
            updated_by: row.get(3).unwrap_or_else(|_| "owner".to_string()),
            code: row.get(4).unwrap_or_default(),
            discount_type: row.get(5).unwrap_or_else(|_| "percent".to_string()),
            value: row.get(6).unwrap_or(0.0),
            min_order_value: row.get(7).unwrap_or(0.0),
            max_discount: row.get(8).ok(),
            usage_limit: row.get(9).ok(),
            usage_count: row.get(10).unwrap_or(0),
            per_customer_limit: row.get(11).unwrap_or(1),
            eligible_items: row.get(12).unwrap_or_else(|_| "[]".to_string()),
            valid_from: row.get(13).ok(),
            valid_until: row.get(14).ok(),
            is_active: row.get(15).unwrap_or(1),
            created_at: row.get(16).unwrap_or(0),
            updated_at: row.get(17).unwrap_or(0),
            creator_name: row.get(18).ok(),
            updater_name: row.get(19).ok(),
        })
    } else {
        Err("Discount code not found".into())
    }
}

/// Delete a discount code by ID.
#[tauri::command]
pub async fn shop_delete_discount_code(
    id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM shop_discount_codes WHERE id = ? AND profile_id = ?",
        crate::turso_params![id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Validate a discount code against order cart subtotal.
#[tauri::command]
pub async fn shop_validate_discount_code(
    code: String,
    order_subtotal: f64,
    state: State<'_, Arc<AppState>>,
) -> Result<ValidateDiscountResult, String> {
    let normalized = code.trim().to_uppercase();
    if normalized.is_empty() {
        return Ok(ValidateDiscountResult {
            is_valid: false,
            reason: Some("No coupon code provided".into()),
            discount_code: None,
            discount_amount: 0.0,
        });
    }

    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.code, d.discount_type, d.value, d.min_order_value, \
                    d.max_discount, d.usage_limit, d.usage_count, d.per_customer_limit, \
                    d.eligible_items, d.valid_from, d.valid_until, d.is_active, d.created_at, d.updated_at, \
                    COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email) as creator_name, \
                    COALESCE(NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email) as updater_name \
             FROM shop_discount_codes d \
             LEFT JOIN users uc ON uc.id = d.user_id \
             LEFT JOIN users uu ON uu.id = d.updated_by \
             WHERE d.profile_id = ? AND d.code = ? LIMIT 1",
            crate::turso_params![profile_id, normalized],
        )
        .await
        .map_err(|e| e.to_string())?;

    let disc = if let Ok(Some(row)) = rows.next().await {
        ShopDiscountCode {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            user_id: row.get(2).unwrap_or_else(|_| "owner".to_string()),
            updated_by: row.get(3).unwrap_or_else(|_| "owner".to_string()),
            code: row.get(4).unwrap_or_default(),
            discount_type: row.get(5).unwrap_or_else(|_| "percent".to_string()),
            value: row.get(6).unwrap_or(0.0),
            min_order_value: row.get(7).unwrap_or(0.0),
            max_discount: row.get(8).ok(),
            usage_limit: row.get(9).ok(),
            usage_count: row.get(10).unwrap_or(0),
            per_customer_limit: row.get(11).unwrap_or(1),
            eligible_items: row.get(12).unwrap_or_else(|_| "[]".to_string()),
            valid_from: row.get(13).ok(),
            valid_until: row.get(14).ok(),
            is_active: row.get(15).unwrap_or(1),
            created_at: row.get(16).unwrap_or(0),
            updated_at: row.get(17).unwrap_or(0),
            creator_name: row.get(18).ok(),
            updater_name: row.get(19).ok(),
        }
    } else {
        return Ok(ValidateDiscountResult {
            is_valid: false,
            reason: Some("Coupon code not found".into()),
            discount_code: None,
            discount_amount: 0.0,
        });
    };

    if disc.is_active == 0 {
        return Ok(ValidateDiscountResult {
            is_valid: false,
            reason: Some("This coupon code is currently disabled".into()),
            discount_code: Some(disc),
            discount_amount: 0.0,
        });
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    if let Some(start) = disc.valid_from {
        if now < start {
            return Ok(ValidateDiscountResult {
                is_valid: false,
                reason: Some("This coupon code is not yet active".into()),
                discount_code: Some(disc),
                discount_amount: 0.0,
            });
        }
    }

    if let Some(until) = disc.valid_until {
        if now > until {
            return Ok(ValidateDiscountResult {
                is_valid: false,
                reason: Some("This coupon code has expired".into()),
                discount_code: Some(disc),
                discount_amount: 0.0,
            });
        }
    }

    if let Some(limit) = disc.usage_limit {
        if disc.usage_count >= limit {
            return Ok(ValidateDiscountResult {
                is_valid: false,
                reason: Some("This coupon has reached its maximum usage limit".into()),
                discount_code: Some(disc),
                discount_amount: 0.0,
            });
        }
    }

    if order_subtotal < disc.min_order_value {
        return Ok(ValidateDiscountResult {
            is_valid: false,
            reason: Some(format!(
                "Minimum order value for this coupon is ₹{:.2}",
                disc.min_order_value
            )),
            discount_code: Some(disc),
            discount_amount: 0.0,
        });
    }

    // Calculate discount
    let mut calculated = match disc.discount_type.as_str() {
        "amount_off_order" | "percent" => (order_subtotal * disc.value) / 100.0,
        "flat" => disc.value,
        "amount_off_products" => (order_subtotal * disc.value) / 100.0,
        "buy_x_get_y" | "bogo" => 0.0,
        "free_shipping" => 0.0,
        _ => (order_subtotal * disc.value) / 100.0,
    };

    if let Some(max_cap) = disc.max_discount {
        if max_cap > 0.0 && calculated > max_cap {
            calculated = max_cap;
        }
    }
    calculated = calculated.min(order_subtotal).max(0.0);

    Ok(ValidateDiscountResult {
        is_valid: true,
        reason: None,
        discount_code: Some(disc),
        discount_amount: calculated,
    })
}

/// Increment usage_count of a discount code upon successful order placement.
#[tauri::command]
pub async fn shop_redeem_discount_code(
    code: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let normalized = code.trim().to_uppercase();

    conn.execute(
        "UPDATE shop_discount_codes SET usage_count = usage_count + 1 WHERE profile_id = ? AND code = ?",
        crate::turso_params![profile_id, normalized],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

