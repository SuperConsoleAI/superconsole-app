// AES-256-GCM encryption for project LLM keys.
//
// The symmetric key is derived once via HKDF-SHA256 from WORKOS_COOKIE_PASSWORD
// (shared with the web portal, so keys set on either surface decrypt on both)
// and then cached in the OS keychain. Storage format matches the web portal:
//   base64( nonce(12 bytes) || ciphertext || gcm_tag(16 bytes) )

use crate::cloud;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use hkdf::Hkdf;
use sha2::Sha256;

const KEYRING_SERVICE: &str = "com.superconsole.desktop";
const KEYRING_ACCOUNT: &str = "llm_enc_key";

// Must match the web portal's crypto.ts exactly.
const HKDF_SALT: &[u8] = b"superconsole-llm-keys-v1";
const HKDF_INFO: &[u8] = b"aes-256-gcm";

fn derive_key() -> Result<[u8; 32], String> {
    let password = cloud::cookie_password()?;
    let hk = Hkdf::<Sha256>::new(Some(HKDF_SALT), password.as_bytes());
    let mut okm = [0u8; 32];
    hk.expand(HKDF_INFO, &mut okm)
        .map_err(|_| "HKDF expand failed".to_string())?;
    Ok(okm)
}

fn encryption_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())?;
    if let Ok(b64) = entry.get_password() {
        if let Ok(bytes) = STANDARD.decode(b64) {
            if bytes.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                return Ok(key);
            }
        }
    }
    let key = derive_key()?;
    let _ = entry.set_password(&STANDARD.encode(key));
    Ok(key)
}

/// Remove the derived AES key cached in the OS keychain. It is re-derived from
/// WORKOS_COOKIE_PASSWORD on next use, so this is safe to call anytime.
pub fn clear_cached_key() -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key_bytes = encryption_key()?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| "encryption failed".to_string())?;
    let mut out = Vec::with_capacity(nonce.len() + ct.len());
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ct);
    Ok(STANDARD.encode(out))
}

pub fn decrypt(encoded: &str) -> Result<String, String> {
    let key_bytes = encryption_key()?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let raw = STANDARD
        .decode(encoded)
        .map_err(|_| "invalid base64".to_string())?;
    if raw.len() < 12 + 16 {
        return Err("ciphertext too short".to_string());
    }
    let (nonce_bytes, ct) = raw.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let pt = cipher
        .decrypt(nonce, ct)
        .map_err(|_| "decryption failed".to_string())?;
    String::from_utf8(pt).map_err(|_| "invalid utf-8 plaintext".to_string())
}
