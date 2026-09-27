const fs = require('fs');
const path = require('path');

const webappLib = path.join(__dirname, '../businesskit-web/src/lib');
const tauriSchema = path.join(__dirname, 'src/db/schema');

const domains = [
  { file: 'ads.ts', name: 'ads', schemaPrefix: 'ADS' },
  { file: 'affiliate.ts', name: 'affiliate', schemaPrefix: 'AFFILIATE' },
  { file: 'agent.ts', name: 'agents', schemaPrefix: 'AGENTS' }, 
  { file: 'community.ts', name: 'community', schemaPrefix: 'COMMUNITY' },
  { file: 'content.ts', name: 'content', schemaPrefix: 'CONTENT' },
  { file: 'crm.ts', name: 'crm', schemaPrefix: 'CRM' },
  { file: 'email-tracking.ts', name: 'email', schemaPrefix: 'EMAIL_TRACKING' },
  { file: 'feedback.ts', name: 'feedback', schemaPrefix: 'FEEDBACK' },
  { file: 'forms.ts', name: 'forms', schemaPrefix: 'FORMS' },
  { file: 'gsc.ts', name: 'gsc', schemaPrefix: 'GSC' },
  { file: 'jobs.ts', name: 'jobs', schemaPrefix: 'JOBS' },
  { file: 'review.ts', name: 'review', schemaPrefix: 'REVIEW' }, 
  { file: 'social.ts', name: 'social', schemaPrefix: 'SOCIAL' },
  { file: 'chat-agent.ts', name: 'chat_agent', schemaPrefix: 'CHAT_AGENT', altDir: '../businesskit-web/src/db' }, // from db/chat-agent.ts
  { file: 'chat-agent.ts', name: 'voice_calls', schemaPrefix: 'VOICE_CALLS', altDir: '../businesskit-web/src/db' }, // from db/chat-agent.ts
  { file: 'community-triggers.ts', name: 'community_triggers', schemaPrefix: 'COMMUNITY' },
  { file: 'product-triggers.ts', name: 'product_triggers', schemaPrefix: 'PRODUCT' },
];

if (!fs.existsSync(tauriSchema)) {
  fs.mkdirSync(tauriSchema, { recursive: true });
}

for (const d of domains) {
  const dir = d.altDir ? path.join(__dirname, d.altDir) : webappLib;
  const tsPath = path.join(dir, d.file);
  
  if (!fs.existsSync(tsPath)) {
    console.log(`Skipping ${d.file} - not found at ${tsPath}`);
    continue;
  }
  
  const content = fs.readFileSync(tsPath, 'utf-8');
  
  // Extract top-level comments (before the first 'export')
  const firstExportIndex = content.indexOf('export const');
  let topComments = '';
  if (firstExportIndex > 0) {
    const rawTop = content.slice(0, firstExportIndex).trim();
    // Only keep lines that start with //
    topComments = rawTop.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('//'))
      .join('\n');
  }
  
  let allSchemaStrings = [];
  
  // Regex to find exported string arrays like: export const BLAH_SQL: string[] = [ ... ];
  // Because these arrays might not have `: string[]`, we look for `export const XXX_SQL = [`
  // We need to exclude MIGRATIONS_SQL.
  const arrayRegex = /export const ([A-Z_]+_SQL)(?:\s*:\s*string\[\])?\s*=\s*\[([\s\S]*?)\n\]/g;
  let arrayMatch;
  while ((arrayMatch = arrayRegex.exec(content)) !== null) {
    const varName = arrayMatch[1];
    const rawArray = arrayMatch[2];
    
    if (varName.endsWith('_MIGRATIONS_SQL')) continue; // handle separately
    
    // We only want backticks, OR strings that look like SQL (CREATE/DROP/INSERT/ALTER).
    const stringRegex = /(?:`([\s\S]*?)`|'([\s\S]*?)'|"([\s\S]*?)")/g;
    let match;
    while ((match = stringRegex.exec(rawArray)) !== null) {
      let sql = match[1] || match[2] || match[3];
      if (sql && sql.trim() !== "") {
         let s = sql.trim();
         if (s.startsWith('CREATE') || s.startsWith('DROP') || s.startsWith('INSERT') || s.startsWith('ALTER') || s.startsWith('CASE') || match[1] !== undefined) {
             allSchemaStrings.push(`    r#"${s}"#`);
         }
      }
    }
  }
  
  // Now handle MIGRATIONS_SQL
  let allMigrations = [];
  const migRegex = /export const ([A-Z_]+_MIGRATIONS_SQL)(?:[\s\S]*?)=\s*\[([\s\S]*?)\n\]/g;
  let migMatch;
  while ((migMatch = migRegex.exec(content)) !== null) {
    const rawArray = migMatch[2];
    const objRegex = /\{[\s\S]*?id:\s*(?:'|"|`)([\s\S]*?)(?:'|"|`),[\s\S]*?table:\s*(?:'|"|`)([\s\S]*?)(?:'|"|`),[\s\S]*?sql:\s*(?:'|"|`)([\s\S]*?)(?:'|"|`)[\s\S]*?\}/g;
    let match;
    while ((match = objRegex.exec(rawArray)) !== null) {
      allMigrations.push(`    Migration {\n        id: "${match[1]}",\n        table: "${match[2]}",\n        sql: r#"${match[3]}"#\n    }`);
    }
  }
  
  let rustCode = `// src-tauri/src/db/schema/${d.name}.rs\nuse super::Migration;\n\n`;
  if (topComments) {
    rustCode += `${topComments}\n\n`;
  }
  rustCode += `pub const SCHEMA_SQL: &[&str] = &[\n`;
  rustCode += allSchemaStrings.join(',\n');
  rustCode += `\n];\n\n`;
  
  rustCode += `pub const MIGRATIONS_SQL: &[Migration] = &[\n`;
  rustCode += allMigrations.join(',\n');
  rustCode += `\n];\n`;
  
  fs.writeFileSync(path.join(tauriSchema, `${d.name}.rs`), rustCode);
  console.log(`Generated ${d.name}.rs (${allSchemaStrings.length} statements, ${allMigrations.length} migrations)`);
}

const uniqueModules = [...new Set(domains.map(d => d.name))];

const modRsPath = path.join(tauriSchema, 'mod.rs');
let modRsCode = `// src-tauri/src/db/schema/mod.rs\n\n`;
for (const m of uniqueModules) {
  modRsCode += `pub mod ${m};\n`;
}
modRsCode += `\n#[derive(Clone, Copy)]\npub struct Migration {\n    pub id: &'static str,\n    pub table: &'static str,\n    pub sql: &'static str,\n}\n`;

fs.writeFileSync(modRsPath, modRsCode);
console.log('Generated mod.rs');
