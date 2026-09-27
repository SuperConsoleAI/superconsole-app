// src-tauri/src/commands/shop/shop_analytics.rs
//
// Pattern mirrors aggregate_analytics: ONE conn + ONE big SQL statement.
// Multiple sequential queries cause Turso HTTP to hang.
//
//   shop_get_billing_analytics      → INSERT OR IGNORE + fast SELECT (same conn)
//   shop_aggregate_billing_analytics → ONE CTE-based UPDATE (1 query, 1 round-trip)

use crate::AppState;
use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Shared response type ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingAnalytics {
    pub id: String,
    pub total_invoices: i64,
    pub total_revenue: f64,
    pub total_profit: f64,
    pub total_reservations: i64,
    pub total_cancellations: i64,
    pub total_no_shows: i64,
    pub total_booked_hours: f64,
    pub overall_occupancy_pct: f64,
    pub revenue_7d: String,
    pub revenue_30d: String,
    pub revenue_12m: String,
    pub profit_7d: String,
    pub profit_30d: String,
    pub profit_12m: String,
    pub occupancy_7d: String,
    pub occupancy_30d: String,
    pub occupancy_12m: String,
    pub revenue_lifetime: String,
    pub profit_lifetime: String,
    pub invoices_lifetime: String,
    pub occupancy_lifetime: String,
    pub city_breakdown: String,
    pub state_breakdown: String,
    pub country_breakdown: String,
    pub last_aggregated_at: String,
}

// ── Command 1: fast read ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn shop_get_billing_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<BillingAnalytics, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let analytics_id = format!("ba-{}", &profile_id[..profile_id.len().min(32)]);

    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO shop_billing_analytics (id, profile_id) VALUES (?1, ?2)",
        crate::turso_params![analytics_id.clone(), profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT id, total_invoices, total_revenue, total_profit,
                    COALESCE(total_reservations, 0), COALESCE(total_cancellations, 0),
                    COALESCE(total_no_shows, 0), COALESCE(total_booked_hours, 0.0),
                    COALESCE(overall_occupancy_pct, 0.0),
                    revenue_7d, profit_7d, revenue_30d, profit_30d,
                    revenue_12m, profit_12m,
                    COALESCE(occupancy_7d,'[]'), COALESCE(occupancy_30d,'[]'), COALESCE(occupancy_12m,'[]'),
                    revenue_lifetime, profit_lifetime,
                    COALESCE(invoices_lifetime,'{}'), COALESCE(occupancy_lifetime,'{}'),
                    COALESCE(city_breakdown,'{}'), COALESCE(state_breakdown,'{}'),
                    COALESCE(country_breakdown,'{}'), last_aggregated_at
             FROM shop_billing_analytics WHERE profile_id = ?1 LIMIT 1",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    match rows.next().await {
        Ok(Some(row)) => Ok(BillingAnalytics {
            id: row.get::<String>(0).unwrap_or(analytics_id),
            total_invoices: row.get::<i64>(1).unwrap_or(0),
            total_revenue: row.get::<f64>(2).unwrap_or(0.0),
            total_profit: row.get::<f64>(3).unwrap_or(0.0),
            total_reservations: row.get::<i64>(4).unwrap_or(0),
            total_cancellations: row.get::<i64>(5).unwrap_or(0),
            total_no_shows: row.get::<i64>(6).unwrap_or(0),
            total_booked_hours: row.get::<f64>(7).unwrap_or(0.0),
            overall_occupancy_pct: row.get::<f64>(8).unwrap_or(0.0),
            revenue_7d: row.get::<String>(9).unwrap_or_else(|_| "[]".into()),
            profit_7d: row.get::<String>(10).unwrap_or_else(|_| "[]".into()),
            revenue_30d: row.get::<String>(11).unwrap_or_else(|_| "[]".into()),
            profit_30d: row.get::<String>(12).unwrap_or_else(|_| "[]".into()),
            revenue_12m: row.get::<String>(13).unwrap_or_else(|_| "[]".into()),
            profit_12m: row.get::<String>(14).unwrap_or_else(|_| "[]".into()),
            occupancy_7d: row.get::<String>(15).unwrap_or_else(|_| "[]".into()),
            occupancy_30d: row.get::<String>(16).unwrap_or_else(|_| "[]".into()),
            occupancy_12m: row.get::<String>(17).unwrap_or_else(|_| "[]".into()),
            revenue_lifetime: row.get::<String>(18).unwrap_or_else(|_| "{}".into()),
            profit_lifetime: row.get::<String>(19).unwrap_or_else(|_| "{}".into()),
            invoices_lifetime: row.get::<String>(20).unwrap_or_else(|_| "{}".into()),
            occupancy_lifetime: row.get::<String>(21).unwrap_or_else(|_| "{}".into()),
            city_breakdown: row.get::<String>(22).unwrap_or_else(|_| "{}".into()),
            state_breakdown: row.get::<String>(23).unwrap_or_else(|_| "{}".into()),
            country_breakdown: row.get::<String>(24).unwrap_or_else(|_| "{}".into()),
            last_aggregated_at: row.get::<String>(25).unwrap_or_default(),
        }),
        Ok(None) => Ok(BillingAnalytics {
            id: analytics_id,
            total_invoices: 0,
            total_revenue: 0.0,
            total_profit: 0.0,
            total_reservations: 0,
            total_cancellations: 0,
            total_no_shows: 0,
            total_booked_hours: 0.0,
            overall_occupancy_pct: 0.0,
            revenue_7d: "[]".into(),
            profit_7d: "[]".into(),
            revenue_30d: "[]".into(),
            profit_30d: "[]".into(),
            revenue_12m: "[]".into(),
            profit_12m: "[]".into(),
            occupancy_7d: "[]".into(),
            occupancy_30d: "[]".into(),
            occupancy_12m: "[]".into(),
            revenue_lifetime: "{}".into(),
            profit_lifetime: "{}".into(),
            invoices_lifetime: "{}".into(),
            occupancy_lifetime: "{}".into(),
            city_breakdown: "{}".into(),
            state_breakdown: "{}".into(),
            country_breakdown: "{}".into(),
            last_aggregated_at: "never".into(),
        }),
        Err(e) => Err(e.to_string()),
    }
}

// ── Command 2: full aggregation — ONE query, ONE round-trip ──────────────────
//
// CTE-based UPDATE matching aggregate_analytics pattern.
// Geographic breakdown comes from city/state/country snapshot columns on shop_documents.

#[tauri::command]
pub async fn shop_aggregate_billing_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    log::debug!("[BA-AGG] called");
    let profile_id = state.require_profile().await?;
    log::debug!("[BA-AGG] profile_id ok");
    let db = state.require_user_db().await?;
    log::debug!("[BA-AGG] db ok");

    let now = Utc::now().timestamp();
    let now_iso = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let ts_7d = now - 7 * 86_400_i64;
    let ts_30d = now - 30 * 86_400_i64;
    let ts_12m = now - 365 * 86_400_i64;

    let conn = db.conn().map_err(|e| e.to_string())?;
    log::debug!("[BA-AGG] conn ok — sending single CTE UPDATE");

    // ONE query. ?1=profile_id  ?2=ts_7d  ?3=ts_30d  ?4=ts_12m  ?5=now_iso
    let sql = r#"
WITH
  inv AS (
    SELECT *
    FROM shop_documents
    WHERE profile_id = ?1
      AND doc_type   = 'invoice'
      AND status IN ('confirmed', 'paid', 'partial')
  ),
  totals AS (
    SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS rev, COALESCE(SUM(profit),0) AS prf
    FROM inv
  ),
  daily_7d AS (
    SELECT date(doc_date,'unixepoch') AS d, SUM(grand_total) AS rev, SUM(profit) AS prf, COUNT(*) AS cnt
    FROM inv WHERE doc_date >= ?2 GROUP BY d ORDER BY d
  ),
  daily_30d AS (
    SELECT date(doc_date,'unixepoch') AS d, SUM(grand_total) AS rev, SUM(profit) AS prf, COUNT(*) AS cnt
    FROM inv WHERE doc_date >= ?3 GROUP BY d ORDER BY d
  ),
  monthly_12m AS (
    SELECT strftime('%Y-%m', doc_date,'unixepoch') AS m, SUM(grand_total) AS rev, SUM(profit) AS prf, COUNT(*) AS cnt
    FROM inv WHERE doc_date >= ?4 GROUP BY m ORDER BY m
  ),
  yearly AS (
    SELECT strftime('%Y', doc_date,'unixepoch') AS y,
           SUM(grand_total) AS rev, SUM(profit) AS prf, COUNT(*) AS cnt
    FROM inv GROUP BY y
  ),
  city_bd AS (
    SELECT COALESCE(NULLIF(city,''),'Unknown') AS loc, SUM(grand_total) AS rev
    FROM inv WHERE city IS NOT NULL AND city != '' GROUP BY loc
  ),
  state_bd AS (
    SELECT COALESCE(NULLIF(state,''),'Unknown') AS loc, SUM(grand_total) AS rev
    FROM inv WHERE state IS NOT NULL AND state != '' GROUP BY loc
  ),
  country_bd AS (
    SELECT COALESCE(NULLIF(country,''),'Unknown') AS loc, SUM(grand_total) AS rev
    FROM inv WHERE country IS NOT NULL AND country != '' GROUP BY loc
  ),
  res AS (
    SELECT
      COUNT(DISTINCT id)                                                            AS total_res,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)                          AS total_canc,
      SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END)                            AS total_ns,
      SUM(total_qty * 2.0)                                                            AS booked_hrs,
      ROUND(MIN(100.0, (COUNT(DISTINCT id) * 100.0) / 30.0), 1)                      AS occ_pct
    FROM shop_documents
    WHERE profile_id = ?1
  )
UPDATE shop_billing_analytics SET
  total_invoices        = COALESCE((SELECT cnt FROM totals), 0),
  total_revenue         = COALESCE((SELECT rev FROM totals), 0.0),
  total_profit          = COALESCE((SELECT prf FROM totals), 0.0),
  total_reservations    = COALESCE((SELECT total_res FROM res), 0),
  total_cancellations   = COALESCE((SELECT total_canc FROM res), 0),
  total_no_shows        = COALESCE((SELECT total_ns FROM res), 0),
  total_booked_hours    = COALESCE((SELECT booked_hrs FROM res), 0.0),
  overall_occupancy_pct = COALESCE((SELECT occ_pct FROM res), 0.0),
  revenue_7d            = COALESCE((SELECT json_group_array(json_object('date',d,'revenue',rev,'invoices',cnt)) FROM daily_7d),'[]'),
  profit_7d             = COALESCE((SELECT json_group_array(json_object('date',d,'profit',prf,'invoices',cnt)) FROM daily_7d),'[]'),
  revenue_30d           = COALESCE((SELECT json_group_array(json_object('date',d,'revenue',rev,'invoices',cnt)) FROM daily_30d),'[]'),
  profit_30d            = COALESCE((SELECT json_group_array(json_object('date',d,'profit',prf,'invoices',cnt)) FROM daily_30d),'[]'),
  revenue_12m           = COALESCE((SELECT json_group_array(json_object('date',m,'revenue',rev,'invoices',cnt)) FROM monthly_12m),'[]'),
  profit_12m            = COALESCE((SELECT json_group_array(json_object('date',m,'profit',prf,'invoices',cnt)) FROM monthly_12m),'[]'),
  occupancy_7d          = COALESCE((SELECT json_group_array(json_object('date',d,'occupancy_pct',ROUND(MIN(100.0, (cnt * 100.0)/4.0), 1))) FROM daily_7d),'[]'),
  occupancy_30d         = COALESCE((SELECT json_group_array(json_object('date',d,'occupancy_pct',ROUND(MIN(100.0, (cnt * 100.0)/4.0), 1))) FROM daily_30d),'[]'),
  occupancy_12m         = COALESCE((SELECT json_group_array(json_object('date',m,'occupancy_pct',ROUND(MIN(100.0, (cnt * 100.0)/40.0), 1))) FROM monthly_12m),'[]'),
  revenue_lifetime      = COALESCE((SELECT json_group_object(y, rev) FROM yearly),'{}'),
  profit_lifetime       = COALESCE((SELECT json_group_object(y, prf) FROM yearly),'{}'),
  invoices_lifetime     = COALESCE((SELECT json_group_object(y, cnt) FROM yearly),'{}'),
  occupancy_lifetime    = COALESCE((SELECT json_group_object(y, ROUND(MIN(100.0, (cnt * 100.0)/500.0), 1)) FROM yearly),'{}'),
  city_breakdown        = COALESCE((SELECT json_group_object(loc, rev) FROM city_bd),'{}'),
  state_breakdown       = COALESCE((SELECT json_group_object(loc, rev) FROM state_bd),'{}'),
  country_breakdown     = COALESCE((SELECT json_group_object(loc, rev) FROM country_bd),'{}'),
  last_aggregated_at    = ?5,
  updated_at            = ?5
WHERE profile_id = ?1
    "#;

    match tokio::time::timeout(
        std::time::Duration::from_secs(30),
        conn.execute(
            sql,
            crate::turso_params![profile_id, ts_7d, ts_30d, ts_12m, now_iso],
        ),
    )
    .await
    {
        Ok(Ok(_)) => {
            log::debug!("[BA-AGG] UPDATE ok — done");
            Ok(())
        }
        Ok(Err(e)) => {
            log::warn!("[BA-AGG] UPDATE FAILED: {e}");
            Err(e.to_string())
        }
        Err(_) => {
            log::warn!("[BA-AGG] TIMEOUT >30s");
            Err("Aggregate timed out".into())
        }
    }
}

// ── ItemBillingAnalytics type ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemBillingAnalytics {
    pub id: String,
    pub item_id: String,
    pub item_name: String,
    pub total_invoices: i64,
    pub total_units: f64,
    pub total_revenue: f64,
    pub total_profit: f64,
    pub total_cost: f64,
    pub total_discount: f64,
    pub total_reservations: i64,
    pub total_cancellations: i64,
    pub total_no_shows: i64,
    pub total_booked_hours: f64,
    pub occupancy_pct: f64,
    pub capacity_utilization: f64,
    pub avg_booking_duration: f64,
    pub revpar: f64,
    pub revenue_7d: String,
    pub revenue_30d: String,
    pub revenue_12m: String,
    pub profit_7d: String,
    pub profit_30d: String,
    pub profit_12m: String,
    pub occupancy_7d: String,
    pub occupancy_30d: String,
    pub occupancy_12m: String,
    pub city_breakdown: String,
    pub state_breakdown: String,
    pub country_breakdown: String,
    pub revenue_lifetime: String,
    pub profit_lifetime: String,
    pub invoices_lifetime: String,
    pub units_lifetime: String,
    pub occupancy_lifetime: String,
    pub last_aggregated_at: String,
}

// ── shop_get_item_billing_analytics ──────────────────────────────────────────
// Fast read for one item — triggers INSERT OR IGNORE to bootstrap row.

#[tauri::command]
pub async fn shop_get_item_billing_analytics(
    item_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ItemBillingAnalytics, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let row_id = format!(
        "iba-{}-{}",
        &profile_id[..profile_id.len().min(16)],
        &item_id[..item_id.len().min(16)]
    );

    // Bootstrap row if not yet aggregated
    conn.execute(
        "INSERT OR IGNORE INTO shop_item_billing_analytics (id, profile_id, item_id) VALUES (?1, ?2, ?3)",
        crate::turso_params![row_id.clone(), profile_id.clone(), item_id.clone()],
    ).await.map_err(|e| e.to_string())?;

    let stmt = conn.prepare(
        "SELECT a.id, a.item_id, COALESCE(NULLIF(a.item_name,''), i.name, a.item_id),
                a.total_invoices, a.total_units, a.total_revenue, a.total_profit, a.total_cost, a.total_discount,
                COALESCE(a.total_reservations, 0), COALESCE(a.total_cancellations, 0), COALESCE(a.total_no_shows, 0),
                COALESCE(a.total_booked_hours, 0.0), COALESCE(a.occupancy_pct, 0.0), COALESCE(a.capacity_utilization, 0.0),
                COALESCE(a.avg_booking_duration, 0.0), COALESCE(a.revpar, 0.0),
                COALESCE(a.revenue_7d,'[]'), COALESCE(a.revenue_30d,'[]'), COALESCE(a.revenue_12m,'[]'),
                COALESCE(a.profit_7d,'[]'),  COALESCE(a.profit_30d,'[]'),  COALESCE(a.profit_12m,'[]'),
                COALESCE(a.occupancy_7d,'[]'), COALESCE(a.occupancy_30d,'[]'), COALESCE(a.occupancy_12m,'[]'),
                COALESCE(a.city_breakdown,'{}'), COALESCE(a.state_breakdown,'{}'), COALESCE(a.country_breakdown,'{}'),
                COALESCE(a.revenue_lifetime,'{}'), COALESCE(a.profit_lifetime,'{}'),
                COALESCE(a.invoices_lifetime,'{}'), COALESCE(a.units_lifetime,'{}'), COALESCE(a.occupancy_lifetime,'{}'),
                a.last_aggregated_at
         FROM shop_item_billing_analytics a
         LEFT JOIN shop_items i ON a.item_id = i.id AND a.profile_id = i.profile_id
         WHERE a.profile_id = ?1 AND a.item_id = ?2 LIMIT 1",
    ).await.map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id, item_id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    match rows.next().await {
        Ok(Some(row)) => Ok(ItemBillingAnalytics {
            id: row.get::<String>(0).unwrap_or(row_id),
            item_id: row.get::<String>(1).unwrap_or(item_id),
            item_name: row.get::<String>(2).unwrap_or_default(),
            total_invoices: row.get::<i64>(3).unwrap_or(0),
            total_units: row.get::<f64>(4).unwrap_or(0.0),
            total_revenue: row.get::<f64>(5).unwrap_or(0.0),
            total_profit: row.get::<f64>(6).unwrap_or(0.0),
            total_cost: row.get::<f64>(7).unwrap_or(0.0),
            total_discount: row.get::<f64>(8).unwrap_or(0.0),
            total_reservations: row.get::<i64>(9).unwrap_or(0),
            total_cancellations: row.get::<i64>(10).unwrap_or(0),
            total_no_shows: row.get::<i64>(11).unwrap_or(0),
            total_booked_hours: row.get::<f64>(12).unwrap_or(0.0),
            occupancy_pct: row.get::<f64>(13).unwrap_or(0.0),
            capacity_utilization: row.get::<f64>(14).unwrap_or(0.0),
            avg_booking_duration: row.get::<f64>(15).unwrap_or(0.0),
            revpar: row.get::<f64>(16).unwrap_or(0.0),
            revenue_7d: row.get::<String>(17).unwrap_or_else(|_| "[]".into()),
            revenue_30d: row.get::<String>(18).unwrap_or_else(|_| "[]".into()),
            revenue_12m: row.get::<String>(19).unwrap_or_else(|_| "[]".into()),
            profit_7d: row.get::<String>(20).unwrap_or_else(|_| "[]".into()),
            profit_30d: row.get::<String>(21).unwrap_or_else(|_| "[]".into()),
            profit_12m: row.get::<String>(22).unwrap_or_else(|_| "[]".into()),
            occupancy_7d: row.get::<String>(23).unwrap_or_else(|_| "[]".into()),
            occupancy_30d: row.get::<String>(24).unwrap_or_else(|_| "[]".into()),
            occupancy_12m: row.get::<String>(25).unwrap_or_else(|_| "[]".into()),
            city_breakdown: row.get::<String>(26).unwrap_or_else(|_| "{}".into()),
            state_breakdown: row.get::<String>(27).unwrap_or_else(|_| "{}".into()),
            country_breakdown: row.get::<String>(28).unwrap_or_else(|_| "{}".into()),
            revenue_lifetime: row.get::<String>(29).unwrap_or_else(|_| "{}".into()),
            profit_lifetime: row.get::<String>(30).unwrap_or_else(|_| "{}".into()),
            invoices_lifetime: row.get::<String>(31).unwrap_or_else(|_| "{}".into()),
            units_lifetime: row.get::<String>(32).unwrap_or_else(|_| "{}".into()),
            occupancy_lifetime: row.get::<String>(33).unwrap_or_else(|_| "{}".into()),
            last_aggregated_at: row.get::<String>(34).unwrap_or_else(|_| "never".into()),
        }),
        _ => Err("Item analytics row not found".into()),
    }
}

// ── shop_aggregate_item_billing_analytics ─────────────────────────────────────
// One query per item using a CTE UPDATE — same pattern as the global aggregate.
// Re-aggregates ALL items for this profile in one pass using GROUP BY item_id.

#[tauri::command]
pub async fn shop_aggregate_item_billing_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();
    let now_iso = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let ts_7d = now - 7 * 86_400_i64;
    let ts_30d = now - 30 * 86_400_i64;
    let ts_12m = now - 365 * 86_400_i64;

    // Step 1: Upsert one row per item from shop_items catalog AND from document lines
    let upsert_sql_1 = r#"
INSERT OR IGNORE INTO shop_item_billing_analytics (id, profile_id, item_id, item_name)
SELECT
  'iba-' || substr(?1, 1, 16) || '-' || substr(si.id, 1, 16),
  ?1,
  si.id,
  si.name
FROM shop_items si
WHERE si.profile_id = ?1 AND (si.archived = 0 OR si.archived IS NULL)
    "#;
    let _ = conn.execute(upsert_sql_1, crate::turso_params![profile_id.clone()]).await;

    let upsert_sql_2 = r#"
INSERT OR IGNORE INTO shop_item_billing_analytics (id, profile_id, item_id, item_name)
SELECT
  'iba-' || substr(?1, 1, 16) || '-' || substr(l.item_id, 1, 16),
  ?1,
  l.item_id,
  COALESCE(si.name, l.description, l.item_id)
FROM shop_document_lines l
JOIN shop_documents d ON d.id = l.document_id
LEFT JOIN shop_items si ON si.id = l.item_id AND si.profile_id = ?1
WHERE d.profile_id = ?1 AND d.doc_type = 'invoice' AND d.status IN ('confirmed','paid','partial')
GROUP BY l.item_id
    "#;
    let _ = conn.execute(upsert_sql_2, crate::turso_params![profile_id.clone()]).await;

    // Step 2: CTE UPDATE — recompute all columns for every item in one statement
    // ?1=profile_id  ?2=ts_7d  ?3=ts_30d  ?4=ts_12m  ?5=now_iso
    let sql = r#"
WITH
  lines AS (
    SELECT
      l.item_id,
      l.qty,
      l.line_total                               AS revenue,
      (l.unit_price - l.unit_cost) * l.qty      AS profit,
      l.unit_cost * l.qty                        AS cost,
      l.discount_amt                             AS discount,
      d.id                                       AS doc_id,
      d.doc_date,
      COALESCE(NULLIF(d.city,''),'')             AS city,
      COALESCE(NULLIF(d.state,''),'')            AS state,
      COALESCE(NULLIF(d.country,''),'')          AS country
    FROM shop_document_lines l
    JOIN shop_documents d ON d.id = l.document_id
    WHERE d.profile_id = ?1
      AND d.doc_type   = 'invoice'
      AND d.status IN ('confirmed','paid','partial')
  ),
  totals AS (
    SELECT item_id,
      COUNT(DISTINCT doc_id)   AS inv_cnt,
      SUM(qty)                 AS units,
      SUM(revenue)             AS rev,
      SUM(profit)              AS prf,
      SUM(cost)                AS cst,
      SUM(discount)            AS disc
    FROM lines GROUP BY item_id
  ),
  daily_7d AS (
    SELECT item_id, date(doc_date,'unixepoch') AS d,
      SUM(revenue) AS rev, SUM(profit) AS prf, SUM(qty) AS units, COUNT(*) AS cnt
    FROM lines WHERE doc_date >= ?2 GROUP BY item_id, d ORDER BY d
  ),
  daily_30d AS (
    SELECT item_id, date(doc_date,'unixepoch') AS d,
      SUM(revenue) AS rev, SUM(profit) AS prf, SUM(qty) AS units, COUNT(*) AS cnt
    FROM lines WHERE doc_date >= ?3 GROUP BY item_id, d ORDER BY d
  ),
  monthly_12m AS (
    SELECT item_id, strftime('%Y-%m', doc_date,'unixepoch') AS m,
      SUM(revenue) AS rev, SUM(profit) AS prf, SUM(qty) AS units, COUNT(*) AS cnt
    FROM lines WHERE doc_date >= ?4 GROUP BY item_id, m ORDER BY m
  ),
  yearly AS (
    SELECT item_id, strftime('%Y', doc_date,'unixepoch') AS y,
      SUM(revenue) AS rev, SUM(profit) AS prf, COUNT(*) AS cnt, SUM(qty) AS units
    FROM lines GROUP BY item_id, y
  ),
  city_bd AS (
    SELECT item_id, city AS loc, SUM(revenue) AS rev
    FROM lines WHERE city != '' GROUP BY item_id, loc
  ),
  state_bd AS (
    SELECT item_id, state AS loc, SUM(revenue) AS rev
    FROM lines WHERE state != '' GROUP BY item_id, loc
  ),
  country_bd AS (
    SELECT item_id, country AS loc, SUM(revenue) AS rev
    FROM lines WHERE country != '' GROUP BY item_id, loc
  ),
  book_totals AS (
    SELECT
      l.item_id,
      COUNT(DISTINCT d.id)                                                            AS reservations,
      SUM(CASE WHEN d.status = 'cancelled' THEN 1 ELSE 0 END)                          AS cancellations,
      SUM(CASE WHEN d.status = 'no_show' THEN 1 ELSE 0 END)                            AS no_shows,
      SUM(l.qty * 2.0)                                                                AS booked_hours,
      ROUND(MIN(100.0, (COUNT(DISTINCT d.id) * 100.0) / 30.0), 1)                      AS occ_pct,
      ROUND(MIN(100.0, (SUM(l.qty) * 100.0) / 100.0), 1)                               AS cap_util,
      ROUND(AVG(120.0), 0)                                                           AS avg_dur,
      ROUND(SUM(l.line_total) / 30.0, 2)                                              AS rpar
    FROM shop_document_lines l
    JOIN shop_documents d ON d.id = l.document_id
    WHERE d.profile_id = ?1
    GROUP BY l.item_id
  )
UPDATE shop_item_billing_analytics SET
  total_invoices       = COALESCE((SELECT inv_cnt  FROM totals t WHERE t.item_id = shop_item_billing_analytics.item_id), 0),
  total_units          = COALESCE((SELECT units    FROM totals t WHERE t.item_id = shop_item_billing_analytics.item_id), 0.0),
  total_revenue        = COALESCE((SELECT rev      FROM totals t WHERE t.item_id = shop_item_billing_analytics.item_id), 0.0),
  total_profit         = COALESCE((SELECT prf      FROM totals t WHERE t.item_id = shop_item_billing_analytics.item_id), 0.0),
  total_cost           = COALESCE((SELECT cst      FROM totals t WHERE t.item_id = shop_item_billing_analytics.item_id), 0.0),
  total_discount       = COALESCE((SELECT disc     FROM totals t WHERE t.item_id = shop_item_billing_analytics.item_id), 0.0),
  total_reservations   = COALESCE((SELECT reservations FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0),
  total_cancellations  = COALESCE((SELECT cancellations FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0),
  total_no_shows       = COALESCE((SELECT no_shows FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0),
  total_booked_hours   = COALESCE((SELECT booked_hours FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0.0),
  occupancy_pct        = COALESCE((SELECT occ_pct FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0.0),
  capacity_utilization = COALESCE((SELECT cap_util FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0.0),
  avg_booking_duration = COALESCE((SELECT avg_dur FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0.0),
  revpar               = COALESCE((SELECT rpar FROM book_totals bt WHERE bt.item_id = shop_item_billing_analytics.item_id), 0.0),
  revenue_7d        = COALESCE((SELECT json_group_array(json_object('date',d,'revenue',rev,'profit',prf,'units',units,'invoices',cnt)) FROM daily_7d  dd WHERE dd.item_id = shop_item_billing_analytics.item_id),'[]'),
  profit_7d         = COALESCE((SELECT json_group_array(json_object('date',d,'revenue',rev,'profit',prf,'units',units,'invoices',cnt)) FROM daily_7d  dd WHERE dd.item_id = shop_item_billing_analytics.item_id),'[]'),
  revenue_30d       = COALESCE((SELECT json_group_array(json_object('date',d,'revenue',rev,'profit',prf,'units',units,'invoices',cnt)) FROM daily_30d dd WHERE dd.item_id = shop_item_billing_analytics.item_id),'[]'),
  profit_30d        = COALESCE((SELECT json_group_array(json_object('date',d,'revenue',rev,'profit',prf,'units',units,'invoices',cnt)) FROM daily_30d dd WHERE dd.item_id = shop_item_billing_analytics.item_id),'[]'),
  revenue_12m       = COALESCE((SELECT json_group_array(json_object('date',m,'revenue',rev,'profit',prf,'units',units,'invoices',cnt)) FROM monthly_12m mm WHERE mm.item_id = shop_item_billing_analytics.item_id),'[]'),
  profit_12m        = COALESCE((SELECT json_group_array(json_object('date',m,'revenue',rev,'profit',prf,'units',units,'invoices',cnt)) FROM monthly_12m mm WHERE mm.item_id = shop_item_billing_analytics.item_id),'[]'),
  occupancy_7d      = COALESCE((SELECT json_group_array(json_object('date',d,'occupancy_pct',ROUND(MIN(100.0, (cnt * 100.0)/4.0), 1))) FROM daily_7d  dd WHERE dd.item_id = shop_item_billing_analytics.item_id),'[]'),
  occupancy_30d     = COALESCE((SELECT json_group_array(json_object('date',d,'occupancy_pct',ROUND(MIN(100.0, (cnt * 100.0)/4.0), 1))) FROM daily_30d dd WHERE dd.item_id = shop_item_billing_analytics.item_id),'[]'),
  occupancy_12m     = COALESCE((SELECT json_group_array(json_object('date',m,'occupancy_pct',ROUND(MIN(100.0, (cnt * 100.0)/40.0), 1))) FROM monthly_12m mm WHERE mm.item_id = shop_item_billing_analytics.item_id),'[]'),
  city_breakdown    = COALESCE((SELECT json_group_object(loc, rev) FROM city_bd    cb WHERE cb.item_id = shop_item_billing_analytics.item_id),'{}'),
  state_breakdown   = COALESCE((SELECT json_group_object(loc, rev) FROM state_bd   sb WHERE sb.item_id = shop_item_billing_analytics.item_id),'{}'),
  country_breakdown = COALESCE((SELECT json_group_object(loc, rev) FROM country_bd ob WHERE ob.item_id = shop_item_billing_analytics.item_id),'{}'),
  revenue_lifetime  = COALESCE((SELECT json_group_object(y, rev)   FROM yearly yr  WHERE yr.item_id  = shop_item_billing_analytics.item_id),'{}'),
  profit_lifetime   = COALESCE((SELECT json_group_object(y, prf)   FROM yearly yr  WHERE yr.item_id  = shop_item_billing_analytics.item_id),'{}'),
  invoices_lifetime = COALESCE((SELECT json_group_object(y, cnt)   FROM yearly yr  WHERE yr.item_id  = shop_item_billing_analytics.item_id),'{}'),
  units_lifetime    = COALESCE((SELECT json_group_object(y, units)  FROM yearly yr  WHERE yr.item_id  = shop_item_billing_analytics.item_id),'{}'),
  occupancy_lifetime = COALESCE((SELECT json_group_object(y, ROUND(MIN(100.0, (cnt * 100.0)/500.0), 1)) FROM yearly yr WHERE yr.item_id = shop_item_billing_analytics.item_id),'{}'),
  last_aggregated_at = ?5,
  updated_at         = ?5
WHERE profile_id = ?1
    "#;

    match tokio::time::timeout(
        std::time::Duration::from_secs(60),
        conn.execute(
            sql,
            crate::turso_params![profile_id, ts_7d, ts_30d, ts_12m, now_iso],
        ),
    )
    .await
    {
        Ok(Ok(_)) => {
            log::debug!("[IBA-AGG] UPDATE ok");
            Ok(())
        }
        Ok(Err(e)) => {
            log::warn!("[IBA-AGG] UPDATE FAILED: {e}");
            Err(e.to_string())
        }
        Err(_) => Err("Item aggregate timed out".into()),
    }
}

// ── Service-Mode Daily & Monthly Analytics ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceModeSegment {
    pub service_mode: String,
    pub orders_count: i64,
    pub revenue: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyServiceModeAnalytics {
    pub snapshot_date: i64,
    pub total_orders: i64,
    pub total_revenue: f64,
    pub segments: Vec<ServiceModeSegment>,
}

#[tauri::command]
pub async fn shop_aggregate_daily_analytics(
    snapshot_date: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();
    let target_ts = snapshot_date.unwrap_or(now);
    let start_of_day = (target_ts / 86400) * 86400;
    let end_of_day = start_of_day + 86400;

    // 1. Clean up existing rows for this date to ensure no stale segments linger after cancellation
    let _ = conn.execute(
        "DELETE FROM shop_daily_analytics WHERE profile_id = ?1 AND snapshot_date = ?2",
        crate::turso_params![profile_id.clone(), start_of_day],
    ).await;

    // 2. Aggregate active invoices for the day grouped by service_mode
    let stmt = conn.prepare(
        "SELECT service_mode, COUNT(*) as cnt, COALESCE(SUM(grand_total), 0.0) as rev, \
                COALESCE(SUM(discount_amt), 0.0) as disc, COALESCE(SUM(tax_amount), 0.0) as tax, \
                COALESCE(SUM(profit), 0.0) as prf \
         FROM shop_documents \
         WHERE profile_id = ?1 AND doc_type = 'invoice' AND status NOT IN ('cancelled', 'draft') \
           AND doc_date >= ?2 AND doc_date < ?3 \
         GROUP BY service_mode"
    ).await.map_err(|e| e.to_string())?;

    let mut rows = stmt.query(crate::turso_params![profile_id.clone(), start_of_day, end_of_day])
        .await.map_err(|e| e.to_string())?;

    let mut total_orders = 0_i64;
    let mut total_revenue = 0.0_f64;
    let mut total_disc = 0.0_f64;
    let mut total_tax = 0.0_f64;
    let mut total_profit = 0.0_f64;

    while let Ok(Some(row)) = rows.next().await {
        let smode: String = row.get(0).unwrap_or_else(|_| "dine_in".into());
        let cnt: i64 = row.get(1).unwrap_or(0);
        let rev: f64 = row.get(2).unwrap_or(0.0);
        let disc: f64 = row.get(3).unwrap_or(0.0);
        let tax: f64 = row.get(4).unwrap_or(0.0);
        let prf: f64 = row.get(5).unwrap_or(0.0);

        total_orders += cnt;
        total_revenue += rev;
        total_disc += disc;
        total_tax += tax;
        total_profit += prf;

        let sid = format!("sda-{}-{}-all-{}", profile_id, start_of_day, smode);
        let _ = conn.execute(
            "INSERT INTO shop_daily_analytics \
             (id, profile_id, snapshot_date, item_type, service_mode, orders_count, revenue, gross_margin, discount_given, tax_collected, net_revenue, updated_at) \
             VALUES (?1, ?2, ?3, 'all', ?4, ?5, ?6, ?7, ?8, ?9, ?10, unixepoch()) \
             ON CONFLICT (profile_id, snapshot_date, item_type, service_mode) DO UPDATE SET \
             orders_count = excluded.orders_count, revenue = excluded.revenue, gross_margin = excluded.gross_margin, \
             discount_given = excluded.discount_given, tax_collected = excluded.tax_collected, net_revenue = excluded.net_revenue, updated_at = unixepoch()",
            crate::turso_params![sid, profile_id.clone(), start_of_day, smode, cnt, rev, prf, disc, tax, rev - disc],
        ).await;
    }

    // 3. Insert grand total row ('all', 'all')
    let total_id = format!("sda-{}-{}-all-all", profile_id, start_of_day);
    let _ = conn.execute(
        "INSERT INTO shop_daily_analytics \
         (id, profile_id, snapshot_date, item_type, service_mode, orders_count, revenue, gross_margin, discount_given, tax_collected, net_revenue, updated_at) \
         VALUES (?1, ?2, ?3, 'all', 'all', ?4, ?5, ?6, ?7, ?8, ?9, unixepoch()) \
         ON CONFLICT (profile_id, snapshot_date, item_type, service_mode) DO UPDATE SET \
         orders_count = excluded.orders_count, revenue = excluded.revenue, gross_margin = excluded.gross_margin, \
         discount_given = excluded.discount_given, tax_collected = excluded.tax_collected, net_revenue = excluded.net_revenue, updated_at = unixepoch()",
        crate::turso_params![total_id, profile_id.clone(), start_of_day, total_orders, total_revenue, total_profit, total_disc, total_tax, total_revenue - total_disc],
    ).await;

    Ok(())
}

#[tauri::command]
pub async fn shop_aggregate_monthly_analytics(
    snapshot_month: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();
    let target_ts = snapshot_month.unwrap_or(now);

    // Normalize to 1st of month UTC
    let target_dt = chrono::DateTime::from_timestamp(target_ts, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    let start_of_month = chrono::NaiveDate::from_ymd_opt(target_dt.year(), target_dt.month(), 1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|dt| dt.and_utc().timestamp())
        .unwrap_or(target_ts);

    let (next_year, next_month) = if target_dt.month() == 12 {
        (target_dt.year() + 1, 1)
    } else {
        (target_dt.year(), target_dt.month() + 1)
    };
    let end_of_month = chrono::NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|dt| dt.and_utc().timestamp())
        .unwrap_or(start_of_month + 31 * 86400);

    // 1. Clean up existing rows for this month
    let _ = conn.execute(
        "DELETE FROM shop_monthly_analytics WHERE profile_id = ?1 AND snapshot_month = ?2",
        crate::turso_params![profile_id.clone(), start_of_month],
    ).await;

    // 2. Aggregate directly from shop_daily_analytics
    let stmt = conn.prepare(
        "SELECT item_type, service_mode, \
                SUM(orders_count) as cnt, \
                SUM(revenue) as rev, \
                SUM(cost) as cst, \
                SUM(gross_margin) as gm, \
                SUM(discount_given) as disc, \
                SUM(tax_collected) as tax, \
                SUM(refunds) as ref, \
                SUM(net_revenue) as net_rev \
         FROM shop_daily_analytics \
         WHERE profile_id = ?1 AND snapshot_date >= ?2 AND snapshot_date < ?3 \
         GROUP BY item_type, service_mode"
    ).await.map_err(|e| e.to_string())?;

    let mut rows = stmt.query(crate::turso_params![profile_id.clone(), start_of_month, end_of_month])
        .await.map_err(|e| e.to_string())?;

    while let Ok(Some(row)) = rows.next().await {
        let itype: String = row.get(0).unwrap_or_else(|_| "all".into());
        let smode: String = row.get(1).unwrap_or_else(|_| "all".into());
        let cnt: i64 = row.get(2).unwrap_or(0);
        let rev: f64 = row.get(3).unwrap_or(0.0);
        let cst: f64 = row.get(4).unwrap_or(0.0);
        let gm: f64 = row.get(5).unwrap_or(0.0);
        let disc: f64 = row.get(6).unwrap_or(0.0);
        let tax: f64 = row.get(7).unwrap_or(0.0);
        let ref_amt: f64 = row.get(8).unwrap_or(0.0);
        let net_rev: f64 = row.get(9).unwrap_or(0.0);

        let mid = format!("sma-{}-{}-{}-{}", profile_id, start_of_month, itype, smode);
        let _ = conn.execute(
            "INSERT INTO shop_monthly_analytics \
             (id, profile_id, snapshot_month, item_type, service_mode, orders_count, revenue, cost, gross_margin, discount_given, tax_collected, refunds, net_revenue, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, unixepoch()) \
             ON CONFLICT (profile_id, snapshot_month, item_type, service_mode) DO UPDATE SET \
             orders_count = excluded.orders_count, revenue = excluded.revenue, cost = excluded.cost, gross_margin = excluded.gross_margin, \
             discount_given = excluded.discount_given, tax_collected = excluded.tax_collected, refunds = excluded.refunds, net_revenue = excluded.net_revenue, updated_at = unixepoch()",
            crate::turso_params![mid, profile_id.clone(), start_of_month, itype, smode, cnt, rev, cst, gm, disc, tax, ref_amt, net_rev],
        ).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn shop_get_service_mode_analytics(
    date: Option<i64>,
    range: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<DailyServiceModeAnalytics, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();
    let target_ts = date.unwrap_or(now);
    let start_of_day = (target_ts / 86400) * 86400;

    let range_str = range.as_deref().unwrap_or("today").to_lowercase();

    // Trigger on-demand daily aggregation for target date
    shop_aggregate_daily_analytics(Some(start_of_day), state.clone()).await?;

    let mut segments = Vec::new();
    let mut total_orders = 0_i64;
    let mut total_revenue = 0.0_f64;

    if range_str == "12m" || range_str == "yearly" || range_str == "lifetime" {
        // Long range (12m+): Route directly to shop_monthly_analytics for high-speed multi-month aggregation
        let target_dt = chrono::DateTime::from_timestamp(target_ts, 0)
            .unwrap_or_else(|| chrono::Utc::now());
        let cur_month_start = chrono::NaiveDate::from_ymd_opt(target_dt.year(), target_dt.month(), 1)
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .map(|dt| dt.and_utc().timestamp())
            .unwrap_or(target_ts);
        
        // Trigger monthly aggregation for current month
        shop_aggregate_monthly_analytics(Some(cur_month_start), state.clone()).await?;

        let start_12m = cur_month_start - (365 * 86400);

        let stmt = conn.prepare(
            "SELECT service_mode, SUM(orders_count) as cnt, SUM(revenue) as rev \
             FROM shop_monthly_analytics \
             WHERE profile_id = ?1 AND snapshot_month >= ?2 AND item_type = 'all' AND service_mode != 'all' \
             GROUP BY service_mode \
             ORDER BY cnt DESC"
        ).await.map_err(|e| e.to_string())?;

        let mut rows = stmt.query(crate::turso_params![profile_id.clone(), start_12m])
            .await.map_err(|e| e.to_string())?;

        while let Ok(Some(row)) = rows.next().await {
            let mode: String = row.get(0).unwrap_or_default();
            let cnt: i64 = row.get(1).unwrap_or(0);
            let rev: f64 = row.get(2).unwrap_or(0.0);

            total_orders += cnt;
            total_revenue += rev;
            segments.push((mode, cnt, rev));
        }
    } else if range_str == "7d" || range_str == "30d" {
        // Short range (7d / 30d): Query shop_daily_analytics over rolling window
        let days_back = if range_str == "7d" { 7 } else { 30 };
        let start_window = start_of_day - (days_back * 86400);

        let stmt = conn.prepare(
            "SELECT service_mode, SUM(orders_count) as cnt, SUM(revenue) as rev \
             FROM shop_daily_analytics \
             WHERE profile_id = ?1 AND snapshot_date >= ?2 AND snapshot_date <= ?3 AND item_type = 'all' AND service_mode != 'all' \
             GROUP BY service_mode \
             ORDER BY cnt DESC"
        ).await.map_err(|e| e.to_string())?;

        let mut rows = stmt.query(crate::turso_params![profile_id.clone(), start_window, start_of_day])
            .await.map_err(|e| e.to_string())?;

        while let Ok(Some(row)) = rows.next().await {
            let mode: String = row.get(0).unwrap_or_default();
            let cnt: i64 = row.get(1).unwrap_or(0);
            let rev: f64 = row.get(2).unwrap_or(0.0);

            total_orders += cnt;
            total_revenue += rev;
            segments.push((mode, cnt, rev));
        }
    } else {
        // Default: Single day snapshot from shop_daily_analytics
        let stmt = conn.prepare(
            "SELECT service_mode, orders_count, revenue \
             FROM shop_daily_analytics \
             WHERE profile_id = ?1 AND snapshot_date = ?2 AND item_type = 'all' AND service_mode != 'all' \
             ORDER BY orders_count DESC"
        ).await.map_err(|e| e.to_string())?;

        let mut rows = stmt.query(crate::turso_params![profile_id.clone(), start_of_day])
            .await.map_err(|e| e.to_string())?;

        while let Ok(Some(row)) = rows.next().await {
            let mode: String = row.get(0).unwrap_or_default();
            let cnt: i64 = row.get(1).unwrap_or(0);
            let rev: f64 = row.get(2).unwrap_or(0.0);

            total_orders += cnt;
            total_revenue += rev;
            segments.push((mode, cnt, rev));
        }
    }

    let result_segments = segments.into_iter().map(|(mode, cnt, rev)| {
        let pct = if total_orders > 0 {
            ((cnt as f64 / total_orders as f64) * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        };
        ServiceModeSegment {
            service_mode: mode,
            orders_count: cnt,
            revenue: rev,
            percentage: pct,
        }
    }).collect();

    Ok(DailyServiceModeAnalytics {
        snapshot_date: start_of_day,
        total_orders,
        total_revenue,
        segments: result_segments,
    })
}

