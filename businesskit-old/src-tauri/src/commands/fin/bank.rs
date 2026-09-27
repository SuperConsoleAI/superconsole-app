// src-tauri/src/commands/fin/bank.rs
//
// Bank reconciliation commands — Phase 4, Step 7.
//
// Commands:
//   fin_create_bank_account     — register a bank account
//   fin_list_bank_accounts      — list all bank accounts
//   fin_import_bank_statement   — parse CSV rows → fin_bank_transactions
//   fin_list_bank_transactions  — paginated list (unmatched first)
//   fin_match_transaction       — link bank row ↔ journal entry (reconcile)
//   fin_unmatch_transaction     — undo a reconciliation match

use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BankAccount {
    pub id: String,
    pub profile_id: String,
    pub account_id: String,
    pub bank_name: String,
    pub account_number: Option<String>,
    pub ifsc_code: Option<String>,
    pub account_type: String,
    pub opening_balance: f64,
    pub currency: String,
    pub is_active: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BankTransaction {
    pub id: String,
    pub bank_account_id: String,
    pub txn_date: i64,
    pub description: Option<String>,
    pub debit: f64,
    pub credit: f64,
    pub balance: f64,
    pub reference: Option<String>,
    pub journal_entry_id: Option<String>,
    pub is_reconciled: i64,
}

// ── fin_create_bank_account ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateBankAccountArgs {
    pub bank_name: String,
    pub account_number: Option<String>,
    pub ifsc_code: Option<String>,
    pub account_type: Option<String>,
    pub opening_balance: Option<f64>,
    pub currency: Option<String>,
    pub fin_account_id: Option<String>, // link to fin_accounts chart entry
}

#[tauri::command]
pub async fn fin_create_bank_account(
    state: State<'_, Arc<AppState>>,
    args: CreateBankAccountArgs,
) -> Result<BankAccount, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();
    let id = format!("ba-{:x}", now as u32 ^ profile_id.len() as u32);

    // Default fin_account_id: look up the "Bank Account" (code 1002) if not provided
    let acc_id = args
        .fin_account_id
        .clone()
        .unwrap_or_else(|| format!("{}_bank", profile_id));

    conn.execute(
        "INSERT INTO fin_bank_accounts
         (id, profile_id, account_id, bank_name, account_number, ifsc_code,
          account_type, opening_balance, currency, is_active, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            acc_id.clone(),
            args.bank_name.clone(),
            args.account_number.clone(),
            args.ifsc_code.clone(),
            args.account_type.as_deref().unwrap_or("current"),
            args.opening_balance.unwrap_or(0.0),
            args.currency.as_deref().unwrap_or("INR"),
            now,
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(BankAccount {
        id,
        profile_id,
        account_id: acc_id,
        bank_name: args.bank_name,
        account_number: args.account_number,
        ifsc_code: args.ifsc_code,
        account_type: args.account_type.unwrap_or_else(|| "current".into()),
        opening_balance: args.opening_balance.unwrap_or(0.0),
        currency: args.currency.unwrap_or_else(|| "INR".into()),
        is_active: 1,
    })
}

// ── fin_list_bank_accounts ────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_list_bank_accounts(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<BankAccount>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT id, profile_id, account_id, bank_name, account_number, ifsc_code,
                    account_type, opening_balance, currency, is_active
             FROM fin_bank_accounts WHERE profile_id = ?1 AND is_active = 1 ORDER BY bank_name",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(BankAccount {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            account_id: row.get::<String>(2).unwrap_or_default(),
            bank_name: row.get::<String>(3).unwrap_or_default(),
            account_number: row.get::<String>(4).ok(),
            ifsc_code: row.get::<String>(5).ok(),
            account_type: row.get::<String>(6).unwrap_or_else(|_| "current".into()),
            opening_balance: row.get::<f64>(7).unwrap_or(0.0),
            currency: row.get::<String>(8).unwrap_or_else(|_| "INR".into()),
            is_active: row.get::<i64>(9).unwrap_or(1),
        });
    }

    Ok(out)
}

// ── fin_import_bank_statement_from_path ────────────────────────────────────────
//
// Frontend-friendly variant: frontend passes a file path (from plugin-dialog open()),
// Rust reads the file and delegates to the csv_text parser.
// This avoids needing @tauri-apps/plugin-fs on the frontend.

#[tauri::command]
pub async fn fin_import_bank_statement_from_path(
    state: State<'_, Arc<AppState>>,
    bank_account_id: String,
    file_path: String,
) -> Result<u32, String> {
    if file_path.contains('\0') {
        return Err("Invalid file path".to_string());
    }

    let path = std::path::Path::new(&file_path);
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| format!("Invalid or non-existent file path '{}': {}", file_path, e))?;

    if !canonical.is_file() {
        return Err(format!("Path '{}' is not a regular file", file_path));
    }

    let ext = canonical
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_lowercase();

    if ext != "csv" && ext != "txt" && ext != "tsv" {
        return Err("Invalid file format. Only CSV or TXT bank statements are accepted.".to_string());
    }

    let csv_text = std::fs::read_to_string(&canonical)
        .map_err(|e| format!("Cannot read file '{}': {}", file_path, e))?;
    fin_import_bank_statement(state, bank_account_id, csv_text).await
}

// ── fin_import_bank_statement ─────────────────────────────────────────────────
//
// CSV format (generic):  date, description, debit, credit, balance
// Column indices can vary — we auto-detect by header row.
// Supported headers: Date/date/Txn Date, Description/Narration, Debit/DR, Credit/CR, Balance

#[tauri::command]
pub async fn fin_import_bank_statement(
    state: State<'_, Arc<AppState>>,
    bank_account_id: String,
    csv_text: String,
) -> Result<u32, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();

    let mut inserted = 0u32;
    let mut lines = csv_text.lines();

    // Parse header row
    let header = match lines.next() {
        Some(h) => h.to_lowercase(),
        None => return Err("CSV is empty".into()),
    };
    let cols: Vec<&str> = header.split(',').collect();

    let idx = |names: &[&str]| -> Option<usize> {
        for name in names {
            if let Some(i) = cols.iter().position(|c| c.trim().contains(name)) {
                return Some(i);
            }
        }
        None
    };

    let date_i = idx(&["date", "txn"]).ok_or("No date column found")?;
    let desc_i = idx(&["description", "narration", "particular"]);
    let debit_i = idx(&["debit", "dr", "withdrawal"]);
    let credit_i = idx(&["credit", "cr", "deposit"]);
    let bal_i = idx(&["balance", "bal"]);

    for line in lines {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split(',').collect();

        let parse_f = |i: Option<usize>| -> f64 {
            i.and_then(|idx| parts.get(idx))
                .map(|s| {
                    s.trim()
                        .replace([' ', '"', ','], "")
                        .parse::<f64>()
                        .unwrap_or(0.0)
                })
                .unwrap_or(0.0)
        };

        let date_str = parts.get(date_i).map(|s| s.trim()).unwrap_or("");
        if date_str.is_empty() {
            continue;
        }

        // Parse date — try YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY
        let txn_ts = parse_date_to_ts(date_str).unwrap_or(now);

        let description = desc_i
            .and_then(|i| parts.get(i))
            .map(|s| s.trim().trim_matches('"').to_string());
        let debit = parse_f(debit_i);
        let credit = parse_f(credit_i);
        let balance = parse_f(bal_i);

        if debit == 0.0 && credit == 0.0 {
            continue;
        }

        let txn_id = format!("bt-{:x}-{}", txn_ts as u32, inserted);

        let _ = conn.execute(
            "INSERT OR IGNORE INTO fin_bank_transactions
             (id, profile_id, bank_account_id, txn_date, description, debit, credit, balance, is_reconciled, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9)",
            crate::turso_params![txn_id, profile_id.clone(), bank_account_id.clone(), txn_ts, description, debit, credit, balance, now],
        )
        .await;

        inserted += 1;
    }

    Ok(inserted)
}

fn parse_date_to_ts(s: &str) -> Option<i64> {
    // Try common date formats
    let s = s.trim();
    // YYYY-MM-DD
    if s.len() == 10 && &s[4..5] == "-" {
        let y: i32 = s[..4].parse().ok()?;
        let m: u32 = s[5..7].parse().ok()?;
        let d: u32 = s[8..10].parse().ok()?;
        return date_to_ts(y, m, d);
    }
    // DD-MM-YYYY or DD/MM/YYYY
    if s.len() == 10 {
        let sep = if s.contains('/') { '/' } else { '-' };
        let parts: Vec<&str> = s.split(sep).collect();
        if parts.len() == 3 {
            let d: u32 = parts[0].parse().ok()?;
            let m: u32 = parts[1].parse().ok()?;
            let y: i32 = parts[2].parse().ok()?;
            return date_to_ts(y, m, d);
        }
    }
    None
}

fn date_to_ts(y: i32, m: u32, d: u32) -> Option<i64> {
    // Days since epoch — simplified
    use std::convert::TryFrom;
    let days_y = (y - 1970) as i64 * 365 + (y - 1969) as i64 / 4;
    let days_m: i64 =
        [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][usize::try_from(m - 1).ok()?];
    let leap = if m > 2 && (y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) {
        1
    } else {
        0
    };
    Some((days_y + days_m + d as i64 + leap - 1) * 86400)
}

// ── fin_list_bank_transactions ────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_list_bank_transactions(
    state: State<'_, Arc<AppState>>,
    bank_account_id: String,
    unmatched_only: Option<bool>,
) -> Result<Vec<BankTransaction>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let filter = if unmatched_only.unwrap_or(false) {
        "AND is_reconciled = 0"
    } else {
        ""
    };

    let sql = format!(
        "SELECT id, bank_account_id, txn_date, description, debit, credit, balance,
                reference, journal_entry_id, is_reconciled
         FROM fin_bank_transactions WHERE profile_id = ?1 AND bank_account_id = ?2 {}
         ORDER BY txn_date DESC LIMIT 200",
        filter
    );

    let stmt = conn.prepare(&sql).await.map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(crate::turso_params![profile_id, bank_account_id])
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(BankTransaction {
            id: row.get::<String>(0).unwrap_or_default(),
            bank_account_id: row.get::<String>(1).unwrap_or_default(),
            txn_date: row.get::<i64>(2).unwrap_or(0),
            description: row.get::<String>(3).ok(),
            debit: row.get::<f64>(4).unwrap_or(0.0),
            credit: row.get::<f64>(5).unwrap_or(0.0),
            balance: row.get::<f64>(6).unwrap_or(0.0),
            reference: row.get::<String>(7).ok(),
            journal_entry_id: row.get::<String>(8).ok(),
            is_reconciled: row.get::<i64>(9).unwrap_or(0),
        });
    }

    Ok(out)
}

// ── fin_match_transaction ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_match_transaction(
    state: State<'_, Arc<AppState>>,
    transaction_id: String,
    journal_entry_id: String,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE fin_bank_transactions SET journal_entry_id = ?1, is_reconciled = 1
         WHERE id = ?2 AND profile_id = ?3",
        crate::turso_params![journal_entry_id.clone(), transaction_id, profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE fin_journal_entries SET is_reconciled = 1 WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![journal_entry_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── fin_unmatch_transaction ───────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_unmatch_transaction(
    state: State<'_, Arc<AppState>>,
    transaction_id: String,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE fin_bank_transactions SET journal_entry_id = NULL, is_reconciled = 0
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![transaction_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
