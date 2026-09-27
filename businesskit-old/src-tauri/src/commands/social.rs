// src-tauri/src/commands/social.rs
//
// WHAT:  Social media account management + post scheduling commands.
//
// HOW:   Reads/writes the UserDB social_* tables via raw libsql queries.
//        No external API calls here — this layer is pure local data management.
//        Actual platform OAuth + posting is handled by the n8n webhook or a
//        future CF Worker. The desktop app stores account tokens + queues posts;
//        the sending side lives outside this process.
//
// FLOW:
//   Frontend invokes e.g. "list_social_accounts" →
//     require_license + require_profile →
//       query social_accounts WHERE profile_id = active →
//         return Vec<SocialAccountRow> as JSON
//
// TABLES TOUCHED:
//   social_accounts       — connected platform accounts (tokens, stats)
//   social_posts          — post drafts, scheduled posts, published records
//   social_post_groups    — groups of posts for cross-platform publishing
//   social_queue          — scheduled queue slots per platform
//   social_inbox          — incoming DMs, mentions, comments
//   social_analytics      — per-account aggregate stats
//
// REFERENCE: src/lib/social.ts + src/lib/social-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialAccountRow {
    pub id: String,
    pub profile_id: String,
    pub platform: String,
    pub platform_user_id: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub platform_bio: Option<String>,
    pub platform_verified: i64,
    pub platform_data: Option<String>,
    pub token_expires_at: Option<i64>,
    pub is_connected: bool,
    pub follower_count: Option<i64>,
    pub following_count: Option<i64>,
    pub post_count: Option<i64>,
    pub connection_id: Option<String>,
    pub external_account_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialPostRow {
    pub id: String,
    pub profile_id: String,
    pub group_id: Option<String>,
    pub account_id: Option<String>,
    pub platform: String,
    pub content: String,
    pub media_items: String,
    pub status: String,
    pub scheduled_for: Option<i64>,
    pub published_at: Option<i64>,
    pub platform_post_id: Option<String>,
    pub platform_post_url: Option<String>,
    pub error_message: Option<String>,
    pub likes: Option<i64>,
    pub comments: Option<i64>,
    pub shares: Option<i64>,
    pub impressions: Option<i64>,
    pub scheduled_via: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePostData {
    pub id: Option<String>,
    pub account_id: Option<String>,
    pub platform: String,
    pub content: String,
    pub media_items: Option<String>,
    pub scheduled_for: Option<i64>,
    pub group_id: Option<String>,
    pub mode: Option<String>,
    pub connection_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialConversationRow {
    pub id: String,
    pub profile_id: String,
    pub account_id: String,
    pub inbox_source: String,
    pub platform: String,
    pub external_conversation_id: Option<String>,
    pub platform_conversation_id: Option<String>,
    pub crm_contact_id: Option<String>,
    pub participant_platform_id: Option<String>,
    pub participant_username: Option<String>,
    pub participant_name: Option<String>,
    pub participant_picture: Option<String>,
    pub participant_profile_url: Option<String>,
    pub participant_follower_count: Option<i64>,
    pub status: String,
    pub unread_count: i64,
    pub is_pinned: bool,
    pub last_message_preview: Option<String>,
    pub last_message_at: Option<i64>,
    pub last_message_id: Option<String>,
    pub assigned_to: Option<String>,
    pub assigned_at: Option<i64>,
    pub snoozed_until: Option<i64>,
    pub labels: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialMessageRow {
    pub id: String,
    pub profile_id: String,
    pub conversation_id: String,
    pub account_id: String,
    pub inbox_source: String,
    pub external_message_id: Option<String>,
    pub platform_message_id: Option<String>,
    pub message_type: String, // 'type' is a reserved keyword in Rust
    pub platform: String,
    pub sender_platform_id: Option<String>,
    pub sender_username: Option<String>,
    pub sender_display_name: Option<String>,
    pub sender_avatar_url: Option<String>,
    pub sender_profile_url: Option<String>,
    pub is_own: bool,
    pub in_reply_to_message_id: Option<String>,
    pub post_id: Option<String>,
    pub platform_post_id: Option<String>,
    pub content: Option<String>,
    pub media_urls: String,
    pub rating: Option<i64>,
    pub review_title: Option<String>,
    pub status: String,
    pub is_starred: bool,
    pub is_pinned: bool,
    pub sentiment: Option<String>,
    pub read_at: Option<i64>,
    pub reply_content: Option<String>,
    pub replied_at: Option<i64>,
    pub replied_by: Option<String>,
    pub agent_draft: Option<String>,
    pub agent_sentiment: Option<String>,
    pub agent_suggested_action: Option<String>,
    pub agent_processed: bool,
    pub approval_status: String,
    pub auto_reply_sent: bool,
    pub auto_reply_automation_id: Option<String>,
    pub auto_reply_sent_at: Option<i64>,
    pub email_message_id: Option<String>,
    pub email_thread_id: Option<String>,
    pub email_subject: Option<String>,
    pub email_from: Option<String>,
    pub email_to: Option<String>,
    pub received_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn account_from_row(row: &crate::db::turso::TursoRow) -> Result<SocialAccountRow, String> {
    Ok(SocialAccountRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        platform: row.get(2).map_err(|e| e.to_string())?,
        platform_user_id: row.get(3).map_err(|e| e.to_string())?,
        username: row.get(4).map_err(|e| e.to_string())?,
        display_name: row.get(5).map_err(|e| e.to_string())?,
        avatar_url: row.get(6).map_err(|e| e.to_string())?,
        platform_bio: row.get(7).map_err(|e| e.to_string())?,
        platform_verified: row.get(8).unwrap_or(0),
        platform_data: row.get(9).map_err(|e| e.to_string())?,
        token_expires_at: row.get(10).map_err(|e| e.to_string())?,
        is_connected: row.get::<i64>(11).unwrap_or(0) != 0,
        follower_count: row.get(12).map_err(|e| e.to_string())?,
        following_count: row.get(13).map_err(|e| e.to_string())?,
        post_count: row.get(14).map_err(|e| e.to_string())?,
        connection_id: row.get(15).map_err(|e| e.to_string())?,
        external_account_id: row.get(16).map_err(|e| e.to_string())?,
        created_at: row.get(17).map_err(|e| e.to_string())?,
        updated_at: row.get(18).map_err(|e| e.to_string())?,
    })
}

fn post_from_row(row: &crate::db::turso::TursoRow) -> Result<SocialPostRow, String> {
    Ok(SocialPostRow {
        id: row.get::<String>(0).map_err(|e| e.to_string())?,
        profile_id: row.get::<String>(1).map_err(|e| e.to_string())?,
        group_id: row.get::<String>(2).ok(),
        account_id: row.get::<String>(3).ok(),
        platform: row.get::<String>(4).map_err(|e| e.to_string())?,
        content: row.get::<String>(5).map_err(|e| e.to_string())?,
        media_items: row.get::<String>(6).unwrap_or_else(|_| "[]".to_string()),
        status: row.get::<String>(7).map_err(|e| e.to_string())?,
        scheduled_for: row.get::<String>(8).ok().and_then(|s| s.parse().ok()),
        published_at: row.get::<String>(9).ok().and_then(|s| s.parse().ok()),
        platform_post_id: row.get::<String>(10).ok(),
        platform_post_url: row.get::<String>(11).ok(),
        error_message: row.get::<String>(12).ok(),
        likes: row.get::<String>(13).ok().and_then(|s| s.parse().ok()),
        comments: row.get::<String>(14).ok().and_then(|s| s.parse().ok()),
        shares: row.get::<String>(15).ok().and_then(|s| s.parse().ok()),
        impressions: row.get::<String>(16).ok().and_then(|s| s.parse().ok()),
        scheduled_via: row.get::<String>(17).unwrap_or_else(|_| "byok".to_string()),
        created_at: row
            .get::<String>(18)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or_default(),
        updated_at: row
            .get::<String>(19)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or_default(),
    })
}

fn conversation_from_row(row: &crate::db::turso::TursoRow) -> Result<SocialConversationRow, String> {
    Ok(SocialConversationRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        account_id: row.get(2).map_err(|e| e.to_string())?,
        inbox_source: row.get(3).map_err(|e| e.to_string())?,
        platform: row.get(4).map_err(|e| e.to_string())?,
        external_conversation_id: row.get(5).ok(),
        platform_conversation_id: row.get(6).ok(),
        crm_contact_id: row.get(7).ok(),
        participant_platform_id: row.get(8).ok(),
        participant_username: row.get(9).ok(),
        participant_name: row.get(10).ok(),
        participant_picture: row.get(11).ok(),
        participant_profile_url: row.get(12).ok(),
        participant_follower_count: row.get(13).ok(),
        status: row.get(14).map_err(|e| e.to_string())?,
        unread_count: row.get(15).map_err(|e| e.to_string())?,
        is_pinned: row.get::<i64>(16).unwrap_or(0) != 0,
        last_message_preview: row.get(17).ok(),
        last_message_at: row.get(18).ok(),
        last_message_id: row.get(19).ok(),
        assigned_to: row.get(20).ok(),
        assigned_at: row.get(21).ok(),
        snoozed_until: row.get(22).ok(),
        labels: row.get(23).map_err(|e| e.to_string())?,
        created_at: row.get(24).map_err(|e| e.to_string())?,
        updated_at: row.get(25).map_err(|e| e.to_string())?,
    })
}

fn message_from_row(row: &crate::db::turso::TursoRow) -> Result<SocialMessageRow, String> {
    Ok(SocialMessageRow {
        id: row.get(0).unwrap_or_default(),
        profile_id: row.get(1).unwrap_or_default(),
        conversation_id: row.get(2).unwrap_or_default(),
        account_id: row.get(3).unwrap_or_default(),
        inbox_source: row.get(4).unwrap_or_default(),
        external_message_id: row.get(5).ok(),
        platform_message_id: row.get(6).ok(),
        message_type: row.get(7).unwrap_or_default(),
        platform: row.get(8).unwrap_or_default(),
        sender_platform_id: row.get(9).ok(),
        sender_username: row.get(10).ok(),
        sender_display_name: row.get(11).ok(),
        sender_avatar_url: row.get(12).ok(),
        sender_profile_url: row.get(13).ok(),
        is_own: row.get::<i64>(14).unwrap_or(0) != 0,
        in_reply_to_message_id: row.get(15).ok(),
        post_id: row.get(16).ok(),
        platform_post_id: row.get(17).ok(),
        content: row.get(18).ok(),
        media_urls: row.get(19).unwrap_or_else(|_| "[]".to_string()),
        rating: row.get(20).ok(),
        review_title: row.get(21).ok(),
        status: row.get(22).unwrap_or_default(),
        is_starred: row.get::<i64>(23).unwrap_or(0) != 0,
        is_pinned: row.get::<i64>(24).unwrap_or(0) != 0,
        sentiment: row.get(25).ok(),
        read_at: row.get(26).ok(),
        reply_content: row.get(27).ok(),
        replied_at: row.get(28).ok(),
        replied_by: row.get(29).ok(),
        agent_draft: row.get(30).ok(),
        agent_sentiment: row.get(31).ok(),
        agent_suggested_action: row.get(32).ok(),
        agent_processed: row.get::<i64>(33).unwrap_or(0) != 0,
        approval_status: row.get(34).unwrap_or_default(),
        auto_reply_sent: row.get::<i64>(35).unwrap_or(0) != 0,
        auto_reply_automation_id: row.get(36).ok(),
        auto_reply_sent_at: row.get(37).ok(),
        email_message_id: row.get(38).ok(),
        email_thread_id: row.get(39).ok(),
        email_subject: row.get(40).ok(),
        email_from: row.get(41).ok(),
        email_to: row.get(42).ok(),
        received_at: row.get(43).unwrap_or(0),
        created_at: row.get(44).unwrap_or(0),
        updated_at: row.get(45).unwrap_or(0),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all connected social accounts for the active profile.
#[tauri::command]
pub async fn list_social_accounts(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SocialAccountRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT a.id, a.profile_id, a.platform, a.platform_user_id, a.platform_username, a.platform_display_name,
                a.platform_avatar_url, a.platform_bio, a.platform_verified, a.platform_data, a.token_expires_at,
                a.is_connected, a.follower_count, a.following_count, a.platform_post_count as post_count,
                c.connection_id, c.external_account_id, a.created_at, a.updated_at
         FROM social_accounts a
         LEFT JOIN social_account_connections c ON a.id = c.social_account_id AND c.is_primary = 1
         WHERE a.profile_id = ?1 ORDER BY a.platform ASC",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut accounts = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        accounts.push(account_from_row(&row)?);
    }
    Ok(accounts)
}

/// Upsert a social account (connect or refresh token).
/// On conflict(profile_id, platform) updates the token fields.
#[tauri::command]
pub async fn upsert_social_account(
    platform: String,
    platform_user_id: String,
    username: Option<String>,
    display_name: Option<String>,
    avatar_url: Option<String>,
    platform_bio: Option<String>,
    platform_verified: Option<i64>,
    platform_data: Option<String>,
    follower_count: Option<i64>,
    following_count: Option<i64>,
    post_count: Option<i64>,
    connection_id: Option<String>,
    external_account_id: Option<String>,
    external_profile_id: Option<String>,
    external_user_id: Option<String>,
    _access_token: Option<String>,
    _refresh_token: Option<String>,
    token_expires_at: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<SocialAccountRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    let z_id = external_account_id.clone().unwrap_or_default();
    let mut check_rows = conn.query(
        "SELECT a.id FROM social_accounts a 
         LEFT JOIN social_account_connections c ON a.id = c.social_account_id
         WHERE a.profile_id = ?1 AND (
            (c.external_account_id IS NOT NULL AND c.external_account_id != '' AND c.external_account_id = ?2) OR 
            (a.platform = ?3 AND (
                (a.platform_user_id != '' AND a.platform_user_id = ?4) OR 
                (a.platform_username IS NOT NULL AND a.platform_username != '' AND a.platform_username = ?5)
            ))
        ) LIMIT 1",
        crate::turso_params![profile_id.clone(), z_id, platform.clone(), platform_user_id.clone(), username.clone().unwrap_or_default()],
    ).await.map_err(|e| e.to_string())?;

    let final_account_id;
    if let Some(row) = check_rows.next().await.map_err(|e| e.to_string())? {
        let existing_id: String = row.get(0).map_err(|e| e.to_string())?;
        final_account_id = existing_id.clone();
        conn.execute(
            "UPDATE social_accounts SET
               platform_user_id = ?1,
               platform_username = COALESCE(?2, platform_username),
               platform_display_name = COALESCE(?3, platform_display_name),
               platform_avatar_url = COALESCE(?4, platform_avatar_url),
               platform_bio = COALESCE(?5, platform_bio),
               platform_verified = COALESCE(?6, platform_verified),
               platform_data = COALESCE(?7, platform_data),
               follower_count = COALESCE(?8, follower_count),
               following_count = COALESCE(?9, following_count),
               platform_post_count = COALESCE(?10, platform_post_count),
               token_expires_at = COALESCE(?12, token_expires_at),
               is_connected = 1,
               updated_at = unixepoch()
             WHERE id = ?11",
            crate::turso_params![
                platform_user_id.clone(),
                username.clone(),
                display_name.clone(),
                avatar_url.clone(),
                platform_bio.clone(),
                platform_verified.unwrap_or(0),
                platform_data.clone(),
                follower_count,
                following_count,
                post_count,
                existing_id,
                token_expires_at
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

        if let Some(conn_id) = connection_id.clone() {
            conn.execute(
                "INSERT INTO social_account_connections (
                    social_account_id, connection_id, external_profile_id, external_account_id, external_user_id, is_primary, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 1, unixepoch())
                 ON CONFLICT(social_account_id, connection_id) DO UPDATE SET
                    external_profile_id = excluded.external_profile_id,
                    external_account_id = excluded.external_account_id,
                    external_user_id = excluded.external_user_id",
                 crate::turso_params![
                     final_account_id.clone(), conn_id, external_profile_id.clone(), external_account_id.clone(), external_user_id.clone()
                 ]
            ).await.map_err(|e| e.to_string())?;
        }

        let mut rows = conn.query(
            "SELECT a.id, a.profile_id, a.platform, a.platform_user_id, a.platform_username, a.platform_display_name,
                    a.platform_avatar_url, a.platform_bio, a.platform_verified, a.platform_data, a.token_expires_at,
                    a.is_connected, a.follower_count, a.following_count, a.platform_post_count as post_count,
                    c.connection_id, c.external_account_id, a.created_at, a.updated_at
             FROM social_accounts a
             LEFT JOIN social_account_connections c ON a.id = c.social_account_id AND c.is_primary = 1
             WHERE a.id = ?1 LIMIT 1",
            crate::turso_params![final_account_id],
        ).await.map_err(|e| e.to_string())?;

        if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            return account_from_row(&row);
        }
    } else {
        final_account_id = id.clone();
        conn.execute(
            "INSERT INTO social_accounts
               (id, profile_id, platform, platform_user_id, platform_username, platform_display_name,
                platform_avatar_url, platform_bio, platform_verified, platform_data,
                follower_count, following_count, platform_post_count,
                token_expires_at, is_connected, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,1, unixepoch(), unixepoch())",
            crate::turso_params![
                id, profile_id.clone(), platform.clone(), platform_user_id.clone(),
                username.clone(), display_name.clone(), avatar_url.clone(),
                platform_bio.clone(), platform_verified.unwrap_or(0), platform_data.unwrap_or_else(|| "{}".to_string()),
                follower_count.unwrap_or(0), following_count.unwrap_or(0), post_count.unwrap_or(0),
                token_expires_at
            ],
        ).await.map_err(|e| e.to_string())?;

        if let Some(conn_id) = connection_id.clone() {
            conn.execute(
                "INSERT INTO social_account_connections (
                    social_account_id, connection_id, external_profile_id, external_account_id, external_user_id, is_primary, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 1, unixepoch())
                 ON CONFLICT(social_account_id, connection_id) DO UPDATE SET
                    external_profile_id = excluded.external_profile_id,
                    external_account_id = excluded.external_account_id,
                    external_user_id = excluded.external_user_id",
                 crate::turso_params![
                     final_account_id.clone(), conn_id, external_profile_id.clone(), external_account_id.clone(), external_user_id.clone()
                 ]
            ).await.map_err(|e| e.to_string())?;
        }

        let mut rows = conn.query(
            "SELECT a.id, a.profile_id, a.platform, a.platform_user_id, a.platform_username, a.platform_display_name,
                    a.platform_avatar_url, a.platform_bio, a.platform_verified, a.platform_data, a.token_expires_at,
                    a.is_connected, a.follower_count, a.following_count, a.platform_post_count as post_count,
                    c.connection_id, c.external_account_id, a.created_at, a.updated_at
             FROM social_accounts a
             LEFT JOIN social_account_connections c ON a.id = c.social_account_id AND c.is_primary = 1
             WHERE a.id = ?1 LIMIT 1",
            crate::turso_params![final_account_id],
        ).await.map_err(|e| e.to_string())?;

        if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            return account_from_row(&row);
        }
    }

    Err("Failed to retrieve upserted social account".to_string())
}

/// Disconnect a social account — sets is_connected=0, clears tokens.
#[tauri::command]
pub async fn disconnect_social_account(
    account_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE social_accounts SET
           is_connected = 0,
           updated_at = unixepoch()
         WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![account_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// List posts for the active profile. Optionally filter by status or platform.
#[tauri::command]
pub async fn list_social_posts(
    status: Option<String>,
    platform: Option<String>,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SocialPostRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT CAST(id AS TEXT), CAST(profile_id AS TEXT), CAST(group_id AS TEXT), CAST(account_id AS TEXT), CAST(platform AS TEXT), CAST(content AS TEXT),
                CAST(COALESCE(media_items,'[]') AS TEXT), CAST(status AS TEXT), CAST(scheduled_for AS TEXT), CAST(published_at AS TEXT),
                CAST(platform_post_id AS TEXT), CAST(platform_post_url AS TEXT), CAST(error AS TEXT),
                CAST(0 AS TEXT) as likes, CAST(0 AS TEXT) as comments, CAST(0 AS TEXT) as shares, CAST(0 AS TEXT) as impressions, CAST(scheduled_via AS TEXT), CAST(created_at AS TEXT), CAST(updated_at AS TEXT)
         FROM social_posts
         WHERE profile_id = ?1
           AND (?2 IS NULL OR status = ?2)
           AND (?3 IS NULL OR platform = ?3)
         ORDER BY COALESCE(scheduled_for, created_at) DESC
         LIMIT ?4",
        crate::turso_params![profile_id, status, platform, limit.unwrap_or(100)],
    ).await.map_err(|e| {
        let err_str = format!("SQL ERROR in list_social_posts: {}", e);
        std::fs::write("/tmp/sql_error.txt", &err_str).ok();
        err_str
    })?;

    let mut posts = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| {
        let err_str = format!("ROW ERROR in list_social_posts: {}", e);
        std::fs::write("/tmp/sql_error.txt", &err_str).ok();
        err_str
    })? {
        posts.push(post_from_row(&row).map_err(|e| {
            let err_str = format!("PARSE ERROR in list_social_posts: {}", e);
            std::fs::write("/tmp/sql_error.txt", &err_str).ok();
            err_str
        })?);
    }
    Ok(posts)
}

/// Create a new post draft (status=draft) or scheduled post (status=scheduled).
#[derive(Serialize)]
struct PresignedUrlReq {
    filename: String,
    #[serde(rename = "contentType")]
    content_type: String,
}

#[derive(Serialize)]
struct ZernioPostPlatform {
    platform: String,
    #[serde(rename = "accountId")]
    account_id: String,
}

#[derive(Serialize)]
struct ZernioPostMedia {
    #[serde(rename = "type")]
    media_type: String,
    url: String,
}

#[derive(Serialize)]
struct ZernioPostReq {
    content: String,
    platforms: Vec<ZernioPostPlatform>,
    #[serde(rename = "mediaItems", skip_serializing_if = "Vec::is_empty")]
    media_items: Vec<ZernioPostMedia>,
    #[serde(rename = "publishNow")]
    publish_now: bool,
    #[serde(rename = "useQueue")]
    use_queue: bool,
    #[serde(rename = "scheduledFor", skip_serializing_if = "Option::is_none")]
    scheduled_for: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ZernioResPlatform {
    #[serde(rename = "platformPostId")]
    platform_post_id: Option<String>,
    #[serde(rename = "platformPostUrl")]
    platform_post_url: Option<String>,
    platform: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ZernioPostInner {
    #[serde(rename = "_id")]
    id: String,
    status: String,
    #[serde(rename = "platformPostId")]
    platform_post_id: Option<String>,
    #[serde(rename = "platformPostUrl")]
    platform_post_url: Option<String>,
    #[serde(default)]
    platforms: Vec<ZernioResPlatform>,
}

#[derive(Deserialize, Debug)]
struct ZernioPostRes {
    post: ZernioPostInner,
}

#[tauri::command]
pub async fn create_social_post(
    data: CreatePostData,
    state: State<'_, Arc<AppState>>,
) -> Result<SocialPostRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    let mode = data.mode.clone().unwrap_or_else(|| "draft".to_string());

    let mut external_post_id = None;
    let mut final_status = "draft".to_string();
    let external_account_id: Option<String> = None;
    let mut final_media = data.media_items.clone(); // by default, just the local path
    let mut platform_post_id: Option<String> = None;
    let mut platform_post_url: Option<String> = None;
    let mut error_message: Option<String> = None;
    let mut scheduled_via = "byok".to_string();

    if mode != "draft" {
        let acc_id = data
            .account_id
            .clone()
            .ok_or_else(|| "No accountId provided".to_string())?;

        let mut connection_id = data.connection_id.clone();
        let mut external_account_id: Option<String> = None;

        if let Some(cid) = &connection_id {
            // Fetch specific connection
            let mut acc_rows = conn.query("SELECT c.external_account_id FROM social_account_connections c WHERE c.social_account_id = ?1 AND c.connection_id = ?2 LIMIT 1", crate::turso_params![acc_id.clone(), cid.clone()]).await.map_err(|e| e.to_string())?;
            if let Some(row) = acc_rows.next().await.map_err(|e| e.to_string())? {
                external_account_id = row.get::<String>(0).ok();
            }
        } else {
            // Fallback to first primary connection
            let mut acc_rows = conn.query("SELECT c.external_account_id, c.connection_id FROM social_accounts a LEFT JOIN social_account_connections c ON a.id = c.social_account_id AND c.is_primary = 1 WHERE a.id = ?1 LIMIT 1", crate::turso_params![acc_id.clone()]).await.map_err(|e| e.to_string())?;
            if let Some(row) = acc_rows.next().await.map_err(|e| e.to_string())? {
                external_account_id = row.get::<String>(0).ok();
                connection_id = row.get::<String>(1).ok();
            }
        }

        if let Some(c_id) = connection_id.clone() {
            if let Ok(mut c_rows) = conn
                .query(
                    "SELECT service FROM connections WHERE id = ?1",
                    crate::turso_params![c_id],
                )
                .await
            {
                if let Ok(Some(c_row)) = c_rows.next().await {
                    if let Ok(svc) = c_row.get::<String>(0) {
                        scheduled_via = svc;
                    }
                }
            }
        }

        let _z_acc_id = external_account_id
            .clone()
            .ok_or_else(|| format!("Account {} is not synced with Zernio", acc_id))?;

        // Fetch API key using connection_id
        let mut api_key = None;
        if let Some(c_id) = connection_id {
            let mut api_key_rows = conn
                .query(
                    "SELECT COALESCE(access_token, client_id) FROM connections WHERE id = ?1",
                    crate::turso_params![c_id],
                )
                .await
                .map_err(|e| e.to_string())?;
            if let Some(row) = api_key_rows.next().await.map_err(|e| e.to_string())? {
                api_key = row.get::<String>(0).ok();
            }
        }
        if api_key.is_none() {
            api_key = std::env::var("ZERNIO_API_KEY").ok();
        }
        let api_key = api_key.ok_or_else(|| {
            "No Zernio API key configured. Please connect Zernio in Settings.".to_string()
        })?;
        let z_acc_id = external_account_id
            .clone()
            .ok_or_else(|| format!("Account {} is not synced with Zernio", acc_id))?;

        let client = crate::db::turso::create_shared_http_client();
        let mut media_items = Vec::new();

        // Handle Media Upload if local path is provided
        if let Some(ref local_path) = data.media_items {
            // Read file
            let file_bytes = std::fs::read(local_path)
                .map_err(|e| format!("Failed to read media file: {}", e))?;
            let mime = mime_guess::from_path(local_path)
                .first_or_octet_stream()
                .to_string();

            // 1. Get Presigned URL
            let filename = std::path::Path::new(local_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("upload")
                .to_string();
            let presigned_res = client
                .post("https://api.zernio.com/v1/media/presign")
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&PresignedUrlReq {
                    filename,
                    content_type: mime.clone(),
                })
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !presigned_res.status().is_success() {
                let err = presigned_res.text().await.unwrap_or_default();
                return Err(format!("Failed to get presigned URL: {}", err));
            }
            let raw_text = presigned_res.text().await.unwrap_or_default();
            log::debug!("Presigned URL Raw Response: {}", raw_text);
            let presigned_json: serde_json::Value = serde_json::from_str(&raw_text)
                .map_err(|e| format!("Presigned decode error: {}", e))?;

            // Try to extract from either root or "media" wrapper
            let root_or_media = presigned_json.get("media").unwrap_or(&presigned_json);

            let upload_url = root_or_media
                .get("uploadUrl")
                .or_else(|| root_or_media.get("upload_url"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            let public_url = root_or_media
                .get("publicUrl")
                .or_else(|| root_or_media.get("public_url"))
                .or_else(|| root_or_media.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            if upload_url.is_empty() || public_url.is_empty() {
                return Err(format!(
                    "Failed to parse uploadUrl or publicUrl from presign response: {}",
                    raw_text
                ));
            }

            // 2. PUT to presigned URL
            let put_res = client
                .put(&upload_url)
                .header("Content-Type", mime)
                .body(file_bytes)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !put_res.status().is_success() {
                let err = put_res.text().await.unwrap_or_default();
                return Err(format!("Failed to upload media: {}", err));
            }

            media_items.push(ZernioPostMedia {
                media_type: "image".to_string(), // Defaulting to image for now
                url: public_url,
            });
            // Store the zernio media ID in local DB instead of the local path
            final_media = Some(serde_json::to_string(&media_items).unwrap_or_default());
        }

        if scheduled_via == "composio" && data.platform.to_lowercase() == "instagram" {
            let public_url = media_items.first().map(|m| m.url.as_str());
            let (post_id, post_url) =
                crate::commands::composio_integration::publish_social_post_composio_instagram(
                    &api_key,
                    &z_acc_id, // For composio this is the connected_account_id or entity_id
                    &data.content,
                    public_url,
                )
                .await?;

            platform_post_id = Some(post_id);
            platform_post_url = Some(post_url);
            final_status = "published".to_string();
        } else {
            // Prepare Post Payload
            let scheduled_for = data.scheduled_for.map(|ts| {
                chrono::DateTime::from_timestamp(ts, 0)
                    .unwrap_or_default()
                    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            });

            let req = ZernioPostReq {
                content: data.content.clone(),
                platforms: vec![ZernioPostPlatform {
                    platform: data.platform.clone(),
                    account_id: z_acc_id,
                }],
                media_items,
                publish_now: mode == "publish",
                use_queue: mode == "queue",
                scheduled_for,
            };

            // 3. Create Post on Zernio
            let post_res = client
                .post("https://api.zernio.com/v1/posts")
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&req)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !post_res.status().is_success() {
                let err = post_res.text().await.unwrap_or_default();
                return Err(format!("Zernio create post failed: {}", err));
            }

            let raw_post_text = post_res.text().await.unwrap_or_default();
            log::debug!("Post Create Raw Response: {}", raw_post_text);
            let parsed_json: serde_json::Value =
                serde_json::from_str(&raw_post_text).unwrap_or(serde_json::json!({}));

            let post_json: ZernioPostRes = serde_json::from_str(&raw_post_text)
                .map_err(|e| format!("Post decode error: {}", e))?;
            log::debug!("Parsed ZernioPostRes: {:?}", post_json);

            external_post_id = Some(post_json.post.id.clone());
            final_status = post_json.post.status.clone();

            let mut manual_id = None;
            let mut manual_url = None;
            if let Some(platforms) = parsed_json
                .get("post")
                .and_then(|p| p.get("platforms"))
                .and_then(|p| p.as_array())
            {
                for p in platforms {
                    if p.get("platform").and_then(|v| v.as_str()) == Some(data.platform.as_str()) {
                        manual_id = p
                            .get("platformPostId")
                            .and_then(|v| v.as_str().map(String::from));
                        manual_url = p
                            .get("platformPostUrl")
                            .and_then(|v| v.as_str().map(String::from));
                        if let Some(s) = p.get("status").and_then(|v| v.as_str()) {
                            final_status = s.to_string();
                        }
                        if let Some(e) = p.get("errorMessage").and_then(|v| v.as_str()) {
                            error_message = Some(e.to_string());
                        }
                    }
                }
            }

            platform_post_id = post_json
                .post
                .platform_post_id
                .or_else(|| {
                    post_json
                        .post
                        .platforms
                        .iter()
                        .find(|p| p.platform.as_deref() == Some(data.platform.as_str()))
                        .and_then(|p| p.platform_post_id.clone())
                })
                .or(manual_id);

            platform_post_url = post_json
                .post
                .platform_post_url
                .or_else(|| {
                    post_json
                        .post
                        .platforms
                        .iter()
                        .find(|p| p.platform.as_deref() == Some(data.platform.as_str()))
                        .and_then(|p| p.platform_post_url.clone())
                })
                .or(manual_url);

            log::debug!(
                "Final extracted ID: {:?}, URL: {:?}",
                platform_post_id, platform_post_url
            );
        }
    }

    let is_publish_now = if mode == "publish" { 1 } else { 0 };
    let is_use_queue = if mode == "queue" { 1 } else { 0 };

    // Insert into local database
    conn.execute(
        "INSERT INTO social_posts
           (id, profile_id, group_id, account_id, platform, content, media_items,
            status, scheduled_for, created_at, updated_at, external_post_id, external_account_id,
            publish_now, use_queue, platform_post_id, platform_post_url, error, scheduled_via)
         VALUES (?1,?2,?3,?4,?5,?6,COALESCE(?7,'[]'),?8,?9, unixepoch(), unixepoch(), ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        crate::turso_params![
            id.clone(), profile_id, data.group_id, data.account_id,
            data.platform, data.content, final_media, final_status, data.scheduled_for,
            external_post_id, external_account_id, is_publish_now, is_use_queue,
            platform_post_id, platform_post_url, error_message, scheduled_via
        ],
    ).await.map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT CAST(id AS TEXT), CAST(profile_id AS TEXT), CAST(group_id AS TEXT), CAST(account_id AS TEXT), CAST(platform AS TEXT), CAST(content AS TEXT),
                CAST(COALESCE(media_items,'[]') AS TEXT), CAST(status AS TEXT), CAST(scheduled_for AS TEXT), CAST(published_at AS TEXT),
                CAST(platform_post_id AS TEXT), CAST(platform_post_url AS TEXT), CAST(error AS TEXT),
                CAST(0 AS TEXT) as likes, CAST(0 AS TEXT) as comments, CAST(0 AS TEXT) as shares, CAST(0 AS TEXT) as impressions, CAST(scheduled_via AS TEXT), CAST(created_at AS TEXT), CAST(updated_at AS TEXT)
         FROM social_posts WHERE id = ?1",
        crate::turso_params![id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        post_from_row(&row)
    } else {
        Err("Post insert failed".to_string())
    }
}

/// Schedule an existing draft post (sets status=scheduled + scheduled_for).
#[tauri::command]
pub async fn schedule_post(
    post_id: String,
    scheduled_for: i64,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE social_posts SET status = 'scheduled', scheduled_for = ?1,
         updated_at = unixepoch() WHERE id = ?2 AND profile_id = ?3",
        crate::turso_params![scheduled_for, post_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_social_posts(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<i32, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut count_rows = conn
        .query(
            "SELECT COUNT(*) FROM social_posts WHERE profile_id = ?1",
            crate::turso_params![profile_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    let post_count = if let Some(row) = count_rows.next().await.map_err(|e| e.to_string())? {
        row.get::<i64>(0).unwrap_or(0)
    } else {
        0
    };

    let mut updated_count = 0;
    let client = crate::db::turso::create_shared_http_client();

    if post_count == 0 {
        // ONE-TIME HISTORICAL FETCH
        let mut api_key = std::env::var("ZERNIO_API_KEY").ok();
        if api_key.is_none() {
            if let Ok(mut key_rows) = conn.query("SELECT COALESCE(access_token, client_id) FROM connections WHERE service = 'zernio' LIMIT 1", vec![]).await {
                if let Ok(Some(row)) = key_rows.next().await {
                    api_key = row.get::<String>(0).ok();
                }
            }
        }

        if let Some(key) = api_key {
            let res = client
                .get("https://api.zernio.com/v1/posts")
                .bearer_auth(key)
                .send()
                .await;

            if let Ok(response) = res {
                if response.status().is_success() {
                    let text = response.text().await.unwrap_or_default();
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(posts) = parsed.get("posts").and_then(|p| p.as_array()) {
                            for post in posts {
                                let ext_post_id =
                                    post.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                                let content = post
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or_default();
                                let status = post
                                    .get("status")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("published");
                                let published_at = post
                                    .get("publishedAt")
                                    .and_then(|v| v.as_str())
                                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                                    .map(|dt| dt.timestamp());
                                let scheduled_for = post
                                    .get("scheduledFor")
                                    .and_then(|v| v.as_str())
                                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                                    .map(|dt| dt.timestamp());

                                if let Some(platforms) =
                                    post.get("platforms").and_then(|p| p.as_array())
                                {
                                    for p in platforms {
                                        let platform = p
                                            .get("platform")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let platform_id =
                                            p.get("platformPostId").and_then(|v| v.as_str());
                                        let platform_url =
                                            p.get("platformPostUrl").and_then(|v| v.as_str());
                                        let p_status = p
                                            .get("status")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or(status);

                                        // Need to match with local account_id somehow. Let's find an account ID for this platform
                                        let acc_id = if let Ok(mut acc_id_query) = conn.query("SELECT id FROM social_accounts WHERE profile_id = ?1 AND platform = ?2 LIMIT 1", crate::turso_params![profile_id.clone(), platform]).await {
                                            if let Ok(Some(row)) = acc_id_query.next().await {
                                                row.get::<String>(0).unwrap_or_default()
                                            } else {
                                                continue;
                                            }
                                        } else {
                                            continue;
                                        };

                                        let id = uuid::Uuid::new_v4().to_string();
                                        let unique_ext_post_id =
                                            format!("{}_{}", ext_post_id, platform);
                                        let media_items_json = p
                                            .get("mediaItems")
                                            .or_else(|| post.get("mediaItems"))
                                            .map(|m| m.to_string())
                                            .unwrap_or_else(|| "[]".to_string());

                                        let _ = conn.execute(
                                            "INSERT OR IGNORE INTO social_posts 
                                             (id, profile_id, account_id, platform, content, media_items, status, external_post_id, platform_post_id, platform_post_url, published_at, scheduled_for, created_at, updated_at) 
                                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, unixepoch(), unixepoch())",
                                            crate::turso_params![id, profile_id.clone(), acc_id, platform, content, media_items_json, p_status, unique_ext_post_id, platform_id, platform_url, published_at, scheduled_for]
                                        ).await;
                                        updated_count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut rows = conn.query(
        "SELECT CAST(sp.id AS TEXT), CAST(sp.external_post_id AS TEXT), CAST(sp.platform AS TEXT), CAST(COALESCE(c.access_token, c.client_id) AS TEXT)
         FROM social_posts sp
         JOIN social_accounts sa ON sp.account_id = sa.id
         JOIN social_account_connections sac ON sa.id = sac.social_account_id AND sac.is_primary = 1
         JOIN connections c ON sac.connection_id = c.id
         WHERE sp.profile_id = ?1 AND (sp.status IN ('publishing', 'scheduled') OR (sp.status = 'published' AND sp.platform_post_url IS NULL)) AND sp.external_post_id IS NOT NULL",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut pending_syncs = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let post_id: String = row.get(0).map_err(|e| e.to_string())?;
        let external_post_id: String = row.get(1).map_err(|e| e.to_string())?;
        let platform: String = row.get(2).unwrap_or_default();
        let api_key = row
            .get::<String>(3)
            .ok()
            .or_else(|| std::env::var("ZERNIO_API_KEY").ok());
        pending_syncs.push((post_id, external_post_id, platform, api_key));
    }
    drop(rows); // release the read lock!

    let client = crate::db::turso::create_shared_http_client();

    for (post_id, external_post_id, platform, api_key) in pending_syncs {
        if let Some(key) = api_key {
            let res = client
                .get(&format!(
                    "https://api.zernio.com/v1/posts/{}",
                    external_post_id
                ))
                .bearer_auth(key)
                .send()
                .await;

            if let Ok(response) = res {
                if response.status().is_success() {
                    let text = response.text().await.unwrap_or_default();
                    let parsed: serde_json::Value =
                        serde_json::from_str(&text).unwrap_or(serde_json::json!({}));

                    if let Some(post) = parsed.get("post") {
                        // Extract top-level status
                        let status = post
                            .get("status")
                            .and_then(|v| v.as_str())
                            .unwrap_or("publishing");

                        // Extract platform specifics
                        let mut platform_id = None;
                        let mut platform_url = None;
                        let mut error_msg = None;
                        let mut p_status = status.to_string();

                        if let Some(platforms) = post.get("platforms").and_then(|p| p.as_array()) {
                            for p in platforms {
                                if p.get("platform").and_then(|v| v.as_str())
                                    == Some(platform.as_str())
                                {
                                    platform_id = p
                                        .get("platformPostId")
                                        .and_then(|v| v.as_str().map(String::from));
                                    platform_url = p
                                        .get("platformPostUrl")
                                        .and_then(|v| v.as_str().map(String::from));
                                    error_msg = p
                                        .get("errorMessage")
                                        .and_then(|v| v.as_str().map(String::from));
                                    if let Some(s) = p.get("status").and_then(|v| v.as_str()) {
                                        p_status = s.to_string();
                                    }
                                }
                            }
                        }

                        // Also look up publishedAt if available
                        let published_at = post
                            .get("publishedAt")
                            .and_then(|v| v.as_str())
                            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                            .map(|dt| dt.timestamp());

                        conn.execute(
                            "UPDATE social_posts 
                             SET status = ?1, platform_post_id = COALESCE(?2, platform_post_id), 
                                 platform_post_url = COALESCE(?3, platform_post_url), error = ?4,
                                 published_at = COALESCE(?5, published_at), updated_at = unixepoch()
                             WHERE id = ?6",
                            crate::turso_params![
                                p_status,
                                platform_id,
                                platform_url,
                                error_msg,
                                published_at,
                                post_id
                            ],
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                        updated_count += 1;
                    }
                }
            }
        }
    }

    Ok(updated_count)
}

#[tauri::command]
pub async fn delete_social_post(
    id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let _profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT external_post_id FROM social_posts WHERE id = ?1",
            crate::turso_params![id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let external_post_id: Option<String> = row.get(0).ok().unwrap_or(None);
        if let Some(z_id) = external_post_id {
            if let Ok(api_key) = std::env::var("ZERNIO_API_KEY") {
                let client = crate::db::turso::create_shared_http_client();
                let _ = client
                    .delete(&format!("https://api.zernio.com/v1/posts/{}", z_id))
                    .bearer_auth(api_key)
                    .send()
                    .await;
            }
        }
    }

    conn.execute(
        "DELETE FROM social_posts WHERE id = ?1",
        crate::turso_params![id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

use serde_json::Value;

#[tauri::command]
pub async fn zernio_list_inbox_conversations(
    profile_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<Vec<SocialConversationRow>, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Find all Zernio connections
    let mut rows = conn.query("SELECT id, name, COALESCE(access_token, client_id) FROM connections WHERE service LIKE '%zernio%' AND profile_id = ?1", crate::turso_params![profile_id.clone()]).await.map_err(|e| e.to_string())?;

    let client = crate::db::turso::create_shared_http_client();
    let mut all_fetched_convs = Vec::new();

    log::debug!("ZERNIO INBOX SYNC: Starting for profile {}", profile_id);
    let mut connections_to_process = Vec::new();

    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let conn_id: String = row.get(0).unwrap_or_default();
        let conn_name: String = row.get(1).unwrap_or_else(|_| "Zernio".to_string());
        if let Ok(k) = row.get::<String>(2) {
            connections_to_process.push((conn_id, conn_name, k));
        }
    }
    drop(rows); // release read lock

    // Fallback to ENV var if no Zernio connections exist in DB
    if connections_to_process.is_empty() {
        if let Ok(env_key) = std::env::var("ZERNIO_API_KEY") {
            log::debug!("ZERNIO INBOX SYNC: Falling back to ZERNIO_API_KEY from env");
            connections_to_process.push((
                "env_conn".to_string(),
                "Zernio (ENV)".to_string(),
                env_key,
            ));
        }
    }

    let mut conn_count = 0;

    for (conn_id, conn_name, api_key) in connections_to_process {
        conn_count += 1;
        log::debug!(
            "ZERNIO INBOX SYNC: Found connection {} with api key len {}",
            conn_name,
            api_key.len()
        );

        let mut account_mappings = Vec::new();

        // Query local social_accounts table for external_account_id linked to THIS connection
        if let Ok(mut acc_rows) = conn.query(
            "SELECT c.external_account_id FROM social_accounts a JOIN social_account_connections c ON a.id = c.social_account_id WHERE a.profile_id = ?1 AND c.connection_id = ?2 AND c.external_account_id IS NOT NULL AND a.platform IN ('instagram', 'facebook', 'googlebusiness')", 
            crate::turso_params![profile_id.clone(), conn_id.clone()]
        ).await {
            while let Ok(Some(row)) = acc_rows.next().await {
                if let Ok(z_acc_id) = row.get::<String>(0) {
                    if !z_acc_id.is_empty() {
                        account_mappings.push(z_acc_id);
                    }
                }
            }
        }

        if account_mappings.is_empty() {
            return Err("No valid Zernio accounts found (instagram, facebook, or googlebusiness) with external_account_id in social_accounts.".to_string());
        }

        for acc_id in account_mappings {
            let url = if acc_id.is_empty() {
                "https://api.zernio.com/v1/inbox/conversations?limit=100".to_string()
            } else {
                format!(
                    "https://api.zernio.com/v1/inbox/conversations?limit=100&social_account_id={}",
                    acc_id
                )
            };

            log::debug!("ZERNIO INBOX SYNC: Fetching {}", url);
            let res = client.get(&url).bearer_auth(&api_key).send().await;

            if let Ok(response) = res {
                if let Ok(json) = response.json::<Value>().await {
                    let arrays = [
                        json.get("data").and_then(|d| d.as_array()),
                        json.get("items").and_then(|d| d.as_array()),
                        json.get("conversations").and_then(|d| d.as_array()),
                    ];

                    let mut found_arr = false;
                    for arr in arrays {
                        if let Some(data) = arr {
                            found_arr = true;
                            log::debug!(
                                "ZERNIO INBOX SYNC: Found {} conversations in JSON array",
                                data.len()
                            );
                            for item in data {
                                all_fetched_convs.push((
                                    item.clone(),
                                    acc_id.clone(),
                                    conn_name.clone(),
                                ));
                            }
                            break; // Stop looking in other arrays once we found one
                        }
                    }
                    if !found_arr {
                        log::debug!("ZERNIO INBOX SYNC: Could not find 'data', 'items', or 'conversations' array in response");
                    }
                } else {
                    log::debug!("ZERNIO INBOX SYNC: Failed to parse JSON response");
                }
            } else {
                log::debug!("ZERNIO INBOX SYNC: Fetch failed {:?}", res.err());
            }
        }
    }

    log::debug!(
        "ZERNIO INBOX SYNC: Total Zernio connections processed: {}",
        conn_count
    );
    log::debug!(
        "ZERNIO INBOX SYNC: Fetched {} conversations total. Inserting to SQLite...",
        all_fetched_convs.len()
    );

    // Sync to SQLite
    for (conv, fallback_acc_id, conn_name) in all_fetched_convs {
        let z_id = conv.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if z_id.is_empty() {
            continue;
        }

        let platform = conv
            .get("platform")
            .and_then(|v| v.as_str())
            .unwrap_or("instagram");
        let z_acc_id = conv
            .get("accountId")
            .and_then(|v| v.as_str())
            .unwrap_or(&fallback_acc_id);

        let participant_id = conv.get("participantId").and_then(|v| v.as_str());
        let participant_name = conv.get("participantName").and_then(|v| v.as_str());
        let participant_username = conv.get("participantUsername").and_then(|v| v.as_str());
        let participant_picture = conv.get("participantPicture").and_then(|v| v.as_str());

        let last_message = conv.get("lastMessage").and_then(|v| v.as_str());
        let updated_time = conv
            .get("updatedTime")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.timestamp())
            .unwrap_or_else(|| chrono::Utc::now().timestamp());

        let status = conv
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("open");
        let unread_count = conv
            .get("unreadCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let mut row_id = uuid::Uuid::new_v4().to_string();
        let mut existing_rows = conn.query("SELECT id FROM social_conversations WHERE profile_id = ?1 AND external_conversation_id = ?2", crate::turso_params![profile_id.clone(), z_id]).await.map_err(|e| e.to_string())?;
        let is_existing = if let Some(er) = existing_rows.next().await.map_err(|e| e.to_string())? {
            row_id = er.get::<String>(0).unwrap();
            true
        } else {
            false
        };
        drop(existing_rows);

        if is_existing {
            conn.execute(
                "UPDATE social_conversations SET 
                 participant_platform_id = COALESCE(?1, participant_platform_id),
                 participant_username = COALESCE(?2, participant_username),
                 participant_name = COALESCE(?3, participant_name),
                 participant_picture = COALESCE(?4, participant_picture),
                 last_message_preview = COALESCE(?5, last_message_preview),
                 last_message_at = COALESCE(?6, last_message_at),
                 status = ?7, unread_count = ?8, inbox_source = ?9, updated_at = unixepoch()
                 WHERE id = ?10",
                crate::turso_params![
                    participant_id,
                    participant_username,
                    participant_name,
                    participant_picture,
                    last_message,
                    updated_time,
                    status,
                    unread_count,
                    conn_name.clone(),
                    row_id
                ],
            )
            .await
            .map_err(|e| e.to_string())?;
        } else {
            let mut crm_contact_id = None;
            if let Some(username) = participant_username {
                if !username.is_empty() {
                    if let Ok(mut crm_row) = conn.query(
                        "SELECT id FROM crm_contacts WHERE profile_id = ?1 AND platform = ?2 AND platform_username = ?3 LIMIT 1", 
                        crate::turso_params![profile_id.clone(), platform, username]
                    ).await {
                        if let Ok(Some(row)) = crm_row.next().await {
                            if let Ok(id) = row.get::<String>(0) {
                                crm_contact_id = Some(id);
                            }
                        }
                    }
                }
            }

            let final_crm_id = if let Some(id) = crm_contact_id {
                id
            } else {
                let new_id = uuid::Uuid::new_v4().to_string();
                let first_name = participant_name.unwrap_or("Unknown");
                let _ = conn.execute(
                    "INSERT INTO crm_contacts (id, profile_id, first_name, avatar_url, platform, platform_username, source, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    crate::turso_params![new_id.clone(), profile_id.clone(), first_name, participant_picture, platform, participant_username, "social_inbox", "lead"]
                ).await;
                new_id
            };

            conn.execute(
                "INSERT INTO social_conversations (
                    id, profile_id, account_id, inbox_source, platform, external_conversation_id,
                    participant_platform_id, participant_username, participant_name, participant_picture,
                    status, unread_count, last_message_preview, last_message_at, crm_contact_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                crate::turso_params![row_id, profile_id.clone(), z_acc_id, conn_name, platform, z_id, participant_id, participant_username, participant_name, participant_picture, status, unread_count, last_message, updated_time, final_crm_id]
            ).await.map_err(|e| e.to_string())?;
        }
    }

    // Now query all from SQLite
    let mut rows = conn.query(
        "SELECT id, profile_id, account_id, inbox_source, platform, external_conversation_id,
                platform_conversation_id, crm_contact_id, participant_platform_id,
                participant_username, participant_name, participant_picture, participant_profile_url,
                participant_follower_count, status, unread_count, is_pinned, last_message_preview,
                last_message_at, last_message_id, assigned_to, assigned_at, snoozed_until,
                labels, created_at, updated_at
         FROM social_conversations
         WHERE profile_id = ?1
         ORDER BY last_message_at DESC",
        crate::turso_params![profile_id]
    ).await.map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(conversation_from_row(&row)?);
    }

    Ok(items)
}

#[tauri::command]
pub async fn zernio_get_inbox_messages(
    profile_id: String,
    conversation_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<Vec<SocialMessageRow>, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, conversation_id, account_id, inbox_source, external_message_id,
                platform_message_id, type, platform, sender_platform_id, sender_username,
                sender_display_name, sender_avatar_url, sender_profile_url, is_own,
                in_reply_to_message_id, post_id, platform_post_id, content, media_urls,
                rating, review_title, status, is_starred, is_pinned, sentiment, read_at,
                reply_content, replied_at, replied_by, agent_draft,
                agent_sentiment, agent_suggested_action, agent_processed, approval_status,
                auto_reply_sent, auto_reply_automation_id, auto_reply_sent_at,
                email_message_id, email_thread_id, email_subject, email_from, email_to,
                received_at, created_at, updated_at
         FROM social_messages
         WHERE profile_id = ?1 AND conversation_id = ?2
         ORDER BY received_at ASC",
            crate::turso_params![profile_id, conversation_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        if let Ok(msg) = message_from_row(&row) {
            items.push(msg);
        } else {
            log::debug!("DEBUG: Failed to parse a row in message_from_row!");
        }
    }

    log::debug!("DEBUG: Returned {} messages from DB", items.len());
    Ok(items)
}

#[tauri::command]
pub async fn zernio_sync_inbox_messages(
    profile_id: String,
    conversation_id: String,
    api_key: String,
    account_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<Vec<SocialMessageRow>, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let client = crate::db::turso::create_shared_http_client();
    let mut zernio_conv_id = String::new();
    let mut platform_val = String::new();
    let mut rows = conn.query("SELECT external_conversation_id, platform FROM social_conversations WHERE id = ?1 AND profile_id = ?2", crate::turso_params![conversation_id.clone(), profile_id.clone()]).await.map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        zernio_conv_id = row.get::<String>(0).unwrap_or_default();
        platform_val = row
            .get::<String>(1)
            .unwrap_or_else(|_| "instagram".to_string());
    }
    drop(rows);

    if zernio_conv_id.is_empty() {
        zernio_conv_id = conversation_id.clone();
    }

    let mut actual_api_key = api_key;
    if actual_api_key.is_empty() {
        if let Ok(mut c_rows) = conn
            .query(
                "SELECT COALESCE(c.access_token, c.client_id) 
             FROM connections c 
             JOIN social_account_connections sac ON c.id = sac.connection_id 
             WHERE sac.external_account_id = ?1 OR sac.social_account_id = ?1",
                crate::turso_params![account_id.clone()],
            )
            .await
        {
            if let Ok(Some(c_row)) = c_rows.next().await {
                actual_api_key = c_row.get::<String>(0).unwrap_or_default();
            }
        }
    }

    let url = format!(
        "https://api.zernio.com/v1/inbox/conversations/{}/messages?accountId={}",
        zernio_conv_id, account_id
    );

    let res = client.get(&url).bearer_auth(actual_api_key).send().await;

    if let Ok(response) = res {
        if let Ok(json) = response.json::<serde_json::Value>().await {
            let messages_arr = json
                .get("messages")
                .and_then(|d| d.as_array())
                .or_else(|| json.get("data").and_then(|d| d.as_array()))
                .or_else(|| json.as_array());

            if let Some(messages) = messages_arr {
                for msg in messages {
                    let z_msg_id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    if z_msg_id.is_empty() {
                        continue;
                    }

                    let text = msg
                        .get("text")
                        .or_else(|| msg.get("content"))
                        .or_else(|| msg.get("message"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let sender_id = msg.get("senderId").and_then(|v| v.as_str());
                    let sender_username = msg.get("senderUsername").and_then(|v| v.as_str());
                    let is_own = msg.get("direction").and_then(|v| v.as_str()) == Some("outgoing")
                        || msg.get("isOwn").and_then(|v| v.as_bool()).unwrap_or(false);
                    let received_at = msg
                        .get("createdAt")
                        .or_else(|| msg.get("timestamp"))
                        .and_then(|v| v.as_str())
                        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                        .map(|dt| dt.timestamp())
                        .unwrap_or_else(|| chrono::Utc::now().timestamp());

                    let mut row_id = uuid::Uuid::new_v4().to_string();
                    let mut existing_rows = conn.query("SELECT id FROM social_messages WHERE profile_id = ?1 AND external_message_id = ?2", crate::turso_params![profile_id.clone(), z_msg_id]).await.map_err(|e| e.to_string())?;
                    let is_existing =
                        if let Some(er) = existing_rows.next().await.map_err(|e| e.to_string())? {
                            row_id = er.get::<String>(0).unwrap();
                            true
                        } else {
                            false
                        };
                    drop(existing_rows);

                    if is_existing {
                        conn.execute(
                            "UPDATE social_messages SET 
                             content = COALESCE(?1, content),
                             is_own = ?2,
                             received_at = ?3,
                             updated_at = unixepoch()
                             WHERE id = ?4",
                            crate::turso_params![text, if is_own { 1 } else { 0 }, received_at, row_id],
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                    } else {
                        conn.execute(
                            "INSERT INTO social_messages (
                                id, profile_id, conversation_id, account_id, inbox_source, external_message_id,
                                type, platform, sender_platform_id, sender_username, is_own, content, received_at
                             ) VALUES (?1, ?2, ?3, ?4, 'zernio', ?5, 'dm', ?6, ?7, ?8, ?9, ?10, ?11)",
                            crate::turso_params![row_id, profile_id.clone(), conversation_id.clone(), account_id.clone(), z_msg_id, platform_val.clone(), sender_id, sender_username, if is_own { 1 } else { 0 }, text, received_at]
                        ).await.map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    let mut rows = conn
        .query(
            "SELECT id, profile_id, conversation_id, account_id, inbox_source, external_message_id,
                platform_message_id, type, platform, sender_platform_id, sender_username,
                sender_display_name, sender_avatar_url, sender_profile_url, is_own,
                in_reply_to_message_id, post_id, platform_post_id, content, media_urls,
                rating, review_title, status, is_starred, is_pinned, sentiment, read_at,
                reply_content, replied_at, replied_by, agent_draft,
                agent_sentiment, agent_suggested_action, agent_processed, approval_status,
                auto_reply_sent, auto_reply_automation_id, auto_reply_sent_at,
                email_message_id, email_thread_id, email_subject, email_from, email_to,
                received_at, created_at, updated_at
         FROM social_messages
         WHERE profile_id = ?1 AND conversation_id = ?2
         ORDER BY received_at ASC",
            crate::turso_params![profile_id, conversation_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        if let Ok(msg) = message_from_row(&row) {
            items.push(msg);
        }
    }

    Ok(items)
}

#[tauri::command]
pub async fn zernio_send_inbox_message(
    _profile_id: String,
    conversation_id: String,
    api_key: String,
    account_id: String,
    text: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<Value, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut actual_api_key = api_key;
    if actual_api_key.is_empty() {
        if let Ok(mut c_rows) = conn
            .query(
                "SELECT COALESCE(c.access_token, c.client_id) 
             FROM connections c 
             JOIN social_account_connections sac ON c.id = sac.connection_id 
             WHERE sac.external_account_id = ?1 OR sac.social_account_id = ?1",
                crate::turso_params![account_id.clone()],
            )
            .await
        {
            if let Ok(Some(c_row)) = c_rows.next().await {
                actual_api_key = c_row.get::<String>(0).unwrap_or_default();
            }
        }

        if actual_api_key.is_empty() {
            actual_api_key = std::env::var("ZERNIO_API_KEY").unwrap_or_default();
        }
    }

    let mut zernio_conv_id = conversation_id.clone();
    if let Ok(mut rows) = conn
        .query(
            "SELECT external_conversation_id FROM social_conversations WHERE id = ?1",
            crate::turso_params![conversation_id.clone()],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            if let Ok(z_id) = row.get::<String>(0) {
                zernio_conv_id = z_id;
            }
        }
    }

    let client = crate::db::turso::create_shared_http_client();
    let url = format!(
        "https://api.zernio.com/v1/inbox/conversations/{}/messages",
        zernio_conv_id
    );

    let payload = serde_json::json!({
        "accountId": account_id,
        "text": text
    });

    let res = client
        .post(&url)
        .bearer_auth(actual_api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json = res.json::<Value>().await.map_err(|e| e.to_string())?;
    Ok(json)
}
#[tauri::command]
pub async fn list_inbox_conversations(
    profile_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<Vec<SocialConversationRow>, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query("SELECT * FROM social_conversations WHERE profile_id = ?1 ORDER BY last_message_at DESC LIMIT 50", crate::turso_params![profile_id.clone()]).await.map_err(|e| e.to_string())?;

    let mut convs = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        convs.push(SocialConversationRow {
            id: row.get(0).unwrap_or_default(),
            profile_id: row.get(1).unwrap_or_default(),
            account_id: row.get(2).unwrap_or_default(),
            inbox_source: row.get(3).unwrap_or_default(),
            platform: row.get(4).unwrap_or_default(),
            external_conversation_id: row.get::<String>(5).ok(),
            platform_conversation_id: row.get::<String>(6).ok(),
            crm_contact_id: row.get::<String>(7).ok(),
            participant_platform_id: row.get::<String>(8).ok(),
            participant_username: row.get::<String>(9).ok(),
            participant_name: row.get::<String>(10).ok(),
            participant_picture: row.get::<String>(11).ok(),
            participant_profile_url: row.get::<String>(12).ok(),
            participant_follower_count: row.get::<i64>(13).ok(),
            status: row.get(14).unwrap_or_default(),
            unread_count: row.get(15).unwrap_or_default(),
            is_pinned: row.get::<i64>(16).unwrap_or_default() != 0,
            last_message_preview: row.get::<String>(17).ok(),
            last_message_at: row.get::<i64>(18).ok(),
            last_message_id: row.get::<String>(19).ok(),
            assigned_to: row.get::<String>(20).ok(),
            assigned_at: row.get::<i64>(21).ok(),
            snoozed_until: row.get::<i64>(22).ok(),
            labels: row.get(23).unwrap_or_default(),
            created_at: row.get(24).unwrap_or_default(),
            updated_at: row.get(25).unwrap_or_default(),
        });
    }
    Ok(convs)
}

#[tauri::command]
pub async fn get_social_analytics_view(
    profile_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<serde_json::Value, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT * FROM social_analytics_view WHERE profile_id = ?1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let mut map = serde_json::Map::new();
        for i in 0..row.column_count() {
            let name = row.column_name(i as i32).unwrap_or("").to_string();
            let val = match row.get_value(i) {
                crate::db::turso::CellValue::Null => serde_json::Value::Null,
                crate::db::turso::CellValue::Integer(n) => serde_json::json!(n),
                crate::db::turso::CellValue::Float(f) => serde_json::json!(f),
                crate::db::turso::CellValue::Text(t) => {
                    // Try to parse as JSON if it looks like an object or array
                    if (t.starts_with('{') && t.ends_with('}'))
                        || (t.starts_with('[') && t.ends_with(']'))
                    {
                        serde_json::from_str(&t).unwrap_or_else(|_| serde_json::json!(t))
                    } else {
                        serde_json::json!(t)
                    }
                }
            };
            map.insert(name, val);
        }
        Ok(serde_json::Value::Object(map))
    } else {
        Ok(serde_json::json!({}))
    }
}

#[tauri::command]
pub async fn get_social_post_analytics(
    profile_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<serde_json::Value, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    // Join posts with post_analytics
    let query = "
        SELECT 
            p.id, p.platform, p.content, p.media_urls, p.created_at, p.status, p.published_at,
            a.likes, a.comments, a.shares, a.reposts, a.impressions, a.reach, a.clicks, a.saves, a.views, a.engagement_rate
        FROM social_posts p
        LEFT JOIN social_post_analytics a ON a.post_id = p.id
        WHERE p.profile_id = ?1 AND p.status = 'published'
        ORDER BY p.published_at DESC
        LIMIT 50
    ";
    let mut rows = conn
        .query(query, crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut posts = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let mut map = serde_json::Map::new();
        for i in 0..row.column_count() {
            let name = row.column_name(i as i32).unwrap_or("").to_string();
            let val = match row.get_value(i) {
                crate::db::turso::CellValue::Null => serde_json::Value::Null,
                crate::db::turso::CellValue::Integer(n) => serde_json::json!(n),
                crate::db::turso::CellValue::Float(f) => serde_json::json!(f),
                crate::db::turso::CellValue::Text(t) => {
                    if (t.starts_with('{') && t.ends_with('}'))
                        || (t.starts_with('[') && t.ends_with(']'))
                    {
                        serde_json::from_str(&t).unwrap_or_else(|_| serde_json::json!(t))
                    } else {
                        serde_json::json!(t)
                    }
                }
            };
            map.insert(name, val);
        }
        posts.push(serde_json::Value::Object(map));
    }

    Ok(serde_json::json!(posts))
}

#[tauri::command]
pub async fn get_single_post_analytics(
    post_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<serde_json::Value, String> {
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    // Join posts with post_analytics
    let query = "
        SELECT 
            p.id, p.platform, p.content, p.media_urls, p.created_at, p.status, p.published_at,
            a.likes, a.comments, a.shares, a.reposts, a.impressions, a.reach, a.clicks, a.saves, a.views, a.engagement_rate
        FROM social_posts p
        LEFT JOIN social_post_analytics a ON a.post_id = p.id
        WHERE p.id = ?1
    ";
    let mut rows = conn
        .query(query, crate::turso_params![post_id])
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let mut map = serde_json::Map::new();
        for i in 0..row.column_count() {
            let name = row.column_name(i as i32).unwrap_or("").to_string();
            let val = match row.get_value(i) {
                crate::db::turso::CellValue::Null => serde_json::Value::Null,
                crate::db::turso::CellValue::Integer(n) => serde_json::json!(n),
                crate::db::turso::CellValue::Float(f) => serde_json::json!(f),
                crate::db::turso::CellValue::Text(t) => {
                    if (t.starts_with('{') && t.ends_with('}'))
                        || (t.starts_with('[') && t.ends_with(']'))
                    {
                        serde_json::from_str(&t).unwrap_or_else(|_| serde_json::json!(t))
                    } else {
                        serde_json::json!(t)
                    }
                }
            };
            map.insert(name, val);
        }
        Ok(serde_json::Value::Object(map))
    } else {
        Ok(serde_json::json!({}))
    }
}

#[tauri::command]
pub async fn sync_social_analytics(
    profile_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<(), String> {
    log::debug!("ZERNIO ANALYTICS SYNC: Profile {}", profile_id);
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE social_analytics SET metrics_synced_at = unixepoch() WHERE profile_id = ?1",
        crate::turso_params![profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_social_posts_analytics(
    profile_id: String,
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
) -> Result<(), String> {
    log::debug!("ZERNIO POST ANALYTICS SYNC: Profile {}", profile_id);
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE social_post_analytics SET analytics_synced_at = unixepoch() WHERE profile_id = ?1",
        crate::turso_params![profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
