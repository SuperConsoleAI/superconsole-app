// src-tauri/src/db/schema/feedback.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// feedback.ts — Upvoty-style Feedback + Roadmap Schema
// Provisioned via provision.ts → provisionUserDatabase()
//
// Feature surface (mirrors Upvoty):
//   Boards          → multiple feedback boards per profile (Feature Requests, Bugs…)
//   Posts           → user-submitted feedback items with title + description
//   Votes           → upvote/downvote per voter per post (UNIQUE — prevents duplicates)
//   Comments        → threaded comments on posts (reply_to_id for nesting)
//   Tags            → admin-managed labels (Bug, Enhancement, UX, Performance…)
//   Changelog       → release notes with linked feedback posts ("What shipped")
//   Voters          → email-identified submitters (like community_members)
//   Analytics       → per-board scalar counters (trigger-maintained) + JSON breakdowns
//
// DB Triggers (scalar counters at zero CF Worker cost):
//   trg_feedback_vote_insert        → post.vote_count + 1, board.total_votes + 1
//   trg_feedback_vote_delete        → post.vote_count - 1, board.total_votes - 1
//   trg_feedback_comment_insert     → post.comment_count + 1, board.total_comments + 1
//   trg_feedback_comment_delete     → post.comment_count - 1, board.total_comments - 1
//   trg_feedback_post_insert        → board.total_posts + 1, analytics upsert
//   trg_feedback_post_status_change → board.status breakdowns, completed counter
//   trg_feedback_post_pin           → board.pinned_count
//   trg_feedback_voter_insert       → board.total_voters + 1
//
// Views:
//   feedback_board_context_view     → agent: one-row-per-board full context
//   feedback_trending_view          → hot score (votes + recency) last 30d
//
// Status workflow (Upvoty-compatible):
//   open → under_review → planned → in_progress → completed | declined | duplicate
//
// Tables (11):
//   feedback_boards
//   feedback_posts
//   feedback_votes
//   feedback_comments
//   feedback_tags
//   feedback_post_tags        (junction — no FK constraint, cross-DB safe)
//   feedback_changelog
//   feedback_changelog_posts  (junction)
//   feedback_voters
//   feedback_analytics        (1 row per board — scalar=triggers, JSON=on-demand)
//   feedback_subscriptions    (voter subscribes to post status updates)
// ─────────────────────────────────────────────────────────────────────────────

pub const SCHEMA_SQL: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS feedback_boards (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    logo_url TEXT,

    -- Display settings
    color TEXT NOT NULL DEFAULT '#6366f1',
    emoji TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- Visibility
    is_active INTEGER NOT NULL DEFAULT 1,
    is_public INTEGER NOT NULL DEFAULT 1,
    -- 0 = private (only logged-in users of YOUR WorkOS can submit)
    is_private INTEGER NOT NULL DEFAULT 0,
    allow_anonymous INTEGER NOT NULL DEFAULT 1,
    -- allow submissions without email

    -- Submission settings
    require_email INTEGER NOT NULL DEFAULT 1,
    require_approval INTEGER NOT NULL DEFAULT 0,
    -- posts start as 'pending' and need admin approval before going public
    allow_comments INTEGER NOT NULL DEFAULT 1,
    allow_attachments INTEGER NOT NULL DEFAULT 0,
    max_votes_per_user INTEGER NOT NULL DEFAULT 0,
    -- 0 = unlimited

    -- Branding (for embedded / public widget)
    widget_title TEXT,
    widget_placeholder TEXT,
    powered_by_hidden INTEGER NOT NULL DEFAULT 0,

    -- Notifications
    notify_new_post INTEGER NOT NULL DEFAULT 1,
    notify_new_comment INTEGER NOT NULL DEFAULT 0,

    -- Scalar counters (trigger-maintained)
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_votes INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    total_voters INTEGER NOT NULL DEFAULT 0,
    pending_posts INTEGER NOT NULL DEFAULT 0,
    completed_posts INTEGER NOT NULL DEFAULT 0,
    pinned_count INTEGER NOT NULL DEFAULT 0,

    -- SEO
    seo_title TEXT,
    seo_description TEXT,
    seo_og_image TEXT,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_boards_profile    ON feedback_boards (profile_id, sort_order ASC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_boards_slug ON feedback_boards (profile_id, slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_boards_active      ON feedback_boards (profile_id, is_active)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_voters (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,

    -- Identity
    user_id TEXT,
    -- FK → users.id (NULL = anonymous/external voter)
    email TEXT,
    name TEXT,
    avatar_url TEXT,

    -- Attribution
    role TEXT NOT NULL DEFAULT 'user',
    -- 'user' | 'admin' | 'moderator'
    is_admin INTEGER NOT NULL DEFAULT 0,

    -- Engagement counters (trigger-maintained)
    post_count INTEGER NOT NULL DEFAULT 0,
    vote_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,

    -- UTM / device
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    device TEXT,
    country TEXT,
    city TEXT,

    -- State
    is_blocked INTEGER NOT NULL DEFAULT 0,
    blocked_at INTEGER,
    blocked_reason TEXT,

    joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_active_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_voters_board    ON feedback_voters (board_id, joined_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_voters_profile  ON feedback_voters (profile_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_voters_user_id  ON feedback_voters (user_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_voters_email ON feedback_voters (board_id, email)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_voters_active   ON feedback_voters (board_id, is_blocked)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_posts (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,

    -- Author
    voter_id TEXT,
    -- FK → feedback_voters.id (NULL = submitted by admin)
    author_name TEXT,
    author_email TEXT,
    author_avatar_url TEXT,
    is_admin_post INTEGER NOT NULL DEFAULT 0,

    -- Content
    title TEXT NOT NULL,
    description TEXT,
    attachment_urls TEXT NOT NULL DEFAULT '[]',
    -- JSON: ["https://cdn.example.com/screenshot.png"]
    custom_fields_data TEXT NOT NULL DEFAULT '{}',
    -- JSON key-value pairs matching feedback_custom_fields

    -- Admin-managed fields
    status TEXT NOT NULL DEFAULT 'open',
    -- 'pending' | 'open' | 'under_review' | 'planned' | 'in_progress'
    -- | 'completed' | 'declined' | 'duplicate'
    assigned_to TEXT,
    -- FK -> users.id (team member assigned to this post)
    admin_comment TEXT,
    -- Internal admin note (not shown publicly)
    public_response TEXT,
    -- Admin's public update shown under the post
    eta TEXT,
    -- Expected delivery date (ISO) — shown on roadmap
    merge_into_id TEXT,
    -- FK → feedback_posts.id (when status = 'duplicate')

    -- Priority (admin-assigned)
    priority TEXT NOT NULL DEFAULT 'none',
    -- 'none' | 'low' | 'medium' | 'high' | 'critical'

    -- Roadmap inclusion
    in_roadmap INTEGER NOT NULL DEFAULT 0,
    roadmap_order INTEGER,

    -- Engagement (trigger-maintained)
    vote_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,

    -- Hot score (approx: vote_count / (age_hours + 2)^1.5)
    hot_score REAL NOT NULL DEFAULT 0,

    -- Pinning
    is_pinned INTEGER NOT NULL DEFAULT 0,
    pin_expires_at INTEGER,

    -- Visibility
    hidden INTEGER NOT NULL DEFAULT 0,
    is_private INTEGER NOT NULL DEFAULT 0,
    -- private posts only visible to admin and the submitter

    -- Attribution
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    device TEXT,
    country TEXT,
    ip_address TEXT,

    -- Status change timestamps
    reviewed_at INTEGER,
    planned_at INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    declined_at INTEGER,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_board       ON feedback_posts (board_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_profile     ON feedback_posts (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_status      ON feedback_posts (board_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_votes       ON feedback_posts (board_id, vote_count DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_hot         ON feedback_posts (board_id, hot_score DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_roadmap     ON feedback_posts (board_id, in_roadmap, roadmap_order ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_voter       ON feedback_posts (voter_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_pinned      ON feedback_posts (board_id, is_pinned DESC, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_priority    ON feedback_posts (board_id, priority)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_posts_duplicate   ON feedback_posts (merge_into_id)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_votes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    voter_id TEXT,
    -- FK → feedback_voters.id (NULL only if allow_anonymous && no email captured)
    email TEXT,
    vote_type TEXT NOT NULL DEFAULT 'up',
    -- 'up' | 'down'
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_votes_unique ON feedback_votes (post_id, voter_id) WHERE voter_id IS NOT NULL"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_votes_email  ON feedback_votes (post_id, email) WHERE email IS NOT NULL"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_votes_post          ON feedback_votes (post_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_votes_voter         ON feedback_votes (voter_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_votes_board         ON feedback_votes (board_id, created_at DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    voter_id TEXT,
    -- FK → feedback_voters.id
    reply_to_id TEXT,
    -- FK → feedback_comments.id (NULL = top-level)

    -- Author (denormalized for display)
    author_name TEXT,
    author_email TEXT,
    author_avatar_url TEXT,
    is_admin TEXT NOT NULL DEFAULT '0',
    -- '1' = posted by profile owner / admin

    -- Content
    body TEXT NOT NULL,
    attachment_urls TEXT NOT NULL DEFAULT '[]',

    -- Admin features
    is_official_response INTEGER NOT NULL DEFAULT 0,
    -- Pinned official response shown prominently

    -- State
    status TEXT NOT NULL DEFAULT 'published',
    -- 'published' | 'removed' | 'spam'
    removed_by TEXT,
    removed_at INTEGER,

    -- Engagement
    like_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,

    hidden INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_comments_post    ON feedback_comments (post_id, created_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_comments_parent  ON feedback_comments (reply_to_id, created_at ASC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_comments_voter   ON feedback_comments (voter_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_comments_board   ON feedback_comments (board_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_comments_official ON feedback_comments (post_id, is_official_response DESC)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_tags (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    description TEXT,
    post_count INTEGER NOT NULL DEFAULT 0,
    -- Denormalized, maintained by app layer (trigger cost not worth it for tags)
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_tags_profile    ON feedback_tags (profile_id, sort_order ASC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_tags_slug ON feedback_tags (profile_id, slug)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_post_tags (
    post_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (post_id, tag_id)
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_post_tags_tag     ON feedback_post_tags (tag_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_post_tags_profile ON feedback_post_tags (profile_id)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_custom_fields (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    -- 'text' | 'textarea' | 'select' | 'number'
    options TEXT,
    -- JSON array of options if field_type is select
    is_required INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_custom_fields_board ON feedback_custom_fields (board_id, sort_order ASC)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_notification_logs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    post_id TEXT NOT NULL,

    -- What triggered the notification
    trigger_type TEXT NOT NULL DEFAULT 'status_change',
    -- 'status_change' | 'manual_blast' | 'eta_update' | 'public_response'
    
    new_status TEXT,
    -- snapshot of the status at send time

    -- Delivery stats
    recipient_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,

    -- Who sent it
    sent_by TEXT NOT NULL DEFAULT 'system',
    -- 'system' (auto on status change) | 'admin' (manual blast button)

    sent_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_notif_logs_post ON feedback_notification_logs (post_id, trigger_type, new_status)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_changelog (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    -- Content
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    body TEXT NOT NULL,
    -- Markdown / rich text
    summary TEXT,
    -- 1-2 line summary for list view
    hero_image_url TEXT,

    -- Categorization
    type TEXT NOT NULL DEFAULT 'update',
    -- 'update' | 'feature' | 'improvement' | 'fix' | 'breaking' | 'announcement'
    version TEXT,
    -- Semantic version: '2.1.0' (optional)
    is_breaking INTEGER NOT NULL DEFAULT 0,

    -- Publishing
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    published_at INTEGER,

    -- Engagement
    reactions TEXT NOT NULL DEFAULT '{}',
    -- JSON: {"🎉":12,"❤️":8,"👍":5} — emoji reactions

    -- SEO
    seo_title TEXT,
    seo_description TEXT,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_changelog_profile   ON feedback_changelog (profile_id, created_at DESC)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_changelog_published ON feedback_changelog (profile_id, published, published_at DESC)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_changelog_slug ON feedback_changelog (profile_id, slug)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_changelog_type       ON feedback_changelog (profile_id, type)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_changelog_posts (
    changelog_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (changelog_id, post_id)
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_changelog_posts_post ON feedback_changelog_posts (post_id)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_subscriptions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    voter_id TEXT,
    email TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'email',
    is_active INTEGER NOT NULL DEFAULT 1,
    subscribed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    unsubscribed_at INTEGER
  )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_subs_post    ON feedback_subscriptions (post_id, is_active)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_subs_voter   ON feedback_subscriptions (voter_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_fb_subs_board   ON feedback_subscriptions (board_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_subs_unique ON feedback_subscriptions (post_id, email)"#,
    r#"CREATE TABLE IF NOT EXISTS feedback_analytics (
    board_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    -- Totals (trigger-maintained)
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_open INTEGER NOT NULL DEFAULT 0,
    total_pending INTEGER NOT NULL DEFAULT 0,
    total_under_review INTEGER NOT NULL DEFAULT 0,
    total_planned INTEGER NOT NULL DEFAULT 0,
    total_in_progress INTEGER NOT NULL DEFAULT 0,
    total_completed INTEGER NOT NULL DEFAULT 0,
    total_declined INTEGER NOT NULL DEFAULT 0,
    total_duplicate INTEGER NOT NULL DEFAULT 0,
    total_votes INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    total_voters INTEGER NOT NULL DEFAULT 0,
    total_subscribers INTEGER NOT NULL DEFAULT 0,

    -- JSON breakdowns (aggregator job)
    posts_7d TEXT NOT NULL DEFAULT '[]',
    posts_30d TEXT NOT NULL DEFAULT '[]',
    posts_12m TEXT NOT NULL DEFAULT '[]',
    posts_lifetime TEXT NOT NULL DEFAULT '{}',
    votes_7d TEXT NOT NULL DEFAULT '[]',
    votes_30d TEXT NOT NULL DEFAULT '[]',
    votes_12m TEXT NOT NULL DEFAULT '[]',
    status_breakdown TEXT NOT NULL DEFAULT '{}',
    -- {"open":12,"planned":4,"completed":8}
    priority_breakdown TEXT NOT NULL DEFAULT '{}',
    tag_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    utm_source_breakdown TEXT NOT NULL DEFAULT '{}',
    top_requested TEXT NOT NULL DEFAULT '[]',
    -- [{post_id, title, vote_count}] top-10 by votes

    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_aggregated_at INTEGER NOT NULL DEFAULT 0
  )"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_vote_insert
   AFTER INSERT ON feedback_votes
   BEGIN
     UPDATE feedback_posts SET
       vote_count = vote_count + 1,
       -- Hot score: Wilson lower bound approximation (simpler: votes / age decay)
       hot_score  = CAST(vote_count + 1 AS REAL) /
                    ((((strftime('%s','now') - created_at) / 3600.0) + 2) * 1.5),
       updated_at = strftime('%s','now')
     WHERE id = NEW.post_id;

     UPDATE feedback_boards SET
       total_votes = total_votes + 1,
       updated_at  = strftime('%s','now')
     WHERE id = NEW.board_id;

     INSERT INTO feedback_analytics (board_id, profile_id, total_votes)
     VALUES (NEW.board_id, NEW.profile_id, 1)
     ON CONFLICT(board_id) DO UPDATE SET
       total_votes = total_votes + 1,
       updated_at  = strftime('%s','now');

     UPDATE feedback_voters SET
       vote_count    = vote_count + 1,
       last_active_at = strftime('%s','now'),
       updated_at    = strftime('%s','now')
     WHERE id = NEW.voter_id AND NEW.voter_id IS NOT NULL;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_vote_delete
   AFTER DELETE ON feedback_votes
   BEGIN
     UPDATE feedback_posts SET
       vote_count = MAX(0, vote_count - 1),
       hot_score  = CASE
         WHEN MAX(0, vote_count - 1) = 0 THEN 0
         ELSE CAST(MAX(0, vote_count - 1) AS REAL) /
              ((((strftime('%s','now') - created_at) / 3600.0) + 2) * 1.5)
       END,
       updated_at = strftime('%s','now')
     WHERE id = OLD.post_id;

     UPDATE feedback_boards SET
       total_votes = MAX(0, total_votes - 1),
       updated_at  = strftime('%s','now')
     WHERE id = OLD.board_id;

     UPDATE feedback_analytics SET
       total_votes = MAX(0, total_votes - 1),
       updated_at  = strftime('%s','now')
     WHERE board_id = OLD.board_id;

     UPDATE feedback_voters SET
       vote_count  = MAX(0, vote_count - 1),
       updated_at  = strftime('%s','now')
     WHERE id = OLD.voter_id AND OLD.voter_id IS NOT NULL;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_comment_insert
   AFTER INSERT ON feedback_comments
   WHEN NEW.status = 'published'
   BEGIN
     UPDATE feedback_posts SET
       comment_count = comment_count + 1,
       updated_at    = strftime('%s','now')
     WHERE id = NEW.post_id;

     UPDATE feedback_boards SET
       total_comments = total_comments + 1,
       updated_at     = strftime('%s','now')
     WHERE id = NEW.board_id;

     UPDATE feedback_analytics SET
       total_comments = total_comments + 1,
       updated_at     = strftime('%s','now')
     WHERE board_id = NEW.board_id;

     UPDATE feedback_voters SET
       comment_count  = comment_count + 1,
       last_active_at = strftime('%s','now'),
       updated_at     = strftime('%s','now')
     WHERE id = NEW.voter_id AND NEW.voter_id IS NOT NULL;

     -- Increment parent reply_count
     UPDATE feedback_comments SET
       reply_count = reply_count + 1,
       updated_at  = strftime('%s','now')
     WHERE id = NEW.reply_to_id AND NEW.reply_to_id IS NOT NULL;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_comment_delete
   AFTER UPDATE OF status ON feedback_comments
   WHEN NEW.status = 'removed' AND OLD.status = 'published'
   BEGIN
     UPDATE feedback_posts SET
       comment_count = MAX(0, comment_count - 1),
       updated_at    = strftime('%s','now')
     WHERE id = NEW.post_id;

     UPDATE feedback_boards SET
       total_comments = MAX(0, total_comments - 1),
       updated_at     = strftime('%s','now')
     WHERE id = NEW.board_id;

     UPDATE feedback_analytics SET
       total_comments = MAX(0, total_comments - 1),
       updated_at     = strftime('%s','now')
     WHERE board_id = NEW.board_id;

     UPDATE feedback_comments SET
       reply_count = MAX(0, reply_count - 1),
       updated_at  = strftime('%s','now')
     WHERE id = NEW.reply_to_id AND NEW.reply_to_id IS NOT NULL;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_post_insert
   AFTER INSERT ON feedback_posts
   BEGIN
     UPDATE feedback_boards SET
       total_posts  = total_posts + 1,
       pending_posts = pending_posts + CASE WHEN NEW.status = 'pending' THEN 1 ELSE 0 END,
       updated_at   = strftime('%s','now')
     WHERE id = NEW.board_id;

     INSERT INTO feedback_analytics (board_id, profile_id,
       total_posts, total_pending, total_open)
     VALUES (NEW.board_id, NEW.profile_id,
       1,
       CASE WHEN NEW.status = 'pending' THEN 1 ELSE 0 END,
       CASE WHEN NEW.status = 'open'    THEN 1 ELSE 0 END
     )
     ON CONFLICT(board_id) DO UPDATE SET
       total_posts   = total_posts + 1,
       total_pending = total_pending + CASE WHEN NEW.status = 'pending' THEN 1 ELSE 0 END,
       total_open    = total_open    + CASE WHEN NEW.status = 'open'    THEN 1 ELSE 0 END,
       updated_at    = strftime('%s','now');

     UPDATE feedback_voters SET
       post_count    = post_count + 1,
       last_active_at = strftime('%s','now'),
       updated_at    = strftime('%s','now')
     WHERE id = NEW.voter_id AND NEW.voter_id IS NOT NULL;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_post_status_change
   AFTER UPDATE OF status ON feedback_posts
   WHEN OLD.status != NEW.status
   BEGIN
     -- Decrement OLD status bucket
     UPDATE feedback_analytics SET
       total_open        = MAX(0, total_open        - CASE WHEN OLD.status = 'open'         THEN 1 ELSE 0 END),
       total_pending     = MAX(0, total_pending     - CASE WHEN OLD.status = 'pending'      THEN 1 ELSE 0 END),
       total_under_review= MAX(0, total_under_review- CASE WHEN OLD.status = 'under_review' THEN 1 ELSE 0 END),
       total_planned     = MAX(0, total_planned     - CASE WHEN OLD.status = 'planned'      THEN 1 ELSE 0 END),
       total_in_progress = MAX(0, total_in_progress - CASE WHEN OLD.status = 'in_progress'  THEN 1 ELSE 0 END),
       total_completed   = MAX(0, total_completed   - CASE WHEN OLD.status = 'completed'    THEN 1 ELSE 0 END),
       total_declined    = MAX(0, total_declined    - CASE WHEN OLD.status = 'declined'     THEN 1 ELSE 0 END),
       total_duplicate   = MAX(0, total_duplicate   - CASE WHEN OLD.status = 'duplicate'    THEN 1 ELSE 0 END),
       updated_at        = strftime('%s','now')
     WHERE board_id = NEW.board_id;

     -- Increment NEW status bucket
     UPDATE feedback_analytics SET
       total_open        = total_open        + CASE WHEN NEW.status = 'open'         THEN 1 ELSE 0 END,
       total_pending     = total_pending     + CASE WHEN NEW.status = 'pending'      THEN 1 ELSE 0 END,
       total_under_review= total_under_review+ CASE WHEN NEW.status = 'under_review' THEN 1 ELSE 0 END,
       total_planned     = total_planned     + CASE WHEN NEW.status = 'planned'      THEN 1 ELSE 0 END,
       total_in_progress = total_in_progress + CASE WHEN NEW.status = 'in_progress'  THEN 1 ELSE 0 END,
       total_completed   = total_completed   + CASE WHEN NEW.status = 'completed'    THEN 1 ELSE 0 END,
       total_declined    = total_declined    + CASE WHEN NEW.status = 'declined'     THEN 1 ELSE 0 END,
       total_duplicate   = total_duplicate   + CASE WHEN NEW.status = 'duplicate'    THEN 1 ELSE 0 END,
       updated_at        = strftime('%s','now')
     WHERE board_id = NEW.board_id;

     -- Sync board.pending_posts
     UPDATE feedback_boards SET
       pending_posts   = MAX(0, pending_posts + CASE WHEN NEW.status = 'pending' THEN 1 ELSE 0 END
                             - CASE WHEN OLD.status = 'pending' THEN 1 ELSE 0 END),
       completed_posts = MAX(0, completed_posts + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END
                              - CASE WHEN OLD.status = 'completed' THEN 1 ELSE 0 END),
       updated_at      = strftime('%s','now')
     WHERE id = NEW.board_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_post_pin
   AFTER UPDATE OF is_pinned ON feedback_posts
   BEGIN
     UPDATE feedback_boards SET
       pinned_count = MAX(0,
         pinned_count
         + CASE WHEN NEW.is_pinned = 1 THEN 1 ELSE 0 END
         - CASE WHEN OLD.is_pinned = 1 THEN 1 ELSE 0 END
       ),
       updated_at = strftime('%s','now')
     WHERE id = NEW.board_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_fb_voter_insert
   AFTER INSERT ON feedback_voters
   BEGIN
     UPDATE feedback_boards SET
       total_voters = total_voters + 1,
       updated_at   = strftime('%s','now')
     WHERE id = NEW.board_id;

     INSERT INTO feedback_analytics (board_id, profile_id, total_voters)
     VALUES (NEW.board_id, NEW.profile_id, 1)
     ON CONFLICT(board_id) DO UPDATE SET
       total_voters = total_voters + 1,
       updated_at   = strftime('%s','now');
   END"#,
    r#"CREATE VIEW IF NOT EXISTS feedback_leaderboard_view AS
SELECT
  fv.id,
  fv.board_id,
  fv.profile_id,
  fv.user_id,
  fv.email,
  fv.name,
  fv.avatar_url,
  fv.role,
  fv.post_count,
  fv.vote_count,
  fv.comment_count,
  (fv.post_count * 5 + fv.comment_count * 2 + fv.vote_count) AS points_total,
  RANK() OVER (PARTITION BY fv.board_id ORDER BY (fv.post_count * 5 + fv.comment_count * 2 + fv.vote_count) DESC) AS rank_overall,
  fv.joined_at,
  fv.last_active_at
FROM feedback_voters fv
WHERE fv.is_blocked = 0"#,
    r#"CREATE VIEW IF NOT EXISTS feedback_board_context_view AS
SELECT
  b.id                                    AS board_id,
  b.profile_id,
  b.name                                  AS board_name,
  b.slug                                  AS board_slug,
  b.is_active,
  b.is_public,
  b.total_posts,
  b.total_votes,
  b.total_comments,
  b.total_voters,
  b.pending_posts,
  b.completed_posts,
  b.pinned_count,

  -- Status breakdown (live correlated subqueries — always fresh)
  COALESCE((SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND status='open'),          0) AS posts_open,
  COALESCE((SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND status='under_review'),  0) AS posts_under_review,
  COALESCE((SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND status='planned'),       0) AS posts_planned,
  COALESCE((SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND status='in_progress'),   0) AS posts_in_progress,
  COALESCE((SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND status='completed'),     0) AS posts_completed,
  COALESCE((SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND status='declined'),      0) AS posts_declined,

  -- Top post by votes
  (SELECT title      FROM feedback_posts WHERE board_id=b.id AND hidden=0 ORDER BY vote_count DESC LIMIT 1) AS top_post_title,
  (SELECT vote_count FROM feedback_posts WHERE board_id=b.id AND hidden=0 ORDER BY vote_count DESC LIMIT 1) AS top_post_votes,
  (SELECT status     FROM feedback_posts WHERE board_id=b.id AND hidden=0 ORDER BY vote_count DESC LIMIT 1) AS top_post_status,

  -- Completion rate (%)
  CASE
    WHEN b.total_posts = 0 THEN 0
    ELSE ROUND(CAST(b.completed_posts AS REAL) / b.total_posts * 100, 1)
  END AS completion_rate_pct,

  -- Recent activity (last 7 days)
  COALESCE((SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND created_at >= strftime('%s','now') - 604800), 0) AS new_posts_7d,
  COALESCE((SELECT COUNT(*) FROM feedback_votes WHERE board_id=b.id AND created_at >= strftime('%s','now') - 604800), 0) AS new_votes_7d,

  -- Agent action hint
  CASE
    WHEN b.pending_posts >= 5
      THEN b.pending_posts || ' posts awaiting approval — review at /dashboard/feedback/' || b.slug
    WHEN (SELECT COUNT(*) FROM feedback_posts WHERE board_id=b.id AND status='open' AND vote_count >= 10) >= 3
      THEN 'Multiple high-voted open posts — consider moving to planned or in_progress.'
    WHEN b.total_posts = 0
      THEN 'Board is empty. Share /feedback/' || b.slug || ' to collect your first feedback.'
    ELSE 'Board activity nominal.'
  END AS agent_action_hint,

  b.updated_at

FROM feedback_boards b
WHERE b.is_active = 1"#,
    r#"CREATE VIEW IF NOT EXISTS feedback_trending_view AS
SELECT
  p.id,
  p.board_id,
  p.profile_id,
  p.title,
  p.status,
  p.vote_count,
  p.comment_count,
  p.created_at,
  p.hot_score,
  -- Rank by hot_score within each board
  RANK() OVER (PARTITION BY p.board_id ORDER BY p.hot_score DESC) AS trend_rank,
  -- Tags (JSON array of tag names for this post)
  COALESCE((
    SELECT json_group_array(t.name)
    FROM feedback_post_tags pt
    JOIN feedback_tags t ON t.id = pt.tag_id
    WHERE pt.post_id = p.id
  ), '[]') AS tags_json
FROM feedback_posts p
WHERE p.hidden = 0
  AND p.status NOT IN ('declined', 'duplicate')
  AND p.created_at >= strftime('%s','now') - 2592000"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
