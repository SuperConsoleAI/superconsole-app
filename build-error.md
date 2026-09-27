thread 'tokio-rt-worker' (4960374) panicked at src/db.rs:3771:42:
called `Result::unwrap()` on an `Err` value: SqlInputError { error: Error { code: Unknown, extended_code: 1 }, msg: "no such column: mcp_url", sql: "SELECT id, name, description, author, version, icon_url, docs_url, github_url, category, scope, skill_ids, agent_ids, agents_url, mcp_ids, command_ids, hook_ids, connector_ids, skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at, rules_url, rule_ids FROM plugins ORDER BY name", offset: 214 }
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

thread 'tokio-rt-worker' (4960370) panicked at src/db.rs:3765:34:
called `Result::unwrap()` on an `Err` value: PoisonError { .. }

thread 'tokio-rt-worker' (4960378) panicked at src/db.rs:3745:34:
called `Result::unwrap()` on an `Err` value: PoisonError { .. }

thread 'main' (4960066) panicked at src/db.rs:921:34:
called `Result::unwrap()` on an `Err` value: PoisonError { .. }
fatal runtime error: failed to initiate panic, error 5, aborting
