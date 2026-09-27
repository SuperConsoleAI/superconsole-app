// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = match info.payload().downcast_ref::<&'static str>() {
            Some(s) => *s,
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => &s[..],
                None => "Box<dyn Any>",
            },
        };
        let location = info.location().unwrap();
        let log = format!(
            "Panic occurred in file '{}' at line {}: {}\n",
            location.file(),
            location.line(),
            msg
        );
        std::fs::write("/tmp/panic.txt", log).ok();
    }));

    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp" || a == "mcp" || a == "mcp-server")
        || (args.iter().any(|a| a == "--profile" || a.starts_with("--profile="))
            && !args.iter().any(|a| a.starts_with("--tauri")))
    {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to build tokio runtime for MCP server");
        rt.block_on(app_lib::commands::agents::mcp_server::run_stdio_mcp_server(args));
        return;
    }

    app_lib::run();
}

