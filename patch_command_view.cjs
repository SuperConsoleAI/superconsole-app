const fs = require('fs');
let code = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');

if (!code.includes('export function CommandsView')) {
    // We will extract the body of CommandDialog to CommandsView.
    code = code.replace(/export function CommandDialog\(\{ workspaceId, open, onOpenChange \}: CommandDialogProps\) \{([\s\S]*?)return \(\s*<Dialog open=\{open\} onOpenChange=\{onOpenChange\}>\s*<DialogContent className="flex max-h-\[90vh\] max-w-2xl flex-col overflow-hidden">([\s\S]*?)<\/DialogContent>\s*<\/Dialog>\s*\);\s*\}/, 
`export function CommandsView({ workspaceId }: { workspaceId: number }) {$1return (
    <div className="flex h-full flex-col overflow-hidden px-5 py-4">
$2
    </div>
  );
}

export function CommandDialog({ workspaceId, open, onOpenChange }: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <CommandsView workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  );
}`);
    fs.writeFileSync('src/components/CommandDialog.tsx', code);
}
