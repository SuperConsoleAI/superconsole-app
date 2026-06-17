// Headless stdio MCP server: `superconsole mcp --session <token>`.
//
// Claude Code / Droid (and any MCP-compatible CLI) spawn this from the
// auto-generated .mcp.json. It speaks newline-delimited JSON-RPC over stdio and
// exposes the same ToolRegistry as native chat, scoped to the project encoded in
// the (encrypted) session token. No Tauri AppHandle: it opens the local SQLite
// db directly using the path baked into the token.

use crate::db::Db;
use crate::mcp::{self, ToolCtx};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::Path;

const PROTOCOL_VERSION: &str = "2024-11-05";

/// Entry point for the `mcp` subcommand. Blocks reading stdin until EOF.
pub fn run_stdio(token: String) {
    let ctx = match mcp::decode_session_token(&token) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("superconsole mcp: invalid session token: {}", e);
            std::process::exit(1);
        }
    };
    let parent = Path::new(&ctx.db_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();
    let db = match Db::init(parent) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("superconsole mcp: cannot open local db: {}", e);
            std::process::exit(1);
        }
    };
    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("superconsole mcp: runtime error: {}", e);
            std::process::exit(1);
        }
    };

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let req: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(resp) = rt.block_on(handle(&db, &ctx, &req)) {
            let mut out = stdout.lock();
            let _ = writeln!(out, "{}", resp);
            let _ = out.flush();
        }
    }
}

async fn handle(db: &Db, ctx: &ToolCtx, req: &Value) -> Option<Value> {
    let method = req["method"].as_str().unwrap_or("");
    let id = req.get("id").cloned();
    // Notifications carry no id and expect no response.
    let is_notification = id.is_none();

    match method {
        "initialize" => Some(result(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "superconsole", "version": env!("CARGO_PKG_VERSION")}
            }),
        )),
        "notifications/initialized" => None,
        "ping" => Some(result(id, json!({}))),
        "tools/list" => {
            let tools: Vec<Value> =
                mcp::full_catalog(db, ctx).iter().map(|s| s.to_mcp()).collect();
            Some(result(id, json!({"tools": tools})))
        }
        "tools/call" => {
            let params = &req["params"];
            let name = params["name"].as_str().unwrap_or("");
            let args = mcp::args_object(params.get("arguments"));
            match mcp::execute(db, ctx, name, args).await {
                Ok(v) => Some(result(
                    id,
                    json!({
                        "content": [{"type": "text", "text": v.to_string()}],
                        "isError": false
                    }),
                )),
                Err(e) => Some(result(
                    id,
                    json!({
                        "content": [{"type": "text", "text": e}],
                        "isError": true
                    }),
                )),
            }
        }
        _ => {
            if is_notification {
                None
            } else {
                Some(error(id, -32601, &format!("method not found: {}", method)))
            }
        }
    }
}

fn result(id: Option<Value>, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id.unwrap_or(Value::Null), "result": result})
}

fn error(id: Option<Value>, code: i64, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id.unwrap_or(Value::Null), "error": {"code": code, "message": message}})
}
