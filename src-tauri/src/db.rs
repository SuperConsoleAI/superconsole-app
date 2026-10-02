pub mod schema;

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
    pub org_id: Option<String>,
    pub created_at: String,
    pub project_id: Option<String>,
    pub default_run_mode: String,
    pub default_cli: String,
    pub default_provider: String,
    pub default_model: String,
    pub script_setup: String,
    pub script_run: String,
    pub script_teardown: String,
    pub script_auto_run: bool,
    pub repo_url: String,
    pub description: String,
    pub env_files: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub id: i64,
    pub org_id: Option<String>,
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
    #[serde(default)]
    pub last_run_cost_usd: f64,
    #[serde(default)]
    pub last_run_tokens: i64,
    pub last_run_session_id: Option<String>,
    pub agent_id: Option<String>,
    pub user_id: Option<String>,
    // ── Loop system (Phase 25) ──
    /// JSON-encoded exit condition or NULL (run-once, existing behavior).
    pub exit_condition: Option<String>,
    /// Hard cap on retry attempts. 1 = run-once (default, no retries).
    #[serde(default = "default_max_attempts")]
    pub max_attempts: i64,
    /// Current retry count; reset to 0 after completion or max_attempts reached.
    #[serde(default)]
    pub current_attempt: i64,
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
fn default_max_attempts() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLog {
    pub id: i64,
    pub workspace_id: i64,
    pub cli: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub label: Option<String>,
    pub session_id: String,
    pub tokens_prompt: i64,
    pub tokens_completion: i64,
    pub tokens_reasoning: i64,
    pub cost_usd: f64,
    pub model: String,
    pub provider: String,
    pub user_id: Option<String>,
    pub rate_prompt_per_1m: Option<f64>,
    pub rate_cached_per_1m: Option<f64>,
    pub rate_completion_per_1m: Option<f64>,
    pub rate_reasoning_per_1m: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFeedItem {
    pub id: String,
    pub session_type: String,
    pub workspace_id: i64,
    pub workspace_name: String,
    pub cli: String,
    pub provider: String,
    pub model: String,
    pub last_message_preview: String,
    pub started_at: String,
    pub updated_at: String,
    pub tokens_total: i64,
    pub cost_usd: f64,
    pub job_id: Option<i64>,
    pub agent_id: Option<String>,
    pub user_id: Option<String>,
    pub resume_id: String,
    pub rate_prompt_per_1m: Option<f64>,
    pub rate_cached_per_1m: Option<f64>,
    pub rate_completion_per_1m: Option<f64>,
    pub rate_reasoning_per_1m: Option<f64>,
}

/// Local metadata index for agents living in `.superconsole/agents/<name>/agent.md`.
/// One row per agent per workspace. `agent_id` is the Turso cloud ULID, NULL until
/// the workspace is connected to WorkOS and a sync has run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRow {
    pub id: String, // local ULID
    pub workspace_id: i64,
    pub name: String,
    pub description: String,
    pub schedule: String,
    pub default_run_mode: String,
    pub default_cli: String,
    pub default_provider: String,
    pub default_model: String,
    pub skills: String,     // comma-separated skill names
    pub connectors: String, // comma-separated connector service ids
    pub is_active: bool,
    pub agent_id: Option<String>, // Turso cloud ULID
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub agent_catalog_id: Option<String>,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
}

/// A saved session log file at `.superconsole/sessions/YYYY-MM-DD-<slug>.md`.
/// The table is an index only — content lives on disk; Turso mirror holds
/// metadata (no file path, no full body).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogFile {
    pub id: String, // ULID
    pub workspace_id: i64,
    pub file_path: String, // relative: .superconsole/sessions/...
    pub agent_id: Option<String>,
    pub session_id: Option<String>,
    pub date: String,
    pub agent_name: String,
    pub model: String,
    pub cost_usd: f64,
    pub tokens: i64,
    pub summary: String,
    pub cloud_id: Option<String>, // Turso row id once synced
    pub user_id: Option<String>,
    pub created_at: String,
}

/// A row in the org-scope shared session logs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct OrgSessionLogRow {
    pub id: String,
    pub org_id: String,
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    pub date: String,
    pub agent_name: String,
    pub model: String,
    pub cost_usd: f64,
    pub tokens: i64,
    pub summary: String,
    pub user_id: Option<String>,
    pub created_at: String,
}

/// A row in the account/user-scope session logs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct AccountSessionLogRow {
    pub id: String,
    pub user_id: String,
    pub file_path: String,
    pub agent_id: Option<String>,
    pub session_id: Option<String>,
    pub date: String,
    pub agent_name: String,
    pub model: String,
    pub cost_usd: f64,
    pub tokens: i64,
    pub summary: String,
    pub created_at: String,
}

/// A skill entry mirrored from the Turso `skill_catalog` (community library).
/// Local cache only — content (SKILL.md) is fetched on install from the GitHub URL.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSkillEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub tags: String, // comma-separated
    pub github_url: String,
    pub readme: String,
    pub author: String,
    pub stars: i64,
    pub synced_at: String,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UsageEvent {
    pub id: String,
    pub project_id: String,
    pub org_id: Option<String>,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub cli: Option<String>,
    pub tokens_prompt: i64,
    pub tokens_prompt_cached: i64,
    pub tokens_completion: i64,
    pub tokens_reasoning: i64,
    pub cost_usd: f64,
    pub cache_hit_rate: f64,
    pub estimated: bool,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub rate_prompt_per_1m: Option<f64>,
    pub rate_cached_per_1m: Option<f64>,
    pub rate_completion_per_1m: Option<f64>,
    pub rate_reasoning_per_1m: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: i64,
    pub session_id: String,
    pub project_id: String,
    pub role: String,
    pub content: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub user_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChatSession {
    pub id: String,
    pub workspace_id: Option<i64>,
    pub project_id: String,
    pub name: Option<String>,
    pub is_star: bool,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
    pub last_at: Option<String>,
    pub preview: Option<String>,
    pub first_user: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub user_id: Option<String>,
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
    pub author: String,
}

/// A row mirrored from the Turso `project_skill_index` (metadata only).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CachedSkill {
    pub skill_name: String,
    pub tags: String,
    pub scope: String,
    pub active: bool,
}

/// A reference mirrored from the Turso `org_skill_index`. Org skills are
/// references (by name) to machine-global library skills; content is not stored.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CachedOrgSkill {
    pub skill_name: String,
    pub tags: String,
    pub skill_catalog_id: Option<String>,
    pub author: String,
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

        // Provision all local SQLite tables, indexes, and migrations cleanly
        schema::localdb::provision_local_database(&conn)?;

        // Ensure legacy/migrated usage_events have org_id and user_id populated
        let _ = conn.execute_batch(
            "UPDATE usage_events SET org_id = (SELECT org_id FROM project_org_cache WHERE project_org_cache.project_id = usage_events.project_id)
             WHERE (org_id IS NULL OR org_id = '') AND project_id IN (SELECT project_id FROM project_org_cache);
             UPDATE usage_events SET user_id = (SELECT json_extract(payload, '$.user.id') FROM cloud_identity WHERE id = 1)
             WHERE (user_id IS NULL OR user_id = '') AND EXISTS (SELECT 1 FROM cloud_identity WHERE id = 1);"
        );

        let db = Db(Mutex::new(conn));
        let _ = db.sync_organizations_from_cloud_identity();

        Ok(db)
    }

    fn workspace_from_row(r: &rusqlite::Row) -> rusqlite::Result<Workspace> {
        Ok(Workspace {
            id: r.get(0)?,
            name: r.get(1)?,
            path: r.get(2)?,
            cli: r.get(3)?,
            organization_id: r.get(4)?,
            org_id: r.get(5)?,
            created_at: r.get(6)?,
            project_id: r.get(7)?,
            default_run_mode: r.get(8)?,
            default_cli: r.get(9)?,
            default_provider: r.get(10)?,
            default_model: r.get(11)?,
            script_setup: r.get(12)?,
            script_run: r.get(13)?,
            script_teardown: r.get(14)?,
            script_auto_run: r.get::<_, i64>(15)? != 0,
            repo_url: r.get(16)?,
            description: r.get(17)?,
            env_files: r.get(18)?,
        })
    }

    pub fn list_organizations(&self) -> Result<Vec<Organization>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, org_id, name, created_at FROM organizations ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Organization {
                    id: r.get(0)?,
                    org_id: r.get(1)?,
                    name: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_organization(&self, id: i64) -> Result<Organization, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, org_id, name, created_at FROM organizations WHERE id = ?1",
            [id],
            |r| {
                Ok(Organization {
                    id: r.get(0)?,
                    org_id: r.get(1)?,
                    name: r.get(2)?,
                    created_at: r.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn set_organization_org_id(&self, id: i64, org_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE organizations SET org_id = ?1 WHERE id = ?2",
            rusqlite::params![org_id, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_organization(&self, name: &str, org_id: Option<&str>) -> Result<Organization, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO organizations (org_id, name) VALUES (?1, ?2)",
            rusqlite::params![org_id, name],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, org_id, name, created_at FROM organizations WHERE id = ?1",
            [id],
            |r| {
                Ok(Organization {
                    id: r.get(0)?,
                    org_id: r.get(1)?,
                    name: r.get(2)?,
                    created_at: r.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, path, cli, organization_id, org_id, created_at, project_id, default_run_mode, default_cli, default_provider, default_model, script_setup, script_run, script_teardown, script_auto_run, repo_url, description, env_files FROM workspaces ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], Self::workspace_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn add_workspace(
        &self,
        name: &str,
        path: &str,
        cli: &str,
        organization_id: i64,
        org_id: Option<&str>,
        project_id: Option<&str>,
    ) -> Result<Workspace, String> {
        let conn = self.0.lock().unwrap();
        let resolved_org_id: Option<String> = if let Some(o) = org_id.filter(|s| !s.is_empty()) {
            Some(o.to_string())
        } else {
            conn.query_row(
                "SELECT org_id FROM organizations WHERE id = ?1",
                [organization_id],
                |r| r.get(0),
            )
            .ok()
            .flatten()
        };

        let resolved_project_id = project_id.filter(|s| !s.is_empty());

        conn.execute(
            "INSERT INTO workspaces (name, path, cli, organization_id, org_id, project_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![name, path, cli, organization_id, resolved_org_id, resolved_project_id],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, name, path, cli, organization_id, org_id, created_at, project_id, default_run_mode, default_cli, default_provider, default_model, script_setup, script_run, script_teardown, script_auto_run, repo_url, description, env_files FROM workspaces WHERE id = ?1",
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

    #[allow(clippy::too_many_arguments)]
    pub fn update_workspace(
        &self,
        id: i64,
        default_run_mode: &str,
        default_cli: &str,
        default_provider: &str,
        default_model: &str,
        script_setup: &str,
        script_run: &str,
        script_teardown: &str,
        script_auto_run: bool,
        repo_url: &str,
        description: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET
                default_run_mode = ?1, default_cli = ?2, default_provider = ?3,
                default_model = ?4, script_setup = ?5, script_run = ?6,
                script_teardown = ?7, script_auto_run = ?8, repo_url = ?9,
                description = ?10
             WHERE id = ?11",
            rusqlite::params![
                default_run_mode,
                default_cli,
                default_provider,
                default_model,
                script_setup,
                script_run,
                script_teardown,
                script_auto_run as i64,
                repo_url,
                description,
                id,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Apply cloud-synced project settings to the local workspace row matched by
    /// project_id. Env files and the workspace .env stay local and are untouched.
    #[allow(clippy::too_many_arguments)]
    pub fn update_workspace_settings_by_project(
        &self,
        project_id: &str,
        default_run_mode: &str,
        default_cli: &str,
        default_provider: &str,
        default_model: &str,
        script_setup: &str,
        script_run: &str,
        script_teardown: &str,
        script_auto_run: bool,
        repo_url: &str,
        description: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET
                default_run_mode = ?1, default_cli = ?2, default_provider = ?3,
                default_model = ?4, script_setup = ?5, script_run = ?6,
                script_teardown = ?7, script_auto_run = ?8, repo_url = ?9,
                description = ?10
             WHERE project_id = ?11",
            rusqlite::params![
                default_run_mode,
                default_cli,
                default_provider,
                default_model,
                script_setup,
                script_run,
                script_teardown,
                script_auto_run as i64,
                repo_url,
                description,
                project_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_workspace_env_files(&self, id: i64, env_files: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET env_files = ?1 WHERE id = ?2",
            (env_files, id),
        )
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
            last_run_cost_usd: r.get::<_, f64>(13).unwrap_or(0.0),
            last_run_tokens: r.get::<_, i64>(14).unwrap_or(0),
            last_run_session_id: r.get(15).unwrap_or(None),
            agent_id: r.get(16).unwrap_or(None),
            user_id: r.get(17).unwrap_or(None),
            exit_condition: r.get(18).unwrap_or(None),
            max_attempts: r.get::<_, i64>(19).unwrap_or(1),
            current_attempt: r.get::<_, i64>(20).unwrap_or(0),
        })
    }

    pub fn list_jobs(&self, workspace_id: i64) -> Result<Vec<Job>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, last_run_cost_usd, last_run_tokens, last_run_session_id, agent_id, user_id, exit_condition, max_attempts, current_attempt FROM jobs WHERE workspace_id = ?1 ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([workspace_id], Self::job_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn due_jobs(&self, now: &str) -> Result<Vec<Job>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, last_run_cost_usd, last_run_tokens, last_run_session_id, agent_id, user_id, exit_condition, max_attempts, current_attempt FROM jobs WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([now], Self::job_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_job(&self, id: i64) -> Result<Job, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, last_run_cost_usd, last_run_tokens, last_run_session_id, agent_id, user_id, exit_condition, max_attempts, current_attempt FROM jobs WHERE id = ?1",
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
        exit_condition: Option<&str>,
        max_attempts: i64,
    ) -> Result<Job, String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO jobs (workspace_id, name, command, schedule, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, exit_condition, max_attempts, user_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![workspace_id, name, command, schedule, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, exit_condition, max_attempts, user_id],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, last_run_cost_usd, last_run_tokens, last_run_session_id, agent_id, user_id, exit_condition, max_attempts, current_attempt FROM jobs WHERE id = ?1",
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
        exit_condition: Option<&str>,
        max_attempts: i64,
    ) -> Result<Job, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET name = ?1, command = ?2, schedule = ?3, next_run = ?4, run_mode = ?5, \
             run_config = ?6, trigger_type = ?7, trigger_config = ?8, allowed_connectors = ?9, \
             exit_condition = ?10, max_attempts = ?11 WHERE id = ?12",
            rusqlite::params![name, command, schedule, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, exit_condition, max_attempts, id],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, run_mode, run_config, trigger_type, trigger_config, allowed_connectors, last_run_cost_usd, last_run_tokens, last_run_session_id, exit_condition, max_attempts, current_attempt FROM jobs WHERE id = ?1",
            [id],
            Self::job_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn set_job_enabled(
        &self,
        id: i64,
        enabled: bool,
        next_run: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET enabled = ?1, next_run = ?2 WHERE id = ?3",
            (enabled as i64, next_run, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn mark_job_ran(
        &self,
        id: i64,
        last_run: &str,
        next_run: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET last_run = ?1, next_run = ?2, current_attempt = 0 WHERE id = ?3",
            (last_run, next_run, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Increment the current_attempt counter for a looping job.
    pub fn set_job_attempt(&self, job_id: i64, attempt: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET current_attempt = ?1 WHERE id = ?2",
            (attempt, job_id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Reset current_attempt to 0 (job completed or gave up).
    pub fn reset_job_attempt(&self, job_id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET current_attempt = 0 WHERE id = ?1",
            [job_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Schedule a retry: set next_run to N seconds from now.
    pub fn set_job_next_run_relative(&self, job_id: i64, seconds: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            &format!(
                "UPDATE jobs SET next_run = datetime('now', '+{} seconds') WHERE id = ?1",
                seconds
            ),
            [job_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Get the status of an inbox item (for inbox_approved exit condition).
    pub fn get_inbox_status(&self, inbox_id: i64) -> Result<String, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row("SELECT status FROM inbox WHERE id = ?1", [inbox_id], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())
    }

    pub fn delete_job(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM jobs WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Return all enabled jobs with a given trigger_type (e.g. "email").
    /// Used by the email polling loop and any future event-driven trigger types.
    pub fn get_jobs_by_trigger_type(&self, trigger_type: &str) -> Vec<Job> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, workspace_id, name, command, schedule, enabled, last_run, next_run, \
             run_mode, run_config, trigger_type, trigger_config, allowed_connectors, \
             last_run_cost_usd, last_run_tokens, last_run_session_id, \
             exit_condition, max_attempts, current_attempt \
             FROM jobs WHERE enabled = 1 AND trigger_type = ?1",
        ) else {
            return Vec::new();
        };
        stmt.query_map([trigger_type], Self::job_from_row)
            .ok()
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    }

    /// Overwrite the trigger_config JSON for a job.
    /// Used by the email polling loop to persist last_checked timestamps.
    pub fn update_job_trigger_config(
        &self,
        job_id: i64,
        trigger_config: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET trigger_config = ?1 WHERE id = ?2",
            rusqlite::params![trigger_config, job_id],
        )
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
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn unread_count(&self) -> Result<i64, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM inbox WHERE status = 'unread'",
            [],
            |r| r.get(0),
        )
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

    pub fn log_session(
        &self,
        workspace_id: i64,
        session_id: &str,
        cli: &str,
        job_id: Option<i64>,
        agent_id: Option<&str>,
    ) -> Result<(), String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO session_history (workspace_id, project_id, session_id, cli, job_id, agent_id, user_id)
             VALUES (?1, (SELECT project_id FROM workspaces WHERE id = ?1 LIMIT 1), ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![workspace_id, session_id, cli, job_id, agent_id, user_id],
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
            .prepare("SELECT id, workspace_id, cli, started_at, ended_at, label, session_id,
                             tokens_prompt, tokens_completion, tokens_reasoning, cost_usd,
                             model, provider, user_id, rate_prompt_per_1m, rate_cached_per_1m,
                             rate_completion_per_1m, rate_reasoning_per_1m
                      FROM session_history WHERE workspace_id = ?1 AND cli != 'shell' AND cli != '' ORDER BY started_at DESC LIMIT 50")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([workspace_id], |r| {
                Ok(SessionLog {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    cli: r.get(2)?,
                    started_at: r.get(3)?,
                    ended_at: r.get(4)?,
                    label: r.get(5)?,
                    session_id: r.get(6).unwrap_or_default(),
                    tokens_prompt: r.get(7).unwrap_or(0),
                    tokens_completion: r.get(8).unwrap_or(0),
                    tokens_reasoning: r.get(9).unwrap_or(0),
                    cost_usd: r.get(10).unwrap_or(0.0),
                    model: r.get(11).unwrap_or_default(),
                    provider: r.get(12).unwrap_or_default(),
                    user_id: r.get(13).ok(),
                    rate_prompt_per_1m: r.get(14).ok(),
                    rate_cached_per_1m: r.get(15).ok(),
                    rate_completion_per_1m: r.get(16).ok(),
                    rate_reasoning_per_1m: r.get(17).ok(),
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn rename_session_log(&self, id: i64, label: Option<&str>) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let trimmed = label.map(|s| s.trim()).filter(|s| !s.is_empty());
        conn.execute(
            "UPDATE session_history SET label = ?1 WHERE id = ?2",
            rusqlite::params![trimmed, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_session_log(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM session_history WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_session_id_by_log_id(&self, id: i64) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row("SELECT session_id FROM session_history WHERE id = ?1", [id], |r| r.get(0)).ok()
    }

    /// Aggregate usage_events for a CLI session → update session_history row.
    pub fn finalize_cli_session_cost(&self, session_id: &str) {
        let conn = self.0.lock().unwrap();
        let result: rusqlite::Result<(i64, i64, i64, f64, String, String, String)> = conn
            .query_row(
                "SELECT
                COALESCE(SUM(tokens_prompt), 0),
                COALESCE(SUM(tokens_completion), 0),
                COALESCE(SUM(tokens_reasoning), 0),
                COALESCE(SUM(cost_usd), 0.0),
                COALESCE(MAX(model), ''),
                COALESCE(MAX(provider), ''),
                ''
             FROM usage_events WHERE session_id = ?",
                [session_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                    ))
                },
            );
        if let Ok((tp, tc, tr, cost, model, provider, _)) = result {
            let (rate_p, rate_cached, rate_c, rate_reasoning) = crate::usage::pricing_for(&model, &provider);
            let _ = conn.execute(
                "UPDATE session_history SET
                   tokens_prompt = ?1, tokens_completion = ?2, tokens_reasoning = ?3,
                   cost_usd = ?4, model = ?5, provider = ?6,
                   rate_prompt_per_1m = ?7, rate_cached_per_1m = ?8, rate_completion_per_1m = ?9, rate_reasoning_per_1m = ?10
                 WHERE session_id = ?11",
                rusqlite::params![tp, tc, tr, cost, model, provider, rate_p, rate_cached, rate_c, rate_reasoning, session_id],
            );
        }
    }

    pub fn save_model_pricing(&self, list: &[(String, String, f64, f64, f64, f64)]) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        for (id, provider, prompt, cached, comp, reasoning) in list {
            let _ = conn.execute(
                "INSERT INTO model_pricing_cache (
                    model_id, provider, prompt_per_1m, cached_per_1m, completion_per_1m, reasoning_per_1m, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
                ON CONFLICT(model_id) DO UPDATE SET
                    provider = excluded.provider,
                    prompt_per_1m = excluded.prompt_per_1m,
                    cached_per_1m = excluded.cached_per_1m,
                    completion_per_1m = excluded.completion_per_1m,
                    reasoning_per_1m = excluded.reasoning_per_1m,
                    updated_at = datetime('now')",
                rusqlite::params![id, provider, prompt, cached, comp, reasoning],
            );
        }
        Ok(())
    }

    pub fn get_cached_model_pricing(&self) -> Result<Vec<(String, String, f64, f64, f64, f64)>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT model_id, provider, prompt_per_1m, cached_per_1m, completion_per_1m, reasoning_per_1m FROM model_pricing_cache")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Queries the sum of usage previously recorded for an underlying conversation (by clean_sid or workspace/cli)
    /// excluding the current session_id, so resume sessions can record only the new delta.
    pub fn get_previous_session_usage(
        &self,
        clean_sid: &str,
        current_sid: &str,
        workspace_id: i64,
        cli: &str,
    ) -> (i64, i64, i64, f64) {
        let conn = match self.0.lock() {
            Ok(c) => c,
            Err(_) => return (0, 0, 0, 0.0),
        };
        if !clean_sid.is_empty() {
            let pattern = format!("%{}%", clean_sid);
            let res = conn.query_row(
                "SELECT COALESCE(SUM(tokens_prompt), 0),
                        COALESCE(SUM(tokens_completion), 0),
                        COALESCE(SUM(tokens_reasoning), 0),
                        COALESCE(SUM(cost_usd), 0.0)
                 FROM session_history
                 WHERE session_id LIKE ?1 AND session_id != ?2 AND ended_at IS NOT NULL",
                rusqlite::params![&pattern, current_sid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            );
            if let Ok(tuple) = res {
                if tuple.0 > 0 || tuple.1 > 0 || tuple.3 > 0.0 {
                    return tuple;
                }
            }
        }
        // Fallback: get usage of the most recent ended session for this workspace and cli
        conn.query_row(
            "SELECT tokens_prompt,
                    tokens_completion,
                    tokens_reasoning,
                    cost_usd
             FROM session_history
             WHERE workspace_id = ?1 AND cli = ?2 AND session_id != ?3 AND ended_at IS NOT NULL
             ORDER BY id DESC LIMIT 1",
            rusqlite::params![workspace_id, cli, current_sid],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap_or((0, 0, 0, 0.0))
    }

    /// Accumulate cost for one chat turn → update chat_sessions row.
    pub fn update_chat_session_cost(
        &self,
        session_id: &str,
        tokens_prompt: i64,
        tokens_completion: i64,
        cost_usd: f64,
        model: &str,
        provider: &str,
    ) {
        let conn = self.0.lock().unwrap();
        let _ = conn.execute(
            "UPDATE chat_sessions SET
               tokens_prompt = tokens_prompt + ?1,
               tokens_completion = tokens_completion + ?2,
               cost_usd = cost_usd + ?3,
               model = ?4,
               provider = ?5,
               updated_at = datetime('now')
             WHERE id = ?6",
            rusqlite::params![
                tokens_prompt,
                tokens_completion,
                cost_usd,
                model,
                provider,
                session_id
            ],
        );
    }

    /// After a job run → store cost + session link on the job row.
    pub fn finalize_job_cost(&self, job_id: i64, session_id: &str) {
        let conn = self.0.lock().unwrap();
        let result: rusqlite::Result<(i64, f64)> = conn.query_row(
            "SELECT
                COALESCE(SUM(tokens_prompt + tokens_completion + tokens_reasoning), 0),
                COALESCE(SUM(cost_usd), 0.0)
             FROM usage_events WHERE session_id = ?",
            [session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        );
        let (tokens, cost) = result.unwrap_or((0, 0.0));
        let _ = conn.execute(
            "UPDATE jobs SET last_run_cost_usd = ?1, last_run_tokens = ?2, last_run_session_id = ?3
             WHERE id = ?4",
            rusqlite::params![cost, tokens, session_id, job_id],
        );
    }

    /// List user-initiated CLI + chat sessions (job_id IS NULL) for the Sessions page.
    pub fn list_user_sessions(
        &self,
        workspace_id: Option<i64>,
    ) -> Result<Vec<SessionFeedItem>, String> {
        let conn = self.0.lock().unwrap();
        let mut items: Vec<SessionFeedItem> = Vec::new();

        // CLI sessions — exclude agent-triggered runs (agent_id IS NOT NULL goes to Activity tab)
        let cli_sql = if workspace_id.is_some() {
            "SELECT sh.session_id, sh.workspace_id, w.name, sh.cli, sh.provider, sh.model,
                    sh.last_output, sh.started_at, sh.started_at,
                    sh.tokens_prompt + sh.tokens_completion + sh.tokens_reasoning, sh.cost_usd, sh.agent_id,
                    sh.user_id, sh.rate_prompt_per_1m, sh.rate_cached_per_1m, sh.rate_completion_per_1m, sh.rate_reasoning_per_1m
             FROM session_history sh
             JOIN workspaces w ON w.id = sh.workspace_id
             WHERE sh.job_id IS NULL AND sh.agent_id IS NULL AND sh.workspace_id = ?1
               AND sh.cli != 'shell' AND sh.cli != ''
             ORDER BY sh.started_at DESC LIMIT 50"
        } else {
            "SELECT sh.session_id, sh.workspace_id, w.name, sh.cli, sh.provider, sh.model,
                    sh.last_output, sh.started_at, sh.started_at,
                    sh.tokens_prompt + sh.tokens_completion + sh.tokens_reasoning, sh.cost_usd, sh.agent_id,
                    sh.user_id, sh.rate_prompt_per_1m, sh.rate_cached_per_1m, sh.rate_completion_per_1m, sh.rate_reasoning_per_1m
             FROM session_history sh
             JOIN workspaces w ON w.id = sh.workspace_id
             WHERE sh.job_id IS NULL AND sh.agent_id IS NULL
               AND sh.cli != 'shell' AND sh.cli != ''
             ORDER BY sh.started_at DESC LIMIT 50"
        };
        {
            let mut stmt = conn.prepare(cli_sql).map_err(|e| e.to_string())?;
            let rows: Vec<SessionFeedItem> = if let Some(wid) = workspace_id {
                stmt.query_map([wid], Self::session_feed_cli_from_row)
            } else {
                stmt.query_map([], Self::session_feed_cli_from_row)
            }
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
            items.extend(rows);
        }

        // Chat sessions — exclude agent-triggered runs
        let chat_sql = if workspace_id.is_some() {
            "SELECT cs.id, w.id, w.name, 'chat', cs.provider, cs.model,
                    (SELECT content FROM chat_messages m WHERE m.session_id = cs.id AND m.role = 'assistant'
                     ORDER BY m.id DESC LIMIT 1),
                    cs.created_at, cs.updated_at,
                    cs.tokens_prompt + cs.tokens_completion, cs.cost_usd, cs.job_id, cs.agent_id,
                    cs.user_id, cs.rate_prompt_per_1m, cs.rate_cached_per_1m, cs.rate_completion_per_1m, cs.rate_reasoning_per_1m
             FROM chat_sessions cs
             JOIN workspaces w ON w.project_id = cs.project_id
             WHERE cs.job_id IS NULL AND cs.agent_id IS NULL AND w.id = ?1
             ORDER BY cs.updated_at DESC LIMIT 50"
        } else {
            "SELECT cs.id, w.id, w.name, 'chat', cs.provider, cs.model,
                    (SELECT content FROM chat_messages m WHERE m.session_id = cs.id AND m.role = 'assistant'
                     ORDER BY m.id DESC LIMIT 1),
                    cs.created_at, cs.updated_at,
                    cs.tokens_prompt + cs.tokens_completion, cs.cost_usd, cs.job_id, cs.agent_id,
                    cs.user_id, cs.rate_prompt_per_1m, cs.rate_cached_per_1m, cs.rate_completion_per_1m, cs.rate_reasoning_per_1m
             FROM chat_sessions cs
             JOIN workspaces w ON w.project_id = cs.project_id
             WHERE cs.job_id IS NULL AND cs.agent_id IS NULL
             ORDER BY cs.updated_at DESC LIMIT 50"
        };
        {
            let mut stmt = conn.prepare(chat_sql).map_err(|e| e.to_string())?;
            let rows: Vec<SessionFeedItem> = if let Some(wid) = workspace_id {
                stmt.query_map([wid], Self::session_feed_chat_from_row)
            } else {
                stmt.query_map([], Self::session_feed_chat_from_row)
            }
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
            items.extend(rows);
        }

        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(items)
    }

    /// List job-triggered CLI sessions for the Tasks page expand.
    pub fn list_job_sessions(&self, job_id: i64) -> Result<Vec<SessionFeedItem>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT sh.session_id, sh.workspace_id, w.name, sh.cli, sh.provider, sh.model,
                        sh.last_output, sh.started_at, sh.started_at,
                        sh.tokens_prompt + sh.tokens_completion + sh.tokens_reasoning, sh.cost_usd, sh.agent_id,
                        sh.user_id, sh.rate_prompt_per_1m, sh.rate_cached_per_1m, sh.rate_completion_per_1m, sh.rate_reasoning_per_1m
                 FROM session_history sh
                 JOIN workspaces w ON w.id = sh.workspace_id
                 WHERE sh.job_id = ?1
                 ORDER BY sh.started_at DESC LIMIT 10",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([job_id], Self::session_feed_cli_from_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    /// All job-triggered sessions across all workspaces (job_id IS NOT NULL AND agent_id IS NULL).
    /// Used by the Tasks page Activity tab.
    pub fn list_all_job_sessions(
        &self,
        workspace_id: Option<i64>,
    ) -> Result<Vec<SessionFeedItem>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT sh.session_id, sh.workspace_id, w.name, sh.cli, sh.provider, sh.model,
                        sh.last_output, sh.started_at, sh.started_at,
                        sh.tokens_prompt + sh.tokens_completion + sh.tokens_reasoning,
                        sh.cost_usd, sh.agent_id,
                        sh.user_id, sh.rate_prompt_per_1m, sh.rate_cached_per_1m, sh.rate_completion_per_1m, sh.rate_reasoning_per_1m
                 FROM session_history sh
                 JOIN workspaces w ON w.id = sh.workspace_id
                 WHERE sh.job_id IS NOT NULL AND sh.agent_id IS NULL
                   AND (?1 IS NULL OR sh.workspace_id = ?1)
                 ORDER BY sh.started_at DESC LIMIT 200",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([workspace_id], Self::session_feed_cli_from_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    /// Get session linked to an inbox item via its job's last_run_session_id.
    pub fn get_inbox_session(&self, inbox_id: i64) -> Result<Option<SessionFeedItem>, String> {
        let conn = self.0.lock().unwrap();
        // Find job_id for inbox item, then look up job's last_run_session_id
        let job_id: Option<i64> = conn
            .query_row("SELECT job_id FROM inbox WHERE id = ?1", [inbox_id], |r| {
                r.get(0)
            })
            .unwrap_or(None);
        let Some(jid) = job_id else {
            return Ok(None);
        };
        let session_id: Option<String> = conn
            .query_row(
                "SELECT last_run_session_id FROM jobs WHERE id = ?1",
                [jid],
                |r| r.get(0),
            )
            .unwrap_or(None);
        let Some(sid) = session_id else {
            return Ok(None);
        };
        // Try CLI session first
        let cli_item = conn
            .query_row(
                "SELECT sh.session_id, sh.workspace_id, w.name, sh.cli, sh.provider, sh.model,
                    sh.last_output, sh.started_at, sh.started_at,
                    sh.tokens_prompt + sh.tokens_completion + sh.tokens_reasoning, sh.cost_usd, sh.agent_id,
                    sh.user_id, sh.rate_prompt_per_1m, sh.rate_cached_per_1m, sh.rate_completion_per_1m, sh.rate_reasoning_per_1m
             FROM session_history sh
             JOIN workspaces w ON w.id = sh.workspace_id
             WHERE sh.session_id = ?1",
                [&sid],
                Self::session_feed_cli_from_row,
            )
            .ok();
        if cli_item.is_some() {
            return Ok(cli_item);
        }

        // Fall back to chat session
        let chat_item = conn.query_row(
            "SELECT cs.id, w.id, w.name, 'chat', cs.provider, cs.model,
                    (SELECT content FROM chat_messages m WHERE m.session_id = cs.id AND m.role = 'assistant'
                     ORDER BY m.id DESC LIMIT 1),
                    cs.created_at, cs.updated_at,
                    cs.tokens_prompt + cs.tokens_completion, cs.cost_usd, cs.job_id, cs.agent_id,
                    cs.user_id, cs.rate_prompt_per_1m, cs.rate_cached_per_1m, cs.rate_completion_per_1m, cs.rate_reasoning_per_1m
             FROM chat_sessions cs
             JOIN workspaces w ON w.project_id = cs.project_id
             WHERE cs.id = ?1",
            [&sid],
            Self::session_feed_chat_from_row,
        )
        .ok();
        Ok(chat_item)
    }

    fn session_feed_cli_from_row(r: &rusqlite::Row) -> rusqlite::Result<SessionFeedItem> {
        let session_id: String = r.get(0)?;
        Ok(SessionFeedItem {
            id: session_id.clone(),
            session_type: "cli".into(),
            workspace_id: r.get(1)?,
            workspace_name: r.get(2)?,
            cli: r.get(3)?,
            provider: r.get::<_, String>(4).unwrap_or_default(),
            model: r.get::<_, String>(5).unwrap_or_default(),
            last_message_preview: r.get::<_, String>(6).unwrap_or_default(),
            started_at: r.get(7)?,
            updated_at: r.get(8)?,
            tokens_total: r.get::<_, i64>(9).unwrap_or(0),
            cost_usd: r.get::<_, f64>(10).unwrap_or(0.0),
            job_id: None,
            agent_id: r.get::<_, Option<String>>(11).unwrap_or(None),
            user_id: r.get::<_, Option<String>>(12).unwrap_or(None),
            resume_id: session_id,
            rate_prompt_per_1m: r.get(13).ok(),
            rate_cached_per_1m: r.get(14).ok(),
            rate_completion_per_1m: r.get(15).ok(),
            rate_reasoning_per_1m: r.get(16).ok(),
        })
    }

    fn session_feed_chat_from_row(r: &rusqlite::Row) -> rusqlite::Result<SessionFeedItem> {
        let id: String = r.get(0)?;
        Ok(SessionFeedItem {
            id: id.clone(),
            session_type: "chat".into(),
            workspace_id: r.get(1)?,
            workspace_name: r.get(2)?,
            cli: r.get(3)?,
            provider: r.get::<_, String>(4).unwrap_or_default(),
            model: r.get::<_, String>(5).unwrap_or_default(),
            last_message_preview: r.get::<_, String>(6).unwrap_or_default(),
            started_at: r.get(7)?,
            updated_at: r.get(8)?,
            tokens_total: r.get::<_, i64>(9).unwrap_or(0),
            cost_usd: r.get::<_, f64>(10).unwrap_or(0.0),
            job_id: r.get(11).unwrap_or(None),
            agent_id: r.get::<_, Option<String>>(12).unwrap_or(None),
            user_id: r.get::<_, Option<String>>(13).unwrap_or(None),
            resume_id: id,
            rate_prompt_per_1m: r.get(14).ok(),
            rate_cached_per_1m: r.get(15).ok(),
            rate_completion_per_1m: r.get(16).ok(),
            rate_reasoning_per_1m: r.get(17).ok(),
        })
    }

    pub fn delete_inbox_item(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM inbox WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
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

    pub fn delete_setting(&self, key: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM settings WHERE key = ?1", [key])
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
            "SELECT id, name, path, cli, organization_id, org_id, created_at, project_id, default_run_mode, default_cli, default_provider, default_model, script_setup, script_run, script_teardown, script_auto_run, repo_url, description, env_files FROM workspaces WHERE LOWER(name) = LOWER(?1)",
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

    #[allow(dead_code)]
    pub fn set_workspace_project_id(&self, id: i64, project_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET project_id = ?1 WHERE id = ?2",
            (project_id, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_workspace_cloud_link(&self, id: i64, project_id: &str, org_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET project_id = ?1, org_id = ?2 WHERE id = ?3",
            (project_id, org_id, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn set_workspace_org_id(&self, id: i64, org_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET org_id = ?1 WHERE id = ?2",
            (org_id, id),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn sync_organizations_from_cloud_identity(&self) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let payload: Option<String> = conn
            .query_row("SELECT payload FROM cloud_identity WHERE id = 1", [], |r| r.get(0))
            .ok();
        let Some(json) = payload else {
            return Ok(());
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) else {
            return Ok(());
        };
        let Some(orgs) = v["orgs"].as_array() else {
            return Ok(());
        };

        for org in orgs {
            let Some(org_id) = org["id"].as_str().filter(|s| !s.is_empty()) else { continue; };
            let Some(name) = org["name"].as_str().filter(|s| !s.is_empty()) else { continue; };

            let existing_by_name: Option<i64> = conn
                .query_row("SELECT id FROM organizations WHERE LOWER(name) = LOWER(?1)", [name], |r| r.get(0))
                .ok();
            let existing_by_org_id: Option<i64> = conn
                .query_row("SELECT id FROM organizations WHERE org_id = ?1", [org_id], |r| r.get(0))
                .ok();

            if let Some(id) = existing_by_name {
                let _ = conn.execute(
                    "UPDATE organizations SET org_id = ?1 WHERE id = ?2",
                    rusqlite::params![org_id, id],
                );
            } else if let Some(id) = existing_by_org_id {
                let _ = conn.execute(
                    "UPDATE organizations SET name = ?1 WHERE id = ?2",
                    rusqlite::params![name, id],
                );
            } else {
                let _ = conn.execute(
                    "INSERT INTO organizations (org_id, name) VALUES (?1, ?2)",
                    rusqlite::params![org_id, name],
                );
            }
        }

        // Auto-assign workspaces.org_id where matching organizations.org_id is present
        let _ = conn.execute(
            "UPDATE workspaces
             SET org_id = (SELECT org_id FROM organizations WHERE organizations.id = workspaces.organization_id)
             WHERE (workspaces.org_id IS NULL OR workspaces.org_id = '')
               AND EXISTS (SELECT 1 FROM organizations WHERE organizations.id = workspaces.organization_id AND org_id IS NOT NULL AND org_id != '');",
            [],
        );

        Ok(())
    }

    pub fn set_cloud_identity(&self, payload: &str) -> Result<(), String> {
        {
            let conn = self.0.lock().unwrap();
            conn.execute(
                "INSERT INTO cloud_identity (id, payload) VALUES (1, ?1)
                 ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                [payload],
            )
            .map_err(|e| e.to_string())?;
        }
        let _ = self.sync_organizations_from_cloud_identity();
        Ok(())
    }

    pub fn get_cloud_identity(&self) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row("SELECT payload FROM cloud_identity WHERE id = 1", [], |r| {
            r.get(0)
        })
        .ok()
    }

    pub fn current_user_id(&self) -> Option<String> {
        let json = self.get_cloud_identity()?;
        let v: serde_json::Value = serde_json::from_str(&json).ok()?;
        v["user"]["id"].as_str().map(String::from)
    }

    pub fn clear_cloud_identity(&self) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM cloud_identity WHERE id = 1", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Wipe all locally cached cloud data. Used on sign-out and before a fresh
    /// startup sync so a previous user's data never lingers on the machine.
    /// NOTE: `agents` is NOT wiped — it is a working index, not a cloud cache.
    pub fn clear_cloud_cache(&self) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute_batch(
            "DELETE FROM project_llm_keys;
             DELETE FROM org_llm_keys;
             DELETE FROM account_llm_keys;
             DELETE FROM project_connectors;
             DELETE FROM org_connectors;
             DELETE FROM account_connectors;
             DELETE FROM project_org_cache;
             DELETE FROM project_usage;
             DELETE FROM org_usage;
             DELETE FROM account_usage;
             DELETE FROM user_usage;",
        )
        .map_err(|e| e.to_string())
    }

    // ---- Phase 24: agent metadata index ----

    fn agent_from_row(r: &rusqlite::Row) -> rusqlite::Result<AgentRow> {
        Ok(AgentRow {
            id: r.get(0)?,
            workspace_id: r.get(1)?,
            name: r.get(2)?,
            description: r.get(3)?,
            schedule: r.get(4)?,
            default_run_mode: r.get(5)?,
            default_cli: r.get(6)?,
            default_provider: r.get(7)?,
            default_model: r.get(8)?,
            skills: r.get::<_, String>(9).unwrap_or_default(),
            connectors: r.get::<_, String>(10).unwrap_or_default(),
            is_active: r.get::<_, i64>(11)? != 0,
            agent_id: r.get(12)?,
            agent_catalog_id: r.get(13)?,
            author: r.get(14)?,
            last_run: r.get(15)?,
            next_run: r.get(16)?,
            created_at: r.get(17)?,
            updated_at: r.get(18)?,
        })
    }

    const AGENT_SELECT: &'static str =
        "SELECT id, workspace_id, name, description, schedule, default_run_mode,
                default_cli, default_provider, default_model, skills, connectors,
                is_active, agent_id, agent_catalog_id, author, last_run, next_run, created_at, updated_at
         FROM agents";

    /// Upsert a local agent metadata row. `id` must be a pre-generated ULID.
    #[allow(clippy::too_many_arguments)]
    pub fn upsert_agent_row(
        &self,
        id: &str,
        workspace_id: i64,
        name: &str,
        description: &str,
        schedule: &str,
        default_run_mode: &str,
        default_cli: &str,
        default_provider: &str,
        default_model: &str,
        skills: &str,
        connectors: &str,
        is_active: bool,
        agent_id: Option<&str>,
        agent_catalog_id: Option<&str>,
        author: &str,
    ) -> Result<AgentRow, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO agents
                (id, workspace_id, name, description, schedule, default_run_mode,
                 default_cli, default_provider, default_model, skills, connectors,
                 is_active, agent_id, agent_catalog_id, author, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, datetime('now'))
             ON CONFLICT(workspace_id, name) DO UPDATE SET
                description      = excluded.description,
                schedule         = excluded.schedule,
                default_run_mode = excluded.default_run_mode,
                default_cli      = excluded.default_cli,
                default_provider = excluded.default_provider,
                default_model    = excluded.default_model,
                skills           = excluded.skills,
                connectors       = excluded.connectors,
                is_active        = excluded.is_active,
                agent_id         = COALESCE(excluded.agent_id, agents.agent_id),
                agent_catalog_id = COALESCE(excluded.agent_catalog_id, agents.agent_catalog_id),
                author           = CASE WHEN excluded.author = '' THEN agents.author ELSE excluded.author END,
                updated_at       = excluded.updated_at",
            rusqlite::params![
                id, workspace_id, name, description, schedule,
                default_run_mode, default_cli, default_provider, default_model,
                skills, connectors, is_active as i64, agent_id,
                agent_catalog_id, author,
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            &format!(
                "{} WHERE workspace_id = ?1 AND name = ?2",
                Self::AGENT_SELECT
            ),
            rusqlite::params![workspace_id, name],
            Self::agent_from_row,
        )
        .map_err(|e| e.to_string())
    }

    /// Toggle the active flag for an agent (pauses/resumes scheduled runs).
    pub fn set_agent_active(
        &self,
        workspace_id: i64,
        name: &str,
        is_active: bool,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE agents SET is_active = ?1, updated_at = datetime('now')
             WHERE workspace_id = ?2 AND name = ?3",
            rusqlite::params![is_active as i64, workspace_id, name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_agent_rows(&self, workspace_id: i64) -> Result<Vec<AgentRow>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(&format!(
                "{} WHERE workspace_id = ?1 ORDER BY name",
                Self::AGENT_SELECT
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([workspace_id], Self::agent_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_agent_row_by_name(&self, workspace_id: i64, name: &str) -> Result<AgentRow, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            &format!(
                "{} WHERE workspace_id = ?1 AND name = ?2",
                Self::AGENT_SELECT
            ),
            rusqlite::params![workspace_id, name],
            Self::agent_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_agent_row(&self, workspace_id: i64, name: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM agents WHERE workspace_id = ?1 AND name = ?2",
            rusqlite::params![workspace_id, name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Called after a successful agent run: updates `last_run` and `next_run`.
    pub fn mark_agent_ran(
        &self,
        workspace_id: i64,
        name: &str,
        last_run: &str,
        next_run: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE agents SET last_run = ?1, next_run = ?2, updated_at = datetime('now')
             WHERE workspace_id = ?3 AND name = ?4",
            rusqlite::params![last_run, next_run, workspace_id, name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Store the Turso cloud ULID back onto a local agent row after first sync.
    #[allow(dead_code)]
    pub fn set_agent_cloud_id(
        &self,
        workspace_id: i64,
        name: &str,
        agent_id: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE agents SET agent_id = ?1, updated_at = datetime('now')
             WHERE workspace_id = ?2 AND name = ?3",
            rusqlite::params![agent_id, workspace_id, name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// List sessions (CLI + chat) triggered by a specific agent, for the Activity tab.
    pub fn list_agent_sessions(
        &self,
        workspace_id: i64,
        agent_name: &str,
    ) -> Result<Vec<SessionFeedItem>, String> {
        let conn = self.0.lock().unwrap();
        let mut items: Vec<SessionFeedItem> = Vec::new();

        // CLI sessions
        {
            let mut stmt = conn
                .prepare(
                    "SELECT sh.session_id, sh.workspace_id, w.name, sh.cli, sh.provider, sh.model,
                            sh.last_output, sh.started_at, sh.started_at,
                            sh.tokens_prompt + sh.tokens_completion + sh.tokens_reasoning,
                            sh.cost_usd, sh.agent_id,
                            sh.user_id, sh.rate_prompt_per_1m, sh.rate_cached_per_1m, sh.rate_completion_per_1m, sh.rate_reasoning_per_1m
                     FROM session_history sh
                     JOIN workspaces w ON w.id = sh.workspace_id
                     WHERE sh.workspace_id = ?1 AND sh.agent_id = ?2
                     ORDER BY sh.started_at DESC LIMIT 100",
                )
                .map_err(|e| e.to_string())?;
            let rows: Vec<SessionFeedItem> = stmt
                .query_map(
                    rusqlite::params![workspace_id, agent_name],
                    Self::session_feed_cli_from_row,
                )
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            items.extend(rows);
        }

        // Chat sessions
        {
            let mut stmt = conn
                .prepare(
                    "SELECT cs.id, w.id, w.name, 'chat', cs.provider, cs.model,
                            (SELECT content FROM chat_messages m WHERE m.session_id = cs.id
                             AND m.role = 'assistant' ORDER BY m.id DESC LIMIT 1),
                            cs.created_at, cs.updated_at,
                            cs.tokens_prompt + cs.tokens_completion, cs.cost_usd,
                            cs.job_id, cs.agent_id,
                            cs.user_id, cs.rate_prompt_per_1m, cs.rate_cached_per_1m, cs.rate_completion_per_1m, cs.rate_reasoning_per_1m
                     FROM chat_sessions cs
                     JOIN workspaces w ON w.project_id = cs.project_id
                     WHERE w.id = ?1 AND cs.agent_id = ?2
                     ORDER BY cs.updated_at DESC LIMIT 100",
                )
                .map_err(|e| e.to_string())?;
            let rows: Vec<SessionFeedItem> = stmt
                .query_map(
                    rusqlite::params![workspace_id, agent_name],
                    Self::session_feed_chat_from_row,
                )
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            items.extend(rows);
        }

        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(items)
    }

    // ---- Phase 21: usage ----

    pub fn insert_usage_event(&self, ev: &UsageEvent) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO usage_events
                (id, project_id, org_id, user_id, session_id, model, provider, cli,
                 tokens_prompt, tokens_prompt_cached, tokens_completion, tokens_reasoning,
                 cost_usd, cache_hit_rate, estimated, synced, started_at, ended_at,
                 rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,0,?16,?17,?18,?19,?20,?21)",
            rusqlite::params![
                ev.id,
                ev.project_id,
                ev.org_id,
                ev.user_id,
                ev.session_id,
                ev.model,
                ev.provider,
                ev.cli,
                ev.tokens_prompt,
                ev.tokens_prompt_cached,
                ev.tokens_completion,
                ev.tokens_reasoning,
                ev.cost_usd,
                ev.cache_hit_rate,
                ev.estimated as i64,
                ev.started_at,
                ev.ended_at,
                ev.rate_prompt_per_1m.unwrap_or(0.0),
                ev.rate_cached_per_1m.unwrap_or(0.0),
                ev.rate_completion_per_1m.unwrap_or(0.0),
                ev.rate_reasoning_per_1m.unwrap_or(0.0),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn unsynced_usage_events(&self) -> Result<Vec<UsageEvent>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, org_id, user_id, session_id, model, provider, cli,
                        tokens_prompt, tokens_prompt_cached, tokens_completion, tokens_reasoning,
                        cost_usd, cache_hit_rate, estimated, started_at, ended_at,
                        rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m
                 FROM usage_events WHERE synced = 0 ORDER BY created_at",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(UsageEvent {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    org_id: r.get(2)?,
                    user_id: r.get(3)?,
                    session_id: r.get(4)?,
                    model: r.get(5)?,
                    provider: r.get(6)?,
                    cli: r.get(7)?,
                    tokens_prompt: r.get(8)?,
                    tokens_prompt_cached: r.get(9)?,
                    tokens_completion: r.get(10)?,
                    tokens_reasoning: r.get(11)?,
                    cost_usd: r.get(12)?,
                    cache_hit_rate: r.get(13)?,
                    estimated: r.get::<_, i64>(14)? != 0,
                    started_at: r.get(15)?,
                    ended_at: r.get(16)?,
                    rate_prompt_per_1m: r.get(17).ok(),
                    rate_cached_per_1m: r.get(18).ok(),
                    rate_completion_per_1m: r.get(19).ok(),
                    rate_reasoning_per_1m: r.get(20).ok(),
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn mark_usage_synced(&self, ids: &[String]) -> Result<(), String> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for id in ids {
            tx.execute("UPDATE usage_events SET synced = 1 WHERE id = ?1", [id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn list_usage_events_for_level(&self, level: &str, id: &str) -> Vec<UsageEvent> {
        let conn = match self.0.lock() {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };
        let sql = match level {
            "project" => "SELECT id, project_id, org_id, user_id, session_id, model, provider, cli,
                                tokens_prompt, tokens_prompt_cached, tokens_completion, tokens_reasoning,
                                cost_usd, cache_hit_rate, estimated, started_at, ended_at,
                                rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m
                         FROM usage_events WHERE project_id = ?1 ORDER BY created_at",
            "org" => "SELECT id, project_id, org_id, user_id, session_id, model, provider, cli,
                            tokens_prompt, tokens_prompt_cached, tokens_completion, tokens_reasoning,
                            cost_usd, cache_hit_rate, estimated, started_at, ended_at,
                            rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m
                     FROM usage_events
                     WHERE org_id = ?1
                        OR ( (org_id IS NULL OR org_id = '') AND (
                             project_id IN (SELECT project_id FROM project_org_cache WHERE org_id = ?1)
                             OR project_id IN (SELECT project_id FROM workspaces WHERE organization_id = ?1 OR organization_id IN (SELECT id FROM organizations WHERE id = ?1))
                           )
                        )
                     ORDER BY created_at",
            "user" => "SELECT id, project_id, org_id, user_id, session_id, model, provider, cli,
                                tokens_prompt, tokens_prompt_cached, tokens_completion, tokens_reasoning,
                                cost_usd, cache_hit_rate, estimated, started_at, ended_at,
                                rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m
                         FROM usage_events WHERE (?1 = '' OR user_id = ?1) ORDER BY created_at",
            "account" => "SELECT id, project_id, org_id, user_id, session_id, model, provider, cli,
                                tokens_prompt, tokens_prompt_cached, tokens_completion, tokens_reasoning,
                                cost_usd, cache_hit_rate, estimated, started_at, ended_at,
                                rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m
                         FROM usage_events ORDER BY created_at",
            _ => return Vec::new(),
        };
        let mut stmt = match conn.prepare(sql) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let row_mapper = |r: &rusqlite::Row| -> rusqlite::Result<UsageEvent> {
            Ok(UsageEvent {
                id: r.get(0)?,
                project_id: r.get(1)?,
                org_id: r.get(2)?,
                user_id: r.get(3)?,
                session_id: r.get(4)?,
                model: r.get(5)?,
                provider: r.get(6)?,
                cli: r.get(7)?,
                tokens_prompt: r.get(8)?,
                tokens_prompt_cached: r.get(9)?,
                tokens_completion: r.get(10)?,
                tokens_reasoning: r.get(11)?,
                cost_usd: r.get(12)?,
                cache_hit_rate: r.get(13)?,
                estimated: r.get::<_, i64>(14)? != 0,
                started_at: r.get(15)?,
                ended_at: r.get(16)?,
                rate_prompt_per_1m: r.get(17).ok(),
                rate_cached_per_1m: r.get(18).ok(),
                rate_completion_per_1m: r.get(19).ok(),
                rate_reasoning_per_1m: r.get(20).ok(),
            })
        };

        let result = if level == "account" {
            stmt.query_map([], row_mapper)
        } else {
            stmt.query_map([id], row_mapper)
        };

        match result {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    /// Read one aggregate row as a JSON object (numeric columns as numbers,
    /// the `*_json` columns parsed into nested values). `table` must be one of
    /// project_usage|org_usage|account_usage|user_usage. Returns None if absent.
    pub fn get_usage_row(&self, table: &str, id: &str) -> Option<serde_json::Value> {
        if !matches!(table, "project_usage" | "org_usage" | "account_usage" | "user_usage") {
            return None;
        }
        let conn = self.0.lock().unwrap();
        let sql = format!(
            "SELECT tokens_prompt_lifetime, tokens_prompt_cached_lifetime,
                    tokens_completion_lifetime, tokens_reasoning_lifetime, cost_lifetime_usd,
                    sessions_lifetime, cache_hits_lifetime, analytics_lifetime,
                    usage_24h, usage_7d, usage_30d, usage_12m, by_model, by_provider,
                    by_cli, by_member, by_project, by_org, heatmap_365d, updated_at
             FROM {} WHERE id = ?1",
            table
        );
        conn.query_row(&sql, [id], |r| {
            let parse = |s: String| serde_json::from_str(&s).unwrap_or(serde_json::json!({}));
            Ok(serde_json::json!({
                "id": id,
                "tokens_prompt_lifetime": r.get::<_, i64>(0)?,
                "tokens_prompt_cached_lifetime": r.get::<_, i64>(1)?,
                "tokens_completion_lifetime": r.get::<_, i64>(2)?,
                "tokens_reasoning_lifetime": r.get::<_, i64>(3)?,
                "cost_lifetime_usd": r.get::<_, f64>(4)?,
                "sessions_lifetime": r.get::<_, i64>(5)?,
                "cache_hits_lifetime": r.get::<_, i64>(6)?,
                "analytics_lifetime": parse(r.get(7)?),
                "usage_24h": parse(r.get(8)?),
                "usage_7d": parse(r.get(9)?),
                "usage_30d": parse(r.get(10)?),
                "usage_12m": parse(r.get(11)?),
                "by_model": parse(r.get(12)?),
                "by_provider": parse(r.get(13)?),
                "by_cli": parse(r.get(14)?),
                "by_member": parse(r.get(15)?),
                "by_project": parse(r.get(16)?),
                "by_org": parse(r.get(17)?),
                "heatmap_365d": parse(r.get(18)?),
                "updated_at": r.get::<_, String>(19)?,
            }))
        })
        .ok()
    }

    /// Read all aggregate rows for one of project_usage|org_usage|account_usage|user_usage.
    pub fn list_usage_rows(&self, table: &str) -> Vec<serde_json::Value> {
        if !matches!(table, "project_usage" | "org_usage" | "account_usage" | "user_usage") {
            return Vec::new();
        }
        let conn = self.0.lock().unwrap();
        let sql = format!(
            "SELECT id, tokens_prompt_lifetime, tokens_prompt_cached_lifetime,
                    tokens_completion_lifetime, tokens_reasoning_lifetime, cost_lifetime_usd,
                    sessions_lifetime, cache_hits_lifetime, analytics_lifetime,
                    usage_24h, usage_7d, usage_30d, usage_12m, by_model, by_provider,
                    by_cli, by_member, by_project, by_org, heatmap_365d, updated_at
             FROM {}",
            table
        );
        let Ok(mut stmt) = conn.prepare(&sql) else {
            return Vec::new();
        };
        let parse = |s: String| serde_json::from_str(&s).unwrap_or(serde_json::json!({}));
        let rows = stmt.query_map([], |r| {
            let id: String = r.get(0)?;
            Ok(serde_json::json!({
                "id": id,
                "tokens_prompt_lifetime": r.get::<_, i64>(1)?,
                "tokens_prompt_cached_lifetime": r.get::<_, i64>(2)?,
                "tokens_completion_lifetime": r.get::<_, i64>(3)?,
                "tokens_reasoning_lifetime": r.get::<_, i64>(4)?,
                "cost_lifetime_usd": r.get::<_, f64>(5)?,
                "sessions_lifetime": r.get::<_, i64>(6)?,
                "cache_hits_lifetime": r.get::<_, i64>(7)?,
                "analytics_lifetime": parse(r.get(8)?),
                "usage_24h": parse(r.get(9)?),
                "usage_7d": parse(r.get(10)?),
                "usage_30d": parse(r.get(11)?),
                "usage_12m": parse(r.get(12)?),
                "by_model": parse(r.get(13)?),
                "by_provider": parse(r.get(14)?),
                "by_cli": parse(r.get(15)?),
                "by_member": parse(r.get(16)?),
                "by_project": parse(r.get(17)?),
                "by_org": parse(r.get(18)?),
                "heatmap_365d": parse(r.get(19)?),
                "updated_at": r.get::<_, String>(20)?,
            }))
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    /// Upsert one aggregate row from a JSON object (the shape produced by
    /// `get_usage_row` / the usage aggregation core).
    pub fn put_usage_row(&self, table: &str, row: &serde_json::Value) -> Result<(), String> {
        if !matches!(table, "project_usage" | "org_usage" | "account_usage" | "user_usage") {
            return Err("invalid usage table".into());
        }
        let conn = self.0.lock().unwrap();
        let id = row["id"].as_str().ok_or("usage row missing id")?;
        let i = |k: &str| row[k].as_i64().unwrap_or(0);
        let f = |k: &str| row[k].as_f64().unwrap_or(0.0);
        let j = |k: &str| row[k].to_string();
        let sql = format!(
            "INSERT OR REPLACE INTO {} (id, tokens_prompt_lifetime, tokens_prompt_cached_lifetime,
                tokens_completion_lifetime, tokens_reasoning_lifetime, cost_lifetime_usd,
                sessions_lifetime, cache_hits_lifetime, analytics_lifetime, usage_24h, usage_7d,
                usage_30d, usage_12m, by_model, by_provider, by_cli, by_member, by_project,
                by_org, heatmap_365d, last_synced_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,
                     datetime('now'), datetime('now'))",
            table
        );
        conn.execute(
            &sql,
            rusqlite::params![
                id,
                i("tokens_prompt_lifetime"),
                i("tokens_prompt_cached_lifetime"),
                i("tokens_completion_lifetime"),
                i("tokens_reasoning_lifetime"),
                f("cost_lifetime_usd"),
                i("sessions_lifetime"),
                i("cache_hits_lifetime"),
                j("analytics_lifetime"),
                j("usage_24h"),
                j("usage_7d"),
                j("usage_30d"),
                j("usage_12m"),
                j("by_model"),
                j("by_provider"),
                j("by_cli"),
                j("by_member"),
                j("by_project"),
                j("by_org"),
                j("heatmap_365d"),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
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

        match scope {
            "project" => {
                let _ = tx.execute("DELETE FROM project_llm_keys WHERE project_id = ?1", [scope_id]);
                for k in keys {
                    let _ = tx.execute(
                        "INSERT INTO project_llm_keys (project_id, provider, credentials_encrypted, base_url, extra_env, synced_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![scope_id, k.provider, k.credentials_encrypted, k.base_url, k.extra_env, synced_at],
                    );
                }
            }
            "org" => {
                let _ = tx.execute("DELETE FROM org_llm_keys WHERE org_id = ?1", [scope_id]);
                for k in keys {
                    let _ = tx.execute(
                        "INSERT INTO org_llm_keys (org_id, provider, credentials_encrypted, base_url, extra_env, synced_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![scope_id, k.provider, k.credentials_encrypted, k.base_url, k.extra_env, synced_at],
                    );
                }
            }
            "account" => {
                let _ = tx.execute("DELETE FROM account_llm_keys WHERE user_id = ?1", [scope_id]);
                for k in keys {
                    let _ = tx.execute(
                        "INSERT INTO account_llm_keys (user_id, provider, credentials_encrypted, base_url, extra_env, synced_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![scope_id, k.provider, k.credentials_encrypted, k.base_url, k.extra_env, synced_at],
                    );
                }
            }
            _ => {}
        }

        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_llm_keys(&self, scope: &str, scope_id: &str) -> Vec<CachedLlmKey> {
        let conn = self.0.lock().unwrap();
        let query_res: rusqlite::Result<Vec<CachedLlmKey>> = match scope {
            "project" => {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT provider, credentials_encrypted, base_url, extra_env
                     FROM project_llm_keys WHERE project_id = ?1 ORDER BY provider",
                ) {
                    stmt.query_map([scope_id], |r| {
                        Ok(CachedLlmKey {
                            provider: r.get(0)?,
                            credentials_encrypted: r.get(1)?,
                            base_url: r.get(2)?,
                            extra_env: r.get(3)?,
                        })
                    }).map(|iter| iter.flatten().collect())
                } else {
                    Ok(Vec::new())
                }
            }
            "org" => {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT provider, credentials_encrypted, base_url, extra_env
                     FROM org_llm_keys WHERE org_id = ?1 ORDER BY provider",
                ) {
                    stmt.query_map([scope_id], |r| {
                        Ok(CachedLlmKey {
                            provider: r.get(0)?,
                            credentials_encrypted: r.get(1)?,
                            base_url: r.get(2)?,
                            extra_env: r.get(3)?,
                        })
                    }).map(|iter| iter.flatten().collect())
                } else {
                    Ok(Vec::new())
                }
            }
            "account" => {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT provider, credentials_encrypted, base_url, extra_env
                     FROM account_llm_keys WHERE user_id = ?1 ORDER BY provider",
                ) {
                    stmt.query_map([scope_id], |r| {
                        Ok(CachedLlmKey {
                            provider: r.get(0)?,
                            credentials_encrypted: r.get(1)?,
                            base_url: r.get(2)?,
                            extra_env: r.get(3)?,
                        })
                    }).map(|iter| iter.flatten().collect())
                } else {
                    Ok(Vec::new())
                }
            }
            _ => Ok(Vec::new()),
        };

        query_res.unwrap_or_default()
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

        match scope {
            "project" => {
                let mut existing_creds: std::collections::HashMap<String, Option<String>> = std::collections::HashMap::new();
                if let Ok(mut stmt) = tx.prepare("SELECT service, credentials_encrypted FROM project_connectors WHERE project_id = ?1") {
                    if let Ok(rows) = stmt.query_map([scope_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))) {
                        for item in rows.flatten() {
                            existing_creds.insert(item.0, item.1);
                        }
                    }
                }
                let _ = tx.execute("DELETE FROM project_connectors WHERE project_id = ?1", [scope_id]);
                for c in connectors {
                    let creds = c.credentials_encrypted.clone().or_else(|| existing_creds.get(&c.service).cloned().flatten());
                    let _ = tx.execute(
                        "INSERT INTO project_connectors (project_id, service, status, credentials_encrypted, synced_at)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![scope_id, c.service, c.status.as_deref().unwrap_or("configured"), creds, synced_at],
                    );
                }
            }
            "org" => {
                let mut existing_creds: std::collections::HashMap<String, Option<String>> = std::collections::HashMap::new();
                if let Ok(mut stmt) = tx.prepare("SELECT service, credentials_encrypted FROM org_connectors WHERE org_id = ?1") {
                    if let Ok(rows) = stmt.query_map([scope_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))) {
                        for item in rows.flatten() {
                            existing_creds.insert(item.0, item.1);
                        }
                    }
                }
                let _ = tx.execute("DELETE FROM org_connectors WHERE org_id = ?1", [scope_id]);
                for c in connectors {
                    let creds = c.credentials_encrypted.clone().or_else(|| existing_creds.get(&c.service).cloned().flatten());
                    let _ = tx.execute(
                        "INSERT INTO org_connectors (org_id, service, status, credentials_encrypted, synced_at)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![scope_id, c.service, c.status.as_deref().unwrap_or("configured"), creds, synced_at],
                    );
                }
            }
            "account" => {
                let mut existing_creds: std::collections::HashMap<String, Option<String>> = std::collections::HashMap::new();
                if let Ok(mut stmt) = tx.prepare("SELECT service, credentials_encrypted FROM account_connectors WHERE user_id = ?1") {
                    if let Ok(rows) = stmt.query_map([scope_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))) {
                        for item in rows.flatten() {
                            existing_creds.insert(item.0, item.1);
                        }
                    }
                }
                let _ = tx.execute("DELETE FROM account_connectors WHERE user_id = ?1", [scope_id]);
                for c in connectors {
                    let creds = c.credentials_encrypted.clone().or_else(|| existing_creds.get(&c.service).cloned().flatten());
                    let _ = tx.execute(
                        "INSERT INTO account_connectors (user_id, service, status, credentials_encrypted, synced_at)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![scope_id, c.service, c.status.as_deref().unwrap_or("configured"), creds, synced_at],
                    );
                }
            }
            _ => {}
        }

        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_connectors(&self, scope: &str, scope_id: &str) -> Vec<CachedConnector> {
        let conn = self.0.lock().unwrap();
        let query_res: rusqlite::Result<Vec<CachedConnector>> = match scope {
            "project" => {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT service, status, credentials_encrypted
                     FROM project_connectors WHERE project_id = ?1 ORDER BY service",
                ) {
                    stmt.query_map([scope_id], |r| {
                        Ok(CachedConnector {
                            service: r.get(0)?,
                            status: r.get(1)?,
                            credentials_encrypted: r.get(2)?,
                        })
                    }).map(|iter| iter.flatten().collect())
                } else {
                    Ok(Vec::new())
                }
            }
            "org" => {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT service, status, credentials_encrypted
                     FROM org_connectors WHERE org_id = ?1 ORDER BY service",
                ) {
                    stmt.query_map([scope_id], |r| {
                        Ok(CachedConnector {
                            service: r.get(0)?,
                            status: r.get(1)?,
                            credentials_encrypted: r.get(2)?,
                        })
                    }).map(|iter| iter.flatten().collect())
                } else {
                    Ok(Vec::new())
                }
            }
            "account" => {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT service, status, credentials_encrypted
                     FROM account_connectors WHERE user_id = ?1 ORDER BY service",
                ) {
                    stmt.query_map([scope_id], |r| {
                        Ok(CachedConnector {
                            service: r.get(0)?,
                            status: r.get(1)?,
                            credentials_encrypted: r.get(2)?,
                        })
                    }).map(|iter| iter.flatten().collect())
                } else {
                    Ok(Vec::new())
                }
            }
            _ => Ok(Vec::new()),
        };

        query_res.unwrap_or_default()
    }

    /// Upsert a single connector entry into the local database.
    pub fn upsert_connector_cache(
        &self,
        scope: &str,
        scope_id: &str,
        service: &str,
        credentials_encrypted: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        match scope {
            "project" => {
                let _ = conn.execute(
                    "INSERT INTO project_connectors
                         (project_id, service, status, credentials_encrypted, synced_at)
                     VALUES (?1, ?2, 'local', ?3, ?4)
                     ON CONFLICT(project_id, service) DO UPDATE SET
                         status = 'local',
                         credentials_encrypted = excluded.credentials_encrypted,
                         synced_at = excluded.synced_at",
                    rusqlite::params![scope_id, service, credentials_encrypted, ts],
                );
            }
            "org" => {
                let _ = conn.execute(
                    "INSERT INTO org_connectors
                         (org_id, service, status, credentials_encrypted, synced_at)
                     VALUES (?1, ?2, 'local', ?3, ?4)
                     ON CONFLICT(org_id, service) DO UPDATE SET
                         status = 'local',
                         credentials_encrypted = excluded.credentials_encrypted,
                         synced_at = excluded.synced_at",
                    rusqlite::params![scope_id, service, credentials_encrypted, ts],
                );
            }
            "account" => {
                let _ = conn.execute(
                    "INSERT INTO account_connectors
                         (user_id, service, status, credentials_encrypted, synced_at)
                     VALUES (?1, ?2, 'local', ?3, ?4)
                     ON CONFLICT(user_id, service) DO UPDATE SET
                         status = 'local',
                         credentials_encrypted = excluded.credentials_encrypted,
                         synced_at = excluded.synced_at",
                    rusqlite::params![scope_id, service, credentials_encrypted, ts],
                );
            }
            _ => {}
        }
        Ok(())
    }

    pub fn set_project_org(
        &self,
        project_id: &str,
        org_id: &str,
        synced_at: &str,
    ) -> Result<(), String> {
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

    pub fn get_project_name(&self, project_id: &str) -> Option<String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT name FROM workspaces WHERE project_id = ?1",
            [project_id],
            |r| r.get(0),
        )
        .ok()
    }

    fn chat_message_from_row(r: &rusqlite::Row) -> rusqlite::Result<ChatMessage> {
        Ok(ChatMessage {
            id: r.get(0)?,
            session_id: r.get(1)?,
            project_id: r.get(2)?,
            role: r.get(3)?,
            content: r.get(4)?,
            provider: r.get(5)?,
            model: r.get(6)?,
            user_id: r.get(7).ok(),
            created_at: r.get(8)?,
        })
    }

    fn chat_session_from_row(r: &rusqlite::Row) -> rusqlite::Result<ChatSession> {
        Ok(ChatSession {
            id: r.get(0)?,
            project_id: r.get(1)?,
            name: r.get(2)?,
            is_star: r.get::<_, i64>(3)? != 0,
            created_at: r.get(4)?,
            updated_at: r.get(5)?,
            message_count: r.get(6)?,
            last_at: r.get(7)?,
            preview: r.get(8)?,
            first_user: r.get(9)?,
            provider: r.get(10)?,
            model: r.get(11)?,
            user_id: r.get(12).ok(),
            workspace_id: r.get(13).ok(),
        })
    }

    const CHAT_SESSION_SELECT: &'static str =
        "SELECT s.id, s.project_id, s.name, s.is_star, s.created_at, s.updated_at,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id),
            (SELECT created_at FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1),
            (SELECT content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1),
            (SELECT content FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'user' ORDER BY m.id ASC LIMIT 1),
            (SELECT provider FROM chat_messages m WHERE m.session_id = s.id AND m.provider IS NOT NULL ORDER BY m.id DESC LIMIT 1),
            (SELECT model FROM chat_messages m WHERE m.session_id = s.id AND m.model IS NOT NULL ORDER BY m.id DESC LIMIT 1),
            s.user_id,
            s.workspace_id
         FROM chat_sessions s";

    pub fn create_chat_session(&self, project_id: &str) -> Result<ChatSession, String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        let id = ulid::Ulid::new().to_string();
        conn.execute(
            "INSERT INTO chat_sessions (id, workspace_id, project_id, user_id) 
             VALUES (?1, (SELECT id FROM workspaces WHERE project_id = ?2 LIMIT 1), ?2, ?3)",
            rusqlite::params![id, project_id, user_id],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            &format!("{} WHERE s.id = ?1", Self::CHAT_SESSION_SELECT),
            [&id],
            Self::chat_session_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn list_chat_sessions(&self, project_id: &str) -> Result<Vec<ChatSession>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(&format!(
                "{} WHERE s.project_id = ?1 ORDER BY s.is_star DESC, s.updated_at DESC",
                Self::CHAT_SESSION_SELECT
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([project_id], Self::chat_session_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn add_chat_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        provider: Option<&str>,
        model: Option<&str>,
    ) -> Result<ChatMessage, String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        let project_id: String = conn
            .query_row(
                "SELECT project_id FROM chat_sessions WHERE id = ?1",
                [session_id],
                |r| r.get(0),
            )
            .map_err(|_| "chat session not found".to_string())?;
        conn.execute(
            "INSERT INTO chat_messages (session_id, project_id, role, content, provider, model, user_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![session_id, project_id, role, content, provider, model, user_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?1",
            [session_id],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, session_id, project_id, role, content, provider, model, user_id, created_at
             FROM chat_messages WHERE id = ?1",
            [id],
            Self::chat_message_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_chat_message(&self, id: i64) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM chat_messages WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_chat_messages(&self, session_id: &str) -> Result<Vec<ChatMessage>, String> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, project_id, role, content, provider, model, user_id, created_at
                 FROM chat_messages WHERE session_id = ?1 ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([session_id], Self::chat_message_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn rename_chat_session(&self, id: &str, name: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let trimmed = name.trim();
        let value: Option<&str> = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
        conn.execute(
            "UPDATE chat_sessions SET name = ?2 WHERE id = ?1",
            rusqlite::params![id, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn star_chat_session(&self, id: &str, is_star: bool) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE chat_sessions SET is_star = ?2 WHERE id = ?1",
            rusqlite::params![id, if is_star { 1 } else { 0 }],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_chat_session(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM chat_messages WHERE session_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM chat_sessions WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Atomically replace all chat_messages for a session with the compacted set.
    /// Runs inside a transaction: deletes all old messages, inserts the compacted list
    /// (preserving role/content), then bumps the session's updated_at.
    pub fn replace_chat_messages_with_compacted(
        &self,
        session_id: &str,
        messages: &[crate::chat::ChatMsg],
    ) -> Result<(), String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        let project_id: String = conn
            .query_row(
                "SELECT project_id FROM chat_sessions WHERE id = ?1",
                [session_id],
                |r| r.get(0),
            )
            .map_err(|_| "chat session not found".to_string())?;

        conn.execute(
            "DELETE FROM chat_messages WHERE session_id = ?1",
            [session_id],
        )
        .map_err(|e| e.to_string())?;

        for msg in messages {
            conn.execute(
                "INSERT INTO chat_messages (session_id, project_id, role, content, user_id) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![session_id, project_id, msg.role, msg.content, user_id],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.execute(
            "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?1",
            [session_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn move_chat_session(&self, id: &str, to_project: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE chat_sessions SET project_id = ?2 WHERE id = ?1",
            rusqlite::params![id, to_project],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE chat_messages SET project_id = ?2 WHERE session_id = ?1",
            rusqlite::params![id, to_project],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_workspace(&self, id: i64) -> Result<Workspace, String> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, name, path, cli, organization_id, org_id, created_at, project_id, default_run_mode, default_cli, default_provider, default_model, script_setup, script_run, script_teardown, script_auto_run, repo_url, description, env_files FROM workspaces WHERE id = ?1",
            [id],
            Self::workspace_from_row,
        )
        .map_err(|e| e.to_string())
    }

    // --- Phase 18: skills (local working index) ---

    pub fn list_skill_index(&self, workspace_id: i64) -> Vec<SkillIndexRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT name, description, tags, scope, active, author FROM project_skills
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
                author: r.get(5)?,
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
        author: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO project_skills
                (workspace_id, name, description, tags, file_path, scope, active, auto, version, source, author, skill_catalog_id, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))
             ON CONFLICT(workspace_id, name) DO UPDATE SET
                description = excluded.description, tags = excluded.tags,
                file_path = excluded.file_path, scope = excluded.scope,
                auto = excluded.auto, version = excluded.version,
                source = excluded.source, author = CASE WHEN excluded.author = '' THEN project_skills.author ELSE excluded.author END, skill_catalog_id = COALESCE(excluded.skill_catalog_id, project_skills.skill_catalog_id), updated_at = excluded.updated_at",
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
                author,
                None::<String>, /* TODO: pass skill_catalog_id from skills */
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

    pub fn set_skill_active(
        &self,
        workspace_id: i64,
        name: &str,
        active: bool,
    ) -> Result<(), String> {
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
        let pid = self.get_workspace_project_id(workspace_id);
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM project_skills WHERE workspace_id = ?1 AND name = ?2",
            (workspace_id, name),
        )
        .map_err(|e| e.to_string())?;
        if let Some(pid) = pid {
            let _ = conn.execute(
                "DELETE FROM skill_index_cache WHERE project_id = ?1 AND skill_name = ?2",
                (pid, name),
            );
        }
        Ok(())
    }

    // --- Phase 18: skills (project and org level) ---

    #[allow(dead_code)]
    pub fn replace_cached_skills(
        &self,
        project_id: &str,
        skills: &[CachedSkill],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM project_skills WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|e| e.to_string())?;
        for s in skills {
            tx.execute(
                "INSERT INTO project_skills (workspace_id, name, tags, scope, active, project_id, updated_at)
                 VALUES ((SELECT id FROM workspaces WHERE project_id = ?1 LIMIT 1), ?2, ?3, ?4, ?5, ?1, ?6)",
                rusqlite::params![project_id, s.skill_name, s.tags, s.scope, s.active as i64, synced_at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_skills(&self, project_id: &str) -> Vec<CachedSkill> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT name, tags, scope, active FROM project_skills
             WHERE project_id = ?1 ORDER BY name",
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

    #[allow(dead_code)]
    pub fn replace_cached_org_skills(
        &self,
        org_id: &str,
        skills: &[CachedOrgSkill],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM org_skills WHERE org_id = ?1", [org_id])
            .map_err(|e| e.to_string())?;
        for s in skills {
            tx.execute(
                "INSERT INTO org_skills (org_id, skill_name, tags, skill_catalog_id, author, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![org_id, s.skill_name, s.tags, s.skill_catalog_id, s.author, synced_at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_org_skills(&self, org_id: &str) -> Vec<CachedOrgSkill> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT skill_name, tags, skill_catalog_id, author FROM org_skills WHERE org_id = ?1 ORDER BY skill_name",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([org_id], |r| {
            Ok(CachedOrgSkill {
                skill_name: r.get(0)?,
                tags: r.get(1)?,
                skill_catalog_id: r.get(2)?,
                author: r.get(3)?,
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
            "INSERT INTO project_memory
                (workspace_id, category, slug, title, summary, tags, file_path, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
             ON CONFLICT(workspace_id, category, slug) DO UPDATE SET
                title = excluded.title, summary = excluded.summary, tags = excluded.tags,
                file_path = excluded.file_path, updated_at = excluded.updated_at",
            rusqlite::params![
                workspace_id,
                category,
                slug,
                title,
                summary,
                tags,
                file_path
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_memory_entries(&self, workspace_id: i64) -> Vec<MemoryEntryRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT category, slug, title, summary, tags, file_path, updated_at
             FROM project_memory WHERE workspace_id = ?1 ORDER BY category, slug",
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
            "DELETE FROM project_memory WHERE workspace_id = ?1 AND category = ?2 AND slug = ?3",
            (workspace_id, category, slug),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_memory_category(&self, workspace_id: i64, category: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM project_memory WHERE workspace_id = ?1 AND category = ?2",
            (workspace_id, category),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn replace_cached_memory(
        &self,
        project_id: &str,
        entries: &[CachedMemory],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM project_memory WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|e| e.to_string())?;
        for m in entries {
            tx.execute(
                "INSERT INTO project_memory
                    (workspace_id, project_id, category, slug, title, summary, tags, updated_at)
                 VALUES ((SELECT id FROM workspaces WHERE project_id = ?1 LIMIT 1), ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    project_id, m.category, m.slug, m.title, m.summary, m.tags, synced_at
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_memory(&self, project_id: &str) -> Vec<CachedMemory> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT category, slug, title, summary, tags FROM project_memory
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

    #[allow(dead_code)]
    pub fn replace_cached_org_memory(
        &self,
        org_id: &str,
        entries: &[CachedOrgMemory],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM org_memory WHERE org_id = ?1", [org_id])
            .map_err(|e| e.to_string())?;
        for m in entries {
            tx.execute(
                "INSERT INTO org_memory (org_id, slug, title, body, tags, updated_at)
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
            "SELECT slug, title, body, tags FROM org_memory WHERE org_id = ?1 ORDER BY slug",
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
            "INSERT INTO project_wiki
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
             FROM project_wiki WHERE workspace_id = ?1 ORDER BY title",
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
            "DELETE FROM project_wiki WHERE workspace_id = ?1 AND slug = ?2",
            (workspace_id, slug),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn replace_cached_wiki(
        &self,
        project_id: &str,
        pages: &[CachedWiki],
        synced_at: &str,
    ) -> Result<(), String> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM project_wiki WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|e| e.to_string())?;
        for p in pages {
            tx.execute(
                "INSERT INTO project_wiki
                    (workspace_id, project_id, slug, title, summary, tags, updated_at)
                 VALUES ((SELECT id FROM workspaces WHERE project_id = ?1 LIMIT 1), ?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    project_id, p.slug, p.title, p.summary, p.tags, synced_at
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_cached_wiki(&self, project_id: &str) -> Vec<CachedWiki> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT slug, title, summary, tags FROM project_wiki
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
                content: String::new(),
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    // ── Session log files (Phase B / 3-Tier Hierarchy) ────────────────────────

    pub fn insert_session_log(
        &self,
        workspace_id: i64,
        id: &str,
        file_path: &str,
        agent_id: Option<&str>,
        session_id: Option<&str>,
        date: &str,
        agent_name: &str,
        model: &str,
        cost_usd: f64,
        tokens: i64,
        summary: &str,
    ) -> Result<SessionLogFile, String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        // Insert into project_session_logs
        conn.execute(
            "INSERT INTO project_session_logs
               (id, workspace_id, file_path, agent_id, session_id, date,
                agent_name, model, cost_usd, tokens, summary, user_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            rusqlite::params![
                id,
                workspace_id,
                file_path,
                agent_id,
                session_id,
                date,
                agent_name,
                model,
                cost_usd,
                tokens,
                summary,
                user_id
            ],
        )
        .map_err(|e| e.to_string())?;

        // Also dual-write to legacy session_logs table for backward compatibility
        let _ = conn.execute(
            "INSERT OR REPLACE INTO session_logs
               (id, workspace_id, file_path, agent_id, session_id, date,
                agent_name, model, cost_usd, tokens, summary, user_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            rusqlite::params![
                id,
                workspace_id,
                file_path,
                agent_id,
                session_id,
                date,
                agent_name,
                model,
                cost_usd,
                tokens,
                summary,
                user_id
            ],
        );

        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM project_session_logs WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(SessionLogFile {
            id: id.to_string(),
            workspace_id,
            file_path: file_path.to_string(),
            agent_id: agent_id.map(|s| s.to_string()),
            session_id: session_id.map(|s| s.to_string()),
            date: date.to_string(),
            agent_name: agent_name.to_string(),
            model: model.to_string(),
            cost_usd,
            tokens,
            summary: summary.to_string(),
            cloud_id: None,
            user_id,
            created_at,
        })
    }

    /// Lightweight upsert for session logs created by chat compaction.
    /// Uses INSERT OR IGNORE so the original created_at is preserved across
    /// multiple compaction passes on the same session.
    pub fn upsert_session_log(
        &self,
        session_id: &str,
        workspace_id: i64,
        file_path: &str,
        summary: &str,
    ) -> Result<(), String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        conn.execute(
            "INSERT OR IGNORE INTO project_session_logs \
             (id, workspace_id, file_path, session_id, date, agent_name, model, cost_usd, tokens, summary, user_id) \
             VALUES (?1, ?2, ?3, ?1, ?4, 'chat', '', 0.0, 0, ?5, ?6)",
            rusqlite::params![session_id, workspace_id, file_path, date, summary, user_id],
        )
        .map_err(|e| e.to_string())?;
        // Always refresh summary + path (latest compaction wins)
        conn.execute(
            "UPDATE project_session_logs SET summary = ?1, file_path = ?2 WHERE id = ?3",
            rusqlite::params![summary, file_path, session_id],
        )
        .map_err(|e| e.to_string())?;

        // Dual-write to session_logs for legacy compatibility
        let _ = conn.execute(
            "INSERT OR IGNORE INTO session_logs \
             (id, workspace_id, file_path, session_id, date, agent_name, model, cost_usd, tokens, summary, user_id) \
             VALUES (?1, ?2, ?3, ?1, ?4, 'chat', '', 0.0, 0, ?5, ?6)",
            rusqlite::params![session_id, workspace_id, file_path, date, summary, user_id],
        );
        let _ = conn.execute(
            "UPDATE session_logs SET summary = ?1, file_path = ?2 WHERE id = ?3",
            rusqlite::params![summary, file_path, session_id],
        );

        Ok(())
    }

    pub fn list_session_logs(&self, workspace_id: i64) -> Vec<SessionLogFile> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, workspace_id, file_path, agent_id, session_id, date,
                    agent_name, model, cost_usd, tokens, summary, cloud_id, created_at, user_id
             FROM project_session_logs
             WHERE workspace_id = ?1
             ORDER BY date DESC, created_at DESC",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([workspace_id], |r| {
            Ok(SessionLogFile {
                id: r.get(0)?,
                workspace_id: r.get(1)?,
                file_path: r.get(2)?,
                agent_id: r.get(3)?,
                session_id: r.get(4)?,
                date: r.get(5)?,
                agent_name: r.get(6)?,
                model: r.get(7)?,
                cost_usd: r.get(8)?,
                tokens: r.get(9)?,
                summary: r.get(10)?,
                cloud_id: r.get(11)?,
                created_at: r.get(12)?,
                user_id: r.get(13).ok(),
            })
        });
        match rows {
            Ok(iter) => {
                let items: Vec<SessionLogFile> = iter.flatten().collect();
                if !items.is_empty() {
                    return items;
                }
                // Fallback to legacy session_logs if project_session_logs has nothing yet
                if let Ok(mut legacy_stmt) = conn.prepare(
                    "SELECT id, workspace_id, file_path, agent_id, session_id, date,
                            agent_name, model, cost_usd, tokens, summary, cloud_id, created_at, user_id
                     FROM session_logs
                     WHERE workspace_id = ?1
                     ORDER BY date DESC, created_at DESC",
                ) {
                    let leg_rows = legacy_stmt.query_map([workspace_id], |r| {
                        Ok(SessionLogFile {
                            id: r.get(0)?,
                            workspace_id: r.get(1)?,
                            file_path: r.get(2)?,
                            agent_id: r.get(3)?,
                            session_id: r.get(4)?,
                            date: r.get(5)?,
                            agent_name: r.get(6)?,
                            model: r.get(7)?,
                            cost_usd: r.get(8)?,
                            tokens: r.get(9)?,
                            summary: r.get(10)?,
                            cloud_id: r.get(11)?,
                            created_at: r.get(12)?,
                            user_id: r.get(13).ok(),
                        })
                    });
                    if let Ok(leg_iter) = leg_rows {
                        return leg_iter.flatten().collect();
                    }
                }
                Vec::new()
            }
            Err(_) => Vec::new(),
        }
    }

    pub fn delete_session_log_file(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let _ = conn.execute("DELETE FROM project_session_logs WHERE id = ?1", [id]);
        let _ = conn.execute("DELETE FROM session_logs WHERE id = ?1", [id]);
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_session_log_by_session_id(&self, session_id: &str) -> Option<SessionLogFile> {
        let conn = self.0.lock().unwrap();
        if let Ok(res) = conn.query_row(
            "SELECT id, workspace_id, file_path, agent_id, session_id, date,
                    agent_name, model, cost_usd, tokens, summary, cloud_id, created_at, user_id
             FROM project_session_logs WHERE session_id = ?1 LIMIT 1",
            [session_id],
            |r| {
                Ok(SessionLogFile {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    file_path: r.get(2)?,
                    agent_id: r.get(3)?,
                    session_id: r.get(4)?,
                    date: r.get(5)?,
                    agent_name: r.get(6)?,
                    model: r.get(7)?,
                    cost_usd: r.get(8)?,
                    tokens: r.get(9)?,
                    summary: r.get(10)?,
                    cloud_id: r.get(11)?,
                    created_at: r.get(12)?,
                    user_id: r.get(13).ok(),
                })
            },
        ) {
            return Some(res);
        }

        conn.query_row(
            "SELECT id, workspace_id, file_path, agent_id, session_id, date,
                    agent_name, model, cost_usd, tokens, summary, cloud_id, created_at, user_id
             FROM session_logs WHERE session_id = ?1 LIMIT 1",
            [session_id],
            |r| {
                Ok(SessionLogFile {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    file_path: r.get(2)?,
                    agent_id: r.get(3)?,
                    session_id: r.get(4)?,
                    date: r.get(5)?,
                    agent_name: r.get(6)?,
                    model: r.get(7)?,
                    cost_usd: r.get(8)?,
                    tokens: r.get(9)?,
                    summary: r.get(10)?,
                    cloud_id: r.get(11)?,
                    created_at: r.get(12)?,
                    user_id: r.get(13).ok(),
                })
            },
        )
        .ok()
    }

    // ── Org Session Logs (Org Scope) ──────────────────────────────────────────

    #[allow(dead_code)]
    pub fn list_org_session_logs(&self, org_id: &str) -> Vec<OrgSessionLogRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, org_id, project_id, session_id, date,
                    agent_name, model, cost_usd, tokens, summary, user_id, created_at
             FROM org_session_logs
             WHERE org_id = ?1
             ORDER BY date DESC, created_at DESC",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([org_id], |r| {
            Ok(OrgSessionLogRow {
                id: r.get(0)?,
                org_id: r.get(1)?,
                project_id: r.get(2)?,
                session_id: r.get(3)?,
                date: r.get(4)?,
                agent_name: r.get(5)?,
                model: r.get(6)?,
                cost_usd: r.get(7)?,
                tokens: r.get(8)?,
                summary: r.get(9)?,
                user_id: r.get(10).ok(),
                created_at: r.get(11)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    #[allow(dead_code)]
    pub fn insert_org_session_log(
        &self,
        id: &str,
        org_id: &str,
        project_id: Option<&str>,
        session_id: Option<&str>,
        date: &str,
        agent_name: &str,
        model: &str,
        cost_usd: f64,
        tokens: i64,
        summary: &str,
    ) -> Result<OrgSessionLogRow, String> {
        let user_id = self.current_user_id();
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO org_session_logs
                (id, org_id, project_id, session_id, date, agent_name, model, cost_usd, tokens, summary, user_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![id, org_id, project_id, session_id, date, agent_name, model, cost_usd, tokens, summary, user_id],
        )
        .map_err(|e| e.to_string())?;
        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM org_session_logs WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(OrgSessionLogRow {
            id: id.to_string(),
            org_id: org_id.to_string(),
            project_id: project_id.map(|s| s.to_string()),
            session_id: session_id.map(|s| s.to_string()),
            date: date.to_string(),
            agent_name: agent_name.to_string(),
            model: model.to_string(),
            cost_usd,
            tokens,
            summary: summary.to_string(),
            user_id,
            created_at,
        })
    }

    #[allow(dead_code)]
    pub fn delete_org_session_log(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM org_session_logs WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── Account Session Logs (Account Scope) ──────────────────────────────────

    #[allow(dead_code)]
    pub fn list_account_session_logs(&self, user_id: &str) -> Vec<AccountSessionLogRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, user_id, file_path, agent_id, session_id, date,
                    agent_name, model, cost_usd, tokens, summary, created_at
             FROM session_logs
             WHERE user_id = ?1
             ORDER BY date DESC, created_at DESC",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([user_id], |r| {
            Ok(AccountSessionLogRow {
                id: r.get(0)?,
                user_id: r.get(1)?,
                file_path: r.get(2)?,
                agent_id: r.get(3)?,
                session_id: r.get(4)?,
                date: r.get(5)?,
                agent_name: r.get(6)?,
                model: r.get(7)?,
                cost_usd: r.get(8)?,
                tokens: r.get(9)?,
                summary: r.get(10)?,
                created_at: r.get(11)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    #[allow(dead_code)]
    pub fn insert_account_session_log(
        &self,
        id: &str,
        user_id: &str,
        file_path: &str,
        agent_id: Option<&str>,
        session_id: Option<&str>,
        date: &str,
        agent_name: &str,
        model: &str,
        cost_usd: f64,
        tokens: i64,
        summary: &str,
    ) -> Result<AccountSessionLogRow, String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO session_logs
                (id, user_id, file_path, agent_id, session_id, date, agent_name, model, cost_usd, tokens, summary)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![id, user_id, file_path, agent_id, session_id, date, agent_name, model, cost_usd, tokens, summary],
        )
        .map_err(|e| e.to_string())?;
        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM session_logs WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(AccountSessionLogRow {
            id: id.to_string(),
            user_id: user_id.to_string(),
            file_path: file_path.to_string(),
            agent_id: agent_id.map(|s| s.to_string()),
            session_id: session_id.map(|s| s.to_string()),
            date: date.to_string(),
            agent_name: agent_name.to_string(),
            model: model.to_string(),
            cost_usd,
            tokens,
            summary: summary.to_string(),
            created_at,
        })
    }

    #[allow(dead_code)]
    pub fn delete_account_session_log(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM session_logs WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── Skill catalog cache (Phase C) ─────────────────────────────────────────

    pub fn upsert_skill_catalog_cache(&self, entry: &CatalogSkillEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO skill_catalog
               (id, name, description, category, tags, github_url, readme, author, stars, synced_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
             ON CONFLICT(name) DO UPDATE SET
               id=excluded.id, description=excluded.description,
               category=excluded.category, tags=excluded.tags,
               github_url=excluded.github_url, readme=excluded.readme,
               author=excluded.author, stars=excluded.stars,
               synced_at=excluded.synced_at",
            rusqlite::params![
                entry.id,
                entry.name,
                entry.description,
                entry.category,
                entry.tags,
                entry.github_url,
                entry.readme,
                entry.author,
                entry.stars,
                entry.synced_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_skill_catalog_cache(&self) -> Vec<CatalogSkillEntry> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, name, description, category, tags, github_url, readme, author, stars, synced_at
             FROM skill_catalog ORDER BY name",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([], |r| {
            Ok(CatalogSkillEntry {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                category: r.get(3)?,
                tags: r.get(4)?,
                github_url: r.get(5)?,
                readme: r.get(6)?,
                author: r.get(7)?,
                stars: r.get(8)?,
                synced_at: r.get(9)?,
            })
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn clear_skill_catalog_cache(&self) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM skill_catalog", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // --- Phase Plugins (Installations) ---

    pub fn record_installed_plugin(
        &self,
        scope: &str,
        scope_id: &str,
        entry: &PluginCacheEntry,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        let id = ulid::Ulid::new().to_string();

        let _ = conn.execute(
            "DELETE FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
            rusqlite::params![scope, scope_id, &entry.id],
        );

        conn.execute(
            "INSERT INTO installed_plugins (
                id, scope, scope_id, plugin_id, version,
                skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids,
                skills_url, agents_url, mcp_url, commands_url, hooks_url, rules_url
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5,
                ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16, ?17, ?18
            )",
            rusqlite::params![
                id,
                scope,
                scope_id,
                &entry.id,
                &entry.version,
                &entry.skill_ids,
                &entry.agent_ids,
                &entry.mcp_ids,
                &entry.command_ids,
                &entry.hook_ids,
                &entry.rule_ids,
                &entry.connector_ids,
                &entry.skills_url.clone().unwrap_or_else(|| "[]".into()),
                &entry.agents_url.clone().unwrap_or_else(|| "[]".into()),
                &entry.mcp_url.clone().unwrap_or_else(|| "[]".into()),
                &entry.commands_url.clone().unwrap_or_else(|| "[]".into()),
                &entry.hooks_url.clone().unwrap_or_else(|| "[]".into()),
                &entry.rules_url
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_installed_plugins(&self, scope: &str, scope_id: &str) -> Vec<WorkspacePlugin> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, scope, scope_id, plugin_id, installed_at, version, skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids
             FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 ORDER BY installed_at DESC",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map(rusqlite::params![scope, scope_id], |r| {
            Ok(WorkspacePlugin {
                id: r.get(0)?,
                scope: r.get(1)?,
                scope_id: r.get(2)?,
                plugin_id: r.get(3)?,
                installed_at: r.get(4)?,
                version: r.get(5)?,
                skill_ids: r.get(6)?,
                agent_ids: r.get(7)?,
                mcp_ids: r.get(8)?,
                command_ids: r.get(9)?,
                hook_ids: r.get(10)?,
                rule_ids: r.get(11)?,
                connector_ids: r.get(12)?,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn remove_installed_plugin(
        &self,
        scope: &str,
        scope_id: &str,
        plugin_id: &str,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
            rusqlite::params![scope, scope_id, plugin_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn is_plugin_installed(&self, scope: &str, scope_id: &str, plugin_id: &str) -> bool {
        let conn = self.0.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM installed_plugins WHERE scope = ?1 AND scope_id = ?2 AND plugin_id = ?3",
                rusqlite::params![scope, scope_id, plugin_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        count > 0
    }
    pub fn upsert_plugin_cache(&self, e: &PluginCacheEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO plugins (id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, agents_url, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, rules_url, rule_ids, connector_auth, featured, synced_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, description=excluded.description, author=excluded.author, version=excluded.version,
               icon_url=excluded.icon_url, docs_url=excluded.docs_url, github_url=excluded.github_url, category=excluded.category,
               scope=excluded.scope, skill_ids=excluded.skill_ids, agent_ids=excluded.agent_ids, agents_url=excluded.agents_url, mcp_ids=excluded.mcp_ids,
               command_ids=excluded.command_ids, hook_ids=excluded.hook_ids, connector_ids=excluded.connector_ids,
               skills_url=excluded.skills_url, commands_url=excluded.commands_url, hooks_url=excluded.hooks_url, mcp_url=excluded.mcp_url,
               rules_url=excluded.rules_url, rule_ids=excluded.rule_ids, connector_auth=excluded.connector_auth, featured=excluded.featured, synced_at=excluded.synced_at",
            rusqlite::params![
                e.id, e.name, e.description, e.author, e.version, e.icon_url, e.docs_url, e.github_url, e.category, e.scope, e.skill_ids, e.agent_ids, e.agents_url, e.mcp_ids, e.command_ids, e.hook_ids, e.connector_ids, e.skills_url, e.commands_url, e.hooks_url, e.mcp_url, e.rules_url, e.rule_ids, e.connector_auth, e.featured as i64, e.synced_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_plugins_cache(&self, category: Option<&str>) -> Vec<PluginCacheEntry> {
        let Ok(conn) = self.0.lock() else { return vec![]; };
        let sql = if category.is_some() {
            "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, agents_url, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at, rules_url, rule_ids FROM plugins WHERE category = ? ORDER BY name"
        } else {
            "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, agents_url, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at, rules_url, rule_ids FROM plugins ORDER BY name"
        };
        let Ok(mut stmt) = conn.prepare(sql) else { return vec![]; };
        let iter = if let Some(c) = category {
            stmt.query_map([c], Self::map_plugin_cache)
        } else {
            stmt.query_map([], Self::map_plugin_cache)
        };
        let Ok(rows) = iter else { return vec![]; };
        rows.filter_map(|r| r.ok()).collect()
    }

    pub fn get_plugin_cache(&self, id: &str) -> Option<PluginCacheEntry> {
        let Ok(conn) = self.0.lock() else { return None; };
        conn.query_row(
            "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, agents_url, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at, rules_url, rule_ids FROM plugins WHERE id = ?1",
            [id],
            Self::map_plugin_cache,
        ).ok()
    }

    pub fn search_plugins_cache(&self, query: &str) -> Vec<PluginCacheEntry> {
        let Ok(conn) = self.0.lock() else { return vec![]; };
        let Ok(mut stmt) = conn.prepare("SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, agents_url, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at, rules_url, rule_ids FROM plugins WHERE name LIKE ?1 OR description LIKE ?1 ORDER BY name") else { return vec![]; };
        let q = format!("%{}%", query);
        let Ok(rows) = stmt.query_map([&q], Self::map_plugin_cache) else { return vec![]; };
        rows.filter_map(|r| r.ok()).collect()
    }

    fn map_plugin_cache(row: &rusqlite::Row) -> rusqlite::Result<PluginCacheEntry> {
        Ok(PluginCacheEntry {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            author: row.get(3)?,
            version: row.get(4)?,
            icon_url: row.get(5)?,
            docs_url: row.get(6)?,
            github_url: row.get(7)?,
            category: row.get(8)?,
            scope: row.get(9)?,
            skill_ids: row.get(10)?,
            agent_ids: row.get(11)?,
            agents_url: row.get(12)?,
            mcp_ids: row.get(13)?,
            command_ids: row.get(14)?,
            hook_ids: row.get(15)?,
            connector_ids: row.get(16)?,
            skills_url: row.get(17)?,
            commands_url: row.get(18)?,
            hooks_url: row.get(19)?,
            mcp_url: row.get(20)?,
            connector_auth: row.get(21)?,
            featured: row.get::<_, i64>(22)? != 0,
            synced_at: row.get(23)?,
            rules_url: row.get(24)?,
            rule_ids: row.get(25)?,
        })
    }

    pub fn upsert_connector_catalog(&self, e: &ConnectorCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO connector_catalog (id, name, description, category, auth_type, oauth_url, api_key_fields, docs_url, icon_url, scope, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, category=excluded.category, auth_type=excluded.auth_type, oauth_url=excluded.oauth_url, api_key_fields=excluded.api_key_fields, docs_url=excluded.docs_url, icon_url=excluded.icon_url, scope=excluded.scope, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.description, e.category, e.auth_type, e.oauth_url, e.api_key_fields, e.docs_url, e.icon_url, e.scope, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_connector_catalog(&self) -> Vec<ConnectorCatalogEntry> {
        let Ok(conn) = self.0.lock() else { return vec![]; };
        let Ok(mut stmt) = conn.prepare("SELECT id, name, description, category, auth_type, oauth_url, api_key_fields, docs_url, icon_url, scope, install_count FROM connector_catalog ORDER BY name") else { return vec![]; };
        let Ok(rows) = stmt.query_map([], |r| {
            Ok(ConnectorCatalogEntry {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                category: r.get(3)?,
                auth_type: r.get(4)?,
                oauth_url: r.get(5)?,
                api_key_fields: r.get(6)?,
                docs_url: r.get(7)?,
                icon_url: r.get(8)?,
                scope: r.get(9)?,
                install_count: r.get(10)?,
                synced_at: None,
                created_at: None,
            })
        }) else { return vec![]; };
        rows.filter_map(|r| r.ok()).collect()
    }

    pub fn upsert_mcp_catalog(&self, e: &McpCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO mcp_catalog (id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, author=excluded.author, category=excluded.category, type=excluded.type, url=excluded.url, command=excluded.command, args=excluded.args, env=excluded.env, required_env_vars=excluded.required_env_vars, github_url=excluded.github_url, icon_url=excluded.icon_url, docs_url=excluded.docs_url, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.description, e.author, e.category, e.r#type, e.url, e.command, e.args, e.env, e.required_env_vars, e.github_url, e.icon_url, e.docs_url, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_mcp_catalog(&self, category: Option<&str>) -> Vec<McpCatalogEntry> {
        let Ok(conn) = self.0.lock() else { return vec![]; };
        let sql = if category.is_some() {
            "SELECT id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count FROM mcp_catalog WHERE category = ? ORDER BY name"
        } else {
            "SELECT id, name, description, author, category, type, url, command, args, env, required_env_vars, github_url, icon_url, docs_url, install_count FROM mcp_catalog ORDER BY name"
        };
        let Ok(mut stmt) = conn.prepare(sql) else { return vec![]; };
        let iter = if let Some(c) = category {
            stmt.query_map([c], Self::map_mcp)
        } else {
            stmt.query_map([], Self::map_mcp)
        };
        let Ok(rows) = iter else { return vec![]; };
        rows.filter_map(|r| r.ok()).collect()
    }

    fn map_mcp(r: &rusqlite::Row) -> rusqlite::Result<McpCatalogEntry> {
        Ok(McpCatalogEntry {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            author: r.get(3)?,
            category: r.get(4)?,
            r#type: r.get(5)?,
            url: r.get(6)?,
            command: r.get(7)?,
            args: r.get(8)?,
            env: r.get(9)?,
            required_env_vars: r.get(10)?,
            github_url: r.get(11)?,
            icon_url: r.get(12)?,
            docs_url: r.get(13)?,
            install_count: r.get(14)?,
            synced_at: None,
            created_at: None,
        })
    }

    pub fn upsert_commands_catalog(&self, e: &CommandsCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO commands_catalog (id, name, slash, description, author, category, github_url, content, icon_url, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET name=excluded.name, slash=excluded.slash, description=excluded.description, author=excluded.author, category=excluded.category, github_url=excluded.github_url, content=excluded.content, icon_url=excluded.icon_url, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.slash, e.description, e.author, e.category, e.github_url, e.content, e.icon_url, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_commands_catalog(&self) -> Vec<CommandsCatalogEntry> {
        let Ok(conn) = self.0.lock() else { return vec![]; };
        let Ok(mut stmt) = conn.prepare("SELECT id, name, slash, description, author, category, github_url, content, icon_url, install_count FROM commands_catalog ORDER BY name") else { return vec![]; };
        let Ok(rows) = stmt.query_map([], |r| {
            Ok(CommandsCatalogEntry {
                id: r.get(0)?,
                name: r.get(1)?,
                slash: r.get(2)?,
                description: r.get(3)?,
                author: r.get(4)?,
                category: r.get(5)?,
                github_url: r.get(6)?,
                content: r.get(7)?,
                icon_url: r.get(8)?,
                install_count: r.get(9)?,
                synced_at: None,
                created_at: None,
            })
        }) else { return vec![]; };
        rows.filter_map(|r| r.ok()).collect()
    }

    pub fn upsert_hooks_catalog(&self, e: &HooksCatalogEntry) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO hooks_catalog (id, name, description, author, hook_type, github_url, content, icon_url, install_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, author=excluded.author, hook_type=excluded.hook_type, github_url=excluded.github_url, content=excluded.content, icon_url=excluded.icon_url, install_count=excluded.install_count",
            rusqlite::params![e.id, e.name, e.description, e.author, e.hook_type, e.github_url, e.content, e.icon_url, e.install_count],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_hooks_catalog(&self, hook_type: Option<&str>) -> Vec<HooksCatalogEntry> {
        let Ok(conn) = self.0.lock() else { return vec![]; };
        let sql = if hook_type.is_some() {
            "SELECT id, name, description, author, hook_type, github_url, content, icon_url, install_count FROM hooks_catalog WHERE hook_type = ? ORDER BY name"
        } else {
            "SELECT id, name, description, author, hook_type, github_url, content, icon_url, install_count FROM hooks_catalog ORDER BY name"
        };
        let Ok(mut stmt) = conn.prepare(sql) else { return vec![]; };
        let iter = if let Some(t) = hook_type {
            stmt.query_map([t], Self::map_hooks)
        } else {
            stmt.query_map([], Self::map_hooks)
        };
        let Ok(rows) = iter else { return vec![]; };
        rows.filter_map(|r| r.ok()).collect()
    }

    fn map_hooks(r: &rusqlite::Row) -> rusqlite::Result<HooksCatalogEntry> {
        Ok(HooksCatalogEntry {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            author: r.get(3)?,
            hook_type: r.get(4)?,
            github_url: r.get(5)?,
            content: r.get(6)?,
            icon_url: r.get(7)?,
            install_count: r.get(8)?,
            synced_at: None,
            created_at: None,
        })
    }

    pub fn get_or_create_machine_id(&self) -> String {
        if let Some(id) = self.get_setting("machine_id") {
            if !id.trim().is_empty() {
                return id;
            }
        }
        let id = ulid::Ulid::new().to_string();
        let _ = self.set_setting("machine_id", &id);
        id
    }

    pub fn list_all_installed_plugins_raw(&self) -> Vec<UserDbInstalledPluginRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, plugin_id, scope, scope_id, installed_at, installed_by, version,
                    skills_url, commands_url, agents_url, hooks_url, rules_url, mcp_url,
                    skill_ids, agent_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids
             FROM installed_plugins ORDER BY installed_at DESC",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([], |r| {
            Ok(UserDbInstalledPluginRow {
                id: r.get(0)?,
                plugin_id: r.get(1)?,
                scope: r.get(2)?,
                scope_id: r.get(3)?,
                installed_at: r.get(4)?,
                installed_by: r.get(5)?,
                version: r.get(6)?,
                skills_url: r.get(7)?,
                commands_url: r.get(8)?,
                agents_url: r.get(9)?,
                hooks_url: r.get(10)?,
                rules_url: r.get(11)?,
                mcp_url: r.get(12)?,
                skill_ids: r.get(13)?,
                agent_ids: r.get(14)?,
                mcp_ids: r.get(15)?,
                command_ids: r.get(16)?,
                hook_ids: r.get(17)?,
                rule_ids: r.get(18)?,
                connector_ids: r.get(19)?,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn get_session_for_userdb(&self, session_id: &str) -> Option<UserDbSessionRow> {
        let machine_id = self.get_or_create_machine_id();
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT
                sh.session_id,
                COALESCE(sh.project_id, w.project_id, 'proj_default'),
                sh.cli,
                sh.label,
                CAST(sh.job_id AS TEXT),
                sh.tokens_prompt,
                sh.tokens_completion,
                sh.tokens_reasoning,
                sh.cost_usd,
                sh.model,
                sh.provider,
                sh.last_output,
                sh.agent_id,
                sh.user_id,
                sh.rate_prompt_per_1m,
                sh.rate_cached_per_1m,
                sh.rate_completion_per_1m,
                sh.rate_reasoning_per_1m,
                sh.started_at,
                sh.ended_at,
                CAST(sh.workspace_id AS TEXT)
             FROM session_history sh
             LEFT JOIN workspaces w ON sh.workspace_id = w.id
             WHERE sh.session_id = ?1",
            [session_id],
            |r| {
                Ok(UserDbSessionRow {
                    id: r.get(0)?,
                    workspace_id: r.get(20).ok(),
                    project_id: r.get(1)?,
                    session_id: r.get(0)?,
                    cli: r.get(2)?,
                    label: r.get(3)?,
                    job_id: r.get(4)?,
                    tokens_prompt: r.get(5)?,
                    tokens_completion: r.get(6)?,
                    tokens_reasoning: r.get(7)?,
                    cost_usd: r.get(8)?,
                    model: r.get(9)?,
                    provider: r.get(10)?,
                    last_output: r.get(11)?,
                    agent_id: r.get(12)?,
                    user_id: r.get(13)?,
                    rate_prompt_per_1m: r.get(14)?,
                    rate_cached_per_1m: r.get(15)?,
                    rate_completion_per_1m: r.get(16)?,
                    rate_reasoning_per_1m: r.get(17)?,
                    machine_id: Some(machine_id),
                    started_at: r.get(18)?,
                    ended_at: r.get(19)?,
                })
            },
        ).ok()
    }

    pub fn list_all_sessions_for_userdb(&self) -> Vec<UserDbSessionRow> {
        let machine_id = self.get_or_create_machine_id();
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT
                sh.session_id,
                COALESCE(sh.project_id, w.project_id, 'proj_default'),
                sh.cli,
                sh.label,
                CAST(sh.job_id AS TEXT),
                sh.tokens_prompt,
                sh.tokens_completion,
                sh.tokens_reasoning,
                sh.cost_usd,
                sh.model,
                sh.provider,
                sh.last_output,
                sh.agent_id,
                sh.user_id,
                sh.rate_prompt_per_1m,
                sh.rate_cached_per_1m,
                sh.rate_completion_per_1m,
                sh.rate_reasoning_per_1m,
                sh.started_at,
                sh.ended_at,
                CAST(sh.workspace_id AS TEXT)
             FROM session_history sh
             LEFT JOIN workspaces w ON sh.workspace_id = w.id
             ORDER BY sh.started_at DESC",
        ) else {
            return Vec::new();
        };
        let m_id = machine_id.clone();
        let rows = stmt.query_map([], move |r| {
            Ok(UserDbSessionRow {
                id: r.get(0)?,
                workspace_id: r.get(20).ok(),
                project_id: r.get(1)?,
                session_id: r.get(0)?,
                cli: r.get(2)?,
                label: r.get(3)?,
                job_id: r.get(4)?,
                tokens_prompt: r.get(5)?,
                tokens_completion: r.get(6)?,
                tokens_reasoning: r.get(7)?,
                cost_usd: r.get(8)?,
                model: r.get(9)?,
                provider: r.get(10)?,
                last_output: r.get(11)?,
                agent_id: r.get(12)?,
                user_id: r.get(13)?,
                rate_prompt_per_1m: r.get(14)?,
                rate_cached_per_1m: r.get(15)?,
                rate_completion_per_1m: r.get(16)?,
                rate_reasoning_per_1m: r.get(17)?,
                machine_id: Some(m_id.clone()),
                started_at: r.get(18)?,
                ended_at: r.get(19)?,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn delete_local_session_history(&self, session_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM session_history WHERE session_id = ?1", [session_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_chat_session_for_userdb(&self, session_id: &str) -> Option<UserDbChatSessionRow> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT
                id, project_id, name, is_star,
                tokens_prompt, tokens_completion, tokens_reasoning, cost_usd,
                model, provider, agent_id, user_id,
                rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m,
                created_at, updated_at,
                CAST(workspace_id AS TEXT)
             FROM chat_sessions
             WHERE id = ?1",
            [session_id],
            |r| {
                Ok(UserDbChatSessionRow {
                    id: r.get(0)?,
                    workspace_id: r.get(18).ok(),
                    project_id: r.get(1)?,
                    name: r.get(2)?,
                    is_star: r.get(3)?,
                    tokens_prompt: r.get(4)?,
                    tokens_completion: r.get(5)?,
                    tokens_reasoning: r.get(6)?,
                    cost_usd: r.get(7)?,
                    model: r.get(8)?,
                    provider: r.get(9)?,
                    agent_id: r.get(10)?,
                    user_id: r.get(11)?,
                    rate_prompt_per_1m: r.get(12)?,
                    rate_cached_per_1m: r.get(13)?,
                    rate_completion_per_1m: r.get(14)?,
                    rate_reasoning_per_1m: r.get(15)?,
                    created_at: r.get(16)?,
                    updated_at: r.get(17)?,
                })
            },
        ).ok()
    }

    pub fn list_all_chat_sessions_for_userdb(&self) -> Vec<UserDbChatSessionRow> {
        let conn = self.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT
                id, project_id, name, is_star,
                tokens_prompt, tokens_completion, tokens_reasoning, cost_usd,
                model, provider, agent_id, user_id,
                rate_prompt_per_1m, rate_cached_per_1m, rate_completion_per_1m, rate_reasoning_per_1m,
                created_at, updated_at,
                CAST(workspace_id AS TEXT)
             FROM chat_sessions
             ORDER BY updated_at DESC",
        ) else {
            return Vec::new();
        };
        let rows = stmt.query_map([], |r| {
            Ok(UserDbChatSessionRow {
                id: r.get(0)?,
                workspace_id: r.get(18).ok(),
                project_id: r.get(1)?,
                name: r.get(2)?,
                is_star: r.get(3)?,
                tokens_prompt: r.get(4)?,
                tokens_completion: r.get(5)?,
                tokens_reasoning: r.get(6)?,
                cost_usd: r.get(7)?,
                model: r.get(8)?,
                provider: r.get(9)?,
                agent_id: r.get(10)?,
                user_id: r.get(11)?,
                rate_prompt_per_1m: r.get(12)?,
                rate_cached_per_1m: r.get(13)?,
                rate_completion_per_1m: r.get(14)?,
                rate_reasoning_per_1m: r.get(15)?,
                created_at: r.get(16)?,
                updated_at: r.get(17)?,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn delete_local_chat_session(&self, session_id: &str) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM chat_sessions WHERE id = ?1", [session_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_userdb_config_row(&self, user_id: &str) -> Option<UserDbConfigRow> {
        let conn = self.0.lock().unwrap();
        if !user_id.is_empty() {
            if let Ok(row) = conn.query_row(
                "SELECT user_id, url, token_encrypted, off_platform, created_at, updated_at FROM userdb WHERE user_id = ?1",
                [user_id],
                |r| {
                    Ok(UserDbConfigRow {
                        user_id: r.get(0)?,
                        url: r.get(1)?,
                        token_encrypted: r.get(2)?,
                        off_platform: r.get(3)?,
                        created_at: r.get(4)?,
                        updated_at: r.get(5)?,
                    })
                },
            ) {
                return Some(row);
            }
        }

        conn.query_row(
            "SELECT user_id, url, token_encrypted, off_platform, created_at, updated_at FROM userdb ORDER BY updated_at DESC LIMIT 1",
            [],
            |r| {
                Ok(UserDbConfigRow {
                    user_id: r.get(0)?,
                    url: r.get(1)?,
                    token_encrypted: r.get(2)?,
                    off_platform: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            },
        ).ok()
    }

    pub fn upsert_userdb_config_row(
        &self,
        user_id: &str,
        url: &str,
        token_encrypted: &str,
        off_platform: i64,
    ) -> Result<(), String> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO userdb (user_id, url, token_encrypted, off_platform, updated_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))
             ON CONFLICT(user_id) DO UPDATE SET
                url = excluded.url,
                token_encrypted = excluded.token_encrypted,
                off_platform = excluded.off_platform,
                updated_at = excluded.updated_at",
            rusqlite::params![user_id, url, token_encrypted, off_platform],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserDbConfigRow {
    pub user_id: String,
    pub url: String,
    pub token_encrypted: String,
    pub off_platform: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserDbSessionRow {
    pub id: String,
    pub workspace_id: Option<String>,
    pub project_id: String,
    pub session_id: String,
    pub cli: String,
    pub label: Option<String>,
    pub job_id: Option<String>,
    pub tokens_prompt: i64,
    pub tokens_completion: i64,
    pub tokens_reasoning: i64,
    pub cost_usd: f64,
    pub model: String,
    pub provider: String,
    pub last_output: String,
    pub agent_id: Option<String>,
    pub user_id: Option<String>,
    pub rate_prompt_per_1m: f64,
    pub rate_cached_per_1m: f64,
    pub rate_completion_per_1m: f64,
    pub rate_reasoning_per_1m: f64,
    pub machine_id: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserDbChatSessionRow {
    pub id: String,
    pub workspace_id: Option<String>,
    pub project_id: String,
    pub name: Option<String>,
    pub is_star: i64,
    pub tokens_prompt: i64,
    pub tokens_completion: i64,
    pub tokens_reasoning: i64,
    pub cost_usd: f64,
    pub model: String,
    pub provider: String,
    pub agent_id: Option<String>,
    pub user_id: Option<String>,
    pub rate_prompt_per_1m: f64,
    pub rate_cached_per_1m: f64,
    pub rate_completion_per_1m: f64,
    pub rate_reasoning_per_1m: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserDbInstalledPluginRow {
    pub id: String,
    pub plugin_id: String,
    pub scope: String,
    pub scope_id: String,
    pub installed_at: String,
    pub installed_by: String,
    pub version: String,
    pub skills_url: String,
    pub commands_url: String,
    pub agents_url: String,
    pub hooks_url: String,
    pub rules_url: String,
    pub mcp_url: String,
    pub skill_ids: String,
    pub agent_ids: String,
    pub mcp_ids: String,
    pub command_ids: String,
    pub hook_ids: String,
    pub rule_ids: String,
    pub connector_ids: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PluginCacheEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
    pub github_url: Option<String>,
    pub category: String,
    pub scope: String,
    pub skill_ids: String,
    pub agent_ids: String,
    pub agents_url: Option<String>,
    pub mcp_ids: String,
    pub command_ids: String,
    pub hook_ids: String,
    pub connector_ids: String,
    pub skills_url: Option<String>,
    pub commands_url: Option<String>,
    pub hooks_url: Option<String>,
    pub mcp_url: Option<String>,
    pub rules_url: Option<String>,
    pub rule_ids: String,
    pub connector_auth: String,
    pub featured: bool,
    pub synced_at: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub auth_type: String,
    pub oauth_url: Option<String>,
    pub api_key_fields: String,
    pub docs_url: Option<String>,
    pub icon_url: Option<String>,
    pub scope: String,
    pub install_count: i64,
    pub synced_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct McpCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub r#type: String,
    pub url: Option<String>,
    pub command: Option<String>,
    pub args: String,
    pub env: String,
    pub required_env_vars: String,
    pub github_url: Option<String>,
    pub icon_url: Option<String>,
    pub docs_url: Option<String>,
    pub install_count: i64,
    pub synced_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandsCatalogEntry {
    pub id: String,
    pub name: String,
    pub slash: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub github_url: String,
    pub content: Option<String>,
    pub icon_url: Option<String>,
    pub install_count: i64,
    pub synced_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HooksCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub hook_type: String,
    pub github_url: String,
    pub content: Option<String>,
    pub icon_url: Option<String>,
    pub install_count: i64,
    pub synced_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePlugin {
    pub id: String,
    pub scope: String,
    pub scope_id: String,
    pub plugin_id: String,
    pub installed_at: String,
    pub version: String,
    pub skill_ids: String,
    pub agent_ids: String,
    pub mcp_ids: String,
    pub command_ids: String,
    pub hook_ids: String,
    pub rule_ids: String,
    pub connector_ids: String,
}

