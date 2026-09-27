// src-tauri/build.rs
// Reads secrets from ../.env AND real process environment variables,
// and emits them as compile-time env vars so option_env!("ENCRYPTION_SECRET")
// picks up the value at build time.
//
// Priority: actual env var > .env file (CI env wins over local .env)
// The .env file is gitignored — never committed to source control.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "macos" || target_os == "ios" {
        println!("cargo:rustc-link-lib=framework=Security");
    }

    // Secrets we need to bake into the binary
    const SECRETS: &[&str] = &[
        "ENCRYPTION_SECRET",
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "WORKOS_CLIENT_ID",
        "WORKOS_API_KEY",
        "WORKOS_REDIRECT_URI",
        "PADDLE_ENVIRONMENT",
        "PADDLE_API_KEY",
        "PADDLE_CHECKOUT_URL",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_API_TOKEN",
        "SES_REGION",
        "SES_ACCESS_KEY",
        "SES_SECRET_KEY",
        "SES_FROM_EMAIL",
        "SES_FROM_NAME",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_REGION",
        "OPENROUTER_API_KEY",
    ];

    // Step 1: Load ../.env (workspace root) — local dev default
    let mut values: HashMap<String, String> = HashMap::new();
    // Look for .env in the parent directory (project root), and fallback to current directory (src-tauri)
    // because Xcode's User Script Sandboxing blocks reading files outside the target directory.
    // Step 1: Load secrets from both root .env and src-tauri/.env
    let root_env_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".env");
    let local_env_path = Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");

    for path in &[root_env_path, local_env_path] {
        if let Ok(contents) = fs::read_to_string(path) {
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, val)) = line.split_once('=') {
                    let key = key.trim().to_string();
                    let val = val.trim().trim_matches('"').trim_matches('\'').to_string();
                    if !val.is_empty() {
                        values.insert(key, val);
                    }
                }
            }
        }
    }

    // Step 2: Override with real process env vars (CI/CD takes priority)
    for &key in SECRETS {
        if let Ok(val) = std::env::var(key) {
            if !val.is_empty() {
                values.insert(key.to_string(), val);
            }
        }
    }

    // Emit all collected values as compile-time rustc env vars
    for (key, val) in &values {
        println!("cargo:rustc-env={}={}", key, val);
    }

    // Compile-time check: release builds must have ENCRYPTION_SECRET
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let has_encryption_secret = values.get("ENCRYPTION_SECRET").map(|s| !s.trim().is_empty()).unwrap_or(false);
    if !has_encryption_secret {
        if profile == "release" {
            panic!("CRITICAL BUILD ERROR: ENCRYPTION_SECRET is required for release builds but was not found in environment or .env file!");
        } else {
            println!("cargo:warning=ENCRYPTION_SECRET is not set in build environment; cryptographic operations will fail at runtime.");
        }
    }

    // Re-run build.rs when frontend dist, .env or any of the secrets change
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=../.env");
    for &key in SECRETS {
        println!("cargo:rerun-if-env-changed={}", key);
    }

    tauri_build::build()
}
