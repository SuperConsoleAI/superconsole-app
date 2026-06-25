const fs = require('fs');
let code = fs.readFileSync('/Users/2.o/.gemini/antigravity-ide/brain/05c3a7a8-deed-47e7-a395-a6e7352f5d96/task.md', 'utf8');

code = code.replace(
  '- `[ ]` Update `api.ts` types and add rule API bindings.',
  '- `[x]` Update `api.ts` types and add rule API bindings.'
).replace(
  '- `[ ]` Create Rules tab UI in `CustomizePage.tsx`.',
  '- `[x]` Create Rules tab UI in `CustomizePage.tsx`.'
).replace(
  '- `[ ]` Update `PublishPluginDialog.tsx` to include `rulesUrl`.',
  '- `[x]` Update `PublishPluginDialog.tsx` to include `rulesUrl`.'
).replace(
  '- `[ ]` Register rules in `/` autocomplete (`slash-items.ts`).',
  '- `[x]` Register rules in `/` autocomplete (`slash-items.ts`).'
).replace(
  '- `[ ]` Ensure `cargo check` passes.',
  '- `[x]` Ensure `cargo check` passes.'
).replace(
  '- `[ ]` Ensure `npx tsc --noEmit` passes.',
  '- `[x]` Ensure `npx tsc --noEmit` passes.'
);

fs.writeFileSync('/Users/2.o/.gemini/antigravity-ide/brain/05c3a7a8-deed-47e7-a395-a6e7352f5d96/task.md', code);
