// src-tauri/src/commands/license.rs
// Tauri IPC commands — license status and refresh.
// Not gated by license check (exempt commands per spec).

use crate::{AppState, LicenseStatus};
use std::sync::Arc;
use tauri::State;

/// Returns current in-memory license status — instant, no DB call.
#[tauri::command]
pub async fn get_license_status(state: State<'_, Arc<AppState>>) -> Result<LicenseStatus, String> {
    let mut status = state.license.read().await.clone();

    // If it's the default "inactive" state, maybe check_on_launch hasn't finished.
    // Try to quickly apply the grace cache so the frontend can boot.
    if status.status == "inactive" {
        if let Some(cached) = crate::license::load_license_cache() {
            let age = chrono::Utc::now().timestamp() - cached.checked_at;
            // GRACE_SECONDS is 48 * 3600
            if age < 48 * 3600 {
                status = cached.status.clone();
                status.grace_until = Some(cached.checked_at + 48 * 3600);
                *state.license.write().await = status.clone();
            }
        }
    }

    // Check if active profile has an allocated PRO/paid plan
    if status.status != "active" || status.plan.to_uppercase() == "FREE" {
        if let Some(ref prof_id) = *state.active_profile_id.read().await {
            if let Ok(cdb) = state.cdb().await {
                if let Ok(profile) = cdb.get_profile_by_id(prof_id).await {
                    if let Some(ref plan) = profile.allocated_plan {
                        let p = plan.trim().to_uppercase();
                        if p != "FREE" && !p.is_empty() {
                            status = LicenseStatus {
                                status: "active".to_string(),
                                plan: p,
                                expires_at: None,
                                checked_at: chrono::Utc::now().timestamp(),
                                grace_until: None,
                            };
                            *state.license.write().await = status.clone();
                        }
                    }
                }
            }
        }
    }

    Ok(status)
}

/// Forces a fresh license check against Central DB.
/// Updates in-memory state and cache.
#[tauri::command]
pub async fn refresh_license(state: State<'_, Arc<AppState>>) -> Result<LicenseStatus, String> {
    let user_id = state.get_current_user_id().await;
    let mut status = if user_id != "owner" && !user_id.is_empty() {
        crate::license::check_license(&state, &user_id)
            .await
            .map_err(|e| e.to_string())?
    } else if let Some(uid) = crate::license::load_cached_user_id() {
        crate::license::check_license(&state, &uid)
            .await
            .map_err(|e| e.to_string())?
    } else {
        LicenseStatus {
            status: "active".to_string(),
            plan: "FREE".to_string(),
            expires_at: None,
            checked_at: chrono::Utc::now().timestamp(),
            grace_until: None,
        }
    };

    if let Some(ref prof_id) = *state.active_profile_id.read().await {
        if let Ok(cdb) = state.cdb().await {
            if let Ok(profile) = cdb.get_profile_by_id(prof_id).await {
                if let Some(ref plan) = profile.allocated_plan {
                    let p = plan.trim().to_uppercase();
                    if p != "FREE" && !p.is_empty() {
                        status.status = "active".to_string();
                        status.plan = p;
                    }
                }
            }
        }
    }

    *state.license.write().await = status.clone();
    Ok(status)
}
