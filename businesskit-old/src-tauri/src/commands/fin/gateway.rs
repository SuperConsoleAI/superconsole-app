// src-tauri/src/commands/fin/gateway.rs
//
// Payment Gateway Transaction Staging & Reconciliation — Phase 4B.
//
// Three-case payment handling:
//   1. POS with integrated reader (sync) — terminal SDK sets reference directly.
//   2. Payment on another device (manual) — owner marks payment_mode manually.
//   3. Async off-platform (payment links, unattended QR webhooks) —
//      staged in fin_gateway_transactions, auto-matched against shop_document_payments.
//
// Commands:
//   fin_record_gateway_transaction     — record incoming webhook / terminal txn
//   fin_list_gateway_transactions       — list staging rows with filters
//   fin_match_gateway_transaction       — manually link staging row to payment/doc
//   fin_reconcile_gateway_transactions — run auto-matching algorithm

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
    format!("{}-{:x}", prefix, ts)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GatewayTransaction {
    pub id: String,
    pub profile_id: String,
    pub connection_id: String,
    pub provider: String,
    pub provider_txn_id: String,
    pub amount: f64,
    pub currency: String,
    pub status: String,
    pub match_status: String,
    pub matched_document_id: Option<String>,
    pub matched_payment_id: Option<String>,
    pub received_at: i64,
    pub raw_payload: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecordGatewayTxnArgs {
    pub connection_id: Option<String>,
    pub provider: String,          // razorpay | stripe | upi
    pub provider_txn_id: String,
    pub amount: f64,
    pub currency: Option<String>,
    pub status: Option<String>,    // success | failed | pending
    pub raw_payload: Option<String>,
}

// ── fin_record_gateway_transaction ───────────────────────────────────────────

#[tauri::command]
pub async fn fin_record_gateway_transaction(
    state: State<'_, Arc<AppState>>,
    args: RecordGatewayTxnArgs,
) -> Result<GatewayTransaction, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();
    let id = new_id("gtxn");
    let conn_id = args.connection_id.unwrap_or_else(|| "default".to_string());
    let currency = args.currency.unwrap_or_else(|| "INR".to_string());
    let status = args.status.unwrap_or_else(|| "success".to_string());

    conn.execute(
        "INSERT INTO fin_gateway_transactions
         (id, profile_id, connection_id, provider, provider_txn_id, amount, currency,
          status, match_status, received_at, raw_payload)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'unmatched',?9,?10)
         ON CONFLICT(profile_id, provider, provider_txn_id) DO UPDATE SET
           amount = excluded.amount,
           status = excluded.status,
           raw_payload = COALESCE(excluded.raw_payload, fin_gateway_transactions.raw_payload)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            conn_id.clone(),
            args.provider.clone(),
            args.provider_txn_id.clone(),
            args.amount,
            currency.clone(),
            status.clone(),
            now,
            args.raw_payload.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Attempt instant reconciliation
    let _ = reconcile_single_transaction(&conn, &profile_id, &args.provider, &args.provider_txn_id, args.amount, now).await;

    // Fetch the stored transaction
    let stmt = conn
        .prepare(
            "SELECT id, profile_id, connection_id, provider, provider_txn_id, amount,
                    currency, status, match_status, matched_document_id, matched_payment_id,
                    received_at, raw_payload
             FROM fin_gateway_transactions
             WHERE profile_id = ?1 AND provider = ?2 AND provider_txn_id = ?3 LIMIT 1",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![
            profile_id.clone(),
            args.provider.clone(),
            args.provider_txn_id.clone()
        ])
        .await
        .map_err(|e| e.to_string())?;

    let row = rows
        .next()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Transaction record could not be retrieved".to_string())?;

    Ok(GatewayTransaction {
        id: row.get::<String>(0).unwrap_or(id),
        profile_id: row.get::<String>(1).unwrap_or(profile_id),
        connection_id: row.get::<String>(2).unwrap_or(conn_id),
        provider: row.get::<String>(3).unwrap_or(args.provider),
        provider_txn_id: row.get::<String>(4).unwrap_or(args.provider_txn_id),
        amount: row.get::<f64>(5).unwrap_or(args.amount),
        currency: row.get::<String>(6).unwrap_or(currency),
        status: row.get::<String>(7).unwrap_or(status),
        match_status: row.get::<String>(8).unwrap_or_else(|_| "unmatched".to_string()),
        matched_document_id: row.get::<String>(9).ok(),
        matched_payment_id: row.get::<String>(10).ok(),
        received_at: row.get::<i64>(11).unwrap_or(now),
        raw_payload: row.get::<String>(12).ok(),
    })
}

// ── fin_list_gateway_transactions ─────────────────────────────────────────────

#[tauri::command]
pub async fn fin_list_gateway_transactions(
    state: State<'_, Arc<AppState>>,
    match_status: Option<String>,
    provider: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<GatewayTransaction>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(100);

    let mut sql = "SELECT id, profile_id, connection_id, provider, provider_txn_id, amount,
                          currency, status, match_status, matched_document_id, matched_payment_id,
                          received_at, raw_payload
                   FROM fin_gateway_transactions WHERE profile_id = ?1".to_string();

    let mut params = vec![profile_id.clone().into()];

    if let Some(ref ms) = match_status {
        sql.push_str(" AND match_status = ?");
        params.push(ms.clone().into());
    }

    if let Some(ref p) = provider {
        sql.push_str(" AND provider = ?");
        params.push(p.clone().into());
    }

    sql.push_str(" ORDER BY received_at DESC LIMIT ?");
    params.push(lim.into());

    let stmt = conn.prepare(&sql).await.map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params).await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(GatewayTransaction {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            connection_id: row.get::<String>(2).unwrap_or_default(),
            provider: row.get::<String>(3).unwrap_or_default(),
            provider_txn_id: row.get::<String>(4).unwrap_or_default(),
            amount: row.get::<f64>(5).unwrap_or(0.0),
            currency: row.get::<String>(6).unwrap_or_default(),
            status: row.get::<String>(7).unwrap_or_default(),
            match_status: row.get::<String>(8).unwrap_or_default(),
            matched_document_id: row.get::<String>(9).ok(),
            matched_payment_id: row.get::<String>(10).ok(),
            received_at: row.get::<i64>(11).unwrap_or(0),
            raw_payload: row.get::<String>(12).ok(),
        });
    }

    Ok(out)
}

// ── fin_match_gateway_transaction ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ManualMatchArgs {
    pub gateway_txn_id: String,
    pub payment_id: Option<String>,
    pub document_id: Option<String>,
}

#[tauri::command]
pub async fn fin_match_gateway_transaction(
    state: State<'_, Arc<AppState>>,
    args: ManualMatchArgs,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Look up gateway txn provider_txn_id
    let gstmt = conn
        .prepare("SELECT provider_txn_id FROM fin_gateway_transactions WHERE profile_id = ?1 AND id = ?2 LIMIT 1")
        .await
        .map_err(|e| e.to_string())?;
    let mut grows = gstmt.query(crate::turso_params![profile_id.clone(), args.gateway_txn_id.clone()]).await.map_err(|e| e.to_string())?;
    let grow = grows.next().await.map_err(|e| e.to_string())?.ok_or_else(|| "Gateway transaction not found".to_string())?;
    let provider_txn_id: String = grow.get::<String>(0).unwrap_or_default();

    // If payment_id provided, set reference on shop_document_payments
    if let Some(ref pid) = args.payment_id {
        let _ = conn
            .execute(
                "UPDATE shop_document_payments SET reference = ?1 WHERE id = ?2 AND profile_id = ?3",
                crate::turso_params![provider_txn_id.clone(), pid.clone(), profile_id.clone()],
            )
            .await;
    }

    // Update staging record
    conn.execute(
        "UPDATE fin_gateway_transactions
         SET match_status = 'matched', matched_payment_id = ?1, matched_document_id = ?2
         WHERE id = ?3 AND profile_id = ?4",
        crate::turso_params![
            args.payment_id.clone(),
            args.document_id.clone(),
            args.gateway_txn_id.clone(),
            profile_id
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── fin_reconcile_gateway_transactions ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ReconcileResult {
    pub total_processed: usize,
    pub matched_count: usize,
    pub auto_created_count: usize,
    pub ambiguous_count: usize,
    pub pending_grace_count: usize,
}

#[tauri::command]
pub async fn fin_reconcile_gateway_transactions(
    state: State<'_, Arc<AppState>>,
) -> Result<ReconcileResult, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();

    // Fetch all unmatched transactions
    let stmt = conn
        .prepare(
            "SELECT id, provider, provider_txn_id, amount, received_at
             FROM fin_gateway_transactions
             WHERE profile_id = ?1 AND match_status = 'unmatched' AND status = 'success'
             ORDER BY received_at ASC",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(crate::turso_params![profile_id.clone()]).await.map_err(|e| e.to_string())?;
    let mut txns = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        txns.push((
            row.get::<String>(0).unwrap_or_default(),
            row.get::<String>(1).unwrap_or_default(),
            row.get::<String>(2).unwrap_or_default(),
            row.get::<f64>(3).unwrap_or(0.0),
            row.get::<i64>(4).unwrap_or(now),
        ));
    }

    let mut matched_count = 0;
    let mut auto_created_count = 0;
    let mut ambiguous_count = 0;
    let mut pending_grace_count = 0;

    for (gtxn_id, provider, provider_txn_id, amount, received_at) in &txns {
        // ── Priority 1: Exact Match by provider_txn_id in shop_document_payments.reference
        // (Handles Case 1: synchronous POS terminal or storefront order already recorded reference)
        let exact_stmt = conn
            .prepare(
                "SELECT id, document_id FROM shop_document_payments
                 WHERE profile_id = ?1 AND reference = ?2 LIMIT 1",
            )
            .await;

        let mut exact_found = false;
        if let Ok(exact_stmt) = exact_stmt {
            if let Ok(mut exact_rows) = exact_stmt
                .query(crate::turso_params![profile_id.clone(), provider_txn_id.clone()])
                .await
            {
                if let Ok(Some(row)) = exact_rows.next().await {
                    let pid: String = row.get::<String>(0).unwrap_or_default();
                    let doc_id: String = row.get::<String>(1).unwrap_or_default();

                    let _ = conn
                        .execute(
                            "UPDATE fin_gateway_transactions
                             SET match_status = 'matched', matched_payment_id = ?1, matched_document_id = ?2
                             WHERE id = ?3 AND profile_id = ?4",
                            crate::turso_params![pid, doc_id, gtxn_id.clone(), profile_id.clone()],
                        )
                        .await;

                    matched_count += 1;
                    exact_found = true;
                }
            }
        }

        if exact_found {
            continue;
        }

        // ── Priority 2: Fuzzy Match on unreferenced payments (same amount ±30 min window)
        let window_start = received_at - 1800;
        let window_end = received_at + 1800;

        let p_stmt = conn
            .prepare(
                "SELECT id, document_id FROM shop_document_payments
                 WHERE profile_id = ?1
                   AND (reference IS NULL OR reference = '')
                   AND ABS(amount - ?2) < 0.01
                   AND payment_date BETWEEN ?3 AND ?4",
            )
            .await;

        let mut candidate_matches = Vec::new();
        if let Ok(p_stmt) = p_stmt {
            if let Ok(mut p_rows) = p_stmt
                .query(crate::turso_params![
                    profile_id.clone(),
                    *amount,
                    window_start,
                    window_end
                ])
                .await
            {
                while let Ok(Some(p_row)) = p_rows.next().await {
                    let pid: String = p_row.get::<String>(0).unwrap_or_default();
                    let doc_id: String = p_row.get::<String>(1).unwrap_or_default();
                    candidate_matches.push((pid, doc_id));
                }
            }
        }

        if candidate_matches.len() == 1 {
            // Unambiguous 1-to-1 match
            let (pid, doc_id) = &candidate_matches[0];
            let _ = conn
                .execute(
                    "UPDATE shop_document_payments SET reference = ?1 WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![provider_txn_id.clone(), pid.clone(), profile_id.clone()],
                )
                .await;

            let _ = conn
                .execute(
                    "UPDATE fin_gateway_transactions
                     SET match_status = 'matched', matched_payment_id = ?1, matched_document_id = ?2
                     WHERE id = ?3 AND profile_id = ?4",
                    crate::turso_params![pid.clone(), doc_id.clone(), gtxn_id.clone(), profile_id.clone()],
                )
                .await;

            matched_count += 1;
        } else if candidate_matches.len() > 1 {
            // Ambiguous multiple matches — leave unmatched for manual resolution
            ambiguous_count += 1;
        } else {
            // 0 matches found
            let age = now - received_at;
            if age > 1800 {
                // Grace window expired (>30 mins) -> Auto-create payment receipt document
                let doc_id = new_id("doc");
                let payment_id = new_id("pay");
                let doc_number = format!("PAY-AUTO-{}", &provider_txn_id[..6.min(provider_txn_id.len())]);

                // Create payment document
                let _ = conn
                    .execute(
                        "INSERT INTO shop_documents
                         (id, profile_id, doc_type, doc_number, transaction_id, payment_method,
                          doc_date, channel, status, grand_total, amount_paid, amount_due, notes)
                         VALUES (?1,?2,'payment',?3,?4,?5,?6,'online','confirmed',?7,?7,0,'Auto-created from unlinked gateway payment')",
                        crate::turso_params![
                            doc_id.clone(),
                            profile_id.clone(),
                            doc_number,
                            provider_txn_id.clone(),
                            provider.clone(),
                            *received_at,
                            *amount
                        ],
                    )
                    .await;

                // Create payment record
                let _ = conn
                    .execute(
                        "INSERT INTO shop_document_payments
                         (id, profile_id, document_id, amount, payment_mode, reference, payment_date, notes)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,'Auto-created gateway payment')",
                        crate::turso_params![
                            payment_id.clone(),
                            profile_id.clone(),
                            doc_id.clone(),
                            *amount,
                            provider.clone(),
                            provider_txn_id.clone(),
                            *received_at
                        ],
                    )
                    .await;

                // Auto-post to journal
                let _ = crate::commands::fin::journal::post_document_to_journal(&conn, &profile_id, &doc_id).await;

                // Update staging status
                let _ = conn
                    .execute(
                        "UPDATE fin_gateway_transactions
                         SET match_status = 'auto_created', matched_payment_id = ?1, matched_document_id = ?2
                         WHERE id = ?3 AND profile_id = ?4",
                        crate::turso_params![payment_id, doc_id, gtxn_id.clone(), profile_id.clone()],
                    )
                    .await;

                auto_created_count += 1;
            } else {
                // Within grace window, keep waiting
                pending_grace_count += 1;
            }
        }
    }

    Ok(ReconcileResult {
        total_processed: txns.len(),
        matched_count,
        auto_created_count,
        ambiguous_count,
        pending_grace_count,
    })
}

// ── Internal Helper: Instant Single Reconciliation ────────────────────────────

async fn reconcile_single_transaction(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    provider: &str,
    provider_txn_id: &str,
    amount: f64,
    received_at: i64,
) -> Result<bool, String> {
    // 1. Exact match by reference first (Case 1 sync reader)
    let exact_stmt = conn
        .prepare("SELECT id, document_id FROM shop_document_payments WHERE profile_id = ?1 AND reference = ?2 LIMIT 1")
        .await
        .map_err(|e| e.to_string())?;

    let mut exact_rows = exact_stmt.query(crate::turso_params![profile_id, provider_txn_id]).await.map_err(|e| e.to_string())?;
    if let Ok(Some(row)) = exact_rows.next().await {
        let pid: String = row.get::<String>(0).unwrap_or_default();
        let doc_id: String = row.get::<String>(1).unwrap_or_default();

        let _ = conn
            .execute(
                "UPDATE fin_gateway_transactions
                 SET match_status = 'matched', matched_payment_id = ?1, matched_document_id = ?2
                 WHERE profile_id = ?3 AND provider = ?4 AND provider_txn_id = ?5",
                crate::turso_params![pid, doc_id, profile_id, provider, provider_txn_id],
            )
            .await;

        return Ok(true);
    }

    // 2. Fuzzy match on unreferenced payments (same amount ±30 min window)
    let window_start = received_at - 1800;
    let window_end = received_at + 1800;

    let p_stmt = conn
        .prepare(
            "SELECT id, document_id FROM shop_document_payments
             WHERE profile_id = ?1
               AND (reference IS NULL OR reference = '')
               AND ABS(amount - ?2) < 0.01
               AND payment_date BETWEEN ?3 AND ?4",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut p_rows = p_stmt
        .query(crate::turso_params![
            profile_id,
            amount,
            window_start,
            window_end
        ])
        .await
        .map_err(|e| e.to_string())?;

    let mut candidate_matches = Vec::new();
    while let Ok(Some(p_row)) = p_rows.next().await {
        let pid: String = p_row.get::<String>(0).unwrap_or_default();
        let doc_id: String = p_row.get::<String>(1).unwrap_or_default();
        candidate_matches.push((pid, doc_id));
    }

    if candidate_matches.len() == 1 {
        let (pid, doc_id) = &candidate_matches[0];
        let _ = conn
            .execute(
                "UPDATE shop_document_payments SET reference = ?1 WHERE id = ?2 AND profile_id = ?3",
                crate::turso_params![provider_txn_id, pid.clone(), profile_id],
            )
            .await;

        let _ = conn
            .execute(
                "UPDATE fin_gateway_transactions
                 SET match_status = 'matched', matched_payment_id = ?1, matched_document_id = ?2
                 WHERE profile_id = ?3 AND provider = ?4 AND provider_txn_id = ?5",
                crate::turso_params![pid.clone(), doc_id.clone(), profile_id, provider, provider_txn_id],
            )
            .await;

        return Ok(true);
    }

    Ok(false)
}
