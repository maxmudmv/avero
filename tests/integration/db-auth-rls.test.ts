import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createApiApp } from "@/server/api/app";
import {
  loginOrRegisterWithGoogle,
  loginOrRegisterWithTelegram,
} from "@/server/auth/account";
import {
  createEmailVerificationRequest,
  verifyEmailToken,
} from "@/server/auth/email-verification";
import { closeDbPool, getPool } from "@/server/db";
import { withDbContext } from "@/server/db/context";
import {
  auditLogs,
  authIdentities,
  userSettings,
  users,
} from "@/server/db/schema";
import { clearMemoryRateLimits } from "@/server/security/rate-limit";

const hasIntegrationDb = Boolean(process.env.TEST_DATABASE_URL);

function signTelegramInitData(
  botToken: string,
  user: Record<string, unknown>,
  authDate: number
): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify(user));
  const pairs = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort((a, b) => a.localeCompare(b));
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(pairs.join("\n"))
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe.skipIf(!hasIntegrationDb)(
  "PostgreSQL RLS, Auth, Account Linking & API Security Integration",
  () => {
    const botToken = "999888777:TEST_BOT_TOKEN_FOR_INTEGRATION_TESTS";
    let app: ReturnType<typeof createApiApp>;

    beforeAll(() => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_SSL = "false";
      process.env.AUTH_SESSION_SECRET =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.AUDIT_IP_SALT = "fedcba9876543210fedcba9876543210";
      process.env.TELEGRAM_BOT_TOKEN = botToken;
      process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = "300";
      process.env.UPSTASH_REDIS_REST_URL = "";
      process.env.UPSTASH_REDIS_REST_TOKEN = "";
      resetEnvCacheForTests();
      app = createApiApp();
    });

    beforeEach(() => {
      clearMemoryRateLimits();
    });

    afterAll(async () => {
      await closeDbPool();
    });

    it("verifies real database health and non-superuser RLS enforcement", async () => {
      const res = await app.request("/api/v1/health");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data: { database: { connected: boolean } };
      };
      expect(body.ok).toBe(true);
      expect(body.data.database.connected).toBe(true);

      const pool = getPool();
      const roleCheck = await pool.query<{
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
      );
      expect(roleCheck.rows[0]?.rolsuper).toBe(false);
      expect(roleCheck.rows[0]?.rolbypassrls).toBe(false);
    });

    it("isolates user_settings, auth_identities, and audit_logs via PostgreSQL RLS", async () => {
      const userA = await loginOrRegisterWithGoogle({
        sub: `google-sub-a-${Date.now()}`,
        email: `usera_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "User Alpha",
      });
      const userB = await loginOrRegisterWithGoogle({
        sub: `google-sub-b-${Date.now()}`,
        email: `userb_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "User Beta",
      });

      // User A querying User B's private user_settings gets 0 rows under RLS
      const leakedSettings = await withDbContext(
        { userId: userA.userId, role: "user" },
        async (tx) => {
          return tx
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userB.userId));
        }
      );
      expect(leakedSettings).toHaveLength(0);

      // User A querying User B's auth_identities gets 0 rows under RLS
      const leakedIdentities = await withDbContext(
        { userId: userA.userId, role: "user" },
        async (tx) => {
          return tx
            .select()
            .from(authIdentities)
            .where(eq(authIdentities.userId, userB.userId));
        }
      );
      expect(leakedIdentities).toHaveLength(0);

      // Standard user cannot read audit_logs under RLS
      const userAuditRows = await withDbContext(
        { userId: userA.userId, role: "user" },
        async (tx) => tx.select().from(auditLogs).limit(5)
      );
      expect(userAuditRows).toHaveLength(0);

      // Admin context CAN read audit_logs
      const adminAuditRows = await withDbContext(
        { userId: userA.userId, role: "admin" },
        async (tx) => tx.select().from(auditLogs).limit(5)
      );
      expect(adminAuditRows.length).toBeGreaterThan(0);

      // Append-only enforcement: avero_app cannot UPDATE or DELETE audit_logs
      const pool = getPool();
      await expect(
        pool.query("UPDATE audit_logs SET event_type = 'TAMPERED'")
      ).rejects.toThrow();
      await expect(pool.query("DELETE FROM audit_logs")).rejects.toThrow();

      // User A cannot self-escalate role in users table via RLS WITH CHECK
      const escalated = await withDbContext(
        { userId: userA.userId, role: "user" },
        async (tx) =>
          tx
            .update(users)
            .set({ role: "admin" })
            .where(eq(users.id, userA.userId))
            .returning({ id: users.id })
      );
      expect(escalated).toHaveLength(0);
    });

    it("never auto-merges accounts with the same email across distinct Google subs", async () => {
      const sharedEmail = `shared_${Date.now()}@example.com`;
      const first = await loginOrRegisterWithGoogle({
        sub: `sub-one-${Date.now()}`,
        email: sharedEmail,
        emailVerified: true,
        displayName: "First Owner",
      });
      const second = await loginOrRegisterWithGoogle({
        sub: `sub-two-${Date.now()}`,
        email: sharedEmail,
        emailVerified: true,
        displayName: "Second Owner",
      });

      expect(first.userId).not.toBe(second.userId);
    });

    it("supports explicit-consent Telegram account linking and blocks hijacking conflicts", async () => {
      const webUser = await loginOrRegisterWithGoogle({
        sub: `google-link-${Date.now()}`,
        email: `linker_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Linker",
      });

      // Linking without explicit consent is rejected
      const noConsentRes = await app.request("/api/v1/auth/link/telegram/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webUser.sessionToken}`,
        },
        body: JSON.stringify({ consentAccepted: false }),
      });
      expect(noConsentRes.status).toBe(400);

      // Linking with explicit consent issues one-time token
      const initRes = await app.request("/api/v1/auth/link/telegram/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webUser.sessionToken}`,
        },
        body: JSON.stringify({ consentAccepted: true }),
      });
      expect(initRes.status).toBe(200);
      const initJson = (await initRes.json()) as {
        data: { linkToken: string };
      };

      const tgUserId = Math.floor(100_000_000 + Math.random() * 800_000_000);
      const nowSec = Math.floor(Date.now() / 1000);
      const validInitData = signTelegramInitData(
        botToken,
        { id: tgUserId, first_name: "Tele", username: "tele_link" },
        nowSec
      );

      const confirmRes = await app.request(
        "/api/v1/auth/link/telegram/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData: validInitData,
            linkToken: initJson.data.linkToken,
          }),
        }
      );
      expect(confirmRes.status).toBe(200);

      // Logging in via Telegram now resolves to the SAME webUser.userId
      const tgLogin = await loginOrRegisterWithTelegram({
        telegramUserId: tgUserId,
        firstName: "Tele",
        username: "tele_link",
      });
      expect(tgLogin.userId).toBe(webUser.userId);

      // Another user trying to link the same Telegram account gets 409 Conflict
      const attacker = await loginOrRegisterWithGoogle({
        sub: `google-attacker-${Date.now()}`,
        email: `attacker_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Attacker",
      });
      const attackerInit = await app.request(
        "/api/v1/auth/link/telegram/init",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${attacker.sessionToken}`,
          },
          body: JSON.stringify({ consentAccepted: true }),
        }
      );
      const attackerJson = (await attackerInit.json()) as {
        data: { linkToken: string };
      };

      const conflictRes = await app.request(
        "/api/v1/auth/link/telegram/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData: validInitData,
            linkToken: attackerJson.data.linkToken,
          }),
        }
      );
      expect(conflictRes.status).toBe(409);

      // Cannot unlink last remaining identity
      const unlinkTg = await app.request("/api/v1/auth/identities/telegram", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${webUser.sessionToken}` },
      });
      expect(unlinkTg.status).toBe(200);

      const unlinkLastGoogle = await app.request(
        "/api/v1/auth/identities/google",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${webUser.sessionToken}` },
        }
      );
      expect(unlinkLastGoogle.status).toBe(400);
    });

    it("enforces email verification token single-use, auth guards, and text-only upload blocking", async () => {
      const tgOnly = await loginOrRegisterWithTelegram({
        telegramUserId: Math.floor(100_000_000 + Math.random() * 800_000_000),
        firstName: "VerifyTest",
      });

      const email = `verify_${Date.now()}@example.com`;
      const req = await createEmailVerificationRequest({
        userId: tgOnly.userId,
        role: "user",
        email,
      });

      const verified = await verifyEmailToken({ rawToken: req.token });
      expect(verified.email).toBe(email);

      // Reusing token fails
      await expect(
        verifyEmailToken({ rawToken: req.token })
      ).rejects.toThrow();

      // Spoofed x-user-id header without real session is rejected
      const spoofRes = await app.request("/api/v1/auth/me", {
        headers: { "x-user-id": tgOnly.userId },
      });
      expect(spoofRes.status).toBe(401);

      // Standard user is forbidden from admin audit logs (403)
      const forbiddenRes = await app.request("/api/v1/admin/audit-logs", {
        headers: { Authorization: `Bearer ${tgOnly.sessionToken}` },
      });
      expect(forbiddenRes.status).toBe(403);

      // Rejects multipart/form-data media uploads with 415
      const uploadAttempt = await app.request("/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "multipart/form-data; boundary=----abc",
          Authorization: `Bearer ${tgOnly.sessionToken}`,
        },
        body: "------abc--",
      });
      expect(uploadAttempt.status).toBe(415);

      // Profile update works with valid JSON + Bearer session
      const profileUpdate = await app.request("/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tgOnly.sessionToken}`,
        },
        body: JSON.stringify({
          displayName: "Verified Bio User",
          bio: "Faqat matnli ijtimoiy tarmoq",
        }),
      });
      expect(profileUpdate.status).toBe(200);
    });
  }
);
