const fs = require('fs');
let code = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Imports
if (!code.includes('CommandEditorDialog')) {
    code = code.replace(/import \{ CommandsView \} from "\.\/CommandDialog";/, 'import { CommandsView, CommandEditorDialog, type CmdEditing } from "./CommandDialog";\nimport { Plus } from "lucide-react";');
}

// State
if (!code.includes('addCommandOpen')) {
    code = code.replace(/const \[editingHook, setEditingHook\] = useState<string \| null>\(null\);/, 'const [editingHook, setEditingHook] = useState<string | null>(null);\n  const [addCommandOpen, setAddCommandOpen] = useState<CmdEditing>(null);');
}

// Add Button before DropdownMenu
const addCommandBtn = `
          {tab === "commands" && scope?.type === "project" && (
            <Button size="sm" className="h-7 gap-1" onClick={() => setAddCommandOpen({ name: "", slash: "", description: "", content: "", isNew: true })}>
              <Plus className="h-3.5 w-3.5" />
              Add command
            </Button>
          )}`;

if (!code.includes('onClick={() => setAddCommandOpen(')) {
    code = code.replace(/<DropdownMenu>/, addCommandBtn + '\n          <DropdownMenu>');
}

// Render CommandEditorDialog
const editorDialog = `
      {scope && scope.type === "project" && (
        <CommandEditorDialog 
          workspaceId={Number(scope.id)} 
          editing={addCommandOpen} 
          setEditing={setAddCommandOpen} 
        />
      )}`;

if (!code.includes('<CommandEditorDialog')) {
    code = code.replace(/<\/div>\n    <\/div>\n  \);\n\}/, editorDialog + '\n    </div>\n  );\n}');
}

fs.writeFileSync('src/components/CustomizePage.tsx', code);
