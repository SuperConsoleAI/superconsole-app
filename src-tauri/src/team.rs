// Phase 13 — Team collaboration (desktop).
//
// Org + project membership management against Turso. Pending org invitations
// live in org_invitations and are reconciled to membership by email match on
// login (see auth::accept_pending_invitations). Project members must already be
// org members, so they are added directly (no pending state).
//
// SECURITY / PRODUCTION TODO (same as auth.rs / cloud.rs): this talks to Turso
// directly with the repo-root .env token. Move behind the Cloudflare Worker
// before any distributed build.

use crate::cloud::{self, cell_opt, cell_text, rows, TursoConfig};
use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberView {
    pub user_id: Option<String>,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    /// "active" for accepted members, "invited" for pending invitations.
    pub status: String,
}

const ORG_ROLES: &[&str] = &["owner", "admin", "member"];
const INVITE_ROLES: &[&str] = &["admin", "member"];
const PROJECT_ROLES: &[&str] = &["editor", "viewer"];

fn caller_identity(db: &Db) -> Result<(String, String), String> {
    let json = db
        .get_cloud_identity()
        .ok_or_else(|| "Not signed in".to_string())?;
    let v: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let id = v["user"]["id"].as_str().unwrap_or("").to_string();
    let email = v["user"]["email"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Err("Not signed in".to_string());
    }
    Ok((id, email))
}

/// Idempotent bootstrap so team features work regardless of migration order.
/// Mirrors superconsole-web Drizzle schema (org/project invitations).
pub async fn ensure_invitation_tables(
    client: &reqwest::Client,
    cfg: &TursoConfig,
) -> Result<(), String> {
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS org_invitations (\
            id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL, email TEXT NOT NULL, \
            role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'pending', \
            invited_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_org_email_unq \
         ON org_invitations (org_id, email)",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE TABLE IF NOT EXISTS project_invitations (\
            id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, email TEXT NOT NULL, \
            role TEXT NOT NULL DEFAULT 'viewer', status TEXT NOT NULL DEFAULT 'pending', \
            invited_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
        vec![],
    )
    .await?;
    cloud::turso_execute(
        client,
        cfg,
        "CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_project_email_unq \
         ON project_invitations (project_id, email)",
        vec![],
    )
    .await?;
    Ok(())
}

async fn org_role(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    org_id: &str,
    user_id: &str,
) -> Option<String> {
    let res = cloud::turso_execute(
        client,
        cfg,
        "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
        vec![Some(org_id.to_string()), Some(user_id.to_string())],
    )
    .await
    .ok()?;
    rows(&res).first().map(|r| cell_text(r, 0))
}

// Owner/Admin may manage the team. Returns the caller's role on success.
async fn require_manager(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    org_id: &str,
    caller_id: &str,
) -> Result<String, String> {
    match org_role(client, cfg, org_id, caller_id).await {
        Some(role) if role == "owner" || role == "admin" => Ok(role),
        Some(_) => Err("Only owners and admins can manage the team".to_string()),
        None => Err("Not a member of this organization".to_string()),
    }
}

async fn count_owners(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    org_id: &str,
) -> Result<usize, String> {
    let res = cloud::turso_execute(
        client,
        cfg,
        "SELECT user_id FROM org_members WHERE org_id = ? AND role = 'owner'",
        vec![Some(org_id.to_string())],
    )
    .await?;
    Ok(rows(&res).len())
}

async fn project_org(
    client: &reqwest::Client,
    cfg: &TursoConfig,
    project_id: &str,
) -> Result<String, String> {
    let res = cloud::turso_execute(
        client,
        cfg,
        "SELECT org_id FROM projects WHERE id = ?",
        vec![Some(project_id.to_string())],
    )
    .await?;
    rows(&res)
        .first()
        .map(|r| cell_text(r, 0))
        .ok_or_else(|| "Project not found".to_string())
}

// --- Org members ---

#[tauri::command]
pub async fn list_org_members(app: AppHandle, org_id: String) -> Result<Vec<MemberView>, String> {
    let _caller = {
        let db = app.state::<Db>();
        caller_identity(&db)?
    };
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_invitation_tables(&client, &cfg).await?;

    let members = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT u.id, u.email, u.name, m.role FROM org_members m \
         JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY u.email",
        vec![Some(org_id.clone())],
    )
    .await?;

    let mut out: Vec<MemberView> = rows(&members)
        .iter()
        .map(|row| MemberView {
            user_id: Some(cell_text(row, 0)),
            email: cell_text(row, 1),
            name: cell_opt(row, 2),
            role: cell_text(row, 3),
            status: "active".to_string(),
        })
        .collect();

    let pending = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT email, role FROM org_invitations WHERE org_id = ? AND status = 'pending' ORDER BY email",
        vec![Some(org_id)],
    )
    .await?;
    for row in rows(&pending) {
        out.push(MemberView {
            user_id: None,
            email: cell_text(&row, 0),
            name: None,
            role: cell_text(&row, 1),
            status: "invited".to_string(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn invite_org_member(
    app: AppHandle,
    org_id: String,
    email: String,
    role: String,
) -> Result<(), String> {
    let caller_id = {
        let db = app.state::<Db>();
        caller_identity(&db)?.0
    };
    if !INVITE_ROLES.contains(&role.as_str()) {
        return Err("Role must be admin or member".to_string());
    }
    let email = email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err("Enter a valid email address".to_string());
    }

    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_invitation_tables(&client, &cfg).await?;
    require_manager(&client, &cfg, &org_id, &caller_id).await?;

    // If the user already has an account, add them straight away.
    let existing = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT id FROM users WHERE lower(email) = ?",
        vec![Some(email.clone())],
    )
    .await?;
    if let Some(row) = rows(&existing).first() {
        let uid = cell_text(row, 0);
        let already = org_role(&client, &cfg, &org_id, &uid).await;
        if already.is_some() {
            return Err("This person is already a member".to_string());
        }
        cloud::turso_execute(
            &client,
            &cfg,
            "INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)",
            vec![Some(org_id), Some(uid), Some(role)],
        )
        .await?;
        return Ok(());
    }

    // Otherwise record a pending invitation reconciled on their first login.
    cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO org_invitations (id, org_id, email, role, status, invited_by) \
         VALUES (?, ?, ?, ?, 'pending', ?) \
         ON CONFLICT(org_id, email) DO UPDATE SET role = excluded.role, status = 'pending'",
        vec![
            Some(Ulid::new().to_string()),
            Some(org_id),
            Some(email),
            Some(role),
            Some(caller_id),
        ],
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn update_org_member_role(
    app: AppHandle,
    org_id: String,
    user_id: String,
    role: String,
) -> Result<(), String> {
    let caller_id = {
        let db = app.state::<Db>();
        caller_identity(&db)?.0
    };
    if !ORG_ROLES.contains(&role.as_str()) {
        return Err("Invalid role".to_string());
    }
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let caller_role = require_manager(&client, &cfg, &org_id, &caller_id).await?;

    let target_role = org_role(&client, &cfg, &org_id, &user_id)
        .await
        .ok_or_else(|| "Member not found".to_string())?;

    // Only owners can grant or revoke the owner role.
    if (role == "owner" || target_role == "owner") && caller_role != "owner" {
        return Err("Only an owner can change owner roles".to_string());
    }
    // Never demote the last owner.
    if target_role == "owner" && role != "owner" && count_owners(&client, &cfg, &org_id).await? <= 1
    {
        return Err("An organization must keep at least one owner".to_string());
    }

    cloud::turso_execute(
        &client,
        &cfg,
        "UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?",
        vec![Some(role), Some(org_id), Some(user_id)],
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_org_member(
    app: AppHandle,
    org_id: String,
    user_id: String,
) -> Result<(), String> {
    let caller_id = {
        let db = app.state::<Db>();
        caller_identity(&db)?.0
    };
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let caller_role = require_manager(&client, &cfg, &org_id, &caller_id).await?;

    let target_role = org_role(&client, &cfg, &org_id, &user_id)
        .await
        .ok_or_else(|| "Member not found".to_string())?;
    if target_role == "owner" {
        if caller_role != "owner" {
            return Err("Only an owner can remove an owner".to_string());
        }
        if count_owners(&client, &cfg, &org_id).await? <= 1 {
            return Err("An organization must keep at least one owner".to_string());
        }
    }

    cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM project_members WHERE user_id = ? \
         AND project_id IN (SELECT id FROM projects WHERE org_id = ?)",
        vec![Some(user_id.clone()), Some(org_id.clone())],
    )
    .await?;
    cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM org_members WHERE org_id = ? AND user_id = ?",
        vec![Some(org_id), Some(user_id)],
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn cancel_org_invitation(
    app: AppHandle,
    org_id: String,
    email: String,
) -> Result<(), String> {
    let caller_id = {
        let db = app.state::<Db>();
        caller_identity(&db)?.0
    };
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    ensure_invitation_tables(&client, &cfg).await?;
    require_manager(&client, &cfg, &org_id, &caller_id).await?;
    cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM org_invitations WHERE org_id = ? AND lower(email) = ?",
        vec![Some(org_id), Some(email.trim().to_lowercase())],
    )
    .await?;
    Ok(())
}

// --- Project members ---

#[tauri::command]
pub async fn list_project_members(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<MemberView>, String> {
    {
        let db = app.state::<Db>();
        caller_identity(&db)?;
    }
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let res = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT u.id, u.email, u.name, pm.role FROM project_members pm \
         JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY u.email",
        vec![Some(project_id)],
    )
    .await?;
    Ok(rows(&res)
        .iter()
        .map(|row| MemberView {
            user_id: Some(cell_text(row, 0)),
            email: cell_text(row, 1),
            name: cell_opt(row, 2),
            role: cell_text(row, 3),
            status: "active".to_string(),
        })
        .collect())
}

// Org members of the project's org who are not yet project members.
#[tauri::command]
pub async fn list_addable_project_members(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<MemberView>, String> {
    {
        let db = app.state::<Db>();
        caller_identity(&db)?;
    }
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let org_id = project_org(&client, &cfg, &project_id).await?;
    let res = cloud::turso_execute(
        &client,
        &cfg,
        "SELECT u.id, u.email, u.name, m.role FROM org_members m \
         JOIN users u ON u.id = m.user_id WHERE m.org_id = ? \
         AND u.id NOT IN (SELECT user_id FROM project_members WHERE project_id = ?) \
         ORDER BY u.email",
        vec![Some(org_id), Some(project_id)],
    )
    .await?;
    Ok(rows(&res)
        .iter()
        .map(|row| MemberView {
            user_id: Some(cell_text(row, 0)),
            email: cell_text(row, 1),
            name: cell_opt(row, 2),
            role: cell_text(row, 3),
            status: "active".to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn add_project_member(
    app: AppHandle,
    project_id: String,
    user_id: String,
    role: String,
) -> Result<(), String> {
    let caller_id = {
        let db = app.state::<Db>();
        caller_identity(&db)?.0
    };
    if !PROJECT_ROLES.contains(&role.as_str()) {
        return Err("Role must be editor or viewer".to_string());
    }
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let org_id = project_org(&client, &cfg, &project_id).await?;
    require_manager(&client, &cfg, &org_id, &caller_id).await?;

    if org_role(&client, &cfg, &org_id, &user_id).await.is_none() {
        return Err("User must be a member of the organization first".to_string());
    }

    cloud::turso_execute(
        &client,
        &cfg,
        "INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?) \
         ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role",
        vec![Some(project_id), Some(user_id), Some(role)],
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn update_project_member_role(
    app: AppHandle,
    project_id: String,
    user_id: String,
    role: String,
) -> Result<(), String> {
    let caller_id = {
        let db = app.state::<Db>();
        caller_identity(&db)?.0
    };
    if !PROJECT_ROLES.contains(&role.as_str()) {
        return Err("Role must be editor or viewer".to_string());
    }
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let org_id = project_org(&client, &cfg, &project_id).await?;
    require_manager(&client, &cfg, &org_id, &caller_id).await?;
    cloud::turso_execute(
        &client,
        &cfg,
        "UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?",
        vec![Some(role), Some(project_id), Some(user_id)],
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_project_member(
    app: AppHandle,
    project_id: String,
    user_id: String,
) -> Result<(), String> {
    let caller_id = {
        let db = app.state::<Db>();
        caller_identity(&db)?.0
    };
    let cfg = cloud::turso_config()?;
    let client = reqwest::Client::new();
    let org_id = project_org(&client, &cfg, &project_id).await?;
    require_manager(&client, &cfg, &org_id, &caller_id).await?;
    cloud::turso_execute(
        &client,
        &cfg,
        "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
        vec![Some(project_id), Some(user_id)],
    )
    .await?;
    Ok(())
}
