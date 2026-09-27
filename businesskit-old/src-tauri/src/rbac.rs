use crate::AppState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamAccessRow {
    pub role: String,
    pub app_access: Vec<String>,
}

/// Expose to frontend to know current permissions
#[tauri::command]
pub async fn get_my_access(
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<TeamAccessRow, String> {
    let profile_id = state.require_profile().await?;
    get_user_access(&state, &profile_id).await
}

/// Checks the active user's role and app access for the given profile.
pub async fn get_user_access(state: &AppState, profile_id: &str) -> Result<TeamAccessRow, String> {
    // 1. Get authenticated user
    let auth_info =
        crate::commands::auth::auth_status_native(&state).await?.ok_or_else(|| "Not authenticated".to_string())?;
    let user_id = auth_info.user.id;

    // 2. Check if user is the Owner in Central DB
    let central = state.cdb().await?;
    let conn = central.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT o.owner_user_id 
         FROM organizations o
         JOIN profiles p ON p.organization_id = o.id
         WHERE p.id = ?1",
            crate::turso_params![profile_id.to_string()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = rows.next().await {
        let owner_id: String = row.get(0).unwrap_or_default();
        if owner_id == user_id {
            // Owner has full access to everything
            return Ok(TeamAccessRow {
                role: "owner".to_string(),
                app_access: vec!["*".to_string()],
            });
        }
    }

    // 3. User is not the owner, check team_access in UserDB
    let user_db = state.require_user_db().await?;
    let uconn = user_db.conn().map_err(|e| e.to_string())?;

    let mut urows = uconn
        .query(
            "SELECT role, app_access FROM team_access WHERE profile_id = ?1 AND user_id = ?2",
            crate::turso_params![profile_id.to_string(), user_id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(Some(row)) = urows.next().await {
        let role: String = row.get(0).unwrap_or_else(|_| "viewer".to_string());
        let app_access_json: String = row.get(1).unwrap_or_else(|_| "[]".to_string());

        let app_access: Vec<String> = serde_json::from_str(&app_access_json).unwrap_or_default();

        return Ok(TeamAccessRow { role, app_access });
    }

    // Default to zero access if no record found
    Ok(TeamAccessRow {
        role: "none".to_string(),
        app_access: vec![],
    })
}

/// Helper macro to enforce that the user has at least the required role
/// AND has access to the specific app.
/// Usage: `require_app_access!(state, "shop", "editor")`
#[macro_export]
macro_rules! require_app_access {
    ($state:expr, $app_slug:expr, $min_role:expr) => {{
        let profile_id = $state.require_profile().await?;
        let access = $crate::rbac::get_user_access($state, &profile_id).await?;

        if access.role == "none" {
            return Err("Access denied. You are not a member of this workspace.".to_string());
        }

        // Check app access
        if !access.app_access.contains(&"*".to_string())
            && !access.app_access.contains(&$app_slug.to_string())
        {
            return Err(format!(
                "Access denied. You do not have permission for the '{}' app.",
                $app_slug
            ));
        }

        // Simple role hierarchy: owner > manager > editor > viewer
        let role_val = match access.role.as_str() {
            "owner" => 4,
            "manager" => 3,
            "editor" => 2,
            "viewer" => 1,
            _ => 0,
        };

        let req_val = match $min_role {
            "owner" => 4,
            "manager" => 3,
            "editor" => 2,
            "viewer" => 1,
            _ => 5, // Invalid required role means deny
        };

        if role_val < req_val {
            return Err(format!("Access denied. Requires {} role.", $min_role));
        }

        access
    }};
}
