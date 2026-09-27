// src-tauri/src/commands/fin/expenses.rs
//
// Direct expense commands — Phase 4, Step 8.
// Expenses not tied to a vendor invoice — rent, petrol, office supplies.
// On save: auto-posts a journal entry (DR Expense Account, CR Bank/Cash).

use crate::commands::fin::journal::{account_id_by_code, post_journal_entry};
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
pub struct Expense {
    pub id: String,
    pub profile_id: String,
    pub expense_date: i64,
    pub category: String,
    pub amount: f64,
    pub tax_amount: f64,
    pub total_amount: f64,
    pub payment_mode: String,
    pub paid_by: Option<String>,
    pub description: Option<String>,
    pub is_reimbursable: i64,
    pub journal_entry_id: Option<String>,
}

// Category → account code mapping
fn expense_account_code(category: &str) -> &'static str {
    let lower = category.trim().to_lowercase();
    if lower.contains("rent") {
        "5100"
    } else if lower.contains("sal") || lower.contains("wage") {
        "5200"
    } else if lower.contains("util") || lower.contains("electric") || lower.contains("power") || lower.contains("water") || lower.contains("internet") {
        "5300"
    } else if lower.contains("mktg") || lower.contains("market") || lower.contains("ad") || lower.contains("promo") {
        "5400"
    } else if lower.contains("travel") || lower.contains("transport") || lower.contains("fuel") || lower.contains("petrol") {
        "5500"
    } else if lower.contains("cogs") || lower.contains("cost of goods") {
        "5001"
    } else if lower.contains("round") || lower.contains("adjust") {
        "5950"
    } else {
        "5900" // Miscellaneous
    }
}

fn payment_mode_account_code(mode: &str) -> &'static str {
    match mode {
        "bank" | "card" | "upi" => "1002", // Bank Account
        _ => "1001",                       // Cash
    }
}

// ── fin_create_expense ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateExpenseArgs {
    pub category: String,
    pub amount: f64,
    pub tax_amount: Option<f64>,
    pub payment_mode: Option<String>,
    pub paid_by: Option<String>,
    pub description: Option<String>,
    pub expense_date: Option<i64>,
    pub is_reimbursable: Option<bool>,
    pub account_id: Option<String>, // override expense account
}

#[tauri::command]
pub async fn fin_create_expense(
    state: State<'_, Arc<AppState>>,
    args: CreateExpenseArgs,
) -> Result<Expense, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();
    let expense_date = args.expense_date.unwrap_or(now);
    let tax_amount = args.tax_amount.unwrap_or(0.0);
    let total_amount = args.amount + tax_amount;
    let payment_mode = args.payment_mode.as_deref().unwrap_or("cash").to_string();
    let id = new_id("exp");

    // Resolve account IDs for journal entry
    let exp_code = expense_account_code(&args.category);
    let pay_code = payment_mode_account_code(&payment_mode);
    let exp_suffix = match exp_code {
        "5100" => "rent",
        "5200" => "sal",
        "5300" => "util",
        "5400" => "mktg",
        "5500" => "travel",
        "5001" => "cogs",
        "5950" => "roundoff",
        _ => "misc",
    };
    let expense_account_id = if let Some(ref acc_id) = args.account_id {
        if !acc_id.trim().is_empty() {
            acc_id.clone()
        } else {
            account_id_by_code(&conn, &profile_id, exp_code)
                .await
                .unwrap_or_else(|| format!("{}_{}", profile_id, exp_suffix))
        }
    } else {
        account_id_by_code(&conn, &profile_id, exp_code)
            .await
            .unwrap_or_else(|| format!("{}_{}", profile_id, exp_suffix))
    };
    let payment_account_id = account_id_by_code(&conn, &profile_id, pay_code)
        .await
        .unwrap_or_else(|| {
            if pay_code == "1002" {
                format!("{}_bank", profile_id)
            } else {
                format!("{}_cash", profile_id)
            }
        });

    let narration = format!(
        "{} — {}",
        args.category,
        args.description.as_deref().unwrap_or("Expense")
    );

    // Auto-post journal entry: DR Expense, CR Cash/Bank
    let journal_entry_id = post_journal_entry(
        &conn,
        &profile_id,
        &narration,
        None,
        &[
            (
                expense_account_id,
                total_amount,
                0.0,
                Some(args.category.clone()),
            ),
            (
                payment_account_id,
                0.0,
                total_amount,
                Some(format!("Paid via {}", payment_mode)),
            ),
        ],
    )
    .await
    .ok();

    conn.execute(
        "INSERT INTO fin_expenses
         (id, profile_id, expense_date, category, amount, tax_amount, total_amount,
          payment_mode, paid_by, description, is_reimbursable, journal_entry_id, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            expense_date,
            args.category.clone(),
            args.amount,
            tax_amount,
            total_amount,
            payment_mode.clone(),
            args.paid_by.clone(),
            args.description.clone(),
            args.is_reimbursable.unwrap_or(false) as i64,
            journal_entry_id.clone(),
            now,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(Expense {
        id,
        profile_id,
        expense_date,
        category: args.category,
        amount: args.amount,
        tax_amount,
        total_amount,
        payment_mode,
        paid_by: args.paid_by,
        description: args.description,
        is_reimbursable: args.is_reimbursable.unwrap_or(false) as i64,
        journal_entry_id,
    })
}

// ── fin_list_expenses ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_list_expenses(
    state: State<'_, Arc<AppState>>,
    from_ts: Option<i64>,
    to_ts: Option<i64>,
    category: Option<String>,
) -> Result<Vec<Expense>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let from = from_ts.unwrap_or(0);
    let to = to_ts.unwrap_or(i64::MAX);

    let (sql, param_cat) = if let Some(ref cat) = category {
        (
            "SELECT id, profile_id, expense_date, category, amount, tax_amount, total_amount,
                    payment_mode, paid_by, description, is_reimbursable, journal_entry_id
             FROM fin_expenses WHERE profile_id = ?1 AND expense_date BETWEEN ?2 AND ?3
             AND category = ?4 ORDER BY expense_date DESC LIMIT 200",
            Some(cat.clone()),
        )
    } else {
        (
            "SELECT id, profile_id, expense_date, category, amount, tax_amount, total_amount,
                    payment_mode, paid_by, description, is_reimbursable, journal_entry_id
             FROM fin_expenses WHERE profile_id = ?1 AND expense_date BETWEEN ?2 AND ?3
             ORDER BY expense_date DESC LIMIT 200",
            None,
        )
    };

    let stmt = conn.prepare(sql).await.map_err(|e| e.to_string())?;

    let mut rows = if let Some(cat) = param_cat {
        stmt.query(crate::turso_params![profile_id, from, to, cat])
            .await
            .map_err(|e| e.to_string())?
    } else {
        stmt.query(crate::turso_params![profile_id, from, to])
            .await
            .map_err(|e| e.to_string())?
    };

    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(Expense {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            expense_date: row.get::<i64>(2).unwrap_or(0),
            category: row.get::<String>(3).unwrap_or_default(),
            amount: row.get::<f64>(4).unwrap_or(0.0),
            tax_amount: row.get::<f64>(5).unwrap_or(0.0),
            total_amount: row.get::<f64>(6).unwrap_or(0.0),
            payment_mode: row.get::<String>(7).unwrap_or_else(|_| "cash".into()),
            paid_by: row.get::<String>(8).ok(),
            description: row.get::<String>(9).ok(),
            is_reimbursable: row.get::<i64>(10).unwrap_or(0),
            journal_entry_id: row.get::<String>(11).ok(),
        });
    }

    Ok(out)
}
