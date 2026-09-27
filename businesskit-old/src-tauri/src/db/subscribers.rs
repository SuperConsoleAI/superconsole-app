// src-tauri/src/db/subscribers.rs
//
// WHAT:  Subscriber list management + email health tracking for the desktop app.
//
// HOW:   Operates entirely on the User's local Turso DB (no external API calls).
//        Reads/writes three tables:
//          • subscribers          — one row per email address, immutable once created
//                                   (can block/unsub but never hard-delete)
//          • newsletter_topics    — optional topic segments (e.g. "Weekly Digest", "Deals")
//          • email_tracking_stats — 1 row per profile, trigger-updated health counters
//          • email_events         — append-only event log (open/click/bounce/unsub)
//
// FLOW:  Frontend calls:
//          list_subscribers    → paginated + filtered list (active / blocked / unsubscribed)
//          get_subscriber      → single contact detail with event history
//          import_subscribers  → bulk INSERT OR IGNORE from CSV/paste
//          block_subscriber    → sets is_blocked=1, blocked_at, block_reason
//          unsubscribe_sub     → sets is_unsubscribed=1, unsubscribed_at
//          get_email_health    → reads email_tracking_stats for send/open/bounce rates
//          list_topics         → topic segments for this profile
//          create_topic        → new segment
//
//        The triggers in email-tracking.ts handle the stats counters automatically
//        whenever an email_events row is inserted (open/click/bounce/complaint/unsub).
//
//        Credentials (SES key, Resend key) are stored in the `credentials` table
//        and accessed via get_credentials / save_credentials commands in this file.

use crate::db::user::UserDb;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriberRow {
    pub id: String,
    pub profile_id: String,
    pub email: String,
    pub name: Option<String>,
    pub phone: Option<String>,
    pub referrer_domain: Option<String>,
    pub timezone: Option<String>,
    pub browser_name: Option<String>,
    pub os_name: Option<String>,
    pub device_type: Option<String>,
    pub country: Option<String>,
    pub city: Option<String>,
    pub is_blocked: bool,
    pub is_unsubscribed: bool,
    pub blocked_at: Option<i64>,
    pub unsubscribed_at: Option<i64>,
    pub block_reason: Option<String>,
    pub topics: String, // JSON string[]
    pub signup_timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListSubscribersOpts {
    pub status: Option<String>, // "active" | "blocked" | "unsubscribed" | "all"
    pub search: Option<String>, // email or name LIKE search
    pub topic: Option<String>,  // topic slug filter
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSubscriber {
    pub email: String,
    pub name: Option<String>,
    pub phone: Option<String>,
    pub topics: Option<String>, // JSON string[]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: i64,
    pub skipped: i64, // already exists (OR IGNORE)
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailHealthRow {
    pub profile_id: String,
    pub total_sent: i64,
    pub total_opens: i64,
    pub total_clicks: i64,
    pub total_unsubscribes: i64,
    pub total_bounces: i64,
    pub total_complaints: i64,
    pub total_subscribers: i64,
    pub total_blocked: i64,
    pub total_unsubscribed: i64,
    pub subscriber_7d: String,
    pub subscriber_30d: String,
    pub subscriber_12m: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialsRow {
    pub id: String,
    pub profile_id: String,
    pub ses_access_key: Option<String>,
    pub ses_secret_key: Option<String>, // stored encrypted via vault
    pub ses_region: Option<String>,
    pub ses_from_email: Option<String>,
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub resend_api_key: Option<String>,
    pub n8n_webhook_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveCredentialsData {
    pub ses_access_key: Option<String>,
    pub ses_secret_key: Option<String>,
    pub ses_region: Option<String>,
    pub ses_from_email: Option<String>,
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub resend_api_key: Option<String>,
    pub n8n_webhook_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailEventRow {
    pub id: i64,
    pub profile_id: String,
    pub subscriber_id: String,
    pub email: String,
    pub event_type: String,
    pub newsletter_id: Option<String>,
    pub click_url: Option<String>,
    pub country: Option<String>,
    pub created_at: String,
}

// ── SubscribersDb impl ────────────────────────────────────────────────────────

pub struct SubscribersDb<'a> {
    pub user_db: &'a UserDb,
}

impl<'a> SubscribersDb<'a> {
    pub fn new(user_db: &'a UserDb) -> Self {
        Self { user_db }
    }

    fn conn(&self) -> Result<crate::db::turso::TursoConn> {
        self.user_db.conn()
    }

    // ── Subscribers ───────────────────────────────────────────────────────────

    pub async fn list_subscribers(
        &self,
        profile_id: &str,
        opts: &ListSubscribersOpts,
    ) -> Result<Vec<SubscriberRow>> {
        let conn = self.conn()?;
        let limit = opts.limit.unwrap_or(100);
        let offset = opts.offset.unwrap_or(0);

        // Status filter maps to column conditions
        let status_filter = match opts.status.as_deref().unwrap_or("active") {
            "blocked" => "is_blocked = 1",
            "unsubscribed" => "is_unsubscribed = 1 AND is_blocked = 0",
            "all" => "1=1",
            _ => "is_blocked = 0 AND is_unsubscribed = 0", // "active"
        };

        let search_filter = if opts.search.is_some() {
            "(email LIKE ?3 OR name LIKE ?3)"
        } else {
            "1=1"
        };

        let sql = format!(
            "SELECT id, profile_id, email, name, phone, referrer_domain, timezone,
                    browser_name, os_name, device_type, country, city,
                    is_blocked, is_unsubscribed, blocked_at, unsubscribed_at, block_reason,
                    topics, signup_timestamp
             FROM subscribers
             WHERE profile_id = ?1 AND {} AND {}
             ORDER BY signup_timestamp DESC
             LIMIT ?{} OFFSET ?{}",
            status_filter,
            search_filter,
            if opts.search.is_some() { 4 } else { 3 },
            if opts.search.is_some() { 5 } else { 4 }
        );

        let mut params: Vec<crate::db::turso::TursoParam> = vec![profile_id.into()];
        if let Some(s) = &opts.search {
            // pad dummy for ?2 slot (unused — search is ?3)
            params.push(profile_id.into()); // placeholder ?2
            params.push(format!("%{}%", s).into());
        }
        params.push(limit.into());
        params.push(offset.into());

        let mut rows = conn.query(&sql, params).await?;
        let mut subs = Vec::new();
        while let Some(row) = rows.next().await? {
            subs.push(sub_from_row(&row)?);
        }
        Ok(subs)
    }

    pub async fn get_subscriber(&self, profile_id: &str, id: &str) -> Result<SubscriberRow> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, email, name, phone, referrer_domain, timezone,
                    browser_name, os_name, device_type, country, city,
                    is_blocked, is_unsubscribed, blocked_at, unsubscribed_at, block_reason,
                    topics, signup_timestamp
             FROM subscribers WHERE id = ?1 AND profile_id = ?2",
                crate::turso_params![id, profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            sub_from_row(&row)
        } else {
            Err(anyhow!("Subscriber not found: {}", id))
        }
    }

    /// Bulk import — INSERT OR IGNORE so duplicate emails are silently skipped.
    /// Returns counts of imported vs skipped.
    pub async fn import_subscribers(
        &self,
        profile_id: &str,
        items: Vec<ImportSubscriber>,
    ) -> Result<ImportResult> {
        let conn = self.conn()?;
        let total = items.len() as i64;
        let mut imported = 0i64;

        for item in items {
            let id = Uuid::new_v4().to_string();
            let result = conn
                .execute(
                    "INSERT OR IGNORE INTO subscribers
                   (id, profile_id, email, name, phone, topics, signup_timestamp)
                 VALUES (?1,?2,?3,?4,?5,COALESCE(?6,'[]'), unixepoch())",
                    crate::turso_params![
                        id,
                        profile_id,
                        item.email.clone(),
                        item.name.clone(),
                        item.phone.clone(),
                        item.topics.clone()
                    ],
                )
                .await?;
            if result > 0 {
                imported += 1;
            }
        }

        Ok(ImportResult {
            imported,
            skipped: total - imported,
            total,
        })
    }

    /// Block a subscriber (bounce / complaint). Never hard-deletes.
    pub async fn block_subscriber(
        &self,
        profile_id: &str,
        id: &str,
        reason: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE subscribers SET
               is_blocked = 1, blocked_at = unixepoch(),
               block_reason = COALESCE(?1, block_reason)
             WHERE id = ?2 AND profile_id = ?3",
            crate::turso_params![reason, id, profile_id],
        )
        .await?;
        Ok(())
    }

    /// Unsubscribe a subscriber. Sets is_unsubscribed=1, leaves row intact.
    pub async fn unsubscribe(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE subscribers SET
               is_unsubscribed = 1, unsubscribed_at = unixepoch()
             WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![id, profile_id],
        )
        .await?;
        Ok(())
    }

    /// Count of active (sendable) subscribers — not blocked, not unsubscribed.
    pub async fn count_active(&self, profile_id: &str) -> Result<i64> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT COUNT(*) FROM subscribers
             WHERE profile_id = ?1 AND is_blocked = 0 AND is_unsubscribed = 0",
                crate::turso_params![profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok(row.get::<i64>(0).unwrap_or(0))
        } else {
            Ok(0)
        }
    }

    /// Recent email events for a subscriber (newest first).
    pub async fn get_subscriber_events(
        &self,
        subscriber_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<EmailEventRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, subscriber_id, email, event_type,
                    newsletter_id, click_url, country, created_at
             FROM email_events WHERE subscriber_id = ?1
             ORDER BY created_at DESC LIMIT ?2",
                crate::turso_params![subscriber_id, limit.unwrap_or(50)],
            )
            .await?;
        let mut events = Vec::new();
        while let Some(row) = rows.next().await? {
            events.push(EmailEventRow {
                id: row.get::<i64>(0)?,
                profile_id: row.get(1)?,
                subscriber_id: row.get(2)?,
                email: row.get(3)?,
                event_type: row.get(4)?,
                newsletter_id: row.get(5)?,
                click_url: row.get(6)?,
                country: row.get(7)?,
                created_at: row.get(8)?,
            });
        }
        Ok(events)
    }

    // ── Email health ──────────────────────────────────────────────────────────

    /// Returns aggregate health stats — 1 row per profile (trigger-maintained).
    /// Creates a zeroed row if not yet initialised.
    pub async fn get_email_health(&self, profile_id: &str) -> Result<EmailHealthRow> {
        let conn = self.conn()?;

        // Ensure the row exists (first send or fresh DB)
        conn.execute(
            "INSERT OR IGNORE INTO email_tracking_stats (profile_id) VALUES (?1)",
            crate::turso_params![profile_id],
        )
        .await
        .ok();

        let mut rows = conn
            .query(
                "SELECT profile_id, total_sent, total_opens, total_clicks,
                    total_unsubscribes, total_bounces, total_complaints,
                    total_subscribers, total_blocked, total_unsubscribed,
                    subscriber_7d, subscriber_30d, subscriber_12m
             FROM email_tracking_stats WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(EmailHealthRow {
                profile_id: row.get(0)?,
                total_sent: row.get::<i64>(1).unwrap_or(0),
                total_opens: row.get::<i64>(2).unwrap_or(0),
                total_clicks: row.get::<i64>(3).unwrap_or(0),
                total_unsubscribes: row.get::<i64>(4).unwrap_or(0),
                total_bounces: row.get::<i64>(5).unwrap_or(0),
                total_complaints: row.get::<i64>(6).unwrap_or(0),
                total_subscribers: row.get::<i64>(7).unwrap_or(0),
                total_blocked: row.get::<i64>(8).unwrap_or(0),
                total_unsubscribed: row.get::<i64>(9).unwrap_or(0),
                subscriber_7d: row.get::<String>(10).unwrap_or_else(|_| "[]".to_string()),
                subscriber_30d: row.get::<String>(11).unwrap_or_else(|_| "[]".to_string()),
                subscriber_12m: row.get::<String>(12).unwrap_or_else(|_| "[]".to_string()),
            })
        } else {
            Err(anyhow!("email_tracking_stats row not found after insert"))
        }
    }

    // ── Newsletter topics ─────────────────────────────────────────────────────

    pub async fn list_topics(&self, profile_id: &str) -> Result<Vec<TopicRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, name, slug, description, is_active, created_at
             FROM newsletter_topics WHERE profile_id = ?1
             ORDER BY name ASC",
                crate::turso_params![profile_id],
            )
            .await?;
        let mut topics = Vec::new();
        while let Some(row) = rows.next().await? {
            topics.push(TopicRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                slug: row.get(3)?,
                description: row.get(4)?,
                is_active: row.get::<i64>(5).unwrap_or(1) != 0,
                created_at: row.get(6)?,
            });
        }
        Ok(topics)
    }

    pub async fn create_topic(
        &self,
        profile_id: &str,
        name: &str,
        slug: &str,
        description: Option<&str>,
    ) -> Result<TopicRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT OR IGNORE INTO newsletter_topics
               (id, profile_id, name, slug, description, created_at)
             VALUES (?1,?2,?3,?4,?5, unixepoch())",
            crate::turso_params![id.clone(), profile_id, name, slug, description],
        )
        .await?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, name, slug, description, is_active, created_at
             FROM newsletter_topics WHERE id = ?1",
                crate::turso_params![id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok(TopicRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                slug: row.get(3)?,
                description: row.get(4)?,
                is_active: row.get::<i64>(5).unwrap_or(1) != 0,
                created_at: row.get(6)?,
            })
        } else {
            Err(anyhow!(
                "Topic slug '{}' already exists for this profile",
                slug
            ))
        }
    }

    // ── Credentials (API keys) ────────────────────────────────────────────────

    /// Load stored API credentials for this profile.
    /// Note: secret_key fields are stored encrypted via vault — frontend decrypts.
    pub async fn get_credentials(&self, profile_id: &str) -> Result<Option<CredentialsRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, ses_access_key, ses_secret_key, ses_region,
                    ses_from_email, openai_api_key, anthropic_api_key,
                    resend_api_key, n8n_webhook_url
             FROM credentials WHERE profile_id = ?1 LIMIT 1",
                crate::turso_params![profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok(Some(CredentialsRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                ses_access_key: row.get(2)?,
                ses_secret_key: row.get(3)?,
                ses_region: row.get(4)?,
                ses_from_email: row.get(5)?,
                openai_api_key: row.get(6)?,
                anthropic_api_key: row.get(7)?,
                resend_api_key: row.get(8)?,
                n8n_webhook_url: row.get(9)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Upsert API credentials. Only supplied (Some) fields are written.
    pub async fn save_credentials(
        &self,
        profile_id: &str,
        data: &SaveCredentialsData,
    ) -> Result<CredentialsRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO credentials
               (id, profile_id, ses_access_key, ses_secret_key, ses_region,
                ses_from_email, openai_api_key, anthropic_api_key,
                resend_api_key, n8n_webhook_url,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10, unixepoch(), unixepoch())
             ON CONFLICT(profile_id) DO UPDATE SET
               ses_access_key    = COALESCE(?3,  ses_access_key),
               ses_secret_key    = COALESCE(?4,  ses_secret_key),
               ses_region        = COALESCE(?5,  ses_region),
               ses_from_email    = COALESCE(?6,  ses_from_email),
               openai_api_key    = COALESCE(?7,  openai_api_key),
               anthropic_api_key = COALESCE(?8,  anthropic_api_key),
               resend_api_key    = COALESCE(?9,  resend_api_key),
               n8n_webhook_url   = COALESCE(?10, n8n_webhook_url),
               updated_at        = unixepoch()",
            crate::turso_params![
                id,
                profile_id,
                data.ses_access_key.clone(),
                data.ses_secret_key.clone(),
                data.ses_region.clone(),
                data.ses_from_email.clone(),
                data.openai_api_key.clone(),
                data.anthropic_api_key.clone(),
                data.resend_api_key.clone(),
                data.n8n_webhook_url.clone()
            ],
        )
        .await?;
        Ok(self.get_credentials(profile_id).await?.unwrap())
    }
}

// ── Row extractor ─────────────────────────────────────────────────────────────

fn sub_from_row(row: &crate::db::turso::TursoRow) -> Result<SubscriberRow> {
    Ok(SubscriberRow {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        email: row.get(2)?,
        name: row.get(3)?,
        phone: row.get(4)?,
        referrer_domain: row.get(5)?,
        timezone: row.get(6)?,
        browser_name: row.get(7)?,
        os_name: row.get(8)?,
        device_type: row.get(9)?,
        country: row.get(10)?,
        city: row.get(11)?,
        is_blocked: row.get::<i64>(12).unwrap_or(0) != 0,
        is_unsubscribed: row.get::<i64>(13).unwrap_or(0) != 0,
        blocked_at: row.get(14)?,
        unsubscribed_at: row.get(15)?,
        block_reason: row.get(16)?,
        topics: row.get::<String>(17).unwrap_or_else(|_| "[]".to_string()),
        signup_timestamp: row.get(18)?,
    })
}
