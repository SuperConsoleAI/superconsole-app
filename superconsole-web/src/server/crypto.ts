import { env } from "cloudflare:workers";

// AES-256-GCM, matching the desktop crypto.rs exactly so keys set on either
// surface decrypt on both. Key is derived via HKDF-SHA256 from
// WORKOS_COOKIE_PASSWORD. Storage format: base64(nonce[12] || ciphertext||tag).
const HKDF_SALT = new TextEncoder().encode("superconsole-llm-keys-v1");
const HKDF_INFO = new TextEncoder().encode("aes-256-gcm");

async function deriveKey(): Promise<CryptoKey> {
  const password = new TextEncoder().encode(env.WORKOS_COOKIE_PASSWORD);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    password,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce, 0);
  out.set(ct, nonce.length);
  return toBase64(out);
}

export async function decrypt(encoded: string): Promise<string> {
  const key = await deriveKey();
  const raw = fromBase64(encoded);
  const nonce = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ct,
  );
  return new TextDecoder().decode(pt);
}
