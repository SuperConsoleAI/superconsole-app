// src-tauri/src/commands/fin/reports.rs
//
// Financial reports — Phase 4, Step 9.
// All computed from fin_journal_lines — no new data entry needed.
//
// Commands:
//   fin_get_profit_and_loss  — revenue - expenses = net profit
//   fin_get_balance_sheet    — assets, liabilities, equity (as-of date)
//   fin_get_trial_balance    — debit/credit per account (balance check)

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfitAndLoss {
    pub from_ts: i64,
    pub to_ts: i64,
    pub revenue: Vec<AccountBalance>,
    pub expenses: Vec<AccountBalance>,
    pub total_revenue: f64,
    pub total_expenses: f64,
    pub net_profit: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BalanceSheet {
    pub as_of_ts: i64,
    pub assets: Vec<AccountBalance>,
    pub liabilities: Vec<AccountBalance>,
    pub equity: Vec<AccountBalance>,
    pub total_assets: f64,
    pub total_liabilities: f64,
    pub total_equity: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrialBalance {
    pub as_of_ts: i64,
    pub rows: Vec<TrialBalanceRow>,
    pub total_debit: f64,
    pub total_credit: f64,
    pub is_balanced: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountBalance {
    pub account_id: String,
    pub account_name: String,
    pub account_code: Option<String>,
    pub balance: f64, // positive = net credit for income/liabilities, net debit for assets/expenses
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrialBalanceRow {
    pub account_id: String,
    pub account_name: String,
    pub account_code: Option<String>,
    pub total_debit: f64,
    pub total_credit: f64,
    pub net_balance: f64,
}

// ── Helper: sum journal lines by account type in a date range ────────────────

async fn sum_by_account_type(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    account_types: &str, // e.g. "'income'" or "'asset','liability'"
    from_ts: i64,
    to_ts: i64,
) -> Result<Vec<AccountBalance>, String> {
    let sql = format!(
        "SELECT a.id, a.name, a.account_code,
                COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0) as net
         FROM fin_accounts a
         LEFT JOIN fin_journal_lines l ON l.account_id = a.id
         LEFT JOIN fin_journal_entries e ON e.id = l.entry_id
           AND e.entry_date BETWEEN ?2 AND ?3
         WHERE a.profile_id = ?1 AND a.account_type IN ({}) AND a.is_active = 1
         GROUP BY a.id ORDER BY a.sort_order, a.name",
        account_types
    );

    let stmt = conn.prepare(&sql).await.map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(crate::turso_params![profile_id, from_ts, to_ts])
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        let net: f64 = row.get::<f64>(3).unwrap_or(0.0);
        if net.abs() < 0.001 {
            continue;
        } // skip zero-balance accounts
        out.push(AccountBalance {
            account_id: row.get::<String>(0).unwrap_or_default(),
            account_name: row.get::<String>(1).unwrap_or_default(),
            account_code: row.get::<String>(2).ok(),
            balance: net,
        });
    }

    Ok(out)
}

async fn sum_asset_liability(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    account_type: &str,
    as_of: i64,
) -> Result<Vec<AccountBalance>, String> {
    // For balance sheet: all transactions up to as_of date
    let sql = format!(
        "SELECT a.id, a.name, a.account_code,
                COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) as net
         FROM fin_accounts a
         LEFT JOIN fin_journal_lines l ON l.account_id = a.id
         LEFT JOIN fin_journal_entries e ON e.id = l.entry_id AND e.entry_date <= ?2
         WHERE a.profile_id = ?1 AND a.account_type = '{}' AND a.is_active = 1
         GROUP BY a.id ORDER BY a.sort_order, a.name",
        account_type
    );

    let stmt = conn.prepare(&sql).await.map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(crate::turso_params![profile_id, as_of])
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        let net: f64 = row.get::<f64>(3).unwrap_or(0.0);
        if net.abs() < 0.001 {
            continue;
        }
        out.push(AccountBalance {
            account_id: row.get::<String>(0).unwrap_or_default(),
            account_name: row.get::<String>(1).unwrap_or_default(),
            account_code: row.get::<String>(2).ok(),
            balance: net,
        });
    }

    Ok(out)
}

// ── fin_get_profit_and_loss ───────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_get_profit_and_loss(
    state: State<'_, Arc<AppState>>,
    from_ts: i64,
    to_ts: i64,
) -> Result<ProfitAndLoss, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let revenue = sum_by_account_type(&conn, &profile_id, "'income'", from_ts, to_ts).await?;
    let expenses = sum_by_account_type(&conn, &profile_id, "'expense'", from_ts, to_ts).await?;

    // Revenue: net credit on income accounts = positive
    let total_revenue: f64 = revenue.iter().map(|a| a.balance).filter(|&b| b > 0.0).sum();
    // Expenses: net debit on expense accounts (stored as negative net_credit) → flip sign
    let total_expenses: f64 = expenses.iter().map(|a| a.balance.abs()).sum();
    let net_profit = total_revenue - total_expenses;

    Ok(ProfitAndLoss {
        from_ts,
        to_ts,
        revenue,
        expenses,
        total_revenue,
        total_expenses,
        net_profit,
    })
}

// ── fin_get_balance_sheet ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_get_balance_sheet(
    state: State<'_, Arc<AppState>>,
    as_of_ts: i64,
) -> Result<BalanceSheet, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let assets = sum_asset_liability(&conn, &profile_id, "asset", as_of_ts).await?;
    let liabilities = sum_asset_liability(&conn, &profile_id, "liability", as_of_ts).await?;
    let equity = sum_asset_liability(&conn, &profile_id, "equity", as_of_ts).await?;

    let total_assets = assets.iter().map(|a| a.balance).sum::<f64>().max(0.0);
    let total_liabilities = liabilities.iter().map(|a| a.balance.abs()).sum::<f64>();
    let total_equity = equity.iter().map(|a| a.balance.abs()).sum::<f64>();

    Ok(BalanceSheet {
        as_of_ts,
        assets,
        liabilities,
        equity,
        total_assets,
        total_liabilities,
        total_equity,
    })
}

// ── fin_get_trial_balance ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_get_trial_balance(
    state: State<'_, Arc<AppState>>,
    as_of_ts: i64,
) -> Result<TrialBalance, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.account_code,
                    COALESCE(SUM(l.debit), 0), COALESCE(SUM(l.credit), 0)
             FROM fin_accounts a
             LEFT JOIN fin_journal_lines l ON l.account_id = a.id
             LEFT JOIN fin_journal_entries e ON e.id = l.entry_id AND e.entry_date <= ?2
             WHERE a.profile_id = ?1 AND a.is_active = 1
             GROUP BY a.id ORDER BY a.account_type, a.sort_order, a.name",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id, as_of_ts])
        .await
        .map_err(|e| e.to_string())?;
    let mut tb_rows = Vec::new();
    let mut total_debit = 0f64;
    let mut total_credit = 0f64;

    while let Ok(Some(row)) = rows.next().await {
        let debit: f64 = row.get::<f64>(3).unwrap_or(0.0);
        let credit: f64 = row.get::<f64>(4).unwrap_or(0.0);
        if debit.abs() < 0.001 && credit.abs() < 0.001 {
            continue;
        }

        total_debit += debit;
        total_credit += credit;

        tb_rows.push(TrialBalanceRow {
            account_id: row.get::<String>(0).unwrap_or_default(),
            account_name: row.get::<String>(1).unwrap_or_default(),
            account_code: row.get::<String>(2).ok(),
            total_debit: debit,
            total_credit: credit,
            net_balance: debit - credit,
        });
    }

    let is_balanced = (total_debit - total_credit).abs() < 0.01;

    Ok(TrialBalance {
        as_of_ts,
        rows: tb_rows,
        total_debit,
        total_credit,
        is_balanced,
    })
}
