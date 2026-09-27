pub mod analytics;
pub mod brand;
pub mod chat;
pub mod cli;
pub mod commands;
pub mod mcp_server;
pub mod tasks;
pub mod tools;

// Terminal Mode (PTY) — desktop builds only (no PTY on iOS/Android)
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod pty;

// Re-export all commands and types
pub use analytics::*;
pub use brand::*;
pub use chat::*;
pub use cli::*;
pub use commands::*;
pub use mcp_server::*;
pub use tasks::*;
pub use tools::*;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use pty::*;

