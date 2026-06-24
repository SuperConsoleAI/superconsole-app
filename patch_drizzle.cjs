const fs = require('fs');
let code = fs.readFileSync('superconsole-web/src/db/schema.ts', 'utf8');

const oldInstalled = `export const installedPlugins = sqliteTable("installed_plugins", {
  id: text("id").primaryKey().notNull(),
  pluginId: text("plugin_id")
    .notNull()
    .references(() => plugins.id),
  scope: text("scope").notNull(),
  scopeId: text("scope_id").notNull(),
  installedAt: text("installed_at")
    .notNull()
    .default(sql\`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\`),
  installedBy: text("installed_by").notNull(),
  version: text("version").notNull(),
});`;

const newInstalled = `export const installedPlugins = sqliteTable("installed_plugins", {
  id: text("id").primaryKey().notNull(),
  pluginId: text("plugin_id")
    .notNull()
    .references(() => plugins.id),
  scope: text("scope").notNull(),
  scopeId: text("scope_id").notNull(),
  installedAt: text("installed_at")
    .notNull()
    .default(sql\`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\`),
  installedBy: text("installed_by").notNull(),
  version: text("version").notNull(),
  skillsUrl: text("skills_url").notNull().default("[]"),
  commandsUrl: text("commands_url").notNull().default("[]"),
  hooksUrl: text("hooks_url").notNull().default("[]"),
  mcpUrl: text("mcp_url").notNull().default("[]"),
});`;

code = code.replace(oldInstalled, newInstalled);
fs.writeFileSync('superconsole-web/src/db/schema.ts', code);
