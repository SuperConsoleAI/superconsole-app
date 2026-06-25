const fs = require('fs');

// Fix RulesDialog.tsx
let rules = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');
rules = rules.replace(/className="flex flex-col gap-2 p-2"/, 'className="flex flex-col gap-3 p-4"');
rules = rules.replace(/className="flex items-center gap-2 border-b pb-3 mb-2 px-1"/, 'className="flex items-center gap-2 mb-1"');
fs.writeFileSync('src/components/RulesDialog.tsx', rules);

// Fix CommandDialog.tsx
let cmd = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');
cmd = cmd.replace(/className="flex flex-col gap-2 p-2"/, 'className="flex flex-col gap-3 p-4"');
cmd = cmd.replace(/className="flex items-center gap-2 border-b pb-3 mb-2 px-1"/, 'className="flex items-center gap-2 mb-1"');
fs.writeFileSync('src/components/CommandDialog.tsx', cmd);

