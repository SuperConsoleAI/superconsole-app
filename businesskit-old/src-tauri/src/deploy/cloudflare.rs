// src-tauri/src/deploy/cloudflare.rs
//
// WHAT:  Cloudflare API client used for the deploy pipeline.
//
// HOW:   Uses `reqwest` to call the official CF REST API v4.
//        All requests carry `Authorization: Bearer {token}` from the user's
//        CF API token — stored in the OS keychain (keyring crate), never on disk.
//
// FLOW (deploy_frontend):
//   1. connect_cloudflare()   → validate token against CF API, store in keychain
//   2. check_for_updates()    → hit GitHub releases API to get latest bundle tag
//   3. deploy_frontend()      → full pipeline:
//        a. Load CF credentials from keychain
//        b. Download latest pre-built Worker bundle from GitHub releases
//        c. Upload Worker script via CF Workers API (multipart form)
//        d. Emit Tauri progress events to frontend throughout
//        e. Register deployment in Central DB via CentralDb::register_deployment()
//
// CF API endpoints used:
//   GET  /user/tokens/verify                                   — validate token
//   GET  /accounts/{id}/workers/scripts/{name}                 — check existing
//   PUT  /accounts/{id}/workers/scripts/{name}                 — upload script
//   POST /accounts/{id}/workers/scripts/{name}/schedules       — (future cron)
//   GET  /accounts/{id}/workers/deployments/by-script/{name}   — deployment status
//   GET  /zones/{zone_id}/custom_hostnames/{id}                — custom domain
//
// Worker naming convention:
//   project mode:   businesskit-{profile_slug}
//   workspace mode: businesskit-{org_slug}
//
// GitHub releases API:
//   GET https://api.github.com/repos/businesskitai/businesskit-frontend/releases/latest

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentStatus {
    pub worker_name: String,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub status: String, // "pending" | "active" | "failed" | "not_deployed"
    pub deploy_url: Option<String>,
    pub custom_domain: Option<String>,
    pub deployed_at: Option<i64>,
    pub update_available: bool,
    pub deployment_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub latest_version: String,
    pub current_version: Option<String>,
    pub update_available: bool,
    pub release_notes: Option<String>,
    pub download_url: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct CfApiResponse<T> {
    success: bool,
    errors: Vec<CfApiError>,
    result: Option<T>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct CfApiError {
    message: String,
}

#[derive(Debug, Deserialize)]
pub struct CfTokenVerifyResult {
    pub id: String,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfZone {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct ZonesResponse {
    result: Vec<CfZone>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfSaaSVerification {
    pub cname_target: String,
    pub txt_name: String,
    pub txt_value: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GithubAsset>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    url: String,
    browser_download_url: String,
}

// ── CloudflareClient ──────────────────────────────────────────────────────────

pub struct CloudflareClient {
    pub account_id: String,
    api_token: String,
    client: reqwest::Client,
}

impl CloudflareClient {
    pub fn new(account_id: String, api_token: String) -> Self {
        Self {
            account_id,
            api_token,
            client: reqwest::Client::builder()
                .user_agent("BusinessKit-Desktop/1.0")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }

    fn base_url(&self) -> String {
        format!(
            "https://api.cloudflare.com/client/v4/accounts/{}",
            self.account_id
        )
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.api_token)
    }

    // ── Token + account validation ────────────────────────────────────────────

    /// Validate the CF API token against the CF API.
    /// Called by connect_cloudflare before storing credentials.
    pub async fn verify_token(&self) -> Result<bool> {
        // First try the account-scoped verification endpoint
        let mut resp = self
            .client
            .get(format!("{}/tokens/verify", self.base_url()))
            .header("Authorization", self.auth_header())
            .send()
            .await
            .context("CF token verify request failed")?;

        // If it's a User token, the above might fail with 4xx. Try the User endpoint.
        if !resp.status().is_success() {
            resp = self
                .client
                .get("https://api.cloudflare.com/client/v4/user/tokens/verify")
                .header("Authorization", self.auth_header())
                .send()
                .await
                .context("CF token verify user request failed")?;
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("CF API Error {}: {}", status, text));
        }

        let body: CfApiResponse<CfTokenVerifyResult> = resp
            .json()
            .await
            .context("CF token verify response parse failed")?;

        Ok(body.success
            && body
                .result
                .and_then(|r| r.status)
                .map(|s| s == "active")
                .unwrap_or(false))
    }

    // ── Zone and Domain Management ────────────────────────────────────────────

    /// List all domains (zones) in the user's CF account.
    pub async fn list_zones(&self) -> Result<Vec<CfZone>> {
        let resp = self
            .client
            .get("https://api.cloudflare.com/client/v4/zones")
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await
            .context("CF Zones request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("CF API Error {}: {}", status, text));
        }

        let body: ZonesResponse = resp.json().await.context("CF zones parse failed")?;
        Ok(body.result)
    }
    pub async fn get_fallback_origin(&self, zone_id: &str) -> Result<String> {
        let url = format!(
            "https://api.cloudflare.com/client/v4/zones/{}/custom_hostnames/fallback_origin",
            zone_id
        );
        let resp = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("CF API Error {}: {}", status, text));
        }

        let body: serde_json::Value = resp.json().await?;
        if let Some(origin) = body
            .get("result")
            .and_then(|r| r.get("origin"))
            .and_then(|o| o.as_str())
        {
            Ok(origin.to_string())
        } else {
            Err(anyhow::anyhow!("Fallback origin not configured for this zone. Please configure it in the Cloudflare dashboard first."))
        }
    }

    pub async fn add_saas_domain(
        &self,
        zone_id: &str,
        hostname: &str,
    ) -> Result<CfSaaSVerification> {
        let fallback_origin = self.get_fallback_origin(zone_id).await?;

        let url = format!(
            "https://api.cloudflare.com/client/v4/zones/{}/custom_hostnames",
            zone_id
        );
        let payload = serde_json::json!({
            "hostname": hostname,
            "ssl": {
                "method": "txt",
                "type": "dv"
            }
        });

        let resp = self
            .client
            .post(&url)
            .header("Authorization", self.auth_header())
            .json(&payload)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("CF API Error {}: {}", status, text));
        }

        let body: serde_json::Value = resp.json().await?;
        let result = body
            .get("result")
            .ok_or_else(|| anyhow::anyhow!("Invalid response from CF"))?;

        let ownership_name = result
            .get("ownership_verification")
            .and_then(|o| o.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or_default();

        let ownership_value = result
            .get("ownership_verification")
            .and_then(|o| o.get("value"))
            .and_then(|v| v.as_str())
            .unwrap_or_default();

        // If CF returned SSL TXT records instead, we'll use those
        let txt_name = result
            .get("ssl")
            .and_then(|s| s.get("txt_name"))
            .and_then(|n| n.as_str())
            .unwrap_or(ownership_name);

        let txt_value = result
            .get("ssl")
            .and_then(|s| s.get("txt_value"))
            .and_then(|v| v.as_str())
            .unwrap_or(ownership_value);

        Ok(CfSaaSVerification {
            cname_target: fallback_origin,
            txt_name: txt_name.to_string(),
            txt_value: txt_value.to_string(),
        })
    }

    /// Map a domain to a worker using Workers Custom Domains.
    pub async fn add_worker_domain(
        &self,
        zone_id: &str,
        hostname: &str,
        worker_name: &str,
    ) -> Result<()> {
        let payload = serde_json::json!({
            "environment": "production",
            "hostname": hostname,
            "service": worker_name,
            "zone_id": zone_id
        });

        let url = format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/workers/domains",
            self.account_id
        );

        let resp = self
            .client
            .put(&url) // Workers domains uses PUT for creation/update
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&payload)
            .send()
            .await
            .context("CF Workers Domain request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("CF API Error {}: {}", status, text));
        }

        Ok(())
    }

    pub async fn delete_worker_domain(&self, hostname: &str) -> Result<()> {
        let list_url = format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/workers/domains?hostname={}",
            self.account_id, hostname
        );
        let list_resp = self
            .client
            .get(&list_url)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !list_resp.status().is_success() {
            return Err(anyhow::anyhow!(
                "Failed to list CF worker domains for {}",
                hostname
            ));
        }

        let list_data: serde_json::Value = list_resp.json().await?;
        if let Some(results) = list_data.get("result").and_then(|r| r.as_array()) {
            if let Some(domain) = results.first() {
                if let Some(domain_id) = domain.get("id").and_then(|id| id.as_str()) {
                    let delete_url = format!(
                        "https://api.cloudflare.com/client/v4/accounts/{}/workers/domains/{}",
                        self.account_id, domain_id
                    );
                    let del_resp = self
                        .client
                        .delete(&delete_url)
                        .header("Authorization", self.auth_header())
                        .send()
                        .await?;

                    if !del_resp.status().is_success() {
                        let text = del_resp.text().await.unwrap_or_default();
                        return Err(anyhow::anyhow!(
                            "Failed to delete CF worker domain: {}",
                            text
                        ));
                    }
                }
            }
        }

        Ok(())
    }

    // ── Worker deployment ─────────────────────────────────────────────────────

    /// Upload a Worker script to the user's CF account.
    /// `script_bytes` = the raw JS/WASM bundle from the downloaded release.
    /// `worker_name`  = businesskit-{slug}
    /// `env_vars`     = injected as CF Worker environment variables binding text
    pub async fn upload_worker(
        &self,
        worker_name: &str,
        script_bytes: Vec<u8>,
        env_vars: &WorkerEnvVars,
    ) -> Result<String> {
        // CF Workers script upload uses multipart/form-data:
        //   Part "worker.js" — content-type: application/javascript
        //   Part "metadata"  — content-type: application/json (bindings etc.)

        let metadata = serde_json::json!({
            "main_module": "index.js",
            "bindings": [
                { "type": "plain_text",  "name": "TURSO_URL",          "text": env_vars.turso_url },
                { "type": "secret_text", "name": "TURSO_TOKEN",        "text": env_vars.turso_token },
                { "type": "plain_text",  "name": "PROFILE_ID",         "text": env_vars.profile_id },
                { "type": "plain_text",  "name": "DEPLOY_MODE",        "text": env_vars.deploy_mode },
                { "type": "secret_text", "name": "ENCRYPTION_SECRET",  "text": env_vars.encryption_secret },
            ],
            "compatibility_date": "2024-01-01"
        });

        let form = reqwest::multipart::Form::new()
            .part(
                "metadata",
                reqwest::multipart::Part::bytes(metadata.to_string().into_bytes())
                    .mime_str("application/json")?,
            )
            .part(
                "index.js",
                reqwest::multipart::Part::bytes(script_bytes)
                    .mime_str("application/javascript+module")?,
            );

        let url = format!("{}/workers/scripts/{}", self.base_url(), worker_name);
        let resp = self
            .client
            .put(&url)
            .header("Authorization", self.auth_header())
            .multipart(form)
            .send()
            .await
            .context("CF Worker upload request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("CF Worker upload failed ({status}): {text}"));
        }

        // Return the workers.dev subdomain URL
        Ok(format!(
            "https://{}.{}.workers.dev",
            worker_name, self.account_id
        ))
    }

    pub async fn delete_worker(&self, worker_name: &str) -> Result<()> {
        let url = format!("{}/workers/scripts/{}", self.base_url(), worker_name);
        let resp = self
            .client
            .delete(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| anyhow!("Failed to send delete worker request: {}", e))?;

        if !resp.status().is_success() {
            if resp.status().as_u16() == 404 {
                // If it doesn't exist, we consider it successfully deleted
                return Ok(());
            }
            let err_text = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Cloudflare API error deleting worker: {}",
                err_text
            ));
        }

        Ok(())
    }

    /// Upload an encrypted secret to a Cloudflare Worker via the CF Secrets API.
    pub async fn put_worker_secret(
        &self,
        worker_name: &str,
        secret_name: &str,
        secret_value: &str,
    ) -> Result<()> {
        let url = format!("{}/workers/scripts/{}/secrets", self.base_url(), worker_name);
        let payload = serde_json::json!({
            "name": secret_name,
            "text": secret_value,
            "type": "secret_text"
        });

        let resp = self
            .client
            .put(&url)
            .header("Authorization", self.auth_header())
            .json(&payload)
            .send()
            .await
            .context(format!("Failed to upload secret {} to Cloudflare", secret_name))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Cloudflare secret upload failed for {} ({status}): {text}", secret_name));
        }

        Ok(())
    }

    /// Get the current deployment state of a named Worker.
    pub async fn get_worker_status(&self, worker_name: &str) -> Result<Option<String>> {
        let url = format!("{}/workers/scripts/{}", self.base_url(), worker_name);
        let resp = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .context("CF Worker status request failed")?;

        if resp.status().as_u16() == 404 {
            return Ok(None); // Not yet deployed
        }
        if resp.status().is_success() {
            return Ok(Some("active".to_string()));
        }
        Err(anyhow!("CF Worker status check failed: {}", resp.status()))
    }

    /// Get the account's unique workers subdomain (e.g. "greyscover").
    pub async fn get_worker_subdomain(&self) -> Result<String> {
        let url = format!("{}/workers/subdomain", self.base_url());
        let resp = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .context("CF Worker subdomain request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "CF API Error fetching subdomain {}: {}",
                status,
                text
            ));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .context("Failed to parse CF JSON response")?;
        let subdomain = body["result"]["subdomain"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        Ok(subdomain)
    }
}

// ── Worker env vars ───────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct WorkerEnvVars {
    pub turso_url: String,
    pub turso_token: String,
    pub profile_id: String,
    pub deploy_mode: String, // "project" | "workspace"
    pub encryption_secret: String,
}

// ── GitHub releases helper ────────────────────────────────────────────────────

/// Check the latest published release from the BusinessKit frontend repo.
/// Returns (tag, download_url, release_notes).
pub async fn get_latest_release(
    client: &reqwest::Client,
) -> Result<(String, String, Option<String>)> {
    let mut req = client
        .get("https://api.github.com/repos/KumarOfficial/web/releases/latest")
        .header("User-Agent", "BusinessKit-Desktop/1.0")
        .header("Accept", "application/vnd.github+json");

    if let Ok(token) = std::env::var("GITHUB_TOKEN").or_else(|_| {
        option_env!("GITHUB_TOKEN")
            .map(String::from)
            .ok_or(std::env::VarError::NotPresent)
    }) {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await.context("GitHub releases request failed")?;

    if !resp.status().is_success() {
        return Err(anyhow!("GitHub releases API returned {}", resp.status()));
    }

    let release: GithubRelease = resp.json().await.context("GitHub releases parse failed")?;

    // Find the .js or .zip bundle asset
    let asset = release
        .assets
        .into_iter()
        .find(|a| a.name.ends_with(".js") || a.name.ends_with(".zip") || a.name.contains("worker"))
        .ok_or_else(|| anyhow!("No deployable asset found in latest release"))?;

    Ok((release.tag_name, asset.url, release.body))
}

/// Download a release asset as raw bytes.
pub async fn download_asset(client: &reqwest::Client, url: &str) -> Result<Vec<u8>> {
    let mut req = client
        .get(url)
        .header("User-Agent", "BusinessKit-Desktop/1.0")
        .header("Accept", "application/octet-stream");

    if let Ok(token) = std::env::var("GITHUB_TOKEN").or_else(|_| {
        option_env!("GITHUB_TOKEN")
            .map(String::from)
            .ok_or(std::env::VarError::NotPresent)
    }) {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await.context("Asset download request failed")?;

    if !resp.status().is_success() {
        return Err(anyhow!("Asset download failed: {}", resp.status()));
    }

    Ok(resp.bytes().await.context("Asset read failed")?.to_vec())
}
