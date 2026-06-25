# SuperConsole — Rules System

## .superconsole/rules/*.mdc

Read `CODEBASE.md`, `CLAUDE.md`, `DESIGN_PRINCIPLES.md` before touching anything.
`cargo check` and `npm run build` must pass clean before done.

---

## What

Rules = behavior guidelines injected into every agent/chat system prompt.
Same concept as Cursor rules — `.mdc` files (markdown with optional frontmatter).
Project-scoped. Committed to git. CLI-native.

```
.superconsole/rules/
  always-respond-in-english.mdc
  no-delete-operations.mdc
  shopify-guidelines.mdc
  code-style.mdc
```

---

## Backend — `context.rs` or new `rules.rs`

Add alongside existing context file functions. Same pattern.

**New functions:**

```rust
pub fn list_rules(workspace_path: &str) -> Vec<RuleFile>
pub fn read_rule(workspace_path: &str, slug: &str) -> Result<String, String>
pub fn write_rule(workspace_path: &str, slug: &str, content: &str) -> Result<(), String>
pub fn delete_rule(workspace_path: &str, slug: &str) -> Result<(), String>

pub struct RuleFile {
    pub slug: String,       // filename without .mdc
    pub name: String,       // from frontmatter or slug
    pub description: String, // from frontmatter or first line
    pub content: String,
    pub always_apply: bool, // from frontmatter, default true
}
```

File format (`.mdc`):

```markdown
---
name: No Delete Operations
description: Prevent accidental data deletion
always_apply: true
---

Never use DELETE, DROP, or TRUNCATE SQL operations.
Always use soft deletes (set deleted_at timestamp).
Confirm with user before any destructive operation.
```

**Injection (`chat.rs::build_system_prompt`):**

```rust
// Load all rules with always_apply: true
let rules = list_rules(&workspace.path);
let active_rules: Vec<_> = rules.iter()
    .filter(|r| r.always_apply)
    .collect();

if !active_rules.is_empty() {
    system_prompt += "\n\n## Rules\n";
    for rule in active_rules {
        system_prompt += &format!("### {}\n{}\n", rule.name, rule.content);
    }
}
```

Same injection in `scheduler.rs::exec_agent` system prompt.

**MCP tool (add to `mcp.rs`):**

```
rule_list()         → list all rules
rule_read(slug)     → fetch one rule on demand
```

**Tauri commands (`lib.rs`):**

```
list_rules(workspace_id) -> Result<Vec<RuleFile>>
read_rule(workspace_id, slug) -> Result<String>
write_rule(workspace_id, slug, content) -> Result<()>
delete_rule(workspace_id, slug) -> Result<()>
```

Register all in `generate_handler!`.

---

## Frontend

### `api.ts`

```typescript
export interface RuleFile {
  slug: string
  name: string
  description: string
  content: string
  alwaysApply: boolean
}
export const listRules = (workspaceId: string) => invoke<RuleFile[]>('list_rules', { workspaceId })
export const writeRule = (workspaceId: string, slug: string, content: string) => invoke<void>('write_rule', { workspaceId, slug, content })
export const deleteRule = (workspaceId: string, slug: string) => invoke<void>('delete_rule', { workspaceId, slug })
```

### `CustomizePage.tsx` — Add Rules tab

Add `Rules` tab between `Hooks` and `Agents` in the Customize page tab strip.

```
[Plugins] [MCPs] [Skills] [Commands] [Hooks] [Rules] [Agents]
```

**Rules tab layout:**

```
Rules
Behavior guidelines injected into every agent and chat session.
Stored in .superconsole/rules/ — committed to git.

[+ New rule]

always-respond-in-english    Always apply    [Edit] [Delete]
no-delete-operations         Always apply    [Edit] [Delete]
shopify-guidelines           Always apply    [Edit] [Delete]

[empty state]: "No rules yet. Add guidelines your agent should always follow."
```

**Edit/create form (inline expand):**

```
Name        [________________________________]
Description [________________________________]
[✓] Always apply to every session

Content:
[                                            ]
[  .mdc markdown editor                     ]
[  full height, monospace                   ]

[Save]  [Cancel]
```

### `slash-items.ts` — add rules to autocomplete

```typescript
const rules = await api.listRules(workspaceId)
// → insert as: /rule:no-delete-operations
```

---

## Scope rules

- `.mdc` extension only — not `.md`
- All file ops through `files.rs::resolve`
- `always_apply: true` = injected automatically (default)
- `always_apply: false` = available via `/rule:name` token only
- Do NOT gitignore `.superconsole/rules/` — rules travel with repo
- Do NOT sync rules content to Turso — files + git only
- `cargo check` and `npm run build` must pass clean

Yes — add `rules_url` to both tables.

**`plugins` table (Turso):**

```sql
ALTER TABLE plugins ADD COLUMN rules_url TEXT NOT NULL DEFAULT '[]';
-- ["https://github.com/SuperConsoleAI/plugins/blob/main/shopify/rules/shopify-guidelines.mdc"]
```

**`installed_plugins` table (Turso):**

```sql
ALTER TABLE installed_plugins ADD COLUMN rules_url TEXT NOT NULL DEFAULT '[]';
-- stored so new machine can re-install the exact rules
```

**`plugins_cache` + `installed_plugins_cache` (local SQLite):**

```sql
-- same column in both cache tables
ALTER TABLE plugins_cache ADD COLUMN rules_url TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins_cache ADD COLUMN rules_url TEXT NOT NULL DEFAULT '[]';
```

**`do_install_plugin` in `plugins.rs`:**

```rust
// Add alongside skills/commands/hooks install:
for rule_url in &plugin.rules_url {
    fetch_and_install_rule(&base_path, rule_url).await?;
    // writes to <base_path>/rules/<name>.mdc
}
```

**`PublishPluginDialog.tsx`:**
Add `rules_url` field — same pattern as `commands_url`:

```
Rules URLs    [+ add URL]
  https://github.com/.../rules/shopify-guidelines.mdc  [×]
```

Tell Droid: add `rules_url TEXT NOT NULL DEFAULT '[]'` to all 4 tables + Drizzle migration + parse in `do_install_plugin` + add field to publish dialog
----

Yes — installed_plugins needs all ID columns too:

```
Current installed_plugins:
  plugin_id, scope, scope_id, version
  skills_url, commands_url, hooks_url, mcp_url, rules_url

Missing:
  skill_ids, mcp_ids, command_ids, hook_ids, rule_ids, connector_ids
```

**Why both IDs and URLs in installed_plugins:**

```
_ids  → what was installed (display, audit trail)
        "user installed Shopify plugin which included
         skill:shopify-manager, mcp:shopify-dev, connector:shopify"
        
_url  → how to reinstall on new machine
        actual GitHub URLs to fetch content from

Both needed:
  IDs  = what (display in Customize page "installed from catalog")
  URLs = how (restore on new machine without catalog lookup)
```

**Updated installed_plugins table:**

```sql
ALTER TABLE installed_plugins ADD COLUMN skill_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins ADD COLUMN mcp_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins ADD COLUMN command_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins ADD COLUMN hook_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins ADD COLUMN rule_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins ADD COLUMN connector_ids TEXT NOT NULL DEFAULT '[]';
```

**Same for local cache:**

```sql
ALTER TABLE installed_plugins_cache ADD COLUMN skill_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins_cache ADD COLUMN mcp_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins_cache ADD COLUMN command_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins_cache ADD COLUMN hook_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins_cache ADD COLUMN rule_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE installed_plugins_cache ADD COLUMN connector_ids TEXT NOT NULL DEFAULT '[]';
```

**On install — copy from plugin row:**

```rust
// do_install_plugin copies IDs + URLs from plugin row to installed record
installed_plugin.skill_ids    = plugin.skill_ids.clone()
installed_plugin.mcp_ids      = plugin.mcp_ids.clone()
installed_plugin.command_ids  = plugin.command_ids.clone()
installed_plugin.hook_ids     = plugin.hook_ids.clone()
installed_plugin.rule_ids     = plugin.rule_ids.clone()
installed_plugin.connector_ids = plugin.connector_ids.clone()
// URLs same
installed_plugin.skills_url   = plugin.skills_url.clone()
installed_plugin.mcp_url      = plugin.mcp_url.clone()
// etc.
```

**Use case — Customize page shows installed detail:**

```
🛍️ Shopify  v1.0.0  ✓ connected

Includes:
  Skills:     shopify-manager, product-writer
  MCP:        shopify-dev
  Commands:   check-orders, update-products
  Connectors: shopify ✓ connected
  Rules:      shopify-guidelines
```

All readable from installed_plugins row — no join to plugin catalog needed.

Tell Droid: add 6 `*_ids` columns to both `installed_plugins` and `installed_plugins_cache` tables + Drizzle migration + copy from plugin row during `do_install_plugin`.

- add rules_ids column in plugins and plugins_cache

rules_catalog (Turso):
  id, name, description, category
  author, framework, tags
  github_url       ← raw .mdc file URL
  content          ← cached content
  install_count
  featured
