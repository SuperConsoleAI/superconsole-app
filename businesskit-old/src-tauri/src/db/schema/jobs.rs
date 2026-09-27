// src-tauri/src/db/schema/jobs.rs
use super::Migration;

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS job_listings (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    user_id TEXT NOT NULL,
    ai_summary TEXT,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    location_type TEXT NOT NULL,
    employment_type TEXT NOT NULL,
    salary_min INTEGER,
    salary_max INTEGER,
    salary_currency TEXT NOT NULL DEFAULT 'USD',
    excerpt TEXT,
    description TEXT NOT NULL,
    requirements TEXT,
    slug TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    additional_details TEXT,
    total_applicants INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    expires_at TEXT,
    collection_id TEXT,
    form_settings TEXT DEFAULT '{}',
    logo_url TEXT
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_job_listings_profile ON job_listings (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_job_listings_slug ON job_listings (profile_id, slug)"#,
    r#"CREATE TABLE IF NOT EXISTS job_applications (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    resume_url TEXT,
    resume_filename TEXT,
    resume_size_mb REAL,
    resume_type TEXT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    city TEXT,
    country TEXT,
    date_of_birth TEXT,
    country_of_residence TEXT,
    physical_location TEXT,
    timezone TEXT,
    weekly_availability TEXT,
    linkedin TEXT,
    leetcode TEXT,
    github TEXT,
    codechef TEXT,
    codeforces TEXT,
    summary TEXT,
    education TEXT DEFAULT '[]',
    work_experience TEXT DEFAULT '[]',
    projects TEXT DEFAULT '[]',
    publications TEXT DEFAULT '[]',
    certifications TEXT DEFAULT '[]',
    awards TEXT DEFAULT '[]',
    portfolio TEXT,
    other_links TEXT DEFAULT '[]',
    skills TEXT DEFAULT '[]',
    terms_accepted INTEGER NOT NULL DEFAULT 0,
    resume_updated INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'partial' | 'completed'
    -- updated by applicant actions — how far they filled the form
    stage TEXT NOT NULL DEFAULT 'applied',
    -- 'applied' | 'reviewing' | 'interview' | 'offer' | 'withdrawn'
    -- updated by employer — hiring pipeline position
    decision TEXT,
    -- null | 'accepted' | 'rejected' | 'shortlisted' | 'on_hold'
    decided_at INTEGER,
    decision_note TEXT,
    duration_ms INTEGER,
    cf_country TEXT,
    cf_city TEXT,
    os TEXT,
    device TEXT,
    browser TEXT,
    ip_address TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications (job_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_job_applications_profile ON job_applications (profile_id, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS job_analytics (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    total_visits INTEGER NOT NULL DEFAULT 0,
    total_applications INTEGER NOT NULL DEFAULT 0,
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    os_breakdown TEXT NOT NULL DEFAULT '{}',
    browser_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    city_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    utm_source_breakdown TEXT NOT NULL DEFAULT '{}',
    utm_medium_breakdown TEXT NOT NULL DEFAULT '{}',
    utm_campaign_breakdown TEXT NOT NULL DEFAULT '{}',
    views_device_breakdown TEXT NOT NULL DEFAULT '{}',
    views_os_breakdown TEXT NOT NULL DEFAULT '{}',
    views_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    views_country_breakdown TEXT NOT NULL DEFAULT '{}',
    views_city_breakdown TEXT NOT NULL DEFAULT '{}',
    views_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    applications_7d TEXT NOT NULL DEFAULT '[]',
    applications_30d TEXT NOT NULL DEFAULT '[]',
    applications_12m TEXT NOT NULL DEFAULT '[]',
    applications_lifetime TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at INTEGER,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_job_analytics_job_id ON job_analytics (job_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_job_analytics_profile_id ON job_analytics (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_job_applications_stage ON job_applications (job_id, stage)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_job_applications_decision ON job_applications (job_id, decision)"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_job_application_insert
   AFTER INSERT ON job_applications
   BEGIN
     -- Update job_analytics
     UPDATE job_analytics SET
       total_applications = total_applications + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE job_id = NEW.job_id;

     -- Update job_listings
     UPDATE job_listings SET
       total_applicants = total_applicants + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.job_id;

     -- Update cms_analytics for cat_31 (Jobs)
     UPDATE cms_analytics SET
       total_applications = total_applications + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_31');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_job_listing_insert
   AFTER INSERT ON job_listings
   BEGIN
     -- Initialize job_analytics
     INSERT OR IGNORE INTO job_analytics (id, job_id, profile_id) VALUES (hex(randomblob(16)), NEW.id, NEW.profile_id);

     -- Update cms_analytics for Jobs (cat_31)
     UPDATE cms_analytics SET
       total_posts = total_posts + 1,
       total_published = total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       total_draft     = total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_31');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_job_listing_update_published
   AFTER UPDATE OF published ON job_listings
   WHEN NEW.published != OLD.published
   BEGIN
     UPDATE cms_analytics SET
       total_published = MAX(0, total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE -1 END),
       total_draft     = MAX(0, total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE -1 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_31');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_job_listing_delete
   AFTER DELETE ON job_listings
   BEGIN
     -- Clean up job_analytics
     DELETE FROM job_analytics WHERE job_id = OLD.id;

     UPDATE cms_analytics SET
       total_posts     = MAX(0, total_posts - 1),
       total_published = MAX(0, total_published - CASE WHEN OLD.published = 1 THEN 1 ELSE 0 END),
       total_draft     = MAX(0, total_draft - CASE WHEN OLD.published = 0 THEN 1 ELSE 0 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = OLD.profile_id AND category_id = 'cat_31');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_job_application_delete
   AFTER DELETE ON job_applications
   BEGIN
     -- Update job_analytics
     UPDATE job_analytics SET
       total_applications = MAX(0, total_applications - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE job_id = OLD.job_id;

     -- Update job_listings
     UPDATE job_listings SET
       total_applicants = MAX(0, total_applicants - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = OLD.job_id;

     -- Update cms_analytics for cat_31 (Jobs)
     UPDATE cms_analytics SET
       total_applications = MAX(0, total_applications - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = OLD.profile_id AND category_id = 'cat_31');
   END"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
