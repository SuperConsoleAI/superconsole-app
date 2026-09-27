// src-tauri/src/commands/settings.rs
//
// WHAT:  Profile-level settings management and billing portal.
//
// HOW:   Reads/writes settings-related tables. Credentials (API keys, tokens)
//        are stored in the OS keychain — not in the DB. Settings like theme,
//        timezone, SEO defaults, notification prefs are stored in a
//        `profile_settings` JSON blob or flat columns in the UserDB.
//
// FLOW:
//   get_settings       → reads profile_settings row (or returns defaults)
//   update_settings    → UPSERT profile_settings
//   save_api_key       → stores key in OS keychain (keyring)
//   get_api_key        → reads key from OS keychain
//   delete_api_key     → removes key from OS keychain
//   get_billing_portal → returns Paddle customer portal URL (from Central DB)
//
// TABLES TOUCHED:
//   profile_settings  — flat settings table (1 row per profile)
//
// KEYCHAIN KEYS (service = "businesskit"):
//   "openai.{profile_id}"        — OpenAI API key
//   "anthropic.{profile_id}"     — Anthropic API key
//   "resend.{profile_id}"        — Resend email API key
//   "google_oauth.{profile_id}"  — Google OAuth access token (GSC/GA4)
//   "paddle.{profile_id}"        — Paddle API key
//
// REFERENCE: src/lib/settings-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSettings {
    pub id: String,
    pub profile_id: String,
    pub site_title: Option<String>,
    pub tagline: Option<String>,
    pub site_description: Option<String>,
    pub logo_url: Option<String>,
    pub favicon: Option<String>,
    pub timezone: Option<String>,
    pub location: Option<String>,
    pub country: Option<String>,
    pub currency: Option<String>,
    pub supported_currencies: Option<String>,
    pub industry: Option<String>,
    pub language: Option<String>,
    pub theme: String, // light | dark | system
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettingsData {
    pub site_title: Option<String>,
    pub tagline: Option<String>,
    pub site_description: Option<String>,
    pub logo_url: Option<String>,
    pub favicon: Option<String>,
    pub timezone: Option<String>,
    pub location: Option<String>,
    pub country: Option<String>,
    pub currency: Option<String>,
    pub supported_currencies: Option<String>,
    pub industry: Option<String>,
    pub language: Option<String>,
    pub theme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CentralCredentialsResponse {
    pub has_user_db: bool,
    pub has_workos: bool,
    pub turso_url: String,
    pub turso_token_masked: String,
    pub workos_client_id: String,
    pub workos_api_key_masked: String,
    pub workos_redirect_uri: String,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Get profile settings (auto-creates defaults if missing).
#[tauri::command]
pub async fn get_settings(state: State<'_, Arc<AppState>>) -> Result<ProfileSettings, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // Auto-insert defaults
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT OR IGNORE INTO settings
           (id, profile_id, timezone, language, theme, updated_at)
         VALUES (?1, ?2, 'UTC', 'en', 'system', unixepoch())",
        crate::turso_params![id, profile_id.clone()],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, site_title, tagline, site_description,
                logo_url, favicon, timezone, location, country, currency, supported_currencies, industry, language, theme, updated_at
         FROM settings WHERE profile_id=?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        Ok(ProfileSettings {
            id: row.get::<String>(0).unwrap_or_default(),
            profile_id: row.get::<String>(1).unwrap_or_default(),
            site_title: row.get::<Option<String>>(2).unwrap_or(None),
            tagline: row.get::<Option<String>>(3).unwrap_or(None),
            site_description: row.get::<Option<String>>(4).unwrap_or(None),
            logo_url: row.get::<Option<String>>(5).unwrap_or(None),
            favicon: row.get::<Option<String>>(6).unwrap_or(None),
            timezone: row.get::<Option<String>>(7).unwrap_or(None),
            location: row.get::<Option<String>>(8).unwrap_or(None),
            country: row.get::<Option<String>>(9).unwrap_or(None),
            currency: row.get::<Option<String>>(10).unwrap_or(None),
            supported_currencies: row.get::<Option<String>>(11).unwrap_or(None),
            industry: row.get::<Option<String>>(12).unwrap_or(None),
            language: row.get::<Option<String>>(13).unwrap_or(None),
            theme: row.get::<String>(14).unwrap_or_else(|_| "system".into()),
            updated_at: row.get::<i64>(15).unwrap_or(0),
        })
    } else {
        Err("Settings not found after insert".to_string())
    }
}

/// Update profile settings (only provided fields change).
#[tauri::command]
pub async fn update_settings(
    data: UpdateSettingsData,
    state: State<'_, Arc<AppState>>,
) -> Result<ProfileSettings, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE settings SET
           site_title           = COALESCE(?1, site_title),
           tagline              = COALESCE(?2, tagline),
           site_description     = COALESCE(?3, site_description),
           logo_url             = COALESCE(?4, logo_url),
           favicon              = COALESCE(?5, favicon),
           timezone             = COALESCE(?6, timezone),
           location             = COALESCE(?7, location),
           country              = COALESCE(?8, country),
           currency             = COALESCE(?9, currency),
           supported_currencies = COALESCE(?10, supported_currencies),
           industry             = COALESCE(?11, industry),
           language             = COALESCE(?12, language),
           theme                = COALESCE(?13, theme),
           updated_at           = unixepoch()
         WHERE profile_id=?14",
        crate::turso_params![
            data.site_title,
            data.tagline,
            data.site_description,
            data.logo_url,
            data.favicon,
            data.timezone,
            data.location,
            data.country,
            data.currency,
            data.supported_currencies,
            data.industry,
            data.language,
            data.theme,
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    get_settings(state).await
}

/// Store a named API key in the OS keychain.
/// key_name: "openai" | "anthropic" | "resend" | "google_oauth" | "paddle"
fn get_settings_cache_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Some(d) = dirs::data_local_dir() {
        dirs.push(d.join("businesskit").join("settings"));
    }
    if let Some(d) = dirs::data_dir() {
        dirs.push(d.join("businesskit").join("settings"));
    }
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(std::path::PathBuf::from(&home).join(".businesskit").join("settings"));
    }
    // Android application sandbox paths
    dirs.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop/files/settings"));
    dirs.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop.debug/files/settings"));
    dirs.push(std::path::PathBuf::from("/data/user/0/io.businesskit.desktop/files/settings"));
    dirs.push(std::path::PathBuf::from("/data/user/0/io.businesskit.desktop.debug/files/settings"));
    dirs
}

pub(crate) fn get_secret() -> String {
    let env_secret = std::env::var("ENCRYPTION_SECRET").ok();
    option_env!("ENCRYPTION_SECRET")
        .or(env_secret.as_deref())
        .unwrap_or_default()
        .to_string()
}

#[tauri::command]
pub async fn save_api_key(
    key_name: String,
    key_value: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    let keychain_key = format!("{}.{}", key_name, profile_id);
    let encrypted = crate::vault::encrypt(&key_value, &get_secret(), &keychain_key)
        .map_err(|e| e.to_string())?;

    let mut saved = false;
    for dir in get_settings_cache_dirs() {
        if std::fs::create_dir_all(&dir).is_ok() {
            if std::fs::write(dir.join(format!("{}.dat", keychain_key)), &encrypted).is_ok() {
                saved = true;
            }
        }
    }

    if !saved {
        return Err("Failed to write API key to cache directory".to_string());
    }

    log::info!("API key '{}' stored for profile {}", key_name, profile_id);
    Ok(())
}

/// Retrieve a named API key from the encrypted file cache.
/// Returns None if the key doesn't exist (instead of error).
#[tauri::command]
pub async fn get_api_key(
    key_name: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<String>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    let keychain_key = format!("{}.{}", key_name, profile_id);
    for dir in get_settings_cache_dirs() {
        let path = dir.join(format!("{}.dat", keychain_key));
        if path.exists() {
            if let Ok(encrypted) = std::fs::read_to_string(&path) {
                if let Ok(decrypted) = crate::vault::decrypt(&encrypted, &get_secret(), &keychain_key) {
                    return Ok(Some(decrypted));
                }
            }
        }
    }

    Ok(None)
}

/// Delete a named API key from the encrypted file cache.
#[tauri::command]
pub async fn delete_api_key(
    key_name: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;

    let keychain_key = format!("{}.{}", key_name, profile_id);
    for dir in get_settings_cache_dirs() {
        let _ = std::fs::remove_file(dir.join(format!("{}.dat", keychain_key)));
    }
    Ok(())
}

/// Get the Paddle billing portal URL for the current organization.
/// Returns a short-lived URL — frontend opens it in the system browser.
/// Actual portal is hosted on businesskit.io / Paddle — we just retrieve the URL.
#[tauri::command]
pub async fn get_billing_portal_url(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let org_id = {
        let org = state.organization.read().await;
        org.as_ref()
            .map(|o| o.id.clone())
            .ok_or_else(|| "No organization loaded".to_string())?
    };

    // Billing portal URL pattern — Central DB stores the Paddle customer ID
    // The frontend then opens:  https://businesskit.io/billing?org={org_id}
    // which redirects to the Paddle customer portal.
    Ok(format!("https://businesskit.io/billing?org={}", org_id))
}

fn mask(value: &str) -> String {
    if value.is_empty() {
        return "".into();
    }
    if value.len() <= 8 {
        return "••••••••".into();
    }
    format!("••••••••{}", &value[value.len() - 4..])
}

#[tauri::command]
pub async fn get_central_credentials(
    state: State<'_, Arc<AppState>>,
) -> Result<CentralCredentialsResponse, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let cdb_ref = state.cdb().await.map_err(|e| e.to_string())?;

    let secret = option_env!("ENCRYPTION_SECRET");

    // Fetch userdb
    let (turso_url, turso_token_masked, has_user_db) =
        match cdb_ref.get_userdb_creds_full(&profile_id).await {
            Ok((url, enc_token, _, _)) => {
                let masked = if let Some(sec) = secret {
                    match crate::vault::decrypt(&enc_token, sec, &profile_id) {
                        Ok(raw) => mask(&raw),
                        Err(_) => "••••(decrypt error)".into(),
                    }
                } else {
                    "••••••••".into()
                };
                (url, masked, true)
            }
            Err(_) => ("".into(), "".into(), false),
        };

    // Fetch userauth
    let (workos_client_id, workos_api_key_masked, workos_redirect_uri, has_workos) =
        match cdb_ref.get_userauth_creds(&profile_id).await {
            Ok((client_id, enc_key, redirect_uri)) => {
                let masked = if let Some(sec) = secret {
                    match crate::vault::decrypt(&enc_key, sec, &profile_id) {
                        Ok(raw) => mask(&raw),
                        Err(_) => "••••(decrypt error)".into(),
                    }
                } else {
                    "••••••••".into()
                };
                (client_id, masked, redirect_uri, true)
            }
            Err(_) => ("".into(), "".into(), "".into(), false),
        };

    Ok(CentralCredentialsResponse {
        has_user_db,
        has_workos,
        turso_url,
        turso_token_masked,
        workos_client_id,
        workos_api_key_masked,
        workos_redirect_uri,
    })
}

#[tauri::command]
pub async fn update_turso_creds(
    turso_url: String,
    turso_token: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let cdb_ref = state.cdb().await.map_err(|e| e.to_string())?;

    let raw_url = turso_url.trim().to_string();
    let clean_token = turso_token.trim().to_string();
    let secret = get_secret();

    // Test the connection — use TursoConn (reqwest HTTP, normalizes libsql:// -> https:// internally)
    let conn = crate::db::turso::TursoConn::new(&raw_url, &clean_token);

    // Verify write permissions
    conn.execute("CREATE TABLE IF NOT EXISTS _bk_write_test (id INTEGER)", vec![])
        .await
        .map_err(|e| {
            format!(
                "Database connection test failed (write permission required): {}",
                e
            )
        })?;

    conn.execute("DROP TABLE IF EXISTS _bk_write_test", vec![])
        .await
        .ok(); // Ignore drop errors

    let encrypted = crate::vault::encrypt(&clean_token, &secret, &profile_id)
        .map_err(|e| format!("Encryption error: {}", e))?;

    cdb_ref
        .update_userdb_creds(&profile_id, &raw_url, &encrypted)
        .await
        .map_err(|e| e.to_string())?;

    // Also update local file cache
    let _ = crate::commands::organization::store_in_keychain(&profile_id, &raw_url, &clean_token);

    // Reconnect active UserDb
    if let Ok(user_db) = crate::db::user::UserDb::connect(&raw_url, &clean_token).await {
        *state.user_db.write().await = Some(user_db);
    }

    Ok(())
}

#[tauri::command]
pub async fn update_workos_creds(
    client_id: String,
    api_key: String,
    redirect_uri: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let cdb_ref = state.cdb().await.map_err(|e| e.to_string())?;

    let secret = get_secret();
    let clean_api_key = api_key.trim().to_string();
    let encrypted = crate::vault::encrypt(&clean_api_key, &secret, &profile_id)
        .map_err(|e| format!("Encryption error: {}", e))?;

    let id = uuid::Uuid::new_v4().to_string();
    cdb_ref
        .upsert_userauth_creds(&id, &profile_id, &client_id.trim(), &encrypted, &redirect_uri.trim())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ── User Profile Settings ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSettingsDto {
    pub id: Option<String>,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub profile_picture_url: Option<String>,
    pub bio: Option<String>,
    pub location: Option<String>,
    pub website: Option<String>,
    pub social_links: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserSettingsData {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub profile_picture_url: Option<String>,
    pub bio: Option<String>,
    pub location: Option<String>,
    pub website: Option<String>,
    pub social_links: Option<serde_json::Value>,
}

/// Fetch user profile settings for the currently logged-in user
#[tauri::command]
pub async fn get_user_settings(
    state: State<'_, Arc<AppState>>,
) -> Result<UserSettingsDto, String> {
    let user_id = state.get_current_user_id().await;
    let auth_info = state.auth_session.read().await.clone();

    // 1. Try Central DB
    if let Ok(cdb) = state.cdb().await {
        if let Ok(conn) = cdb.conn() {
            if let Ok(mut rows) = conn
                .query(
                    "SELECT id, email, first_name, last_name, profile_picture_url, bio, location, website, social_links \
                     FROM users WHERE id = ?1 OR workos_id = ?1 LIMIT 1",
                    crate::turso_params![user_id.clone()],
                )
                .await
            {
                if let Ok(Some(row)) = rows.next().await {
                    let social_links_raw: Option<String> = row.get(8).ok();
                    let social_links: Option<serde_json::Value> = social_links_raw
                        .and_then(|s| serde_json::from_str(&s).ok());

                    return Ok(UserSettingsDto {
                        id: row.get(0).ok(),
                        email: row.get(1).ok(),
                        first_name: row.get(2).ok(),
                        last_name: row.get(3).ok(),
                        profile_picture_url: row.get(4).ok(),
                        bio: row.get(5).ok(),
                        location: row.get(6).ok(),
                        website: row.get(7).ok(),
                        social_links,
                    });
                }
            }
        }
    }

    // 2. Try UserDB
    if let Ok(db) = state.require_user_db().await {
        if let Ok(conn) = db.conn() {
            if let Ok(mut rows) = conn
                .query(
                    "SELECT id, email, first_name, last_name, profile_picture_url, bio, location, website, social_links \
                     FROM users WHERE id = ?1 OR workos_id = ?1 LIMIT 1",
                    crate::turso_params![user_id.clone()],
                )
                .await
            {
                if let Ok(Some(row)) = rows.next().await {
                    let social_links_raw: Option<String> = row.get(8).ok();
                    let social_links: Option<serde_json::Value> = social_links_raw
                        .and_then(|s| serde_json::from_str(&s).ok());

                    return Ok(UserSettingsDto {
                        id: row.get(0).ok(),
                        email: row.get(1).ok(),
                        first_name: row.get(2).ok(),
                        last_name: row.get(3).ok(),
                        profile_picture_url: row.get(4).ok(),
                        bio: row.get(5).ok(),
                        location: row.get(6).ok(),
                        website: row.get(7).ok(),
                        social_links,
                    });
                }
            }
        }
    }

    // 3. Fallback to auth_session
    if let Some(session) = auth_info {
        let (first, last) = if let Some(ref name) = session.user.name {
            let parts: Vec<&str> = name.splitn(2, ' ').collect();
            if parts.len() == 2 {
                (Some(parts[0].to_string()), Some(parts[1].to_string()))
            } else {
                (Some(name.clone()), None)
            }
        } else {
            (None, None)
        };

        return Ok(UserSettingsDto {
            id: Some(session.user.id),
            email: Some(session.user.email),
            first_name: first,
            last_name: last,
            profile_picture_url: session.user.avatar_url,
            bio: None,
            location: None,
            website: None,
            social_links: None,
        });
    }

    Ok(UserSettingsDto {
        id: Some(user_id),
        email: None,
        first_name: None,
        last_name: None,
        profile_picture_url: None,
        bio: None,
        location: None,
        website: None,
        social_links: None,
    })
}

/// Update user profile settings
#[tauri::command]
pub async fn update_user_settings(
    data: UpdateUserSettingsData,
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let user_id = state.get_current_user_id().await;
    let auth_info = state.auth_session.read().await.clone();
    let email = auth_info
        .as_ref()
        .map(|a| a.user.email.clone())
        .unwrap_or_else(|| format!("{}@local", user_id));

    let social_links_str = match data.social_links {
        Some(serde_json::Value::String(s)) => s,
        Some(ref v) => serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()),
        None => "{}".to_string(),
    };

    // 1. Update Central DB if available
    if let Ok(cdb) = state.cdb().await {
        if let Ok(conn) = cdb.conn() {
            let _ = conn
                .execute(
                    "UPDATE users SET \
                     first_name = ?1, \
                     last_name = ?2, \
                     profile_picture_url = ?3, \
                     bio = ?4, \
                     location = ?5, \
                     website = ?6, \
                     social_links = ?7, \
                     updated_at = strftime('%s','now') \
                     WHERE id = ?8 OR workos_id = ?8",
                    crate::turso_params![
                        data.first_name.clone(),
                        data.last_name.clone(),
                        data.profile_picture_url.clone(),
                        data.bio.clone(),
                        data.location.clone(),
                        data.website.clone(),
                        social_links_str.clone(),
                        user_id.clone()
                    ],
                )
                .await;
        }
    }

    // 2. Update/Upsert UserDB
    if let Ok(db) = state.require_user_db().await {
        if let Ok(conn) = db.conn() {
            let _ = conn
                .execute(
                    "INSERT INTO users (id, email, first_name, last_name, profile_picture_url, bio, location, website, social_links, created_at, updated_at, is_active) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, strftime('%s','now'), strftime('%s','now'), 1) \
                     ON CONFLICT(id) DO UPDATE SET \
                     first_name = excluded.first_name, \
                     last_name = excluded.last_name, \
                     profile_picture_url = excluded.profile_picture_url, \
                     bio = excluded.bio, \
                     location = excluded.location, \
                     website = excluded.website, \
                     social_links = excluded.social_links, \
                     updated_at = excluded.updated_at",
                    crate::turso_params![
                        user_id.clone(),
                        email,
                        data.first_name.clone(),
                        data.last_name.clone(),
                        data.profile_picture_url.clone(),
                        data.bio.clone(),
                        data.location.clone(),
                        data.website.clone(),
                        social_links_str
                    ],
                )
                .await;
        }
    }

    // 3. Update memory auth session
    {
        let mut session_guard = state.auth_session.write().await;
        if let Some(ref mut session) = *session_guard {
            let full_name = match (&data.first_name, &data.last_name) {
                (Some(f), Some(l)) if !f.is_empty() && !l.is_empty() => format!("{} {}", f, l),
                (Some(f), _) if !f.is_empty() => f.clone(),
                (_, Some(l)) if !l.is_empty() => l.clone(),
                _ => session.user.name.clone().unwrap_or_default(),
            };
            if !full_name.is_empty() {
                session.user.name = Some(full_name);
            }
            if let Some(ref pic) = data.profile_picture_url {
                if !pic.is_empty() {
                    session.user.avatar_url = Some(pic.clone());
                }
            }
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "message": "User settings updated successfully"
    }))
}
