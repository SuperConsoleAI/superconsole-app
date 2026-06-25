const fs = require('fs');
let code = fs.readFileSync('superconsole-web/src/db/schema.ts', 'utf8');

// 1. Add rulesCatalog table at the end
const rulesCatalogTable = `\n
export const rulesCatalog = sqliteTable("rules_catalog", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  author: text("author").notNull(),
  framework: text("framework").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  githubUrl: text("github_url").notNull(),
  content: text("content").notNull().default(""),
  installCount: integer("install_count").notNull().default(0),
  featured: integer("featured").notNull().default(0),
});
`;
if (!code.includes('export const rulesCatalog')) {
  code += rulesCatalogTable;
}

// 2. Ensure agentCatalog has content
if (!code.includes('content: text("content")') || code.indexOf('export const agentCatalog') > -1) {
  code = code.replace(
    'githubUrl: text("github_url").notNull(),\n  iconUrl:',
    'githubUrl: text("github_url").notNull(),\n  content: text("content").notNull().default(""),\n  iconUrl:'
  );
}
// connectorCatalog
if (code.indexOf('export const connectorCatalog') > -1) {
  code = code.replace(
    'githubUrl: text("github_url").notNull(),\n  docsUrl:',
    'githubUrl: text("github_url").notNull(),\n  content: text("content").notNull().default(""),\n  docsUrl:'
  );
}
// mcpCatalog
if (code.indexOf('export const mcpCatalog') > -1) {
  code = code.replace(
    'githubUrl: text("github_url").notNull(),\n  iconUrl:',
    'githubUrl: text("github_url").notNull(),\n  content: text("content").notNull().default(""),\n  iconUrl:'
  );
}

// commandsCatalog
code = code.replace(
  '  content: text("content"),',
  '  content: text("content").notNull().default(""),'
);
// hooksCatalog
code = code.replace(
  '  content: text("content"),',
  '  content: text("content").notNull().default(""),'
);

// 3. Update plugins
code = code.replace(
  '  connectorIds: text("connector_ids").notNull().default("[]"),\n  skillsUrl',
  '  connectorIds: text("connector_ids").notNull().default("[]"),\n  rulesUrl: text("rules_url").notNull().default("[]"),\n  ruleIds: text("rule_ids").notNull().default("[]"),\n  agentsUrl: text("agents_url").notNull().default("[]"),\n  skillsUrl'
);

// 4. Update installedPlugins
code = code.replace(
  '  version: text("version").notNull(),\n  skillsUrl',
  '  version: text("version").notNull(),\n  skillIds: text("skill_ids").notNull().default("[]"),\n  mcpIds: text("mcp_ids").notNull().default("[]"),\n  commandIds: text("command_ids").notNull().default("[]"),\n  hookIds: text("hook_ids").notNull().default("[]"),\n  ruleIds: text("rule_ids").notNull().default("[]"),\n  connectorIds: text("connector_ids").notNull().default("[]"),\n  rulesUrl: text("rules_url").notNull().default("[]"),\n  agentsUrl: text("agents_url").notNull().default("[]"),\n  skillsUrl'
);

fs.writeFileSync('superconsole-web/src/db/schema.ts', code);
console.log("Patched!");
