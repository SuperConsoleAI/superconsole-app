const fs = require('fs');
let rules = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');

// 1. Add Check icon to imports
rules = rules.replace(/List,/, 'List,\n  Check,');

// 2. Fix the save function to always generate frontmatter
rules = rules.replace(/let finalContent = editing\.content;[\s\S]*?finalContent = editing\.content;\n      \}/, 'const finalContent = `---\\nname: ${editing.name || editing.slug}\\ndescription: ${editing.description}\\nalways_apply: ${editing.alwaysApply}\\n---\\n\\n${editing.content}`;');

// 3. Fix the Dialog title icon to use List
rules = rules.replace(/<FileCheck className="h-5 w-5 text-muted-foreground" \/>/, '<List className="h-5 w-5 text-muted-foreground" />');

// 4. Always show fields in RuleEditorDialog
rules = rules.replace(/\{editing\.isNew \? \([\s\S]*?className="col-span-2 min-h-52 font-mono text-xs mt-2"\n                \/>\n              <\/div>\n            \) : \([\s\S]*?<\/div>\n            \)\}/, `<div className="grid grid-cols-2 gap-2">
                <Input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="rule-slug"
                  className="h-8 text-sm"
                  disabled={!editing.isNew}
                />
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Display Name"
                  className="h-8 text-sm"
                />
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="One-line description"
                  className="col-span-2 h-8 text-sm"
                />
                <div className="col-span-2 flex items-center gap-2 px-1 mt-1">
                  <input
                    type="checkbox"
                    id="alwaysApply"
                    checked={editing.alwaysApply}
                    onChange={(e) => setEditing({ ...editing, alwaysApply: e.target.checked })}
                    className="rounded border-gray-300 bg-background text-primary focus:ring-primary"
                  />
                  <label htmlFor="alwaysApply" className="text-sm font-medium text-muted-foreground">
                    Always apply this rule
                  </label>
                </div>
                <Textarea
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder="Rule logic goes here..."
                  className="col-span-2 min-h-[300px] font-mono text-xs mt-2"
                />
              </div>`);

// 5. Update openEditor to strip frontmatter
rules = rules.replace(/const fullRule = await api\.readRule\(workspaceId, r\.slug\);/, `const fullRule = await api.readRule(workspaceId, r.slug);
      let body = fullRule.content;
      if (body.startsWith("---\\n")) {
        const end = body.indexOf("\\n---", 4);
        if (end !== -1) {
          body = body.slice(end + 4).trimStart();
        }
      }`);
rules = rules.replace(/content: fullRule\.content,/, 'content: body,');

// 6. Fix table design (remove box bg, set 0.75rem text-xs headers, check icon)
rules = rules.replace(/<div className="rounded-md border bg-card">/, '<div>');
rules = rules.replace(/<thead className="border-b bg-muted\/20">/, '<thead className="border-b">');
rules = rules.replace(/<th className="px-4 py-2 font-medium text-muted-foreground">Rules<\/th>/, '<th className="px-4 py-2 font-medium text-xs text-muted-foreground">Rules</th>');
rules = rules.replace(/<th className="px-4 py-2 font-medium text-muted-foreground">Author<\/th>/, '<th className="px-4 py-2 font-medium text-xs text-muted-foreground">Author</th>');
rules = rules.replace(/<th className="px-4 py-2 font-medium text-muted-foreground">Apply Always<\/th>/, '<th className="px-4 py-2 font-medium text-xs text-muted-foreground">Apply Always</th>');

rules = rules.replace(/<Badge variant="secondary" className="text-\[10px\]">Yes<\/Badge>/, '<Check className="h-4 w-4" />');

fs.writeFileSync('src/components/RulesDialog.tsx', rules);
