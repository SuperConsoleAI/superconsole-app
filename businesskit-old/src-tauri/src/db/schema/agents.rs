// src-tauri/src/db/schema/agents.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// Autonomous Agent & Chat Schema — UserDB tables
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    // ── agent_analytics (1 row per profile - AI Agent & Autonomous System usage) ──
    r#"CREATE TABLE IF NOT EXISTS agent_analytics (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL UNIQUE,
    
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_user_messages INTEGER NOT NULL DEFAULT 0,
    total_assistant_messages INTEGER NOT NULL DEFAULT 0,
    total_tool_calls INTEGER NOT NULL DEFAULT 0,
    
    total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
    total_completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0.0,
    
    sessions_7d TEXT NOT NULL DEFAULT '[]',
    sessions_30d TEXT NOT NULL DEFAULT '[]',
    sessions_12m TEXT NOT NULL DEFAULT '[]',
    sessions_lifetime TEXT NOT NULL DEFAULT '{}',
    
    cost_7d TEXT NOT NULL DEFAULT '[]',
    cost_30d TEXT NOT NULL DEFAULT '[]',
    cost_12m TEXT NOT NULL DEFAULT '[]',
    cost_lifetime TEXT NOT NULL DEFAULT '{}',
    
    tokens_7d TEXT NOT NULL DEFAULT '[]',
    tokens_30d TEXT NOT NULL DEFAULT '[]',
    tokens_12m TEXT NOT NULL DEFAULT '[]',
    tokens_lifetime TEXT NOT NULL DEFAULT '{}',
    
    model_breakdown TEXT NOT NULL DEFAULT '{}',
    provider_breakdown TEXT NOT NULL DEFAULT '{}',
    tool_breakdown TEXT NOT NULL DEFAULT '{}',
    staff_breakdown TEXT NOT NULL DEFAULT '{}',
    
    last_aggregated_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_analytics_profile_id ON agent_analytics (profile_id)"#,
    // ── agent_chat_sessions ───────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS agent_chat_sessions (
    id                   TEXT PRIMARY KEY,
    profile_id           TEXT NOT NULL,
    user_id              TEXT,
    staff_id             TEXT,
    title                TEXT,
    model                TEXT,
    provider             TEXT,
    mode                 TEXT NOT NULL DEFAULT 'hosted',
    domain               TEXT,
    cli_resume_ref       TEXT,
    total_tokens         INTEGER NOT NULL DEFAULT 0,
    prompt_tokens        INTEGER NOT NULL DEFAULT 0,
    completion_tokens    INTEGER NOT NULL DEFAULT 0,
    total_cost           REAL NOT NULL DEFAULT 0.0,
    message_count        INTEGER NOT NULL DEFAULT 0,
    tool_call_count      INTEGER NOT NULL DEFAULT 0,
    last_message_preview TEXT,
    is_pinned            INTEGER NOT NULL DEFAULT 0,
    is_saved             INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at           INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_agent_chat_sessions_profile ON agent_chat_sessions (profile_id, updated_at DESC)"#,
    // ── agent_chat_messages ───────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS agent_chat_messages (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    tool_calls_json TEXT,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_session ON agent_chat_messages (session_id, created_at ASC)"#,
    // ── agent_commands ────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS agent_commands (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL,
    name            TEXT NOT NULL,
    slash           TEXT NOT NULL,
    description     TEXT,
    prompt_template TEXT,
    domain_tags     TEXT NOT NULL DEFAULT '[]',
    required_tools  TEXT NOT NULL DEFAULT '[]',
    is_builtin      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_agent_commands_profile ON agent_commands (profile_id, is_builtin, slash)"#,
    // ── brand_foundation ──────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS brand_foundation (
    profile_id     TEXT PRIMARY KEY,
    about_me       TEXT,
    brand_voice    TEXT,
    working_style  TEXT,
    business_goals TEXT,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
