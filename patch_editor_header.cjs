const fs = require('fs');
let code = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');

const header = `
            <div className="flex items-center gap-2 border-b pb-3 mb-2 px-1">
              <SquareSlash className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{editing.isNew ? "Add command" : "Edit command"}</h2>
            </div>
`;

code = code.replace(
  '<div className="flex flex-col gap-2 p-2">\n            <div className="grid grid-cols-2 gap-2">',
  '<div className="flex flex-col gap-2 p-2">' + header + '            <div className="grid grid-cols-2 gap-2">'
);

fs.writeFileSync('src/components/CommandDialog.tsx', code);
