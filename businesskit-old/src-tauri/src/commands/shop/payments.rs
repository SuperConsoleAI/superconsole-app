// src-tauri/src/commands/shop/payments.rs
//
// Shop payment commands — Phase 4 complete
//
// record_payment  — records cash received against an invoice, updates
//                   amount_paid and amount_due on shop_documents, flips
//                   status to 'paid' when fully settled.
//                   Phase 4: posts Debit Cash / Credit AR journal entry
//                            via post_journal_entry (soft fail if accounts
//                            haven't been seeded yet).
//
// Tables: shop_documents, shop_document_payments, fin_journal_entries

use crate::commands::fin::journal::{account_id_by_code, post_journal_entry};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentStatus {
    pub invoice_id: String,
    pub doc_number: String,
    pub grand_total: f64,
    pub amount_paid: f64,
    pub amount_due: f64,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct RecordPaymentData {
    pub invoice_id: String,
    pub amount: f64,
    pub payment_mode: Option<String>, // cash | card | upi | bank | cheque
    pub reference: Option<String>,
    pub notes: Option<String>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Record a payment against an invoice.
/// Updates amount_paid / amount_due, flips status to 'paid' when settled.
/// Phase 4: posts a Debit Cash / Credit AR journal entry (soft-fail if
///          chart of accounts not seeded).
#[tauri::command]
pub async fn shop_record_payment(
    data: RecordPaymentData,
    state: State<'_, Arc<AppState>>,
) -> Result<PaymentStatus, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Read current document totals and customer_id
    let mut rows = conn
        .query(
            "SELECT grand_total, amount_paid, amount_due, doc_number, status, customer_id \
         FROM shop_documents WHERE id = ? AND profile_id = ?",
            crate::turso_params![data.invoice_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (grand_total, prev_paid, prev_due, doc_number, _status, customer_id) =
        if let Ok(Some(row)) = rows.next().await {
            let gt: f64 = row.get(0).unwrap_or(0.0);
            let pp: f64 = row.get(1).unwrap_or(0.0);
            let pd: f64 = row.get(2).unwrap_or(0.0);
            let dn: String = row.get(3).unwrap_or_default();
            let st: String = row.get(4).unwrap_or_default();
            let cid: Option<String> = row.get(5).ok().flatten();
            (gt, pp, pd, dn, st, cid)
        } else {
            return Err("Invoice not found".to_string());
        };

    let is_refund = data.amount < 0.0;

    // 2. Compute amount and new balances
    let (amount, new_paid, new_due, new_status) = if is_refund {
        if prev_paid <= 0.0 {
            return Err("No payments recorded to refund".to_string());
        }
        let refund_amt = data.amount.abs().min(prev_paid);
        let actual_amt = -refund_amt;
        let np = prev_paid - refund_amt;
        let nd = (grand_total - np).max(0.0);
        let ns = if np <= 0.005 {
            if grand_total <= 0.005 { "paid" } else { "confirmed" }
        } else if nd < 0.005 {
            "paid"
        } else {
            "partial"
        };
        (actual_amt, np, nd, ns)
    } else {
        if prev_due <= 0.0 {
            return Err("Invoice is already fully paid".to_string());
        }
        let pay_amt = data.amount.min(prev_due);
        let np = prev_paid + pay_amt;
        let nd = (grand_total - np).max(0.0);
        let ns = if nd < 0.005 { "paid" } else { "partial" };
        (pay_amt, np, nd, ns)
    };

    // 3. If paying with wallet / store credit, verify sufficient balance before proceeding
    let mode = data
        .payment_mode
        .clone()
        .unwrap_or_else(|| "cash".to_string());

    if (mode == "wallet" || mode == "store_credit") && !is_refund {
        if let Some(ref cust_id) = customer_id {
            let mut c_rows = conn
                .query(
                    "SELECT COALESCE(wallet_balance, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ?",
                    crate::turso_params![cust_id.clone(), profile_id.clone()],
                )
                .await
                .map_err(|e| e.to_string())?;

            let curr_bal: f64 = if let Ok(Some(row)) = c_rows.next().await {
                row.get(0).unwrap_or(0.0)
            } else {
                0.0
            };

            if amount > curr_bal {
                return Err(format!(
                    "Insufficient wallet balance: bill payment is ₹{:.2}, available wallet balance is ₹{:.2}",
                    amount, curr_bal
                ));
            }
        } else {
            return Err("Cannot pay with wallet: no customer attached to this invoice".to_string());
        }
    }

    // 4. Insert payment row
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let payment_id = format!("pay-{}", ts);

    conn.execute(
        "INSERT INTO shop_document_payments \
         (id, profile_id, document_id, amount, currency, payment_mode, reference, notes) \
         VALUES (?, ?, ?, ?, 'INR', ?, ?, ?)",
        crate::turso_params![
            payment_id.clone(),
            profile_id.clone(),
            data.invoice_id.clone(),
            amount,
            mode.clone(),
            data.reference.clone(),
            data.notes.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 5. Update document
    conn.execute(
        "UPDATE shop_documents \
         SET amount_paid = ?, amount_due = ?, status = ?, updated_at = strftime('%s','now') \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            new_paid,
            new_due,
            new_status,
            data.invoice_id.clone(),
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 6. If payment_mode is wallet / store_credit, update customer balance & append to credit ledger
    if mode == "wallet" || mode == "store_credit" {
        if let Some(ref cust_id) = customer_id {
            if !cust_id.is_empty() {
                // Fetch current wallet balance
                let mut c_rows = conn
                    .query(
                        "SELECT COALESCE(wallet_balance, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ?",
                        crate::turso_params![cust_id.clone(), profile_id.clone()],
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                let curr_credit: f64 = if let Ok(Some(row)) = c_rows.next().await {
                    row.get(0).unwrap_or(0.0)
                } else {
                    0.0
                };

                let (credit_delta, new_credit_bal, entry_type, note_text) = if is_refund {
                    let delta = amount.abs();
                    let nb = curr_credit + delta;
                    (delta, nb, "refund", format!("Refund to wallet for invoice {}", doc_number))
                } else {
                    let delta = -amount.abs();
                    let nb = (curr_credit - amount.abs()).max(0.0);
                    (delta, nb, "redeem", format!("Wallet payment for invoice {}", doc_number))
                };

                // Update customer table
                let _ = conn
                    .execute(
                        "UPDATE shop_customers SET wallet_balance = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
                        crate::turso_params![new_credit_bal, cust_id.clone(), profile_id.clone()],
                    )
                    .await;

                // Append to append-only credit ledger
                let ledger_id = format!("crd-{}", ts);
                let _ = conn
                    .execute(
                        "INSERT INTO shop_customer_credit_ledger \
                         (id, profile_id, customer_id, entry_type, amount, balance_after, document_id, payment_id, notes, created_at) \
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))",
                        crate::turso_params![
                            ledger_id,
                            profile_id.clone(),
                            cust_id.clone(),
                            entry_type,
                            credit_delta,
                            new_credit_bal,
                            data.invoice_id.clone(),
                            payment_id.clone(),
                            note_text
                        ],
                    )
                    .await;
            }
        }
    }

    // 7. Accrue loyalty points if bill is paid and customer is attached
    if new_status == "paid" && !is_refund {
        if let Some(ref cust_id) = customer_id {
            if !cust_id.is_empty() {
                // Fetch loyalty config
                let mut cfg_rows = conn
                    .query(
                        "SELECT config_val FROM shop_configs WHERE profile_id = ? AND config_key = 'loyalty' LIMIT 1",
                        crate::turso_params![profile_id.clone()],
                    )
                    .await
                    .ok();

                let mut is_enabled = 1i64;
                let mut points_per_curr = 0.01f64;
                let mut min_amt = 0.0f64;
                let mut expiry_days = 365i64;

                if let Some(ref mut rows) = cfg_rows {
                    if let Ok(Some(row)) = rows.next().await {
                        let json_s = row.get::<String>(0).unwrap_or_else(|_| "{}".to_string());
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_s) {
                            if let Some(en) = val.get("is_enabled").and_then(|v| v.as_i64()) {
                                is_enabled = en;
                            }
                            if let Some(ppc) = val.get("points_per_currency").and_then(|v| v.as_f64()) {
                                points_per_curr = ppc;
                            }
                            if let Some(ma) = val.get("min_order_amount").and_then(|v| v.as_f64()) {
                                min_amt = ma;
                            }
                            if let Some(ed) = val.get("expiry_days").and_then(|v| v.as_i64()) {
                                expiry_days = ed;
                            }
                        }
                    }
                }

                if is_enabled == 1 && grand_total >= min_amt {
                    let pts_earned = (grand_total * points_per_curr * 10.0).round() / 10.0;
                    if pts_earned > 0.0 {
                        // Check if points were already awarded for this document
                        let mut check_rows = conn
                            .query(
                                "SELECT id FROM shop_loyalty_ledger WHERE profile_id = ? AND document_id = ? AND entry_type = 'earn' LIMIT 1",
                                crate::turso_params![profile_id.clone(), data.invoice_id.clone()],
                            )
                            .await
                            .ok();

                        let already_awarded = if let Some(ref mut rows) = check_rows {
                            rows.next().await.map(|r| r.is_some()).unwrap_or(false)
                        } else {
                            false
                        };

                        if !already_awarded {
                            let mut c_pts_rows = conn
                                .query(
                                    "SELECT COALESCE(loyalty_pts, 0.0) FROM shop_customers WHERE id = ? AND profile_id = ?",
                                    crate::turso_params![cust_id.clone(), profile_id.clone()],
                                )
                                .await
                                .ok();

                            let current_pts = if let Some(ref mut rows) = c_pts_rows {
                                if let Ok(Some(row)) = rows.next().await {
                                    row.get::<f64>(0).unwrap_or(0.0)
                                } else {
                                    0.0
                                }
                            } else {
                                0.0
                            };

                            let new_total_pts = current_pts + pts_earned;
                            let now_ts = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs() as i64;
                            let expires_at = now_ts + (expiry_days * 86400);
                            let lyt_ledger_id = format!("lyt-{}", ts);

                            // Insert loyalty ledger entry
                            let _ = conn
                                .execute(
                                    "INSERT INTO shop_loyalty_ledger \
                                     (id, profile_id, customer_id, entry_type, points, balance_after, document_id, reason, expires_at, created_at) \
                                     VALUES (?, ?, ?, 'earn', ?, ?, ?, ?, ?, strftime('%s','now'))",
                                    crate::turso_params![
                                        lyt_ledger_id,
                                        profile_id.clone(),
                                        cust_id.clone(),
                                        pts_earned,
                                        new_total_pts,
                                        data.invoice_id.clone(),
                                        format!("Points earned on invoice {}", doc_number),
                                        expires_at
                                    ],
                                )
                                .await;

                            // Update customer loyalty points
                            let _ = conn
                                .execute(
                                    "UPDATE shop_customers SET loyalty_pts = ?, loyalty_pts_expiring_at = COALESCE(loyalty_pts_expiring_at, ?), updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
                                    crate::turso_params![new_total_pts, expires_at, cust_id.clone(), profile_id.clone()],
                                )
                                .await;
                        }
                    }
                }
            }
        }
    }

    // 8. Journal entry:
    //    Payment: Debit Cash/Bank/StoreCredit/Wallet · Credit Accounts Receivable
    //    Refund:  Debit Accounts Receivable · Credit Cash/Bank/StoreCredit/Wallet
    let cash_code = match mode.as_str() {
        "wallet" | "store_credit" => "2150",
        "card" | "bank" | "cheque" => "1002",
        _ => "1001", // cash / upi
    };

    let ar_id = account_id_by_code(&conn, &profile_id, "1100").await;
    let cash_id = account_id_by_code(&conn, &profile_id, cash_code).await;

    if let (Some(ar), Some(cash)) = (ar_id, cash_id) {
        let abs_amt = amount.abs();
        let (narration, lines) = if is_refund {
            (
                format!("Refund issued: {} — {}", doc_number, mode),
                vec![
                    (ar, abs_amt, 0.0_f64, Some(format!("Refund settlement for {}", doc_number))),
                    (cash, 0.0_f64, abs_amt, Some(format!("Refund via {}", mode))),
                ],
            )
        } else {
            (
                format!("Payment received: {} — {}", doc_number, mode),
                vec![
                    (cash, abs_amt, 0.0_f64, Some(format!("Receipt via {}", mode))),
                    (ar, 0.0_f64, abs_amt, Some(format!("Settle {}", doc_number))),
                ],
            )
        };

        let _ = post_journal_entry(
            &conn,
            &profile_id,
            &narration,
            Some(&data.invoice_id),
            &lines,
        )
        .await;
    }

    Ok(PaymentStatus {
        invoice_id: data.invoice_id,
        doc_number,
        grand_total,
        amount_paid: new_paid,
        amount_due: new_due,
        status: new_status.to_string(),
    })
}

/// Get payment status (total, paid, due, status) for an invoice.
#[tauri::command]
pub async fn shop_get_payment_status(
    invoice_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<PaymentStatus, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT grand_total, amount_paid, amount_due, doc_number, status \
         FROM shop_documents WHERE id = ? AND profile_id = ?",
            crate::turso_params![invoice_id.clone(), profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(PaymentStatus {
            invoice_id,
            doc_number: row.get(3).unwrap_or_default(),
            grand_total: row.get(0).unwrap_or(0.0),
            amount_paid: row.get(1).unwrap_or(0.0),
            amount_due: row.get(2).unwrap_or(0.0),
            status: row.get(4).unwrap_or_default(),
        })
    } else {
        Err("Invoice not found".to_string())
    }
}
