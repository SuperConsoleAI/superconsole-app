const fs = require('fs');

let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(
  /Each plugin bundles Skills, MCP servers, lifecycle hooks, and connector auth flows\. Install\/uninstall per workspace with an animated step UI\./,
  "Each plugin bundles Skills, MCP servers, lifecycle hooks, and connector auth flows. Install/uninstall strictly respects the project boundary (no account-level inheritance bleed in project views), featuring an animated step UI."
);
fs.writeFileSync('README.md', readme);

let arch = fs.readFileSync('ARCHITECTURE.md', 'utf8');
arch = arch.replace(
  /Layout: full-width `TopBar` \(holds macOS traffic lights via titleBarStyle Overlay \+ drag region\)/,
  "Layout: full-width `TopBar` (holds macOS traffic lights via titleBarStyle Overlay + drag region; dynamically appends the active context suffix like file name or tab context via an en dash `–` and smoothly aligns left-margin with sidebar state)"
);
arch = arch.replace(
  /`plugins\.rs`    plugin marketplace: catalog CRUD \(plugins_cache\/workspace_plugins\), install_plugin \(skills\+MCP\+hooks\+commands\)/,
  "`plugins.rs`    plugin marketplace: catalog CRUD (plugins_cache/workspace_plugins), strictly-scoped `list_installed_plugins` (ensuring 13-column structural mapping), install_plugin (skills+MCP+hooks+commands)"
);
fs.writeFileSync('ARCHITECTURE.md', arch);

let codebase = fs.readFileSync('CODEBASE.md', 'utf8');
codebase = codebase.replace(
  /Schema \(workspaces, organizations, jobs, inbox, settings, session_history, chat_messages, chat_sessions, skills\/memory\/wiki caches\) \+ all queries\. Migrations are idempotent blocks in `Db::init`\./,
  "Schema (workspaces, organizations, jobs, inbox, settings, session_history, chat_messages, chat_sessions, plugins cache, skills/memory/wiki caches) + all queries. Migrations are idempotent blocks in `Db::init` (incorporating `ALTER TABLE` to dynamically add newer relational mapping columns gracefully for legacy databases)."
);
codebase = codebase.replace(
  /`components\/TopBar\.tsx` \| h-10 full-width bar: traffic-light padding, sidebar toggle, back\/forward, workspace name, jobs\/files\/theme buttons\./,
  "`components/TopBar.tsx` | h-10 full-width bar: traffic-light padding, sidebar toggle, back/forward, workspace name + dynamic tab suffix (via en dash `–`), responsive left-margin, jobs/files/theme buttons."
);
fs.writeFileSync('CODEBASE.md', codebase);

let tech = fs.readFileSync('TECH_STACK.md', 'utf8');
// Assuming TECH_STACK is mostly fine, we can add a note about typography/fonts for the TopBar.
tech = tech.replace(
  /\| `@fontsource-variable\/{archivo,lora,jetbrains-mono}` \| Bundled variable fonts \(offline app, no Google Fonts CDN\)\. \|/,
  "| `@fontsource-variable/{archivo,lora,jetbrains-mono}` | Bundled variable fonts (offline app, no Google Fonts CDN). Used alongside system fonts (e.g. macOS SF Pro) for native-feeling UI elements like the Top Bar. |"
);
fs.writeFileSync('TECH_STACK.md', tech);

let design = fs.readFileSync('DESIGN_PRINCIPLES.md', 'utf8');
design = design.replace(
  /Fonts: Archivo \(UI\), Lora via `\.font-display` \(headings\/brand\), JetBrains Mono via `font-mono` \(paths, commands, code\)\./,
  "Fonts: System fonts (e.g. SF Pro on macOS) combined with Archivo (UI), Lora via `.font-display` (headings/brand), JetBrains Mono via `font-mono` (paths, commands, code). Use proper typographic separators (en dash `–` over em dash `—`) for uniform UI text strings without unnecessary DOM nesting."
);
design = design.replace(
  /DB migrations: append idempotent `CREATE TABLE IF NOT EXISTS` \/ guarded `ALTER TABLE` blocks in `Db::init`\. Never edit existing migration blocks\. Local-only tables \(e\.g\. `chat_threads`\) stay out of Turso\./,
  "DB migrations: append idempotent `CREATE TABLE IF NOT EXISTS` / guarded `ALTER TABLE` blocks in `Db::init` (always ensure new columns are added to legacy databases to avoid silent query failures). Never edit existing migration blocks. Local-only tables (e.g. `chat_threads`) stay out of Turso."
);
design = design.replace(
  /Every filesystem operation on workspace content goes through `files\.rs::resolve` \(path sandbox\)\./,
  "Every filesystem operation on workspace content goes through `files.rs::resolve` (path sandbox). For SQLite queries, `SELECT` column lengths MUST precisely match the row mapping length to avoid swallowing `rusqlite::Error::InvalidColumnIndex`."
);
fs.writeFileSync('DESIGN_PRINCIPLES.md', design);

let ctx = fs.readFileSync('CONTEXT.md', 'utf8');
ctx = ctx.replace(
  /- `files\.rs::resolve` rejects `\.\.`\/absolute paths — every file op must go through it\./,
  "- `files.rs::resolve` rejects `..`/absolute paths — every file op must go through it.\n- SQLite `SELECT` statements must match their struct mapping lengths exactly; missing columns cause silent `iter.filter_map(|r| r.ok())` failure drops, leading to empty arrays without logging."
);
ctx = ctx.replace(
  /- Theme: `ThemeProvider` toggles `\.dark` on `<html>`, persisted to localStorage \(`superconsole-theme`\); active org persisted as `superconsole-org`\./,
  "- Theme: `ThemeProvider` toggles `.dark` on `<html>`, persisted to localStorage (`superconsole-theme`); active org persisted as `superconsole-org`.\n- Context Injection: Tab changes and Customize routes dispatch dynamic `titleSuffix` values up to the Router, which updates the TopBar to display the current file or plugin context seamlessly."
);
fs.writeFileSync('CONTEXT.md', ctx);
