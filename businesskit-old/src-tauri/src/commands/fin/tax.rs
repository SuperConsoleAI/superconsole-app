// src-tauri/src/commands/fin/tax.rs
//
// Tax configuration commands — Phase 4, Step 1 & 2.
//
// Commands:
//   fin_get_tax_config          — get current tax config for this profile
//   fin_set_tax_regime          — one-time setup: GST / VAT / SalesTax / None
//   fin_list_tax_rates          — list all named rates (18% GST, 5% GST, etc.)
//   fin_create_tax_rate         — add a custom rate
//   fin_update_tax_rate         — rename / change percentage
//   fin_delete_tax_rate         — soft-delete (set is_active=0)
//   fin_assign_tax_rate_to_item — link a tax rate to a shop_item

use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    format!("fin-{:x}", ts ^ (rand_u32() as u64))
}

fn rand_u32() -> u32 {
    // Simple deterministic-ish ID — good enough for local UUIDs
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut h);
    h.finish() as u32
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaxConfig {
    pub id: String,
    pub profile_id: String,
    pub regime: String,
    pub country: String,
    pub currency: String,
    pub gstin: Option<String>,
    pub legal_name: Option<String>,
    pub dl_no: Option<String>,
    pub address: Option<String>,
    pub postal_code: Option<String>,
    pub invoice_terms: Option<String>,
    pub phone: Option<String>,
    pub state_code: Option<String>,
    pub default_bill_design: Option<String>,
    pub header_top_text: Option<String>,
    pub invoice_title_text: Option<String>,
    pub digital_sign_url: Option<String>,
    pub signatory_name: Option<String>,
    pub jurisdiction_city: Option<String>,
    pub auto_print_enabled: i64,
    pub pos_printer_type: Option<String>,
    pub pos_printer_ip: Option<String>,
    pub lut_number: Option<String>,
    pub lut_valid_until: Option<i64>,
    pub einvoice_enabled: i64,
    pub eway_enabled: i64,
    pub tax_mode: String, // 'item' | 'global'
    pub global_tax_rate: Option<f64>,
    pub global_tax_rate_id: Option<String>,
    pub tax_inclusive: i64,
    pub watermark: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaxRate {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub rate_pct: f64,
    pub components: String, // JSON: {"cgst":9,"sgst":9}
    pub is_active: i64,
    pub created_at: i64,
}

// ── fin_get_tax_config ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_get_tax_config(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<TaxConfig>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT id, profile_id, regime, country, currency, gstin, legal_name,
                    dl_no, address, invoice_terms,
                    einvoice_enabled, eway_enabled, created_at, updated_at,
                    phone, state_code, default_bill_design, header_top_text,
                    invoice_title_text, digital_sign_url, signatory_name, jurisdiction_city,
                    auto_print_enabled, pos_printer_type, pos_printer_ip,
                    lut_number, lut_valid_until,
                    tax_mode, global_tax_rate, global_tax_rate_id, tax_inclusive, watermark,
                    postal_code
             FROM fin_tax_configs WHERE profile_id = ?1 LIMIT 1",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    match rows.next().await {
        Ok(Some(row)) => Ok(Some(TaxConfig {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            regime: row.get::<String>(2).unwrap_or_else(|_| "None".into()),
            country: row.get::<String>(3).unwrap_or_else(|_| "IN".into()),
            currency: row.get::<String>(4).unwrap_or_else(|_| "INR".into()),
            gstin: row.get::<String>(5).ok(),
            legal_name: row.get::<String>(6).ok(),
            dl_no: row.get::<String>(7).ok(),
            address: row.get::<String>(8).ok(),
            postal_code: row.get::<String>(32).ok().filter(|s| !s.trim().is_empty()),
            invoice_terms: row.get::<String>(9).ok(),
            einvoice_enabled: row.get::<i64>(10).unwrap_or(0),
            eway_enabled: row.get::<i64>(11).unwrap_or(0),
            created_at: row.get::<i64>(12).unwrap_or(0),
            updated_at: row.get::<i64>(13).unwrap_or(0),
            phone: row.get::<String>(14).ok(),
            state_code: row.get::<String>(15).ok(),
            default_bill_design: row.get::<String>(16).ok(),
            header_top_text: row.get::<String>(17).ok(),
            invoice_title_text: row.get::<String>(18).ok(),
            digital_sign_url: row.get::<String>(19).ok(),
            signatory_name: row.get::<String>(20).ok(),
            jurisdiction_city: row.get::<String>(21).ok(),
            auto_print_enabled: row.get::<i64>(22).unwrap_or(0),
            pos_printer_type: row.get::<String>(23).ok(),
            pos_printer_ip: row.get::<String>(24).ok(),
            lut_number: row.get::<String>(25).ok().filter(|s| !s.trim().is_empty()),
            lut_valid_until: row.get::<i64>(26).ok(),
            tax_mode: row.get::<String>(27).unwrap_or_else(|_| "item".into()),
            global_tax_rate: row.get::<f64>(28).ok(),
            global_tax_rate_id: row.get::<String>(29).ok(),
            tax_inclusive: row.get::<i64>(30).unwrap_or(0),
            watermark: row.get::<i64>(31).unwrap_or(1),
        })),
        _ => Ok(None),
    }
}

// ── fin_set_tax_regime ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SetTaxRegimeArgs {
    pub regime: String,
    pub country: String,
    pub currency: String,
    pub gstin: Option<String>,
    pub legal_name: Option<String>,
    pub dl_no: Option<String>,
    pub address: Option<String>,
    pub postal_code: Option<String>,
    pub invoice_terms: Option<String>,
    pub phone: Option<String>,
    pub state_code: Option<String>,
    pub default_bill_design: Option<String>,
    pub header_top_text: Option<String>,
    pub invoice_title_text: Option<String>,
    pub digital_sign_url: Option<String>,
    pub signatory_name: Option<String>,
    pub jurisdiction_city: Option<String>,
    pub auto_print_enabled: Option<bool>,
    pub pos_printer_type: Option<String>,
    pub pos_printer_ip: Option<String>,
    pub lut_number: Option<String>,
    pub lut_valid_until: Option<i64>,
    pub einvoice_enabled: Option<bool>,
    pub eway_enabled: Option<bool>,
    pub tax_mode: Option<String>,
    pub global_tax_rate: Option<f64>,
    pub global_tax_rate_id: Option<String>,
    pub tax_inclusive: Option<bool>,
    pub watermark: Option<bool>,
}

#[tauri::command]
pub async fn fin_set_tax_regime(
    state: State<'_, Arc<AppState>>,
    args: SetTaxRegimeArgs,
) -> Result<TaxConfig, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();
    let id = format!("tc-{}", &profile_id[..profile_id.len().min(16)]);
    let tax_mode = args.tax_mode.unwrap_or_else(|| "item".to_string());
    let tax_inclusive = args.tax_inclusive.unwrap_or(false) as i64;
    let watermark = args.watermark.unwrap_or(true) as i64;

    conn.execute(
        "INSERT INTO fin_tax_configs
             (id, profile_id, regime, country, currency, gstin, legal_name,
              dl_no, address, postal_code, invoice_terms,
              phone, state_code, default_bill_design, header_top_text,
              invoice_title_text, digital_sign_url, signatory_name, jurisdiction_city,
              auto_print_enabled, pos_printer_type, pos_printer_ip,
              lut_number, lut_valid_until,
              einvoice_enabled, eway_enabled, tax_mode, global_tax_rate, global_tax_rate_id, tax_inclusive, watermark, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?32)
         ON CONFLICT(profile_id) DO UPDATE SET
           regime=excluded.regime, country=excluded.country, currency=excluded.currency,
           gstin=excluded.gstin, legal_name=excluded.legal_name,
           dl_no=excluded.dl_no, address=excluded.address, postal_code=excluded.postal_code,
           invoice_terms=excluded.invoice_terms,
           phone=excluded.phone, state_code=excluded.state_code,
           default_bill_design=excluded.default_bill_design,
           header_top_text=excluded.header_top_text,
           invoice_title_text=excluded.invoice_title_text,
           digital_sign_url=excluded.digital_sign_url,
           signatory_name=excluded.signatory_name,
           jurisdiction_city=excluded.jurisdiction_city,
           auto_print_enabled=excluded.auto_print_enabled,
           pos_printer_type=excluded.pos_printer_type,
           pos_printer_ip=excluded.pos_printer_ip,
           lut_number=excluded.lut_number,
           lut_valid_until=excluded.lut_valid_until,
           einvoice_enabled=excluded.einvoice_enabled, eway_enabled=excluded.eway_enabled,
           tax_mode=excluded.tax_mode, global_tax_rate=excluded.global_tax_rate, global_tax_rate_id=excluded.global_tax_rate_id,
           tax_inclusive=excluded.tax_inclusive,
           watermark=excluded.watermark,
           updated_at=excluded.updated_at",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            args.regime.clone(),
            args.country.clone(),
            args.currency.clone(),
            args.gstin.clone(),
            args.legal_name.clone(),
            args.dl_no.clone(),
            args.address.clone(),
            args.postal_code.clone(),
            args.invoice_terms.clone(),
            args.phone.clone(),
            args.state_code.clone(),
            args.default_bill_design.clone().unwrap_or_else(|| "dotmatrix".to_string()),
            args.header_top_text.clone().unwrap_or_else(|| "[ OM ]".to_string()),
            args.invoice_title_text.clone().unwrap_or_else(|| "[ GST INVOICE ]".to_string()),
            args.digital_sign_url.clone(),
            args.signatory_name.clone(),
            args.jurisdiction_city.clone(),
            args.auto_print_enabled.unwrap_or(false) as i64,
            args.pos_printer_type.clone().unwrap_or_else(|| "system".to_string()),
            args.pos_printer_ip.clone().unwrap_or_default(),
            args.lut_number.clone(),
            args.lut_valid_until,
            args.einvoice_enabled.unwrap_or(false) as i64,
            args.eway_enabled.unwrap_or(false) as i64,
            tax_mode.clone(),
            args.global_tax_rate,
            args.global_tax_rate_id.clone(),
            tax_inclusive,
            watermark,
            now,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // If GST is being set up for the first time, seed default rates
    if args.regime == "GST" {
        let _ = seed_gst_rates_internal(&conn, &profile_id, now).await;
    }

    // If Global Tax Mode is chosen, remove any default rate on individual items
    if tax_mode == "global" {
        let _ = conn
            .execute(
                "UPDATE fin_tax_rates SET is_default = 0 WHERE profile_id = ?1",
                crate::turso_params![profile_id.clone()],
            )
            .await;
    }

    Ok(TaxConfig {
        id,
        profile_id,
        regime: args.regime,
        country: args.country,
        currency: args.currency,
        gstin: args.gstin,
        legal_name: args.legal_name,
        dl_no: args.dl_no,
        address: args.address,
        postal_code: args.postal_code,
        invoice_terms: args.invoice_terms,
        phone: args.phone,
        state_code: args.state_code,
        default_bill_design: args.default_bill_design,
        header_top_text: args.header_top_text,
        invoice_title_text: args.invoice_title_text,
        digital_sign_url: args.digital_sign_url,
        signatory_name: args.signatory_name,
        jurisdiction_city: args.jurisdiction_city,
        auto_print_enabled: args.auto_print_enabled.unwrap_or(false) as i64,
        pos_printer_type: args.pos_printer_type,
        pos_printer_ip: args.pos_printer_ip,
        lut_number: args.lut_number,
        lut_valid_until: args.lut_valid_until,
        einvoice_enabled: args.einvoice_enabled.unwrap_or(false) as i64,
        eway_enabled: args.eway_enabled.unwrap_or(false) as i64,
        tax_mode,
        global_tax_rate: args.global_tax_rate,
        global_tax_rate_id: args.global_tax_rate_id,
        tax_inclusive,
        watermark,
        created_at: now,
        updated_at: now,
    })
}

// ── seed GST rates (internal, called from fin_set_tax_regime) ────────────────

async fn seed_gst_rates_internal(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    now: i64,
) -> Result<(), String> {
    let presets = [
        ("exempt", "Exempt / Nil", 0.0, r#"{"cgst":0,"sgst":0}"#),
        ("gst_5", "GST 5%", 5.0, r#"{"cgst":2.5,"sgst":2.5}"#),
        ("gst_12", "GST 12%", 12.0, r#"{"cgst":6,"sgst":6}"#),
        ("gst_18", "GST 18%", 18.0, r#"{"cgst":9,"sgst":9}"#),
        ("gst_28", "GST 28%", 28.0, r#"{"cgst":14,"sgst":14}"#),
    ];

    for (slug, name, rate, components) in presets {
        let rate_id = format!("{}_{}", profile_id, slug);
        conn.execute(
            "INSERT INTO fin_tax_rates (id, profile_id, name, rate_pct, components, is_active, created_at)
             VALUES (?1,?2,?3,?4,?5,1,?6)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name,
               rate_pct=excluded.rate_pct,
               components=excluded.components,
               is_active=1",
            crate::turso_params![rate_id, profile_id, name, rate, components, now],
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── fin_seed_gst_rates ────────────────────────────────────────────────────────
// Public command — reseed GST rates (useful if user deleted them)

#[tauri::command]
pub async fn fin_seed_gst_rates(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();
    seed_gst_rates_internal(&conn, &profile_id, now).await
}

// ── fin_set_default_tax_rate ──────────────────────────────────────────────────
// Sets is_default=1 on one rate, clears all others for this profile.
// Called from Tax → Settings when user picks a default slab.

#[tauri::command]
pub async fn fin_set_default_tax_rate(
    state: State<'_, Arc<AppState>>,
    rate_id: String,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Clear all defaults first
    conn.execute(
        "UPDATE fin_tax_rates SET is_default = 0 WHERE profile_id = ?1",
        crate::turso_params![profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Set the chosen one if non-empty
    let r_id = rate_id.trim();
    if !r_id.is_empty() && r_id != "none" {
        conn.execute(
            "UPDATE fin_tax_rates SET is_default = 1 WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![r_id.to_string(), profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ── fin_get_default_tax_rate ──────────────────────────────────────────────────
// Returns the id of the current default rate, or null if none set.

#[tauri::command]
pub async fn fin_get_default_tax_rate(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<String>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id FROM fin_tax_rates WHERE profile_id = ?1 AND is_default = 1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row.get::<String>(0).ok())
    } else {
        Ok(None)
    }
}

// ── fin_list_tax_rates ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_list_tax_rates(state: State<'_, Arc<AppState>>) -> Result<Vec<TaxRate>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT id, profile_id, name, rate_pct, components, is_active, created_at
             FROM fin_tax_rates WHERE profile_id = ?1 AND is_active = 1
             ORDER BY rate_pct ASC",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id.clone()])
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(TaxRate {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            name: row.get::<String>(2).unwrap_or_default(),
            rate_pct: row.get::<f64>(3).unwrap_or(0.0),
            components: row.get::<String>(4).unwrap_or_else(|_| "{}".into()),
            is_active: row.get::<i64>(5).unwrap_or(1),
            created_at: row.get::<i64>(6).unwrap_or(0),
        });
    }

    if out.is_empty() {
        let now = chrono::Utc::now().timestamp();
        let _ = seed_gst_rates_internal(&conn, &profile_id, now).await;
        if let Ok(mut new_rows) = stmt.query(crate::turso_params![profile_id]).await {
            while let Ok(Some(row)) = new_rows.next().await {
                out.push(TaxRate {
                    id: row.get::<String>(0).unwrap_or_default(),
                    profile_id: row.get::<String>(1).unwrap_or_default(),
                    name: row.get::<String>(2).unwrap_or_default(),
                    rate_pct: row.get::<f64>(3).unwrap_or(0.0),
                    components: row.get::<String>(4).unwrap_or_else(|_| "{}".into()),
                    is_active: row.get::<i64>(5).unwrap_or(1),
                    created_at: row.get::<i64>(6).unwrap_or(0),
                });
            }
        }
    }

    Ok(out)
}

// ── fin_create_tax_rate ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateTaxRateArgs {
    pub name: String,
    pub rate_pct: f64,
    pub components: Option<String>, // JSON {"cgst":9,"sgst":9}
}

#[tauri::command]
pub async fn fin_create_tax_rate(
    state: State<'_, Arc<AppState>>,
    args: CreateTaxRateArgs,
) -> Result<TaxRate, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();
    let id = new_id();
    let components = args.components.unwrap_or_else(|| "{}".into());

    conn.execute(
        "INSERT INTO fin_tax_rates (id, profile_id, name, rate_pct, components, is_active, created_at)
         VALUES (?1,?2,?3,?4,?5,1,?6)",
        crate::turso_params![id.clone(), profile_id.clone(), args.name.clone(), args.rate_pct, components.clone(), now],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(TaxRate {
        id,
        profile_id,
        name: args.name,
        rate_pct: args.rate_pct,
        components,
        is_active: 1,
        created_at: now,
    })
}

// ── fin_delete_tax_rate (soft) ────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_delete_tax_rate(
    state: State<'_, Arc<AppState>>,
    rate_id: String,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE fin_tax_rates SET is_active = 0 WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![rate_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── fin_assign_tax_rate_to_item ───────────────────────────────────────────────

#[tauri::command]
pub async fn fin_assign_tax_rate_to_item(
    state: State<'_, Arc<AppState>>,
    item_id: String,
    rate_id: Option<String>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_items SET tax_rate_id = ?1 WHERE id = ?2 AND profile_id = ?3",
        crate::turso_params![rate_id, item_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── fin_get_item_tax_rate ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ItemTaxRate {
    pub tax_rate_id: String,
    pub name: String,
    pub rate_pct: f64,
}

/// Returns the tax rate currently assigned to a shop item, or null if none.
#[tauri::command]
pub async fn fin_get_item_tax_rate(
    state: State<'_, Arc<AppState>>,
    item_id: String,
) -> Result<Option<ItemTaxRate>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT tr.id, tr.name, tr.rate_pct \
         FROM shop_items si \
         JOIN fin_tax_rates tr ON tr.id = si.tax_rate_id \
         WHERE si.id = ?1 AND si.profile_id = ?2 \
         LIMIT 1",
            crate::turso_params![item_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(Some(ItemTaxRate {
            tax_rate_id: row.get::<String>(0).unwrap_or_default(),
            name: row.get::<String>(1).unwrap_or_default(),
            rate_pct: row.get::<f64>(2).unwrap_or(0.0),
        }))
    } else {
        Ok(None)
    }
}
