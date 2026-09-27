use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalProfile {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub label: Option<String>,
    pub service: String,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub external_profile_id: Option<String>,
    pub url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub webhook_url: Option<String>,
    pub mcp_server_url: Option<String>,
    pub provider: Option<String>,
    pub scopes: Option<String>,
    pub email: Option<String>,
    pub extra: String,
    pub is_active: bool,
    pub is_verified: bool,
    pub last_verified_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn connection_from_row(row: &crate::db::turso::TursoRow) -> Result<ConnectionRow, String> {
    Ok(ConnectionRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        name: row.get(2).map_err(|e| e.to_string())?,
        label: row.get(3).unwrap_or(None),
        service: row.get(4).map_err(|e| e.to_string())?,
        client_id: row.get(5).unwrap_or(None),
        client_secret: row.get(6).unwrap_or(None),
        access_token: row.get(7).unwrap_or(None),
        refresh_token: row.get(8).unwrap_or(None),
        token_expires_at: row.get(9).unwrap_or(None),
        external_profile_id: row.get(10).unwrap_or(None),
        url: row.get(11).unwrap_or(None),
        username: row.get(12).unwrap_or(None),
        password: row.get(13).unwrap_or(None),
        webhook_url: row.get(14).unwrap_or(None),
        mcp_server_url: row.get(15).unwrap_or(None),
        provider: row.get(16).unwrap_or(None),
        scopes: row.get(17).unwrap_or(None),
        email: row.get(18).unwrap_or(None),
        extra: row.get(19).unwrap_or("{}".to_string()),
        is_active: row.get::<i64>(20).unwrap_or(1) != 0,
        is_verified: row.get::<i64>(21).unwrap_or(0) != 0,
        last_verified_at: row.get(22).unwrap_or(None),
        last_error: row.get(23).unwrap_or(None),
        created_at: row.get(24).map_err(|e| e.to_string())?,
        updated_at: row.get(25).map_err(|e| e.to_string())?,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateConnectionData {
    pub name: String,
    pub label: Option<String>,
    pub service: String,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub external_profile_id: Option<String>,
    pub url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub webhook_url: Option<String>,
    pub mcp_server_url: Option<String>,
    pub provider: Option<String>,
    pub scopes: Option<String>,
    pub email: Option<String>,
    pub extra: Option<String>,
}

#[tauri::command]
pub async fn list_connections(
    service: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ConnectionRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = if service.is_some() {
        "SELECT id, profile_id, name, label, service, client_id, client_secret, access_token, 
                refresh_token, token_expires_at, external_profile_id, url, username, password, 
                webhook_url, mcp_server_url, provider, scopes, email, extra, is_active, 
                is_verified, last_verified_at, last_error, created_at, updated_at
         FROM connections 
         WHERE (profile_id = ?1 OR profile_id = '' OR profile_id IS NULL) AND LOWER(service) = LOWER(?2)
         ORDER BY updated_at DESC, created_at DESC"
    } else {
        "SELECT id, profile_id, name, label, service, client_id, client_secret, access_token, 
                refresh_token, token_expires_at, external_profile_id, url, username, password, 
                webhook_url, mcp_server_url, provider, scopes, email, extra, is_active, 
                is_verified, last_verified_at, last_error, created_at, updated_at
         FROM connections 
         WHERE profile_id = ?1 OR profile_id = '' OR profile_id IS NULL
         ORDER BY updated_at DESC, created_at DESC"
    };

    let mut rows = if let Some(s) = service {
        conn.query(sql, crate::turso_params![profile_id, s])
            .await
            .map_err(|e| e.to_string())?
    } else {
        conn.query(sql, crate::turso_params![profile_id])
            .await
            .map_err(|e| e.to_string())?
    };

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(connection_from_row(&row)?);
    }

    Ok(items)
}

#[tauri::command]
pub async fn create_connection(
    data: CreateConnectionData,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO connections (
            id, profile_id, name, label, service, client_id, client_secret, access_token, 
            refresh_token, token_expires_at, external_profile_id, url, username, password, 
            webhook_url, mcp_server_url, provider, scopes, email, extra, is_active, 
            is_verified, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, 1, 0,
            strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')
        )",
        crate::turso_params![
            id.clone(),
            profile_id,
            data.name,
            data.label,
            data.service,
            data.client_id,
            data.client_secret,
            data.access_token,
            data.refresh_token,
            data.token_expires_at,
            data.external_profile_id,
            data.url,
            data.username,
            data.password,
            data.webhook_url,
            data.mcp_server_url,
            data.provider,
            data.scopes,
            data.email,
            data.extra.unwrap_or("{}".to_string())
        ],
    ).await.map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn update_connection(
    id: String,
    data: CreateConnectionData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE connections SET
            name = ?1, label = ?2, service = ?3, client_id = ?4, client_secret = ?5,
            access_token = ?6, refresh_token = ?7, token_expires_at = ?8,
            external_profile_id = ?9, url = ?10, username = ?11, password = ?12,
            webhook_url = ?13, mcp_server_url = ?14, provider = ?15, scopes = ?16,
            email = ?17, extra = ?18, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE id = ?19 AND profile_id = ?20",
        crate::turso_params![
            data.name,
            data.label,
            data.service,
            data.client_id,
            data.client_secret,
            data.access_token,
            data.refresh_token,
            data.token_expires_at,
            data.external_profile_id,
            data.url,
            data.username,
            data.password,
            data.webhook_url,
            data.mcp_server_url,
            data.provider,
            data.scopes,
            data.email,
            data.extra.unwrap_or("{}".to_string()),
            id,
            profile_id
        ],
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_connection(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM connections WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn fetch_external_profiles(
    service: String,
    api_key: String,
    _state: State<'_, Arc<AppState>>,
) -> Result<Vec<ExternalProfile>, String> {
    if service == "zernio" {
        let client = crate::db::turso::create_shared_http_client();
        let resp = client
            .get("https://api.zernio.com/v1/profiles")
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Zernio profiles: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("Zernio API error ({}): {}", status, err_text));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut result = Vec::new();

        // Handle various response structures as done in webapp
        if let Some(arr) = json.get("profiles").and_then(|v| v.as_array()) {
            for item in arr {
                if let (Some(id), Some(name)) = (
                    item.get("_id").and_then(|v| v.as_str()),
                    item.get("name").and_then(|v| v.as_str()),
                ) {
                    result.push(ExternalProfile {
                        id: id.to_string(),
                        name: name.to_string(),
                    });
                }
            }
        } else if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
            for item in arr {
                if let (Some(id), Some(name)) = (
                    item.get("_id").and_then(|v| v.as_str()),
                    item.get("name").and_then(|v| v.as_str()),
                ) {
                    result.push(ExternalProfile {
                        id: id.to_string(),
                        name: name.to_string(),
                    });
                }
            }
        } else if let Some(arr) = json.as_array() {
            for item in arr {
                if let (Some(id), Some(name)) = (
                    item.get("_id").and_then(|v| v.as_str()),
                    item.get("name").and_then(|v| v.as_str()),
                ) {
                    result.push(ExternalProfile {
                        id: id.to_string(),
                        name: name.to_string(),
                    });
                }
            }
        }

        return Ok(result);
    }

    if service == "webflow" {
        let client = crate::db::turso::create_shared_http_client();
        let resp = client
            .get("https://api.webflow.com/v2/sites")
            .header("Authorization", format!("Bearer {}", api_key.trim()))
            .header("User-Agent", "BusinessKitApp/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Webflow sites: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("Webflow API error ({}): {}", status, err_text));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut result = Vec::new();

        if let Some(arr) = json.get("sites").and_then(|v| v.as_array()) {
            for item in arr {
                let id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                let name = item
                    .get("displayName")
                    .or_else(|| item.get("name"))
                    .or_else(|| item.get("shortName"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(id);

                if !id.is_empty() {
                    result.push(ExternalProfile {
                        id: id.to_string(),
                        name: name.to_string(),
                    });
                }
            }
        }
        return Ok(result);
    }

    Ok(vec![])
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterModelInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub context_length: Option<u64>,
    pub prompt_price: Option<f64>,
    pub completion_price: Option<f64>,
    pub price_formatted: String,
    pub created: Option<i64>,
    pub is_recent: bool,
}

#[tauri::command]
pub async fn fetch_openrouter_models(
    api_key: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<OpenRouterModelInfo>, String> {
    let mut key = api_key.unwrap_or_default().trim().to_string();

    if key.is_empty() {
        if let Ok(profile_id) = state.require_profile().await {
            if let Ok(db) = state.require_user_db().await {
                if let Ok(conn) = db.conn() {
                    let q = "SELECT client_secret, access_token, client_id FROM connections \
                             WHERE profile_id = ?1 AND service = 'openrouter' AND is_active = 1 \
                             ORDER BY created_at DESC LIMIT 1";
                    if let Ok(mut rows) = conn.query(q, crate::turso_params![profile_id]).await {
                        if let Ok(Some(row)) = rows.next().await {
                            let secret: Option<String> = row.get(0).unwrap_or(None);
                            let token: Option<String> = row.get(1).unwrap_or(None);
                            let client_id: Option<String> = row.get(2).unwrap_or(None);
                            if let Some(s) = secret.or(token).or(client_id).filter(|s| !s.trim().is_empty()) {
                                key = s.trim().to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    let client = crate::db::turso::create_shared_http_client();
    let mut req = client
        .get("https://openrouter.ai/api/v1/models")
        .header("User-Agent", "BusinessKitApp/1.0")
        .header("HTTP-Referer", "https://businesskit.io")
        .header("X-Title", "BusinessKit");

    if !key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", key));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Failed to reach OpenRouter API: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenRouter API error ({}): {}", status, err_text));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    let now_ts = chrono::Utc::now().timestamp();
    // 6 months in seconds ~ 180 days
    let six_months_ago = now_ts - (180 * 86400);

    let allowed_prefixes = [
        "anthropic/", "google/", "openai/", "deepseek/", "meta-llama/", 
        "mistralai/", "qwen/", "x-ai/", "cohere/", "microsoft/", "nvidia/", "amazon/"
    ];

    if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
        for item in data {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            if id.is_empty() {
                continue;
            }

            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(&id)
                .to_string();

            let description = item
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let context_length = item
                .get("context_length")
                .and_then(|v| v.as_u64());

            let created = item
                .get("created")
                .and_then(|v| v.as_i64());

            // Check if model is recent (created within 6 months) or is a primary flagship
            let is_recent = created.map(|c| c >= six_months_ago).unwrap_or(false);

            // Filter relevance: only keep models from major providers or recent models
            let is_top_provider = allowed_prefixes.iter().any(|prefix| id.starts_with(prefix));
            
            // Skip obscure/test models or models without top provider affiliation unless they're recent
            if !is_top_provider && !is_recent {
                continue;
            }

            // Pricing extraction
            let mut prompt_price = None;
            let mut completion_price = None;
            let mut price_formatted = String::from("Free");

            if let Some(pricing) = item.get("pricing") {
                let p_str = pricing.get("prompt").and_then(|v| v.as_str()).unwrap_or("0");
                let c_str = pricing.get("completion").and_then(|v| v.as_str()).unwrap_or("0");

                let p_val: f64 = p_str.parse().unwrap_or(0.0) * 1_000_000.0;
                let c_val: f64 = c_str.parse().unwrap_or(0.0) * 1_000_000.0;

                prompt_price = Some(p_val);
                completion_price = Some(c_val);

                if p_val > 0.0 || c_val > 0.0 {
                    if p_val < 0.05 && c_val < 0.05 {
                        price_formatted = format!("${:.3} / ${:.3} (1M)", p_val, c_val);
                    } else {
                        price_formatted = format!("${:.2} / ${:.2} (1M)", p_val, c_val);
                    }
                }
            }

            result.push(OpenRouterModelInfo {
                id,
                name,
                description,
                context_length,
                prompt_price,
                completion_price,
                price_formatted,
                created,
                is_recent,
            });
        }
    }

    // Sort: recent models and popular models first
    result.sort_by(|a, b| {
        let a_created = a.created.unwrap_or(0);
        let b_created = b.created.unwrap_or(0);
        b_created.cmp(&a_created)
    });

    Ok(result)
}
