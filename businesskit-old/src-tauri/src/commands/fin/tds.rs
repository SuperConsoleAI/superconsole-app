// src-tauri/src/commands/fin/tds.rs — TDS/TCS entry commands (India)
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TdsTcsEntry {
    pub id: String,
    pub profile_id: String,
    pub entry_type: String,   // "TDS" | "TCS"
    pub section_code: String, // "194C", "194Q", "206C"
    pub party_id: Option<String>,
    pub base_amount: f64,
    pub rate_pct: f64,
    pub tds_tcs_amount: f64,
    pub challan_no: Option<String>,
    pub deposited_at: Option<i64>,
    pub period: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct LogTdsTcsArgs {
    pub entry_type: String,
    pub section_code: String,
    pub party_id: Option<String>,
    pub base_amount: f64,
    pub rate_pct: f64,
    pub challan_no: Option<String>,
    pub period: Option<String>,
}

#[tauri::command]
pub async fn fin_log_tds_entry(
    state: State<'_, Arc<AppState>>,
    args: LogTdsTcsArgs,
) -> Result<TdsTcsEntry, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();
    let id = format!("tds-{:x}", now as u32 ^ profile_id.len() as u32);
    let amount = args.base_amount * args.rate_pct / 100.0;

    conn.execute(
        "INSERT INTO fin_tds_tcs_entries
         (id, profile_id, entry_type, section_code, party_id, base_amount, rate_pct, tds_tcs_amount, challan_no, period, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        crate::turso_params![
            id.clone(), profile_id.clone(), args.entry_type.clone(), args.section_code.clone(),
            args.party_id.clone(), args.base_amount, args.rate_pct, amount,
            args.challan_no.clone(), args.period.clone(), now
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(TdsTcsEntry {
        id,
        profile_id,
        entry_type: args.entry_type,
        section_code: args.section_code,
        party_id: args.party_id,
        base_amount: args.base_amount,
        rate_pct: args.rate_pct,
        tds_tcs_amount: amount,
        challan_no: args.challan_no,
        deposited_at: None,
        period: args.period,
        created_at: now,
    })
}

#[tauri::command]
pub async fn fin_log_tcs_entry(
    state: State<'_, Arc<AppState>>,
    args: LogTdsTcsArgs,
) -> Result<TdsTcsEntry, String> {
    // Same logic — entry_type will be "TCS"
    fin_log_tds_entry(state, args).await
}

#[tauri::command]
pub async fn fin_list_tds_entries(
    state: State<'_, Arc<AppState>>,
    period: Option<String>,
) -> Result<Vec<TdsTcsEntry>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let (sql, param) = if let Some(ref p) = period {
        ("SELECT id, profile_id, entry_type, section_code, party_id, base_amount, rate_pct, tds_tcs_amount, challan_no, deposited_at, period, created_at
          FROM fin_tds_tcs_entries WHERE profile_id = ?1 AND period = ?2 ORDER BY created_at DESC", Some(p.clone()))
    } else {
        ("SELECT id, profile_id, entry_type, section_code, party_id, base_amount, rate_pct, tds_tcs_amount, challan_no, deposited_at, period, created_at
          FROM fin_tds_tcs_entries WHERE profile_id = ?1 ORDER BY created_at DESC LIMIT 200", None)
    };

    let stmt = conn.prepare(sql).await.map_err(|e| e.to_string())?;
    let mut rows = if let Some(p) = param {
        stmt.query(crate::turso_params![profile_id, p])
            .await
            .map_err(|e| e.to_string())?
    } else {
        stmt.query(crate::turso_params![profile_id])
            .await
            .map_err(|e| e.to_string())?
    };

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        out.push(TdsTcsEntry {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            entry_type: row.get::<String>(2).unwrap_or_default(),
            section_code: row.get::<String>(3).unwrap_or_default(),
            party_id: row.get::<String>(4).ok(),
            base_amount: row.get::<f64>(5).unwrap_or(0.0),
            rate_pct: row.get::<f64>(6).unwrap_or(0.0),
            tds_tcs_amount: row.get::<f64>(7).unwrap_or(0.0),
            challan_no: row.get::<String>(8).ok(),
            deposited_at: row.get::<i64>(9).ok(),
            period: row.get::<String>(10).ok(),
            created_at: row.get::<i64>(11).unwrap_or(0),
        });
    }
    Ok(out)
}
