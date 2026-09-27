use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobListingRow {
    pub id: String,
    pub profile_id: String,
    pub media_id: Option<String>,
    pub user_id: String,
    pub ai_summary: Option<String>,
    pub title: String,
    pub company: String,
    pub location: String,
    pub location_type: String,
    pub employment_type: String,
    pub salary_min: Option<i64>,
    pub salary_max: Option<i64>,
    pub salary_currency: String,
    pub excerpt: Option<String>,
    pub description: String,
    pub requirements: Option<String>,
    pub slug: String,
    pub published: bool,
    pub hidden: bool,
    pub image_url: Option<String>,
    pub logo_url: Option<String>,
    pub additional_details: Option<String>,
    pub total_applicants: i64,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<String>,
    pub collection_id: Option<String>,
    pub form_settings: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobApplicationRow {
    pub id: String,
    pub job_id: String,
    pub profile_id: String,
    pub resume_url: Option<String>,
    pub resume_filename: Option<String>,
    pub resume_size_mb: Option<f64>,
    pub resume_type: Option<String>,
    pub full_name: String,
    pub email: String,
    pub phone: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub date_of_birth: Option<String>,
    pub country_of_residence: Option<String>,
    pub physical_location: Option<String>,
    pub timezone: Option<String>,
    pub weekly_availability: Option<String>,
    pub linkedin: Option<String>,
    pub leetcode: Option<String>,
    pub github: Option<String>,
    pub codechef: Option<String>,
    pub codeforces: Option<String>,
    pub summary: Option<String>,
    pub education: Option<String>,
    pub work_experience: Option<String>,
    pub projects: Option<String>,
    pub publications: Option<String>,
    pub certifications: Option<String>,
    pub awards: Option<String>,
    pub portfolio: Option<String>,
    pub other_links: Option<String>,
    pub skills: Option<String>,
    pub terms_accepted: i64,
    pub resume_updated: i64,
    pub status: String,
    pub stage: String,
    pub decision: Option<String>,
    pub decided_at: Option<i64>,
    pub decision_note: Option<String>,
    pub duration_ms: Option<i64>,
    pub cf_country: Option<String>,
    pub cf_city: Option<String>,
    pub os: Option<String>,
    pub device: Option<String>,
    pub browser: Option<String>,
    pub ip_address: Option<String>,
    pub referrer: Option<String>,
    pub utm_source: Option<String>,
    pub utm_medium: Option<String>,
    pub utm_campaign: Option<String>,
    pub utm_term: Option<String>,
    pub utm_content: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateJobData {
    pub user_id: String,
    pub title: String,
    pub company: String,
    pub location: String,
    pub location_type: String,
    pub employment_type: String,
    pub salary_min: Option<i64>,
    pub salary_max: Option<i64>,
    pub salary_currency: String,
    pub description: String,
    pub requirements: Option<String>,
    pub slug: String,
    pub published: bool,
    pub excerpt: Option<String>,
    pub image_url: Option<String>,
    pub additional_details: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateJobData {
    pub title: Option<String>,
    pub company: Option<String>,
    pub location: Option<String>,
    pub location_type: Option<String>,
    pub employment_type: Option<String>,
    pub salary_min: Option<i64>,
    pub salary_max: Option<i64>,
    pub salary_currency: Option<String>,
    pub description: Option<String>,
    pub requirements: Option<String>,
    pub slug: Option<String>,
    pub published: Option<bool>,
    pub excerpt: Option<String>,
    pub image_url: Option<String>,
    pub additional_details: Option<String>,
    pub expires_at: Option<String>,
}

// ── Row extractors ────────────────────────────────────────────────────────────

fn listing_from_row(row: &crate::db::turso::TursoRow) -> Result<JobListingRow, String> {
    let get_str = |idx: i32| -> Result<String, String> {
        if row.column_name(idx).is_none() {
            return Ok("".into());
        }
        Ok(row.get::<String>(idx).unwrap_or_else(|_| "".into()))
    };
    let get_opt_str = |idx: i32| -> Result<Option<String>, String> {
        if row.column_name(idx).is_none() {
            return Ok(None);
        }
        Ok(row.get::<Option<String>>(idx).unwrap_or(None))
    };
    let get_i64 = |idx: i32| -> Result<i64, String> {
        if row.column_name(idx).is_none() {
            return Ok(0);
        }
        Ok(row.get::<i64>(idx).unwrap_or(0))
    };
    let get_opt_i64 = |idx: i32| -> Result<Option<i64>, String> {
        if row.column_name(idx).is_none() {
            return Ok(None);
        }
        Ok(row.get::<Option<i64>>(idx).unwrap_or(None))
    };

    Ok(JobListingRow {
        id: get_str(0)?,
        profile_id: get_str(1)?,
        media_id: get_opt_str(2)?,
        user_id: get_str(3)?,
        ai_summary: get_opt_str(4)?,
        title: get_str(5)?,
        company: get_str(6)?,
        location: get_str(7)?,
        location_type: get_str(8)?,
        employment_type: get_str(9)?,
        salary_min: get_opt_i64(10)?,
        salary_max: get_opt_i64(11)?,
        salary_currency: get_str(12).unwrap_or_else(|_| "USD".into()),
        excerpt: get_opt_str(13)?,
        description: get_str(14)?,
        requirements: get_opt_str(15)?,
        slug: get_str(16)?,
        published: get_i64(17).unwrap_or(0) != 0,
        hidden: get_i64(18).unwrap_or(0) != 0,
        image_url: get_opt_str(19).unwrap_or(None),
        additional_details: get_opt_str(20).unwrap_or(None),
        total_applicants: get_i64(21).unwrap_or(0),
        created_at: get_str(22).unwrap_or_else(|_| "".into()),
        updated_at: get_str(23).unwrap_or_else(|_| "".into()),
        expires_at: get_opt_str(24).unwrap_or(None),
        collection_id: get_opt_str(25).unwrap_or(None),
        form_settings: get_opt_str(26).unwrap_or(None),
        logo_url: get_opt_str(27).unwrap_or(None),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_job_listings(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<JobListingRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let stmt = conn
        .prepare("SELECT * FROM job_listings WHERE profile_id = ?1 ORDER BY created_at DESC")
        .await
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        match listing_from_row(&row) {
            Ok(listing) => out.push(listing),
            Err(e) => {
                log::warn!("Error parsing job row: {}", e);
            }
        }
    }

    Ok(out)
}

#[tauri::command]
pub async fn create_job_listing(
    data: CreateJobData,
    state: State<'_, Arc<AppState>>,
) -> Result<JobListingRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();

    let sql = r#"
        INSERT INTO job_listings (
            id, profile_id, user_id, title, company, location, location_type,
            employment_type, salary_min, salary_max, salary_currency, excerpt, description,
            requirements, slug, published, image_url, additional_details, total_applicants, expires_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7,
            ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, ?15, ?16, ?17, ?18, 0, ?19
        ) RETURNING *
    "#;

    let params = crate::turso_params![
        id,
        profile_id,
        data.user_id,
        data.title,
        data.company,
        data.location,
        data.location_type,
        data.employment_type,
        data.salary_min,
        data.salary_max,
        data.salary_currency,
        data.excerpt,
        data.description,
        data.requirements,
        data.slug,
        if data.published { 1 } else { 0 },
        data.image_url,
        data.additional_details,
        data.expires_at,
    ];

    let mut rows = conn.query(sql, params).await.map_err(|e| e.to_string())?;
    let row = rows
        .next()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Failed to insert")?;

    listing_from_row(&row)
}

#[tauri::command]
pub async fn delete_job_listing(
    id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM job_listings WHERE id = ?1 AND profile_id = ?2",
        crate::turso_params![id, profile_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn update_job_listing(
    id: String,
    data: UpdateJobData,
    state: State<'_, Arc<AppState>>,
) -> Result<JobListingRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    let mut args: Vec<crate::db::turso::TursoParam> = Vec::new();

    // To prevent SQL injection, we build the SET clause dynamically but safely
    // using positional parameters.

    macro_rules! add_field {
        ($field_name:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?{}", $field_name, args.len() + 1));
                args.push(v.into());
            }
        };
    }

    // For boolean we convert to i64 (0/1) for sqlite
    macro_rules! add_bool {
        ($field_name:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?{}", $field_name, args.len() + 1));
                args.push(if v { 1i64 } else { 0i64 }.into());
            }
        };
    }

    add_field!("title", data.title);
    add_field!("company", data.company);
    add_field!("location", data.location);
    add_field!("location_type", data.location_type);
    add_field!("employment_type", data.employment_type);
    add_field!("salary_min", data.salary_min);
    add_field!("salary_max", data.salary_max);
    add_field!("salary_currency", data.salary_currency);
    add_field!("description", data.description);
    add_field!("requirements", data.requirements);
    add_field!("slug", data.slug);
    add_bool!("published", data.published);
    add_field!("excerpt", data.excerpt);
    add_field!("image_url", data.image_url);
    add_field!("additional_details", data.additional_details);
    add_field!("expires_at", data.expires_at);

    if sets.is_empty() {
        return Err("No fields to update".to_string());
    }

    // Always bump updated_at
    sets.push(format!(
        "updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
    ));

    let set_clause = sets.join(", ");
    let sql = format!(
        "UPDATE job_listings SET {} WHERE id = ?{} AND profile_id = ?{} RETURNING *",
        set_clause,
        args.len() + 1,
        args.len() + 2
    );

    args.push(id.clone().into());
    args.push(profile_id.clone().into());

    let mut rows = conn.query(&sql, args).await.map_err(|e| e.to_string())?;
    let row = rows
        .next()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Listing not found or update failed")?;

    listing_from_row(&row)
}

fn application_from_row(row: &crate::db::turso::TursoRow) -> Result<JobApplicationRow, String> {
    let get_str =
        |idx: i32| -> Result<String, String> { row.get::<String>(idx).map_err(|e| e.to_string()) };
    let get_opt_str = |idx: i32| -> Result<Option<String>, String> {
        row.get::<Option<String>>(idx).map_err(|e| e.to_string())
    };
    let get_i64 =
        |idx: i32| -> Result<i64, String> { row.get::<i64>(idx).map_err(|e| e.to_string()) };
    let get_opt_i64 = |idx: i32| -> Result<Option<i64>, String> {
        row.get::<Option<i64>>(idx).map_err(|e| e.to_string())
    };
    let get_opt_f64 = |idx: i32| -> Result<Option<f64>, String> {
        row.get::<Option<f64>>(idx).map_err(|e| e.to_string())
    };

    Ok(JobApplicationRow {
        id: get_str(0)?,
        job_id: get_str(1)?,
        profile_id: get_str(2)?,
        resume_url: get_opt_str(3)?,
        resume_filename: get_opt_str(4)?,
        resume_size_mb: get_opt_f64(5)?,
        resume_type: get_opt_str(6)?,
        full_name: get_str(7)?,
        email: get_str(8)?,
        phone: get_opt_str(9)?,
        city: get_opt_str(10)?,
        country: get_opt_str(11)?,
        date_of_birth: get_opt_str(12)?,
        country_of_residence: get_opt_str(13)?,
        physical_location: get_opt_str(14)?,
        timezone: get_opt_str(15)?,
        weekly_availability: get_opt_str(16)?,
        linkedin: get_opt_str(17)?,
        leetcode: get_opt_str(18)?,
        github: get_opt_str(19)?,
        codechef: get_opt_str(20)?,
        codeforces: get_opt_str(21)?,
        summary: get_opt_str(22)?,
        education: get_opt_str(23)?,
        work_experience: get_opt_str(24)?,
        projects: get_opt_str(25)?,
        publications: get_opt_str(26)?,
        certifications: get_opt_str(27)?,
        awards: get_opt_str(28)?,
        portfolio: get_opt_str(29)?,
        other_links: get_opt_str(30)?,
        skills: get_opt_str(31)?,
        terms_accepted: get_i64(32)?,
        resume_updated: get_i64(33)?,
        status: get_str(34)?,
        stage: get_str(35)?,
        decision: get_opt_str(36)?,
        decided_at: get_opt_i64(37)?,
        decision_note: get_opt_str(38)?,
        duration_ms: get_opt_i64(39)?,
        cf_country: get_opt_str(40)?,
        cf_city: get_opt_str(41)?,
        os: get_opt_str(42)?,
        device: get_opt_str(43)?,
        browser: get_opt_str(44)?,
        ip_address: get_opt_str(45)?,
        referrer: get_opt_str(46)?,
        utm_source: get_opt_str(47)?,
        utm_medium: get_opt_str(48)?,
        utm_campaign: get_opt_str(49)?,
        utm_term: get_opt_str(50)?,
        utm_content: get_opt_str(51)?,
        created_at: get_str(52)?,
        updated_at: get_str(53)?,
    })
}

#[tauri::command]
pub async fn get_job_applications(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<JobApplicationRow>, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let sql = "SELECT * FROM job_applications WHERE profile_id = ? ORDER BY created_at DESC";
    let mut rows = conn
        .query(sql, crate::turso_params![profile_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        match application_from_row(&row) {
            Ok(app) => result.push(app),
            Err(e) => log::warn!("Error parsing job application row: {}", e),
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn update_job_application_status(
    id: String,
    decision: Option<String>,
    stage: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<JobApplicationRow, String> {
    state.require_license().await?;
    let profile_id = state.require_profile().await?;
    let db = state.require_user_db().await?;
    let conn = db.conn().map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    let mut args: Vec<crate::db::turso::TursoParam> = Vec::new();

    if let Some(d) = decision {
        sets.push(format!("decision = ?{}", args.len() + 1));
        args.push(d.into());
        // Auto-set decided_at
        sets.push(format!("decided_at = ?{}", args.len() + 1));
        let now = chrono::Utc::now().timestamp();
        args.push(now.into());
    }
    if let Some(s) = stage {
        sets.push(format!("stage = ?{}", args.len() + 1));
        args.push(s.into());
    }

    if sets.is_empty() {
        return Err("No updates provided".to_string());
    }

    sets.push(format!(
        "updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
    ));

    let set_clause = sets.join(", ");
    let sql = format!(
        "UPDATE job_applications SET {} WHERE id = ?{} AND profile_id = ?{} RETURNING *",
        set_clause,
        args.len() + 1,
        args.len() + 2
    );

    args.push(id.into());
    args.push(profile_id.into());

    let mut rows = conn.query(&sql, args).await.map_err(|e| e.to_string())?;
    let row = rows
        .next()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Application not found")?;

    application_from_row(&row)
}
