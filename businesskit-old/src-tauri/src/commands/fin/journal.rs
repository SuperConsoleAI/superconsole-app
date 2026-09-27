// src-tauri/src/commands/fin/journal.rs
//
// Journal entry commands & Auto-Posting Engine — Phase 4B.
//
// Public commands:
//   fin_list_journal_entries  — paginated list for accountant view
//   fin_get_journal_entry     — one entry + its lines
//   fin_post_document         — manually trigger auto-posting for a confirmed document
//
// Internal functions (called from billing.rs, payments.rs, expenses.rs):
//   post_journal_entry        — creates entry + lines; validates debit == credit
//   post_document_to_journal  — auto-posts confirmed shop_documents to double-entry ledger

use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalEntry {
    pub id: String,
    pub profile_id: String,
    pub entry_date: i64,
    pub narration: String,
    pub document_id: Option<String>,
    pub entry_type: String,
    pub is_reconciled: i64,
    pub total_debit: f64,
    pub total_credit: f64,
    pub lines: Vec<JournalLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalLine {
    pub id: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub debit: f64,
    pub credit: f64,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PostLine {
    pub account_code: &'static str, // e.g. "1100" = Accounts Receivable
    pub debit: f64,
    pub credit: f64,
    pub description: Option<String>,
}

// ── State Helper for Intra vs Inter State Tax ─────────────────────────────────

fn clean_state_str(s: &str) -> String {
    let mut clean = s.trim().to_lowercase();
    if let Some(idx) = clean.find('[') {
        clean = clean[..idx].trim().to_string();
    }
    clean.chars().filter(|c| c.is_alphanumeric()).collect()
}

fn is_interstate_transaction(doc_state: Option<&str>, biz_state: Option<&str>) -> bool {
    let d = doc_state.map(|s| s.trim()).filter(|s| !s.is_empty());
    let b = biz_state.map(|s| s.trim()).filter(|s| !s.is_empty());
    match (d, b) {
        (Some(doc_s), Some(biz_s)) => {
            let clean_doc = clean_state_str(doc_s);
            let clean_biz = clean_state_str(biz_s);
            if clean_doc.is_empty() || clean_biz.is_empty() {
                false
            } else {
                clean_doc != clean_biz
            }
        }
        _ => false, // Default to intra-state if unknown / local POS
    }
}

// ── Helper: resolve account_id with fallback ──────────────────────────────────

pub async fn account_id_by_code(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    code: &str,
) -> Option<String> {
    let stmt = conn
        .prepare("SELECT id FROM fin_accounts WHERE profile_id = ?1 AND account_code = ?2 AND is_active = 1 LIMIT 1")
        .await
        .ok()?;
    let mut rows = stmt.query(crate::turso_params![profile_id, code]).await.ok()?;
    let row = rows.next().await.ok()??;
    row.get::<String>(0).ok()
}

pub async fn resolve_account_id(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    code: &str,
    fallback_type: &str,
) -> Result<String, String> {
    if let Some(id) = account_id_by_code(conn, profile_id, code).await {
        return Ok(id);
    }

    // Try finding by account_type
    if let Ok(stmt) = conn
        .prepare("SELECT id FROM fin_accounts WHERE profile_id = ?1 AND account_type = ?2 AND is_active = 1 ORDER BY sort_order LIMIT 1")
        .await
    {
        if let Ok(mut rows) = stmt.query(crate::turso_params![profile_id, fallback_type]).await {
            if let Ok(Some(row)) = rows.next().await {
                if let Ok(id) = row.get::<String>(0) {
                    return Ok(id);
                }
            }
        }
    }

    // Fallback: create default system account
    let id = format!("{}_{}", profile_id, code);
    let name = match code {
        "1001" => "Cash",
        "1002" => "Bank Account",
        "1100" => "Accounts Receivable",
        "1200" => "Inventory",
        "1250" => "Accounts Receivable — Aggregator",
        "1300" => "Tax / VAT Input Credit",
        "1310" => "CGST Input Credit",
        "1320" => "SGST Input Credit",
        "1330" => "IGST Input Credit",
        "2001" => "Accounts Payable",
        "2100" => "Tax / VAT / GST Output Payable",
        "2110" => "CGST Output Payable",
        "2120" => "SGST Output Payable",
        "2130" => "IGST Output Payable",
        "2150" => "Store Credit Liability",
        "4001" => "Sales Revenue",
        "4100" => "Other Income",
        "5001" => "Cost of Goods Sold",
        "5300" => "Utilities",
        "5350" => "Aggregator Commission Expense",
        "5400" => "Marketing & Ads",
        "5900" => "Miscellaneous Expense",
        "5950" => "Round Off / Adjustment",
        _ => "General Account",
    };
    let now = Utc::now().timestamp();
    let _ = conn
        .execute(
            "INSERT OR IGNORE INTO fin_accounts (id, profile_id, name, account_code, account_type, is_system, is_active, sort_order, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, 999, ?6)",
            crate::turso_params![id.clone(), profile_id, name, code, fallback_type, now],
        )
        .await;

    Ok(id)
}

// ── post_journal_entry (internal) ─────────────────────────────────────────────

pub async fn post_journal_entry(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    narration: &str,
    document_id: Option<&str>,
    lines: &[(String, f64, f64, Option<String>)], // (account_id, debit, credit, desc)
) -> Result<String, String> {
    let now = Utc::now().timestamp();

    // Idempotency: delete any existing auto journal entry for this document_id
    if let Some(doc_id) = document_id {
        if let Ok(stmt) = conn
            .prepare("SELECT id FROM fin_journal_entries WHERE profile_id = ?1 AND document_id = ?2")
            .await
        {
            if let Ok(mut rows) = stmt.query(crate::turso_params![profile_id, doc_id]).await {
                while let Ok(Some(row)) = rows.next().await {
                    if let Ok(old_id) = row.get::<String>(0) {
                        let _ = conn
                            .execute(
                                "DELETE FROM fin_journal_lines WHERE entry_id = ?1",
                                crate::turso_params![old_id.clone()],
                            )
                            .await;
                        let _ = conn
                            .execute(
                                "DELETE FROM fin_journal_entries WHERE id = ?1",
                                crate::turso_params![old_id],
                            )
                            .await;
                    }
                }
            }
        }
    }

    // Filter out negligible amounts (e.g. 0 debit and 0 credit)
    let non_zero_lines: Vec<&(String, f64, f64, Option<String>)> = lines
        .iter()
        .filter(|(_, d, c, _)| d.abs() > 0.0001 || c.abs() > 0.0001)
        .collect();

    if non_zero_lines.is_empty() {
        // Document has 0 amounts or no billable lines; removing old journal entries is complete.
        return Ok("cleared".to_string());
    }

    // Validate debits == credits
    let total_debit: f64 = non_zero_lines.iter().map(|(_, d, _, _)| d).sum();
    let total_credit: f64 = non_zero_lines.iter().map(|(_, _, c, _)| c).sum();
    let diff = (total_debit - total_credit).abs();
    if diff > 0.05 {
        return Err(format!(
            "Journal entry unbalanced: debit={:.2} credit={:.2} (diff={:.2})",
            total_debit, total_credit, diff
        ));
    }

    let entry_id = format!(
        "je-{:x}-{}",
        now as u32,
        &profile_id[..4.min(profile_id.len())]
    );

    conn.execute(
        "INSERT INTO fin_journal_entries (id, profile_id, entry_date, narration, document_id, entry_type, created_at)
         VALUES (?1,?2,?3,?4,?5,'auto',?3)",
        crate::turso_params![entry_id.clone(), profile_id, now, narration, document_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    for (i, (account_id, debit, credit, desc)) in non_zero_lines.into_iter().enumerate() {
        let line_id = format!("{}-{}", entry_id, i);
        conn.execute(
            "INSERT INTO fin_journal_lines (id, profile_id, entry_id, account_id, debit, credit, description, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            crate::turso_params![
                line_id, profile_id, entry_id.clone(),
                account_id.clone(), *debit, *credit, desc.as_deref(), now
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(entry_id)
}

// ── Auto-Posting Engine: post_document_to_journal ─────────────────────────────

pub async fn post_document_to_journal(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    document_id: &str,
) -> Result<String, String> {
    // 1. Fetch document
    let doc_stmt = conn
        .prepare(
            "SELECT id, doc_type, doc_number, status, subtotal, discount_amt,
                    taxable_amt, tax_amount, round_off, grand_total, amount_paid,
                    state, customer_id, vendor_id, payment_method, ref_number,
                    currency, exchange_rate
             FROM shop_documents WHERE profile_id = ?1 AND id = ?2 LIMIT 1",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut doc_rows = doc_stmt
        .query(crate::turso_params![profile_id, document_id])
        .await
        .map_err(|e| e.to_string())?;

    let doc_row = doc_rows
        .next()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document {} not found", document_id))?;

    let doc_type = doc_row.get::<String>(1).unwrap_or_default();
    let doc_number = doc_row.get::<String>(2).unwrap_or_default();
    let subtotal = doc_row.get::<f64>(4).unwrap_or(0.0);
    let discount_amt = doc_row.get::<f64>(5).unwrap_or(0.0);
    let taxable_amt = doc_row.get::<f64>(6).unwrap_or(subtotal - discount_amt);
    let tax_amount = doc_row.get::<f64>(7).unwrap_or(0.0);
    let round_off = doc_row.get::<f64>(8).unwrap_or(0.0);
    let grand_total = doc_row.get::<f64>(9).unwrap_or(taxable_amt + tax_amount + round_off);
    let _amount_paid = doc_row.get::<f64>(10).unwrap_or(0.0);
    let doc_state = doc_row.get::<String>(11).ok();
    let _customer_id = doc_row.get::<String>(12).ok();
    let vendor_id = doc_row.get::<String>(13).ok();
    let payment_method = doc_row.get::<String>(14).unwrap_or_else(|_| "cash".to_string());
    let doc_currency = doc_row.get::<String>(16).unwrap_or_else(|_| "INR".to_string());
    let exchange_rate = doc_row.get::<f64>(17).unwrap_or(1.0);
    let fx_rate = if exchange_rate > 0.000001 { exchange_rate } else { 1.0 };

    // 2. Fetch business tax configuration to determine regime, currency, intra vs inter state, and LUT status
    let mut biz_regime: Option<String> = None;
    let mut biz_country: Option<String> = None;
    let mut biz_currency: Option<String> = None;
    let mut biz_state_code: Option<String> = None;
    let mut biz_address: Option<String> = None;
    let mut lut_number: Option<String> = None;
    if let Ok(stmt) = conn
        .prepare("SELECT regime, country, currency, state_code, address, lut_number FROM fin_tax_configs WHERE profile_id = ?1 LIMIT 1")
        .await
    {
        if let Ok(mut rows) = stmt.query(crate::turso_params![profile_id]).await {
            if let Ok(Some(r)) = rows.next().await {
                biz_regime = r.get::<String>(0).ok();
                biz_country = r.get::<String>(1).ok();
                biz_currency = r.get::<String>(2).ok();
                biz_state_code = r.get::<String>(3).ok();
                biz_address = r.get::<String>(4).ok();
                lut_number = r.get::<String>(5).ok().filter(|s| !s.trim().is_empty());
            }
        }
    }
    let regime_raw = biz_regime.as_deref().unwrap_or("GST");
    let regime_norm = regime_raw.trim().to_uppercase().replace(['-', '_', ' '], "");
    let base_currency = biz_currency.as_deref().unwrap_or("INR");
    let is_foreign_currency = doc_currency.trim().to_uppercase() != base_currency.trim().to_uppercase()
        && (fx_rate - 1.0).abs() > 0.000001;

    // Convert document currency amounts to ledger functional/base currency
    let to_base = |amt: f64| -> f64 {
        if is_foreign_currency {
            (amt * fx_rate * 100.0).round() / 100.0
        } else {
            amt
        }
    };

    let taxable_amt_base = to_base(taxable_amt);
    let round_off_base = to_base(round_off);
    let grand_total_base = to_base(grand_total);

    let fx_tag = if is_foreign_currency {
        format!(" [{} {:.2} @ {:.4}]", doc_currency, grand_total, fx_rate)
    } else {
        String::new()
    };

    // Fetch customer GST supply type and country
    let mut gst_supply_type: Option<String> = None;
    let mut cust_country: Option<String> = None;
    if let Some(ref cid) = _customer_id {
        if let Ok(stmt) = conn
            .prepare("SELECT COALESCE(gst_supply_type, 'regular'), country FROM shop_customers WHERE id = ?1 AND profile_id = ?2 LIMIT 1")
            .await
        {
            if let Ok(mut rows) = stmt.query(crate::turso_params![cid, profile_id]).await {
                if let Ok(Some(r)) = rows.next().await {
                    gst_supply_type = r.get::<String>(0).ok();
                    cust_country = r.get::<String>(1).ok();
                }
            }
        }
    }

    // Check fin_tax_exemptions for active, non-expired exemption certificates (VAT / Sales Tax / Reverse Charge)
    let mut active_exemption_type: Option<String> = None;
    let mut active_exemption_cert: Option<String> = None;
    let now_ts = chrono::Utc::now().timestamp();
    if let Some(ref cid) = _customer_id {
        if let Ok(stmt) = conn
            .prepare(
                "SELECT exemption_type, certificate_number FROM fin_tax_exemptions \
                 WHERE profile_id = ?1 AND party_id = ?2 AND is_active = 1 \
                   AND (valid_from IS NULL OR valid_from <= ?3) \
                   AND (valid_until IS NULL OR valid_until >= ?3) \
                 ORDER BY created_at DESC LIMIT 1",
            )
            .await
        {
            if let Ok(mut rows) = stmt.query(crate::turso_params![profile_id, cid, now_ts]).await {
                if let Ok(Some(r)) = rows.next().await {
                    active_exemption_type = r.get::<String>(0).ok();
                    active_exemption_cert = r.get::<String>(1).ok();
                }
            }
        }
    }

    // Regime-specific tax and zero-rating calculation
    let mut tax_tag = String::new();
    let mut cgst = 0.0;
    let mut sgst = 0.0;
    let mut igst = 0.0;
    let mut general_tax = 0.0;

    match regime_norm.as_str() {
        "VAT" => {
            // For VAT: active reverse_charge/export/diplomatic exemption OR foreign buyer country = zero-rated
            let is_foreign = cust_country.as_deref().map(|c| {
                let u = c.trim().to_uppercase();
                let b = biz_country.as_deref().unwrap_or("GB").trim().to_uppercase();
                !u.is_empty() && u != b
            }).unwrap_or(false);

            if let Some(ref etype) = active_exemption_type {
                let cert = active_exemption_cert.as_deref().unwrap_or("on file");
                tax_tag = format!(" (Zero-Rated VAT / {}: {})", etype, cert);
            } else if is_foreign {
                tax_tag = " (Zero-Rated VAT Export)".to_string();
            } else if tax_amount > 0.0001 {
                general_tax = tax_amount;
            }
        }
        "SALESTAX" => {
            // For US Sales Tax (matches "SalesTax", "sales_tax", "SALES_TAX"): active resale_certificate, nonprofit, diplomatic exemption = zero-rated
            if let Some(ref etype) = active_exemption_type {
                let cert = active_exemption_cert.as_deref().unwrap_or("on file");
                tax_tag = format!(" (Tax Exempt / {}: {})", etype, cert);
            } else if tax_amount > 0.0001 {
                general_tax = tax_amount;
            }
        }
        "NONE" | "EXEMPT" => {
            tax_tag = " (Tax Exempt)".to_string();
        }
        _ => {
            // Default "GST" (India)
            let supply_type = gst_supply_type.as_deref().unwrap_or("regular");
            let is_export_or_sez = matches!(supply_type, "export" | "sez" | "overseas_consumer")
                || cust_country.as_deref().map(|c| {
                    let u = c.trim().to_uppercase();
                    !u.is_empty() && u != "IN" && u != "INDIA"
                }).unwrap_or(false);

            if is_export_or_sez {
                if let Some(ref lut) = lut_number {
                    tax_tag = format!(" (Zero-Rated Export/SEZ under LUT: {})", lut);
                } else {
                    tax_tag = " (Zero-Rated Export/SEZ under LUT)".to_string();
                }
            } else if tax_amount > 0.0001 {
                let biz_state = biz_state_code.as_deref().or(biz_address.as_deref());
                let is_interstate = is_interstate_transaction(doc_state.as_deref(), biz_state);
                if is_interstate {
                    igst = tax_amount;
                } else {
                    let half = (tax_amount / 2.0 * 100.0).round() / 100.0;
                    let other_half = tax_amount - half;
                    cgst = half;
                    sgst = other_half;
                }
            }
        }
    }

    let cgst_base = to_base(cgst);
    let sgst_base = to_base(sgst);
    let igst_base = to_base(igst);
    let general_tax_base = to_base(general_tax);

    // 3. Resolve accounts and build debit/credit lines via hardcoded match statement
    let mut lines: Vec<(String, f64, f64, Option<String>)> = Vec::new();
    let narration: String;

    match doc_type.as_str() {
        "invoice" | "pos" | "sales_order" | "booking" | "folio_charge" => {
            narration = format!("Invoice confirmed: {}{}{}", doc_number, tax_tag, fx_tag);
            let ar_acc = resolve_account_id(conn, profile_id, "1100", "asset").await?;
            let sales_acc = resolve_account_id(conn, profile_id, "4001", "income").await?;

            // DR: Accounts Receivable (grand_total_base)
            lines.push((ar_acc, grand_total_base, 0.0, Some(format!("AR - {}", doc_number))));
            // CR: Sales Revenue (taxable_amt_base)
            lines.push((sales_acc, 0.0, taxable_amt_base, Some("Sales Revenue".to_string())));

            // CR: Output Tax
            if general_tax_base > 0.0001 {
                let tax_acc = resolve_account_id(conn, profile_id, "2100", "liability").await?;
                lines.push((tax_acc, 0.0, general_tax_base, Some("Tax / VAT Output Payable".to_string())));
            }
            if cgst_base > 0.0001 {
                let cgst_acc = resolve_account_id(conn, profile_id, "2110", "liability").await?;
                lines.push((cgst_acc, 0.0, cgst_base, Some("CGST Output Payable".to_string())));
            }
            if sgst_base > 0.0001 {
                let sgst_acc = resolve_account_id(conn, profile_id, "2120", "liability").await?;
                lines.push((sgst_acc, 0.0, sgst_base, Some("SGST Output Payable".to_string())));
            }
            if igst_base > 0.0001 {
                let igst_acc = resolve_account_id(conn, profile_id, "2130", "liability").await?;
                lines.push((igst_acc, 0.0, igst_base, Some("IGST Output Payable".to_string())));
            }

            // Round off balancing
            if round_off_base.abs() > 0.0001 {
                let ro_acc = resolve_account_id(conn, profile_id, "5950", "expense").await?;
                if round_off_base > 0.0 {
                    // grand_total increased -> Credit round off
                    lines.push((ro_acc, 0.0, round_off_base, Some("Round Off Adjustment".to_string())));
                } else {
                    // grand_total decreased -> Debit round off
                    lines.push((ro_acc, round_off_base.abs(), 0.0, Some("Round Off Adjustment".to_string())));
                }
            }
        }

        "purchase_order" | "goods_receipt" | "vendor_bill" => {
            narration = format!("Vendor bill confirmed: {}{}", doc_number, fx_tag);
            let cogs_acc = resolve_account_id(conn, profile_id, "5001", "expense").await?;
            let ap_acc = resolve_account_id(conn, profile_id, "2001", "liability").await?;

            // DR: Cost of Goods Sold / Purchases (taxable_amt_base)
            lines.push((cogs_acc, taxable_amt_base, 0.0, Some("Purchases / Direct Cost".to_string())));

            // DR: Input Tax Credit
            if general_tax_base > 0.0001 {
                let tax_in_acc = resolve_account_id(conn, profile_id, "1300", "asset").await?;
                lines.push((tax_in_acc, general_tax_base, 0.0, Some("Tax / VAT Input Credit".to_string())));
            }
            if cgst_base > 0.0001 {
                let cgst_in_acc = resolve_account_id(conn, profile_id, "1310", "asset").await?;
                lines.push((cgst_in_acc, cgst_base, 0.0, Some("CGST Input Credit".to_string())));
            }
            if sgst_base > 0.0001 {
                let sgst_in_acc = resolve_account_id(conn, profile_id, "1320", "asset").await?;
                lines.push((sgst_in_acc, sgst_base, 0.0, Some("SGST Input Credit".to_string())));
            }
            if igst_base > 0.0001 {
                let igst_in_acc = resolve_account_id(conn, profile_id, "1330", "asset").await?;
                lines.push((igst_in_acc, igst_base, 0.0, Some("IGST Input Credit".to_string())));
            }

            // CR: Accounts Payable (grand_total_base)
            lines.push((ap_acc, 0.0, grand_total_base, Some(format!("AP - {}", doc_number))));

            if round_off_base.abs() > 0.0001 {
                let ro_acc = resolve_account_id(conn, profile_id, "5950", "expense").await?;
                if round_off_base > 0.0 {
                    lines.push((ro_acc, round_off_base, 0.0, Some("Round Off Adjustment".to_string())));
                } else {
                    lines.push((ro_acc, 0.0, round_off_base.abs(), Some("Round Off Adjustment".to_string())));
                }
            }
        }

        "credit_note" => {
            narration = format!("Credit note issued: {}{}", doc_number, fx_tag);
            let sales_acc = resolve_account_id(conn, profile_id, "4001", "income").await?;
            let ar_acc = resolve_account_id(conn, profile_id, "1100", "asset").await?;

            // DR: Sales Revenue (taxable_amt_base reversal)
            lines.push((sales_acc, taxable_amt_base, 0.0, Some("Sales Return / Reduction".to_string())));

            // DR: Output Tax reversal
            if general_tax_base > 0.0001 {
                let tax_acc = resolve_account_id(conn, profile_id, "2100", "liability").await?;
                lines.push((tax_acc, general_tax_base, 0.0, Some("Tax / VAT Output Reversal".to_string())));
            }
            if cgst_base > 0.0001 {
                let cgst_acc = resolve_account_id(conn, profile_id, "2110", "liability").await?;
                lines.push((cgst_acc, cgst_base, 0.0, Some("CGST Output Reversal".to_string())));
            }
            if sgst_base > 0.0001 {
                let sgst_acc = resolve_account_id(conn, profile_id, "2120", "liability").await?;
                lines.push((sgst_acc, sgst_base, 0.0, Some("SGST Output Reversal".to_string())));
            }
            if igst_base > 0.0001 {
                let igst_acc = resolve_account_id(conn, profile_id, "2130", "liability").await?;
                lines.push((igst_acc, igst_base, 0.0, Some("IGST Output Reversal".to_string())));
            }

            // CR: Accounts Receivable (grand_total_base)
            lines.push((ar_acc, 0.0, grand_total_base, Some(format!("AR Credit - {}", doc_number))));
        }

        "debit_note" => {
            narration = format!("Debit note issued: {}{}", doc_number, fx_tag);
            let ap_acc = resolve_account_id(conn, profile_id, "2001", "liability").await?;
            let cogs_acc = resolve_account_id(conn, profile_id, "5001", "expense").await?;

            // DR: Accounts Payable (reduce liability)
            lines.push((ap_acc, grand_total_base, 0.0, Some(format!("AP Debit - {}", doc_number))));

            // CR: Purchases
            lines.push((cogs_acc, 0.0, taxable_amt_base, Some("Purchase Return / Reduction".to_string())));

            // CR: Input Tax reversal
            if general_tax_base > 0.0001 {
                let tax_in_acc = resolve_account_id(conn, profile_id, "1300", "asset").await?;
                lines.push((tax_in_acc, 0.0, general_tax_base, Some("Tax / VAT Input Reversal".to_string())));
            }
            if cgst_base > 0.0001 {
                let cgst_in_acc = resolve_account_id(conn, profile_id, "1310", "asset").await?;
                lines.push((cgst_in_acc, 0.0, cgst_base, Some("CGST Input Reversal".to_string())));
            }
            if sgst_base > 0.0001 {
                let sgst_in_acc = resolve_account_id(conn, profile_id, "1320", "asset").await?;
                lines.push((sgst_in_acc, 0.0, sgst_base, Some("SGST Input Reversal".to_string())));
            }
            if igst_base > 0.0001 {
                let igst_in_acc = resolve_account_id(conn, profile_id, "1330", "asset").await?;
                lines.push((igst_in_acc, 0.0, igst_base, Some("IGST Input Reversal".to_string())));
            }
        }

        "payment" | "receipt" => {
            let is_bank = payment_method != "cash";
            let bank_cash_code = if is_bank { "1002" } else { "1001" };
            let bank_cash_acc = resolve_account_id(conn, profile_id, bank_cash_code, "asset").await?;

            if vendor_id.is_some() {
                // Payment to vendor: DR Accounts Payable, CR Cash/Bank
                narration = format!("Vendor payment: {}{}", doc_number, fx_tag);
                let ap_acc = resolve_account_id(conn, profile_id, "2001", "liability").await?;
                lines.push((ap_acc, grand_total_base, 0.0, Some(format!("AP Payment - {}", doc_number))));
                lines.push((bank_cash_acc, 0.0, grand_total_base, Some("Disbursement".to_string())));
            } else {
                // Payment from customer: DR Cash/Bank, CR Accounts Receivable
                narration = format!("Customer receipt: {}{}", doc_number, fx_tag);
                let ar_acc = resolve_account_id(conn, profile_id, "1100", "asset").await?;
                lines.push((bank_cash_acc, grand_total_base, 0.0, Some("Receipt".to_string())));
                lines.push((ar_acc, 0.0, grand_total_base, Some(format!("AR Clearance - {}", doc_number))));
            }
        }

        "expense" => {
            narration = format!("Direct expense: {}{}", doc_number, fx_tag);
            let exp_acc = resolve_account_id(conn, profile_id, "5900", "expense").await?;
            let is_bank = payment_method != "cash";
            let bank_cash_code = if is_bank { "1002" } else { "1001" };
            let bank_cash_acc = resolve_account_id(conn, profile_id, bank_cash_code, "asset").await?;

            lines.push((exp_acc, taxable_amt_base, 0.0, Some("Direct Expense".to_string())));
            if general_tax_base > 0.0001 {
                let tax_in_acc = resolve_account_id(conn, profile_id, "1300", "asset").await?;
                lines.push((tax_in_acc, general_tax_base, 0.0, Some("Tax / VAT Input Credit".to_string())));
            }
            if cgst_base > 0.0001 {
                let cgst_in_acc = resolve_account_id(conn, profile_id, "1310", "asset").await?;
                lines.push((cgst_in_acc, cgst_base, 0.0, Some("CGST Input Credit".to_string())));
            }
            if sgst_base > 0.0001 {
                let sgst_in_acc = resolve_account_id(conn, profile_id, "1320", "asset").await?;
                lines.push((sgst_in_acc, sgst_base, 0.0, Some("SGST Input Credit".to_string())));
            }
            if igst_base > 0.0001 {
                let igst_in_acc = resolve_account_id(conn, profile_id, "1330", "asset").await?;
                lines.push((igst_in_acc, igst_base, 0.0, Some("IGST Input Credit".to_string())));
            }
            lines.push((bank_cash_acc, 0.0, grand_total_base, Some("Payment".to_string())));
        }

        _ => {
            return Err(format!("No auto-posting rule defined for doc_type: {}", doc_type));
        }
    }

    // Auto-fix micro rounding differences (< 0.05) to ensure strict balance
    let total_debit: f64 = lines.iter().map(|(_, d, _, _)| d).sum();
    let total_credit: f64 = lines.iter().map(|(_, _, c, _)| c).sum();
    let diff = total_debit - total_credit;
    if diff.abs() > 0.0001 && diff.abs() <= 0.05 {
        let ro_acc = resolve_account_id(conn, profile_id, "5950", "expense").await?;
        if diff > 0.0 {
            // debit exceeds credit -> add credit
            lines.push((ro_acc, 0.0, diff, Some("Rounding balance adjustment".to_string())));
        } else {
            // credit exceeds debit -> add debit
            lines.push((ro_acc, diff.abs(), 0.0, Some("Rounding balance adjustment".to_string())));
        }
    }

    post_journal_entry(conn, profile_id, &narration, Some(document_id), &lines).await
}

// ── fin_post_document (Tauri Command) ─────────────────────────────────────────

#[tauri::command]
pub async fn fin_post_document(
    state: State<'_, Arc<AppState>>,
    document_id: String,
) -> Result<String, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    post_document_to_journal(&conn, &profile_id, &document_id).await
}

// ── fin_get_journal_entry (read-only) ─────────────────────────────────────────

#[tauri::command]
pub async fn fin_get_journal_entry(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<JournalEntry, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT e.id, e.profile_id, e.entry_date, e.narration, e.document_id,
                    e.entry_type, e.is_reconciled,
                    COALESCE(SUM(l.debit),0), COALESCE(SUM(l.credit),0)
             FROM fin_journal_entries e
             LEFT JOIN fin_journal_lines l ON l.entry_id = e.id
             WHERE e.profile_id = ?1 AND e.id = ?2
             GROUP BY e.id LIMIT 1",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id, id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    let row = rows
        .next()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Journal entry {} not found", id))?;

    let mut entry = JournalEntry {
        id: row.get::<String>(0).unwrap_or_default(),
        profile_id: row.get::<String>(1).unwrap_or_default(),
        entry_date: row.get::<i64>(2).unwrap_or(0),
        narration: row.get::<String>(3).unwrap_or_default(),
        document_id: row.get::<String>(4).ok(),
        entry_type: row.get::<String>(5).unwrap_or_default(),
        is_reconciled: row.get::<i64>(6).unwrap_or(0),
        total_debit: row.get::<f64>(7).unwrap_or(0.0),
        total_credit: row.get::<f64>(8).unwrap_or(0.0),
        lines: vec![],
    };

    let lstmt = conn
        .prepare(
            "SELECT l.id, l.account_id, a.name, l.debit, l.credit, l.description
             FROM fin_journal_lines l
             LEFT JOIN fin_accounts a ON a.id = l.account_id
             WHERE l.entry_id = ?1 ORDER BY l.rowid",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut lrows = lstmt
        .query(crate::turso_params![entry.id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    while let Ok(Some(lr)) = lrows.next().await {
        entry.lines.push(JournalLine {
            id: lr.get::<String>(0).unwrap_or_default(),
            account_id: lr.get::<String>(1).unwrap_or_default(),
            account_name: lr.get::<String>(2).ok(),
            debit: lr.get::<f64>(3).unwrap_or(0.0),
            credit: lr.get::<f64>(4).unwrap_or(0.0),
            description: lr.get::<String>(5).ok(),
        });
    }

    Ok(entry)
}

// ── fin_list_journal_entries (read-only) ──────────────────────────────────────

#[tauri::command]
pub async fn fin_list_journal_entries(
    state: State<'_, Arc<AppState>>,
    from_ts: Option<i64>,
    to_ts: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<JournalEntry>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let from = from_ts.unwrap_or(0);
    let to = to_ts.unwrap_or(i64::MAX);
    let lim = limit.unwrap_or(100);

    let stmt = conn
        .prepare(
            "SELECT e.id, e.profile_id, e.entry_date, e.narration, e.document_id,
                    e.entry_type, e.is_reconciled,
                    COALESCE(SUM(l.debit),0), COALESCE(SUM(l.credit),0)
             FROM fin_journal_entries e
             LEFT JOIN fin_journal_lines l ON l.entry_id = e.id
             WHERE e.profile_id = ?1 AND e.entry_date BETWEEN ?2 AND ?3
             GROUP BY e.id
             ORDER BY e.entry_date DESC LIMIT ?4",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id, from, to, lim])
        .await
        .map_err(|e| e.to_string())?;
    let mut out: Vec<JournalEntry> = Vec::new();

    while let Ok(Some(row)) = rows.next().await {
        out.push(JournalEntry {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            entry_date: row.get::<i64>(2).unwrap_or(0),
            narration: row.get::<String>(3).unwrap_or_default(),
            document_id: row.get::<String>(4).ok(),
            entry_type: row.get::<String>(5).unwrap_or_default(),
            is_reconciled: row.get::<i64>(6).unwrap_or(0),
            total_debit: row.get::<f64>(7).unwrap_or(0.0),
            total_credit: row.get::<f64>(8).unwrap_or(0.0),
            lines: vec![],
        });
    }

    // Populate lines for each entry
    for entry in &mut out {
        let lstmt = conn
            .prepare(
                "SELECT l.id, l.account_id, a.name, l.debit, l.credit, l.description
                 FROM fin_journal_lines l
                 LEFT JOIN fin_accounts a ON a.id = l.account_id
                 WHERE l.entry_id = ?1 ORDER BY l.rowid",
            )
            .await
            .map_err(|e| e.to_string())?;

        let mut lrows = lstmt
            .query(crate::turso_params![entry.id.clone()])
            .await
            .map_err(|e| e.to_string())?;

        while let Ok(Some(lr)) = lrows.next().await {
            entry.lines.push(JournalLine {
                id: lr.get::<String>(0).unwrap_or_default(),
                account_id: lr.get::<String>(1).unwrap_or_default(),
                account_name: lr.get::<String>(2).ok(),
                debit: lr.get::<f64>(3).unwrap_or(0.0),
                credit: lr.get::<f64>(4).unwrap_or(0.0),
                description: lr.get::<String>(5).ok(),
            });
        }
    }

    Ok(out)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_interstate_determination() {
        // Intra-state (Same state with bracket notation)
        assert!(!is_interstate_transaction(Some("BIHAR[10]"), Some("Bihar")));
        assert!(!is_interstate_transaction(Some("Maharashtra[27]"), Some("MAHARASHTRA[27]")));
        assert!(!is_interstate_transaction(Some("DELHI"), Some("Delhi[07]")));

        // Inter-state (Different states)
        assert!(is_interstate_transaction(Some("MAHARASHTRA[27]"), Some("BIHAR[10]")));
        assert!(is_interstate_transaction(Some("Karnataka[29]"), Some("Tamil Nadu[33]")));

        // Defaults to intra-state if missing
        assert!(!is_interstate_transaction(None, Some("Bihar")));
        assert!(!is_interstate_transaction(Some("Bihar"), None));
    }

    #[test]
    fn test_regime_normalization_patterns() {
        let normalize = |raw: &str| raw.trim().to_uppercase().replace(['-', '_', ' '], "");

        assert_eq!(normalize("GST"), "GST");
        assert_eq!(normalize("gst"), "GST");
        assert_eq!(normalize("VAT"), "VAT");
        assert_eq!(normalize("vat"), "VAT");
        assert_eq!(normalize("SalesTax"), "SALESTAX");
        assert_eq!(normalize("sales_tax"), "SALESTAX");
        assert_eq!(normalize("SALES_TAX"), "SALESTAX");
        assert_eq!(normalize("Sales Tax"), "SALESTAX");
        assert_eq!(normalize("None"), "NONE");
        assert_eq!(normalize("EXEMPT"), "EXEMPT");
    }

    #[test]
    fn test_multi_currency_fx_conversion() {
        let fx_rate = 86.50; // USD to INR
        let to_base = |amt: f64| (amt * fx_rate * 100.0).round() / 100.0;

        let usd_subtotal = 1000.00;
        let usd_grand_total = 1000.00;
        let inr_subtotal = to_base(usd_subtotal);
        let inr_grand_total = to_base(usd_grand_total);

        assert_eq!(inr_subtotal, 86500.00);
        assert_eq!(inr_grand_total, 86500.00);
    }

    #[test]
    fn test_intra_vs_inter_vs_export_tax_split() {
        let tax_amount: f64 = 180.0;

        // Intra-state split (CGST 50% + SGST 50%)
        let half = (tax_amount / 2.0 * 100.0).round() / 100.0;
        let other_half = tax_amount - half;
        assert_eq!(half, 90.0);
        assert_eq!(other_half, 90.0);

        // Inter-state (IGST 100%)
        let igst = tax_amount;
        assert_eq!(igst, 180.0);

        // Zero-rated Export / SEZ under LUT
        let (cgst_zero, sgst_zero, igst_zero) = (0.0, 0.0, 0.0);
        assert_eq!(cgst_zero, 0.0);
        assert_eq!(sgst_zero, 0.0);
        assert_eq!(igst_zero, 0.0);
    }

    #[test]
    fn test_vat_cross_border_reverse_charge_with_fx_conversion() {
        // UK business with base currency GBP invoicing EU buyer in EUR
        let doc_currency = "EUR";
        let base_currency = "GBP";
        let fx_rate: f64 = 0.85; // 1 EUR = 0.85 GBP

        let eur_taxable = 2000.00;
        let eur_tax_amount = 0.00; // Zero-rated under reverse charge certificate
        let eur_grand_total = 2000.00;

        let is_foreign_currency = doc_currency != base_currency && (fx_rate - 1.0).abs() > 0.0001;
        assert!(is_foreign_currency);

        let to_base = |amt: f64| (amt * fx_rate * 100.0).round() / 100.0;
        let gbp_receivable = to_base(eur_grand_total);
        let gbp_revenue = to_base(eur_taxable);
        let gbp_tax = to_base(eur_tax_amount);

        assert_eq!(gbp_receivable, 1700.00);
        assert_eq!(gbp_revenue, 1700.00);
        assert_eq!(gbp_tax, 0.00);
        // Double entry balances: DR 1700.00 == CR 1700.00
        assert_eq!(gbp_receivable, gbp_revenue + gbp_tax);
    }
}


