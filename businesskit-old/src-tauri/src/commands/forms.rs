// src-tauri/src/commands/forms.rs
//
// WHAT:  Form builder + submission management IPC commands.
//
// HOW:   All reads/writes go through the active UserDB (Turso per-profile).
//        The CF Worker handles public form submissions (POST) → stored in UserDB.
//        This desktop app: create forms, build questions, read submissions, check stats.
//
// FLOW:
//   list_forms             → SELECT forms LEFT JOIN form_analytics (submission_count)
//   create_form            → INSERT forms; trigger auto-inits form_analytics row
//   update_form            → UPDATE forms SET title, description, layout, settings, etc.
//   delete_form            → DELETE questions + forms (trigger cleans form_analytics)
//   toggle_form_published  → UPDATE forms SET published = 0|1
//   list_form_questions    → SELECT questions WHERE form_id ORDER BY position ASC
//   update_form_questions  → DELETE all + re-INSERT (same pattern as web useSaveForm)
//   list_submissions       → SELECT submissions WHERE form_id ORDER BY created_at DESC
//   get_form_analytics     → SELECT form_analytics WHERE form_id
//
// SCHEMA (src-tauri/src/db/schema/forms.rs):
//   forms           — id, profile_id, title, slug, published(INTEGER), layout, description, ...
//   questions       — id, form_id, type, title, label, position(INTEGER), required(INTEGER), ...
//   submissions     — id, form_id, answers(JSON), status, device, country, created_at(TEXT), ...
//   form_analytics  — id, form_id, views, submissions, trends_7d, trends_30d, ...
//
// NOTE: timestamps are TEXT (strftime ISO), not INTEGER epoch — use row.get::<String>()

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormRow {
    pub id: String,
    pub profile_id: String,
    pub title: String,
    pub slug: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub background: Option<String>,
    pub layout: String, // classic | card | conversational | minimal
    pub published: bool,
    pub hidden: bool,
    pub email_notification: bool,
    pub accepting_responses: bool,
    pub thank_you_settings: Option<String>, // JSON
    pub collection_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub submission_count: i64, // derived from form_analytics.submissions
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionRow {
    pub id: String,
    pub form_id: String,
    pub question_type: String, // short_text | email | number | single_select | …
    pub title: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub position: i64,
    pub options: String, // JSON [] for select/ranking types
    pub required: bool,
    pub placeholder: Option<String>,
    pub button_text: Option<String>,
    pub image_url: Option<String>,
    pub embed_url: Option<String>,
    pub settings: Option<String>,     // JSON extra settings
    pub ai_follow_up: Option<String>, // JSON AI follow-up config
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionRow {
    pub id: String,
    pub form_id: String,
    pub answers: String, // JSON { question_id: answer }
    pub status: String,  // viewed | partial | submitted
    pub device: Option<String>,
    pub os: Option<String>,
    pub browser: Option<String>,
    pub referrer: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub timezone: Option<String>,
    pub utm_source: Option<String>,
    pub utm_medium: Option<String>,
    pub utm_campaign: Option<String>,
    pub started_at: Option<String>,
    pub submitted_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormAnalyticsRow {
    pub id: String,
    pub form_id: String,
    pub views: i64,
    pub visits: i64,
    pub starts: i64,
    pub partials: i64,
    pub submissions: i64,
    pub avg_completion_ms: i64,
    pub trends_7d: String, // JSON [0,0,0,0,0,0,0]
    pub trends_30d: String,
    pub trends_12m: String,
    pub device: String, // JSON breakdown
    pub country: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFormData {
    pub title: String,
    pub slug: String,
    pub description: Option<String>,
    pub layout: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFormData {
    pub title: Option<String>,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub layout: Option<String>,
    pub background: Option<String>,
    pub image_url: Option<String>,
    pub email_notification: Option<bool>,
    pub accepting_responses: Option<bool>,
    pub published: Option<bool>,
    pub hidden: Option<bool>,
    pub thank_you_settings: Option<String>,
    pub collection_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionData {
    pub id: Option<String>, // None / "temp_*" = new question
    pub question_type: String,
    pub title: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub position: i64,
    pub options: Option<String>, // JSON []
    pub required: Option<bool>,
    pub placeholder: Option<String>,
    pub button_text: Option<String>,
    pub image_url: Option<String>,
    pub settings: Option<String>,
    pub embed_url: Option<String>,
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn form_from_row(row: &crate::db::turso::TursoRow) -> Result<FormRow, String> {
    Ok(FormRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        title: row.get(2).map_err(|e| e.to_string())?,
        slug: row.get(3).map_err(|e| e.to_string())?,
        description: row.get(4).map_err(|e| e.to_string())?,
        image_url: row.get(5).map_err(|e| e.to_string())?,
        background: row.get(6).map_err(|e| e.to_string())?,
        layout: row.get::<String>(7).unwrap_or_else(|_| "classic".into()),
        published: row.get::<i64>(8).unwrap_or(0) != 0,
        hidden: row.get::<i64>(9).unwrap_or(0) != 0,
        email_notification: row.get::<i64>(10).unwrap_or(0) != 0,
        accepting_responses: row.get::<i64>(11).unwrap_or(1) != 0,
        thank_you_settings: row.get(12).map_err(|e| e.to_string())?,
        collection_id: row.get(13).map_err(|e| e.to_string())?,
        created_at: row.get::<String>(14).unwrap_or_else(|_| "".into()),
        updated_at: row.get::<String>(15).unwrap_or_else(|_| "".into()),
        submission_count: row.get::<i64>(16).unwrap_or(0),
    })
}

fn question_from_row(row: &crate::db::turso::TursoRow) -> Result<QuestionRow, String> {
    Ok(QuestionRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        form_id: row.get(1).map_err(|e| e.to_string())?,
        question_type: row.get::<String>(2).unwrap_or_else(|_| "short_text".into()),
        title: row.get::<String>(3).unwrap_or_else(|_| "".into()),
        label: row.get(4).map_err(|e| e.to_string())?,
        description: row.get(5).map_err(|e| e.to_string())?,
        position: row.get::<i64>(6).unwrap_or(0),
        options: row.get::<String>(7).unwrap_or_else(|_| "[]".into()),
        required: row.get::<i64>(8).unwrap_or(0) != 0,
        placeholder: row.get(9).map_err(|e| e.to_string())?,
        button_text: row.get(10).map_err(|e| e.to_string())?,
        image_url: row.get(11).map_err(|e| e.to_string())?,
        embed_url: row.get(12).map_err(|e| e.to_string())?,
        settings: row.get(13).map_err(|e| e.to_string())?,
        ai_follow_up: row.get(14).map_err(|e| e.to_string())?,
    })
}

fn submission_from_row(row: &crate::db::turso::TursoRow) -> Result<SubmissionRow, String> {
    Ok(SubmissionRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        form_id: row.get(1).map_err(|e| e.to_string())?,
        answers: row.get::<String>(2).unwrap_or_else(|_| "{}".into()),
        status: row.get::<String>(3).unwrap_or_else(|_| "viewed".into()),
        device: row.get(4).map_err(|e| e.to_string())?,
        os: row.get(5).map_err(|e| e.to_string())?,
        browser: row.get(6).map_err(|e| e.to_string())?,
        referrer: row.get(7).map_err(|e| e.to_string())?,
        city: row.get(8).map_err(|e| e.to_string())?,
        country: row.get(9).map_err(|e| e.to_string())?,
        timezone: row.get(10).map_err(|e| e.to_string())?,
        utm_source: row.get(11).map_err(|e| e.to_string())?,
        utm_medium: row.get(12).map_err(|e| e.to_string())?,
        utm_campaign: row.get(13).map_err(|e| e.to_string())?,
        started_at: row.get(14).map_err(|e| e.to_string())?,
        submitted_at: row.get(15).map_err(|e| e.to_string())?,
        duration_ms: row.get(16).map_err(|e| e.to_string())?,
        created_at: row.get::<String>(17).unwrap_or_else(|_| "".into()),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all forms for the active profile, joined with submission count.
#[tauri::command]
pub async fn list_forms(state: State<'_, Arc<AppState>>) -> Result<Vec<FormRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT f.id, f.profile_id, f.title, f.slug, f.description,
                f.image_url, f.background, f.layout,
                f.published, f.hidden, f.email_notification, f.accepting_responses,
                f.thank_you_settings, f.collection_id,
                f.created_at, f.updated_at,
                COALESCE(fa.submissions, 0) AS submission_count
         FROM forms f
         LEFT JOIN form_analytics fa ON fa.form_id = f.id
         WHERE f.profile_id = ?1
         ORDER BY f.updated_at DESC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(form_from_row(&row)?);
    }
    Ok(items)
}

/// Create a new form (published = 0 / draft).
/// The trg_form_insert trigger auto-initialises form_analytics.
#[tauri::command]
pub async fn create_form(
    data: CreateFormData,
    state: State<'_, Arc<AppState>>,
) -> Result<FormRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let layout = data.layout.unwrap_or_else(|| "classic".into());

    conn.execute(
        "INSERT INTO forms (id, profile_id, title, slug, description, layout, published)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
        crate::turso_params![
            id.clone(),
            profile_id,
            data.title,
            data.slug,
            data.description,
            layout
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT f.id, f.profile_id, f.title, f.slug, f.description,
                f.image_url, f.background, f.layout,
                f.published, f.hidden, f.email_notification, f.accepting_responses,
                f.thank_you_settings, f.collection_id,
                f.created_at, f.updated_at,
                COALESCE(fa.submissions, 0)
         FROM forms f
         LEFT JOIN form_analytics fa ON fa.form_id = f.id
         WHERE f.id = ?1",
            crate::turso_params![id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        form_from_row(&row)
    } else {
        Err("Form insert failed".to_string())
    }
}

/// Update form metadata (title, description, layout, thank_you_settings, etc.)
#[tauri::command]
pub async fn update_form(
    form_id: String,
    data: UpdateFormData,
    state: State<'_, Arc<AppState>>,
) -> Result<FormRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE forms SET
            title               = COALESCE(?3, title),
            slug                = COALESCE(?4, slug),
            description         = COALESCE(?5, description),
            layout              = COALESCE(?6, layout),
            background          = COALESCE(?7, background),
            image_url           = COALESCE(?8, image_url),
            email_notification  = COALESCE(?9, email_notification),
            accepting_responses = COALESCE(?10, accepting_responses),
            published           = COALESCE(?11, published),
            hidden              = COALESCE(?12, hidden),
            thank_you_settings  = COALESCE(?13, thank_you_settings),
            collection_id       = COALESCE(?14, collection_id),
            updated_at          = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![
            form_id.clone(),
            profile_id,
            data.title,
            data.slug,
            data.description,
            data.layout,
            data.background,
            data.image_url,
            data.email_notification.map(|v| v as i64),
            data.accepting_responses.map(|v| v as i64),
            data.published.map(|v| v as i64),
            data.hidden.map(|v| v as i64),
            data.thank_you_settings,
            data.collection_id
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT f.id, f.profile_id, f.title, f.slug, f.description,
                f.image_url, f.background, f.layout,
                f.published, f.hidden, f.email_notification, f.accepting_responses,
                f.thank_you_settings, f.collection_id,
                f.created_at, f.updated_at,
                COALESCE(fa.submissions, 0)
         FROM forms f
         LEFT JOIN form_analytics fa ON fa.form_id = f.id
         WHERE f.id = ?1",
            crate::turso_params![form_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        form_from_row(&row)
    } else {
        Err("Form not found after update".to_string())
    }
}

/// Delete a form and its questions. Triggers clean up form_analytics + cms_analytics.
#[tauri::command]
pub async fn delete_form(form_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Delete questions first (no FK cascade in SQLite)
    conn.execute(
        "DELETE FROM questions WHERE form_id = ?1",
        crate::turso_params![form_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Delete form — triggers handle form_analytics + cms_analytics cleanup
    conn.execute(
        "DELETE FROM forms WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![form_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Toggle published state (0 = draft, 1 = published).
/// trg_form_update_published trigger keeps cms_analytics in sync.
#[tauri::command]
pub async fn toggle_form_published(
    form_id: String,
    published: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE forms SET published = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![form_id, profile_id, published as i64],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// List all questions for a form, ordered by position.
#[tauri::command]
pub async fn list_form_questions(
    form_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<QuestionRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, form_id, type, title, label, description, position,
                COALESCE(options, '[]'), required, placeholder, button_text,
                image_url, embed_url, settings, ai_follow_up
         FROM questions WHERE form_id = ?1 ORDER BY position ASC",
            crate::turso_params![form_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(question_from_row(&row)?);
    }
    Ok(items)
}

/// Replace all questions for a form (delete-all + re-insert).
/// Mirrors the web app's useSaveForm pattern exactly.
#[tauri::command]
pub async fn update_form_questions(
    form_id: String,
    questions: Vec<QuestionData>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Delete existing questions
    conn.execute(
        "DELETE FROM questions WHERE form_id = ?1",
        crate::turso_params![form_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Re-insert in order
    for (i, q) in questions.iter().enumerate() {
        let is_temp =
            q.id.as_deref()
                .map(|s| s.starts_with("temp_"))
                .unwrap_or(true);
        let qid = if is_temp {
            Uuid::new_v4().to_string()
        } else {
            q.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string())
        };

        let options_str = q.options.clone().unwrap_or_else(|| "[]".into());

        conn.execute(
            "INSERT INTO questions
               (id, form_id, type, title, label, description, position,
                options, required, placeholder, button_text, image_url, embed_url, settings)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            crate::turso_params![
                qid,
                form_id.clone(),
                q.question_type.clone(),
                q.title.clone(),
                q.label.clone(),
                q.description.clone(),
                i as i64,
                options_str,
                q.required.unwrap_or(false) as i64,
                q.placeholder.clone(),
                q.button_text.clone(),
                q.image_url.clone(),
                q.embed_url.clone(),
                q.settings.clone()
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    // Bump form updated_at
    conn.execute(
        "UPDATE forms SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?1",
        crate::turso_params![form_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// List submissions for a form. Newest first.
#[tauri::command]
pub async fn list_submissions(
    form_id: String,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SubmissionRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, form_id, COALESCE(answers,'{}'), COALESCE(status,'viewed'),
                device, os, browser, referrer, city, country, timezone,
                utm_source, utm_medium, utm_campaign,
                started_at, submitted_at, duration_ms, created_at
         FROM submissions WHERE form_id = ?1
         ORDER BY created_at DESC LIMIT ?2",
            crate::turso_params![form_id, limit.unwrap_or(100)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(submission_from_row(&row)?);
    }
    Ok(items)
}

/// Get aggregate analytics for a form.
#[tauri::command]
pub async fn get_form_analytics(
    form_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<FormAnalyticsRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, form_id, views, visits, starts, partials, submissions,
                avg_completion_ms, trends_7d, trends_30d, trends_12m,
                device, country, updated_at
         FROM form_analytics WHERE form_id = ?1 LIMIT 1",
            crate::turso_params![form_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(Some(FormAnalyticsRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            form_id: row.get(1).map_err(|e| e.to_string())?,
            views: row.get::<i64>(2).unwrap_or(0),
            visits: row.get::<i64>(3).unwrap_or(0),
            starts: row.get::<i64>(4).unwrap_or(0),
            partials: row.get::<i64>(5).unwrap_or(0),
            submissions: row.get::<i64>(6).unwrap_or(0),
            avg_completion_ms: row.get::<i64>(7).unwrap_or(0),
            trends_7d: row
                .get::<String>(8)
                .unwrap_or_else(|_| "[0,0,0,0,0,0,0]".into()),
            trends_30d: row.get::<String>(9).unwrap_or_else(|_| "[]".into()),
            trends_12m: row
                .get::<String>(10)
                .unwrap_or_else(|_| "[0,0,0,0,0,0,0,0,0,0,0,0]".into()),
            device: row.get::<String>(11).unwrap_or_else(|_| "{}".into()),
            country: row.get::<String>(12).unwrap_or_else(|_| "{}".into()),
            updated_at: row.get::<String>(13).unwrap_or_else(|_| "".into()),
        }))
    } else {
        Ok(None)
    }
}
