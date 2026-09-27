// src-tauri/src/commands/agents.rs
//
// WHAT:  AI agent task management — agents, tasks, runs, memory, KB articles.
//
// HOW:   Reads/writes the agent_* tables in UserDB. The desktop app is the
//        control plane: configure agents, assign tasks, review results.
//        Actual LLM calls are made elsewhere (CF Worker or n8n) — the desktop
//        stores inputs/outputs and lets the user manage the agent lifecycle.
//
// FLOW:
//   list_agents       → SELECT agents WHERE profile_id = active
//   create_agent_task → INSERT agent_tasks (status=pending)
//   list_agent_tasks  → SELECT agent_tasks ORDER BY created_at DESC
//   get_agent_task    → SELECT agent_tasks WHERE id = ?
//   update_task_status→ UPDATE agent_tasks SET status = ?
//   list_agent_memory → SELECT agent_memory WHERE agent_id = ?
//   upsert_agent_kb   → INSERT/UPDATE agent knowledge base articles
//
// TABLES TOUCHED:
//   agents          — agent definitions (name, role, model, system prompt)
//   agent_tasks     — individual task runs (input, output, status, model used)
//   agent_memory    — key/value memory store per agent
//   agent_kb        — knowledge base articles the agent can reference
//   agent_notes     — scratch notes the agent writes during runs
//
// REFERENCE: src/lib/agent.ts + src/lib/agent-service.ts

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub role: Option<String>,
    pub model: String, // gpt-4o | claude-3-5-sonnet | etc
    pub system_prompt: Option<String>,
    pub temperature: f64,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskRow {
    pub id: String,
    pub agent_id: String,
    pub profile_id: String,
    pub title: String,
    pub input: Option<String>,
    pub output: Option<String>,
    pub status: String, // pending | running | completed | failed
    pub model_used: Option<String>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskData {
    pub agent_id: String,
    pub title: String,
    pub input: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMemoryRow {
    pub id: String,
    pub agent_id: String,
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentKbRow {
    pub id: String,
    pub agent_id: String,
    pub profile_id: String,
    pub title: String,
    pub content: String,
    pub tags: String, // JSON []
    pub created_at: i64,
    pub updated_at: i64,
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn agent_from_row(row: &crate::db::turso::TursoRow) -> Result<AgentRow, String> {
    Ok(AgentRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        name: row.get(2).map_err(|e| e.to_string())?,
        role: row.get(3).map_err(|e| e.to_string())?,
        model: row.get(4).map_err(|e| e.to_string())?,
        system_prompt: row.get(5).map_err(|e| e.to_string())?,
        temperature: row.get::<f64>(6).unwrap_or(0.7),
        is_active: row.get::<i64>(7).unwrap_or(1) != 0,
        created_at: row.get::<i64>(8).unwrap_or(0),
        updated_at: row.get::<i64>(9).unwrap_or(0),
    })
}

fn task_from_row(row: &crate::db::turso::TursoRow) -> Result<AgentTaskRow, String> {
    Ok(AgentTaskRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        agent_id: row.get(1).map_err(|e| e.to_string())?,
        profile_id: row.get(2).map_err(|e| e.to_string())?,
        title: row.get(3).map_err(|e| e.to_string())?,
        input: row.get(4).map_err(|e| e.to_string())?,
        output: row.get(5).map_err(|e| e.to_string())?,
        status: row.get(6).map_err(|e| e.to_string())?,
        model_used: row.get(7).map_err(|e| e.to_string())?,
        tokens_in: row.get(8).map_err(|e| e.to_string())?,
        tokens_out: row.get(9).map_err(|e| e.to_string())?,
        error: row.get(10).map_err(|e| e.to_string())?,
        created_at: row.get::<i64>(11).unwrap_or(0),
        updated_at: row.get::<i64>(12).unwrap_or(0),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all agents for the active profile.
#[tauri::command]
pub async fn list_agents(state: State<'_, Arc<AppState>>) -> Result<Vec<AgentRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, name, role, model, system_prompt,
                temperature, is_active, created_at, updated_at
         FROM agents WHERE profile_id = ?1 ORDER BY name ASC",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(agent_from_row(&row)?);
    }
    Ok(items)
}

/// Create a new agent definition.
#[tauri::command]
pub async fn create_agent(
    name: String,
    role: Option<String>,
    model: String,
    system_prompt: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<AgentRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO agents (id, profile_id, name, role, model, system_prompt,
          temperature, is_active, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,0.7,1, unixepoch(), unixepoch())",
        crate::turso_params![id.clone(), profile_id, name, role, model, system_prompt],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, profile_id, name, role, model, system_prompt,
                temperature, is_active, created_at, updated_at
         FROM agents WHERE id = ?1",
            crate::turso_params![id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        agent_from_row(&row)
    } else {
        Err("Agent insert failed".to_string())
    }
}

/// List agent tasks. Optionally filter by agent_id or status.
#[tauri::command]
pub async fn list_agent_tasks(
    agent_id: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<AgentTaskRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, agent_id, profile_id, title, input, output, status,
                model_used, tokens_in, tokens_out, error, created_at, updated_at
         FROM agent_tasks
         WHERE profile_id = ?1
           AND (?2 IS NULL OR agent_id = ?2)
           AND (?3 IS NULL OR status = ?3)
         ORDER BY created_at DESC LIMIT ?4",
            crate::turso_params![profile_id, agent_id, status, limit.unwrap_or(50)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(task_from_row(&row)?);
    }
    Ok(items)
}

/// Create a new agent task (status=pending). The actual run is triggered externally.
#[tauri::command]
pub async fn create_agent_task(
    data: CreateTaskData,
    state: State<'_, Arc<AppState>>,
) -> Result<AgentTaskRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO agent_tasks
           (id, agent_id, profile_id, title, input, status, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,'pending', unixepoch(), unixepoch())",
        crate::turso_params![
            id.clone(),
            data.agent_id,
            profile_id,
            data.title,
            data.input
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, agent_id, profile_id, title, input, output, status,
                model_used, tokens_in, tokens_out, error, created_at, updated_at
         FROM agent_tasks WHERE id = ?1",
            crate::turso_params![id],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        task_from_row(&row)
    } else {
        Err("Task insert failed".to_string())
    }
}

/// Update a task's status, output, model used, and token counts.
/// Called after an external runner (n8n / CF Worker) finishes the task.
#[tauri::command]
pub async fn update_task_result(
    task_id: String,
    status: String,
    output: Option<String>,
    model_used: Option<String>,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
    error: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE agent_tasks SET
           status     = ?1,
           output     = COALESCE(?2, output),
           model_used = COALESCE(?3, model_used),
           tokens_in  = COALESCE(?4, tokens_in),
           tokens_out = COALESCE(?5, tokens_out),
           error      = COALESCE(?6, error),
           updated_at = unixepoch()
         WHERE id = ?7 AND profile_id = ?8",
        crate::turso_params![
            status, output, model_used, tokens_in, tokens_out, error, task_id, profile_id
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Read agent memory (key/value store) for a specific agent.
#[tauri::command]
pub async fn get_agent_memory(
    agent_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<AgentMemoryRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, agent_id, key, value, updated_at
         FROM agent_memory WHERE agent_id = ?1 ORDER BY key ASC",
            crate::turso_params![agent_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(AgentMemoryRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            agent_id: row.get(1).map_err(|e| e.to_string())?,
            key: row.get(2).map_err(|e| e.to_string())?,
            value: row.get(3).map_err(|e| e.to_string())?,
            updated_at: row.get::<i64>(4).unwrap_or(0),
        });
    }
    Ok(items)
}

/// List KB articles for a specific agent.
#[tauri::command]
pub async fn list_agent_kb(
    agent_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<AgentKbRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, agent_id, profile_id, title, content,
                COALESCE(tags,'[]'), created_at, updated_at
         FROM agent_kb WHERE agent_id = ?1 AND profile_id = ?2
         ORDER BY updated_at DESC",
            crate::turso_params![agent_id, profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(AgentKbRow {
            id: row.get(0).map_err(|e| e.to_string())?,
            agent_id: row.get(1).map_err(|e| e.to_string())?,
            profile_id: row.get(2).map_err(|e| e.to_string())?,
            title: row.get(3).map_err(|e| e.to_string())?,
            content: row.get(4).map_err(|e| e.to_string())?,
            tags: row.get::<String>(5).unwrap_or_else(|_| "[]".into()),
            created_at: row.get::<i64>(6).unwrap_or(0),
            updated_at: row.get::<i64>(7).unwrap_or(0),
        });
    }
    Ok(items)
}
