// src-tauri/src/commands/agents/analytics.rs
//
// Agent Analytics & Autonomous System usage aggregation.
// Tracks session counts, messages, tool executions, token consumption, and model spend.
// Automatically prunes chat history older than 90 days after aggregation while preserving lifetime totals.

use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAnalyticsRow {
    pub id: String,
    pub profile_id: String,
    pub total_sessions: i64,
    pub total_messages: i64,
    pub total_user_messages: i64,
    pub total_assistant_messages: i64,
    pub total_tool_calls: i64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub sessions_7d: Value,
    pub sessions_30d: Value,
    pub sessions_12m: Value,
    pub sessions_lifetime: Value,
    pub cost_7d: Value,
    pub cost_30d: Value,
    pub cost_12m: Value,
    pub cost_lifetime: Value,
    pub tokens_7d: Value,
    pub tokens_30d: Value,
    pub tokens_12m: Value,
    pub tokens_lifetime: Value,
    pub model_breakdown: Value,
    pub provider_breakdown: Value,
    pub tool_breakdown: Value,
    pub staff_breakdown: Value,
    pub last_aggregated_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn estimate_tokens(text: &str) -> i64 {
    let char_count = text.chars().count();
    if char_count == 0 {
        return 0;
    }
    ((char_count as f64) / 3.8).ceil() as i64
}

pub fn estimate_cost(model: &str, _provider: &str, prompt_tokens: i64, completion_tokens: i64) -> f64 {
    let m = model.to_lowercase();
    let (p_rate, c_rate) = if m.contains("terra") || m.contains("gpt-5.6-terra") {
        (2.00 / 1_000_000.0, 8.00 / 1_000_000.0)
    } else if m.contains("luna") || m.contains("gpt-5.6-luna") {
        (0.40 / 1_000_000.0, 1.60 / 1_000_000.0)
    } else if m.contains("gpt-5.5") {
        (1.50 / 1_000_000.0, 6.00 / 1_000_000.0)
    } else if m.contains("gpt-oss-120b") || m.contains("oss-120b") {
        (0.15 / 1_000_000.0, 0.60 / 1_000_000.0)
    } else if m.contains("gpt-oss-20b") || m.contains("oss-20b") {
        (0.05 / 1_000_000.0, 0.20 / 1_000_000.0)
    } else if m.contains("fable") || m.contains("5-1-fable") {
        (10.00 / 1_000_000.0, 50.00 / 1_000_000.0)
    } else if m.contains("opus") || m.contains("claude-opus") || m.contains("claude-3-opus") || m.contains("claude-4-8-opus") || m.contains("claude-5-opus") {
        (15.00 / 1_000_000.0, 75.00 / 1_000_000.0)
    } else if m.contains("haiku") || m.contains("claude-haiku") || m.contains("claude-3-5-haiku") || m.contains("claude-4-5-haiku") {
        (1.00 / 1_000_000.0, 5.00 / 1_000_000.0)
    } else if m.contains("sonnet") || m.contains("claude-sonnet") || m.contains("claude-5-sonnet") || m.contains("claude-3-7-sonnet") || m.contains("claude-3-5-sonnet") {
        (2.00 / 1_000_000.0, 10.00 / 1_000_000.0)
    } else if m.contains("3.8-flash") || m.contains("3.8_flash") {
        (0.75 / 1_000_000.0, 3.75 / 1_000_000.0)
    } else if m.contains("3.7-flash") || m.contains("3.7_flash") {
        (0.50 / 1_000_000.0, 3.00 / 1_000_000.0)
    } else if m.contains("3.6-flash") || m.contains("3.6_flash") {
        (0.30 / 1_000_000.0, 2.50 / 1_000_000.0)
    } else if m.contains("flash-lite") || m.contains("flash_lite") {
        (0.25 / 1_000_000.0, 1.50 / 1_000_000.0)
    } else if m.contains("flash") {
        (0.50 / 1_000_000.0, 3.00 / 1_000_000.0)
    } else if m.contains("pro") || m.contains("gemini-3.1-pro") || m.contains("gemini-2.5-pro") || m.contains("gemini-1.5-pro") {
        (1.25 / 1_000_000.0, 10.00 / 1_000_000.0)
    } else if m.contains("r1") || m.contains("deepseek-reasoner") {
        (0.55 / 1_000_000.0, 2.19 / 1_000_000.0)
    } else if m.contains("deepseek") {
        (0.14 / 1_000_000.0, 0.28 / 1_000_000.0)
    } else if m.contains("mistral-large") {
        (2.00 / 1_000_000.0, 6.00 / 1_000_000.0)
    } else if m.contains("mistral-medium") {
        (0.40 / 1_000_000.0, 1.20 / 1_000_000.0)
    } else if m.contains("mistral-small") || m.contains("mistral") {
        (0.10 / 1_000_000.0, 0.30 / 1_000_000.0)
    } else if m.contains("grok-4.6") {
        (2.50 / 1_000_000.0, 12.50 / 1_000_000.0)
    } else if m.contains("grok-4.5") || m.contains("grok-2") {
        (2.00 / 1_000_000.0, 10.00 / 1_000_000.0)
    } else if m.contains("grok-4.3") || m.contains("grok") {
        (1.50 / 1_000_000.0, 7.50 / 1_000_000.0)
    } else if m.contains("4o-mini") {
        (0.15 / 1_000_000.0, 0.60 / 1_000_000.0)
    } else if m.contains("4o") {
        (2.50 / 1_000_000.0, 10.00 / 1_000_000.0)
    } else if m.contains("llama-3.3") || m.contains("llama") {
        (0.10 / 1_000_000.0, 0.32 / 1_000_000.0)
    } else {
        (0.50 / 1_000_000.0, 2.00 / 1_000_000.0)
    };

    (prompt_tokens as f64 * p_rate) + (completion_tokens as f64 * c_rate)
}

pub async fn aggregate_agent_analytics(
    conn: &crate::db::turso::TursoConn,
    profile_id: &str,
) -> Result<AgentAnalyticsRow, String> {
    // 1. Ensure row exists in agent_analytics
    let _ = conn.execute(
        "INSERT OR IGNORE INTO agent_analytics (id, profile_id) VALUES (hex(randomblob(16)), ?1)",
        crate::turso_params![profile_id],
    )
    .await;

    // 2. Query aggregate totals from agent_chat_sessions
    let mut sess_totals = conn
        .query(
            "SELECT COUNT(id), COALESCE(SUM(total_tokens), 0), COALESCE(SUM(prompt_tokens), 0), \
                    COALESCE(SUM(completion_tokens), 0), COALESCE(SUM(total_cost), 0.0), \
                    COALESCE(SUM(message_count), 0), COALESCE(SUM(tool_call_count), 0) \
             FROM agent_chat_sessions WHERE profile_id = ?1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (tot_sessions, tot_tokens, tot_prompt_tokens, tot_comp_tokens, tot_cost, tot_messages, tot_tool_calls) =
        if let Ok(Some(row)) = sess_totals.next().await {
            (
                row.get::<i64>(0).unwrap_or(0),
                row.get::<i64>(1).unwrap_or(0),
                row.get::<i64>(2).unwrap_or(0),
                row.get::<i64>(3).unwrap_or(0),
                row.get::<f64>(4).unwrap_or(0.0),
                row.get::<i64>(5).unwrap_or(0),
                row.get::<i64>(6).unwrap_or(0),
            )
        } else {
            (0, 0, 0, 0, 0.0, 0, 0)
        };

    // 3. Query message breakdown (user vs assistant)
    let mut msg_totals = conn
        .query(
            "SELECT \
                COALESCE(SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END), 0), \
                COALESCE(SUM(CASE WHEN m.role = 'assistant' THEN 1 ELSE 0 END), 0) \
             FROM agent_chat_messages m \
             JOIN agent_chat_sessions s ON s.id = m.session_id \
             WHERE s.profile_id = ?1",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let (tot_user_msgs, tot_asst_msgs) = if let Ok(Some(row)) = msg_totals.next().await {
        (row.get::<i64>(0).unwrap_or(0), row.get::<i64>(1).unwrap_or(0))
    } else {
        (0, 0)
    };

    // 4. Model, Provider & Staff breakdowns
    let mut model_map: HashMap<String, serde_json::Value> = HashMap::new();
    let mut provider_map: HashMap<String, serde_json::Value> = HashMap::new();
    let mut staff_map: HashMap<String, serde_json::Value> = HashMap::new();

    let mut breakdown_rows = conn
        .query(
            "SELECT COALESCE(s.model, 'unknown'), \
                    COALESCE(s.provider, 'unknown'), \
                    COALESCE( \
                        NULLIF(TRIM(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''), \
                        NULLIF(TRIM(st.name), ''), \
                        NULLIF(TRIM(st.display_name), ''), \
                        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), \
                        NULLIF(TRIM(u.username), ''), \
                        NULLIF(TRIM(u.email), ''), \
                        NULLIF(TRIM(COALESCE(st_u.first_name, '') || ' ' || COALESCE(st_u.last_name, '')), ''), \
                        NULLIF(TRIM(st_u.name), ''), \
                        NULLIF(TRIM(COALESCE(u2.first_name, '') || ' ' || COALESCE(u2.last_name, '')), ''), \
                        NULLIF(TRIM(u2.username), ''), \
                        CASE WHEN s.user_id = 'owner' OR s.staff_id = 'owner' OR (s.user_id IS NULL AND s.staff_id IS NULL) THEN 'Primary User (Owner)' ELSE NULL END, \
                        'Primary User (Owner)' \
                    ) as staff_name, \
                    COUNT(s.id), SUM(s.total_tokens), SUM(s.total_cost), SUM(s.message_count) \
             FROM agent_chat_sessions s \
             LEFT JOIN shop_staff st ON st.id = s.staff_id \
             LEFT JOIN users u ON u.id = s.user_id OR u.workos_id = s.user_id \
             LEFT JOIN shop_staff st_u ON st_u.id = s.user_id \
             LEFT JOIN users u2 ON u2.id = s.staff_id \
             WHERE s.profile_id = ?1 \
             GROUP BY s.model, s.provider, staff_name",
            crate::turso_params![profile_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    while let Ok(Some(row)) = breakdown_rows.next().await {
        let m: String = row.get(0).unwrap_or_else(|_| "unknown".into());
        let p: String = row.get(1).unwrap_or_else(|_| "unknown".into());
        let u: String = row.get(2).unwrap_or_else(|_| "Primary User (Owner)".into());
        let cnt: i64 = row.get(3).unwrap_or(0);
        let toks: i64 = row.get(4).unwrap_or(0);
        let cst: f64 = row.get(5).unwrap_or(0.0);
        let msgs: i64 = row.get(6).unwrap_or(0);

        // Update model breakdown
        let entry = model_map.entry(m.clone()).or_insert_with(|| json!({ "sessions": 0, "tokens": 0, "cost": 0.0, "provider": p.clone() }));
        if let Some(obj) = entry.as_object_mut() {
            let s = obj.get("sessions").and_then(|v| v.as_i64()).unwrap_or(0) + cnt;
            let t = obj.get("tokens").and_then(|v| v.as_i64()).unwrap_or(0) + toks;
            let c = obj.get("cost").and_then(|v| v.as_f64()).unwrap_or(0.0) + cst;
            obj.insert("sessions".into(), json!(s));
            obj.insert("tokens".into(), json!(t));
            obj.insert("cost".into(), json!(c));
            if !obj.contains_key("provider") || obj.get("provider").and_then(|v| v.as_str()) == Some("unknown") {
                obj.insert("provider".into(), json!(p));
            }
        }

        // Update provider breakdown
        let p_entry = provider_map.entry(p).or_insert_with(|| json!({ "sessions": 0, "tokens": 0, "cost": 0.0 }));
        if let Some(obj) = p_entry.as_object_mut() {
            let s = obj.get("sessions").and_then(|v| v.as_i64()).unwrap_or(0) + cnt;
            let t = obj.get("tokens").and_then(|v| v.as_i64()).unwrap_or(0) + toks;
            let c = obj.get("cost").and_then(|v| v.as_f64()).unwrap_or(0.0) + cst;
            obj.insert("sessions".into(), json!(s));
            obj.insert("tokens".into(), json!(t));
            obj.insert("cost".into(), json!(c));
        }

        // Update staff breakdown
        let u_entry = staff_map.entry(u).or_insert_with(|| json!({ "sessions": 0, "messages": 0, "tokens": 0, "cost": 0.0 }));
        if let Some(obj) = u_entry.as_object_mut() {
            let s = obj.get("sessions").and_then(|v| v.as_i64()).unwrap_or(0) + cnt;
            let m_count = obj.get("messages").and_then(|v| v.as_i64()).unwrap_or(0) + msgs;
            let t = obj.get("tokens").and_then(|v| v.as_i64()).unwrap_or(0) + toks;
            let c = obj.get("cost").and_then(|v| v.as_f64()).unwrap_or(0.0) + cst;
            obj.insert("sessions".into(), json!(s));
            obj.insert("messages".into(), json!(m_count));
            obj.insert("tokens".into(), json!(t));
            obj.insert("cost".into(), json!(c));
        }
    }

    let model_json = json!(model_map).to_string();
    let provider_json = json!(provider_map).to_string();
    let staff_json = json!(staff_map).to_string();
    let now = chrono::Utc::now().timestamp();

    // 5. Build Time Series (7d, 30d, 12m, lifetime)
    let mut daily_map: HashMap<String, (i64, i64, i64, f64)> = HashMap::new();
    let thirty_days_ago = now - (30 * 86400);

    if let Ok(mut daily_rows) = conn
        .query(
            "SELECT strftime('%Y-%m-%d', datetime(created_at, 'unixepoch')), \
                    COUNT(id), SUM(message_count), SUM(total_tokens), SUM(total_cost) \
             FROM agent_chat_sessions \
             WHERE profile_id = ?1 AND created_at >= ?2 \
             GROUP BY strftime('%Y-%m-%d', datetime(created_at, 'unixepoch')) \
             ORDER BY created_at ASC",
            crate::turso_params![profile_id, thirty_days_ago],
        )
        .await
    {
        while let Ok(Some(row)) = daily_rows.next().await {
            let dt: String = row.get(0).unwrap_or_default();
            let s: i64 = row.get(1).unwrap_or(0);
            let m: i64 = row.get(2).unwrap_or(0);
            let t: i64 = row.get(3).unwrap_or(0);
            let c: f64 = row.get(4).unwrap_or(0.0);
            if !dt.is_empty() {
                daily_map.insert(dt, (s, m, t, c));
            }
        }
    }

    let mut ts_7d = Vec::new();
    let mut cost_7d = Vec::new();
    let mut tokens_7d = Vec::new();
    for i in (0..7).rev() {
        let day_ts = now - (i * 86400);
        let dt = chrono::DateTime::from_timestamp(day_ts, 0)
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        let (s, m, t, c) = daily_map.get(&dt).copied().unwrap_or((0, 0, 0, 0.0));
        ts_7d.push(json!({ "date": dt.clone(), "sessions": s, "messages": m, "tokens": t, "cost": c }));
        cost_7d.push(json!({ "date": dt.clone(), "cost": c }));
        tokens_7d.push(json!({ "date": dt, "tokens": t }));
    }

    let mut ts_30d = Vec::new();
    let mut cost_30d = Vec::new();
    let mut tokens_30d = Vec::new();
    for i in (0..30).rev() {
        let day_ts = now - (i * 86400);
        let dt = chrono::DateTime::from_timestamp(day_ts, 0)
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        let (s, m, t, c) = daily_map.get(&dt).copied().unwrap_or((0, 0, 0, 0.0));
        ts_30d.push(json!({ "date": dt.clone(), "sessions": s, "messages": m, "tokens": t, "cost": c }));
        cost_30d.push(json!({ "date": dt.clone(), "cost": c }));
        tokens_30d.push(json!({ "date": dt, "tokens": t }));
    }

    let mut ts_12m = Vec::new();
    let mut cost_12m = Vec::new();
    let mut tokens_12m = Vec::new();
    if let Ok(mut monthly_rows) = conn
        .query(
            "SELECT strftime('%Y-%m', datetime(created_at, 'unixepoch')), \
                    COUNT(id), SUM(message_count), SUM(total_tokens), SUM(total_cost) \
             FROM agent_chat_sessions \
             WHERE profile_id = ?1 \
             GROUP BY strftime('%Y-%m', datetime(created_at, 'unixepoch')) \
             ORDER BY created_at ASC",
            crate::turso_params![profile_id],
        )
        .await
    {
        while let Ok(Some(row)) = monthly_rows.next().await {
            let dt: String = row.get(0).unwrap_or_default();
            let s: i64 = row.get(1).unwrap_or(0);
            let m: i64 = row.get(2).unwrap_or(0);
            let t: i64 = row.get(3).unwrap_or(0);
            let c: f64 = row.get(4).unwrap_or(0.0);
            if !dt.is_empty() {
                ts_12m.push(json!({ "date": dt.clone(), "sessions": s, "messages": m, "tokens": t, "cost": c }));
                cost_12m.push(json!({ "date": dt.clone(), "cost": c }));
                tokens_12m.push(json!({ "date": dt, "tokens": t }));
            }
        }
    }

    let mut ts_lifetime = Vec::new();
    let mut cost_lifetime: HashMap<String, f64> = HashMap::new();
    let mut tokens_lifetime: HashMap<String, i64> = HashMap::new();
    let mut sessions_lifetime: HashMap<String, i64> = HashMap::new();
    if let Ok(mut yearly_rows) = conn
        .query(
            "SELECT strftime('%Y', datetime(created_at, 'unixepoch')), \
                    COUNT(id), SUM(message_count), SUM(total_tokens), SUM(total_cost) \
             FROM agent_chat_sessions \
             WHERE profile_id = ?1 \
             GROUP BY strftime('%Y', datetime(created_at, 'unixepoch')) \
             ORDER BY created_at ASC",
            crate::turso_params![profile_id],
        )
        .await
    {
        while let Ok(Some(row)) = yearly_rows.next().await {
            let yr: String = row.get(0).unwrap_or_default();
            let s: i64 = row.get(1).unwrap_or(0);
            let m: i64 = row.get(2).unwrap_or(0);
            let t: i64 = row.get(3).unwrap_or(0);
            let c: f64 = row.get(4).unwrap_or(0.0);
            if !yr.is_empty() {
                ts_lifetime.push(json!({ "date": yr.clone(), "sessions": s, "messages": m, "tokens": t, "cost": c }));
                cost_lifetime.insert(yr.clone(), c);
                tokens_lifetime.insert(yr.clone(), t);
                sessions_lifetime.insert(yr, s);
            }
        }
    }

    let s_7d_json = json!(ts_7d).to_string();
    let s_30d_json = json!(ts_30d).to_string();
    let s_12m_json = json!(ts_12m).to_string();
    let s_life_json = json!(sessions_lifetime).to_string();
    let c_7d_json = json!(cost_7d).to_string();
    let c_30d_json = json!(cost_30d).to_string();
    let c_12m_json = json!(cost_12m).to_string();
    let c_life_json = json!(cost_lifetime).to_string();
    let t_7d_json = json!(tokens_7d).to_string();
    let t_30d_json = json!(tokens_30d).to_string();
    let t_12m_json = json!(tokens_12m).to_string();
    let t_life_json = json!(tokens_lifetime).to_string();

    let _ = conn.execute(
        "UPDATE agent_analytics SET \
            total_sessions = ?2, \
            total_messages = ?3, \
            total_user_messages = ?4, \
            total_assistant_messages = ?5, \
            total_tool_calls = ?6, \
            total_prompt_tokens = ?7, \
            total_completion_tokens = ?8, \
            total_tokens = ?9, \
            total_cost = ?10, \
            sessions_7d = ?11, \
            sessions_30d = ?12, \
            sessions_12m = ?13, \
            sessions_lifetime = ?14, \
            cost_7d = ?15, \
            cost_30d = ?16, \
            cost_12m = ?17, \
            cost_lifetime = ?18, \
            tokens_7d = ?19, \
            tokens_30d = ?20, \
            tokens_12m = ?21, \
            tokens_lifetime = ?22, \
            model_breakdown = ?23, \
            provider_breakdown = ?24, \
            staff_breakdown = ?25, \
            last_aggregated_at = ?26, \
            updated_at = ?26 \
         WHERE profile_id = ?1",
        crate::turso_params![
            profile_id,
            tot_sessions,
            tot_messages,
            tot_user_msgs,
            tot_asst_msgs,
            tot_tool_calls,
            tot_prompt_tokens,
            tot_comp_tokens,
            tot_tokens,
            tot_cost,
            s_7d_json,
            s_30d_json,
            s_12m_json,
            s_life_json,
            c_7d_json,
            c_30d_json,
            c_12m_json,
            c_life_json,
            t_7d_json,
            t_30d_json,
            t_12m_json,
            t_life_json,
            model_json.clone(),
            provider_json.clone(),
            staff_json.clone(),
            now,
        ],
    )
    .await;

    // 6. Delete chats older than 90 days after aggregation (preserve pinned & saved chats forever)
    let ninety_days_ago = now - (90 * 86400);
    let _ = conn.execute(
        "DELETE FROM agent_chat_messages WHERE session_id IN (SELECT id FROM agent_chat_sessions WHERE profile_id = ?1 AND updated_at < ?2 AND COALESCE(is_pinned, 0) = 0 AND COALESCE(is_saved, 0) = 0)",
        crate::turso_params![profile_id, ninety_days_ago],
    ).await;
    let _ = conn.execute(
        "DELETE FROM agent_chat_sessions WHERE profile_id = ?1 AND updated_at < ?2 AND COALESCE(is_pinned, 0) = 0 AND COALESCE(is_saved, 0) = 0",
        crate::turso_params![profile_id, ninety_days_ago],
    ).await;

    Ok(AgentAnalyticsRow {
        id: format!("aa_{}", profile_id),
        profile_id: profile_id.to_string(),
        total_sessions: tot_sessions,
        total_messages: tot_messages,
        total_user_messages: tot_user_msgs,
        total_assistant_messages: tot_asst_msgs,
        total_tool_calls: tot_tool_calls,
        total_prompt_tokens: tot_prompt_tokens,
        total_completion_tokens: tot_comp_tokens,
        total_tokens: tot_tokens,
        total_cost: tot_cost,
        sessions_7d: json!(ts_7d),
        sessions_30d: json!(ts_30d),
        sessions_12m: json!(ts_12m),
        sessions_lifetime: json!(sessions_lifetime),
        cost_7d: json!(cost_7d),
        cost_30d: json!(cost_30d),
        cost_12m: json!(cost_12m),
        cost_lifetime: json!(cost_lifetime),
        tokens_7d: json!(tokens_7d),
        tokens_30d: json!(tokens_30d),
        tokens_12m: json!(tokens_12m),
        tokens_lifetime: json!(tokens_lifetime),
        model_breakdown: serde_json::from_str(&model_json).unwrap_or(json!({})),
        provider_breakdown: serde_json::from_str(&provider_json).unwrap_or(json!({})),
        tool_breakdown: json!({}),
        staff_breakdown: serde_json::from_str(&staff_json).unwrap_or(json!({})),
        last_aggregated_at: now,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_agent_analytics(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<AgentAnalyticsRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = super::pty::flush_all_pty_sessions(&app).await;
    }

    let row = aggregate_agent_analytics(&conn, &profile_id).await?;
    Ok(Some(row))
}
