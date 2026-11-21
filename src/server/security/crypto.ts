import "server-only";
import crypto from "node:crypto";

export function generateOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacSha256Buffer(
  secret: string | Buffer,
  data: string
): Buffer {
  return crypto.createHmac("sha256", secret).update(data, "utf8").digest();
}

export function hmacSha256Hex(secret: string | Buffer, data: string): string {
  return hmacSha256Buffer(secret, data).toString("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const normalizedA = a.trim().toLowerCase();
  const normalizedB = b.trim().toLowerCase();
  if (
    normalizedA.length === 0 ||
    normalizedA.length !== normalizedB.length ||
    !/^[0-9a-f]+$/.test(normalizedA) ||
    !/^[0-9a-f]+$/.test(normalizedB)
  ) {
    return false;
  }

  const bufA = Buffer.from(normalizedA, "hex");
  const bufB = Buffer.from(normalizedB, "hex");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signPayload<T extends object>(
  payload: T,
  secret: string
): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded, "utf8")
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySignedPayload<T>(
  token: string,
  secret: string
): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) {
    return null;
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encoded, "utf8")
    .digest("base64url");

  if (!timingSafeEqualString(providedSig, expectedSig)) {
    return null;
  }

  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function hashIpAddress(
  ip: string | null | undefined,
  salt: string
): string | null {
  if (!ip || ip.trim().length === 0) {
    return null;
  }
  return hmacSha256Hex(salt, ip.trim());
}

export function generatePkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function computePkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier, "utf8").digest("base64url");
}

const PASSWORD_SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const PASSWORD_KEY_LEN = 64;

/**
 * Hashes a user password with a per-user random 16-byte salt using memory-hard scrypt.
 * Format: scrypt$<saltHex>$<derivedKeyHex>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto
    .scryptSync(password, salt, PASSWORD_KEY_LEN, PASSWORD_SCRYPT_PARAMS)
    .toString("hex");
  return `scrypt$${salt}$${derived}`;
}

/**
 * Constant-time verification of a password against a stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false;
  }
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const derivedBuf = crypto.scryptSync(
    password,
    salt,
    expectedBuf.length,
    PASSWORD_SCRYPT_PARAMS
  );
  if (derivedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}
