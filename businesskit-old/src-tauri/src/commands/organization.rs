// src-tauri/src/commands/organization.rs
// Tauri IPC commands — organization, project management, and session access control.
//
// IMPORTANT: All central_db access uses state.cdb().await? which returns Err
// if the DB isn't connected yet (startup race). Frontend handles this gracefully.

use crate::{AppState, Organization, Profile};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// Re-export onboarding, provisioning & credential cache utilities from onboarding module
pub use crate::commands::onboarding::{
    connect_from_keychain, connect_from_keychain_pub, connect_user_db, execute_raw_sql,
    get_cred_cache_dirs, get_provision_status, get_userdb_status, load_from_file_cache,
    load_from_keychain, provision_migrations_now, provision_user_db_now, recreate_single_trigger,
    recreate_user_table, recreate_user_triggers, store_in_file_cache, store_in_keychain,
    sync_profile_seed_to_userdb,
};

/// Returns true once the Central DB async connection is ready.
/// Frontend polls this before running boot fetches to avoid the startup race.
#[tauri::command]
pub async fn is_central_db_ready(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    Ok(state.has_central_db().await)
}

/// Returns the currently active profile_id from Rust in-memory state.
/// Persists across webview reloads (process stays alive).
/// Returns None if no profile has been selected yet this session.
#[tauri::command]
pub async fn get_active_profile_id(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<String>, String> {
    Ok(state.active_profile_id.read().await.clone())
}

/// Debug: returns current state of all three guards as a JSON-like string.
/// Call from frontend console: invoke("get_app_debug") to diagnose boot issues.
#[tauri::command]
pub async fn get_app_debug(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let profile_id = state.active_profile_id.read().await.clone();
    let has_user_db = state.user_db.read().await.is_some();
    let has_central_db = state.central_db.read().await.is_some();
    let license_status = state.license.read().await.status.clone();
    let license_plan = state.license.read().await.plan.clone();
    let org_name = state.organization.read().await.as_ref().map(|o| o.name.clone());
    let org_id = state.organization.read().await.as_ref().map(|o| o.id.clone());
    let setup_err = state.setup_error.read().await.clone();
    let db_url = option_env!("TURSO_DATABASE_URL").unwrap_or("MISSING");
    let has_token = !option_env!("TURSO_AUTH_TOKEN").unwrap_or("").is_empty();
    let cached_user_id = crate::license::load_cached_user_id().unwrap_or_else(|| "NONE".to_string());
    let auth_session = crate::commands::auth::auth_status_native(&state).await
        .ok()
        .flatten()
        .map(|s| format!("workos_id={} email={}", s.user.workos_id, s.user.email))
        .unwrap_or_else(|| "NOT_LOGGED_IN".to_string());

    Ok(format!(
        "db_url={} token={} | central_db={} | user_db={} | license={}/{} | org={:?} ({:?}) | profile={:?} | cached_uid={} | auth={} | setup_err={:?}",
        if db_url.len() > 30 { &db_url[..30] } else { db_url },
        has_token,
        has_central_db, has_user_db, license_status, license_plan,
        org_name, org_id, profile_id, cached_user_id, auth_session,
        setup_err
    ))
}

/// License-exempt — needed to show org info even if license is queried.
#[tauri::command]
pub async fn get_organization(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<Organization>, String> {
    // 1. If we have an active profile, always prioritize its organization
    if let Some(ref prof_id) = *state.active_profile_id.read().await {
        if let Ok(db) = state.cdb().await {
            if let Ok(profile) = db.get_profile_by_id(prof_id).await {
                if let Some(ref org_id) = profile.organization_id {
                    if let Ok(org) = db.get_organization_by_id(org_id).await {
                        *state.organization.write().await = Some(org.clone());
                        return Ok(Some(org));
                    }
                }
            }
        }
    }

    let mut org = state.organization.read().await.clone();

    if org.is_none() {
        let auth_info = crate::commands::auth::auth_status_native(&state).await.ok().flatten();
        let workos_id = auth_info.as_ref().map(|a| a.user.workos_id.clone());
        let cached_uid = crate::license::load_cached_user_id();

        let mut users_id = String::new();
        if let Some(ref w_id) = workos_id {
            if let Ok(db) = state.cdb().await {
                if let Ok(res_id) = db.get_user_id_by_workos_id(w_id).await {
                    users_id = res_id;
                }
            }
        }
        if users_id.is_empty() {
            if let Some(ref c_id) = cached_uid {
                users_id = c_id.clone();
            }
        }

        if !users_id.is_empty() {
            if let Ok(db) = state.cdb().await {
                if let Ok(orgs) = db.get_user_and_invited_organizations(&users_id).await {
                    if let Some(fetched) = orgs.into_iter().next() {
                        *state.organization.write().await = Some(fetched.clone());
                        org = Some(fetched);
                    }
                }
            }
        }
    }

    Ok(org)
}

/// Returns all profiles (projects) for the currently active organization.
/// License-exempt — needed for sidebar navigation even before license loads.
///
/// Resolves org_id in 3 tiers:
///   1. state.organization (fastest — set by setup_app or switch_organization)
///   2. load_cached_org_id() — org_id.txt or keychain session
///   3. DB lookup via users table + workos_id (handles old sessions with null org_id)
#[tauri::command]
pub async fn get_projects(state: State<'_, Arc<AppState>>) -> Result<Vec<Profile>, String> {
    let db = state.cdb().await?;

    // 1. Get current authenticated session (or cached user_id)
    let auth_info = crate::commands::auth::auth_status_native(&state).await.ok().flatten();
    let cached_uid = crate::license::load_cached_user_id();

    // 2. Resolve internal users.id (UUID)
    let mut users_id = String::new();
    if let Some(ref auth) = auth_info {
        if !auth.user.id.is_empty() && !auth.user.id.starts_with("user_") {
            users_id = auth.user.id.clone();
            crate::license::save_user_id(&users_id);
        } else if let Ok(res_id) = db.get_user_id_by_workos_id(&auth.user.workos_id).await {
            users_id = res_id.clone();
            crate::license::save_user_id(&res_id);
        }
    }

    if users_id.is_empty() {
        if let Some(ref c_id) = cached_uid {
            if c_id.starts_with("user_") {
                if let Ok(res_id) = db.get_user_id_by_workos_id(c_id).await {
                    users_id = res_id;
                }
            } else {
                users_id = c_id.clone();
            }
        }
    }

    if users_id.is_empty() {
        return Err("Not authenticated".to_string());
    }

    // 3. Resolve active organization for user (self-healing)
    let active_org = state.require_organization().await.ok();
    let org_id = match active_org {
        Some(ref o) => o.id.clone(),
        None => "".to_string(),
    };

    // 4. Fetch profiles for organization and team invites
    let mut profiles = Vec::new();
    if !org_id.is_empty() {
        if let Ok(p_list) = db.get_profiles_for_org_and_invites(&org_id, &users_id).await {
            profiles = p_list;
        }
    }

    // Fallback: If active org has no profiles, fetch all profiles accessible to user
    if profiles.is_empty() {
        if let Ok(user_p_list) = db.get_profiles_for_user(&users_id).await {
            if !user_p_list.is_empty() {
                profiles = user_p_list;
                // Auto-sync active organization to the first profile's organization
                if let Some(first_prof) = profiles.first() {
                    if let Some(ref prof_org_id) = first_prof.organization_id {
                        if prof_org_id != &org_id {
                            if let Ok(synced_org) = db.get_organization_by_id(prof_org_id).await {
                                *state.organization.write().await = Some(synced_org);
                            }
                        }
                    }
                }
            }
        }
    }

    // Validate active/cached profile: strictly verify it belongs to this authenticated user!
    let cached_pid = state
        .active_profile_id
        .read()
        .await
        .clone()
        .or_else(|| crate::license::load_cached_profile_id());

    if let Some(ref pid) = cached_pid {
        if let Ok(prof) = db.get_profile_by_id(pid).await {
            let user_has_access = prof.user_id == users_id
                || (prof.organization_id.as_ref().is_some() && {
                    if let Ok(orgs) = db.get_user_and_invited_organizations(&users_id).await {
                        orgs.iter().any(|o| Some(&o.id) == prof.organization_id.as_ref())
                    } else {
                        false
                    }
                });

            if user_has_access {
                if !profiles.iter().any(|p| &p.id == pid) {
                    if let Some(ref prof_org_id) = prof.organization_id {
                        if let Ok(synced_org) = db.get_organization_by_id(prof_org_id).await {
                            *state.organization.write().await = Some(synced_org);
                        }
                    }
                    profiles.push(prof);
                }
            } else {
                // Security: Profile belongs to another user account — purge from memory and disk!
                log::warn!("Purging cached profile {} belonging to different user", pid);
                *state.active_profile_id.write().await = None;
                crate::license::clear_profile_id();
            }
        } else {
            *state.active_profile_id.write().await = None;
            crate::license::clear_profile_id();
        }
    }

    if profiles.is_empty() {
        *state.active_profile_id.write().await = None;
        crate::license::clear_profile_id();
    } else {
        let curr_org = state.organization.read().await.clone();
        if let Some(ref o) = curr_org {
            if o.owner_user_id == users_id {
                auto_heal_first_profile_plan(&mut profiles, o, &db, &state).await;
            }
        }
    }

    Ok(profiles)
}

/// Returns all organizations for the current user.
#[tauri::command]
pub async fn get_user_organizations(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<Organization>, String> {
    let auth_info =
        crate::commands::auth::auth_status_native(&state).await?.ok_or_else(|| "Not authenticated".to_string())?;

    let db = state.cdb().await?;

    // Use cached users.id if available (set correctly during auth/get_projects).
    // Fall back to resolving via workos_id only if cache is empty.
    let user_id = if let Some(cached) = crate::license::load_cached_user_id() {
        cached
    } else {
        db.get_user_id_by_workos_id(&auth_info.user.workos_id)
            .await
            .unwrap_or_else(|_| auth_info.user.workos_id.clone())
    };

    db.get_user_and_invited_organizations(&user_id)
        .await
        .map_err(|e| e.to_string())
}

/// Switches the active organization and saves it to cache.
#[tauri::command]
pub async fn switch_organization(
    org_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let auth_info =
        crate::commands::auth::auth_status_native(&state).await?.ok_or_else(|| "Not authenticated".to_string())?;

    // Verify org belongs to user — use cached users.id (set during auth)
    let db = state.cdb().await?;
    let user_id = if let Some(cached) = crate::license::load_cached_user_id() {
        cached
    } else {
        db.get_user_id_by_workos_id(&auth_info.user.workos_id)
            .await
            .unwrap_or_else(|_| auth_info.user.workos_id.clone())
    };

    let orgs = db
        .get_user_and_invited_organizations(&user_id)
        .await
        .map_err(|e| e.to_string())?;

    let org = orgs
        .into_iter()
        .find(|o| o.id == org_id)
        .ok_or_else(|| "Organization not found or access denied".to_string())?;

    let license = state
        .cdb()
        .await?
        .get_license_status(&org.owner_user_id)
        .await
        .map_err(|e| e.to_string())?;

    *state.organization.write().await = Some(org.clone());
    *state.license.write().await = license;

    // Disconnect UserDB since we switched orgs (they need to connect to new DB)
    *state.user_db.write().await = None;
    *state.active_profile_id.write().await = None;

    log::info!("Switched to organization: {}", org_id);
    Ok(())
}

/// Pure authorization decision helper evaluated by verify_profile_access.
pub fn evaluate_profile_access(
    current_user_id: &str,
    cached_user_id: Option<&str>,
    profile_user_id: &str,
    org_owner_user_id: Option<&str>,
    is_team_member: bool,
    profile_id: &str,
) -> Result<(), String> {
    // 1. Authenticated user checks
    if !current_user_id.is_empty() && current_user_id != "owner" {
        if profile_user_id == current_user_id {
            return Ok(());
        }

        if let Some(owner_uid) = org_owner_user_id {
            if owner_uid == current_user_id {
                return Ok(());
            }
        }

        if is_team_member {
            return Ok(());
        }
    }

    // 2. Cached user fallback (boot/offline prior to full session hydration)
    if current_user_id == "owner" || current_user_id.is_empty() {
        if let Some(cached_uid) = cached_user_id {
            if profile_user_id == cached_uid {
                return Ok(());
            }
            if let Some(owner_uid) = org_owner_user_id {
                if owner_uid == cached_uid {
                    return Ok(());
                }
            }
        }
    }

    Err(format!(
        "Access denied: You do not have permission to access profile '{}'.",
        profile_id
    ))
}

/// Verify that the currently active user has ownership or team access to the target profile.
/// Solo user / owner check is sufficient on its own (does NOT require team_members row).
pub async fn verify_profile_access(state: &AppState, profile_id: &str) -> Result<(), String> {
    let current_user_id = state.get_current_user_id().await;
    let db = state.cdb().await.map_err(|e| e.to_string())?;

    // 1. Fetch profile from Central DB
    let profile = db
        .get_profile_by_id(profile_id)
        .await
        .map_err(|_| format!("Profile not found: {}", profile_id))?;

    // 2. Fetch organization owner if profile has org
    let mut org_owner_id = None;
    if let Some(ref org_id) = profile.organization_id {
        if let Ok(org) = db.get_organization_by_id(org_id).await {
            org_owner_id = Some(org.owner_user_id);
        }
    }

    // 3. Check team member row if authenticated
    let mut is_team_member = false;
    if !current_user_id.is_empty() && current_user_id != "owner" {
        if let Ok(conn) = db.conn() {
            let check = conn
                .query(
                    "SELECT 1 FROM team_members WHERE (team_id = ?1 OR team_id = ?2 OR org_id = ?2) AND user_id = ?3 AND status = 'accepted' LIMIT 1",
                    crate::turso_params![
                        profile.id.clone(),
                        profile.organization_id.clone().unwrap_or_default(),
                        current_user_id.clone()
                    ],
                )
                .await;
            if let Ok(mut rows) = check {
                if let Ok(Some(_)) = rows.next().await {
                    is_team_member = true;
                }
            }
        }
    }

    let cached_uid = crate::license::load_cached_user_id();

    evaluate_profile_access(
        &current_user_id,
        cached_uid.as_deref(),
        &profile.user_id,
        org_owner_id.as_deref(),
        is_team_member,
        profile_id,
    )
}

/// Sets the active profile_id in AppState.
/// License-exempt — switching profiles is navigation, not a licensed data action.
#[tauri::command]
pub async fn switch_project(
    profile_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    // 0. Enforce authorization check before modifying active state or connecting
    verify_profile_access(&state, &profile_id).await?;

    // Set active_profile_id immediately — never leave it as None
    // even if the downstream verification or DB connect fails.
    *state.active_profile_id.write().await = Some(profile_id.clone());
    crate::license::save_profile_id(&profile_id);

    // Best-effort: verify profile exists in Central DB and synchronize organization & license.
    if let Ok(db) = state.cdb().await {
        if let Ok(profile) = db.get_profile_by_id(&profile_id).await {
            // 1. Always synchronize active organization if profile has organization_id
            if let Some(ref org_id) = profile.organization_id {
                if let Ok(org) = db.get_organization_by_id(org_id).await {
                    if let Ok(license) = db.get_license_status(&org.owner_user_id).await {
                        *state.license.write().await = license;
                    }
                    *state.organization.write().await = Some(org.clone());
                    log::info!(
                        "Synchronized active organization to {} ({}) for profile {}",
                        org_id,
                        org.name,
                        profile_id
                    );
                }
            } else {
                let user_id = state.get_current_user_id().await;
                if let Ok(license) = db.get_license_status(&user_id).await {
                    *state.license.write().await = license;
                }
            }

            // 2. If profile has a custom allocated plan (e.g. PRO/BUSINESS), override license status
            let prof_plan = profile
                .allocated_plan
                .as_deref()
                .unwrap_or("FREE")
                .trim()
                .to_uppercase();

            if prof_plan != "FREE" && !prof_plan.is_empty() {
                let now = chrono::Utc::now().timestamp();
                *state.license.write().await = crate::LicenseStatus {
                    status: "active".to_string(),
                    plan: prof_plan.clone(),
                    expires_at: None,
                    checked_at: now,
                    grace_until: None,
                };
            }
        } else {
            log::warn!(
                "switch_project: profile {} not found in Central DB",
                profile_id
            );
        }
    }

    // Always reconnect UserDB for the new profile.
    // Each profile has its own Turso DB — we must not reuse the previous profile's connection.
    *state.user_db.write().await = None;
    if let Err(e) = connect_from_keychain(&state, &profile_id).await {
        log::warn!("Could not connect UserDB for profile {}: {}", profile_id, e);
    }

    log::info!("Switched to project: {}", profile_id);
    Ok(())
}

/// Resolves the effective subscription plan for an organization owner.
/// Accounts for active trials (7-day trial grants PRO tier) and active paid subscriptions.
pub fn resolve_effective_plan(
    lic: Option<&crate::LicenseStatus>,
    org: &crate::Organization,
    now: i64,
) -> String {
    // 1. Direct active plan from Central DB license query
    let lic_plan = lic
        .map(|l| l.plan.trim().to_uppercase())
        .filter(|p| p != "FREE" && !p.is_empty());

    if let Some(p) = lic_plan {
        return p;
    }

    // 2. Active 7-day trial check (status == 'trial' or unexpired org trial)
    let is_trial_active = if let Some(l) = lic {
        (l.status.to_lowercase() == "trial" || l.status.to_lowercase() == "active")
            && l.expires_at.map(|exp| exp as i64 > now).unwrap_or(true)
    } else {
        false
    } || org.subscription_expires_at.map(|exp| exp > now).unwrap_or(false);

    if is_trial_active {
        return "PRO".to_string();
    }

    // 3. Organization plan column fallback
    if let Some(ref op) = org.plan {
        let op_upper = op.trim().to_uppercase();
        if op_upper != "FREE" && op_upper != "STARTER" && !op_upper.is_empty() {
            return op_upper;
        }
    }

    "FREE".to_string()
}

/// Returns the maximum allowed premium profile slots for a given tier.
pub fn get_max_premium_slots(plan: &str) -> usize {
    match plan.to_uppercase().as_str() {
        "BUSINESS" => 10,
        "PRO" => 2,
        "BASIC" => 1,
        _ => 0, // FREE tier has 0 premium slots
    }
}

/// Auto-heals first/lone profile: if trial or paid plan is valid and no profiles have claimed
/// the premium slot yet, automatically allocates PRO/paid tier to the first profile.
pub async fn auto_heal_first_profile_plan(
    profiles: &mut [crate::Profile],
    org: &crate::Organization,
    cdb: &crate::db::central::CentralDb,
    state: &crate::AppState,
) {
    if profiles.is_empty() {
        return;
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let lic_opt = cdb.get_license_status(&org.owner_user_id).await.ok();
    let effective_tier = resolve_effective_plan(lic_opt.as_ref(), org, now);
    let max_slots = get_max_premium_slots(&effective_tier);

    if effective_tier == "FREE" || max_slots == 0 {
        return;
    }

    let used_premium_slots = profiles
        .iter()
        .filter(|p| p.allocated_plan.as_deref().unwrap_or("FREE").to_uppercase() == effective_tier)
        .count();

    if used_premium_slots == 0 {
        if let Some(first_prof) = profiles.first_mut() {
            let cur = first_prof.allocated_plan.as_deref().unwrap_or("FREE").to_uppercase();
            if cur == "FREE" {
                let prof_id = first_prof.id.clone();
                if let Ok(conn) = cdb.conn() {
                    let _ = conn.execute(
                        "UPDATE profiles SET allocated_plan = ?1, plan_allocated_at = ?2 WHERE id = ?3",
                        crate::turso_params![effective_tier.clone(), now, prof_id.clone()],
                    ).await;
                }
                if let Ok(user_db) = state.require_user_db().await {
                    if let Ok(uconn) = user_db.conn() {
                        let _ = uconn.execute(
                            "UPDATE profiles SET allocated_plan = ?1, plan_allocated_at = ?2 WHERE id = ?3",
                            crate::turso_params![effective_tier.clone(), now, prof_id.clone()],
                        ).await;
                    }
                }
                first_prof.allocated_plan = Some(effective_tier.clone());
                first_prof.plan_allocated_at = Some(now);

                if state.active_profile_id.read().await.as_deref() == Some(&prof_id) {
                    *state.license.write().await = crate::LicenseStatus {
                        status: "active".to_string(),
                        plan: effective_tier.clone(),
                        expires_at: lic_opt.as_ref().and_then(|l| l.expires_at),
                        checked_at: now,
                        grace_until: None,
                    };
                }
            }
        }
    }
}

/// Creates a new profile (project) in Central DB.
#[tauri::command]
pub async fn create_project(
    name: String,
    slug: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Profile, String> {
    // If license is still "inactive" (default cold-boot state), attempt a fresh check
    // before rejecting. This handles the iOS race where setup_app() hasn't completed yet.
    {
        let current_status = state.license.read().await.status.clone();
        if current_status == "inactive" {
            log::info!("create_project: license still inactive, attempting refresh");
            if let Some(uid) = crate::license::load_cached_user_id() {
                if let Ok(fresh) = crate::license::check_license(&state, &uid).await {
                    *state.license.write().await = fresh;
                }
            }
        }
    }
    state.require_license().await?;

    let org = state.require_organization().await?;

    let cdb = state.cdb().await?;

    // Count ALL profiles owned by this user globally, across any organization
    // This prevents them from bypassing the limit by creating a new org
    let profiles = cdb
        .get_profiles_for_user(&org.owner_user_id)
        .await
        .map_err(|e| e.to_string())?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let lic_opt = cdb.get_license_status(&org.owner_user_id).await.ok();
    if let Some(ref fresh) = lic_opt {
        *state.license.write().await = fresh.clone();
    }

    let effective_tier = resolve_effective_plan(lic_opt.as_ref(), &org, now);
    let max_premium_slots = get_max_premium_slots(&effective_tier);

    let used_premium_slots = if effective_tier == "FREE" {
        0
    } else {
        profiles
            .iter()
            .filter(|p| p.allocated_plan.as_deref().unwrap_or("FREE").to_uppercase() == effective_tier)
            .count()
    };

    let allocated_plan = if effective_tier != "FREE" && used_premium_slots < max_premium_slots {
        effective_tier.as_str()
    } else {
        "FREE"
    };

    let current_user_id = state.get_current_user_id().await;
    let creator_id = if !current_user_id.is_empty() && current_user_id != "owner" {
        current_user_id
    } else {
        org.owner_user_id.clone()
    };

    let plan_alloc_ts = if allocated_plan == "FREE" { 0 } else { now };
    let id = Uuid::new_v4().to_string();
    let profile = cdb
        .create_profile(
            &id,
            &creator_id,
            &slug,
            &name,
            &org.id,
            allocated_plan,
            plan_alloc_ts,
        )
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("UNIQUE constraint failed") && err_str.contains("profiles.slug") {
                "Username Taken".to_string()
            } else {
                err_str
            }
        })?;

    // Set active profile in Rust backend AppState & persistent cache
    *state.active_profile_id.write().await = Some(profile.id.clone());
    crate::license::save_profile_id(&profile.id);

    if allocated_plan != "FREE" {
        *state.license.write().await = crate::LicenseStatus {
            status: "active".to_string(),
            plan: allocated_plan.to_string(),
            expires_at: lic_opt.as_ref().and_then(|l| l.expires_at),
            checked_at: now,
            grace_until: None,
        };
    }

    Ok(profile)
}

#[tauri::command]
pub async fn create_new_organization(
    name: String,
    state: State<'_, Arc<AppState>>,
) -> Result<crate::Organization, String> {
    let auth = crate::commands::auth::auth_status_native(&state).await?.ok_or("Not logged in")?;
    let workos_id = auth.user.workos_id;

    let cdb = state.cdb().await?;
    let user_id = cdb
        .get_user_id_by_workos_id(&workos_id)
        .await
        .map_err(|e| e.to_string())?;

    // Check plan limits
    let orgs = cdb
        .get_user_organizations(&user_id)
        .await
        .map_err(|e| e.to_string())?;

    let plan = state.license.read().await.plan.to_uppercase();
    let max_orgs = match plan.as_str() {
        "BUSINESS" => 10,
        "PRO" => 2,
        _ => 1,
    };

    if orgs.len() >= max_orgs {
        return Err(format!(
            "Plan limit reached! You can only have up to {} organization(s) on your current plan.",
            max_orgs
        ));
    }

    let new_org_id = uuid::Uuid::new_v4().to_string();

    let org = cdb
        .create_organization(&new_org_id, &name, &user_id)
        .await
        .map_err(|e| format!("Failed to create organization: {}", e))?;

    Ok(org)
}

#[derive(serde::Serialize)]
pub struct PlanAllocations {
    pub total_slots: usize,
    pub used_slots: usize,
    pub available_slots: usize,
    pub current_plan: String,
}

#[tauri::command]
pub async fn get_plan_allocations(
    state: State<'_, Arc<AppState>>,
) -> Result<PlanAllocations, String> {
    // Ensure active profile's organization is prioritized
    if let Some(ref prof_id) = *state.active_profile_id.read().await {
        if let Ok(db) = state.cdb().await {
            if let Ok(profile) = db.get_profile_by_id(prof_id).await {
                if let Some(ref org_id) = profile.organization_id {
                    if let Ok(org) = db.get_organization_by_id(org_id).await {
                        *state.organization.write().await = Some(org.clone());
                    }
                }
            }
        }
    }

    let org = state
        .organization
        .read()
        .await
        .clone()
        .ok_or_else(|| "No organization loaded".to_string())?;

    let cdb = state.cdb().await?;
    let mut profiles = cdb
        .get_profiles_for_org(&org.id)
        .await
        .unwrap_or_default();

    if profiles.is_empty() {
        profiles = cdb
            .get_profiles_for_user(&org.owner_user_id)
            .await
            .unwrap_or_default()
            .into_iter()
            .filter(|p| p.organization_id.as_deref() == Some(&org.id) || p.organization_id.is_none())
            .collect();
    }

    let lic_opt = cdb.get_license_status(&org.owner_user_id).await.ok();
    if let Some(ref fresh) = lic_opt {
        *state.license.write().await = fresh.clone();
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let current_plan = resolve_effective_plan(lic_opt.as_ref(), &org, now);
    let max_premium_slots = get_max_premium_slots(&current_plan);

    auto_heal_first_profile_plan(&mut profiles, &org, &cdb, &state).await;

    let used_premium_slots = if current_plan == "FREE" {
        0
    } else {
        profiles
            .iter()
            .filter(|p| p.allocated_plan.as_deref().unwrap_or("FREE").to_uppercase() == current_plan)
            .count()
    };

    Ok(PlanAllocations {
        total_slots: max_premium_slots,
        used_slots: used_premium_slots,
        available_slots: max_premium_slots.saturating_sub(used_premium_slots),
        current_plan,
    })
}

#[tauri::command]
pub async fn assign_profile_plan(
    profile_id: String,
    target_plan: String,
    state: State<'_, Arc<AppState>>,
) -> Result<crate::Profile, String> {
    let cdb = state.cdb().await?;

    let profile = cdb
        .get_profile_by_id(&profile_id)
        .await
        .map_err(|e| format!("Profile not found: {}", e))?;

    let org = if let Some(ref org_id) = profile.organization_id {
        cdb.get_organization_by_id(org_id)
            .await
            .map_err(|e| format!("Organization not found: {}", e))?
    } else {
        state
            .organization
            .read()
            .await
            .clone()
            .ok_or_else(|| "No organization loaded".to_string())?
    };

    let mut profiles = cdb
        .get_profiles_for_org(&org.id)
        .await
        .unwrap_or_default();

    if profiles.is_empty() {
        profiles = cdb
            .get_profiles_for_user(&org.owner_user_id)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|p| p.organization_id.as_deref() == Some(&org.id) || p.organization_id.is_none())
            .collect();
    }

    let target = target_plan.to_uppercase();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let current_prof_plan = profile.allocated_plan.as_deref().unwrap_or("FREE").to_uppercase();
    if current_prof_plan != "FREE" && target == "FREE" {
        if let Some(allocated_at) = profile.plan_allocated_at {
            if allocated_at > 0 && now - allocated_at < 2592000 {
                return Err("You can only change a profile's plan once every 30 days.".to_string());
            }
        }
    }

    if target != "FREE" {
        let lic_opt = cdb.get_license_status(&org.owner_user_id).await.ok();
        let effective_tier = resolve_effective_plan(lic_opt.as_ref(), &org, now);

        if target != effective_tier && effective_tier != "FREE" {
            return Err(
                format!("You can only allocate slots for your current active subscription ({}).", effective_tier)
            );
        }

        let max_slots = get_max_premium_slots(&target);

        let used_slots = profiles
            .iter()
            .filter(|p| {
                p.id != profile_id
                    && p.allocated_plan.as_deref().unwrap_or("FREE").to_uppercase() == target
            })
            .count();

        if used_slots >= max_slots {
            return Err(format!(
                "No {} slots available. You are using {} of {}.",
                target, used_slots, max_slots
            ));
        }
    }

    let alloc_ts = if target == "FREE" { 0 } else { now };
    let conn = cdb.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE profiles SET allocated_plan = ?1, plan_allocated_at = ?2 WHERE id = ?3",
        crate::turso_params![target.clone(), alloc_ts, profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    if let Ok(user_db) = state.require_user_db().await {
        if let Ok(uconn) = user_db.conn() {
            let _ = uconn
                .execute(
                    "UPDATE profiles SET allocated_plan = ?1, plan_allocated_at = ?2 WHERE id = ?3",
                    crate::turso_params![target.clone(), alloc_ts, profile_id.clone()],
                )
                .await;
        }
    }

    if state.active_profile_id.read().await.as_deref() == Some(&profile_id) {
        if let Ok(fresh_lic) = cdb.get_license_status(&org.owner_user_id).await {
            *state.license.write().await = fresh_lic;
        }
    }

    cdb.get_profile_by_id(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cross_account_switch_rejected() {
        // Scenario 1: Cross-Account Switch
        // Account A signed in, attempts to access Account B's profile
        let user_a = "usr_account_a_uuid";
        let user_b = "usr_account_b_uuid";
        let profile_b_id = "prof_account_b_secret_proj";

        let result = evaluate_profile_access(
            user_a,
            None,
            user_b,                   // profile owned by B
            Some("org_b_owner_uuid"), // org owned by B
            false,                    // not a team member
            profile_b_id,
        );

        assert!(result.is_err(), "Cross-account access must be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("Access denied"),
            "Error message must state 'Access denied', got: {}",
            err
        );
        assert!(
            err.contains(profile_b_id),
            "Error message must specify the target profile_id, got: {}",
            err
        );
    }

    #[test]
    fn test_tampered_boot_cache_rejected() {
        // Scenario 2: Tampered Boot Cache
        // Cached profile belongs to Account B, but local user is Account A
        let user_a_cached = "usr_account_a_uuid";
        let profile_b_id = "prof_account_b_stolen";
        let user_b = "usr_account_b_uuid";

        // Current session is empty / cold-boot unauthenticated state ("owner" fallback), cached user is Account A
        let result = evaluate_profile_access(
            "owner",
            Some(user_a_cached),
            user_b, // profile owned by B
            Some("org_b_owner"),
            false,
            profile_b_id,
        );

        assert!(
            result.is_err(),
            "Boot-time reconnection with unowned profile ID must fail"
        );
        let err = result.unwrap_err();
        assert!(
            err.contains("Access denied"),
            "Expected 'Access denied', got: {}",
            err
        );
    }

    #[test]
    fn test_solo_owner_access_allowed() {
        let user_a = "usr_account_a_uuid";
        let profile_a_id = "prof_account_a_personal";

        let result = evaluate_profile_access(
            user_a,
            None,
            user_a, // owned directly by user A
            None,   // solo personal project (no org)
            false,  // no team_members row needed
            profile_a_id,
        );

        assert!(result.is_ok(), "Solo owner must have direct access to own profile");
    }
}
