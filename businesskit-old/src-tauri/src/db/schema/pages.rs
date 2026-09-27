use super::Migration;

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    user_id TEXT NOT NULL,
    updated_by TEXT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT,
    nav_active INTEGER DEFAULT 1,
    menu_active INTEGER DEFAULT 1,
    footer_active INTEGER DEFAULT 1,
    published INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER,
    sections TEXT NOT NULL DEFAULT '[]',
    faq TEXT DEFAULT '[]',
    ai_summary TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_og_image TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_pages_profile_id ON pages (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_pages_archived ON pages (profile_id, archived)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages (slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_pages_published ON pages (published)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages (user_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_pages_updated_by ON pages (profile_id, updated_by)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_pages_profile_published ON pages (profile_id, published)"#,
    // ── user_components ───────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS user_components (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    thumbnail_url TEXT,
    html TEXT NOT NULL,
    css TEXT,
    js TEXT,
    schema TEXT DEFAULT '[]',
    source TEXT DEFAULT 'manual',
    type TEXT DEFAULT 'custom',
    collection TEXT DEFAULT 'Custom',
    is_primary INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_user_components_profile_id ON user_components (profile_id)"#,
    // ── page_analytics ───────────────────────────────────────────────────────────
    r#"CREATE TABLE IF NOT EXISTS page_analytics (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    bot_views INTEGER NOT NULL DEFAULT 0,
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
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_page_analytics_page_id ON page_analytics (page_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_page_analytics_profile_id ON page_analytics (profile_id)"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];

pub const SEED_SQL: &[&str] = &[
    r#"INSERT OR IGNORE INTO pages (id, profile_id, user_id, slug, title, excerpt, nav_active, menu_active, footer_active, published, sections, faq, created_at, updated_at) VALUES ('page_home_default', 'default', 'owner', 'home', 'Home', 'Welcome to my website', 1, 1, 1, 1, '[]', '[]', strftime('%s','now'), strftime('%s','now'))"#,
];
