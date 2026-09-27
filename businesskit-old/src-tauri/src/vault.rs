// src-tauri/src/vault.rs
// AES-256-GCM encryption — mirrors src/lib/vault.ts exactly.
// Format: hex(iv) + "." + hex(ciphertext+tag)
// Key derivation: PBKDF2-HMAC-SHA256, 100_000 rounds, 32-byte key
//
// Per-project key scheme:
//   password = ENCRYPTION_SECRET + ":" + profile_id
//   salt     = "openclaw-v1"   (matches vault.ts)
// This gives each project a unique AES key — leaking ENCRYPTION_SECRET
// alone is not enough to decrypt any token without also knowing profile_id.

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

/// Salt — must match vault.ts ("openclaw-v1")
const SALT: &[u8] = b"openclaw-v1";
const ITERATIONS: u32 = 100_000;
const KEY_LEN: usize = 32;
const IV_LEN: usize = 12; // 96-bit nonce for AES-GCM

/// Derive a per-project AES-256 key.
/// password = "{secret}:{profile_id}" — unique per project.
fn derive_key(secret: &str, profile_id: &str) -> [u8; KEY_LEN] {
    let password = format!("{}:{}", secret, profile_id);
    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), SALT, ITERATIONS, &mut key);
    key
}

/// Encrypt plaintext using AES-256-GCM with a per-project key.
/// Returns hex(iv) + "." + hex(ciphertext_with_tag)
pub fn encrypt(plaintext: &str, secret: &str, profile_id: &str) -> Result<String> {
    let key_bytes = derive_key(secret, profile_id);
    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| anyhow!("Cipher init error: {}", e))?;

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;

    Ok(format!(
        "{}.{}",
        hex::encode(nonce),
        hex::encode(ciphertext)
    ))
}

/// Decrypt a value produced by encrypt() or vault.ts encrypt().
/// profile_id must match the one used during encryption.
pub fn decrypt(encoded: &str, secret: &str, profile_id: &str) -> Result<String> {
    let parts: Vec<&str> = encoded.splitn(2, '.').collect();
    if parts.len() != 2 {
        return Err(anyhow!("Invalid encrypted format"));
    }

    let iv_bytes = hex::decode(parts[0]).map_err(|e| anyhow!("IV decode error: {}", e))?;
    let ct_bytes = hex::decode(parts[1]).map_err(|e| anyhow!("CT decode error: {}", e))?;

    if iv_bytes.len() != IV_LEN {
        return Err(anyhow!("Invalid IV length"));
    }

    let key_bytes = derive_key(secret, profile_id);
    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| anyhow!("Cipher init error: {}", e))?;

    let nonce = Nonce::from_slice(&iv_bytes);
    let plaintext = cipher.decrypt(nonce, ct_bytes.as_ref()).map_err(|_| {
        anyhow!("Decryption failed — wrong key, wrong profile_id, or corrupted data")
    })?;

    String::from_utf8(plaintext).map_err(|e| anyhow!("UTF-8 decode error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let secret = "my-test-secret";
        let profile_id = "test-profile-123";
        let plaintext = "hello businesskit";
        let enc = encrypt(plaintext, secret, profile_id).unwrap();
        let dec = decrypt(&enc, secret, profile_id).unwrap();
        assert_eq!(dec, plaintext);
    }

    #[test]
    fn wrong_key_fails() {
        let enc = encrypt("secret data", "correct-key", "profile-abc").unwrap();
        assert!(decrypt(&enc, "wrong-key", "profile-abc").is_err());
    }

    #[test]
    fn wrong_profile_fails() {
        let enc = encrypt("secret data", "correct-key", "profile-abc").unwrap();
        assert!(decrypt(&enc, "correct-key", "profile-xyz").is_err());
    }
}
