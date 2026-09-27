// AES-256-GCM encryption for LLM keys and connector credentials.
//
// TWO key derivation strategies:
//
// 1. `encryption_key()` — global flat key (HKDF from WORKOS_COOKIE_PASSWORD alone).
//    Cached in the OS keychain. Used for low-security / backward-compat paths.
//
// 2. `derive_key_for_scope_id(scope_id)` — scope-bound key.
//    HKDF-SHA256 over `WORKOS_COOKIE_PASSWORD:scope_id`.
//    `scope_id` is the project_id / org_id / user_id depending on context.
//    This is the standard for ALL LLM keys and connector credentials.
//    Any team member with the same scope_id (i.e. same project/org/account)
//    derives the same key and can decrypt — no per-device secret needed.
//
// Storage format (both paths):
//   base64( nonce(12 bytes) || ciphertext || gcm_tag(16 bytes) )
//
// HKDF salt and info must match the web portal's crypto.ts exactly.

use crate::cloud;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use hkdf::Hkdf;
use sha2::Sha256;


// Salt for the global (non-scoped) key — must match web portal.
const HKDF_SALT_GLOBAL: &[u8] = b"superconsole-llm-keys-v1";
// Salt for scope-bound keys (LLM keys + connectors).
const HKDF_SALT_SCOPED: &[u8] = b"superconsole-scoped-keys-v1";
const HKDF_INFO: &[u8] = b"aes-256-gcm";

// ── Raw AES-256-GCM ──────────────────────────────────────────────────────────

fn aes_encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "encryption failed".to_string())?;
    let mut out = Vec::with_capacity(nonce.len() + ct.len());
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ct);
    Ok(STANDARD.encode(out))
}

fn aes_decrypt(key: &[u8; 32], encoded: &str) -> Result<Vec<u8>, String> {
    let raw = STANDARD
        .decode(encoded)
        .map_err(|_| "invalid base64".to_string())?;
    if raw.len() < 12 + 16 {
        return Err("ciphertext too short".to_string());
    }
    let (nonce_bytes, ct) = raw.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(nonce, ct)
        .map_err(|_| "decryption failed".to_string())
}

// ── Global key (backward-compat, in-memory HKDF derived) ──────────────────────

fn derive_key_global() -> Result<[u8; 32], String> {
    let password = cloud::cookie_password()?;
    let hk = Hkdf::<Sha256>::new(Some(HKDF_SALT_GLOBAL), password.as_bytes());
    let mut okm = [0u8; 32];
    hk.expand(HKDF_INFO, &mut okm)
        .map_err(|_| "HKDF expand failed".to_string())?;
    Ok(okm)
}

fn encryption_key() -> Result<[u8; 32], String> {
    derive_key_global()
}

/// No-op: keys are derived deterministically in RAM from WORKOS_COOKIE_PASSWORD.
pub fn clear_cached_key() -> Result<(), String> {
    Ok(())
}

// ── Global encrypt / decrypt (kept for existing non-scope paths) ─────────────

pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key = encryption_key()?;
    aes_encrypt(&key, plaintext.as_bytes())
}

pub fn decrypt(encoded: &str) -> Result<String, String> {
    let key = encryption_key()?;
    let pt = aes_decrypt(&key, encoded)?;
    String::from_utf8(pt).map_err(|_| "invalid utf-8 plaintext".to_string())
}

// ── Scope-bound key derivation ────────────────────────────────────────────────
//
// Key input = WORKOS_COOKIE_PASSWORD + ":" + scope_id
// scope_id  = project_id | org_id | user_id
//
// Any team member with the same scope_id derives the same key automatically.
// No per-device secret, no key exchange needed.

pub fn derive_key_for_scope_id(scope_id: &str) -> Result<[u8; 32], String> {
    let password = cloud::cookie_password()?;
    let ikm = format!("{}:{}", password, scope_id);
    let hk = Hkdf::<Sha256>::new(Some(HKDF_SALT_SCOPED), ikm.as_bytes());
    let mut okm = [0u8; 32];
    hk.expand(HKDF_INFO, &mut okm)
        .map_err(|_| "HKDF expand failed".to_string())?;
    Ok(okm)
}

/// Encrypt `plaintext` with a key derived from WORKOS_COOKIE_PASSWORD + scope_id.
/// Use for all LLM API keys and connector credentials.
pub fn encrypt_scoped(plaintext: &str, scope_id: &str) -> Result<String, String> {
    let key = derive_key_for_scope_id(scope_id)?;
    aes_encrypt(&key, plaintext.as_bytes())
}

/// Decrypt a blob previously encrypted with `encrypt_scoped(scope_id)`.
pub fn decrypt_scoped(encoded: &str, scope_id: &str) -> Result<String, String> {
    let key = derive_key_for_scope_id(scope_id)?;
    let pt = aes_decrypt(&key, encoded)?;
    String::from_utf8(pt).map_err(|_| "invalid utf-8 plaintext".to_string())
}
