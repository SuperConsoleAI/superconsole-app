// src-tauri/src/commands/subscribers.rs
//
// WHAT:  Phase 4 — Subscriber list management + email health IPC commands.
//
// HOW:   All commands use SubscribersDb (db/subscribers.rs) which talks directly
//        to the User's Turso DB via the libsql crate. No external HTTP calls are
//        made from this layer — credentials are stored locally and used by the
//        email-sending layer (Phase 5) when dispatch is needed.
//
// FLOW:
//   1.  Frontend calls e.g. `invoke("list_subscribers", { opts })`.
//   2.  Tauri routes to this file → requires license + active profile.
//   3.  SubscribersDb builds a parameterized SQL query → executes against UserDB.
//   4.  Returns typed Rust struct serialised to JSON → Qwik frontend receives it.
//
// TABLES TOUCHED:
//   subscribers          — read/write (list, get, import, block, unsub)
//   newsletter_topics    — read/write (list, create)
//   email_events         — read-only  (subscriber event history)
//   email_tracking_stats — read/write (health row, ensure-init on first call)
//   credentials          — read/write (API key storage)
//
// SECURITY:
//   • Secret API keys (SES secret, OpenAI, Anthropic, Resend) are passed through
//     as-is here. In Phase 5 the vault (AES-GCM) will encrypt them at rest.
//     For now they land in the `credentials` table in plaintext — acceptable for
//     a local desktop DB that is the user's own Turso instance.
//   • All commands require an active license (require_license) and a selected
//     project/profile (require_profile).

use crate::db::subscribers::{
    CredentialsRow, EmailEventRow, EmailHealthRow, ImportResult, ImportSubscriber,
    ListSubscribersOpts, SaveCredentialsData, SubscriberRow, SubscribersDb, TopicRow,
};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

// ── Subscribers ───────────────────────────────────────────────────────────────

/// List subscribers for the active profile.
/// opts.status = "active" (default) | "blocked" | "unsubscribed" | "all"
/// opts.search = email/name LIKE filter (optional)
/// opts.limit  = page size (default 100)
/// opts.offset = pagination offset (default 0)
#[tauri::command]
pub async fn list_subscribers(
    opts: ListSubscribersOpts,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SubscriberRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.list_subscribers(&profile_id, &opts)
        .await
        .map_err(|e| e.to_string())
}

/// Get a single subscriber by ID, including their full profile.
#[tauri::command]
pub async fn get_subscriber(
    subscriber_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<SubscriberRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.get_subscriber(&profile_id, &subscriber_id)
        .await
        .map_err(|e| e.to_string())
}

/// Bulk-import subscribers from a parsed CSV/paste list.
/// Uses INSERT OR IGNORE — duplicate emails are silently skipped.
/// Returns { imported, skipped, total } counts.
#[tauri::command]
pub async fn import_subscribers(
    items: Vec<ImportSubscriber>,
    state: State<'_, Arc<AppState>>,
) -> Result<ImportResult, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.import_subscribers(&profile_id, items)
        .await
        .map_err(|e| e.to_string())
}

/// Block a subscriber (e.g. after a bounce or spam complaint).
/// Sets is_blocked=1, blocked_at=now, block_reason=reason.
/// The `subscribers` table has a trigger that prevents hard-deletes —
/// this is the correct way to stop sending to an address.
#[tauri::command]
pub async fn block_subscriber(
    subscriber_id: String,
    reason: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.block_subscriber(&profile_id, &subscriber_id, reason.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Unsubscribe a subscriber by request (e.g. clicked unsubscribe link).
/// Sets is_unsubscribed=1, unsubscribed_at=now. Row stays intact for audit.
#[tauri::command]
pub async fn unsubscribe_subscriber(
    subscriber_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.unsubscribe(&profile_id, &subscriber_id)
        .await
        .map_err(|e| e.to_string())
}

/// Count of active (sendable) subscribers — not blocked and not unsubscribed.
/// Useful for showing "You're about to send to N subscribers" before dispatch.
#[tauri::command]
pub async fn count_active_subscribers(state: State<'_, Arc<AppState>>) -> Result<i64, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.count_active(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Fetch the email event history for a single subscriber (opens, clicks, bounces).
/// Returns newest-first, limited to `limit` rows (default 50).
#[tauri::command]
pub async fn get_subscriber_events(
    subscriber_id: String,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<EmailEventRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.get_subscriber_events(&subscriber_id, limit)
        .await
        .map_err(|e| e.to_string())
}

// ── Email health ──────────────────────────────────────────────────────────────

/// Get global email health stats for the active profile.
/// Returns send/open/click/bounce/complaint totals + subscriber list counts.
/// The `email_tracking_stats` row is maintained by DB triggers on `email_events`
/// inserts — this command is a fast single-row read.
/// If no row exists yet (fresh DB), an empty zeroed row is created.
#[tauri::command]
pub async fn get_email_health(state: State<'_, Arc<AppState>>) -> Result<EmailHealthRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.get_email_health(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Newsletter topics ─────────────────────────────────────────────────────────

/// List all topic/segment tags for the active profile.
/// Topics let subscribers opt into specific content streams
/// (e.g. "Weekly Digest", "Product Updates", "Deals").
#[tauri::command]
pub async fn list_newsletter_topics(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TopicRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.list_topics(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new topic/segment.
/// slug must be unique per profile — returns error if already exists.
#[tauri::command]
pub async fn create_newsletter_topic(
    name: String,
    slug: String,
    description: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<TopicRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.create_topic(&profile_id, &name, &slug, description.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// ── Credentials / API keys ────────────────────────────────────────────────────

/// Load stored API credentials (SES, OpenAI, Anthropic, Resend, n8n webhook).
/// Returns None if not yet configured.
/// Note: secret values stored as-is in local Turso DB — the user's own instance.
#[tauri::command]
pub async fn get_credentials(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<CredentialsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.get_credentials(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Save (upsert) API credentials for the active profile.
/// Only supplied (non-null) fields are written — existing values for other
/// fields are preserved via COALESCE in the ON CONFLICT DO UPDATE.
#[tauri::command]
pub async fn save_credentials(
    data: SaveCredentialsData,
    state: State<'_, Arc<AppState>>,
) -> Result<CredentialsRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let sdb = SubscribersDb::new(&db);
    sdb.save_credentials(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())
}
