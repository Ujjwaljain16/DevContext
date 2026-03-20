/**
 * Encryption Module
 * 
 * From PRD Section 15.2:
 * "Decision fields (currentTask, decisions, failedAttempts, currentState, nextSteps) 
 *  are encrypted before write and decrypted after read. File paths and metadata 
 *  are stored plaintext for fast index lookups."
 * 
 * Uses crypto built-in (Node.js). Simple XOR-based encryption for MVP.
 * In production, use proper AES-256-GCM with key derivation.
 */

import crypto from "crypto";
import { ModuleState } from "./types";

/**
 * Sensitive fields that need encryption at rest
 */
const SENSITIVE_FIELDS = [
  "currentTask",
  "currentState",
  "decisions",
  "failedAttempts",
  "nextSteps",
];

/**
 * Get encryption key from environment or generate default.
 * In production, use proper key derivation from password.
 */
function getEncryptionKey(): Buffer {
  const keyStr = process.env.DEVCTX_ENCRYPTION_KEY || "devctx-default-key-please-override";
  // Derive 32-byte key using PBKDF2
  return crypto.pbkdf2Sync(keyStr, "devctx-salt", 100000, 32, "sha256");
}

/**
 * Encrypt a string using AES-256-CBC
 */
export function encryptString(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    let encrypted = cipher.update(plaintext, "utf-8", "hex");
    encrypted += cipher.final("hex");

    // Prepend IV to ciphertext for decryption
    return iv.toString("hex") + ":" + encrypted;
  } catch (err) {
    console.warn("Encryption failed, returning plaintext:", err);
    return plaintext;
  }
}

/**
 * Decrypt a string that was encrypted with encryptString()
 */
export function decryptString(ciphertext: string): string {
  try {
    const key = getEncryptionKey();
    const [ivHex, encrypted] = ciphertext.split(":");

    if (!ivHex || !encrypted) {
      // Not encrypted or malformed, return as-is
      return ciphertext;
    }

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (err) {
    console.warn("Decryption failed, returning original:", err);
    return ciphertext;
  }
}

/**
 * Encrypt all sensitive fields in a ModuleState before writing to disk
 */
export function encryptModuleState(state: ModuleState): ModuleState {
  const encrypted = { ...state };

  // Encrypt string fields
  encrypted.currentTask = encryptString(encrypted.currentTask);
  encrypted.currentState = encryptString(encrypted.currentState);

  // Encrypt array fields (each element)
  encrypted.decisions = encrypted.decisions.map((item) => encryptString(item));
  encrypted.failedAttempts = encrypted.failedAttempts.map((item) => encryptString(item));
  encrypted.nextSteps = encrypted.nextSteps.map((item) => encryptString(item));

  return encrypted;
}

/**
 * Decrypt all sensitive fields in a ModuleState after reading from disk
 */
export function decryptModuleState(state: ModuleState): ModuleState {
  const decrypted = { ...state };

  // Decrypt string fields
  decrypted.currentTask = decryptString(decrypted.currentTask);
  decrypted.currentState = decryptString(decrypted.currentState);

  // Decrypt array fields (each element)
  decrypted.decisions = decrypted.decisions.map((item) => decryptString(item));
  decrypted.failedAttempts = decrypted.failedAttempts.map((item) => decryptString(item));
  decrypted.nextSteps = decrypted.nextSteps.map((item) => decryptString(item));

  return decrypted;
}

/**
 * One-way hash for index entries (for searching without decrypting all files)
 * Used to create searchable indexes without compromising encryption
 */
export function hashStr(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
