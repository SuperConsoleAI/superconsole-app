// src-tauri/src/commands/fin/gst.rs
//
// GST return tracking & ITC reports — Phase 4B (India & general VAT).
//
// Commands:
//   fin_get_gst_return_summary — period totals pulled from confirmed invoices
//   fin_get_vendor_itc_summary — per-vendor input tax credit report
//   fin_list_gst_returns       — list all tracked returns
//   fin_mark_return_filed      — mark a period as filed

use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct GstReturnSummary {
    pub period: String,      // "MM-YYYY"
    pub return_type: String, // "GSTR-1" | "GSTR-3B"
    pub total_sales: f64,
    pub total_tax: f64,
    pub cgst_collected: f64,
    pub sgst_collected: f64,
    pub igst_collected: f64,
    pub itc_claimed: f64,
    pub net_liability: f64,
    pub status: String, // "draft" | "filed" | "late_filed"
    pub return_id: Option<String>,
    pub arn: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VendorItcSummary {
    pub vendor_id: String,
    pub vendor_name: String,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub gst_compliance_rating: Option<i64>,
    pub total_bills: i64,
    pub total_taxable: f64,
    pub itc_claimed: f64,
    pub cgst_itc: f64,
    pub sgst_itc: f64,
    pub igst_itc: f64,
    pub balance: f64,
}

// ── fin_get_gst_return_summary ────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_get_gst_return_summary(
    state: State<'_, Arc<AppState>>,
    period: String, // "MM-YYYY" e.g. "07-2026"
    return_type: Option<String>,
) -> Result<GstReturnSummary, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let rtype = return_type.unwrap_or_else(|| "GSTR-3B".into());

    // Parse period MM-YYYY → start/end timestamps
    let parts: Vec<&str> = period.split('-').collect();
    if parts.len() != 2 {
        return Err("Period must be MM-YYYY".into());
    }
    let month: u32 = parts[0].parse().map_err(|_| "Invalid month")?;
    let year: i32 = parts[1].parse().map_err(|_| "Invalid year")?;

    // Start of month (approximate unix ts)
    let days_before: i64 = (year as i64 - 1970) * 365
        + (year as i64 - 1969) / 4
        + [0i64, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][(month as usize).min(12)];
    let from_ts = days_before * 86400;
    let to_ts = from_ts + 31 * 86400; // ~1 month

    // Sum from confirmed sales invoices
    let stmt = conn
        .prepare(
            "SELECT
               COALESCE(SUM(taxable_amt), 0),
               COALESCE(SUM(tax_amount), 0)
             FROM shop_documents
             WHERE profile_id = ?1
               AND doc_type IN ('invoice', 'pos', 'sales_order')
               AND status IN ('confirmed','paid','partial')
               AND doc_date BETWEEN ?2 AND ?3",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id.clone(), from_ts, to_ts])
        .await
        .map_err(|e| e.to_string())?;

    let (total_sales, total_tax) = if let Ok(Some(row)) = rows.next().await {
        (
            row.get::<f64>(0).unwrap_or(0.0),
            row.get::<f64>(1).unwrap_or(0.0),
        )
    } else {
        (0.0, 0.0)
    };

    // Calculate tax breakdown from journal lines
    let mut cgst_collected = 0.0;
    let mut sgst_collected = 0.0;
    let mut igst_collected = 0.0;
    let mut itc_claimed = 0.0;

    if let Ok(tax_lines_stmt) = conn
        .prepare(
            "SELECT a.account_code, COALESCE(SUM(l.credit), 0), COALESCE(SUM(l.debit), 0)
             FROM fin_journal_lines l
             JOIN fin_journal_entries e ON e.id = l.entry_id
             JOIN fin_accounts a ON a.id = l.account_id
             WHERE e.profile_id = ?1 AND e.entry_date BETWEEN ?2 AND ?3
               AND a.account_code IN ('2110', '2120', '2130', '1310', '1320', '1330')
             GROUP BY a.account_code",
        )
        .await
    {
        if let Ok(mut lrows) = tax_lines_stmt
            .query(crate::turso_params![profile_id.clone(), from_ts, to_ts])
            .await
        {
            while let Ok(Some(lr)) = lrows.next().await {
                let code: String = lr.get::<String>(0).unwrap_or_default();
                let cr: f64 = lr.get::<f64>(1).unwrap_or(0.0);
                let dr: f64 = lr.get::<f64>(2).unwrap_or(0.0);
                match code.as_str() {
                    "2110" => cgst_collected += cr - dr,
                    "2120" => sgst_collected += cr - dr,
                    "2130" => igst_collected += cr - dr,
                    "1310" | "1320" | "1330" => itc_claimed += dr - cr,
                    _ => {}
                }
            }
        }
    }

    if cgst_collected == 0.0 && sgst_collected == 0.0 && igst_collected == 0.0 && total_tax > 0.0 {
        cgst_collected = total_tax / 2.0;
        sgst_collected = total_tax / 2.0;
    }

    // Fallback query for ITC from vendor bills if journal lines empty
    if itc_claimed == 0.0 {
        if let Ok(itc_stmt) = conn
            .prepare(
                "SELECT COALESCE(SUM(tax_amount), 0)
                 FROM shop_documents
                 WHERE profile_id = ?1
                   AND doc_type IN ('purchase_order', 'goods_receipt', 'vendor_bill', 'expense')
                   AND status IN ('confirmed','paid','partial')
                   AND doc_date BETWEEN ?2 AND ?3",
            )
            .await
        {
            if let Ok(mut itc_rows) = itc_stmt.query(crate::turso_params![profile_id.clone(), from_ts, to_ts]).await {
                if let Ok(Some(ir)) = itc_rows.next().await {
                    itc_claimed = ir.get::<f64>(0).unwrap_or(0.0);
                }
            }
        }
    }

    let net_liability = (total_tax - itc_claimed).max(0.0);

    // Check if a return record exists for this period
    let ret_stmt = conn
        .prepare(
            "SELECT id, status, arn FROM fin_tax_returns
             WHERE profile_id = ?1 AND period = ?2 AND return_type = ?3 LIMIT 1",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut ret_rows = ret_stmt
        .query(crate::turso_params![
            profile_id.clone(),
            period.clone(),
            rtype.clone()
        ])
        .await
        .map_err(|e| e.to_string())?;

    let (return_id, status, arn) = if let Ok(Some(r)) = ret_rows.next().await {
        (
            r.get::<String>(0).ok(),
            r.get::<String>(1).unwrap_or_else(|_| "draft".into()),
            r.get::<String>(2).ok(),
        )
    } else {
        (None, "draft".into(), None)
    };

    Ok(GstReturnSummary {
        period,
        return_type: rtype,
        total_sales,
        total_tax,
        cgst_collected,
        sgst_collected,
        igst_collected,
        itc_claimed,
        net_liability,
        status,
        return_id,
        arn,
    })
}

// ── fin_get_vendor_itc_summary ────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_get_vendor_itc_summary(
    state: State<'_, Arc<AppState>>,
    from_ts: Option<i64>,
    to_ts: Option<i64>,
) -> Result<Vec<VendorItcSummary>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let from = from_ts.unwrap_or(0);
    let to = to_ts.unwrap_or(i64::MAX);

    let stmt = conn
        .prepare(
            "SELECT v.id, v.name, v.gstin, v.pan, v.gst_compliance_rating,
                    COUNT(DISTINCT d.id) as total_bills,
                    COALESCE(SUM(d.taxable_amt), 0) as total_taxable,
                    COALESCE(SUM(d.tax_amount), 0) as itc_claimed,
                    COALESCE(SUM(d.grand_total - d.amount_paid), 0) as balance
             FROM shop_vendors v
             LEFT JOIN shop_documents d ON d.vendor_id = v.id
               AND d.profile_id = v.profile_id
               AND d.doc_type IN ('purchase_order', 'goods_receipt', 'vendor_bill', 'expense')
               AND d.status IN ('confirmed', 'paid', 'partial')
               AND d.doc_date BETWEEN ?2 AND ?3
             WHERE v.profile_id = ?1
             GROUP BY v.id
             ORDER BY itc_claimed DESC, v.name ASC",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id.clone(), from, to])
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let itc_total: f64 = row.get::<f64>(7).unwrap_or(0.0);
        let vendor_id = row.get::<String>(0).unwrap_or_default();
        let mut cgst_itc = 0.0;
        let mut sgst_itc = 0.0;
        let mut igst_itc = 0.0;

        let lstmt = conn
            .prepare(
                "SELECT a.account_code, COALESCE(SUM(l.debit), 0)
                 FROM fin_journal_lines l
                 JOIN fin_journal_entries e ON e.id = l.entry_id
                 JOIN shop_documents d ON d.id = e.document_id
                 JOIN fin_accounts a ON a.id = l.account_id
                 WHERE e.profile_id = ?1 AND d.vendor_id = ?2
                   AND a.account_code IN ('1310', '1320', '1330')
                   AND e.entry_date BETWEEN ?3 AND ?4
                 GROUP BY a.account_code",
            )
            .await;

        if let Ok(lstmt) = lstmt {
            if let Ok(mut lrows) = lstmt.query(crate::turso_params![profile_id.clone(), vendor_id.clone(), from, to]).await {
                while let Ok(Some(lr)) = lrows.next().await {
                    let code: String = lr.get::<String>(0).unwrap_or_default();
                    let amt: f64 = lr.get::<f64>(1).unwrap_or(0.0);
                    match code.as_str() {
                        "1310" => cgst_itc = amt,
                        "1320" => sgst_itc = amt,
                        "1330" => igst_itc = amt,
                        _ => {}
                    }
                }
            }
        }

        if cgst_itc == 0.0 && sgst_itc == 0.0 && igst_itc == 0.0 && itc_total > 0.0 {
            cgst_itc = itc_total / 2.0;
            sgst_itc = itc_total / 2.0;
        }

        out.push(VendorItcSummary {
            vendor_id,
            vendor_name: row.get::<String>(1).unwrap_or_default(),
            gstin: row.get::<String>(2).ok(),
            pan: row.get::<String>(3).ok(),
            gst_compliance_rating: row.get::<i64>(4).ok(),
            total_bills: row.get::<i64>(5).unwrap_or(0),
            total_taxable: row.get::<f64>(6).unwrap_or(0.0),
            itc_claimed: itc_total,
            cgst_itc,
            sgst_itc,
            igst_itc,
            balance: row.get::<f64>(8).unwrap_or(0.0),
        });
    }

    Ok(out)
}

// ── fin_mark_return_filed ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct MarkReturnFiledArgs {
    pub period: String,
    pub return_type: String,
    pub arn: Option<String>,
    pub filed_at: Option<i64>,
}

#[tauri::command]
pub async fn fin_mark_return_filed(
    state: State<'_, Arc<AppState>>,
    args: MarkReturnFiledArgs,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let now = Utc::now().timestamp();
    let filed_at = args.filed_at.unwrap_or(now);
    let id = format!(
        "gstr-{}-{}",
        args.period.replace('-', ""),
        &args.return_type.replace('-', "").to_lowercase()
    );

    conn.execute(
        "INSERT INTO fin_tax_returns (id, profile_id, regime, return_type, period, status, arn, filed_at, created_at, updated_at)
         VALUES (?1,?2,'GST',?3,?4,'filed',?5,?6,?7,?7)
         ON CONFLICT(id) DO UPDATE SET status='filed', arn=excluded.arn, filed_at=excluded.filed_at, updated_at=excluded.updated_at",
        crate::turso_params![id, profile_id, args.return_type, args.period, args.arn, filed_at, now],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

