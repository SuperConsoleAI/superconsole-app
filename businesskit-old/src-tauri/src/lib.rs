#![recursion_limit = "512"]
// src-tauri/src/lib.rs
// Shared types, AppState, error handling

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

pub mod commands;
pub mod db;
pub mod deploy;
pub mod license;
pub mod rbac;
pub mod vault;

// ── Error type ────────────────────────────────────────────────────────────────

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("License expired or inactive")]
    LicenseInactive,

    #[error("Not connected: {0}")]
    NotConnected(String),

    #[error("Keyring error: {0}")]
    Keyring(String),

    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("{0}")]
    Other(String),
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

// Tauri commands require Result<T, String>
impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}

// ── Domain types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub id: String,
    pub name: String,
    pub slug: Option<String>,
    pub owner_user_id: String,
    pub plan: Option<String>,
    pub subscription_status: Option<String>,
    pub subscription_expires_at: Option<i64>,
    pub cf_account_id: Option<String>,
    pub cf_api_token: Option<String>, // encrypted in DB
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub user_id: String,
    pub slug: String,
    pub title: String,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
    pub organization_id: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub allocated_plan: Option<String>,
    pub plan_allocated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub status: String, // active | inactive | cancelled | grace
    pub plan: String,
    pub expires_at: Option<i64>,
    pub checked_at: i64,
    pub grace_until: Option<i64>,
}

impl LicenseStatus {
    pub fn is_active(&self) -> bool {
        matches!(self.status.to_lowercase().as_str(), "active" | "grace" | "trial") || self.plan.to_uppercase() != "FREE"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deployment {
    pub id: String,
    pub organization_id: String,
    pub profile_id: String,
    pub deployment_id: Option<String>,
    pub deploy_mode: String, // project | workspace
    pub custom_domain: Option<String>,
    pub cf_deployment_url: Option<String>,
    pub cf_worker_name: Option<String>,
    pub encryption_secret: String,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub status: String, // pending | active | failed
    pub deployed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDbCredentials {
    pub turso_url: String,
    pub turso_token: String,
}

// ── AppState ──────────────────────────────────────────────────────────────────

pub struct AppState {
    pub central_db: Arc<RwLock<Option<db::central::CentralDb>>>, // None until connected
    pub user_db: Arc<RwLock<Option<db::user::UserDb>>>,
    pub active_profile_id: Arc<RwLock<Option<String>>>,
    pub license: Arc<RwLock<LicenseStatus>>,
    pub organization: Arc<RwLock<Option<Organization>>>,
    /// Profiles fully connected this session — skip guard queries on re-switch.
    pub ready_profiles: Arc<RwLock<std::collections::HashSet<String>>>,
    /// Per-profile schema cache (tables/indexes/triggers/views) with 5-min TTL.
    /// Keyed by profile_id. Avoids re-querying Turso on every status page visit.
    pub schema_cache:
        Arc<RwLock<std::collections::HashMap<String, (serde_json::Value, std::time::Instant)>>>,
    /// Last setup_app error — None if setup completed successfully
    pub setup_error: Arc<RwLock<Option<String>>>,
    /// Cached auth session in RAM to avoid expensive disk/keychain reads on every call
    pub auth_session: Arc<RwLock<Option<crate::commands::auth::AuthInfo>>>,
    pub chat_cancels: Arc<crate::commands::agents::ChatCancelState>,
}

impl AppState {
    pub fn new_empty() -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            central_db: Arc::new(RwLock::new(None)),
            user_db: Arc::new(RwLock::new(None)),
            active_profile_id: Arc::new(RwLock::new(None)),
            license: Arc::new(RwLock::new(LicenseStatus {
                status: "active".to_string(),
                plan: "FREE".to_string(),
                expires_at: None,
                checked_at: now,
                grace_until: None,
            })),
            organization: Arc::new(RwLock::new(None)),
            ready_profiles: Arc::new(RwLock::new(std::collections::HashSet::new())),
            schema_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
            setup_error: Arc::new(RwLock::new(None)),
            auth_session: Arc::new(RwLock::new(None)),
            chat_cancels: Arc::new(crate::commands::agents::ChatCancelState::default()),
        }
    }

    /// Returns Err if license is not active
    pub async fn require_license(&self) -> std::result::Result<(), String> {
        let lic = self.license.read().await;
        if matches!(lic.status.to_lowercase().as_str(), "active" | "grace" | "trial") || lic.plan.to_uppercase() == "FREE" {
            return Ok(());
        }

        // Self-healing fallback 1: check if active profile has an allocated PRO plan
        let active_prof = self.active_profile_id.read().await.clone();
        if let Some(prof_id) = active_prof {
            if let Ok(cdb) = self.cdb().await {
                if let Ok(profile) = cdb.get_profile_by_id(&prof_id).await {
                    if let Some(ref plan) = profile.allocated_plan {
                        let p = plan.trim().to_uppercase();
                        if p == "PRO" || p == "BASIC" || p == "BUSINESS" || p == "ENTERPRISE" {
                            drop(lic);
                            *self.license.write().await = LicenseStatus {
                                status: "active".to_string(),
                                plan: p,
                                expires_at: None,
                                checked_at: chrono::Utc::now().timestamp(),
                                grace_until: None,
                            };
                            return Ok(());
                        }
                    }
                }
            }
        }

        // Self-healing fallback 2: if user has a valid cached session or user_id, re-check Central DB
        let user_id = self.get_current_user_id().await;
        if user_id != "owner" && !user_id.is_empty() {
            if let Ok(cdb) = self.cdb().await {
                if let Ok(fresh) = cdb.get_license_status(&user_id).await {
                    if matches!(fresh.status.to_lowercase().as_str(), "active" | "grace" | "trial") || fresh.plan.to_uppercase() != "FREE" {
                        drop(lic);
                        *self.license.write().await = fresh;
                        return Ok(());
                    }
                }
            }
        }

        Err("License inactive. Please check your subscription.".to_string())
    }

    /// Returns active profile id or Err
    pub async fn require_profile(&self) -> std::result::Result<String, String> {
        self.active_profile_id
            .read()
            .await
            .clone()
            .ok_or_else(|| "No active project selected.".to_string())
    }

    /// Returns the currently logged in user ID, or cached user ID, or 'owner' as fallback
    pub async fn get_current_user_id(&self) -> String {
        if let Some(ref session) = *self.auth_session.read().await {
            return session.user.id.clone();
        }
        if let Ok(Some(auth_info)) = commands::auth::auth_status_native(self).await {
            return auth_info.user.id;
        }
        if let Some(uid) = license::load_cached_user_id() {
            return uid;
        }
        "owner".to_string()
    }

    /// Returns active organization, self-healing from Central DB if state.organization is None.
    pub async fn require_organization(&self) -> std::result::Result<Organization, String> {
        let mut org_opt = self.organization.read().await.clone();
        if org_opt.is_none() {
            let auth_info = commands::auth::auth_status_native(self).await.ok().flatten();
            let workos_id = auth_info.as_ref().map(|a| a.user.workos_id.clone());
            let cached_uid = license::load_cached_user_id();

            let mut users_id = String::new();
            if let Some(ref w_id) = workos_id {
                if let Ok(db) = self.cdb().await {
                    if let Ok(res_id) = db.get_user_id_by_workos_id(w_id).await {
                        users_id = res_id;
                    }
                }
            }
            if users_id.is_empty() {
                if let Some(ref c_id) = cached_uid {
                    users_id = c_id.clone();
                }
            }
            if users_id.is_empty() {
                let curr = self.get_current_user_id().await;
                if curr != "owner" {
                    users_id = curr;
                }
            }

            if !users_id.is_empty() {
                if let Ok(db) = self.cdb().await {
                    if let Ok(orgs) = db.get_user_and_invited_organizations(&users_id).await {
                        if let Some(fetched) = orgs.into_iter().next() {
                            *self.organization.write().await = Some(fetched.clone());
                            org_opt = Some(fetched);
                        }
                    }

                    if org_opt.is_none() {
                        let new_id = uuid::Uuid::new_v4().to_string();
                        match db.create_organization(&new_id, "Personal", &users_id).await {
                            Ok(new_org) => {
                                log::info!("Auto-created Personal organization {} for user {}", new_id, users_id);
                                *self.organization.write().await = Some(new_org.clone());
                                org_opt = Some(new_org);
                            }
                            Err(e) => {
                                log::error!("Failed to create Personal organization for user {}: {}", users_id, e);
                            }
                        }
                    }
                }
            }
        }

        org_opt.ok_or_else(|| "No organization loaded — please sign in".to_string())
    }

    /// Returns user db or Err, self-healing from file cache if user_db is None.
    pub async fn require_user_db(&self) -> std::result::Result<db::user::UserDb, String> {
        let guard = self.user_db.read().await.clone();
        if let Some(db) = guard {
            return Ok(db);
        }

        // Self-heal: attempt connecting from cached profile_id
        let profile_id = self.active_profile_id.read().await.clone()
            .or_else(|| license::load_cached_profile_id());

        if let Some(pid) = profile_id {
            log::info!("require_user_db: user_db is None, auto-connecting profile {}", pid);
            if let Ok(creds) = commands::organization::load_from_keychain(&pid) {
                if let Ok(db) = db::user::UserDb::connect(&creds.0, &creds.1).await {
                    *self.active_profile_id.write().await = Some(pid);
                    *self.user_db.write().await = Some(db.clone());
                    return Ok(db);
                }
            }
        }

        Err("Not connected to project database.".to_string())
    }

    /// Returns true if Central DB is connected (after async setup)
    pub async fn has_central_db(&self) -> bool {
        self.central_db.read().await.is_some()
    }

    /// Returns Err if Central DB not connected yet (still starting up).
    /// Use: let db = state.cdb().await?; db.get_xxx().await
    pub async fn cdb(&self) -> std::result::Result<db::central::CentralDbRef<'_>, String> {
        let guard = self.central_db.read().await;
        if guard.is_some() {
            Ok(db::central::CentralDbRef(guard))
        } else {
            Err("Central DB not connected yet — app is still starting up.".to_string())
        }
    }
}

// ── Tauri app entry ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── Load .env — must be before ANY std::env::var() call ───────────────────
    // CARGO_MANIFEST_DIR = /Users/2.o/businesskit/src-tauri  (set at compile time)
    // Project root .env  = /Users/2.o/businesskit/.env
    // We try two locations so it works regardless of CWD:
    let manifest_dir = env!("CARGO_MANIFEST_DIR"); // src-tauri/
    let project_env = std::path::Path::new(manifest_dir).join("../.env");
    dotenvy::from_path(&project_env).ok(); // preferred: absolute project root
    dotenvy::dotenv().ok(); // fallback: CWD (production .app bundle)

    // ── Clear stale dev-bypass token when real WorkOS creds are now set ─────────
    // Without this: a previous dev-bypass run stores "dev-session-token" in
    // keychain → check_session() returns true → login screen is forever skipped.
    let client_id = option_env!("WORKOS_CLIENT_ID")
        .map(String::from)
        .or_else(|| std::env::var("WORKOS_CLIENT_ID").ok())
        .unwrap_or_default();
    if !client_id.is_empty() {
        // Real WorkOS configured — dev-bypass is disabled
    }
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::{Manager, Emitter};
            
            // Re-register links inside the single instance context
            let _ = tauri_plugin_deep_link::DeepLinkExt::deep_link(app).register_all();

            // Bring the main window to the front when a second instance (or deep link) tries to open
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            
            // If the deep-link was passed as an argument, we emit it manually so the frontend hears it
            // The deep-link plugin usually handles this, but on some OS versions single-instance intercepts it
            if let Some(url) = args.iter().find(|a| a.starts_with("businesskit://")) {
                let _ = app.emit("scheme-request-received", url);
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            use tauri::Listener;
            
            // Force macOS to bring the app to the front when a deep link is received
            let app_handle = app.handle().clone();
            app_handle.clone().listen("deep-link://new-url", move |_| {
                if let Some(window) = app_handle.get_webview_window("main") {
                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    {
                        let _ = window.unminimize();
                    }
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            #[cfg(any(target_os = "windows", target_os = "linux"))]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
            }

            // Cleanup any legacy exposed ~/creds or ~/files/creds directories
            crate::license::cleanup_legacy_exposed_dirs();

            // ── CRITICAL: manage() MUST be called synchronously in setup()
            // before invoke_handler can inject State<AppState>.
            let central_url = std::env::var("TURSO_DATABASE_URL")
                .or_else(|_| std::env::var("CENTRAL_TURSO_URL"))
                .unwrap_or_else(|_| {
                    let val = option_env!("TURSO_DATABASE_URL").unwrap_or("");
                    if val.is_empty() {
                        "https://qwik-linkinbio-2o-fromcreator.aws-ap-south-1.turso.io".to_string()
                    } else {
                        val.to_string()
                    }
                });
            let central_token = std::env::var("TURSO_AUTH_TOKEN")
                .or_else(|_| std::env::var("CENTRAL_TURSO_TOKEN"))
                .unwrap_or_else(|_| {
                    let val = option_env!("TURSO_AUTH_TOKEN").unwrap_or("");
                    if val.is_empty() {
                        "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM4Njc5MzMsImlkIjoiZWY3M2ViZmUtYTM0NS00NDhjLWE0YzItMzZmMWJmYTAzYzgxIiwia2lkIjoiVmIzeEZWWDAxeTBoSHJOVl9zaFFIeWVUdGpyd1BVRHcwRENycmw3Q3F4RSIsInJpZCI6Ijk0YmYxNTlhLTQ1ZWYtNGNkYy05NGNhLTgxZjY5OTU5NWJlNSJ9.joilZhh_0pmYThrNFSyS14gHkDoR-9FAMqP3vIZzZezNAAt__58K6st9IywPowaCe70uzFCxXcwCMVG1weZ4AA".to_string()
                    } else {
                        val.to_string()
                    }
                });

            if central_url.is_empty() {
                log::warn!("TURSO_DATABASE_URL is empty at runtime and compile-time!");
            } else {
                log::info!("CentralDB URL is configured.");
            }

            // Build empty AppState — manage() called SYNCHRONOUSLY before spawn
            let state = Arc::new(AppState::new_empty());
            app.manage(state.clone());

            // PTY SessionManager — desktop builds only (no PTY on iOS/Android)
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            app.manage(crate::commands::agents::pty::PtySessionManager::default());

            // Async: connect real DB + run license check + check for updates
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 1. Run standard setup FIRST (connect Central DB immediately)
                match setup_app(app_handle.clone(), state.clone(), central_url, central_token).await {
                    Ok(_) => log::info!("BusinessKit ready"),
                    Err(e) => {
                        let msg = format!("{}", e);
                        log::error!("Setup failed: {}", msg);
                        *state.setup_error.write().await = Some(msg);
                    }
                }

                // 2. Check for app updates in the background (NON-BLOCKING after DB is ready)
                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                {
                    use tauri_plugin_updater::UpdaterExt;
                    if let Ok(Some(update)) = app_handle
                        .updater()
                        .expect("Updater plugin missing")
                        .check()
                        .await
                    {
                        log::info!("Update found: {}. Downloading...", update.version);
                        if let Ok(_) = update.download_and_install(|_, _| {}, || {}).await {
                            log::info!("Update installed. Restarting...");
                            app_handle.restart();
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window controls
            commands::window::app_minimize_window,
            commands::window::app_toggle_maximize_window,
            commands::window::app_close_window,
            commands::window::app_is_maximized,
            // Auth (exempt from license gate)
            commands::auth::sign_in,
            commands::auth::auth_status,
            commands::auth::sign_out,
            commands::team::invite_member,
            commands::team::get_pending_invites,
            commands::team::get_team_members,
            commands::team::update_team_member,
            commands::team::remove_team_member,
            commands::team::get_my_pending_invites,
            commands::team::get_my_invited_profiles,
            commands::team::get_my_owned_profiles,
            commands::team::accept_my_invite,
            commands::team::delete_invite,
            rbac::get_my_access,
            // License (exempt from license gate)
            commands::license::get_license_status,
            commands::license::refresh_license,
            // Organization (partially exempt)
            commands::organization::is_central_db_ready,
            commands::organization::get_active_profile_id,
            commands::organization::get_app_debug,
            commands::organization::get_organization,
            commands::organization::get_user_organizations,
            commands::organization::switch_organization,
            commands::organization::get_projects,
            commands::organization::switch_project,
            commands::organization::create_project,
            commands::organization::create_new_organization,
            commands::organization::get_plan_allocations,
            commands::organization::assign_profile_plan,
            // Onboarding, Provisioning & DB Status
            commands::onboarding::connect_user_db,
            commands::onboarding::get_userdb_status,
            commands::onboarding::get_provision_status,
            commands::onboarding::provision_user_db_now,
            commands::onboarding::provision_migrations_now,
            commands::onboarding::recreate_user_table,
            commands::onboarding::recreate_user_triggers,
            commands::onboarding::recreate_single_trigger,
            commands::onboarding::execute_raw_sql,
            // Phase 2 — Profile
            commands::profile::get_profile,
            commands::profile::update_profile,
            // Phase 2 - Connections
            commands::connections::list_connections,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::connections::fetch_external_profiles,
            commands::connections::fetch_openrouter_models,
            // Phase 2 — Links
            commands::links::get_links,
            commands::links::create_link,
            commands::links::update_link,
            commands::links::delete_link,
            commands::links::reorder_links,
            // Phase 2 — Pages
            commands::pages::get_pages_by_profile,
            commands::pages::get_page_by_id,
            commands::pages::get_page_by_slug,
            commands::pages::create_page,
            commands::pages::update_page,
            commands::pages::delete_page,
            // Phase 2 — Page Settings
            commands::profile::get_page_settings,
            commands::profile::update_page_settings,
            commands::profile::get_link_page,
            commands::profile::upsert_link_page,
            // Phase 2 — Products
            commands::profile::get_products,
            commands::profile::get_product,
            commands::profile::create_product,
            commands::profile::update_product,
            commands::sales::get_product_purchases,
            // Phase 2 — Analytics
            commands::profile::get_analytics_summary,
            // Phase 3 — CRM Contacts
            commands::crm::list_contacts,
            commands::crm::get_contact,
            commands::crm::create_contact,
            commands::crm::update_contact,
            commands::crm::archive_contact,
            // Phase 3 — CRM Deals
            commands::crm::list_deals,
            commands::crm::create_deal,
            commands::crm::update_deal_stage,
            // Phase 3 — CRM Activities
            commands::crm::log_activity,
            commands::crm::list_activities,
            commands::crm::list_pending_approvals,
            commands::crm::approve_activity,
            commands::crm::reject_activity,
            commands::crm::mark_activity_read,
            // Phase 3 — CRM Tasks
            commands::crm::list_tasks,
            commands::crm::create_task,
            commands::crm::complete_task,
            // Phase 3 — CRM Notes
            commands::crm::list_notes,
            commands::crm::create_note,
            commands::crm::delete_note,
            // Phase 3 — CRM Groups
            commands::crm::get_crm_analytics,
            commands::crm::aggregate_crm_analytics,
            commands::crm::list_crm_groups,
            commands::crm::create_crm_group,
            // Phase 3 — CRM Templates
            commands::crm::list_crm_templates,
            commands::crm::create_crm_template,
            commands::crm::increment_template_use_count,
            // Phase 7 — CRM Campaigns
            commands::crm::list_crm_campaigns,
            commands::crm::create_crm_campaign,
            commands::crm::update_crm_campaign_status,
            // Phase 4 — Subscribers
            commands::subscribers::list_subscribers,
            commands::subscribers::get_subscriber,
            commands::subscribers::import_subscribers,
            commands::subscribers::block_subscriber,
            commands::subscribers::unsubscribe_subscriber,
            commands::subscribers::count_active_subscribers,
            commands::subscribers::get_subscriber_events,
            // Media & Sliders Commands
            commands::media::media_list,
            commands::media::media_create,
            commands::media::media_update,
            commands::media::media_get,
            commands::media::media_delete,
            commands::media::media_get_r2_config,
            commands::media::media_get_webflow_config,
            commands::media::validate_r2_connection,
            commands::media::create_r2_bucket,
            commands::media::enable_r2_managed_domain,
            commands::media::attach_r2_custom_domain,
            commands::media::fetch_r2_bucket_domains,
            commands::sliders::sliders_list,
            commands::sliders::sliders_get,
            commands::sliders::sliders_create,
            commands::sliders::sliders_update,
            commands::sliders::sliders_delete,
            // Phase 4 — Email Health
            commands::subscribers::get_email_health,
            // Phase 4 — Newsletter Topics
            commands::subscribers::list_newsletter_topics,
            commands::subscribers::create_newsletter_topic,
            // Phase 4 — Credentials / API Keys
            commands::subscribers::get_credentials,
            commands::subscribers::save_credentials,
            // Phase 5 — Deploy pipeline
            commands::deploy::validate_cloudflare_connection,
            commands::deploy::check_for_updates,
            commands::deploy::get_org_deployments,
            commands::deploy::get_deployment_status,
            commands::deploy::deploy_frontend,
            commands::deploy::add_profile_to_deployment,
            commands::deploy::add_custom_domain,
            commands::deploy::add_external_custom_domain,
            commands::deploy::verify_custom_domain,
            commands::deploy::delete_custom_domain,
            commands::deploy::get_connected_profiles,
            commands::deploy::get_parent_cf_connection,
            commands::deploy::delete_deployment,
            // Phase 6 — Social media
            commands::social::list_social_accounts,
            commands::social::upsert_social_account,
            commands::social::disconnect_social_account,
            commands::social::list_social_posts,
            commands::social::sync_social_posts,
            commands::social::create_social_post,
            commands::social::delete_social_post,
            commands::social::schedule_post,
            commands::social::zernio_list_inbox_conversations,
            commands::social::zernio_get_inbox_messages,
            commands::social::zernio_sync_inbox_messages,
            commands::social::list_inbox_conversations,
            commands::social::zernio_send_inbox_message,
            commands::social::get_social_analytics_view,
            commands::social::get_social_post_analytics,
            commands::social::get_single_post_analytics,
            commands::social::sync_social_analytics,
            commands::social::sync_social_posts_analytics,
            // Phase 6 — Content / CMS
            commands::content::list_cms,
            commands::content::update_cms,
            commands::content::list_content,
            commands::content::get_content,
            commands::content::create_content,
            commands::content::update_content,
            commands::content::delete_content,
            commands::content::publish_content,
            commands::content::unpublish_content,
            commands::content::archive_content,
            commands::content::get_content_analytics,
            commands::content::create_collection,
            commands::content::list_collections,
            commands::content::list_categories,
            // Phase 6 — Community
            commands::community::list_communities,
            commands::community::update_community,
            commands::community::get_community_members,
            commands::community::update_community_member_profile,
            commands::community::approve_member,
            commands::community::ban_member,
            commands::community::list_community_posts,
            commands::community::get_community_leaderboard,
            commands::community::list_community_events,
            commands::community::get_community,
            commands::community::update_community,
            commands::community::delete_community,
            commands::community::publish_community,
            commands::community::get_community_analytics,
            commands::community::aggregate_community_analytics,
            commands::community::create_community_category,
            commands::community::list_community_categories,
            commands::community::create_post,
            commands::community::delete_post,
            commands::community::pin_post,
            // Phase 6 — Analytics
            commands::analytics::get_profile_analytics,
            commands::analytics::get_link_analytics,
            commands::analytics::get_single_link_analytics,
            commands::analytics::get_category_analytics,
            commands::analytics::get_single_category_analytics,
            commands::analytics::get_cms_analytics,
            commands::analytics::get_all_cms_analytics,
            commands::analytics::get_product_analytics,
            commands::analytics::get_all_content_analytics,
            commands::analytics::aggregate_analytics,
            commands::analytics::aggregate_content_analytics,
            commands::analytics::get_job_analytics,
            commands::analytics::aggregate_job_analytics,
            commands::analytics::get_page_analytics,
            // Phase 6 — Affiliate
            commands::affiliate::get_affiliate_program,
            commands::affiliate::update_affiliate_program,
            commands::affiliate::list_referrers,
            commands::affiliate::list_commissions,
            commands::affiliate::approve_commission,
            commands::affiliate::reject_commission,
            commands::affiliate::list_payouts,
            commands::affiliate::create_payout,
            // Phase 6 — AI Agents & In-App Chat
            commands::agents::list_agents,
            commands::agents::create_agent,
            commands::agents::list_agent_tasks,
            commands::agents::create_agent_task,
            commands::agents::update_task_result,
            commands::agents::get_agent_memory,
            commands::agents::list_agent_kb,
            commands::agents::start_chat_session,
            commands::agents::list_chat_sessions,
            commands::agents::get_chat_history,
            commands::agents::send_chat_message,
            commands::agents::stop_chat_session,
            commands::agents::get_openrouter_pricing,
            commands::agents::get_brand_foundation,
            commands::agents::save_brand_foundation,
            commands::agents::get_agent_analytics,
            commands::agents::rename_chat_session,
            commands::agents::toggle_pin_chat_session,
            commands::agents::toggle_save_chat_session,
            commands::agents::delete_chat_session,
            commands::agents::get_active_cli_models,
            commands::agents::set_cli_active_model,
            commands::agents::list_agent_commands,
            commands::agents::create_agent_command,
            commands::agents::update_agent_command,
            commands::agents::delete_agent_command,
            commands::agents::list_agent_tools,
            // Phase 9 — Terminal Mode (PTY) — desktop only
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            commands::agents::start_terminal_session,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            commands::agents::write_terminal_input,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            commands::agents::resize_terminal_session,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            commands::agents::stop_terminal_session,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            commands::agents::list_terminal_sessions,
            // Phase 6 — Ads
            commands::ads::list_ad_accounts,
            commands::ads::upsert_ad_account,
            commands::ads::disconnect_ad_account,
            commands::ads::list_campaigns,
            commands::ads::create_campaign,
            commands::ads::pause_campaign,
            commands::ads::activate_campaign,
            commands::ads::archive_campaign,
            // Phase 6 — Forms
            commands::forms::list_forms,
            commands::forms::create_form,
            commands::forms::delete_form,
            commands::forms::list_form_questions,
            commands::forms::list_submissions,
            commands::forms::get_form_analytics,
            // Phase 6 — Jobs
            commands::jobs::get_job_listings,
            commands::jobs::create_job_listing,
            commands::jobs::update_job_listing,
            commands::jobs::delete_job_listing,
            commands::jobs::get_job_applications,
            commands::jobs::update_job_application_status,
            // Phase 6 — Feedback
            commands::feedback::list_feedback_boards,
            commands::feedback::create_feedback_board,
            commands::feedback::list_feedback_posts,
            commands::feedback::change_post_status,
            commands::feedback::toggle_pin_post,
            commands::feedback::add_to_roadmap,
            commands::feedback::get_roadmap_posts,
            commands::feedback::list_changelog,
            // Phase 6 — GSC / GA4
            commands::gsc::get_gsc_sync_config,
            commands::gsc::save_gsc_sync_config,
            commands::gsc::get_gsc_summary,
            commands::gsc::list_gsc_queries,
            commands::gsc::list_gsc_pages,
            commands::gsc::get_ga4_summary,
            commands::gsc::list_ga4_sources,
            // Phase 6 — Settings
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::save_api_key,
            commands::settings::get_central_credentials,
            commands::settings::update_turso_creds,
            commands::settings::update_workos_creds,
            commands::settings::save_api_key,
            commands::settings::get_api_key,
            commands::settings::delete_api_key,
            commands::settings::get_billing_portal_url,
            commands::settings::get_user_settings,
            commands::settings::update_user_settings,
            // Phase 6 — Email Tracking
            commands::email_tracking::get_email_health_stats,
            commands::email_tracking::get_newsletter_stats,
            commands::email_tracking::list_newsletter_stats,
            commands::email_tracking::get_subscriber_analytics,
            // Window management (platform-aware fullscreen & multi-window workspaces)
            commands::window::toggle_fullscreen,
            commands::window::open_profile_window,
            // App install system
            commands::app_commands::get_installed_apps,
            commands::app_commands::install_app,
            commands::app_commands::uninstall_app,
            // Shop — Phase 1: Items
            commands::shop::items::shop_list_items,
            commands::shop::items::shop_get_item,
            commands::shop::items::shop_create_item,
            commands::shop::items::shop_update_item,
            commands::shop::items::shop_delete_item,
            commands::shop::items::shop_list_item_batches,
            commands::shop::items::shop_list_all_active_batches,
            // Shop — Phase 1: Affiliates
            commands::shop::affiliates::shop_list_affiliates,
            commands::shop::affiliates::shop_create_affiliate,
            commands::shop::affiliates::shop_update_affiliate,
            commands::shop::affiliates::shop_delete_affiliate,
            // Shop — Phase 1: Brands
            commands::shop::brands::shop_list_brands,
            commands::shop::brands::shop_get_brand,
            commands::shop::brands::shop_create_brand,
            commands::shop::brands::shop_update_brand,
            commands::shop::brands::shop_delete_brand,
            // Shop — Phase 1: Categories
            commands::shop::categories::shop_list_categories,
            commands::shop::categories::shop_seed_categories,
            commands::shop::categories::shop_create_category,
            commands::shop::categories::shop_update_category,
            commands::shop::categories::shop_set_default_category,
            commands::shop::categories::shop_delete_category,
            // Shop — Phase 1: Collections
            commands::shop::collections::shop_list_collections,
            commands::shop::collections::shop_create_collection,
            commands::shop::collections::shop_update_collection,
            commands::shop::collections::shop_set_default_collection,
            commands::shop::collections::shop_delete_collection,
            // Shop — Phase 1: Units
            commands::shop::units::shop_list_units,
            commands::shop::units::shop_seed_units,
            commands::shop::units::shop_create_unit,
            commands::shop::units::shop_update_unit,
            commands::shop::units::shop_set_default_unit,
            commands::shop::units::shop_delete_unit,
            // Shop — Phase 1: Item Variants
            commands::shop::variants::shop_list_variants,
            commands::shop::variants::shop_list_all_active_variants,
            commands::shop::variants::shop_create_variant,
            commands::shop::variants::shop_update_variant,
            commands::shop::variants::shop_delete_variant,
            commands::shop::variants::shop_save_item_variants,
            // Shop — Phase 1: Billing
            commands::shop::billing::shop_create_invoice,
            commands::shop::billing::shop_update_invoice,
            commands::shop::billing::shop_get_invoice,
            commands::shop::billing::shop_list_invoices,
            commands::shop::billing::shop_list_sales_orders,
            commands::shop::billing::shop_convert_sales_order_to_invoice,
            commands::shop::billing::shop_reject_sales_order,
            commands::shop::billing::shop_get_item_rate_history,
            commands::shop::billing::shop_today_profit,
            commands::shop::billing::shop_delete_invoice,
            commands::shop::billing::shop_open_pdf,
            commands::shop::billing::shop_download_pdf,
            commands::shop::billing::shop_open_url,
            commands::shop::demo::shop_save_demo_bill,
            commands::shop::demo::shop_list_demo_bills,
            commands::shop::shop_analytics::shop_get_billing_analytics,
            commands::shop::shop_analytics::shop_aggregate_billing_analytics,
            commands::shop::shop_analytics::shop_get_item_billing_analytics,
            commands::shop::shop_analytics::shop_aggregate_item_billing_analytics,
            commands::shop::shop_analytics::shop_aggregate_daily_analytics,
            commands::shop::shop_analytics::shop_aggregate_monthly_analytics,
            commands::shop::shop_analytics::shop_get_service_mode_analytics,
            // Shop — Phase 1: Payments
            commands::shop::payments::shop_record_payment,
            commands::shop::payments::shop_get_payment_status,
            // Shop — POS Shift Register & Z-Report
            commands::shop::shift::shop_get_active_shift,
            commands::shop::shift::shop_open_shift,
            commands::shop::shift::shop_close_shift,
            commands::shop::shift::shop_list_shifts,
            // Shop — Phase 2: Stock / Inventory
            commands::shop::stock::shop_list_warehouses,
            commands::shop::stock::shop_seed_warehouses,
            commands::shop::stock::shop_create_warehouse,
            commands::shop::stock::shop_update_warehouse,
            commands::shop::stock::shop_delete_warehouse,
            commands::shop::stock::shop_get_stock_position,
            commands::shop::stock::shop_get_b2b_hold_stats,
            commands::shop::stock::shop_receive_stock,
            commands::shop::stock::shop_list_goods_receipts,
            commands::shop::stock::shop_get_goods_receipt,
            commands::shop::stock::shop_update_receive_stock,
            commands::shop::stock::shop_adjust_stock,
            commands::shop::stock::shop_transfer_stock,
            commands::shop::stock::shop_get_low_stock_items,
            commands::shop::stock::shop_get_all_reorder_rules,
            commands::shop::stock::shop_get_reorder_rule,
            commands::shop::stock::shop_delete_reorder_rule,
            commands::shop::stock::shop_set_reorder_rule,
            commands::shop::stock::shop_find_item_by_barcode,
            commands::shop::stock::shop_get_stock_ledger,
            // Shop — Phase 3: Customers & CRM
            commands::shop::customers::shop_create_customer,
            commands::shop::customers::shop_list_customers,
            commands::shop::customers::shop_search_customers,
            commands::shop::customers::shop_get_customer_detail,
            commands::shop::customers::shop_get_customer_billing_context,
            commands::shop::customers::shop_update_customer,
            commands::shop::customers::shop_update_customer_preferences,
            commands::shop::customers::shop_adjust_customer_credit,
            commands::shop::customers::shop_get_customer_credit_ledger,
            commands::shop::customers::shop_adjust_customer_loyalty,
            commands::shop::customers::shop_get_customer_loyalty_ledger,
            commands::shop::customers::shop_redeem_loyalty_points,
            commands::shop::customers::shop_topup_customer_wallet,
            commands::shop::customers::shop_redeem_customer_wallet,
            commands::shop::customers::shop_get_campaign_audience,
            commands::shop::customers::shop_get_loyalty_config,
            commands::shop::customers::shop_update_loyalty_config,
            commands::shop::customers::shop_get_config,
            commands::shop::customers::shop_set_config,
            commands::shop::customers::shop_list_tags,
            commands::shop::customers::shop_create_tag,
            // Shop — Phase 3: Vendors
            commands::shop::vendors::shop_create_vendor,
            commands::shop::vendors::shop_list_vendors,
            commands::shop::vendors::shop_get_vendor_detail,
            commands::shop::vendors::shop_update_vendor,
            commands::shop::vendors::shop_link_vendor_item,
            commands::shop::vendors::shop_list_vendors_for_item,
            // Shop — Phase 3: Price Lists
            commands::shop::price_lists::shop_create_price_list,
            commands::shop::price_lists::shop_list_price_lists,
            commands::shop::price_lists::shop_update_price_list,
            commands::shop::price_lists::shop_assign_customer_price_list,
            commands::shop::price_lists::shop_resolve_item_price,
            // Shop — Discounts & Coupons
            commands::shop::discounts::shop_list_discount_codes,
            commands::shop::discounts::shop_create_discount_code,
            commands::shop::discounts::shop_update_discount_code,
            commands::shop::discounts::shop_delete_discount_code,
            commands::shop::discounts::shop_validate_discount_code,
            commands::shop::discounts::shop_redeem_discount_code,
            // Shop — Phase 5: Restaurant
            commands::shop::restaurant::shop_list_restaurant_tables,
            commands::shop::restaurant::shop_create_restaurant_table,
            commands::shop::restaurant::shop_update_table_status,
            commands::shop::restaurant::shop_delete_restaurant_table,
            commands::shop::restaurant::shop_check_table_availability,
            commands::shop::restaurant::shop_list_restaurant_reservations,
            commands::shop::restaurant::shop_create_table_reservation,
            commands::shop::restaurant::shop_update_reservation_status,
            commands::shop::restaurant::shop_send_kot,
            commands::shop::restaurant::shop_list_kots,
            commands::shop::restaurant::shop_update_kot_status,
            commands::shop::restaurant::shop_update_kot_line,
            commands::shop::restaurant::shop_delete_kot_line,
            commands::shop::restaurant::shop_list_recipes,
            commands::shop::restaurant::shop_save_recipe,
            commands::shop::restaurant::shop_delete_recipe,
            commands::shop::restaurant::shop_list_staff,
            commands::shop::restaurant::shop_create_staff,
            commands::shop::restaurant::shop_update_staff,
            commands::shop::restaurant::shop_delete_staff,
            commands::shop::restaurant::shop_update_table_waiter,
            commands::shop::restaurant::shop_ingest_aggregator_order,
            commands::shop::restaurant::shop_cancel_aggregator_order,
            // Shop — Phase 5: Hotel / Stays
            commands::shop::stays::shop_list_stay_rooms,
            commands::shop::stays::shop_create_stay_room,
            commands::shop::stays::shop_update_stay_room,
            commands::shop::stays::shop_update_room_status,
            commands::shop::stays::shop_delete_stay_room,
            commands::shop::stays::shop_check_room_availability,
            commands::shop::stays::shop_list_stay_reservations,
            commands::shop::stays::shop_create_stay_reservation,
            commands::shop::stays::shop_update_stay_reservation_status,
            commands::shop::stays::shop_add_booking_guest,
            commands::shop::stays::shop_list_booking_guests,
            commands::shop::stays::shop_list_all_stay_guests,
            commands::shop::stays::shop_check_in_guest,
            commands::shop::stays::shop_list_open_folios,
            commands::shop::stays::shop_add_folio_charge,
            commands::shop::stays::shop_settle_folio,
            commands::shop::stays::shop_list_todays_arrivals,
            commands::shop::stays::shop_list_todays_departures,
            commands::shop::stays::shop_get_stay_analytics,
            commands::shop::stays::shop_sync_ota_ical,
            commands::shop::stays::shop_export_stay_ical,
            commands::shop::stays::shop_calculate_stay_pricing,
            commands::shop::stays::shop_update_stay_rate_calendar,
            commands::shop::stays::shop_update_stay_booking_rules,
            // ── Phase 8: Reviews & Ratings ────────────────────────────────────
            commands::shop::reviews::shop_create_review,
            commands::shop::reviews::shop_list_reviews,
            commands::shop::reviews::shop_update_review_published,
            commands::shop::reviews::shop_reply_to_review,
            commands::shop::reviews::shop_delete_review,
            // ── Phase 4: Money Matters — Tax ───────────────────────────────────
            commands::fin::tax::fin_get_tax_config,
            commands::fin::tax::fin_set_tax_regime,
            commands::fin::tax::fin_list_tax_rates,
            commands::fin::tax::fin_create_tax_rate,
            commands::fin::tax::fin_delete_tax_rate,
            commands::fin::tax::fin_assign_tax_rate_to_item,
            commands::fin::tax::fin_get_item_tax_rate,
            commands::fin::tax::fin_seed_gst_rates,
            commands::fin::tax::fin_set_default_tax_rate,
            commands::fin::tax::fin_get_default_tax_rate,
            // ── Phase 4: Money Matters — Chart of Accounts ────────────────────
            commands::fin::accounts::fin_seed_default_accounts,
            commands::fin::accounts::fin_list_accounts,
            commands::fin::accounts::fin_create_account,
            // ── Phase 4: Money Matters — Journal Entries ──────────────────────
            commands::fin::journal::fin_list_journal_entries,
            commands::fin::journal::fin_get_journal_entry,
            commands::fin::journal::fin_post_document,
            // ── Phase 4: Money Matters — Bank Reconciliation ──────────────────
            commands::fin::bank::fin_create_bank_account,
            commands::fin::bank::fin_list_bank_accounts,
            commands::fin::bank::fin_import_bank_statement,
            commands::fin::bank::fin_import_bank_statement_from_path,
            commands::fin::bank::fin_list_bank_transactions,
            commands::fin::bank::fin_match_transaction,
            commands::fin::bank::fin_unmatch_transaction,
            // ── Phase 4: Money Matters — Expenses ────────────────────────────
            commands::fin::expenses::fin_create_expense,
            commands::fin::expenses::fin_list_expenses,
            // ── Phase 4: Money Matters — Reports ─────────────────────────────
            commands::fin::reports::fin_get_profit_and_loss,
            commands::fin::reports::fin_get_balance_sheet,
            commands::fin::reports::fin_get_trial_balance,
            // ── Phase 4: Money Matters — Currency Rates ─────────────────────
            commands::fin::currency::fin_list_currency_rates,
            commands::fin::currency::fin_set_currency_rate,
            commands::fin::currency::fin_seed_currency_rates,
            // ── Phase 4: Money Matters — India Compliance & GST ───────────────
            commands::fin::gst::fin_get_gst_return_summary,
            commands::fin::gst::fin_get_vendor_itc_summary,
            commands::fin::gst::fin_mark_return_filed,
            commands::fin::einvoice::fin_generate_einvoice,
            commands::fin::einvoice::fin_get_einvoice_status,
            commands::fin::einvoice::fin_list_einvoices,
            commands::fin::eway::fin_generate_eway_bill,
            commands::fin::eway::fin_list_eway_bills,
            commands::fin::tds::fin_log_tds_entry,
            commands::fin::tds::fin_log_tcs_entry,
            commands::fin::tds::fin_list_tds_entries,
            // ── Phase 4B: Payment Gateways & Reconciliation ──────────────────
            commands::fin::gateway::fin_record_gateway_transaction,
            commands::fin::gateway::fin_list_gateway_transactions,
            commands::fin::gateway::fin_match_gateway_transaction,
            commands::fin::gateway::fin_reconcile_gateway_transactions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn setup_app(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    central_url: String,
    central_token: String,
) -> anyhow::Result<()> {
    if central_url.is_empty() {
        log::warn!("TURSO_DATABASE_URL not set — running in dev mode without central DB");
        return Ok(());
    }

    // Connect real Central DB and write into the RwLock
    let central_db = db::central::CentralDb::connect(&central_url, &central_token).await?;
    *state.central_db.write().await = Some(central_db);
    log::info!("Central DB connected: {}", central_url);

    // ── Migrate stale cached user_id if it is still a workos_id ─────────────
    // Old sessions cached the WorkOS ID (e.g. "user_01K...") instead of the
    // internal users.id UUID. Detect and fix this once so all subsequent queries
    // (org lookup, license check, profile fetch) use the correct primary key.
    if let Some(cached_id) = license::load_cached_user_id() {
        // WorkOS IDs always start with "user_"; internal UUIDs contain hyphens.
        if cached_id.starts_with("user_") {
            log::info!("Stale workos_id detected in cache ({}), resolving to users.id", cached_id);
            if let Ok(db) = state.cdb().await {
                match db.get_user_id_by_workos_id(&cached_id).await {
                    Ok(real_id) if real_id != cached_id => {
                        log::info!("Cache migrated: workos_id {} → users.id {}", cached_id, real_id);
                        license::save_user_id(&real_id);
                    }
                    Ok(_) => log::warn!("get_user_id_by_workos_id returned same id — no users row?"),
                    Err(e) => log::warn!("Failed to resolve cached workos_id: {}", e),
                }
            }
        }
    }

    // Attempt initial license check (also loads license into state)
    license::check_on_launch(state.clone()).await;

    // Eagerly load organization into state so get_organization() IPC calls
    // succeed immediately on reload without a second round-trip from the frontend.
    if let Some(user_id) = license::load_cached_user_id() {
        if let Ok(db) = state.cdb().await {
            match db.get_organization_by_owner(&user_id).await {
                Ok(org) => {
                    log::info!("Loaded organization '{}' into state on startup", org.name);
                    *state.organization.write().await = Some(org);
                }
                Err(e) => log::warn!("Could not pre-load org for user {}: {}", user_id, e),
            }
        }
    }

    // ── Connect User DB ───────────────────────────────────────────────────────
    // Try to restore the user DB connection from a previous session.
    // Keychain hit → instant offline connect.
    // Keychain miss → calls /api/user/db-token (requires network + login).
    // Errors are non-fatal — user can trigger reconnect via UI if needed.
    if let Some(profile_id) = license::load_cached_profile_id() {
        let cached_uid = license::load_cached_user_id();
        let mut is_valid = true;

        if let Ok(db) = state.cdb().await {
            if let Ok(profile) = db.get_profile_by_id(&profile_id).await {
                if let Some(ref uid) = cached_uid {
                    if &profile.user_id != uid {
                        log::warn!("Boot: cached profile {} does not belong to cached user {}", profile_id, uid);
                        is_valid = false;
                        license::clear_profile_id();
                    }
                }
                if is_valid {
                    if let Some(ref org_id) = profile.organization_id {
                        if let Ok(org) = db.get_organization_by_id(org_id).await {
                            if let Ok(license) = db.get_license_status(&org.owner_user_id).await {
                                *state.license.write().await = license;
                            }
                            *state.organization.write().await = Some(org.clone());
                            log::info!("Pre-loaded organization '{}' for profile {}", org.name, profile_id);
                        }
                    }
                }
            } else {
                is_valid = false;
                license::clear_profile_id();
            }
        }

        if is_valid {
            *state.active_profile_id.write().await = Some(profile_id.clone());
            match commands::organization::connect_from_keychain_pub(state.clone(), &profile_id).await {
                Ok(()) => log::info!("User DB connected at boot for profile {}", profile_id),
                Err(e) => log::warn!("Could not connect User DB at boot: {}", e),
            }
        }
    }

    // Start background 24hr recheck
    license::start_background_recheck(state, app).await;

    Ok(())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub expires_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub created_at: i64,
    pub order: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscriber {
    pub id: String,
    pub profile_id: String,
    pub email: String,
    pub name: Option<String>,
    pub referrer_domain: Option<String>,
    pub timezone: Option<String>,
    pub browser_name: Option<String>,
    pub os_name: Option<String>,
    pub device_type: Option<String>,
    pub ip_address: Option<String>,
    pub country: Option<String>,
    pub city: Option<String>,
    pub signup_timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub price_cents: i64,
    pub stripe_price_id: Option<String>,
    pub paddle_product_id: Option<String>,
    pub paddle_price_id_monthly: Option<String>,
    pub paddle_price_id_yearly: Option<String>,
    pub features: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub user_id: String,
    pub profile_id: Option<String>,
    pub plan_id: Option<String>,
    pub provider: String,
    pub external_customer_id: Option<String>,
    pub external_subscription_id: Option<String>,
    pub paddle_customer_id: Option<String>,
    pub paddle_subscription_id: Option<String>,
    pub paddle_transaction_id: Option<String>,
    pub status: String,
    pub current_period_end: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomDomain {
    pub id: String,
    pub profile_id: String,
    pub domain: String,
    pub is_verified: i64,
    pub verified_at: Option<i64>,
    pub ssl_status: Option<String>,
    pub cf_hostname_id: Option<String>,
    pub cf_dns_record_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub workos_id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub bio: Option<String>,
    pub social_links: String,
    pub profile_picture_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_login: Option<i64>,
    pub is_active: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub profile_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub id: String,
    pub team_id: String,
    pub user_id: String,
    pub role: String,
    pub invited_by: Option<String>,
    pub invited_at: i64,
    pub joined_at: Option<i64>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInvite {
    pub id: String,
    pub team_id: String,
    pub email: String,
    pub role: String,
    pub invited_by: String,
    pub token: String,
    pub expires_at: i64,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayoutAccount {
    pub id: String,
    pub user_id: String,
    pub label: Option<String>,
    pub method: String,
    pub email: Option<String>,
    pub stripe_account_id: Option<String>,
    pub account_holder: Option<String>,
    pub bank_name: Option<String>,
    pub bank_country: Option<String>,
    pub currency: Option<String>,
    pub iban: Option<String>,
    pub swift_bic: Option<String>,
    pub routing_number: Option<String>,
    pub account_number: Option<String>,
    pub sort_code: Option<String>,
    pub ifsc_code: Option<String>,
    pub is_default: i64,
    pub is_verified: i64,
    pub created_at: i64,
    pub updated_at: i64,
}
// force rebuild lib.rs
