const fs = require('fs');
let code = fs.readFileSync('src/components/SkillsDialog.tsx', 'utf8');

if (!code.includes('export function SkillsView')) {
    code = code.replace(/export function SkillsDialog\(\{ workspaceId, open, onOpenChange \}: SkillsDialogProps\) \{([\s\S]*?)return \(\s*<Dialog open=\{open\} onOpenChange=\{onOpenChange\}>\s*<DialogContent className="flex max-h-\[90vh\] max-w-2xl flex-col overflow-hidden">([\s\S]*?)<\/DialogContent>\s*<\/Dialog>\s*\);\s*\}/, 
`export function SkillsView({ workspaceId }: { workspaceId: number }) {$1return (
    <div className="flex h-full flex-col overflow-hidden px-5 py-4">
$2
    </div>
  );
}

export function SkillsDialog({ workspaceId, open, onOpenChange }: SkillsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <SkillsView workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  );
}`);
    fs.writeFileSync('src/components/SkillsDialog.tsx', code);
}
