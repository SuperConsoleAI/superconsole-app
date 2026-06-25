const fs = require('fs');

let rules = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');
rules = rules.replace(/const fullContent = await api\.readRule\(workspaceId, r\.slug\);/, 'const fullRule = await api.readRule(workspaceId, r.slug);');
rules = rules.replace(/content: fullContent,/, 'content: fullRule.content,');
rules = rules.replace(/<PluginIcon name=\{r\.author\} className="h-4 w-4" \/>/, '<PluginIcon pluginId={r.author} className="h-4 w-4" />');

fs.writeFileSync('src/components/RulesDialog.tsx', rules);
