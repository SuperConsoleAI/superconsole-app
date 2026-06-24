const fs = require('fs');

let page = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');
page = page.replace('import { Plus } from "lucide-react";', ''); // The duplicate one I injected earlier
page = page.replace('import { CommandsView, CommandEditorDialog, type CmdEditing }', 'import { CommandsView, CommandEditorDialog }');
fs.writeFileSync('src/components/CustomizePage.tsx', page);

let cmd = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');
cmd = cmd.replace(/ArrowLeft, |Plus, |TerminalSquare, /g, '');
fs.writeFileSync('src/components/CommandDialog.tsx', cmd);

let skills = fs.readFileSync('src/components/SkillsDialog.tsx', 'utf8');
skills = skills.replace(/Sparkles, /g, '');
fs.writeFileSync('src/components/SkillsDialog.tsx', skills);

