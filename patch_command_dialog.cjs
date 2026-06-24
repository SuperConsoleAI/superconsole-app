const fs = require('fs');

let code = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');

// 1. Add showHeader prop to CommandsView
code = code.replace(
  'export function CommandsView({ workspaceId }: { workspaceId: number }) {',
  'export function CommandsView({ workspaceId, showHeader = false }: { workspaceId: number, showHeader?: boolean }) {'
);

// 2. Add header rendering to CommandsView
const headerHtml = `
      {showHeader && (
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div className="flex items-center gap-2">
            <SquareSlash className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Commands</h2>
          </div>
          <Button size="sm" className="h-7 gap-1" onClick={() => setEditing({ name: "", slash: "", description: "", content: "", isNew: true })}>
            <Plus className="h-3.5 w-3.5" />
            Add command
          </Button>
        </div>
      )}
`;

code = code.replace(
  '{error && <p className="text-xs text-destructive mb-4">{error}</p>}',
  headerHtml + '\n      {error && <p className="text-xs text-destructive mb-4">{error}</p>}'
);

// 3. Make sure CommandDialog passes showHeader
code = code.replace(
  '<CommandsView workspaceId={workspaceId} />',
  '<CommandsView workspaceId={workspaceId} showHeader={true} />'
);

// 4. Also import SquareSlash again if it was removed
if (!code.includes('SquareSlash')) {
  code = 'import { SquareSlash } from "lucide-react";\n' + code;
} else if (!code.match(/import\s+{[^}]*SquareSlash[^}]*}\s+from\s+"lucide-react"/)) {
   code = code.replace('import { Pencil', 'import { SquareSlash, Pencil');
}

// Write back
fs.writeFileSync('src/components/CommandDialog.tsx', code);
