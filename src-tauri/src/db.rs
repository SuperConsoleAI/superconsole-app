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
    #[serde(default = "default_run_mode")]
    pub run_mode: String,
    #[serde(default = "default_json_obj")]
    pub run_config: String,
    #[serde(default = "default_trigger_type")]
    pub trigger_type: String,
    #[serde(default = "default_json_obj")]
    pub trigger_config: String,
    #[serde(default = "default_json_arr")]
    pub allowed_connectors: String,
}

fn default_run_mode() -> String {
    "cli".into()
}
fn default_trigger_type() -> String {
    "cron".into()
}
fn default_json_obj() -> String {
    "{}".into()
}
fn default_json_arr() -> String {
    "[]".into()
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChatThreadMeta {
    pub project_id: String,
    pub name: Option<String>,
    pub is_star: bool,
}

#[derive(Debug, Clone)]
pub struct CachedConnector {
    pub service: String,
    pub status: Option<String>,
    pub credentials_encrypted: Option<String>,
}

/// A row in the local working index of on-disk skills, keyed by workspace.
#[derive(Debug, Clone)]
pub struct SkillIndexRow {
    pub name: String,
    pub description: String,
    pub tags: String,
    pub scope: String,
    pub active: bool,
}

/// A row mirrored from the Turso `project_skill_index` (metadata only).
#[derive(Debug, Clone)]
pub struct CachedSkill {
    pub skill_name: String,
    pub tags: String,
    pub scope: String,
    pub active: bool,
}

/// A reference mirrored from the Turso `org_skill_index`. Org skills are
/// references (by name) to machine-global library skills; content is not stored.
#[derive(Debug, Clone)]
pub struct CachedOrgSkill {
    pub skill_name: String,
    pub tags: String,
}

/// A row in the local memory index (metadata only; content lives in the
/// `.superconsole/memory/*.md` files), keyed by workspace. Mirrors the table
/// columns; only `category`/`slug` are read during reconciliation.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MemoryEntryRow {
    pub category: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub tags: String,
    pub file_path: String,
    pub updated_at: String,
}

/// A memory index row mirrored from the Turso `project_memory_index`
/// (metadata + one-line summary only; full content stays in workspace files).
#[derive(Debug, Clone)]
pub struct CachedMemory {
    pub category: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub tags: String,
}

/// An org-memory entry mirrored from the Turso `org_memory_index`. Org memory
/// is small shared facts with no workspace file, so full content is stored.
#[derive(Debug, Clone)]
pub struct CachedOrgMemory {
    pub slug: String,
    pub title: String,
    pub body: String,
    pub tags: String,
}

/// A row in the local wiki index (metadata only; content lives in the
/// `.superconsole/wiki/<slug>.md` files), keyed by workspace.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct WikiPageRow {
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub tags: String,
    pub file_path: String,
    pub updated_at: String,
}

/// A wiki page mirrored from the Turso `wiki_index`. Wiki is structured and
/// predictable in size, so full content is synced (team sharing + restore).
#[derive(Debug, Clone)]
pub struct CachedWiki {
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub tags: String,
    pub content: String,
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

        // Phase 16b — jobs run mode / trigger / connector restriction. All
        // defaulted so existing rows keep running unchanged (cli + cron + all).
        for (col, decl) in [
            ("run_mode", "TEXT NOT NULL DEFAULT 'cli'"),
            ("run_config", "TEXT NOT NULL DEFAULT '{}'"),
            ("trigger_type", "TEXT NOT NULL DEFAULT 'cron'"),
            ("trigger_config", "TEXT NOT NULL DEFAULT '{}'"),
            ("allowed_connectors", "TEXT NOT NULL DEFAULT '[]'"),
        ] {
            let exists = conn
                .prepare(&format!("SELECT {} FROM jobs LIMIT 1", col))
                .is_ok();
            if !exists {
                conn.execute_batch(&format!("ALTER TABLE jobs ADD COLUMN {} {};", col, decl))
                    .map_err(|e| e.to_string())?;
            }
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
                ON chat_messages(project_id);
            -- Per-chat metadata (custom name, starred). Local only; one row per
            -- project (chat is one thread per project).
            CREATE TABLE IF NOT EXISTS chat_threads (
                project_id TEXT PRIMARY KEY,
                name TEXT,
                is_star INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .map_err(|e| e.to_string())?;

        // Phase 18 — Skills.
        // `project_skills` is the local working index over the on-disk skill
        // files in each workspace (.superconsole/skills/*.md); content always
        // lives in the files, this holds metadata + the `active` flag. Keyed by
        // local workspace id so it works for non-cloud workspaces too.
        // `skill_index_cache` mirrors the Turso `project_skill_index` (metadata
        // only) so cross-device skill listings never hit Turso on the hot path.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS project_skills (
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL DEFAULT '',
                scope TEXT NOT NULL DEFAULT 'project',
                active INTEGER NOT NULL DEFAULT 1,
                auto INTEGER NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 1,
                source TEXT NOT NULL DEFAULT 'superconsole',
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (workspace_id, name)
            );
            CREATE TABLE IF NOT EXISTS skill_index_cache (
                project_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                tags TEXT,
                scope TEXT NOT NULL DEFAULT 'project',
                active INTEGER NOT NULL DEFAULT 1,
                synced_at TEXT NOT NULL,
                PRIMARY KEY (project_id, skill_name)
            );
            -- Local mirror of Turso org_skill_index: org-level references (by
            -- name) to machine-global library skills. Metadata only.
            CREATE TABLE IF NOT EXISTS org_skill_cache (
                org_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                tags TEXT,
                synced_at TEXT NOT NULL,
                PRIMARY KEY (org_id, skill_name)
            );",
        )
        .map_err(|e| e.to_string())?;

        // Phase 19: memory. Content lives in workspace files
        // (.superconsole/memory/*.md); `memory_entries` is a local index
        // (metadata + one-line summary) keyed by workspace. `memory_index_cache`
        // mirrors the Turso `project_memory_index` for cross-device restore;
        // `org_memory_cache` mirrors `org_memory_index` (shared facts, content
        // included since org memory has no workspace file).
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS memory_entries (
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                category TEXT NOT NULL,
                slug TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (workspace_id, category, slug)
            );
            CREATE TABLE IF NOT EXISTS memory_index_cache (
                project_id TEXT NOT NULL,
                category TEXT NOT NULL,
                slug TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                tags TEXT,
                synced_at TEXT NOT NULL,
                PRIMARY KEY (project_id, category, slug)
            );
            CREATE TABLE IF NOT EXISTS org_memory_cache (
                org_id TEXT NOT NULL,
                slug TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                tags TEXT,
                synced_at TEXT NOT NULL,
                PRIMARY KEY (org_id, slug)
            );",
        )
        .map_err(|e| e.to_string())?;

        // Phase 20: wiki. Content lives in workspace files
        // (.superconsole/wiki/*.md); `wiki_pages` is a local metadata index.
        // `wiki_index_cache` mirrors the Turso `wiki_index` which, unlike skills
        // and memory, stores full content (wiki is structured + predictable
        // size) so teammates and fresh devices get it without pulling git.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS wiki_pages (
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                slug TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (workspace_id, slug)
            );
            CREATE TABLE IF NOT EXISTS wiki_index_cache (
                project_id TEXT NOT NULL,
                slug TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                tags TEXT,
                content TEXT NOT NULL DEFAULT '',
                synced_at TEXT NOT NULL,
                PRIMARY KEY (project_id, slug)
            );",
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
            run_mode: r.get(8)?,
            run_config: r.get(9)?,
            trigger_type: r.get(10)?,
            trigger_config: r.get(11)?,
            allowed_connectors: r.get(12)?,
        })
    }

    pub fn list_jobs(&self, workspace_id: i64) -> Result<Vec<Job>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors FROM jobs WHERE workspace_id = ?1 ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([workspace_id], Self::job_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn due_jobs(&self, now: &str) -> Result<Vec<Job>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors FROM jobs WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([now], Self::job_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_job(&self, id: i64) -> Result<Job, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors FROM jobs WHERE id = ?1",
            [id],
            Self::job_from_row,
        )
        .map_err(|e| e.to_string())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_job(
        &self,
        workspace_id: i64,
        name: &str,
        command: &str,
        schedule: &str,
        next_run: Option<&str>,
        run_mode: &str,
        run_config: &str,
        trigger_type: &str,
        trigger_config: &str,
        allowed_connectors: &str,
    ) -> Result<Job, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO jobs (workspace_id, name, command, schedule, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![workspace_id, name, command, schedule, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors FROM jobs WHERE id = ?1",
            [id],
            Self::job_from_row,
        )
        .map_err(|e| e.to_string())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_job(
        &self,
        id: i64,
        name: &str,
        command: &str,
        schedule: &str,
        next_run: Option<&str>,
        run_mode: &str,
        run_config: &str,
        trigger_type: &str,
        trigger_config: &str,
        allowed_connectors: &str,
    ) -> Result<Job, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET name = ?1, command = ?2, schedule = ?3, next_run = ?4, run_mode = ?5, \
             run_config = ?6, trigger_type = ?7, trigger_config = ?8, allowed_connectors = ?9 WHERE id = ?10",
            rusqlite::params![name, command, schedule, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, id],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors FROM jobs WHERE id = ?1",
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

    pub fn delete_session_log(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM session_history WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
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
             DELETE FROM project_org_cache;
             DELETE FROM skill_index_cache;
             DELETE FROM org_skill_cache;
             DELETE FROM memory_index_cache;
             DELETE FROM org_memory_cache;
             DELETE FROM wiki_index_cache;",
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

    pub fn get_chat_thread(&self, project_id: &str) -> Result<ChatThreadMeta, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT project_id, name, is_star FROM chat_threads WHERE project_id = ?1",
            [project_id],
            |r| {
                Ok(ChatThreadMeta {
                    project_id: r.get(0)?,
                    name: r.get(1)?,
                    is_star: r.get::<_, i64>(2)? != 0,
                })
            },
        )
        .or_else(|_| {
            Ok(ChatThreadMeta {
                project_id: project_id.to_string(),
                name: None,
                is_star: false,
            })
        })
    }

    pub fn rename_chat_thread(&self, project_id: &str, name: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO chat_threads (project_id, name) VALUES (?1, ?2)
             ON CONFLICT(project_id) DO UPDATE SET name = ?2",
            (project_id, name),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn star_chat_thread(&self, project_id: &str, is_star: bool) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let v = if is_star { 1 } else { 0 };
        conn.execute(
            "INSERT INTO chat_threads (project_id, is_star) VALUES (?1, ?2)
             ON CONFLICT(project_id) DO UPDATE SET is_star = ?2",
            (project_id, v),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_chat_thread(&self, project_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM chat_messages WHERE project_id = ?1", [project_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM chat_threads WHERE project_id = ?1", [project_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn move_chat_thread(&self, from_project: &str, to_project: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        // Merge messages into the destination thread, then carry over metadata.
        conn.execute(
            "UPDATE chat_messages SET project_id = ?2 WHERE project_id = ?1",
            (from_project, to_project),
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO chat_threads (project_id, name, is_star)
             SELECT ?2, name, is_star FROM chat_threads WHERE project_id = ?1
             ON CONFLICT(project_id) DO UPDATE SET
               name = COALESCE(chat_threads.name, excluded.name),
               is_star = MAX(chat_threads.is_star, excluded.is_star)",
            (from_project, to_project),
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM chat_threads WHERE project_id = ?1", [from_project])
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

    // --- Phase 18: skills (local working index) ---

    pub fn list_skill_index(&self, workspace_id: i64) -> Vec<SkillIndexRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT name, description, tags, scope, active FROM project_skills
             WHERE workspace_id = ?1 ORDER BY name",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([workspace_id], |r| {
            Ok(SkillIndexRow {
                name: r.get(0)?,
                description: r.get(1)?,
                tags: r.get(2)?,
                scope: r.get(3)?,
                active: r.get::<_, i64>(4)? != 0,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_skill_index(
        &self,
        workspace_id: i64,
        name: &str,
        description: &str,
        tags: &str,
        file_path: &str,
        scope: &str,
        auto: bool,
        version: u32,
        source: &str,
        active: bool,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO project_skills
                (workspace_id, name, description, tags, file_path, scope, active, auto, version, source, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
             ON CONFLICT(workspace_id, name) DO UPDATE SET
                description = excluded.description, tags = excluded.tags,
                file_path = excluded.file_path, scope = excluded.scope,
                auto = excluded.auto, version = excluded.version,
                source = excluded.source, updated_at = excluded.updated_at",
            rusqlite::params![
                workspace_id,
                name,
                description,
                tags,
                file_path,
                scope,
                active as i64,
                auto as i64,
                version,
                source,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_skill_active(&self, workspace_id: i64, name: &str) -> Option<bool> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT active FROM project_skills WHERE workspace_id = ?1 AND name = ?2",
            (workspace_id, name),
            |r| r.get::<_, i64>(0),
        )
        .ok()
        .map(|v| v != 0)
    }

    pub fn set_skill_active(&self, workspace_id: i64, name: &str, active: bool) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE project_skills SET active = ?1, updated_at = datetime('now')
             WHERE workspace_id = ?2 AND name = ?3",
            (active as i64, workspace_id, name),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_skill_index(&self, workspace_id: i64, name: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM project_skills WHERE workspace_id = ?1 AND name = ?2",
            (workspace_id, name),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // --- Phase 18: skills (local mirror of Turso project_skill_index) ---

    pub fn replace_cached_skills(
        &self,
        project_id: &str,
        skills: &[CachedSkill],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM skill_index_cache WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|e| e.to_string())?;
        for s in skills {
            tx.execute(
                "INSERT INTO skill_index_cache (project_id, skill_name, tags, scope, active, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![project_id, s.skill_name, s.tags, s.scope, s.active as i64, synced_at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_skills(&self, project_id: &str) -> Vec<CachedSkill> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT skill_name, tags, scope, active FROM skill_index_cache
             WHERE project_id = ?1 ORDER BY skill_name",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([project_id], |r| {
            Ok(CachedSkill {
                skill_name: r.get(0)?,
                tags: r.get(1)?,
                scope: r.get(2)?,
                active: r.get::<_, i64>(3)? != 0,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn replace_cached_org_skills(
        &self,
        org_id: &str,
        skills: &[CachedOrgSkill],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM org_skill_cache WHERE org_id = ?1", [org_id])
            .map_err(|e| e.to_string())?;
        for s in skills {
            tx.execute(
                "INSERT INTO org_skill_cache (org_id, skill_name, tags, synced_at)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![org_id, s.skill_name, s.tags, synced_at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_org_skills(&self, org_id: &str) -> Vec<CachedOrgSkill> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT skill_name, tags FROM org_skill_cache WHERE org_id = ?1 ORDER BY skill_name",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([org_id], |r| {
            Ok(CachedOrgSkill {
                skill_name: r.get(0)?,
                tags: r.get(1)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    // --- Phase 19: memory index (local metadata over .superconsole/memory) ---

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_memory_entry(
        &self,
        workspace_id: i64,
        category: &str,
        slug: &str,
        title: &str,
        summary: &str,
        tags: &str,
        file_path: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO memory_entries
                (workspace_id, category, slug, title, summary, tags, file_path, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
             ON CONFLICT(workspace_id, category, slug) DO UPDATE SET
                title = excluded.title, summary = excluded.summary, tags = excluded.tags,
                file_path = excluded.file_path, updated_at = excluded.updated_at",
            rusqlite::params![workspace_id, category, slug, title, summary, tags, file_path],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_memory_entries(&self, workspace_id: i64) -> Vec<MemoryEntryRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT category, slug, title, summary, tags, file_path, updated_at
             FROM memory_entries WHERE workspace_id = ?1 ORDER BY category, slug",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([workspace_id], |r| {
            Ok(MemoryEntryRow {
                category: r.get(0)?,
                slug: r.get(1)?,
                title: r.get(2)?,
                summary: r.get(3)?,
                tags: r.get(4)?,
                file_path: r.get(5)?,
                updated_at: r.get(6)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn delete_memory_entry(
        &self,
        workspace_id: i64,
        category: &str,
        slug: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM memory_entries WHERE workspace_id = ?1 AND category = ?2 AND slug = ?3",
            (workspace_id, category, slug),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_memory_category(&self, workspace_id: i64, category: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM memory_entries WHERE workspace_id = ?1 AND category = ?2",
            (workspace_id, category),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn replace_cached_memory(
        &self,
        project_id: &str,
        entries: &[CachedMemory],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM memory_index_cache WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|e| e.to_string())?;
        for m in entries {
            tx.execute(
                "INSERT INTO memory_index_cache
                    (project_id, category, slug, title, summary, tags, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![project_id, m.category, m.slug, m.title, m.summary, m.tags, synced_at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_memory(&self, project_id: &str) -> Vec<CachedMemory> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT category, slug, title, summary, tags FROM memory_index_cache
             WHERE project_id = ?1 ORDER BY category, slug",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([project_id], |r| {
            Ok(CachedMemory {
                category: r.get(0)?,
                slug: r.get(1)?,
                title: r.get(2)?,
                summary: r.get(3)?,
                tags: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn replace_cached_org_memory(
        &self,
        org_id: &str,
        entries: &[CachedOrgMemory],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM org_memory_cache WHERE org_id = ?1", [org_id])
            .map_err(|e| e.to_string())?;
        for m in entries {
            tx.execute(
                "INSERT INTO org_memory_cache (org_id, slug, title, body, tags, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![org_id, m.slug, m.title, m.body, m.tags, synced_at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_org_memory(&self, org_id: &str) -> Vec<CachedOrgMemory> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT slug, title, body, tags FROM org_memory_cache WHERE org_id = ?1 ORDER BY slug",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([org_id], |r| {
            Ok(CachedOrgMemory {
                slug: r.get(0)?,
                title: r.get(1)?,
                body: r.get(2)?,
                tags: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    // --- Phase 20: wiki index (local metadata over .superconsole/wiki) ---

    pub fn upsert_wiki_page(
        &self,
        workspace_id: i64,
        slug: &str,
        title: &str,
        summary: &str,
        tags: &str,
        file_path: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO wiki_pages
                (workspace_id, slug, title, summary, tags, file_path, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
             ON CONFLICT(workspace_id, slug) DO UPDATE SET
                title = excluded.title, summary = excluded.summary, tags = excluded.tags,
                file_path = excluded.file_path, updated_at = excluded.updated_at",
            rusqlite::params![workspace_id, slug, title, summary, tags, file_path],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_wiki_pages(&self, workspace_id: i64) -> Vec<WikiPageRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT slug, title, summary, tags, file_path, updated_at
             FROM wiki_pages WHERE workspace_id = ?1 ORDER BY title",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([workspace_id], |r| {
            Ok(WikiPageRow {
                slug: r.get(0)?,
                title: r.get(1)?,
                summary: r.get(2)?,
                tags: r.get(3)?,
                file_path: r.get(4)?,
                updated_at: r.get(5)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn delete_wiki_page(&self, workspace_id: i64, slug: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM wiki_pages WHERE workspace_id = ?1 AND slug = ?2",
            (workspace_id, slug),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn replace_cached_wiki(
        &self,
        project_id: &str,
        pages: &[CachedWiki],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM wiki_index_cache WHERE project_id = ?1", [project_id])
            .map_err(|e| e.to_string())?;
        for p in pages {
            tx.execute(
                "INSERT INTO wiki_index_cache
                    (project_id, slug, title, summary, tags, content, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![project_id, p.slug, p.title, p.summary, p.tags, p.content, synced_at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_wiki(&self, project_id: &str) -> Vec<CachedWiki> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT slug, title, summary, tags, content FROM wiki_index_cache
             WHERE project_id = ?1 ORDER BY title",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([project_id], |r| {
            Ok(CachedWiki {
                slug: r.get(0)?,
                title: r.get(1)?,
                summary: r.get(2)?,
                tags: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                content: r.get(4)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }
}
