const fs = require('fs');

const filesToRevert = [
  'src/components/TasksView.tsx',
  'src/components/TerminalPane.tsx',
  'src/components/AgentsView.tsx'
];

for (const file of filesToRevert) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/SquareSlash/g, 'TerminalSquare');
    fs.writeFileSync(file, content);
  }
}
