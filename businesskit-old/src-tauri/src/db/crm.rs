// src-tauri/src/db/crm.rs
// CRM DB queries — contacts, deals, activities, tasks, notes, groups, templates.
// All queries parameterized. All run against UserDb.

use crate::db::user::UserDb;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Contact ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactRow {
    pub id: String,
    pub profile_id: String,
    pub user_id: Option<String>,
    pub first_name: String,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub avatar_url: Option<String>,
    pub company: Option<String>,
    pub job_title: Option<String>,
    pub website: Option<String>,
    pub contact_type: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub timezone: Option<String>,
    pub platform: Option<String>,
    pub platform_username: Option<String>,
    pub platform_url: Option<String>,
    pub social_links: String,
    pub bio: Option<String>,
    pub pain_point: Option<String>,
    pub lead_score: i64,
    pub icp_match: String,
    pub urgency: String,
    pub buying_intent: String,
    pub outreach_status: String,
    pub outreach_attempts: i64,
    pub next_follow_up_at: Option<i64>,
    pub next_action: Option<String>,
    pub status: String,
    pub source: Option<String>,
    pub tags: String,
    pub custom_fields: String,
    pub notes: Option<String>,
    pub groups: String,
    pub total_spent_cents: i64,
    pub total_purchases: i64,
    pub agent_status: String,
    pub archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContactData {
    pub first_name: String,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub avatar_url: Option<String>,
    pub company: Option<String>,
    pub job_title: Option<String>,
    pub website: Option<String>,
    pub contact_type: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub platform: Option<String>,
    pub platform_username: Option<String>,
    pub platform_url: Option<String>,
    pub social_links: Option<String>,
    pub bio: Option<String>,
    pub source: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateContactData {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub company: Option<String>,
    pub job_title: Option<String>,
    pub website: Option<String>,
    pub avatar_url: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub status: Option<String>,
    pub outreach_status: Option<String>,
    pub next_follow_up_at: Option<i64>,
    pub next_action: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub lead_score: Option<i64>,
    pub icp_match: Option<String>,
    pub urgency: Option<String>,
    pub pain_point: Option<String>,
    pub agent_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListContactsOpts {
    pub status: Option<String>,
    pub outreach_status: Option<String>,
    pub agent_status: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ── Deal ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DealRow {
    pub id: String,
    pub profile_id: String,
    pub contact_id: String,
    pub title: String,
    pub value_cents: i64,
    pub currency: String,
    pub stage: String,
    pub probability: i64,
    pub expected_close_at: Option<i64>,
    pub closed_at: Option<i64>,
    pub lost_reason: Option<String>,
    pub notes: Option<String>,
    pub product_id: Option<String>,
    pub line_items: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDealData {
    pub contact_id: String,
    pub title: String,
    pub value_cents: Option<i64>,
    pub currency: Option<String>,
    pub stage: Option<String>,
    pub probability: Option<i64>,
    pub expected_close_at: Option<i64>,
    pub product_id: Option<String>,
    pub notes: Option<String>,
}

// ── Activity ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityRow {
    pub id: String,
    pub profile_id: String,
    pub contact_id: String,
    pub deal_id: Option<String>,
    pub activity_type: String,
    pub direction: String,
    pub sender: String,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub outcome: Option<String>,
    pub metadata: String,
    pub approval_status: Option<String>,
    pub read_at: Option<i64>,
    pub occurred_at: i64,
    pub created_at: i64,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogActivityData {
    pub contact_id: String,
    pub deal_id: Option<String>,
    pub activity_type: String,
    pub direction: Option<String>,
    pub sender: Option<String>,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub outcome: Option<String>,
    pub metadata: Option<String>,
    pub approval_status: Option<String>,
    pub occurred_at: Option<i64>,
    pub idempotency_key: Option<String>,
}

// ── Task ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRow {
    pub id: String,
    pub profile_id: String,
    pub contact_id: Option<String>,
    pub deal_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub due_at: Option<i64>,
    pub priority: String,
    pub status: String,
    pub completed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskData {
    pub contact_id: Option<String>,
    pub deal_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub due_at: Option<i64>,
    pub priority: Option<String>,
    pub idempotency_key: Option<String>,
}

// ── Note ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteRow {
    pub id: String,
    pub profile_id: String,
    pub contact_id: String,
    pub deal_id: Option<String>,
    pub body: String,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

// ── Group ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub contact_count: i64,
    pub created_at: i64,
}

// ── Template ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub template_type: String,
    pub subject: Option<String>,
    pub body: String,
    pub platform: Option<String>,
    pub tags: String,
    pub use_count: i64,
    pub reply_rate_pct: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTemplateData {
    pub name: String,
    pub template_type: String,
    pub subject: Option<String>,
    pub body: String,
    pub platform: Option<String>,
    pub tags: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub template_id: String,
    pub channel: String,
    pub audience_filter: String,
    pub status: String,
    pub total_recipients: i64,
    pub sent_count: i64,
    pub failed_count: i64,
    pub scheduled_at: Option<i64>,
    pub sent_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCampaignData {
    pub name: String,
    pub template_id: String,
    pub channel: String,
    pub audience_filter: Option<String>,
    pub scheduled_at: Option<i64>,
}

// ── CrmDb impl ────────────────────────────────────────────────────────────────

pub struct CrmDb<'a> {
    pub user_db: &'a UserDb,
}

impl<'a> CrmDb<'a> {
    pub fn new(user_db: &'a UserDb) -> Self {
        Self { user_db }
    }

    fn conn(&self) -> Result<crate::db::turso::TursoConn> {
        self.user_db.conn()
    }

    // ── Contacts ──────────────────────────────────────────────────────────────

    pub async fn list_contacts(
        &self,
        profile_id: &str,
        opts: &ListContactsOpts,
    ) -> Result<Vec<ContactRow>> {
        let conn = self.conn()?;
        let limit = opts.limit.unwrap_or(50);
        let offset = opts.offset.unwrap_or(0);

        // Build dynamic WHERE clause
        let mut conditions = vec!["profile_id = ?1".to_string(), "archived = 0".to_string()];
        let mut param_idx = 2usize;
        let mut extra_params: Vec<String> = Vec::new();

        if let Some(s) = &opts.status {
            conditions.push(format!("status = ?{}", param_idx));
            extra_params.push(s.clone());
            param_idx += 1;
        }
        if let Some(s) = &opts.outreach_status {
            conditions.push(format!("outreach_status = ?{}", param_idx));
            extra_params.push(s.clone());
            param_idx += 1;
        }
        if let Some(s) = &opts.agent_status {
            conditions.push(format!("agent_status = ?{}", param_idx));
            extra_params.push(s.clone());
            param_idx += 1;
        }
        if let Some(s) = &opts.search {
            conditions.push(format!(
                "(first_name LIKE ?{0} OR last_name LIKE ?{0} OR email LIKE ?{0} OR company LIKE ?{0})",
                param_idx
            ));
            extra_params.push(format!("%{}%", s));
            param_idx += 1;
        }

        let where_clause = conditions.join(" AND ");
        let sql = format!(
            "SELECT id, profile_id, user_id, first_name, last_name, email, phone,
                    avatar_url, company, job_title, website, contact_type,
                    city, country, timezone, platform, platform_username, platform_url,
                    social_links, bio, pain_point, lead_score, icp_match, urgency,
                    buying_intent, outreach_status, outreach_attempts, next_follow_up_at,
                    next_action, status, source, tags, custom_fields, notes, groups,
                    total_spent_cents, total_purchases, agent_status, archived,
                    created_at, updated_at
             FROM crm_contacts
             WHERE {}
             ORDER BY last_activity_at DESC, created_at DESC
             LIMIT ?{} OFFSET ?{}",
            where_clause,
            param_idx,
            param_idx + 1
        );

        // Build params dynamically — libsql needs a Vec<crate::db::turso::TursoParam>
        let mut params: Vec<crate::db::turso::TursoParam> = vec![profile_id.into()];
        for p in extra_params {
            params.push(p.into());
        }
        params.push(limit.into());
        params.push(offset.into());

        let mut rows = conn.query(&sql, params).await?;
        let mut contacts = Vec::new();
        while let Some(row) = rows.next().await? {
            contacts.push(contact_from_row(&row)?);
        }
        Ok(contacts)
    }

    pub async fn get_contact(&self, profile_id: &str, id: &str) -> Result<ContactRow> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, user_id, first_name, last_name, email, phone,
                    avatar_url, company, job_title, website, contact_type,
                    city, country, timezone, platform, platform_username, platform_url,
                    social_links, bio, pain_point, lead_score, icp_match, urgency,
                    buying_intent, outreach_status, outreach_attempts, next_follow_up_at,
                    next_action, status, source, tags, custom_fields, notes, groups,
                    total_spent_cents, total_purchases, agent_status, archived,
                    created_at, updated_at
             FROM crm_contacts WHERE id = ?1 AND profile_id = ?2",
                crate::turso_params![id, profile_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            contact_from_row(&row)
        } else {
            Err(anyhow!("Contact not found: {}", id))
        }
    }

    pub async fn create_contact(
        &self,
        profile_id: &str,
        data: &CreateContactData,
    ) -> Result<ContactRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT OR IGNORE INTO crm_contacts
               (id, profile_id, first_name, last_name, email, phone,
                avatar_url, company, job_title, website, contact_type,
                city, country, platform, platform_username, platform_url,
                social_links, bio, source, tags, notes, message,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,
                     COALESCE(?11,'professional'),?12,?13,?14,?15,?16,
                     COALESCE(?17,'[]'),?18,?19,COALESCE(?20,'[]'),?21,?22,
                     unixepoch(), unixepoch())",
            crate::turso_params![
                id.clone(),
                profile_id,
                data.first_name.clone(),
                data.last_name.clone(),
                data.email.clone(),
                data.phone.clone(),
                data.avatar_url.clone(),
                data.company.clone(),
                data.job_title.clone(),
                data.website.clone(),
                data.contact_type.clone(),
                data.city.clone(),
                data.country.clone(),
                data.platform.clone(),
                data.platform_username.clone(),
                data.platform_url.clone(),
                data.social_links.clone(),
                data.bio.clone(),
                data.source.clone(),
                data.tags.clone(),
                data.notes.clone(),
                data.message.clone()
            ],
        )
        .await?;
        self.get_contact(profile_id, &id).await
    }

    pub async fn update_contact(
        &self,
        profile_id: &str,
        id: &str,
        data: &UpdateContactData,
    ) -> Result<ContactRow> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_contacts SET
               first_name       = COALESCE(?1,  first_name),
               last_name        = COALESCE(?2,  last_name),
               email            = COALESCE(?3,  email),
               phone            = COALESCE(?4,  phone),
               company          = COALESCE(?5,  company),
               job_title        = COALESCE(?6,  job_title),
               website          = COALESCE(?7,  website),
               avatar_url       = COALESCE(?8,  avatar_url),
               city             = COALESCE(?9,  city),
               country          = COALESCE(?10, country),
               status           = COALESCE(?11, status),
               outreach_status  = COALESCE(?12, outreach_status),
               next_follow_up_at= COALESCE(?13, next_follow_up_at),
               next_action      = COALESCE(?14, next_action),
               tags             = COALESCE(?15, tags),
               notes            = COALESCE(?16, notes),
               lead_score       = COALESCE(?17, lead_score),
               icp_match        = COALESCE(?18, icp_match),
               urgency          = COALESCE(?19, urgency),
               pain_point       = COALESCE(?20, pain_point),
               agent_status     = COALESCE(?21, agent_status),
               last_activity_at = unixepoch(),
               updated_at       = unixepoch()
             WHERE id = ?22 AND profile_id = ?23",
            crate::turso_params![
                data.first_name.clone(),
                data.last_name.clone(),
                data.email.clone(),
                data.phone.clone(),
                data.company.clone(),
                data.job_title.clone(),
                data.website.clone(),
                data.avatar_url.clone(),
                data.city.clone(),
                data.country.clone(),
                data.status.clone(),
                data.outreach_status.clone(),
                data.next_follow_up_at,
                data.next_action.clone(),
                data.tags.clone(),
                data.notes.clone(),
                data.lead_score,
                data.icp_match.clone(),
                data.urgency.clone(),
                data.pain_point.clone(),
                data.agent_status.clone(),
                id,
                profile_id
            ],
        )
        .await?;
        self.get_contact(profile_id, id).await
    }

    pub async fn archive_contact(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_contacts SET archived = 1, updated_at = unixepoch()
             WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![id, profile_id],
        )
        .await?;
        Ok(())
    }

    // ── Deals ─────────────────────────────────────────────────────────────────

    pub async fn list_deals(
        &self,
        profile_id: &str,
        contact_id: Option<&str>,
    ) -> Result<Vec<DealRow>> {
        let conn = self.conn()?;
        let mut rows = if let Some(cid) = contact_id {
            conn.query(
                "SELECT id, profile_id, contact_id, title, value_cents, currency,
                        stage, probability, expected_close_at, closed_at, lost_reason,
                        notes, product_id, line_items, created_at, updated_at
                 FROM crm_deals WHERE profile_id = ?1 AND contact_id = ?2
                 ORDER BY created_at DESC",
                crate::turso_params![profile_id, cid],
            )
            .await?
        } else {
            conn.query(
                "SELECT id, profile_id, contact_id, title, value_cents, currency,
                        stage, probability, expected_close_at, closed_at, lost_reason,
                        notes, product_id, line_items, created_at, updated_at
                 FROM crm_deals WHERE profile_id = ?1
                 ORDER BY created_at DESC",
                crate::turso_params![profile_id],
            )
            .await?
        };
        let mut deals = Vec::new();
        while let Some(row) = rows.next().await? {
            deals.push(deal_from_row(&row)?);
        }
        Ok(deals)
    }

    pub async fn create_deal(&self, profile_id: &str, data: &CreateDealData) -> Result<DealRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO crm_deals
               (id, profile_id, contact_id, title, value_cents, currency,
                stage, probability, expected_close_at, product_id, notes,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,COALESCE(?5,0),COALESCE(?6,'usd'),
                     COALESCE(?7,'new'),COALESCE(?8,0),?9,?10,?11,
                     unixepoch(), unixepoch())",
            crate::turso_params![
                id.clone(),
                profile_id,
                data.contact_id.clone(),
                data.title.clone(),
                data.value_cents,
                data.currency.clone(),
                data.stage.clone(),
                data.probability,
                data.expected_close_at,
                data.product_id.clone(),
                data.notes.clone()
            ],
        )
        .await?;

        // Touch contact activity
        conn.execute(
            "UPDATE crm_contacts SET last_activity_at = unixepoch()
             WHERE id = ?1",
            crate::turso_params![data.contact_id.clone()],
        )
        .await
        .ok();

        let mut rows = conn
            .query(
                "SELECT id, profile_id, contact_id, title, value_cents, currency,
                    stage, probability, expected_close_at, closed_at, lost_reason,
                    notes, product_id, line_items, created_at, updated_at
             FROM crm_deals WHERE id = ?1",
                crate::turso_params![id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            deal_from_row(&row)
        } else {
            Err(anyhow!("Deal insert failed"))
        }
    }

    pub async fn update_deal_stage(
        &self,
        profile_id: &str,
        id: &str,
        stage: &str,
        lost_reason: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn()?;
        let closed_at: Option<i64> = if stage == "won" || stage == "lost" {
            Some(chrono::Utc::now().timestamp())
        } else {
            None
        };
        conn.execute(
            "UPDATE crm_deals SET
               stage = ?1,
               lost_reason = COALESCE(?2, lost_reason),
               closed_at = COALESCE(?3, closed_at),
               updated_at = unixepoch()
             WHERE id = ?4 AND profile_id = ?5",
            crate::turso_params![stage, lost_reason, closed_at, id, profile_id],
        )
        .await?;
        Ok(())
    }

    // ── Activities ────────────────────────────────────────────────────────────

    pub async fn log_activity(
        &self,
        profile_id: &str,
        data: &LogActivityData,
    ) -> Result<ActivityRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT OR IGNORE INTO crm_activities
               (id, profile_id, contact_id, deal_id, type, direction, sender,
                subject, body, outcome, metadata, approval_status,
                occurred_at, created_at, idempotency_key)
             VALUES (?1,?2,?3,?4,?5,COALESCE(?6,'outbound'),COALESCE(?7,'you'),
                     ?8,?9,?10,COALESCE(?11,'{}'),COALESCE(?12,'auto_sent'),
                     COALESCE(?13,?14),?14,?15)",
            crate::turso_params![
                id.clone(),
                profile_id,
                data.contact_id.clone(),
                data.deal_id.clone(),
                data.activity_type.clone(),
                data.direction.clone(),
                data.sender.clone(),
                data.subject.clone(),
                data.body.clone(),
                data.outcome.clone(),
                data.metadata.clone(),
                data.approval_status.clone(),
                data.occurred_at,
                now,
                data.idempotency_key.clone()
            ],
        )
        .await?;

        // Touch contact last_activity_at
        conn.execute(
            "UPDATE crm_contacts SET last_activity_at = unixepoch(),
                    outreach_attempts = outreach_attempts + 1
             WHERE id = ?1",
            crate::turso_params![data.contact_id.clone()],
        )
        .await
        .ok();

        let mut rows = conn
            .query(
                "SELECT id, profile_id, contact_id, deal_id, type, direction, sender,
                    subject, body, outcome, metadata, approval_status,
                    read_at, occurred_at, created_at, idempotency_key
             FROM crm_activities WHERE id = ?1",
                crate::turso_params![id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            activity_from_row(&row)
        } else {
            Err(anyhow!("Activity insert failed"))
        }
    }

    pub async fn list_activities(
        &self,
        contact_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<ActivityRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, contact_id, deal_id, type, direction, sender,
                    subject, body, outcome, metadata, approval_status,
                    read_at, occurred_at, created_at, idempotency_key
             FROM crm_activities WHERE contact_id = ?1
             ORDER BY occurred_at DESC LIMIT ?2",
                crate::turso_params![contact_id, limit.unwrap_or(50)],
            )
            .await?;
        let mut acts = Vec::new();
        while let Some(row) = rows.next().await? {
            acts.push(activity_from_row(&row)?);
        }
        Ok(acts)
    }

    pub async fn list_pending_approvals(&self, profile_id: &str) -> Result<Vec<ActivityRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, contact_id, deal_id, type, direction, sender,
                    subject, body, outcome, metadata, approval_status,
                    read_at, occurred_at, created_at, idempotency_key
             FROM crm_activities
             WHERE profile_id = ?1 AND approval_status = 'pending_approval'
             ORDER BY created_at ASC",
                crate::turso_params![profile_id],
            )
            .await?;
        let mut acts = Vec::new();
        while let Some(row) = rows.next().await? {
            acts.push(activity_from_row(&row)?);
        }
        Ok(acts)
    }

    pub async fn approve_activity(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_activities SET
               approval_status = 'approved', approved_at = unixepoch()
             WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![id, profile_id],
        )
        .await?;
        Ok(())
    }

    pub async fn reject_activity(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_activities SET approval_status = 'rejected'
             WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![id, profile_id],
        )
        .await?;
        Ok(())
    }

    pub async fn mark_activity_read(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_activities SET read_at = unixepoch()
             WHERE id = ?1 AND profile_id = ?2 AND read_at IS NULL",
            crate::turso_params![id, profile_id],
        )
        .await?;
        Ok(())
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────

    pub async fn list_tasks(
        &self,
        profile_id: &str,
        contact_id: Option<&str>,
        status: Option<&str>,
    ) -> Result<Vec<TaskRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, contact_id, deal_id, title, description,
                    due_at, priority, status, completed_at, created_at, updated_at
             FROM crm_tasks
             WHERE profile_id = ?1
               AND (?2 IS NULL OR contact_id = ?2)
               AND (?3 IS NULL OR status = ?3)
             ORDER BY due_at ASC, created_at ASC",
                crate::turso_params![profile_id, contact_id, status],
            )
            .await?;
        let mut tasks = Vec::new();
        while let Some(row) = rows.next().await? {
            tasks.push(task_from_row(&row)?);
        }
        Ok(tasks)
    }

    pub async fn create_task(&self, profile_id: &str, data: &CreateTaskData) -> Result<TaskRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT OR IGNORE INTO crm_tasks
               (id, profile_id, contact_id, deal_id, title, description,
                due_at, priority, idempotency_key, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,COALESCE(?8,'medium'),?9,
                     unixepoch(), unixepoch())",
            crate::turso_params![
                id.clone(),
                profile_id,
                data.contact_id.clone(),
                data.deal_id.clone(),
                data.title.clone(),
                data.description.clone(),
                data.due_at,
                data.priority.clone(),
                data.idempotency_key.clone()
            ],
        )
        .await?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, contact_id, deal_id, title, description,
                    due_at, priority, status, completed_at, created_at, updated_at
             FROM crm_tasks WHERE id = ?1",
                crate::turso_params![id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            task_from_row(&row)
        } else {
            Err(anyhow!("Task insert failed"))
        }
    }

    pub async fn complete_task(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_tasks SET
               status = 'done', completed_at = unixepoch(), updated_at = unixepoch()
             WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![id, profile_id],
        )
        .await?;
        Ok(())
    }

    // ── Notes ─────────────────────────────────────────────────────────────────

    pub async fn list_notes(&self, contact_id: &str) -> Result<Vec<NoteRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, contact_id, deal_id, body, pinned,
                    created_at, updated_at
             FROM crm_notes WHERE contact_id = ?1
             ORDER BY pinned DESC, created_at DESC",
                crate::turso_params![contact_id],
            )
            .await?;
        let mut notes = Vec::new();
        while let Some(row) = rows.next().await? {
            notes.push(NoteRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                contact_id: row.get(2)?,
                deal_id: row.get(3)?,
                body: row.get(4)?,
                pinned: row.get::<i64>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            });
        }
        Ok(notes)
    }

    pub async fn create_note(
        &self,
        profile_id: &str,
        contact_id: &str,
        body: &str,
        deal_id: Option<&str>,
    ) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO crm_notes
               (id, profile_id, contact_id, deal_id, body, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5, unixepoch(), unixepoch())",
            crate::turso_params![id.clone(), profile_id, contact_id, deal_id, body],
        )
        .await?;
        Ok(id)
    }

    pub async fn delete_note(&self, profile_id: &str, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "DELETE FROM crm_notes WHERE id = ?1 AND profile_id = ?2",
            crate::turso_params![id, profile_id],
        )
        .await?;
        Ok(())
    }

    // ── Groups ────────────────────────────────────────────────────────────────

    pub async fn list_groups(&self, profile_id: &str) -> Result<Vec<GroupRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, name, icon, color, contact_count, created_at
             FROM crm_groups WHERE profile_id = ?1 ORDER BY name ASC",
                crate::turso_params![profile_id],
            )
            .await?;
        let mut groups = Vec::new();
        while let Some(row) = rows.next().await? {
            groups.push(GroupRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                icon: row.get(3)?,
                color: row.get(4)?,
                contact_count: row.get::<i64>(5).unwrap_or(0),
                created_at: row.get(6)?,
            });
        }
        Ok(groups)
    }

    pub async fn create_group(
        &self,
        profile_id: &str,
        name: &str,
        icon: Option<&str>,
        color: Option<&str>,
    ) -> Result<GroupRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT OR IGNORE INTO crm_groups
               (id, profile_id, name, icon, color, created_at)
             VALUES (?1,?2,?3,?4,?5, unixepoch())",
            crate::turso_params![id.clone(), profile_id, name, icon, color],
        )
        .await?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, name, icon, color, contact_count, created_at
             FROM crm_groups WHERE id = ?1",
                crate::turso_params![id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok(GroupRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                icon: row.get(3)?,
                color: row.get(4)?,
                contact_count: row.get::<i64>(5).unwrap_or(0),
                created_at: row.get(6)?,
            })
        } else {
            Err(anyhow!("Group already exists with that name"))
        }
    }

    // ── Templates ─────────────────────────────────────────────────────────────

    pub async fn list_templates(
        &self,
        profile_id: &str,
        template_type: Option<&str>,
    ) -> Result<Vec<TemplateRow>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, name, type, subject, body, platform,
                    tags, use_count, reply_rate_pct, created_at, updated_at
             FROM crm_templates
             WHERE profile_id = ?1 AND (?2 IS NULL OR type = ?2)
             ORDER BY reply_rate_pct DESC, use_count DESC",
                crate::turso_params![profile_id, template_type],
            )
            .await?;
        let mut templates = Vec::new();
        while let Some(row) = rows.next().await? {
            templates.push(TemplateRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                template_type: row.get(3)?,
                subject: row.get(4)?,
                body: row.get(5)?,
                platform: row.get(6)?,
                tags: row.get::<String>(7).unwrap_or_else(|_| "[]".to_string()),
                use_count: row.get::<i64>(8).unwrap_or(0),
                reply_rate_pct: row.get::<i64>(9).unwrap_or(0),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            });
        }
        Ok(templates)
    }

    pub async fn create_template(
        &self,
        profile_id: &str,
        data: &CreateTemplateData,
    ) -> Result<TemplateRow> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO crm_templates
               (id, profile_id, name, type, subject, body, platform, tags,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,COALESCE(?8,'[]'),
                     unixepoch(), unixepoch())",
            crate::turso_params![
                id.clone(),
                profile_id,
                data.name.clone(),
                data.template_type.clone(),
                data.subject.clone(),
                data.body.clone(),
                data.platform.clone(),
                data.tags.clone()
            ],
        )
        .await?;
        let mut rows = conn
            .query(
                "SELECT id, profile_id, name, type, subject, body, platform,
                    tags, use_count, reply_rate_pct, created_at, updated_at
             FROM crm_templates WHERE id = ?1",
                crate::turso_params![id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok(TemplateRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                template_type: row.get(3)?,
                subject: row.get(4)?,
                body: row.get(5)?,
                platform: row.get(6)?,
                tags: row.get::<String>(7).unwrap_or_else(|_| "[]".to_string()),
                use_count: row.get::<i64>(8).unwrap_or(0),
                reply_rate_pct: row.get::<i64>(9).unwrap_or(0),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        } else {
            Err(anyhow!("Template insert failed"))
        }
    }

    pub async fn increment_template_use_count(&self, id: &str) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_templates SET use_count = use_count + 1,
             updated_at = unixepoch() WHERE id = ?1",
            crate::turso_params![id],
        )
        .await?;
        Ok(())
    }

    // ── Campaigns ─────────────────────────────────────────────────────────────

    pub async fn list_campaigns(
        &self,
        profile_id: &str,
        status: Option<&str>,
    ) -> Result<Vec<CampaignRow>> {
        let conn = self.conn()?;
        let mut sql = "SELECT id, profile_id, name, template_id, channel, audience_filter, \
                              status, total_recipients, sent_count, failed_count, scheduled_at, sent_at, \
                              created_at, updated_at \
                       FROM crm_campaigns WHERE profile_id = ?".to_string();
        let mut params = vec![crate::db::turso::TursoParam::from(profile_id)];

        if let Some(st) = status {
            if !st.trim().is_empty() {
                sql.push_str(" AND status = ?");
                params.push(crate::db::turso::TursoParam::from(st));
            }
        }
        sql.push_str(" ORDER BY created_at DESC LIMIT 100");

        let mut rows = conn.query(&sql, params).await?;
        let mut campaigns = Vec::new();
        while let Some(row) = rows.next().await? {
            campaigns.push(CampaignRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                template_id: row.get(3)?,
                channel: row.get(4)?,
                audience_filter: row.get::<String>(5).unwrap_or_else(|_| "{}".to_string()),
                status: row.get(6)?,
                total_recipients: row.get::<i64>(7).unwrap_or(0),
                sent_count: row.get::<i64>(8).unwrap_or(0),
                failed_count: row.get::<i64>(9).unwrap_or(0),
                scheduled_at: row.get::<Option<i64>>(10).ok().flatten(),
                sent_at: row.get::<Option<i64>>(11).ok().flatten(),
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            });
        }
        Ok(campaigns)
    }

    pub async fn create_campaign(
        &self,
        profile_id: &str,
        data: &CreateCampaignData,
    ) -> Result<CampaignRow> {
        let id = format!("cmp-{}", Uuid::new_v4());
        let conn = self.conn()?;
        let audience_filter = data.audience_filter.clone().unwrap_or_else(|| "{}".to_string());
        let status = if data.scheduled_at.is_some() { "scheduled" } else { "draft" };

        conn.execute(
            "INSERT INTO crm_campaigns \
               (id, profile_id, name, template_id, channel, audience_filter, status, scheduled_at, \
                created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())",
            crate::turso_params![
                id.clone(),
                profile_id,
                data.name.clone(),
                data.template_id.clone(),
                data.channel.clone(),
                audience_filter.clone(),
                status,
                data.scheduled_at,
            ],
        )
        .await?;

        let mut rows = conn
            .query(
                "SELECT id, profile_id, name, template_id, channel, audience_filter, \
                        status, total_recipients, sent_count, failed_count, scheduled_at, sent_at, \
                        created_at, updated_at \
                 FROM crm_campaigns WHERE id = ?",
                crate::turso_params![id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(CampaignRow {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                template_id: row.get(3)?,
                channel: row.get(4)?,
                audience_filter: row.get::<String>(5).unwrap_or_else(|_| "{}".to_string()),
                status: row.get(6)?,
                total_recipients: row.get::<i64>(7).unwrap_or(0),
                sent_count: row.get::<i64>(8).unwrap_or(0),
                failed_count: row.get::<i64>(9).unwrap_or(0),
                scheduled_at: row.get::<Option<i64>>(10).ok().flatten(),
                sent_at: row.get::<Option<i64>>(11).ok().flatten(),
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        } else {
            Err(anyhow!("Campaign creation failed"))
        }
    }

    pub async fn update_campaign_status(
        &self,
        profile_id: &str,
        campaign_id: &str,
        status: &str,
        sent_count: Option<i64>,
        failed_count: Option<i64>,
    ) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE crm_campaigns \
             SET status = ?, \
                 sent_count = COALESCE(?, sent_count), \
                 failed_count = COALESCE(?, failed_count), \
                 sent_at = CASE WHEN ? = 'sent' THEN unixepoch() ELSE sent_at END, \
                 updated_at = unixepoch() \
             WHERE id = ? AND profile_id = ?",
            crate::turso_params![
                status,
                sent_count,
                failed_count,
                status,
                campaign_id,
                profile_id,
            ],
        )
        .await?;
        Ok(())
    }
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn contact_from_row(row: &crate::db::turso::TursoRow) -> Result<ContactRow> {
    Ok(ContactRow {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        user_id: row.get(2)?,
        first_name: row.get(3)?,
        last_name: row.get(4)?,
        email: row.get(5)?,
        phone: row.get(6)?,
        avatar_url: row.get(7)?,
        company: row.get(8)?,
        job_title: row.get(9)?,
        website: row.get(10)?,
        contact_type: row.get(11)?,
        city: row.get(12)?,
        country: row.get(13)?,
        timezone: row.get(14)?,
        platform: row.get(15)?,
        platform_username: row.get(16)?,
        platform_url: row.get(17)?,
        social_links: row.get::<String>(18).unwrap_or_else(|_| "[]".to_string()),
        bio: row.get(19)?,
        pain_point: row.get(20)?,
        lead_score: row.get::<i64>(21).unwrap_or(0),
        icp_match: row
            .get::<String>(22)
            .unwrap_or_else(|_| "unknown".to_string()),
        urgency: row
            .get::<String>(23)
            .unwrap_or_else(|_| "unknown".to_string()),
        buying_intent: row
            .get::<String>(24)
            .unwrap_or_else(|_| "unknown".to_string()),
        outreach_status: row.get::<String>(25).unwrap_or_else(|_| "new".to_string()),
        outreach_attempts: row.get::<i64>(26).unwrap_or(0),
        next_follow_up_at: row.get(27)?,
        next_action: row.get(28)?,
        status: row.get::<String>(29).unwrap_or_else(|_| "lead".to_string()),
        source: row.get(30)?,
        tags: row.get::<String>(31).unwrap_or_else(|_| "[]".to_string()),
        custom_fields: row.get::<String>(32).unwrap_or_else(|_| "{}".to_string()),
        notes: row.get(33)?,
        groups: row.get::<String>(34).unwrap_or_else(|_| "[]".to_string()),
        total_spent_cents: row.get::<i64>(35).unwrap_or(0),
        total_purchases: row.get::<i64>(36).unwrap_or(0),
        agent_status: row
            .get::<String>(37)
            .unwrap_or_else(|_| "pending".to_string()),
        archived: row.get::<i64>(38).unwrap_or(0) != 0,
        created_at: row.get(39)?,
        updated_at: row.get(40)?,
    })
}

fn deal_from_row(row: &crate::db::turso::TursoRow) -> Result<DealRow> {
    Ok(DealRow {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        contact_id: row.get(2)?,
        title: row.get(3)?,
        value_cents: row.get::<i64>(4).unwrap_or(0),
        currency: row.get::<String>(5).unwrap_or_else(|_| "usd".to_string()),
        stage: row.get::<String>(6).unwrap_or_else(|_| "new".to_string()),
        probability: row.get::<i64>(7).unwrap_or(0),
        expected_close_at: row.get(8)?,
        closed_at: row.get(9)?,
        lost_reason: row.get(10)?,
        notes: row.get(11)?,
        product_id: row.get(12)?,
        line_items: row.get::<String>(13).unwrap_or_else(|_| "[]".to_string()),
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

fn activity_from_row(row: &crate::db::turso::TursoRow) -> Result<ActivityRow> {
    Ok(ActivityRow {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        contact_id: row.get(2)?,
        deal_id: row.get(3)?,
        activity_type: row.get(4)?,
        direction: row
            .get::<String>(5)
            .unwrap_or_else(|_| "outbound".to_string()),
        sender: row.get::<String>(6).unwrap_or_else(|_| "you".to_string()),
        subject: row.get(7)?,
        body: row.get(8)?,
        outcome: row.get(9)?,
        metadata: row.get::<String>(10).unwrap_or_else(|_| "{}".to_string()),
        approval_status: row.get(11)?,
        read_at: row.get(12)?,
        occurred_at: row.get(13)?,
        created_at: row.get(14)?,
        idempotency_key: row.get(15)?,
    })
}

fn task_from_row(row: &crate::db::turso::TursoRow) -> Result<TaskRow> {
    Ok(TaskRow {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        contact_id: row.get(2)?,
        deal_id: row.get(3)?,
        title: row.get(4)?,
        description: row.get(5)?,
        due_at: row.get(6)?,
        priority: row
            .get::<String>(7)
            .unwrap_or_else(|_| "medium".to_string()),
        status: row.get::<String>(8).unwrap_or_else(|_| "open".to_string()),
        completed_at: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

// ── Analytics ─────────────────────────────────────────────────────────────────

impl<'a> CrmDb<'a> {
    pub async fn get_crm_analytics(&self, profile_id: &str) -> Result<serde_json::Value> {
        let conn = self.conn()?;
        let stmt = conn
            .prepare("SELECT * FROM crm_analytics WHERE profile_id = ? LIMIT 1")
            .await?;
        let mut rows = stmt.query(crate::turso_params![profile_id]).await?;

        if let Some(row) = rows.next().await? {
            let mut map = serde_json::Map::new();
            for i in 0..row.column_count() {
                let name = row.column_name(i as i32).unwrap_or("").to_string();
                let val: serde_json::Value = match row.get_cell(i as usize) {
                    crate::db::turso::CellValue::Integer(n) => serde_json::json!(n),
                    crate::db::turso::CellValue::Float(f) => serde_json::json!(f),
                    crate::db::turso::CellValue::Text(s) => serde_json::json!(s),
                    crate::db::turso::CellValue::Null => serde_json::Value::Null,
                };
                map.insert(name, val);
            }
            Ok(serde_json::Value::Object(map))
        } else {
            Ok(serde_json::Value::Null)
        }
    }

    pub async fn aggregate_crm_analytics(
        &self,
        _profile_id: &str,
        _force_refresh: bool,
    ) -> Result<()> {
        // Implement logic or just return Ok(()) if done on frontend
        Ok(())
    }
}
