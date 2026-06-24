sed -i '' -e '/let connectors: Vec<String>/,/get_global_mcp_config_path(),\n            );\n        }\n    }/d' src-tauri/src/plugins.rs
