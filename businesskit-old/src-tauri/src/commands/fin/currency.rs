// src-tauri/src/commands/fin/currency.rs
//
// Currency rates management — Phase 4 Money Matters.
// Stores conversion rates in `fin_currency_rates`.

use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct CurrencyRateItem {
    pub id: String,
    pub profile_id: String,
    pub from_currency: String,
    pub to_currency: String,
    pub rate: f64,
    pub rate_date: i64,
    pub source: String,
}

#[derive(Debug, Deserialize)]
pub struct SetCurrencyRateArgs {
    pub from_currency: String,
    pub to_currency: String,
    pub rate: f64,
    pub source: Option<String>,
}

// ── fin_list_currency_rates ──────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_list_currency_rates(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CurrencyRateItem>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare(
            "SELECT id, profile_id, from_currency, to_currency, rate, rate_date, source
             FROM fin_currency_rates
             WHERE profile_id = ?1
             ORDER BY from_currency ASC, to_currency ASC",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(r)) = rows.next().await {
        list.push(CurrencyRateItem {
            id: r.get(0).map_err(|e| e.to_string())?,
            profile_id: r.get(1).map_err(|e| e.to_string())?,
            from_currency: r.get(2).map_err(|e| e.to_string())?,
            to_currency: r.get(3).map_err(|e| e.to_string())?,
            rate: r.get(4).map_err(|e| e.to_string())?,
            rate_date: r.get(5).map_err(|e| e.to_string())?,
            source: r.get(6).unwrap_or_else(|_| "manual".into()),
        });
    }

    Ok(list)
}

// ── fin_set_currency_rate ────────────────────────────────────────────────────

#[tauri::command]
pub async fn fin_set_currency_rate(
    state: State<'_, Arc<AppState>>,
    args: SetCurrencyRateArgs,
) -> Result<CurrencyRateItem, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();
    let from_curr = args.from_currency.trim().to_uppercase();
    let to_curr = args.to_currency.trim().to_uppercase();
    let source = args.source.unwrap_or_else(|| "manual".into());
    let id = format!("{}_{}_{}", profile_id, from_curr, to_curr);

    conn.execute(
        "INSERT INTO fin_currency_rates (id, profile_id, from_currency, to_currency, rate, rate_date, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6)
         ON CONFLICT(id) DO UPDATE SET rate = excluded.rate, rate_date = excluded.rate_date, source = excluded.source",
        crate::turso_params![id.clone(), profile_id.clone(), from_curr.clone(), to_curr.clone(), args.rate, now, source.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(CurrencyRateItem {
        id,
        profile_id,
        from_currency: from_curr,
        to_currency: to_curr,
        rate: args.rate,
        rate_date: now,
        source,
    })
}

// ── fin_seed_currency_rates ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OpenErApiResponse {
    result: Option<String>,
    rates: std::collections::HashMap<String, f64>,
}

#[tauri::command]
pub async fn fin_seed_currency_rates(
    state: State<'_, Arc<AppState>>,
    base_currency: Option<String>,
) -> Result<usize, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let base = base_currency.unwrap_or_else(|| "INR".into()).to_uppercase();
    let now = Utc::now().timestamp();

    let target_currencies = [
        "USD", "EUR", "GBP", "INR", "AED", "SAR", "CAD", "AUD",
        "SGD", "JPY", "CHF", "CNY", "BRL", "ZAR", "MXN", "HKD",
        "SEK", "NOK", "DKK", "KRW", "THB", "MYR", "IDR", "VND",
    ];

    // Try fetching live exchange rates from open API
    let mut fetched_rates: Option<std::collections::HashMap<String, f64>> = None;
    let url = format!("https://open.er-api.com/v6/latest/{}", base);
    if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build() {
        if let Ok(res) = client.get(&url).send().await {
            if let Ok(api_res) = res.json::<OpenErApiResponse>().await {
                if api_res.result.as_deref() == Some("success") && !api_res.rates.is_empty() {
                    fetched_rates = Some(api_res.rates);
                }
            }
        }
    }

    let mut seeded = 0;

    if let Some(rates_map) = fetched_rates {
        // Live API rates successful
        for &code in &target_currencies {
            if code == base {
                continue;
            }
            if let Some(&rate_vs_base) = rates_map.get(code) {
                if rate_vs_base > 0.0 {
                    // 1 foreign unit = (1 / rate_vs_base) base units
                    let rate_in_base = 1.0 / rate_vs_base;
                    let id = format!("{}_{}_{}", profile_id, code, base);

                    conn.execute(
                        "INSERT INTO fin_currency_rates (id, profile_id, from_currency, to_currency, rate, rate_date, source, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'live_api', ?6)
                         ON CONFLICT(id) DO UPDATE SET rate = excluded.rate, rate_date = excluded.rate_date, source = excluded.source",
                        crate::turso_params![id, profile_id.clone(), code, base.clone(), rate_in_base, now],
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                    seeded += 1;
                }
            }
        }
    } else {
        // Fallback preset rates relative to USD (USD = 1.0)
        let usd_rates: &[(&str, f64)] = &[
            ("USD", 1.0),
            ("INR", 84.65),
            ("EUR", 0.925),
            ("GBP", 0.782),
            ("AED", 3.672),
            ("CAD", 1.378),
            ("AUD", 1.542),
            ("SGD", 1.348),
            ("JPY", 155.20),
            ("SAR", 3.751),
            ("CHF", 0.902),
            ("CNY", 7.245),
            ("BRL", 5.620),
            ("ZAR", 18.25),
            ("MXN", 19.85),
            ("HKD", 7.81),
            ("SEK", 10.65),
            ("NOK", 10.85),
            ("DKK", 6.90),
            ("KRW", 1380.0),
            ("THB", 36.50),
            ("MYR", 4.72),
            ("IDR", 16200.0),
            ("VND", 25400.0),
        ];

        let base_vs_usd = usd_rates
            .iter()
            .find(|(c, _)| *c == base.as_str())
            .map(|(_, r)| *r)
            .unwrap_or(1.0);

        for &(curr, usd_rate) in usd_rates {
            if curr == base {
                continue;
            }
            let rate = base_vs_usd / usd_rate;
            let id = format!("{}_{}_{}", profile_id, curr, base);

            conn.execute(
                "INSERT INTO fin_currency_rates (id, profile_id, from_currency, to_currency, rate, rate_date, source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'preset', ?6)
                 ON CONFLICT(id) DO UPDATE SET rate = excluded.rate, rate_date = excluded.rate_date, source = excluded.source",
                crate::turso_params![id, profile_id.clone(), curr, base.clone(), rate, now],
            )
            .await
            .map_err(|e| e.to_string())?;

            seeded += 1;
        }
    }

    Ok(seeded)
}
