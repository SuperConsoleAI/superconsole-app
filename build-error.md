  Running `target/debug/superconsole`

thread 'main' (8471318) panicked at /Users/2.o/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.11.2/src/app.rs:1417:11:
Failed to setup app: error encountered during setup hook: Schema init error for statement: CREATE INDEX IF NOT EXISTS idx_session_history_project ON session_history (project_id)
Err: no such column: project_id in CREATE INDEX IF NOT EXISTS idx_session_history_project ON session_history (project_id) at offset 75
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

thread 'main' (8471318) panicked at /rustc/ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96/library/core/src/panicking.rs:225:5:
panic in a function that cannot unwind
stack backtrace:
