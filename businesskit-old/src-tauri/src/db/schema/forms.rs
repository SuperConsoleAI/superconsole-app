// src-tauri/src/db/schema/forms.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// Forms Schema — UserDB tables (4 tables)
// All live in the user's own Turso instance, provisioned via provision.ts
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER,
    thank_you_settings TEXT,
    collection_id TEXT,
    -- description: optional form-level subtitle / intro text
    description TEXT,
    -- image_url: cover/header image for the form
    image_url TEXT,
    -- background: preset name ('gradient-purple', 'solid-dark', etc.) OR a custom image URL
    -- UI checks: if starts with 'http' treat as image, else treat as preset key
    background TEXT,
    -- layout: form layout style e.g. 'classic' | 'card' | 'conversational' | 'minimal'
    layout TEXT NOT NULL DEFAULT 'classic',
    -- email_notification: send email to owner on each new submission
    email_notification INTEGER NOT NULL DEFAULT 0,
    -- accepting_responses: pause/resume form without unpublishing
    accepting_responses INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_forms_profile ON forms (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_forms_archived ON forms (profile_id, archived)"#,
    r#"CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    -- label: short field label shown above the input (distinct from title/description)
    label TEXT,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    options TEXT,
    embed_url TEXT,
    required INTEGER NOT NULL DEFAULT 0,
    settings TEXT,
    -- image_url: optional image shown above the question (hero/illustration)
    image_url TEXT,
    -- button_text: CTA button label for this step (overrides form-level default)
    button_text TEXT,
    -- placeholder: input placeholder text (text, email, phone, textarea types)
    placeholder TEXT,
    -- ai_follow_up: JSON config for AI-generated follow-up questions based on answer
    -- {"enabled":true,"prompt":"Ask a relevant follow-up based on: {{answer}}","max_questions":2}
    ai_follow_up TEXT
  )"#,
    r#"CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    last_question_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'viewed',
    device TEXT,
    os TEXT,
    browser TEXT,
    referrer TEXT,
    city TEXT,
    country TEXT,
    timezone TEXT,
    ip_address TEXT,
    user_agent TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    started_at TEXT,
    submitted_at TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE TABLE IF NOT EXISTS form_analytics (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL UNIQUE,
    bot_views INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
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
    visits INTEGER NOT NULL DEFAULT 0,
    starts INTEGER NOT NULL DEFAULT 0,
    partials INTEGER NOT NULL DEFAULT 0,
    submissions INTEGER NOT NULL DEFAULT 0,
    avg_completion_ms INTEGER NOT NULL DEFAULT 0,
    trends_7d TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0]',
    trends_30d TEXT NOT NULL DEFAULT '[]',
    trends_12m TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
    lifetime TEXT NOT NULL DEFAULT '{}',
    device TEXT NOT NULL DEFAULT '{}',
    os TEXT NOT NULL DEFAULT '{}',
    browser TEXT NOT NULL DEFAULT '{}',
    referrer TEXT NOT NULL DEFAULT '{}',
    country TEXT NOT NULL DEFAULT '{}',
    city TEXT NOT NULL DEFAULT '{}',
    utm_source TEXT NOT NULL DEFAULT '{}',
    utm_medium TEXT NOT NULL DEFAULT '{}',
    utm_campaign TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at INTEGER,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_forms_profile ON forms (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_forms_slug ON forms (slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_forms_collection ON forms (collection_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_questions_form ON questions (form_id, position ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_submissions_form ON submissions (form_id, created_at DESC)"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_submissions_no_delete
   BEFORE DELETE ON submissions
   BEGIN SELECT RAISE(ABORT, 'submissions are append-only'); END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_submission_insert
   AFTER INSERT ON submissions
   BEGIN
     -- Update form_analytics
     UPDATE form_analytics SET
       submissions = submissions + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE form_id = NEW.form_id;

     -- Update cms_analytics for cat_34 (Forms)
     UPDATE cms_analytics SET
       total_submissions = total_submissions + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = (SELECT profile_id FROM forms WHERE id = NEW.form_id) AND category_id = 'cat_34');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_form_insert
   AFTER INSERT ON forms
   BEGIN
     -- Initialize form_analytics
     INSERT OR IGNORE INTO form_analytics (id, form_id) VALUES (hex(randomblob(16)), NEW.id);

     -- Update cms_analytics for Forms (cat_34)
     UPDATE cms_analytics SET
       total_posts = total_posts + 1,
       total_published = total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       total_draft     = total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_34');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_form_update_published
   AFTER UPDATE OF published ON forms
   WHEN NEW.published != OLD.published
   BEGIN
     UPDATE cms_analytics SET
       total_published = MAX(0, total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE -1 END),
       total_draft     = MAX(0, total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE -1 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_34');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_form_delete
   AFTER DELETE ON forms
   BEGIN
     -- Clean up form_analytics
     DELETE FROM form_analytics WHERE form_id = OLD.id;

     UPDATE cms_analytics SET
       total_posts     = MAX(0, total_posts - 1),
       total_published = MAX(0, total_published - CASE WHEN OLD.published = 1 THEN 1 ELSE 0 END),
       total_draft     = MAX(0, total_draft - CASE WHEN OLD.published = 0 THEN 1 ELSE 0 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = OLD.profile_id AND category_id = 'cat_34');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_submission_delete
   AFTER DELETE ON submissions
   BEGIN
     -- Update form_analytics
     UPDATE form_analytics SET
       submissions = MAX(0, submissions - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE form_id = OLD.form_id;

     -- Update cms_analytics for cat_34 (Forms)
     UPDATE cms_analytics SET
       total_submissions = MAX(0, total_submissions - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = (SELECT profile_id FROM forms WHERE id = OLD.form_id) AND category_id = 'cat_34');
   END"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
