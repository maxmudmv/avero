import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createApiApp } from "@/server/api/app";
import {
  loginOrRegisterWithGoogle,
  loginOrRegisterWithTelegram,
} from "@/server/auth/account";
import { createUserSession } from "@/server/auth/session";
import { closeDbPool } from "@/server/db";
import { withDbContext } from "@/server/db/context";
import { auditLogs, userActivity, users } from "@/server/db/schema";
import { clearMemoryRateLimits } from "@/server/security/rate-limit";

const hasIntegrationDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasIntegrationDb)(
  "Notifications, Telegram Bot Opt-In, Moderation, RBAC Delegation & Audit RLS Integration",
  () => {
    let app: ReturnType<typeof createApiApp>;

    beforeAll(() => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_SSL = "false";
      process.env.AUTH_SESSION_SECRET =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.AUDIT_IP_SALT = "fedcba9876543210fedcba9876543210";
      process.env.UPSTASH_REDIS_REST_URL = "";
      process.env.UPSTASH_REDIS_REST_TOKEN = "";
      process.env.TELEGRAM_BOT_TOKEN = "";
      process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
      resetEnvCacheForTests();
      app = createApiApp();
    });

    beforeEach(() => {
      clearMemoryRateLimits();
    });

    afterAll(async () => {
      await closeDbPool();
    });

    async function createUserWithRole(
      tag: string,
      role: "user" | "moderator" | "admin" | "super_admin" = "user"
    ) {
      const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const base = await loginOrRegisterWithGoogle({
        sub: `gov-${tag}-${stamp}`,
        email: `gov_${tag}_${stamp}@example.com`,
        emailVerified: true,
        displayName: `Gov ${tag}`,
      });
      const username = `g_${tag}_${stamp}`.slice(0, 20).toLowerCase();

      await app.request("/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${base.sessionToken}`,
        },
        body: JSON.stringify({ username }),
      });

      if (role === "user") {
        return { ...base, username };
      }

      // Bootstrap role in DB using authFlow context (simulating SUPER_ADMIN_EMAILS / migration seed)
      // and issue a fresh session carrying the assigned role
      const elevated = await withDbContext({ authFlow: true }, async (tx) => {
        await tx
          .update(users)
          .set({ role })
          .where(eq(users.id, base.userId));
        return createUserSession(tx, {
          userId: base.userId,
          authChannel: "web_cookie",
          provider: "google",
        });
      });

      return {
        ...base,
        sessionToken: elevated.sessionToken,
        username,
        role,
      };
    }

    it("enforces Telegram bot /start + consent, per-type notification settings, avatar unlock & announcements", async () => {
      const tgUid = Math.floor(200_000_000 + Math.random() * 700_000_000);
      const tgUser = await loginOrRegisterWithTelegram({
        telegramUserId: tgUid,
        firstName: "TeleUser",
        username: `tu_${String(tgUid).slice(-6)}`,
      });
      const sender = await createUserWithRole("sender", "user");
      const superAdmin = await createUserWithRole("sa_notif", "super_admin");

      // Cannot enable telegramNotifications before /start
      const preStartErr = await app.request("/api/v1/account/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tgUser.sessionToken}`,
        },
        body: JSON.stringify({ telegramNotifications: true }),
      });
      expect(preStartErr.status).toBe(400);

      // Simulate Telegram bot /start webhook (wrong secret -> 403, valid secret -> 200)
      const badWebhook = await app.request("/api/v1/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": "wrong",
        },
        body: JSON.stringify({}),
      });
      expect(badWebhook.status).toBe(403);

      const goodWebhook = await app.request("/api/v1/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": "test-webhook-secret",
        },
        body: JSON.stringify({
          message: {
            text: "/start",
            from: { id: tgUid },
            chat: { id: tgUid },
          },
        }),
      });
      expect(goodWebhook.status).toBe(200);
      const webhookJson = (await goodWebhook.json()) as {
        data: { handled: boolean; startedUserId?: string };
      };
      expect(webhookJson.data.startedUserId).toBe(tgUser.userId);

      // Turn ON telegramNotifications consent AND disable "like" notification preference
      const prefRes = await app.request("/api/v1/account/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tgUser.sessionToken}`,
        },
        body: JSON.stringify({
          telegramNotifications: true,
          notificationPreferences: { like: false, comment: true },
        }),
      });
      expect(prefRes.status).toBe(200);

      // Mock Telegram Bot API sendMessage fetch when token is set temporarily
      process.env.TELEGRAM_BOT_TOKEN = "999999:MOCK_BOT_TOKEN";
      resetEnvCacheForTests();
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      try {
        // Create post as tgUser
        const postRes = await app.request("/api/v1/posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tgUser.sessionToken}`,
          },
          body: JSON.stringify({
            postType: "note",
            body: "Bildirishnoma kanali testi",
          }),
        });
        const postId = ((await postRes.json()) as { data: { post: { id: string } } }).data.post.id;

        // Sender likes post -> suppressed because tgUser disabled `like`
        await app.request(`/api/v1/posts/${postId}/like/toggle`, {
          method: "POST",
          headers: { Authorization: `Bearer ${sender.sessionToken}` },
        });

        // Sender comments on post -> delivered both in-app AND via Telegram bot!
        await app.request(`/api/v1/posts/${postId}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sender.sessionToken}`,
          },
          body: JSON.stringify({ body: "Ajoyib matn!" }),
        });

        // Wait a tick for async Telegram fetch dispatch
        await new Promise((r) => setTimeout(r, 40));
        expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        const sentBodies = fetchSpy.mock.calls.map((c) =>
          String((c[1] as RequestInit | undefined)?.body ?? "")
        );
        expect(sentBodies.some((b) => b.includes("izoh yozdi"))).toBe(true);
        expect(sentBodies.some((b) => b.includes("like bosdi"))).toBe(false);
        expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("sendMessage");

        // Trigger avatar_unlocked notification by advancing account age & cycles in user_activity then visiting /auth/me
        await withDbContext({ authFlow: true }, async (tx) => {
          const oldDate = new Date(Date.now() - 35 * 24 * 3600 * 1000);
          await tx
            .update(users)
            .set({ createdAt: oldDate })
            .where(eq(users.id, tgUser.userId));
          await tx
            .update(userActivity)
            .set({ activeThreeDayCycles: 4 })
            .where(eq(userActivity.userId, tgUser.userId));
        });
        await app.request("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${tgUser.sessionToken}` },
        });

        // Super Admin broadcasts important platform announcement
        const annRes = await app.request("/api/v1/admin/announcements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${superAdmin.sessionToken}`,
          },
          body: JSON.stringify({
            title: "Muhim yangilanish",
            body: "Xavfsizlik va moderatsiya tizimi yangilandi.",
          }),
        });
        expect(annRes.status).toBe(201);

        // Verify tgUser received comment, avatar_unlocked, announcement — and did NOT receive suppressed `like`
        const notifsRes = await app.request("/api/v1/notifications", {
          headers: { Authorization: `Bearer ${tgUser.sessionToken}` },
        });
        const notifsJson = (await notifsRes.json()) as {
          data: { notifications: Array<{ type: string }> };
        };
        const types = notifsJson.data.notifications.map((n) => n.type);
        expect(types).not.toContain("like");
        expect(types).toContain("comment");
        expect(types).toContain("avatar_unlocked");
        expect(types).toContain("announcement");
      } finally {
        fetchSpy.mockRestore();
        process.env.TELEGRAM_BOT_TOKEN = "";
        resetEnvCacheForTests();
      }
    });

    it("enforces Super Admin, delegated Admin, Moderator permission boundaries, appeals & immutable audit logs", async () => {
      const superAdmin = await createUserWithRole("sa", "super_admin");
      const admin = await createUserWithRole("adm", "admin");
      const moderator = await createUserWithRole("mod", "moderator");
      const citizen = await createUserWithRole("cit", "user");

      // Citizen creates a post + abusive/reportable comment
      const postRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdmin.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "note",
          body: "Oddiy post",
        }),
      });
      const postId = ((await postRes.json()) as { data: { post: { id: string } } }).data.post.id;

      const commentRes = await app.request(`/api/v1/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${citizen.sessionToken}`,
        },
        body: JSON.stringify({
          body: "Tekin pul va free crypto havolasi bu yerda!",
        }),
      });
      expect(commentRes.status).toBe(201);
      const commentId = ((await commentRes.json()) as { data: { comment: { id: string } } }).data.comment.id;

      // Reporter files comment report
      const reportRes = await app.request("/api/v1/reports/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdmin.sessionToken}`,
        },
        body: JSON.stringify({
          commentId,
          reasonCode: "spam",
          details: "Spam reklama",
        }),
      });
      expect(reportRes.status).toBe(201);
      const reportId = ((await reportRes.json()) as { data: { report: { id: string } } }).data.report.id;

      // 1. Standard user CANNOT access any admin/mod endpoint
      expect(
        (
          await app.request("/api/v1/admin/reports", {
            headers: { Authorization: `Bearer ${citizen.sessionToken}` },
          })
        ).status
      ).toBe(403);

      // 2. Delegated Admin starts with ZERO governance permissions until Super Admin grants them!
      expect(
        (
          await app.request("/api/v1/admin/reports", {
            headers: { Authorization: `Bearer ${admin.sessionToken}` },
          })
        ).status
      ).toBe(403);
      expect(
        (
          await app.request("/api/v1/admin/audit-logs", {
            headers: { Authorization: `Bearer ${admin.sessionToken}` },
          })
        ).status
      ).toBe(403);

      // Moderator CANNOT grant permissions to Admin (`403`)
      const modGrantAttempt = await app.request(
        `/api/v1/admin/admins/${admin.userId}/permissions`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${moderator.sessionToken}`,
          },
          body: JSON.stringify({
            permissions: ["mod:reports:read"],
            reason: "Noto‘g‘ri urinish",
          }),
        }
      );
      expect(modGrantAttempt.status).toBe(403);

      // Super Admin grants ONLY `mod:reports:read` and `admin:audit:read` to Admin
      const grantRes = await app.request(
        `/api/v1/admin/admins/${admin.userId}/permissions`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${superAdmin.sessionToken}`,
          },
          body: JSON.stringify({
            permissions: ["mod:reports:read", "admin:audit:read"],
            reason: "Hisobotlar va audit nazorati berildi",
          }),
        }
      );
      expect(grantRes.status).toBe(200);

      // Now Admin CAN read reports & audit logs, but CANNOT send announcements or ban (not granted!)
      expect(
        (
          await app.request("/api/v1/admin/reports", {
            headers: { Authorization: `Bearer ${admin.sessionToken}` },
          })
        ).status
      ).toBe(200);
      expect(
        (
          await app.request("/api/v1/admin/audit-logs", {
            headers: { Authorization: `Bearer ${admin.sessionToken}` },
          })
        ).status
      ).toBe(200);
      expect(
        (
          await app.request("/api/v1/admin/announcements", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${admin.sessionToken}`,
            },
            body: JSON.stringify({
              title: "Ruxsatsiz",
              body: "Bu amal 403 berishi kerak",
            }),
          })
        ).status
      ).toBe(403);

      // 3. Moderator capabilities:
      // - CAN inspect automated flags & reports, delete comment, warn user, temporary mute
      const modFlags = await app.request("/api/v1/admin/flags", {
        headers: { Authorization: `Bearer ${moderator.sessionToken}` },
      });
      expect(modFlags.status).toBe(200);
      const flagsJson = (await modFlags.json()) as {
        data: { flags: Array<{ id: string }> };
      };
      expect(flagsJson.data.flags.length).toBeGreaterThan(0);

      const modReview = await app.request(
        `/api/v1/admin/reports/${reportId}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${moderator.sessionToken}`,
          },
          body: JSON.stringify({
            status: "resolved_action",
            reason: "Spam reklama o‘chirildi va ogohlantirildi",
            deleteComment: true,
            warnAuthor: true,
          }),
        }
      );
      expect(modReview.status).toBe(200);

      // Serious status action WITHOUT humanConfirmed: true is rejected (400)
      const noHumanConfirm = await app.request(
        `/api/v1/admin/users/${citizen.userId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${moderator.sessionToken}`,
          },
          body: JSON.stringify({
            action: "mute",
            reason: "Spam takrorlandi",
            durationHours: 12,
            humanConfirmed: false,
          }),
        }
      );
      expect(noHumanConfirm.status).toBe(400);

      // Temporary mute WITH humanConfirmed: true succeeds (200)
      const modMute = await app.request(
        `/api/v1/admin/users/${citizen.userId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${moderator.sessionToken}`,
          },
          body: JSON.stringify({
            action: "mute",
            reason: "Spam sabab 12 soat mute",
            durationHours: 12,
            humanConfirmed: true,
          }),
        }
      );
      expect(modMute.status).toBe(200);

      // Moderator CANNOT permanently ban (`403`) or view/tamper audit logs (`403` + RLS 0 rows)
      const modBan = await app.request(
        `/api/v1/admin/users/${citizen.userId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${moderator.sessionToken}`,
          },
          body: JSON.stringify({
            action: "ban",
            reason: "Moderator ban qo‘ya olmaydi",
            humanConfirmed: true,
          }),
        }
      );
      expect(modBan.status).toBe(403);

      const modAuditHttp = await app.request("/api/v1/admin/audit-logs", {
        headers: { Authorization: `Bearer ${moderator.sessionToken}` },
      });
      expect(modAuditHttp.status).toBe(403);

      const modAuditDb = await withDbContext(
        { userId: moderator.userId, role: "moderator" },
        async (tx) => tx.select().from(auditLogs).limit(10)
      );
      expect(modAuditDb).toHaveLength(0);

      // Moderator CANNOT bypass RLS to set status='banned' on citizen in raw SQL
      const rawModBanRows = await withDbContext(
        { userId: moderator.userId, role: "moderator" },
        async (tx) =>
          tx
            .update(users)
            .set({ status: "banned" })
            .where(eq(users.id, citizen.userId))
            .returning({ id: users.id })
      ).catch(() => []);
      expect(rawModBanRows).toHaveLength(0);

      // 4. Muted citizen submits appeal -> Super Admin approves & restores active status -> recorded in Audit Log
      const appealRes = await app.request("/api/v1/moderation/appeals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${citizen.sessionToken}`,
        },
        body: JSON.stringify({
          actionType: "mute",
          reason: "Xabardor emas edim, boshqa takrorlamayman.",
        }),
      });
      expect(appealRes.status).toBe(201);
      const appealId = ((await appealRes.json()) as { data: { appeal: { id: string } } }).data.appeal.id;

      // Moderator cannot approve appeal (`403`)
      const modAppealApprove = await app.request(
        `/api/v1/admin/appeals/${appealId}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${moderator.sessionToken}`,
          },
          body: JSON.stringify({
            decision: "approved",
            reason: "Moderator qarori mumkin emas",
            humanConfirmed: true,
          }),
        }
      );
      expect(modAppealApprove.status).toBe(403);

      // Super Admin approves appeal -> restores citizen status to active
      const saAppealApprove = await app.request(
        `/api/v1/admin/appeals/${appealId}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${superAdmin.sessionToken}`,
          },
          body: JSON.stringify({
            decision: "approved",
            reason: "Foydalanuvchi holati tiklandi",
            humanConfirmed: true,
          }),
        }
      );
      expect(saAppealApprove.status).toBe(200);

      // Super Admin bans citizen permanently (`200`) and revokes session
      const saBan = await app.request(
        `/api/v1/admin/users/${citizen.userId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${superAdmin.sessionToken}`,
          },
          body: JSON.stringify({
            action: "ban",
            reason: "Takroriy qoidabuzarlik uchun doimiy ban",
            humanConfirmed: true,
          }),
        }
      );
      expect(saBan.status).toBe(200);

      // Citizen session immediately invalidated
      expect(
        (
          await app.request("/api/v1/auth/me", {
            headers: { Authorization: `Bearer ${citizen.sessionToken}` },
          })
        ).status
      ).toBe(401);

      // Audit logs contain full trace (who, what, when, target, reason)
      const auditRes = await app.request("/api/v1/admin/audit-logs", {
        headers: { Authorization: `Bearer ${superAdmin.sessionToken}` },
      });
      expect(auditRes.status).toBe(200);
      const auditJson = (await auditRes.json()) as {
        data: {
          logs: Array<{
            eventType: string;
            actorId: string | null;
            reason: string | null;
            targetId: string | null;
          }>;
        };
      };
      const banLog = auditJson.data.logs.find(
        (l) => l.eventType === "USER_BANNED" && l.targetId === citizen.userId
      );
      expect(banLog?.actorId).toBe(superAdmin.userId);
      expect(banLog?.reason).toContain("doimiy ban");
    });
  }
);
