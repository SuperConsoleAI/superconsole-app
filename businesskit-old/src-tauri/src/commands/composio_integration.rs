use serde::Serialize;
use serde_json::Value;

// DTOs for Composio Proxy Requests
#[derive(Serialize)]
struct ComposioProxyReq {
    connected_account_id: String,
    endpoint: String,
    method: String,
}

#[derive(Serialize)]
struct ComposioToolReq {
    connected_account_id: String,
    arguments: Value,
}

/// Helper function to make an HTTP request to Composio
async fn composio_post(api_key: &str, path: &str, body: &impl Serialize) -> Result<Value, String> {
    let client = crate::db::turso::create_shared_http_client();
    let url = format!("https://backend.composio.dev/api/v3{}", path); // Note: proxy uses v3.1 in docs, we'll handle that in path

    let res = client
        .post(&url)
        .header("x-api-key", api_key)
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Composio API error: {}", err));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

/// Main orchestration for publishing to Instagram via Composio
pub async fn publish_social_post_composio_instagram(
    api_key: &str,
    connected_account_id: &str,
    content: &str,
    image_url: Option<&str>,
) -> Result<(String, String), String> {
    let image = image_url.ok_or_else(|| "Instagram posts require media content".to_string())?;

    // Step 1: Fetch the Instagram User ID (ig_user_id) via Proxy
    let me_req = ComposioProxyReq {
        connected_account_id: connected_account_id.to_string(),
        endpoint: "https://graph.instagram.com/v21.0/me?fields=id,username".to_string(),
        method: "GET".to_string(),
    };

    let me_res = composio_post(api_key, ".1/tools/execute/proxy", &me_req).await?;
    let ig_user_id = me_res
        .pointer("/data/id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            format!(
                "Failed to parse ig_user_id from Composio response: {}",
                me_res
            )
        })?;

    // Step 2: Create Media Container using Native Tool
    let container_req = ComposioToolReq {
        connected_account_id: connected_account_id.to_string(),
        arguments: serde_json::json!({
            "ig_user_id": ig_user_id,
            "image_url": image,
            "caption": content
        }),
    };

    let container_res = composio_post(
        api_key,
        "/tools/execute/INSTAGRAM_CREATE_MEDIA_CONTAINER",
        &container_req,
    )
    .await?;
    let creation_id = container_res
        .pointer("/data/id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            format!(
                "Failed to parse creation_id from Composio response: {}",
                container_res
            )
        })?;

    // Step 3: Publish Media Container via Proxy
    // Note: creation_id MUST be passed as a query param in the endpoint URL
    let publish_endpoint = format!(
        "https://graph.instagram.com/v21.0/{}/media_publish?creation_id={}",
        ig_user_id, creation_id
    );
    let publish_req = ComposioProxyReq {
        connected_account_id: connected_account_id.to_string(),
        endpoint: publish_endpoint,
        method: "POST".to_string(),
    };

    let publish_res = composio_post(api_key, ".1/tools/execute/proxy", &publish_req).await?;
    let published_post_id = publish_res
        .pointer("/data/id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            format!(
                "Failed to parse published post ID from Composio response: {}",
                publish_res
            )
        })?;

    // Generate a best-guess URL based on Instagram standard if platform URL is not returned
    let platform_post_url = format!("https://www.instagram.com/p/{}/", published_post_id);

    Ok((published_post_id.to_string(), platform_post_url))
}
