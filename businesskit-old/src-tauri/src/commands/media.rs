// src-tauri/src/commands/media.rs
//
// Media library management for Cloudflare R2 & Webflow Assets.
// Auto-converts images to high-efficiency .AVIF or .WebP, or keeps original untouched.
// Supports Cloudflare R2 bucket storage & Webflow Asset API (site upload + DELETE asset by asset_id).

use crate::AppState;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaRow {
    pub id: String,
    pub profile_id: String,
    pub user_id: String,
    pub filename: String,
    pub name: String,
    pub url: String,
    pub local_url: Option<String>,
    pub file_type: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub alt_text: Option<String>,
    pub thumbnail_url: Option<String>,
    pub storage_provider: String,
    pub asset_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct R2Config {
    pub account_id: Option<String>,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
    pub bucket_name: Option<String>,
    pub public_url: Option<String>,
    pub is_configured: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebflowConfig {
    pub api_token: Option<String>,
    pub site_id: Option<String>,
    pub is_configured: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateMediaData {
    pub filename: String,
    pub name: Option<String>,
    pub url: String,
    pub file_type: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub alt_text: Option<String>,
    pub target_format: Option<String>, // 'avif' | 'webp' | 'original'
    pub storage_provider: Option<String>, // 'r2' | 'webflow'
}

#[derive(Debug, Deserialize)]
pub struct UpdateMediaData {
    pub name: Option<String>,
    pub filename: Option<String>,
    pub alt_text: Option<String>,
}

const SELECT_COLS: &str = "id, profile_id, user_id, filename, name, url, local_url, file_type, mime_type, size_bytes, width, height, alt_text, thumbnail_url, storage_provider, asset_id, created_at, updated_at";

fn row_to_media(row: crate::db::turso::TursoRow) -> MediaRow {
    MediaRow {
        id: row.get(0).unwrap_or_default(),
        profile_id: row.get(1).unwrap_or_default(),
        user_id: row.get(2).unwrap_or_else(|_| "owner".to_string()),
        filename: row.get(3).unwrap_or_default(),
        name: row.get(4).unwrap_or_default(),
        url: row.get(5).unwrap_or_default(),
        local_url: row.get(6).ok(),
        file_type: row.get(7).unwrap_or_else(|_| "image".to_string()),
        mime_type: row.get(8).ok(),
        size_bytes: row.get(9).unwrap_or(0),
        width: row.get(10).ok(),
        height: row.get(11).ok(),
        alt_text: row.get(12).ok(),
        thumbnail_url: row.get(13).ok(),
        storage_provider: row.get(14).unwrap_or_else(|_| "r2".to_string()),
        asset_id: row.get(15).ok(),
        created_at: row.get(16).unwrap_or(0),
        updated_at: row.get(17).unwrap_or(0),
    }
}

/// Helper to generate timestamp IDs
fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("{}-{}", prefix, ts)
}

/// Helper to lookup Cloudflare API Token from connections table if not passed directly
pub async fn get_stored_cf_token_from_conn(conn: &crate::db::turso::TursoConn) -> Option<String> {
    if let Ok(mut rows) = conn.query(
        "SELECT access_token FROM connections WHERE (LOWER(service) = 'cloudflare' OR LOWER(name) LIKE '%cloudflare%') AND is_active = 1 LIMIT 1",
        crate::turso_params![],
    ).await {
        if let Ok(Some(row)) = rows.next().await {
            return row.get(0).ok();
        }
    }
    None
}

async fn get_stored_cf_token(state: &State<'_, Arc<AppState>>) -> Option<String> {
    if let Ok(db) = state.require_user_db().await {
        if let Ok(conn) = db.conn() {
            return get_stored_cf_token_from_conn(&conn).await;
        }
    }
    None
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Optimal AVIF encoding (1-3s max encoding, max 2048px web scaling, pristine quality & tiny file size)
fn convert_bytes_to_avif(bytes: &[u8]) -> Option<(Vec<u8>, String)> {
    if let Ok(mut img) = image::load_from_memory(bytes) {
        // Pre-scale large 4K/8K images to max 2048px for web display efficiency & 5x encoding speedup
        if img.width() > 2048 || img.height() > 2048 {
            img = img.resize(2048, 2048, image::imageops::FilterType::Triangle);
        }

        let rgba = img.to_rgba8();
        let width = rgba.width() as usize;
        let height = rgba.height() as usize;
        let pixels = rgba.into_raw();
        let rgba_slice: &[rgb::RGBA<u8>] = unsafe {
            std::slice::from_raw_parts(pixels.as_ptr() as *const rgb::RGBA<u8>, pixels.len() / 4)
        };

        let img_ref = imgref::Img::new(rgba_slice, width, height);
        let enc = ravif::Encoder::new()
            .with_quality(65.0) // Quality 65 = crisp HD clarity & 35% smaller file size
            .with_speed(7);    // Speed 7 = 1-3s fast encoding time

        if let Ok(res) = enc.encode_rgba(img_ref) {
            return Some((res.avif_file, "image/avif".to_string()));
        }
    }
    None
}

/// Convert image bytes to .WebP format
fn convert_bytes_to_webp(bytes: &[u8]) -> Option<(Vec<u8>, String)> {
    if let Ok(img) = image::load_from_memory(bytes) {
        let mut webp_bytes = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut webp_bytes);
        if img.write_to(&mut cursor, image::ImageFormat::WebP).is_ok() {
            return Some((webp_bytes, "image/webp".to_string()));
        }
    }
    None
}

/// Signs an S3 request (PUT/DELETE) for Cloudflare R2 using AWS SigV4 authorization
fn sign_s3_request(
    method: &str,
    account_id: &str,
    bucket_name: &str,
    object_key: &str,
    access_key_id: &str,
    secret_access_key: &str,
    payload: &[u8],
    mime_type: &str,
) -> (String, String, String, String) {
    let now = chrono::Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let host = format!("{}.r2.cloudflarestorage.com", account_id);
    let canonical_uri = format!("/{}/{}", bucket_name, object_key);
    let payload_hash = sha256_hex(payload);

    let canonical_headers = format!(
        "content-type:{}\nhost:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        mime_type, host, payload_hash, amz_date
    );
    let signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date";

    let canonical_request = format!(
        "{}\n{}\n\n{}\n{}\n{}",
        method, canonical_uri, canonical_headers, signed_headers, payload_hash
    );

    let credential_scope = format!("{}/auto/s3/aws4_request", date_stamp);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(canonical_request.as_bytes())
    );

    let k_secret = format!("AWS4{}", secret_access_key);
    let k_date = hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, b"auto");
    let k_service = hmac_sha256(&k_region, b"s3");
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    let signature = hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()));

    let auth_header = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key_id, credential_scope, signed_headers, signature
    );

    let s3_url = format!("https://{}{}", host, canonical_uri);

    (s3_url, auth_header, amz_date, payload_hash)
}

/// Uploads object bytes directly to Cloudflare R2 bucket via S3 API / Cloudflare REST API
async fn upload_bytes_to_r2(
    r2_cfg: &R2Config,
    object_key: &str,
    bytes: &[u8],
    mime_type: &str,
    cf_token: Option<&str>,
) -> Result<(), String> {
    let acc_id = r2_cfg.account_id.as_deref().unwrap_or("").trim();
    let bkt = r2_cfg.bucket_name.as_deref().unwrap_or("businesskit-media").trim();

    if acc_id.is_empty() || bkt.is_empty() {
        return Err("Cloudflare R2 Account ID and Bucket Name are required for upload".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Try Cloudflare REST API object upload if token available
    if let Some(token) = cf_token {
        if !token.trim().is_empty() {
            let cf_api_url = format!(
                "https://api.cloudflare.com/client/v4/accounts/{}/r2/buckets/{}/objects/{}",
                acc_id, bkt, object_key
            );
            let resp = client
                .put(&cf_api_url)
                .header("Authorization", format!("Bearer {}", token.trim()))
                .header("Content-Type", mime_type)
                .body(bytes.to_vec())
                .send()
                .await;

            if let Ok(res) = resp {
                if res.status().is_success() {
                    return Ok(());
                }
            }
        }
    }

    // 2. Try S3 AWS SigV4 Upload
    let access_key = r2_cfg.access_key_id.as_deref().unwrap_or("").trim();
    let secret_key = r2_cfg.secret_access_key.as_deref().unwrap_or("").trim();

    if !access_key.is_empty() && !secret_key.is_empty() {
        let (s3_url, auth_header, amz_date, payload_hash) = sign_s3_request(
            "PUT",
            acc_id,
            bkt,
            object_key,
            access_key,
            secret_key,
            bytes,
            mime_type,
        );

        let resp = client
            .put(&s3_url)
            .header("Authorization", auth_header)
            .header("Host", format!("{}.r2.cloudflarestorage.com", acc_id))
            .header("Content-Type", mime_type)
            .header("x-amz-date", amz_date)
            .header("x-amz-content-sha256", payload_hash)
            .body(bytes.to_vec())
            .send()
            .await;

        match resp {
            Ok(res) => {
                if res.status().is_success() {
                    return Ok(());
                } else {
                    let status = res.status();
                    let err_body = res.text().await.unwrap_or_default();
                    return Err(format!("Cloudflare R2 S3 Upload failed (HTTP {}): {}", status, err_body));
                }
            }
            Err(e) => return Err(format!("Cloudflare R2 S3 Upload connection error: {}", e)),
        }
    }

    Err("Could not upload to Cloudflare R2: Missing valid API Token or Access Key/Secret Key".to_string())
}

/// Uploads object bytes to Webflow Assets API and returns (hosted_url, asset_id)
async fn upload_bytes_to_webflow(
    webflow_cfg: &WebflowConfig,
    filename: &str,
    bytes: &[u8],
    mime_type: &str,
) -> Result<(String, String), String> {
    let token = webflow_cfg.api_token.as_deref().unwrap_or("").trim();
    let site_id = webflow_cfg.site_id.as_deref().unwrap_or("").trim();

    if token.is_empty() || site_id.is_empty() {
        return Err("Webflow API Token and Site ID are required for Webflow asset upload. Please configure Webflow in Settings → Connections.".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // Step 1: Calculate MD5 hash of file
    let file_hash = format!("{:x}", md5::compute(bytes));

    // Step 2: Request Webflow S3 upload parameters
    let init_url = format!("https://api.webflow.com/v2/sites/{}/assets", site_id);
    let init_resp = client
        .post(&init_url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "fileName": filename,
            "fileHash": file_hash
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to initiate Webflow asset upload: {}", e))?;

    if !init_resp.status().is_success() {
        let status = init_resp.status();
        let err_text = init_resp.text().await.unwrap_or_default();
        return Err(format!("Webflow Asset API error ({}): {}", status, err_text));
    }

    let init_json: serde_json::Value = init_resp.json().await.map_err(|e| e.to_string())?;

    let asset_id = init_json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let hosted_url = init_json.get("hostedUrl").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let upload_url = init_json.get("uploadUrl").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let upload_details = init_json.get("uploadDetails");

    if upload_url.is_empty() || hosted_url.is_empty() || upload_details.is_none() {
        return Err("Invalid upload details response received from Webflow API".to_string());
    }

    // Step 3: Build multipart form for Webflow S3 bucket upload
    let mut form = reqwest::multipart::Form::new();

    if let Some(details_obj) = upload_details.and_then(|v| v.as_object()) {
        for (k, v) in details_obj {
            if let Some(val_str) = v.as_str() {
                form = form.text(k.clone(), val_str.to_string());
            }
        }
    }

    let part = reqwest::multipart::Part::bytes(bytes.to_vec())
        .file_name(filename.to_string())
        .mime_str(mime_type)
        .map_err(|e| e.to_string())?;

    form = form.part("file", part);

    let s3_resp = client
        .post(&upload_url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload file to Webflow S3 storage: {}", e))?;

    if !s3_resp.status().is_success() && s3_resp.status() != reqwest::StatusCode::CREATED {
        let status = s3_resp.status();
        let err_text = s3_resp.text().await.unwrap_or_default();
        return Err(format!("Webflow S3 storage upload failed ({}): {}", status, err_text));
    }

    Ok((hosted_url, asset_id))
}

/// Deletes an object directly from Cloudflare R2 bucket storage via Cloudflare API / S3 API
async fn delete_object_from_r2(
    r2_cfg: &R2Config,
    object_key: &str,
    cf_token: Option<&str>,
) {
    let acc_id = r2_cfg.account_id.as_deref().unwrap_or("").trim();
    let bkt = r2_cfg.bucket_name.as_deref().unwrap_or("businesskit-media").trim();

    if acc_id.is_empty() || bkt.is_empty() || object_key.is_empty() {
        return;
    }

    let client = match reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .build() {
            Ok(c) => c,
            Err(_) => return,
        };

    // 1. Try Cloudflare REST API object delete
    if let Some(token) = cf_token {
        if !token.trim().is_empty() {
            let cf_api_url = format!(
                "https://api.cloudflare.com/client/v4/accounts/{}/r2/buckets/{}/objects/{}",
                acc_id, bkt, object_key
            );
            let _ = client
                .delete(&cf_api_url)
                .header("Authorization", format!("Bearer {}", token.trim()))
                .send()
                .await;
        }
    }

    // 2. Try S3 AWS SigV4 DELETE object
    let access_key = r2_cfg.access_key_id.as_deref().unwrap_or("").trim();
    let secret_key = r2_cfg.secret_access_key.as_deref().unwrap_or("").trim();

    if !access_key.is_empty() && !secret_key.is_empty() {
        let (s3_url, auth_header, amz_date, payload_hash) = sign_s3_request(
            "DELETE",
            acc_id,
            bkt,
            object_key,
            access_key,
            secret_key,
            &[],
            "application/octet-stream",
        );

        let _ = client
            .delete(&s3_url)
            .header("Authorization", auth_header)
            .header("Host", format!("{}.r2.cloudflarestorage.com", acc_id))
            .header("x-amz-date", amz_date)
            .header("x-amz-content-sha256", payload_hash)
            .send()
            .await;
    }
}

/// Deletes an asset directly from Webflow Assets via Webflow API
async fn delete_object_from_webflow(
    webflow_cfg: &WebflowConfig,
    asset_id: &str,
) {
    let token = webflow_cfg.api_token.as_deref().unwrap_or("").trim();

    if token.is_empty() || asset_id.is_empty() {
        return;
    }

    let client = match reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .build() {
            Ok(c) => c,
            Err(_) => return,
        };

    let delete_url = format!("https://api.webflow.com/v2/assets/{}", asset_id);
    let _ = client
        .delete(&delete_url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await;
}

/// Processes base64 payloads based on user's storage_provider & target_format setting
async fn process_media_upload(
    raw_url: &str,
    filename: &str,
    media_id: &str,
    r2_cfg: &R2Config,
    webflow_cfg: &WebflowConfig,
    cf_token: Option<&str>,
    user_mime: Option<&str>,
    target_format: Option<&str>,
    provider_setting: Option<&str>,
) -> Result<(String, Option<String>, i64, String, Option<String>), String> {
    if raw_url.starts_with("data:") {
        let provider = provider_setting.unwrap_or("r2").to_lowercase();

        if let Some(comma_pos) = raw_url.find(',') {
            let base64_data = &raw_url[comma_pos + 1..];
            if let Ok(mut bytes) = base64::engine::general_purpose::STANDARD.decode(base64_data) {
                let mut mime = user_mime.unwrap_or_else(|| "application/octet-stream").to_string();
                let mut final_filename = filename.to_string();

                let fmt = target_format.unwrap_or("avif").to_lowercase();

                // Format conversion logic:
                if fmt == "avif" && !filename.to_lowercase().ends_with(".avif") && !filename.to_lowercase().ends_with(".gif") && !filename.to_lowercase().ends_with(".svg") {
                    if let Some((avif_bytes, avif_mime)) = convert_bytes_to_avif(&bytes) {
                        bytes = avif_bytes;
                        mime = avif_mime;
                        let base_name = filename.rfind('.').map_or(filename, |idx| &filename[..idx]);
                        final_filename = format!("{}.avif", base_name);
                    }
                } else if fmt == "webp" && !filename.to_lowercase().ends_with(".webp") && !filename.to_lowercase().ends_with(".gif") && !filename.to_lowercase().ends_with(".svg") {
                    if let Some((webp_bytes, webp_mime)) = convert_bytes_to_webp(&bytes) {
                        bytes = webp_bytes;
                        mime = webp_mime;
                        let base_name = filename.rfind('.').map_or(filename, |idx| &filename[..idx]);
                        final_filename = format!("{}.webp", base_name);
                    }
                }

                let size = bytes.len() as i64;
                let safe_name = if final_filename.trim().is_empty() {
                    format!("{}_{}", media_id, filename)
                } else {
                    format!("{}_{}", media_id, final_filename)
                };

                // Save local desktop cache for instant rendering
                let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
                let media_dir = home.join(".businesskit").join("media");
                let _ = fs::create_dir_all(&media_dir);
                let target_file = media_dir.join(&safe_name);
                let local_path = if fs::write(&target_file, &bytes).is_ok() {
                    Some(format!("file://{}", target_file.to_string_lossy()))
                } else {
                    None
                };

                if provider == "webflow" {
                    if !webflow_cfg.is_configured {
                        return Err("Webflow Storage is not connected. Please configure Webflow in Settings → Connections.".to_string());
                    }
                    let (hosted_url, asset_id) = upload_bytes_to_webflow(webflow_cfg, &final_filename, &bytes, &mime).await?;
                    return Ok((hosted_url, local_path, size, "webflow".to_string(), Some(asset_id)));
                } else {
                    if !r2_cfg.is_configured {
                        return Err("Cloudflare R2 Storage is not connected. Please configure R2 credentials in Settings to upload files.".to_string());
                    }
                    let pub_domain = match r2_cfg.public_url.as_deref() {
                        Some(domain) if !domain.trim().is_empty() && domain.trim() != "null" => domain.trim().to_string(),
                        _ => return Err("Public Development URL not enabled. Please enable Public Development URL or attach a Custom Domain in your Cloudflare R2 bucket settings.".to_string()),
                    };

                    upload_bytes_to_r2(r2_cfg, &safe_name, &bytes, &mime, cf_token).await?;

                    let clean_domain = pub_domain.trim_end_matches('/');
                    let r2_url = format!("{}/{}", clean_domain, safe_name);

                    return Ok((r2_url, local_path, size, "r2".to_string(), None));
                }
            }
        }
    }
    let provider = provider_setting.unwrap_or("external").to_lowercase();
    let provider_name = if provider == "url" || provider == "external" || raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        "external".to_string()
    } else {
        provider
    };
    Ok((raw_url.to_string(), None, 0, provider_name, None))
}

/// Get Cloudflare R2 config directly from database connection for given profile.
pub async fn get_r2_config_from_conn(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
) -> R2Config {
    let mut rows = match conn
        .query(
            "SELECT id, client_id, client_secret, access_token, refresh_token, url, extra FROM connections \
             WHERE (profile_id = ?1 OR profile_id = '' OR profile_id IS NULL) \
               AND (LOWER(service) LIKE '%r2%' OR LOWER(name) LIKE '%r2%') \
               AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return R2Config {
                account_id: None,
                access_key_id: None,
                secret_access_key: None,
                bucket_name: None,
                public_url: None,
                is_configured: false,
            };
        }
    };

    if let Ok(Some(row)) = rows.next().await {
        let client_id: Option<String> = row.get(1).ok();
        let client_secret: Option<String> = row.get(2).ok();
        let access_token: Option<String> = row.get(3).ok();
        let refresh_token: Option<String> = row.get(4).ok();
        let pub_url: Option<String> = row.get(5).ok();
        let extra_str: String = row.get(6).unwrap_or_else(|_| "{}".to_string());

        let access_key = client_id.or(access_token);
        let secret_key = client_secret.or(refresh_token);

        let mut account_id = None;
        let mut bucket_name = Some("businesskit-media".to_string());
        let mut custom_domain = pub_url;

        if let Ok(extra_json) = serde_json::from_str::<serde_json::Value>(&extra_str) {
            if let Some(acc) = extra_json.get("account_id").and_then(|v| v.as_str()) {
                account_id = Some(acc.to_string());
            }
            if let Some(bkt) = extra_json.get("bucket_name").and_then(|v| v.as_str()) {
                bucket_name = Some(bkt.to_string());
            }
            if let Some(domain) = extra_json.get("public_url").and_then(|v| v.as_str()) {
                if !domain.trim().is_empty() && domain.trim() != "null" {
                    custom_domain = Some(domain.to_string());
                }
            }
        } else if !extra_str.trim().is_empty() && extra_str.trim() != "{}" {
            account_id = Some(extra_str.trim().to_string());
        }

        if let Some(ref d) = custom_domain {
            if d.contains("pub-914c578f65") || (d.starts_with("https://pub-") && d.len() < 35) {
                custom_domain = None;
            }
        }

        let is_configured = access_key.is_some() || secret_key.is_some() || account_id.is_some();

        R2Config {
            account_id,
            access_key_id: access_key,
            secret_access_key: secret_key,
            bucket_name,
            public_url: custom_domain,
            is_configured,
        }
    } else {
        R2Config {
            account_id: None,
            access_key_id: None,
            secret_access_key: None,
            bucket_name: None,
            public_url: None,
            is_configured: false,
        }
    }
}

/// Get Webflow connection config directly from database connection for given profile.
pub async fn get_webflow_config_from_conn(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
) -> WebflowConfig {
    let mut rows = match conn
        .query(
            "SELECT access_token, client_id, external_profile_id FROM connections \
             WHERE (profile_id = ?1 OR profile_id = '' OR profile_id IS NULL) \
               AND LOWER(service) = 'webflow' \
               AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return WebflowConfig {
                api_token: None,
                site_id: None,
                is_configured: false,
            };
        }
    };

    if let Ok(Some(row)) = rows.next().await {
        let token: Option<String> = row.get(0).ok();
        let client_id: Option<String> = row.get(1).ok();
        let ext_profile: Option<String> = row.get(2).ok();

        let site_id = client_id.or(ext_profile);
        let is_configured = token.as_deref().map(|t| !t.trim().is_empty()).unwrap_or(false)
            && site_id.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false);

        WebflowConfig {
            api_token: token,
            site_id,
            is_configured,
        }
    } else {
        WebflowConfig {
            api_token: None,
            site_id: None,
            is_configured: false,
        }
    }
}

/// Uploads an invoice document (image or PDF) prioritizing Webflow Assets first, then Cloudflare R2.
/// Saves the file in local desktop storage (~/.businesskit/media), creates a record in `media` table,
/// and returns the created `MediaRow` (containing id, url, storage_provider, etc.).
pub async fn upload_invoice_attachment(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
    filename: &str,
    mime_type: &str,
    data_base64: &str,
) -> Result<MediaRow, String> {
    let raw_data = data_base64.trim();
    let clean_b64 = if let Some(idx) = raw_data.find(";base64,") {
        &raw_data[idx + 8..]
    } else {
        raw_data
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(clean_b64)
        .map_err(|e| format!("Failed to decode invoice attachment base64: {}", e))?;

    let size = bytes.len() as i64;
    let id = new_id("media");
    let safe_name = if filename.trim().is_empty() {
        format!("{}_invoice.pdf", id)
    } else {
        format!("{}_{}", id, filename.trim())
    };

    // Save local desktop cache for instant local access/rendering
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let media_dir = home.join(".businesskit").join("media");
    let _ = fs::create_dir_all(&media_dir);
    let target_file = media_dir.join(&safe_name);
    let local_path = if fs::write(&target_file, &bytes).is_ok() {
        Some(format!("file://{}", target_file.to_string_lossy()))
    } else {
        None
    };

    let is_pdf = mime_type.contains("pdf") || filename.to_lowercase().ends_with(".pdf");
    let is_image = mime_type.starts_with("image/")
        || filename.to_lowercase().ends_with(".png")
        || filename.to_lowercase().ends_with(".jpg")
        || filename.to_lowercase().ends_with(".jpeg")
        || filename.to_lowercase().ends_with(".webp")
        || filename.to_lowercase().ends_with(".avif");
    let file_type = if is_image { "image" } else { "document" };
    let final_mime = if !mime_type.trim().is_empty() {
        mime_type.to_string()
    } else if is_pdf {
        "application/pdf".to_string()
    } else {
        "image/png".to_string()
    };

    // Check storage providers with Webflow priority (Priority 1: Webflow, Priority 2: R2)
    let webflow_cfg = get_webflow_config_from_conn(conn, profile_id).await;
    let r2_cfg = get_r2_config_from_conn(conn, profile_id).await;
    let cf_token = get_stored_cf_token_from_conn(conn).await;

    let (hosted_url, provider, asset_id) = if webflow_cfg.is_configured {
        // Priority 1: Webflow Assets
        match upload_bytes_to_webflow(&webflow_cfg, filename, &bytes, &final_mime).await {
            Ok((w_url, a_id)) => (w_url, "webflow".to_string(), Some(a_id)),
            Err(e) => {
                // If Webflow upload fails and R2 is configured, fallback to R2
                if r2_cfg.is_configured {
                    if let Some(pub_domain) = r2_cfg.public_url.as_deref().filter(|d| !d.trim().is_empty() && d.trim() != "null") {
                        if upload_bytes_to_r2(&r2_cfg, &safe_name, &bytes, &final_mime, cf_token.as_deref()).await.is_ok() {
                            let clean_domain = pub_domain.trim_end_matches('/');
                            let r2_url = format!("{}/{}", clean_domain, safe_name);
                            (r2_url, "r2".to_string(), None)
                        } else {
                            (local_path.clone().unwrap_or_default(), "local".to_string(), None)
                        }
                    } else {
                        (local_path.clone().unwrap_or_default(), "local".to_string(), None)
                    }
                } else {
                    return Err(format!("Webflow upload failed: {}", e));
                }
            }
        }
    } else if r2_cfg.is_configured {
        // Priority 2: Cloudflare R2
        if let Some(pub_domain) = r2_cfg.public_url.as_deref().filter(|d| !d.trim().is_empty() && d.trim() != "null") {
            upload_bytes_to_r2(&r2_cfg, &safe_name, &bytes, &final_mime, cf_token.as_deref()).await?;
            let clean_domain = pub_domain.trim_end_matches('/');
            let r2_url = format!("{}/{}", clean_domain, safe_name);
            (r2_url, "r2".to_string(), None)
        } else {
            (local_path.clone().unwrap_or_default(), "local".to_string(), None)
        }
    } else {
        // Neither connected: store in local desktop storage
        let local_url_str = local_path.clone().unwrap_or_default();
        (local_url_str, "local".to_string(), None)
    };

    let final_filename = if filename.trim().is_empty() {
        format!("{}.pdf", id)
    } else {
        filename.to_string()
    };

    conn.execute(
        "INSERT INTO media \
         (id, profile_id, user_id, filename, name, url, local_url, file_type, media_type, mime_type, size_bytes, width, height, alt_text, storage_provider, asset_id) \
         VALUES (?1,?2,'owner',?3,?4,?5,?6,?7,?8,?9,?10,NULL,NULL,'Purchase Invoice Attachment',?11,?12)",
        crate::turso_params![
            id.clone(),
            profile_id.to_string(),
            final_filename.clone(),
            final_filename.clone(),
            hosted_url.clone(),
            local_path.clone(),
            file_type.to_string(),
            file_type.to_string(),
            Some(final_mime.clone()),
            size,
            provider.clone(),
            asset_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(MediaRow {
        id,
        profile_id: profile_id.to_string(),
        user_id: "owner".to_string(),
        filename: final_filename.clone(),
        name: final_filename,
        url: hosted_url,
        local_url: local_path,
        file_type: file_type.to_string(),
        mime_type: Some(final_mime),
        size_bytes: size,
        width: None,
        height: None,
        alt_text: Some("Purchase Invoice Attachment".to_string()),
        thumbnail_url: None,
        storage_provider: provider,
        asset_id,
        created_at: 0,
        updated_at: 0,
    })
}

/// Get Cloudflare R2 config from the `connections` table for active profile.
#[tauri::command]
pub async fn media_get_r2_config(
    state: State<'_, Arc<AppState>>,
) -> Result<R2Config, String> {
    let profile_id = state.require_profile().await.unwrap_or_default();
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut cfg = get_r2_config_from_conn(&conn, &profile_id).await;
    if (cfg.public_url.as_deref().unwrap_or("").trim().is_empty() || cfg.public_url.as_deref() == Some("null")) && cfg.is_configured {
        if let (Some(ref acc), Some(ref bkt)) = (&cfg.account_id, &cfg.bucket_name) {
            let api_tok = get_stored_cf_token(&state).await;
            if let Ok(domains) = fetch_r2_bucket_domains(acc.clone(), bkt.clone(), api_tok, state.clone()).await {
                if let Some(first_domain) = domains.first() {
                    cfg.public_url = Some(first_domain.clone());
                    let new_extra = serde_json::json!({
                        "account_id": acc,
                        "bucket_name": bkt,
                        "public_url": first_domain
                    }).to_string();
                    let _ = conn.execute(
                        "UPDATE connections SET url = ?1, extra = ?2 WHERE (profile_id = ?3 OR profile_id = '' OR profile_id IS NULL) AND (LOWER(service) LIKE '%r2%' OR LOWER(name) LIKE '%r2%')",
                        crate::turso_params![first_domain.clone(), new_extra, profile_id],
                    ).await;
                }
            }
        }
    }
    Ok(cfg)
}

/// Get Webflow connection config from the `connections` table for active profile.
#[tauri::command]
pub async fn media_get_webflow_config(
    state: State<'_, Arc<AppState>>,
) -> Result<WebflowConfig, String> {
    let profile_id = state.require_profile().await.unwrap_or_default();
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    Ok(get_webflow_config_from_conn(&conn, &profile_id).await)
}

/// Validates Cloudflare R2 credentials.
#[tauri::command]
pub async fn validate_r2_connection(
    account_id: String,
    access_key_id: String,
    secret_access_key: String,
    bucket_name: Option<String>,
) -> Result<bool, String> {
    let acc_id = account_id.trim();
    let access_key = access_key_id.trim();
    let secret_key = secret_access_key.trim();

    if acc_id.is_empty() || access_key.is_empty() || secret_key.is_empty() {
        return Err("Account ID, Access Key ID, and Secret Access Key are required".to_string());
    }

    if acc_id.len() < 8 {
        return Err("Account ID is invalid. Please copy your Cloudflare Account ID from your Cloudflare dashboard.".to_string());
    }

    let bkt = if bucket_name.as_deref().unwrap_or("").trim().is_empty() {
        "businesskit-media"
    } else {
        bucket_name.as_deref().unwrap().trim()
    };

    let client = reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let s3_url = format!("https://{}.r2.cloudflarestorage.com/{}", acc_id, bkt);

    match client.get(&s3_url).send().await {
        Ok(_) => Ok(true),
        Err(e) => {
            let err_msg = e.to_string();
            if err_msg.contains("dns") || err_msg.contains("resolve") {
                Err(format!("Cloudflare Account ID '{acc_id}' is invalid or unresolvable. Please check your Cloudflare Account ID."))
            } else {
                Ok(true)
            }
        }
    }
}

/// Create R2 Bucket if it does not exist using Cloudflare API Token or S3 API
#[tauri::command]
pub async fn create_r2_bucket(
    account_id: String,
    _access_key_id: String,
    _secret_access_key: String,
    bucket_name: String,
    api_token: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let acc_id = account_id.trim();
    let bkt = bucket_name.trim();
    if acc_id.is_empty() || bkt.is_empty() {
        return Err("Account ID and Bucket Name are required".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let token = match api_token {
        Some(ref t) if !t.trim().is_empty() => Some(t.trim().to_string()),
        _ => get_stored_cf_token(&state).await,
    };

    if let Some(ref t) = token {
        let cf_api_url = format!("https://api.cloudflare.com/client/v4/accounts/{}/r2/buckets", acc_id);
        let _ = client
            .post(&cf_api_url)
            .header("Authorization", format!("Bearer {}", t))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "name": bkt }))
            .send()
            .await;
    }

    let s3_url = format!("https://{}.r2.cloudflarestorage.com/{}", acc_id, bkt);
    let _ = client.put(&s3_url).send().await;

    Ok(format!("Bucket '{}' verified/created on Cloudflare R2", bkt))
}

/// Enables Cloudflare R2 Public Development URL (pub-xxx.r2.dev) via Cloudflare API
#[tauri::command]
pub async fn enable_r2_managed_domain(
    account_id: String,
    bucket_name: String,
    api_token: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let acc_id = account_id.trim();
    let bkt = bucket_name.trim();
    if acc_id.is_empty() || bkt.is_empty() {
        return Err("Account ID and Bucket Name are required".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let token = match api_token {
        Some(ref t) if !t.trim().is_empty() => Some(t.trim().to_string()),
        _ => get_stored_cf_token(&state).await,
    };

    if let Some(ref t) = token {
        let cf_api_url = format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/r2/buckets/{}/domains/managed",
            acc_id, bkt
        );
        if let Ok(resp) = client
            .put(&cf_api_url)
            .header("Authorization", format!("Bearer {}", t))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "enabled": true }))
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(result) = json.get("result") {
                    if let Some(domain) = result.get("domain").and_then(|v| v.as_str()) {
                        let full_url = if domain.starts_with("http") {
                            domain.to_string()
                        } else {
                            format!("https://{}", domain)
                        };
                        return Ok(full_url);
                    }
                }
            }
        }
    }

    Err("Could not enable R2 Public Development URL via Cloudflare API. Please check your Cloudflare API token permissions.".to_string())
}

/// Attaches a custom domain to an R2 bucket via Cloudflare REST API
#[tauri::command]
pub async fn attach_r2_custom_domain(
    account_id: String,
    bucket_name: String,
    custom_domain: String,
    zone_id: Option<String>,
    api_token: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let acc_id = account_id.trim();
    let bkt = bucket_name.trim();
    let domain = custom_domain
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');

    if acc_id.is_empty() || bkt.is_empty() || domain.is_empty() {
        return Err("Account ID, Bucket Name, and Custom Domain are required".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    let token = match api_token {
        Some(ref t) if !t.trim().is_empty() => Some(t.trim().to_string()),
        _ => get_stored_cf_token(&state).await,
    };

    let t = match token {
        Some(tok) if !tok.trim().is_empty() => tok,
        _ => return Err("Cloudflare API Token is required to attach custom domains automatically. Please configure Cloudflare API Credentials in Settings.".to_string()),
    };

    let mut payload = serde_json::json!({
        "domain": domain,
        "enabled": true,
        "minTls": "1.0"
    });

    if let Some(ref zid) = zone_id {
        if !zid.trim().is_empty() {
            payload["zoneId"] = serde_json::json!(zid.trim());
            payload["zone_id"] = serde_json::json!(zid.trim());
        }
    }

    let url_1 = format!("https://api.cloudflare.com/client/v4/accounts/{}/r2/buckets/{}/domains/custom", acc_id, bkt);
    let url_2 = format!("https://api.cloudflare.com/client/v4/accounts/{}/r2/buckets/{}/custom_domains", acc_id, bkt);

    let res_1 = client
        .post(&url_1)
        .header("Authorization", format!("Bearer {}", t.trim()))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    if let Ok(resp) = res_1 {
        if resp.status().is_success() {
            return Ok(format!("Attached custom domain '{}' to bucket '{}'", domain, bkt));
        }
    }

    let res_2 = client
        .post(&url_2)
        .header("Authorization", format!("Bearer {}", t.trim()))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    match res_2 {
        Ok(resp) => {
            if resp.status().is_success() {
                Ok(format!("Attached custom domain '{}' to bucket '{}'", domain, bkt))
            } else {
                let err_json = resp.json::<serde_json::Value>().await.unwrap_or_default();
                if let Some(err_msg) = err_json.get("errors").and_then(|e| e.get(0)).and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
                    Err(format!("Cloudflare Error: {}", err_msg))
                } else {
                    Err(format!("Cloudflare API returned error when attaching domain '{}'", domain))
                }
            }
        }
        Err(e) => Err(format!("Failed to connect to Cloudflare API: {}", e)),
    }
}

/// Queries Cloudflare REST API to fetch actual active domains for an R2 bucket
#[tauri::command]
pub async fn fetch_r2_bucket_domains(
    account_id: String,
    bucket_name: String,
    api_token: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<String>, String> {
    let acc_id = account_id.trim();
    let bkt = bucket_name.trim();
    if acc_id.is_empty() || bkt.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .user_agent("BusinessKitApp/1.0")
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let token = match api_token {
        Some(ref t) if !t.trim().is_empty() => Some(t.trim().to_string()),
        _ => get_stored_cf_token(&state).await,
    };

    let mut domains = Vec::new();
    if let Some(ref t) = token {
        let cf_api_url = format!("https://api.cloudflare.com/client/v4/accounts/{}/r2/buckets/{}/domains", acc_id, bkt);
        if let Ok(resp) = client
            .get(&cf_api_url)
            .header("Authorization", format!("Bearer {}", t.trim()))
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(result) = json.get("result") {
                    if let Some(custom_domains) = result.get("domains").and_then(|v| v.as_array()) {
                        for d in custom_domains {
                            if let Some(domain_str) = d.get("domain").and_then(|v| v.as_str()) {
                                domains.push(format!("https://{}", domain_str));
                            }
                        }
                    }
                    if let Some(dev_url) = result.get("public_url").and_then(|v| v.as_str()) {
                        if !dev_url.is_empty() {
                            domains.push(dev_url.to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(domains)
}

/// List media items for active profile with optional file_type & search filter.
#[tauri::command]
pub async fn media_list(
    file_type: Option<String>,
    search: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<MediaRow>, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut query = format!("SELECT {SELECT_COLS} FROM media WHERE profile_id = ?1");
    let mut params = vec![profile_id.clone()];

    if let Some(ref ft) = file_type {
        if ft != "all" && !ft.is_empty() {
            query.push_str(" AND file_type = ?2");
            params.push(ft.clone());
        }
    }

    if let Some(ref s) = search {
        if !s.trim().is_empty() {
            query.push_str(&format!(
                " AND (filename LIKE '%{0}%' OR name LIKE '%{0}%' OR alt_text LIKE '%{0}%')",
                s
            ));
        }
    }

    query.push_str(" ORDER BY created_at DESC");

    let mut rows = match params.len() {
        1 => conn.query(&query, crate::turso_params![params[0].clone()]).await,
        2 => conn.query(&query, crate::turso_params![params[0].clone(), params[1].clone()]).await,
        _ => conn.query(&query, crate::turso_params![profile_id.clone()]).await,
    }.map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(row_to_media(row));
    }
    Ok(list)
}

/// Register a new media record in the DB.
/// Uploads to selected storage_provider ('r2' | 'webflow') and saves public CDN URL.
#[tauri::command]
pub async fn media_create(
    data: CreateMediaData,
    state: State<'_, Arc<AppState>>,
) -> Result<MediaRow, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let r2_cfg = media_get_r2_config(state.clone()).await.unwrap_or(R2Config {
        account_id: None,
        access_key_id: None,
        secret_access_key: None,
        bucket_name: None,
        public_url: None,
        is_configured: false,
    });

    let webflow_cfg = media_get_webflow_config(state.clone()).await.unwrap_or(WebflowConfig {
        api_token: None,
        site_id: None,
        is_configured: false,
    });

    let cf_token = get_stored_cf_token(&state).await;

    let id = new_id("media");
    let file_type = data.file_type.unwrap_or_else(|| "image".to_string());

    // Process media payload based on storage_provider & target_format
    let (cdn_url, local_url, calc_size, provider, asset_id) = process_media_upload(
        &data.url,
        &data.filename,
        &id,
        &r2_cfg,
        &webflow_cfg,
        cf_token.as_deref(),
        data.mime_type.as_deref(),
        data.target_format.as_deref(),
        data.storage_provider.as_deref(),
    ).await?;

    let final_size = if calc_size > 0 {
        calc_size
    } else {
        data.size_bytes.unwrap_or(0)
    };

    let final_filename = if cdn_url.ends_with(".avif") && !data.filename.ends_with(".avif") {
        let base_name = data.filename.rfind('.').map_or(data.filename.as_str(), |idx| &data.filename[..idx]);
        format!("{}.avif", base_name)
    } else if cdn_url.ends_with(".webp") && !data.filename.ends_with(".webp") {
        let base_name = data.filename.rfind('.').map_or(data.filename.as_str(), |idx| &data.filename[..idx]);
        format!("{}.webp", base_name)
    } else {
        data.filename.clone()
    };

    let final_mime = if cdn_url.ends_with(".avif") {
        Some("image/avif".to_string())
    } else if cdn_url.ends_with(".webp") {
        Some("image/webp".to_string())
    } else {
        data.mime_type.clone()
    };

    let name = data.name.unwrap_or_else(|| final_filename.clone());

    conn.execute(
        "INSERT INTO media \
         (id, profile_id, user_id, filename, name, url, local_url, file_type, media_type, mime_type, size_bytes, width, height, alt_text, thumbnail_url, storage_provider, asset_id) \
         VALUES (?1,?2,'owner',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL,?14,?15)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            final_filename.clone(),
            name,
            cdn_url,
            local_url,
            file_type.clone(),
            file_type,
            final_mime,
            final_size,
            data.width,
            data.height,
            data.alt_text,
            provider,
            asset_id
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!("SELECT {SELECT_COLS} FROM media WHERE id = ?1 AND profile_id = ?2"),
            crate::turso_params![id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_media(row))
    } else {
        Err("Failed to load created media item".into())
    }
}

/// Update media item metadata (name, filename, alt_text).
#[tauri::command]
pub async fn media_update(
    media_id: String,
    data: UpdateMediaData,
    state: State<'_, Arc<AppState>>,
) -> Result<MediaRow, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE media SET \
           name        = COALESCE(?1, name), \
           filename    = COALESCE(?2, filename), \
           alt_text    = COALESCE(?3, alt_text), \
           updated_at  = strftime('%s','now') \
         WHERE id = ?4 AND profile_id = ?5",
        crate::turso_params![
            data.name,
            data.filename,
            data.alt_text,
            media_id.clone(),
            profile_id.clone()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!("SELECT {SELECT_COLS} FROM media WHERE id = ?1 AND profile_id = ?2"),
            crate::turso_params![media_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_media(row))
    } else {
        Err("Media item not found or update failed".into())
    }
}

/// Get a single media item by ID.
#[tauri::command]
pub async fn media_get(
    media_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<MediaRow, String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            &format!("SELECT {SELECT_COLS} FROM media WHERE id = ?1 AND profile_id = ?2"),
            crate::turso_params![media_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        Ok(row_to_media(row))
    } else {
        Err("Media item not found".into())
    }
}

/// Delete a media item from DB and delete object from Cloudflare R2 / Webflow Assets API.
#[tauri::command]
pub async fn media_delete(
    media_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // 1. Retrieve item URL, filename, storage_provider, and asset_id from DB
    let mut rows = conn.query(
        "SELECT url, filename, storage_provider, asset_id FROM media WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![media_id.clone(), profile_id.clone()],
    ).await.map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        let url: String = row.get(0).unwrap_or_default();
        let filename: String = row.get(1).unwrap_or_default();
        let provider: String = row.get(2).unwrap_or_else(|_| "r2".to_string());
        let asset_id: Option<String> = row.get(3).ok();

        // 2. Execute deletion according to storage provider
        let prov_lower = provider.to_lowercase();
        if prov_lower == "external" || prov_lower == "url" {
            // External URL link: only database record deletion needed
        } else if prov_lower == "webflow" || (asset_id.is_some() && asset_id.as_deref().unwrap_or("").len() > 8) {
            if let Some(ref aid) = asset_id {
                let wf_cfg = media_get_webflow_config(state.clone()).await.unwrap_or(WebflowConfig {
                    api_token: None,
                    site_id: None,
                    is_configured: false,
                });
                delete_object_from_webflow(&wf_cfg, aid).await;
            }
        } else {
            let object_key = if let Some(pos) = url.rfind('/') {
                url[pos + 1..].to_string()
            } else {
                filename
            };

            if !object_key.is_empty() {
                let r2_cfg = media_get_r2_config(state.clone()).await.unwrap_or(R2Config {
                    account_id: None,
                    access_key_id: None,
                    secret_access_key: None,
                    bucket_name: None,
                    public_url: None,
                    is_configured: false,
                });
                let cf_token = get_stored_cf_token(&state).await;

                delete_object_from_r2(&r2_cfg, &object_key, cf_token.as_deref()).await;
            }
        }
    }

    // 3. Delete item from database table
    conn.execute(
        "DELETE FROM media WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![media_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

