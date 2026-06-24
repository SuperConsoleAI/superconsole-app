const fs = require('fs');

// 1. Update CommandDialog.tsx UI list item to use SquareSlash
let cd = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');
if (!cd.includes('SquareSlash')) {
  // Try to find lucide-react import
  cd = cd.replace('import { Plus, Trash2, Pencil, Bot } from "lucide-react";', 'import { Plus, Trash2, Pencil, Bot, SquareSlash } from "lucide-react";');
  if (!cd.includes('SquareSlash')) {
    // If it didn't have exactly that string, just append
    cd = 'import { SquareSlash } from "lucide-react";\n' + cd;
  }
}
cd = cd.replace(
  '<span className="font-mono text-sm text-muted-foreground">/</span>',
  '<SquareSlash className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />'
);
fs.writeFileSync('src/components/CommandDialog.tsx', cd);

// 2. Replace TerminalSquare with SquareSlash everywhere
const files = [
  'src/components/AgentsView.tsx',
  'src/components/TopBar.tsx',
  'src/components/ChatComposer.tsx',
  'src/components/CustomizePage.tsx',
  'src/components/TasksView.tsx',
  'src/components/TerminalPane.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/TerminalSquare/g, 'SquareSlash');
  fs.writeFileSync(file, content);
}
