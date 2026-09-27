// src-tauri/src/commands/email_tracking.rs
//
// WHAT:  Email tracking analytics commands — newsletter stats, send records,
//        email health, and subscriber analytics.
//
// HOW:   Reads email_tracking_* and newsletter_* tables from UserDB.
//        The CF Worker records opens, clicks, bounces via tracking pixels
//        and redirects. The desktop app reads these tables for dashboard stats.
//
// FLOW:
//   get_email_health      → per-domain sending reputation (bounces, spam rate)
//   get_newsletter_stats  → per-campaign stats (sent, open rate, click rate)
//   list_newsletter_stats → all campaigns ordered by sent_at DESC
//   get_subscriber_analytics → aggregate subscriber growth, churn, list health
//
// TABLES READ:
//   email_tracking_stats  — aggregate per-campaign stats (open, click, bounce, unsub)
//   newsletter_sends      — one row per newsletter campaign sent
//   email_events          — raw events (opened, clicked, bounced, complained)
//   subscriber_analytics  — daily subscriber growth snapshots
//
// NOTE: The email_events table has DB-level triggers (defined in provision.rs)
//       that maintain the aggregate counts in email_tracking_stats automatically.
//
// REFERENCE: src/lib/email-tracking.ts + src/lib/email-tracking-service.ts

use crate::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct EmailHealthRow {
    pub profile_id: String,
    pub total_sent: i64,
    pub total_delivered: i64,
    pub total_opens: i64,
    pub total_clicks: i64,
    pub total_bounces: i64,
    pub total_complaints: i64,
    pub total_unsubscribes: i64,
    pub bounce_rate: f64,
    pub complaint_rate: f64,
    pub open_rate: f64,
    pub click_rate: f64,
    pub health_score: i64, // 0-100 composite score
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewsletterStatsRow {
    pub id: String,
    pub profile_id: String,
    pub campaign_id: Option<String>,
    pub subject: String,
    pub sent_count: i64,
    pub delivered_count: i64,
    pub open_count: i64,
    pub click_count: i64,
    pub bounce_count: i64,
    pub unsubscribe_count: i64,
    pub complaint_count: i64,
    pub open_rate: f64,
    pub click_rate: f64,
    pub sent_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubscriberAnalyticsRow {
    pub profile_id: String,
    pub date: String,
    pub total_subscribers: i64,
    pub new_subscribers: i64,
    pub unsubscribes: i64,
    pub net_growth: i64,
    pub active_rate: f64,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Get email health metrics for the active profile.
/// Reads the aggregate email_tracking_stats row (maintained by DB triggers).
#[tauri::command]
pub async fn get_email_health_stats(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<EmailHealthRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT profile_id,
                total_sent, total_delivered, total_opens, total_clicks,
                total_bounces, total_complaints, total_unsubscribes,
                CAST(total_bounces AS REAL) / MAX(total_sent, 1)     AS bounce_rate,
                CAST(total_complaints AS REAL) / MAX(total_sent, 1)  AS complaint_rate,
                CAST(total_opens AS REAL) / MAX(total_delivered, 1)  AS open_rate,
                CAST(total_clicks AS REAL) / MAX(total_opens, 1)     AS click_rate,
                CASE
                  WHEN CAST(total_bounces AS REAL)/MAX(total_sent,1) > 0.05 THEN 40
                  WHEN CAST(total_bounces AS REAL)/MAX(total_sent,1) > 0.02 THEN 70
                  ELSE 90
                END AS health_score,
                updated_at
         FROM email_tracking_stats WHERE profile_id=?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(EmailHealthRow {
            profile_id: row.get(0).map_err(|e| e.to_string())?,
            total_sent: row.get::<i64>(1).unwrap_or(0),
            total_delivered: row.get::<i64>(2).unwrap_or(0),
            total_opens: row.get::<i64>(3).unwrap_or(0),
            total_clicks: row.get::<i64>(4).unwrap_or(0),
            total_bounces: row.get::<i64>(5).unwrap_or(0),
            total_complaints: row.get::<i64>(6).unwrap_or(0),
            total_unsubscribes: row.get::<i64>(7).unwrap_or(0),
            bounce_rate: row.get::<f64>(8).unwrap_or(0.0),
            complaint_rate: row.get::<f64>(9).unwrap_or(0.0),
            open_rate: row.get::<f64>(10).unwrap_or(0.0),
            click_rate: row.get::<f64>(11).unwrap_or(0.0),
            health_score: row.get::<i64>(12).unwrap_or(90),
            updated_at: row.get::<i64>(13).unwrap_or(0),
        }))
    } else {
        Ok(None)
    }
}

/// Get stats for a specific newsletter campaign send.
#[tauri::command]
pub async fn get_newsletter_stats(
    campaign_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<NewsletterStatsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, campaign_id, subject,
                sent_count, delivered_count, open_count, click_count,
                bounce_count, unsubscribe_count, complaint_count,
                CAST(open_count AS REAL)/MAX(delivered_count,1)  AS open_rate,
                CAST(click_count AS REAL)/MAX(open_count,1)      AS click_rate,
                sent_at
         FROM newsletter_sends WHERE campaign_id=?1 AND profile_id=?2 LIMIT 1",
            crate::turso_params![campaign_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(newsletter_row_from(&row)?))
    } else {
        Ok(None)
    }
}

/// List all newsletter send stats for the active profile. Newest first.
#[tauri::command]
pub async fn list_newsletter_stats(
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<NewsletterStatsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, campaign_id, subject,
                sent_count, delivered_count, open_count, click_count,
                bounce_count, unsubscribe_count, complaint_count,
                CAST(open_count AS REAL)/MAX(delivered_count,1)  AS open_rate,
                CAST(click_count AS REAL)/MAX(open_count,1)      AS click_rate,
                sent_at
         FROM newsletter_sends WHERE profile_id=?1
         ORDER BY sent_at DESC LIMIT ?2",
            crate::turso_params![profile_id, limit.unwrap_or(50)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(newsletter_row_from(&row)?);
    }
    Ok(items)
}

/// Get subscriber growth analytics (daily snapshots).
/// Returns the most recent `days` snapshots ordered by date DESC.
#[tauri::command]
pub async fn get_subscriber_analytics(
    days: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SubscriberAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT profile_id, date,
                total_subscribers, new_subscribers, unsubscribes,
                (new_subscribers - unsubscribes) AS net_growth,
                CAST(total_subscribers - unsubscribes AS REAL) / MAX(total_subscribers,1) AS active_rate
         FROM subscriber_analytics WHERE profile_id=?1
         ORDER BY date DESC LIMIT ?2",
        crate::turso_params![profile_id, days.unwrap_or(30)],
    ).await.map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(SubscriberAnalyticsRow {
            profile_id: row.get(0).map_err(|e| e.to_string())?,
            date: row.get(1).map_err(|e| e.to_string())?,
            total_subscribers: row.get::<i64>(2).unwrap_or(0),
            new_subscribers: row.get::<i64>(3).unwrap_or(0),
            unsubscribes: row.get::<i64>(4).unwrap_or(0),
            net_growth: row.get::<i64>(5).unwrap_or(0),
            active_rate: row.get::<f64>(6).unwrap_or(0.0),
        });
    }
    Ok(items)
}

// ── Row extractor ─────────────────────────────────────────────────────────────

fn newsletter_row_from(row: &crate::db::turso::TursoRow) -> Result<NewsletterStatsRow, String> {
    Ok(NewsletterStatsRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        campaign_id: row.get(2).map_err(|e| e.to_string())?,
        subject: row.get(3).map_err(|e| e.to_string())?,
        sent_count: row.get::<i64>(4).unwrap_or(0),
        delivered_count: row.get::<i64>(5).unwrap_or(0),
        open_count: row.get::<i64>(6).unwrap_or(0),
        click_count: row.get::<i64>(7).unwrap_or(0),
        bounce_count: row.get::<i64>(8).unwrap_or(0),
        unsubscribe_count: row.get::<i64>(9).unwrap_or(0),
        complaint_count: row.get::<i64>(10).unwrap_or(0),
        open_rate: row.get::<f64>(11).unwrap_or(0.0),
        click_rate: row.get::<f64>(12).unwrap_or(0.0),
        sent_at: row.get::<i64>(13).unwrap_or(0),
    })
}
