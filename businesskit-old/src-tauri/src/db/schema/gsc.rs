// src-tauri/src/db/schema/gsc.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// gsc.ts — Google Search Console + Google Analytics 4 Schema + Views
//
// Design:
//   External APIs (GSC + GA4) → gsc-service.ts fetches + writes raw data here
//   Triggers  → keep scalar counters + status labels live (zero app logic)
//   SQL Views → agent reads ONE view, gets full SEO context (like leaderboard_view)
//
// WHY server fetch is unavoidable:
//   SQLite triggers can only react to INSERT/UPDATE/DELETE in the same DB.
//   GSC + GA4 are external HTTP APIs. The fetch MUST happen in gsc-service.ts,
//   just like every other external service (Zernio, SES, Paddle, WorkOS).
//   BUT once data is written to UserDB, everything else is pure SQL.
//
// WHY no buildAgentSummary() TS function:
//   Agents read UserDB directly via Turso HTTP. A TS function doesn't help
//   them at all. A SQL VIEW does — agents query it like any table.
//
// Tables (written by gsc-service.ts after Google API calls):
//   gsc_ga4_sync        — connection state + sync watermarks (1 row/profile)
//   gsc_snapshots       — daily time series arrays (1 row/profile, replaced)
//   gsc_queries         — top search queries (≤500 rows/profile, replaced)
//   gsc_pages           — top pages (≤500 rows/profile, replaced)
//   gsc_countries       — country breakdown from GSC (≤50 rows/profile)
//   ga4_snapshots       — GA4 daily time series (1 row/profile, replaced)
//   ga4_pages           — top GA4 pages (≤500 rows/profile, replaced)
//   ga4_sources         — traffic channels (≤50 rows/profile, replaced)
//   ga4_devices         — device split (≤10 rows/profile, replaced)
//   ga4_countries       — GA4 country breakdown (≤50 rows/profile)
//
// Triggers (fire after gsc-service.ts writes):
//   trg_gsc_query_status          — derives status label on INSERT into gsc_queries
//   trg_gsc_page_status           — derives status label on INSERT into gsc_pages
//   trg_gsc_sync_query_counts     — keeps gsc_ga4_sync counters live
//   trg_gsc_sync_page_counts      — keeps gsc_ga4_sync page count live
//
// Views (agents query these directly):
//   gsc_agent_context_view        — full SEO summary (like community_leaderboard_view)
//   gsc_opportunities_view        — quick-win keywords: pos 11-20 with impressions
//   gsc_content_health_view       — per-page: GSC + GA4 side by side
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS gsc_ga4_sync (
    profile_id TEXT PRIMARY KEY,

    -- GSC connection
    gsc_connected INTEGER NOT NULL DEFAULT 0,
    gsc_site_url TEXT,
    gsc_verified_at INTEGER,
    gsc_last_synced_at INTEGER,
    gsc_last_error TEXT,
    gsc_sync_range_days INTEGER NOT NULL DEFAULT 90,

    -- GSC current-period totals (written by service after sync)
    gsc_total_clicks INTEGER NOT NULL DEFAULT 0,
    gsc_total_impressions INTEGER NOT NULL DEFAULT 0,
    gsc_avg_ctr_bps INTEGER NOT NULL DEFAULT 0,       -- basis points: 527 = 5.27%
    gsc_avg_position_x10 INTEGER NOT NULL DEFAULT 0,  -- x10: 143 = pos 14.3
    gsc_prev_clicks INTEGER NOT NULL DEFAULT 0,       -- previous period for delta
    gsc_prev_impressions INTEGER NOT NULL DEFAULT 0,

    -- Counts kept live by triggers on gsc_queries + gsc_pages INSERT
    gsc_query_count INTEGER NOT NULL DEFAULT 0,
    gsc_page_count INTEGER NOT NULL DEFAULT 0,
    gsc_opportunity_count INTEGER NOT NULL DEFAULT 0,     -- pos 11-20 with impressions
    gsc_low_visibility_count INTEGER NOT NULL DEFAULT 0,  -- impressions>10, clicks=0

    -- GA4 connection
    ga4_connected INTEGER NOT NULL DEFAULT 0,
    ga4_property_id TEXT,
    ga4_property_name TEXT,
    ga4_last_synced_at INTEGER,
    ga4_last_error TEXT,
    ga4_sync_range_days INTEGER NOT NULL DEFAULT 28,

    -- GA4 current-period totals (written by service after sync)
    ga4_total_sessions INTEGER NOT NULL DEFAULT 0,
    ga4_total_users INTEGER NOT NULL DEFAULT 0,
    ga4_total_pageviews INTEGER NOT NULL DEFAULT 0,
    ga4_bounce_rate_bps INTEGER NOT NULL DEFAULT 0,
    ga4_avg_session_duration_s INTEGER NOT NULL DEFAULT 0,
    ga4_prev_sessions INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE TABLE IF NOT EXISTS gsc_snapshots (
    profile_id TEXT PRIMARY KEY,

    -- Rolling window for charts (replaced each sync)
    dates TEXT NOT NULL DEFAULT '[]',
    clicks TEXT NOT NULL DEFAULT '[]',
    impressions TEXT NOT NULL DEFAULT '[]',
    ctr TEXT NOT NULL DEFAULT '[]',
    position TEXT NOT NULL DEFAULT '[]',
    device_clicks TEXT NOT NULL DEFAULT '{}',
    device_impressions TEXT NOT NULL DEFAULT '{}',
    period_label TEXT,
    period_start TEXT,
    period_end TEXT,

    -- History layer (merged/extended each sync — same as profile_analytics pattern)
    clicks_30d TEXT NOT NULL DEFAULT '[]',          -- [N×30] rolling daily
    clicks_12m TEXT NOT NULL DEFAULT '[]',          -- [N×12] monthly totals
    clicks_lifetime TEXT NOT NULL DEFAULT '{}',     -- {"YYYY-MM": N}
    impressions_30d TEXT NOT NULL DEFAULT '[]',
    impressions_12m TEXT NOT NULL DEFAULT '[]',
    impressions_lifetime TEXT NOT NULL DEFAULT '{}',

    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE TABLE IF NOT EXISTS gsc_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    query TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr_bps INTEGER NOT NULL DEFAULT 0,
    position_x10 INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'normal',
    -- 'top_ranked'     = position ≤ 10 AND clicks > 0
    -- 'opportunity'    = position 11-20 AND impressions ≥ 10
    -- 'low_visibility' = impressions ≥ 10 AND clicks = 0
    -- 'normal'         = everything else
    period_start TEXT,
    period_end TEXT,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_gsc_queries_profile ON gsc_queries (profile_id, clicks DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_gsc_queries_status  ON gsc_queries (profile_id, status)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_queries_unique ON gsc_queries (profile_id, query)"#,
    r#"CREATE TABLE IF NOT EXISTS gsc_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    page TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr_bps INTEGER NOT NULL DEFAULT 0,
    position_x10 INTEGER NOT NULL DEFAULT 0,
    top_queries TEXT NOT NULL DEFAULT '[]',     -- JSON [{query,clicks,position}] top-5
    status TEXT NOT NULL DEFAULT 'normal',      -- same labels as gsc_queries
    period_start TEXT,
    period_end TEXT,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_gsc_pages_profile ON gsc_pages (profile_id, clicks DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_gsc_pages_status  ON gsc_pages (profile_id, status)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_pages_unique ON gsc_pages (profile_id, page)"#,
    r#"CREATE TABLE IF NOT EXISTS gsc_countries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    country TEXT NOT NULL,          -- ISO 3166-1 alpha-3 e.g. 'usa'
    country_name TEXT,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr_bps INTEGER NOT NULL DEFAULT 0,
    position_x10 INTEGER NOT NULL DEFAULT 0,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_gsc_countries_profile ON gsc_countries (profile_id, clicks DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_countries_unique ON gsc_countries (profile_id, country)"#,
    r#"CREATE TABLE IF NOT EXISTS ga4_snapshots (
    profile_id TEXT PRIMARY KEY,

    -- Rolling window (replaced each sync)
    dates TEXT NOT NULL DEFAULT '[]',
    sessions TEXT NOT NULL DEFAULT '[]',
    users TEXT NOT NULL DEFAULT '[]',
    new_users TEXT NOT NULL DEFAULT '[]',
    pageviews TEXT NOT NULL DEFAULT '[]',
    bounce_rate TEXT NOT NULL DEFAULT '[]',
    session_duration TEXT NOT NULL DEFAULT '[]',
    period_label TEXT,
    period_start TEXT,
    period_end TEXT,

    -- History layer (merged each sync)
    sessions_30d TEXT NOT NULL DEFAULT '[]',          -- [N×30] rolling daily
    sessions_12m TEXT NOT NULL DEFAULT '[]',          -- [N×12] monthly totals
    sessions_lifetime TEXT NOT NULL DEFAULT '{}',     -- {"YYYY-MM": N}
    pageviews_30d TEXT NOT NULL DEFAULT '[]',
    pageviews_12m TEXT NOT NULL DEFAULT '[]',
    pageviews_lifetime TEXT NOT NULL DEFAULT '{}',

    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE TABLE IF NOT EXISTS ga4_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    page TEXT NOT NULL,
    page_title TEXT,
    sessions INTEGER NOT NULL DEFAULT 0,
    users INTEGER NOT NULL DEFAULT 0,
    pageviews INTEGER NOT NULL DEFAULT 0,
    bounce_rate_bps INTEGER NOT NULL DEFAULT 0,
    avg_session_duration_s INTEGER NOT NULL DEFAULT 0,
    entrance_rate_bps INTEGER NOT NULL DEFAULT 0,
    period_start TEXT,
    period_end TEXT,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ga4_pages_profile ON ga4_pages (profile_id, sessions DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_ga4_pages_unique ON ga4_pages (profile_id, page)"#,
    r#"CREATE TABLE IF NOT EXISTS ga4_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    source TEXT,
    medium TEXT,
    sessions INTEGER NOT NULL DEFAULT 0,
    users INTEGER NOT NULL DEFAULT 0,
    sessions_pct_bps INTEGER NOT NULL DEFAULT 0,
    period_start TEXT,
    period_end TEXT,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ga4_sources_profile ON ga4_sources (profile_id, sessions DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_ga4_sources_unique ON ga4_sources (profile_id, channel, source, medium)"#,
    r#"CREATE TABLE IF NOT EXISTS ga4_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    device_category TEXT NOT NULL,
    sessions INTEGER NOT NULL DEFAULT 0,
    users INTEGER NOT NULL DEFAULT 0,
    sessions_pct_bps INTEGER NOT NULL DEFAULT 0,
    bounce_rate_bps INTEGER NOT NULL DEFAULT 0,
    period_start TEXT,
    period_end TEXT,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ga4_devices_profile ON ga4_devices (profile_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_ga4_devices_unique ON ga4_devices (profile_id, device_category)"#,
    r#"CREATE TABLE IF NOT EXISTS ga4_countries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT,
    sessions INTEGER NOT NULL DEFAULT 0,
    users INTEGER NOT NULL DEFAULT 0,
    sessions_pct_bps INTEGER NOT NULL DEFAULT 0,
    period_start TEXT,
    period_end TEXT,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ga4_countries_profile ON ga4_countries (profile_id, sessions DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_ga4_countries_unique ON ga4_countries (profile_id, country)"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_gsc_query_status
   AFTER INSERT ON gsc_queries
   BEGIN
     UPDATE gsc_queries
     SET status = CASE
       WHEN NEW.position_x10 <= 100 AND NEW.clicks > 0  THEN 'top_ranked'
       WHEN NEW.position_x10 > 100 AND NEW.position_x10 <= 200 AND NEW.impressions >= 10 THEN 'opportunity'
       WHEN NEW.impressions >= 10 AND NEW.clicks = 0     THEN 'low_visibility'
       ELSE 'normal'
     END
     WHERE id = NEW.id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_gsc_page_status
   AFTER INSERT ON gsc_pages
   BEGIN
     UPDATE gsc_pages
     SET status = CASE
       WHEN NEW.position_x10 <= 100 AND NEW.clicks > 0  THEN 'top_ranked'
       WHEN NEW.position_x10 > 100 AND NEW.position_x10 <= 200 AND NEW.impressions >= 10 THEN 'opportunity'
       WHEN NEW.impressions >= 10 AND NEW.clicks = 0     THEN 'low_visibility'
       ELSE 'normal'
     END
     WHERE id = NEW.id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_gsc_sync_query_counts
   AFTER INSERT ON gsc_queries
   BEGIN
     INSERT INTO gsc_ga4_sync (
       profile_id, gsc_query_count, gsc_opportunity_count, gsc_low_visibility_count
     ) VALUES (
       NEW.profile_id,
       (SELECT COUNT(*) FROM gsc_queries WHERE profile_id = NEW.profile_id),
       (SELECT COUNT(*) FROM gsc_queries WHERE profile_id = NEW.profile_id AND status = 'opportunity'),
       (SELECT COUNT(*) FROM gsc_queries WHERE profile_id = NEW.profile_id AND status = 'low_visibility')
     )
     ON CONFLICT(profile_id) DO UPDATE SET
       gsc_query_count          = (SELECT COUNT(*) FROM gsc_queries WHERE profile_id = NEW.profile_id),
       gsc_opportunity_count    = (SELECT COUNT(*) FROM gsc_queries WHERE profile_id = NEW.profile_id AND status = 'opportunity'),
       gsc_low_visibility_count = (SELECT COUNT(*) FROM gsc_queries WHERE profile_id = NEW.profile_id AND status = 'low_visibility'),
       updated_at               = strftime('%s','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_gsc_sync_page_counts
   AFTER INSERT ON gsc_pages
   BEGIN
     INSERT INTO gsc_ga4_sync (profile_id, gsc_page_count)
     VALUES (
       NEW.profile_id,
       (SELECT COUNT(*) FROM gsc_pages WHERE profile_id = NEW.profile_id)
     )
     ON CONFLICT(profile_id) DO UPDATE SET
       gsc_page_count = (SELECT COUNT(*) FROM gsc_pages WHERE profile_id = NEW.profile_id),
       updated_at     = strftime('%s','now');
   END"#,
    r#"CREATE VIEW IF NOT EXISTS gsc_agent_context_view AS
  SELECT
    s.profile_id,

    -- Connection state (agent checks this first)
    s.gsc_connected,
    s.gsc_site_url,
    datetime(s.gsc_last_synced_at, 'unixepoch') AS gsc_last_synced,
    s.ga4_connected,
    s.ga4_property_id,
    datetime(s.ga4_last_synced_at, 'unixepoch') AS ga4_last_synced,
    s.gsc_sync_range_days,
    s.ga4_sync_range_days,

    -- GSC overview (raw for calculations)
    s.gsc_total_clicks,
    s.gsc_total_impressions,
    ROUND(CAST(s.gsc_avg_ctr_bps AS REAL) / 100.0, 2)         AS gsc_avg_ctr_pct,
    ROUND(CAST(s.gsc_avg_position_x10 AS REAL) / 10.0, 1)     AS gsc_avg_position,
    s.gsc_query_count,
    s.gsc_page_count,
    s.gsc_opportunity_count,
    s.gsc_low_visibility_count,

    -- Click trend vs previous period
    CASE
      WHEN s.gsc_prev_clicks = 0 THEN 'flat'
      WHEN CAST(s.gsc_total_clicks AS REAL) / s.gsc_prev_clicks > 1.02 THEN 'up'
      WHEN CAST(s.gsc_total_clicks AS REAL) / s.gsc_prev_clicks < 0.98 THEN 'down'
      ELSE 'flat'
    END AS gsc_click_trend,
    CASE
      WHEN s.gsc_prev_clicks = 0 THEN 0
      ELSE ROUND((CAST(s.gsc_total_clicks - s.gsc_prev_clicks AS REAL) / s.gsc_prev_clicks) * 100, 1)
    END AS gsc_click_change_pct,

    -- GA4 overview
    s.ga4_total_sessions,
    s.ga4_total_users,
    s.ga4_total_pageviews,
    ROUND(CAST(s.ga4_bounce_rate_bps AS REAL) / 100.0, 2)     AS ga4_bounce_rate_pct,
    s.ga4_avg_session_duration_s,

    -- Session trend
    CASE
      WHEN s.ga4_prev_sessions = 0 THEN 'flat'
      WHEN CAST(s.ga4_total_sessions AS REAL) / NULLIF(s.ga4_prev_sessions, 0) > 1.02 THEN 'up'
      WHEN CAST(s.ga4_total_sessions AS REAL) / NULLIF(s.ga4_prev_sessions, 0) < 0.98 THEN 'down'
      ELSE 'flat'
    END AS ga4_session_trend,
    CASE
      WHEN s.ga4_prev_sessions = 0 THEN 0
      ELSE ROUND((CAST(s.ga4_total_sessions - s.ga4_prev_sessions AS REAL) / s.ga4_prev_sessions) * 100, 1)
    END AS ga4_session_change_pct,

    -- Top items (correlated subqueries — computed fresh on every read)
    (SELECT query  FROM gsc_queries  WHERE profile_id = s.profile_id ORDER BY clicks DESC LIMIT 1) AS top_query,
    (SELECT clicks FROM gsc_queries  WHERE profile_id = s.profile_id ORDER BY clicks DESC LIMIT 1) AS top_query_clicks,
    (SELECT ROUND(CAST(position_x10 AS REAL)/10.0,1)
                   FROM gsc_queries  WHERE profile_id = s.profile_id ORDER BY clicks DESC LIMIT 1) AS top_query_position,
    (SELECT page   FROM gsc_pages    WHERE profile_id = s.profile_id ORDER BY clicks DESC LIMIT 1) AS top_page,
    (SELECT clicks FROM gsc_pages    WHERE profile_id = s.profile_id ORDER BY clicks DESC LIMIT 1) AS top_page_clicks,
    (SELECT channel FROM ga4_sources WHERE profile_id = s.profile_id ORDER BY sessions DESC LIMIT 1) AS top_channel,
    (SELECT ROUND(CAST(sessions_pct_bps AS REAL)/100.0,1)
                   FROM ga4_sources  WHERE profile_id = s.profile_id ORDER BY sessions DESC LIMIT 1) AS top_channel_pct,
    (SELECT country_name FROM gsc_countries WHERE profile_id = s.profile_id ORDER BY clicks DESC LIMIT 1) AS top_country,
    (SELECT ROUND(CAST(sessions_pct_bps AS REAL)/100.0,1)
                   FROM ga4_devices  WHERE profile_id = s.profile_id AND device_category = 'mobile' LIMIT 1) AS mobile_session_pct,

    -- Plain-text action hints — agents read these for immediate context
    CASE
      WHEN s.gsc_connected = 0
        THEN 'GSC not connected. User needs to connect at /dashboard/settings/integrations.'
      WHEN s.gsc_opportunity_count >= 5
        THEN s.gsc_opportunity_count || ' keywords rank positions 11-20 with impressions — target these for quick ranking wins.'
      WHEN s.gsc_low_visibility_count >= 10
        THEN s.gsc_low_visibility_count || ' pages have impressions but zero clicks — improve meta titles and descriptions.'
      WHEN s.gsc_prev_clicks > 0 AND CAST(s.gsc_total_clicks AS REAL) / s.gsc_prev_clicks < 0.98
        THEN 'Organic clicks dropped ' || ABS(ROUND((CAST(s.gsc_total_clicks - s.gsc_prev_clicks AS REAL)/s.gsc_prev_clicks)*100,0)) || '% vs previous period — investigate.'
      ELSE 'GSC performance nominal for period.'
    END AS seo_action_hint,

    CASE
      WHEN s.ga4_connected = 0
        THEN 'GA4 not connected. User needs to connect at /dashboard/settings/integrations.'
      WHEN s.ga4_prev_sessions > 0
        AND CAST(s.ga4_total_sessions AS REAL) / s.ga4_prev_sessions < 0.80
        THEN 'Traffic down ' || ABS(ROUND((1 - CAST(s.ga4_total_sessions AS REAL)/s.ga4_prev_sessions)*100,0)) || '% vs previous period — cross-check with GSC.'
      WHEN s.ga4_bounce_rate_bps > 7000
        THEN 'High bounce rate ' || ROUND(CAST(s.ga4_bounce_rate_bps AS REAL)/100.0,1) || '% — landing page content may not match search intent.'
      ELSE 'GA4 traffic nominal for period.'
    END AS traffic_action_hint

  FROM gsc_ga4_sync s"#,
    r#"CREATE VIEW IF NOT EXISTS gsc_opportunities_view AS
  SELECT
    q.profile_id,
    q.query,
    q.clicks,
    q.impressions,
    ROUND(CAST(q.ctr_bps AS REAL) / 100.0, 2)      AS ctr_pct,
    ROUND(CAST(q.position_x10 AS REAL) / 10.0, 1)  AS position,
    (q.impressions - q.clicks)                       AS untapped_impressions,
    q.period_start,
    q.period_end
  FROM gsc_queries q
  WHERE q.status = 'opportunity'
  ORDER BY q.impressions DESC"#,
    r#"CREATE VIEW IF NOT EXISTS gsc_content_health_view AS
  SELECT
    gp.profile_id,
    gp.page                                                     AS url,
    gp.clicks                                                   AS gsc_clicks,
    gp.impressions                                              AS gsc_impressions,
    ROUND(CAST(gp.ctr_bps AS REAL)/100.0, 2)                   AS gsc_ctr_pct,
    ROUND(CAST(gp.position_x10 AS REAL)/10.0, 1)               AS gsc_position,
    gp.status                                                   AS gsc_status,
    gp.top_queries                                              AS top_queries_json,
    COALESCE(a4.sessions, 0)                                    AS ga4_sessions,
    COALESCE(a4.pageviews, 0)                                   AS ga4_pageviews,
    COALESCE(a4.page_title, '')                                 AS page_title,
    ROUND(CAST(COALESCE(a4.bounce_rate_bps,0) AS REAL)/100.0,2) AS ga4_bounce_rate_pct,
    COALESCE(a4.avg_session_duration_s, 0)                     AS ga4_avg_duration_s,
    CASE
      WHEN gp.impressions > 50 AND COALESCE(a4.sessions, 0) = 0 THEN 'landing_issue'
      WHEN gp.clicks > 0 AND COALESCE(a4.bounce_rate_bps, 0) > 8000  THEN 'high_bounce'
      WHEN gp.status = 'opportunity'                                   THEN 'seo_opportunity'
      WHEN gp.status = 'low_visibility'                                THEN 'needs_meta_work'
      WHEN gp.status = 'top_ranked'                                    THEN 'performing'
      ELSE 'normal'
    END AS health_status
  FROM gsc_pages gp
  LEFT JOIN ga4_pages a4
    ON  a4.profile_id = gp.profile_id
    AND gp.page LIKE '%' || a4.page"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
