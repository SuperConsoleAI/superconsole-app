const fs = require('fs');

// 1. Update api.ts
let api = fs.readFileSync('src/lib/api.ts', 'utf8');
api = api.replace(/listRules: \(\) => invoke<RuleFile\[\]>\("list_rules"\),/, 'listRules: (workspaceId: number) => invoke<RuleFile[]>("tauri_list_rules", { workspaceId }),');
api = api.replace(/readRule: \(slug: string\) => invoke<RuleFile>\("read_rule", \{ slug \}\),/, 'readRule: (workspaceId: number, slug: string) => invoke<RuleFile>("tauri_read_rule", { workspaceId, slug }).then(content => ({ slug, name: slug, description: "", content, always_apply: true })),');
api = api.replace(/writeRule: \(slug: string, content: string\) => invoke<void>\("write_rule", \{ slug, content \}\),/, 'writeRule: (workspaceId: number, slug: string, content: string) => invoke<void>("tauri_write_rule", { workspaceId, slug, content }),');
api = api.replace(/deleteRule: \(slug: string\) => invoke<void>\("delete_rule", \{ slug \}\),/, 'deleteRule: (workspaceId: number, slug: string) => invoke<void>("tauri_delete_rule", { workspaceId, slug }),');
fs.writeFileSync('src/lib/api.ts', api);

// 2. Update RulesDialog.tsx
let rules = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');
rules = rules.replace(/export function RulesView\(\) \{/, 'export function RulesView({ workspaceId }: { workspaceId: number }) {');
rules = rules.replace(/api\.listRules\(\)/g, 'api.listRules(workspaceId)');
rules = rules.replace(/function CreateRuleForm\(\{\n  setError,\n  onDone,\n\}: \{\n  setError: \(v: string | null\) => void;\n  onDone: \(\) => void;\n\}\) \{/, 'function CreateRuleForm({ setError, onDone, workspaceId }: { setError: (v: string | null) => void; onDone: () => void; workspaceId: number; }) {');
rules = rules.replace(/api\.writeRule\(slug\.trim\(\), content\)/g, 'api.writeRule(workspaceId, slug.trim(), content)');
rules = rules.replace(/api\.readRule\(r\.slug\)/g, 'api.readRule(workspaceId, r.slug)');
rules = rules.replace(/deleteRule\(r\.slug\)/g, 'deleteRule(workspaceId, r.slug)');
rules = rules.replace(/<CreateRuleForm\n                  setError=\{setError\}\n                  onDone=\{\(\) => \{\n                    refresh\(\);\n                    setTab\("installed"\);\n                  \}\}\n                \/>/, 
`<CreateRuleForm
                  workspaceId={workspaceId}
                  setError={setError}
                  onDone={() => {
                    refresh();
                    setTab("installed");
                  }}
                />`);

// Fix the deleteRule function which was a separate wrapper in RulesView
rules = rules.replace(/const deleteRule = async \(slug: string\) => \{/, 'const deleteRule = async (workspaceId: number, slug: string) => {');

fs.writeFileSync('src/components/RulesDialog.tsx', rules);

// 3. Update CustomizePage.tsx
let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');
custom = custom.replace(/<RulesView \/>/, '<RulesView workspaceId={Number(scope.id)} />');
fs.writeFileSync('src/components/CustomizePage.tsx', custom);

// 4. Update slash-items.ts to pass workspaceId
let slash = fs.readFileSync('src/lib/slash-items.ts', 'utf8');
slash = slash.replace(/api\.listRules\(\),/, 'api.listRules(workspaceId),');
fs.writeFileSync('src/lib/slash-items.ts', slash);

