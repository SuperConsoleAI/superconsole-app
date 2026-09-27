// src-tauri/src/commands/team.rs
use crate::AppState;
use aws_config::BehaviorVersion;
use aws_sdk_sesv2::config::Region;
use aws_sdk_sesv2::types::{Body, Content, Destination, EmailContent, Message};
use aws_sdk_sesv2::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
pub struct InvitePayload {
    email: String,
    role: String,
    app_access: String,
}

#[tauri::command]
pub async fn invite_member(
    state: State<'_, Arc<AppState>>,
    email: String,
    role: String,
    _app_access: String, // JSON array string
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;

    // Check if current user is owner or admin
    let rbac = crate::rbac::get_user_access(&state, &profile_id).await?;
    if rbac.role != "owner" && rbac.role != "admin" {
        return Err("Only owners and admins can invite members.".to_string());
    }

    // Insert into Central DB (team_invites)
    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;

    let token = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    let auth_info = crate::commands::auth::auth_status_native(&state).await
        .map_err(|_| "Not authenticated".to_string())?
        .ok_or_else(|| "Not authenticated".to_string())?;
    let inviter_user_id = auth_info.user.id;

    // Read plan from license status

    let plan = {
        let lic = state.license.read().await;
        lic.plan.clone()
    };

    let max_members = match plan.to_uppercase().as_str() {
        "BUSINESS" => 10,
        "PRO" => 3,
        _ => 0, // FREE and Basic allow 0 extra team members
    };

    if max_members > 0 {
        let user_db = state.require_user_db().await?;
        let uconn = user_db.conn().map_err(|e| e.to_string())?;

        let mut members_count = 0;
        // Count unique users across all profiles in this organization (excluding the owner)
        if let Ok(mut rows) = uconn
            .query(
                "SELECT COUNT(DISTINCT user_id) FROM team_access WHERE role != 'owner'",
                crate::turso_params![],
            )
            .await
        {
            if let Ok(Some(row)) = rows.next().await {
                members_count = row.get::<i64>(0).unwrap_or(0);
            }
        }

        // Get all profile IDs in this org to check central DB invites
        let mut profile_ids = vec![];
        if let Ok(mut rows) = uconn
            .query("SELECT id FROM profiles", crate::turso_params![])
            .await
        {
            while let Ok(Some(row)) = rows.next().await {
                if let Ok(pid) = row.get::<String>(0) {
                    profile_ids.push(pid);
                }
            }
        }

        let mut invites_count = 0;
        if !profile_ids.is_empty() {
            let placeholders = (1..=profile_ids.len())
                .map(|i| format!("?{}", i))
                .collect::<Vec<_>>()
                .join(", ");
            let invites_query = format!(
                "SELECT COUNT(DISTINCT email) FROM team_invites WHERE team_id IN ({}) AND status = 'pending'",
                placeholders
            );
            let params: Vec<crate::db::turso::TursoParam> = profile_ids
                .iter()
                .map(|id| crate::db::turso::TursoParam::Text(id.clone()))
                .collect();
            if let Ok(mut rows) = conn.query(&invites_query, params).await {
                if let Ok(Some(row)) = rows.next().await {
                    invites_count = row.get::<i64>(0).unwrap_or(0);
                }
            }
        }

        if (members_count + invites_count) >= max_members {
            return Err(format!(
                "Plan limit reached: You can only invite up to {} unique team members across all profiles on your current plan.",
                max_members
            ));
        }
    } else {
        return Err("Plan limit reached: Your current plan does not support team members. Please upgrade to Pro or Business.".to_string());
    }

    conn.execute(
        "INSERT INTO team_invites (id, team_id, email, role, app_access, status, token, invited_by, expires_at, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8, ?9, ?10)",
        crate::turso_params![
            Uuid::new_v4().to_string(),
            profile_id.clone(),
            email.clone(),
            role.clone(),
            _app_access,
            token.clone(),
            inviter_user_id,
            now + (7 * 24 * 60 * 60), // 7 days expiration
            now,
            now
        ]
    ).await.map_err(|e| format!("Failed to create invite: {}", e))?;

    // Get the workspace name
    let mut workspace_name = "a BusinessKit".to_string();
    if let Ok(mut rows) = conn
        .query(
            "SELECT title FROM profiles WHERE id = ?1",
            crate::turso_params![profile_id.clone()],
        )
        .await
    {
        if let Ok(Some(row)) = rows.next().await {
            if let Ok(title) = row.get::<String>(0) {
                if !title.trim().is_empty() {
                    workspace_name = title;
                }
            }
        }
    }

    // Send email via AWS SES
    let region = option_env!("SES_REGION")
        .or(option_env!("AWS_REGION"))
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| std::env::var("SES_REGION").ok().filter(|s| !s.is_empty()))
        .or_else(|| std::env::var("AWS_REGION").ok().filter(|s| !s.is_empty()))
        .unwrap_or_else(|| "us-east-1".to_string());

    let from_email = option_env!("SES_FROM_EMAIL")
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| std::env::var("SES_FROM_EMAIL").ok().filter(|s| !s.is_empty()))
        .unwrap_or_else(|| "orders@customers.businesskit.io".to_string());

    let access_key = option_env!("SES_ACCESS_KEY")
        .or(option_env!("AWS_ACCESS_KEY_ID"))
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| std::env::var("SES_ACCESS_KEY").ok().filter(|s| !s.is_empty()))
        .or_else(|| std::env::var("AWS_ACCESS_KEY_ID").ok().filter(|s| !s.is_empty()));

    let secret_key = option_env!("SES_SECRET_KEY")
        .or(option_env!("AWS_SECRET_ACCESS_KEY"))
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| std::env::var("SES_SECRET_KEY").ok().filter(|s| !s.is_empty()))
        .or_else(|| std::env::var("AWS_SECRET_ACCESS_KEY").ok().filter(|s| !s.is_empty()));

    let (ak, sk) = match (access_key, secret_key) {
        (Some(ak), Some(sk)) if !ak.trim().is_empty() && !sk.trim().is_empty() => (ak, sk),
        _ => {
            return Err("AWS SES email credentials are not configured. Please ensure SES_ACCESS_KEY and SES_SECRET_KEY are set in your build configuration or environment.".to_string());
        }
    };

    let credentials = aws_sdk_sesv2::config::Credentials::new(
        ak,
        sk,
        None,
        None,
        "businesskit_static",
    );

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(region))
        .credentials_provider(credentials)
        .load()
        .await;

    let client = Client::new(&config);

    let subject = format!("You've been invited to join {}", workspace_name);
    let body_html = format!(
        "<h1>You've been invited!</h1><p>You have been invited to join the <strong>{}</strong> workspace as a <strong>{}</strong>.</p><p><a href=\"https://businesskit.io/invite?token={}\">Click here to accept the invitation</a></p><p><small>If the link above doesn't work, copy and paste this into your browser: https://businesskit.io/invite?token={}</small></p>",
        workspace_name, role, token, token
    );

    client
        .send_email()
        .from_email_address(from_email)
        .destination(Destination::builder().to_addresses(email).build())
        .content(
            EmailContent::builder()
                .simple(
                    Message::builder()
                        .subject(
                            Content::builder()
                                .data(subject)
                                .charset("UTF-8")
                                .build()
                                .map_err(|e| e.to_string())?,
                        )
                        .body(
                            Body::builder()
                                .html(
                                    Content::builder()
                                        .data(body_html)
                                        .charset("UTF-8")
                                        .build()
                                        .map_err(|e| e.to_string())?,
                                )
                                .build(),
                        )
                        .build(),
                )
                .build(),
        )
        .send()
        .await
        .map_err(|e| format!("Failed to send email via SES: {:?}", e))?;

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct TeamMemberRow {
    pub id: String,
    pub user_id: String,
    pub email: String,
    pub role: String,
    pub app_access: String,
    pub created_at: i64,
}

#[tauri::command]
pub async fn get_team_members(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TeamMemberRow>, String> {
    let profile_id = state.require_profile().await?;

    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT m.id, m.user_id, u.email, m.role, m.app_access, m.created_at 
         FROM team_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.team_id = ?1 AND m.status = 'accepted'
         ORDER BY m.created_at ASC",
        crate::turso_params![profile_id.clone()]
    ).await.map_err(|e| e.to_string())?;

    let mut members = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        members.push(TeamMemberRow {
            id: row.get(0).unwrap_or_default(),
            user_id: row.get(1).unwrap_or_default(),
            email: row.get(2).unwrap_or_default(),
            role: row.get(3).unwrap_or_default(),
            app_access: row.get(4).unwrap_or_default(),
            created_at: row.get(5).unwrap_or_default(),
        });
    }

    Ok(members)
}

#[tauri::command]
pub async fn update_team_member(
    state: State<'_, Arc<AppState>>,
    member_id: String,
    role: String,
    app_access: String,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;

    let rbac = crate::rbac::get_user_access(&state, &profile_id).await?;
    if rbac.role != "owner" && rbac.role != "admin" {
        return Err("Only owners and admins can update members.".to_string());
    }

    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;
    
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE team_members SET role = ?1, app_access = ?2, updated_at = ?3 WHERE id = ?4 AND team_id = ?5",
        crate::turso_params![role.clone(), app_access.clone(), now, member_id.clone(), profile_id.clone()]
    ).await.map_err(|e| e.to_string())?;

    // Also update local UserDB
    if let Ok(db) = state.require_user_db().await {
        if let Ok(uconn) = db.conn() {
            // First get the user_id for this member_id
            if let Ok(mut rows) = conn.query("SELECT user_id FROM team_members WHERE id = ?1", crate::turso_params![member_id]).await {
                if let Ok(Some(row)) = rows.next().await {
                    if let Ok(user_id) = row.get::<String>(0) {
                        let _ = uconn.execute(
                            "UPDATE team_access SET role = ?1, app_access = ?2 WHERE user_id = ?3",
                            crate::turso_params![role, app_access, user_id]
                        ).await;
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_team_member(
    state: State<'_, Arc<AppState>>,
    member_id: String,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;

    let rbac = crate::rbac::get_user_access(&state, &profile_id).await?;
    if rbac.role != "owner" && rbac.role != "admin" {
        return Err("Only owners and admins can remove members.".to_string());
    }

    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;
    
    // First get the user_id
    let mut target_user_id = None;
    if let Ok(mut rows) = conn.query("SELECT user_id FROM team_members WHERE id = ?1 AND team_id = ?2", crate::turso_params![member_id.clone(), profile_id.clone()]).await {
        if let Ok(Some(row)) = rows.next().await {
            if let Ok(uid) = row.get::<String>(0) {
                target_user_id = Some(uid);
            }
        }
    }

    conn.execute(
        "DELETE FROM team_members WHERE id = ?1 AND team_id = ?2",
        crate::turso_params![member_id, profile_id]
    ).await.map_err(|e| e.to_string())?;

    // Also remove from local UserDB
    if let Some(uid) = target_user_id {
        if let Ok(db) = state.require_user_db().await {
            if let Ok(uconn) = db.conn() {
                let _ = uconn.execute(
                    "DELETE FROM team_access WHERE user_id = ?1",
                    crate::turso_params![uid]
                ).await;
            }
        }
    }

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct TeamInviteRow {
    pub id: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub token: String,
    pub expires_at: i64,
    pub created_at: i64,
}

#[tauri::command]
pub async fn get_pending_invites(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TeamInviteRow>, String> {
    let profile_id = state.require_profile().await?;

    // Check if current user is owner or admin
    let rbac = crate::rbac::get_user_access(&state, &profile_id).await?;
    if rbac.role != "owner" && rbac.role != "admin" {
        return Err("Only owners and admins can view invites.".to_string());
    }

    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, email, role, status, token, expires_at, created_at FROM team_invites WHERE team_id = ?1 AND status = 'pending' ORDER BY created_at DESC",
        crate::turso_params![profile_id.clone()]
    ).await.map_err(|e| e.to_string())?;

    let mut invites = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        invites.push(TeamInviteRow {
            id: row.get(0).unwrap_or_default(),
            email: row.get(1).unwrap_or_default(),
            role: row.get(2).unwrap_or_default(),
            status: row.get(3).unwrap_or_default(),
            token: row.get(4).unwrap_or_default(),
            expires_at: row.get(5).unwrap_or_default(),
            created_at: row.get(6).unwrap_or_default(),
        });
    }

    Ok(invites)
}

#[tauri::command]
pub async fn delete_invite(
    state: State<'_, Arc<AppState>>,
    invite_id: String,
) -> Result<(), String> {
    let profile_id = state.require_profile().await?;

    // Check if current user is owner or admin
    let rbac = crate::rbac::get_user_access(&state, &profile_id).await?;
    if rbac.role != "owner" && rbac.role != "admin" {
        return Err("Only owners and admins can delete invites.".to_string());
    }

    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM team_invites WHERE id = ?1 AND team_id = ?2",
        crate::turso_params![invite_id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct MyPendingInvite {
    pub id: String,
    pub team_id: String,
    pub team_name: String,
    pub role: String,
    pub app_access: String,
    pub invited_by: String,
    pub created_at: i64,
}

#[tauri::command]
pub async fn get_my_pending_invites(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<MyPendingInvite>, String> {
    // 1. We just need to know the currently authenticated user's email.
    // Instead of querying WorkOS again, let's load it from the central DB users table using `license::load_cached_user_id()`.
    let user_id =
        crate::license::load_cached_user_id().ok_or_else(|| "Not logged in".to_string())?;

    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT email FROM users WHERE id = ?1",
            crate::turso_params![user_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    let email = if let Ok(Some(row)) = rows.next().await {
        row.get::<String>(0).unwrap_or_default()
    } else {
        return Err("User not found".to_string());
    };

    if email.is_empty() {
        return Ok(Vec::new());
    }

    let mut rows = conn
        .query(
            "SELECT i.id, i.team_id, p.title, i.role, i.app_access, i.invited_by, i.created_at 
         FROM team_invites i
         LEFT JOIN profiles p ON p.id = i.team_id
         WHERE i.email = ?1 AND i.status = 'pending' ORDER BY i.created_at DESC",
            crate::turso_params![email],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut invites = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        invites.push(MyPendingInvite {
            id: row.get(0).unwrap_or_default(),
            team_id: row.get(1).unwrap_or_default(),
            team_name: row
                .get(2)
                .unwrap_or_else(|_| "Unknown Workspace".to_string()),
            role: row.get(3).unwrap_or_default(),
            app_access: row.get(4).unwrap_or_default(),
            invited_by: row.get(5).unwrap_or_default(),
            created_at: row.get(6).unwrap_or_default(),
        });
    }

    Ok(invites)
}

#[tauri::command]
pub async fn accept_my_invite(
    state: State<'_, Arc<AppState>>,
    invite_id: String,
) -> Result<(), String> {
    let user_id =
        crate::license::load_cached_user_id().ok_or_else(|| "Not logged in".to_string())?;

    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT email FROM users WHERE id = ?1",
            crate::turso_params![user_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    let email = if let Ok(Some(row)) = rows.next().await {
        row.get::<String>(0).unwrap_or_default()
    } else {
        return Err("User not found".to_string());
    };

    if email.is_empty() {
        return Err("User has no email".to_string());
    }

    let mut rows = conn.query(
        "SELECT team_id, role, app_access, invited_by FROM team_invites WHERE id = ?1 AND email = ?2 AND status = 'pending'",
        crate::turso_params![invite_id.clone(), email]
    ).await.map_err(|e| e.to_string())?;

    let (team_id, role, app_access, invited_by) = if let Ok(Some(row)) = rows.next().await {
        (
            row.get::<String>(0).unwrap_or_default(),
            row.get::<String>(1).unwrap_or_default(),
            row.get::<String>(2).unwrap_or_else(|_| "[]".to_string()),
            row.get::<String>(3).unwrap_or_default(),
        )
    } else {
        return Err("Invite not found or already processed".to_string());
    };

    let now = chrono::Utc::now().timestamp();

    // Mark as accepted
    conn.execute(
        "UPDATE team_invites SET status = 'accepted', updated_at = ?1 WHERE id = ?2",
        crate::turso_params![now, invite_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Insert into team_members
    conn.execute(
        "INSERT INTO team_members (id, team_id, user_id, role, app_access, invited_by, invited_at, joined_at, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'accepted', ?8, ?8)",
        crate::turso_params![
            uuid::Uuid::new_v4().to_string(),
            team_id,
            user_id,
            role,
            app_access,
            invited_by,
            now, // invited_at fallback
            now  // joined_at
        ]
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitedProfile {
    pub id: String,
    pub user_id: String,
    pub slug: String,
    pub title: String,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
    pub organization_id: Option<String>,
    pub organization_name: String,
    pub role: String,
    pub allocated_plan: Option<String>,
}

#[tauri::command]
pub async fn get_my_invited_profiles(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<InvitedProfile>, String> {
    let auth_info = crate::commands::auth::auth_status_native(&state).await.ok().flatten();
    let cached_uid = crate::license::load_cached_user_id();

    let db = state.cdb().await?;

    let mut users_id = String::new();
    if let Some(ref auth) = auth_info {
        if !auth.user.id.is_empty() && !auth.user.id.starts_with("user_") {
            users_id = auth.user.id.clone();
        } else if let Ok(res_id) = db.get_user_id_by_workos_id(&auth.user.workos_id).await {
            users_id = res_id;
        }
    }

    if users_id.is_empty() {
        if let Some(ref c_id) = cached_uid {
            if c_id.starts_with("user_") {
                if let Ok(res_id) = db.get_user_id_by_workos_id(c_id).await {
                    users_id = res_id;
                }
            } else {
                users_id = c_id.clone();
            }
        }
    }

    if users_id.is_empty() {
        return Ok(Vec::new());
    }

    let conn = db.conn().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT DISTINCT p.id, p.user_id, p.slug, p.title, p.bio, p.avatar_url, p.organization_id,
                    COALESCE(o.name, 'Team Workspace') as org_name, tm.role, p.allocated_plan
             FROM team_members tm
             JOIN profiles p ON p.id = tm.team_id
             LEFT JOIN organizations o ON o.id = p.organization_id
             WHERE tm.user_id = ?1
               AND tm.status = 'accepted'
               AND p.user_id != ?1
             ORDER BY p.created_at ASC",
            crate::turso_params![users_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(InvitedProfile {
            id: row.get(0).unwrap_or_default(),
            user_id: row.get(1).unwrap_or_default(),
            slug: row.get(2).unwrap_or_default(),
            title: row.get(3).unwrap_or_default(),
            bio: row.get(4).ok().flatten(),
            avatar_url: row.get(5).ok().flatten(),
            organization_id: row.get(6).ok().flatten(),
            organization_name: row.get(7).unwrap_or_else(|_| "Team Workspace".to_string()),
            role: row.get(8).unwrap_or_else(|_| "member".to_string()),
            allocated_plan: row.get(9).ok().flatten(),
        });
    }

    Ok(list)
}

#[tauri::command]
pub async fn get_my_owned_profiles(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<InvitedProfile>, String> {
    let auth_info = crate::commands::auth::auth_status_native(&state).await.ok().flatten();
    let cached_uid = crate::license::load_cached_user_id();

    let db = state.cdb().await?;

    let mut users_id = String::new();
    if let Some(ref auth) = auth_info {
        if !auth.user.id.is_empty() && !auth.user.id.starts_with("user_") {
            users_id = auth.user.id.clone();
        } else if let Ok(res_id) = db.get_user_id_by_workos_id(&auth.user.workos_id).await {
            users_id = res_id;
        }
    }

    if users_id.is_empty() {
        if let Some(ref c_id) = cached_uid {
            if c_id.starts_with("user_") {
                if let Ok(res_id) = db.get_user_id_by_workos_id(c_id).await {
                    users_id = res_id;
                }
            } else {
                users_id = c_id.clone();
            }
        }
    }

    if users_id.is_empty() {
        return Ok(Vec::new());
    }

    let conn = db.conn().map_err(|e| e.to_string())?;
    let mut rows = conn
        .query(
            "SELECT DISTINCT p.id, p.user_id, p.slug, p.title, p.bio, p.avatar_url, p.organization_id,
                    COALESCE(o.name, 'Personal') as org_name, 'owner' as role, p.allocated_plan
             FROM profiles p
             LEFT JOIN organizations o ON o.id = p.organization_id
             WHERE p.user_id = ?1
             ORDER BY p.created_at ASC",
            crate::turso_params![users_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        list.push(InvitedProfile {
            id: row.get(0).unwrap_or_default(),
            user_id: row.get(1).unwrap_or_default(),
            slug: row.get(2).unwrap_or_default(),
            title: row.get(3).unwrap_or_default(),
            bio: row.get(4).ok().flatten(),
            avatar_url: row.get(5).ok().flatten(),
            organization_id: row.get(6).ok().flatten(),
            organization_name: row.get(7).unwrap_or_else(|_| "Personal".to_string()),
            role: row.get(8).unwrap_or_else(|_| "owner".to_string()),
            allocated_plan: row.get(9).ok().flatten(),
        });
    }

    Ok(list)
}

