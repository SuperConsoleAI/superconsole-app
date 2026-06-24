# SuperConsole — Plugins, Hooks, and Catalog System
## Complete implementation: catalogs + hooks + plugin bundles + marketplace UI

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, `ARCHITECTURE.md`, and `DESIGN_PRINCIPLES.md` fully before touching anything.

Key files to extend (do NOT rewrite):
- Backend: `src-tauri/src/connectors.rs`, `src-tauri/src/agents.rs`, `src-tauri/src/skills.rs`, `src-tauri/src/mcp.rs`, `src-tauri/src/db.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/scheduler.rs`, `src-tauri/src/chat.rs`
- Frontend: `src/components/AgentsDialog.tsx`, `src/components/SettingsPage.tsx`, `src/lib/api.ts`
- Web portal: `superconsole-web/src/connector-registry.ts`, `superconsole-web/drizzle/`
- New files: `src-tauri/src/plugins.rs`, `src-tauri/src/hooks.rs`, `src/components/PluginsMarketplace.tsx`, `src/lib/plugin-registry.ts`

`cargo check` and `npm run build` must pass clean before done.
Mirror registry changes across `connectors.rs`, `api.ts`, `connector-registry.ts` always.

---

## Mental Model

```
Connector  = credentials + API access (project/org/account scoped)
Skill      = SKILL.md instruction file (.superconsole/skills/<name>/)
Command    = slash command .md file (.superconsole/commands/<name>.md)
MCP        = external MCP server entry in .mcp.json
Hook       = lifecycle shell script (.superconsole/hooks/<event>.sh)
Agent      = autonomous worker agent.md (.superconsole/agents/<name>/)

Plugin     = bundle of any/all of the above
             one install → everything configured
             references GitHub URLs or catalog IDs
             triggers connector OAuth/API key flow automatically

Catalog    = Turso-backed browsable directory for each type
             fetched from GitHub on install
             never bundled in app binary
```

**Scope rules (unchanged from existing system):**
```
project scope  → .superconsole/ folder + project connectors_cache
org scope      → org connectors_cache
account scope  → <app_data>/ folders + account connectors_cache
```

---

## Phase 1 — Catalog Tables (Turso + local cache)

### 1A. New Drizzle migrations (`superconsole-web/drizzle/`)

Create migration `0009_catalogs.sql`:

```sql
-- Connector catalog (browsable directory of all connectors)
CREATE TABLE IF NOT EXISTS connector_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,        -- 'business'|'developer'|'productivity'|'communication'|'ai'
  auth_type TEXT NOT NULL,       -- 'api_key'|'oauth'|'none'
  oauth_url TEXT,
  api_key_fields TEXT NOT NULL DEFAULT '[]',  -- JSON array of {key,label,secret,description}
  docs_url TEXT,
  icon_url TEXT,
  scope TEXT NOT NULL DEFAULT 'project',      -- 'project'|'org'|'account'|'all'
  install_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- MCP catalog (community MCP servers)
CREATE TABLE IF NOT EXISTS mcp_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  github_url TEXT NOT NULL,
  install_command TEXT NOT NULL,   -- e.g. "npx @figma/mcp@latest"
  install_args TEXT NOT NULL DEFAULT '[]',   -- JSON array of args
  required_env_vars TEXT NOT NULL DEFAULT '[]',  -- JSON [{key,label,secret,description}]
  icon_url TEXT,
  docs_url TEXT,
  install_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Commands catalog (community slash commands)
CREATE TABLE IF NOT EXISTS commands_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slash TEXT NOT NULL,             -- e.g. "/figma-export"
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  github_url TEXT NOT NULL,        -- URL to the .md file on GitHub
  content TEXT,                    -- cached content (fetched on install)
  icon_url TEXT,
  install_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hooks catalog (community lifecycle hooks)
CREATE TABLE IF NOT EXISTS hooks_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  hook_type TEXT NOT NULL,  -- 'session-start'|'session-end'|'before-prompt'|'before-mcp'|'before-shell'
  github_url TEXT NOT NULL,
  content TEXT,             -- cached script content
  icon_url TEXT,
  install_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Plugins table (bundles referencing all other catalogs)
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  icon_url TEXT,
  docs_url TEXT,
  github_url TEXT,           -- plugin manifest repo URL
  category TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'project',
  -- References to catalog items (JSON arrays of IDs)
  skill_ids TEXT NOT NULL DEFAULT '[]',
  agent_ids TEXT NOT NULL DEFAULT '[]',
  mcp_ids TEXT NOT NULL DEFAULT '[]',
  command_ids TEXT NOT NULL DEFAULT '[]',
  hook_ids TEXT NOT NULL DEFAULT '[]',
  connector_ids TEXT NOT NULL DEFAULT '[]',
  -- Direct GitHub URLs (for items not in catalog)
  skills_url TEXT,
  commands_url TEXT,
  hooks_url TEXT,
  -- Connector auth config
  connector_auth TEXT NOT NULL DEFAULT '[]', -- JSON [{connector_id, required}]
  install_count INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Installed plugins per workspace/org/account
CREATE TABLE IF NOT EXISTS installed_plugins (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES plugins(id),
  scope TEXT NOT NULL,           -- 'project'|'org'|'account'
  scope_id TEXT NOT NULL,        -- project_id or org_id or user_id
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  installed_by TEXT NOT NULL,    -- user_id
  version TEXT NOT NULL
);
```

Update `superconsole-web/drizzle/schema.ts` with matching TypeScript types.
Update journal file.

### 1B. Local SQLite cache tables (`db.rs`)

Add idempotent `CREATE TABLE IF NOT EXISTS` blocks in `Db::init`:

```sql
CREATE TABLE IF NOT EXISTS connector_catalog_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  oauth_url TEXT,
  api_key_fields TEXT NOT NULL DEFAULT '[]',
  docs_url TEXT,
  icon_url TEXT,
  scope TEXT NOT NULL DEFAULT 'project',
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_catalog_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  github_url TEXT NOT NULL,
  install_command TEXT NOT NULL,
  install_args TEXT NOT NULL DEFAULT '[]',
  required_env_vars TEXT NOT NULL DEFAULT '[]',
  icon_url TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commands_catalog_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slash TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  github_url TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hooks_catalog_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  hook_type TEXT NOT NULL,
  github_url TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plugins_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  version TEXT NOT NULL,
  icon_url TEXT,
  category TEXT NOT NULL,
  scope TEXT NOT NULL,
  skill_ids TEXT NOT NULL DEFAULT '[]',
  mcp_ids TEXT NOT NULL DEFAULT '[]',
  command_ids TEXT NOT NULL DEFAULT '[]',
  hook_ids TEXT NOT NULL DEFAULT '[]',
  connector_ids TEXT NOT NULL DEFAULT '[]',
  connector_auth TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Track installed plugins per workspace
CREATE TABLE IF NOT EXISTS workspace_plugins (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  version TEXT NOT NULL
);
```

### 1C. Seed connector_catalog from existing REGISTRY (`connectors.rs`)

On startup, if `connector_catalog_cache` is empty:
- Read the hardcoded `REGISTRY` in `connectors.rs`
- Upsert each entry into `connector_catalog_cache`
- This bootstraps the catalog from existing data

The hardcoded registry remains as fallback for offline use.
Turso catalog is the online browsable version.

### 1D. Sync functions (`sync_manager.rs`)

Add to the startup + 30-min tick sync:
```rust
pub async fn sync_catalogs(db: &Db, turso: &TursoConfig) -> Result<(), String> {
    sync_connector_catalog(db, turso).await?;
    sync_mcp_catalog(db, turso).await?;
    sync_commands_catalog(db, turso).await?;
    sync_hooks_catalog(db, turso).await?;
    sync_plugins_cache(db, turso).await?;
    Ok(())
}
```

Each sync: `SELECT * FROM <table>` from Turso → upsert into local `*_cache`.

---

## Phase 2 — Hooks System

### 2A. Folder structure

```
.superconsole/hooks/
  session-start.sh      → runs when CLI session opens
  session-end.sh        → runs when CLI session closes
  before-prompt.sh      → runs before every LLM call (chat + scheduler)
  before-mcp.sh         → runs before MCP tool execution
  before-shell.sh       → runs before shell command execution
```

All hooks are shell scripts. Executable. Project-scoped.
All file ops through `files.rs::resolve`.

### 2B. New file: `src-tauri/src/hooks.rs`

```rust
pub enum HookType {
    SessionStart,
    SessionEnd,
    BeforePrompt,
    BeforeMcp,
    BeforeShell,
}

impl HookType {
    pub fn filename(&self) -> &str {
        match self {
            HookType::SessionStart  => "session-start.sh",
            HookType::SessionEnd    => "session-end.sh",
            HookType::BeforePrompt  => "before-prompt.sh",
            HookType::BeforeMcp     => "before-mcp.sh",
            HookType::BeforeShell   => "before-shell.sh",
        }
    }
}

/// Run a hook script if it exists. Never blocks — timeout 10s.
/// Returns output or empty string if hook doesn't exist or times out.
pub fn run_hook(
    workspace_path: &str,
    hook_type: HookType,
    env_vars: &HashMap<String, String>,  // context passed to hook
) -> Result<String, String> {
    let hook_path = format!("{}/.superconsole/hooks/{}", workspace_path, hook_type.filename());
    
    // Check if file exists — silently skip if not
    if !std::path::Path::new(&hook_path).exists() {
        return Ok(String::new());
    }
    
    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&hook_path, std::fs::Permissions::from_mode(0o755)).ok();
    }
    
    // Run with timeout (10 seconds max)
    let output = std::process::Command::new("bash")
        .arg(&hook_path)
        .envs(env_vars)
        .env("SUPERCONSOLE_WORKSPACE", workspace_path)
        .env("SUPERCONSOLE_HOOK", hook_type.filename())
        .current_dir(workspace_path)
        .output();
    
    match output {
        Ok(o) => Ok(String::from_utf8_lossy(&o.stdout).to_string()),
        Err(e) => {
            eprintln!("Hook {} failed: {}", hook_type.filename(), e);
            Ok(String::new()) // Never fail the main operation because of a hook
        }
    }
}

/// List all hooks in .superconsole/hooks/
pub fn list_hooks(workspace_path: &str) -> Vec<HookFile> {
    // Scan .superconsole/hooks/ → return existing files
}

pub struct HookFile {
    pub hook_type: String,
    pub filename: String,
    pub content: String,
    pub exists: bool,
}

/// Read a hook script content
pub fn read_hook(workspace_path: &str, hook_type: &str) -> Result<String, String>

/// Write a hook script
pub fn write_hook(workspace_path: &str, hook_type: &str, content: &str) -> Result<(), String>

/// Delete a hook script
pub fn delete_hook(workspace_path: &str, hook_type: &str) -> Result<(), String>
```

**CRITICAL: Hooks NEVER block the main operation.**
- Always use timeout (10s max)
- If hook fails → log error → continue silently
- Hook output can be used as context injection (for before-prompt)

### 2C. Hook execution points

**`pty.rs` — session lifecycle:**
```rust
// On session start (after PTY spawned):
hooks::run_hook(&workspace.path, HookType::SessionStart, &env_context);

// On session end (in the exit handler):
hooks::run_hook(&workspace.path, HookType::SessionEnd, &env_context);
```

**`chat.rs` — before LLM call:**
```rust
// In build_system_prompt or just before sending to LLM:
let hook_output = hooks::run_hook(&workspace.path, HookType::BeforePrompt, &context);
// If hook_output is non-empty → append to system prompt
// Hook can inject extra context, quality checklist, etc.
```

**`mcp.rs` — before MCP tool execution:**
```rust
// In execute(), before calling the tool:
let hook_env = hashmap!{
    "SUPERCONSOLE_TOOL_NAME" => tool_name,
    "SUPERCONSOLE_TOOL_INPUT" => serde_json::to_string(&input).unwrap_or_default(),
};
hooks::run_hook(&workspace_path, HookType::BeforeMcp, &hook_env);
// Hook can log, audit, or modify behavior
// Hook exit code 1 = abort tool execution (optional safety gate)
```

**`scheduler.rs` — before shell command:**
```rust
// Before exec_in_workspace runs a CLI command:
hooks::run_hook(&workspace.path, HookType::BeforeShell, &env_context);
```

### 2D. Hook env context variables

Always pass these to every hook:
```bash
SUPERCONSOLE_WORKSPACE=/path/to/workspace
SUPERCONSOLE_WORKSPACE_NAME=acme-dental
SUPERCONSOLE_HOOK=before-prompt.sh
SUPERCONSOLE_PROJECT_ID=project-ulid
SUPERCONSOLE_ORG_ID=org-ulid
SUPERCONSOLE_USER_ID=user-id
SUPERCONSOLE_TIMESTAMP=2026-06-24T15:30:00Z

# For session hooks:
SUPERCONSOLE_SESSION_ID=session-id
SUPERCONSOLE_CLI=claude

# For before-prompt hook:
SUPERCONSOLE_PROMPT_LENGTH=1234

# For before-mcp hook:
SUPERCONSOLE_TOOL_NAME=skill_view
SUPERCONSOLE_TOOL_INPUT={"name":"newsletter-writer"}

# For before-shell hook:
SUPERCONSOLE_COMMAND=/ceo
```

### 2E. Hook example content

Default hook templates to show in UI when user creates a new hook:

**session-end.sh:**
```bash
#!/bin/bash
# Runs when a CLI session ends
# Update HEARTBEAT.md with last run timestamp
echo "Last session: $(date)" >> "$SUPERCONSOLE_WORKSPACE/HEARTBEAT.md"

# Notify Telegram (if configured)
# curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
#   -d "chat_id=$TELEGRAM_CHAT_ID" \
#   -d "text=Session ended in $SUPERCONSOLE_WORKSPACE_NAME"
```

**before-prompt.sh:**
```bash
#!/bin/bash
# Inject extra context before every LLM call
# Output is appended to system prompt

# Example: inject current date and git status
echo "Current date: $(date)"
echo "Git branch: $(git -C "$SUPERCONSOLE_WORKSPACE" branch --show-current 2>/dev/null)"
```

### 2F. Tauri commands for hooks (`lib.rs`)

```rust
list_hooks(workspace_id: String) -> Result<Vec<HookFile>, String>
read_hook(workspace_id: String, hook_type: String) -> Result<String, String>
write_hook(workspace_id: String, hook_type: String, content: String) -> Result<(), String>
delete_hook(workspace_id: String, hook_type: String) -> Result<(), String>
```

Register all in `generate_handler!`.

---

## Phase 3 — Plugin System

### 3A. Plugin manifest format

Plugins publish a `plugin.json` in their GitHub repo:

```json
{
  "id": "figma",
  "name": "Figma",
  "version": "1.2.0",
  "description": "Figma design tools — read designs, export assets, sync components",
  "author": "Figma",
  "icon": "https://...",
  "docs": "https://figma.com/developers/mcp",
  "category": "design",
  "scope": "project",
  "skills": [
    "https://github.com/figma/superconsole/tree/main/skills/figma-reader",
    "https://github.com/figma/superconsole/tree/main/skills/figma-exporter"
  ],
  "commands": [
    "https://github.com/figma/superconsole/tree/main/commands/export-assets.md",
    "https://github.com/figma/superconsole/tree/main/commands/sync-components.md"
  ],
  "mcp": {
    "command": "npx",
    "args": ["@figma/mcp@latest"],
    "env": { "FIGMA_ACCESS_TOKEN": "" }
  },
  "hooks": [],
  "connector": {
    "id": "figma",
    "required": true,
    "auth_type": "oauth",
    "oauth_url": "https://www.figma.com/oauth",
    "scopes": ["files:read", "file_content:read"]
  }
}
```

### 3B. New file: `src-tauri/src/plugins.rs`

```rust
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub icon_url: Option<String>,
    pub category: String,
    pub scope: String,
    pub skill_ids: Vec<String>,
    pub mcp_ids: Vec<String>,
    pub command_ids: Vec<String>,
    pub hook_ids: Vec<String>,
    pub connector_ids: Vec<String>,
    pub connector_auth: Vec<ConnectorAuth>,
    pub featured: bool,
}

pub struct ConnectorAuth {
    pub connector_id: String,
    pub required: bool,
    pub auth_type: String,   // 'api_key' | 'oauth'
    pub oauth_url: Option<String>,
    pub api_key_fields: Vec<ApiKeyField>,
}

pub struct InstalledPlugin {
    pub plugin_id: String,
    pub plugin_name: String,
    pub version: String,
    pub installed_at: String,
    pub connectors_status: Vec<ConnectorStatus>, // which connectors are set up
}

pub struct ConnectorStatus {
    pub connector_id: String,
    pub connected: bool,
    pub requires_auth: bool,
}
```

**Plugin install function:**
```rust
pub async fn install_plugin(
    workspace_id: i64,
    plugin_id: &str,
    db: &Db,
    app: &AppHandle,
) -> Result<InstallResult, String> {
    // 1. Fetch plugin from plugins_cache
    let plugin = db.get_plugin(plugin_id)?;
    
    let workspace = db.get_workspace(workspace_id)?;
    
    // 2. Install skills (fetch from GitHub → write to .superconsole/skills/<name>/)
    for skill_url in &plugin.skills_urls {
        fetch_and_install_skill(&workspace.path, skill_url).await?;
    }
    
    // 3. Install commands (fetch from GitHub → write to .superconsole/commands/)
    for cmd_url in &plugin.commands_urls {
        fetch_and_install_command(&workspace.path, cmd_url).await?;
    }
    
    // 4. Install hooks (fetch from GitHub → write to .superconsole/hooks/)
    for hook in &plugin.hooks {
        fetch_and_install_hook(&workspace.path, hook).await?;
    }
    
    // 5. Install MCP (write to .mcp.json)
    if let Some(mcp) = &plugin.mcp_config {
        ensure_mcp_entry(&workspace.path, &plugin.id, mcp)?;
    }
    
    // 6. Check connector auth status
    let mut connectors_needing_auth = vec![];
    for conn_auth in &plugin.connector_auth {
        let is_connected = db.is_connector_set(workspace_id, &conn_auth.connector_id)?;
        if !is_connected && conn_auth.required {
            connectors_needing_auth.push(conn_auth.clone());
        }
    }
    
    // 7. Record installation
    db.record_plugin_install(workspace_id, plugin_id, &plugin.version)?;
    
    // 8. Return result with any connectors needing auth
    Ok(InstallResult {
        success: true,
        plugin_name: plugin.name.clone(),
        connectors_needing_auth,
    })
}

pub struct InstallResult {
    pub success: bool,
    pub plugin_name: String,
    pub connectors_needing_auth: Vec<ConnectorAuth>, // empty = fully set up
}
```

**GitHub fetch helpers:**
```rust
async fn fetch_and_install_skill(workspace_path: &str, github_url: &str) -> Result<(), String> {
    // Parse github URL → owner/repo/tree/branch/path
    // Fetch SKILL.md via GitHub raw API
    // Create folder: .superconsole/skills/<name>/
    // Write SKILL.md
    // Write README.md if exists
}

async fn fetch_and_install_command(workspace_path: &str, github_url: &str) -> Result<(), String> {
    // Fetch .md file from GitHub
    // Write to .superconsole/commands/<name>.md
}

async fn fetch_and_install_hook(workspace_path: &str, hook: &HookInstall) -> Result<(), String> {
    // Fetch script from GitHub
    // Write to .superconsole/hooks/<hook_type>.sh
    // Make executable
}
```

### 3C. Tauri commands for plugins (`lib.rs`)

```rust
// Catalog
list_plugins_catalog(category: Option<String>, scope: Option<String>) -> Result<Vec<Plugin>, String>
search_plugins_catalog(query: String) -> Result<Vec<Plugin>, String>
get_plugin(plugin_id: String) -> Result<Plugin, String>

// Install
install_plugin(workspace_id: String, plugin_id: String) -> Result<InstallResult, String>
uninstall_plugin(workspace_id: String, plugin_id: String) -> Result<(), String>
list_installed_plugins(workspace_id: String) -> Result<Vec<InstalledPlugin>, String>

// Catalog admin (for adding new plugins to the directory)
upsert_plugin_catalog(plugin: Plugin) -> Result<(), String>  // admin only

// Connector catalog
list_connector_catalog(category: Option<String>) -> Result<Vec<ConnectorCatalogEntry>, String>
get_connector_catalog_entry(connector_id: String) -> Result<ConnectorCatalogEntry, String>

// MCP catalog
list_mcp_catalog() -> Result<Vec<McpCatalogEntry>, String>

// Commands catalog
list_commands_catalog() -> Result<Vec<CommandsCatalogEntry>, String>

// Hooks catalog
list_hooks_catalog(hook_type: Option<String>) -> Result<Vec<HooksCatalogEntry>, String>
```

Register all in `generate_handler!`.

---

## Phase 4 — Frontend

### 4A. `src/lib/api.ts` additions

```typescript
// Catalog types
export interface PluginCatalogEntry {
  id: string
  name: string
  description: string
  author: string
  version: string
  iconUrl?: string
  category: string
  scope: string
  skillIds: string[]
  mcpIds: string[]
  commandIds: string[]
  hookIds: string[]
  connectorIds: string[]
  connectorAuth: ConnectorAuthRequirement[]
  featured: boolean
}

export interface ConnectorAuthRequirement {
  connectorId: string
  required: boolean
  authType: 'api_key' | 'oauth'
  oauthUrl?: string
  apiKeyFields: { key: string; label: string; secret: boolean; description: string }[]
}

export interface InstallResult {
  success: boolean
  pluginName: string
  connectorsNeedingAuth: ConnectorAuthRequirement[]
}

export interface InstalledPlugin {
  pluginId: string
  pluginName: string
  version: string
  installedAt: string
  connectorsStatus: { connectorId: string; connected: boolean; requiresAuth: boolean }[]
}

export interface HookFile {
  hookType: string   // 'session-start'|'session-end'|'before-prompt'|'before-mcp'|'before-shell'
  filename: string
  content: string
  exists: boolean
}

export interface ConnectorCatalogEntry {
  id: string
  name: string
  description: string
  category: string
  authType: 'api_key' | 'oauth' | 'none'
  oauthUrl?: string
  apiKeyFields: { key: string; label: string; secret: boolean; description: string }[]
  docsUrl?: string
  iconUrl?: string
  scope: string
}

// API wrappers
export const listPluginsCatalog = (category?: string, scope?: string) =>
  invoke<PluginCatalogEntry[]>('list_plugins_catalog', { category, scope })
export const searchPluginsCatalog = (query: string) =>
  invoke<PluginCatalogEntry[]>('search_plugins_catalog', { query })
export const installPlugin = (workspaceId: string, pluginId: string) =>
  invoke<InstallResult>('install_plugin', { workspaceId, pluginId })
export const uninstallPlugin = (workspaceId: string, pluginId: string) =>
  invoke<void>('uninstall_plugin', { workspaceId, pluginId })
export const listInstalledPlugins = (workspaceId: string) =>
  invoke<InstalledPlugin[]>('list_installed_plugins', { workspaceId })
export const listConnectorCatalog = (category?: string) =>
  invoke<ConnectorCatalogEntry[]>('list_connector_catalog', { category })
export const listMcpCatalog = () =>
  invoke<any[]>('list_mcp_catalog')
export const listHooks = (workspaceId: string) =>
  invoke<HookFile[]>('list_hooks', { workspaceId })
export const readHook = (workspaceId: string, hookType: string) =>
  invoke<string>('read_hook', { workspaceId, hookType })
export const writeHook = (workspaceId: string, hookType: string, content: string) =>
  invoke<void>('write_hook', { workspaceId, hookType, content })
export const deleteHook = (workspaceId: string, hookType: string) =>
  invoke<void>('delete_hook', { workspaceId, hookType })
```

### 4B. `src/components/AgentsDialog.tsx` — Add Plugins tab

The existing dialog has [Agents] [Plugins] tabs.
The Plugins tab currently shows a simple MCP server list.
Replace with the full Plugin Marketplace UI.

**Plugins tab — full layout:**

```
── Installed ──────────────────────────────────────────

[🎨 Figma]       v1.2.0   ✓ fully connected   [···]
[📊 Datadog]     v2.0.0   ⚠ needs auth        [Configure] [···]
[🐙 GitHub]      v1.0.0   ✓ fully connected   [···]

── Browse Marketplace ─────────────────────────────────

[Search plugins...           ]   [All ▾]  [Featured ▾]

Featured:
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ 🎨 Figma         │ │ 📊 Datadog       │ │ 🐙 GitHub        │
│ Figma            │ │ Datadog          │ │ GitHub           │
│ Design tools...  │ │ Logs, metrics... │ │ Issues, PRs...   │
│ Skills: 2 MCP: 1 │ │ MCP: 1          │ │ MCP: 1 Cmds: 3  │
│ [+ Install]      │ │ [+ Install]      │ │ ✓ Installed      │
└──────────────────┘ └──────────────────┘ └──────────────────┘

Business:
[Shopify] [Stripe] [Beehiiv] [Linear] ...

Developer:
[Supabase] [Vercel] [GitHub] [Datadog] ...

[+ Add from GitHub URL]   ← install any plugin by GitHub URL
[+ Add custom MCP server] ← existing behavior
```

**Plugin card detail (on click → expanded sheet):**
```
🎨 Figma  v1.2.0  by Figma

Design tools for your AI agent. Read designs, export assets,
sync components directly in your workflow.

Includes:
  ✓ 2 Skills     figma-reader, figma-exporter
  ✓ 1 MCP        @figma/mcp
  ✓ 2 Commands   /figma-export, /sync-components
  ✓ 1 Connector  Figma (OAuth required)

[Install for this project]   [View docs ↗]

After install, you'll connect your Figma account.
```

**Install flow (step by step in sheet):**

```
Step 1: Installing...
  ✓ Downloading figma-reader skill
  ✓ Downloading figma-exporter skill
  ✓ Adding Figma MCP server
  ✓ Installing commands
  
Step 2: Connect Figma account
  Figma needs access to read your designs.
  
  [Connect with Figma →]   ← opens OAuth URL in system browser
  
  -- OR if API key --
  Access Token [___________________] 👁
  [Save & Finish]

Step 3: Done!
  ✓ Figma plugin installed
  ✓ Figma account connected
  
  Your agent can now:
  • Read Figma designs
  • Export assets
  • Use /figma-export command
  
  [Done]
```

**Three-dot menu per installed plugin:**
```
Configure    ← update connector credentials
View docs    ← open docs URL
Check for updates
Uninstall
```

### 4C. Hooks UI — new section in Project Settings

Add `Hooks` to the Project tab nav (after Scripts, before Automations).

**Project → Hooks:**
```
Hooks
Lifecycle scripts that run automatically during agent sessions.
All scripts are shell files in .superconsole/hooks/

Session Start       [Edit]    ← runs when CLI session opens
No script configured

Session End         [Edit]    ← runs when CLI session closes  
✓ session-end.sh exists

Before Prompt       [Edit]    ← runs before every LLM call
✓ before-prompt.sh exists

Before MCP          [Edit]    ← runs before MCP tool execution
No script configured

Before Shell        [Edit]    ← runs before shell commands
No script configured

[Browse hook library ↗]       ← opens hooks catalog in AgentsDialog
```

**[Edit] opens inline editor:**
```
Session End Hook

#!/bin/bash
# Runs when a CLI session ends
[                              ]
[  code editor (monospace)     ]
[  full height                 ]

[Save]  [Delete]  [Cancel]
```

Show template examples when creating new hook:
```
[Session summary template]
[Telegram notification template]
[HEARTBEAT.md update template]
[Custom...]
```

### 4D. [+] Composer menu — update MCP Servers section

In `ChatComposer.tsx`, the MCP Servers submenu currently shows a basic list.
Update to:

```
MCP Servers →
  Search MCP servers...
  
  Project:
    ✓ superconsole     [always on]
    ✓ figma-mcp        ● connected
    ⚠ github-mcp       ● needs auth
    
  Account:
    ✓ notebooklm       ● connected
    
  [Open MCP Settings →]
  [Browse Plugins →]     ← opens plugin marketplace
```

Matches Cursor's screenshot exactly (User section + Plugins section with toggle switches).

### 4E. Connector Catalog UI — Settings → Connectors

In `SettingsPage.tsx`, the Connectors section currently shows only connected services.
Add a "Browse all connectors" section below:

```
Connected (3):
  ✓ Gmail          sarah@acmedental.com   [Edit] [Remove]
  ✓ Shopify        acmedental.myshopify.com [Edit] [Remove]
  ✓ Beehiiv        Acme Dental Newsletter   [Edit] [Remove]

[+ Add connector]

Available connectors:
[Search connectors...]   [Business ▾]

Business:
  Shopify  •  Stripe  •  Beehiiv  •  ConvertKit  •  Buffer
  
Developer:
  GitHub  •  Supabase  •  Turso  •  Vercel  •  Linear
  
Communication:
  Slack  •  Telegram  •  Discord  •  Twilio

[See all →]
```

Each unconnected connector card shows:
- Name + icon + one-line description
- Auth type badge: [API Key] or [OAuth]
- [Connect] button → opens connection flow

**Connection flow for OAuth:**
```
Connect Gmail

Gmail needs permission to send emails and read your inbox
on behalf of this project.

[Connect with Google →]   ← opens OAuth in system browser

After connecting, Gmail will be available to your agent
in this project only.
```

**Connection flow for API Key:**
```
Connect Beehiiv

API Key  [_______________________] 👁
         From: Beehiiv → Settings → API
         [Beehiiv docs ↗]

Publication ID  [_______________]

[Save]  [Cancel]
```

### 4F. Customize page (new — like Cursor's Customize)

Add `Customize` to the sidebar nav (between Sessions and Usage).
This is the project's customization hub — all assets in one place.

**Sidebar nav (after update):**
```
Inbox
Tasks
Sessions
Customize    ← NEW
Usage
```

**Customize page layout:**
```
[Workspace selector: acme-dental ▾]

[Plugins] [MCPs] [Skills] [Commands] [Hooks] [Agents] [Rules]
                                                        ↑ future

── Plugins tab (default) ──────────────────────────────

Installed (3)                        [Browse Marketplace →]

🎨 Figma        v1.2.0   ✓ connected   [···]
🐙 GitHub       v1.0.0   ✓ connected   [···]
📊 Datadog      v2.0.0   ⚠ needs auth  [Configure] [···]

── MCPs tab ───────────────────────────────────────────

.mcp.json servers for this project:

superconsole    [always on — SuperConsole tools]
figma-mcp       ✓ running    [···]
github-mcp      ⚠ needs auth [Configure] [···]

[+ Add MCP server]

── Skills tab ─────────────────────────────────────────

Project skills in .superconsole/skills/:

newsletter-writer/    ← from Beehiiv plugin
seo-audit/           ← installed manually

[+ New skill]  [Install from library →]

── Commands tab ───────────────────────────────────────

/ceo              → ceo-brief.md
/newsletter       → newsletter.md
/social           → social-posts.md

[+ New command]

── Hooks tab ──────────────────────────────────────────

session-end.sh    ✓ configured   [Edit]
before-prompt.sh  ✓ configured   [Edit]
before-mcp.sh     ○ not set      [Add]
session-start.sh  ○ not set      [Add]
before-shell.sh   ○ not set      [Add]

[Browse hook library →]
```

This page replaces the scattered settings across TopBar dialogs.
TopBar dialogs (Skills, Memory, Wiki, Context, Agents) still exist for quick access.
Customize page is the comprehensive view.

---

## Phase 5 — Plugin Manifest from GitHub URL

Allow users to install any plugin by pasting a GitHub URL.

### Backend (`plugins.rs`)

```rust
pub async fn install_plugin_from_url(
    workspace_id: i64,
    github_url: &str,
    db: &Db,
    app: &AppHandle,
) -> Result<InstallResult, String> {
    // 1. Detect manifest location (same as agent repo detection):
    //    .superconsole-plugin/plugin.json
    //    .claude-plugin/plugin.json  
    //    plugin.json at repo root
    
    // 2. Fetch and parse manifest
    let manifest = fetch_plugin_manifest(github_url).await?;
    
    // 3. Upsert into plugins_cache
    db.upsert_plugin_cache(&manifest)?;
    
    // 4. Install (same as install_plugin)
    install_plugin(workspace_id, &manifest.id, db, app).await
}
```

New command: `install_plugin_from_url(workspace_id, github_url)`
Register in `generate_handler!`.

### Frontend

"Add from GitHub URL" form in the Plugins tab:
```
[https://github.com/company/my-plugin  ] [Install →]
```

Loading state: "Fetching plugin manifest..."
On success: shows same install flow as catalog plugins.

---

## Phase 6 — Seed Data (initial catalog content)

Seed the Turso catalogs with initial entries via a one-time migration or seeder.

### connector_catalog seed (from existing REGISTRY):
All services already in `connectors.rs` REGISTRY → upsert into connector_catalog.

### plugins seed (curated initial set):

```json
[
  {
    "id": "figma",
    "name": "Figma",
    "author": "Figma",
    "category": "design",
    "mcp_ids": ["figma-mcp"],
    "connector_auth": [{"connector_id": "figma", "required": true, "auth_type": "oauth"}],
    "featured": true
  },
  {
    "id": "linear",
    "name": "Linear",
    "author": "Linear",
    "category": "productivity",
    "mcp_ids": ["linear-mcp"],
    "connector_auth": [{"connector_id": "linear", "required": true, "auth_type": "api_key"}],
    "featured": true
  },
  {
    "id": "github",
    "name": "GitHub",
    "author": "GitHub",
    "category": "developer",
    "mcp_ids": ["github-mcp"],
    "connector_auth": [{"connector_id": "github", "required": true, "auth_type": "api_key"}],
    "featured": true
  },
  {
    "id": "shopify",
    "name": "Shopify",
    "author": "Shopify",
    "category": "business",
    "mcp_ids": ["shopify-dev"],
    "skills_url": "https://github.com/superconsole/plugins/tree/main/shopify/skills",
    "connector_auth": [{"connector_id": "shopify", "required": true, "auth_type": "api_key"}],
    "featured": true
  },
  {
    "id": "slack",
    "name": "Slack",
    "author": "Slack",
    "category": "communication",
    "mcp_ids": ["slack-mcp"],
    "connector_auth": [{"connector_id": "slack", "required": true, "auth_type": "api_key"}],
    "featured": false
  },
  {
    "id": "notion",
    "name": "Notion",
    "author": "Notion",
    "category": "productivity",
    "mcp_ids": ["notion-mcp"],
    "connector_auth": [{"connector_id": "notion", "required": true, "auth_type": "api_key"}],
    "featured": false
  },
  {
    "id": "supabase",
    "name": "Supabase",
    "author": "Supabase",
    "category": "developer",
    "mcp_ids": ["supabase-mcp"],
    "connector_auth": [{"connector_id": "supabase", "required": true, "auth_type": "api_key"}],
    "featured": true
  },
  {
    "id": "stripe",
    "name": "Stripe",
    "author": "Stripe",
    "category": "business",
    "mcp_ids": ["stripe-mcp"],
    "connector_auth": [{"connector_id": "stripe", "required": true, "auth_type": "api_key"}],
    "featured": false
  }
]
```

---

## Scope Rules

- Do NOT rewrite AgentsDialog, SettingsPage, or ChatComposer — extend only
- Hooks NEVER block main operation — always use timeout, always catch errors
- Plugin install from GitHub = same pattern as `install_catalog_agent` in agents.rs
- Connector auth on plugin install = open system browser for OAuth OR show API key form
- connector_catalog is built FROM the existing REGISTRY (not separate data)
- Mirror connector registry changes across all 3 files always (connectors.rs, api.ts, connector-registry.ts)
- All file ops through `files.rs::resolve`
- `cargo check` and `npm run build` must pass clean

---

## Build Order

1. Phase 1 — Catalog tables (DB + Turso migrations + sync)
2. Phase 2 — Hooks system (hooks.rs + execution points)
3. Phase 3 — Plugin install backend (plugins.rs)
4. Phase 4 — Frontend (Customize page + Plugin marketplace + Hooks UI + MCP menu update)
5. Phase 5 — Install from GitHub URL
6. Phase 6 — Seed initial catalog data

Run `cargo check` after Phase 1-3.
Run `npm run build` after Phase 4.
Both must be clean before moving to next phase.
