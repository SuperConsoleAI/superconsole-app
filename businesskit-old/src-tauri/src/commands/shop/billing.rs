// src-tauri/src/commands/shop/billing.rs
//
// Shop billing commands — Phase 4
//
// create_invoice  — takes a list of line items, creates shop_documents +
//                   shop_document_lines. Now computes real tax from
//                   fin_tax_rates assigned to each item.
//                   Posts Debit AR / Credit Sales journal entry (soft-fail).
// get_invoice     — fetches one document with all its lines
// list_invoices   — paginated list of invoices for the active profile
//
// Tax flow:
//   Per line: look up fin_item_tax_rates → fin_tax_rates.
//   Parse components JSON: {"cgst":N,"sgst":N} or {"igst":N}.
//   line_tax = taxable_amt * rate_pct / 100
//   cgst/sgst split from components; igst for inter-state.
//   Grand total = subtotal + total_tax_amount.
//
// Tables used: shop_documents, shop_document_lines
// Commands: create_invoice, get_invoice, list_invoices

use crate::commands::fin::journal::post_document_to_journal;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceLine {
    pub id: String,
    pub document_id: String,
    pub item_id: String,
    pub description: Option<String>,
    pub qty: f64,
    pub free_qty: Option<f64>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub unit_price: f64,
    pub unit_cost: f64, // for profit calculation
    pub landing_cost: Option<f64>,
    pub mrp: Option<f64>,
    pub hsn_sac_code: Option<String>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub discount_pct: f64,
    pub discount_amt: f64,
    pub tax_amount: f64,
    pub line_meta: Option<String>,
    pub line_total: f64,
    pub sort_order: i64,
    pub pricing_snapshot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String,
    pub profile_id: String,
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub doc_number: String,
    pub doc_date: i64,
    pub status: String,
    pub channel: String,
    pub service_mode: Option<String>,
    pub subtotal: f64,
    pub discount_amt: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub amount_paid: f64,
    pub amount_due: f64,
    pub profit: f64, // SUM((unit_price - unit_cost) * qty) at billing time
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    // Enriched fields (joined at query time)
    pub customer_name: Option<String>,
    pub payment_mode: Option<String>,
    pub customer_phone: Option<String>,
    pub customer_email: Option<String>,
    pub customer_gstin: Option<String>,
    pub customer_pan: Option<String>,
    pub customer_address: Option<String>,
    pub customer_city: Option<String>,
    pub customer_state: Option<String>,
    pub customer_dl_no: Option<String>,
    pub customer_gst_supply_type: Option<String>,
    pub customer_country: Option<String>,
    pub creator_name: Option<String>,
    pub updater_name: Option<String>,
    pub staff_id: Option<String>,
    pub staff_name: Option<String>,
    pub is_modified: Option<bool>,
    pub modified_at: Option<i64>,
    pub modified_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentPayment {
    pub id: String,
    pub amount: f64,
    pub currency: String,
    pub payment_mode: String,
    pub reference: Option<String>,
    pub payment_date: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceWithLines {
    #[serde(flatten)]
    pub invoice: Invoice,
    pub lines: Vec<InvoiceLine>,
    #[serde(default)]
    pub payments: Vec<DocumentPayment>,
}

#[derive(Debug, Deserialize)]
pub struct BillLine {
    pub item_id: String,
    pub item_name: String,
    pub batch_id: Option<String>,
    pub qty: f64,
    pub free_qty: Option<f64>,
    pub pack_size: Option<String>,
    pub conversion_factor: Option<f64>,
    pub unit_price: f64,
    pub landing_cost: Option<f64>,
    pub scheme_on: Option<f64>,
    pub scheme_free: Option<f64>,
    pub discount_pct: Option<f64>,
    pub extra_discount: Option<f64>,
    pub mrp: Option<f64>,
    pub hsn_sac_code: Option<String>,
    pub line_meta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePaymentInput {
    pub amount: f64,
    pub payment_mode: Option<String>,
    pub reference: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvoiceData {
    pub lines: Vec<BillLine>,
    pub notes: Option<String>,
    pub channel: Option<String>,
    pub service_mode: Option<String>,
    pub customer_id: Option<String>,
    pub vendor_id: Option<String>,
    pub status: Option<String>, // "draft" | "confirmed" (default)
    pub doc_type: Option<String>, // "invoice" (default) | "job_order" | etc.
    pub bill_discount_pct: Option<f64>,
    pub bill_discount_amt: Option<f64>,
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub sales_order_id: Option<String>,
    pub staff_id: Option<String>,
    pub payments: Option<Vec<CreatePaymentInput>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateInvoiceData {
    pub invoice_id: String,
    pub lines: Vec<BillLine>,
    pub notes: Option<String>,
    pub channel: Option<String>,
    pub service_mode: Option<String>,
    pub status: Option<String>,
    pub customer_id: Option<String>,
    pub vendor_id: Option<String>,
    pub doc_type: Option<String>,
    pub bill_discount_pct: Option<f64>,
    pub bill_discount_amt: Option<f64>,
    pub user_id: Option<String>,
    pub updated_by: Option<String>,
    pub sales_order_id: Option<String>,
    pub staff_id: Option<String>,
    pub payments: Option<Vec<CreatePaymentInput>>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("{}-{}", prefix, ts)
}

#[derive(Clone, Default)]
pub(crate) struct ItemCatalogMeta {
    pub pack_size: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub cost_price: f64,
    pub is_taxable: i64,
    pub tax_rate_id: Option<String>,
    pub tax_inclusive: i64,
    pub track_inventory: i64,
    pub item_type: String,
    pub tax_rate_pct: Option<f64>,
    pub tax_components: Option<String>,
}

pub(crate) async fn fetch_items_catalog_meta(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    item_ids: &[String],
) -> std::collections::HashMap<String, ItemCatalogMeta> {
    let mut map = std::collections::HashMap::new();
    let mut unique_ids: Vec<String> = item_ids
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    unique_ids.sort();
    unique_ids.dedup();

    if unique_ids.is_empty() {
        return map;
    }

    // 1. Fetch from shop_items joined with fin_tax_rates
    let in_placeholders = (0..unique_ids.len()).map(|_| "?").collect::<Vec<_>>().join(", ");
    let items_sql = format!(
        "SELECT si.id, si.pack_size, si.hsn_sac_code, COALESCE(si.cost_price, 0.0), \
                COALESCE(si.is_taxable, 1), si.tax_rate_id, COALESCE(si.tax_inclusive, 0), \
                COALESCE(si.track_inventory, 1), COALESCE(si.item_type, 'product'), \
                tr.rate_pct, tr.components \
         FROM shop_items si \
         LEFT JOIN fin_tax_rates tr ON tr.id = si.tax_rate_id \
         WHERE si.profile_id = ? AND si.id IN ({})",
        in_placeholders
    );

    let mut params: Vec<crate::db::turso::TursoParam> = Vec::new();
    params.push(profile_id.to_string().into());
    for id in &unique_ids {
        params.push(id.clone().into());
    }

    if let Ok(mut rows) = conn.query(&items_sql, params).await {
        while let Ok(Some(row)) = rows.next().await {
            let id: String = row.get(0).unwrap_or_default();
            let pack_size: Option<String> = row.get(1).ok().filter(|s: &String| !s.trim().is_empty());
            let hsn_sac_code: Option<String> = row.get(2).ok().filter(|s: &String| !s.trim().is_empty());
            let cost_price: f64 = row.get(3).unwrap_or(0.0);
            let is_taxable: i64 = row.get(4).unwrap_or(1);
            let tax_rate_id: Option<String> = row.get(5).ok().filter(|s: &String| !s.trim().is_empty());
            let tax_inclusive: i64 = row.get(6).unwrap_or(0);
            let track_inventory: i64 = row.get(7).unwrap_or(1);
            let item_type: String = row.get(8).unwrap_or_else(|_| "product".to_string());
            let tax_rate_pct: Option<f64> = row.get(9).ok();
            let tax_components: Option<String> = row.get(10).ok();

            map.insert(
                id,
                ItemCatalogMeta {
                    pack_size,
                    hsn_sac_code,
                    cost_price,
                    is_taxable,
                    tax_rate_id,
                    tax_inclusive,
                    track_inventory,
                    item_type,
                    tax_rate_pct,
                    tax_components,
                },
            );
        }
    }

    // 2. For any IDs not found in shop_items, query shop_item_variants
    let missing_ids: Vec<String> = unique_ids
        .into_iter()
        .filter(|id| !map.contains_key(id))
        .collect();

    if !missing_ids.is_empty() {
        let var_placeholders = (0..missing_ids.len()).map(|_| "?").collect::<Vec<_>>().join(", ");
        let variants_sql = format!(
            "SELECT v.id, v.pack_size, v.hsn_sac_code, COALESCE(v.cost_price, 0.0), \
                    COALESCE(v.is_taxable, 1), v.tax_rate_id, COALESCE(v.tax_inclusive, 0), \
                    COALESCE(v.track_inventory, 1), 'product', \
                    tr.rate_pct, tr.components \
             FROM shop_item_variants v \
             LEFT JOIN fin_tax_rates tr ON tr.id = v.tax_rate_id \
             WHERE v.profile_id = ? AND v.id IN ({})",
            var_placeholders
        );

        let mut v_params: Vec<crate::db::turso::TursoParam> = Vec::new();
        v_params.push(profile_id.to_string().into());
        for id in &missing_ids {
            v_params.push(id.clone().into());
        }

        if let Ok(mut rows) = conn.query(&variants_sql, v_params).await {
            while let Ok(Some(row)) = rows.next().await {
                let id: String = row.get(0).unwrap_or_default();
                let pack_size: Option<String> = row.get(1).ok().filter(|s: &String| !s.trim().is_empty());
                let hsn_sac_code: Option<String> = row.get(2).ok().filter(|s: &String| !s.trim().is_empty());
                let cost_price: f64 = row.get(3).unwrap_or(0.0);
                let is_taxable: i64 = row.get(4).unwrap_or(1);
                let tax_rate_id: Option<String> = row.get(5).ok().filter(|s: &String| !s.trim().is_empty());
                let tax_inclusive: i64 = row.get(6).unwrap_or(0);
                let track_inventory: i64 = row.get(7).unwrap_or(1);
                let item_type: String = row.get(8).unwrap_or_else(|_| "product".to_string());
                let tax_rate_pct: Option<f64> = row.get(9).ok();
                let tax_components: Option<String> = row.get(10).ok();

                map.insert(
                    id,
                    ItemCatalogMeta {
                        pack_size,
                        hsn_sac_code,
                        cost_price,
                        is_taxable,
                        tax_rate_id,
                        tax_inclusive,
                        track_inventory,
                        item_type,
                        tax_rate_pct,
                        tax_components,
                    },
                );
            }
        }
    }

    map
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create an invoice from a list of bill lines.
/// Sequences doc_number as INV-{zero-padded sequence}.
/// Resolves tax rates, computes CGST/SGST/IGST, batches all line inserts,
/// optionally processes initial payments, and posts to the double-entry journal.
#[tauri::command]
pub async fn shop_create_invoice(
    data: CreateInvoiceData,
    state: State<'_, Arc<AppState>>,
) -> Result<InvoiceWithLines, String> {
    if data.lines.is_empty() {
        return Err("Cannot create an invoice with no lines".to_string());
    }

    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let doc_type = data.doc_type.clone().unwrap_or_else(|| "invoice".to_string());
    let prefix = match doc_type.as_str() {
        "job_order" => "JOB",
        "estimate" => "EST",
        "proforma" => "PRO",
        "sales_order" => "SO",
        _ => "INV",
    };
    let pattern = format!("{}-%", prefix);
    let substr_idx = (prefix.len() + 2) as i64;

    let mut seq_rows = conn
        .query(
            &format!(
                "SELECT COALESCE(MAX(CAST(SUBSTR(doc_number,{}) AS INTEGER)),0) \
                 FROM shop_documents \
                 WHERE profile_id = ? AND doc_type = ? AND doc_number LIKE ?",
                substr_idx
            ),
            crate::turso_params![profile_id.clone(), doc_type.clone(), pattern],
        )
        .await
        .map_err(|e| e.to_string())?;

    let seq: i64 = if let Ok(Some(row)) = seq_rows.next().await {
        row.get::<i64>(0).unwrap_or(0) + 1
    } else {
        1
    };
    let doc_number = format!("{}-{:04}", prefix, seq);

    // 2. Pre-fetch catalog metadata & tax configurations in batch
    let item_ids: Vec<String> = data.lines.iter().map(|l| l.item_id.clone()).collect();
    let catalog_meta = fetch_items_catalog_meta(&conn, &profile_id, &item_ids).await;

    // Check tax regime & global tax config
    let (tax_mode, global_rate, global_comp, store_tax_inclusive) = {
        let mut q = conn
            .query(
                "SELECT tc.tax_mode, COALESCE(tc.global_tax_rate, tr.rate_pct), COALESCE(tr.components, '{}'), COALESCE(tc.tax_inclusive, 0) \
                 FROM fin_tax_configs tc \
                 LEFT JOIN fin_tax_rates tr ON tr.id = tc.global_tax_rate_id \
                 WHERE tc.profile_id = ?1 LIMIT 1",
                crate::turso_params![profile_id.clone()],
            )
            .await
            .ok();
        if let Some(ref mut rows) = q {
            if let Ok(Some(row)) = rows.next().await {
                let tm: String = row.get(0).unwrap_or_else(|_| "item".into());
                let gr: Option<f64> = row.get(1).ok();
                let gc: String = row.get(2).unwrap_or_else(|_| "{}".into());
                let ti: i64 = row.get(3).unwrap_or(0);
                (tm, gr, gc, ti)
            } else {
                ("item".to_string(), None, "{}".to_string(), 0)
            }
        } else {
            ("item".to_string(), None, "{}".to_string(), 0)
        }
    };

    // Check customer tax exemption status
    let collect_taxes: i64 = if let Some(ref cid) = data.customer_id {
        let mut r = conn
            .query(
                "SELECT COALESCE(collect_taxes, 1) FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
                crate::turso_params![cid.clone(), profile_id.clone()],
            )
            .await
            .ok();
        if let Some(ref mut rows) = r {
            if let Ok(Some(row)) = rows.next().await {
                row.get(0).unwrap_or(1)
            } else {
                1
            }
        } else {
            1
        }
    } else {
        1
    };

    // 3. Compute per-line totals + tax completely in-memory
    struct LineTax {
        taxable: f64,
        cgst: f64,
        sgst: f64,
        igst: f64,
    }

    let mut subtotal = 0.0_f64;
    let mut total_discount = 0.0_f64;
    let mut total_tax = 0.0_f64;
    let mut profit = 0.0_f64;
    let mut line_taxes: Vec<LineTax> = Vec::new();

    for line in &data.lines {
        let base_disc = line.discount_pct.unwrap_or(0.0);
        let extra_disc = line.extra_discount.unwrap_or(0.0);
        let disc_pct = base_disc + extra_disc;
        let disc_amt = line.unit_price * line.qty * disc_pct / 100.0;
        let line_gross = line.unit_price * line.qty - disc_amt;

        let meta = catalog_meta.get(&line.item_id);

        let tax_info: Option<(f64, String, i64)> = if collect_taxes == 0 {
            None
        } else if tax_mode == "global" {
            let is_item_taxable = if let Some(m) = meta {
                let tr_id = m.tax_rate_id.as_deref();
                let is_exempt = tr_id == Some("exempt") || tr_id == Some("nil");
                !is_exempt && (m.is_taxable == 1 || tr_id.is_none() || tr_id == Some(""))
            } else {
                true
            };

            if is_item_taxable {
                global_rate.map(|gr| (gr, global_comp.clone(), store_tax_inclusive))
            } else {
                None
            }
        } else if let Some(m) = meta {
            m.tax_rate_pct.map(|rp| {
                (
                    rp,
                    m.tax_components.clone().unwrap_or_else(|| "{}".into()),
                    m.tax_inclusive,
                )
            })
        } else {
            None
        };

        let (taxable, cgst, sgst, igst, line_tax) = if let Some((rate_pct, comp, is_inc)) = tax_info {
            let v: serde_json::Value = serde_json::from_str(&comp).unwrap_or_default();
            let cgst_v = v.get("cgst").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let sgst_v = v.get("sgst").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let igst_v = v.get("igst").and_then(|x| x.as_f64()).unwrap_or(0.0);

            if is_inc == 1 && rate_pct > 0.0 {
                let taxable_calc = (line_gross / (1.0 + rate_pct / 100.0) * 100.0).round() / 100.0;
                let tax_amt_calc = line_gross - taxable_calc;
                let cg = (tax_amt_calc * (cgst_v / rate_pct) * 100.0).round() / 100.0;
                let sg = (tax_amt_calc * (sgst_v / rate_pct) * 100.0).round() / 100.0;
                let ig = (tax_amt_calc * (igst_v / rate_pct) * 100.0).round() / 100.0;
                (taxable_calc, cg, sg, ig, tax_amt_calc)
            } else {
                let cg = (line_gross * cgst_v / 100.0 * 100.0).round() / 100.0;
                let sg = (line_gross * sgst_v / 100.0 * 100.0).round() / 100.0;
                let ig = (line_gross * igst_v / 100.0 * 100.0).round() / 100.0;
                let t_amt = cg + sg + ig;
                (line_gross, cg, sg, ig, t_amt)
            }
        } else {
            (line_gross, 0.0, 0.0, 0.0, 0.0)
        };

        subtotal += taxable;
        total_discount += disc_amt;
        total_tax += line_tax;
        line_taxes.push(LineTax {
            taxable,
            cgst,
            sgst,
            igst,
        });
    }

    let bill_disc_pct = data.bill_discount_pct.unwrap_or(0.0);
    let mut bill_disc_amt = data.bill_discount_amt.unwrap_or(0.0);
    if bill_disc_pct > 0.0 && bill_disc_amt == 0.0 {
        bill_disc_amt = (subtotal * bill_disc_pct / 100.0 * 100.0).round() / 100.0;
    }
    total_discount += bill_disc_amt;
    let grand_total = (subtotal - bill_disc_amt + total_tax).max(0.0);

    let doc_id = new_id("inv");
    let now_micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let now_secs = (now_micros / 1_000_000) as i64;

    // 4. Build lines in-memory & compute profit
    let mut db_lines = Vec::new();
    let mut batch_decrements: Vec<(String, f64)> = Vec::new();

    for (i, line) in data.lines.iter().enumerate() {
        let line_id = format!("line-{}-{}", now_micros, i);
        let base_disc = line.discount_pct.unwrap_or(0.0);
        let extra_disc = line.extra_discount.unwrap_or(0.0);
        let disc_pct = base_disc + extra_disc;
        let disc_amt = line.unit_price * line.qty * disc_pct / 100.0;
        let lt = &line_taxes[i];
        let line_tax = lt.cgst + lt.sgst + lt.igst;
        let line_grand = lt.taxable + line_tax;

        let meta = catalog_meta.get(&line.item_id);

        let mut pack_size = line.pack_size.clone();
        if pack_size.as_ref().map_or(true, |s| s.trim().is_empty()) {
            if let Some(m) = meta {
                pack_size = m.pack_size.clone();
            }
        }

        let mut hsn = line.hsn_sac_code.clone().unwrap_or_default();
        if hsn.trim().is_empty() {
            if let Some(m) = meta {
                if let Some(ref code) = m.hsn_sac_code {
                    hsn = code.clone();
                }
            }
        }

        let unit_cost = meta.map(|m| m.cost_price).unwrap_or(0.0);
        let landing_cost = line.landing_cost.unwrap_or(unit_cost);
        let mrp = line.mrp.unwrap_or(0.0);
        let free_qty = line.free_qty.unwrap_or(0.0);
        let scheme_on = line.scheme_on.unwrap_or(0.0);
        let scheme_free = line.scheme_free.unwrap_or(0.0);
        let conv_factor = line.conversion_factor.unwrap_or(1.0);

        let line_meta = {
            let raw_meta = line.line_meta.clone().unwrap_or_else(|| "{}".to_string());
            let mut meta_val: serde_json::Value =
                serde_json::from_str(&raw_meta).unwrap_or_else(|_| serde_json::json!({}));
            if let Some(ref ps) = pack_size {
                if meta_val.get("pack").is_none()
                    || meta_val["pack"].as_str().map_or(true, |s| s.is_empty())
                {
                    meta_val["pack"] = serde_json::Value::String(ps.clone());
                    meta_val["pack_size"] = serde_json::Value::String(ps.clone());
                }
            }
            if !hsn.trim().is_empty() {
                if meta_val.get("hsn_sac_code").is_none()
                    || meta_val["hsn_sac_code"].as_str().map_or(true, |s| s.is_empty())
                {
                    meta_val["hsn_sac_code"] = serde_json::Value::String(hsn.clone());
                    meta_val["hsn"] = serde_json::Value::String(hsn.clone());
                }
            }
            if let Some(ed) = line.extra_discount {
                if ed > 0.0 {
                    meta_val["extra_discount"] = serde_json::json!(ed);
                    meta_val["discount2"] = serde_json::json!(ed);
                    meta_val["dis2"] = serde_json::json!(ed);
                }
            }
            if let Some(bd) = line.discount_pct {
                meta_val["discount_pct"] = serde_json::json!(bd);
                meta_val["dis1"] = serde_json::json!(bd);
            }
            serde_json::to_string(&meta_val).unwrap_or(raw_meta)
        };

        if let Some(ref bid) = line.batch_id {
            if !bid.trim().is_empty() {
                batch_decrements.push((bid.clone(), line.qty + free_qty));
            }
        }

        if unit_cost > 0.0 {
            profit += (line.unit_price - unit_cost) * line.qty - disc_amt;
        }

        db_lines.push(InvoiceLine {
            id: line_id,
            document_id: doc_id.clone(),
            item_id: line.item_id.clone(),
            description: Some(line.item_name.clone()),
            qty: line.qty,
            free_qty: Some(free_qty),
            pack_size,
            conversion_factor: Some(conv_factor),
            unit_price: line.unit_price,
            unit_cost,
            landing_cost: Some(landing_cost),
            mrp: Some(mrp),
            hsn_sac_code: if hsn.trim().is_empty() {
                None
            } else {
                Some(hsn.clone())
            },
            scheme_on: Some(scheme_on),
            scheme_free: Some(scheme_free),
            discount_pct: disc_pct,
            discount_amt: disc_amt,
            tax_amount: line_tax,
            line_meta: Some(line_meta),
            line_total: line_grand,
            sort_order: i as i64,
            pricing_snapshot: None,
        });
    }

    // 5. Process any initial payments provided in payload
    let req_status = data.status.as_deref().unwrap_or("confirmed");
    let mut total_paid = 0.0_f64;
    let mut db_payments: Vec<DocumentPayment> = Vec::new();
    let mut payment_rows = Vec::new();
    let mut wallet_deductions: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    if let Some(ref pays) = data.payments {
        for (p_idx, p) in pays.iter().enumerate() {
            if p.amount <= 0.0 {
                continue;
            }
            let pay_amt = p.amount.min((grand_total - total_paid).max(0.0));
            if pay_amt <= 0.0 {
                continue;
            }
            total_paid += pay_amt;
            let mode = p.payment_mode.clone().unwrap_or_else(|| "cash".to_string());
            let pay_id = format!("pay-{}-{}", now_micros, p_idx);

            if mode == "wallet" || mode == "store_credit" {
                if let Some(ref cid) = data.customer_id {
                    if !cid.is_empty() {
                        *wallet_deductions.entry(cid.clone()).or_insert(0.0) += pay_amt;
                    }
                }
            }

            payment_rows.push((
                pay_id.clone(),
                profile_id.clone(),
                doc_id.clone(),
                pay_amt,
                "INR".to_string(),
                mode.clone(),
                p.reference.clone(),
                p.notes.clone(),
            ));

            db_payments.push(DocumentPayment {
                id: pay_id,
                amount: pay_amt,
                currency: "INR".to_string(),
                payment_mode: mode,
                reference: p.reference.clone(),
                payment_date: now_secs,
                notes: p.notes.clone(),
            });
        }
    }

    let amount_paid_init = total_paid;
    let amount_due_init = (grand_total - total_paid).max(0.0);
    let final_status = if req_status == "draft" {
        "draft"
    } else if amount_due_init <= 0.005 {
        "paid"
    } else if amount_paid_init > 0.005 {
        "partial"
    } else {
        req_status
    };

    let channel = data.channel.clone().unwrap_or_else(|| "pos".to_string());
    let service_mode = data
        .service_mode
        .clone()
        .unwrap_or_else(|| "dine_in".to_string());

    let active_uid = state.get_current_user_id().await;
    let user_id = data.user_id.unwrap_or(active_uid.clone());
    let updated_by = data.updated_by.unwrap_or(active_uid);

    // 6. Insert document header in 1 execute
    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, user_id, updated_by, doc_type, doc_number, channel, service_mode, status, \
          subtotal, discount_amt, taxable_amt, tax_amount, grand_total, \
          amount_paid, amount_due, profit, notes, customer_id, vendor_id, staff_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crate::turso_params![
            doc_id.clone(),
            profile_id.clone(),
            user_id.clone(),
            updated_by.clone(),
            doc_type.clone(),
            doc_number.clone(),
            channel.clone(),
            service_mode.clone(),
            final_status,
            subtotal,
            total_discount,
            subtotal,
            total_tax,
            grand_total,
            amount_paid_init,
            amount_due_init,
            profit,
            data.notes.clone(),
            data.customer_id.clone(),
            data.vendor_id.clone(),
            data.staff_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 7. Batch insert all lines in 1 execute
    if !db_lines.is_empty() {
        let placeholders = (0..db_lines.len())
            .map(|_| "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .collect::<Vec<_>>()
            .join(", ");
        let lines_sql = format!(
            "INSERT INTO shop_document_lines \
             (id, profile_id, document_id, item_id, batch_id, description, hsn_sac_code, \
              qty, free_qty, pack_size, conversion_factor, unit_price, unit_cost, landing_cost, mrp, \
              scheme_on, scheme_free, discount_pct, discount_amt, taxable_amt, tax_amount, line_meta, line_total, sort_order) \
             VALUES {}",
            placeholders
        );

        let mut line_params: Vec<crate::db::turso::TursoParam> = Vec::new();
        for l in &db_lines {
            line_params.push(l.id.clone().into());
            line_params.push(profile_id.clone().into());
            line_params.push(l.document_id.clone().into());
            line_params.push(l.item_id.clone().into());
            let orig_batch = data
                .lines
                .get(l.sort_order as usize)
                .and_then(|ol| ol.batch_id.clone());
            line_params.push(orig_batch.into());
            line_params.push(l.description.clone().into());
            line_params.push(l.hsn_sac_code.clone().into());
            line_params.push(l.qty.into());
            line_params.push(l.free_qty.into());
            line_params.push(l.pack_size.clone().into());
            line_params.push(l.conversion_factor.into());
            line_params.push(l.unit_price.into());
            line_params.push(l.unit_cost.into());
            line_params.push(l.landing_cost.into());
            line_params.push(l.mrp.into());
            line_params.push(l.scheme_on.into());
            line_params.push(l.scheme_free.into());
            line_params.push(l.discount_pct.into());
            line_params.push(l.discount_amt.into());
            let lt = &line_taxes[l.sort_order as usize];
            line_params.push(lt.taxable.into());
            line_params.push(l.tax_amount.into());
            line_params.push(l.line_meta.clone().into());
            line_params.push(l.line_total.into());
            line_params.push(l.sort_order.into());
        }

        conn.execute(&lines_sql, line_params)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 8. Batch insert payments (if any)
    if !payment_rows.is_empty() {
        let pay_placeholders = (0..payment_rows.len())
            .map(|_| "(?, ?, ?, ?, ?, ?, ?, ?)")
            .collect::<Vec<_>>()
            .join(", ");
        let pay_sql = format!(
            "INSERT INTO shop_document_payments \
             (id, profile_id, document_id, amount, currency, payment_mode, reference, notes) \
             VALUES {}",
            pay_placeholders
        );

        let mut pay_params: Vec<crate::db::turso::TursoParam> = Vec::new();
        for r in &payment_rows {
            pay_params.push(r.0.clone().into());
            pay_params.push(r.1.clone().into());
            pay_params.push(r.2.clone().into());
            pay_params.push(r.3.into());
            pay_params.push(r.4.clone().into());
            pay_params.push(r.5.clone().into());
            pay_params.push(r.6.clone().into());
            pay_params.push(r.7.clone().into());
        }
        let _ = conn.execute(&pay_sql, pay_params).await;

        // Customer wallet deductions for store credit / wallet
        for (cid, amt) in wallet_deductions {
            let _ = conn.execute(
                "UPDATE shop_customers SET wallet_balance = MAX(0.0, COALESCE(wallet_balance, 0.0) - ?1), updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                crate::turso_params![amt, cid.clone(), profile_id.clone()],
            ).await;

            let ledger_id = format!("crd-{}-{}", now_micros, cid);
            let note_text = format!("Wallet/Store Credit payment for invoice {}", doc_number);
            let _ = conn.execute(
                "INSERT INTO shop_customer_credit_ledger \
                 (id, profile_id, customer_id, entry_type, amount, balance_after, document_id, notes, created_at) \
                 SELECT ?, ?, ?, 'redeem', ?, wallet_balance, ?, ?, strftime('%s','now') FROM shop_customers WHERE id = ? AND profile_id = ?",
                crate::turso_params![
                    ledger_id,
                    profile_id.clone(),
                    cid.clone(),
                    -amt,
                    doc_id.clone(),
                    note_text,
                    cid.clone(),
                    profile_id.clone()
                ],
            ).await;
        }
    }

    // 9. Post to double-entry ledger & handle stock ledger for confirmed sales
    if final_status != "draft" {
        let _ = post_document_to_journal(&conn, &profile_id, &doc_id).await;

        // Decrement batch quantities
        for (bid, qty) in &batch_decrements {
            let _ = conn
                .execute(
                    "UPDATE shop_item_batches SET qty_remaining = MAX(0, qty_remaining - ?1) WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![*qty, bid.clone(), profile_id.clone()],
                )
                .await;
        }

        // Write stock ledger rows for tracked items
        let default_wh: Option<String> = {
            let mut wh_rows = conn
                .query(
                    "SELECT id FROM shop_warehouses WHERE profile_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1",
                    crate::turso_params![profile_id.clone()],
                )
                .await
                .ok();
            let found = if let Some(ref mut r) = wh_rows {
                if let Ok(Some(row)) = r.next().await {
                    while r.next().await.map(|r| r.is_some()).unwrap_or(false) {}
                    row.get::<String>(0).ok()
                } else {
                    None
                }
            } else {
                None
            };
            if found.is_some() {
                found
            } else {
                let mut any_rows = conn
                    .query(
                        "SELECT id FROM shop_warehouses WHERE profile_id = ? AND is_active = 1 ORDER BY name ASC LIMIT 1",
                        crate::turso_params![profile_id.clone()],
                    )
                    .await
                    .ok();
                if let Some(ref mut r) = any_rows {
                    if let Ok(Some(row)) = r.next().await {
                        while r.next().await.map(|r| r.is_some()).unwrap_or(false) {}
                        row.get::<String>(0).ok()
                    } else {
                        let fallback_id = format!("{}_main", profile_id);
                        let _ = conn.execute(
                            "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) \
                             VALUES (?1, ?2, 'Main Warehouse', 'store', 1, 1) \
                             ON CONFLICT(id) DO UPDATE SET is_active = 1",
                            crate::turso_params![fallback_id.clone(), profile_id.clone()]
                        ).await;
                        Some(fallback_id)
                    }
                } else {
                    None
                }
            }
        };

        if let Some(wh_id) = default_wh {
            let mut tracked_items = Vec::new();
            for line in &data.lines {
                let meta = catalog_meta.get(&line.item_id);
                let is_service = meta.map(|m| m.item_type == "service").unwrap_or(false);
                let track = if is_service {
                    0
                } else {
                    meta.map(|m| m.track_inventory).unwrap_or(1)
                };
                if track == 1 {
                    let total_qty = line.qty + line.free_qty.unwrap_or(0.0);
                    let cost = line
                        .landing_cost
                        .unwrap_or_else(|| meta.map(|m| m.cost_price).unwrap_or(0.0));
                    tracked_items.push((line.item_id.clone(), total_qty, cost));
                }
            }

            if !tracked_items.is_empty() {
                let tracked_ids: Vec<String> =
                    tracked_items.iter().map(|(id, _, _)| id.clone()).collect();
                let placeholders = (0..tracked_ids.len())
                    .map(|_| "?")
                    .collect::<Vec<_>>()
                    .join(", ");

                let mut track_params: Vec<crate::db::turso::TursoParam> = Vec::new();
                track_params.push(profile_id.clone().into());
                for id in &tracked_ids {
                    track_params.push(id.clone().into());
                }
                let _ = conn
                    .execute(
                        &format!(
                            "UPDATE shop_items SET track_inventory = 1 \
                             WHERE profile_id = ? AND id IN ({}) AND (track_inventory = 0 OR track_inventory IS NULL)",
                            placeholders
                        ),
                        track_params,
                    )
                    .await;

                for (item_id, qty, _) in &tracked_items {
                    let _ = conn
                        .execute(
                            "UPDATE shop_item_variants SET stock_qty = MAX(0, stock_qty - ?1) WHERE id = ?2 AND profile_id = ?3",
                            crate::turso_params![*qty, item_id.clone(), profile_id.clone()],
                        )
                        .await;
                }

                let mut bal_params: Vec<crate::db::turso::TursoParam> = Vec::new();
                bal_params.push(profile_id.clone().into());
                bal_params.push(wh_id.clone().into());
                for id in &tracked_ids {
                    bal_params.push(id.clone().into());
                }

                let mut balances: std::collections::HashMap<String, f64> =
                    std::collections::HashMap::new();
                if let Ok(mut bal_rows) = conn
                    .query(
                        &format!(
                            "SELECT item_id, COALESCE(SUM(qty_in) - SUM(qty_out), 0.0) \
                             FROM shop_stock_ledger \
                             WHERE profile_id = ? AND warehouse_id = ? AND item_id IN ({}) \
                             GROUP BY item_id",
                            placeholders
                        ),
                        bal_params,
                    )
                    .await
                {
                    while let Ok(Some(row)) = bal_rows.next().await {
                        let i_id: String = row.get(0).unwrap_or_default();
                        let bal: f64 = row.get(1).unwrap_or(0.0);
                        balances.insert(i_id, bal);
                    }
                }

                let sl_placeholders = (0..tracked_items.len())
                    .map(|_| "(?, ?, ?, ?, 'sale', 0, ?, ?, ?, ?, 'POS Sale')")
                    .collect::<Vec<_>>()
                    .join(", ");
                let sl_sql = format!(
                    "INSERT INTO shop_stock_ledger \
                     (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost, document_id, notes) \
                     VALUES {}",
                    sl_placeholders
                );

                let mut sl_params: Vec<crate::db::turso::TursoParam> = Vec::new();
                for (idx, (item_id, total_qty, cost)) in tracked_items.iter().enumerate() {
                    let sl_id = format!("sl-{}-{}", now_micros, idx);
                    let current_bal = balances.get(item_id).copied().unwrap_or(0.0);
                    let new_bal = current_bal - *total_qty;
                    balances.insert(item_id.clone(), new_bal);

                    sl_params.push(sl_id.into());
                    sl_params.push(profile_id.clone().into());
                    sl_params.push(item_id.clone().into());
                    sl_params.push(wh_id.clone().into());
                    sl_params.push((*total_qty).into());
                    sl_params.push(new_bal.into());
                    sl_params.push((*cost).into());
                    sl_params.push(doc_id.clone().into());
                }

                let _ = conn.execute(&sl_sql, sl_params).await;
            }
        }
    }

    // If linked to a sales order, mark the sales order as invoiced
    if let Some(ref so_id) = data.sales_order_id {
        if !so_id.trim().is_empty() {
            let _ = conn
                .execute(
                    "UPDATE shop_documents SET status = 'invoiced', updated_at = (strftime('%s','now')) WHERE id = ?1 AND profile_id = ?2",
                    crate::turso_params![so_id.clone(), profile_id.clone()],
                )
                .await;
        }
    }

    let invoice = Invoice {
        id: doc_id,
        profile_id,
        user_id: Some(user_id),
        updated_by: Some(updated_by),
        doc_number,
        doc_date: now_secs,
        status: final_status.to_string(),
        channel,
        service_mode: Some(service_mode),
        subtotal,
        discount_amt: total_discount,
        tax_amount: total_tax,
        grand_total,
        amount_paid: amount_paid_init,
        amount_due: amount_due_init,
        profit,
        notes: data.notes,
        created_at: now_secs,
        updated_at: now_secs,
        customer_name: None,
        payment_mode: None,
        customer_phone: None,
        customer_email: None,
        customer_gstin: None,
        customer_pan: None,
        customer_address: None,
        customer_city: None,
        customer_state: None,
        customer_dl_no: None,
        customer_gst_supply_type: None,
        customer_country: None,
        creator_name: None,
        updater_name: None,
        staff_id: data.staff_id.clone(),
        staff_name: None,
        is_modified: Some(false),
        modified_at: None,
        modified_by: None,
    };

    Ok(InvoiceWithLines {
        invoice,
        lines: db_lines,
        payments: db_payments,
    })
}

// ── shop_delete_invoice ───────────────────────────────────────────────────────
// Only draft invoices may be deleted. Returns an error for confirmed/paid.

#[tauri::command]
pub async fn shop_delete_invoice(
    invoice_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Guard: only drafts may be deleted
    let mut chk = conn
        .query(
            "SELECT status FROM shop_documents WHERE id = ? AND profile_id = ? LIMIT 1",
            crate::turso_params![invoice_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    match chk.next().await {
        Ok(Some(row)) => {
            let status: String = row.get(0).unwrap_or_default();
            if status != "draft" {
                return Err(format!(
                    "Only draft invoices can be deleted (status: {})",
                    status
                ));
            }
        }
        _ => return Err("Invoice not found".to_string()),
    }

    // Delete lines first (FK), then document & any orphan ledger rows
    let _ = conn.execute(
        "DELETE FROM shop_stock_ledger WHERE document_id = ? AND profile_id = ?",
        crate::turso_params![invoice_id.clone(), profile_id.clone()],
    ).await;

    conn.execute(
        "DELETE FROM shop_document_lines WHERE document_id = ? AND profile_id = ?",
        crate::turso_params![invoice_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM shop_documents WHERE id = ? AND profile_id = ? AND status = 'draft'",
        crate::turso_params![invoice_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get a single invoice with all its lines (includes unit_cost for profit, customer name, payment mode).
#[tauri::command]
pub async fn shop_get_invoice(
    invoice_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<InvoiceWithLines, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut doc_rows = conn
        .query(
            "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.doc_number, d.doc_date, d.status, d.channel, \
         COALESCE(d.service_mode, 'dine_in') as service_mode, \
         d.subtotal, d.discount_amt, d.tax_amount, d.grand_total, d.amount_paid, d.amount_due, \
         d.profit, d.notes, d.created_at, d.updated_at, \
         c.name as customer_name, \
         (SELECT payment_mode FROM shop_document_payments \
          WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as payment_mode, \
         c.phone as customer_phone, c.email as customer_email, c.gstin as customer_gstin, \
         c.pan as customer_pan, c.billing_addr as customer_address, c.city as customer_city, \
         c.state as customer_state, c.dl_no as customer_dl_no, \
         COALESCE(c.gst_supply_type, 'regular') as customer_gst_supply_type, \
         c.country as customer_country, \
         COALESCE((SELECT name FROM shop_staff WHERE id = d.staff_id), NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, (SELECT name FROM shop_staff WHERE id = d.user_id)) as creator_name, \
         COALESCE((SELECT name FROM shop_staff WHERE id = d.modified_by), NULLIF(TRIM(COALESCE(um.first_name, '') || ' ' || COALESCE(um.last_name, '')), ''), um.username, um.email, (SELECT name FROM shop_staff WHERE id = d.updated_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email, (SELECT name FROM shop_staff WHERE id = d.staff_id)) as updater_name, \
         d.staff_id, \
         (SELECT name FROM shop_staff WHERE id = d.staff_id) as staff_name, \
         CASE WHEN COALESCE(d.is_modified, 0) = 1 OR json_extract(d.meta, '$.is_modified') = 1 OR d.notes LIKE '%Modified Bill%' THEN 1 ELSE 0 END as is_modified, \
         COALESCE(d.modified_at, json_extract(d.meta, '$.modified_at')) as modified_at, \
         d.modified_by \
         FROM shop_documents d \
         LEFT JOIN shop_customers c ON c.id = d.customer_id AND c.profile_id = d.profile_id \
         LEFT JOIN users uc ON uc.id = d.user_id \
         LEFT JOIN users uu ON uu.id = d.updated_by \
         LEFT JOIN users um ON um.id = d.modified_by \
         WHERE d.id = ? AND d.profile_id = ? AND d.doc_type IN ('invoice', 'sales_order', 'estimate', 'proforma', 'job_order')",
            crate::turso_params![invoice_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let invoice = if let Ok(Some(row)) = doc_rows.next().await {
        Invoice {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            user_id: row.get(2).ok(),
            updated_by: row.get(3).ok(),
            doc_number: row.get(4).unwrap_or_default(),
            doc_date: row.get(5).unwrap_or(0),
            status: row.get(6).unwrap_or_else(|_| "confirmed".to_string()),
            channel: row.get(7).unwrap_or_else(|_| "pos".to_string()),
            service_mode: row.get(8).ok(),
            subtotal: row.get(9).unwrap_or(0.0),
            discount_amt: row.get(10).unwrap_or(0.0),
            tax_amount: row.get(11).unwrap_or(0.0),
            grand_total: row.get(12).unwrap_or(0.0),
            amount_paid: row.get(13).unwrap_or(0.0),
            amount_due: row.get(14).unwrap_or(0.0),
            profit: row.get(15).unwrap_or(0.0),
            notes: row.get(16).ok(),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
            customer_name: row.get(19).ok(),
            payment_mode: row.get(20).ok(),
            customer_phone: row.get(21).ok(),
            customer_email: row.get(22).ok(),
            customer_gstin: row.get(23).ok(),
            customer_pan: row.get(24).ok(),
            customer_address: row.get(25).ok(),
            customer_city: row.get(26).ok(),
            customer_state: row.get(27).ok(),
            customer_dl_no: row.get(28).ok(),
            customer_gst_supply_type: row.get(29).ok(),
            customer_country: row.get(30).ok(),
            creator_name: row.get(31).ok(),
            updater_name: row.get(32).ok(),
            staff_id: row.get(33).ok(),
            staff_name: row.get(34).ok(),
            is_modified: row.get::<i64>(35).map(|v| v == 1).ok(),
            modified_at: row.get::<i64>(36).ok(),
            modified_by: row.get::<String>(37).ok(),
        }
    } else {
        return Err(format!("Invoice not found"));
    };

    let mut line_rows = conn
        .query(
            "SELECT l.id, l.document_id, l.item_id, l.description, l.qty, l.unit_price, l.unit_cost, \
         l.discount_pct, l.discount_amt, l.tax_amount, COALESCE(l.line_meta, '{}'), l.line_total, l.sort_order, \
         l.free_qty, COALESCE(l.pack_size, b.pack_size, si.pack_size) as resolved_pack, \
         l.conversion_factor, l.landing_cost, l.mrp, l.scheme_on, l.scheme_free, \
         b.shelf_location, b.batch_no, b.expiry_date, l.pricing_snapshot, \
         COALESCE(l.hsn_sac_code, si.hsn_sac_code) as resolved_hsn, \
         sb.name as resolved_brand_name \
         FROM shop_document_lines l \
         LEFT JOIN shop_item_batches b ON b.id = l.batch_id \
         LEFT JOIN shop_items si ON si.id = l.item_id \
         LEFT JOIN shop_brands sb ON sb.id = si.brand_id \
         WHERE l.document_id = ? \
         ORDER BY l.sort_order ASC",
            crate::turso_params![invoice_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut lines = Vec::new();
    while let Ok(Some(row)) = line_rows.next().await {
        let raw_meta_str: String = row.get(10).unwrap_or_else(|_| "{}".to_string());
        let resolved_pack: Option<String> = row.get(14).ok();
        let batch_shelf: Option<String> = row.get(20).ok();
        let batch_no: Option<String> = row.get(21).ok();
        let batch_exp: Option<i64> = row.get(22).ok();
        let resolved_hsn: Option<String> = row.get(24).ok();
        let resolved_brand_name: Option<String> = row.get(25).ok();

        let final_meta = {
            let mut obj: serde_json::Value = serde_json::from_str(&raw_meta_str).unwrap_or_else(|_| serde_json::json!({}));
            if let Some(ref p) = resolved_pack {
                if !p.trim().is_empty() && (obj.get("pack").is_none() || obj["pack"].as_str().map_or(true, |s| s.is_empty())) {
                    obj["pack"] = serde_json::Value::String(p.clone());
                    obj["pack_size"] = serde_json::Value::String(p.clone());
                }
            }
            if let Some(shelf) = batch_shelf {
                if !shelf.trim().is_empty() && obj.get("shelf_id").is_none() && obj.get("shelf_location").is_none() {
                    obj["shelf_id"] = serde_json::Value::String(shelf.clone());
                    obj["shelf_location"] = serde_json::Value::String(shelf);
                }
            }
            if let Some(bno) = batch_no {
                if !bno.trim().is_empty() && obj.get("batch_no").is_none() {
                    obj["batch_no"] = serde_json::Value::String(bno);
                }
            }
            if let Some(exp_ts) = batch_exp {
                if obj.get("expiry_date").is_none() && exp_ts > 0 {
                    if let Some(dt) = chrono::DateTime::from_timestamp_millis(exp_ts) {
                        obj["expiry_date"] = serde_json::Value::String(dt.format("%m/%y").to_string());
                    }
                }
            }
            if let Some(ref hsn) = resolved_hsn {
                if !hsn.trim().is_empty() && (obj.get("hsn_sac_code").is_none() || obj["hsn_sac_code"].as_str().map_or(true, |s| s.is_empty())) {
                    obj["hsn_sac_code"] = serde_json::Value::String(hsn.clone());
                    obj["hsn"] = serde_json::Value::String(hsn.clone());
                }
            }
            if let Some(brand_mfg) = resolved_brand_name {
                if !brand_mfg.trim().is_empty() && (obj.get("mfg_by").is_none() || obj["mfg_by"].as_str().map_or(true, |s| s.is_empty())) {
                    obj["mfg_by"] = serde_json::Value::String(brand_mfg.clone());
                    obj["brand_name"] = serde_json::Value::String(brand_mfg);
                }
            }
            Some(obj.to_string())
        };

        lines.push(InvoiceLine {
            id: row.get(0).unwrap_or_default(),
            document_id: row.get(1).unwrap_or_default(),
            item_id: row.get(2).unwrap_or_default(),
            description: row.get(3).ok(),
            qty: row.get(4).unwrap_or(1.0),
            unit_price: row.get(5).unwrap_or(0.0),
            unit_cost: row.get(6).unwrap_or(0.0),
            discount_pct: row.get(7).unwrap_or(0.0),
            discount_amt: row.get(8).unwrap_or(0.0),
            tax_amount: row.get(9).unwrap_or(0.0),
            line_meta: final_meta,
            line_total: row.get(11).unwrap_or(0.0),
            sort_order: row.get(12).unwrap_or(0),
            free_qty: row.get(13).ok(),
            pack_size: resolved_pack,
            conversion_factor: row.get(15).ok(),
            landing_cost: row.get(16).ok(),
            mrp: row.get(17).ok(),
            hsn_sac_code: resolved_hsn,
            scheme_on: row.get(18).ok(),
            scheme_free: row.get(19).ok(),
            pricing_snapshot: row.get(23).ok(),
        });
    }

    let mut pay_rows = conn
        .query(
            "SELECT id, amount, currency, payment_mode, reference, payment_date, notes \
             FROM shop_document_payments \
             WHERE document_id = ? \
             ORDER BY payment_date ASC, created_at ASC",
            crate::turso_params![invoice_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut payments = Vec::new();
    while let Ok(Some(row)) = pay_rows.next().await {
        payments.push(DocumentPayment {
            id: row.get(0).unwrap_or_default(),
            amount: row.get(1).unwrap_or(0.0),
            currency: row.get(2).unwrap_or_else(|_| "INR".to_string()),
            payment_mode: row.get(3).unwrap_or_else(|_| "cash".to_string()),
            reference: row.get(4).ok(),
            payment_date: row.get(5).unwrap_or(0),
            notes: row.get(6).ok(),
        });
    }

    Ok(InvoiceWithLines { invoice, lines, payments })
}

/// Return today's profit: SUM((unit_price - unit_cost) * qty)
/// for all confirmed/paid/partial invoices created today where unit_cost was captured.
#[tauri::command]
pub async fn shop_today_profit(state: State<'_, Arc<AppState>>) -> Result<f64, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Unix timestamp for start of today (local midnight expressed in UTC seconds)
    let today_start = {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        // Subtract seconds into the current day (floor to midnight UTC)
        now - (now % 86400)
    };

    let mut rows = conn
        .query(
            "SELECT COALESCE(SUM((l.unit_price - l.unit_cost) * l.qty), 0.0) \
         FROM shop_document_lines l \
         JOIN shop_documents d ON d.id = l.document_id AND d.profile_id = l.profile_id \
         WHERE d.profile_id = ? \
           AND d.doc_type = 'invoice' \
           AND d.status IN ('confirmed', 'paid', 'partial') \
           AND d.doc_date >= ? \
           AND l.unit_cost > 0",
            crate::turso_params![profile_id, today_start],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row.get::<f64>(0).unwrap_or(0.0))
    } else {
        Ok(0.0)
    }
}

/// List all invoices for the active profile, newest first.
/// Joins shop_customers for customer_name and shop_document_payments for payment_mode.
#[tauri::command]
pub async fn shop_list_invoices(
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Invoice>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(30);
    let off = offset.unwrap_or(0);

    let mut rows = conn
        .query(
            "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.doc_number, d.doc_date, d.status, d.channel, \
         COALESCE(d.service_mode, 'dine_in') as service_mode, \
         d.subtotal, d.discount_amt, d.tax_amount, d.grand_total, d.amount_paid, d.amount_due, \
         d.profit, d.notes, d.created_at, d.updated_at, \
         c.name as customer_name, \
         (SELECT payment_mode FROM shop_document_payments \
          WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as payment_mode, \
         c.phone as customer_phone, c.email as customer_email, c.gstin as customer_gstin, \
         c.pan as customer_pan, c.billing_addr as customer_address, c.city as customer_city, \
         c.state as customer_state, c.dl_no as customer_dl_no, \
         COALESCE(c.gst_supply_type, 'regular') as customer_gst_supply_type, \
         c.country as customer_country, \
         COALESCE((SELECT name FROM shop_staff WHERE id = d.staff_id), NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, (SELECT name FROM shop_staff WHERE id = d.user_id)) as creator_name, \
         COALESCE((SELECT name FROM shop_staff WHERE id = d.modified_by), NULLIF(TRIM(COALESCE(um.first_name, '') || ' ' || COALESCE(um.last_name, '')), ''), um.username, um.email, (SELECT name FROM shop_staff WHERE id = d.updated_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email, (SELECT name FROM shop_staff WHERE id = d.staff_id)) as updater_name, \
         d.staff_id, \
         (SELECT name FROM shop_staff WHERE id = d.staff_id) as staff_name, \
         CASE WHEN COALESCE(d.is_modified, 0) = 1 OR json_extract(d.meta, '$.is_modified') = 1 OR d.notes LIKE '%Modified Bill%' THEN 1 ELSE 0 END as is_modified, \
         COALESCE(d.modified_at, json_extract(d.meta, '$.modified_at')) as modified_at, \
         d.modified_by \
         FROM shop_documents d \
         LEFT JOIN shop_customers c ON c.id = d.customer_id AND c.profile_id = d.profile_id \
         LEFT JOIN users uc ON uc.id = d.user_id \
         LEFT JOIN users uu ON uu.id = d.updated_by \
         LEFT JOIN users um ON um.id = d.modified_by \
         WHERE d.profile_id = ? AND d.doc_type = 'invoice' \
         ORDER BY d.created_at DESC LIMIT ? OFFSET ?",
            crate::turso_params![profile_id, lim, off],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut invoices = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        invoices.push(Invoice {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            user_id: row.get(2).ok(),
            updated_by: row.get(3).ok(),
            doc_number: row.get(4).unwrap_or_default(),
            doc_date: row.get(5).unwrap_or(0),
            status: row.get(6).unwrap_or_else(|_| "confirmed".to_string()),
            channel: row.get(7).unwrap_or_else(|_| "pos".to_string()),
            service_mode: row.get(8).ok(),
            subtotal: row.get(9).unwrap_or(0.0),
            discount_amt: row.get(10).unwrap_or(0.0),
            tax_amount: row.get(11).unwrap_or(0.0),
            grand_total: row.get(12).unwrap_or(0.0),
            amount_paid: row.get(13).unwrap_or(0.0),
            amount_due: row.get(14).unwrap_or(0.0),
            profit: row.get(15).unwrap_or(0.0),
            notes: row.get(16).ok(),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
            customer_name: row.get(19).ok(),
            payment_mode: row.get(20).ok(),
            customer_phone: row.get(21).ok(),
            customer_email: row.get(22).ok(),
            customer_gstin: row.get(23).ok(),
            customer_pan: row.get(24).ok(),
            customer_address: row.get(25).ok(),
            customer_city: row.get(26).ok(),
            customer_state: row.get(27).ok(),
            customer_dl_no: row.get(28).ok(),
            customer_gst_supply_type: row.get(29).ok(),
            customer_country: row.get(30).ok(),
            creator_name: row.get(31).ok(),
            updater_name: row.get(32).ok(),
            staff_id: row.get(33).ok(),
            staff_name: row.get(34).ok(),
            is_modified: row.get::<i64>(35).map(|v| v == 1).ok(),
            modified_at: row.get::<i64>(36).ok(),
            modified_by: row.get::<String>(37).ok(),
        });
    }

    Ok(invoices)
}

/// Update an existing draft, confirmed, or paid invoice.
/// Replaces all lines, recalculates totals, amounts due, and stock deltas.
/// Cancelled invoices cannot be edited.
#[tauri::command]
pub async fn shop_update_invoice(
    data: UpdateInvoiceData,
    state: State<'_, Arc<AppState>>,
) -> Result<InvoiceWithLines, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    if data.lines.is_empty() {
        return Err("Cannot save an invoice with no lines".to_string());
    }

    // 1. Load current invoice — verify it exists and is editable
    let mut doc_rows = conn
        .query(
            "SELECT status, doc_number, grand_total, amount_paid FROM shop_documents \
         WHERE id = ? AND profile_id = ?",
            crate::turso_params![data.invoice_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (current_status, doc_number, _old_total, amount_paid) =
        if let Ok(Some(row)) = doc_rows.next().await {
            let s: String = row.get(0).unwrap_or_default();
            let n: String = row.get(1).unwrap_or_default();
            let t: f64 = row.get(2).unwrap_or(0.0);
            let p: f64 = row.get(3).unwrap_or(0.0);
            (s, n, t, p)
        } else {
            return Err("Invoice not found".to_string());
        };

    if current_status == "cancelled" {
        return Err("Cancelled invoices cannot be edited".to_string());
    }

    // 2. Pre-fetch catalog metadata & tax configurations in batch
    let item_ids: Vec<String> = data.lines.iter().map(|l| l.item_id.clone()).collect();
    let catalog_meta = fetch_items_catalog_meta(&conn, &profile_id, &item_ids).await;

    // Check tax regime & global tax config
    let (tax_mode, global_rate, global_comp, store_tax_inclusive) = {
        let mut q = conn
            .query(
                "SELECT tc.tax_mode, COALESCE(tc.global_tax_rate, tr.rate_pct), COALESCE(tr.components, '{}'), COALESCE(tc.tax_inclusive, 0) \
                 FROM fin_tax_configs tc \
                 LEFT JOIN fin_tax_rates tr ON tr.id = tc.global_tax_rate_id \
                 WHERE tc.profile_id = ?1 LIMIT 1",
                crate::turso_params![profile_id.clone()],
            )
            .await
            .ok();
        if let Some(ref mut rows) = q {
            if let Ok(Some(row)) = rows.next().await {
                let tm: String = row.get(0).unwrap_or_else(|_| "item".into());
                let gr: Option<f64> = row.get(1).ok();
                let gc: String = row.get(2).unwrap_or_else(|_| "{}".into());
                let ti: i64 = row.get(3).unwrap_or(0);
                (tm, gr, gc, ti)
            } else {
                ("item".to_string(), None, "{}".to_string(), 0)
            }
        } else {
            ("item".to_string(), None, "{}".to_string(), 0)
        }
    };

    // Check customer tax exemption status
    let collect_taxes: i64 = if let Some(ref cid) = data.customer_id {
        let mut r = conn
            .query(
                "SELECT COALESCE(collect_taxes, 1) FROM shop_customers WHERE id = ? AND profile_id = ? LIMIT 1",
                crate::turso_params![cid.clone(), profile_id.clone()],
            )
            .await
            .ok();
        if let Some(ref mut rows) = r {
            if let Ok(Some(row)) = rows.next().await {
                row.get(0).unwrap_or(1)
            } else {
                1
            }
        } else {
            1
        }
    } else {
        1
    };

    // 3. Compute per-line totals + tax in-memory
    struct LineTax {
        taxable: f64,
        cgst: f64,
        sgst: f64,
        igst: f64,
    }

    let mut subtotal = 0.0_f64;
    let mut total_discount = 0.0_f64;
    let mut total_tax = 0.0_f64;
    let mut profit = 0.0_f64;
    let mut line_taxes: Vec<LineTax> = Vec::new();

    for line in &data.lines {
        let base_disc = line.discount_pct.unwrap_or(0.0);
        let extra_disc = line.extra_discount.unwrap_or(0.0);
        let disc_pct = base_disc + extra_disc;
        let disc_amt = line.unit_price * line.qty * disc_pct / 100.0;
        let line_gross = line.unit_price * line.qty - disc_amt;

        let meta = catalog_meta.get(&line.item_id);

        let tax_info: Option<(f64, String, i64)> = if collect_taxes == 0 {
            None
        } else if tax_mode == "global" {
            let is_item_taxable = if let Some(m) = meta {
                let tr_id = m.tax_rate_id.as_deref();
                let is_exempt = tr_id == Some("exempt") || tr_id == Some("nil");
                !is_exempt && (m.is_taxable == 1 || tr_id.is_none() || tr_id == Some(""))
            } else {
                true
            };

            if is_item_taxable {
                global_rate.map(|gr| (gr, global_comp.clone(), store_tax_inclusive))
            } else {
                None
            }
        } else if let Some(m) = meta {
            m.tax_rate_pct.map(|rp| {
                (
                    rp,
                    m.tax_components.clone().unwrap_or_else(|| "{}".into()),
                    m.tax_inclusive,
                )
            })
        } else {
            None
        };

        let (taxable, cgst, sgst, igst, line_tax) = if let Some((rate_pct, comp, is_inc)) = tax_info {
            let v: serde_json::Value = serde_json::from_str(&comp).unwrap_or_default();
            let cgst_v = v.get("cgst").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let sgst_v = v.get("sgst").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let igst_v = v.get("igst").and_then(|x| x.as_f64()).unwrap_or(0.0);

            if is_inc == 1 && rate_pct > 0.0 {
                let taxable_calc = (line_gross / (1.0 + rate_pct / 100.0) * 100.0).round() / 100.0;
                let tax_amt_calc = line_gross - taxable_calc;
                let cg = (tax_amt_calc * (cgst_v / rate_pct) * 100.0).round() / 100.0;
                let sg = (tax_amt_calc * (sgst_v / rate_pct) * 100.0).round() / 100.0;
                let ig = (tax_amt_calc * (igst_v / rate_pct) * 100.0).round() / 100.0;
                (taxable_calc, cg, sg, ig, tax_amt_calc)
            } else {
                let cg = (line_gross * cgst_v / 100.0 * 100.0).round() / 100.0;
                let sg = (line_gross * sgst_v / 100.0 * 100.0).round() / 100.0;
                let ig = (line_gross * igst_v / 100.0 * 100.0).round() / 100.0;
                let t_amt = cg + sg + ig;
                (line_gross, cg, sg, ig, t_amt)
            }
        } else {
            (line_gross, 0.0, 0.0, 0.0, 0.0)
        };

        subtotal += taxable;
        total_discount += disc_amt;
        total_tax += line_tax;
        line_taxes.push(LineTax {
            taxable,
            cgst,
            sgst,
            igst,
        });
    }

    let bill_disc_pct = data.bill_discount_pct.unwrap_or(0.0);
    let mut bill_disc_amt = data.bill_discount_amt.unwrap_or(0.0);
    if bill_disc_pct > 0.0 && bill_disc_amt == 0.0 {
        bill_disc_amt = (subtotal * bill_disc_pct / 100.0 * 100.0).round() / 100.0;
    }
    total_discount += bill_disc_amt;
    let grand_total = (subtotal - bill_disc_amt + total_tax).max(0.0);

    // 3.5. Capture previous quantities, prices and discounts if already confirmed (for audit trail)
    #[derive(Clone, Default)]
    struct PrevLineSnapshot {
        qty: f64,
        unit_price: f64,
        discount_pct: f64,
    }

    let mut prev_lines: std::collections::HashMap<String, PrevLineSnapshot> =
        std::collections::HashMap::new();
    let mut prev_grand_total: f64 = 0.0;
    if current_status != "draft" {
        if let Ok(mut doc_r) = conn
            .query(
                "SELECT grand_total FROM shop_documents WHERE id = ? AND profile_id = ?",
                crate::turso_params![data.invoice_id.clone(), profile_id.clone()],
            )
            .await
        {
            if let Ok(Some(row)) = doc_r.next().await {
                prev_grand_total = row.get(0).unwrap_or(0.0);
            }
        }
        if let Ok(mut prev_line_rows) = conn
            .query(
                "SELECT item_id, qty + COALESCE(free_qty, 0), unit_price, discount_pct FROM shop_document_lines WHERE document_id = ? AND profile_id = ?",
                crate::turso_params![data.invoice_id.clone(), profile_id.clone()],
            )
            .await
        {
            while let Ok(Some(row)) = prev_line_rows.next().await {
                let i_id: String = row.get(0).unwrap_or_default();
                let q: f64 = row.get(1).unwrap_or(0.0);
                let p: f64 = row.get(2).unwrap_or(0.0);
                let dp: f64 = row.get(3).unwrap_or(0.0);
                prev_lines.insert(
                    i_id,
                    PrevLineSnapshot {
                        qty: q,
                        unit_price: p,
                        discount_pct: dp,
                    },
                );
            }
        }
    }

    let now_micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let now_secs = (now_micros / 1_000_000) as i64;

    // 4. Build new lines in-memory & compute profit
    let mut db_lines = Vec::new();
    let mut batch_decrements: Vec<(String, f64)> = Vec::new();

    for (i, line) in data.lines.iter().enumerate() {
        let line_id = format!("line-{}-{}", now_micros, i);
        let base_disc = line.discount_pct.unwrap_or(0.0);
        let extra_disc = line.extra_discount.unwrap_or(0.0);
        let disc_pct = base_disc + extra_disc;
        let disc_amt = line.unit_price * line.qty * disc_pct / 100.0;
        let lt = &line_taxes[i];
        let line_tax = lt.cgst + lt.sgst + lt.igst;
        let line_grand = lt.taxable + line_tax;

        let meta = catalog_meta.get(&line.item_id);

        let mut pack_size = line.pack_size.clone();
        if pack_size.as_ref().map_or(true, |s| s.trim().is_empty()) {
            if let Some(m) = meta {
                pack_size = m.pack_size.clone();
            }
        }

        let mut hsn = line.hsn_sac_code.clone().unwrap_or_default();
        if hsn.trim().is_empty() {
            if let Some(m) = meta {
                if let Some(ref code) = m.hsn_sac_code {
                    hsn = code.clone();
                }
            }
        }

        let unit_cost = meta.map(|m| m.cost_price).unwrap_or(0.0);
        let landing_cost = line.landing_cost.unwrap_or(unit_cost);
        let mrp = line.mrp.unwrap_or(0.0);
        let free_qty = line.free_qty.unwrap_or(0.0);
        let scheme_on = line.scheme_on.unwrap_or(0.0);
        let scheme_free = line.scheme_free.unwrap_or(0.0);
        let conv_factor = line.conversion_factor.unwrap_or(1.0);

        let line_meta = {
            let raw_meta = line.line_meta.clone().unwrap_or_else(|| "{}".to_string());
            let mut meta_val: serde_json::Value =
                serde_json::from_str(&raw_meta).unwrap_or_else(|_| serde_json::json!({}));
            if let Some(ref ps) = pack_size {
                if meta_val.get("pack").is_none()
                    || meta_val["pack"].as_str().map_or(true, |s| s.is_empty())
                {
                    meta_val["pack"] = serde_json::Value::String(ps.clone());
                    meta_val["pack_size"] = serde_json::Value::String(ps.clone());
                }
            }
            if !hsn.trim().is_empty() {
                if meta_val.get("hsn_sac_code").is_none()
                    || meta_val["hsn_sac_code"].as_str().map_or(true, |s| s.is_empty())
                {
                    meta_val["hsn_sac_code"] = serde_json::Value::String(hsn.clone());
                    meta_val["hsn"] = serde_json::Value::String(hsn.clone());
                }
            }
            if let Some(ed) = line.extra_discount {
                if ed > 0.0 {
                    meta_val["extra_discount"] = serde_json::json!(ed);
                    meta_val["discount2"] = serde_json::json!(ed);
                    meta_val["dis2"] = serde_json::json!(ed);
                }
            }
            if let Some(bd) = line.discount_pct {
                meta_val["discount_pct"] = serde_json::json!(bd);
                meta_val["dis1"] = serde_json::json!(bd);
            }
            if current_status != "draft" {
                let cur_q = line.qty + free_qty;
                if let Some(prev) = prev_lines.get(&line.item_id) {
                    meta_val["original_qty"] = serde_json::json!(prev.qty);
                    if cur_q > prev.qty {
                        meta_val["increased_qty"] = serde_json::json!(cur_q - prev.qty);
                    } else if cur_q < prev.qty {
                        meta_val["reduced_qty"] = serde_json::json!(prev.qty - cur_q);
                    }
                    if (line.unit_price - prev.unit_price).abs() > 0.005 {
                        meta_val["original_price"] = serde_json::json!(prev.unit_price);
                        meta_val["new_price"] = serde_json::json!(line.unit_price);
                        meta_val["price_diff"] = serde_json::json!(line.unit_price - prev.unit_price);
                    }
                    if (disc_pct - prev.discount_pct).abs() > 0.005 {
                        meta_val["original_discount_pct"] = serde_json::json!(prev.discount_pct);
                        meta_val["new_discount_pct"] = serde_json::json!(disc_pct);
                        meta_val["discount_diff"] = serde_json::json!(disc_pct - prev.discount_pct);
                    }
                } else {
                    meta_val["is_added"] = serde_json::json!(true);
                    meta_val["original_qty"] = serde_json::json!(0.0);
                }
            }
            serde_json::to_string(&meta_val).unwrap_or(raw_meta)
        };

        if let Some(ref bid) = line.batch_id {
            if !bid.trim().is_empty() {
                batch_decrements.push((bid.clone(), line.qty + free_qty));
            }
        }

        if unit_cost > 0.0 {
            profit += (line.unit_price - unit_cost) * line.qty - disc_amt;
        }

        db_lines.push(InvoiceLine {
            id: line_id,
            document_id: data.invoice_id.clone(),
            item_id: line.item_id.clone(),
            description: Some(line.item_name.clone()),
            qty: line.qty,
            free_qty: Some(free_qty),
            pack_size,
            conversion_factor: Some(conv_factor),
            unit_price: line.unit_price,
            unit_cost,
            landing_cost: Some(landing_cost),
            mrp: Some(mrp),
            hsn_sac_code: if hsn.trim().is_empty() {
                None
            } else {
                Some(hsn.clone())
            },
            scheme_on: Some(scheme_on),
            scheme_free: Some(scheme_free),
            discount_pct: disc_pct,
            discount_amt: disc_amt,
            tax_amount: line_tax,
            line_meta: Some(line_meta),
            line_total: line_grand,
            sort_order: i as i64,
            pricing_snapshot: None,
        });
    }

    // 5. Process any initial payments provided in update payload
    let mut total_new_paid = 0.0_f64;
    let mut db_payments: Vec<DocumentPayment> = Vec::new();
    let mut payment_rows = Vec::new();
    let mut wallet_deductions: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    if let Some(ref pays) = data.payments {
        for (p_idx, p) in pays.iter().enumerate() {
            if p.amount <= 0.0 {
                continue;
            }
            let remaining_due = (grand_total - (amount_paid + total_new_paid)).max(0.0);
            let pay_amt = p.amount.min(remaining_due);
            if pay_amt <= 0.0 {
                continue;
            }
            total_new_paid += pay_amt;
            let mode = p.payment_mode.clone().unwrap_or_else(|| "cash".to_string());
            let pay_id = format!("pay-{}-{}", now_micros, p_idx);

            if mode == "wallet" || mode == "store_credit" {
                if let Some(ref cid) = data.customer_id {
                    if !cid.is_empty() {
                        *wallet_deductions.entry(cid.clone()).or_insert(0.0) += pay_amt;
                    }
                }
            }

            payment_rows.push((
                pay_id.clone(),
                profile_id.clone(),
                data.invoice_id.clone(),
                pay_amt,
                "INR".to_string(),
                mode.clone(),
                p.reference.clone(),
                p.notes.clone(),
            ));

            db_payments.push(DocumentPayment {
                id: pay_id,
                amount: pay_amt,
                currency: "INR".to_string(),
                payment_mode: mode,
                reference: p.reference.clone(),
                payment_date: now_secs,
                notes: p.notes.clone(),
            });
        }
    }

    let final_paid = amount_paid + total_new_paid;
    let new_due = (grand_total - final_paid).max(0.0);
    let status_req = data.status.as_deref();
    let new_status = if let Some(s) = status_req {
        s
    } else if final_paid <= 0.0 {
        current_status.as_str() // keep draft/confirmed
    } else if new_due <= 0.005 {
        "paid"
    } else {
        "partial"
    };

    // 6. Delete old lines and batch insert new lines
    conn.execute(
        "DELETE FROM shop_document_lines WHERE document_id = ? AND profile_id = ?",
        crate::turso_params![data.invoice_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    if !db_lines.is_empty() {
        let placeholders = (0..db_lines.len())
            .map(|_| "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .collect::<Vec<_>>()
            .join(", ");
        let lines_sql = format!(
            "INSERT INTO shop_document_lines \
             (id, profile_id, document_id, item_id, batch_id, description, hsn_sac_code, \
              qty, free_qty, pack_size, conversion_factor, unit_price, unit_cost, landing_cost, mrp, \
              scheme_on, scheme_free, discount_pct, discount_amt, taxable_amt, tax_amount, line_meta, line_total, sort_order) \
             VALUES {}",
            placeholders
        );

        let mut line_params: Vec<crate::db::turso::TursoParam> = Vec::new();
        for l in &db_lines {
            line_params.push(l.id.clone().into());
            line_params.push(profile_id.clone().into());
            line_params.push(l.document_id.clone().into());
            line_params.push(l.item_id.clone().into());
            let orig_batch = data
                .lines
                .get(l.sort_order as usize)
                .and_then(|ol| ol.batch_id.clone());
            line_params.push(orig_batch.into());
            line_params.push(l.description.clone().into());
            line_params.push(l.hsn_sac_code.clone().into());
            line_params.push(l.qty.into());
            line_params.push(l.free_qty.into());
            line_params.push(l.pack_size.clone().into());
            line_params.push(l.conversion_factor.into());
            line_params.push(l.unit_price.into());
            line_params.push(l.unit_cost.into());
            line_params.push(l.landing_cost.into());
            line_params.push(l.mrp.into());
            line_params.push(l.scheme_on.into());
            line_params.push(l.scheme_free.into());
            line_params.push(l.discount_pct.into());
            line_params.push(l.discount_amt.into());
            let lt = &line_taxes[l.sort_order as usize];
            line_params.push(lt.taxable.into());
            line_params.push(l.tax_amount.into());
            line_params.push(l.line_meta.clone().into());
            line_params.push(l.line_total.into());
            line_params.push(l.sort_order.into());
        }

        conn.execute(&lines_sql, line_params)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 7. Batch insert payments (if any)
    if !payment_rows.is_empty() {
        let pay_placeholders = (0..payment_rows.len())
            .map(|_| "(?, ?, ?, ?, ?, ?, ?, ?)")
            .collect::<Vec<_>>()
            .join(", ");
        let pay_sql = format!(
            "INSERT INTO shop_document_payments \
             (id, profile_id, document_id, amount, currency, payment_mode, reference, notes) \
             VALUES {}",
            pay_placeholders
        );

        let mut pay_params: Vec<crate::db::turso::TursoParam> = Vec::new();
        for r in &payment_rows {
            pay_params.push(r.0.clone().into());
            pay_params.push(r.1.clone().into());
            pay_params.push(r.2.clone().into());
            pay_params.push(r.3.into());
            pay_params.push(r.4.clone().into());
            pay_params.push(r.5.clone().into());
            pay_params.push(r.6.clone().into());
            pay_params.push(r.7.clone().into());
        }
        let _ = conn.execute(&pay_sql, pay_params).await;

        for (cid, amt) in wallet_deductions {
            let _ = conn.execute(
                "UPDATE shop_customers SET wallet_balance = MAX(0.0, COALESCE(wallet_balance, 0.0) - ?1), updated_at = strftime('%s','now') WHERE id = ?2 AND profile_id = ?3",
                crate::turso_params![amt, cid.clone(), profile_id.clone()],
            ).await;

            let ledger_id = format!("crd-{}-{}", now_micros, cid);
            let note_text = format!("Wallet/Store Credit payment for invoice {}", doc_number);
            let _ = conn.execute(
                "INSERT INTO shop_customer_credit_ledger \
                 (id, profile_id, customer_id, entry_type, amount, balance_after, document_id, notes, created_at) \
                 SELECT ?, ?, ?, 'redeem', ?, wallet_balance, ?, ?, strftime('%s','now') FROM shop_customers WHERE id = ? AND profile_id = ?",
                crate::turso_params![
                    ledger_id,
                    profile_id.clone(),
                    cid.clone(),
                    -amt,
                    data.invoice_id.clone(),
                    note_text,
                    cid.clone(),
                    profile_id.clone()
                ],
            ).await;
        }
    }

    // 8. Update document header
    let channel = data.channel.unwrap_or_else(|| "pos".to_string());
    let active_uid = state.get_current_user_id().await;
    let active_uid_opt = if active_uid.trim().is_empty() {
        None
    } else {
        Some(active_uid.clone())
    };
    let modifier_id = data.staff_id.clone().or_else(|| active_uid_opt.clone());
    let updated_by = data.updated_by.or_else(|| modifier_id.clone());
    let effective_modifier = modifier_id.or_else(|| updated_by.clone());

    let mut has_line_changes = false;
    if current_status != "draft" && !prev_lines.is_empty() {
        if (grand_total - prev_grand_total).abs() > 0.005 {
            has_line_changes = true;
        } else if data.lines.len() != prev_lines.len() {
            has_line_changes = true;
        } else {
            for l in &data.lines {
                let total_q = l.qty + l.free_qty.unwrap_or(0.0);
                let d_pct = l.discount_pct.unwrap_or(0.0) + l.extra_discount.unwrap_or(0.0);
                if let Some(prev) = prev_lines.get(&l.item_id) {
                    if (total_q - prev.qty).abs() > 0.001
                        || (l.unit_price - prev.unit_price).abs() > 0.005
                        || (d_pct - prev.discount_pct).abs() > 0.005
                    {
                        has_line_changes = true;
                        break;
                    }
                } else {
                    has_line_changes = true;
                    break;
                }
            }
        }
    }

    let is_mod_val = if current_status != "draft" && has_line_changes {
        1
    } else {
        0
    };

    conn.execute(
        "UPDATE shop_documents \
         SET subtotal = ?, discount_amt = ?, taxable_amt = ?, tax_amount = ?, \
             grand_total = ?, amount_paid = ?, amount_due = ?, status = ?, profit = ?, \
             channel = ?, service_mode = COALESCE(?, service_mode), notes = ?, customer_id = ?, vendor_id = ?, staff_id = COALESCE(?, staff_id), updated_by = ?, \
             is_modified = CASE WHEN ? = 1 THEN 1 ELSE is_modified END, \
             modified_at = CASE WHEN ? = 1 THEN strftime('%s','now') ELSE modified_at END, \
             modified_by = CASE WHEN ? = 1 THEN ? ELSE modified_by END, \
             meta = CASE WHEN ? = 1 THEN json_set(COALESCE(NULLIF(meta, ''), '{}'), '$.is_modified', 1, '$.modified_at', strftime('%s','now'), '$.modified_by', ?) ELSE meta END, \
             updated_at = strftime('%s','now') \
         WHERE id = ? AND profile_id = ?",
        crate::turso_params![
            subtotal,
            total_discount,
            subtotal,
            total_tax,
            grand_total,
            final_paid,
            new_due,
            new_status,
            profit,
            channel.clone(),
            data.service_mode.clone(),
            data.notes.clone(),
            data.customer_id.clone(),
            data.vendor_id.clone(),
            data.staff_id.clone(),
            updated_by.clone(),
            is_mod_val,
            is_mod_val,
            is_mod_val,
            effective_modifier.clone(),
            is_mod_val,
            effective_modifier.clone().unwrap_or_default(),
            data.invoice_id.clone(),
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Auto-post to double-entry ledger if confirmed/paid
    if new_status == "confirmed" || new_status == "paid" || new_status == "partial" {
        let _ = post_document_to_journal(&conn, &profile_id, &data.invoice_id).await;
    } else {
        // If invoice is changed to draft or cancelled, delete any auto journal entries that were previously posted
        let _ = conn.execute(
            "DELETE FROM fin_journal_lines WHERE entry_id IN (SELECT id FROM fin_journal_entries WHERE profile_id = ?1 AND document_id = ?2)",
            crate::turso_params![profile_id.clone(), data.invoice_id.clone()],
        ).await;
        let _ = conn.execute(
            "DELETE FROM fin_journal_entries WHERE profile_id = ?1 AND document_id = ?2",
            crate::turso_params![profile_id.clone(), data.invoice_id.clone()],
        ).await;
    }

    // 9. Manage stock ledger for confirmed sales
    if new_status != "draft" {
        // Decrement batch quantities
        for (bid, qty) in &batch_decrements {
            let _ = conn
                .execute(
                    "UPDATE shop_item_batches SET qty_remaining = MAX(0, qty_remaining - ?1) WHERE id = ?2 AND profile_id = ?3",
                    crate::turso_params![*qty, bid.clone(), profile_id.clone()],
                )
                .await;
        }

        let default_wh: Option<String> = {
            let mut wh_rows = conn
                .query(
                    "SELECT id FROM shop_warehouses WHERE profile_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1",
                    crate::turso_params![profile_id.clone()],
                )
                .await
                .ok();
            let found = if let Some(ref mut r) = wh_rows {
                if let Ok(Some(row)) = r.next().await {
                    while r.next().await.map(|r| r.is_some()).unwrap_or(false) {}
                    row.get::<String>(0).ok()
                } else {
                    None
                }
            } else {
                None
            };
            if found.is_some() {
                found
            } else {
                let mut any_rows = conn
                    .query(
                        "SELECT id FROM shop_warehouses WHERE profile_id = ? AND is_active = 1 ORDER BY name ASC LIMIT 1",
                        crate::turso_params![profile_id.clone()],
                    )
                    .await
                    .ok();
                if let Some(ref mut r) = any_rows {
                    if let Ok(Some(row)) = r.next().await {
                        while r.next().await.map(|r| r.is_some()).unwrap_or(false) {}
                        row.get::<String>(0).ok()
                    } else {
                        let fallback_id = format!("{}_main", profile_id);
                        let _ = conn.execute(
                            "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) \
                             VALUES (?1, ?2, 'Main Warehouse', 'store', 1, 1) \
                             ON CONFLICT(id) DO UPDATE SET is_active = 1",
                            crate::turso_params![fallback_id.clone(), profile_id.clone()]
                        ).await;
                        Some(fallback_id)
                    }
                } else {
                    None
                }
            }
        };

        if let Some(wh_id) = default_wh {
            if current_status == "draft" {
                // First time confirmed: record regular 'sale' deductions
                let mut tracked_items = Vec::new();
                for line in &data.lines {
                    let meta = catalog_meta.get(&line.item_id);
                    let is_service = meta.map(|m| m.item_type == "service").unwrap_or(false);
                    let track = if is_service {
                        0
                    } else {
                        meta.map(|m| m.track_inventory).unwrap_or(1)
                    };
                    if track == 1 {
                        let total_qty = line.qty + line.free_qty.unwrap_or(0.0);
                        let cost = line
                            .landing_cost
                            .unwrap_or_else(|| meta.map(|m| m.cost_price).unwrap_or(0.0));
                        tracked_items.push((line.item_id.clone(), total_qty, cost));
                    }
                }

                if !tracked_items.is_empty() {
                    let tracked_ids: Vec<String> =
                        tracked_items.iter().map(|(id, _, _)| id.clone()).collect();
                    let placeholders = (0..tracked_ids.len())
                        .map(|_| "?")
                        .collect::<Vec<_>>()
                        .join(", ");

                    let mut track_params: Vec<crate::db::turso::TursoParam> = Vec::new();
                    track_params.push(profile_id.clone().into());
                    for id in &tracked_ids {
                        track_params.push(id.clone().into());
                    }
                    let _ = conn
                        .execute(
                            &format!(
                                "UPDATE shop_items SET track_inventory = 1 \
                                 WHERE profile_id = ? AND id IN ({}) AND (track_inventory = 0 OR track_inventory IS NULL)",
                                placeholders
                            ),
                            track_params,
                        )
                        .await;

                    for (item_id, qty, _) in &tracked_items {
                        let _ = conn
                            .execute(
                                "UPDATE shop_item_variants SET stock_qty = MAX(0, stock_qty - ?1) WHERE id = ?2 AND profile_id = ?3",
                                crate::turso_params![*qty, item_id.clone(), profile_id.clone()],
                            )
                            .await;
                    }

                    let mut bal_params: Vec<crate::db::turso::TursoParam> = Vec::new();
                    bal_params.push(profile_id.clone().into());
                    bal_params.push(wh_id.clone().into());
                    for id in &tracked_ids {
                        bal_params.push(id.clone().into());
                    }

                    let mut balances: std::collections::HashMap<String, f64> =
                        std::collections::HashMap::new();
                    if let Ok(mut bal_rows) = conn
                        .query(
                            &format!(
                                "SELECT item_id, COALESCE(SUM(qty_in) - SUM(qty_out), 0.0) \
                                 FROM shop_stock_ledger \
                                 WHERE profile_id = ? AND warehouse_id = ? AND item_id IN ({}) \
                                 GROUP BY item_id",
                                placeholders
                            ),
                            bal_params,
                        )
                        .await
                    {
                        while let Ok(Some(row)) = bal_rows.next().await {
                            let i_id: String = row.get(0).unwrap_or_default();
                            let bal: f64 = row.get(1).unwrap_or(0.0);
                            balances.insert(i_id, bal);
                        }
                    }

                    let sl_placeholders = (0..tracked_items.len())
                        .map(|_| "(?, ?, ?, ?, 'sale', 0, ?, ?, ?, ?, 'POS Sale')")
                        .collect::<Vec<_>>()
                        .join(", ");
                    let sl_sql = format!(
                        "INSERT INTO shop_stock_ledger \
                         (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost, document_id, notes) \
                         VALUES {}",
                        sl_placeholders
                    );

                    let mut sl_params: Vec<crate::db::turso::TursoParam> = Vec::new();
                    for (idx, (item_id, total_qty, cost)) in tracked_items.iter().enumerate() {
                        let sl_id = format!("sl-{}-{}", now_micros, idx);
                        let current_bal = balances.get(item_id).copied().unwrap_or(0.0);
                        let new_bal = current_bal - *total_qty;
                        balances.insert(item_id.clone(), new_bal);

                        sl_params.push(sl_id.into());
                        sl_params.push(profile_id.clone().into());
                        sl_params.push(item_id.clone().into());
                        sl_params.push(wh_id.clone().into());
                        sl_params.push((*total_qty).into());
                        sl_params.push(new_bal.into());
                        sl_params.push((*cost).into());
                        sl_params.push(data.invoice_id.clone().into());
                    }

                    let _ = conn.execute(&sl_sql, sl_params).await;
                }
            } else {
                // Document was already confirmed/paid/partial: compute item-by-item delta
                let mut new_quantities: std::collections::HashMap<String, f64> =
                    std::collections::HashMap::new();
                let mut item_costs: std::collections::HashMap<String, f64> =
                    std::collections::HashMap::new();
                for line in &data.lines {
                    let q = line.qty + line.free_qty.unwrap_or(0.0);
                    *new_quantities.entry(line.item_id.clone()).or_insert(0.0) += q;
                    if let Some(c) = line.landing_cost {
                        item_costs.insert(line.item_id.clone(), c);
                    }
                }

                let mut all_item_ids: std::collections::BTreeSet<String> =
                    std::collections::BTreeSet::new();
                for id in new_quantities.keys() {
                    all_item_ids.insert(id.clone());
                }
                for id in prev_lines.keys() {
                    all_item_ids.insert(id.clone());
                }

                for item_id in all_item_ids {
                    let old_qty = prev_lines.get(&item_id).map(|s| s.qty).unwrap_or(0.0);
                    let new_qty = new_quantities.get(&item_id).copied().unwrap_or(0.0);
                    let delta = new_qty - old_qty;

                    if delta.abs() < 1e-6 {
                        continue;
                    }

                    let meta = catalog_meta.get(&item_id);
                    let is_service = meta.map(|m| m.item_type == "service").unwrap_or(false);
                    let track = if is_service {
                        0
                    } else {
                        meta.map(|m| m.track_inventory).unwrap_or(1)
                    };

                    if track == 1 {
                        let _ = conn
                            .execute(
                                "UPDATE shop_items SET track_inventory = 1 WHERE id = ?1 AND profile_id = ?2 AND (track_inventory = 0 OR track_inventory IS NULL)",
                                crate::turso_params![item_id.clone(), profile_id.clone()],
                            )
                            .await;

                        let cost: f64 = if let Some(c) = item_costs.get(&item_id) {
                            *c
                        } else {
                            meta.map(|m| m.cost_price).unwrap_or(0.0)
                        };

                        if delta > 0.0 {
                            // Extra items sold in modified bill
                            let _ = conn
                                .execute(
                                    "UPDATE shop_item_variants SET stock_qty = MAX(0, stock_qty - ?1) WHERE id = ?2 AND profile_id = ?3",
                                    crate::turso_params![delta, item_id.clone(), profile_id.clone()],
                                )
                                .await;

                            let mut bal_rows = conn
                                .query(
                                    "SELECT COALESCE(SUM(qty_in) - SUM(qty_out), 0) \
                                 FROM shop_stock_ledger WHERE item_id = ? AND warehouse_id = ?",
                                    crate::turso_params![item_id.clone(), wh_id.clone()],
                                )
                                .await;
                            let balance: f64 = if let Ok(ref mut r) = bal_rows {
                                if let Ok(Some(row)) = r.next().await {
                                    while r.next().await.map(|r| r.is_some()).unwrap_or(false) {}
                                    row.get::<f64>(0).unwrap_or(0.0)
                                } else {
                                    0.0
                                }
                            } else {
                                0.0
                            };

                            let sl_id = new_id("sl");
                            let _ = conn
                                .execute(
                                    "INSERT INTO shop_stock_ledger \
                                 (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost, document_id, notes) \
                                 VALUES (?, ?, ?, ?, 'sale', 0, ?, ?, ?, ?, 'Modified Bill — extra qty deducted')",
                                    crate::turso_params![
                                        sl_id,
                                        profile_id.clone(),
                                        item_id.clone(),
                                        wh_id.clone(),
                                        delta,
                                        balance - delta,
                                        cost,
                                        data.invoice_id.clone()
                                    ],
                                )
                                .await;
                        } else if delta < 0.0 {
                            // Reduced qty or removed item returned in modified bill
                            let restock = -delta;
                            let _ = conn
                                .execute(
                                    "UPDATE shop_item_variants SET stock_qty = stock_qty + ?1 WHERE id = ?2 AND profile_id = ?3",
                                    crate::turso_params![restock, item_id.clone(), profile_id.clone()],
                                )
                                .await;

                            let mut bal_rows = conn
                                .query(
                                    "SELECT COALESCE(SUM(qty_in) - SUM(qty_out), 0) \
                                 FROM shop_stock_ledger WHERE item_id = ? AND warehouse_id = ?",
                                    crate::turso_params![item_id.clone(), wh_id.clone()],
                                )
                                .await;
                            let balance: f64 = if let Ok(ref mut r) = bal_rows {
                                if let Ok(Some(row)) = r.next().await {
                                    while r.next().await.map(|r| r.is_some()).unwrap_or(false) {}
                                    row.get::<f64>(0).unwrap_or(0.0)
                                } else {
                                    0.0
                                }
                            } else {
                                0.0
                            };

                            let note = if new_qty == 0.0 {
                                "Modified Bill — item removed, restocked"
                            } else {
                                "Modified Bill — reduced qty restocked"
                            };

                            let sl_id = new_id("sl");
                            let _ = conn
                                .execute(
                                    "INSERT INTO shop_stock_ledger \
                                 (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost, document_id, notes) \
                                 VALUES (?, ?, ?, ?, 'return', ?, 0, ?, ?, ?, ?)",
                                    crate::turso_params![
                                        sl_id,
                                        profile_id.clone(),
                                        item_id.clone(),
                                        wh_id.clone(),
                                        restock,
                                        balance + restock,
                                        cost,
                                        data.invoice_id.clone(),
                                        note
                                    ],
                                )
                                .await;
                        }
                    }
                }
            }
        }
    }

    // 10. Re-fetch enriched invoice header to return
    let mut hdr = conn
        .query(
            "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.doc_number, d.doc_date, d.status, d.channel, \
         COALESCE(d.service_mode, 'dine_in') as service_mode, \
         d.subtotal, d.discount_amt, d.tax_amount, d.grand_total, d.amount_paid, d.amount_due, \
         d.profit, d.notes, d.created_at, d.updated_at, \
         c.name as customer_name, \
         (SELECT payment_mode FROM shop_document_payments \
          WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as payment_mode, \
         c.phone as customer_phone, c.email as customer_email, c.gstin as customer_gstin, \
         c.pan as customer_pan, c.billing_addr as customer_address, c.city as customer_city, \
         c.state as customer_state, c.dl_no as customer_dl_no, \
         COALESCE(c.gst_supply_type, 'regular') as customer_gst_supply_type, \
         c.country as customer_country, \
         COALESCE((SELECT name FROM shop_staff WHERE id = d.staff_id), NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, (SELECT name FROM shop_staff WHERE id = d.user_id)) as creator_name, \
         COALESCE((SELECT name FROM shop_staff WHERE id = d.modified_by), NULLIF(TRIM(COALESCE(um.first_name, '') || ' ' || COALESCE(um.last_name, '')), ''), um.username, um.email, (SELECT name FROM shop_staff WHERE id = d.updated_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email, (SELECT name FROM shop_staff WHERE id = d.staff_id)) as updater_name, \
         d.staff_id, \
         (SELECT name FROM shop_staff WHERE id = d.staff_id) as staff_name, \
         CASE WHEN COALESCE(d.is_modified, 0) = 1 OR json_extract(d.meta, '$.is_modified') = 1 OR d.notes LIKE '%Modified Bill%' THEN 1 ELSE 0 END as is_modified, \
         COALESCE(d.modified_at, json_extract(d.meta, '$.modified_at')) as modified_at, \
         d.modified_by \
         FROM shop_documents d \
         LEFT JOIN shop_customers c ON c.id = d.customer_id AND c.profile_id = d.profile_id \
         LEFT JOIN users uc ON uc.id = d.user_id \
         LEFT JOIN users uu ON uu.id = d.updated_by \
         LEFT JOIN users um ON um.id = d.modified_by \
         WHERE d.id = ? AND d.profile_id = ?",
            crate::turso_params![data.invoice_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let invoice = if let Ok(Some(row)) = hdr.next().await {
        Invoice {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            user_id: row.get(2).ok(),
            updated_by: row.get(3).ok(),
            doc_number: row.get(4).unwrap_or(doc_number),
            doc_date: row.get(5).unwrap_or(0),
            status: row.get(6).unwrap_or_else(|_| new_status.to_string()),
            channel: row.get(7).unwrap_or_else(|_| "pos".to_string()),
            service_mode: row.get(8).ok(),
            subtotal: row.get(9).unwrap_or(subtotal),
            discount_amt: row.get(10).unwrap_or(total_discount),
            tax_amount: row.get(11).unwrap_or(total_tax),
            grand_total: row.get(12).unwrap_or(grand_total),
            amount_paid: row.get(13).unwrap_or(final_paid),
            amount_due: row.get(14).unwrap_or(new_due),
            profit: row.get(15).unwrap_or(profit),
            notes: row.get(16).ok(),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
            customer_name: row.get(19).ok(),
            payment_mode: row.get(20).ok(),
            customer_phone: row.get(21).ok(),
            customer_email: row.get(22).ok(),
            customer_gstin: row.get(23).ok(),
            customer_pan: row.get(24).ok(),
            customer_address: row.get(25).ok(),
            customer_city: row.get(26).ok(),
            customer_state: row.get(27).ok(),
            customer_dl_no: row.get(28).ok(),
            customer_gst_supply_type: row.get(29).ok(),
            customer_country: row.get(30).ok(),
            creator_name: row.get(31).ok(),
            updater_name: row.get(32).ok(),
            staff_id: row.get(33).ok(),
            staff_name: row.get(34).ok(),
            is_modified: row.get::<i64>(35).map(|v| v == 1).ok(),
            modified_at: row.get::<i64>(36).ok(),
            modified_by: row.get::<String>(37).ok(),
        }
    } else {
        return Err("Invoice not found after update".to_string());
    };

    // If linked to a sales order, mark the sales order as invoiced
    if let Some(ref so_id) = data.sales_order_id {
        if !so_id.trim().is_empty() {
            let _ = conn
                .execute(
                    "UPDATE shop_documents SET status = 'invoiced', updated_at = (strftime('%s','now')) WHERE id = ?1 AND profile_id = ?2",
                    crate::turso_params![so_id.clone(), profile_id.clone()],
                )
                .await;
        }
    }

    Ok(InvoiceWithLines {
        invoice,
        lines: db_lines,
        payments: db_payments,
    })
}

#[tauri::command]
pub async fn shop_open_pdf(file_name: String, base64_data: String) -> Result<String, String> {
    use base64::Engine;
    use std::io::Write;

    let clean_data = if let Some(idx) = base64_data.find(',') {
        &base64_data[idx + 1..]
    } else {
        &base64_data
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(clean_data.trim())
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let temp_dir = std::env::temp_dir();
    let safe_name = if file_name.ends_with(".pdf") {
        file_name
    } else {
        format!("{}.pdf", file_name)
    };
    let file_path = temp_dir.join(&safe_name);

    let mut file = std::fs::File::create(&file_path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;

    let path_str = file_path.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open PDF on macOS: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn()
            .map_err(|e| format!("Failed to open PDF on Windows: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open PDF on Linux: {}", e))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = open::that(&path_str);
    }

    Ok(path_str)
}

#[derive(Debug, serde::Serialize)]
pub struct DownloadPdfResult {
    pub file_path: String,
    pub file_name: String,
    pub directory: String,
}

#[tauri::command]
pub async fn shop_download_pdf(file_name: String, base64_data: String) -> Result<DownloadPdfResult, String> {
    use base64::Engine;
    use std::io::Write;

    let clean_data = if let Some(idx) = base64_data.find(',') {
        &base64_data[idx + 1..]
    } else {
        &base64_data
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(clean_data.trim())
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    if bytes.is_empty() {
        return Err("Decoded PDF data is empty (0 bytes)".to_string());
    }

    let safe_name = if file_name.ends_with(".pdf") {
        file_name
    } else {
        format!("{}.pdf", file_name)
    };

    // Find best download directory based on OS
    let download_dir = {
        #[cfg(target_os = "android")]
        {
            let primary = std::path::PathBuf::from("/storage/emulated/0/Download");
            if primary.exists() && primary.is_dir() {
                primary
            } else {
                let fallback = std::path::PathBuf::from("/sdcard/Download");
                if fallback.exists() && fallback.is_dir() {
                    fallback
                } else {
                    dirs::download_dir().unwrap_or_else(|| std::env::temp_dir())
                }
            }
        }
        #[cfg(not(target_os = "android"))]
        {
            dirs::download_dir().unwrap_or_else(|| std::env::temp_dir())
        }
    };

    let _ = std::fs::create_dir_all(&download_dir);

    // Prevent overwriting existing files: auto-increment e.g. "INV-001 (1).pdf"
    let base_stem = if let Some(stem) = safe_name.strip_suffix(".pdf") {
        stem
    } else {
        &safe_name
    };

    let mut final_name = safe_name.clone();
    let mut file_path = download_dir.join(&final_name);
    let mut counter = 1;

    while file_path.exists() {
        final_name = format!("{} ({}).pdf", base_stem, counter);
        file_path = download_dir.join(&final_name);
        counter += 1;
    }

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Failed to save PDF to {}: {}", file_path.display(), e))?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;

    let path_str = file_path.to_string_lossy().to_string();
    let dir_str = download_dir.to_string_lossy().to_string();

    Ok(DownloadPdfResult {
        file_path: path_str,
        file_name: final_name,
        directory: dir_str,
    })
}

#[tauri::command]
pub async fn shop_open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}

// ══════════════════════════════════════════════════════════════════════════════
// B2B WHOLESALE & SALES ORDERS
// ══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub async fn shop_list_sales_orders(
    status_filter: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Invoice>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(30);
    let off = offset.unwrap_or(0);

    let filter_active = status_filter
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && *s != "all");

    let mut rows = match filter_active {
        Some(st) => {
            conn.query(
                "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.doc_number, d.doc_date, d.status, d.channel, \
                 COALESCE(d.service_mode, 'delivery') as service_mode, \
                 d.subtotal, d.discount_amt, d.tax_amount, d.grand_total, d.amount_paid, d.amount_due, \
                 d.profit, d.notes, d.created_at, d.updated_at, \
                 c.name as customer_name, \
                 (SELECT payment_mode FROM shop_document_payments \
                  WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as payment_mode, \
                 c.phone as customer_phone, c.email as customer_email, c.gstin as customer_gstin, \
                 c.pan as customer_pan, c.billing_addr as customer_address, c.city as customer_city, \
                 c.state as customer_state, c.dl_no as customer_dl_no, \
                 COALESCE(c.gst_supply_type, 'regular') as customer_gst_supply_type, \
                 c.country as customer_country, \
                 COALESCE((SELECT name FROM shop_staff WHERE id = d.staff_id), NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, (SELECT name FROM shop_staff WHERE id = d.user_id)) as creator_name, \
                 COALESCE((SELECT name FROM shop_staff WHERE id = d.modified_by), NULLIF(TRIM(COALESCE(um.first_name, '') || ' ' || COALESCE(um.last_name, '')), ''), um.username, um.email, (SELECT name FROM shop_staff WHERE id = d.updated_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email, (SELECT name FROM shop_staff WHERE id = d.staff_id)) as updater_name, \
                 d.staff_id, \
                 (SELECT name FROM shop_staff WHERE id = d.staff_id) as staff_name, \
                 CASE WHEN COALESCE(d.is_modified, 0) = 1 OR json_extract(d.meta, '$.is_modified') = 1 OR d.notes LIKE '%Modified Bill%' THEN 1 ELSE 0 END as is_modified, \
                 COALESCE(d.modified_at, json_extract(d.meta, '$.modified_at')) as modified_at, \
                 d.modified_by \
                 FROM shop_documents d \
                 LEFT JOIN shop_customers c ON c.id = d.customer_id AND c.profile_id = d.profile_id \
                 LEFT JOIN users uc ON uc.id = d.user_id \
                 LEFT JOIN users uu ON uu.id = d.updated_by \
                 LEFT JOIN users um ON um.id = d.modified_by \
                 WHERE d.profile_id = ?1 AND (d.doc_type IN ('sales_order', 'order') OR (d.channel = 'online' AND d.doc_type != 'invoice')) AND d.status = ?2 \
                 ORDER BY d.created_at DESC LIMIT ?3 OFFSET ?4",
                crate::turso_params![profile_id, st.to_string(), lim, off],
            )
            .await
            .map_err(|e| e.to_string())?
        }
        None => {
            conn.query(
                "SELECT d.id, d.profile_id, d.user_id, d.updated_by, d.doc_number, d.doc_date, d.status, d.channel, \
                 COALESCE(d.service_mode, 'delivery') as service_mode, \
                 d.subtotal, d.discount_amt, d.tax_amount, d.grand_total, d.amount_paid, d.amount_due, \
                 d.profit, d.notes, d.created_at, d.updated_at, \
                 c.name as customer_name, \
                 (SELECT payment_mode FROM shop_document_payments \
                  WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as payment_mode, \
                 c.phone as customer_phone, c.email as customer_email, c.gstin as customer_gstin, \
                 c.pan as customer_pan, c.billing_addr as customer_address, c.city as customer_city, \
                 c.state as customer_state, c.dl_no as customer_dl_no, \
                 COALESCE(c.gst_supply_type, 'regular') as customer_gst_supply_type, \
                 c.country as customer_country, \
                 COALESCE(NULLIF(TRIM(COALESCE(uc.first_name, '') || ' ' || COALESCE(uc.last_name, '')), ''), uc.username, uc.email, (SELECT name FROM shop_staff WHERE id = d.user_id)) as creator_name, \
                 COALESCE(NULLIF(TRIM(COALESCE(um.first_name, '') || ' ' || COALESCE(um.last_name, '')), ''), um.username, um.email, (SELECT name FROM shop_staff WHERE id = d.modified_by), NULLIF(TRIM(COALESCE(uu.first_name, '') || ' ' || COALESCE(uu.last_name, '')), ''), uu.username, uu.email, (SELECT name FROM shop_staff WHERE id = d.updated_by)) as updater_name, \
                 d.staff_id, \
                 (SELECT name FROM shop_staff WHERE id = d.staff_id) as staff_name, \
                 CASE WHEN COALESCE(d.is_modified, 0) = 1 OR json_extract(d.meta, '$.is_modified') = 1 OR d.notes LIKE '%Modified Bill%' THEN 1 ELSE 0 END as is_modified, \
                 COALESCE(d.modified_at, json_extract(d.meta, '$.modified_at')) as modified_at, \
                 d.modified_by \
                 FROM shop_documents d \
                 LEFT JOIN shop_customers c ON c.id = d.customer_id AND c.profile_id = d.profile_id \
                 LEFT JOIN users uc ON uc.id = d.user_id \
                 LEFT JOIN users uu ON uu.id = d.updated_by \
                 LEFT JOIN users um ON um.id = d.modified_by \
                 WHERE d.profile_id = ?1 AND (d.doc_type IN ('sales_order', 'order') OR (d.channel = 'online' AND d.doc_type != 'invoice')) \
                 ORDER BY d.created_at DESC LIMIT ?2 OFFSET ?3",
                crate::turso_params![profile_id, lim, off],
            )
            .await
            .map_err(|e| e.to_string())?
        }
    };

    let mut orders = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        orders.push(Invoice {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            user_id: row.get(2).ok(),
            updated_by: row.get(3).ok(),
            doc_number: row.get(4).unwrap_or_default(),
            doc_date: row.get(5).unwrap_or(0),
            status: row.get(6).unwrap_or_else(|_| "pending_approval".to_string()),
            channel: row.get(7).unwrap_or_else(|_| "online".to_string()),
            service_mode: row.get(8).ok(),
            subtotal: row.get(9).unwrap_or(0.0),
            discount_amt: row.get(10).unwrap_or(0.0),
            tax_amount: row.get(11).unwrap_or(0.0),
            grand_total: row.get(12).unwrap_or(0.0),
            amount_paid: row.get(13).unwrap_or(0.0),
            amount_due: row.get(14).unwrap_or(0.0),
            profit: row.get(15).unwrap_or(0.0),
            notes: row.get(16).ok(),
            created_at: row.get(17).unwrap_or(0),
            updated_at: row.get(18).unwrap_or(0),
            customer_name: row.get(19).ok(),
            payment_mode: row.get(20).ok(),
            customer_phone: row.get(21).ok(),
            customer_email: row.get(22).ok(),
            customer_gstin: row.get(23).ok(),
            customer_pan: row.get(24).ok(),
            customer_address: row.get(25).ok(),
            customer_city: row.get(26).ok(),
            customer_state: row.get(27).ok(),
            customer_dl_no: row.get(28).ok(),
            customer_gst_supply_type: row.get(29).ok(),
            customer_country: row.get(30).ok(),
            creator_name: row.get(31).ok(),
            updater_name: row.get(32).ok(),
            staff_id: row.get(33).ok(),
            staff_name: row.get(34).ok(),
            is_modified: row.get::<i64>(35).map(|v| v == 1).ok(),
            modified_at: row.get::<i64>(36).ok(),
            modified_by: row.get::<String>(37).ok(),
        });
    }

    Ok(orders)
}

#[derive(Debug, Deserialize)]
pub struct ConvertSalesOrderData {
    pub order_id: String,
    pub lines: Vec<BillLine>,
    pub notes: Option<String>,
    pub bill_discount_pct: Option<f64>,
    pub bill_discount_amt: Option<f64>,
}

#[tauri::command]
pub async fn shop_convert_sales_order_to_invoice(
    data: ConvertSalesOrderData,
    state: State<'_, Arc<AppState>>,
) -> Result<InvoiceWithLines, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Verify order exists
    let mut order_row = conn
        .query(
            "SELECT customer_id, notes FROM shop_documents WHERE id = ? AND profile_id = ? AND doc_type IN ('sales_order', 'order') LIMIT 1",
            crate::turso_params![data.order_id.clone(), profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (cust_id, existing_notes) = if let Ok(Some(row)) = order_row.next().await {
        let cid: Option<String> = row.get(0).ok();
        let n: Option<String> = row.get(1).ok();
        (cid, n)
    } else {
        return Err("Sales order not found".to_string());
    };

    // Create confirmed tax invoice
    let create_inv_data = CreateInvoiceData {
        customer_id: cust_id,
        vendor_id: None,
        channel: Some("wholesale".to_string()),
        service_mode: Some("delivery".to_string()),
        notes: data.notes.or(existing_notes),
        lines: data.lines,
        status: Some("confirmed".to_string()),
        doc_type: Some("invoice".to_string()),
        bill_discount_pct: data.bill_discount_pct,
        bill_discount_amt: data.bill_discount_amt,
        user_id: None,
        updated_by: None,
        staff_id: None,
        sales_order_id: Some(data.order_id.clone()),
        payments: None,
    };

    let invoice_res = shop_create_invoice(create_inv_data, state.clone()).await?;

    // Mark sales order as invoiced
    let _ = conn.execute(
        "UPDATE shop_documents SET status = 'invoiced', updated_at = (strftime('%s','now')) WHERE id = ? AND profile_id = ?",
        crate::turso_params![data.order_id.clone(), profile_id.clone()],
    ).await;

    Ok(invoice_res)
}

#[tauri::command]
pub async fn shop_reject_sales_order(
    order_id: String,
    reason: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let note_append = match reason {
        Some(r) => format!(" [Rejected: {}]", r),
        None => " [Rejected by Wholesaler]".to_string(),
    };

    conn.execute(
        "UPDATE shop_documents SET status = 'rejected', notes = COALESCE(notes, '') || ?, updated_at = (strftime('%s','now')) WHERE id = ? AND profile_id = ? AND doc_type IN ('sales_order', 'order')",
        crate::turso_params![note_append, order_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemRateHistoryEntry {
    pub document_id: String,
    pub doc_number: String,
    pub doc_date: i64,
    pub status: String,
    pub customer_id: Option<String>,
    pub customer_name: String,
    pub unit_price: f64,
    pub discount_pct: f64,
    pub discount_amt: f64,
    pub qty: f64,
    pub free_qty: f64,
    pub line_total: f64,
    pub mrp: Option<f64>,
    pub batch_no: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemRateHistoryResult {
    pub item_id: String,
    pub item_name: String,
    pub sku: Option<String>,
    pub standard_selling_price: f64,
    pub standard_mrp: Option<f64>,
    pub default_discount_pct: Option<f64>,
    pub extra_discount: Option<f64>,
    pub cost_price: Option<f64>,
    pub unit: Option<String>,
    pub last_customer_rate: Option<ItemRateHistoryEntry>,
    pub customer_history: Vec<ItemRateHistoryEntry>,
    pub history: Vec<ItemRateHistoryEntry>,
}

#[tauri::command]
pub async fn shop_get_item_rate_history(
    item_id: String,
    customer_id: Option<String>,
    limit: Option<u32>,
    state: State<'_, Arc<AppState>>,
) -> Result<ItemRateHistoryResult, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let fetch_limit = limit.unwrap_or(100).min(500);

    // 1. Fetch item details
    let item_stmt = conn
        .prepare(
            "SELECT i.name, i.sku, i.price, i.cost_price, \
             COALESCE(NULLIF(i.default_mrp, 0), i.compare_price, i.price) as mrp, \
             (SELECT symbol FROM shop_units WHERE id = i.unit_id LIMIT 1) as unit, \
             i.discount_pct, i.extra_discount \
             FROM shop_items i \
             WHERE i.id = ?1 AND i.profile_id = ?2 LIMIT 1",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut item_rows = item_stmt
        .query(crate::turso_params![item_id.clone(), profile_id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    let (item_name, sku, standard_selling_price, cost_price, standard_mrp, unit, default_discount_pct, extra_discount) = if let Ok(Some(row)) = item_rows.next().await {
        (
            row.get::<String>(0).unwrap_or_else(|_| "Unknown Item".to_string()),
            row.get::<String>(1).ok(),
            row.get::<f64>(2).unwrap_or(0.0),
            row.get::<f64>(3).ok(),
            row.get::<f64>(4).ok(),
            row.get::<String>(5).ok(),
            row.get::<f64>(6).ok(),
            row.get::<f64>(7).ok(),
        )
    } else {
        ("Unknown Item".to_string(), None, 0.0, None, None, None, None, None)
    };

    // 2. Fetch history specifically for this customer if customer_id is provided
    let mut customer_history: Vec<ItemRateHistoryEntry> = Vec::new();
    let mut last_customer_rate: Option<ItemRateHistoryEntry> = None;
    if let Some(ref cust_id) = customer_id {
        if !cust_id.trim().is_empty() {
            let cust_stmt = conn
                .prepare(
                    "SELECT d.id, d.doc_number, d.doc_date, d.status, d.customer_id, \
                     COALESCE(c.name, json_extract(d.meta, '$.customer_name'), 'Walk-in') as customer_name, \
                     l.unit_price, l.discount_pct, l.discount_amt, l.qty, l.free_qty, l.line_total, \
                     COALESCE(l.mrp, b.mrp), b.batch_no, l.created_at \
                     FROM shop_document_lines l \
                     JOIN shop_documents d ON d.id = l.document_id AND d.profile_id = l.profile_id \
                     LEFT JOIN shop_customers c ON c.id = d.customer_id \
                     LEFT JOIN shop_item_batches b ON b.id = l.batch_id \
                     WHERE l.profile_id = ?1 \
                       AND l.item_id = ?2 \
                       AND (d.customer_id = ?3 OR c.id = ?3 OR LOWER(c.name) = LOWER(?3) OR LOWER(COALESCE(json_extract(d.meta, '$.customer_name'), '')) = LOWER(?3) OR c.name = (SELECT name FROM shop_customers WHERE id = ?3 LIMIT 1)) \
                       AND d.doc_type IN ('invoice', 'pos', 'sales_order') \
                       AND d.status != 'cancelled' \
                     ORDER BY d.doc_date DESC, l.created_at DESC \
                     LIMIT ?4",
                )
                .await
                .map_err(|e| e.to_string())?;

            let mut cust_rows = cust_stmt
                .query(crate::turso_params![profile_id.clone(), item_id.clone(), cust_id.clone(), fetch_limit as i64])
                .await
                .map_err(|e| e.to_string())?;

            while let Ok(Some(row)) = cust_rows.next().await {
                let entry = ItemRateHistoryEntry {
                    document_id: row.get(0).unwrap_or_default(),
                    doc_number: row.get(1).unwrap_or_default(),
                    doc_date: row.get(2).unwrap_or(0),
                    status: row.get(3).unwrap_or_default(),
                    customer_id: row.get(4).ok(),
                    customer_name: row.get(5).unwrap_or_else(|_| "Customer".to_string()),
                    unit_price: row.get(6).unwrap_or(0.0),
                    discount_pct: row.get(7).unwrap_or(0.0),
                    discount_amt: row.get(8).unwrap_or(0.0),
                    qty: row.get(9).unwrap_or(0.0),
                    free_qty: row.get(10).unwrap_or(0.0),
                    line_total: row.get(11).unwrap_or(0.0),
                    mrp: row.get(12).ok(),
                    batch_no: row.get(13).ok(),
                    created_at: row.get(14).unwrap_or(0),
                };
                if last_customer_rate.is_none() {
                    last_customer_rate = Some(entry.clone());
                }
                customer_history.push(entry);
            }
        }
    }

    // 3. Fetch general history across all invoices
    let hist_stmt = conn
        .prepare(
            "SELECT d.id, d.doc_number, d.doc_date, d.status, d.customer_id, \
             COALESCE(c.name, json_extract(d.meta, '$.customer_name'), 'Walk-in') as customer_name, \
             l.unit_price, l.discount_pct, l.discount_amt, l.qty, l.free_qty, l.line_total, \
             COALESCE(l.mrp, b.mrp), b.batch_no, l.created_at \
             FROM shop_document_lines l \
             JOIN shop_documents d ON d.id = l.document_id AND d.profile_id = l.profile_id \
             LEFT JOIN shop_customers c ON c.id = d.customer_id \
             LEFT JOIN shop_item_batches b ON b.id = l.batch_id \
             WHERE l.profile_id = ?1 \
               AND l.item_id = ?2 \
               AND d.doc_type IN ('invoice', 'pos', 'sales_order') \
               AND d.status != 'cancelled' \
             ORDER BY d.doc_date DESC, l.created_at DESC \
             LIMIT ?3",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut hist_rows = hist_stmt
        .query(crate::turso_params![profile_id.clone(), item_id.clone(), fetch_limit as i64])
        .await
        .map_err(|e| e.to_string())?;

    let mut history = Vec::new();
    while let Ok(Some(row)) = hist_rows.next().await {
        history.push(ItemRateHistoryEntry {
            document_id: row.get(0).unwrap_or_default(),
            doc_number: row.get(1).unwrap_or_default(),
            doc_date: row.get(2).unwrap_or(0),
            status: row.get(3).unwrap_or_default(),
            customer_id: row.get(4).ok(),
            customer_name: row.get(5).unwrap_or_else(|_| "Walk-in".to_string()),
            unit_price: row.get(6).unwrap_or(0.0),
            discount_pct: row.get(7).unwrap_or(0.0),
            discount_amt: row.get(8).unwrap_or(0.0),
            qty: row.get(9).unwrap_or(0.0),
            free_qty: row.get(10).unwrap_or(0.0),
            line_total: row.get(11).unwrap_or(0.0),
            mrp: row.get(12).ok(),
            batch_no: row.get(13).ok(),
            created_at: row.get(14).unwrap_or(0),
        });
    }

    Ok(ItemRateHistoryResult {
        item_id,
        item_name,
        sku,
        standard_selling_price,
        standard_mrp,
        default_discount_pct,
        extra_discount,
        cost_price,
        unit,
        last_customer_rate,
        customer_history,
        history,
    })
}


