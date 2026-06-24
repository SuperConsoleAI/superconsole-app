const fs = require('fs');
let content = fs.readFileSync('src/lib/api.ts', 'utf8');

content = content.replace(
  '  connectorAuth: string; // JSON array string',
  '  skillsUrl?: string;\n  commandsUrl?: string;\n  hooksUrl?: string;\n  mcpUrl?: string;\n  connectorAuth: string; // JSON array string'
);

fs.writeFileSync('src/lib/api.ts', content);
