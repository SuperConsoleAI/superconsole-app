//! UserDB Backend — Configuration, Connectivity, Schema Provisioning & Off-Platform Isolation
//!
//! Provides account-level management for the user's personal Turso Cloud database (`userdb`).
//! Configured once per account, it applies across all organizations, workspaces, and projects.
//!
//! ## Off-Platform Toggle (`off_platform`)
//! - Starts greyed out until the user configures their UserDB (URL + token).
//! - When `off_platform = 0`: Standard Central Cloud sync.
//! - When `off_platform = 1`: Real connector credentials and private workflows remain strictly
//!   in `userdb` and `localdb`. Only a stub metadata entry is sent to `centraldb` to get the ULID
//!   id for global identity synchronization.

use crate::cloud::{self, rows, turso_execute, TursoConfig};
use crate::db::Db;
use crate::db::schema::userdb::{get_canonical_user_table_names, USER_SCHEMA_STATEMENTS};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{OnceLock, RwLock};
use std::time::Instant;
use tauri::{Manager, State};

/// In-memory cache holding decrypted Turso configuration in RAM only.
/// The token is stored encrypted on disk in `localdb.userdb` (AES-256-GCM via WORKOS_COOKIE_PASSWORD:user_id).
/// Hot paths (PTY logging, chat session sync, plugin installations, usage events) access the
/// decrypted credentials directly from this RAM cache without disk decryption or CentralDB roundtrips.
static MEMORY_USERDB_CONFIG: OnceLock<RwLock<Option<TursoConfig>>> = OnceLock::new();

fn get_memory_lock() -> &'static RwLock<Option<TursoConfig>> {
    MEMORY_USERDB_CONFIG.get_or_init(|| RwLock::new(None))
}

pub fn clear_memory_userdb_config() {
    if let Ok(mut lock) = get_memory_lock().write() {
        *lock = None;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDbConfig {
    pub url: String,
    pub token_masked: String,
    pub has_token: bool,
    pub off_platform: i64,
    pub is_configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDbTestResult {
    pub success: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDbProvisionResult {
    pub success: bool,
    pub statements_executed: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDbStatus {
    pub is_configured: bool,
    pub off_platform: i64,
    pub is_connected: bool,
    pub latency_ms: Option<u64>,
    pub table_count: usize,
    pub canonical_table_count: usize,
    pub tables: Vec<String>,
    pub error_message: Option<String>,
}

fn mask_token(token: &str) -> String {
    if token.is_empty() {
        return String::new();
    }
    if token.len() >= 8 {
        format!("{}••••{}", &token[..4], &token[token.len() - 4..])
    } else {
        "••••••••".to_string()
    }
}

pub fn resolve_userdb_config(db: &Db) -> Option<TursoConfig> {
    // 1. Fast path: check in-memory RAM cache (decrypted in RAM only)
    if let Ok(lock) = get_memory_lock().read() {
        if let Some(ref cfg) = *lock {
            return Some(cfg.clone());
        }
    }

    let uid = cached_user_id(db).unwrap_or_else(|| "default".to_string());

    // 2. Read from local SQLite userdb table (encrypted on disk)
    if let Some(row) = db.get_userdb_config_row(&uid) {
        if !row.url.trim().is_empty() && !row.token_encrypted.trim().is_empty() {
            let scope_key = if row.user_id.is_empty() { uid.as_str() } else { row.user_id.as_str() };
            let decrypted_token = crate::crypto::decrypt_scoped(&row.token_encrypted, scope_key)
                .or_else(|_| crate::crypto::decrypt(&row.token_encrypted))
                .unwrap_or_default();

            if !decrypted_token.trim().is_empty() {
                let clean_url = row.url
                    .trim()
                    .replacen("libsql://", "https://", 1)
                    .replacen("wss://", "https://", 1);
                let cfg = TursoConfig {
                    url: clean_url,
                    token: decrypted_token.trim().to_string(),
                };
                if let Ok(mut lock) = get_memory_lock().write() {
                    *lock = Some(cfg.clone());
                }
                return Some(cfg);
            }
        }
    }

    // 3. Fallback & migration from legacy settings
    if let Some(raw) = db.get_setting("userdb_url") {
        if let Some(token) = db.get_setting("userdb_token") {
            if !raw.trim().is_empty() && !token.trim().is_empty() {
                let clean_url = raw
                    .trim()
                    .replacen("libsql://", "https://", 1)
                    .replacen("wss://", "https://", 1);
                let cfg = TursoConfig {
                    url: clean_url.clone(),
                    token: token.trim().to_string(),
                };
                // Automatically migrate to encrypted userdb table on disk
                if let Ok(enc) = crate::crypto::encrypt_scoped(token.trim(), &uid) {
                    let off_plat = get_current_off_platform(db);
                    let _ = db.upsert_userdb_config_row(&uid, &clean_url, &enc, off_plat);
                    let _ = db.delete_setting("userdb_token");
                }
                if let Ok(mut lock) = get_memory_lock().write() {
                    *lock = Some(cfg.clone());
                }
                return Some(cfg);
            }
        }
    }

    None
}

fn get_current_off_platform(db: &Db) -> i64 {
    if let Some(val) = db.get_setting("off_platform") {
        if val == "1" {
            return 1;
        } else if val == "0" {
            return 0;
        }
    }
    if let Some(json_str) = db.get_cloud_identity() {
        if let Ok(v) = serde_json::from_str::<Value>(&json_str) {
            return v["user"]["off_platform"].as_i64().unwrap_or(0);
        }
    }
    0
}

fn cached_user_id(db: &Db) -> Option<String> {
    let json_str = db.get_cloud_identity()?;
    let v: Value = serde_json::from_str(&json_str).ok()?;
    v["user"]["id"].as_str().map(|s| s.to_string())
}

#[tauri::command]
pub fn userdb_get_config(db: State<'_, Db>) -> Result<UserDbConfig, String> {
    let uid = cached_user_id(&db).unwrap_or_else(|| "default".to_string());
    let off_platform = get_current_off_platform(&db);

    if let Some(row) = db.get_userdb_config_row(&uid) {
        let has_token = !row.token_encrypted.trim().is_empty();
        let is_configured = !row.url.trim().is_empty() && has_token;
        let token_masked = if has_token {
            let scope_key = if row.user_id.is_empty() { uid.as_str() } else { row.user_id.as_str() };
            let pt = crate::crypto::decrypt_scoped(&row.token_encrypted, scope_key)
                .or_else(|_| crate::crypto::decrypt(&row.token_encrypted))
                .unwrap_or_default();
            mask_token(&pt)
        } else {
            String::new()
        };

        return Ok(UserDbConfig {
            url: row.url,
            token_masked,
            has_token,
            off_platform: row.off_platform,
            is_configured,
        });
    }

    // Fallback to legacy settings
    let url = db.get_setting("userdb_url").unwrap_or_default();
    let token = db.get_setting("userdb_token").unwrap_or_default();
    let has_token = !token.trim().is_empty();
    let is_configured = !url.trim().is_empty() && has_token;

    Ok(UserDbConfig {
        url,
        token_masked: mask_token(&token),
        has_token,
        off_platform,
        is_configured,
    })
}

#[tauri::command]
pub fn userdb_save_config(
    db: State<'_, Db>,
    url: String,
    token: String,
) -> Result<UserDbConfig, String> {
    let trimmed_url = url.trim().to_string();
    let uid = cached_user_id(&db).unwrap_or_else(|| "default".to_string());
    let off_platform = get_current_off_platform(&db);

    let existing = db.get_userdb_config_row(&uid);

    let (token_encrypted, plaintext_token) = if !token.trim().is_empty() {
        let enc = crate::crypto::encrypt_scoped(token.trim(), &uid)
            .map_err(|e| format!("Encryption error: {}", e))?;
        (enc, token.trim().to_string())
    } else if let Some(ref ext) = existing {
        let scope_key = if ext.user_id.is_empty() { uid.as_str() } else { ext.user_id.as_str() };
        let pt = crate::crypto::decrypt_scoped(&ext.token_encrypted, scope_key)
            .or_else(|_| crate::crypto::decrypt(&ext.token_encrypted))
            .unwrap_or_default();
        (ext.token_encrypted.clone(), pt)
    } else {
        ("".to_string(), "".to_string())
    };

    // 1. Save encrypted token on disk in localdb userdb table
    db.upsert_userdb_config_row(&uid, &trimmed_url, &token_encrypted, off_platform)?;

    // 2. Cache decrypted TursoConfig strictly in RAM only
    if !trimmed_url.is_empty() && !plaintext_token.is_empty() {
        let clean_url = trimmed_url
            .replacen("libsql://", "https://", 1)
            .replacen("wss://", "https://", 1);
        let cfg = TursoConfig {
            url: clean_url,
            token: plaintext_token,
        };
        if let Ok(mut lock) = get_memory_lock().write() {
            *lock = Some(cfg);
        }
    } else if trimmed_url.is_empty() || plaintext_token.is_empty() {
        clear_memory_userdb_config();
    }

    // 3. Keep settings in sync for backwards compat URL and clean legacy plaintext token
    let _ = db.set_setting("userdb_url", &trimmed_url);
    let _ = db.delete_setting("userdb_token");

    // 4. Asynchronously push encrypted credentials to CentralDB userdb table
    let uid_clone = uid.clone();
    let url_clone = trimmed_url.clone();
    let token_enc_clone = token_encrypted.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(client) = reqwest::Client::builder().build() {
            if let Ok(central_cfg) = cloud::turso_config() {
                let sql = "INSERT INTO userdb (user_id, url, token_encrypted, off_platform, updated_at) \
                           VALUES (?, ?, ?, ?, datetime('now')) \
                           ON CONFLICT(user_id) DO UPDATE SET \
                           url = excluded.url, \
                           token_encrypted = excluded.token_encrypted, \
                           off_platform = excluded.off_platform, \
                           updated_at = excluded.updated_at";
                let params = vec![
                    Some(uid_clone),
                    Some(url_clone),
                    Some(token_enc_clone),
                    Some(off_platform.to_string()),
                ];
                let _ = turso_execute(&client, &central_cfg, sql, params).await;
            }
        }
    });

    userdb_get_config(db)
}

#[tauri::command]
pub async fn userdb_test_connection(
    db: State<'_, Db>,
    url: Option<String>,
    token: Option<String>,
) -> Result<UserDbTestResult, String> {
    let target_cfg = match (url, token) {
        (Some(u), Some(t)) if !u.trim().is_empty() && !t.trim().is_empty() => {
            let clean_url = u
                .trim()
                .replacen("libsql://", "https://", 1)
                .replacen("wss://", "https://", 1);
            TursoConfig {
                url: clean_url,
                token: t.trim().to_string(),
            }
        }
        _ => resolve_userdb_config(&db).ok_or_else(|| {
            "UserDB is not configured. Please provide a database URL and token.".to_string()
        })?,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let start = Instant::now();
    match turso_execute(&client, &target_cfg, "SELECT 1;", vec![]).await {
        Ok(_) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            Ok(UserDbTestResult {
                success: true,
                latency_ms,
                message: format!("Successfully connected to Turso UserDB ({}ms)", latency_ms),
            })
        }
        Err(e) => Ok(UserDbTestResult {
            success: false,
            latency_ms: 0,
            message: format!("Connection failed: {}", e),
        }),
    }
}

#[tauri::command]
pub async fn userdb_provision(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    url: Option<String>,
    token: Option<String>,
) -> Result<UserDbProvisionResult, String> {
    let target_cfg = match (url, token) {
        (Some(u), Some(t)) if !u.trim().is_empty() && !t.trim().is_empty() => {
            let clean_url = u
                .trim()
                .replacen("libsql://", "https://", 1)
                .replacen("wss://", "https://", 1);
            TursoConfig {
                url: clean_url,
                token: t.trim().to_string(),
            }
        }
        _ => resolve_userdb_config(&db).ok_or_else(|| {
            "UserDB is not configured. Please provide a database URL and token.".to_string()
        })?,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut executed = 0;
    for stmt in USER_SCHEMA_STATEMENTS {
        turso_execute(&client, &target_cfg, stmt, vec![])
            .await
            .map_err(|e| format!("Provisioning failed on statement:\n{}\nErr: {}", stmt, e))?;
        executed += 1;
    }

    // Auto-sync initial state to UserDB
    let _ = execute_userdb_sync_all(&app, &target_cfg).await;

    Ok(UserDbProvisionResult {
        success: true,
        statements_executed: executed,
        message: format!(
            "Successfully provisioned all canonical UserDB tables and indexes ({} statements) and synced current data.",
            executed
        ),
    })
}

#[tauri::command]
pub async fn userdb_set_off_platform(
    db: State<'_, Db>,
    off_platform: i64,
) -> Result<UserDbConfig, String> {
    let uid = cached_user_id(&db).unwrap_or_else(|| "default".to_string());
    let (is_configured, url_val, token_enc_val) = if let Some(row) = db.get_userdb_config_row(&uid) {
        (!row.url.trim().is_empty() && !row.token_encrypted.trim().is_empty(), row.url, row.token_encrypted)
    } else {
        let url = db.get_setting("userdb_url").unwrap_or_default();
        let token = db.get_setting("userdb_token").unwrap_or_default();
        (!url.trim().is_empty() && !token.trim().is_empty(), url, "".to_string())
    };

    if off_platform == 1 && !is_configured {
        return Err(
            "Cannot enable off-platform isolation before configuring your UserDB credentials."
                .to_string(),
        );
    }

    let val_str = if off_platform == 1 { "1" } else { "0" };
    db.set_setting("off_platform", val_str)?;

    // 1. Update localdb userdb table
    if is_configured {
        let _ = db.upsert_userdb_config_row(&uid, &url_val, &token_enc_val, off_platform);
    }

    // 2. Synchronize local cloud_identity cache if present
    if let Some(payload_str) = db.get_cloud_identity() {
        if let Ok(mut v) = serde_json::from_str::<Value>(&payload_str) {
            v["user"]["off_platform"] = json!(off_platform);
            if let Ok(updated_payload) = serde_json::to_string(&v) {
                let _ = db.set_cloud_identity(&updated_payload);
            }
        }
    }

    // 3. Best-effort update centraldb userdb & users tables
    if let Ok(tcfg) = crate::cloud::turso_config() {
        if let Some(user_id_val) = cached_user_id(&db) {
            if let Ok(conn) = crate::cloud::libsql_connect(&tcfg).await {
                let _ = conn.execute(
                    "UPDATE userdb SET off_platform = ?1 WHERE user_id = ?2",
                    libsql::params![off_platform, user_id_val.clone()],
                ).await;
                let _ = conn.execute(
                    "UPDATE users SET off_platform = ?1 WHERE id = ?2",
                    libsql::params![off_platform, user_id_val.clone()],
                ).await;
            }
        }
    }

    // 4. Best-effort update userdb if configured
    if let Some(user_cfg) = resolve_userdb_config(&db) {
        if let Some(user_id_val) = cached_user_id(&db) {
            if let Ok(conn) = crate::cloud::libsql_connect(&user_cfg).await {
                let _ = conn.execute(
                    "UPDATE users SET off_platform = ?1 WHERE id = ?2",
                    libsql::params![off_platform, user_id_val],
                ).await;
            }
        }
    }

    userdb_get_config(db)
}

#[tauri::command]
pub async fn userdb_get_status(db: State<'_, Db>) -> Result<UserDbStatus, String> {
    let canonical = get_canonical_user_table_names();
    let off_platform = get_current_off_platform(&db);

    let Some(cfg) = resolve_userdb_config(&db) else {
        return Ok(UserDbStatus {
            is_configured: false,
            off_platform,
            is_connected: false,
            latency_ms: None,
            table_count: 0,
            canonical_table_count: canonical.len(),
            tables: vec![],
            error_message: None,
        });
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let start = Instant::now();
    match turso_execute(
        &client,
        &cfg,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        vec![],
    )
    .await
    {
        Ok(result) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let tables: Vec<String> = rows(&result)
                .iter()
                .map(|r| cloud::cell_text(r, 0))
                .filter(|s| !s.is_empty())
                .collect();

            Ok(UserDbStatus {
                is_configured: true,
                off_platform,
                is_connected: true,
                latency_ms: Some(latency_ms),
                table_count: tables.len(),
                canonical_table_count: canonical.len(),
                tables,
                error_message: None,
            })
        }
        Err(e) => Ok(UserDbStatus {
            is_configured: true,
            off_platform,
            is_connected: false,
            latency_ms: None,
            table_count: 0,
            canonical_table_count: canonical.len(),
            tables: vec![],
            error_message: Some(e),
        }),
    }
}

// ── Real-time & Bulk Synchronization for UserDB ─────────────────────────────

pub async fn sync_installed_plugin_to_userdb(
    app: &tauri::AppHandle,
    scope: &str,
    scope_id: &str,
    entry: &crate::db::PluginCacheEntry,
) {
    let db = app.state::<Db>();
    let Some(user_cfg) = resolve_userdb_config(&db) else {
        return;
    };
    let client = reqwest::Client::new();
    let id = format!("{}:{}:{}", scope, scope_id, entry.id);
    let sql = "INSERT INTO installed_plugins (
        id, plugin_id, scope, scope_id, installed_at, installed_by, version,
        skills_url, commands_url, agents_url, hooks_url, rules_url, mcp_url,
        skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids
    ) VALUES (
        ?, ?, ?, ?, datetime('now'), '', ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
    ) ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
        skills_url = excluded.skills_url,
        commands_url = excluded.commands_url,
        agents_url = excluded.agents_url,
        hooks_url = excluded.hooks_url,
        rules_url = excluded.rules_url,
        mcp_url = excluded.mcp_url,
        skill_ids = excluded.skill_ids,
        agent_ids = excluded.agent_ids,
        mcp_ids = excluded.mcp_ids,
        command_ids = excluded.command_ids,
        hook_ids = excluded.hook_ids,
        rule_ids = excluded.rule_ids,
        connector_ids = excluded.connector_ids";

    let params = vec![
        Some(id),
        Some(entry.id.clone()),
        Some(scope.to_string()),
        Some(scope_id.to_string()),
        Some(entry.version.clone()),
        Some(entry.skills_url.clone().unwrap_or_else(|| "[]".into())),
        Some(entry.commands_url.clone().unwrap_or_else(|| "[]".into())),
        Some(entry.agents_url.clone().unwrap_or_else(|| "[]".into())),
        Some(entry.hooks_url.clone().unwrap_or_else(|| "[]".into())),
        Some(entry.rules_url.clone().unwrap_or_else(|| "[]".into())),
        Some(entry.mcp_url.clone().unwrap_or_else(|| "[]".into())),
        Some(entry.skill_ids.clone()),
        Some(entry.agent_ids.clone()),
        Some(entry.mcp_ids.clone()),
        Some(entry.command_ids.clone()),
        Some(entry.hook_ids.clone()),
        Some(entry.rule_ids.clone()),
        Some(entry.connector_ids.clone()),
    ];

    let _ = turso_execute(&client, &user_cfg, sql, params).await;
}

pub async fn delete_installed_plugin_from_userdb(
    app: &tauri::AppHandle,
    scope: &str,
    scope_id: &str,
    plugin_id: &str,
) {
    let db = app.state::<Db>();
    let Some(user_cfg) = resolve_userdb_config(&db) else {
        return;
    };
    let client = reqwest::Client::new();
    let _ = turso_execute(
        &client,
        &user_cfg,
        "DELETE FROM installed_plugins WHERE scope = ? AND scope_id = ? AND plugin_id = ?",
        vec![
            Some(scope.to_string()),
            Some(scope_id.to_string()),
            Some(plugin_id.to_string()),
        ],
    )
    .await;
}

pub async fn sync_session_to_userdb(app: &tauri::AppHandle, session_id: &str) {
    let db = app.state::<Db>();
    let Some(row) = db.get_session_for_userdb(session_id) else {
        return;
    };

    let Some(user_cfg) = resolve_userdb_config(&db) else {
        return;
    };
    let client = reqwest::Client::new();
    let sql = "INSERT INTO session_history (
        id, workspace_id, project_id, session_id, cli, label, job_id,
        tokens_prompt, tokens_completion, tokens_reasoning, cost_usd,
        model, provider, last_output, agent_id, user_id,
        rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m,
        machine_id, started_at, ended_at, created_at, updated_at
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, datetime('now'), datetime('now')
    ) ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        project_id = excluded.project_id,
        cli = excluded.cli,
        label = excluded.label,
        job_id = excluded.job_id,
        tokens_prompt = excluded.tokens_prompt,
        tokens_completion = excluded.tokens_completion,
        tokens_reasoning = excluded.tokens_reasoning,
        cost_usd = excluded.cost_usd,
        model = excluded.model,
        provider = excluded.provider,
        last_output = excluded.last_output,
        agent_id = excluded.agent_id,
        user_id = excluded.user_id,
        rate_prompt_per_1m = excluded.rate_prompt_per_1m,
        rate_cached_per_1m = excluded.rate_cached_per_1m,
        rate_completion_per_1m = excluded.rate_completion_per_1m,
        rate_reasoning_per_1m = excluded.rate_reasoning_per_1m,
        machine_id = excluded.machine_id,
        ended_at = excluded.ended_at,
        updated_at = datetime('now')";

    let params = vec![
        Some(row.id),
        row.workspace_id,
        Some(row.project_id),
        Some(row.session_id),
        Some(row.cli),
        row.label,
        row.job_id,
        Some(row.tokens_prompt.to_string()),
        Some(row.tokens_completion.to_string()),
        Some(row.tokens_reasoning.to_string()),
        Some(row.cost_usd.to_string()),
        Some(row.model),
        Some(row.provider),
        Some(row.last_output),
        row.agent_id,
        row.user_id,
        Some(row.rate_prompt_per_1m.to_string()),
        Some(row.rate_cached_per_1m.to_string()),
        Some(row.rate_completion_per_1m.to_string()),
        Some(row.rate_reasoning_per_1m.to_string()),
        row.machine_id,
        Some(row.started_at),
        row.ended_at,
    ];

    let _ = turso_execute(&client, &user_cfg, sql, params).await;
}

pub async fn delete_session_from_userdb(app: &tauri::AppHandle, session_id: &str) {
    let db = app.state::<Db>();
    let _ = db.delete_local_session_history(session_id);
    let Some(user_cfg) = resolve_userdb_config(&db) else {
        return;
    };
    let client = reqwest::Client::new();
    let _ = turso_execute(
        &client,
        &user_cfg,
        "DELETE FROM session_history WHERE session_id = ? OR id = ?",
        vec![Some(session_id.to_string()), Some(session_id.to_string())],
    )
    .await;
}

pub async fn sync_chat_session_to_userdb(app: &tauri::AppHandle, session_id: &str) {
    let db = app.state::<Db>();
    let Some(row) = db.get_chat_session_for_userdb(session_id) else {
        return;
    };

    let Some(user_cfg) = resolve_userdb_config(&db) else {
        return;
    };
    let client = reqwest::Client::new();
    let sql = "INSERT INTO chat_sessions (
        id, workspace_id, project_id, name, is_star,
        tokens_prompt, tokens_completion, tokens_reasoning, cost_usd,
        model, provider, agent_id, user_id,
        rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m,
        created_at, updated_at
    ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
    ) ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        project_id = excluded.project_id,
        name = excluded.name,
        is_star = excluded.is_star,
        tokens_prompt = excluded.tokens_prompt,
        tokens_completion = excluded.tokens_completion,
        tokens_reasoning = excluded.tokens_reasoning,
        cost_usd = excluded.cost_usd,
        model = excluded.model,
        provider = excluded.provider,
        agent_id = excluded.agent_id,
        user_id = excluded.user_id,
        rate_prompt_per_1m = excluded.rate_prompt_per_1m,
        rate_cached_per_1m = excluded.rate_cached_per_1m,
        rate_completion_per_1m = excluded.rate_completion_per_1m,
        rate_reasoning_per_1m = excluded.rate_reasoning_per_1m,
        updated_at = excluded.updated_at";

    let params = vec![
        Some(row.id),
        row.workspace_id,
        Some(row.project_id),
        row.name,
        Some(row.is_star.to_string()),
        Some(row.tokens_prompt.to_string()),
        Some(row.tokens_completion.to_string()),
        Some(row.tokens_reasoning.to_string()),
        Some(row.cost_usd.to_string()),
        Some(row.model),
        Some(row.provider),
        row.agent_id,
        row.user_id,
        Some(row.rate_prompt_per_1m.to_string()),
        Some(row.rate_cached_per_1m.to_string()),
        Some(row.rate_completion_per_1m.to_string()),
        Some(row.rate_reasoning_per_1m.to_string()),
        Some(row.created_at),
        Some(row.updated_at),
    ];

    let _ = turso_execute(&client, &user_cfg, sql, params).await;
}

pub async fn delete_chat_session_from_userdb(app: &tauri::AppHandle, session_id: &str) {
    let db = app.state::<Db>();
    let _ = db.delete_local_chat_session(session_id);
    let Some(user_cfg) = resolve_userdb_config(&db) else {
        return;
    };
    let client = reqwest::Client::new();
    let _ = turso_execute(
        &client,
        &user_cfg,
        "DELETE FROM chat_sessions WHERE id = ?",
        vec![Some(session_id.to_string())],
    )
    .await;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDbSyncStats {
    pub success: bool,
    pub installed_plugins_synced: usize,
    pub session_history_synced: usize,
    pub chat_sessions_synced: usize,
    pub usage_rows_synced: usize,
    pub message: String,
}

pub async fn execute_userdb_sync_all(
    app: &tauri::AppHandle,
    cfg: &TursoConfig,
) -> Result<UserDbSyncStats, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let db = app.state::<Db>();

    // 1. Ensure the 4 usage tables exist on UserDB
    crate::usage::ensure_usage_tables(&client, cfg).await?;

    // 2. Sync all installed_plugins
    let mut plugins_synced = 0;
    let installed = db.list_all_installed_plugins_raw();
    for p in &installed {
        let sql = "INSERT INTO installed_plugins (
            id, plugin_id, scope, scope_id, installed_at, installed_by, version,
            skills_url, commands_url, agents_url, hooks_url, rules_url, mcp_url,
            skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?
        ) ON CONFLICT(id) DO UPDATE SET
            version = excluded.version,
            skills_url = excluded.skills_url,
            commands_url = excluded.commands_url,
            agents_url = excluded.agents_url,
            hooks_url = excluded.hooks_url,
            rules_url = excluded.rules_url,
            mcp_url = excluded.mcp_url,
            skill_ids = excluded.skill_ids,
            agent_ids = excluded.agent_ids,
            mcp_ids = excluded.mcp_ids,
            command_ids = excluded.command_ids,
            hook_ids = excluded.hook_ids,
            rule_ids = excluded.rule_ids,
            connector_ids = excluded.connector_ids";

        let params = vec![
            Some(p.id.clone()),
            Some(p.plugin_id.clone()),
            Some(p.scope.clone()),
            Some(p.scope_id.clone()),
            Some(p.installed_at.clone()),
            Some(p.installed_by.clone()),
            Some(p.version.clone()),
            Some(p.skills_url.clone()),
            Some(p.commands_url.clone()),
            Some(p.agents_url.clone()),
            Some(p.hooks_url.clone()),
            Some(p.rules_url.clone()),
            Some(p.mcp_url.clone()),
            Some(p.skill_ids.clone()),
            Some(p.agent_ids.clone()),
            Some(p.mcp_ids.clone()),
            Some(p.command_ids.clone()),
            Some(p.hook_ids.clone()),
            Some(p.rule_ids.clone()),
            Some(p.connector_ids.clone()),
        ];
        if turso_execute(&client, cfg, sql, params).await.is_ok() {
            plugins_synced += 1;
        }
    }

    // 3. Sync all session_history
    let mut sessions_synced = 0;
    let sessions = db.list_all_sessions_for_userdb();
    for s in &sessions {
        let sql = "INSERT INTO session_history (
            id, workspace_id, project_id, session_id, cli, label, job_id,
            tokens_prompt, tokens_completion, tokens_reasoning, cost_usd,
            model, provider, last_output, agent_id, user_id,
            rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m,
            machine_id, started_at, ended_at, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, datetime('now'), datetime('now')
        ) ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            project_id = excluded.project_id,
            cli = excluded.cli,
            label = excluded.label,
            job_id = excluded.job_id,
            tokens_prompt = excluded.tokens_prompt,
            tokens_completion = excluded.tokens_completion,
            tokens_reasoning = excluded.tokens_reasoning,
            cost_usd = excluded.cost_usd,
            model = excluded.model,
            provider = excluded.provider,
            last_output = excluded.last_output,
            agent_id = excluded.agent_id,
            user_id = excluded.user_id,
            rate_prompt_per_1m = excluded.rate_prompt_per_1m,
            rate_cached_per_1m = excluded.rate_cached_per_1m,
            rate_completion_per_1m = excluded.rate_completion_per_1m,
            rate_reasoning_per_1m = excluded.rate_reasoning_per_1m,
            machine_id = excluded.machine_id,
            ended_at = excluded.ended_at,
            updated_at = datetime('now')";

        let params = vec![
            Some(s.id.clone()),
            s.workspace_id.clone(),
            Some(s.project_id.clone()),
            Some(s.session_id.clone()),
            Some(s.cli.clone()),
            s.label.clone(),
            s.job_id.clone(),
            Some(s.tokens_prompt.to_string()),
            Some(s.tokens_completion.to_string()),
            Some(s.tokens_reasoning.to_string()),
            Some(s.cost_usd.to_string()),
            Some(s.model.clone()),
            Some(s.provider.clone()),
            Some(s.last_output.clone()),
            s.agent_id.clone(),
            s.user_id.clone(),
            Some(s.rate_prompt_per_1m.to_string()),
            Some(s.rate_cached_per_1m.to_string()),
            Some(s.rate_completion_per_1m.to_string()),
            Some(s.rate_reasoning_per_1m.to_string()),
            s.machine_id.clone(),
            Some(s.started_at.clone()),
            s.ended_at.clone(),
        ];
        if turso_execute(&client, cfg, sql, params).await.is_ok() {
            sessions_synced += 1;
        }
    }

    // 4. Sync all chat_sessions
    let mut chats_synced = 0;
    let chats = db.list_all_chat_sessions_for_userdb();
    for c in &chats {
        let sql = "INSERT INTO chat_sessions (
            id, workspace_id, project_id, name, is_star,
            tokens_prompt, tokens_completion, tokens_reasoning, cost_usd,
            model, provider, agent_id, user_id,
            rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m,
            created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?
        ) ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            project_id = excluded.project_id,
            name = excluded.name,
            is_star = excluded.is_star,
            tokens_prompt = excluded.tokens_prompt,
            tokens_completion = excluded.tokens_completion,
            tokens_reasoning = excluded.tokens_reasoning,
            cost_usd = excluded.cost_usd,
            model = excluded.model,
            provider = excluded.provider,
            agent_id = excluded.agent_id,
            user_id = excluded.user_id,
            rate_prompt_per_1m = excluded.rate_prompt_per_1m,
            rate_cached_per_1m = excluded.rate_cached_per_1m,
            rate_completion_per_1m = excluded.rate_completion_per_1m,
            rate_reasoning_per_1m = excluded.rate_reasoning_per_1m,
            updated_at = excluded.updated_at";

        let params = vec![
            Some(c.id.clone()),
            c.workspace_id.clone(),
            Some(c.project_id.clone()),
            c.name.clone(),
            Some(c.is_star.to_string()),
            Some(c.tokens_prompt.to_string()),
            Some(c.tokens_completion.to_string()),
            Some(c.tokens_reasoning.to_string()),
            Some(c.cost_usd.to_string()),
            Some(c.model.clone()),
            Some(c.provider.clone()),
            c.agent_id.clone(),
            c.user_id.clone(),
            Some(c.rate_prompt_per_1m.to_string()),
            Some(c.rate_cached_per_1m.to_string()),
            Some(c.rate_completion_per_1m.to_string()),
            Some(c.rate_reasoning_per_1m.to_string()),
            Some(c.created_at.clone()),
            Some(c.updated_at.clone()),
        ];
        if turso_execute(&client, cfg, sql, params).await.is_ok() {
            chats_synced += 1;
        }
    }

    // 5. Sync the 4 usage tables
    let mut usage_synced = 0;
    for tbl in ["project_usage", "org_usage", "account_usage", "user_usage"] {
        let rows = db.list_usage_rows(tbl);
        for row in rows {
            if crate::usage::write_cloud_row(&client, cfg, tbl, &row).await.is_ok() {
                usage_synced += 1;
            }
        }
    }

    Ok(UserDbSyncStats {
        success: true,
        installed_plugins_synced: plugins_synced,
        session_history_synced: sessions_synced,
        chat_sessions_synced: chats_synced,
        usage_rows_synced: usage_synced,
        message: format!(
            "Synced {} plugins, {} CLI sessions, {} chat sessions, and {} usage records to UserDB.",
            plugins_synced, sessions_synced, chats_synced, usage_synced
        ),
    })
}

#[tauri::command]
pub async fn userdb_sync_all(
    app: tauri::AppHandle,
    db: State<'_, Db>,
) -> Result<UserDbSyncStats, String> {
    let cfg = resolve_userdb_config(&db).ok_or_else(|| {
        "UserDB is not configured. Please configure your UserDB credentials first.".to_string()
    })?;
    execute_userdb_sync_all(&app, &cfg).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_mask_token() {
        assert_eq!(mask_token(""), "");
        assert_eq!(mask_token("short"), "••••••••");
        assert_eq!(mask_token("12345678"), "1234••••5678");
        assert_eq!(mask_token("eyJh1234567890"), "eyJh••••7890");
    }

    #[test]
    fn test_userdb_schema_contains_required_tables() {
        let conn = Connection::open_in_memory().unwrap();
        for stmt in USER_SCHEMA_STATEMENTS {
            conn.execute_batch(stmt).unwrap();
        }

        // Must include installed_plugins, session_history, chat_sessions, project_agents
        let required_specific_tables = [
            "installed_plugins",
            "session_history",
            "chat_sessions",
            "project_agents",
        ];
        for t in required_specific_tables {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [t],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(exists, "UserDB must contain table '{}'", t);
        }

        // Must NOT include chat_messages or legacy connectors
        for excluded in &["chat_messages", "connectors"] {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [excluded],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(!exists, "UserDB should NOT contain '{}'", excluded);
        }

        // Must also include the 4 usage tables
        let required_usage_tables = [
            "project_usage",
            "org_usage",
            "account_usage",
            "user_usage",
        ];
        for t in required_usage_tables {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [t],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(exists, "UserDB must contain usage table '{}'", t);
        }
    }

    #[test]
    fn test_userdb_local_helpers() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::localdb::provision_local_database(&conn).unwrap();
        let db = Db(std::sync::Mutex::new(conn));

        // 1. Test local session and chat deletion helpers
        assert!(db.delete_local_session_history("sid_01").is_ok());
        assert!(db.delete_local_chat_session("chat_01").is_ok());

        // 3. Test usage row put & list
        let usage_row = serde_json::json!({
            "id": "proj_01",
            "tokens_prompt_lifetime": 1000,
            "tokens_prompt_cached_lifetime": 200,
            "tokens_completion_lifetime": 500,
            "tokens_reasoning_lifetime": 100,
            "cost_lifetime_usd": 0.05,
            "sessions_lifetime": 2,
            "cache_hits_lifetime": 1,
            "analytics_lifetime": {},
            "usage_24h": [],
            "usage_7d": [],
            "usage_30d": [],
            "usage_12m": [],
            "by_model": {},
            "by_provider": {},
            "by_cli": {},
            "by_member": {},
            "by_project": {},
            "by_org": {},
            "heatmap_365d": {},
        });
        assert!(db.put_usage_row("project_usage", &usage_row).is_ok());
        let list = db.list_usage_rows("project_usage");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["id"], "proj_01");

        // 4. Test UserDB config row encrypted storage & RAM cache
        let enc_token = crate::crypto::encrypt_scoped("my-secret-turso-token", "default").unwrap();
        assert!(db.upsert_userdb_config_row("default", "libsql://my-userdb.turso.io", &enc_token, 1).is_ok());

        let cfg_row = db.get_userdb_config_row("default").expect("row must exist");
        assert_eq!(cfg_row.url, "libsql://my-userdb.turso.io");
        assert_eq!(cfg_row.token_encrypted, enc_token);
        assert_eq!(cfg_row.off_platform, 1);

        // Resolve config: decrypts into RAM cache
        clear_memory_userdb_config();
        let resolved = resolve_userdb_config(&db).expect("must resolve config");
        assert_eq!(resolved.url, "https://my-userdb.turso.io");
        assert_eq!(resolved.token, "my-secret-turso-token");

        // Verify it is cached in RAM
        let cached = get_memory_lock().read().unwrap().clone().expect("must be in RAM");
        assert_eq!(cached.token, "my-secret-turso-token");
    }

    #[test]
    fn test_chat_and_session_workspace_id_integration() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::localdb::provision_local_database(&conn).unwrap();

        // 1. Insert a workspace with project_id 'proj_alpha' and id 42
        conn.execute(
            "INSERT INTO workspaces (id, name, path, project_id) VALUES (42, 'Alpha Workspace', '/tmp/alpha', 'proj_alpha')",
            [],
        ).unwrap();

        let db = Db(std::sync::Mutex::new(conn));

        // 2. Insert session_history linked to workspace 42
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO session_history (workspace_id, project_id, session_id, cli, model, provider)
                 VALUES (42, 'proj_alpha', 'sess_01', 'claude', 'claude-3-5', 'anthropic')",
                [],
            ).unwrap();
        }

        // 3. Verify get_session_for_userdb and list_all_sessions_for_userdb retrieve workspace_id = "42"
        let s_row = db.get_session_for_userdb("sess_01").expect("session row must exist");
        assert_eq!(s_row.workspace_id, Some("42".to_string()));
        assert_eq!(s_row.project_id, "proj_alpha");

        let all_sessions = db.list_all_sessions_for_userdb();
        assert!(!all_sessions.is_empty());
        assert_eq!(all_sessions[0].workspace_id, Some("42".to_string()));

        // 4. Create chat_session via db helper — it should auto-resolve workspace_id 42 from proj_alpha
        let chat = db.create_chat_session("proj_alpha").expect("must create chat session");
        assert_eq!(chat.project_id, "proj_alpha");
        assert_eq!(chat.workspace_id, Some(42));

        // 5. Query chat session list
        let chats = db.list_chat_sessions("proj_alpha").expect("must list chats");
        assert_eq!(chats.len(), 1);
        assert_eq!(chats[0].workspace_id, Some(42));

        // 6. Verify UserDB extraction row includes workspace_id = "42"
        let c_row = db.get_chat_session_for_userdb(&chat.id).expect("chat row must exist");
        assert_eq!(c_row.workspace_id, Some("42".to_string()));
        assert_eq!(c_row.project_id, "proj_alpha");

        let all_chats = db.list_all_chat_sessions_for_userdb();
        assert_eq!(all_chats.len(), 1);
        assert_eq!(all_chats[0].workspace_id, Some("42".to_string()));

        // 7. Verify deletion
        assert!(db.delete_local_chat_session(&chat.id).is_ok());
        assert!(db.get_chat_session_for_userdb(&chat.id).is_none());
        assert!(db.delete_local_session_history("sess_01").is_ok());
        assert!(db.get_session_for_userdb("sess_01").is_none());
    }
}


