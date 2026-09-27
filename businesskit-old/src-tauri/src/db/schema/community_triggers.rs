// src-tauri/src/db/schema/community_triggers.rs
use super::Migration;

// ─────────────────────────────────────────────────────────────────────────────
// community-triggers.ts — SQL Triggers for Community Feature
//
// Why triggers over app-level updates:
//   - Zero CF Worker compute for high-frequency events (likes, posts, comments)
//   - Agents / n8n writing directly to DB stay in sync automatically
//   - Atomic — leaderboard + analytics + counters update in same transaction
//   - At millions of likes/day = massive Worker request savings
//
// ── Tables updated by triggers ────────────────────────────────────────────────
//
//   community_leaderboard   ← post, comment, reaction, purchase, member events
//   community_analytics     ← member, post, comment, reaction, purchase events
//   community_posts         ← reaction INSERT/DELETE (like_count)
//                           ← comment INSERT/UPDATE (comment_count)
//   community_comments      ← comment INSERT (reply_count on parent)
//                           ← reaction INSERT/DELETE (like_count)
//   community_categories    ← post INSERT/UPDATE (post_count)
//   community_badges        ← member_badge INSERT (award_count)
//   communities             ← member INSERT/UPDATE (member_count)
//                           ← post INSERT/UPDATE (post_count)
//                           ← comment INSERT/UPDATE (comment_count)
//
// ── Actions that earn rewards (leaderboard points / activity) ─────────────────
//
//   POST CREATED          → post_count + 1, last_active_at updated
//   POST REMOVED          → post_count - 1 (reversed)
//   COMMENT CREATED       → comment_count + 1, last_active_at updated
//   COMMENT REMOVED       → comment_count - 1 (reversed)
//   LIKE GIVEN            → giver: likes_given + 1, last_active_at updated
//   LIKE RECEIVED         → receiver: likes_received + 1, points_total + 1
//                           points_7d + 1, points_30d + 1, level recomputed
//                           (Skool model: 1 like = 1 point, only likes earn points)
//   LIKE REMOVED          → all of the above reversed
//   COURSE COMPLETED      → lessons_completed + 1, last_active_at updated
//                           (app sets purchases.course_completed = 1 → trigger fires)
//   DAILY LOGIN / STREAK  → streak_days updated (consecutive day = +1, gap = reset to 1)
//                           streak_best updated if new record
//   BADGE AWARDED         → community_badges.award_count + 1
//   MEMBER JOINED         → leaderboard row initialized, community member_count + 1
//   MEMBER LEFT/BANNED    → community member_count - 1
//
// ── Points / Level thresholds (Skool model — fixed, not configurable) ─────────
//
//   Level 1 →     0 points
//   Level 2 →     5 points
//   Level 3 →    20 points
//   Level 4 →    65 points
//   Level 5 →   155 points
//   Level 6 →   515 points
//   Level 7 → 2,015 points
//   Level 8 → 8,015 points
//   Level 9 → 33,015 points
//
// ── Key design decisions ──────────────────────────────────────────────────────
//
//   users.id           = stable platform-wide user ID (used everywhere)
//   users.workos_id    = WorkOS ID (changes per creator subdomain — NOT used here)
//   community_members.user_id = FK → users.id (stable)
//   display_name + avatar_url copied from users table ONCE on member INSERT
//     → no joins needed for leaderboard rendering
//     → stale avatar is acceptable (updated app-side when user updates profile)
//
//   purchases.community_member_id = FK → community_members.id
//     → filled at purchase time (when community_members row is created)
//     → enables clean trigger on purchases without cross-table subquery
//     → migration: ALTER TABLE purchases ADD COLUMN community_member_id TEXT
//
// ── How to apply ──────────────────────────────────────────────────────────────
//
//   Add COMMUNITY_TRIGGERS_SQL to provisionUserDatabase() in provision.ts
//   after COMMUNITY_SCHEMA_SQL tables are created.
//   All triggers use CREATE TRIGGER IF NOT EXISTS — safe to run repeatedly.
//   DROP TRIGGER IF EXISTS runs first so schema changes are always applied.
//
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Level computation CASE expression — reused in reaction triggers
// points_total refers to the NEW value AFTER increment
// ─────────────────────────────────────────────────────────────────────────────
// points_total refers to the NEW value AFTER decrement (MAX guard already applied)

pub const SCHEMA_SQL: &[&str] = &[
    r#"DROP TRIGGER IF EXISTS trg_community_member_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_community_member_status_change"#,
    r#"DROP TRIGGER IF EXISTS trg_community_post_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_community_post_removed"#,
    r#"DROP TRIGGER IF EXISTS trg_community_comment_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_community_comment_removed"#,
    r#"DROP TRIGGER IF EXISTS trg_community_reaction_insert"#,
    r#"DROP TRIGGER IF EXISTS trg_community_reaction_delete"#,
    r#"DROP TRIGGER IF EXISTS trg_purchases_course_completed"#,
    r#"DROP TRIGGER IF EXISTS trg_community_member_streak"#,
    r#"DROP TRIGGER IF EXISTS trg_community_badge_awarded"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_member_insert
   AFTER INSERT ON community_members
   BEGIN
     INSERT OR IGNORE INTO community_leaderboard (
       id,
       community_id,
       member_id,
       display_name,
       avatar_url,
       joined_at,
       updated_at
     )
     VALUES (
       hex(randomblob(16)),
       NEW.community_id,
       NEW.id,
       COALESCE(
         (SELECT first_name || CASE WHEN last_name IS NOT NULL THEN ' ' || last_name ELSE '' END
          FROM users WHERE id = NEW.user_id),
         (SELECT email FROM users WHERE id = NEW.user_id),
         'Member'
       ),
       (SELECT profile_picture_url FROM users WHERE id = NEW.user_id),
       strftime('%s','now'),
       strftime('%s','now')
     );
     UPDATE communities SET
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.community_id;
     INSERT INTO community_analytics (id, community_id, profile_id, total_members)
     VALUES (hex(randomblob(16)), NEW.community_id, NEW.profile_id, 1)
     ON CONFLICT(community_id) DO UPDATE SET
       total_members = total_members + 1,
       updated_at    = strftime('%s','now');
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_member_status_change
   AFTER UPDATE OF status ON community_members
   WHEN NEW.status IN ('banned','cancelled','expired')
     AND OLD.status = 'active'
   BEGIN
     UPDATE communities SET
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.community_id;
     UPDATE community_analytics SET
       total_members = MAX(0, total_members - 1),
       updated_at    = strftime('%s','now')
     WHERE community_id = NEW.community_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_post_insert
   AFTER INSERT ON community_posts
   WHEN NEW.status = 'published'
   BEGIN
     UPDATE community_leaderboard SET
       post_count     = post_count + 1,
       streak_days = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now') 
           THEN streak_days
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day') 
           THEN streak_days + 1
         ELSE 1
       END,
       streak_best = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day')
           AND (streak_days + 1) > COALESCE(streak_best, 0)
           THEN streak_days + 1
         ELSE COALESCE(streak_best, 0)
       END,
       last_active_at = strftime('%s','now'),
       updated_at     = strftime('%s','now')
     WHERE member_id = NEW.member_id;
     UPDATE community_categories SET
       post_count = post_count + 1
     WHERE id = NEW.category_id;
     UPDATE communities SET
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.community_id;
     UPDATE community_analytics SET
       total_posts = total_posts + 1,
       updated_at  = strftime('%s','now')
     WHERE community_id = NEW.community_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_post_removed
   AFTER UPDATE OF status ON community_posts
   WHEN NEW.status = 'removed' AND OLD.status = 'published'
   BEGIN
     UPDATE community_leaderboard SET
       post_count = MAX(0, post_count - 1),
       updated_at = strftime('%s','now')
     WHERE member_id = NEW.member_id;
     UPDATE community_categories SET
       post_count = MAX(0, post_count - 1)
     WHERE id = NEW.category_id;
     UPDATE communities SET
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.community_id;
     UPDATE community_analytics SET
       total_posts = MAX(0, total_posts - 1),
       updated_at  = strftime('%s','now')
     WHERE community_id = NEW.community_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_comment_insert
   AFTER INSERT ON community_comments
   WHEN NEW.status = 'published'
   BEGIN
     UPDATE community_leaderboard SET
       comment_count  = comment_count + 1,
       streak_days = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now') 
           THEN streak_days
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day') 
           THEN streak_days + 1
         ELSE 1
       END,
       streak_best = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day')
           AND (streak_days + 1) > COALESCE(streak_best, 0)
           THEN streak_days + 1
         ELSE COALESCE(streak_best, 0)
       END,
       last_active_at = strftime('%s','now'),
       updated_at     = strftime('%s','now')
     WHERE member_id = NEW.member_id;
     UPDATE community_posts SET
       comment_count = comment_count + 1,
       updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.post_id;
     UPDATE community_comments SET
       reply_count = reply_count + 1,
       updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.parent_id AND NEW.parent_id IS NOT NULL;
     UPDATE communities SET
       updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.community_id;
     UPDATE community_analytics SET
       total_comments = total_comments + 1,
       updated_at     = strftime('%s','now')
     WHERE community_id = NEW.community_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_comment_removed
   AFTER UPDATE OF status ON community_comments
   WHEN NEW.status = 'removed' AND OLD.status = 'published'
   BEGIN
     UPDATE community_leaderboard SET
       comment_count = MAX(0, comment_count - 1),
       updated_at    = strftime('%s','now')
     WHERE member_id = NEW.member_id;
     UPDATE community_posts SET
       comment_count = MAX(0, comment_count - 1),
       updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.post_id;
     UPDATE community_comments SET
       reply_count = MAX(0, reply_count - 1),
       updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.parent_id AND NEW.parent_id IS NOT NULL;
     UPDATE communities SET
       updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.community_id;
     UPDATE community_analytics SET
       total_comments = MAX(0, total_comments - 1),
       updated_at     = strftime('%s','now')
     WHERE community_id = NEW.community_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_reaction_insert
   AFTER INSERT ON community_post_reactions
   BEGIN
     UPDATE community_leaderboard SET
       likes_given    = likes_given + 1,
       streak_days = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now') 
           THEN streak_days
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day') 
           THEN streak_days + 1
         ELSE 1
       END,
       streak_best = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day')
           AND (streak_days + 1) > COALESCE(streak_best, 0)
           THEN streak_days + 1
         ELSE COALESCE(streak_best, 0)
       END,
       last_active_at = strftime('%s','now'),
       updated_at     = strftime('%s','now')
     WHERE member_id = NEW.member_id;

     UPDATE community_leaderboard SET
       likes_received = likes_received + 1,
       points_total   = points_total + 1,
       points_7d      = points_7d + 1,
       points_30d     = points_30d + 1,
       level          = CASE
         WHEN points_total + 1 >= 33015 THEN 9
         WHEN points_total + 1 >= 8015  THEN 8
         WHEN points_total + 1 >= 2015  THEN 7
         WHEN points_total + 1 >= 515   THEN 6
         WHEN points_total + 1 >= 155   THEN 5
         WHEN points_total + 1 >= 65    THEN 4
         WHEN points_total + 1 >= 20    THEN 3
         WHEN points_total + 1 >= 5     THEN 2
         ELSE 1
       END,
       updated_at     = strftime('%s','now')
     WHERE member_id = (
       CASE NEW.target_type
         WHEN 'post'    THEN (SELECT member_id FROM community_posts    WHERE id = NEW.target_id)
         WHEN 'comment' THEN (SELECT member_id FROM community_comments WHERE id = NEW.target_id)
       END
     );

     UPDATE community_posts SET
       like_count = like_count + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.target_id AND NEW.target_type = 'post';

     UPDATE community_comments SET
       like_count = like_count + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = NEW.target_id AND NEW.target_type = 'comment';

     UPDATE community_analytics SET
       total_reactions = total_reactions + 1,
       updated_at      = strftime('%s','now')
     WHERE community_id = NEW.community_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_reaction_delete
   AFTER DELETE ON community_post_reactions
   BEGIN
     UPDATE community_leaderboard SET
       likes_given = MAX(0, likes_given - 1),
       updated_at  = strftime('%s','now')
     WHERE member_id = OLD.member_id;

     UPDATE community_leaderboard SET
       likes_received = MAX(0, likes_received - 1),
       points_total   = MAX(0, points_total - 1),
       points_7d      = MAX(0, points_7d - 1),
       points_30d     = MAX(0, points_30d - 1),
       level          = CASE
         WHEN MAX(0, points_total - 1) >= 33015 THEN 9
         WHEN MAX(0, points_total - 1) >= 8015  THEN 8
         WHEN MAX(0, points_total - 1) >= 2015  THEN 7
         WHEN MAX(0, points_total - 1) >= 515   THEN 6
         WHEN MAX(0, points_total - 1) >= 155   THEN 5
         WHEN MAX(0, points_total - 1) >= 65    THEN 4
         WHEN MAX(0, points_total - 1) >= 20    THEN 3
         WHEN MAX(0, points_total - 1) >= 5     THEN 2
         ELSE 1
       END,
       updated_at     = strftime('%s','now')
     WHERE member_id = (
       CASE OLD.target_type
         WHEN 'post'    THEN (SELECT member_id FROM community_posts    WHERE id = OLD.target_id)
         WHEN 'comment' THEN (SELECT member_id FROM community_comments WHERE id = OLD.target_id)
       END
     );

     UPDATE community_posts SET
       like_count = MAX(0, like_count - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = OLD.target_id AND OLD.target_type = 'post';

     UPDATE community_comments SET
       like_count = MAX(0, like_count - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = OLD.target_id AND OLD.target_type = 'comment';

     UPDATE community_analytics SET
       total_reactions = MAX(0, total_reactions - 1),
       updated_at      = strftime('%s','now')
     WHERE community_id = OLD.community_id;
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_purchases_course_completed
   AFTER UPDATE OF course_completed ON purchases
   WHEN NEW.course_completed = 1
     AND OLD.course_completed = 0
     AND NEW.community_member_id IS NOT NULL
   BEGIN
     UPDATE community_leaderboard SET
       lessons_completed = lessons_completed + 1,
       streak_days = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now') 
           THEN streak_days
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day') 
           THEN streak_days + 1
         ELSE 1
       END,
       streak_best = CASE
         WHEN DATE(last_active_at, 'unixepoch') = DATE('now', '-1 day')
           AND (streak_days + 1) > COALESCE(streak_best, 0)
           THEN streak_days + 1
         ELSE COALESCE(streak_best, 0)
       END,
       last_active_at = strftime('%s','now'),
       updated_at        = strftime('%s','now')
     WHERE member_id = NEW.community_member_id;
     UPDATE community_analytics SET
       total_lesson_completions = total_lesson_completions + 1,
       updated_at               = strftime('%s','now')
     WHERE community_id = (
       SELECT community_id FROM products WHERE id = NEW.product_id LIMIT 1
     );
   END"#,
    r#"CREATE TRIGGER IF NOT EXISTS trg_community_badge_awarded
   AFTER INSERT ON community_member_badges
   BEGIN
     UPDATE community_badges SET
       award_count = award_count + 1
     WHERE id = NEW.badge_id;
   END"#,
];

pub const MIGRATIONS_SQL: &[Migration] = &[];
