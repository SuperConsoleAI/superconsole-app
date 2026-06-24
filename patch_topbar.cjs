const fs = require('fs');
let code = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

// Add import
if (!code.includes('CommandDialog')) {
    code = code.replace(/import { SkillsDialog } from "@\/components\/SkillsDialog";/g, 'import { SkillsDialog } from "@/components/SkillsDialog";\nimport { CommandDialog } from "@/components/CommandDialog";');
}

if (!code.includes('TerminalSquare')) {
    code = code.replace(/ScrollText,/g, 'ScrollText,\n  TerminalSquare,');
}

// Add state
if (!code.includes('commandsOpen')) {
    code = code.replace(/const \[skillsOpen, setSkillsOpen\] = useState\(false\);/g, 'const [skillsOpen, setSkillsOpen] = useState(false);\n  const [commandsOpen, setCommandsOpen] = useState(false);');
}

// Add menu item
const commandsMenu = `
                <DropdownMenuItem onClick={() => setSkillsOpen(true)}>
                  <ScrollText className="mr-2 h-4 w-4" />
                  <span>Skills</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCommandsOpen(true)}>
                  <TerminalSquare className="mr-2 h-4 w-4" />
                  <span>Commands</span>
                </DropdownMenuItem>`;
code = code.replace(/<DropdownMenuItem onClick={\(\) => setSkillsOpen\(true\)}>\s*<ScrollText className="mr-2 h-4 w-4" \/>\s*<span>Skills<\/span>\s*<\/DropdownMenuItem>/g, commandsMenu);

// Add dialog
const dialogComponent = `
          <SkillsDialog
            workspaceId={workspace.id}
            open={skillsOpen}
            onOpenChange={setSkillsOpen}
          />
          <CommandDialog
            workspaceId={workspace.id}
            open={commandsOpen}
            onOpenChange={setCommandsOpen}
          />`;
code = code.replace(/<SkillsDialog\s*workspaceId={workspace.id}\s*open={skillsOpen}\s*onOpenChange={setSkillsOpen}\s*\/>/g, dialogComponent);

fs.writeFileSync('src/components/TopBar.tsx', code);
