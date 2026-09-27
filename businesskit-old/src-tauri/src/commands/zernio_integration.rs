use std::sync::Arc;
use tauri::State;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::app_state::AppState;
use super::social::{CreatePostData, SocialPostRow, post_from_row};

#[derive(Serialize)]
struct PresignedUrlReq {
    filename: String,
    #[serde(rename = "contentType")]
    content_type: String,
}



#[derive(Serialize)]
struct ZernioPostPlatform {
    platform: String,
    #[serde(rename = "accountId")]
    account_id: String,
}

#[derive(Serialize)]
struct ZernioPostMedia {
    #[serde(rename = "type")]
    media_type: String,
    url: String,
}

#[derive(Serialize)]
struct ZernioPostReq {
    content: String,
    platforms: Vec<ZernioPostPlatform>,
    #[serde(rename = "mediaItems", skip_serializing_if = "Vec::is_empty")]
    media_items: Vec<ZernioPostMedia>,
    #[serde(rename = "publishNow")]
    publish_now: bool,
    #[serde(rename = "useQueue")]
    use_queue: bool,
    #[serde(rename = "scheduledFor", skip_serializing_if = "Option::is_none")]
    scheduled_for: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ZernioResPlatform {
    #[serde(rename = "platformPostId")]
    platform_post_id: Option<String>,
    #[serde(rename = "platformPostUrl")]
    platform_post_url: Option<String>,
    platform: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ZernioPostInner {
    #[serde(rename = "_id")]
    id: String,
    status: String,
    #[serde(rename = "platformPostId")]
    platform_post_id: Option<String>,
    #[serde(rename = "platformPostUrl")]
    platform_post_url: Option<String>,
    #[serde(default)]
    platforms: Vec<ZernioResPlatform>,
}

#[derive(Deserialize, Debug)]
struct ZernioPostRes {
    post: ZernioPostInner,
}

pub async fn create_social_post_impl(
    data: CreatePostData,
    state: State<'_, Arc<AppState>>,
) -> Result<SocialPostRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    let mode = data.mode.clone().unwrap_or_else(|| "draft".to_string());
    
    let mut external_post_id = None;
    let mut final_status = "draft".to_string();
    let mut external_account_id = None;
    let mut final_media = data.media_urls.clone(); // by default, just the local path
    let mut platform_post_id: Option<String> = None;
    let mut platform_post_url: Option<String> = None;

    if mode != "draft" {
        // Fetch API key
        let mut api_key = None;
        let mut api_key_rows = conn.query("SELECT COALESCE(access_token, client_id) FROM connections WHERE service = 'zernio' AND profile_id = ?1", crate::turso_params![profile_id.clone()]).await.map_err(|e| e.to_string())?;
        if let Some(row) = api_key_rows.next().await.map_err(|e| e.to_string())? {
            api_key = row.get::<String>(0).ok();
        }
        if api_key.is_none() {
            api_key = std::env::var("ZERNIO_API_KEY").ok();
        }
        let api_key = api_key.ok_or_else(|| "No Zernio API key configured. Please connect Zernio in Settings.".to_string())?;

        // Fetch Zernio account ID
        let acc_id = data.account_id.clone().ok_or_else(|| "No accountId provided".to_string())?;
        let mut acc_rows = conn.query("SELECT external_account_id FROM social_accounts WHERE id = ?1", crate::turso_params![acc_id.clone()]).await.map_err(|e| e.to_string())?;
        if let Some(row) = acc_rows.next().await.map_err(|e| e.to_string())? {
            external_account_id = row.get::<String>(0).ok();
        }
        let z_acc_id = external_account_id.clone().ok_or_else(|| format!("Account {} is not synced with Zernio", acc_id))?;

        let client = crate::db::turso::create_shared_http_client();
        let mut media_items = Vec::new();

        // Handle Media Upload if local path is provided
        if let Some(ref local_path) = data.media_urls {
            // Read file
            let file_bytes = std::fs::read(local_path).map_err(|e| format!("Failed to read media file: {}", e))?;
            let mime = mime_guess::from_path(local_path).first_or_octet_stream().to_string();

            // 1. Get Presigned URL
            let filename = std::path::Path::new(local_path).file_name().and_then(|s| s.to_str()).unwrap_or("upload").to_string();
            let presigned_res = client.post("https://api.zernio.com/v1/media/presign")
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&PresignedUrlReq { filename, content_type: mime.clone() })
                .send().await.map_err(|e| e.to_string())?;
            
            if !presigned_res.status().is_success() {
                let err = presigned_res.text().await.unwrap_or_default();
                return Err(format!("Failed to get presigned URL: {}", err));
            }
            let raw_text = presigned_res.text().await.unwrap_or_default();
            log::debug!("Presigned URL Raw Response: {}", raw_text);
            let presigned_json: serde_json::Value = serde_json::from_str(&raw_text).map_err(|e| format!("Presigned decode error: {}", e))?;

            // Try to extract from either root or "media" wrapper
            let root_or_media = presigned_json.get("media").unwrap_or(&presigned_json);
            
            let upload_url = root_or_media.get("uploadUrl")
                .or_else(|| root_or_media.get("upload_url"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
                
            let public_url = root_or_media.get("publicUrl")
                .or_else(|| root_or_media.get("public_url"))
                .or_else(|| root_or_media.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            if upload_url.is_empty() || public_url.is_empty() {
                return Err(format!("Failed to parse uploadUrl or publicUrl from presign response: {}", raw_text));
            }

            // 2. PUT to presigned URL
            let put_res = client.put(&upload_url)
                .header("Content-Type", mime)
                .body(file_bytes)
                .send().await.map_err(|e| e.to_string())?;

            if !put_res.status().is_success() {
                let err = put_res.text().await.unwrap_or_default();
                return Err(format!("Failed to upload media: {}", err));
            }

            media_items.push(ZernioPostMedia {
                media_type: "image".to_string(),
                url: public_url,
            });
            // Store the zernio media ID in local DB instead of the local path
            final_media = Some(serde_json::to_string(&media_items).unwrap_or_default());
        }

        // Prepare Post Payload
        let scheduled_for = data.scheduled_for.map(|ts| {
            chrono::DateTime::<chrono::Utc>::from_utc(
                chrono::NaiveDateTime::from_timestamp_opt(ts, 0).unwrap_or_default(),
                chrono::Utc
            ).to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        });

        let req = ZernioPostReq {
            content: data.content.clone(),
            platforms: vec![ZernioPostPlatform {
                platform: data.platform.clone(),
                account_id: z_acc_id,
            }],
            media_items,
            publish_now: mode == "publish",
            use_queue: mode == "queue",
            scheduled_for,
        };

        // 3. Create Post on Zernio
        let post_res = client.post("https://api.zernio.com/v1/posts")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&req)
            .send().await.map_err(|e| e.to_string())?;

        if !post_res.status().is_success() {
            let err = post_res.text().await.unwrap_or_default();
            return Err(format!("Zernio create post failed: {}", err));
        }

        let raw_post_text = post_res.text().await.unwrap_or_default();
        log::debug!("Post Create Raw Response: {}", raw_post_text);
        let parsed_json: serde_json::Value = serde_json::from_str(&raw_post_text).unwrap_or(serde_json::json!({}));
        
        let post_json: ZernioPostRes = serde_json::from_str(&raw_post_text).map_err(|e| format!("Post decode error: {}", e))?;
        log::debug!("Parsed ZernioPostRes: {:?}", post_json);

        external_post_id = Some(post_json.post.id);
        final_status = if post_json.post.status == "publishing" {
            "published".to_string()
        } else {
            post_json.post.status
        };

        // Fallback to manual Value extraction just in case Serde drops it
        let mut manual_id = None;
        let mut manual_url = None;
        if let Some(platforms) = parsed_json.get("post").and_then(|p| p.get("platforms")).and_then(|p| p.as_array()) {
            for p in platforms {
                if p.get("platform").and_then(|v| v.as_str()) == Some(data.platform.as_str()) {
                    manual_id = p.get("platformPostId").and_then(|v| v.as_str().map(String::from));
                    manual_url = p.get("platformPostUrl").and_then(|v| v.as_str().map(String::from));
                }
            }
        }

        platform_post_id = post_json.post.platform_post_id
            .or_else(|| post_json.post.platforms.iter().find(|p| p.platform.as_deref() == Some(data.platform.as_str())).and_then(|p| p.platform_post_id.clone()))
            .or(manual_id);
        
        platform_post_url = post_json.post.platform_post_url
            .or_else(|| post_json.post.platforms.iter().find(|p| p.platform.as_deref() == Some(data.platform.as_str())).and_then(|p| p.platform_post_url.clone()))
            .or(manual_url);
        
        log::debug!("Final extracted ID: {:?}, URL: {:?}", platform_post_id, platform_post_url);
    }

    let is_publish_now = if mode == "publish" { 1 } else { 0 };
    let is_use_queue = if mode == "queue" { 1 } else { 0 };

    // Insert into local database
    conn.execute(
        "INSERT INTO social_posts
           (id, profile_id, group_id, account_id, platform, content, media_items,
            status, scheduled_for, created_at, updated_at, external_post_id, external_account_id,
            publish_now, use_queue, platform_post_id, platform_post_url)
         VALUES (?1,?2,?3,?4,?5,?6,COALESCE(?7,'[]'),?8,?9, unixepoch(), unixepoch(), ?10, ?11, ?12, ?13, ?14, ?15)",
        crate::turso_params![
            id.clone(), profile_id, data.group_id, data.account_id,
            data.platform, data.content, final_media, final_status, data.scheduled_for,
            external_post_id, external_account_id, is_publish_now, is_use_queue,
            platform_post_id, platform_post_url
        ],
    ).await.map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, profile_id, group_id, account_id, platform, content,
                COALESCE(media_items,'[]'), status, scheduled_for, published_at,
                platform_post_id, error,
                0 as likes, 0 as comments, 0 as shares, 0 as impressions, created_at, updated_at
         FROM social_posts WHERE id = ?1",
        crate::turso_params![id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        post_from_row(&row)
    } else {
        Err("Post insert failed".to_string())
    }
}
