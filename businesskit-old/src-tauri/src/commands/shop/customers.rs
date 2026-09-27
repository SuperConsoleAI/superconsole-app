// src-tauri/src/commands/shop/customers.rs
//
// Phase 3 & Phase 4C — Know Your People: Customers & CRM Capabilities
//
// Commands:
//   shop_create_customer              → save new customer (+ crm_contacts row)
//   shop_list_customers               → list all active customers
//   shop_get_customer_detail          → single customer + invoice history + totals
//   shop_update_customer              → update customer fields
//   shop_update_customer_preferences  → atomic update of marketing, tax, notes, tags, addresses, store credit
//   shop_search_customers             → quick search for billing picker
//   shop_get_customer_billing_context → credit limit, store credit, marketing, and prior unpaid invoices
//   shop_list_tags                    → list customer/product tags
//   shop_create_tag                   → create a new tag

use crate::commands::fin::journal::{account_id_by_code, post_journal_entry};
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
pub struct CreditLedgerEntry {
    pub id: String,
    pub customer_id: String,
    pub entry_type: String,
    pub amount: f64,
    pub balance_after: f64,
    pub document_id: Option<String>,
    pub payment_id: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct AdjustCreditData {
    pub customer_id: String,
    pub delta_amount: f64,
    pub entry_type: Option<String>,
    pub document_id: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoyaltyLedgerEntry {
    pub id: String,
    pub customer_id: String,
    pub entry_type: String,
    pub points: f64,
    pub balance_after: f64,
    pub document_id: Option<String>,
    pub reason: Option<String>,
    pub expires_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct AdjustLoyaltyData {
    pub customer_id: String,
    pub points_delta: f64,
    pub entry_type: Option<String>,
    pub document_id: Option<String>,
    pub reason: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoyaltyConfig {
    pub profile_id: String,
    pub is_enabled: i64,
    pub points_per_currency: f64,
    pub point_value_currency: f64,
    pub min_order_amount: f64,
    pub max_redeem_percent: f64,
    pub expiry_days: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLoyaltyConfigData {
    pub is_enabled: Option<i64>,
    pub points_per_currency: Option<f64>,
    pub point_value_currency: Option<f64>,
    pub min_order_amount: Option<f64>,
    pub max_redeem_percent: Option<f64>,
    pub expiry_days: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: String,
    pub contact_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub dl_no: Option<String>,
    pub billing_addr: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub price_list_id: Option<String>,
    pub credit_limit: f64,
    pub credit_used: f64,
    pub wallet_balance: f64,
    pub loyalty_pts: f64,
    pub loyalty_pts_expiring_at: Option<i64>,
    pub total_orders: i64,
    pub total_spent: f64,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub collect_taxes: i64,
    pub accepts_email_marketing: i64,
    pub accepts_sms_marketing: i64,
    pub accepts_whatsapp_marketing: i64,
    pub date_of_birth: Option<String>,
    pub anniversary: Option<String>,
    pub addresses: Option<String>,
    pub gst_supply_type: Option<String>,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
    pub is_active: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerDetail {
    #[serde(flatten)]
    pub customer: Customer,
    pub recent_invoices: Vec<RecentInvoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentInvoice {
    pub id: String,
    pub doc_number: String,
    pub doc_date: i64,
    pub grand_total: f64,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomerData {
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub dl_no: Option<String>,
    pub billing_addr: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub credit_limit: Option<f64>,
    pub wallet_balance: Option<f64>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub collect_taxes: Option<i64>,
    pub accepts_email_marketing: Option<i64>,
    pub accepts_sms_marketing: Option<i64>,
    pub accepts_whatsapp_marketing: Option<i64>,
    pub date_of_birth: Option<String>,
    pub anniversary: Option<String>,
    pub addresses: Option<String>,
    pub gst_supply_type: Option<String>,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
    pub price_list_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCustomerData {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub dl_no: Option<String>,
    pub billing_addr: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub credit_limit: Option<f64>,
    pub wallet_balance: Option<f64>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub collect_taxes: Option<i64>,
    pub accepts_email_marketing: Option<i64>,
    pub accepts_sms_marketing: Option<i64>,
    pub accepts_whatsapp_marketing: Option<i64>,
    pub date_of_birth: Option<String>,
    pub anniversary: Option<String>,
    pub addresses: Option<String>,
    pub gst_supply_type: Option<String>,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
    pub price_list_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCustomerPreferencesData {
    pub customer_id: String,
    pub accepts_email_marketing: Option<i64>,
    pub accepts_sms_marketing: Option<i64>,
    pub accepts_whatsapp_marketing: Option<i64>,
    pub date_of_birth: Option<String>,
    pub anniversary: Option<String>,
    pub collect_taxes: Option<i64>,
    pub wallet_balance: Option<f64>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub addresses: Option<String>,
    pub gst_supply_type: Option<String>,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
    pub price_list_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CampaignAudienceFilter {
    pub group_id: Option<String>,
    pub channel: Option<String>, // 'email' | 'sms' | 'whatsapp'
    pub min_loyalty_pts: Option<f64>,
    pub min_spent: Option<f64>,
    pub birthday_month_day: Option<String>, // 'MM-DD' e.g. '08-30'
    pub anniversary_month_day: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TopupWalletData {
    pub customer_id: String,
    pub amount: f64,
    pub payment_mode: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RedeemWalletData {
    pub customer_id: String,
    pub amount: f64,
    pub document_id: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RedeemLoyaltyPointsData {
    pub customer_id: String,
    pub document_id: String,
    pub points_to_redeem: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopTag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub tag_type: String,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create a new customer (also writes a crm_contacts row).
#[tauri::command]
pub async fn shop_create_customer(
    data: CreateCustomerData,
    state: State<'_, Arc<AppState>>,
) -> Result<Customer, String> {
    if data.name.trim().is_empty() {
        return Err("Name is required".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let contact_id = new_id("ctc");
    let customer_id = new_id("cust");

    // 1. Insert crm_contacts (best-effort)
    let _ = conn
        .execute(
            "INSERT OR IGNORE INTO crm_contacts \
         (id, profile_id, name, phone, email, date_of_birth, anniversary, contact_type) \
         VALUES (?, ?, ?, ?, ?, ?, ?, 'customer')",
            crate::turso_params![
                contact_id.clone(),
                profile_id.clone(),
                data.name.trim().to_string(),
                data.phone.clone().unwrap_or_default(),
                data.email.clone().unwrap_or_default(),
                data.date_of_birth.clone(),
                data.anniversary.clone()
            ],
        )
        .await;

    let tags = data.tags.unwrap_or_else(|| "[]".to_string());
    let addresses = data.addresses.unwrap_or_else(|| "[]".to_string());
    let collect_taxes = data.collect_taxes.unwrap_or(1);
    let accepts_email_marketing = data.accepts_email_marketing.unwrap_or(0);
    let accepts_sms_marketing = data.accepts_sms_marketing.unwrap_or(0);
    let accepts_whatsapp_marketing = data.accepts_whatsapp_marketing.unwrap_or(0);
    let gst_supply_type = data.gst_supply_type.unwrap_or_else(|| "regular".to_string());
    let wallet_balance = data.wallet_balance.unwrap_or(0.0);

    let price_list_id = data.price_list_id.filter(|s| !s.trim().is_empty() && s != "none");

    // 2. Insert shop_customers
    conn.execute(
        "INSERT INTO shop_customers \
         (id, profile_id, contact_id, name, phone, email, gstin, pan, dl_no, billing_addr, city, state, pincode, \
          credit_limit, wallet_balance, notes, tags, collect_taxes, \
          accepts_email_marketing, accepts_sms_marketing, accepts_whatsapp_marketing, \
          date_of_birth, anniversary, addresses, gst_supply_type, media_id, image_url, price_list_id, is_active) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        crate::turso_params![
            customer_id.clone(),
            profile_id.clone(),
            contact_id.clone(),
            data.name.trim().to_string(),
            data.phone.clone().unwrap_or_default(),
            data.email.clone().unwrap_or_default(),
            data.gstin.clone().unwrap_or_default(),
            data.pan.clone().unwrap_or_default(),
            data.dl_no.clone().unwrap_or_default(),
            data.billing_addr.clone().unwrap_or_default(),
            data.city.clone().unwrap_or_default(),
            data.state.clone().unwrap_or_default(),
            data.pincode.clone().unwrap_or_default(),
            data.credit_limit.unwrap_or(0.0),
            wallet_balance,
            data.notes.clone().unwrap_or_default(),
            tags.clone(),
            collect_taxes,
            accepts_email_marketing,
            accepts_sms_marketing,
            accepts_whatsapp_marketing,
            data.date_of_birth.clone(),
            data.anniversary.clone(),
            addresses.clone(),
            gst_supply_type.clone(),
            data.media_id.clone(),
            data.image_url.clone(),
            price_list_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(Customer {
        id: customer_id,
        contact_id: Some(contact_id),
        name: data.name.trim().to_string(),
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
        pan: data.pan,
        dl_no: data.dl_no,
        billing_addr: data.billing_addr,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        price_list_id,
        credit_limit: data.credit_limit.unwrap_or(0.0),
        credit_used: 0.0,
        wallet_balance,
        loyalty_pts: 0.0,
        loyalty_pts_expiring_at: None,
        total_orders: 0,
        total_spent: 0.0,
        notes: data.notes,
        tags: Some(tags),
        collect_taxes,
        accepts_email_marketing,
        accepts_sms_marketing,
        accepts_whatsapp_marketing,
        date_of_birth: data.date_of_birth,
        anniversary: data.anniversary,
        addresses: Some(addresses),
        gst_supply_type: Some(gst_supply_type),
        media_id: data.media_id,
        image_url: data.image_url,
        is_active: 1,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
    })
}

/// List all active customers.
#[tauri::command]
pub async fn shop_list_customers(state: State<'_, Arc<AppState>>) -> Result<Vec<Customer>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, contact_id, name, phone, email, gstin, pan, dl_no, billing_addr, city, state, \
                COALESCE(credit_limit, 0.0), COALESCE(credit_used, 0.0), \
                COALESCE(wallet_balance, 0.0), COALESCE(loyalty_pts, 0.0), loyalty_pts_expiring_at, \
                COALESCE(total_orders, 0), COALESCE(total_spent, 0.0), \
                COALESCE(is_active, 1), COALESCE(created_at, 0), \
                notes, COALESCE(tags, '[]'), \
                COALESCE(collect_taxes, 1), \
                COALESCE(accepts_email_marketing, 0), COALESCE(accepts_sms_marketing, 0), COALESCE(accepts_whatsapp_marketing, 0), \
                date_of_birth, anniversary, \
                COALESCE(addresses, '[]'), COALESCE(gst_supply_type, 'regular'), \
                media_id, image_url, pincode, price_list_id \
         FROM shop_customers \
         WHERE profile_id = ? AND is_active = 1 \
         ORDER BY name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(Customer {
            id: row.get::<Option<String>>(0).ok().flatten().unwrap_or_default(),
            contact_id: row.get::<Option<String>>(1).ok().flatten(),
            name: row.get::<Option<String>>(2).ok().flatten().unwrap_or_default(),
            phone: row.get::<Option<String>>(3).ok().flatten().filter(|s| !s.is_empty()),
            email: row.get::<Option<String>>(4).ok().flatten().filter(|s| !s.is_empty()),
            gstin: row.get::<Option<String>>(5).ok().flatten().filter(|s| !s.is_empty()),
            pan: row.get::<Option<String>>(6).ok().flatten().filter(|s| !s.is_empty()),
            dl_no: row.get::<Option<String>>(7).ok().flatten().filter(|s| !s.is_empty()),
            billing_addr: row.get::<Option<String>>(8).ok().flatten().filter(|s| !s.is_empty() && s != "{}"),
            city: row.get::<Option<String>>(9).ok().flatten().filter(|s| !s.is_empty()),
            state: row.get::<Option<String>>(10).ok().flatten().filter(|s| !s.is_empty()),
            pincode: row.get::<Option<String>>(32).ok().flatten().filter(|s| !s.is_empty()),
            price_list_id: row.get::<Option<String>>(33).ok().flatten().filter(|s| !s.is_empty()),
            credit_limit: row.get::<Option<f64>>(11).ok().flatten().unwrap_or(0.0),
            credit_used: row.get::<Option<f64>>(12).ok().flatten().unwrap_or(0.0),
            wallet_balance: row.get::<Option<f64>>(13).ok().flatten().unwrap_or(0.0),
            loyalty_pts: row.get::<Option<f64>>(14).ok().flatten().unwrap_or(0.0),
            loyalty_pts_expiring_at: row.get::<Option<i64>>(15).ok().flatten(),
            total_orders: row.get::<Option<i64>>(16).ok().flatten().unwrap_or(0),
            total_spent: row.get::<Option<f64>>(17).ok().flatten().unwrap_or(0.0),
            is_active: row.get::<Option<i64>>(18).ok().flatten().unwrap_or(1),
            created_at: row.get::<Option<i64>>(19).ok().flatten().unwrap_or(0),
            notes: row.get::<Option<String>>(20).ok().flatten().filter(|s| !s.is_empty()),
            tags: row.get::<Option<String>>(21).ok().flatten(),
            collect_taxes: row.get::<Option<i64>>(22).ok().flatten().unwrap_or(1),
            accepts_email_marketing: row.get::<Option<i64>>(23).ok().flatten().unwrap_or(0),
            accepts_sms_marketing: row.get::<Option<i64>>(24).ok().flatten().unwrap_or(0),
            accepts_whatsapp_marketing: row.get::<Option<i64>>(25).ok().flatten().unwrap_or(0),
            date_of_birth: row.get::<Option<String>>(26).ok().flatten(),
            anniversary: row.get::<Option<String>>(27).ok().flatten(),
            addresses: row.get::<Option<String>>(28).ok().flatten(),
            gst_supply_type: row.get::<Option<String>>(29).ok().flatten().or_else(|| Some("regular".to_string())),
            media_id: row.get::<Option<String>>(30).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(31).ok().flatten().filter(|s| !s.is_empty()),
        });
    }
    Ok(out)
}

/// Quick search customers by name or phone for billing picker.
#[tauri::command]
pub async fn shop_search_customers(
    query: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Customer>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let pattern = format!("%{}%", query.to_lowercase());
    let mut rows = conn
        .query(
            "SELECT id, contact_id, name, phone, email, gstin, pan, dl_no, billing_addr, city, state, \
                COALESCE(credit_limit, 0.0), COALESCE(credit_used, 0.0), \
                COALESCE(wallet_balance, 0.0), COALESCE(loyalty_pts, 0.0), loyalty_pts_expiring_at, \
                COALESCE(total_orders, 0), COALESCE(total_spent, 0.0), \
                COALESCE(is_active, 1), COALESCE(created_at, 0), \
                notes, COALESCE(tags, '[]'), \
                COALESCE(collect_taxes, 1), \
                COALESCE(accepts_email_marketing, 0), COALESCE(accepts_sms_marketing, 0), COALESCE(accepts_whatsapp_marketing, 0), \
                date_of_birth, anniversary, \
                COALESCE(addresses, '[]'), COALESCE(gst_supply_type, 'regular'), \
                media_id, image_url, pincode, price_list_id \
         FROM shop_customers \
         WHERE profile_id = ? AND is_active = 1 \
            AND (LOWER(name) LIKE ? OR phone LIKE ? OR gstin LIKE ? OR dl_no LIKE ? OR pincode LIKE ?) \
         ORDER BY name ASC LIMIT 10",
            crate::turso_params![profile_id, pattern.clone(), pattern.clone(), pattern.clone(), pattern.clone(), pattern],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(Customer {
            id: row.get::<Option<String>>(0).ok().flatten().unwrap_or_default(),
            contact_id: row.get::<Option<String>>(1).ok().flatten(),
            name: row.get::<Option<String>>(2).ok().flatten().unwrap_or_default(),
            phone: row.get::<Option<String>>(3).ok().flatten().filter(|s| !s.is_empty()),
            email: row.get::<Option<String>>(4).ok().flatten().filter(|s| !s.is_empty()),
            gstin: row.get::<Option<String>>(5).ok().flatten().filter(|s| !s.is_empty()),
            pan: row.get::<Option<String>>(6).ok().flatten().filter(|s| !s.is_empty()),
            dl_no: row.get::<Option<String>>(7).ok().flatten().filter(|s| !s.is_empty()),
            billing_addr: row.get::<Option<String>>(8).ok().flatten().filter(|s| !s.is_empty() && s != "{}"),
            city: row.get::<Option<String>>(9).ok().flatten().filter(|s| !s.is_empty()),
            state: row.get::<Option<String>>(10).ok().flatten().filter(|s| !s.is_empty()),
            pincode: row.get::<Option<String>>(32).ok().flatten().filter(|s| !s.is_empty()),
            price_list_id: row.get::<Option<String>>(33).ok().flatten().filter(|s| !s.is_empty()),
            credit_limit: row.get::<Option<f64>>(11).ok().flatten().unwrap_or(0.0),
            credit_used: row.get::<Option<f64>>(12).ok().flatten().unwrap_or(0.0),
            wallet_balance: row.get::<Option<f64>>(13).ok().flatten().unwrap_or(0.0),
            loyalty_pts: row.get::<Option<f64>>(14).ok().flatten().unwrap_or(0.0),
            loyalty_pts_expiring_at: row.get::<Option<i64>>(15).ok().flatten(),
            total_orders: row.get::<Option<i64>>(16).ok().flatten().unwrap_or(0),
            total_spent: row.get::<Option<f64>>(17).ok().flatten().unwrap_or(0.0),
            is_active: row.get::<Option<i64>>(18).ok().flatten().unwrap_or(1),
            created_at: row.get::<Option<i64>>(19).ok().flatten().unwrap_or(0),
            notes: row.get::<Option<String>>(20).ok().flatten().filter(|s| !s.is_empty()),
            tags: row.get::<Option<String>>(21).ok().flatten(),
            collect_taxes: row.get::<Option<i64>>(22).ok().flatten().unwrap_or(1),
            accepts_email_marketing: row.get::<Option<i64>>(23).ok().flatten().unwrap_or(0),
            accepts_sms_marketing: row.get::<Option<i64>>(24).ok().flatten().unwrap_or(0),
            accepts_whatsapp_marketing: row.get::<Option<i64>>(25).ok().flatten().unwrap_or(0),
            date_of_birth: row.get::<Option<String>>(26).ok().flatten(),
            anniversary: row.get::<Option<String>>(27).ok().flatten(),
            addresses: row.get::<Option<String>>(28).ok().flatten(),
            gst_supply_type: row.get::<Option<String>>(29).ok().flatten().or_else(|| Some("regular".to_string())),
            media_id: row.get::<Option<String>>(30).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(31).ok().flatten().filter(|s| !s.is_empty()),
        });
    }
    Ok(out)
}

/// Get a single customer with their recent invoice history.
#[tauri::command]
pub async fn shop_get_customer_detail(
    customer_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<CustomerDetail, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, contact_id, name, phone, email, gstin, pan, dl_no, billing_addr, city, state, \
                COALESCE(credit_limit, 0.0), COALESCE(credit_used, 0.0), \
                COALESCE(wallet_balance, 0.0), COALESCE(loyalty_pts, 0.0), loyalty_pts_expiring_at, \
                COALESCE(total_orders, 0), COALESCE(total_spent, 0.0), \
                COALESCE(is_active, 1), COALESCE(created_at, 0), \
                notes, COALESCE(tags, '[]'), \
                COALESCE(collect_taxes, 1), \
                COALESCE(accepts_email_marketing, 0), COALESCE(accepts_sms_marketing, 0), COALESCE(accepts_whatsapp_marketing, 0), \
                date_of_birth, anniversary, \
                COALESCE(addresses, '[]'), COALESCE(gst_supply_type, 'regular'), \
                media_id, image_url, pincode, price_list_id \
         FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let customer = if let Ok(Some(row)) = rows.next().await {
        Customer {
            id: row.get::<Option<String>>(0).ok().flatten().unwrap_or_default(),
            contact_id: row.get::<Option<String>>(1).ok().flatten(),
            name: row.get::<Option<String>>(2).ok().flatten().unwrap_or_default(),
            phone: row.get::<Option<String>>(3).ok().flatten().filter(|s| !s.is_empty()),
            email: row.get::<Option<String>>(4).ok().flatten().filter(|s| !s.is_empty()),
            gstin: row.get::<Option<String>>(5).ok().flatten().filter(|s| !s.is_empty()),
            pan: row.get::<Option<String>>(6).ok().flatten().filter(|s| !s.is_empty()),
            dl_no: row.get::<Option<String>>(7).ok().flatten().filter(|s| !s.is_empty()),
            billing_addr: row.get::<Option<String>>(8).ok().flatten().filter(|s| !s.is_empty() && s != "{}"),
            city: row.get::<Option<String>>(9).ok().flatten().filter(|s| !s.is_empty()),
            state: row.get::<Option<String>>(10).ok().flatten().filter(|s| !s.is_empty()),
            pincode: row.get::<Option<String>>(32).ok().flatten().filter(|s| !s.is_empty()),
            price_list_id: row.get::<Option<String>>(33).ok().flatten().filter(|s| !s.is_empty()),
            credit_limit: row.get::<Option<f64>>(11).ok().flatten().unwrap_or(0.0),
            credit_used: row.get::<Option<f64>>(12).ok().flatten().unwrap_or(0.0),
            wallet_balance: row.get::<Option<f64>>(13).ok().flatten().unwrap_or(0.0),
            loyalty_pts: row.get::<Option<f64>>(14).ok().flatten().unwrap_or(0.0),
            loyalty_pts_expiring_at: row.get::<Option<i64>>(15).ok().flatten(),
            total_orders: row.get::<Option<i64>>(16).ok().flatten().unwrap_or(0),
            total_spent: row.get::<Option<f64>>(17).ok().flatten().unwrap_or(0.0),
            is_active: row.get::<Option<i64>>(18).ok().flatten().unwrap_or(1),
            created_at: row.get::<Option<i64>>(19).ok().flatten().unwrap_or(0),
            notes: row.get::<Option<String>>(20).ok().flatten().filter(|s| !s.is_empty()),
            tags: row.get::<Option<String>>(21).ok().flatten(),
            collect_taxes: row.get::<Option<i64>>(22).ok().flatten().unwrap_or(1),
            accepts_email_marketing: row.get::<Option<i64>>(23).ok().flatten().unwrap_or(0),
            accepts_sms_marketing: row.get::<Option<i64>>(24).ok().flatten().unwrap_or(0),
            accepts_whatsapp_marketing: row.get::<Option<i64>>(25).ok().flatten().unwrap_or(0),
            date_of_birth: row.get::<Option<String>>(26).ok().flatten(),
            anniversary: row.get::<Option<String>>(27).ok().flatten(),
            addresses: row.get::<Option<String>>(28).ok().flatten(),
            gst_supply_type: row.get::<Option<String>>(29).ok().flatten().or_else(|| Some("regular".to_string())),
            media_id: row.get::<Option<String>>(30).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(31).ok().flatten().filter(|s| !s.is_empty()),
        }
    } else {
        return Err("Customer not found".into());
    };

    // Recent invoices (last 20)
    let mut inv_rows = conn
        .query(
            "SELECT id, doc_number, doc_date, grand_total, status \
         FROM shop_documents \
         WHERE profile_id = ? AND customer_id = ? AND doc_type = 'invoice' \
         ORDER BY doc_date DESC LIMIT 20",
            crate::turso_params![profile_id, customer_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut recent_invoices = Vec::new();
    while let Ok(Some(row)) = inv_rows.next().await {
        recent_invoices.push(RecentInvoice {
            id: row.get(0).unwrap_or_default(),
            doc_number: row.get(1).unwrap_or_default(),
            doc_date: row.get(2).unwrap_or(0),
            grand_total: row.get(3).unwrap_or(0.0),
            status: row.get(4).unwrap_or_default(),
        });
    }

    Ok(CustomerDetail {
        customer,
        recent_invoices,
    })
}
/// Update customer fields.
#[tauri::command]
pub async fn shop_update_customer(
    data: UpdateCustomerData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    if data.name.trim().is_empty() {
        return Err("Name is required".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_customers \
         SET name = ?, phone = ?, email = ?, gstin = ?, pan = ?, dl_no = ?, billing_addr = ?, city = ?, state = ?, pincode = ?, \
             credit_limit = ?, wallet_balance = COALESCE(?, wallet_balance), notes = COALESCE(?, notes), \
             tags = COALESCE(?, tags), collect_taxes = COALESCE(?, collect_taxes), \
             accepts_email_marketing = COALESCE(?, accepts_email_marketing), \
             accepts_sms_marketing = COALESCE(?, accepts_sms_marketing), \
             accepts_whatsapp_marketing = COALESCE(?, accepts_whatsapp_marketing), \
             date_of_birth = COALESCE(?, date_of_birth), \
             anniversary = COALESCE(?, anniversary), \
             addresses = COALESCE(?, addresses), \
             gst_supply_type = COALESCE(?, gst_supply_type), \
             media_id = COALESCE(?, media_id), \
             image_url = COALESCE(?, image_url), \
             price_list_id = ?, \
             updated_at = strftime('%s','now') \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.name.trim().to_string(),
            data.phone.unwrap_or_default(),
            data.email.unwrap_or_default(),
            data.gstin.unwrap_or_default(),
            data.pan.unwrap_or_default(),
            data.dl_no.unwrap_or_default(),
            data.billing_addr.unwrap_or_default(),
            data.city.unwrap_or_default(),
            data.state.unwrap_or_default(),
            data.pincode.unwrap_or_default(),
            data.credit_limit.unwrap_or(0.0),
            data.wallet_balance,
            data.notes,
            data.tags,
            data.collect_taxes,
            data.accepts_email_marketing,
            data.accepts_sms_marketing,
            data.accepts_whatsapp_marketing,
            data.date_of_birth,
            data.anniversary,
            data.addresses,
            data.gst_supply_type,
            data.media_id,
            data.image_url,
            data.price_list_id.filter(|s| !s.trim().is_empty() && s != "none"),
            data.id,
            profile_id
        ],
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// Atomic update for CRM preferences (marketing toggles, tax collection, notes, tags, wallet balance, addresses, GST supply type).
#[tauri::command]
pub async fn shop_update_customer_preferences(
    data: UpdateCustomerPreferencesData,
    state: State<'_, Arc<AppState>>,
) -> Result<CustomerDetail, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE shop_customers \
         SET accepts_email_marketing = COALESCE(?, accepts_email_marketing), \
             accepts_sms_marketing = COALESCE(?, accepts_sms_marketing), \
             accepts_whatsapp_marketing = COALESCE(?, accepts_whatsapp_marketing), \
             date_of_birth = COALESCE(?, date_of_birth), \
             anniversary = COALESCE(?, anniversary), \
             collect_taxes = COALESCE(?, collect_taxes), \
             wallet_balance = COALESCE(?, wallet_balance), \
             notes = COALESCE(?, notes), \
             tags = COALESCE(?, tags), \
             addresses = COALESCE(?, addresses), \
             gst_supply_type = COALESCE(?, gst_supply_type), \
             media_id = COALESCE(?, media_id), \
             image_url = COALESCE(?, image_url), \
             updated_at = strftime('%s','now') \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            data.accepts_email_marketing,
            data.accepts_sms_marketing,
            data.accepts_whatsapp_marketing,
            data.date_of_birth,
            data.anniversary,
            data.collect_taxes,
            data.wallet_balance,
            data.notes,
            data.tags,
            data.addresses,
            data.gst_supply_type,
            data.media_id,
            data.image_url,
            data.customer_id.clone(),
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    if let Some(pl) = &data.price_list_id {
        let clean_pl = if pl.trim().is_empty() || pl == "none" {
            None
        } else {
            Some(pl.trim().to_string())
        };
        let _ = conn.execute(
            "UPDATE shop_customers SET price_list_id = ? WHERE id = ? AND profile_id = ?",
            crate::turso_params![clean_pl, data.customer_id.clone(), profile_id.clone()],
        ).await;
    }

    shop_get_customer_detail(data.customer_id, state).await
}

// ── Customer Billing Context (Credit Line + Wallet Balance + Live Prior Dues) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutstandingInvoiceSummary {
    pub document_id: String,
    pub doc_number: String,
    pub grand_total: f64,
    pub amount_paid: f64,
    pub amount_due: f64,
    pub doc_date: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerBillingContext {
    pub customer_id: Option<String>,
    pub customer_name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub dl_no: Option<String>,
    pub billing_addr: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub credit_limit: f64,
    pub credit_used: f64,
    pub wallet_balance: f64,
    pub collect_taxes: i64,
    pub accepts_email_marketing: i64,
    pub accepts_sms_marketing: i64,
    pub accepts_whatsapp_marketing: i64,
    pub date_of_birth: Option<String>,
    pub anniversary: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub addresses: Option<String>,
    pub gst_supply_type: String,
    pub total_spent: f64,
    pub total_orders: i64,
    pub available_credit: f64,
    pub is_over_limit: bool,
    pub media_id: Option<String>,
    pub image_url: Option<String>,
    pub price_list_id: Option<String>,
    pub outstanding_invoices: Vec<OutstandingInvoiceSummary>,
}

#[tauri::command]
pub async fn shop_get_customer_billing_context(
    customer_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<CustomerBillingContext, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let raw_input = customer_id.trim().to_string();
    let digits_only: String = raw_input.chars().filter(|c| c.is_ascii_digit()).collect();
    let phone_10 = if digits_only.len() >= 10 {
        digits_only[digits_only.len() - 10..].to_string()
    } else {
        digits_only.clone()
    };
    let phone_with_91 = format!("+91{}", phone_10);
    let phone_91_nodash = format!("91{}", phone_10);

    // 1. Fetch customer info by ID, exact phone, normalized 10-digit phone, or email
    let mut cust_rows = conn
        .query(
            "SELECT name, email, phone, credit_limit, COALESCE(wallet_balance, 0.0), collect_taxes, \
                    accepts_email_marketing, accepts_sms_marketing, notes, tags, addresses, \
                    total_spent, total_orders, COALESCE(gst_supply_type, 'regular'), \
                    gstin, pan, dl_no, billing_addr, city, state, \
                    COALESCE(accepts_whatsapp_marketing, 0), date_of_birth, anniversary, \
                    media_id, image_url, pincode, price_list_id, id \
             FROM shop_customers \
             WHERE profile_id = ?1 \
               AND (id = ?2 OR phone = ?2 OR email = ?2 OR phone = ?3 OR phone = ?4 OR phone = ?5 OR phone LIKE ?6) \
             LIMIT 1",
            crate::turso_params![
                profile_id.clone(),
                raw_input.clone(),
                phone_10.clone(),
                phone_with_91,
                phone_91_nodash,
                format!("%{}", phone_10)
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (
        customer_name,
        email,
        phone,
        credit_limit,
        wallet_balance,
        collect_taxes,
        accepts_email_marketing,
        accepts_sms_marketing,
        notes,
        tags,
        addresses,
        total_spent,
        total_orders,
        gst_supply_type,
        gstin,
        pan,
        dl_no,
        billing_addr,
        city,
        state,
        accepts_whatsapp_marketing,
        date_of_birth,
        anniversary,
        media_id,
        image_url,
        pincode,
        price_list_id,
        resolved_customer_id,
    ) = if let Ok(Some(row)) = cust_rows.next().await {
        (
            row.get::<String>(0).unwrap_or_default(),
            row.get::<String>(1).ok().filter(|s| !s.is_empty()),
            row.get::<String>(2).ok().filter(|s| !s.is_empty()),
            row.get::<f64>(3).unwrap_or(0.0),
            row.get::<f64>(4).unwrap_or(0.0),
            row.get::<i64>(5).unwrap_or(1),
            row.get::<i64>(6).unwrap_or(0),
            row.get::<i64>(7).unwrap_or(0),
            row.get::<String>(8).ok().filter(|s| !s.is_empty()),
            row.get::<String>(9).ok(),
            row.get::<String>(10).ok(),
            row.get::<f64>(11).unwrap_or(0.0),
            row.get::<i64>(12).unwrap_or(0),
            row.get::<String>(13).unwrap_or_else(|_| "regular".to_string()),
            row.get::<String>(14).ok().filter(|s| !s.is_empty()),
            row.get::<String>(15).ok().filter(|s| !s.is_empty()),
            row.get::<String>(16).ok().filter(|s| !s.is_empty()),
            row.get::<String>(17).ok().filter(|s| !s.is_empty() && s != "{}"),
            row.get::<String>(18).ok().filter(|s| !s.is_empty()),
            row.get::<String>(19).ok().filter(|s| !s.is_empty()),
            row.get::<i64>(20).unwrap_or(0),
            row.get::<String>(21).ok().filter(|s| !s.is_empty()),
            row.get::<String>(22).ok().filter(|s| !s.is_empty()),
            row.get::<String>(23).ok().filter(|s| !s.is_empty()),
            row.get::<String>(24).ok().filter(|s| !s.is_empty()),
            row.get::<String>(25).ok().filter(|s| !s.is_empty()),
            row.get::<String>(26).ok().filter(|s| !s.is_empty()),
            row.get::<String>(27).unwrap_or_else(|_| raw_input.clone()),
        )
    } else {
        return Err("Customer not found".into());
    };

    // 2. Fetch all unpaid/partial invoices for this customer
    let mut inv_rows = conn
        .query(
            "SELECT id, doc_number, grand_total, amount_paid, amount_due, doc_date \
             FROM shop_documents \
             WHERE customer_id = ? AND profile_id = ? AND doc_type = 'invoice' \
               AND status IN ('pending', 'partial', 'sent', 'overdue') AND amount_due > 0.005 \
             ORDER BY doc_date ASC",
            crate::turso_params![resolved_customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut outstanding_invoices = Vec::new();
    let mut total_due = 0.0;

    while let Ok(Some(row)) = inv_rows.next().await {
        let grand_total = row.get::<f64>(2).unwrap_or(0.0);
        let amount_paid = row.get::<f64>(3).unwrap_or(0.0);
        let amount_due = row.get::<f64>(4).unwrap_or(0.0);
        total_due += amount_due;

        outstanding_invoices.push(OutstandingInvoiceSummary {
            document_id: row.get::<String>(0).unwrap_or_default(),
            doc_number: row.get::<String>(1).unwrap_or_default(),
            grand_total,
            amount_paid,
            amount_due,
            doc_date: row.get::<i64>(5).unwrap_or(0),
        });
    }

    let credit_used = total_due;
    let available_credit = (credit_limit - credit_used).max(0.0);
    let is_over_limit = credit_limit > 0.0 && credit_used > credit_limit;

    Ok(CustomerBillingContext {
        customer_id: Some(resolved_customer_id),
        customer_name,
        email,
        phone,
        gstin,
        pan,
        dl_no,
        billing_addr,
        city,
        state,
        pincode,
        credit_limit,
        credit_used,
        wallet_balance,
        collect_taxes,
        accepts_email_marketing,
        accepts_sms_marketing,
        accepts_whatsapp_marketing,
        date_of_birth,
        anniversary,
        notes,
        tags,
        addresses,
        gst_supply_type,
        total_spent,
        total_orders,
        available_credit,
        is_over_limit,
        media_id,
        image_url,
        price_list_id,
        outstanding_invoices,
    })
}

// ── Tag Management ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn shop_list_tags(
    tag_type: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ShopTag>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let t_type = tag_type.unwrap_or_else(|| "customer".to_string());
    let mut rows = conn
        .query(
            "SELECT id, name, color, tag_type FROM shop_tags WHERE profile_id = ? AND tag_type = ? ORDER BY name ASC",
            crate::turso_params![profile_id, t_type],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(ShopTag {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            color: row.get::<String>(2).ok(),
            tag_type: row.get(3).unwrap_or_default(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn shop_create_tag(
    name: String,
    color: Option<String>,
    tag_type: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<ShopTag, String> {
    if name.trim().is_empty() {
        return Err("Tag name is required".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let tag_id = new_id("tag");
    let t_type = tag_type.unwrap_or_else(|| "customer".to_string());
    let tag_name = name.trim().to_string();

    conn.execute(
        "INSERT INTO shop_tags (id, profile_id, name, color, tag_type) VALUES (?, ?, ?, ?, ?) \
         ON CONFLICT (profile_id, name, tag_type) DO UPDATE SET color = COALESCE(excluded.color, shop_tags.color)",
        crate::turso_params![tag_id.clone(), profile_id.clone(), tag_name.clone(), color.clone(), t_type.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ShopTag {
        id: tag_id,
        name: tag_name,
        color,
        tag_type: t_type,
    })
}

#[tauri::command]
pub async fn shop_adjust_customer_credit(
    data: AdjustCreditData,
    state: State<'_, Arc<AppState>>,
) -> Result<Customer, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Fetch current wallet balance
    let mut rows = conn
        .query(
            "SELECT id, name, COALESCE(wallet_balance, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ?",
            crate::turso_params![data.customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (_cust_name, curr_bal) = if let Ok(Some(row)) = rows.next().await {
        let name: String = row.get(1).unwrap_or_default();
        let sc: f64 = row.get(2).unwrap_or(0.0);
        (name, sc)
    } else {
        return Err("Customer not found".into());
    };

    let new_bal = (curr_bal + data.delta_amount).max(0.0);
    let entry_type = data.entry_type.unwrap_or_else(|| {
        if data.delta_amount > 0.0 {
            "issuance".to_string()
        } else {
            "adjustment".to_string()
        }
    });

    // 2. Update customer table
    conn.execute(
        "UPDATE shop_customers SET wallet_balance = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        crate::turso_params![new_bal, data.customer_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 3. Append to ledger
    let ledger_id = new_id("scl");
    let note_text = data.notes.clone().unwrap_or_else(|| {
        format!("Wallet balance {} of ₹{:.2}", entry_type, data.delta_amount.abs())
    });

    conn.execute(
        "INSERT INTO shop_customer_credit_ledger \
         (id, profile_id, customer_id, entry_type, amount, balance_after, document_id, payment_id, notes) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            ledger_id,
            profile_id.clone(),
            data.customer_id.clone(),
            entry_type.clone(),
            data.delta_amount,
            new_bal,
            data.document_id.clone(),
            None::<String>,
            note_text
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    //    Debit 5400 (Marketing & Customer Goodwill) · Credit 2150 (Store Credit Liability)
    // C. Negative Adjustment (liability cancellation / expiry):
    //    Debit 2150 (Store Credit Liability) · Credit 4100 (Other Income / Breakage)
    let is_return_refund = entry_type == "refund" || data.document_id.is_some();
    let liab_id = account_id_by_code(&conn, &profile_id, "2150").await;

    if let Some(liab) = liab_id {
        let abs_amt = data.delta_amount.abs();
        if data.delta_amount > 0.0 {
            // Credit issuance
            if is_return_refund {
                let rev_id = account_id_by_code(&conn, &profile_id, "4001").await;
                if let Some(rev) = rev_id {
                    let narration = format!("Store credit refund for return: ₹{:.2}", abs_amt);
                    let lines = vec![
                        (rev, abs_amt, 0.0_f64, Some(format!("Sales return refund for customer {}", data.customer_id))),
                        (liab, 0.0_f64, abs_amt, Some("Store credit liability created".to_string())),
                    ];
                    let _ = post_journal_entry(
                        &conn,
                        &profile_id,
                        &narration,
                        data.document_id.as_deref(),
                        &lines,
                    )
                    .await;
                }
            } else {
                // Goodwill / Courtesy / Promotional credit: debit Marketing & Promotional Expense (5400) or Misc (5900)
                let mktg_id = if let Some(id) = account_id_by_code(&conn, &profile_id, "5400").await {
                    Some(id)
                } else {
                    account_id_by_code(&conn, &profile_id, "5900").await
                };

                if let Some(mktg) = mktg_id {
                    let narration = format!("Customer goodwill store credit issued: ₹{:.2}", abs_amt);
                    let lines = vec![
                        (mktg, abs_amt, 0.0_f64, Some(format!("Courtesy/goodwill credit for customer {}", data.customer_id))),
                        (liab, 0.0_f64, abs_amt, Some("Store credit liability created".to_string())),
                    ];
                    let _ = post_journal_entry(
                        &conn,
                        &profile_id,
                        &narration,
                        data.document_id.as_deref(),
                        &lines,
                    )
                    .await;
                }
            }
        } else {
            // Negative adjustment: debit Store Credit Liability (2150) · credit Other Income (4100) or Misc (5900)
            let inc_id = if let Some(id) = account_id_by_code(&conn, &profile_id, "4100").await {
                Some(id)
            } else {
                account_id_by_code(&conn, &profile_id, "5900").await
            };

            if let Some(inc) = inc_id {
                let narration = format!("Store credit liability adjustment: -₹{:.2}", abs_amt);
                let lines = vec![
                    (liab, abs_amt, 0.0_f64, Some(format!("Credit adjustment for customer {}", data.customer_id))),
                    (inc, 0.0_f64, abs_amt, Some("Store credit liability reduction / breakage income".to_string())),
                ];
                let _ = post_journal_entry(
                    &conn,
                    &profile_id,
                    &narration,
                    data.document_id.as_deref(),
                    &lines,
                )
                .await;
            }
        }
    }

    // 5. Fetch updated customer
    let mut c_rows = conn
        .query(
            "SELECT id, contact_id, name, phone, email, gstin, pan, dl_no, billing_addr, city, state, \
                COALESCE(credit_limit, 0.0), COALESCE(credit_used, 0.0), \
                COALESCE(wallet_balance, 0.0), COALESCE(loyalty_pts, 0.0), loyalty_pts_expiring_at, \
                COALESCE(total_orders, 0), COALESCE(total_spent, 0.0), \
                COALESCE(is_active, 1), COALESCE(created_at, 0), \
                notes, COALESCE(tags, '[]'), \
                COALESCE(collect_taxes, 1), \
                COALESCE(accepts_email_marketing, 0), COALESCE(accepts_sms_marketing, 0), COALESCE(accepts_whatsapp_marketing, 0), \
                date_of_birth, anniversary, \
                COALESCE(addresses, '[]'), COALESCE(gst_supply_type, 'regular'), \
                media_id, image_url, pincode, price_list_id \
         FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![data.customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = c_rows.next().await {
        Ok(Customer {
            id: row.get::<Option<String>>(0).ok().flatten().unwrap_or_default(),
            contact_id: row.get::<Option<String>>(1).ok().flatten(),
            name: row.get::<Option<String>>(2).ok().flatten().unwrap_or_default(),
            phone: row.get::<Option<String>>(3).ok().flatten().filter(|s| !s.is_empty()),
            email: row.get::<Option<String>>(4).ok().flatten().filter(|s| !s.is_empty()),
            gstin: row.get::<Option<String>>(5).ok().flatten().filter(|s| !s.is_empty()),
            pan: row.get::<Option<String>>(6).ok().flatten().filter(|s| !s.is_empty()),
            dl_no: row.get::<Option<String>>(7).ok().flatten().filter(|s| !s.is_empty()),
            billing_addr: row.get::<Option<String>>(8).ok().flatten().filter(|s| !s.is_empty() && s != "{}"),
            city: row.get::<Option<String>>(9).ok().flatten().filter(|s| !s.is_empty()),
            state: row.get::<Option<String>>(10).ok().flatten().filter(|s| !s.is_empty()),
            pincode: row.get::<Option<String>>(32).ok().flatten().filter(|s| !s.is_empty()),
            price_list_id: row.get::<Option<String>>(33).ok().flatten().filter(|s| !s.is_empty()),
            credit_limit: row.get::<Option<f64>>(11).ok().flatten().unwrap_or(0.0),
            credit_used: row.get::<Option<f64>>(12).ok().flatten().unwrap_or(0.0),
            wallet_balance: row.get::<Option<f64>>(13).ok().flatten().unwrap_or(0.0),
            loyalty_pts: row.get::<Option<f64>>(14).ok().flatten().unwrap_or(0.0),
            loyalty_pts_expiring_at: row.get::<Option<i64>>(15).ok().flatten(),
            total_orders: row.get::<Option<i64>>(16).ok().flatten().unwrap_or(0),
            total_spent: row.get::<Option<f64>>(17).ok().flatten().unwrap_or(0.0),
            is_active: row.get::<Option<i64>>(18).ok().flatten().unwrap_or(1),
            created_at: row.get::<Option<i64>>(19).ok().flatten().unwrap_or(0),
            notes: row.get::<Option<String>>(20).ok().flatten().filter(|s| !s.is_empty()),
            tags: row.get::<Option<String>>(21).ok().flatten(),
            collect_taxes: row.get::<Option<i64>>(22).ok().flatten().unwrap_or(1),
            accepts_email_marketing: row.get::<Option<i64>>(23).ok().flatten().unwrap_or(0),
            accepts_sms_marketing: row.get::<Option<i64>>(24).ok().flatten().unwrap_or(0),
            accepts_whatsapp_marketing: row.get::<Option<i64>>(25).ok().flatten().unwrap_or(0),
            date_of_birth: row.get::<Option<String>>(26).ok().flatten(),
            anniversary: row.get::<Option<String>>(27).ok().flatten(),
            addresses: row.get::<Option<String>>(28).ok().flatten(),
            gst_supply_type: row.get::<Option<String>>(29).ok().flatten().or_else(|| Some("regular".to_string())),
            media_id: row.get::<Option<String>>(30).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(31).ok().flatten().filter(|s| !s.is_empty()),
        })
    } else {
        Err("Customer not found".into())
    }
}

#[tauri::command]
pub async fn shop_get_customer_credit_ledger(
    customer_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CreditLedgerEntry>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, customer_id, entry_type, amount, balance_after, document_id, payment_id, notes, created_at \
             FROM shop_customer_credit_ledger \
             WHERE profile_id = ? AND customer_id = ? \
             ORDER BY created_at DESC, id DESC LIMIT 100",
            crate::turso_params![profile_id, customer_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(CreditLedgerEntry {
            id: row.get(0).unwrap_or_default(),
            customer_id: row.get(1).unwrap_or_default(),
            entry_type: row.get(2).unwrap_or_default(),
            amount: row.get(3).unwrap_or(0.0),
            balance_after: row.get(4).unwrap_or(0.0),
            document_id: row.get::<String>(5).ok(),
            payment_id: row.get::<String>(6).ok(),
            notes: row.get::<String>(7).ok(),
            created_at: row.get(8).unwrap_or(0),
        });
    }

    Ok(out)
}

/// Top up customer wallet balance (stored in shop_customer_credit_ledger).
#[tauri::command]
pub async fn shop_topup_customer_wallet(
    data: TopupWalletData,
    state: State<'_, Arc<AppState>>,
) -> Result<Customer, String> {
    if data.amount <= 0.0 {
        return Err("Topup amount must be positive".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Fetch current wallet balance
    let mut rows = conn
        .query(
            "SELECT COALESCE(wallet_balance, store_credit, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![data.customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let current_bal = if let Ok(Some(row)) = rows.next().await {
        row.get::<f64>(0).unwrap_or(0.0)
    } else {
        return Err("Customer not found".into());
    };

    let new_bal = current_bal + data.amount;

    // 2. Update customer wallet_balance and store_credit
    conn.execute(
        "UPDATE shop_customers SET wallet_balance = ?, store_credit = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        crate::turso_params![new_bal, new_bal, data.customer_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 3. Append to credit ledger
    let ledger_id = new_id("crd");
    let note_text = data.notes.unwrap_or_else(|| format!("Wallet topup via {}", data.payment_mode.as_deref().unwrap_or("cash")));
    conn.execute(
        "INSERT INTO shop_customer_credit_ledger \
         (id, profile_id, customer_id, entry_type, amount, balance_after, notes, created_at) \
         VALUES (?, ?, ?, 'topup', ?, ?, ?, strftime('%s','now'))",
        crate::turso_params![ledger_id, profile_id.clone(), data.customer_id.clone(), data.amount, new_bal, note_text],
    )
    .await
    .map_err(|e| e.to_string())?;

    shop_get_customer_detail(data.customer_id, state).await.map(|d| d.customer)
}

/// Spend / redeem customer wallet balance against a bill.
#[tauri::command]
pub async fn shop_redeem_customer_wallet(
    data: RedeemWalletData,
    state: State<'_, Arc<AppState>>,
) -> Result<Customer, String> {
    if data.amount <= 0.0 {
        return Err("Redemption amount must be positive".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Fetch current wallet balance
    let mut rows = conn
        .query(
            "SELECT COALESCE(wallet_balance, store_credit, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![data.customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let current_bal = if let Ok(Some(row)) = rows.next().await {
        row.get::<f64>(0).unwrap_or(0.0)
    } else {
        return Err("Customer not found".into());
    };

    if data.amount > current_bal {
        return Err(format!("Insufficient wallet balance: requested ₹{:.2}, available ₹{:.2}", data.amount, current_bal));
    }

    let new_bal = current_bal - data.amount;

    // 2. Update customer wallet_balance and store_credit
    conn.execute(
        "UPDATE shop_customers SET wallet_balance = ?, store_credit = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        crate::turso_params![new_bal, new_bal, data.customer_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 3. Append to credit ledger
    let ledger_id = new_id("crd");
    let note_text = data.notes.unwrap_or_else(|| format!("Wallet payment for doc {}", data.document_id.as_deref().unwrap_or("-")));
    conn.execute(
        "INSERT INTO shop_customer_credit_ledger \
         (id, profile_id, customer_id, entry_type, amount, balance_after, document_id, notes, created_at) \
         VALUES (?, ?, ?, 'redeem', ?, ?, ?, ?, strftime('%s','now'))",
        crate::turso_params![ledger_id, profile_id.clone(), data.customer_id.clone(), -data.amount, new_bal, data.document_id, note_text],
    )
    .await
    .map_err(|e| e.to_string())?;

    shop_get_customer_detail(data.customer_id, state).await.map(|d| d.customer)
}

#[tauri::command]
pub async fn shop_adjust_customer_loyalty(
    data: AdjustLoyaltyData,
    state: State<'_, Arc<AppState>>,
) -> Result<Customer, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Fetch current loyalty points
    let mut rows = conn
        .query(
            "SELECT COALESCE(loyalty_pts, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![data.customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let current_pts = if let Ok(Some(row)) = rows.next().await {
        row.get::<f64>(0).unwrap_or(0.0)
    } else {
        return Err("Customer not found".into());
    };

    let new_pts = (current_pts + data.points_delta).max(0.0);
    let entry_type = data.entry_type.unwrap_or_else(|| {
        if data.points_delta >= 0.0 {
            "earn".to_string()
        } else {
            "redeem".to_string()
        }
    });

    // 2. Update customer loyalty_pts and optional expiring_at
    conn.execute(
        "UPDATE shop_customers SET loyalty_pts = ?, loyalty_pts_expiring_at = COALESCE(?, loyalty_pts_expiring_at), updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        crate::turso_params![new_pts, data.expires_at, data.customer_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 3. Append to loyalty ledger
    let ledger_id = new_id("sll");
    let reason_text = data.reason.clone().unwrap_or_else(|| {
        format!("Loyalty points {} of {:.1} pts", entry_type, data.points_delta.abs())
    });

    conn.execute(
        "INSERT INTO shop_loyalty_ledger \
         (id, profile_id, customer_id, entry_type, points, balance_after, document_id, reason, expires_at, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))",
        crate::turso_params![
            ledger_id,
            profile_id.clone(),
            data.customer_id.clone(),
            entry_type,
            data.points_delta,
            new_pts,
            data.document_id.clone(),
            reason_text,
            data.expires_at,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 4. Return updated customer
    let mut c_rows = conn
        .query(
            "SELECT id, contact_id, name, phone, email, gstin, pan, dl_no, billing_addr, city, state, \
                COALESCE(credit_limit, 0.0), COALESCE(credit_used, 0.0), \
                COALESCE(wallet_balance, 0.0), COALESCE(loyalty_pts, 0.0), loyalty_pts_expiring_at, \
                COALESCE(total_orders, 0), COALESCE(total_spent, 0.0), \
                COALESCE(is_active, 1), COALESCE(created_at, 0), \
                notes, COALESCE(tags, '[]'), \
                COALESCE(collect_taxes, 1), \
                COALESCE(accepts_email_marketing, 0), COALESCE(accepts_sms_marketing, 0), COALESCE(accepts_whatsapp_marketing, 0), \
                date_of_birth, anniversary, \
                COALESCE(addresses, '[]'), COALESCE(gst_supply_type, 'regular'), \
                media_id, image_url, pincode, price_list_id \
         FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![data.customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = c_rows.next().await {
        Ok(Customer {
            id: row.get::<Option<String>>(0).ok().flatten().unwrap_or_default(),
            contact_id: row.get::<Option<String>>(1).ok().flatten(),
            name: row.get::<Option<String>>(2).ok().flatten().unwrap_or_default(),
            phone: row.get::<Option<String>>(3).ok().flatten().filter(|s| !s.is_empty()),
            email: row.get::<Option<String>>(4).ok().flatten().filter(|s| !s.is_empty()),
            gstin: row.get::<Option<String>>(5).ok().flatten().filter(|s| !s.is_empty()),
            pan: row.get::<Option<String>>(6).ok().flatten().filter(|s| !s.is_empty()),
            dl_no: row.get::<Option<String>>(7).ok().flatten().filter(|s| !s.is_empty()),
            billing_addr: row.get::<Option<String>>(8).ok().flatten().filter(|s| !s.is_empty() && s != "{}"),
            city: row.get::<Option<String>>(9).ok().flatten().filter(|s| !s.is_empty()),
            state: row.get::<Option<String>>(10).ok().flatten().filter(|s| !s.is_empty()),
            pincode: row.get::<Option<String>>(32).ok().flatten().filter(|s| !s.is_empty()),
            price_list_id: row.get::<Option<String>>(33).ok().flatten().filter(|s| !s.is_empty()),
            credit_limit: row.get::<Option<f64>>(11).ok().flatten().unwrap_or(0.0),
            credit_used: row.get::<Option<f64>>(12).ok().flatten().unwrap_or(0.0),
            wallet_balance: row.get::<Option<f64>>(13).ok().flatten().unwrap_or(0.0),
            loyalty_pts: row.get::<Option<f64>>(14).ok().flatten().unwrap_or(0.0),
            loyalty_pts_expiring_at: row.get::<Option<i64>>(15).ok().flatten(),
            total_orders: row.get::<Option<i64>>(16).ok().flatten().unwrap_or(0),
            total_spent: row.get::<Option<f64>>(17).ok().flatten().unwrap_or(0.0),
            is_active: row.get::<Option<i64>>(18).ok().flatten().unwrap_or(1),
            created_at: row.get::<Option<i64>>(19).ok().flatten().unwrap_or(0),
            notes: row.get::<Option<String>>(20).ok().flatten().filter(|s| !s.is_empty()),
            tags: row.get::<Option<String>>(21).ok().flatten(),
            collect_taxes: row.get::<Option<i64>>(22).ok().flatten().unwrap_or(1),
            accepts_email_marketing: row.get::<Option<i64>>(23).ok().flatten().unwrap_or(0),
            accepts_sms_marketing: row.get::<Option<i64>>(24).ok().flatten().unwrap_or(0),
            accepts_whatsapp_marketing: row.get::<Option<i64>>(25).ok().flatten().unwrap_or(0),
            date_of_birth: row.get::<Option<String>>(26).ok().flatten(),
            anniversary: row.get::<Option<String>>(27).ok().flatten(),
            addresses: row.get::<Option<String>>(28).ok().flatten(),
            gst_supply_type: row.get::<Option<String>>(29).ok().flatten().or_else(|| Some("regular".to_string())),
            media_id: row.get::<Option<String>>(30).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(31).ok().flatten().filter(|s| !s.is_empty()),
        })
    } else {
        Err("Customer not found".into())
    }
}

/// Redeem loyalty points at checkout as a discount.
#[tauri::command]
pub async fn shop_redeem_loyalty_points(
    data: RedeemLoyaltyPointsData,
    state: State<'_, Arc<AppState>>,
) -> Result<Customer, String> {
    if data.points_to_redeem <= 0.0 {
        return Err("Points to redeem must be positive".into());
    }
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Fetch customer points
    let mut rows = conn
        .query(
            "SELECT COALESCE(loyalty_pts, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![data.customer_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let current_pts = if let Ok(Some(row)) = rows.next().await {
        row.get::<f64>(0).unwrap_or(0.0)
    } else {
        return Err("Customer not found".into());
    };

    if data.points_to_redeem > current_pts {
        return Err(format!("Insufficient loyalty points: requested {:.1} pts, available {:.1} pts", data.points_to_redeem, current_pts));
    }

    // 2. Fetch loyalty config
    let config = shop_get_loyalty_config(state.clone()).await?;
    if config.is_enabled == 0 {
        return Err("Loyalty program is currently disabled".into());
    }

    let discount_val = data.points_to_redeem * config.point_value_currency;

    // 3. Fetch invoice grand_total & discount_amt
    let mut doc_rows = conn
        .query(
            "SELECT grand_total, discount_amt, amount_due FROM shop_documents WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![data.document_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (grand_total, old_discount, amount_due) = if let Ok(Some(row)) = doc_rows.next().await {
        (row.get::<f64>(0).unwrap_or(0.0), row.get::<f64>(1).unwrap_or(0.0), row.get::<f64>(2).unwrap_or(0.0))
    } else {
        return Err("Document not found".into());
    };

    let max_allowed_discount = (grand_total + old_discount) * (config.max_redeem_percent / 100.0);
    if discount_val > max_allowed_discount {
        return Err(format!("Redemption exceeds maximum allowed limit of {:.0}% (max ₹{:.2})", config.max_redeem_percent, max_allowed_discount));
    }

    // 4. Update document discount and totals
    let new_discount = old_discount + discount_val;
    let new_grand_total = (grand_total - discount_val).max(0.0);
    let new_amount_due = (amount_due - discount_val).max(0.0);

    conn.execute(
        "UPDATE shop_documents SET discount_amt = ?, grand_total = ?, amount_due = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        crate::turso_params![new_discount, new_grand_total, new_amount_due, data.document_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 5. Append to loyalty ledger
    let new_pts = current_pts - data.points_to_redeem;
    let ledger_id = new_id("sll");
    let reason_text = format!("Points redemption (₹{:.2} discount on doc {})", discount_val, data.document_id);

    conn.execute(
        "INSERT INTO shop_loyalty_ledger \
         (id, profile_id, customer_id, entry_type, points, balance_after, document_id, reason, created_at) \
         VALUES (?, ?, ?, 'redeem', ?, ?, ?, ?, strftime('%s','now'))",
        crate::turso_params![
            ledger_id,
            profile_id.clone(),
            data.customer_id.clone(),
            -data.points_to_redeem,
            new_pts,
            data.document_id.clone(),
            reason_text,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 6. Update customer loyalty_pts
    conn.execute(
        "UPDATE shop_customers SET loyalty_pts = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        crate::turso_params![new_pts, data.customer_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    shop_get_customer_detail(data.customer_id, state).await.map(|d| d.customer)
}

#[tauri::command]
pub async fn shop_get_customer_loyalty_ledger(
    customer_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LoyaltyLedgerEntry>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, customer_id, entry_type, points, balance_after, document_id, reason, expires_at, created_at \
             FROM shop_loyalty_ledger \
             WHERE profile_id = ? AND customer_id = ? \
             ORDER BY created_at DESC, id DESC LIMIT 100",
            crate::turso_params![profile_id, customer_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(LoyaltyLedgerEntry {
            id: row.get(0).unwrap_or_default(),
            customer_id: row.get(1).unwrap_or_default(),
            entry_type: row.get(2).unwrap_or_default(),
            points: row.get(3).unwrap_or(0.0),
            balance_after: row.get(4).unwrap_or(0.0),
            document_id: row.get::<String>(5).ok(),
            reason: row.get::<String>(6).ok(),
            expires_at: row.get::<i64>(7).ok(),
            created_at: row.get(8).unwrap_or(0),
        });
    }

    Ok(out)
}

#[tauri::command]
pub async fn shop_get_config(
    key: String,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT config_val FROM shop_configs WHERE profile_id = ? AND config_key = ? LIMIT 1",
            crate::turso_params![profile_id, key],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row.get::<String>(0).unwrap_or_else(|_| "{}".to_string()))
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
pub async fn shop_set_config(
    key: String,
    val: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = format!("cfg-{}-{}", profile_id, key);
    conn.execute(
        "INSERT INTO shop_configs (id, profile_id, config_key, config_val, updated_at) \
         VALUES (?, ?, ?, ?, strftime('%s','now')) \
         ON CONFLICT (profile_id, config_key) DO UPDATE SET \
            config_val = excluded.config_val, \
            updated_at = excluded.updated_at",
        crate::turso_params![id, profile_id, key, val],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn shop_get_loyalty_config(
    state: State<'_, Arc<AppState>>,
) -> Result<LoyaltyConfig, String> {
    let profile_id = state.require_profile().await?;
    let json_str = shop_get_config("loyalty".to_string(), state.clone()).await.unwrap_or_else(|_| "{}".to_string());

    #[derive(Deserialize)]
    struct RawLoyalty {
        is_enabled: Option<i64>,
        points_per_currency: Option<f64>,
        point_value_currency: Option<f64>,
        min_order_amount: Option<f64>,
        max_redeem_percent: Option<f64>,
        expiry_days: Option<i64>,
    }

    let parsed: Option<RawLoyalty> = serde_json::from_str(&json_str).ok();
    if let Some(r) = parsed {
        Ok(LoyaltyConfig {
            profile_id,
            is_enabled: r.is_enabled.unwrap_or(1),
            points_per_currency: r.points_per_currency.unwrap_or(0.01),
            point_value_currency: r.point_value_currency.unwrap_or(1.0),
            min_order_amount: r.min_order_amount.unwrap_or(0.0),
            max_redeem_percent: r.max_redeem_percent.unwrap_or(50.0),
            expiry_days: r.expiry_days.unwrap_or(365),
        })
    } else {
        Ok(LoyaltyConfig {
            profile_id,
            is_enabled: 1,
            points_per_currency: 0.01,
            point_value_currency: 1.0,
            min_order_amount: 0.0,
            max_redeem_percent: 50.0,
            expiry_days: 365,
        })
    }
}

#[tauri::command]
pub async fn shop_update_loyalty_config(
    data: UpdateLoyaltyConfigData,
    state: State<'_, Arc<AppState>>,
) -> Result<LoyaltyConfig, String> {
    let profile_id = state.require_profile().await?;
    let current = shop_get_loyalty_config(state.clone()).await.unwrap_or(LoyaltyConfig {
        profile_id: profile_id.clone(),
        is_enabled: 1,
        points_per_currency: 0.01,
        point_value_currency: 1.0,
        min_order_amount: 0.0,
        max_redeem_percent: 50.0,
        expiry_days: 365,
    });

    let is_enabled = data.is_enabled.unwrap_or(current.is_enabled);
    let points_per_currency = data.points_per_currency.unwrap_or(current.points_per_currency);
    let point_value_currency = data.point_value_currency.unwrap_or(current.point_value_currency);
    let min_order_amount = data.min_order_amount.unwrap_or(current.min_order_amount);
    let max_redeem_percent = data.max_redeem_percent.unwrap_or(current.max_redeem_percent);
    let expiry_days = data.expiry_days.unwrap_or(current.expiry_days);

    let updated = LoyaltyConfig {
        profile_id: profile_id.clone(),
        is_enabled,
        points_per_currency,
        point_value_currency,
        min_order_amount,
        max_redeem_percent,
        expiry_days,
    };

    let json_val = serde_json::to_string(&updated).map_err(|e| e.to_string())?;
    shop_set_config("loyalty".to_string(), json_val, state).await?;

    Ok(updated)
}

/// Live-join query to build campaign audiences without stale caching.
#[tauri::command]
pub async fn shop_get_campaign_audience(
    filter: CampaignAudienceFilter,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Customer>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let channel_opt = filter.channel.as_deref().unwrap_or("all");
    let min_pts = filter.min_loyalty_pts.unwrap_or(0.0);
    let min_spent = filter.min_spent.unwrap_or(0.0);

    let mut sql = "SELECT DISTINCT sc.id, sc.contact_id, sc.name, sc.phone, sc.email, sc.gstin, sc.pan, sc.dl_no, \
                   sc.billing_addr, sc.city, sc.state, \
                   COALESCE(sc.credit_limit, 0.0), COALESCE(sc.credit_used, 0.0), \
                   COALESCE(sc.wallet_balance, 0.0), COALESCE(sc.loyalty_pts, 0.0), sc.loyalty_pts_expiring_at, \
                   COALESCE(sc.total_orders, 0), COALESCE(sc.total_spent, 0.0), \
                   COALESCE(sc.is_active, 1), COALESCE(sc.created_at, 0), \
                   sc.notes, COALESCE(sc.tags, '[]'), \
                   COALESCE(sc.collect_taxes, 1), \
                   COALESCE(sc.accepts_email_marketing, 0), COALESCE(sc.accepts_sms_marketing, 0), COALESCE(sc.accepts_whatsapp_marketing, 0), \
                   sc.date_of_birth, sc.anniversary, \
                   COALESCE(sc.addresses, '[]'), COALESCE(sc.gst_supply_type, 'regular'), \
                   sc.media_id, sc.image_url, sc.pincode, sc.price_list_id \
            FROM shop_customers sc \
            LEFT JOIN crm_contact_groups ccg ON ccg.contact_id = sc.contact_id \
            WHERE sc.profile_id = ? AND sc.is_active = 1 \
              AND sc.loyalty_pts >= ? AND sc.total_spent >= ?".to_string();

    let mut params = vec![
        crate::db::turso::TursoParam::from(profile_id),
        crate::db::turso::TursoParam::from(min_pts),
        crate::db::turso::TursoParam::from(min_spent),
    ];

    if let Some(gid) = filter.group_id {
        if !gid.trim().is_empty() {
            sql.push_str(" AND ccg.group_id = ?");
            params.push(crate::db::turso::TursoParam::from(gid));
        }
    }

    match channel_opt {
        "sms" => sql.push_str(" AND sc.accepts_sms_marketing = 1 AND sc.phone IS NOT NULL AND sc.phone != ''"),
        "whatsapp" => sql.push_str(" AND sc.accepts_whatsapp_marketing = 1 AND sc.phone IS NOT NULL AND sc.phone != ''"),
        "email" => sql.push_str(" AND sc.accepts_email_marketing = 1 AND sc.email IS NOT NULL AND sc.email != ''"),
        _ => {}
    }

    if let Some(bday) = filter.birthday_month_day {
        if !bday.trim().is_empty() {
            sql.push_str(" AND (sc.date_of_birth LIKE ? OR sc.date_of_birth = ?)");
            params.push(crate::db::turso::TursoParam::from(format!("%{}", bday)));
            params.push(crate::db::turso::TursoParam::from(bday));
        }
    }

    if let Some(anni) = filter.anniversary_month_day {
        if !anni.trim().is_empty() {
            sql.push_str(" AND (sc.anniversary LIKE ? OR sc.anniversary = ?)");
            params.push(crate::db::turso::TursoParam::from(format!("%{}", anni)));
            params.push(crate::db::turso::TursoParam::from(anni));
        }
    }

    sql.push_str(" ORDER BY sc.name ASC LIMIT 500");

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(Customer {
            id: row.get::<Option<String>>(0).ok().flatten().unwrap_or_default(),
            contact_id: row.get::<Option<String>>(1).ok().flatten(),
            name: row.get::<Option<String>>(2).ok().flatten().unwrap_or_default(),
            phone: row.get::<Option<String>>(3).ok().flatten().filter(|s| !s.is_empty()),
            email: row.get::<Option<String>>(4).ok().flatten().filter(|s| !s.is_empty()),
            gstin: row.get::<Option<String>>(5).ok().flatten().filter(|s| !s.is_empty()),
            pan: row.get::<Option<String>>(6).ok().flatten().filter(|s| !s.is_empty()),
            dl_no: row.get::<Option<String>>(7).ok().flatten().filter(|s| !s.is_empty()),
            billing_addr: row.get::<Option<String>>(8).ok().flatten().filter(|s| !s.is_empty() && s != "{}"),
            city: row.get::<Option<String>>(9).ok().flatten().filter(|s| !s.is_empty()),
            state: row.get::<Option<String>>(10).ok().flatten().filter(|s| !s.is_empty()),
            pincode: row.get::<Option<String>>(32).ok().flatten().filter(|s| !s.is_empty()),
            price_list_id: row.get::<Option<String>>(33).ok().flatten().filter(|s| !s.is_empty()),
            credit_limit: row.get::<Option<f64>>(11).ok().flatten().unwrap_or(0.0),
            credit_used: row.get::<Option<f64>>(12).ok().flatten().unwrap_or(0.0),
            wallet_balance: row.get::<Option<f64>>(13).ok().flatten().unwrap_or(0.0),
            loyalty_pts: row.get::<Option<f64>>(14).ok().flatten().unwrap_or(0.0),
            loyalty_pts_expiring_at: row.get::<Option<i64>>(15).ok().flatten(),
            total_orders: row.get::<Option<i64>>(16).ok().flatten().unwrap_or(0),
            total_spent: row.get::<Option<f64>>(17).ok().flatten().unwrap_or(0.0),
            is_active: row.get::<Option<i64>>(18).ok().flatten().unwrap_or(1),
            created_at: row.get::<Option<i64>>(19).ok().flatten().unwrap_or(0),
            notes: row.get::<Option<String>>(20).ok().flatten().filter(|s| !s.is_empty()),
            tags: row.get::<Option<String>>(21).ok().flatten(),
            collect_taxes: row.get::<Option<i64>>(22).ok().flatten().unwrap_or(1),
            accepts_email_marketing: row.get::<Option<i64>>(23).ok().flatten().unwrap_or(0),
            accepts_sms_marketing: row.get::<Option<i64>>(24).ok().flatten().unwrap_or(0),
            accepts_whatsapp_marketing: row.get::<Option<i64>>(25).ok().flatten().unwrap_or(0),
            date_of_birth: row.get::<Option<String>>(26).ok().flatten(),
            anniversary: row.get::<Option<String>>(27).ok().flatten(),
            addresses: row.get::<Option<String>>(28).ok().flatten(),
            gst_supply_type: row.get::<Option<String>>(29).ok().flatten().or_else(|| Some("regular".to_string())),
            media_id: row.get::<Option<String>>(30).ok().flatten().filter(|s| !s.is_empty()),
            image_url: row.get::<Option<String>>(31).ok().flatten().filter(|s| !s.is_empty()),
        });
    }
    Ok(out)
}
