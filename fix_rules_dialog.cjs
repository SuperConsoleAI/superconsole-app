const fs = require('fs');

let rules = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');

// Export RuleEditorDialog
rules = rules.replace(/export function RuleEditorDialog/, 'export function RuleEditorDialog'); // already exported

// Dispatch event on save
rules = rules.replace(/if \(onSaved\) onSaved\(\);/, 'if (onSaved) onSaved();\n      window.dispatchEvent(new Event("refresh-rules"));');

// Add refresh-rules listener to RulesView
rules = rules.replace(/useEffect\(\(\) => \{\n    refresh\(\);\n  \}, \[refresh\]\);/, `useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener('refresh-rules', onRefresh);
    return () => window.removeEventListener('refresh-rules', onRefresh);
  }, [refresh]);`);

// Remove top bar in RulesView
rules = rules.replace(/<div className="flex items-center justify-between border-b pb-4 mb-4">[\s\S]*?<\/div>\n\n/, '');

// Add List icon before name
rules = rules.replace(/<span className="font-medium">\{r\.name \|\| r\.slug\}<\/span>/, '<div className="flex items-center gap-2"><import-list-here className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{r.name || r.slug}</span></div>');
rules = rules.replace(/import-list-here/, 'List');
if (!rules.includes('List,')) {
    rules = rules.replace(/Trash2,/, 'Trash2,\n  List,');
}

fs.writeFileSync('src/components/RulesDialog.tsx', rules);

let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');
// Import RuleEditorDialog
custom = custom.replace(/import \{ RulesView \} from "\.\/RulesDialog";/, 'import { RulesView, RuleEditorDialog } from "./RulesDialog";');

// Add addRuleOpen state
custom = custom.replace(/const \[addCommandOpen, setAddCommandOpen\] = useState<any>\(null\);/, 'const [addCommandOpen, setAddCommandOpen] = useState<any>(null);\n  const [addRuleOpen, setAddRuleOpen] = useState<any>(null);');

// Add Add Rule button
custom = custom.replace(/Add command\n            <\/Button>\n          \)}/, `Add command
            </Button>
          )}
          {tab === "rules" && scope?.type === "project" && (
            <Button size="sm" className="h-7 gap-1" onClick={() => setAddRuleOpen({ slug: "", name: "", description: "", content: "", alwaysApply: true, isNew: true })}>
              <Plus className="h-3.5 w-3.5" />
              Add rule
            </Button>
          )}`);

// Add RuleEditorDialog to CustomizePage
custom = custom.replace(/<CommandEditorDialog [\s\S]*?\/>\n      \)}/, `<CommandEditorDialog 
          workspaceId={Number(scope.id)} 
          editing={addCommandOpen} 
          setEditing={setAddCommandOpen} 
        />
        <RuleEditorDialog 
          workspaceId={Number(scope.id)} 
          editing={addRuleOpen} 
          setEditing={setAddRuleOpen} 
        />
      )}`);

fs.writeFileSync('src/components/CustomizePage.tsx', custom);
