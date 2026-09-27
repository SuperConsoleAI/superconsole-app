// src-tauri/src/db/schema/content.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// Content Schema — UserDB tables
// Provisioned via provision.ts → provisionUserDatabase()
//
// Shared Content Columns:
// - ai_summary, custom_design
//
// GEO Columns (per-table, see GEO_INFRASTRUCTURE.md):
//   posts           → seo_title, seo_description, seo_keywords,
//                     word_count, reading_time_mins, internal_links, external_links, sources
//   newsletter, guides, notes → word_count, sources
//   compare, alternative, prompt, skills → sources
//   doc_articles    → sources
//
// content_type omitted — the table name already encodes the type.
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS content (
    -- Identifiers & Relations
    id TEXT PRIMARY KEY,
    cms_id TEXT,
    category_id TEXT,
    collection_id TEXT,
    product_id TEXT,
    item_id TEXT,
    profile_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    media_id TEXT,

    -- Core Content
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    excerpt TEXT,
    content TEXT,
    hero_image_url TEXT,

    -- CTA & Actions
    cta_button_text TEXT,
    cta_button_url TEXT,

    -- Status & Visibility Flags
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER,
    hide_author INTEGER NOT NULL DEFAULT 0,
    hide_info INTEGER NOT NULL DEFAULT 0,
    is_featured INTEGER NOT NULL DEFAULT 0,

    -- Dates & Scheduling
    date TEXT,

    -- Profile & Branding Metadata
    name TEXT,
    tagline TEXT,
    logo_url TEXT,
    website TEXT,
    location TEXT,
    social_links TEXT DEFAULT '[]',
    highlights TEXT DEFAULT '[]',

    -- Attachments & Media
    add_product TEXT DEFAULT '[]',
    add_people TEXT DEFAULT '[]',
    authors TEXT DEFAULT '[]',
    video_url TEXT,
    files_url TEXT DEFAULT '[]',
    file_details TEXT DEFAULT '[]',
    faqs TEXT DEFAULT '{}',
    additional_details TEXT DEFAULT '[]',
    sections TEXT NOT NULL DEFAULT '[]',
    hide_default_sections INTEGER NOT NULL DEFAULT 0,
    image_ads TEXT DEFAULT NULL,

    -- SEO, AI & Analytics
    ai_summary TEXT,
    custom_design TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    word_count INTEGER,
    reading_time_mins INTEGER,
    internal_links INTEGER,
    external_links INTEGER,
    sources TEXT,
    sent_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_by TEXT,
    parent_id TEXT
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_profile ON content (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_user ON content (profile_id, user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_updated_by ON content (profile_id, updated_by)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_parent ON content (profile_id, parent_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_collection ON content (collection_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_product ON content (product_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_item ON content (item_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_cms ON content (cms_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_category ON content (category_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_media_id ON content (profile_id, media_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_archived ON content (profile_id, archived)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_content_profile_category_slug ON content (profile_id, category_id, slug)"#,
    r#"CREATE TABLE IF NOT EXISTS content_reaction (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    user_id TEXT,
    reaction_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_reaction_content ON content_reaction (content_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_reaction_profile ON content_reaction (profile_id)"#,
    r#"CREATE TABLE IF NOT EXISTS content_comment (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    user_id TEXT,
    author_name TEXT,
    author_email TEXT,
    content TEXT NOT NULL,
    parent_id TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_comment_content ON content_comment (content_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_comment_profile ON content_comment (profile_id)"#,
    r#"CREATE TABLE IF NOT EXISTS cms (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT,
    nav_active INTEGER DEFAULT 1,
    menu_active INTEGER DEFAULT 1,
    footer_active INTEGER DEFAULT 1,
    section TEXT,
    subscribe_form INTEGER DEFAULT 1,
    ads_code_sidebar TEXT,
    ads_code_top TEXT,
    ads_code_bottom TEXT,
    hide_info INTEGER NOT NULL DEFAULT 0,
    -- settings: JSON config for this CMS section (SEO, layout, pagination, etc.)
    settings TEXT NOT NULL DEFAULT '{}',
    -- extra: open-ended JSON for future extensions without schema migrations
    extra TEXT NOT NULL DEFAULT '{}',
    sections TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_cms_profile ON cms (profile_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_profile_slug ON cms (profile_id, slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_cms_category_id ON cms (category_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_profile_category ON cms (profile_id, category_id)"#,
    r#"CREATE TABLE IF NOT EXISTS views_analytics (
    id TEXT PRIMARY KEY,
    content_id TEXT,
    doc_id INTEGER,
    product_id TEXT,
    form_id TEXT,
    job_listing_id TEXT,
    community_id TEXT,
    page_id TEXT,
    link_page_id TEXT,
    cms_id TEXT,
    -- FK to cms.id — which CMS hub this view belongs to (set at insert time)
    profile_id TEXT NOT NULL,
    viewer_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    device TEXT,
    os TEXT,
    browser TEXT,
    referrer TEXT,
    country TEXT,
    city TEXT,
    timezone TEXT,
    is_bot INTEGER DEFAULT 0,
    visit_id TEXT,
    -- soft FK → visits_analytics.id (the parent session visit, set at insert time)
    viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_views_analytics_content  ON views_analytics (content_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_views_analytics_profile  ON views_analytics (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_views_analytics_visit    ON views_analytics (visit_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_views_analytics_link_page ON views_analytics (link_page_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_views_analytics_cms      ON views_analytics (profile_id, cms_id)"#,
    r#"CREATE TABLE IF NOT EXISTS visits_analytics (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    -- CMS hub that was visited (FK to cms.id / DEFAULT_CMS_PAGES)
    cms_id TEXT,
    -- NULL = profile root visit; otherwise = cms.id of the section (Blog, Jobs, etc.)

    -- Specific entity within the CMS hub
    entity_type TEXT NOT NULL DEFAULT 'profile',
    -- 'profile'|'product'|'content'|'page'|'job'|'form'|'docs'
    entity_id TEXT,
    -- FK to the specific item: products.id, content.id, pages.id, etc.

    -- Visitor identity (best-effort, never guaranteed unique)
    viewer_id TEXT,           -- auth user ID if signed in
    session_id TEXT,          -- anonymous session fingerprint
    ip_address TEXT,
    user_name TEXT,           -- display name (from auth or crm lookup)
    user_avatar TEXT,         -- avatar URL for map/feed display

    -- Device context
    device TEXT,
    os TEXT,
    browser TEXT,
    user_agent TEXT,

    -- Geo context (CF headers)
    country TEXT,
    city TEXT,
    timezone TEXT,
    latitude REAL,            -- CF-geo lat for map dot placement
    longitude REAL,           -- CF-geo lng for map dot placement

    -- Traffic source
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,

    -- Page context
    page_title TEXT,          -- title of the page visited (for feed: "visited /blog")

    -- Session lifecycle (for real-time "online now" detection)
    last_seen_at TEXT,        -- updated on heartbeat; online = last_seen_at > now - 5min
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    -- total seconds on site, incremented by heartbeat

    is_bot INTEGER NOT NULL DEFAULT 0,
    visited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_visits_analytics_profile   ON visits_analytics (profile_id, visited_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_visits_analytics_cms       ON visits_analytics (profile_id, cms_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_visits_analytics_entity    ON visits_analytics (profile_id, entity_type, entity_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_visits_analytics_session   ON visits_analytics (session_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_visits_analytics_bot       ON visits_analytics (profile_id, is_bot)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_visits_analytics_realtime  ON visits_analytics (profile_id, last_seen_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS content_analytics (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    sad INTEGER NOT NULL DEFAULT 0,
    neutral INTEGER NOT NULL DEFAULT 0,
    happy INTEGER NOT NULL DEFAULT 0,
    total_reactions INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    os_breakdown TEXT NOT NULL DEFAULT '{}',
    browser_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    city_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_content_analytics_profile ON content_analytics (profile_id)"#,
    r#"CREATE TABLE IF NOT EXISTS cms_analytics (
    id TEXT PRIMARY KEY,
    cms_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_draft INTEGER NOT NULL DEFAULT 0,
    total_published INTEGER NOT NULL DEFAULT 0,
    total_reactions INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    total_submissions INTEGER NOT NULL DEFAULT 0,
    total_applications INTEGER NOT NULL DEFAULT 0,
    
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    views_device_breakdown TEXT NOT NULL DEFAULT '{}',
    views_os_breakdown TEXT NOT NULL DEFAULT '{}',
    views_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    views_country_breakdown TEXT NOT NULL DEFAULT '{}',
    views_city_breakdown TEXT NOT NULL DEFAULT '{}',
    views_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    
    bot_visits INTEGER NOT NULL DEFAULT 0,
    total_visits INTEGER NOT NULL DEFAULT 0,
    visits_7d TEXT NOT NULL DEFAULT '[]',
    visits_30d TEXT NOT NULL DEFAULT '[]',
    visits_12m TEXT NOT NULL DEFAULT '[]',
    visits_lifetime TEXT NOT NULL DEFAULT '{}',
    visits_device_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_os_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_country_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_city_breakdown TEXT NOT NULL DEFAULT '{}',
    visits_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    
    total_sales INTEGER NOT NULL DEFAULT 0,
    sales_7d TEXT NOT NULL DEFAULT '[]',
    sales_30d TEXT NOT NULL DEFAULT '[]',
    sales_12m TEXT NOT NULL DEFAULT '[]',
    sales_lifetime TEXT NOT NULL DEFAULT '{}',
    sales_device_breakdown TEXT NOT NULL DEFAULT '{}',
    sales_os_breakdown TEXT NOT NULL DEFAULT '{}',
    sales_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    sales_country_breakdown TEXT NOT NULL DEFAULT '{}',
    sales_city_breakdown TEXT NOT NULL DEFAULT '{}',
    sales_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    sales_utm_source TEXT NOT NULL DEFAULT '{}',
    sales_utm_medium TEXT NOT NULL DEFAULT '{}',
    sales_utm_campaign TEXT NOT NULL DEFAULT '{}',
    
    total_revenue INTEGER NOT NULL DEFAULT 0,
    revenue_7d TEXT NOT NULL DEFAULT '[]',
    revenue_30d TEXT NOT NULL DEFAULT '[]',
    revenue_12m TEXT NOT NULL DEFAULT '[]',
    revenue_lifetime TEXT NOT NULL DEFAULT '{}',
    
    email_opens INTEGER NOT NULL DEFAULT 0,
    email_clicks INTEGER NOT NULL DEFAULT 0,
    
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,

    r#"CREATE TRIGGER IF NOT EXISTS trg_content_insert
   AFTER INSERT ON content
   WHEN NEW.cms_id IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO content_analytics (
        id, content_id, profile_id
      ) VALUES (
        hex(randomblob(16)), NEW.id, NEW.profile_id
      );

      INSERT INTO cms_analytics (
        id,
        cms_id,
        profile_id,
        total_posts,
        total_published,
        total_draft,
        created_at,
        updated_at
      )
      VALUES (
        hex(randomblob(16)),
        NEW.cms_id,
       NEW.profile_id,
       1,
       CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       strftime('%Y-%m-%dT%H:%M:%SZ','now'),
       strftime('%Y-%m-%dT%H:%M:%SZ','now')
     )
     ON CONFLICT(cms_id) DO UPDATE SET
       total_posts     = total_posts + 1,
       total_published = total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       total_draft     = total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_content_update_published
   AFTER UPDATE OF published ON content
   WHEN NEW.cms_id IS NOT NULL AND NEW.published != OLD.published
   BEGIN
     UPDATE cms_analytics SET
       total_published = MAX(0, total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE -1 END),
       total_draft     = MAX(0, total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE -1 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = NEW.cms_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_content_delete
   AFTER DELETE ON content
   WHEN OLD.cms_id IS NOT NULL
   BEGIN
     UPDATE cms_analytics SET
       total_posts     = MAX(0, total_posts - 1),
       total_published = MAX(0, total_published - CASE WHEN OLD.published = 1 THEN 1 ELSE 0 END),
       total_draft     = MAX(0, total_draft - CASE WHEN OLD.published = 0 THEN 1 ELSE 0 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = OLD.cms_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_views_analytics_insert
    AFTER INSERT ON views_analytics
    BEGIN
      -- 1. Individual entity analytics
      UPDATE content_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.content_id IS NOT NULL AND content_id = NEW.content_id;

      UPDATE product_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.product_id IS NOT NULL AND product_id = NEW.product_id;

      UPDATE job_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.job_listing_id IS NOT NULL AND job_id = NEW.job_listing_id;

      UPDATE form_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.form_id IS NOT NULL AND form_id = NEW.form_id;

      UPDATE community_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.community_id IS NOT NULL AND community_id = NEW.community_id;

      UPDATE page_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.page_id IS NOT NULL AND page_id = NEW.page_id;

      UPDATE link_analytics_by_category SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END,
        updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE NEW.link_page_id IS NOT NULL 
        AND category_id = (SELECT category_id FROM link_pages WHERE id = NEW.link_page_id)
        AND profile_id = NEW.profile_id;

      -- 2. CMS hub analytics
      UPDATE cms_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END,
        updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE NEW.cms_id IS NOT NULL
        AND cms_id    = NEW.cms_id
        AND profile_id = NEW.profile_id;

      -- 3. Profile-level rollup (always last)
      UPDATE profile_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views   = bot_views   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END,
        updated_at  = strftime('%s','now')
      WHERE profile_id = NEW.profile_id;
    END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_visits_analytics_insert
    AFTER INSERT ON visits_analytics
    BEGIN
      -- 1. link_analytics_by_category
      UPDATE link_analytics_by_category SET
        total_visits = total_visits + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_visits   = bot_visits   + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END,
        updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE NEW.entity_type = 'link_page'
        AND category_id = (SELECT category_id FROM link_pages WHERE id = NEW.entity_id)
        AND profile_id = NEW.profile_id;

      -- 2. cms_analytics
      UPDATE cms_analytics SET
        total_visits = total_visits + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE NEW.cms_id IS NOT NULL
        AND cms_id = NEW.cms_id
        AND profile_id = NEW.profile_id;

      -- 3. profile_analytics
      UPDATE profile_analytics SET
        total_visits = total_visits + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        updated_at   = strftime('%s','now')
      WHERE profile_id = NEW.profile_id;
    END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_visits_analytics_delete
    AFTER DELETE ON visits_analytics
    BEGIN
      UPDATE link_analytics_by_category SET
        total_visits = MAX(0, total_visits - CASE WHEN OLD.is_bot = 0 THEN 1 ELSE 0 END),
        bot_visits   = MAX(0, bot_visits - CASE WHEN OLD.is_bot = 1 THEN 1 ELSE 0 END),
        updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE OLD.entity_type = 'link_page'
        AND category_id = (SELECT category_id FROM link_pages WHERE id = OLD.entity_id)
        AND profile_id = OLD.profile_id;

      UPDATE cms_analytics SET
        total_visits = MAX(0, total_visits - CASE WHEN OLD.is_bot = 0 THEN 1 ELSE 0 END),
        updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE OLD.cms_id IS NOT NULL
        AND cms_id = OLD.cms_id
        AND profile_id = OLD.profile_id;

      UPDATE profile_analytics SET
        total_visits = MAX(0, total_visits - CASE WHEN OLD.is_bot = 0 THEN 1 ELSE 0 END),
        updated_at   = strftime('%s','now')
      WHERE profile_id = OLD.profile_id;
    END"#,
    // ── Seeds ────────────────────────────────────────────────────────────────
    r#"INSERT OR IGNORE INTO collections (id, slug, title, description, icon, sort_order, is_default, category_id) VALUES ('col_docs_1', 'getting-started', 'Getting Started', 'Learn the basics', '🚀', 1, 1, 'cat_32')"#,
    r#"INSERT OR IGNORE INTO collections (id, slug, title, description, icon, sort_order, is_default, category_id) VALUES ('col_docs_2', 'account', 'Account', 'Manage your account settings', '👤', 2, 1, 'cat_32')"#,
    r#"INSERT OR IGNORE INTO collections (id, slug, title, description, icon, sort_order, is_default, category_id) VALUES ('col_docs_3', 'billing', 'Billing', 'Payment and subscription info', '💳', 3, 1, 'cat_32')"#,
    r#"INSERT OR IGNORE INTO collections (id, slug, title, description, icon, sort_order, is_default, category_id) VALUES ('col_docs_4', 'faq', 'FAQ', 'Frequently asked questions', '❓', 4, 1, 'cat_32')"#,
    r#"INSERT OR IGNORE INTO collections (id, slug, title, description, icon, sort_order, is_default, category_id) VALUES ('col_docs_5', 'api-and-integrations', 'API & Integrations', 'Developer resources', '🔌', 5, 1, 'cat_32')"#,
    r#"INSERT OR IGNORE INTO collections (id, slug, title, description, icon, sort_order, is_default, category_id) VALUES ('col_docs_6', 'other-guides', 'Other Guides', 'Additional help articles', '📚', 6, 1, 'cat_32')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000032', 'Docs', 'Documentation and Support', 'docs', 'cat_32')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000002', 'Tools', 'Tools and Resources', 'tools', 'cat_2')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000035', 'Blog', 'Read the latest blog', 'blog', 'cat_35')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000037', 'Notes', 'Share Notes with audience', 'notes', 'cat_37')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000036', 'Guides', 'Share guides to your subscribers', 'guides', 'cat_36')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000020', 'Newsletter', 'Newsletter subscriptions', 'n', 'cat_20')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000034', 'Forms', 'Fill the form', 'forms', 'cat_34')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000031', 'Jobs', 'Jobs Listing for hiring', 'jobs', 'cat_31')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000001', 'Links', 'General links and bookmarks', 'links', 'cat_1')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000038', 'Skills', 'Highlight your Skills', 'skills', 'cat_38')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000039', 'Prompt', 'Share AI Prompts', 'prompt', 'cat_39')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000040', 'Compare', 'Compare options', 'compare', 'cat_40')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000041', 'Alternative', 'List alternatives', 'alternative', 'cat_41')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000027', 'Listing', 'Real estate or item listings', 'listing', 'cat_27')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000030', 'Booking', 'Schedule appointments', 'booking', 'cat_30')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000025', 'Services', 'Offer professional services', 'services', 'cat_25')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000018', 'Courses', 'Educational courses', 'courses', 'cat_18')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000021', 'Sponsorship', 'Sponsorship opportunities', 'sponsorship', 'cat_21')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000019', 'Downloads', 'Digital downloads', 'downloads', 'cat_19')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000008', 'Events', 'Upcoming events', 'events', 'cat_8')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000045', 'Posts', 'Short posts and updates', 'posts', 'cat_45')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000022', 'Meetings', 'Schedule meetings', 'meetings', 'cat_22')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000024', 'Webinars', 'Host webinars', 'webinars', 'cat_24')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000042', 'Community', 'Join our community', 'community', 'cat_42')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000047', 'Pages', 'Custom pages', 'page', 'cat_47')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000046', 'Videos', 'Video content and library', 'videos', 'cat_46')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000048', 'Podcast', 'Podcast episodes and shows', 'podcast', 'cat_48')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000049', 'Membership', 'Membership groups and tiers', 'membership', 'cat_49')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000050', 'Subscription', 'Subscription products and plans', 'subscription', 'cat_50')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000051', 'AI Tools', 'AI tools and software', 'ai-tools', 'cat_51')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000006', 'Shop', 'Shop List', 'shop', 'cat_6')"#,
    r#"INSERT OR IGNORE INTO cms (id, title, description, slug, category_id) VALUES ('cc55cc55-0001-4000-8000-000000000005', 'Store', 'Store List', 'store', 'cat_5')"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[
    Migration { id: "20260808_content_idx_media_id", table: "content", sql: "CREATE INDEX IF NOT EXISTS idx_content_media_id ON content (profile_id, media_id);" },
];
