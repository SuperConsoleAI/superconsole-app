// src-tauri/src/commands/feedback.rs
//
// WHAT:  Public feedback board commands — boards, posts, votes, roadmap.
//
// HOW:   Reads/writes the feedback_* tables in UserDB.
//        The CF Worker handles public voting + post submission.
//        The desktop app is used by the admin to: review posts, change status,
//        add to roadmap, pin posts, manage boards, and track changelog.
//
// FLOW:
//   list_feedback_boards  → all boards for active profile
//   list_feedback_posts   → posts within a board (filter by status)
//   change_post_status    → pending|under_review|planned|in_progress|done|declined
//   pin_post              → toggle is_pinned flag
//   add_to_roadmap        → set roadmap_status on a post
//   get_roadmap_posts     → all posts with roadmap_status != null
//
// TABLES TOUCHED:
//   feedback_boards     — board definitions (name, slug, is_public)
//   feedback_voters     — people who have voted or posted
//   feedback_posts      — individual feature requests / bug reports
//   feedback_votes      — one row per vote (voter_id, post_id)
//   feedback_changelog  — release notes / completed items
//
// REFERENCE: src/lib/feedback.ts + src/lib/feedback-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackBoardRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub post_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackPostRow {
    pub id: String,
    pub board_id: String,
    pub profile_id: String,
    pub voter_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub post_type: String, // feature|bug|improvement|question
    pub status: String,    // pending|under_review|planned|in_progress|done|declined
    pub is_pinned: bool,
    pub roadmap_status: Option<String>,
    pub vote_count: i64,
    pub comment_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogRow {
    pub id: String,
    pub profile_id: String,
    pub title: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub category: Option<String>, // feature|fix|improvement|breaking
    pub is_published: bool,
    pub published_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBoardData {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_public: Option<bool>,
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn board_from_row(row: &crate::db::turso::TursoRow) -> Result<FeedbackBoardRow, String> {
    Ok(FeedbackBoardRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        name: row.get(2).map_err(|e| e.to_string())?,
        slug: row.get(3).map_err(|e| e.to_string())?,
        description: row.get(4).map_err(|e| e.to_string())?,
        is_public: row.get::<i64>(5).unwrap_or(1) != 0,
        post_count: row.get::<i64>(6).unwrap_or(0),
        created_at: row.get::<i64>(7).unwrap_or(0),
        updated_at: row.get::<i64>(8).unwrap_or(0),
    })
}

fn post_from_row(row: &crate::db::turso::TursoRow) -> Result<FeedbackPostRow, String> {
    Ok(FeedbackPostRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        board_id: row.get(1).map_err(|e| e.to_string())?,
        profile_id: row.get(2).map_err(|e| e.to_string())?,
        voter_id: row.get(3).map_err(|e| e.to_string())?,
        title: row.get(4).map_err(|e| e.to_string())?,
        description: row.get(5).map_err(|e| e.to_string())?,
        post_type: row.get(6).map_err(|e| e.to_string())?,
        status: row.get(7).map_err(|e| e.to_string())?,
        is_pinned: row.get::<i64>(8).unwrap_or(0) != 0,
        roadmap_status: row.get(9).map_err(|e| e.to_string())?,
        vote_count: row.get::<i64>(10).unwrap_or(0),
        comment_count: row.get::<i64>(11).unwrap_or(0),
        created_at: row.get::<i64>(12).unwrap_or(0),
        updated_at: row.get::<i64>(13).unwrap_or(0),
    })
}

fn changelog_from_row(row: &crate::db::turso::TursoRow) -> Result<ChangelogRow, String> {
    Ok(ChangelogRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        title: row.get(2).map_err(|e| e.to_string())?,
        description: row.get(3).map_err(|e| e.to_string())?,
        version: row.get(4).map_err(|e| e.to_string())?,
        category: row.get(5).map_err(|e| e.to_string())?,
        is_published: row.get::<i64>(6).unwrap_or(0) != 0,
        published_at: row.get(7).map_err(|e| e.to_string())?,
        created_at: row.get::<i64>(8).unwrap_or(0),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all feedback boards for the active profile.
#[tauri::command]
pub async fn list_feedback_boards(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<FeedbackBoardRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, name, slug, description, is_public, post_count,
                created_at, updated_at
         FROM feedback_boards WHERE profile_id=?1 ORDER BY created_at ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(board_from_row(&row)?);
    }
    Ok(items)
}

/// Create a new feedback board.
#[tauri::command]
pub async fn create_feedback_board(
    data: CreateBoardData,
    state: State<'_, Arc<AppState>>,
) -> Result<FeedbackBoardRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO feedback_boards
           (id, profile_id, name, slug, description, is_public, post_count,
            created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,0, unixepoch(), unixepoch())",
        crate::turso_params![
            id.clone(),
            profile_id,
            data.name,
            data.slug,
            data.description,
            data.is_public.unwrap_or(true) as i64
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, name, slug, description, is_public, post_count,
                created_at, updated_at
         FROM feedback_boards WHERE id=?1",
            crate::turso_params![id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        board_from_row(&row)
    } else {
        Err("Board insert failed".to_string())
    }
}

/// List feedback posts for a board. Optionally filter by status or type.
/// Default sort: vote_count DESC, created_at DESC.
#[tauri::command]
pub async fn list_feedback_posts(
    board_id: String,
    status: Option<String>,
    post_type: Option<String>,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<FeedbackPostRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, board_id, profile_id, voter_id, title, description,
                type, status, is_pinned, roadmap_status,
                vote_count, comment_count, created_at, updated_at
         FROM feedback_posts
         WHERE board_id=?1 AND profile_id=?2
           AND (?3 IS NULL OR status=?3)
           AND (?4 IS NULL OR type=?4)
         ORDER BY is_pinned DESC, vote_count DESC, created_at DESC
         LIMIT ?5",
            crate::turso_params![
                board_id,
                profile_id,
                status,
                post_type,
                limit.unwrap_or(100)
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(post_from_row(&row)?);
    }
    Ok(items)
}

/// Change the status of a feedback post.
/// status: pending|under_review|planned|in_progress|done|declined
#[tauri::command]
pub async fn change_post_status(
    post_id: String,
    status: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE feedback_posts SET status=?1, updated_at=unixepoch()
         WHERE id=?2 AND profile_id=?3",
        crate::turso_params![status, post_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Toggle pin state of a feedback post.
#[tauri::command]
pub async fn toggle_pin_post(
    post_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE feedback_posts SET is_pinned = NOT is_pinned, updated_at=unixepoch()
         WHERE id=?1 AND profile_id=?2",
        crate::turso_params![post_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Add a post to the roadmap with a roadmap_status.
/// roadmap_status: planned|in_progress|done
#[tauri::command]
pub async fn add_to_roadmap(
    post_id: String,
    roadmap_status: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE feedback_posts SET roadmap_status=?1, updated_at=unixepoch()
         WHERE id=?2 AND profile_id=?3",
        crate::turso_params![roadmap_status, post_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get all roadmap posts (those with roadmap_status set).
#[tauri::command]
pub async fn get_roadmap_posts(
    board_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<FeedbackPostRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, board_id, profile_id, voter_id, title, description,
                type, status, is_pinned, roadmap_status,
                vote_count, comment_count, created_at, updated_at
         FROM feedback_posts
         WHERE profile_id=?1 AND roadmap_status IS NOT NULL
           AND (?2 IS NULL OR board_id=?2)
         ORDER BY roadmap_status ASC, vote_count DESC",
            crate::turso_params![profile_id, board_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(post_from_row(&row)?);
    }
    Ok(items)
}

/// List changelog entries (release notes).
#[tauri::command]
pub async fn list_changelog(
    published_only: Option<bool>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ChangelogRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let pub_filter = if published_only.unwrap_or(false) {
        "AND is_published=1"
    } else {
        ""
    };
    let sql = format!(
        "SELECT id, profile_id, title, description, version, category,
                is_published, published_at, created_at
         FROM feedback_changelog WHERE profile_id=?1 {}
         ORDER BY created_at DESC",
        pub_filter
    );
    let mut rows = conn
        .query(&sql, crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(changelog_from_row(&row)?);
    }
    Ok(items)
}
