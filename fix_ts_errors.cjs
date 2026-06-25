const fs = require('fs');

// 1. Fix RulesDialog.tsx
let rules = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');
rules = rules.replace(/await api\.deleteRule\(slug\);/, 'await api.deleteRule(workspaceId, slug);');
rules = rules.replace(/await api\.writeRule\(editing\.slug, editing\.content\);/, 'await api.writeRule(workspaceId, editing.slug, editing.content);');
fs.writeFileSync('src/components/RulesDialog.tsx', rules);

// 2. Fix api.ts
let api = fs.readFileSync('src/lib/api.ts', 'utf8');
api = api.replace(/readRule: \(workspaceId: number, slug: string\) => invoke<RuleFile>\("tauri_read_rule", \{ workspaceId, slug \}\)\.then\(content => \(\{ slug, name: slug, description: "", content, always_apply: true \}\)\),/, 'readRule: (workspaceId: number, slug: string) => invoke<string>("tauri_read_rule", { workspaceId, slug }).then(content => ({ slug, name: slug, description: "", content, always_apply: true } as RuleFile)),');
fs.writeFileSync('src/lib/api.ts', api);

