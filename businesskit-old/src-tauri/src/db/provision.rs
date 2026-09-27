// src-tauri/src/db/provision.rs
// Mirror of src/lib/provision.ts → provisionUserDatabase()
// Runs all CREATE TABLE IF NOT EXISTS + indices idempotently on every app launch.
// Pulls SQL strings from the domain lib files (same order as provision.ts).

use super::user::UserDb;
use anyhow::Result;

/// Run all schema SQL against the user's Turso DB.
/// Core schema for base UserDB provisioning.
/// Installable apps (Shop, Tax, Accounts, Payroll, Forms, Jobs, etc.) are installed on-demand via app_commands.
pub fn get_core_schema_sql() -> Vec<&'static str> {
    let core_schema = SCHEMA_SQL.to_vec();
    [
        core_schema.as_slice(),
        crate::db::schema::content::SCHEMA_SQL,
        crate::db::schema::crm::SCHEMA_SQL,
        crate::db::schema::email::SCHEMA_SQL,
        crate::db::schema::pages::SCHEMA_SQL,
        crate::db::schema::agents::SCHEMA_SQL,
    ]
    .concat()
}

pub fn get_all_known_schema_sql() -> Vec<&'static str> {
    let core_schema = SCHEMA_SQL.to_vec();
    [
        core_schema.as_slice(),
        crate::db::schema::content::SCHEMA_SQL,
        crate::db::schema::crm::SCHEMA_SQL,
        crate::db::schema::email::SCHEMA_SQL,
        crate::db::schema::links::SCHEMA_SQL,
        crate::db::schema::pages::SCHEMA_SQL,
        crate::db::schema::products::SCHEMA_SQL,
        crate::db::schema::product_triggers::SCHEMA_SQL,
        crate::db::schema::shop::SHOP_SCHEMA,
        crate::db::schema::shop_ops::SHOP_OPS_SCHEMA,
        crate::db::schema::tax::TAX_SCHEMA,
        crate::db::schema::accounts::ACCOUNTS_SCHEMA,
        crate::db::schema::payroll::PAYROLL_SCHEMA,
        crate::db::schema::chat_agent::SCHEMA_SQL,
        crate::db::schema::social::SCHEMA_SQL,
        crate::db::schema::community::SCHEMA_SQL,
        crate::db::schema::community_triggers::SCHEMA_SQL,
        crate::db::schema::agents::SCHEMA_SQL,
        crate::db::schema::gsc::SCHEMA_SQL,
        crate::db::schema::feedback::SCHEMA_SQL,
        crate::db::schema::review::SCHEMA_SQL,
        crate::db::schema::ads::SCHEMA_SQL,
        crate::db::schema::affiliate::SCHEMA_SQL,
        crate::db::schema::forms::SCHEMA_SQL,
        crate::db::schema::jobs::SCHEMA_SQL,
    ]
    .concat()
}

/// Run all schema SQL across all modules against the user's Turso DB.
pub fn get_all_schema_sql() -> Vec<&'static str> {
    get_all_known_schema_sql()
}

pub async fn provision_single_table(db: &UserDb, target_table: &str) -> Result<()> {
    let conn = db.conn()?;
    let target = target_table
        .trim()
        .trim_matches('"')
        .trim_matches('`')
        .to_lowercase();

    let mut matched_count = 0;
    let mut table_created = false;

    for sql in get_all_known_schema_sql() {
        let s = sql.trim();
        let upper = s.to_uppercase();

        // 1. Match CREATE TABLE statement
        if upper.starts_with("CREATE TABLE") {
            if let Some(paren_idx) = s.find('(') {
                let before_paren = &s[..paren_idx];
                let tokens: Vec<&str> = before_paren.split_whitespace().collect();
                if let Some(tbl_name) = tokens.last() {
                    let clean_tbl = tbl_name
                        .trim_matches('"')
                        .trim_matches('`')
                        .to_lowercase();
                    if clean_tbl == target {
                        matched_count += 1;
                        table_created = true;
                        log::info!(
                            "Executing CREATE TABLE for '{}': {}",
                            target,
                            &s[0..std::cmp::min(s.len(), 60)]
                        );
                        conn.execute(sql, crate::turso_params![]).await?;
                    }
                }
            }
        }
        // 2. Match CREATE INDEX / CREATE UNIQUE INDEX
        else if upper.starts_with("CREATE INDEX") || upper.starts_with("CREATE UNIQUE INDEX") {
            let tokens: Vec<&str> = s.split_whitespace().collect();
            let mut i = 0;
            while i < tokens.len() && !tokens[i].eq_ignore_ascii_case("ON") {
                i += 1;
            }
            if i + 1 < tokens.len() {
                let on_tbl = tokens[i + 1]
                    .split('(')
                    .next()
                    .unwrap_or("")
                    .trim_matches('"')
                    .trim_matches('`')
                    .to_lowercase();
                if on_tbl == target {
                    matched_count += 1;
                    log::info!(
                        "Executing CREATE INDEX for '{}': {}",
                        target,
                        &s[0..std::cmp::min(s.len(), 60)]
                    );
                    let _ = conn.execute(sql, crate::turso_params![]).await;
                }
            }
        }
        // 3. Match CREATE TRIGGER
        else if upper.starts_with("CREATE TRIGGER") {
            let tokens: Vec<&str> = s.split_whitespace().collect();
            let mut i = 0;
            while i < tokens.len() && !tokens[i].eq_ignore_ascii_case("ON") {
                i += 1;
            }
            if i + 1 < tokens.len() {
                let on_tbl = tokens[i + 1]
                    .split('(')
                    .next()
                    .unwrap_or("")
                    .trim_matches('"')
                    .trim_matches('`')
                    .to_lowercase();
                if on_tbl == target {
                    matched_count += 1;
                    log::info!(
                        "Executing CREATE TRIGGER for '{}': {}",
                        target,
                        &s[0..std::cmp::min(s.len(), 60)]
                    );
                    let _ = conn.execute(sql, crate::turso_params![]).await;
                }
            }
        }
    }

    if !table_created {
        return Err(anyhow::anyhow!(
            "Table definition for '{}' not found in any schema module",
            target_table
        ));
    }

    // Clear recorded migration history for this table so ALTER TABLE migrations can re-apply cleanly
    let _ = conn
        .execute(
            "DELETE FROM _schema_migrations WHERE id IN (SELECT id FROM _schema_migrations WHERE id LIKE ?1)",
            crate::turso_params![format!("{}%", target)],
        )
        .await;

    // Run migrations to apply any ALTER TABLE columns added via migrations
    let _ = run_migrations(db).await;

    log::info!(
        "provision_single_table for '{}' executed {} statements.",
        target,
        matched_count
    );
    Ok(())
}

pub async fn provision_user_database(db: &UserDb) -> Result<()> {
    log::info!("Provisioning UserDB schema...");
    let conn = db.conn()?;

    let core_schema_sql = get_core_schema_sql();

    // Execute in chunks of 50 using execute_statements (which does NOT split triggers on semicolons)
    for chunk in core_schema_sql.chunks(50) {
        if let Err(e) = conn.execute_statements(chunk).await {
            log::warn!(
                "Batch chunk failed ({}), falling back to sequential execution for this chunk...",
                e
            );
            for sql in chunk {
                if let Err(e) = conn.execute(*sql, crate::turso_params![]).await {
                    log::warn!("Schema statement failed (may be safe to ignore): {}", e);
                }
            }
        }
    }

    log::info!(
        "UserDB core provisioning complete ({} statements)",
        core_schema_sql.len()
    );

    // ── Migrations runner ────────────────────────────────────────────────────────
    run_migrations(db).await?;

    // ── Execute Seed Data ────────────────────────────────────────────────────
    log::info!("Executing seed statements...");
    for chunk in SEED_SQL.chunks(50) {
        let seed_batch = chunk.join(";\n");
        if let Err(e) = conn.execute_batch(&seed_batch).await {
            log::warn!(
                "Seed batch chunk failed ({}), falling back to sequential...",
                e
            );
            for sql in chunk {
                if let Err(e) = conn.execute(*sql, crate::turso_params![]).await {
                    log::warn!("Seed statement failed (may be safe to ignore): {}", e);
                }
            }
        }
    }

    Ok(())
}

fn extract_target_column(sql: &str) -> Option<&str> {
    let tokens: Vec<&str> = sql.split_whitespace().collect();
    let mut iter = tokens.iter();
    while let Some(tok) = iter.next() {
        if tok.eq_ignore_ascii_case("COLUMN") {
            return iter.next().copied();
        }
    }
    None
}

pub async fn run_migrations(db: &UserDb) -> Result<(usize, usize)> {
    let conn = db.conn()?;

    let all_migrations = crate::db::schema_version::CORE_MIGRATIONS;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS _schema_migrations (
            id         TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        crate::turso_params![],
    )
    .await?;

    let mut newly_added = 0;
    let mut already_existed = 0;

    // Cache table columns per table to avoid duplicate PRAGMA calls
    let mut table_cols_cache: std::collections::HashMap<String, std::collections::HashSet<String>> =
        std::collections::HashMap::new();

    for m in all_migrations {
        let table_name = m.table.to_lowercase();

        // 1. Check if table exists and inspect its real columns
        let table_exists = if table_cols_cache.contains_key(&table_name) {
            true
        } else {
            let chk_sql = format!(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='{}'",
                table_name
            );
            let mut count = 0i64;
            if let Ok(mut rows) = conn.query(&chk_sql, crate::turso_params![]).await {
                if let Ok(Some(row)) = rows.next().await {
                    count = row.get::<i64>(0).unwrap_or(0);
                }
            }
            if count > 0 {
                let pragma_sql = format!("SELECT name FROM pragma_table_info('{}')", table_name);
                let mut cols = std::collections::HashSet::new();
                if let Ok(mut rows) = conn.query(&pragma_sql, crate::turso_params![]).await {
                    while let Ok(Some(row)) = rows.next().await {
                        if let Ok(col_name) = row.get::<String>(0) {
                            cols.insert(col_name.to_lowercase());
                        }
                    }
                }
                table_cols_cache.insert(table_name.clone(), cols);
                true
            } else {
                false
            }
        };

        let sql_upper = m.sql.trim().to_uppercase();
        let is_create_table = sql_upper.starts_with("CREATE TABLE");
        let is_create_index = sql_upper.starts_with("CREATE INDEX");

        if is_create_table || is_create_index {
            // Execute CREATE TABLE / CREATE INDEX directly
            match conn.execute(m.sql, crate::turso_params![]).await {
                Ok(_) => {
                    log::info!("Successfully applied migration {}: {}", m.id, m.sql);
                    let _ = conn
                        .execute(
                            "INSERT OR REPLACE INTO _schema_migrations (id) VALUES (?)",
                            crate::turso_params![m.id],
                        )
                        .await;
                    newly_added += 1;
                }
                Err(e) => {
                    let err_str = e.to_string().to_lowercase();
                    if err_str.contains("already exists") {
                        let _ = conn
                            .execute(
                                "INSERT OR REPLACE INTO _schema_migrations (id) VALUES (?)",
                                crate::turso_params![m.id],
                            )
                            .await;
                        already_existed += 1;
                    } else {
                        log::error!("Failed to apply table/index migration {}: {}", m.id, e);
                    }
                }
            }
            continue;
        }

        if !table_exists {
            // Table doesn't exist yet (e.g. app not installed yet). Do NOT mark as applied.
            continue;
        }

        let existing_cols = table_cols_cache.get(&table_name).unwrap();
        let target_col = extract_target_column(m.sql).map(|c| c.to_lowercase());

        if let Some(ref col) = target_col {
            if existing_cols.contains(col) {
                // Column ALREADY exists in the real table!
                let _ = conn
                    .execute(
                        "INSERT OR IGNORE INTO _schema_migrations (id) VALUES (?)",
                        crate::turso_params![m.id],
                    )
                    .await;
                already_existed += 1;
                continue;
            }
        }

        // Column is MISSING in real table -> execute ALTER TABLE!
        match conn.execute(m.sql, crate::turso_params![]).await {
            Ok(_) => {
                log::info!("Successfully applied migration {}: {}", m.id, m.sql);
                let _ = conn
                    .execute(
                        "INSERT OR REPLACE INTO _schema_migrations (id) VALUES (?)",
                        crate::turso_params![m.id],
                    )
                    .await;
                // Update local cache
                if let Some(col) = target_col {
                    if let Some(cols) = table_cols_cache.get_mut(&table_name) {
                        cols.insert(col);
                    }
                }
                newly_added += 1;
            }
            Err(e) => {
                let err_str = e.to_string().to_lowercase();
                if err_str.contains("duplicate column") || err_str.contains("already exists") {
                    log::info!("Migration {} column already existed: {}", m.id, e);
                    let _ = conn
                        .execute(
                            "INSERT OR REPLACE INTO _schema_migrations (id) VALUES (?)",
                            crate::turso_params![m.id],
                        )
                        .await;
                    if let Some(col) = target_col {
                        if let Some(cols) = table_cols_cache.get_mut(&table_name) {
                            cols.insert(col);
                        }
                    }
                    already_existed += 1;
                } else {
                    log::warn!("Migration {} failed to apply: {}", m.id, e);
                    // Clear false positive from _schema_migrations so it can retry
                    let _ = conn
                        .execute(
                            "DELETE FROM _schema_migrations WHERE id = ?",
                            crate::turso_params![m.id],
                        )
                        .await;
                }
            }
        }
    }

    Ok((newly_added, already_existed))
}

// ── All CREATE TABLE / INDEX / TRIGGER SQL ────────────────────────────────────
// Matches provision.ts SCHEMA_SQL array exactly.

pub const SCHEMA_SQL: &[&str] = &[
    // ── _schema_migrations — P0-10 ────────────────────────────────────────────
    // Version tracking for UserDB schema evolution.
    // provisionUserDatabase() is idempotent; this table records what ran and when.
    // Admin query: SELECT id, error FROM _schema_migrations WHERE error IS NOT NULL
    r#"CREATE TABLE IF NOT EXISTS _schema_migrations (
    id          TEXT PRIMARY KEY,
    applied_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    duration_ms INTEGER,
    error       TEXT
  )"#,
    // ── profile_apps ─────────────────────────────────────────────────────────
    // Tracks which installable apps the user has enabled for this profile.
    // One row per profile. `installed` is a JSON array of app slugs:
    //   e.g. '["shop","payroll"]'
    // install_app() appends to this; uninstall_app() removes — tables are NEVER dropped.
    r#"CREATE TABLE IF NOT EXISTS profile_apps (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL UNIQUE,
    installed   TEXT NOT NULL DEFAULT '[]',
    pinned      TEXT NOT NULL DEFAULT '[]',
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_apps_profile ON profile_apps (profile_id)"#,
    // Insert a row whenever provision succeeds — ON CONFLICT IGNORE means re-runs
    // don't duplicate entries. Use provision.ts's own migration key format:
    // 'provision_v{N}' where N increments per schema change batch.

    // ── userauth ─────────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS userauth (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    workos_client_id TEXT NOT NULL,
    workos_api_key TEXT NOT NULL,
    workos_redirect_uri TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS userauth_profile_id_unique ON userauth (profile_id)"#,
    // ── users ────────────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    workos_id TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    username TEXT UNIQUE,
    bio TEXT,
    location TEXT,
    website TEXT,
    social_links TEXT NOT NULL DEFAULT '[]',
    profile_picture_url TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    last_login INTEGER,
    is_active INTEGER DEFAULT 1
  )"#,
    // ── team_access ──────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS team_access (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    app_access TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )"#,
    // ── team_activity_log ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS team_activity_log (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )"#,
    // ── custom_domains ─────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS custom_domains (
    id TEXT PRIMARY KEY,
    profile_id TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    verified_at INTEGER,
    ssl_status TEXT DEFAULT 'pending',
    cf_hostname_id TEXT,
    cf_dns_record_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains (domain)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_custom_domains_profile ON custom_domains (profile_id)"#,
    // ── connections (integration tokens, e.g. Zernio API keys) ──
    r#"CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    name TEXT NOT NULL,
    -- Human label: "Main Twitter App", "SES Production", "OpenAI GPT-4o"
    label TEXT,
    -- UI grouping: "Social", "Email", "AI", "Payments", "Automation"
    service TEXT NOT NULL,
    -- 'zernio' | 'twitter_direct' | 'instagram_direct' | 'facebook_direct'
    -- | 'linkedin_direct' | 'tiktok_direct' | 'youtube_direct'
    -- | 'openai' | 'anthropic' | 'resend' | 'ses' | 'stripe' | 'paddle' | 'n8n'

    -- All encrypted at rest via vault.ts
    client_id TEXT,          -- API Key / Access Key ID / Consumer Key / Publishable Key
    client_secret TEXT,      -- API Secret / Secret Key / Consumer Secret
    access_token TEXT,       -- OAuth Access Token / Bearer Token / Secret Key
    refresh_token TEXT,      -- OAuth Refresh Token / OAuth Token Secret (OAuth 1.0a)
    token_expires_at INTEGER,-- Unix timestamp (NULL = non-expiring key)

    -- For services that use a workspace/profile concept (e.g. Zernio profile _id)
    external_profile_id TEXT,

    url TEXT,
    username TEXT,
    password TEXT,

    -- For webhook-based services (n8n, Zapier, custom)
    webhook_url TEXT,

    -- For MCP server integrations
    mcp_server_url TEXT,

    -- OAuth specific fields
    provider TEXT,           -- Identifies the OAuth provider if different from service
    scopes TEXT,             -- Granted OAuth scopes space-separated
    email TEXT,              -- Associated email address from the provider

    -- Extra fields (JSON) for anything not covered above
    -- ses:    {"region":"us-east-1","from_email":"hello@example.com"}
    -- stripe: {"webhook_secret":"whsec_xxx"}
    extra TEXT NOT NULL DEFAULT '{}',

    is_active INTEGER NOT NULL DEFAULT 1,
    is_verified INTEGER NOT NULL DEFAULT 0,  -- passed a test-ping
    last_verified_at INTEGER,
    last_error TEXT,
    error_count INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_connections_profile     ON connections (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_connections_service     ON connections (profile_id, service)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_name ON connections (profile_id, name)"#,
    // ── settings (userDB-only) ────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    site_title TEXT,
    tagline TEXT,
    site_description TEXT,
    logo_url TEXT,
    favicon TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    canonical_url TEXT,
    robots TEXT DEFAULT 'index,follow',
    google_tag_manager_id TEXT,
    ga_tracking_id TEXT,
    google_site_verification TEXT,
    timezone TEXT,
    location TEXT,
    industry TEXT,
    country TEXT,
    currency TEXT,
    supported_currencies TEXT NOT NULL DEFAULT '[]',
    theme TEXT NOT NULL DEFAULT '{}',
    working_hours TEXT DEFAULT '{}',
    crm_auto_approve INTEGER NOT NULL DEFAULT 0,
    pipeline_stages TEXT DEFAULT '["new","contacted","proposal","negotiation","won","lost"]',
    invoice_sequence INTEGER NOT NULL DEFAULT 0,
    proposal_sequence INTEGER NOT NULL DEFAULT 0,
    language TEXT,
    "index" INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_profile ON settings (profile_id)"#,
    // ── categories ────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    order_index INTEGER DEFAULT 0
  )"#,
    // ── profiles ──────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    bio TEXT,
    navigation_menu TEXT DEFAULT '[]',
    footer_menu TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    enabled_categories TEXT DEFAULT '["all", "links", "about"]',
    home_visibility TEXT DEFAULT '{}',
    category_visibility TEXT DEFAULT '{}',
    avatar_url TEXT,
    home_page TEXT DEFAULT '/home',
    about TEXT,
    profile_theme TEXT DEFAULT '{}',
    collect_emails TEXT NOT NULL DEFAULT '{}',
    collect_emails_enabled INTEGER NOT NULL DEFAULT 1,
    social_links TEXT NOT NULL DEFAULT '[]',
    about_visibility TEXT NOT NULL DEFAULT '{}',
    landing_visibility TEXT NOT NULL DEFAULT '{}',
    cover_images TEXT NOT NULL DEFAULT '[]',
    info_visibility TEXT NOT NULL DEFAULT '{}',
    chat_agent_enabled INTEGER NOT NULL DEFAULT 0,
    chat_agent_model TEXT NOT NULL DEFAULT 'google/gemini-3.1-flash-lite-preview',
    chat_agent_greeting TEXT,
    chat_agent_personality TEXT,
    chat_agent_accent_color TEXT NOT NULL DEFAULT '#6366f1',
    voice_agent_enabled INTEGER NOT NULL DEFAULT 0,
    voice_agent_show_circle INTEGER NOT NULL DEFAULT 1,
    voice_agent_personality TEXT,
    support_email TEXT,
    from_email TEXT,
    chat_widget_tab TEXT NOT NULL DEFAULT '[]',
    page_visibility TEXT NOT NULL DEFAULT '{}',
    type TEXT,
    niche TEXT,
    minimum_age INTEGER NOT NULL DEFAULT 0,
    resume TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    welcome_video_url TEXT,
    avatar_agent_enabled INTEGER NOT NULL DEFAULT 0,
    avatar_agent_show_circle INTEGER NOT NULL DEFAULT 0,
    avatar_agent_personality TEXT,
    form_id TEXT,
    is_hiring INTEGER NOT NULL DEFAULT 0,
    allocated_plan TEXT DEFAULT 'FREE',
    plan_allocated_at INTEGER DEFAULT 0
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id)"#,
    // Links, analytics, and clicks extracted to `schema/links.rs`
    // ── profile_data (1 row per profile - Context table for AI Agents) ────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS profile_data (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_data_profile_id ON profile_data (profile_id)"#,
    // Collections and link_pages extracted to `schema/links.rs`

    // ── profile_analytics (1 row per profile) ────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS profile_analytics (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL UNIQUE,
    
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    views_device_breakdown TEXT NOT NULL DEFAULT '{}',
    views_os_breakdown TEXT NOT NULL DEFAULT '{}',
    views_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    views_country_breakdown TEXT NOT NULL DEFAULT '{}',
    views_city_breakdown TEXT NOT NULL DEFAULT '{}',
    views_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    
    bot_visits INTEGER NOT NULL DEFAULT 0,
    total_visits INTEGER NOT NULL DEFAULT 0,
    visits_7d TEXT NOT NULL DEFAULT '[]',
    visits_30d TEXT NOT NULL DEFAULT '[]',
    visits_12m TEXT NOT NULL DEFAULT '[]',
    visits_lifetime TEXT NOT NULL DEFAULT '{}',
    visits_device_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_os_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_country_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_city_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    
    bot_clicks INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    clicks_7d TEXT NOT NULL DEFAULT '[]',
    clicks_30d TEXT NOT NULL DEFAULT '[]',
    clicks_12m TEXT NOT NULL DEFAULT '[]',
    clicks_lifetime TEXT NOT NULL DEFAULT '{}',
    device_clicks TEXT NOT NULL DEFAULT '{}',
    os_clicks TEXT NOT NULL DEFAULT '{}',
    browser_clicks TEXT NOT NULL DEFAULT '{}',
    country_clicks TEXT NOT NULL DEFAULT '{}',
    city_clicks TEXT NOT NULL DEFAULT '{}',
    referrer_clicks TEXT NOT NULL DEFAULT '{}',
    utm_source_clicks TEXT NOT NULL DEFAULT '{}',
    utm_medium_clicks TEXT NOT NULL DEFAULT '{}',
    utm_campaign_clicks TEXT NOT NULL DEFAULT '{}',
    
    total_sales INTEGER NOT NULL DEFAULT 0,
    sales_7d TEXT NOT NULL DEFAULT '[]',
    sales_30d TEXT NOT NULL DEFAULT '[]',
    sales_12m TEXT NOT NULL DEFAULT '[]',
    sales_lifetime TEXT NOT NULL DEFAULT '{}',
    sales_device TEXT NOT NULL DEFAULT '{}',
    sales_os TEXT NOT NULL DEFAULT '{}',
    sales_browser TEXT NOT NULL DEFAULT '{}',
    sales_countries TEXT NOT NULL DEFAULT '{}',
    sales_cities TEXT NOT NULL DEFAULT '{}',
    sales_referrer TEXT NOT NULL DEFAULT '{}',
    sales_utm_source TEXT NOT NULL DEFAULT '{}',
    sales_utm_medium TEXT NOT NULL DEFAULT '{}',
    sales_utm_campaign TEXT NOT NULL DEFAULT '{}',
    
    total_earnings INTEGER NOT NULL DEFAULT 0,
    revenue_7d TEXT NOT NULL DEFAULT '[]',
    revenue_30d TEXT NOT NULL DEFAULT '[]',
    revenue_12m TEXT NOT NULL DEFAULT '[]',
    revenue_lifetime TEXT NOT NULL DEFAULT '{}',
    
    total_products INTEGER NOT NULL DEFAULT 0,
    total_links INTEGER NOT NULL DEFAULT 0,
    active_links INTEGER NOT NULL DEFAULT 0,
    
    product_email_opens INTEGER NOT NULL DEFAULT 0,
    product_email_clicks INTEGER NOT NULL DEFAULT 0,
    
    last_aggregated_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_analytics_profile_id ON profile_analytics (profile_id)"#,
    // ── sessions ──────────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT,
    ip_address TEXT,
    user_agent TEXT
  )"#,
    // ── subscribers ───────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    referrer_domain TEXT,
    timezone TEXT,
    browser_name TEXT,
    os_name TEXT,
    device_type TEXT,
    ip_address TEXT,
    country TEXT,
    city TEXT,
    is_blocked INT DEFAULT 0,
    is_unsubscribed INT DEFAULT 0,
    blocked_at INTEGER,
    unsubscribed_at INTEGER,
    block_reason TEXT,
    topics TEXT DEFAULT '[]',
    signup_timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_subscribers_profile_id ON subscribers (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers (email)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers (is_blocked, is_unsubscribed)"#,
    // ── newsletter_topics ─────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS newsletter_topics (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_topics_profile_slug ON newsletter_topics (profile_id, slug)"#,
    // ── collections (userDB-only) ───────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    parent_id TEXT,
    media_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL DEFAULT '',
    description TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    type TEXT,
    category_id TEXT,
    category_slug TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_og_image TEXT,
    seo_robots TEXT,
    seo_block_indexing INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    item_ids TEXT DEFAULT '[]',
    auto_rules TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_collections_profile_id ON collections (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_collections_archived ON collections (profile_id, archived)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_collections_profile_type ON collections (profile_id, type)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_profile_slug ON collections (profile_id, slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_collections_category_id ON collections (category_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_collections_parent_id ON collections (parent_id)"#,

    // ── reviews and testimonials (userDB only) ────────────────────────────────
    // ── CRM (7 tables: crm_contacts, crm_deals, crm_activities, crm_tasks, crm_notes, crm_analytics, crm_groups)
    // Also includes: crm_proposals, crm_invoices (from crm-left-schema.md)
    // All defined in src/lib/crm.ts → CRM_SCHEMA_SQL
    // ── Social (connections, social_accounts, social_posts, social_post_platforms,
    //           social_queue, social_analytics, social_inbox, social_labels, social_automations)
    // All defined in src/lib/social.ts → SOCIAL_SCHEMA_SQL
    // ── Chat Agent (chat_sessions, chat_messages) ──
    // ── Voice calls ──────────────────────────────────────────────────────────
    // ── Agent infrastructure (agents, agent_skills, agent_memory, agent_notes,
    //    agent_files, agent_tasks, agent_reports, agent_kb, agent_conversations)
    //  All defined in src/lib/agent.ts → AGENTS_SCHEMA_SQL
    // ── Community (communities, community_categories, community_members,
    //    community_posts, community_comments, community_post_reactions,
    //    community_events, community_event_rsvps, community_leaderboard,
    //    community_badges, community_member_badges, community_dms,
    //    community_notifications, community_analytics)
    //  All defined in src/lib/community.ts → COMMUNITY_SCHEMA_SQL
    // ── User Affiliate Program (user_affiliate_programs, user_affiliate_referrers,
    //    user_affiliate_commissions, user_affiliate_payouts)
    //  Allows each creator to run their own affiliate program for community/products.
    //  All defined in src/lib/affiliate.ts → AFFILIATE_SCHEMA_SQL
    // ── Advertising (ad_accounts, ad_campaigns, ad_groups, ads, ad_creatives,
    //    ad_audiences, ad_analytics, ad_snapshots)
    // All defined in src/lib/ads.ts → ADS_SCHEMA_SQL
    // ── Email Tracking System
    //  All defined in src/lib/email-tracking.ts → EMAIL_TRACKING_SCHEMA_SQL
    // ── Feedback (boards, posts, votes, comments, etc)
    // All defined in src/lib/feedback.ts → FEEDBACK_SCHEMA_SQL
    // ── Community views
    // ── Review views
    // ── Asset Management / Media Library ──────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS media (
    id               TEXT PRIMARY KEY,
    profile_id       TEXT NOT NULL,
    user_id          TEXT NOT NULL DEFAULT 'owner',
    filename         TEXT NOT NULL DEFAULT '',
    name             TEXT NOT NULL DEFAULT '',
    file_type        TEXT NOT NULL DEFAULT 'image',
    media_type       TEXT NOT NULL DEFAULT 'image',
    url              TEXT NOT NULL DEFAULT '',
    local_url        TEXT,
    alt_text         TEXT,
    thumbnail_url    TEXT,
    size_bytes       INTEGER NOT NULL DEFAULT 0,
    mime_type        TEXT,
    width            INTEGER,
    height           INTEGER,
    storage_provider TEXT NOT NULL DEFAULT 'r2',
    asset_id         TEXT,
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_media_profile_id ON media (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_media_type ON media (media_type)"#,
    r#"CREATE TABLE IF NOT EXISTS sliders (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sliders_profile_id ON sliders (profile_id)"#,
    r#"CREATE TABLE IF NOT EXISTS slider_items (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    slider_id TEXT NOT NULL,
    media_id TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    caption TEXT,
    link TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_slider_items_profile_id ON slider_items (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_slider_items_slider_id ON slider_items (slider_id)"#,
    // ── Seed Categories ──────────────────────────────────────────────────────
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_1', 'Links', 'links', 'General links and bookmarks', 1)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_2', 'Tools', 'tools', 'Development tools and utilities', 2)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_3', 'Gears', 'gears', 'Hardware and equipment', 3)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_4', 'Wears', 'wears', 'Fashion and clothing', 4)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_5', 'Store', 'store', 'Online stores and shops', 5)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_6', 'Shop', 'shop', 'Shopping and retail', 6)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_7', 'Books', 'books', 'Books and reading materials', 7)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_8', 'Events', 'events', 'Events and conferences', 8)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_9', 'Movies', 'movies', 'Movies and entertainment', 9)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_10', 'Music', 'music', 'Music and audio content', 10)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_11', 'Portfolio', 'portfolio', 'Portfolio and work samples', 11)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_12', 'News', 'news', 'News and articles', 12)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_13', 'Gallery', 'gallery', 'Images and galleries', 13)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_14', 'FAQs', 'faqs', 'Frequently asked questions', 14)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_15', 'Startups', 'startups', 'Startup resources and tools', 15)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_16', 'Feed', 'feed', 'RSS feeds and updates', 16)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_17', 'Groups', 'groups', 'Communities and groups', 17)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_18', 'Courses', 'courses', 'Online courses and learning', 18)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_19', 'Downloads', 'downloads', 'Downloadable resources', 19)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_20', 'Newsletter', 'newsletter', 'Newsletter subscriptions', 20)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_21', 'Sponsorship', 'sponsorship', 'Sponsorship opportunities', 21)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_22', '1:1 Call', 'meeting', 'One-on-one sessions', 22)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_23', 'Featured', 'featured', 'Press Release', 23)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_24', 'Webinar', 'webinar', 'Webinars', 24)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_25', 'Services', 'services', 'Offer Custom or On Demand Services', 25)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_26', 'Projects', 'projects', 'Showcase your projects and work', 26)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_27', 'Listing', 'listing', 'List your items or services', 27)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_28', 'Testimonials', 'testimonials', 'Customer testimonials and reviews', 28)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_29', 'Menu', 'menu', 'Food and restaurant menus', 29)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_30', 'Booking', 'booking', 'Bookings and reservations', 30)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_31', 'Jobs', 'jobs', 'Jobs Listing for hiring', 31)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_32', 'Docs', 'docs', 'Documentation and Support', 32)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_33', 'Features', 'features', 'Your Business Features', 33)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_34', 'Forms', 'forms', 'Fill the form', 34)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_35', 'Blog', 'blog', 'Read the latest blog', 35)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_36', 'Guides', 'guides', 'Share guides to your subscribers', 36)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_37', 'Notes', 'notes', 'Share Notes with audience.', 37)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_38', 'Skills', 'skills', 'Highlight your Skills', 38)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_39', 'Prompt', 'prompt', 'Share AI Prompts', 39)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_40', 'Compare', 'compare', 'Compare options', 40)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_41', 'Alternative', 'alternative', 'List alternatives', 41)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_42', 'Community', 'community', 'Join our community', 42)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_43', 'ShortURL', 'shorturl', 'Shortened links and redirects', 43)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_44', 'Merch', 'merch', 'Merchandise and products', 44)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_45', 'Posts', 'posts', 'Short posts and updates', 45)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_46', 'Videos', 'videos', 'Video content', 46)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_47', 'Pages', 'page', 'Custom pages', 47)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_48', 'Podcast', 'podcast', 'Podcast episodes and shows', 48)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_49', 'Membership', 'membership', 'Membership groups and tiers', 49)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_50', 'Subscription', 'subscription', 'Subscription groups and tiers', 50)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_51', 'AI Tools', 'ai-tools', 'AI Tools and resources', 51)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_all_001', 'All', 'all', 'Home page section', 0)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_landing_001', 'Landing', 'landing', 'Landing page section', 0)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_about_001', 'About', 'about', 'About page section', 0)"#,
    r#"INSERT OR IGNORE INTO categories (id, name, slug, description, order_index) VALUES ('cat_activity_001', 'Activity', 'activity', 'Activity page', 0)"#,
];

const SEED_SQL: &[&str] = &[
    // ── AI Agent Users ───────────────────────────────────────────────────────
    r#"INSERT OR IGNORE INTO users (id, email, first_name, username, profile_picture_url, created_at, updated_at, is_active) VALUES ('a1b2c3d4-0001-4000-8000-000000000001', 'claude@businesskit.io', 'Claude', 'claude', 'https://pbs.twimg.com/profile_images/1950950107937185792/QOfEjFoJ_400x400.jpg', strftime('%s','now'), strftime('%s','now'), 1)"#,
    r#"INSERT OR IGNORE INTO users (id, email, first_name, username, profile_picture_url, created_at, updated_at, is_active) VALUES ('a1b2c3d4-0002-4000-8000-000000000002', 'gemini@businesskit.io', 'Gemini', 'gemini', 'https://pbs.twimg.com/profile_images/1940093473564073984/jiafRcO0_400x400.png', strftime('%s','now'), strftime('%s','now'), 1)"#,
    r#"INSERT OR IGNORE INTO users (id, email, first_name, username, profile_picture_url, created_at, updated_at, is_active) VALUES ('a1b2c3d4-0003-4000-8000-000000000003', 'chatgpt@businesskit.io', 'ChatGPT', 'chatgpt', 'https://pbs.twimg.com/profile_images/1886916133917487104/dJrir79p_400x400.png', strftime('%s','now'), strftime('%s','now'), 1)"#,
    r#"INSERT OR IGNORE INTO users (id, email, first_name, username, profile_picture_url, created_at, updated_at, is_active) VALUES ('a1b2c3d4-0004-4000-8000-000000000004', 'grok@businesskit.io', 'Grok', 'grok', 'https://pbs.twimg.com/profile_images/1893219113717342208/Vgg2hEPa_400x400.jpg', strftime('%s','now'), strftime('%s','now'), 1)"#,
    r#"INSERT OR IGNORE INTO users (id, email, first_name, username, profile_picture_url, created_at, updated_at, is_active) VALUES ('a1b2c3d4-0005-4000-8000-000000000005', 'ai-agent@businesskit.io', 'AI Agents', 'ai_agents', 'https://pbs.twimg.com/profile_images/1798110641414443008/XP8gyBaY_400x400.jpg', strftime('%s','now'), strftime('%s','now'), 1)"#,
    // ── Seed Pages ───────────────────────────────────────────────────────────
    r#"INSERT OR IGNORE INTO pages (id, profile_id, user_id, slug, title, excerpt, nav_active, menu_active, footer_active, published, sections, faq, created_at, updated_at) VALUES ('page_home_default', 'default', 'owner', 'home', 'Home', 'Welcome to my website', 1, 1, 1, 1, '[]', '[]', strftime('%s','now'), strftime('%s','now'))"#,
];
