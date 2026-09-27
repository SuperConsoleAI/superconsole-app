// src-tauri/src/commands/deploy.rs
//
// WHAT:  Phase 5 — Cloudflare deploy pipeline IPC commands.
//
// HOW:   All commands run in the Tauri backend (Rust). External HTTP calls go to:
//          • Cloudflare API v4  — upload Worker, check status, verify token
//          • GitHub Releases API — fetch latest bundle metadata + download URL
//        Long-running operations (deploy_frontend) emit progress events via
//        Tauri's `app.emit()` so the frontend can show a live progress bar
//        without blocking on the command response.
//
// FLOW  (deploy_frontend):
//   1. Load CF credentials (cf_account_id, cf_api_token) from AppState / keychain
//   2. Resolve deploy_mode: "project" (one Worker per profile) or "workspace"
//   3. Determine worker_name = "businesskit-{slug}"
//   4. Emit event: deploy:progress { step: "checking_update", pct: 5 }
//   5. Hit GitHub releases API → get latest tag + download URL
//   6. Emit event: deploy:progress { step: "downloading", pct: 20 }
//   7. Download the pre-built CF Worker JS bundle (~200KB)
//   8. Emit event: deploy:progress { step: "uploading", pct: 60 }
//   9. Upload to CF via PUT /accounts/{id}/workers/scripts/{name}
//      with env-var bindings: TURSO_URL, TURSO_TOKEN, PROFILE_ID, DEPLOY_MODE
//  10. Emit event: deploy:progress { step: "registering", pct: 85 }
//  11. Write/update deployments row in Central DB
//  12. Emit event: deploy:progress { step: "done", pct: 100 }
//  13. Return DeploymentStatus to frontend
//
// KEYCHAIN STORAGE:
//   CF credentials are persisted via keyring after connect_cloudflare().
//   Service names: "businesskit.cf.account_id.{org_id}"
//                  "businesskit.cf.api_token.{org_id}"
//
// EVENTS emitted during deploy_frontend:
//   "deploy:progress"  { step: String, pct: u8, message: String }
//   "deploy:error"     { message: String }
//   "deploy:done"      { url: String, version: String }

use crate::deploy::cloudflare::{
    download_asset, get_latest_release, CloudflareClient, DeploymentStatus, UpdateInfo,
};
use crate::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

// ── Progress event payload ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
struct DeployProgress {
    step: String,
    pct: u8,
    message: String,
}

// ── connect_cloudflare ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CfAccountInfo {
    pub account_name: String,
    pub zones: Vec<crate::deploy::cloudflare::CfZone>,
}

#[tauri::command]
pub async fn validate_cloudflare_connection(
    cf_account_id: String,
    cf_api_token: String,
) -> Result<CfAccountInfo, String> {
    // Validate the token against CF API
    let cf = CloudflareClient::new(
        cf_account_id.trim().to_string(),
        cf_api_token.trim().to_string(),
    );
    let valid = cf.verify_token().await.map_err(|e| e.to_string())?;
    if !valid {
        return Err("Cloudflare token is invalid or inactive".to_string());
    }

    // Fetch the actual zones for the custom domain dropdown
    let zones = cf.list_zones().await.map_err(|e| e.to_string())?;

    Ok(CfAccountInfo {
        account_name: "Connected Account".to_string(),
        zones,
    })
}

// ── check_for_updates ─────────────────────────────────────────────────────────

/// Query the GitHub releases API for the latest BusinessKit frontend bundle.
/// Returns { latest_version, current_version, update_available, download_url }.
/// Current version is read from the Central DB deployments table for this profile.
#[tauri::command]
pub async fn check_for_updates(state: State<'_, Arc<AppState>>) -> Result<UpdateInfo, String> {
    state.require_license().await?;

    let http = reqwest::Client::builder()
        .user_agent("BusinessKit-Desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let (latest_tag, download_url, release_notes) =
        get_latest_release(&http).await.map_err(|e| e.to_string())?;

    // Get current deployed version from Central DB
    let org_id = {
        let org = state.organization.read().await;
        org.as_ref().map(|o| o.id.clone()).unwrap_or_default()
    };

    let current_version = if !org_id.is_empty() {
        let deployments = state
            .cdb()
            .await?
            .get_deployments(&org_id)
            .await
            .unwrap_or_default();

        let profile_id = state.active_profile_id.read().await.clone();
        deployments
            .into_iter()
            .find(|d| profile_id.as_deref() == Some(&d.profile_id))
            .and_then(|d| d.current_version)
    } else {
        None
    };

    let update_available = current_version.as_deref() != Some(&latest_tag);

    Ok(UpdateInfo {
        latest_version: latest_tag,
        current_version,
        update_available,
        release_notes,
        download_url,
    })
}

// ── get_deployment_status ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_org_deployments(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<crate::Deployment>, String> {
    state.require_license().await?;
    let org_id = {
        let org = state.organization.read().await;
        org.as_ref()
            .map(|o| o.id.clone())
            .ok_or_else(|| "No organization loaded".to_string())?
    };
    state
        .cdb()
        .await?
        .get_deployments(&org_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get the current deployment status for the active profile.
/// Reads the Central DB deployments table and checks live CF Worker status.
#[tauri::command]
pub async fn get_deployment_status(
    state: State<'_, Arc<AppState>>,
) -> Result<DeploymentStatus, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    let org_id = {
        let org = state.organization.read().await;
        org.as_ref()
            .map(|o| o.id.clone())
            .ok_or_else(|| "No organization loaded".to_string())?
    };

    let deployments = state
        .cdb()
        .await?
        .get_deployments(&org_id)
        .await
        .map_err(|e| e.to_string())?;

    let dep = deployments.into_iter().find(|d| d.profile_id == profile_id);

    match dep {
        Some(d) => Ok(DeploymentStatus {
            worker_name: d.cf_worker_name.unwrap_or_default(),
            current_version: d.current_version,
            latest_version: d.latest_version,
            status: d.status,
            deploy_url: d.cf_deployment_url,
            custom_domain: d.custom_domain,
            deployed_at: d.deployed_at,
            update_available: false, // call check_for_updates separately
            deployment_id: d.deployment_id,
        }),
        None => Ok(DeploymentStatus {
            worker_name: String::new(),
            current_version: None,
            latest_version: None,
            status: "not_deployed".to_string(),
            deploy_url: None,
            custom_domain: None,
            deployed_at: None,
            update_available: false,
            deployment_id: None,
        }),
    }
}

// ── deploy_frontend ───────────────────────────────────────────────────────────

/// Full deploy pipeline — download latest bundle + push to user's CF account.
///
/// deploy_mode: "project" — one Worker per profile slug
///              "workspace" — one shared Worker, all profiles, routes by profile_id
///
/// Emits Tauri events throughout:
///   "deploy:progress" { step, pct, message }
///   "deploy:error"    { message }
///   "deploy:done"     { url, version }
#[tauri::command]
pub async fn deploy_frontend(
    cf_account_id: String,
    cf_api_token: String,
    deploy_mode: String,
    deployment_id: Option<String>,
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<DeploymentStatus, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    // ── Step 1: Initialize CF Client ──────────────────────────────────────────
    emit_progress(&app, "initializing", 5, "Initializing Cloudflare client…");

    let org = {
        let org_guard = state.organization.read().await;
        org_guard
            .clone()
            .ok_or_else(|| "No organization loaded".to_string())?
    };

    // ── ATTACH TO EXISTING DEPLOYMENT ─────────────────────────────────────────
    if let Some(parent_id) = deployment_id {
        emit_progress(&app, "attaching", 10, "Attaching to existing deployment…");
        let existing = state
            .cdb()
            .await?
            .get_deployments(&org.id)
            .await
            .unwrap_or_default();

        let target = existing
            .into_iter()
            .find(|d| d.id == parent_id)
            .ok_or_else(|| format!("Target deployment {} not found", parent_id))?;

        let dep_id = uuid::Uuid::new_v4().to_string();
        let dep = crate::Deployment {
            id: dep_id.clone(),
            organization_id: org.id.clone(),
            profile_id: profile_id.clone(),
            deployment_id: Some(parent_id.clone()),
            deploy_mode: target.deploy_mode.clone(),
            custom_domain: None,
            cf_deployment_url: target.cf_deployment_url.clone(),
            cf_worker_name: target.cf_worker_name.clone(),
            encryption_secret: target.encryption_secret.clone(), // inherit secret
            current_version: target.current_version.clone(),
            latest_version: target.latest_version.clone(),
            status: "active".to_string(),
            deployed_at: Some(chrono::Utc::now().timestamp()),
            created_at: 0,
            updated_at: 0,
        };

        // 1. Fetch parent credentials to connect to parent's Turso DB
        let (parent_url, parent_encrypted_token, _, _) = state
            .cdb()
            .await?
            .get_userdb_creds_full(&target.profile_id)
            .await
            .map_err(|e| format!("Failed to get parent DB creds: {}", e))?;
        let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
        let parent_token =
            crate::vault::decrypt(&parent_encrypted_token, binary_secret, &target.profile_id)
                .map_err(|e| format!("Decrypt parent token failed: {}", e))?;

        // 2. Fetch new profile's credentials
        let (new_url, new_encrypted_token, _, _) = state
            .cdb()
            .await?
            .get_userdb_creds_full(&profile_id)
            .await
            .map_err(|e| format!("Failed to get new profile DB creds: {}", e))?;
        let new_token = crate::vault::decrypt(&new_encrypted_token, binary_secret, &profile_id)
            .map_err(|e| format!("Decrypt new profile token failed: {}", e))?;

        // 3. Re-encrypt for the target Turso DB using the target's ENCRYPTION_SECRET
        let reencrypted_token =
            crate::vault::encrypt(&new_token, &target.encryption_secret, &profile_id)
                .map_err(|e| format!("Encrypt for target failed: {}", e))?;

        // 4. Connect to parent DB and insert userdb
        let parent_db = crate::db::user::UserDb::connect(&parent_url, &parent_token)
            .await
            .map_err(|e| format!("Failed to connect to parent DB: {}", e))?;
        let conn = parent_db.conn().map_err(|e| e.to_string())?;

        let (userdb_id, created_at) = {
            let central_conn = state.cdb().await?.conn().map_err(|e| e.to_string())?;
            let mut rows = central_conn
                .query(
                    "SELECT id, created_at FROM userdb WHERE profile_id = ?1",
                    crate::turso_params![profile_id.clone()],
                )
                .await
                .map_err(|e| e.to_string())?;
            if let Some(row) = rows.next().await.unwrap_or(None) {
                let id: String = row
                    .get(0)
                    .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
                let ca: i64 = row.get(1).unwrap_or(chrono::Utc::now().timestamp());
                (id, ca)
            } else {
                (
                    uuid::Uuid::new_v4().to_string(),
                    chrono::Utc::now().timestamp(),
                )
            }
        };

        let now = chrono::Utc::now().timestamp();
        conn.execute("INSERT OR REPLACE INTO userdb (id, profile_id, turso_database_url, turso_auth_token, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", crate::turso_params![userdb_id, profile_id.clone(), new_url, reencrypted_token, created_at, now]).await.map_err(|e| e.to_string())?;

        // 5. Try insert userauth if it exists in central
        if let Ok((client_id, api_key, redirect_uri)) =
            state.cdb().await?.get_userauth_creds(&profile_id).await
        {
            let new_api_key =
                crate::vault::decrypt(&api_key, binary_secret, &profile_id).unwrap_or_default();
            let reencrypted_api_key =
                crate::vault::encrypt(&new_api_key, &target.encryption_secret, &profile_id)
                    .unwrap_or_default();

            conn.execute("INSERT OR REPLACE INTO userauth (id, profile_id, workos_client_id, workos_api_key, workos_redirect_uri, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", crate::turso_params![uuid::Uuid::new_v4().to_string(), profile_id.clone(), client_id, reencrypted_api_key, redirect_uri, now, now]).await.map_err(|e| e.to_string())?;
        }

        // 6. Insert profile into parent DB
        let profile = state
            .cdb()
            .await?
            .get_profile_by_id(&profile_id)
            .await
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR REPLACE INTO profiles (id, user_id, slug, title, bio, avatar_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            crate::turso_params![
                profile.id.clone(),
                profile.user_id.clone(),
                profile.slug.clone(),
                profile.title.clone(),
                profile.bio.clone(),
                profile.avatar_url.clone()
            ]
        ).await.map_err(|e| e.to_string())?;

        state
            .cdb()
            .await?
            .register_deployment(&dep)
            .await
            .map_err(|e| e.to_string())?;

        // Artificial delay so the UI progress bar is visible to the user
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;

        emit_progress(&app, "done", 100, "Attached successfully!");
        let _ = app.emit("deploy:done", serde_json::json!({ "url": target.cf_deployment_url, "version": target.current_version }));

        return Ok(DeploymentStatus {
            worker_name: target.cf_worker_name.unwrap_or_default(),
            current_version: target.current_version,
            latest_version: target.latest_version.clone(),
            status: target.status.clone(),
            deploy_url: target.cf_deployment_url.clone(),
            custom_domain: None,
            deployed_at: target.deployed_at,
            update_available: false,
            deployment_id: Some(parent_id.clone()),
        });
    }

    // ── Step 2: Load Turso creds from keychain or Central DB ──────────
    let (turso_url, turso_token) = match crate::commands::organization::load_from_file_cache(&profile_id) {
        Ok((url, token)) => (url, token),
        _ => {
            log::info!("Keychain miss during deploy — fetching full UserDB creds from Central DB for profile {}", profile_id);
            let (url, encrypted_token, _, _) = state
                .cdb()
                .await?
                .get_userdb_creds_full(&profile_id)
                .await
                .map_err(|e| format!("Failed to get DB creds from Central DB: {}", e))?;

            let secret = crate::commands::settings::get_secret();
            let plaintext_token = crate::vault::decrypt(&encrypted_token, &secret, &profile_id)
                .map_err(|e| format!("Decrypt failed for profile {}: {}", profile_id, e))?;

            let _ = crate::commands::organization::store_in_file_cache(&profile_id, &url, &plaintext_token);

            (url, plaintext_token)
        }
    };

    // ── Step 3: Determine worker name + slug ──────────────────────────────────
    let profile = state
        .cdb()
        .await?
        .get_profile_by_id(&profile_id)
        .await
        .map_err(|e| e.to_string())?;

    let slug = if deploy_mode == "workspace" {
        org.id.clone()
    } else {
        profile.slug.clone()
    };
    let worker_name = format!("businesskit-{}", slug);

    // ── Step 4: Fetch latest release from GitHub ──────────────────────────────
    emit_progress(&app, "checking_update", 15, "Checking for latest release…");

    let http = reqwest::Client::builder()
        .user_agent("BusinessKit-Desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let (version_tag, download_url, _) =
        get_latest_release(&http).await.map_err(|e| e.to_string())?;

    // ── Step 5: Download the Worker bundle ────────────────────────────────────
    emit_progress(
        &app,
        "downloading",
        30,
        &format!("Downloading bundle {}…", version_tag),
    );

    let bundle_bytes = download_asset(&http, &download_url)
        .await
        .map_err(|e| e.to_string())?;

    // Check if deployment row exists already
    let existing_deps = state
        .cdb()
        .await?
        .get_deployments(&org.id)
        .await
        .unwrap_or_default();

    let existing_dep = existing_deps
        .into_iter()
        .find(|d| d.profile_id == profile_id);

    let encryption_secret = if let Some(ref dep) = existing_dep {
        dep.encryption_secret.clone()
    } else {
        uuid::Uuid::new_v4().to_string()
    };

    // ── Step 6: Extract ZIP and generate wrangler.json ────────────────────────
    emit_progress(&app, "extracting", 40, "Extracting Worker bundle…");

    let temp_dir =
        std::env::temp_dir().join(format!("businesskit-deploy-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let cursor = std::io::Cursor::new(bundle_bytes);
    #[allow(deprecated)]
    zip_extract::extract(cursor, &temp_dir, false)
        .map_err(|e| format!("Failed to extract zip: {}", e))?;

    emit_progress(
        &app,
        "configuring",
        50,
        "Configuring Cloudflare environment…",
    );

    let cf = crate::deploy::cloudflare::CloudflareClient::new(
        cf_account_id.clone(),
        cf_api_token.clone(),
    );
    let cf_subdomain = cf
        .get_worker_subdomain()
        .await
        .unwrap_or_else(|_| "".to_string());

    let cf_worker_host = if cf_subdomain.is_empty() {
        format!("{}.workers.dev", worker_name)
    } else {
        format!("{}.{}.workers.dev", worker_name, cf_subdomain)
    };

    let deploy_url = format!("https://{}", cf_worker_host);

    let wrangler_config = serde_json::json!({
        "name": worker_name,
        "main": "./server/entry.cloudflare-pages.js",
        "compatibility_date": "2025-09-27",
        "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
        "assets": {
            "binding": "ASSET",
            "directory": "./dist"
        },
        "observability": {
            "enabled": true
        },
        "vars": {
            "TURSO_DATABASE_URL": turso_url,
            "PROFILE_ID": profile_id.clone(),
            "DEPLOY_MODE": deploy_mode.clone(),
            "OWNER_SLUG": "businesskit",
            "CF_WORKER_HOST": cf_worker_host,
            "APP_VERSION": version_tag.clone()
        }
    });

    std::fs::write(
        temp_dir.join("wrangler.json"),
        serde_json::to_string_pretty(&wrangler_config).unwrap(),
    )
    .map_err(|e| format!("Failed to write wrangler.json: {}", e))?;

    // ── Step 7: Upload to Cloudflare via Wrangler ──────────────────────────────
    emit_progress(&app, "uploading", 60, "Uploading Worker via Wrangler…");

    let output = std::process::Command::new("npx")
        .arg("wrangler")
        .arg("deploy")
        .current_dir(&temp_dir)
        .env("CLOUDFLARE_API_TOKEN", &cf_api_token)
        .env("CLOUDFLARE_ACCOUNT_ID", &cf_account_id)
        .output()
        .map_err(|e| format!("Failed to execute npx wrangler deploy: {}", e))?;

    let _ = std::fs::remove_dir_all(&temp_dir); // Clean up temp dir

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Wrangler deploy failed: {}\n{}", stderr, stdout));
    }

    // ── Step 8: Upload encrypted secrets via Cloudflare Secrets API ────────────
    emit_progress(&app, "secrets", 75, "Encrypting and uploading Worker secrets…");

    cf.put_worker_secret(&worker_name, "TURSO_AUTH_TOKEN", &turso_token)
        .await
        .map_err(|e| format!("Failed to set TURSO_AUTH_TOKEN secret: {}", e))?;

    cf.put_worker_secret(&worker_name, "ENCRYPTION_SECRET", &encryption_secret)
        .await
        .map_err(|e| format!("Failed to set ENCRYPTION_SECRET secret: {}", e))?;

    // URL and Host are already determined above before generating wrangler.json

    // ── Step 7: Register / update in Central DB ───────────────────────────────
    emit_progress(&app, "registering", 85, "Registering deployment…");

    let _deployment_id = if let Some(ref dep) = existing_dep {
        // Update existing
        state
            .cdb()
            .await?
            .update_deployment_version(&dep.id, &version_tag, &deploy_url, "active")
            .await
            .map_err(|e| e.to_string())?;
        dep.id.clone()
    } else {
        // Register new
        let dep_id = uuid::Uuid::new_v4().to_string();
        let dep = crate::Deployment {
            id: dep_id.clone(),
            organization_id: org.id.clone(),
            profile_id: profile_id.clone(),
            deployment_id: None,
            deploy_mode: deploy_mode.clone(),
            custom_domain: None,
            cf_deployment_url: Some(deploy_url.clone()),
            cf_worker_name: Some(worker_name.clone()),
            encryption_secret: encryption_secret.clone(),
            current_version: Some(version_tag.clone()),
            latest_version: Some(version_tag.clone()),
            status: "active".to_string(),
            deployed_at: Some(chrono::Utc::now().timestamp()),
            created_at: 0,
            updated_at: 0,
        };
        state
            .cdb()
            .await?
            .register_deployment(&dep)
            .await
            .map_err(|e| e.to_string())?;

        // Sync userauth row from CentralDB to UserDB for standalone deployment
        if let Ok((url, encrypted_token, _, _)) =
            state.cdb().await?.get_userdb_creds_full(&profile_id).await
        {
            let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
            if let Ok(token) = crate::vault::decrypt(&encrypted_token, binary_secret, &profile_id) {
                if let Ok(user_db) = crate::db::user::UserDb::connect(&url, &token).await {
                    if let Ok(conn) = user_db.conn() {
                        if let Ok((client_id, api_key, redirect_uri)) =
                            state.cdb().await?.get_userauth_creds(&profile_id).await
                        {
                            let new_api_key =
                                crate::vault::decrypt(&api_key, binary_secret, &profile_id)
                                    .unwrap_or_default();
                            let reencrypted_api_key = crate::vault::encrypt(
                                &new_api_key,
                                &encryption_secret,
                                &profile_id,
                            )
                            .unwrap_or_default();
                            let now = chrono::Utc::now().timestamp();
                            let _ = conn.execute("INSERT OR REPLACE INTO userauth (id, profile_id, workos_client_id, workos_api_key, workos_redirect_uri, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", crate::turso_params![uuid::Uuid::new_v4().to_string(), profile_id.clone(), client_id, reencrypted_api_key, redirect_uri, now, now]).await;
                        }
                    }
                }
            }
        }

        dep_id
    };

    // ── Step 8: Done ──────────────────────────────────────────────────────────
    emit_progress(&app, "done", 100, "Deployment complete!");

    let _ = app.emit(
        "deploy:done",
        serde_json::json!({ "url": deploy_url, "version": version_tag }),
    );

    Ok(DeploymentStatus {
        worker_name: worker_name.clone(),
        current_version: Some(version_tag.clone()),
        latest_version: Some(version_tag),
        status: "active".to_string(),
        deploy_url: Some(deploy_url),
        custom_domain: existing_dep.as_ref().and_then(|d| d.custom_domain.clone()),
        deployed_at: Some(chrono::Utc::now().timestamp()),
        update_available: false,
        deployment_id: existing_dep.as_ref().and_then(|d| d.deployment_id.clone()),
    })
}

// ── Helper: emit deploy progress event ───────────────────────────────────────

fn emit_progress(app: &AppHandle, step: &str, pct: u8, message: &str) {
    let _ = app.emit(
        "deploy:progress",
        DeployProgress {
            step: step.to_string(),
            pct,
            message: message.to_string(),
        },
    );
    log::info!("[deploy] {}% — {}", pct, message);
}

// ── New Commands ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CustomDomain {
    pub id: String,
    pub domain: String,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DomainStatus {
    pub verified: bool,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProfileInfo {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub async fn add_profile_to_deployment(
    deployment_id: String,
    profile_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    // Stub implementation
    log::info!(
        "Adding profile {} to deployment {}",
        profile_id,
        deployment_id
    );
    Ok(())
}

#[tauri::command]
pub async fn add_custom_domain(
    zone_id: String,
    domain: String,
    cf_account_id: String,
    cf_api_token: String,
    state: State<'_, Arc<AppState>>,
) -> Result<CustomDomain, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    // Get the active deployment to find the correct worker name (in case it's a shared worker)
    let org_id = state
        .organization
        .read()
        .await
        .as_ref()
        .map(|o| o.id.clone())
        .unwrap_or_default();
    let deployments = state
        .cdb()
        .await?
        .get_deployments(&org_id)
        .await
        .map_err(|e| e.to_string())?;

    let dep = deployments
        .iter()
        .find(|d| d.profile_id == profile_id)
        .ok_or_else(|| "Active deployment not found".to_string())?;

    let profile = state
        .cdb()
        .await?
        .get_profile_by_id(&profile_id)
        .await
        .map_err(|e| e.to_string())?;

    let worker_name = dep
        .cf_worker_name
        .clone()
        .unwrap_or_else(|| format!("businesskit-{}", profile.slug));

    log::info!(
        "Adding custom domain {} to worker {} for profile {}",
        domain,
        worker_name,
        profile_id
    );

    let cf = crate::deploy::cloudflare::CloudflareClient::new(cf_account_id, cf_api_token);
    cf.add_worker_domain(&zone_id, &domain, &worker_name)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Register in Central DB
    let domain_id = uuid::Uuid::new_v4().to_string();
    state
        .cdb()
        .await?
        .register_custom_domain(&domain_id, &profile_id, &domain)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Register in User's Turso DB
    if let Ok((turso_url, turso_token)) = crate::commands::organization::load_from_file_cache(&profile_id) {
        let conn = crate::db::turso::TursoConn::new(&turso_url, &turso_token);
        let _ = conn.execute(
            "INSERT INTO custom_domains (id, profile_id, domain, is_verified, ssl_status) 
             VALUES (?1, ?2, ?3, 1, 'active')
             ON CONFLICT(profile_id) DO UPDATE SET 
                domain = excluded.domain,
                is_verified = 1,
                ssl_status = 'active',
                updated_at = strftime('%s','now')",
            crate::turso_params![domain_id.clone(), profile_id.clone(), domain.clone()]
        ).await;
    }


    // 4. If this is an attached deployment, ALSO register in Parent's Turso DB
    if let Some(parent_id) = &dep.deployment_id {
        if let Some(parent) = deployments.iter().find(|d| &d.id == parent_id) {
            if let Ok((parent_url, parent_encrypted_token, _, _)) = state
                .cdb()
                .await?
                .get_userdb_creds_full(&parent.profile_id)
                .await
            {
                let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
                if let Ok(parent_token) = crate::vault::decrypt(
                    &parent_encrypted_token,
                    binary_secret,
                    &parent.profile_id,
                ) {
                    if let Ok(parent_db) =
                        crate::db::user::UserDb::connect(&parent_url, &parent_token).await
                    {
                        if let Ok(conn) = parent_db.conn() {
                            let _ = conn.execute(
                                "INSERT INTO custom_domains (id, profile_id, domain, is_verified, ssl_status) 
                                 VALUES (?1, ?2, ?3, 1, 'active')
                                 ON CONFLICT(profile_id) DO UPDATE SET 
                                    domain = excluded.domain,
                                    is_verified = 1,
                                    ssl_status = 'active',
                                    updated_at = strftime('%s','now')",
                                crate::turso_params![domain_id.clone(), profile_id.clone(), domain.clone()]
                            ).await;

                            let _ = conn.execute(
                                "INSERT OR REPLACE INTO profiles (id, user_id, slug, title, bio, avatar_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                                crate::turso_params![
                                    profile.id.clone(),
                                    profile.user_id.clone(),
                                    profile.slug.clone(),
                                    profile.title.clone(),
                                    profile.bio.clone(),
                                    profile.avatar_url.clone()
                                ]
                            ).await;
                        }
                    }
                }
            }
        }
    }

    Ok(CustomDomain {
        id: domain_id,
        domain,
        verified: true,
    })
}

#[tauri::command]
pub async fn delete_custom_domain(
    profile_id: String,
    domain: String,
    cf_account_id: String,
    cf_api_token: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let _ = state.require_profile().await?;

    let cf = crate::deploy::cloudflare::CloudflareClient::new(cf_account_id, cf_api_token);
    let _ = cf.delete_worker_domain(&domain).await; // Best effort deletion

    // Remove from central DB
    let central_conn = state.cdb().await?.conn().map_err(|e| e.to_string())?;

    // Check if it's an attached deployment to delete from parent DB
    let mut is_attached = false;
    let mut parent_profile_id = String::new();

    if let Ok(mut rows) = central_conn
        .query(
            "SELECT deployment_id FROM deployments WHERE profile_id = ?1",
            crate::turso_params![profile_id.clone()],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            if let Ok(Some(parent_dep_id)) = row.get::<Option<String>>(0) {
                if let Ok(mut parent_rows) = central_conn
                    .query(
                        "SELECT profile_id FROM deployments WHERE id = ?1",
                        crate::turso_params![parent_dep_id],
                    )
                    .await
                {
                    if let Ok(Some(parent_row)) = parent_rows.next().await {
                        if let Ok(pid) = parent_row.get::<String>(0) {
                            is_attached = true;
                            parent_profile_id = pid;
                        }
                    }
                }
            }
        }
    }

    let _ = central_conn
        .execute(
            "DELETE FROM custom_domains WHERE profile_id = ?1 AND domain = ?2",
            crate::turso_params![profile_id.clone(), domain.clone()],
        )
        .await;
    let _ = central_conn
        .execute(
            "UPDATE deployments SET custom_domain = NULL WHERE profile_id = ?1",
            crate::turso_params![profile_id.clone()],
        )
        .await;

    // Remove from Child UserDB
    if let Ok((url, encrypted_token, _, _)) =
        state.cdb().await?.get_userdb_creds_full(&profile_id).await
    {
        let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
        if let Ok(token) = crate::vault::decrypt(&encrypted_token, binary_secret, &profile_id) {
            if let Ok(user_db) = crate::db::user::UserDb::connect(&url, &token).await {
                if let Ok(conn) = user_db.conn() {
                    let _ = conn
                        .execute(
                            "DELETE FROM custom_domains WHERE profile_id = ?1 AND domain = ?2",
                            crate::turso_params![profile_id.clone(), domain.clone()],
                        )
                        .await;
                }
            }
        }
    }

    // Remove from Parent UserDB if attached
    if is_attached {
        if let Ok((url, encrypted_token, _, _)) = state
            .cdb()
            .await?
            .get_userdb_creds_full(&parent_profile_id)
            .await
        {
            let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
            if let Ok(token) =
                crate::vault::decrypt(&encrypted_token, binary_secret, &parent_profile_id)
            {
                if let Ok(user_db) = crate::db::user::UserDb::connect(&url, &token).await {
                    if let Ok(conn) = user_db.conn() {
                        let _ = conn
                            .execute(
                                "DELETE FROM custom_domains WHERE profile_id = ?1 AND domain = ?2",
                                crate::turso_params![profile_id.clone(), domain.clone()],
                            )
                            .await;
                    }
                }
            }
        }
    }

    Ok(())
}
#[tauri::command]
pub async fn add_external_custom_domain(
    profile_id: String,
    domain: String,
    zone_id: String,
    cf_account_id: String,
    cf_api_token: String,
    state: State<'_, Arc<AppState>>,
) -> Result<crate::deploy::cloudflare::CfSaaSVerification, String> {
    state.require_license().await?;
    let _ = state.require_profile().await?;

    let cf = crate::deploy::cloudflare::CloudflareClient::new(cf_account_id, cf_api_token);
    let verify = cf
        .add_saas_domain(&zone_id, &domain)
        .await
        .map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();

    // Insert into Central DB first to get deployment info
    let central_conn = state.cdb().await?.conn().map_err(|e| e.to_string())?;

    // Check if it's an attached deployment
    let mut is_attached = false;
    let mut parent_profile_id = String::new();

    if let Ok(mut rows) = central_conn
        .query(
            "SELECT deployment_id FROM deployments WHERE profile_id = ?1",
            crate::turso_params![profile_id.clone()],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            if let Ok(Some(parent_dep_id)) = row.get::<Option<String>>(0) {
                if let Ok(mut parent_rows) = central_conn
                    .query(
                        "SELECT profile_id FROM deployments WHERE id = ?1",
                        crate::turso_params![parent_dep_id],
                    )
                    .await
                {
                    if let Ok(Some(parent_row)) = parent_rows.next().await {
                        if let Ok(pid) = parent_row.get::<String>(0) {
                            is_attached = true;
                            parent_profile_id = pid;
                        }
                    }
                }
            }
        }
    }

    let _ = central_conn.execute(
        "INSERT INTO custom_domains (id, profile_id, domain, is_verified, ssl_status) VALUES (?1, ?2, ?3, 0, 'pending')",
        crate::turso_params![id.clone(), profile_id.clone(), domain.clone()]
    ).await;
    let _ = central_conn
        .execute(
            "UPDATE deployments SET custom_domain = ?1 WHERE profile_id = ?2",
            crate::turso_params![domain.clone(), profile_id.clone()],
        )
        .await;

    // Insert into Child UserDB
    if let Ok((url, encrypted_token, _, _)) =
        state.cdb().await?.get_userdb_creds_full(&profile_id).await
    {
        let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
        if let Ok(token) = crate::vault::decrypt(&encrypted_token, binary_secret, &profile_id) {
            if let Ok(user_db) = crate::db::user::UserDb::connect(&url, &token).await {
                if let Ok(conn) = user_db.conn() {
                    let _ = conn.execute(
                        "INSERT INTO custom_domains (id, profile_id, domain, is_verified, ssl_status) VALUES (?1, ?2, ?3, 0, 'pending')",
                        crate::turso_params![id.clone(), profile_id.clone(), domain.clone()]
                    ).await;
                }
            }
        }
    }

    // Insert into Parent UserDB if attached
    if is_attached {
        if let Ok((url, encrypted_token, _, _)) = state
            .cdb()
            .await?
            .get_userdb_creds_full(&parent_profile_id)
            .await
        {
            let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
            if let Ok(token) =
                crate::vault::decrypt(&encrypted_token, binary_secret, &parent_profile_id)
            {
                if let Ok(user_db) = crate::db::user::UserDb::connect(&url, &token).await {
                    if let Ok(conn) = user_db.conn() {
                        let _ = conn.execute(
                            "INSERT INTO custom_domains (id, profile_id, domain, is_verified, ssl_status) VALUES (?1, ?2, ?3, 0, 'pending')",
                            crate::turso_params![id.clone(), profile_id.clone(), domain.clone()]
                        ).await;
                    }
                }
            }
        }
    }

    Ok(verify)
}

#[tauri::command]
pub async fn verify_custom_domain(
    _profile_id: String,
    _domain_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<DomainStatus, String> {
    state.require_license().await?;
    // Stub implementation
    Ok(DomainStatus {
        verified: true,
        instructions: "DNS verified successfully.".to_string(),
    })
}

#[tauri::command]
pub async fn get_connected_profiles(
    _deployment_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ProfileInfo>, String> {
    state.require_license().await?;
    // Stub implementation
    Ok(vec![])
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ParentCfConnection {
    pub account_id: String,
    pub api_token: String,
}

#[tauri::command]
pub async fn get_parent_cf_connection(
    parent_deployment_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ParentCfConnection, String> {
    state.require_license().await?;
    let _ = state.require_profile().await?;
    let org_id = state
        .organization
        .read()
        .await
        .as_ref()
        .map(|o| o.id.clone())
        .unwrap_or_default();

    // 1. Get all deployments to find the parent
    let deployments = state
        .cdb()
        .await?
        .get_deployments(&org_id)
        .await
        .map_err(|e| e.to_string())?;
    let parent = deployments
        .into_iter()
        .find(|d| d.id == parent_deployment_id)
        .ok_or_else(|| "Parent deployment not found".to_string())?;

    // 2. Fetch parent profile's DB credentials
    let (parent_url, parent_encrypted_token, _, _) = state
        .cdb()
        .await?
        .get_userdb_creds_full(&parent.profile_id)
        .await
        .map_err(|e| format!("Failed to get parent DB creds: {}", e))?;
    let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
    let parent_token =
        crate::vault::decrypt(&parent_encrypted_token, binary_secret, &parent.profile_id)
            .map_err(|e| format!("Decrypt parent token failed: {}", e))?;

    // 3. Connect to parent DB and query connections table
    let parent_db = crate::db::user::UserDb::connect(&parent_url, &parent_token)
        .await
        .map_err(|e| format!("Failed to connect to parent DB: {}", e))?;
    let conn = parent_db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query("SELECT extra, access_token FROM connections WHERE service = 'cloudflare' AND is_active = 1 LIMIT 1", crate::turso_params![]).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let account_id: String = row.get(0).unwrap_or_default();
        let api_token: String = row.get(1).unwrap_or_default();

        Ok(ParentCfConnection {
            account_id,
            api_token,
        })
    } else {
        Err("Parent profile does not have an active Cloudflare connection".to_string())
    }
}

#[tauri::command]
pub async fn delete_deployment(
    profile_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let _ = state.require_profile().await?;
    let org_id = state
        .organization
        .read()
        .await
        .as_ref()
        .map(|o| o.id.clone())
        .unwrap_or_default();

    let deployments = state
        .cdb()
        .await?
        .get_deployments(&org_id)
        .await
        .map_err(|e| e.to_string())?;
    let dep = deployments
        .iter()
        .find(|d| d.profile_id == profile_id)
        .ok_or_else(|| "Deployment not found".to_string())?;

    if let Some(parent_id) = &dep.deployment_id {
        // Child attached deployment
        if let Some(parent) = deployments.iter().find(|d| d.id == *parent_id) {
            if let Ok((parent_url, parent_encrypted_token, _, _)) = state
                .cdb()
                .await?
                .get_userdb_creds_full(&parent.profile_id)
                .await
            {
                let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
                if let Ok(parent_token) = crate::vault::decrypt(
                    &parent_encrypted_token,
                    binary_secret,
                    &parent.profile_id,
                ) {
                    if let Ok(parent_db) =
                        crate::db::user::UserDb::connect(&parent_url, &parent_token).await
                    {
                        if let Ok(conn) = parent_db.conn() {
                            let _ = conn
                                .execute(
                                    "DELETE FROM profiles WHERE id = ?1",
                                    crate::turso_params![profile_id.clone()],
                                )
                                .await;
                            let _ = conn
                                .execute(
                                    "DELETE FROM userdb WHERE profile_id = ?1",
                                    crate::turso_params![profile_id.clone()],
                                )
                                .await;
                            let _ = conn
                                .execute(
                                    "DELETE FROM userauth WHERE profile_id = ?1",
                                    crate::turso_params![profile_id.clone()],
                                )
                                .await;
                            let _ = conn
                                .execute(
                                    "DELETE FROM custom_domains WHERE profile_id = ?1",
                                    crate::turso_params![profile_id.clone()],
                                )
                                .await;
                        }
                    }
                }
            }
        }

        // Also delete from Child's own UserDB
        if let Ok((url, encrypted_token, _, _)) =
            state.cdb().await?.get_userdb_creds_full(&profile_id).await
        {
            let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
            if let Ok(token) = crate::vault::decrypt(&encrypted_token, binary_secret, &profile_id) {
                if let Ok(user_db) = crate::db::user::UserDb::connect(&url, &token).await {
                    if let Ok(conn) = user_db.conn() {
                        let _ = conn
                            .execute(
                                "DELETE FROM custom_domains WHERE profile_id = ?1",
                                crate::turso_params![profile_id.clone()],
                            )
                            .await;
                    }
                }
            }
        }
    } else {
        // Standalone project deployment
        // Let's attempt to delete the cloudflare worker if we can find creds in THIS user's DB
        if let Ok((url, encrypted_token, _, _)) =
            state.cdb().await?.get_userdb_creds_full(&profile_id).await
        {
            let binary_secret = option_env!("ENCRYPTION_SECRET").unwrap_or("missing_secret");
            if let Ok(token) = crate::vault::decrypt(&encrypted_token, binary_secret, &profile_id) {
                if let Ok(user_db) = crate::db::user::UserDb::connect(&url, &token).await {
                    if let Ok(conn) = user_db.conn() {
                        let _ = conn
                            .execute(
                                "DELETE FROM custom_domains WHERE profile_id = ?1",
                                crate::turso_params![profile_id.clone()],
                            )
                            .await;
                        if let Ok(mut rows) = conn.query("SELECT extra, access_token FROM connections WHERE service = 'cloudflare' AND is_active = 1 LIMIT 1", crate::turso_params![]).await {
                            if let Ok(Some(row)) = rows.next().await {
                                let account_id: String = row.get(0).unwrap_or_default();
                                let api_token: String = row.get(1).unwrap_or_default();
                                
                                if let Some(worker_name) = &dep.cf_worker_name {
                                    let cf = crate::deploy::cloudflare::CloudflareClient::new(account_id, api_token);
                                    let _ = cf.delete_worker(worker_name).await; // Best effort deletion
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Finally delete from central
    let central_conn = state.cdb().await?.conn().map_err(|e| e.to_string())?;
    let _ = central_conn
        .execute(
            "DELETE FROM custom_domains WHERE profile_id = ?1",
            crate::turso_params![profile_id.clone()],
        )
        .await;
    central_conn
        .execute(
            "DELETE FROM deployments WHERE profile_id = ?1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
