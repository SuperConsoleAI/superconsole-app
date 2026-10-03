// src-tauri/build.rs
// Reads secrets from ../.env AND real process environment variables,
// and emits them as compile-time env vars so option_env!("KEY")
// picks up the value at build time.
//
// Priority: actual process env var > .env file (CI/CD takes priority over local dev)

use std::collections::HashMap;
use std::fs;
use std::path::Path;

fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "macos" || target_os == "ios" {
        println!("cargo:rustc-link-lib=framework=Security");
    }

    // Secrets we need to bake into the binary for standalone/release builds
    const SECRETS: &[&str] = &[
        "WORKOS_CLIENT_ID",
        "WORKOS_API_KEY",
        "WORKOS_COOKIE_PASSWORD",
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "OPENROUTER_API_KEY",
        "BRANDFETCH_API_KEY",
    ];

    let mut values: HashMap<String, String> = HashMap::new();

    // Step 1: Load secrets from both root ../.env and src-tauri/.env
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
            let val = val.trim().to_string();
            if !val.is_empty() {
                values.insert(key.to_string(), val);
            }
        }
    }

    // Emit all collected values as compile-time rustc env vars
    for (key, val) in &values {
        println!("cargo:rustc-env={}={}", key, val);
    }

    // Warnings if crucial keys are missing during build
    let has_workos_client_id = values.get("WORKOS_CLIENT_ID").map(|s| !s.trim().is_empty()).unwrap_or(false);
    if !has_workos_client_id {
        println!("cargo:warning=WORKOS_CLIENT_ID is not set in build environment or .env!");
    }
    let has_workos_api_key = values.get("WORKOS_API_KEY").map(|s| !s.trim().is_empty()).unwrap_or(false);
    if !has_workos_api_key {
        println!("cargo:warning=WORKOS_API_KEY is not set in build environment or .env!");
    }
    let has_cookie_pw = values.get("WORKOS_COOKIE_PASSWORD").map(|s| !s.trim().is_empty()).unwrap_or(false);
    if !has_cookie_pw {
        println!("cargo:warning=WORKOS_COOKIE_PASSWORD is not set in build environment or .env!");
    }
    let has_turso_url = values.get("TURSO_DATABASE_URL").map(|s| !s.trim().is_empty()).unwrap_or(false);
    if !has_turso_url {
        println!("cargo:warning=TURSO_DATABASE_URL is not set in build environment or .env!");
    }
    let has_turso_token = values.get("TURSO_AUTH_TOKEN").map(|s| !s.trim().is_empty()).unwrap_or(false);
    if !has_turso_token {
        println!("cargo:warning=TURSO_AUTH_TOKEN is not set in build environment or .env!");
    }

    // Re-run build.rs when frontend dist, .env or any of the secrets change
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=../.env");
    println!("cargo:rerun-if-changed=.env");
    for &key in SECRETS {
        println!("cargo:rerun-if-env-changed={}", key);
    }

    tauri_build::build()
}
