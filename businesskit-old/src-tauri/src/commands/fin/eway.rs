// src-tauri/src/commands/fin/eway.rs — e-way bill stub (India)
// Required for goods movement > ₹50,000 between states.
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct EWayBill {
    pub id: String,
    pub document_id: String,
    pub ewb_number: String,
    pub ewb_date: Option<i64>,
    pub valid_upto: i64,
    pub vehicle_number: Option<String>,
    pub transport_mode: String,
    pub transporter_id: Option<String>,
    pub transporter_doc_no: Option<String>,
    pub transporter_doc_date: Option<i64>,
    pub distance_km: f64,
    pub status: String,
    pub error_msg: Option<String>,
    pub cancel_date: Option<i64>,
    pub cancel_reason: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct GenerateEwayBillArgs {
    pub document_id: String,
    pub vehicle_number: Option<String>,
    pub transport_mode: Option<String>,
    pub transporter_id: Option<String>,
    pub transporter_doc_no: Option<String>,
    pub distance_km: Option<f64>,
}

#[tauri::command]
pub async fn fin_generate_eway_bill(
    state: State<'_, Arc<AppState>>,
    args: GenerateEwayBillArgs,
) -> Result<EWayBill, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();

    let ewb_number = format!("EWB{}", now);
    let id = format!("eway-{:x}", now as u32);
    let distance = args.distance_km.unwrap_or(0.0);
    let mode = args.transport_mode.as_deref().unwrap_or("road").to_string();
    // Validity: 1 day per 200km for road, or 1 day minimum
    let validity_days = ((distance / 200.0).ceil() as i64).max(1);
    let valid_upto = now + validity_days * 86400;

    conn.execute(
        "INSERT OR IGNORE INTO fin_eway_bill_log
         (id, profile_id, document_id, ewb_number, ewb_date, vehicle_number, transport_mode,
          transporter_id, transporter_doc_no, distance_km, valid_upto, status, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'generated',?5)",
        crate::turso_params![
            id.clone(),
            profile_id,
            args.document_id.clone(),
            ewb_number.clone(),
            now,
            args.vehicle_number.clone(),
            mode.clone(),
            args.transporter_id.clone(),
            args.transporter_doc_no.clone(),
            distance,
            valid_upto
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(EWayBill {
        id,
        document_id: args.document_id,
        ewb_number,
        ewb_date: Some(now),
        valid_upto,
        vehicle_number: args.vehicle_number,
        transport_mode: mode,
        transporter_id: args.transporter_id,
        transporter_doc_no: args.transporter_doc_no,
        transporter_doc_date: None,
        distance_km: distance,
        status: "generated".into(),
        error_msg: None,
        cancel_date: None,
        cancel_reason: None,
        created_at: now,
    })
}

#[tauri::command]
pub async fn fin_list_eway_bills(
    state: State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<Vec<EWayBill>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(50).clamp(1, 200);
    let stmt = conn
        .prepare(
            "SELECT id, document_id, ewb_number, ewb_date, vehicle_number, transport_mode,
                    transporter_id, transporter_doc_no, transporter_doc_date, distance_km,
                    valid_upto, status, error_msg, cancel_date, cancel_reason, created_at
             FROM fin_eway_bill_log WHERE profile_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id, lim])
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(r)) = rows.next().await {
        list.push(EWayBill {
            id: r.get::<String>(0).unwrap_or_default(),
            document_id: r.get::<String>(1).unwrap_or_default(),
            ewb_number: r.get::<String>(2).unwrap_or_default(),
            ewb_date: r.get::<i64>(3).ok(),
            vehicle_number: r.get::<String>(4).ok(),
            transport_mode: r.get::<String>(5).unwrap_or_else(|_| "road".to_string()),
            transporter_id: r.get::<String>(6).ok(),
            transporter_doc_no: r.get::<String>(7).ok(),
            transporter_doc_date: r.get::<i64>(8).ok(),
            distance_km: r.get::<f64>(9).unwrap_or(0.0),
            valid_upto: r.get::<i64>(10).unwrap_or(0),
            status: r.get::<String>(11).unwrap_or_else(|_| "generated".to_string()),
            error_msg: r.get::<String>(12).ok(),
            cancel_date: r.get::<i64>(13).ok(),
            cancel_reason: r.get::<String>(14).ok(),
            created_at: r.get::<i64>(15).unwrap_or(0),
        });
    }

    Ok(list)
}
