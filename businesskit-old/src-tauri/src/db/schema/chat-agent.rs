// src-tauri/src/db/schema/chat-agent.rs
use super::Migration;

// ── Chat Sessions & Voice Calls ──────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    user_id TEXT,
    visitor_name TEXT,
    visitor_email TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    assigned_to TEXT NOT NULL DEFAULT 'ai',
    started_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_activity_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    ended_at INTEGER,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    -- status: 'active' | 'closed' | 'archived'
    -- assigned_to: 'ai' | 'human'
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_sessions_profile ON chat_sessions (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor ON chat_sessions (visitor_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_sessions_activity ON chat_sessions (last_activity_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS voice_calls (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    vapi_call_id TEXT UNIQUE,
    visitor_phone TEXT,
    visitor_name TEXT,
    visitor_email TEXT,
    duration_seconds INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    summary TEXT,
    transcript TEXT,
    recording_url TEXT,
    ended_reason TEXT,
    cost_cents INTEGER DEFAULT 0,
    booking_created INTEGER NOT NULL DEFAULT 0,
    purchase_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_voice_calls_profile ON voice_calls (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_voice_calls_vapi_id ON voice_calls (vapi_call_id)"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
