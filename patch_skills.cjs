const fs = require('fs');
let code = fs.readFileSync('src/components/SkillsDialog.tsx', 'utf8');

// Remove import of type SlashCommand
code = code.replace(/,\n  type SlashCommand,\n} from "@\/lib\/api";/g, ',\n} from "@/lib/api";');

// Remove TabsTrigger value="commands"
code = code.replace(/<TabsTrigger value="commands">Commands<\/TabsTrigger>\n/g, '');

// Remove TabsContent value="commands"
code = code.replace(/<TabsContent value="commands">\s*<CommandsTab workspaceId={workspaceId} setError={setError} \/>\s*<\/TabsContent>\n/g, '');

// Remove CmdEditing type and CommandsTab function
const cmdEditingStart = code.indexOf('type CmdEditing = {');
if (cmdEditingStart !== -1) {
    const libraryBrowserStart = code.indexOf('function LibraryBrowser({');
    if (libraryBrowserStart !== -1) {
        code = code.substring(0, cmdEditingStart) + code.substring(libraryBrowserStart);
    }
}

fs.writeFileSync('src/components/SkillsDialog.tsx', code);
