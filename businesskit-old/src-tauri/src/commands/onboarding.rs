// src-tauri/src/commands/onboarding.rs
// UserDB onboarding, schema provisioning, status inspection, migrations, and seeding.

use crate::db::provision::provision_user_database;
use crate::AppState;
use std::sync::Arc;
use tauri::State;

fn parse_trigger_meta(sql: &str) -> Option<(String, String)> {
    let tokens: Vec<&str> = sql.split_whitespace().collect();
    if tokens.len() < 3 {
        return None;
    }
    let mut i = 0;
    if !tokens[i].eq_ignore_ascii_case("CREATE") {
        return None;
    }
    i += 1;
    if i >= tokens.len() || !tokens[i].eq_ignore_ascii_case("TRIGGER") {
        return None;
    }
    i += 1;
    if i + 2 < tokens.len()
        && tokens[i].eq_ignore_ascii_case("IF")
        && tokens[i + 1].eq_ignore_ascii_case("NOT")
        && tokens[i + 2].eq_ignore_ascii_case("EXISTS")
    {
        i += 3;
    }
    if i >= tokens.len() {
        return None;
    }
    let trigger_name = tokens[i].trim_matches('"').trim_matches('`').to_string();
    i += 1;

    // Find "ON"
    while i < tokens.len() && !tokens[i].eq_ignore_ascii_case("ON") {
        i += 1;
    }
    if i >= tokens.len() || i + 1 >= tokens.len() {
        return None;
    }
    i += 1;
    let raw_table = tokens[i];
    let table_name = raw_table
        .split('(')
        .next()?
        .trim_matches('"')
        .trim_matches('`')
        .to_string();

    Some((trigger_name, table_name))
}

fn parse_index_meta(sql: &str) -> Option<(String, String)> {
    let tokens: Vec<&str> = sql.split_whitespace().collect();
    if tokens.len() < 4 {
        return None;
    }

    let mut i = 0;
    if !tokens[i].eq_ignore_ascii_case("CREATE") {
        return None;
    }
    i += 1;
    if i < tokens.len() && tokens[i].eq_ignore_ascii_case("UNIQUE") {
        i += 1;
    }
    if i >= tokens.len() || !tokens[i].eq_ignore_ascii_case("INDEX") {
        return None;
    }
    i += 1;
    if i + 2 < tokens.len()
        && tokens[i].eq_ignore_ascii_case("IF")
        && tokens[i + 1].eq_ignore_ascii_case("NOT")
        && tokens[i + 2].eq_ignore_ascii_case("EXISTS")
    {
        i += 3;
    }
    if i >= tokens.len() {
        return None;
    }
    let index_name = tokens[i].trim_matches('"').trim_matches('`').to_string();
    i += 1;

    // Find "ON"
    while i < tokens.len() && !tokens[i].eq_ignore_ascii_case("ON") {
        i += 1;
    }
    if i >= tokens.len() || i + 1 >= tokens.len() {
        return None;
    }
    i += 1;
    let raw_table = tokens[i];
    let table_part = raw_table
        .split('(')
        .next()?
        .trim_matches('"')
        .trim_matches('`')
        .to_string();

    Some((index_name, table_part))
}

fn parse_table_meta(stmt: &str) -> Option<(&str, &str)> {
    let s = stmt.trim();
    let upper = s.to_uppercase();
    if !upper.starts_with("CREATE TABLE") {
        return None;
    }
    let paren_idx = s.find('(')?;
    let end_paren = s.rfind(')')?;
    if paren_idx >= end_paren {
        return None;
    }
    let before_paren = &s[..paren_idx];
    let tokens: Vec<&str> = before_paren.split_whitespace().collect();
    let name_part = tokens.last()?.trim_matches('"').trim_matches('`');
    let body = &s[paren_idx + 1..end_paren];
    Some((name_part, body))
}

fn parse_view_name(stmt: &str) -> Option<String> {
    let tokens: Vec<&str> = stmt.split_whitespace().collect();
    if tokens.len() < 3 {
        return None;
    }
    let mut i = 0;
    if !tokens[i].eq_ignore_ascii_case("CREATE") {
        return None;
    }
    i += 1;
    if i >= tokens.len() || !tokens[i].eq_ignore_ascii_case("VIEW") {
        return None;
    }
    i += 1;
    if i + 2 < tokens.len()
        && tokens[i].eq_ignore_ascii_case("IF")
        && tokens[i + 1].eq_ignore_ascii_case("NOT")
        && tokens[i + 2].eq_ignore_ascii_case("EXISTS")
    {
        i += 3;
    }
    if i >= tokens.len() {
        return None;
    }
    Some(tokens[i].trim_matches('"').trim_matches('`').to_string())
}

#[tauri::command]
pub async fn get_userdb_status(
    state: State<'_, Arc<AppState>>,
    force: Option<bool>,
) -> Result<serde_json::Value, String> {
    use serde_json::json;
    const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(300); // 5 min

    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;

    // ── Cache read (instant) ──────────────────────────────────────────────────
    if !force.unwrap_or(false) {
        let cache = state.schema_cache.read().await;
        if let Some((data, inserted_at)) = cache.get(&profile_id) {
            if inserted_at.elapsed() < CACHE_TTL {
                return Ok(data.clone());
            }
        }
    }

    let cdb = state.cdb().await.map_err(|e| e.to_string())?;
    let (turso_url, last_provisioned_at, _) = cdb
        .get_url_and_provision_status(&profile_id)
        .await
        .unwrap_or_default();
    drop(cdb);

    let udb = state.user_db.read().await;
    let Some(udb) = udb.as_ref() else {
        return Ok(json!({
            "profile_id": profile_id,
            "turso_url": turso_url,
            "last_provisioned_at": last_provisioned_at,
            "table_count": 0, "expected_table_count": 0, "tables": [],
            "index_count": 0, "expected_index_count": 0, "indexes": [],
            "trigger_count": 0, "expected_trigger_count": 0, "triggers": [],
            "view_count": 0, "expected_view_count": 0, "views": [],
            "all_healthy": false, "schema_match": false,
            "error": "UserDB not connected for active profile"
        }));
    };

    let conn = match udb.conn() {
        Ok(c) => c,
        Err(e) => {
            return Ok(json!({
                "profile_id": profile_id,
                "turso_url": turso_url,
                "last_provisioned_at": last_provisioned_at,
                "table_count": 0, "expected_table_count": 0, "tables": [],
                "index_count": 0, "expected_index_count": 0, "indexes": [],
                "trigger_count": 0, "expected_trigger_count": 0, "triggers": [],
                "view_count": 0, "expected_view_count": 0, "views": [],
                "all_healthy": false, "schema_match": false,
                "error": e.to_string()
            }));
        }
    };

    // ── 1 Round-trip query for live schema metadata ────────────────────────────
    let schema_sql = r#"
        SELECT 'table' AS kind, name, '' AS extra2
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_bk_%'

        UNION ALL

        SELECT 'index' AS kind, name, tbl_name AS extra2
        FROM sqlite_master
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sqlite_autoindex_%'

        UNION ALL

        SELECT 'trigger' AS kind, name, tbl_name AS extra2
        FROM sqlite_master
        WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%'

        UNION ALL

        SELECT 'view' AS kind, name, '' AS extra2
        FROM sqlite_master
        WHERE type = 'view' AND name NOT LIKE 'sqlite_%'
    "#;

    let mut live_tables: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut live_indexes: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut live_triggers: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut live_views: std::collections::HashSet<String> = std::collections::HashSet::new();

    match conn.query(schema_sql, crate::turso_params![]).await {
        Ok(mut rows) => {
            while let Ok(Some(row)) = rows.next().await {
                let kind: String = row.get(0).unwrap_or_default();
                let name: String = row.get(1).unwrap_or_default();
                match kind.as_str() {
                    "table" => {
                        live_tables.insert(name.to_lowercase(), 0);
                    }
                    "index" => {
                        live_indexes.insert(name.to_lowercase());
                    }
                    "trigger" => {
                        live_triggers.insert(name.to_lowercase());
                    }
                    "view" => {
                        live_views.insert(name.to_lowercase());
                    }
                    _ => {}
                }
            }
        }
        Err(e) => {
            log::warn!("sqlite_master schema status query failed: {}", e);
        }
    }

    // Safely query row counts in 1 round-trip only for tables that actually exist
    if !live_tables.is_empty() {
        let count_queries: Vec<String> = live_tables
            .keys()
            .map(|tbl| format!("SELECT '{}' AS tbl, count(*) AS cnt FROM \"{}\"", tbl, tbl))
            .collect();
        let count_sql = count_queries.join(" UNION ALL ");
        if let Ok(mut rows) = conn.query(&count_sql, crate::turso_params![]).await {
            while let Ok(Some(row)) = rows.next().await {
                if let (Ok(tbl), Ok(cnt)) = (row.get::<String>(0), row.get::<i64>(1)) {
                    live_tables.insert(tbl.to_lowercase(), cnt);
                }
            }
        }
    }

    // ── Parse expected items from static schema SQL ───────────────────────────
    let all_schema_stmts = crate::db::provision::get_all_known_schema_sql();
    let core_schema_stmts = crate::db::provision::get_core_schema_sql();

    let mut expected_tables: Vec<serde_json::Value> = Vec::new();
    let mut expected_indexes: Vec<serde_json::Value> = Vec::new();
    let mut expected_triggers: Vec<serde_json::Value> = Vec::new();
    let mut expected_views: Vec<serde_json::Value> = Vec::new();

    let mut seen_tables: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut seen_indexes: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut seen_triggers: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut seen_views: std::collections::HashSet<String> = std::collections::HashSet::new();

    let mut missing_tables: usize = 0;
    let mut missing_indexes: usize = 0;
    let mut missing_triggers: usize = 0;
    let mut missing_views: usize = 0;

    // Read installed apps from live profile_apps table in UserDB
    let mut installed_apps: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Ok(mut app_rows) = conn
        .query(
            "SELECT installed FROM profile_apps WHERE profile_id = ?",
            crate::turso_params![profile_id.clone()],
        )
        .await
    {
        if let Ok(Some(row)) = app_rows.next().await {
            let installed_json: String = row.get(0).unwrap_or_else(|_| "[]".to_string());
            let installed_list: Vec<String> =
                serde_json::from_str(&installed_json).unwrap_or_default();
            for app in installed_list {
                installed_apps.insert(app.to_lowercase());
            }
        }
    }

    struct SchemaSliceDef {
        module: &'static str,
        stmts: &'static [&'static str],
        is_core: bool,
    }

    let slices = [
        SchemaSliceDef {
            module: "core.rs",
            stmts: crate::db::provision::SCHEMA_SQL,
            is_core: true,
        },
        SchemaSliceDef {
            module: "content.rs",
            stmts: crate::db::schema::content::SCHEMA_SQL,
            is_core: true,
        },
        SchemaSliceDef {
            module: "crm.rs",
            stmts: crate::db::schema::crm::SCHEMA_SQL,
            is_core: true,
        },
        SchemaSliceDef {
            module: "email.rs",
            stmts: crate::db::schema::email::SCHEMA_SQL,
            is_core: true,
        },
        SchemaSliceDef {
            module: "pages.rs",
            stmts: crate::db::schema::pages::SCHEMA_SQL,
            is_core: true,
        },
        SchemaSliceDef {
            module: "agents.rs",
            stmts: crate::db::schema::agents::SCHEMA_SQL,
            is_core: true,
        },
        SchemaSliceDef {
            module: "links.rs",
            stmts: crate::db::schema::links::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "products.rs",
            stmts: crate::db::schema::products::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "product_triggers.rs",
            stmts: crate::db::schema::product_triggers::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "shop.rs",
            stmts: crate::db::schema::shop::SHOP_SCHEMA,
            is_core: false,
        },
        SchemaSliceDef {
            module: "shop-ops.rs",
            stmts: crate::db::schema::shop_ops::SHOP_OPS_SCHEMA,
            is_core: false,
        },
        SchemaSliceDef {
            module: "tax.rs",
            stmts: crate::db::schema::tax::TAX_SCHEMA,
            is_core: false,
        },
        SchemaSliceDef {
            module: "accounts.rs",
            stmts: crate::db::schema::accounts::ACCOUNTS_SCHEMA,
            is_core: false,
        },
        SchemaSliceDef {
            module: "payroll.rs",
            stmts: crate::db::schema::payroll::PAYROLL_SCHEMA,
            is_core: false,
        },
        SchemaSliceDef {
            module: "chat-agent.rs",
            stmts: crate::db::schema::chat_agent::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "social.rs",
            stmts: crate::db::schema::social::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "community.rs",
            stmts: crate::db::schema::community::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "community_triggers.rs",
            stmts: crate::db::schema::community_triggers::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "gsc.rs",
            stmts: crate::db::schema::gsc::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "feedback.rs",
            stmts: crate::db::schema::feedback::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "review.rs",
            stmts: crate::db::schema::review::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "ads.rs",
            stmts: crate::db::schema::ads::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "affiliate.rs",
            stmts: crate::db::schema::affiliate::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "forms.rs",
            stmts: crate::db::schema::forms::SCHEMA_SQL,
            is_core: false,
        },
        SchemaSliceDef {
            module: "jobs.rs",
            stmts: crate::db::schema::jobs::SCHEMA_SQL,
            is_core: false,
        },
    ];

    let is_slice_installed = |module: &str, is_core: bool| -> bool {
        if is_core {
            return true;
        }
        match module {
            "links.rs" => {
                installed_apps.contains("links")
                    || installed_apps.contains("link-in-bio")
                    || installed_apps.contains("link_in_bio")
                    || installed_apps.contains("app-links")
            }
            "products.rs" | "product_triggers.rs" => {
                installed_apps.contains("store")
                    || installed_apps.contains("store-digital")
                    || installed_apps.contains("store_digital")
                    || installed_apps.contains("app-store")
                    || installed_apps.contains("app-store-digital")
            }
            "shop.rs" | "shop-ops.rs" => {
                installed_apps.contains("shop") || installed_apps.contains("app-shop")
            }
            "tax.rs" => installed_apps.contains("tax") || installed_apps.contains("app-tax"),
            "accounts.rs" => {
                installed_apps.contains("accounts") || installed_apps.contains("app-accounts")
            }
            "payroll.rs" => {
                installed_apps.contains("payroll") || installed_apps.contains("app-payroll")
            }
            "chat-agent.rs" => {
                installed_apps.contains("chat")
                    || installed_apps.contains("chat-agent")
                    || installed_apps.contains("chat_agent")
                    || installed_apps.contains("app-chat")
            }
            "social.rs" => {
                installed_apps.contains("social") || installed_apps.contains("app-social")
            }
            "community.rs" | "community_triggers.rs" => {
                installed_apps.contains("community") || installed_apps.contains("app-community")
            }
            "gsc.rs" => installed_apps.contains("gsc") || installed_apps.contains("app-gsc"),
            "feedback.rs" => {
                installed_apps.contains("feedback") || installed_apps.contains("app-feedback")
            }
            "review.rs" => {
                installed_apps.contains("review")
                    || installed_apps.contains("reviews")
                    || installed_apps.contains("app-reviews")
            }
            "ads.rs" => installed_apps.contains("ads") || installed_apps.contains("app-ads"),
            "affiliate.rs" => {
                installed_apps.contains("affiliate") || installed_apps.contains("app-affiliate")
            }
            "forms.rs" => {
                installed_apps.contains("forms")
                    || installed_apps.contains("form")
                    || installed_apps.contains("app-forms")
            }
            "jobs.rs" => {
                installed_apps.contains("jobs")
                    || installed_apps.contains("job")
                    || installed_apps.contains("app-jobs")
            }
            _ => true,
        }
    };

    for slice in &slices {
        let app_installed = is_slice_installed(slice.module, slice.is_core);
        if !app_installed {
            continue;
        }

        for stmt in slice.stmts {
            let s = stmt.trim();
            let upper = s.to_uppercase();

            if upper.starts_with("CREATE TABLE") {
                if let Some((name, body)) = parse_table_meta(s) {
                    let name_lower = name.to_lowercase();
                    let exists = live_tables.contains_key(&name_lower);

                    if !seen_tables.contains(&name_lower) {
                        seen_tables.insert(name_lower.clone());
                        let row_count = live_tables.get(&name_lower).copied().unwrap_or(0);

                        // Count column definitions (split by commas outside parens)
                        let col_count = body
                            .split(',')
                            .filter(|part| {
                                let p = part.trim().to_uppercase();
                                !p.starts_with("PRIMARY KEY")
                                    && !p.starts_with("FOREIGN KEY")
                                    && !p.starts_with("UNIQUE")
                                    && !p.starts_with("CHECK")
                                    && !p.starts_with("CONSTRAINT")
                                    && !p.is_empty()
                            })
                            .count();

                        if !exists {
                            missing_tables += 1;
                        }

                        expected_tables.push(json!({
                            "name": name,
                            "exists": exists,
                            "status": if exists { "healthy" } else { "missing" },
                            "rowCount": row_count,
                            "row_count": row_count,
                            "colCount": if exists { Some(col_count) } else { None::<usize> },
                            "column_count": col_count,
                            "expectedCols": col_count,
                            "module": slice.module,
                            "is_installed": true
                        }));
                    }
                }
            } else if upper.starts_with("CREATE INDEX") || upper.starts_with("CREATE UNIQUE INDEX") {
                if let Some((idx_name, tbl_name)) = parse_index_meta(s) {
                    let idx_lower = idx_name.to_lowercase();
                    let exists = live_indexes.contains(&idx_lower);

                    if !seen_indexes.contains(&idx_lower) {
                        seen_indexes.insert(idx_lower.clone());
                        let is_unique = upper.contains("UNIQUE");

                        if !exists {
                            missing_indexes += 1;
                        }

                        expected_indexes.push(json!({
                            "name": idx_name,
                            "table": tbl_name,
                            "exists": exists,
                            "is_unique": is_unique,
                            "status": if exists { "healthy" } else { "missing" },
                            "module": slice.module,
                            "is_installed": true
                        }));
                    }
                }
            } else if upper.starts_with("CREATE TRIGGER") {
                if let Some((trg_name, tbl_name)) = parse_trigger_meta(s) {
                    let trg_lower = trg_name.to_lowercase();
                    let exists = live_triggers.contains(&trg_lower);

                    if !seen_triggers.contains(&trg_lower) {
                        seen_triggers.insert(trg_lower.clone());

                        if !exists {
                            missing_triggers += 1;
                        }

                        expected_triggers.push(json!({
                            "name": trg_name,
                            "table": tbl_name,
                            "exists": exists,
                            "status": if exists { "healthy" } else { "missing" },
                            "module": slice.module,
                            "is_installed": true
                        }));
                    }
                }
            } else if upper.starts_with("CREATE VIEW") {
                if let Some(view_name) = parse_view_name(s) {
                    let view_lower = view_name.to_lowercase();
                    let exists = live_views.contains(&view_lower);

                    if !seen_views.contains(&view_lower) {
                        seen_views.insert(view_lower.clone());

                        if !exists {
                            missing_views += 1;
                        }

                        expected_views.push(json!({
                            "name": view_name,
                            "exists": exists,
                            "status": if exists { "healthy" } else { "missing" },
                            "module": slice.module,
                            "is_installed": true
                        }));
                    }
                }
            }
        }
    }

    let table_count = expected_tables
        .iter()
        .filter(|t| t["exists"].as_bool().unwrap_or(false))
        .count();
    let index_count = expected_indexes
        .iter()
        .filter(|i| i["exists"].as_bool().unwrap_or(false))
        .count();
    let trigger_count = expected_triggers
        .iter()
        .filter(|tr| tr["exists"].as_bool().unwrap_or(false))
        .count();
    let view_count = expected_views
        .iter()
        .filter(|v| v["exists"].as_bool().unwrap_or(false))
        .count();

    let all_healthy = missing_tables == 0
        && missing_indexes == 0
        && missing_triggers == 0
        && missing_views == 0;

    let response = json!({
        "profile_id": profile_id,
        "turso_url": turso_url,
        "last_provisioned_at": last_provisioned_at,
        "table_count": table_count,
        "expected_table_count": expected_tables.len(),
        "missing_table_count": missing_tables,
        "tables": expected_tables,
        "index_count": index_count,
        "expected_index_count": expected_indexes.len(),
        "missing_index_count": missing_indexes,
        "indexes": expected_indexes,
        "trigger_count": trigger_count,
        "expected_trigger_count": expected_triggers.len(),
        "missing_trigger_count": missing_triggers,
        "triggers": expected_triggers,
        "view_count": view_count,
        "expected_view_count": expected_views.len(),
        "missing_view_count": missing_views,
        "views": expected_views,
        "all_healthy": all_healthy,
        "schema_match": all_healthy,
        "core_statement_count": core_schema_stmts.len(),
        "total_statement_count": all_schema_stmts.len()
    });

    // Cache the result in memory (5 min TTL)
    state
        .schema_cache
        .write()
        .await
        .insert(profile_id, (response.clone(), std::time::Instant::now()));

    Ok(response)
}

/// Returns whether the active profile's UserDB has been provisioned.
/// Fast single-row read against Central DB profiles table.
#[tauri::command]
pub async fn get_provision_status(
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    use serde_json::json;
    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;
    let db = state.cdb().await.map_err(|e| e.to_string())?;
    match db.get_provision_status_light(&profile_id).await {
        Ok((lpa, _)) => Ok(json!({ "has_userdb": true, "last_provisioned_at": lpa })),
        Err(_) => Ok(json!({ "has_userdb": false, "last_provisioned_at": None::<i64> })),
    }
}

/// Run full schema provision on active UserDB.
/// Stamps last_provisioned_at in Central DB on success.
#[tauri::command]
pub async fn provision_user_db_now(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;

    let udb_guard = state.user_db.read().await;
    let udb = udb_guard.as_ref().ok_or("UserDB not connected")?;

    provision_user_database(udb)
        .await
        .map_err(|e| e.to_string())?;

    // Stamp in Central DB and seed profile/user/team/agent rows into the newly provisioned tables
    if let Ok(db) = state.cdb().await {
        let _ = db.mark_provisioned(&profile_id).await;
        let _ = sync_profile_seed_to_userdb(&db, udb, &profile_id, true).await;
    }

    // Invalidate schema cache so next status page visit shows fresh data
    state.schema_cache.write().await.remove(&profile_id);

    Ok(format!(
        "Provisioned successfully for profile {}",
        profile_id
    ))
}

/// Run pending schema migrations manually on active UserDB.
#[tauri::command]
pub async fn provision_migrations_now(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;

    let udb_guard = state.user_db.read().await;
    let udb = udb_guard.as_ref().ok_or("UserDB not connected")?;

    let (newly_added, already_existed) = crate::db::provision::run_migrations(udb)
        .await
        .map_err(|e| e.to_string())?;

    // Invalidate schema cache so status page shows updated counts
    state.schema_cache.write().await.remove(&profile_id);

    let total = newly_added + already_existed;
    if total > 0 {
        if newly_added > 0 && already_existed > 0 {
            Ok(format!(
                "Processed {} migration(s) for profile {} ({} new column(s) added, {} already existed in schema DDL)",
                total, profile_id, newly_added, already_existed
            ))
        } else if newly_added > 0 {
            Ok(format!(
                "Successfully added {} new column(s) via migration for profile {}",
                newly_added, profile_id
            ))
        } else {
            Ok(format!(
                "Verified {} schema migration(s) for profile {} (all columns already present)",
                already_existed, profile_id
            ))
        }
    } else {
        Ok(format!(
            "UserDB schema is completely up-to-date for profile {}",
            profile_id
        ))
    }
}

/// Recreate/provision a single table if it is missing or needs repair.
#[tauri::command]
pub async fn recreate_user_table(
    table_name: String,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;

    let udb_guard = state.user_db.read().await;
    let udb = udb_guard.as_ref().ok_or("UserDB not connected")?;

    crate::db::provision::provision_single_table(udb, &table_name)
        .await
        .map_err(|e| e.to_string())?;

    // Invalidate schema cache
    state.schema_cache.write().await.remove(&profile_id);

    Ok(format!(
        "Table '{}' provisioned successfully for profile {}",
        table_name, profile_id
    ))
}

/// Recreate all triggers for a table group or all tables.
#[tauri::command]
pub async fn recreate_user_triggers(
    group: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;

    let udb_guard = state.user_db.read().await;
    let udb = udb_guard.as_ref().ok_or("UserDB not connected")?;
    let conn = udb.conn().map_err(|e| e.to_string())?;

    let all_schema_stmts = crate::db::provision::get_all_known_schema_sql();
    let group_filter = group.as_deref().unwrap_or("all").to_lowercase();

    let mut executed = 0;
    let mut dropped = 0;

    for stmt in all_schema_stmts {
        let s = stmt.trim();
        if s.to_uppercase().starts_with("CREATE TRIGGER") {
            if let Some((trg_name, tbl_name)) = parse_trigger_meta(s) {
                // If group specified, check if table matches group
                let should_run = if group_filter == "all" {
                    true
                } else {
                    tbl_name.to_lowercase().contains(&group_filter)
                };

                if should_run {
                    // Drop trigger first
                    let drop_sql = format!("DROP TRIGGER IF EXISTS \"{}\"", trg_name);
                    let _ = conn.execute(&drop_sql, crate::turso_params![]).await;
                    dropped += 1;

                    // Recreate trigger
                    if let Err(e) = conn.execute(s, crate::turso_params![]).await {
                        log::warn!("Failed to recreate trigger {}: {}", trg_name, e);
                    } else {
                        executed += 1;
                    }
                }
            }
        }
    }

    // Invalidate cache
    state.schema_cache.write().await.remove(&profile_id);

    Ok(format!(
        "Recreated {} triggers (dropped {}) for profile {}",
        executed, dropped, profile_id
    ))
}

/// Recreate a single named trigger.
#[tauri::command]
pub async fn recreate_single_trigger(
    trigger_name: String,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;

    let udb_guard = state.user_db.read().await;
    let udb = udb_guard.as_ref().ok_or("UserDB not connected")?;
    let conn = udb.conn().map_err(|e| e.to_string())?;

    let target = trigger_name.trim().to_lowercase();
    let all_schema_stmts = crate::db::provision::get_all_known_schema_sql();

    let mut found_sql = None;
    for stmt in all_schema_stmts {
        let s = stmt.trim();
        if s.to_uppercase().starts_with("CREATE TRIGGER") {
            if let Some((trg_name, _)) = parse_trigger_meta(s) {
                if trg_name.to_lowercase() == target {
                    found_sql = Some(s);
                    break;
                }
            }
        }
    }

    let sql = found_sql.ok_or_else(|| format!("Trigger {} not found in schema definitions", trigger_name))?;

    // Drop first
    let drop_sql = format!("DROP TRIGGER IF EXISTS \"{}\"", trigger_name);
    let _ = conn.execute(&drop_sql, crate::turso_params![]).await;

    // Create
    conn.execute(sql, crate::turso_params![])
        .await
        .map_err(|e| format!("Failed to create trigger: {}", e))?;

    // Invalidate cache
    state.schema_cache.write().await.remove(&profile_id);

    Ok(format!("Trigger {} recreated successfully", trigger_name))
}

/// Sync owner user, AI agents, profile row and home page from Central DB to UserDB.
/// Ensures the newly connected UserDB is fully populated with profile records and never reports "Profile not found".
pub async fn sync_profile_seed_to_userdb(
    cdb: &crate::db::central::CentralDb,
    user_db: &crate::db::user::UserDb,
    profile_id: &str,
    force_seed: bool,
) -> Result<(), String> {
    let conn = user_db.conn().map_err(|e| e.to_string())?;

    let mut check = conn
        .query(
            "SELECT id FROM profiles WHERE id = ?1 LIMIT 1",
            crate::turso_params![profile_id],
        )
        .await;
    let needs_profile_seed = match check.as_mut() {
        Ok(r) => r.next().await.ok().flatten().is_none(),
        Err(_) => true,
    };

    if let Ok(p) = cdb.get_profile_by_id(profile_id).await {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        if needs_profile_seed || force_seed {
            // 1. Seed Owner User
            if let Ok(u) = cdb.get_user_by_id(&p.user_id).await {
                let _ = conn
                    .execute(
                        "INSERT OR IGNORE INTO users (
                        id, email, first_name, last_name, profile_picture_url, username,
                        created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        crate::turso_params![
                            u.id,
                            u.email,
                            u.first_name,
                            u.last_name,
                            u.profile_picture_url,
                            u.username,
                            now,
                            now
                        ],
                    )
                    .await;
            }
        }

        let current_user_id = crate::license::load_cached_user_id().unwrap_or_default();
        let mut check_team = conn
            .query(
                "SELECT id FROM team_access WHERE user_id = ?1 LIMIT 1",
                crate::turso_params![current_user_id],
            )
            .await;
        let needs_team_sync = match check_team.as_mut() {
            Ok(r) => r.next().await.ok().flatten().is_none(),
            Err(_) => true,
        };

        // 1.5 Seed all Team Members (Only sync if missing from local UserDB)
        if needs_team_sync {
            if let Ok(cconn) = cdb.conn() {
                if let Ok(mut rows) = cconn.query(
                    "SELECT u.id, u.email, u.first_name, u.last_name, u.profile_picture_url, u.username, tm.role, tm.app_access
                     FROM users u 
                     INNER JOIN team_members tm ON u.id = tm.user_id 
                     WHERE tm.team_id = ?1",
                    crate::turso_params![p.id.clone()],
                ).await {
                    while let Ok(Some(row)) = rows.next().await {
                        let uid: String = row.get(0).unwrap_or_default();
                        let uemail: String = row.get(1).unwrap_or_default();
                        let ufirst: Option<String> = row.get(2).unwrap_or_default();
                        let ulast: Option<String> = row.get(3).unwrap_or_default();
                        let upic: Option<String> = row.get(4).unwrap_or_default();
                        let uusername: Option<String> = row.get(5).unwrap_or_default();
                        let role: String = row.get(6).unwrap_or_default();
                        let app_access: String = row.get(7).unwrap_or_else(|_| "[]".to_string());
                        
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO users (
                                id, email, first_name, last_name, profile_picture_url, username,
                                created_at, updated_at
                             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                            crate::turso_params![
                                uid.clone(), uemail, ufirst, ulast, upic, uusername, now, now
                            ]
                        ).await;
                        
                        let _ = conn.execute(
                            "INSERT INTO team_access (id, profile_id, user_id, role, app_access, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                             ON CONFLICT(id) DO UPDATE SET 
                                role = excluded.role,
                                app_access = excluded.app_access,
                                updated_at = excluded.updated_at",
                            crate::turso_params![
                                format!("{}-{}", p.id.clone(), uid),
                                p.id.clone(),
                                uid,
                                role,
                                app_access,
                                now,
                                now
                            ]
                        ).await;
                    }
                }
            }
        }

        if needs_profile_seed || force_seed {
            // 2. Seed AI Agent Users
            let ai_users = vec![
                ("a1b2c3d4-0001-4000-8000-000000000001", "Claude", "claude@businesskit.io", "https://pbs.twimg.com/profile_images/1950950107937185792/QOfEjFoJ_400x400.jpg"),
                ("a1b2c3d4-0002-4000-8000-000000000002", "Gemini", "gemini@businesskit.io", "https://pbs.twimg.com/profile_images/1940093473564073984/jiafRcO0_400x400.png"),
                ("a1b2c3d4-0003-4000-8000-000000000003", "ChatGPT", "chatgpt@businesskit.io", "https://pbs.twimg.com/profile_images/1886916133917487104/dJrir79p_400x400.png"),
                ("a1b2c3d4-0004-4000-8000-000000000004", "Grok", "grok@businesskit.io", "https://pbs.twimg.com/profile_images/1893219113717342208/Vgg2hEPa_400x400.jpg"),
                ("a1b2c3d4-0005-4000-8000-000000000005", "AI Agents", "ai-agent@businesskit.io", "https://pbs.twimg.com/profile_images/1798110641414443008/XP8gyBaY_400x400.jpg"),
            ];
            for (ai_id, name, email, pic) in ai_users {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO users (
                        id, email, first_name, username, profile_picture_url, created_at, updated_at, is_active
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    crate::turso_params![ai_id, email, name, name.to_lowercase(), pic, now, now, 1],
                ).await;
            }

            // 3. Upsert Profile
            let _ = conn
                .execute(
                    "INSERT INTO profiles (id, user_id, slug, title, bio, avatar_url, allocated_plan, plan_allocated_at, home_page, enabled_categories)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '/home', '[\"all\", \"links\", \"about\"]')
                 ON CONFLICT(id) DO UPDATE SET 
                    user_id = excluded.user_id,
                    slug = excluded.slug,
                    title = excluded.title,
                    bio = excluded.bio,
                    avatar_url = excluded.avatar_url,
                    allocated_plan = excluded.allocated_plan,
                    plan_allocated_at = excluded.plan_allocated_at,
                    home_page = COALESCE(profiles.home_page, '/home'),
                    enabled_categories = COALESCE(profiles.enabled_categories, '[\"all\", \"links\", \"about\"]')",
                    crate::turso_params![
                        p.id.clone(),
                        p.user_id.clone(),
                        p.slug.clone(),
                        p.title.clone(),
                        p.bio.clone().unwrap_or_default(),
                        p.avatar_url.clone().unwrap_or_default(),
                        p.allocated_plan.clone().unwrap_or_else(|| "FREE".to_string()),
                        p.plan_allocated_at.unwrap_or(0),
                    ],
                )
                .await;

            // 4. Preseed Home Page
            let _ = conn
                .execute(
                    "INSERT OR IGNORE INTO pages (
                        id, profile_id, user_id, slug, title, excerpt,
                        nav_active, menu_active, footer_active, published,
                        sections, faq, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, 'home', 'Home', 'Welcome to my website', 1, 1, 1, 1, '[]', '[]', ?4, ?4)",
                    crate::turso_params![
                        format!("page-home-{}", p.id),
                        p.id.clone(),
                        p.user_id.clone(),
                        now,
                    ],
                )
                .await;

            log::info!(
                "Owner user, AI agents, Profile, and Home page synced in UserDB for {}",
                profile_id
            );
        }
    }

    Ok(())
}

/// Connect to the user's Turso DB using provided credentials.
/// Tests connection and saves credentials in Central DB & keychain for the target profile.
/// License-exempt — needed during initial setup. Provisioning is done on /status.
#[tauri::command]
pub async fn connect_user_db(
    turso_url: String,
    turso_token: String,
    org_id: String,
    profile_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    use crate::db::user::UserDb;

    let raw_url = turso_url.trim().to_string();
    let clean_token = turso_token.trim().to_string();

    // Test the connection & verify write permissions
    let conn = crate::db::turso::TursoConn::new(&raw_url, &clean_token);
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
        .ok();

    let user_db = UserDb::connect(&raw_url, &clean_token)
        .await
        .map_err(|e| format!("Failed to connect to UserDB: {}", e))?;

    // Load org + license from Central DB
    let db_guard = state.cdb().await?;
    let org = db_guard
        .get_organization_by_id(&org_id)
        .await
        .map_err(|e| e.to_string())?;

    let license = db_guard
        .get_license_status(&org.owner_user_id)
        .await
        .map_err(|e| e.to_string())?;

    let secret = crate::commands::settings::get_secret();

    // Determine target profile ID (must be a valid profile ID, never fallback to org_id)
    let active_prof = state.active_profile_id.read().await.clone();
    let target_id = profile_id
        .filter(|s| !s.trim().is_empty())
        .or(active_prof)
        .ok_or_else(|| "Profile ID is required to connect UserDB (cannot use Org ID)".to_string())?;

    // Verify target profile exists in Central DB
    let _ = db_guard
        .get_profile_by_id(&target_id)
        .await
        .map_err(|_| format!("Profile not found in Central DB: {}", target_id))?;

    // Save credentials specifically for this target profile
    let _ = store_in_keychain(&target_id, &raw_url, &clean_token);

    if let Ok(encrypted) = crate::vault::encrypt(&clean_token, &secret, &target_id) {
        let _ = db_guard.update_userdb_creds(&target_id, &raw_url, &encrypted).await;
    }

    // Sync owner user, AI agents, profile row and home page into UserDB
    let _ = sync_profile_seed_to_userdb(&db_guard, &user_db, &target_id, true).await;

    // Set active profile in state & persistent cache
    *state.active_profile_id.write().await = Some(target_id.clone());
    crate::license::save_profile_id(&target_id);

    // Mark as ready in session cache
    state.ready_profiles.write().await.insert(target_id.clone());

    drop(db_guard);

    *state.user_db.write().await = Some(user_db);
    *state.license.write().await = license;
    *state.organization.write().await = Some(org.clone());

    crate::license::save_user_id(&org.owner_user_id);

    log::info!("Connected to UserDB for target profile: {}", target_id);
    Ok(())
}

// ── Credential cache ─────────────────────────────────────────────────────────
// macOS: OS keychain (primary) + encrypted file (backup)
// iOS / Android: file-based cache in app sandbox with robust fallback dirs
// Both are tried on write; either hit on read is accepted.

/// Returns list of potential cross-platform credential cache directories.
pub fn get_cred_cache_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Some(d) = dirs::data_local_dir() {
        dirs.push(d.join("businesskit").join("creds"));
    }
    if let Some(d) = dirs::data_dir() {
        dirs.push(d.join("businesskit").join("creds"));
    }
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(std::path::PathBuf::from(&home).join(".businesskit").join("creds"));
    }
    // Android application sandbox paths
    dirs.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop/files/creds"));
    dirs.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop.debug/files/creds"));
    dirs.push(std::path::PathBuf::from("/data/user/0/io.businesskit.desktop/files/creds"));
    dirs.push(std::path::PathBuf::from("/data/user/0/io.businesskit.desktop.debug/files/creds"));
    dirs
}

/// Write credentials to the file cache, encrypting the token at rest.
pub fn store_in_file_cache(profile_id: &str, url: &str, token: &str) -> anyhow::Result<()> {
    let secret = crate::commands::settings::get_secret();
    let encrypted = crate::vault::encrypt(token, &secret, profile_id)
        .map_err(|e| anyhow::anyhow!("vault encrypt: {}", e))?;
    let content = format!("{url}\n{encrypted}");

    let mut written = false;
    let mut last_err = None;

    for dir in get_cred_cache_dirs() {
        let _ = crate::license::ensure_secure_dir(&dir);
        let file_path = dir.join(format!("userdb_{profile_id}.dat"));
        match crate::license::write_secure_file(&file_path, &content) {
            Ok(_) => {
                written = true;
            }
            Err(e) => {
                last_err = Some(anyhow::anyhow!("write({:?}): {}", file_path, e));
            }
        }
    }

    if written {
        Ok(())
    } else {
        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("No writable credential cache directory available")))
    }
}

/// Read credentials from the file cache, decrypting the token.
pub fn load_from_file_cache(profile_id: &str) -> anyhow::Result<(String, String)> {
    let secret = crate::commands::settings::get_secret();

    for dir in get_cred_cache_dirs() {
        let file_path = dir.join(format!("userdb_{profile_id}.dat"));
        if let Ok(content) = std::fs::read_to_string(&file_path) {
            let mut lines = content.splitn(2, '\n');
            let url = match lines.next() {
                Some(u) if !u.trim().is_empty() => u.trim().to_string(),
                _ => continue,
            };
            let enc = match lines.next() {
                Some(e) if !e.trim().is_empty() => e.trim().to_string(),
                _ => continue,
            };
            if let Ok(token) = crate::vault::decrypt(&enc, &secret, profile_id) {
                return Ok((url, token));
            }
        }
    }
    Err(anyhow::anyhow!("No cached credentials found for profile {}", profile_id))
}

pub fn store_in_keychain(
    profile_id: &str,
    turso_url: &str,
    turso_token: &str,
) -> anyhow::Result<()> {
    store_in_file_cache(profile_id, turso_url, turso_token)
}

pub fn load_from_keychain(profile_id: &str) -> anyhow::Result<(String, String)> {
    load_from_file_cache(profile_id)
}

/// Public entry point called from setup_app at boot to restore user DB connection.
pub async fn connect_from_keychain_pub(
    state: Arc<AppState>,
    profile_id: &str,
) -> anyhow::Result<()> {
    connect_from_keychain(&state, profile_id).await
}

/// Connect UserDB for a profile.
///
/// Flow:
///   1. Central DB → get (url, encrypted_token, last_provisioned_at) in 1 query
///   2. OS keychain → plaintext token (from a previous login, offline-capable)
///      OR decrypt inline with ENCRYPTION_SECRET:profile_id, save to keychain
///   3. Connect UserDB
///   4. If last_provisioned_at is NULL → run full schema provision (748 stmts)
///      then stamp last_provisioned_at so future connects skip this entirely
///   5. Seed profile row from Central DB if missing (INSERT OR IGNORE)
///   6. Mark profile in ready_profiles session cache — re-switches skip steps 1–5
pub async fn connect_from_keychain(state: &Arc<AppState>, profile_id: &str) -> anyhow::Result<()> {
    use crate::db::user::UserDb;

    // ── Step 0: Gating ownership & access BEFORE ready_profiles check ────────
    crate::commands::organization::verify_profile_access(state, profile_id)
        .await
        .map_err(|e| anyhow::anyhow!(e))?;

    // ── Fast path: profile already fully verified this session ──────────────
    // ready_profiles is populated after first successful connect.
    // Re-switches skip ALL guard queries (Central DB + UserDB seed check).
    let already_ready = state.ready_profiles.read().await.contains(profile_id);
    if already_ready {
        if let Ok(creds) = load_from_keychain(profile_id) {
            log::debug!(
                "Profile {} is ready (cached) — reconnecting only",
                profile_id
            );
            let user_db = UserDb::connect(&creds.0, &creds.1).await?;
            *state.user_db.write().await = Some(user_db);
            return Ok(());
        }
    }

    let db = state
        .cdb()
        .await
        .map_err(|e| anyhow::anyhow!("Central DB not ready: {}", e))?;

    // ── Step 1 + 2: Keychain (fast path) or Central DB decrypt (slow path) ──
    let (url, token, last_provisioned_at, schema_version) =
        if let Ok(creds) = load_from_keychain(profile_id) {
            log::debug!("UserDB creds from keychain for profile {}", profile_id);
            let (lpa, sv) = db
                .get_provision_status_light(profile_id)
                .await
                .unwrap_or((None, None));
            (creds.0, creds.1, lpa, sv)
        } else {
            log::info!(
                "Keychain miss — fetching full UserDB creds for profile {}",
                profile_id
            );
            let (turso_url, encrypted_token, lpa, sv) = db
                .get_userdb_creds_full(profile_id)
                .await
                .map_err(|e| anyhow::anyhow!("No creds for profile {}: {}", profile_id, e))?;
            let secret = crate::commands::settings::get_secret();
            let plaintext = crate::vault::decrypt(&encrypted_token, &secret, profile_id)
                .map_err(|e| anyhow::anyhow!("Decrypt failed for profile {}: {}", profile_id, e))?;
            if let Err(e) = store_in_keychain(profile_id, &turso_url, &plaintext) {
                log::warn!("Keychain save failed for profile {}: {}", profile_id, e);
            }
            (turso_url, plaintext, lpa, sv)
        };

    // ── Step 3: Connect ─────────────────────────────────────────────────────
    let user_db = UserDb::connect(&url, &token).await?;

    // ── Step 4: Provision only if never done (last_provisioned_at IS NULL) ──
    if last_provisioned_at.is_none() {
        log::info!(
            "UserDB never provisioned — running schema for profile {}",
            profile_id
        );
        if let Err(e) = crate::db::provision::provision_user_database(&user_db).await {
            log::warn!("Provision error for profile {}: {}", profile_id, e);
        } else {
            if let Err(e) = db.mark_provisioned(profile_id).await {
                log::warn!(
                    "Failed to mark provisioned for profile {}: {}",
                    profile_id,
                    e
                );
            }
        }
    } else {
        // ── Step 4.5: Lightweight migration if schema is outdated ──
        let current_version = crate::db::schema_version::SCHEMA_VERSION;
        let db_version = schema_version.unwrap_or_default();
        if db_version != current_version {
            log::info!(
                "UserDB schema outdated ({} != {}) — running migrations for profile {}",
                db_version,
                current_version,
                profile_id
            );
            if let Err(e) = crate::db::provision::run_migrations(&user_db).await {
                log::warn!("Migration error for profile {}: {}", profile_id, e);
            } else {
                if let Err(e) = db.update_schema_version(profile_id, current_version).await {
                    log::warn!(
                        "Failed to update schema version for profile {}: {}",
                        profile_id,
                        e
                    );
                }
            }
        }
    }

    // ── Step 5: Sync owner user, AI agents, and profile row to UserDB ────
    let _ = sync_profile_seed_to_userdb(
        &db,
        &user_db,
        profile_id,
        last_provisioned_at.is_none(),
    )
    .await;

    // ── Step 6: Mark ready — future re-switches skip all guard queries ───────
    state
        .ready_profiles
        .write()
        .await
        .insert(profile_id.to_string());

    *state.user_db.write().await = Some(user_db);
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RawSqlResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: u64,
    pub execution_time_ms: u128,
}

fn parse_cell_to_json_val(cell: &serde_json::Value) -> serde_json::Value {
    match cell.get("type").and_then(|t| t.as_str()) {
        Some("text") => {
            let val = cell.get("value").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::Value::String(val.to_string())
        }
        Some("integer") => {
            if let Some(v_str) = cell.get("value").and_then(|v| v.as_str()) {
                if let Ok(i) = v_str.parse::<i64>() {
                    return serde_json::json!(i);
                }
            } else if let Some(i) = cell.get("value").and_then(|v| v.as_i64()) {
                return serde_json::json!(i);
            }
            serde_json::Value::Null
        }
        Some("float") => {
            if let Some(f) = cell.get("value").and_then(|v| v.as_f64()) {
                serde_json::json!(f)
            } else {
                serde_json::Value::Null
            }
        }
        Some("blob") => {
            let b64 = cell.get("base64").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::Value::String(format!("[BLOB: {}]", b64))
        }
        Some("null") => serde_json::Value::Null,
        _ => {
            if cell.is_null() {
                serde_json::Value::Null
            } else if let Some(s) = cell.as_str() {
                serde_json::Value::String(s.to_string())
            } else {
                cell.clone()
            }
        }
    }
}

/// Execute custom raw SQL statement(s) against the active UserDB (Turso).
/// Returns columns, rows, rows_affected, and execution duration in milliseconds.
#[tauri::command]
pub async fn execute_raw_sql(
    sql: String,
    state: State<'_, Arc<AppState>>,
) -> Result<RawSqlResult, String> {
    let profile_id = state
        .active_profile_id
        .read()
        .await
        .clone()
        .ok_or("No active profile selected")?;

    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err("SQL query cannot be empty".to_string());
    }

    let udb_guard = state.user_db.read().await;
    let udb = udb_guard
        .as_ref()
        .ok_or("UserDB not connected for active profile")?;
    let conn = udb.conn().map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();

    // Check if SQL contains multiple statements
    let is_multi = trimmed.contains(';')
        && trimmed
            .split(';')
            .filter(|s| !s.trim().is_empty())
            .count()
            > 1;

    let (columns, rows, rows_affected) = if is_multi {
        let stmts: Vec<&str> = trimmed
            .split(';')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        let mut last_cols = Vec::new();
        let mut last_rows = Vec::new();
        let mut total_affected = 0u64;

        for stmt in &stmts {
            let requests = serde_json::json!({
                "requests": [
                    { "type": "execute", "stmt": { "sql": stmt } },
                    { "type": "close" }
                ]
            });

            let resp = conn
                .send_pipeline_request(&requests)
                .await
                .map_err(|e| e.to_string())?;
            if let Some(first) = resp.get("results").and_then(|r| r.get(0)) {
                if first.get("type").and_then(|t| t.as_str()) == Some("error") {
                    let err_msg = first
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("Turso query error");
                    return Err(format!("Error executing '{}': {}", stmt, err_msg));
                }

                if let Some(res) = first.get("response").and_then(|r| r.get("result")) {
                    if let Some(affected) = res.get("affected_row_count").and_then(|a| a.as_u64())
                    {
                        total_affected += affected;
                    }
                    if let Some(cols) = res.get("cols").and_then(|c| c.as_array()) {
                        last_cols = cols
                            .iter()
                            .map(|c| {
                                c.get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string()
                            })
                            .collect();
                    }
                    if let Some(raw_rows) = res.get("rows").and_then(|r| r.as_array()) {
                        last_rows = raw_rows
                            .iter()
                            .map(|row| {
                                row.as_array()
                                    .map(|cells| {
                                        cells.iter().map(parse_cell_to_json_val).collect()
                                    })
                                    .unwrap_or_default()
                            })
                            .collect();
                    }
                }
            }
        }
        (last_cols, last_rows, total_affected)
    } else {
        let requests = serde_json::json!({
            "requests": [
                { "type": "execute", "stmt": { "sql": trimmed } },
                { "type": "close" }
            ]
        });

        let resp = conn
            .send_pipeline_request(&requests)
            .await
            .map_err(|e| e.to_string())?;
        if let Some(first) = resp.get("results").and_then(|r| r.get(0)) {
            if first.get("type").and_then(|t| t.as_str()) == Some("error") {
                let err_msg = first
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("Turso query error");
                return Err(err_msg.to_string());
            }

            if let Some(res) = first.get("response").and_then(|r| r.get("result")) {
                let cols: Vec<String> = res
                    .get("cols")
                    .and_then(|c| c.as_array())
                    .map(|cols| {
                        cols.iter()
                            .map(|c| {
                                c.get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string()
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                let raw_rows = res
                    .get("rows")
                    .and_then(|r| r.as_array())
                    .cloned()
                    .unwrap_or_default();
                let rows: Vec<Vec<serde_json::Value>> = raw_rows
                    .iter()
                    .map(|row| {
                        row.as_array()
                            .map(|cells| cells.iter().map(parse_cell_to_json_val).collect())
                            .unwrap_or_default()
                    })
                    .collect();

                let affected = res
                    .get("affected_row_count")
                    .and_then(|a| a.as_u64())
                    .unwrap_or(0);
                (cols, rows, affected)
            } else {
                (Vec::new(), Vec::new(), 0)
            }
        } else {
            (Vec::new(), Vec::new(), 0)
        }
    };

    let elapsed = start.elapsed().as_millis();

    // If DDL or table modifying query, invalidate schema cache
    let upper = trimmed.to_uppercase();
    if upper.contains("CREATE")
        || upper.contains("DROP")
        || upper.contains("ALTER")
        || upper.contains("PROFILE_APPS")
    {
        state.schema_cache.write().await.remove(&profile_id);
    }

    Ok(RawSqlResult {
        columns,
        rows,
        rows_affected,
        execution_time_ms: elapsed,
    })
}

