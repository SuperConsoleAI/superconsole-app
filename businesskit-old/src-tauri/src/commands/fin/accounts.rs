// src-tauri/src/commands/fin/accounts.rs
//
// Chart of accounts commands — Phase 4, Step 4.
//
// Commands:
//   fin_seed_default_accounts — create starter accounts when tax setup finishes
//   fin_list_accounts         — tree-friendly list for the UI
//   fin_create_account        — add a custom account
//   fin_get_account           — fetch one account by id

use crate::AppState;
use chrono::Utc;
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: String,
    pub profile_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub account_code: Option<String>,
    pub account_type: String, // asset|liability|equity|income|expense
    pub account_subtype: Option<String>,
    pub description: Option<String>,
    pub is_system: i64,
    pub is_active: i64,
    pub sort_order: i64,
}

// ── fin_seed_default_accounts ─────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_seed_default_accounts(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Account>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();

    // Default chart of accounts — any profession can use these
    let defaults: &[(&str, &str, &str, &str, Option<&str>, &str, i64)] = &[
        // (id_suffix, code, name, type, subtype, description, sort)
        (
            "cash",
            "1001",
            "Cash",
            "asset",
            Some("cash"),
            "Physical cash on hand",
            10,
        ),
        (
            "bank",
            "1002",
            "Bank Account",
            "asset",
            Some("bank"),
            "Business bank account balance",
            20,
        ),
        (
            "ar",
            "1100",
            "Accounts Receivable",
            "asset",
            Some("receivable"),
            "Money customers owe you",
            30,
        ),
        (
            "ar_agg",
            "1250",
            "Accounts Receivable — Aggregator",
            "asset",
            Some("receivable"),
            "Money food aggregators and OTAs owe you net of commission",
            32,
        ),
        (
            "inv",
            "1200",
            "Inventory",
            "asset",
            Some("inventory"),
            "Value of stock held",
            40,
        ),
        (
            "ap",
            "2001",
            "Accounts Payable",
            "liability",
            Some("payable"),
            "Money you owe suppliers",
            50,
        ),
        (
            "tax_in",
            "1300",
            "Tax / VAT Input Credit",
            "asset",
            Some("receivable"),
            "Tax / VAT paid on business purchases and expenses",
            34,
        ),
        (
            "gstpy",
            "2100",
            "Tax / VAT / GST Output Payable",
            "liability",
            Some("tax_payable"),
            "Tax collected on sales, owed to govt",
            60,
        ),
        (
            "cgst_out",
            "2110",
            "CGST Output Payable",
            "liability",
            Some("tax_payable"),
            "Central GST collected on intra-state sales",
            61,
        ),
        (
            "sgst_out",
            "2120",
            "SGST Output Payable",
            "liability",
            Some("tax_payable"),
            "State GST collected on intra-state sales",
            62,
        ),
        (
            "igst_out",
            "2130",
            "IGST Output Payable",
            "liability",
            Some("tax_payable"),
            "Integrated GST collected on inter-state sales",
            63,
        ),
        (
            "store_credit",
            "2150",
            "Store Credit Liability",
            "liability",
            Some("payable"),
            "Unredeemed customer store credits / advance deposits",
            65,
        ),
        (
            "cgst_in",
            "1310",
            "CGST Input Credit",
            "asset",
            Some("receivable"),
            "Central GST paid on intra-state purchases",
            35,
        ),
        (
            "sgst_in",
            "1320",
            "SGST Input Credit",
            "asset",
            Some("receivable"),
            "State GST paid on intra-state purchases",
            36,
        ),
        (
            "igst_in",
            "1330",
            "IGST Input Credit",
            "asset",
            Some("receivable"),
            "Integrated GST paid on inter-state purchases",
            37,
        ),
        (
            "loan",
            "2200",
            "Loans Payable",
            "liability",
            Some("loan"),
            "Bank loans and borrowings",
            70,
        ),
        (
            "cap",
            "3001",
            "Owner's Capital",
            "equity",
            None,
            "Capital invested by owner",
            80,
        ),
        (
            "re",
            "3100",
            "Retained Earnings",
            "equity",
            None,
            "Accumulated profits / losses",
            90,
        ),
        (
            "sales",
            "4001",
            "Sales Revenue",
            "income",
            Some("revenue"),
            "Revenue from sales and services",
            100,
        ),
        (
            "oinc",
            "4100",
            "Other Income",
            "income",
            Some("other_income"),
            "Interest, commissions, misc income",
            110,
        ),
        (
            "cogs",
            "5001",
            "Cost of Goods Sold",
            "expense",
            Some("cogs"),
            "Direct cost of items sold",
            120,
        ),
        (
            "rent",
            "5100",
            "Rent Expense",
            "expense",
            Some("operating"),
            "Office / shop rent",
            130,
        ),
        (
            "sal",
            "5200",
            "Salary & Wages",
            "expense",
            Some("operating"),
            "Staff salaries",
            140,
        ),
        (
            "util",
            "5300",
            "Utilities",
            "expense",
            Some("operating"),
            "Electricity, water, internet",
            150,
        ),
        (
            "agg_comm",
            "5350",
            "Aggregator Commission Expense",
            "expense",
            Some("operating"),
            "Commissions and platform service fees charged by food aggregators and OTAs",
            155,
        ),
        (
            "mktg",
            "5400",
            "Marketing & Ads",
            "expense",
            Some("operating"),
            "Advertising and promotion",
            160,
        ),
        (
            "travel",
            "5500",
            "Travel & Transport",
            "expense",
            Some("operating"),
            "Fuel, fares, travel costs",
            170,
        ),
        (
            "misc",
            "5900",
            "Miscellaneous Expense",
            "expense",
            Some("admin"),
            "Other business expenses",
            180,
        ),
        (
            "roundoff",
            "5950",
            "Round Off / Adjustment",
            "expense",
            Some("admin"),
            "Rounding differences on invoices and payments",
            185,
        ),
    ];

    let mut created = Vec::new();

    for (suffix, code, name, acc_type, subtype, desc, sort) in defaults {
        let id = format!("{}_{}", profile_id, suffix);

        conn.execute(
            "INSERT INTO fin_accounts
             (id, profile_id, name, account_code, account_type, account_subtype,
              description, is_system, is_active, sort_order, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,1,1,?8,?9)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name,
               account_code=excluded.account_code,
               account_type=excluded.account_type,
               account_subtype=excluded.account_subtype,
               description=excluded.description,
               is_system=1,
               is_active=1,
               sort_order=excluded.sort_order",
            crate::turso_params![
                id.clone(),
                profile_id.clone(),
                *name,
                *code,
                *acc_type,
                *subtype,
                *desc,
                *sort,
                now,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

        created.push(Account {
            id,
            profile_id: profile_id.clone(),
            parent_id: None,
            name: name.to_string(),
            account_code: Some(code.to_string()),
            account_type: acc_type.to_string(),
            account_subtype: subtype.map(|s| s.to_string()),
            description: Some(desc.to_string()),
            is_system: 1,
            is_active: 1,
            sort_order: *sort,
        });
    }

    Ok(created)
}

// ── fin_list_accounts ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_list_accounts(state: State<'_, Arc<AppState>>) -> Result<Vec<Account>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT id, profile_id, parent_id, name, account_code, account_type,
                    account_subtype, description, is_system, is_active, sort_order
             FROM fin_accounts WHERE profile_id = ?1 AND is_active = 1
             ORDER BY account_type, sort_order, name",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(Account {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            parent_id: row.get::<String>(2).ok(),
            name: row.get::<String>(3).unwrap_or_default(),
            account_code: row.get::<String>(4).ok(),
            account_type: row.get::<String>(5).unwrap_or_default(),
            account_subtype: row.get::<String>(6).ok(),
            description: row.get::<String>(7).ok(),
            is_system: row.get::<i64>(8).unwrap_or(0),
            is_active: row.get::<i64>(9).unwrap_or(1),
            sort_order: row.get::<i64>(10).unwrap_or(0),
        });
    }

    if out.is_empty() {
        return fin_seed_default_accounts(state).await;
    }

    Ok(out)
}

// ── fin_create_account ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateAccountArgs {
    pub name: String,
    pub account_type: String,
    pub account_subtype: Option<String>,
    pub account_code: Option<String>,
    pub parent_id: Option<String>,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn fin_create_account(
    state: State<'_, Arc<AppState>>,
    args: CreateAccountArgs,
) -> Result<Account, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();

    // Unique ID
    let id = new_id("acc");

    conn.execute(
        "INSERT INTO fin_accounts (id, profile_id, parent_id, name, account_code, account_type,
                                   account_subtype, description, is_system, is_active, sort_order, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,1,999,?9)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            args.parent_id.clone(),
            args.name.clone(),
            args.account_code.clone(),
            args.account_type.clone(),
            args.account_subtype.clone(),
            args.description.clone(),
            now,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(Account {
        id,
        profile_id,
        parent_id: args.parent_id,
        name: args.name,
        account_code: args.account_code,
        account_type: args.account_type,
        account_subtype: args.account_subtype,
        description: args.description,
        is_system: 0,
        is_active: 1,
        sort_order: 999,
    })
}
