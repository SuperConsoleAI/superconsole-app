// src-tauri/src/commands/community.rs
//
// WHAT:  Community management commands — spaces, members, posts, events, leaderboard.
//
// HOW:   All queries run against the UserDB community_* tables.
//        No external API calls — the desktop app manages the community data locally
//        then the deployed CF Worker serves it publicly.
//
// FLOW:
//   list_communities → SELECT communities WHERE profile_id = active
//   get_community_members → SELECT community_members WHERE community_id = ? (paginated)
//   list_community_posts → SELECT community_posts WHERE community_id = ? (paginated, filtered)
//   get_community_leaderboard → SELECT community_leaderboard WHERE community_id = ?
//                               ordered by points DESC (trigger-maintained)
//
//   Member approval flow (if community requires approval):
//     member joins → status = "pending" →
//     admin calls approve_member → status = "active"
//
// TABLES TOUCHED:
//   communities              — community spaces (one profile can have many)
//   community_categories     — post category/topic tags
//   community_members        — member roster + roles + points
//   community_posts          — posts within community spaces
//   community_comments       — comments on community posts
//   community_events         — scheduled events + RSVP tracking
//   community_leaderboard    — trigger-maintained rank table
//
// REFERENCE: src/lib/community.ts + src/lib/community-service.ts
//            src/lib/community-triggers.ts (leaderboard triggers)

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityRow {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub cover_image: Option<String>,
    pub is_private: bool,
    pub requires_approval: bool,
    pub member_count: i64,
    pub post_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCommunityData {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub cover_image: Option<String>,
    pub is_private: Option<bool>,
    pub requires_approval: Option<bool>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub user_avatar: Option<String>,
    pub user_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityMemberRow {
    pub id: String,
    pub community_id: String,
    pub profile_id: String,
    pub user_id: Option<String>,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub status: String,
    pub points: i64,
    pub post_count: i64,
    pub joined_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityPostRow {
    pub id: String,
    pub community_id: String,
    pub profile_id: String,
    pub member_id: Option<String>,
    pub category_id: Option<String>,
    pub title: String,
    pub body: Option<String>,
    pub media_urls: String,
    pub post_type: String,
    pub status: String,
    pub is_pinned: bool,
    pub reaction_count: i64,
    pub comment_count: i64,
    pub view_count: i64,
    pub published_at: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub member_first_name: Option<String>,
    pub author_avatar_url: Option<String>,
    pub author_level: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardRow {
    pub id: String,
    pub community_id: String,
    pub member_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub points: i64,
    pub rank: i64,
    pub post_count: i64,
    pub comment_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityEventRow {
    pub id: String,
    pub community_id: String,
    pub profile_id: String,
    pub title: String,
    pub description: Option<String>,
    pub starts_at: i64,
    pub ends_at: Option<i64>,
    pub location: Option<String>,
    pub is_online: bool,
    pub meeting_url: Option<String>,
    pub rsvp_count: i64,
    pub created_at: String,
}

// ── Row extractors (return String error — compatible with command return type) ─

fn community_from_row(row: &crate::db::turso::TursoRow) -> Result<CommunityRow, String> {
    Ok(CommunityRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        profile_id: row.get(1).map_err(|e| e.to_string())?,
        name: row.get(2).map_err(|e| e.to_string())?,
        slug: row.get(3).map_err(|e| e.to_string())?,
        description: row.get(4).map_err(|e| e.to_string())?,
        icon: row.get(5).map_err(|e| e.to_string())?,
        cover_image: row.get(6).map_err(|e| e.to_string())?,
        is_private: row.get::<i64>(7).unwrap_or(0) != 0,
        requires_approval: row.get::<i64>(8).unwrap_or(0) != 0,
        member_count: row.get::<i64>(9).unwrap_or(0),
        post_count: row.get::<i64>(10).unwrap_or(0),
        created_at: row.get(11).map_err(|e| e.to_string())?,
        updated_at: row.get(12).map_err(|e| e.to_string())?,
    })
}

fn member_from_row(row: &crate::db::turso::TursoRow) -> Result<CommunityMemberRow, String> {
    Ok(CommunityMemberRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        community_id: row.get(1).map_err(|e| e.to_string())?,
        profile_id: row.get(2).map_err(|e| e.to_string())?,
        user_id: row.get(3).map_err(|e| e.to_string())?,
        email: row.get(4).map_err(|e| e.to_string())?,
        display_name: row.get(5).map_err(|e| e.to_string())?,
        avatar_url: row.get(6).map_err(|e| e.to_string())?,
        role: row.get(7).map_err(|e| e.to_string())?,
        status: row.get(8).map_err(|e| e.to_string())?,
        points: row.get::<i64>(9).unwrap_or(0),
        post_count: row.get::<i64>(10).unwrap_or(0),
        joined_at: row.get(11).map_err(|e| e.to_string())?,
    })
}

fn community_post_from_row(row: &crate::db::turso::TursoRow) -> Result<CommunityPostRow, String> {
    Ok(CommunityPostRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        community_id: row.get(1).map_err(|e| e.to_string())?,
        profile_id: row.get(2).map_err(|e| e.to_string())?,
        member_id: row.get(3).map_err(|e| e.to_string())?,
        category_id: row.get(4).map_err(|e| e.to_string())?,
        title: row.get(5).map_err(|e| e.to_string())?,
        body: row.get(6).map_err(|e| e.to_string())?,
        media_urls: row.get::<String>(7).unwrap_or_else(|_| "[]".to_string()),
        post_type: row.get(8).map_err(|e| e.to_string())?,
        status: row.get(9).map_err(|e| e.to_string())?,
        is_pinned: row.get::<i64>(10).unwrap_or(0) != 0,
        reaction_count: row.get::<i64>(11).unwrap_or(0),
        comment_count: row.get::<i64>(12).unwrap_or(0),
        view_count: row.get::<i64>(13).unwrap_or(0),
        published_at: row.get(14).map_err(|e| e.to_string())?,
        created_at: row.get(15).map_err(|e| e.to_string())?,
        updated_at: row.get(16).map_err(|e| e.to_string())?,
        member_first_name: row.get(17).unwrap_or(None),
        author_avatar_url: row.get(18).unwrap_or(None),
        author_level: row.get(19).unwrap_or(Some(1)),
    })
}

fn leaderboard_from_row(row: &crate::db::turso::TursoRow) -> Result<LeaderboardRow, String> {
    Ok(LeaderboardRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        community_id: row.get(1).map_err(|e| e.to_string())?,
        member_id: row.get(2).map_err(|e| e.to_string())?,
        display_name: row.get(3).map_err(|e| e.to_string())?,
        avatar_url: row.get(4).map_err(|e| e.to_string())?,
        points: row.get::<i64>(5).unwrap_or(0),
        rank: row.get::<i64>(6).unwrap_or(0),
        post_count: row.get::<i64>(7).unwrap_or(0),
        comment_count: row.get::<i64>(8).unwrap_or(0),
        updated_at: row.get(9).map_err(|e| e.to_string())?,
    })
}

fn event_from_row(row: &crate::db::turso::TursoRow) -> Result<CommunityEventRow, String> {
    Ok(CommunityEventRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        community_id: row.get(1).map_err(|e| e.to_string())?,
        profile_id: row.get(2).map_err(|e| e.to_string())?,
        title: row.get(3).map_err(|e| e.to_string())?,
        description: row.get(4).map_err(|e| e.to_string())?,
        starts_at: row.get(5).map_err(|e| e.to_string())?,
        ends_at: row.get(6).map_err(|e| e.to_string())?,
        location: row.get(7).map_err(|e| e.to_string())?,
        is_online: row.get::<i64>(8).unwrap_or(0) != 0,
        meeting_url: row.get(9).map_err(|e| e.to_string())?,
        rsvp_count: row.get::<i64>(10).unwrap_or(0),
        created_at: row.get(11).map_err(|e| e.to_string())?,
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// List all community spaces for the active profile.
#[tauri::command]
pub async fn list_communities(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CommunityRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, profile_id, title as name, slug, description, logo_url as icon, cover_image_url as cover_image,
                (access_type = 'invite_only' OR access_type = 'application') as is_private,
                (is_public = 0) as requires_approval,
                (SELECT COUNT(*) FROM community_members WHERE community_id = communities.id) as member_count,
                (SELECT COUNT(*) FROM community_posts WHERE community_id = communities.id) as post_count,
                created_at, updated_at
         FROM communities WHERE profile_id = ?1 ORDER BY created_at DESC",
        crate::turso_params![profile_id],
    ).await.map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(community_from_row(&row)?);
    }
    Ok(items)
}

/// Create a new community space.
#[tauri::command]
pub async fn create_community(
    data: CreateCommunityData,
    state: State<'_, Arc<AppState>>,
) -> Result<CommunityRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO communities
           (id, profile_id, title, slug, description, logo_url, cover_image_url,
            access_type, is_public)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        crate::turso_params![
            id.clone(),
            profile_id.clone(),
            data.name,
            data.slug,
            data.description,
            data.icon,
            data.cover_image,
            if data.is_private.unwrap_or(false) {
                "invite_only"
            } else {
                "free"
            },
            if data.requires_approval.unwrap_or(false) {
                0
            } else {
                1
            }
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    // Seed default categories
    let presets = vec![
        ("Announcements", "announcements", "📢", 1, 0, 0),
        ("What's new?", "whats-new", "✨", 2, 1, 0),
        ("General discussion", "general", "💬", 3, 1, 1),
        ("Wins", "wins", "🏆", 4, 1, 0),
        ("Learning Hub", "learning-hub", "📚", 5, 1, 0),
        ("Networking Zone", "networking", "🤝", 6, 1, 0),
        ("Challenge", "challenge", "🎯", 7, 1, 0),
    ];
    for (name, slug, icon, sort_order, allow_member_posts, is_default) in presets {
        let cat_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO community_categories (id, community_id, profile_id, name, slug, icon, sort_order, allow_member_posts, is_default) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            crate::turso_params![cat_id, id.clone(), profile_id.clone(), name, slug, icon, sort_order, allow_member_posts, is_default]
        ).await.ok();
    }

    // Seed default badges
    let badge_presets = vec![
        ("Early Member", "🌟", "#f59e0b", 0, None),
        ("Top Contributor", "🔥", "#ef4444", 0, None),
        ("Course Graduate", "🎓", "#6366f1", 0, None),
        ("VIP", "👑", "#eab308", 0, None),
        (
            "7-Day Streak",
            "⚡",
            "#10b981",
            1,
            Some("{\"type\":\"streak_days\",\"threshold\":7}"),
        ),
        (
            "100 Points",
            "💯",
            "#8b5cf6",
            1,
            Some("{\"type\":\"points_reached\",\"threshold\":100}"),
        ),
        (
            "First Post",
            "✍️",
            "#14b8a6",
            1,
            Some("{\"type\":\"post_count\",\"threshold\":1}"),
        ),
    ];
    for (name, icon, color, is_auto, cond) in badge_presets {
        let b_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO community_badges (id, community_id, profile_id, name, icon, color, is_auto_award, auto_award_condition) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            crate::turso_params![b_id, id.clone(), profile_id.clone(), name, icon, color, is_auto, cond]
        ).await.ok();
    }

    // Fetch profile owner
    let profile = db
        .get_profile(&profile_id)
        .await
        .map_err(|e| e.to_string())?;
    let owner_user_id = profile.user_id.clone();

    let mut owner_email: Option<String> = None;
    if let Ok(mut urows) = conn
        .query(
            "SELECT email FROM users WHERE id = ?1",
            crate::turso_params![owner_user_id.clone()],
        )
        .await
    {
        if let Ok(Some(urow)) = urows.next().await {
            owner_email = urow.get(0).unwrap_or(None);
        }
    }

    // Add profile owner as owner
    let owner_member_id = Uuid::new_v4().to_string();
    let owner_access_token = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO community_members (id, community_id, profile_id, user_id, email, role, status, access_token) VALUES (?1, ?2, ?3, ?4, ?5, 'owner', 'active', ?6)",
        crate::turso_params![owner_member_id.clone(), id.clone(), profile_id.clone(), owner_user_id.clone(), owner_email, owner_access_token]
    ).await.map_err(|e| format!("DB ERROR (members owner): {}", e))?;

    // If the creator is different from the owner, add them as admin
    if let Some(creator_user_id) = &data.user_id {
        if creator_user_id != &owner_user_id {
            let admin_member_id = Uuid::new_v4().to_string();
            let admin_access_token = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO community_members (id, community_id, profile_id, user_id, email, role, status, access_token) VALUES (?1, ?2, ?3, ?4, ?5, 'admin', 'active', ?6)",
                crate::turso_params![admin_member_id.clone(), id.clone(), profile_id.clone(), creator_user_id.clone(), data.user_email.clone(), admin_access_token]
            ).await.map_err(|e| format!("DB ERROR (members admin): {}", e))?;
        }
    }

    let mut rows = conn.query(
        "SELECT id, profile_id, title as name, slug, description, logo_url as icon, cover_image_url as cover_image,
                (access_type = 'invite_only' OR access_type = 'application') as is_private,
                (is_public = 0) as requires_approval,
                (SELECT COUNT(*) FROM community_members WHERE community_id = communities.id) as member_count,
                (SELECT COUNT(*) FROM community_posts WHERE community_id = communities.id) as post_count,
                created_at, updated_at
         FROM communities WHERE id = ?1",
        crate::turso_params![id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        community_from_row(&row)
    } else {
        Err("Community insert failed".to_string())
    }
}

/// Get members for a community. Optionally filter by status or role.
/// status: "active" | "pending" | "banned" | "all" (default = "active")
#[tauri::command]
pub async fn get_community_members(
    community_id: String,
    status: Option<String>,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CommunityMemberRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT cm.id, cm.community_id, cm.profile_id, cm.user_id, cm.email,
                cl.display_name, cl.avatar_url, cm.role, cm.status,
                COALESCE(cl.points_total, 0) as points, 
                COALESCE(cl.post_count, 0) as post_count, 
                cm.joined_at
         FROM community_members cm
         LEFT JOIN community_leaderboard cl ON cm.id = cl.member_id
         WHERE cm.community_id = ?1 AND (?2 IS NULL OR cm.status = ?2)
         ORDER BY points DESC LIMIT ?3",
            crate::turso_params![community_id, status, limit.unwrap_or(100)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut members = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        members.push(member_from_row(&row)?);
    }

    Ok(members)
}

#[tauri::command]
pub async fn update_community_member_profile(
    member_id: String,
    display_name: String,
    avatar_url: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE community_leaderboard SET display_name = ?1, avatar_url = ?2 WHERE member_id = ?3",
        crate::turso_params![display_name, avatar_url, member_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Approve a pending member.
#[tauri::command]
pub async fn approve_member(
    member_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE community_members SET status = 'active' WHERE id = ?1",
        crate::turso_params![member_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Ban a member from a community.
#[tauri::command]
pub async fn ban_member(member_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE community_members SET status = 'banned' WHERE id = ?1",
        crate::turso_params![member_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// List posts within a community. Optionally filter by post_type or pinned.
#[tauri::command]
pub async fn list_community_posts(
    community_id: String,
    post_type: Option<String>,
    pinned_only: Option<bool>,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CommunityPostRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let pin_filter = if pinned_only.unwrap_or(false) {
        "AND is_pinned = 1"
    } else {
        ""
    };
    let sql = format!(
        "SELECT p.id, p.community_id, p.profile_id, p.member_id, p.category_id, p.title, p.body,
                COALESCE(p.media_items,'[]'), p.post_type, p.status, p.is_pinned,
                p.like_count, p.comment_count, p.view_count, NULL as published_at,
                p.created_at, p.updated_at,
                m.display_name, m.avatar_url, m.rank_overall
         FROM community_posts p
         LEFT JOIN community_leaderboard m ON p.member_id = m.member_id AND p.community_id = m.community_id
         WHERE p.community_id = ?1 AND p.status != 'archived'
           AND (?2 IS NULL OR p.post_type = ?2) {}
         ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ?3",
        pin_filter
    );
    let mut rows = conn
        .query(
            &sql,
            crate::turso_params![community_id, post_type, limit.unwrap_or(50)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut posts = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        posts.push(community_post_from_row(&row)?);
    }
    Ok(posts)
}

/// Get the leaderboard for a community (ordered by points DESC).
/// The leaderboard table is maintained by DB triggers defined in community-triggers.ts.
#[tauri::command]
pub async fn get_community_leaderboard(
    community_id: String,
    limit: Option<i64>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LeaderboardRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT l.id, l.community_id, l.member_id,
                l.display_name, l.avatar_url,
                COALESCE(l.points_total, 0) as points_total, 
                COALESCE(l.rank_overall, 0) as rank_overall, 
                COALESCE(l.post_count, 0) as post_count, 
                COALESCE(l.comment_count, 0) as comment_count, 
                CAST(l.updated_at AS TEXT) as updated_at
         FROM community_leaderboard l
         WHERE l.community_id = ?1
         ORDER BY rank_overall ASC LIMIT ?2",
            crate::turso_params![community_id, limit.unwrap_or(15)],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut board = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        board.push(leaderboard_from_row(&row)?);
    }
    Ok(board)
}

/// List community events (upcoming by default — starts_at >= now).
/// Pass include_past=true to include historical events.
#[tauri::command]
pub async fn list_community_events(
    community_id: String,
    include_past: Option<bool>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CommunityEventRow>, String> {
    state.require_license().await?;
    state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let time_filter = if include_past.unwrap_or(false) {
        ""
    } else {
        "AND starts_at >= unixepoch()"
    };
    let sql = format!(
        "SELECT id, community_id, profile_id, title, description,
                starts_at, ends_at, location, is_online, meeting_url,
                rsvp_count, created_at
         FROM community_events WHERE community_id = ?1 {}
         ORDER BY starts_at ASC",
        time_filter
    );
    let mut rows = conn
        .query(&sql, crate::turso_params![community_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut events = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        events.push(event_from_row(&row)?);
    }
    Ok(events)
}

// ── Additional Commands for Community ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityCategoryRow {
    pub id: String,
    pub community_id: String,
    pub profile_id: String,
    pub name: String,
    pub slug: String,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub sort_order: i64,
    pub is_active: bool,
    pub is_default: bool,
    pub allow_member_posts: bool,
    pub color: Option<String>,
    pub post_count: i64,
}

fn category_from_row(row: &crate::db::turso::TursoRow) -> Result<CommunityCategoryRow, String> {
    Ok(CommunityCategoryRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        community_id: row.get(1).map_err(|e| e.to_string())?,
        profile_id: row.get(2).map_err(|e| e.to_string())?,
        name: row.get(3).map_err(|e| e.to_string())?,
        slug: row.get(4).map_err(|e| e.to_string())?,
        icon: row.get(5).map_err(|e| e.to_string())?,
        description: row.get(6).map_err(|e| e.to_string())?,
        sort_order: row.get::<i64>(7).unwrap_or(0),
        is_active: row.get::<i64>(8).unwrap_or(0) != 0,
        is_default: row.get::<i64>(9).unwrap_or(0) != 0,
        allow_member_posts: row.get::<i64>(10).unwrap_or(0) != 0,
        color: row.get(11).map_err(|e| e.to_string())?,
        post_count: row.get::<i64>(12).unwrap_or(0),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityAnalyticsRow {
    pub id: String,
    pub community_id: String,
    pub profile_id: String,
    pub total_members: i64,
    pub active_members_7d: i64,
    pub active_members_30d: i64,
    pub paid_members: i64,
    pub free_members: i64,
    pub churned_members: i64,
    pub pending_members: i64,
    pub total_posts: i64,
    pub total_comments: i64,
    pub total_reactions: i64,
    pub total_lessons: i64,
    pub total_lesson_completions: i64,
    pub total_revenue_cents: i64,
    pub mrr_cents: i64,
    pub arr_cents: i64,
    pub avg_posts_per_member: f64,
    pub avg_comments_per_post: f64,
    pub avg_completion_rate_pct: i64,
    pub bot_views: i64,
    pub total_views: i64,
    pub online_count: i64,
    pub updated_at: String,
}

fn analytics_from_row(row: &crate::db::turso::TursoRow) -> Result<CommunityAnalyticsRow, String> {
    Ok(CommunityAnalyticsRow {
        id: row.get(0).map_err(|e| e.to_string())?,
        community_id: row.get(1).map_err(|e| e.to_string())?,
        profile_id: row.get(2).map_err(|e| e.to_string())?,
        total_members: row.get::<i64>(3).unwrap_or(0),
        active_members_7d: row.get::<i64>(4).unwrap_or(0),
        active_members_30d: row.get::<i64>(5).unwrap_or(0),
        paid_members: row.get::<i64>(6).unwrap_or(0),
        free_members: row.get::<i64>(7).unwrap_or(0),
        churned_members: row.get::<i64>(8).unwrap_or(0),
        pending_members: row.get::<i64>(9).unwrap_or(0),
        total_posts: row.get::<i64>(10).unwrap_or(0),
        total_comments: row.get::<i64>(11).unwrap_or(0),
        total_reactions: row.get::<i64>(12).unwrap_or(0),
        total_lessons: row.get::<i64>(13).unwrap_or(0),
        total_lesson_completions: row.get::<i64>(14).unwrap_or(0),
        total_revenue_cents: row.get::<i64>(15).unwrap_or(0),
        mrr_cents: row.get::<i64>(16).unwrap_or(0),
        arr_cents: row.get::<i64>(17).unwrap_or(0),
        avg_posts_per_member: row.get::<f64>(18).unwrap_or(0.0),
        avg_comments_per_post: row.get::<f64>(19).unwrap_or(0.0),
        avg_completion_rate_pct: row.get::<i64>(20).unwrap_or(0),
        bot_views: row.get::<i64>(21).unwrap_or(0),
        total_views: row.get::<i64>(22).unwrap_or(0),
        online_count: row.get::<i64>(23).unwrap_or(0),
        updated_at: row.get(24).map_err(|e| e.to_string())?,
    })
}

/// Get a specific community by ID
#[tauri::command]
pub async fn get_community(
    community_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<CommunityRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, profile_id, title as name, slug, description, logo_url as icon, cover_image_url as cover_image,
                (access_type = 'invite_only' OR access_type = 'application') as is_private,
                (is_public = 0) as requires_approval,
                (SELECT COUNT(*) FROM community_members WHERE community_id = communities.id) as member_count,
                (SELECT COUNT(*) FROM community_posts WHERE community_id = communities.id) as post_count,
                created_at, updated_at
         FROM communities WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![community_id, profile_id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        community_from_row(&row)
    } else {
        Err("Community not found".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCommunityData {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub cover_image: Option<String>,
    pub is_private: Option<bool>,
    pub requires_approval: Option<bool>,
    pub published: Option<bool>,
}

/// Update a community
#[tauri::command]
pub async fn update_community(
    community_id: String,
    data: UpdateCommunityData,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    let mut params: Vec<crate::db::turso::TursoParam> = Vec::new();

    if let Some(name) = data.name {
        updates.push(format!("name = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Text(name));
    }
    if let Some(slug) = data.slug {
        updates.push(format!("slug = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Text(slug));
    }
    if let Some(description) = data.description {
        updates.push(format!("description = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Text(description));
    }
    if let Some(icon) = data.icon {
        updates.push(format!("icon = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Text(icon));
    }
    if let Some(cover_image) = data.cover_image {
        updates.push(format!("cover_image = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Text(cover_image));
    }
    if let Some(is_private) = data.is_private {
        updates.push(format!("is_private = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Integer(is_private as i64));
    }
    if let Some(requires_approval) = data.requires_approval {
        updates.push(format!("requires_approval = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Integer(requires_approval as i64));
    }
    if let Some(published) = data.published {
        updates.push(format!("published = ?{}", params.len() + 1));
        params.push(crate::db::turso::TursoParam::Integer(published as i64));
    }

    if updates.is_empty() {
        return Ok(());
    }

    updates.push(format!("updated_at = unixepoch()"));
    let sql = format!(
        "UPDATE communities SET {} WHERE id = ?{} AND profile_id = ?{}",
        updates.join(", "),
        params.len() + 1,
        params.len() + 2
    );
    params.push(crate::db::turso::TursoParam::Text(community_id));
    params.push(crate::db::turso::TursoParam::Text(profile_id));

    conn.execute(&sql, params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a community (soft delete via hidden)
#[tauri::command]
pub async fn delete_community(
    community_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE communities SET hidden = 1, is_active = 0, updated_at = unixepoch() WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![community_id, profile_id],
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Publish a community
#[tauri::command]
pub async fn publish_community(
    community_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE communities SET published = 1, updated_at = unixepoch() WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![community_id, profile_id],
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Get community analytics
#[tauri::command]
pub async fn get_community_analytics(
    community_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<CommunityAnalyticsRow, String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn.query(
        "SELECT id, community_id, profile_id, total_members, active_members_7d, active_members_30d,
                paid_members, free_members, churned_members, pending_members, total_posts,
                total_comments, total_reactions, total_lessons, total_lesson_completions,
                total_revenue_cents, mrr_cents, arr_cents, avg_posts_per_member, avg_comments_per_post,
                avg_completion_rate_pct, bot_views, total_views, online_count, updated_at
         FROM community_analytics WHERE community_id = ?1",
        crate::turso_params![community_id],
    ).await.map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        analytics_from_row(&row)
    } else {
        Err("Analytics not found".to_string())
    }
}

/// Aggregate community analytics
#[tauri::command]
pub async fn aggregate_community_analytics(
    community_id: String,
    _force: Option<bool>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    // In a real implementation this would perform complex rollup aggregations.
    // For now, we just ensure the record exists and update online_count.
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO community_analytics (id, community_id, profile_id)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(community_id) DO UPDATE SET
         online_count = (SELECT COALESCE(online_count, 0) FROM community_online_view WHERE community_id = ?2),
         last_aggregated_at = unixepoch(),
         updated_at = unixepoch()",
        crate::turso_params![id, community_id.clone(), profile_id],
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// Create a community category
#[tauri::command]
pub async fn create_community_category(
    community_id: String,
    name: String,
    slug: String,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO community_categories
           (id, community_id, profile_id, name, slug, description, icon, color,
            sort_order, is_active, is_default, allow_member_posts, post_count,
            created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,1,0,1,0, unixepoch())",
        crate::turso_params![
            id.clone(),
            community_id,
            profile_id,
            name,
            slug,
            description,
            icon,
            color
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// List community categories
#[tauri::command]
pub async fn list_community_categories(
    community_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CommunityCategoryRow>, String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut rows = conn
        .query(
            "SELECT id, community_id, profile_id, name, slug, icon, description,
                sort_order, is_active, is_default, allow_member_posts, color, post_count
         FROM community_categories WHERE community_id = ?1 AND is_active = 1
         ORDER BY sort_order ASC",
            crate::turso_params![community_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        items.push(category_from_row(&row)?);
    }
    Ok(items)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostData {
    pub community_id: String,
    pub member_id: String,
    pub title: Option<String>,
    pub body: String,
    pub category_id: Option<String>,
    pub media_items: Option<String>,
    pub post_type: Option<String>,
    pub status: Option<String>,
}

/// Create a post
#[tauri::command]
pub async fn create_post(
    data: CreatePostData,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO community_posts
           (id, community_id, profile_id, member_id, category_id, title, body,
            media_items, post_type, status, is_pinned, is_featured, is_announcement,
            hidden, like_count, comment_count, view_count, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,0,0,0,0,0,0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        crate::turso_params![
            id.clone(), data.community_id, profile_id, data.member_id, data.category_id,
            data.title, data.body, data.media_items.unwrap_or("[]".to_string()),
            data.post_type.unwrap_or("post".to_string()), data.status.unwrap_or("published".to_string())
        ],
    ).await.map_err(|e| e.to_string())?;

    Ok(id)
}

/// Delete a post
#[tauri::command]
pub async fn delete_post(
    post_id: String,
    community_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE community_posts SET hidden = 1, status = 'removed', updated_at = unixepoch() WHERE id = ?1 AND community_id = ?2",
        crate::turso_params![post_id, community_id],
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Pin a post
#[tauri::command]
pub async fn pin_post(
    post_id: String,
    community_id: String,
    pinned: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.require_license().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE community_posts SET is_pinned = ?1, updated_at = unixepoch() WHERE id = ?2 AND community_id = ?3",
        crate::turso_params![pinned as i64, post_id, community_id],
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}
