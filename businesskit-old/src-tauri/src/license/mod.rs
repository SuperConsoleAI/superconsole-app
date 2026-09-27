// src-tauri/src/license/mod.rs
// License validation: on-launch check + 24hr background recheck.
// Fallback: if Central DB unreachable, uses cached state (48hr grace).

use crate::{AppState, LicenseStatus};
use anyhow::Result;
use std::sync::Arc;

const GRACE_SECONDS: i64 = 48 * 3600; // 48hr offline grace
const CACHE_FILE: &str = "license_cache.json";

/// Called once at app launch — tries Central DB, falls back to cache.
pub async fn check_on_launch(state: Arc<AppState>) {
    match load_cached_user_id() {
        Some(user_id) => {
            log::info!("License: checking user {}", user_id);
            match check_license(&state, &user_id).await {
                Ok(status) => {
                    log::info!("License status: {}", status.status);
                    *state.license.write().await = status;
                }
                Err(e) => {
                    log::warn!("License check failed: {} — checking cache", e);
                    apply_cached_or_grace(&state).await;
                }
            }
        }
        None => {
            log::info!("License: no user configured yet");
        }
    }
}

/// Fetch license from Central DB and update cache.
pub async fn check_license(state: &Arc<AppState>, user_id: &str) -> Result<LicenseStatus> {
    let status = state
        .cdb()
        .await
        .map_err(|e| anyhow::anyhow!(e))?
        .get_license_status(user_id)
        .await?;
    save_license_cache(user_id, &status);
    Ok(status)
}

/// Start background task: recheck every 24 hours.
pub async fn start_background_recheck(state: Arc<AppState>, _app: tauri::AppHandle) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(24 * 3600));
        interval.tick().await; // first tick fires immediately — skip
        loop {
            interval.tick().await;
            if let Some(user_id) = load_cached_user_id() {
                log::info!("License: 24hr background recheck for {}", user_id);
                match check_license(&state, &user_id).await {
                    Ok(status) => {
                        let active = status.is_active();
                        *state.license.write().await = status;
                        if !active {
                            log::warn!("License became inactive during recheck");
                            // Frontend will see this on next command call
                        }
                    }
                    Err(e) => {
                        log::warn!("Background license recheck failed: {}", e);
                        apply_cached_or_grace(&state).await;
                    }
                }
            }
        }
    });
}

/// Apply cached license with grace period if Central DB is unreachable.
async fn apply_cached_or_grace(state: &Arc<AppState>) {
    let now = chrono::Utc::now().timestamp();

    if let Some(cached) = load_license_cache() {
        let age = now - cached.checked_at;
        if age < GRACE_SECONDS {
            log::info!(
                "License: using cached status '{}' ({}s old)",
                cached.status.status,
                age
            );
            let mut status = cached.status.clone();
            status.grace_until = Some(cached.checked_at + GRACE_SECONDS);
            *state.license.write().await = status;
        } else {
            log::warn!(
                "License: cache expired ({}s > {}s grace), marking inactive",
                age,
                GRACE_SECONDS
            );
            *state.license.write().await = LicenseStatus {
                status: "inactive".to_string(),
                plan: "free".to_string(),
                expires_at: None,
                checked_at: now,
                grace_until: None,
            };
        }
    }
}

// ── Simple JSON cache in app data dir ────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct CachedLicense {
    pub user_id: String,
    pub status: LicenseStatus,
    pub checked_at: i64,
}

pub fn get_app_storage_dir() -> std::path::PathBuf {
    if let Some(d) = dirs::data_local_dir() {
        return d.join("businesskit");
    }
    if let Some(d) = dirs::data_dir() {
        return d.join("businesskit");
    }
    if let Ok(home) = std::env::var("HOME") {
        return std::path::PathBuf::from(&home).join(".businesskit");
    }
    std::env::temp_dir().join(".businesskit")
}

pub fn ensure_secure_dir(dir: &std::path::Path) -> std::io::Result<()> {
    if !dir.exists() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true).mode(0o700);
            builder.create(dir)?;
        }
        #[cfg(not(unix))]
        {
            std::fs::create_dir_all(dir)?;
        }
    }
    Ok(())
}

pub fn write_secure_file(path: &std::path::Path, content: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_secure_dir(parent)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        file.write_all(content.as_bytes())?;
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, content)?;
    }
    Ok(())
}

pub fn cleanup_legacy_exposed_dirs() {
    if let Ok(home_str) = std::env::var("HOME") {
        let home = std::path::Path::new(&home_str);
        // Remove legacy exposed ~/creds folder
        let legacy_creds = home.join("creds");
        if legacy_creds.exists() {
            let _ = std::fs::remove_dir_all(&legacy_creds);
        }
        let legacy_files_creds = home.join("files").join("creds");
        if legacy_files_creds.exists() {
            let _ = std::fs::remove_dir_all(&legacy_files_creds);
        }
        let legacy_files = home.join("files");
        if legacy_files.exists() {
            let _ = std::fs::remove_dir(&legacy_files);
        }
        // Remove legacy plaintext files dumped in root $HOME
        let _ = std::fs::remove_file(home.join("profile_id.txt"));
        let _ = std::fs::remove_file(home.join("user_id.txt"));
        let _ = std::fs::remove_file(home.join("license_cache.json"));
    }
}

pub fn save_profile_id(profile_id: &str) {
    let dir = get_app_storage_dir();
    let file = dir.join("profile_id.txt");
    let _ = write_secure_file(&file, profile_id);
}

pub fn clear_profile_id() {
    let dir = get_app_storage_dir();
    let _ = std::fs::remove_file(dir.join("profile_id.txt"));
}

pub fn load_cached_profile_id() -> Option<String> {
    let dir = get_app_storage_dir();
    if let Ok(content) = std::fs::read_to_string(dir.join("profile_id.txt")) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

pub fn save_user_id(user_id: &str) {
    let dir = get_app_storage_dir();
    let file = dir.join("user_id.txt");
    let _ = write_secure_file(&file, user_id);
}

pub fn clear_user_id() {
    let dir = get_app_storage_dir();
    let _ = std::fs::remove_file(dir.join("user_id.txt"));
}

pub fn clear_license_cache() {
    let dir = get_app_storage_dir();
    let _ = std::fs::remove_file(dir.join(CACHE_FILE));
}

pub fn load_cached_user_id() -> Option<String> {
    let dir = get_app_storage_dir();
    if let Ok(content) = std::fs::read_to_string(dir.join("user_id.txt")) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn save_license_cache(user_id: &str, status: &LicenseStatus) {
    let cached = CachedLicense {
        user_id: user_id.to_string(),
        status: status.clone(),
        checked_at: chrono::Utc::now().timestamp(),
    };
    if let Ok(json) = serde_json::to_string(&cached) {
        let dir = get_app_storage_dir();
        let file = dir.join(CACHE_FILE);
        let _ = write_secure_file(&file, &json);
    }
}

pub fn load_license_cache() -> Option<CachedLicense> {
    let dir = get_app_storage_dir();
    if let Ok(json) = std::fs::read_to_string(dir.join(CACHE_FILE)) {
        if let Ok(cached) = serde_json::from_str(&json) {
            return Some(cached);
        }
    }
    None
}
