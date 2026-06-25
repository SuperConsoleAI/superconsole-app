# SuperConsole Architecture & Data Flow

This document explains the data lifecycle and sync flow between the local filesystem, local SQLite database, and the Turso cloud database.

## 1. Core Philosophy: Local-First
SuperConsole is designed to be **local-first** and **offline-capable**.
- **Source of Truth**: The actual content (e.g., the prompt instructions in `SKILL.md` or `agent.md`) lives in plain text markdown files inside your project's `.superconsole/` directory.
- **Local DB**: A local SQLite database (`app.db`) indexes this metadata (names, tags, authors, active status) so the UI can query it instantly without parsing hundreds of markdown files.
- **Cloud DB (Turso)**: Turso is used strictly as a **metadata mirror**. It allows multiple team members sharing a cloud workspace to see what skills/agents exist, and enables the global community catalog. Turso *never* stores the raw markdown bodies of project skills (for privacy and offline access).

---

## 2. The Three Layers of State

When you look at the UI (e.g., the Skills Dialog), the backend (`list_skills`) merges data from three different layers to figure out what to display:

1. **The Filesystem (`.superconsole/skills/`)**
   - We scan the local directory for actual installed files.
2. **The Local Index (`project_skills` table)**
   - We look up the local SQLite database to find user-specific toggles (like whether a skill is `active` or not) and ownership metadata (`author`, `catalog_id`).
3. **The Cloud Cache (`skill_index_cache` table)**
   - If a coworker installed a skill to the cloud workspace, Turso knows about it, but you might not have downloaded the file yet. The UI shows these as "cloud references" so you can click to download them.

---

## 3. The Lifecycle of an Entity (e.g., A Skill)

### A. Installation (e.g., `install_plugin` or `materialize_skill_to_workspace`)
When you install a skill:
1. **Download**: The raw markdown is fetched from GitHub (or the local library) and written to `.superconsole/skills/<name>/SKILL.md`.
2. **Local Index**: `upsert_skill_index` is called to insert a row into the local `project_skills` table. It captures the description, tags, author, and sets `active = true`.
3. **Cloud Push**: `push_skill_to_cloud` is spawned as a background task. It makes a network request to Turso to insert/update the row in `project_skill_index`. (This is done in the background so the UI doesn't freeze waiting for the network).

### B. Updating (e.g., `update_skill`)
When you edit a skill in the UI:
1. **File Write**: The new markdown content is saved to the local file.
2. **Local DB Update**: `upsert_skill_index` updates the local database. We use SQL `COALESCE` and `CASE` statements to ensure we don't accidentally erase metadata (like the author) if it wasn't provided in the update payload.
3. **Cloud Push**: `push_skill_to_cloud` updates the Turso row so coworkers see the updated tags or description.

### C. Deletion (e.g., `delete_skill`)
When you click delete:
1. **File Deletion**: The local markdown file and folder are deleted from the disk.
2. **Local DB & Cache Deletion**: The row is deleted from the `project_skills` table AND the `skill_index_cache` table to ensure it instantly disappears from the UI.
3. **Cloud Deletion**: `delete_skill_from_cloud` sends a `DELETE` query to Turso.

---

## 4. The Sync Manager (`sync_manager.rs`)
Because multiple users can be in the same workspace, we need to stay in sync. 

- The **Sync Manager** runs on a timer in the background. 
- It polls Turso (`fetch_cloud_skills`, `fetch_cloud_agents`) to get the latest state of the cloud workspace.
- It writes this state blindly into the **local cache tables** (`skill_index_cache`, `agent_index_cache`).
- If it detects that Turso has new data that the local DB didn't know about, it triggers a UI refresh event (`sync_on_update`).

This one-way caching mechanism ensures that reading data for the UI is always instant (just querying local SQLite), while network latency is isolated to background sync loops.
