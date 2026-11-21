import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import {
  TelegramAuthError,
  verifyTelegramInitData,
} from "@/server/auth/telegram";
import {
  computePkceChallenge,
  generatePkceVerifier,
  hashPassword,
  sha256Hex,
  signPayload,
  timingSafeEqualHex,
  verifyPassword,
  verifySignedPayload,
} from "@/server/security/crypto";
import {
  clearMemoryRateLimits,
  consumeRateLimit,
} from "@/server/security/rate-limit";
import { sanitizeAuditMetadata } from "@/server/services/audit.service";

function buildSignedTelegramInitData(
  botToken: string,
  userObj: Record<string, unknown>,
  authDate: number
): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAHdF6IQAAAAAN0XohDhrOrc");
  params.set("user", JSON.stringify(userObj));

  const pairs = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  params.set("hash", hash);
  return params.toString();
}

describe("Security Crypto & Telegram initData Verification", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    process.env.AUTH_SESSION_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.AUDIT_IP_SALT = "0123456789abcdef0123456789abcdef";
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "";
    resetEnvCacheForTests();
    clearMemoryRateLimits();
  });

  it("signs and verifies payloads and rejects tampering", () => {
    const secret = "test-secret-key-at-least-32-chars-long";
    const token = signPayload({ state: "abc", mode: "login" }, secret);
    expect(verifySignedPayload<{ state: string }>(token, secret)?.state).toBe(
      "abc"
    );

    const tampered = `${token.slice(0, -1)}X`;
    expect(verifySignedPayload(tampered, secret)).toBeNull();
  });

  it("computes deterministic PKCE S256 challenge and timing-safe hex comparison", () => {
    const verifier = generatePkceVerifier();
    const challenge = computePkceChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(20);
    expect(timingSafeEqualHex(sha256Hex("hello"), sha256Hex("hello"))).toBe(
      true
    );
    expect(timingSafeEqualHex(sha256Hex("hello"), sha256Hex("world"))).toBe(
      false
    );
  });

  it("verifies valid Telegram initData and rejects forged or expired payloads", () => {
    const botToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
    const now = 1_750_000_000;
    const validRaw = buildSignedTelegramInitData(
      botToken,
      { id: 987654321, first_name: "Ali", username: "ali_uz" },
      now - 30
    );

    const verified = verifyTelegramInitData(validRaw, botToken, {
      maxAgeSeconds: 300,
      nowEpochSeconds: now,
    });
    expect(verified.user.id).toBe(987654321);
    expect(verified.user.username).toBe("ali_uz");

    // Tamper user ID
    const forged = validRaw.replace("987654321", "111111111");
    expect(() =>
      verifyTelegramInitData(forged, botToken, { nowEpochSeconds: now })
    ).toThrowError(TelegramAuthError);

    // Expired auth_date
    const expiredRaw = buildSignedTelegramInitData(
      botToken,
      { id: 987654321, first_name: "Ali" },
      now - 400
    );
    expect(() =>
      verifyTelegramInitData(expiredRaw, botToken, {
        maxAgeSeconds: 300,
        nowEpochSeconds: now,
      })
    ).toThrowError(/expired/i);
  });

  it("redacts sensitive keys in audit metadata", () => {
    const sanitized = sanitizeAuditMetadata({
      provider: "telegram",
      sessionToken: "super-secret-token",
      nested: { initData: "raw-data", count: 2 },
    });
    expect(sanitized.provider).toBe("telegram");
    expect(sanitized.sessionToken).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).initData).toBe(
      "[REDACTED]"
    );
    expect((sanitized.nested as Record<string, unknown>).count).toBe(2);
  });

  it("enforces sliding window rate limiting", async () => {
    const rule = { id: "test_rule", limit: 2, windowSeconds: 60 };
    const r1 = await consumeRateLimit("ip:1.2.3.4", rule);
    const r2 = await consumeRateLimit("ip:1.2.3.4", rule);
    const r3 = await consumeRateLimit("ip:1.2.3.4", rule);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("hashes and verifies passwords with per-user scrypt salt", () => {
    const h1 = hashPassword("AveroSecret123!");
    const h2 = hashPassword("AveroSecret123!");
    expect(h1).not.toBe(h2);
    expect(h1.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("AveroSecret123!", h1)).toBe(true);
    expect(verifyPassword("WrongPassword", h1)).toBe(false);
    expect(verifyPassword("AveroSecret123!", "invalid-hash")).toBe(false);
  });
});
