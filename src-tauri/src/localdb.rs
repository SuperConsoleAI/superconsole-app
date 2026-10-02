//! LocalDB Studio Backend — Table & Schema Introspection and Data Queries
//!
//! Provides real-time read and introspection capabilities for `superconsole.db`
//! to power the in-app LocalDB Studio (similar to Drizzle Studio).

use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbTableSummary {
    pub name: String,
    pub row_count: i64,
    pub user_row_count: Option<i64>,
    pub has_user_id: bool,
    pub category: String, // "account", "org", "project", "catalog", "system"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbColumnInfo {
    pub cid: i64,
    pub name: String,
    pub type_name: String,
    pub notnull: bool,
    pub dflt_value: Option<String>,
    pub pk: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbIndexInfo {
    pub name: String,
    pub unique: bool,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbTableSchema {
    pub table_name: String,
    pub columns: Vec<LocalDbColumnInfo>,
    pub indexes: Vec<LocalDbIndexInfo>,
    pub create_statement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbTableDataResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub total_count: i64,
    pub page: i64,
    pub page_size: i64,
}

#[tauri::command]
pub fn local_db_list_tables(db: State<Db>) -> Result<Vec<LocalDbTableSummary>, String> {
    let current_user_id = db.get_cloud_identity().and_then(|j| {
        let v: serde_json::Value = serde_json::from_str(&j).ok()?;
        v["user"]["id"].as_str().map(String::from)
    });

    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
        )
        .map_err(|e| e.to_string())?;

    let table_names: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut summaries = Vec::new();

    for name in table_names {
        let has_user_id = if let Ok(mut col_stmt) = conn.prepare(&format!("PRAGMA table_info(\"{}\")", name)) {
            col_stmt
                .query_map([], |r| r.get::<_, String>(1))
                .map(|rows| rows.filter_map(|r| r.ok()).any(|c| c == "user_id"))
                .unwrap_or(false)
        } else {
            false
        };

        let total_count: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM \"{}\"", name), [], |r| r.get(0))
            .unwrap_or(0);

        let user_row_count = if has_user_id {
            if let Some(ref uid) = current_user_id {
                let c: i64 = conn
                    .query_row(
                        &format!("SELECT COUNT(*) FROM \"{}\" WHERE user_id = ?1", name),
                        [uid],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                Some(c)
            } else {
                None
            }
        } else {
            None
        };

        let category = if name.starts_with("account_")
            || name == "memory"
            || name == "memory_vectors"
            || name == "wiki"
            || name == "context"
            || name == "skills"
            || name == "user_usage"
            || name == "env_vars"
        {
            "account".to_string()
        } else if name.starts_with("org_") || name == "organizations" {
            "org".to_string()
        } else if name.starts_with("project_")
            || name == "workspaces"
            || name == "jobs"
            || name == "session_history"
            || name == "chat_messages"
            || name == "chat_sessions"
            || name == "chat_threads"
            || name == "agents"
            || name == "usage_events"
            || name == "inbox"
        {
            "project".to_string()
        } else if name.ends_with("_catalog")
            || name == "plugins"
            || name == "installed_plugins"
            || name == "model_pricing_cache"
        {
            "catalog".to_string()
        } else {
            "system".to_string()
        };

        summaries.push(LocalDbTableSummary {
            name,
            row_count: total_count,
            user_row_count,
            has_user_id,
            category,
        });
    }

    Ok(summaries)
}

#[tauri::command]
pub fn local_db_get_table_schema(
    db: State<Db>,
    table_name: String,
) -> Result<LocalDbTableSchema, String> {
    let conn = db.0.lock().unwrap();

    let create_stmt: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [&table_name],
            |r| r.get(0),
        )
        .map_err(|_| format!("Table '{}' not found in database", table_name))?;

    let mut col_stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", table_name))
        .map_err(|e| e.to_string())?;
    let columns = col_stmt
        .query_map([], |r| {
            Ok(LocalDbColumnInfo {
                cid: r.get(0)?,
                name: r.get(1)?,
                type_name: r.get(2)?,
                notnull: r.get::<_, i64>(3)? != 0,
                dflt_value: r.get(4)?,
                pk: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    let mut idx_stmt = conn
        .prepare(&format!("PRAGMA index_list(\"{}\")", table_name))
        .map_err(|e| e.to_string())?;
    let index_meta = idx_stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)? != 0,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    let mut indexes = Vec::new();
    for (idx_name, is_unique) in index_meta {
        let mut info_stmt = conn
            .prepare(&format!("PRAGMA index_info(\"{}\")", idx_name))
            .map_err(|e| e.to_string())?;
        let col_names = info_stmt
            .query_map([], |r| r.get::<_, String>(2))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();
        indexes.push(LocalDbIndexInfo {
            name: idx_name,
            unique: is_unique,
            columns: col_names,
        });
    }

    Ok(LocalDbTableSchema {
        table_name,
        columns,
        indexes,
        create_statement: create_stmt,
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn local_db_get_table_data(
    db: State<Db>,
    table_name: String,
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
    sort_col: Option<String>,
    sort_desc: Option<bool>,
    only_current_user: Option<bool>,
) -> Result<LocalDbTableDataResult, String> {
    let current_user_id = db.get_cloud_identity().and_then(|j| {
        let v: serde_json::Value = serde_json::from_str(&j).ok()?;
        v["user"]["id"].as_str().map(String::from)
    });

    let conn = db.0.lock().unwrap();

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [&table_name],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !exists {
        return Err(format!("Table '{}' does not exist", table_name));
    }

    if table_name == "env_vars" {
        if let Some(ref uid) = current_user_id {
            let _ = conn.execute(
                "UPDATE env_vars
                 SET scope_id = ?1,
                     user_id = CASE WHEN user_id IN ('local', 'Local', 'system') OR user_id IS NULL THEN ?1 ELSE user_id END,
                     updated_by = ?1
                 WHERE scope = 'account' AND (scope_id = 'local' OR user_id IN ('local', 'Local', 'system'));",
                [uid],
            );
        }
    }

    let mut col_stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", table_name))
        .map_err(|e| e.to_string())?;
    let columns: Vec<String> = col_stmt
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let has_user_id = columns.iter().any(|c| c == "user_id");

    let mut where_clauses = Vec::new();
    let mut params: Vec<String> = Vec::new();

    if only_current_user.unwrap_or(false) && has_user_id {
        if let Some(uid) = current_user_id {
            where_clauses.push("user_id = ?".to_string());
            params.push(uid);
        }
    }

    if let Some(q) = search.filter(|s| !s.trim().is_empty()) {
        let search_like = format!("%{}%", q.trim());
        let mut search_col_clauses = Vec::new();
        for col in &columns {
            search_col_clauses.push(format!("CAST(\"{}\" AS TEXT) LIKE ?", col));
            params.push(search_like.clone());
        }
        if !search_col_clauses.is_empty() {
            where_clauses.push(format!("({})", search_col_clauses.join(" OR ")));
        }
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM \"{}\"{}", table_name, where_sql);
    let total_count: i64 = conn
        .query_row(&count_sql, rusqlite::params_from_iter(params.iter()), |r| r.get(0))
        .unwrap_or(0);

    let order_sql = if let Some(sc) = sort_col.filter(|s| columns.contains(s)) {
        let dir = if sort_desc.unwrap_or(false) { "DESC" } else { "ASC" };
        format!(" ORDER BY \"{}\" {}", sc, dir)
    } else {
        String::new()
    };

    let limit = match page_size {
        Some(ps) if ps > 0 => ps.min(500),
        _ => 50,
    };
    let current_page = page.unwrap_or(1).max(1);
    let offset = (current_page - 1) * limit;

    let query_sql = format!(
        "SELECT * FROM \"{}\"{}{} LIMIT {} OFFSET {}",
        table_name, where_sql, order_sql, limit, offset
    );

    let mut data_stmt = conn.prepare(&query_sql).map_err(|e| e.to_string())?;
    let col_count = data_stmt.column_count();

    let rows = data_stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            let mut row_vals = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val_ref = row.get_ref(i)?;
                let json_val = match val_ref {
                    rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => serde_json::Value::Number(n.into()),
                    rusqlite::types::ValueRef::Real(f) => serde_json::Number::from_f64(f)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Null),
                    rusqlite::types::ValueRef::Text(bytes) => {
                        let s = String::from_utf8_lossy(bytes).to_string();
                        serde_json::Value::String(s)
                    }
                    rusqlite::types::ValueRef::Blob(bytes) => {
                        serde_json::Value::String(format!("<Blob {} bytes>", bytes.len()))
                    }
                };
                row_vals.push(json_val);
            }
            Ok(row_vals)
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    Ok(LocalDbTableDataResult {
        columns,
        rows,
        total_count,
        page: current_page,
        page_size: limit,
    })
}
