const fs = require('fs');

let content = fs.readFileSync('superconsole-web/src/db/schema.ts', 'utf8');

// The `plugins` table definition needs to be updated.
content = content.replace(
  '  skillsUrl: text("skills_url"),',
  '  skillsUrl: text("skills_url").notNull().default("[]"),'
);
content = content.replace(
  '  commandsUrl: text("commands_url"),',
  '  commandsUrl: text("commands_url").notNull().default("[]"),'
);
content = content.replace(
  '  hooksUrl: text("hooks_url"),',
  '  hooksUrl: text("hooks_url").notNull().default("[]"),'
);
// Insert `mcpUrl` right after `mcpIds` or anywhere in the schema
content = content.replace(
  '  mcpIds: text("mcp_ids").notNull().default("[]"),',
  '  mcpIds: text("mcp_ids").notNull().default("[]"),\n  mcpUrl: text("mcp_url").notNull().default("[]"),'
);

fs.writeFileSync('superconsole-web/src/db/schema.ts', content);
