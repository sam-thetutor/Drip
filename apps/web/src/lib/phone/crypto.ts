import { hexToBytes, toHex } from "viem";

const ENCRYPTION_VERSION = 1;
const PBKDF2_ITERATIONS = 150000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available in this environment");
  }
  return subtle;
}

function utf8ToBuffer(value: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(value);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

function bufferToUtf8(value: ArrayBuffer): string {
  return new TextDecoder().decode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveAesKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const baseKey = await subtle.importKey(
    "raw",
    utf8ToBuffer(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Produces a hex-encoded payload: version(1) + salt(16) + iv(12) + ciphertext(n)
 */
export async function encryptPhoneForOnchain(phone: string, passphrase: string): Promise<`0x${string}`> {
  if (!phone.trim()) {
    throw new Error("Phone is required");
  }
  if (!passphrase.trim()) {
    throw new Error("Passphrase is required");
  }

  const subtle = getSubtleCrypto();
  const saltBytes = new Uint8Array(new ArrayBuffer(SALT_LENGTH));
  globalThis.crypto.getRandomValues(saltBytes);
  const ivBytes = new Uint8Array(new ArrayBuffer(IV_LENGTH));
  globalThis.crypto.getRandomValues(ivBytes);
  const key = await deriveAesKey(passphrase, toArrayBuffer(saltBytes));

  const encryptedBuffer = await subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
    key,
    utf8ToBuffer(phone)
  );
  const encrypted = new Uint8Array(encryptedBuffer);

  const payload = new Uint8Array(1 + SALT_LENGTH + IV_LENGTH + encrypted.length);
  payload[0] = ENCRYPTION_VERSION;
  payload.set(saltBytes, 1);
  payload.set(ivBytes, 1 + SALT_LENGTH);
  payload.set(encrypted, 1 + SALT_LENGTH + IV_LENGTH);

  return toHex(payload);
}

export async function decryptPhoneFromOnchain(
  encryptedPayloadHex: `0x${string}`,
  passphrase: string
): Promise<string | null> {
  if (!encryptedPayloadHex || encryptedPayloadHex === "0x") return null;
  if (!passphrase.trim()) {
    throw new Error("Passphrase is required");
  }

  const subtle = getSubtleCrypto();
  const payload = hexToBytes(encryptedPayloadHex);

  if (payload.length < 1 + SALT_LENGTH + IV_LENGTH) {
    throw new Error("Invalid encrypted payload");
  }

  const version = payload[0];
  if (version !== ENCRYPTION_VERSION) {
    throw new Error("Unsupported encrypted payload version");
  }

  const saltStart = 1;
  const ivStart = saltStart + SALT_LENGTH;
  const cipherStart = ivStart + IV_LENGTH;

  const salt = toArrayBuffer(payload.slice(saltStart, ivStart));
  const iv = toArrayBuffer(payload.slice(ivStart, cipherStart));
  const ciphertext = toArrayBuffer(payload.slice(cipherStart));

  if (ciphertext.byteLength === 0) {
    throw new Error("Invalid encrypted payload");
  }

  try {
    const key = await deriveAesKey(passphrase, salt);
    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return bufferToUtf8(decrypted);
  } catch {
    return null;
  }
}
