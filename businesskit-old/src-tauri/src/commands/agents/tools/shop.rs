// src-tauri/src/commands/agents/tools/shop.rs
// Shop Domain Tools: Inventory (Purchases, Restocks, Levels) and Billing (Invoices).

use super::helpers::{
    get_or_create_default_warehouse, get_stock_balance, parse_date_to_timestamp,
    resolve_or_create_item_with_params, resolve_or_create_vendor, ItemCreationParams,
};
use super::ToolCtx;
use crate::db::turso::{TursoConn, TursoParam};
use crate::turso_params;
use serde_json::{json, Value};
use uuid::Uuid;

/// Process a vendor purchase invoice: creates a goods_receipt document,
/// writes document lines, updates item cost prices, and appends rows to shop_stock_ledger with movement_type = 'purchase'.
pub async fn get_or_create_tax_rate(
    conn: &TursoConn,
    profile_id: &str,
    tax_pct: f64,
    tax_label: &str,
) -> (Option<String>, f64) {
    if tax_pct <= 0.0 && tax_label.is_empty() {
        return (None, 0.0);
    }
    // Query existing tax rates
    if let Ok(mut rows) = conn
        .query(
            "SELECT id, name, rate_pct FROM fin_tax_rates WHERE profile_id = ?1 AND is_active = 1",
            turso_params![profile_id],
        )
        .await
    {
        while let Ok(Some(row)) = rows.next().await {
            let id: String = row.get(0).unwrap_or_default();
            let name: String = row.get(1).unwrap_or_default();
            let rate: f64 = row.get(2).unwrap_or(0.0);
            if (!tax_label.is_empty() && (id == tax_label || name.eq_ignore_ascii_case(tax_label)))
                || (tax_pct > 0.0 && (rate - tax_pct).abs() < 0.01)
            {
                return (Some(id), rate);
            }
        }
    }

    // Auto-create tax rate if not present
    let tr_id = format!("tr_{}", &Uuid::new_v4().to_string().replace('-', "")[..8]);
    let name = if !tax_label.is_empty() {
        tax_label.to_string()
    } else {
        format!("GST {}%", tax_pct)
    };
    let half_tax = (tax_pct / 2.0 * 100.0).round() / 100.0;
    let components = json!({ "cgst": half_tax, "sgst": half_tax, "igst": tax_pct }).to_string();
    let _ = conn
        .execute(
            "INSERT INTO fin_tax_rates (id, profile_id, name, rate_pct, components, is_active, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, 1, strftime('%s','now'))",
            turso_params![tr_id.clone(), profile_id, name, tax_pct, components],
        )
        .await;

    (Some(tr_id), tax_pct)
}

pub async fn inventory_receive_purchase_invoice(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let vendor_name = args
        .get("vendor_name")
        .and_then(Value::as_str)
        .ok_or("Missing required field: vendor_name")?;
    let raw_lines = args
        .get("line_items")
        .and_then(Value::as_array)
        .ok_or("Missing required field: line_items")?;
    let invoice_number = args.get("invoice_number").and_then(Value::as_str);
    let invoice_date_str = args.get("invoice_date").and_then(Value::as_str);
    let location = args.get("location").and_then(Value::as_str);
    let media_id = args
        .get("media_id")
        .and_then(Value::as_str)
        .map(|s| s.to_string())
        .or_else(|| ctx.media_attachment_id.clone());
    let payment_status = args
        .get("payment_status")
        .and_then(Value::as_str)
        .unwrap_or("confirmed");
    let payment_method = args
        .get("payment_method")
        .and_then(Value::as_str)
        .unwrap_or("bank_transfer");
    let payment_terms = args.get("payment_terms").and_then(Value::as_str);
    let notes_arg = args.get("notes").and_then(Value::as_str);
    let agent_notes_arg = args.get("agent_notes").and_then(Value::as_str);

    if raw_lines.is_empty() {
        return Err("inventory_receive_purchase_invoice requires at least one line item".into());
    }

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // 1. Resolve or auto-create vendor in shop_vendors
    let (vendor_id, clean_vendor_name) = resolve_or_create_vendor(conn, profile_id, vendor_name, payment_terms).await?;

    // 2. Resolve warehouse
    let (warehouse_id, warehouse_name) = if let Some(loc_name) = location {
        let mut wh_rows = conn
            .query(
                "SELECT id, name FROM shop_warehouses WHERE profile_id = ?1 AND (id = ?2 OR name LIKE ?3) LIMIT 1",
                turso_params![profile_id, loc_name, format!("%{}%", loc_name)],
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Some(row) = wh_rows.next().await.map_err(|e| e.to_string())? {
            (
                row.get::<String>(0).map_err(|e| e.to_string())?,
                row.get::<String>(1).unwrap_or_else(|_| "Warehouse".to_string()),
            )
        } else {
            let wh_id = get_or_create_default_warehouse(conn, profile_id).await?;
            (wh_id, "Main Warehouse".to_string())
        }
    } else {
        let wh_id = get_or_create_default_warehouse(conn, profile_id).await?;
        (wh_id, "Main Warehouse".to_string())
    };

    // 3. Sequential doc number for Goods Receipt
    let seq: i64 = {
        let mut seq_rows = conn
            .query(
                "SELECT COUNT(*) FROM shop_documents WHERE profile_id = ?1 AND doc_type = 'goods_receipt'",
                turso_params![profile_id],
            )
            .await
            .map_err(|e| e.to_string())?;
        let n = if let Some(row) = seq_rows.next().await.map_err(|e| e.to_string())? {
            row.get::<i64>(0).unwrap_or(0)
        } else {
            0
        };
        n + 1
    };
    let doc_number = format!("GR-{:04}", seq);
    let doc_id = format!("doc_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let vendor_bill_date = parse_date_to_timestamp(invoice_date_str);

    let default_markup_pct = args
        .get("default_markup_pct")
        .and_then(Value::as_f64)
        .or_else(|| args.get("markup_pct").and_then(Value::as_f64))
        .or_else(|| args.get("markup").and_then(Value::as_f64));

    // 4. Process line items and ledger
    struct ReceivedItem {
        item_id: String,
        item_name: String,
        sku: String,
        qty: f64,
        unit_cost: f64,
        selling_price: Option<f64>,
        mrp: f64,
        line_total: f64,
        new_balance: f64,
    }

    let mut received_items = Vec::new();
    let mut subtotal = 0.0_f64;

    for (idx, line_val) in raw_lines.iter().enumerate() {
        let item_ref = line_val
            .get("item")
            .and_then(Value::as_str)
            .or_else(|| line_val.get("sku").and_then(Value::as_str))
            .or_else(|| line_val.get("name").and_then(Value::as_str))
            .or_else(|| line_val.get("item_name").and_then(Value::as_str))
            .ok_or_else(|| format!("Line {}: missing item identifier/name/sku", idx + 1))?;

        let qty = line_val
            .get("quantity")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("quantity").and_then(Value::as_i64).map(|q| q as f64))
            .or_else(|| line_val.get("qty").and_then(Value::as_f64))
            .or_else(|| line_val.get("qty").and_then(Value::as_i64).map(|q| q as f64))
            .unwrap_or(1.0);

        let free_qty = line_val
            .get("free_qty")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("free_qty").and_then(Value::as_i64).map(|q| q as f64))
            .unwrap_or(0.0);

        let rate = line_val
            .get("rate")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("rate").and_then(Value::as_i64).map(|r| r as f64))
            .unwrap_or(0.0);

        let disc1 = line_val
            .get("discount")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("discount").and_then(Value::as_i64).map(|d| d as f64))
            .or_else(|| line_val.get("discount_pct").and_then(Value::as_f64))
            .unwrap_or(0.0);

        let disc2 = line_val
            .get("discount2")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("discount2").and_then(Value::as_i64).map(|d| d as f64))
            .unwrap_or(0.0);

        let tax = line_val
            .get("tax")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("tax").and_then(Value::as_i64).map(|t| t as f64))
            .or_else(|| line_val.get("tax_rate_pct").and_then(Value::as_f64))
            .unwrap_or(0.0);

        let tax_code = line_val
            .get("tax_code")
            .and_then(Value::as_str)
            .unwrap_or("");

        let mrp = line_val
            .get("mrp")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("mrp").and_then(Value::as_i64).map(|m| m as f64))
            .unwrap_or(0.0);

        let pack_size = line_val
            .get("pack_size")
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        let conversion_factor = line_val
            .get("conversion_factor")
            .and_then(Value::as_f64)
            .unwrap_or(1.0);

        let explicit_selling_price = line_val
            .get("selling_price")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("price").and_then(Value::as_f64))
            .or_else(|| line_val.get("retail_price").and_then(Value::as_f64));

        let line_markup_pct = line_val
            .get("markup_pct")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("markup").and_then(Value::as_f64))
            .or(default_markup_pct);

        let explicit_sku = line_val
            .get("sku")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let hsn_code = line_val
            .get("hsn_sac_code")
            .and_then(Value::as_str)
            .or_else(|| line_val.get("hsn").and_then(Value::as_str))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let barcode_val = line_val
            .get("barcode")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        // Compute net unit cost using rate/disc1/disc2/tax formula if rate provided
        let calc_net_cost = if rate > 0.0 {
            let d1 = (rate * disc1) / 100.0;
            let after_d1 = (rate - d1).max(0.0);
            let d2 = (after_d1 * disc2) / 100.0;
            let taxable = (after_d1 - d2).max(0.0);
            let tax_amt = (taxable * tax) / 100.0;
            ((taxable + tax_amt) * 100.0).round() / 100.0
        } else {
            0.0
        };

        let unit_cost = if calc_net_cost > 0.0 {
            calc_net_cost
        } else {
            line_val
                .get("unit_cost")
                .and_then(Value::as_f64)
                .or_else(|| line_val.get("unit_cost").and_then(Value::as_i64).map(|p| p as f64))
                .or_else(|| line_val.get("unit_price").and_then(Value::as_f64))
                .or_else(|| line_val.get("unit_price").and_then(Value::as_i64).map(|p| p as f64))
                .or_else(|| line_val.get("cost").and_then(Value::as_f64))
                .or_else(|| line_val.get("cost").and_then(Value::as_i64).map(|p| p as f64))
                .unwrap_or(0.0)
        };

        let mut scheme_on = line_val
            .get("scheme_on")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("scheme_on").and_then(Value::as_i64).map(|s| s as f64))
            .unwrap_or(0.0);

        let mut scheme_free = line_val
            .get("scheme_free")
            .and_then(Value::as_f64)
            .or_else(|| line_val.get("scheme_free").and_then(Value::as_i64).map(|s| s as f64))
            .unwrap_or(0.0);

        // Normalize / reduce deal slab scheme ratio
        if (scheme_on == 0.0 || scheme_free == 0.0 || (scheme_on == qty && scheme_free == free_qty)) && free_qty > 0.0 && qty > 0.0 {
            fn gcd(mut a: u64, mut b: u64) -> u64 {
                while b != 0 {
                    let temp = b;
                    b = a % b;
                    a = temp;
                }
                a
            }
            let q_int = qty.round() as u64;
            let f_int = free_qty.round() as u64;
            if q_int > 0 && f_int > 0 && (qty - q_int as f64).abs() < 1e-4 && (free_qty - f_int as f64).abs() < 1e-4 {
                let g = gcd(q_int, f_int);
                scheme_on = (q_int / g) as f64;
                scheme_free = (f_int / g) as f64;
            } else {
                scheme_on = qty;
                scheme_free = free_qty;
            }
        }

        let total_units = qty + free_qty;
        let landing_cost = if total_units > 0.0 {
            (qty * unit_cost) / total_units
        } else {
            unit_cost
        };

        let target_selling_price = if let Some(sp) = explicit_selling_price.filter(|&p| p > 0.0) {
            Some(sp)
        } else if let Some(m_pct) = line_markup_pct.filter(|&m| m > 0.0) {
            let base_c = if landing_cost > 0.0 { landing_cost } else { unit_cost };
            if base_c > 0.0 {
                Some(((base_c * (1.0 + m_pct / 100.0)) * 100.0).round() / 100.0)
            } else {
                None
            }
        } else {
            None
        };

        // Resolve or create tax rate ID from fin_tax_rates
        let (tax_rate_id_opt, matched_tax_rate_pct) = get_or_create_tax_rate(conn, profile_id, tax, tax_code).await;
        let final_tax_code = tax_rate_id_opt.clone().unwrap_or_else(|| tax_code.to_string());

        let d1_amt = if rate > 0.0 { (rate * disc1) / 100.0 } else { 0.0 };
        let after_d1 = (rate - d1_amt).max(0.0);
        let d2_amt = if after_d1 > 0.0 { (after_d1 * disc2) / 100.0 } else { 0.0 };
        let taxable_unit = (after_d1 - d2_amt).max(0.0);
        let taxable_amt = taxable_unit * qty;
        let tax_amt = (taxable_amt * matched_tax_rate_pct) / 100.0;

        let clean_num = |val: f64| -> Value {
            if (val.fract()).abs() < 1e-6 {
                json!(val as i64)
            } else {
                json!((val * 100.0).round() / 100.0)
            }
        };

        let pricing_snapshot = json!({
            "rate": clean_num(if rate > 0.0 { rate } else { unit_cost }),
            "discount": clean_num(disc1),
            "discount2": clean_num(disc2),
            "tax": clean_num(matched_tax_rate_pct),
            "tax_code": final_tax_code
        })
        .to_string();

        let line_total = qty * unit_cost;
        subtotal += line_total;

        let line_notes = line_val.get("notes").and_then(Value::as_str).map(|s| s.to_string());
        let line_agent_notes = line_val.get("agent_notes").and_then(Value::as_str).map(|s| s.to_string());

        let explicit_category_id = line_val
            .get("category_id")
            .or_else(|| line_val.get("category"))
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        let explicit_shop_category_id = line_val
            .get("shop_category_id")
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        let explicit_collection_id = line_val
            .get("collection_id")
            .or_else(|| line_val.get("collection"))
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        let explicit_unit_id = line_val
            .get("unit_id")
            .or_else(|| line_val.get("unit"))
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        // Resolve or auto-create item with full schema and 10-char alphanumeric SKU
        let item_params = ItemCreationParams {
            user_id: Some(ctx.agent_user_id.clone()),
            explicit_sku: explicit_sku.clone(),
            cost_price: if landing_cost > 0.0 { landing_cost } else { unit_cost },
            selling_price: target_selling_price,
            markup_pct: line_markup_pct,
            mrp: if mrp > 0.0 { Some(mrp) } else { None },
            compare_price: None,
            tax_rate_id: tax_rate_id_opt.clone(),
            barcode: barcode_val.clone(),
            hsn_sac_code: hsn_code.clone(),
            pack_size: pack_size.clone(),
            conversion_factor: if conversion_factor > 0.0 { Some(conversion_factor) } else { None },
            scheme_on: if scheme_on > 0.0 { Some(scheme_on) } else { None },
            scheme_free: if scheme_free > 0.0 { Some(scheme_free) } else { None },
            category_id: explicit_category_id,
            shop_category_id: explicit_shop_category_id,
            collection_id: explicit_collection_id,
            unit_id: explicit_unit_id,
            notes: line_notes.clone(),
            agent_notes: line_agent_notes.clone(),
        };

        let (item_id, item_name, sku_str) =
            resolve_or_create_item_with_params(conn, profile_id, item_ref, item_params).await?;

        // Compute current balance
        let current_bal = get_stock_balance(conn, profile_id, &item_id, &warehouse_id).await?;
        let new_balance = current_bal + total_units;
        let ledger_id = format!("sl_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
        let doc_line_id = format!("docl_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);

        let ledger_note = if let Some(inv) = invoice_number {
            format!("Purchase from {} (Inv: #{})", clean_vendor_name, inv)
        } else {
            format!("Purchase from {}", clean_vendor_name)
        };

        // Insert batch record if batch_no is provided
        let batch_no_opt = line_val
            .get("batch_no")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let mut batch_id_opt: Option<String> = None;
        if let Some(ref bno) = batch_no_opt {
            let batch_id = format!("batch_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
            let exp_ts = line_val
                .get("expiry_date")
                .and_then(Value::as_str)
                .map(|d| parse_date_to_timestamp(Some(d)));

            let _ = conn
                .execute(
                    "INSERT INTO shop_item_batches \
                     (id, profile_id, item_id, batch_no, expiry_date, qty_received, qty_remaining, \
                      purchase_price, mrp, landing_cost, pack_size, conversion_factor, warehouse_id, is_active) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 1)",
                    turso_params![
                        batch_id.clone(),
                        profile_id,
                        item_id.clone(),
                        bno.clone(),
                        exp_ts.unwrap_or(0),
                        total_units,
                        total_units,
                        unit_cost,
                        mrp,
                        landing_cost,
                        pack_size.clone().unwrap_or_default(),
                        conversion_factor,
                        warehouse_id.clone()
                    ],
                )
                .await;
            batch_id_opt = Some(batch_id);
        }

        // Insert into shop_stock_ledger with movement_type = 'purchase'
        conn.execute(
            "INSERT INTO shop_stock_ledger \
             (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost, document_id, notes) \
             VALUES (?1, ?2, ?3, ?4, 'purchase', ?5, 0.0, ?6, ?7, ?8, ?9)",
            turso_params![
                ledger_id,
                profile_id,
                item_id.clone(),
                warehouse_id.clone(),
                total_units,
                new_balance,
                landing_cost,
                doc_id.clone(),
                ledger_note
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

        // Insert into shop_document_lines
        conn.execute(
            "INSERT INTO shop_document_lines \
             (id, profile_id, document_id, item_id, description, batch_id, qty, free_qty, scheme_on, scheme_free, \
              unit_cost, unit_price, landing_cost, mrp, pack_size, conversion_factor, \
              discount_pct, discount_amt, taxable_amt, tax_rate_id, tax_rate_pct, tax_amount, \
              line_total, pricing_snapshot, sort_order) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)",
            turso_params![
                doc_line_id,
                profile_id,
                doc_id.clone(),
                item_id.clone(),
                item_name.clone(),
                batch_id_opt,
                qty,
                free_qty,
                scheme_on,
                scheme_free,
                unit_cost,
                if rate > 0.0 { rate } else { unit_cost },
                landing_cost,
                mrp,
                pack_size.clone(),
                conversion_factor,
                disc1,
                d1_amt * qty,
                taxable_amt,
                tax_rate_id_opt.clone(),
                matched_tax_rate_pct,
                tax_amt,
                line_total,
                pricing_snapshot,
                (idx + 1) as i64
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

        // Update existing/created item in shop_items with full schema pricing
        let effective_cost = if landing_cost > 0.0 { landing_cost } else { unit_cost };
        if effective_cost > 0.0 || target_selling_price.is_some() || mrp > 0.0 || tax_rate_id_opt.is_some() || hsn_code.is_some() || pack_size.is_some() {
            let mut sets = vec![
                "updated_at = strftime('%s','now')".to_string(),
                "track_inventory = 1".to_string(),
                "updated_by = ?1".to_string(),
            ];
            let mut update_params: Vec<TursoParam> = vec![TursoParam::Text(ctx.agent_user_id.clone())];
            let mut p_idx = 2;

            if effective_cost > 0.0 {
                sets.push(format!("cost_price = ?{}", p_idx));
                update_params.push(TursoParam::Float(effective_cost));
                p_idx += 1;
            }
            if let Some(sp) = target_selling_price {
                sets.push(format!("price = ?{}", p_idx));
                update_params.push(TursoParam::Float(sp));
                p_idx += 1;
            }
            if mrp > 0.0 {
                sets.push(format!("default_mrp = ?{}", p_idx));
                update_params.push(TursoParam::Float(mrp));
                p_idx += 1;
            }
            if let Some(ref tr_id) = tax_rate_id_opt {
                sets.push(format!("tax_rate_id = ?{}", p_idx));
                update_params.push(TursoParam::Text(tr_id.clone()));
                p_idx += 1;
            }
            if let Some(ref hsn) = hsn_code {
                sets.push(format!("hsn_sac_code = ?{}", p_idx));
                update_params.push(TursoParam::Text(hsn.clone()));
                p_idx += 1;
            }
            if let Some(ref ps) = pack_size {
                sets.push(format!("pack_size = ?{}", p_idx));
                update_params.push(TursoParam::Text(ps.clone()));
                p_idx += 1;
            }
            if conversion_factor > 1.0 {
                sets.push(format!("conversion_factor = ?{}", p_idx));
                update_params.push(TursoParam::Float(conversion_factor));
                p_idx += 1;
            }
            if scheme_on > 0.0 && scheme_free > 0.0 {
                sets.push(format!("scheme_on = ?{}", p_idx));
                update_params.push(TursoParam::Float(scheme_on));
                p_idx += 1;
                sets.push(format!("scheme_free = ?{}", p_idx));
                update_params.push(TursoParam::Float(scheme_free));
                p_idx += 1;
            }
            if let Some(ref n) = line_notes {
                sets.push(format!("notes = ?{}", p_idx));
                update_params.push(TursoParam::Text(n.clone()));
                p_idx += 1;
            }
            if let Some(ref an) = line_agent_notes {
                sets.push(format!("agent_notes = ?{}", p_idx));
                update_params.push(TursoParam::Text(an.clone()));
                p_idx += 1;
            }

            update_params.push(TursoParam::Text(item_id.clone()));
            update_params.push(TursoParam::Text(profile_id.to_string()));

            let update_sql = format!(
                "UPDATE shop_items SET {} WHERE id = ?{} AND profile_id = ?{}",
                sets.join(", "),
                p_idx,
                p_idx + 1
            );
            let _ = conn.execute(&update_sql, update_params).await;
        }

        // Update variant stock if applicable
        let _ = conn
            .execute(
                "UPDATE shop_item_variants SET stock_qty = stock_qty + ?1 WHERE id = ?2 AND profile_id = ?3",
                turso_params![total_units, item_id.clone(), profile_id],
            )
            .await;

        received_items.push(ReceivedItem {
            item_id,
            item_name,
            sku: sku_str,
            qty: total_units,
            unit_cost: effective_cost,
            selling_price: target_selling_price,
            mrp,
            line_total,
            new_balance,
        });
    }

    let grand_total = ((subtotal * 100.0).round()) / 100.0;
    let subtotal_val = grand_total;

    let is_paid = payment_status.eq_ignore_ascii_case("paid");
    let amount_paid = if is_paid { grand_total } else { 0.0 };
    let amount_due = if is_paid { 0.0 } else { grand_total };
    let status_str = if is_paid { "paid" } else { "confirmed" };

    let doc_notes = match (notes_arg, payment_terms) {
        (Some(n), Some(pt)) => format!("Vendor: {} | Terms: {} | {}", clean_vendor_name, pt, n),
        (None, Some(pt)) => format!("Vendor: {} | Terms: {}", clean_vendor_name, pt),
        (Some(n), None) => format!("Vendor: {} | {}", clean_vendor_name, n),
        (None, None) => format!("Vendor: {}", clean_vendor_name),
    };

    let doc_agent_notes = agent_notes_arg.map(|s| s.to_string()).unwrap_or_else(|| {
        format!(
            "Auto-recorded {} line items from purchase invoice. Landed cost and margins logged.",
            received_items.len()
        )
    });

    let mut meta_map = serde_json::Map::new();
    if let Some(ref mid) = media_id {
        meta_map.insert("media_id".to_string(), json!(mid));
    }
    if let Some(ref murl) = ctx.media_attachment_url {
        meta_map.insert("invoice_url".to_string(), json!(murl));
    }
    let doc_meta = serde_json::to_string(&meta_map).unwrap_or_else(|_| "{}".to_string());

    // 5. Insert goods_receipt document into shop_documents (with media_id attachment reference)
    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, user_id, updated_by, doc_type, doc_number, ref_number, vendor_bill_date, payment_method, \
          warehouse_id, channel, status, vendor_id, media_id, subtotal, discount_amt, cash_discount_pct, cash_discount_amt, \
          inward_expense, taxable_amt, tax_amount, grand_total, amount_paid, amount_due, notes, agent_notes, meta) \
         VALUES (?1, ?2, ?3, ?4, 'goods_receipt', ?5, ?6, ?7, ?8, ?9, 'dashboard', ?10, ?11, ?12, ?13, 0, 0, 0, 0, ?13, 0, ?14, ?15, ?16, ?17, ?18, ?19)",
        turso_params![
            doc_id.clone(),
            profile_id,
            ctx.agent_user_id.clone(),
            ctx.agent_user_id.clone(),
            doc_number.clone(),
            invoice_number.unwrap_or(""),
            vendor_bill_date,
            payment_method,
            warehouse_id.clone(),
            status_str,
            vendor_id.clone(),
            media_id.clone(),
            subtotal_val,
            grand_total,
            amount_paid,
            amount_due,
            doc_notes,
            doc_agent_notes,
            doc_meta
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // If paid, record payment
    if is_paid && grand_total > 0.0 {
        let pay_id = format!("pay_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
        let _ = conn
            .execute(
                "INSERT INTO shop_document_payments (id, profile_id, document_id, amount, payment_mode, reference) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                turso_params![
                    pay_id,
                    profile_id,
                    doc_id.clone(),
                    grand_total,
                    payment_method,
                    invoice_number.unwrap_or("")
                ],
            )
            .await;
    }

    let summary_items: Vec<Value> = received_items
        .iter()
        .map(|item| {
            let mut obj = json!({
                "item_id": item.item_id,
                "item_name": item.item_name,
                "sku": item.sku,
                "quantity_received": item.qty,
                "unit_cost": item.unit_cost,
                "line_total": item.line_total,
                "new_stock_level": item.new_balance
            });
            if let Some(sp) = item.selling_price {
                obj["selling_price"] = json!(sp);
                if item.unit_cost > 0.0 && sp > 0.0 {
                    let margin_pct = (((sp - item.unit_cost) / sp) * 10000.0).round() / 100.0;
                    obj["margin_pct"] = json!(margin_pct);
                }
            }
            if item.mrp > 0.0 {
                obj["mrp"] = json!(item.mrp);
            }
            obj
        })
        .collect();

    let mut res_obj = json!({
        "document_id": doc_id,
        "doc_number": doc_number,
        "invoice_number": invoice_number.unwrap_or(""),
        "vendor_name": clean_vendor_name,
        "vendor_id": vendor_id,
        "warehouse": warehouse_name,
        "movement_type": "purchase",
        "subtotal": subtotal,
        "grand_total": grand_total,
        "status": status_str,
        "lines_count": summary_items.len(),
        "items_received": summary_items
    });

    if let Some(ref mid) = media_id {
        res_obj["media_id"] = json!(mid);
    }
    if let Some(ref murl) = ctx.media_attachment_url {
        res_obj["invoice_url"] = json!(murl);
    }

    Ok(res_obj)
}

pub async fn inventory_add_stock(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let sku_or_item = args
        .get("sku")
        .and_then(Value::as_str)
        .or_else(|| args.get("item").and_then(Value::as_str))
        .or_else(|| args.get("name").and_then(Value::as_str))
        .or_else(|| args.get("item_name").and_then(Value::as_str))
        .ok_or("Missing required field: sku (or item)")?;

    let delta = args
        .get("quantity_delta")
        .and_then(Value::as_f64)
        .or_else(|| args.get("quantity_delta").and_then(Value::as_i64).map(|d| d as f64))
        .or_else(|| args.get("quantity").and_then(Value::as_f64))
        .or_else(|| args.get("quantity").and_then(Value::as_i64).map(|d| d as f64))
        .ok_or("Missing required field: quantity_delta")?;

    let movement_type = args.get("movement_type").and_then(Value::as_str).unwrap_or("adjustment");
    let unit_cost = args
        .get("unit_cost")
        .and_then(Value::as_f64)
        .or_else(|| args.get("unit_cost").and_then(Value::as_i64).map(|p| p as f64))
        .or_else(|| args.get("cost").and_then(Value::as_f64))
        .unwrap_or(0.0);
    let vendor_name = args.get("vendor_name").and_then(Value::as_str);
    let invoice_number = args.get("invoice_number").and_then(Value::as_str);
    let location = args.get("location").and_then(Value::as_str);

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // 1. Resolve item by SKU, ID, or product name
    let (item_id, item_name, sku_str) = resolve_or_create_item_with_params(
        conn,
        profile_id,
        sku_or_item,
        ItemCreationParams {
            user_id: Some(ctx.agent_user_id.clone()),
            cost_price: unit_cost,
            ..Default::default()
        },
    )
    .await?;

    // 2. Resolve warehouse
    let warehouse_id = if let Some(loc_name) = location {
        let mut wh_rows = conn
            .query(
                "SELECT id FROM shop_warehouses WHERE profile_id = ?1 AND (id = ?2 OR name LIKE ?3) LIMIT 1",
                turso_params![profile_id, loc_name, format!("%{}%", loc_name)],
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Some(row) = wh_rows.next().await.map_err(|e| e.to_string())? {
            row.get::<String>(0).map_err(|e| e.to_string())?
        } else {
            get_or_create_default_warehouse(conn, profile_id).await?
        }
    } else {
        get_or_create_default_warehouse(conn, profile_id).await?
    };

    // 3. Compute current balance from ledger
    let current_bal = get_stock_balance(conn, profile_id, &item_id, &warehouse_id).await?;
    let new_balance = current_bal + delta;
    let ledger_id = format!("sl_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);

    let (qty_in, qty_out) = if delta >= 0.0 {
        (delta, 0.0)
    } else {
        (0.0, -delta)
    };

    let is_purchase = movement_type.eq_ignore_ascii_case("purchase");
    let movement_str = if is_purchase { "purchase" } else { "adjustment" };

    let ledger_notes = if let Some(v) = vendor_name {
        if let Some(inv) = invoice_number {
            format!("Purchase from {} (Inv: #{})", v, inv)
        } else {
            format!("Purchase from {}", v)
        }
    } else if is_purchase {
        "Vendor Purchase Restock".to_string()
    } else {
        "Agent updated inventory".to_string()
    };

    if !is_purchase {
        let adj_id = format!("adj_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
        conn.execute(
            "INSERT INTO shop_stock_adjustments \
             (id, profile_id, item_id, warehouse_id, adjustment_type, qty_change, reason) \
             VALUES (?1, ?2, ?3, ?4, 'agent_adjustment', ?5, 'Agent chat inventory adjustment')",
            turso_params![
                adj_id,
                profile_id,
                item_id.clone(),
                warehouse_id.clone(),
                delta
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT INTO shop_stock_ledger \
         (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, balance_after, unit_cost, notes) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        turso_params![
            ledger_id,
            profile_id,
            item_id.clone(),
            warehouse_id,
            movement_str,
            qty_in,
            qty_out,
            new_balance,
            unit_cost,
            ledger_notes
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    if unit_cost > 0.0 {
        let _ = conn
            .execute(
                "UPDATE shop_items SET cost_price = ?1, updated_by = ?2, updated_at = strftime('%s','now') WHERE id = ?3 AND profile_id = ?4",
                turso_params![unit_cost, ctx.agent_user_id.clone(), item_id.clone(), profile_id],
            )
            .await;
    }

    Ok(json!({
        "sku": sku_str,
        "item_id": item_id,
        "item_name": item_name,
        "movement_type": movement_str,
        "quantity_delta": delta,
        "unit_cost": unit_cost,
        "updated_quantity": new_balance,
        "status": "success"
    }))
}

pub async fn inventory_get_levels(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let sku_filter = args.get("sku").and_then(Value::as_str);
    let cat_filter = args.get("category").and_then(Value::as_str);

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    let mut sql = String::from(
        "SELECT i.id, i.sku, i.name, COALESCE(SUM(l.qty_in - l.qty_out), 0.0) as qty_on_hand \
         FROM shop_items i \
         LEFT JOIN shop_stock_ledger l ON i.id = l.item_id AND l.profile_id = i.profile_id \
         WHERE i.profile_id = ?1 ",
    );

    let mut params: Vec<TursoParam> = vec![TursoParam::Text(profile_id.to_string())];
    let mut param_idx = 2;

    if let Some(sku) = sku_filter {
        sql.push_str(&format!(
            "AND (i.sku LIKE ?{} OR i.id = ?{} OR i.name LIKE ?{}) ",
            param_idx, param_idx, param_idx
        ));
        params.push(TursoParam::Text(format!("%{}%", sku)));
        param_idx += 1;
    }

    if let Some(cat) = cat_filter {
        sql.push_str(&format!(
            "AND i.category_id IN (SELECT id FROM shop_categories WHERE profile_id = ?1 AND (name LIKE ?{} OR slug LIKE ?{})) ",
            param_idx, param_idx
        ));
        params.push(TursoParam::Text(format!("%{}%", cat)));
    }

    sql.push_str("GROUP BY i.id, i.sku, i.name ORDER BY i.name ASC LIMIT 50");

    let mut rows = conn.query(&sql, params).await.map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let sku: Option<String> = row.get(1).unwrap_or(None);
        let name: String = row.get(2).unwrap_or_else(|_| "Unnamed Item".to_string());
        let qty: f64 = row.get(3).unwrap_or(0.0);

        items.push(json!({
            "id": id,
            "sku": sku,
            "name": name,
            "quantity_on_hand": qty
        }));
    }

    Ok(json!({ "items": items, "count": items.len() }))
}

pub async fn invoice_create(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let customer_ref = args
        .get("customer_id")
        .and_then(Value::as_str)
        .ok_or("Missing required field: customer_id")?;
    let line_items = args
        .get("line_items")
        .and_then(Value::as_array)
        .ok_or("Missing required field: line_items")?;
    let due_date = args.get("due_date").and_then(Value::as_str);

    if line_items.is_empty() {
        return Err("invoice_create requires at least one line item".into());
    }

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // 1. Resolve or create customer
    let (customer_id, customer_name) = if let Some(row) = conn
        .query(
            "SELECT id, name FROM shop_customers WHERE profile_id = ?1 AND (id = ?2 OR name LIKE ?3 OR email = ?2) LIMIT 1",
            turso_params![profile_id, customer_ref, format!("%{}%", customer_ref)],
        )
        .await
        .map_err(|e| e.to_string())?
        .next()
        .await
        .map_err(|e| e.to_string())?
    {
        (
            row.get::<String>(0).map_err(|e| e.to_string())?,
            row.get::<String>(1).unwrap_or_else(|_| customer_ref.to_string()),
        )
    } else {
        let new_id = format!("cust_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
        conn.execute(
            "INSERT INTO shop_customers (id, profile_id, name, customer_type, is_active) \
             VALUES (?1, ?2, ?3, 'individual', 1)",
            turso_params![new_id.clone(), profile_id, customer_ref.to_string()],
        )
        .await
        .map_err(|e| e.to_string())?;
        (new_id, customer_ref.to_string())
    };

    // 2. Sequential document number (INV-0001)
    let pattern = "INV-%";
    let mut seq_rows = conn
        .query(
            "SELECT COALESCE(MAX(CAST(SUBSTR(doc_number, 5) AS INTEGER)), 0) \
             FROM shop_documents WHERE profile_id = ?1 AND doc_type = 'invoice' AND doc_number LIKE ?2",
            turso_params![profile_id, pattern],
        )
        .await
        .map_err(|e| e.to_string())?;

    let seq: i64 = if let Some(row) = seq_rows.next().await.map_err(|e| e.to_string())? {
        row.get::<i64>(0).unwrap_or(0) + 1
    } else {
        1
    };
    let doc_number = format!("INV-{:04}", seq);
    let invoice_id = format!("doc_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);

    // 3. Compute totals and prepare lines
    let mut subtotal = 0.0_f64;
    struct PreparedLine {
        id: String,
        description: String,
        qty: f64,
        unit_price: f64,
        line_total: f64,
    }

    let mut prepared_lines = Vec::new();
    for item in line_items {
        let desc = item.get("description").and_then(Value::as_str).unwrap_or("Line item");
        let qty = item
            .get("quantity")
            .and_then(Value::as_f64)
            .or_else(|| item.get("quantity").and_then(Value::as_i64).map(|q| q as f64))
            .unwrap_or(1.0);
        let unit_price = item
            .get("unit_price")
            .and_then(Value::as_f64)
            .or_else(|| item.get("unit_price").and_then(Value::as_i64).map(|p| p as f64))
            .unwrap_or(0.0);
        let line_total = qty * unit_price;
        subtotal += line_total;

        prepared_lines.push(PreparedLine {
            id: format!("line_{}", &Uuid::new_v4().to_string().replace('-', "")[..12]),
            description: desc.to_string(),
            qty,
            unit_price,
            line_total,
        });
    }

    let total = subtotal;
    let balance_due = total;
    let due_date_val = due_date.unwrap_or("");

    // 4. Insert shop_documents
    conn.execute(
        "INSERT INTO shop_documents \
         (id, profile_id, user_id, updated_by, doc_type, doc_number, customer_id, subtotal, taxable_amt, grand_total, amount_due, status, due_date) \
         VALUES (?1, ?2, ?3, ?4, 'invoice', ?5, ?6, ?7, ?7, ?8, ?9, 'issued', ?10)",
        turso_params![
            invoice_id.clone(),
            profile_id,
            ctx.agent_user_id.clone(),
            ctx.agent_user_id.clone(),
            doc_number.clone(),
            customer_id.clone(),
            subtotal,
            total,
            balance_due,
            due_date_val
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // 5. Insert shop_document_lines
    for (idx, line) in prepared_lines.iter().enumerate() {
        conn.execute(
            "INSERT INTO shop_document_lines \
             (id, document_id, profile_id, line_number, description, qty, unit_price, subtotal, total) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            turso_params![
                line.id.clone(),
                invoice_id.clone(),
                profile_id,
                (idx + 1) as i64,
                line.description.clone(),
                line.qty,
                line.unit_price,
                line.line_total,
                line.line_total
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(json!({
        "invoice_id": invoice_id,
        "doc_number": doc_number,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "subtotal": subtotal,
        "total": total,
        "status": "created",
        "lines_count": prepared_lines.len()
    }))
}

pub async fn invoice_send(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let invoice_id = args
        .get("invoice_id")
        .and_then(Value::as_str)
        .ok_or("Missing required field: invoice_id")?;
    let channel = args.get("channel").and_then(Value::as_str).unwrap_or("email");

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // Check document exists
    let mut rows = conn
        .query(
            "SELECT id, doc_number, customer_id, total FROM shop_documents \
             WHERE profile_id = ?1 AND (id = ?2 OR doc_number = ?2) LIMIT 1",
            turso_params![profile_id, invoice_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let real_id: String = row.get(0).map_err(|e| e.to_string())?;
        let doc_number: String = row.get(1).map_err(|e| e.to_string())?;
        let total: f64 = row.get(3).unwrap_or(0.0);

        conn.execute(
            "UPDATE shop_documents SET status = 'sent', updated_at = strftime('%s','now') WHERE id = ?1 AND profile_id = ?2",
            turso_params![real_id.clone(), profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

        Ok(json!({
            "invoice_id": real_id,
            "doc_number": doc_number,
            "total": total,
            "sent_via": channel,
            "status": "sent",
            "confirmation": format!("Invoice {} successfully sent via {}", doc_number, channel)
        }))
    } else {
        Err(format!("Invoice '{}' not found", invoice_id))
    }
}

/// Directly updates product pricing (selling price, cost price, markup %, MRP, discount) on shop_items.
pub async fn product_update_pricing(args: Value, ctx: &ToolCtx<'_>) -> Result<Value, String> {
    let sku_or_item = args
        .get("sku")
        .and_then(Value::as_str)
        .or_else(|| args.get("item").and_then(Value::as_str))
        .or_else(|| args.get("item_id").and_then(Value::as_str))
        .or_else(|| args.get("name").and_then(Value::as_str))
        .ok_or("Missing required field: sku or item")?;

    let conn = ctx.user_db;
    let profile_id = &ctx.profile_id;

    // 1. Resolve item
    let mut rows = conn
        .query(
            "SELECT id, name, sku, cost_price, price, default_mrp FROM shop_items \
             WHERE profile_id = ?1 AND (sku = ?2 OR id = ?2 OR LOWER(name) = LOWER(?2) OR name LIKE ?3) \
             ORDER BY CASE WHEN sku = ?2 THEN 0 WHEN id = ?2 THEN 1 WHEN LOWER(name) = LOWER(?2) THEN 2 ELSE 3 END LIMIT 1",
            turso_params![profile_id, sku_or_item, format!("%{}%", sku_or_item)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (item_id, item_name, sku_str, curr_cost, curr_price, curr_mrp) = if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        (
            row.get::<String>(0).map_err(|e| e.to_string())?,
            row.get::<String>(1).unwrap_or_else(|_| sku_or_item.to_string()),
            row.get::<Option<String>>(2).unwrap_or(None).unwrap_or_default(),
            row.get::<f64>(3).unwrap_or(0.0),
            row.get::<f64>(4).unwrap_or(0.0),
            row.get::<f64>(5).unwrap_or(0.0),
        )
    } else {
        return Err(format!("Item '{}' not found in product catalog", sku_or_item));
    };

    let new_cost_price = args
        .get("cost_price")
        .and_then(Value::as_f64)
        .or_else(|| args.get("cost").and_then(Value::as_f64));

    let effective_cost = new_cost_price.unwrap_or(curr_cost);

    let explicit_selling_price = args
        .get("selling_price")
        .and_then(Value::as_f64)
        .or_else(|| args.get("price").and_then(Value::as_f64));

    let markup_pct = args
        .get("markup_pct")
        .and_then(Value::as_f64)
        .or_else(|| args.get("markup").and_then(Value::as_f64));

    let target_selling_price = if let Some(sp) = explicit_selling_price {
        Some(sp)
    } else if let Some(m_pct) = markup_pct {
        if effective_cost > 0.0 {
            Some(((effective_cost * (1.0 + m_pct / 100.0)) * 100.0).round() / 100.0)
        } else {
            None
        }
    } else {
        None
    };

    let mrp_opt = args
        .get("mrp")
        .and_then(Value::as_f64)
        .or_else(|| args.get("default_mrp").and_then(Value::as_f64));

    let discount_pct_opt = args
        .get("discount_pct")
        .and_then(Value::as_f64)
        .or_else(|| args.get("discount").and_then(Value::as_f64));

    let mut update_clauses = vec![
        "updated_at = strftime('%s','now')".to_string(),
        "updated_by = ?1".to_string(),
    ];
    let mut update_params = vec![TursoParam::Text(ctx.agent_user_id.clone())];
    let mut param_num = 2;

    if let Some(cp) = new_cost_price {
        update_clauses.push(format!("cost_price = ?{}", param_num));
        update_params.push(TursoParam::Float(cp));
        param_num += 1;
    }
    if let Some(sp) = target_selling_price {
        update_clauses.push(format!("price = ?{}", param_num));
        update_params.push(TursoParam::Float(sp));
        param_num += 1;
    }
    if let Some(mrp) = mrp_opt {
        update_clauses.push(format!("default_mrp = ?{}", param_num));
        update_params.push(TursoParam::Float(mrp));
        param_num += 1;
    }
    if let Some(d_pct) = discount_pct_opt {
        update_clauses.push(format!("discount_pct = ?{}", param_num));
        update_params.push(TursoParam::Float(d_pct));
        param_num += 1;
    }
    if let Some(n) = args.get("notes").and_then(Value::as_str) {
        update_clauses.push(format!("notes = ?{}", param_num));
        update_params.push(TursoParam::Text(n.to_string()));
        param_num += 1;
    }
    if let Some(an) = args.get("agent_notes").and_then(Value::as_str) {
        update_clauses.push(format!("agent_notes = ?{}", param_num));
        update_params.push(TursoParam::Text(an.to_string()));
        param_num += 1;
    }

    update_params.push(TursoParam::Text(item_id.clone()));
    update_params.push(TursoParam::Text(profile_id.to_string()));

    let sql = format!(
        "UPDATE shop_items SET {} WHERE id = ?{} AND profile_id = ?{}",
        update_clauses.join(", "),
        param_num,
        param_num + 1
    );

    conn.execute(&sql, update_params)
        .await
        .map_err(|e| e.to_string())?;

    let final_price = target_selling_price.unwrap_or(curr_price);
    let final_cost = effective_cost;
    let margin_pct = if final_price > 0.0 && final_cost > 0.0 {
        (((final_price - final_cost) / final_price) * 10000.0).round() / 100.0
    } else {
        0.0
    };

    Ok(json!({
        "status": "success",
        "item_id": item_id,
        "item_name": item_name,
        "sku": sku_str,
        "cost_price": final_cost,
        "selling_price": final_price,
        "mrp": mrp_opt.unwrap_or(curr_mrp),
        "margin_pct": margin_pct,
        "message": format!("Updated pricing for '{}' (SKU: {}): Cost ₹{}, Selling Price ₹{} (Margin: {}%)", item_name, sku_str, final_cost, final_price, margin_pct)
    }))
}
