// src-tauri/src/commands/agents/mcp_server.rs
//
// Model Context Protocol (MCP) stdio JSON-RPC server for BusinessKit.
// Exposes the toolbelt from `super::tools::registry()` to external CLIs
// (Claude Code, OpenAI Codex) running in headless subprocess mode.
//
// Protocol: Model Context Protocol (MCP) JSON-RPC 2.0 over stdin/stdout.
// HARD RULES:
// - All logging MUST go to stderr (eprintln!), NEVER stdout (println!),
//   because stdout is reserved exclusively for JSON-RPC messages.
// - Connects ONLY to the active profile's UserDB via TursoConn. Zero Central DB access.
// - Exposes and handles both namespaced ('mcp__businesskit__*') and bare tool names.

use super::tools::{self, ToolCtx};
use crate::commands::onboarding::load_from_file_cache;
use crate::db::turso::TursoConn;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

pub async fn run_stdio_mcp_server(args: Vec<String>) {
    eprintln!("[MCP Server] Starting BusinessKit MCP stdio server...");

    // Extract profile_id from CLI arguments: --profile <id>
    let mut profile_id = String::new();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--profile" && i + 1 < args.len() {
            profile_id = args[i + 1].clone();
            i += 2;
        } else if args[i].starts_with("--profile=") {
            profile_id = args[i]["--profile=".len()..].to_string();
            i += 1;
        } else {
            i += 1;
        }
    }

    if profile_id.is_empty() {
        // Fallback: check environment variable BK_PROFILE_ID
        if let Ok(env_p) = std::env::var("BK_PROFILE_ID") {
            profile_id = env_p;
        }
    }

    eprintln!("[MCP Server] Initialized for profile: {}", if profile_id.is_empty() { "<unspecified>" } else { &profile_id });

    // Connect UserDB if profile_id is provided
    let turso_conn = if !profile_id.is_empty() {
        match load_from_file_cache(&profile_id) {
            Ok((url, token)) => {
                let normalized = crate::db::turso::normalize_turso_url(&url);
                eprintln!("[MCP Server] Connected to UserDB at {}", normalized);
                Some(TursoConn::new(&normalized, &token))
            }
            Err(e) => {
                eprintln!("[MCP Server] Warning: Could not load credentials for profile {}: {}", profile_id, e);
                None
            }
        }
    } else {
        None
    };

    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let reader = stdin.lock();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[MCP Server] Error reading stdin: {}", e);
                break;
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[MCP Server] Invalid JSON-RPC input: {} (line: {})", e, trimmed);
                let err_resp = json!({
                    "jsonrpc": "2.0",
                    "id": Value::Null,
                    "error": {
                        "code": -32700,
                        "message": "Parse error"
                    }
                });
                let _ = writeln!(stdout, "{}", err_resp);
                let _ = stdout.flush();
                continue;
            }
        };

        let id = parsed.get("id").cloned();
        let method = parsed.get("method").and_then(Value::as_str).unwrap_or("");
        let params = parsed.get("params").cloned().unwrap_or(json!({}));

        eprintln!("[MCP Server] Received method: {} (id: {:?})", method, id);

        match method {
            "initialize" => {
                let resp = json!({
                    "jsonrpc": "2.0",
                    "id": id.unwrap_or(json!(1)),
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {
                                "listChanged": false
                            }
                        },
                        "serverInfo": {
                            "name": "businesskit",
                            "version": "0.0.20"
                        }
                    }
                });
                let _ = writeln!(stdout, "{}", resp);
                let _ = stdout.flush();
            }

            "notifications/initialized" | "initialized" => {
                // Client acknowledgment notification — no response needed
                eprintln!("[MCP Server] Client handshake complete.");
            }

            "ping" => {
                let resp = json!({
                    "jsonrpc": "2.0",
                    "id": id.unwrap_or(json!(1)),
                    "result": {}
                });
                let _ = writeln!(stdout, "{}", resp);
                let _ = stdout.flush();
            }

            "tools/list" => {
                let catalog = tools::registry();
                let mcp_tools: Vec<Value> = catalog
                    .iter()
                    .map(|tool| {
                        json!({
                            "name": tool.name,
                            "description": tool.description,
                            "inputSchema": tool.input_schema
                        })
                    })
                    .collect();

                let resp = json!({
                    "jsonrpc": "2.0",
                    "id": id.unwrap_or(json!(1)),
                    "result": {
                        "tools": mcp_tools
                    }
                });
                let _ = writeln!(stdout, "{}", resp);
                let _ = stdout.flush();
            }

            "tools/call" => {
                let raw_name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

                // Normalize name: strip any MCP prefixes if passed by client
                let clean_name = raw_name
                    .strip_prefix("mcp__businesskit__")
                    .or_else(|| raw_name.strip_prefix("businesskit__"))
                    .or_else(|| raw_name.strip_prefix("mcp__"))
                    .unwrap_or(raw_name);

                eprintln!("[MCP Server] Executing tool: {} (raw: {})", clean_name, raw_name);

                // Checklist 5: Business-mutating tool calls need an audit trail
                // independent of the PTY stream. Log to ~/.businesskit/profiles/{id}/mcp_audit.log.
                // Best-effort, never blocks or fails the tool call itself.
                const WRITE_TOOLS: &[&str] = &[
                    "inventory_add_stock",
                    "inventory_receive_purchase_invoice",
                    "product_update_pricing",
                    "invoice_create",
                    "invoice_send",
                    "contact_create",
                    "contact_update",
                    "blog_post_create",
                ];
                if WRITE_TOOLS.contains(&clean_name) && !profile_id.is_empty() {
                    let ts = chrono::Utc::now().to_rfc3339();
                    let args_summary = serde_json::to_string(&arguments).unwrap_or_else(|_| "{}".into());
                    let log_line = format!("[{}] {} {}\n", ts, clean_name, args_summary);
                    if let Some(home) = dirs::home_dir() {
                        let log_path = home
                            .join(".businesskit")
                            .join("profiles")
                            .join(&profile_id)
                            .join("mcp_audit.log");
                        // Append-only write — ignore errors
                        use std::io::Write as _;
                        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
                            let _ = f.write_all(log_line.as_bytes());
                        }
                    }
                }

                if let Some(ref conn) = turso_conn {
                    let ctx = ToolCtx {
                        user_db: conn,
                        profile_id: profile_id.clone(),
                        agent_user_id: "a1b2c3d4-0001-4000-8000-000000000001".into(),
                        agent_name: "CLI Agent".into(),
                        media_attachment_id: None,
                        media_attachment_url: None,
                    };

                    match tools::execute(clean_name, arguments, &ctx).await {
                        Ok(tool_res) => {
                            let text_content = match &tool_res {
                                Value::String(s) => s.clone(),
                                other => serde_json::to_string_pretty(other).unwrap_or_else(|_| other.to_string()),
                            };

                            let resp = json!({
                                "jsonrpc": "2.0",
                                "id": id.unwrap_or(json!(1)),
                                "result": {
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": text_content
                                        }
                                    ],
                                    "isError": false
                                }
                            });
                            let _ = writeln!(stdout, "{}", resp);
                            let _ = stdout.flush();
                        }
                        Err(err_msg) => {
                            eprintln!("[MCP Server] Tool execution error for {}: {}", clean_name, err_msg);
                            let resp = json!({
                                "jsonrpc": "2.0",
                                "id": id.unwrap_or(json!(1)),
                                "result": {
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": format!("Tool execution error: {}", err_msg)
                                        }
                                    ],
                                    "isError": true
                                }
                            });
                            let _ = writeln!(stdout, "{}", resp);
                            let _ = stdout.flush();
                        }
                    }
                } else {
                    let err_msg = format!("Database not connected for profile '{}'. Ensure credentials exist.", profile_id);
                    eprintln!("[MCP Server] {}", err_msg);
                    let resp = json!({
                        "jsonrpc": "2.0",
                        "id": id.unwrap_or(json!(1)),
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": err_msg
                                }
                            ],
                            "isError": true
                        }
                    });
                    let _ = writeln!(stdout, "{}", resp);
                    let _ = stdout.flush();
                }
            }

            _ => {
                // If notification (no id), ignore unknown methods without error
                if let Some(id_val) = id {
                    let resp = json!({
                        "jsonrpc": "2.0",
                        "id": id_val,
                        "error": {
                            "code": -32601,
                            "message": format!("Method '{}' not found", method)
                        }
                    });
                    let _ = writeln!(stdout, "{}", resp);
                    let _ = stdout.flush();
                }
            }
        }
    }

    eprintln!("[MCP Server] Stdio stream closed. Exiting.");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_tools_list_format() {
        let catalog = tools::registry();
        let mcp_tools: Vec<Value> = catalog
            .iter()
            .map(|tool| {
                json!({
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.input_schema
                })
            })
            .collect();

        assert_eq!(mcp_tools.len(), 10);
        for t in &mcp_tools {
            assert!(t.get("name").is_some());
            assert!(t.get("description").is_some());
            assert!(t.get("inputSchema").is_some());
        }
    }

    #[test]
    fn test_tool_name_normalization() {
        let raw1 = "mcp__businesskit__inventory_receive_purchase_invoice";
        let clean1 = raw1
            .strip_prefix("mcp__businesskit__")
            .or_else(|| raw1.strip_prefix("businesskit__"))
            .or_else(|| raw1.strip_prefix("mcp__"))
            .unwrap_or(raw1);
        assert_eq!(clean1, "inventory_receive_purchase_invoice");

        let raw2 = "inventory_receive_purchase_invoice";
        let clean2 = raw2
            .strip_prefix("mcp__businesskit__")
            .or_else(|| raw2.strip_prefix("businesskit__"))
            .or_else(|| raw2.strip_prefix("mcp__"))
            .unwrap_or(raw2);
        assert_eq!(clean2, "inventory_receive_purchase_invoice");
    }
}

