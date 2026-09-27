// src-tauri/src/commands/crm.rs
// Phase 3 — CRM Tauri IPC commands.
// Contacts, deals, activities, tasks, notes, groups, templates.
// All commands gate on license + active profile.

use crate::db::crm::{
    ActivityRow, CampaignRow, ContactRow, CreateCampaignData, CreateContactData, CreateDealData,
    CreateTaskData, CreateTemplateData, CrmDb, DealRow, GroupRow, ListContactsOpts, LogActivityData,
    NoteRow, TaskRow, TemplateRow, UpdateContactData,
};
use crate::AppState;
use std::sync::Arc;
use tauri::State;

// ── Contacts ──────────────────────────────────────────────────────────────────

/// List contacts with optional filters (status, outreach_status, agent_status, search).
/// Always excludes archived contacts.
#[tauri::command]
pub async fn list_contacts(
    opts: ListContactsOpts,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ContactRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_contacts(&profile_id, &opts)
        .await
        .map_err(|e| e.to_string())
}

/// Get a single contact by ID.
#[tauri::command]
pub async fn get_contact(
    contact_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ContactRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.get_contact(&profile_id, &contact_id)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new CRM contact.
#[tauri::command]
pub async fn create_contact(
    data: CreateContactData,
    state: State<'_, Arc<AppState>>,
) -> Result<ContactRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.create_contact(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())
}

/// Update contact fields. Only supplied fields change.
#[tauri::command]
pub async fn update_contact(
    contact_id: String,
    data: UpdateContactData,
    state: State<'_, Arc<AppState>>,
) -> Result<ContactRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.update_contact(&profile_id, &contact_id, &data)
        .await
        .map_err(|e| e.to_string())
}

/// Archive a contact (soft-delete — sets archived=1).
#[tauri::command]
pub async fn archive_contact(
    contact_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.archive_contact(&profile_id, &contact_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Deals ─────────────────────────────────────────────────────────────────────

/// List all deals. Optionally filter to a single contact.
#[tauri::command]
pub async fn list_deals(
    contact_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<DealRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_deals(&profile_id, contact_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Create a new deal linked to a contact.
#[tauri::command]
pub async fn create_deal(
    data: CreateDealData,
    state: State<'_, Arc<AppState>>,
) -> Result<DealRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.create_deal(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())
}

/// Move a deal to a new pipeline stage.
/// Pass lost_reason when stage = "lost".
#[tauri::command]
pub async fn update_deal_stage(
    deal_id: String,
    stage: String,
    lost_reason: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.update_deal_stage(&profile_id, &deal_id, &stage, lost_reason.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// ── Activities ────────────────────────────────────────────────────────────────

/// Append an activity to a contact's timeline.
/// Uses idempotency_key — safe to call twice for retries.
#[tauri::command]
pub async fn log_activity(
    data: LogActivityData,
    state: State<'_, Arc<AppState>>,
) -> Result<ActivityRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.log_activity(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())
}

/// Get the activity timeline for a contact (newest first).
#[tauri::command]
pub async fn list_activities(
    contact_id: String,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ActivityRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_activities(&contact_id, limit)
        .await
        .map_err(|e| e.to_string())
}

/// Get all activities awaiting approval (approval_status = 'pending_approval').
/// Used to power the inbox / review queue.
#[tauri::command]
pub async fn list_pending_approvals(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ActivityRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_pending_approvals(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Approve a pending activity (agent outreach, DM draft, etc.)
#[tauri::command]
pub async fn approve_activity(
    activity_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.approve_activity(&profile_id, &activity_id)
        .await
        .map_err(|e| e.to_string())
}

/// Reject a pending activity.
#[tauri::command]
pub async fn reject_activity(
    activity_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.reject_activity(&profile_id, &activity_id)
        .await
        .map_err(|e| e.to_string())
}

/// Mark an activity as read (sets read_at timestamp).
#[tauri::command]
pub async fn mark_activity_read(
    activity_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.mark_activity_read(&profile_id, &activity_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/// List tasks. Filters: contact_id, status ("open" | "done").
#[tauri::command]
pub async fn list_tasks(
    contact_id: Option<String>,
    status: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TaskRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_tasks(&profile_id, contact_id.as_deref(), status.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Create a task.
#[tauri::command]
pub async fn create_task(
    data: CreateTaskData,
    state: State<'_, Arc<AppState>>,
) -> Result<TaskRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.create_task(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())
}

/// Mark a task done.
#[tauri::command]
pub async fn complete_task(task_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.complete_task(&profile_id, &task_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Notes ─────────────────────────────────────────────────────────────────────

/// List notes for a contact (pinned first, then newest).
#[tauri::command]
pub async fn list_notes(
    contact_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<NoteRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_notes(&contact_id).await.map_err(|e| e.to_string())
}

/// Create a note on a contact (optionally linked to a deal).
#[tauri::command]
pub async fn create_note(
    contact_id: String,
    body: String,
    deal_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.create_note(&profile_id, &contact_id, &body, deal_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Delete a note.
#[tauri::command]
pub async fn delete_note(note_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.delete_note(&profile_id, &note_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Groups ────────────────────────────────────────────────────────────────────

/// List all contact groups.
#[tauri::command]
pub async fn list_crm_groups(state: State<'_, Arc<AppState>>) -> Result<Vec<GroupRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_groups(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Create a contact group.
#[tauri::command]
pub async fn create_crm_group(
    name: String,
    icon: Option<String>,
    color: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<GroupRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.create_group(&profile_id, &name, icon.as_deref(), color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// ── Templates ─────────────────────────────────────────────────────────────────

/// List message templates. Optionally filter by type (dm|email|follow_up|proposal).
#[tauri::command]
pub async fn list_crm_templates(
    template_type: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TemplateRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_templates(&profile_id, template_type.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Create a new message template.
#[tauri::command]
pub async fn create_crm_template(
    data: CreateTemplateData,
    state: State<'_, Arc<AppState>>,
) -> Result<TemplateRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.create_template(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())
}

/// Increment a template's use count (call when agent picks it for outreach).
#[tauri::command]
pub async fn increment_template_use_count(
    template_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.increment_template_use_count(&template_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_crm_analytics(
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.get_crm_analytics(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn aggregate_crm_analytics(
    force_refresh: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.aggregate_crm_analytics(&profile_id, force_refresh)
        .await
        .map_err(|e| e.to_string())
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_crm_campaigns(
    status: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CampaignRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.list_campaigns(&profile_id, status.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_crm_campaign(
    data: CreateCampaignData,
    state: State<'_, Arc<AppState>>,
) -> Result<CampaignRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.create_campaign(&profile_id, &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_crm_campaign_status(
    campaign_id: String,
    status: String,
    sent_count: Option<i64>,
    failed_count: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let crm = CrmDb::new(&db);
    crm.update_campaign_status(&profile_id, &campaign_id, &status, sent_count, failed_count)
        .await
        .map_err(|e| e.to_string())
}
