const fs = require('fs');
let code = fs.readFileSync('/Users/2.o/.gemini/antigravity-ide/brain/05c3a7a8-deed-47e7-a395-a6e7352f5d96/task.md', 'utf8');

code = code.replace(
  '- `[ ]` Create `rules.rs` with `list_rules`, `read_rule`, `write_rule`, `delete_rule`.',
  '- `[x]` Create `rules.rs` with `list_rules`, `read_rule`, `write_rule`, `delete_rule`.'
).replace(
  '- `[ ]` Update `chat.rs` and `scheduler.rs` to load and inject rules into system prompts.',
  '- `[x]` Update `chat.rs` and `scheduler.rs` to load and inject rules into system prompts.'
).replace(
  '- `[ ]` Update `plugins.rs` (`do_install_plugin` to copy `_ids` arrays and install rules).',
  '- `[x]` Update `plugins.rs` (`do_install_plugin` to copy `_ids` arrays and install rules).'
).replace(
  '- `[ ]` Register new Tauri commands in `lib.rs`.',
  '- `[x]` Register new Tauri commands in `lib.rs`.'
).replace(
  '- `[ ]` Expose MCP tools (`rule_list`, `rule_read`) in `mcp.rs`.',
  '- `[x]` Expose MCP tools (`rule_list`, `rule_read`) in `mcp.rs`.'
);

fs.writeFileSync('/Users/2.o/.gemini/antigravity-ide/brain/05c3a7a8-deed-47e7-a395-a6e7352f5d96/task.md', code);
