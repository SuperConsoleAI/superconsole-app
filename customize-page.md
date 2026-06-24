when user install plugin on account scope we now it goes in master folder .superconsole
project = project files
org = ?

Good question. Think through it:

```
Account scope → <app_data>/               ← machine global
  skills/newsletter-writer/SKILL.md
  commands/ceo-brief.md
  hooks/session-end.sh

Project scope → <workspace>/.superconsole/  ← this project only
  skills/newsletter-writer/SKILL.md
  commands/ceo-brief.md
  hooks/session-end.sh
```

**Org scope — what does it mean?**

```
Org = multiple projects, one team
  → skills/commands/hooks can't live in ONE project folder
  → they need to be available to ALL projects in the org

Options:
  A. Org scope = account scope
     → same <app_data>/ folder
     → available everywhere
     → simple, no new concept

  B. Org scope = synced via Turso
     → org members pull org skills/commands on sync
     → land in <app_data>/org/<org_id>/skills/
     → available to all projects in that org only

  C. No org scope for file assets
     → connectors + LLM keys = org scope (already works)
     → skills/commands/hooks = project OR account only
     → org plugin install = installs to account scope
```

**My recommendation: Option C**

```
Org scope plugin install:
  → connectors = org scope (already built, stays in Turso)
  → skills/commands/hooks = installed to account scope
    (<app_data>/ folder, available machine-wide)
  → MCP = written to account-level mcp config

Reasoning:
  Skills/commands/hooks are markdown + shell files
  They don't contain credentials (those are in connectors)
  No harm in them being account-wide
  Avoids building a new sync system for files
  Org members each have them on their own machine
  
  Connectors already handle the sensitive org-scoped stuff
  (Telegram bot, Slack, agency Stripe etc)
```

**So the full picture:**

```
Plugin install scope:

Account:
  files → <app_data>/skills/, commands/, hooks/
  mcp   → global mcp config
  connectors → account connectors_cache

Org:
  files → <app_data>/skills/, commands/, hooks/  (same as account)
  mcp   → global mcp config
  connectors → org connectors_cache  ← the org-scoped part

Project:
  files → .superconsole/skills/, commands/, hooks/
  mcp   → project .mcp.json
  connectors → project connectors_cache
```

Agree?

____

Yes — `installed_plugins` needs to be in Turso. Same pattern as everything else.

**The sync problem without Turso:**

```
Machine A: user installs Figma + Shopify plugins for acme-dental
Machine B: user opens acme-dental → no plugins installed
           has to manually reinstall everything
           
With Turso:
Machine B opens acme-dental
  → sync pulls installed_plugins for this project
  → sees Figma + Shopify were installed
  → auto-installs: fetches skills/commands from GitHub URLs
    writes to .superconsole/
    writes MCP entries to .mcp.json
  → fully restored, no manual work
```

**Turso table:**

```sql
CREATE TABLE IF NOT EXISTS installed_plugins (
  id TEXT PRIMARY KEY,              -- ULID
  plugin_id TEXT NOT NULL,          -- references plugins.id
  scope TEXT NOT NULL,              -- 'project'|'org'|'account'
  scope_id TEXT NOT NULL,           -- project_id|org_id|user_id
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  installed_by TEXT NOT NULL,       -- user_id
  version TEXT NOT NULL,
  -- Store what was actually installed for re-install on new machine
  skills_url TEXT NOT NULL DEFAULT '[]',
  commands_url TEXT NOT NULL DEFAULT '[]',
  hooks_url TEXT NOT NULL DEFAULT '[]',
  mcp_url TEXT NOT NULL DEFAULT '[]'
);
```

**Why store URLs in installed_plugins too:**

```
Plugin catalog row might change (new version, different URLs)
installed_plugins captures EXACTLY what was installed at that time
New machine restore = use installed_plugins URLs not current catalog
Reproducible installs
```

**Local SQLite mirror:**

```sql
CREATE TABLE IF NOT EXISTS installed_plugins_cache (
  -- same columns as Turso
  -- synced on startup + org-switch + 30min tick
);
```

**Sync flow:**

```
New machine:
  1. WorkOS login → user identity restored
  2. sync_manager pulls installed_plugins_cache from Turso
  3. For each installed plugin:
     → check if files exist locally
     → if missing → re-fetch from stored URLs
     → write skills/commands/hooks to correct folder
     → write MCP entries to .mcp.json
     → connector credentials already synced separately
  4. Project opens fully configured

This is auto_restore_plugins() called in sync_manager.rs
after the main sync completes.
```

**Write flow (on install):**

```
User installs plugin →
  1. Install files locally (existing flow)
  2. Write to installed_plugins_cache (local SQLite)
  3. Sync to Turso installed_plugins (async)
  4. sync_on_update()
```

**Drizzle migration needed** (`0010_installed_plugins.sql`):

```sql
CREATE TABLE IF NOT EXISTS installed_plugins (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  installed_by TEXT NOT NULL,
  version TEXT NOT NULL,
  skills_url TEXT NOT NULL DEFAULT '[]',
  commands_url TEXT NOT NULL DEFAULT '[]',
  hooks_url TEXT NOT NULL DEFAULT '[]',
  mcp_url TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS installed_plugins_scope_idx 
  ON installed_plugins(scope, scope_id);
```

Want me to add this to the instruction file for Droid?
