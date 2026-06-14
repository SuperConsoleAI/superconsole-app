use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub cli: String,
    pub organization_id: i64,
    pub created_at: String,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: i64,
    pub workspace_id: i64,
    pub name: String,
    pub command: String,
    pub schedule: String,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLog {
    pub id: i64,
    pub workspace_id: i64,
    pub cli: String,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxItem {
    pub id: i64,
    pub workspace_id: i64,
    pub job_id: Option<i64>,
    pub title: String,
    pub output: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct CachedLlmKey {
    pub provider: String,
    pub credentials_encrypted: Option<String>,
    pub base_url: Option<String>,
    pub extra_env: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: i64,
    pub project_id: String,
    pub role: String,
    pub content: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct CachedConnector {
    pub service: String,
    pub status: Option<String>,
    pub credentials_encrypted: Option<String>,
}

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn init(app_data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
        let conn =
            Connection::open(app_data_dir.join("superconsole.db")).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS workspaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                cli TEXT NOT NULL DEFAULT 'claude',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                schedule TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_run TEXT,
                next_run TEXT
            );
            CREATE TABLE IF NOT EXISTS session_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                session_id TEXT NOT NULL,
                cli TEXT NOT NULL,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                ended_at TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cloud_identity (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS inbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                job_id INTEGER,
                title TEXT NOT NULL,
                output TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'unread',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .map_err(|e| e.to_string())?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS organizations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO organizations (id, name)
                SELECT 1, 'Personal'
                WHERE NOT EXISTS (SELECT 1 FROM organizations);",
        )
        .map_err(|e| e.to_string())?;

        let has_org_col = conn
            .prepare("SELECT organization_id FROM workspaces LIMIT 1")
            .is_ok();
        if !has_org_col {
            conn.execute_batch(
                "ALTER TABLE workspaces ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;",
            )
            .map_err(|e| e.to_string())?;
        }

        let has_project_col = conn
            .prepare("SELECT project_id FROM workspaces LIMIT 1")
            .is_ok();
        if !has_project_col {
            conn.execute_batch("ALTER TABLE workspaces ADD COLUMN project_id TEXT;")
                .map_err(|e| e.to_string())?;
        }

        // Local mirror of cloud (Turso) data, scoped to the signed-in user.
        // PTY injection reads only from here; Turso is never hit at session
        // start. scope is account|org|project, scope_id the matching cloud id.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS llm_keys_cache (
                scope TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                credentials_encrypted TEXT,
                base_url TEXT,
                extra_env TEXT,
                synced_at TEXT NOT NULL,
                PRIMARY KEY (scope, scope_id, provider)
            );
            CREATE TABLE IF NOT EXISTS connectors_cache (
                scope TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                service TEXT NOT NULL,
                status TEXT,
                credentials_encrypted TEXT,
                synced_at TEXT NOT NULL,
                PRIMARY KEY (scope, scope_id, service)
            );
            CREATE TABLE IF NOT EXISTS project_org_cache (
                project_id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );
            -- Native chat history, keyed by project_id (the workspace->project
            -- ULID). Local only: never synced to Turso.
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                provider TEXT,
                model TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS chat_messages_project_idx
                ON chat_messages(project_id);",
        )
        .map_err(|e| e.to_string())?;

        Ok(Db(Mutex::new(conn)))
    }

    fn workspace_from_row(r: &rusqlite::Row) -> rusqlite::Result<Workspace> {
        Ok(Workspace {
            id: r.get(0)?,
            name: r.get(1)?,
            path: r.get(2)?,
            cli: r.get(3)?,
            organization_id: r.get(4)?,
            created_at: r.get(5)?,
            project_id: r.get(6)?,
        })
    }

    pub fn list_organizations(&self) -> Result<Vec<Organization>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, created_at FROM organizations ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Organization {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created_at: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn add_organization(&self, name: &str) -> Result<Organization, String> {
        let conn = self.0.lock().unwrap();
        conn.execute("INSERT INTO organizations (name) VALUES (?1)", [name])
            .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, name, created_at FROM organizations WHERE id = ?1",
            [id],
            |r| {
                Ok(Organization {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created_at: r.get(2)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, path, cli, organization_id, created_at, project_id FROM workspaces ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], Self::workspace_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn add_workspace(
        &self,
        name: &str,
        path: &str,
        cli: &str,
        organization_id: i64,
    ) -> Result<Workspace, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO workspaces (name, path, cli, organization_id) VALUES (?1, ?2, ?3, ?4)",
            (name, path, cli, organization_id),
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, name, path, cli, organization_id, created_at, project_id FROM workspaces WHERE id = ?1",
            [id],
            Self::workspace_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn update_workspace_cli(&self, id: i64, cli: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("UPDATE workspaces SET cli = ?1 WHERE id = ?2", (cli, id))
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_workspace(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM workspaces WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn job_from_row(r: &rusqlite::Row) -> rusqlite::Result<Job> {
        Ok(Job {
            id: r.get(0)?,
            workspace_id: r.get(1)?,
            name: r.get(2)?,
            command: r.get(3)?,
            schedule: r.get(4)?,
            enabled: r.get::<_, i64>(5)? != 0,
            last_run: r.get(6)?,
            next_run: r.get(7)?,
        })
    }

    pub fn list_jobs(&self, workspace_id: i64) -> Result<Vec<Job>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run FROM jobs WHERE workspace_id = ?1 ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([workspace_id], Self::job_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn due_jobs(&self, now: &str) -> Result<Vec<Job>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run FROM jobs WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([now], Self::job_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_job(&self, id: i64) -> Result<Job, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run FROM jobs WHERE id = ?1",
            [id],
            Self::job_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn add_job(
        &self,
        workspace_id: i64,
        name: &str,
        command: &str,
        schedule: &str,
        next_run: &str,
    ) -> Result<Job, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO jobs (workspace_id, name, command, schedule, next_run) VALUES (?1, ?2, ?3, ?4, ?5)",
            (workspace_id, name, command, schedule, next_run),
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run FROM jobs WHERE id = ?1",
            [id],
            Self::job_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn set_job_enabled(&self, id: i64, enabled: bool, next_run: Option<&str>) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET enabled = ?1, next_run = ?2 WHERE id = ?3",
            (enabled as i64, next_run, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn mark_job_ran(&self, id: i64, last_run: &str, next_run: Option<&str>) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET last_run = ?1, next_run = ?2 WHERE id = ?3",
            (last_run, next_run, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_job(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM jobs WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_inbox_item(
        &self,
        workspace_id: i64,
        job_id: Option<i64>,
        title: &str,
        output: &str,
    ) -> Result<i64, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO inbox (workspace_id, job_id, title, output) VALUES (?1, ?2, ?3, ?4)",
            (workspace_id, job_id, title, output),
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_inbox(&self) -> Result<Vec<InboxItem>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, job_id, title, output, status, created_at FROM inbox ORDER BY created_at DESC LIMIT 200")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(InboxItem {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    job_id: r.get(2)?,
                    title: r.get(3)?,
                    output: r.get(4)?,
                    status: r.get(5)?,
                    created_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn unread_count(&self) -> Result<i64, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row("SELECT COUNT(*) FROM inbox WHERE status = 'unread'", [], |r| r.get(0))
            .map_err(|e| e.to_string())
    }

    pub fn mark_inbox_read(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE inbox SET status = 'read' WHERE id = ?1 AND status = 'unread'",
            [id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_inbox_status(&self, id: i64, status: &str) -> Result<(), String> {
        if !["read", "approved", "rejected"].contains(&status) {
            return Err(format!("Invalid status '{}'", status));
        }
        let conn = self.0.lock().unwrap();
        conn.execute("UPDATE inbox SET status = ?1 WHERE id = ?2", (status, id))
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn log_session(&self, workspace_id: i64, session_id: &str, cli: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO session_history (workspace_id, session_id, cli) VALUES (?1, ?2, ?3)",
            (workspace_id, session_id, cli),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn close_session_log(&self, session_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE session_history SET ended_at = datetime('now') WHERE session_id = ?1 AND ended_at IS NULL",
            [session_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_session_history(&self, workspace_id: i64) -> Result<Vec<SessionLog>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, cli, started_at, ended_at FROM session_history WHERE workspace_id = ?1 ORDER BY started_at DESC LIMIT 30")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([workspace_id], |r| {
                Ok(SessionLog {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    cli: r.get(2)?,
                    started_at: r.get(3)?,
                    ended_at: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn delete_inbox_item(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM inbox WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
            .ok()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn all_settings(&self) -> Result<std::collections::HashMap<String, String>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }

    pub fn find_workspace_by_name(&self, name: &str) -> Result<Workspace, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, name, path, cli, organization_id, created_at, project_id FROM workspaces WHERE LOWER(name) = LOWER(?1)",
            [name],
            Self::workspace_from_row,
        )
        .map_err(|_| format!("No workspace named '{}'", name))
    }

    pub fn get_workspace_project_id(&self, id: i64) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT project_id FROM workspaces WHERE id = ?1",
            [id],
            |r| r.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten()
    }

    pub fn set_workspace_project_id(&self, id: i64, project_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET project_id = ?1 WHERE id = ?2",
            (project_id, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_cloud_identity(&self, payload: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO cloud_identity (id, payload) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
            [payload],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_cloud_identity(&self) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row("SELECT payload FROM cloud_identity WHERE id = 1", [], |r| {
            r.get(0)
        })
        .ok()
    }

    pub fn clear_cloud_identity(&self) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM cloud_identity WHERE id = 1", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Wipe all locally cached cloud data. Used on sign-out and before a fresh
    /// startup sync so a previous user's data never lingers on the machine.
    pub fn clear_cloud_cache(&self) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute_batch(
            "DELETE FROM llm_keys_cache;
             DELETE FROM connectors_cache;
             DELETE FROM project_org_cache;",
        )
        .map_err(|e| e.to_string())
    }

    pub fn replace_cached_llm_keys(
        &self,
        scope: &str,
        scope_id: &str,
        keys: &[CachedLlmKey],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM llm_keys_cache WHERE scope = ?1 AND scope_id = ?2",
            (scope, scope_id),
        )
        .map_err(|e| e.to_string())?;
        for k in keys {
            tx.execute(
                "INSERT INTO llm_keys_cache
                    (scope, scope_id, provider, credentials_encrypted, base_url, extra_env, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    scope,
                    scope_id,
                    k.provider,
                    k.credentials_encrypted,
                    k.base_url,
                    k.extra_env,
                    synced_at,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_llm_keys(&self, scope: &str, scope_id: &str) -> Vec<CachedLlmKey> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT provider, credentials_encrypted, base_url, extra_env
             FROM llm_keys_cache WHERE scope = ?1 AND scope_id = ?2 ORDER BY provider",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map((scope, scope_id), |r| {
            Ok(CachedLlmKey {
                provider: r.get(0)?,
                credentials_encrypted: r.get(1)?,
                base_url: r.get(2)?,
                extra_env: r.get(3)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn replace_cached_connectors(
        &self,
        scope: &str,
        scope_id: &str,
        connectors: &[CachedConnector],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM connectors_cache WHERE scope = ?1 AND scope_id = ?2",
            (scope, scope_id),
        )
        .map_err(|e| e.to_string())?;
        for c in connectors {
            tx.execute(
                "INSERT INTO connectors_cache
                    (scope, scope_id, service, status, credentials_encrypted, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    scope,
                    scope_id,
                    c.service,
                    c.status,
                    c.credentials_encrypted,
                    synced_at,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_connectors(&self, scope: &str, scope_id: &str) -> Vec<CachedConnector> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT service, status, credentials_encrypted
             FROM connectors_cache WHERE scope = ?1 AND scope_id = ?2 ORDER BY service",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map((scope, scope_id), |r| {
            Ok(CachedConnector {
                service: r.get(0)?,
                status: r.get(1)?,
                credentials_encrypted: r.get(2)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn set_project_org(&self, project_id: &str, org_id: &str, synced_at: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO project_org_cache (project_id, org_id, synced_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(project_id) DO UPDATE SET org_id = excluded.org_id, synced_at = excluded.synced_at",
            (project_id, org_id, synced_at),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_project_org(&self, project_id: &str) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT org_id FROM project_org_cache WHERE project_id = ?1",
            [project_id],
            |r| r.get(0),
        )
        .ok()
    }

    fn chat_message_from_row(r: &rusqlite::Row) -> rusqlite::Result<ChatMessage> {
        Ok(ChatMessage {
            id: r.get(0)?,
            project_id: r.get(1)?,
            role: r.get(2)?,
            content: r.get(3)?,
            provider: r.get(4)?,
            model: r.get(5)?,
            created_at: r.get(6)?,
        })
    }

    pub fn add_chat_message(
        &self,
        project_id: &str,
        role: &str,
        content: &str,
        provider: Option<&str>,
        model: Option<&str>,
    ) -> Result<ChatMessage, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO chat_messages (project_id, role, content, provider, model)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![project_id, role, content, provider, model],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, project_id, role, content, provider, model, created_at
             FROM chat_messages WHERE id = ?1",
            [id],
            Self::chat_message_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn list_chat_messages(&self, project_id: &str) -> Result<Vec<ChatMessage>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, role, content, provider, model, created_at
                 FROM chat_messages WHERE project_id = ?1 ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([project_id], Self::chat_message_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn clear_chat_messages(&self, project_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM chat_messages WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_workspace(&self, id: i64) -> Result<Workspace, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, name, path, cli, organization_id, created_at, project_id FROM workspaces WHERE id = ?1",
            [id],
            Self::workspace_from_row,
        )
        .map_err(|e| e.to_string())
    }
}
