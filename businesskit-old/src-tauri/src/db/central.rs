// src-tauri/src/db/central.rs
// Central Turso DB client — uses reqwest + Turso HTTP API for iOS compatibility.
//
// WHY reqwest instead of libsql:
//   libsql's HTTP client uses rustls-native-certs → "no valid native root CA certificates found"
//   on iOS (physical device). reqwest with rustls-tls uses bundled webpki-roots → works everywhere.
//
// IMPORTANT: organizations.owner_user_id = users.id (NOT workos_id).
// Always look up users.id via get_user_id_by_workos_id() before querying orgs.

use crate::{Deployment, LicenseStatus, Organization};
use crate::db::turso::{TursoConn, TursoRow};
use anyhow::{anyhow, Result};
use std::ops::Deref;
use tokio::sync::RwLockReadGuard;

/// Newtype wrapper so callers can write `state.cdb().await?.get_xxx()`
/// without dealing with RwLock guard lifetimes directly.
pub struct CentralDbRef<'a>(pub RwLockReadGuard<'a, Option<CentralDb>>);

impl<'a> Deref for CentralDbRef<'a> {
    type Target = CentralDb;
    fn deref(&self) -> &Self::Target {
        self.0
            .as_ref()
            .expect("CentralDb is Some — checked in cdb()")
    }
}

pub struct CentralDb {
    inner: TursoConn,
}

impl CentralDb {
    /// Create a new CentralDb connection.
    /// Uses reqwest (webpki-roots bundled) — no network call until first query.
    pub async fn connect(url: &str, token: &str) -> Result<Self> {
        if url.is_empty() {
            return Err(anyhow!("CentralDb: TURSO_DATABASE_URL is not configured"));
        }
        Ok(Self {
            inner: TursoConn::new(url, token),
        })
    }

    /// Get a connection handle (cheap clone of Arc-backed reqwest client).
    pub fn conn(&self) -> Result<TursoConn> {
        Ok(self.inner.clone())
    }

    // ── Users ────────────────────────────────────────────────────────────────

    /// Look up users.id by workos_id. The web app creates users with a separate
    /// users.id (TEXT PRIMARY KEY) that may differ from workos_id.
    /// organizations.owner_user_id = users.id — NOT the raw workos_id.
    pub async fn get_user_id_by_workos_id(&self, workos_id: &str) -> Result<String> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id FROM users WHERE workos_id = ?1 LIMIT 1",
                crate::turso_params![workos_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<String>(0)?)
        } else {
            // Fallback: if no users row, workos_id might be used directly as owner_user_id
            // (older records created before the users table was added)
            Ok(workos_id.to_string())
        }
    }

    /// Upsert user in Central DB users table upon auth callback.
    /// Populates first_name, last_name, profile_picture_url, and last_login.
    /// Returns the internal users.id (UUID).
    pub async fn upsert_user(
        &self,
        workos_id: &str,
        email: &str,
        first_name: Option<&str>,
        last_name: Option<&str>,
        profile_picture_url: Option<&str>,
    ) -> Result<String> {
        let conn = self.conn()?;
        let now = chrono::Utc::now().timestamp();

        // 1. Check if user already exists by workos_id
        let mut rows = conn
            .query(
                "SELECT id FROM users WHERE workos_id = ?1 LIMIT 1",
                crate::turso_params![workos_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            let existing_id: String = row.get(0)?;
            conn.execute(
                "UPDATE users SET 
                    email = ?1,
                    first_name = COALESCE(?2, first_name),
                    last_name = COALESCE(?3, last_name),
                    profile_picture_url = COALESCE(?4, profile_picture_url),
                    last_login = ?5,
                    updated_at = ?5
                 WHERE id = ?6",
                crate::turso_params![
                    email,
                    first_name,
                    last_name,
                    profile_picture_url,
                    now,
                    &existing_id
                ],
            )
            .await?;
            return Ok(existing_id);
        }

        // 2. Check if user exists by email (e.g. pre-invited)
        let mut email_rows = conn
            .query(
                "SELECT id FROM users WHERE email = ?1 LIMIT 1",
                crate::turso_params![email],
            )
            .await?;

        if let Some(row) = email_rows.next().await? {
            let existing_id: String = row.get(0)?;
            conn.execute(
                "UPDATE users SET 
                    workos_id = ?1,
                    first_name = COALESCE(?2, first_name),
                    last_name = COALESCE(?3, last_name),
                    profile_picture_url = COALESCE(?4, profile_picture_url),
                    last_login = ?5,
                    updated_at = ?5
                 WHERE id = ?6",
                crate::turso_params![
                    workos_id,
                    first_name,
                    last_name,
                    profile_picture_url,
                    now,
                    &existing_id
                ],
            )
            .await?;
            return Ok(existing_id);
        }

        // 3. New user signup — insert full row
        let new_user_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO users (
                id, workos_id, email, first_name, last_name, username, bio,
                social_links, profile_picture_url, created_at, updated_at, last_login, is_active
            ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, '[]', ?6, ?7, ?7, ?7, 1)",
            crate::turso_params![
                &new_user_id,
                workos_id,
                email,
                first_name,
                last_name,
                profile_picture_url,
                now
            ],
        )
        .await?;

        log::info!("Created Central DB user row: {} ({})", email, new_user_id);
        Ok(new_user_id)
    }

    pub async fn get_user_by_id(&self, user_id: &str) -> Result<crate::User> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, workos_id, email, first_name, last_name, username, bio, social_links, profile_picture_url, created_at, updated_at, last_login, is_active FROM users WHERE id = ?1 LIMIT 1",
                crate::turso_params![user_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row_to_user(&row)?)
        } else {
            Err(anyhow!("No user found for id: {}", user_id))
        }
    }

    // ── Organization ──────────────────────────────────────────────────────────

    pub async fn get_organization_by_id(&self, org_id: &str) -> Result<Organization> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, name, slug, owner_user_id, plan, subscription_status, subscription_expires_at,
                        cf_account_id, cf_api_token, created_at, updated_at
                 FROM organizations WHERE id = ?1",
                crate::turso_params![org_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row_to_org(&row)?)
        } else {
            Err(anyhow!("Organization not found: {}", org_id))
        }
    }

    /// Find org by owner. Automatically resolves workos_id ("user_...") to users.id if needed.
    pub async fn get_organization_by_owner(&self, owner_id: &str) -> Result<Organization> {
        let internal_id = if owner_id.starts_with("user_") {
            self.get_user_id_by_workos_id(owner_id).await.unwrap_or_else(|_| owner_id.to_string())
        } else {
            owner_id.to_string()
        };

        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, name, slug, owner_user_id, plan, subscription_status, subscription_expires_at,
                        cf_account_id, cf_api_token, created_at, updated_at
                 FROM organizations WHERE owner_user_id = ?1 LIMIT 1",
                crate::turso_params![internal_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row_to_org(&row)?)
        } else {
            Err(anyhow!("Organization not found for owner: {}", owner_id))
        }
    }

    pub async fn get_user_organizations(&self, owner_id: &str) -> Result<Vec<Organization>> {
        let internal_id = if owner_id.starts_with("user_") {
            self.get_user_id_by_workos_id(owner_id).await.unwrap_or_else(|_| owner_id.to_string())
        } else {
            owner_id.to_string()
        };

        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, name, slug, owner_user_id, plan, subscription_status, subscription_expires_at,
                        cf_account_id, cf_api_token, created_at, updated_at
                 FROM organizations WHERE owner_user_id = ?1 ORDER BY created_at ASC",
                crate::turso_params![internal_id],
            )
            .await?;

        let mut orgs = Vec::new();
        while let Some(row) = rows.next().await? {
            if let Ok(org) = row_to_org(&row) {
                orgs.push(org);
            }
        }
        Ok(orgs)
    }

    pub async fn get_user_and_invited_organizations(&self, user_id: &str) -> Result<Vec<Organization>> {
        let internal_id = if user_id.starts_with("user_") {
            self.get_user_id_by_workos_id(user_id).await.unwrap_or_else(|_| user_id.to_string())
        } else {
            user_id.to_string()
        };

        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT DISTINCT o.id, o.name, o.slug, o.owner_user_id, o.plan, o.subscription_status, o.subscription_expires_at,
                        o.cf_account_id, o.cf_api_token, o.created_at, o.updated_at
                 FROM organizations o
                 LEFT JOIN profiles p ON p.organization_id = o.id
                 LEFT JOIN team_members tm ON tm.team_id = p.id
                 WHERE o.owner_user_id = ?1
                    OR (tm.user_id = ?1 AND tm.status = 'accepted')
                 ORDER BY o.created_at ASC",
                crate::turso_params![internal_id],
            )
            .await?;

        let mut orgs = Vec::new();
        while let Some(row) = rows.next().await? {
            if let Ok(org) = row_to_org(&row) {
                orgs.push(org);
            }
        }
        Ok(orgs)
    }

    pub async fn create_organization(
        &self,
        id: &str,
        name: &str,
        owner_id: &str,
    ) -> Result<Organization> {
        let conn = self.conn()?;
        let now = chrono::Utc::now().timestamp();
        let slug = format!("{:08}", rand::Rng::gen_range(&mut rand::thread_rng(), 10000000..=99999999));
        let expires_at = now + (7 * 24 * 60 * 60); // 7 Days Trial

        conn.execute(
            "INSERT INTO organizations (
                id, name, slug, owner_user_id, plan, subscription_status, subscription_expires_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, 'free', 'active', ?5, ?6, ?7)",
            crate::turso_params![id, name, slug, owner_id, expires_at, now, now],
        )
        .await?;

        // Automatically provision a 7-day trial subscription (PRO tier) for the new user without provider
        let sub_id = uuid::Uuid::new_v4().to_string();
        let _ = conn
            .execute(
                "INSERT INTO subscriptions (
                id, user_id, plan_id, status, current_period_end, created_at, updated_at
            ) 
            SELECT ?1, ?2, 'pro', 'trial', ?3, ?4, ?5
            WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ?2)",
                crate::turso_params![sub_id, owner_id, expires_at, now, now],
            )
            .await;

        self.get_organization_by_id(id).await
    }

    // ── License ───────────────────────────────────────────────────────────────

    pub async fn get_license_status(&self, user_id: &str) -> Result<LicenseStatus> {
        let conn = self.conn()?;
        let now = chrono::Utc::now().timestamp();

        // 1. Query subscriptions matching user_id OR any profile owned by the user,
        // prioritizing active/trial/grace statuses and most recently updated.
        let mut rows = conn
            .query(
                "SELECT s.status, s.current_period_end, p.name, s.id, s.plan_id 
                 FROM subscriptions s
                 LEFT JOIN plans p ON s.plan_id = p.id
                 WHERE s.user_id = ?1 OR s.profile_id IN (SELECT id FROM profiles WHERE user_id = ?1)
                 ORDER BY 
                   CASE 
                     WHEN LOWER(COALESCE(s.status, '')) IN ('active', 'trial', 'grace') THEN 0 
                     ELSE 1 
                   END,
                   COALESCE(s.updated_at, 0) DESC,
                   COALESCE(s.created_at, 0) DESC
                 LIMIT 1",
                crate::turso_params![user_id],
            )
            .await?;

        let (mut sub_status, current_period_end, mut plan_name, sub_id) =
            if let Some(row) = rows.next().await? {
                let s: String = row.get::<String>(0).unwrap_or_else(|_| "active".to_string());
                let end: Option<i64> = row.get(1).ok().flatten();
                let p_name: Option<String> = row.get(2).ok().flatten();
                let sid: String = row.get::<String>(3).unwrap_or_default();
                let plan_id_col: Option<String> = row.get(4).ok().flatten();

                let resolved_plan = if let Some(name) = p_name {
                    if !name.trim().is_empty() {
                        name.to_uppercase()
                    } else {
                        "FREE".to_string()
                    }
                } else if let Some(pid) = plan_id_col {
                    if pid.to_lowercase() == "pro" {
                        "PRO".to_string()
                    } else if pid.to_lowercase() == "basic" {
                        "BASIC".to_string()
                    } else if pid.to_lowercase() == "business" {
                        "BUSINESS".to_string()
                    } else {
                        pid.to_uppercase()
                    }
                } else if s.to_lowercase() == "trial" {
                    "PRO".to_string()
                } else {
                    "FREE".to_string()
                };

                (s, end, resolved_plan, sid)
            } else {
                // Check if user has any profile with allocated_plan = 'PRO' or 'BUSINESS'
                if let Ok(mut prof_rows) = conn
                    .query(
                        "SELECT allocated_plan FROM profiles 
                         WHERE user_id = ?1 AND allocated_plan IS NOT NULL AND allocated_plan != 'FREE' 
                         LIMIT 1",
                        crate::turso_params![user_id],
                    )
                    .await
                {
                    if let Ok(Some(p_row)) = prof_rows.next().await {
                        if let Ok(alloc) = p_row.get::<String>(0) {
                            if !alloc.trim().is_empty() && alloc.to_uppercase() != "FREE" {
                                return Ok(LicenseStatus {
                                    status: "active".to_string(),
                                    plan: alloc.to_uppercase(),
                                    expires_at: None,
                                    checked_at: now,
                                    grace_until: None,
                                });
                            }
                        }
                    }
                }

                // Default to FREE if no subscription found
                return Ok(LicenseStatus {
                    status: "active".to_string(),
                    plan: "FREE".to_string(),
                    expires_at: None,
                    checked_at: now,
                    grace_until: None,
                });
            };

        // Normalize millisecond timestamps to seconds if > 100_000_000_000
        let norm_current_period_end = current_period_end.map(|exp| {
            if exp > 100_000_000_000 {
                exp / 1000
            } else {
                exp
            }
        });

        // If plan is FREE or inactive, check if any profile has allocated_plan = 'PRO'
        if plan_name == "FREE" || sub_status.to_lowercase() == "inactive" {
            if let Ok(mut prof_rows) = conn
                .query(
                    "SELECT allocated_plan FROM profiles 
                     WHERE user_id = ?1 AND allocated_plan IS NOT NULL AND allocated_plan != 'FREE' 
                     LIMIT 1",
                    crate::turso_params![user_id],
                )
                .await
            {
                if let Ok(Some(p_row)) = prof_rows.next().await {
                    if let Ok(alloc) = p_row.get::<String>(0) {
                        if !alloc.trim().is_empty() && alloc.to_uppercase() != "FREE" {
                            plan_name = alloc.to_uppercase();
                            sub_status = "active".to_string();
                        }
                    }
                }
            }
        }

        // 7-Day Trial Fallback Engine
        if sub_status.to_lowercase() == "trial" {
            if let Some(exp) = norm_current_period_end {
                if exp < now {
                    // Trial expired -> Fallback to FREE
                    let _ = conn.execute(
                        "UPDATE subscriptions SET plan_id = 'free', status = 'active', current_period_end = NULL WHERE id = ?1",
                        crate::turso_params![sub_id],
                    ).await;
                    let _ = conn.execute(
                        "UPDATE profiles SET allocated_plan = 'FREE', plan_allocated_at = 0 WHERE user_id = ?1",
                        crate::turso_params![user_id],
                    ).await;
                    plan_name = "FREE".to_string();
                    sub_status = "active".to_string();
                }
            }
        }

        let status = match sub_status.to_lowercase().as_str() {
            "active" => {
                // If marked active in DB, keep active unless expired > 7 days ago
                if let Some(exp) = norm_current_period_end {
                    if exp > 0 && exp < (now - 7 * 86400) {
                        "inactive".to_string()
                    } else {
                        "active".to_string()
                    }
                } else {
                    "active".to_string()
                }
            }
            "trial" => "trial".to_string(), // Active during trial period
            "cancelled" => {
                if let Some(exp) = norm_current_period_end {
                    if exp >= now {
                        "grace".to_string()
                    } else {
                        "cancelled".to_string()
                    }
                } else {
                    "cancelled".to_string()
                }
            }
            "grace" => "grace".to_string(),
            other => {
                if plan_name != "FREE" && (other.is_empty() || other == "active") {
                    "active".to_string()
                } else {
                    other.to_string()
                }
            }
        };

        Ok(LicenseStatus {
            status,
            plan: plan_name,
            expires_at: norm_current_period_end,
            checked_at: now,
            grace_until: if sub_status.to_lowercase() == "cancelled" {
                norm_current_period_end
            } else {
                None
            },
        })
    }

    // ── Deployments ───────────────────────────────────────────────────────────

    pub async fn get_deployments(&self, org_id: &str) -> Result<Vec<Deployment>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, organization_id, profile_id, deployment_id, deploy_mode,
                        cf_deployment_url, cf_worker_name, encryption_secret, custom_domain, current_version,
                        latest_version, status, deployed_at, created_at, updated_at
                 FROM deployments WHERE organization_id = ?1
                 ORDER BY created_at DESC",
                crate::turso_params![org_id],
            )
            .await?;

        let mut deployments = Vec::new();
        while let Some(row) = rows.next().await? {
            deployments.push(row_to_deployment(&row)?);
        }
        Ok(deployments)
    }

    pub async fn register_deployment(&self, d: &Deployment) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO deployments
               (id, organization_id, profile_id, deployment_id, deploy_mode, custom_domain,
                cf_deployment_url, cf_worker_name, encryption_secret, status, current_version, latest_version, deployed_at, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, unixepoch(), unixepoch())",
            crate::turso_params![
                d.id.clone(), d.organization_id.clone(), d.profile_id.clone(),
                d.deployment_id.clone(), d.deploy_mode.clone(), d.custom_domain.clone(),
                d.cf_deployment_url.clone(), d.cf_worker_name.clone(), d.encryption_secret.clone(), d.status.clone(),
                d.current_version.clone(), d.latest_version.clone(), d.deployed_at.unwrap_or_else(|| chrono::Utc::now().timestamp())
            ],
        )
        .await?;
        Ok(())
    }

    pub async fn update_deployment_version(
        &self,
        deployment_id: &str,
        version: &str,
        cf_deployment_url: &str,
        status: &str,
    ) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE deployments
             SET current_version = ?1, status = ?2, cf_deployment_url = ?3,
                 deployed_at = unixepoch(), updated_at = unixepoch()
             WHERE id = ?4",
            crate::turso_params![version, status, cf_deployment_url, deployment_id],
        )
        .await?;
        Ok(())
    }

    pub async fn register_custom_domain(
        &self,
        domain_id: &str,
        profile_id: &str,
        domain: &str,
    ) -> Result<()> {
        let conn = self.conn()?;
        // Upsert custom domain for the profile
        conn.execute(
            "INSERT INTO custom_domains (id, profile_id, domain, is_verified, ssl_status)
             VALUES (?1, ?2, ?3, 1, 'active')
             ON CONFLICT(profile_id) DO UPDATE SET
                domain = excluded.domain,
                is_verified = 1,
                ssl_status = 'active',
                updated_at = strftime('%s','now')",
            crate::turso_params![domain_id, profile_id, domain],
        )
        .await?;

        // Also update the deployments table
        conn.execute(
            "UPDATE deployments SET custom_domain = ?1, updated_at = strftime('%s','now') WHERE profile_id = ?2",
            crate::turso_params![domain, profile_id],
        ).await?;

        Ok(())
    }

    /// Fetch raw UserDB credentials for a profile from the central DB.
    ///
    /// NOTE: turso_auth_token is AES-256-GCM encrypted with ENCRYPTION_SECRET.
    /// Decryption happens server-side (Cloudflare Worker) — never client-side.
    /// Call `get_userdb_creds_decrypted()` which hits the /api/user/db-token endpoint.
    /// Returns (turso_url, encrypted_token, last_provisioned_at) in one query.
    /// last_provisioned_at = None means UserDB has never been provisioned.
    pub async fn get_userdb_creds_full(
        &self,
        profile_id: &str,
    ) -> Result<(String, String, Option<i64>, Option<String>)> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT turso_database_url, turso_auth_token, last_provisioned_at, schema_version
                 FROM userdb WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok((row.get(0)?, row.get(1)?, row.get(2).ok().flatten(), row.get(3).ok().flatten()))
        } else {
            Err(anyhow!("No UserDB credentials for profile: {}", profile_id))
        }
    }

    /// Stamps last_provisioned_at = now() after successful provision.
    pub async fn mark_provisioned(&self, profile_id: &str) -> Result<()> {
        let conn = self.conn()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let version = crate::db::schema_version::SCHEMA_VERSION;
        conn.execute(
            "UPDATE userdb SET last_provisioned_at = ?1, schema_version = ?2, updated_at = ?1 WHERE profile_id = ?3",
            crate::turso_params![now, version, profile_id],
        )
        .await?;
        Ok(())
    }

    /// Update the schema_version in the Central DB after successful migrations
    pub async fn update_schema_version(&self, profile_id: &str, version: &str) -> Result<()> {
        let conn = self.conn()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        conn.execute(
            "UPDATE userdb SET schema_version = ?1, updated_at = ?2 WHERE profile_id = ?3",
            crate::turso_params![version, now, profile_id],
        )
        .await?;
        Ok(())
    }

    pub async fn update_userdb_creds(
        &self,
        profile_id: &str,
        url: &str,
        token: &str,
    ) -> Result<()> {
        let conn = self.conn()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let mut rows = conn
            .query("SELECT id FROM userdb WHERE profile_id = ?1 LIMIT 1", crate::turso_params![profile_id])
            .await?;
        if rows.next().await?.is_some() {
            conn.execute(
                "UPDATE userdb SET turso_database_url = ?1, turso_auth_token = ?2, updated_at = ?3 WHERE profile_id = ?4",
                crate::turso_params![url, token, now, profile_id],
            )
            .await?;
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO userdb (id, profile_id, turso_database_url, turso_auth_token, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                crate::turso_params![id, profile_id, url, token, now],
            )
            .await?;
        }
        Ok(())
    }

    pub async fn get_userauth_creds(&self, profile_id: &str) -> Result<(String, String, String)> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT workos_client_id, workos_api_key, workos_redirect_uri
                 FROM userauth WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        } else {
            Err(anyhow!("No userauth row for profile: {}", profile_id))
        }
    }

    pub async fn upsert_userauth_creds(
        &self,
        id: &str,
        profile_id: &str,
        client_id: &str,
        api_key: &str,
        redirect_uri: &str,
    ) -> Result<()> {
        let conn = self.conn()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        conn.execute(
            "INSERT INTO userauth (id, profile_id, workos_client_id, workos_api_key, workos_redirect_uri, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(profile_id) DO UPDATE SET
               workos_client_id = excluded.workos_client_id,
               workos_api_key = excluded.workos_api_key,
               workos_redirect_uri = excluded.workos_redirect_uri,
               updated_at = excluded.updated_at",
            crate::turso_params![id, profile_id, client_id, api_key, redirect_uri, now, now]
        ).await?;
        Ok(())
    }

    /// Lightweight provision-status check — only fetches last_provisioned_at and schema_version.
    pub async fn get_provision_status_light(
        &self,
        profile_id: &str,
    ) -> Result<(Option<i64>, Option<String>)> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT last_provisioned_at, schema_version, turso_database_url FROM userdb WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            let url: Option<String> = row.get(2).ok().flatten();
            if let Some(u) = url {
                if !u.trim().is_empty() {
                    return Ok((row.get(0).ok().flatten(), row.get(1).ok().flatten()));
                }
            }
            Err(anyhow!("UserDB url empty for profile: {}", profile_id))
        } else {
            Err(anyhow!("No userdb row for profile: {}", profile_id))
        }
    }

    /// Single round-trip: turso_database_url + last_provisioned_at together.
    pub async fn get_url_and_provision_status(
        &self,
        profile_id: &str,
    ) -> Result<(String, Option<i64>, Option<String>)> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT turso_database_url, last_provisioned_at, schema_version FROM userdb WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            let url: String = row.get(0).unwrap_or_default();
            let lpa: Option<i64> = row.get(1).ok().flatten();
            let sv: Option<String> = row.get(2).ok().flatten();
            Ok((url, lpa, sv))
        } else {
            Err(anyhow!("No userdb row for profile: {}", profile_id))
        }
    }

    /// Fetch only the turso_database_url column — no encrypted token transfer.
    pub async fn get_turso_url(&self, profile_id: &str) -> Result<String> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT turso_database_url FROM userdb WHERE profile_id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            Ok(row.get::<String>(0).unwrap_or_default())
        } else {
            Err(anyhow!("No userdb row for profile: {}", profile_id))
        }
    }

    // ── Profiles list ─────────────────────────────────────────────────────────

    /// Primary: fetch all profiles for a user by user_id.
    /// profiles.user_id = users.id (internal UUID). Pass users.id, NOT workos_id.
    pub async fn get_profiles_for_user(&self, user_id: &str) -> Result<Vec<crate::Profile>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT DISTINCT p.id, p.user_id, p.slug, p.title, p.bio, p.avatar_url, p.organization_id,
                        p.created_at, p.updated_at, p.allocated_plan, p.plan_allocated_at
                 FROM profiles p
                 LEFT JOIN organizations o ON o.id = p.organization_id
                 LEFT JOIN team_members tm ON tm.team_id = p.id
                 WHERE p.user_id = ?1 OR o.owner_user_id = ?1 OR (tm.user_id = ?1 AND tm.status = 'accepted')
                 ORDER BY p.created_at ASC",
                crate::turso_params![user_id],
            )
            .await?;

        let mut profiles = Vec::new();
        while let Some(row) = rows.next().await? {
            if let Ok(p) = row_to_profile(&row) {
                profiles.push(p);
            }
        }
        Ok(profiles)
    }

    /// Fallback: fetch profiles by organization_id (used when user_id unavailable).
    pub async fn get_profiles_for_org(&self, org_id: &str) -> Result<Vec<crate::Profile>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, user_id, slug, title, bio, avatar_url, organization_id,
                        created_at, updated_at, allocated_plan, plan_allocated_at
                 FROM profiles WHERE organization_id = ?1 ORDER BY created_at ASC",
                crate::turso_params![org_id],
            )
            .await?;

        let mut profiles = Vec::new();
        while let Some(row) = rows.next().await? {
            if let Ok(p) = row_to_profile(&row) {
                profiles.push(p);
            }
        }
        Ok(profiles)
    }

    /// Get profiles for an org plus any team-member profiles the user has access to within that org.
    /// org_id = organizations.id, user_id = users.id (internal UUID, NOT workos_id).
    pub async fn get_profiles_for_org_and_invites(&self, org_id: &str, user_id: &str) -> Result<Vec<crate::Profile>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT DISTINCT p.id, p.user_id, p.slug, p.title, p.bio, p.avatar_url, p.organization_id,
                        p.created_at, p.updated_at, p.allocated_plan, p.plan_allocated_at
                 FROM profiles p
                 LEFT JOIN organizations o ON o.id = p.organization_id
                 LEFT JOIN team_members tm ON tm.team_id = p.id
                 WHERE (p.organization_id = ?1 AND (p.user_id = ?2 OR o.owner_user_id = ?2 OR (tm.user_id = ?2 AND tm.status = 'accepted')))
                    OR p.user_id = ?2
                 ORDER BY p.created_at ASC",
                crate::turso_params![org_id, user_id],
            )
            .await?;

        let mut profiles = Vec::new();
        while let Some(row) = rows.next().await? {
            if let Ok(p) = row_to_profile(&row) {
                profiles.push(p);
            }
        }
        Ok(profiles)
    }

    pub async fn create_profile(
        &self,
        id: &str,
        user_id: &str,
        slug: &str,
        title: &str,
        org_id: &str,
        allocated_plan: &str,
        plan_allocated_at: i64,
    ) -> Result<crate::Profile> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO profiles (id, user_id, slug, title, organization_id, created_at, updated_at, allocated_plan, plan_allocated_at, home_page, enabled_categories)
             VALUES (?1,?2,?3,?4,?5, unixepoch(), unixepoch(), ?6, ?7, '/home', '[\"all\", \"links\", \"about\"]')",
            crate::turso_params![id, user_id, slug, title, org_id, allocated_plan, plan_allocated_at],
        )
        .await?;
        self.get_profile_by_id(id).await
    }

    pub async fn get_profile_by_id(&self, profile_id: &str) -> Result<crate::Profile> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT id, user_id, slug, title, bio, avatar_url, organization_id,
                        created_at, updated_at, allocated_plan, plan_allocated_at
                 FROM profiles WHERE id = ?1",
                crate::turso_params![profile_id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row_to_profile(&row)?)
        } else {
            Err(anyhow!("Profile not found: {}", profile_id))
        }
    }

    pub async fn sync_profile_to_central(&self, row: &crate::db::user::ProfileRow) -> Result<()> {
        let conn = self.conn()?;
        // Sync the fields from UserDB's ProfileRow to CentralDB's profiles table.
        // We only sync fields that exist in the CentralDB profiles schema (schema.ts).
        conn.execute(
            "UPDATE profiles SET 
                title = ?1,
                bio = ?2,
                about = ?3,
                avatar_url = ?4,
                navigation_menu = ?5,
                enabled_categories = ?6,
                category_visibility = ?7,
                home_visibility = ?8,
                about_visibility = ?9,
                landing_visibility = ?10,
                info_visibility = ?11,
                cover_images = ?12,
                collect_emails = ?13,
                profile_theme = ?14,
                social_links = ?15,
                footer_menu = ?16,
                support_email = ?17,
                is_primary = ?18,
                welcome_video_url = ?19,
                form_id = ?20,
                home_page = ?21,
                updated_at = unixepoch()
             WHERE id = ?22",
            crate::turso_params![
                row.title.clone(),
                row.bio.clone(),
                row.about.clone(),
                row.avatar_url.clone(),
                row.navigation_menu
                    .clone()
                    .unwrap_or_else(|| "[]".to_string()),
                row.enabled_categories
                    .clone()
                    .unwrap_or_else(|| "[\"all\", \"links\", \"about\"]".to_string()),
                row.category_visibility
                    .clone()
                    .unwrap_or_else(|| "{}".to_string()),
                row.home_visibility
                    .clone()
                    .unwrap_or_else(|| "{}".to_string()),
                row.about_visibility
                    .clone()
                    .unwrap_or_else(|| "{}".to_string()),
                row.landing_visibility
                    .clone()
                    .unwrap_or_else(|| "{}".to_string()),
                row.info_visibility
                    .clone()
                    .unwrap_or_else(|| "{}".to_string()),
                row.cover_images.clone().unwrap_or_else(|| "[]".to_string()),
                row.collect_emails
                    .clone()
                    .unwrap_or_else(|| "{}".to_string()),
                row.profile_theme
                    .clone()
                    .unwrap_or_else(|| "{}".to_string()),
                row.social_links.clone().unwrap_or_else(|| "[]".to_string()),
                row.footer_menu.clone().unwrap_or_else(|| "[]".to_string()),
                row.support_email.clone(),
                if row.is_primary { 1i64 } else { 0i64 },
                row.welcome_video_url.clone(),
                row.form_id.clone(),
                row.home_page.clone().unwrap_or_else(|| "/home".to_string()),
                row.id.clone()
            ],
        )
        .await?;

        Ok(())
    }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

fn row_to_org(row: &TursoRow) -> Result<Organization> {
    Ok(Organization {
        id: row.get(0)?,
        name: row.get(1)?,
        slug: row.get(2).ok().flatten(),
        owner_user_id: row.get(3)?,
        plan: row.get(4).ok().flatten(),
        subscription_status: row.get(5).ok().flatten(),
        subscription_expires_at: row.get(6).ok().flatten(),
        cf_account_id: row.get(7).ok().flatten(),
        cf_api_token: row.get(8).ok().flatten(),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn row_to_deployment(row: &TursoRow) -> Result<Deployment> {
    Ok(Deployment {
        id: row.get(0)?,
        organization_id: row.get(1)?,
        profile_id: row.get(2)?,
        deployment_id: row.get(3).ok().flatten(),
        deploy_mode: row.get(4)?,
        cf_deployment_url: row.get(5)?,
        cf_worker_name: row.get(6)?,
        encryption_secret: row.get(7)?,
        custom_domain: row.get(8)?,
        current_version: row.get(9)?,
        latest_version: row.get(10)?,
        status: row.get(11)?,
        deployed_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn row_to_profile(row: &TursoRow) -> Result<crate::Profile> {
    Ok(crate::Profile {
        id: row.get(0)?,
        user_id: row.get(1)?,
        slug: row.get(2)?,
        title: row.get(3)?,
        bio: row.get(4).ok().flatten(),
        avatar_url: row.get(5).ok().flatten(),
        organization_id: row.get(6).ok().flatten(),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        allocated_plan: row.get(9).ok().flatten(),
        plan_allocated_at: row.get(10).ok().flatten(),
    })
}

// ── Generated Mappers ─────────────────────────────────────────────────────────

#[allow(dead_code)]
fn row_to_session(row: &TursoRow) -> crate::Result<crate::Session> {
    Ok(crate::Session {
        id: row.get(0)?,
        user_id: row.get(1)?,
        expires_at: row.get(2)?,
        created_at: row.get(3)?,
    })
}

#[allow(dead_code)]
fn row_to_category(row: &TursoRow) -> crate::Result<crate::Category> {
    Ok(crate::Category {
        id: row.get(0)?,
        name: row.get(1)?,
        slug: row.get(2)?,
        description: row.get(3).ok().flatten(),
        created_at: row.get(4)?,
        order: row.get(5).ok().flatten(),
    })
}

#[allow(dead_code)]
fn row_to_subscriber(row: &TursoRow) -> crate::Result<crate::Subscriber> {
    Ok(crate::Subscriber {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        email: row.get(2)?,
        name: row.get(3).ok().flatten(),
        referrer_domain: row.get(4).ok().flatten(),
        timezone: row.get(5).ok().flatten(),
        browser_name: row.get(6).ok().flatten(),
        os_name: row.get(7).ok().flatten(),
        device_type: row.get(8).ok().flatten(),
        ip_address: row.get(9).ok().flatten(),
        country: row.get(10).ok().flatten(),
        city: row.get(11).ok().flatten(),
        signup_timestamp: row.get(12)?,
    })
}

#[allow(dead_code)]
fn row_to_plan(row: &TursoRow) -> crate::Result<crate::Plan> {
    Ok(crate::Plan {
        id: row.get(0)?,
        name: row.get(1)?,
        display_name: row.get(2)?,
        price_cents: row.get(3)?,
        stripe_price_id: row.get(4).ok().flatten(),
        paddle_product_id: row.get(5).ok().flatten(),
        paddle_price_id_monthly: row.get(6).ok().flatten(),
        paddle_price_id_yearly: row.get(7).ok().flatten(),
        features: row.get(8).ok().flatten(),
        created_at: row.get(9)?,
    })
}

#[allow(dead_code)]
fn row_to_subscription(row: &TursoRow) -> crate::Result<crate::Subscription> {
    Ok(crate::Subscription {
        id: row.get(0)?,
        user_id: row.get(1)?,
        plan_id: row.get(2).ok().flatten(),
        provider: row.get(3)?,
        external_customer_id: row.get(4).ok().flatten(),
        external_subscription_id: row.get(5).ok().flatten(),
        paddle_customer_id: row.get(6).ok().flatten(),
        paddle_subscription_id: row.get(7).ok().flatten(),
        paddle_transaction_id: row.get(8).ok().flatten(),
        status: row.get(9)?,
        current_period_end: row.get(10).ok().flatten(),
        updated_at: row.get(11)?,
        profile_id: row.get(12).ok().flatten(),
    })
}

#[allow(dead_code)]
fn row_to_custom_domain(row: &TursoRow) -> crate::Result<crate::CustomDomain> {
    Ok(crate::CustomDomain {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        domain: row.get(2)?,
        is_verified: row.get(3)?,
        verified_at: row.get(4).ok().flatten(),
        ssl_status: row.get(5).ok().flatten(),
        cf_hostname_id: row.get(6).ok().flatten(),
        cf_dns_record_id: row.get(7).ok().flatten(),
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[allow(dead_code)]
fn row_to_user(row: &TursoRow) -> crate::Result<crate::User> {
    Ok(crate::User {
        id: row.get(0)?,
        workos_id: row.get(1)?,
        email: row.get(2)?,
        first_name: row.get(3).ok().flatten(),
        last_name: row.get(4).ok().flatten(),
        username: row.get(5).ok().flatten(),
        bio: row.get(6).ok().flatten(),
        social_links: row.get(7)?,
        profile_picture_url: row.get(8).ok().flatten(),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        last_login: row.get(11).ok().flatten(),
        is_active: row.get(12)?,
    })
}

#[allow(dead_code)]
fn row_to_team(row: &TursoRow) -> crate::Result<crate::Team> {
    Ok(crate::Team {
        id: row.get(0)?,
        name: row.get(1)?,
        slug: row.get(2)?,
        description: row.get(3).ok().flatten(),
        profile_id: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

#[allow(dead_code)]
fn row_to_team_member(row: &TursoRow) -> crate::Result<crate::TeamMember> {
    Ok(crate::TeamMember {
        id: row.get(0)?,
        team_id: row.get(1)?,
        user_id: row.get(2)?,
        role: row.get(3)?,
        invited_by: row.get(4).ok().flatten(),
        invited_at: row.get(5)?,
        joined_at: row.get(6).ok().flatten(),
        status: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[allow(dead_code)]
fn row_to_team_invite(row: &TursoRow) -> crate::Result<crate::TeamInvite> {
    Ok(crate::TeamInvite {
        id: row.get(0)?,
        team_id: row.get(1)?,
        email: row.get(2)?,
        role: row.get(3)?,
        invited_by: row.get(4)?,
        token: row.get(5)?,
        expires_at: row.get(6)?,
        status: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[allow(dead_code)]
fn row_to_payout_account(row: &TursoRow) -> crate::Result<crate::PayoutAccount> {
    Ok(crate::PayoutAccount {
        id: row.get(0)?,
        user_id: row.get(1)?,
        label: row.get(2).ok().flatten(),
        method: row.get(3)?,
        email: row.get(4).ok().flatten(),
        stripe_account_id: row.get(5).ok().flatten(),
        account_holder: row.get(6).ok().flatten(),
        bank_name: row.get(7).ok().flatten(),
        bank_country: row.get(8).ok().flatten(),
        currency: row.get(9).ok().flatten(),
        iban: row.get(10).ok().flatten(),
        swift_bic: row.get(11).ok().flatten(),
        routing_number: row.get(12).ok().flatten(),
        account_number: row.get(13).ok().flatten(),
        sort_code: row.get(14).ok().flatten(),
        ifsc_code: row.get(15).ok().flatten(),
        is_default: row.get(16)?,
        is_verified: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}
