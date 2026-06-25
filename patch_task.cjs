const fs = require('fs');
let code = fs.readFileSync('/Users/2.o/.gemini/antigravity-ide/brain/05c3a7a8-deed-47e7-a395-a6e7352f5d96/task.md', 'utf8');

code = code.replace(
  '- `[ ]` Update `plugins_cache` table creation in `db.rs` (`rules_url`, `rule_ids`).',
  '- `[x]` Update `plugins_cache` table creation in `db.rs` (`rules_url`, `rule_ids`).'
).replace(
  '- `[ ]` Update `installed_plugins_cache` table creation in `db.rs` (all 6 new `_ids` columns + `rules_url`).',
  '- `[x]` Update `installed_plugins_cache` table creation in `db.rs` (all 6 new `_ids` columns + `rules_url`).'
).replace(
  '- `[ ]` Create `rules_catalog_cache` table in `db.rs`.',
  '- `[x]` Create `rules_catalog_cache` table in `db.rs`.'
).replace(
  '- `[ ]` Add `content` column to all existing `_catalog_cache` tables in `db.rs`.',
  '- `[x]` Add `content` column to all existing `_catalog_cache` tables in `db.rs`.'
).replace(
  '- `[ ]` Update Rust structs (`Plugin`, `InstalledPlugin`, etc.) to map these fields.',
  '- `[x]` Update Rust structs (`Plugin`, `InstalledPlugin`, etc.) to map these fields.'
);

fs.writeFileSync('/Users/2.o/.gemini/antigravity-ide/brain/05c3a7a8-deed-47e7-a395-a6e7352f5d96/task.md', code);
