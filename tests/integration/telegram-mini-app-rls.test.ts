import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createApiApp } from "@/server/api/app";
import { loginOrRegisterWithGoogle } from "@/server/auth/account";
import { closeDbPool } from "@/server/db";
import { clearMemoryRateLimits } from "@/server/security/rate-limit";
import { clearBotCooldownForTests } from "@/server/services/telegram-bot.service";

const hasIntegrationDb = Boolean(process.env.TEST_DATABASE_URL);

function signTelegramInitData(
  botToken: string,
  user: Record<string, unknown>,
  authDate: number,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify(user));
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      params.set(k, v);
    }
  }
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
  "Telegram Mini App Auth, Replay Protection, Unified Account/Data & Bot Integration",
  () => {
    const botToken = "888777666:TEST_TMA_BOT_TOKEN";
    let app: ReturnType<typeof createApiApp>;

    beforeAll(() => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_SSL = "false";
      process.env.APP_URL = "https://avero.example.com";
      process.env.AUTH_SESSION_SECRET =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.AUDIT_IP_SALT = "fedcba9876543210fedcba9876543210";
      process.env.TELEGRAM_BOT_TOKEN = botToken;
      process.env.TELEGRAM_WEBHOOK_SECRET = "tma-webhook-secret";
      process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = "300";
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = "averouz_bot";
      process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME = "app";
      process.env.UPSTASH_REDIS_REST_URL = "";
      process.env.UPSTASH_REDIS_REST_TOKEN = "";
      resetEnvCacheForTests();
      app = createApiApp();
    });

    beforeEach(() => {
      clearMemoryRateLimits();
      clearBotCooldownForTests();
    });

    afterAll(async () => {
      await closeDbPool();
    });

    it("verifies Telegram initData HMAC signature, rejects expired/tampered payloads, and blocks replay attacks", async () => {
      const tgUserId = Math.floor(300_000_000 + Math.random() * 500_000_000);
      const nowSec = Math.floor(Date.now() / 1000);

      // 1. Tampered initData (client spoofs another Telegram user id) -> 401 INVALID_SIGNATURE
      const validRaw = signTelegramInitData(
        botToken,
        { id: tgUserId, first_name: "TMA", username: "tma_user" },
        nowSec,
        { query_id: `qid_${Date.now()}` }
      );
      const tampered = validRaw.replace(String(tgUserId), String(tgUserId + 1));
      const forgedRes = await app.request("/api/v1/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tampered }),
      });
      expect(forgedRes.status).toBe(401);

      // 2. Expired auth_date -> 401 AUTH_DATA_EXPIRED
      const expiredRaw = signTelegramInitData(
        botToken,
        { id: tgUserId, first_name: "TMA" },
        nowSec - 600
      );
      const expiredRes = await app.request("/api/v1/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: expiredRaw }),
      });
      expect(expiredRes.status).toBe(401);

      // 3. Valid initData succeeds and returns tma_bearer session token
      const okRes = await app.request("/api/v1/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: validRaw }),
      });
      expect(okRes.status).toBe(200);
      const okJson = (await okRes.json()) as {
        data: { sessionToken: string; userId: string };
      };
      expect(okJson.data.sessionToken.length).toBeGreaterThan(20);

      // 4. Replaying the exact same initData string is blocked (401 INIT_DATA_REPLAYED)
      const replayRes = await app.request("/api/v1/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: validRaw }),
      });
      expect(replayRes.status).toBe(401);
      const replayJson = (await replayRes.json()) as {
        error: { code: string };
      };
      expect(replayJson.error.code).toBe("INIT_DATA_REPLAYED");
    });

    it("unifies Google Web & Telegram Mini App into one user, posts, bookmarks, DMs & notifications, and verifies /start bot flow", async () => {
      // 1. Register user via Google on Web
      const webUser = await loginOrRegisterWithGoogle({
        sub: `unified-google-${Date.now()}`,
        email: `unified_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Unified Web+TMA",
      });
      const partner = await loginOrRegisterWithGoogle({
        sub: `unified-partner-${Date.now()}`,
        email: `partner_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Partner User",
      });

      // 2. Web user explicitly consents to link Telegram -> generates one-time deepLink
      const initLinkRes = await app.request("/api/v1/auth/link/telegram/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webUser.sessionToken}`,
        },
        body: JSON.stringify({ consentAccepted: true }),
      });
      expect(initLinkRes.status).toBe(200);
      const initJson = (await initLinkRes.json()) as {
        data: { linkToken: string; deepLink: string };
      };
      expect(initJson.data.deepLink).toContain(
        `https://t.me/averouz_bot/app?startapp=link_${initJson.data.linkToken}`
      );

      // 3. Inside Telegram Mini App, confirm link using verified initData -> returns tma_bearer token for SAME userId
      const tgUid = Math.floor(400_000_000 + Math.random() * 400_000_000);
      const nowSec = Math.floor(Date.now() / 1000);
      const linkInitData = signTelegramInitData(
        botToken,
        { id: tgUid, first_name: "Unified", username: "unified_tg" },
        nowSec,
        { start_param: `link_${initJson.data.linkToken}` }
      );

      const confirmRes = await app.request(
        "/api/v1/auth/link/telegram/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData: linkInitData,
            linkToken: initJson.data.linkToken,
          }),
        }
      );
      expect(confirmRes.status).toBe(200);
      const confirmJson = (await confirmRes.json()) as {
        data: { linked: boolean; userId: string; sessionToken: string };
      };
      expect(confirmJson.data.linked).toBe(true);
      expect(confirmJson.data.userId).toBe(webUser.userId);
      const tmaToken = confirmJson.data.sessionToken;

      // 4. Web creates a post -> TMA reads the same post, bookmarks it, comments, and sends DM -> Web sees identical state
      const createPostRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webUser.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "thought",
          body: "Web va Telegram Mini App bitta backendda!",
        }),
      });
      expect(createPostRes.status).toBe(201);
      const postId = ((await createPostRes.json()) as { data: { post: { id: string } } }).data.post.id;

      // TMA likes & bookmarks that post
      expect(
        (
          await app.request(`/api/v1/posts/${postId}/like/toggle`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tmaToken}` },
          })
        ).status
      ).toBe(200);
      expect(
        (
          await app.request(`/api/v1/posts/${postId}/bookmark`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tmaToken}` },
          })
        ).status
      ).toBe(200);

      // TMA sends DM to partner -> Web sees the exact same DM thread
      const dmRes = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tmaToken}`,
        },
        body: JSON.stringify({
          recipientId: partner.userId,
          body: "Mini Appdan salom!",
        }),
      });
      expect(dmRes.status).toBe(201);

      const webBookmarks = (await (
        await app.request("/api/v1/bookmarks", {
          headers: { Authorization: `Bearer ${webUser.sessionToken}` },
        })
      ).json()) as { data: { posts: Array<{ id: string; likedByMe: boolean }> } };
      expect(webBookmarks.data.posts[0]?.id).toBe(postId);
      expect(webBookmarks.data.posts[0]?.likedByMe).toBe(true);

      const webThreads = (await (
        await app.request("/api/v1/messages/threads", {
          headers: { Authorization: `Bearer ${webUser.sessionToken}` },
        })
      ).json()) as {
        data: { threads: Array<{ messages: Array<{ body: string }> }> };
      };
      expect(webThreads.data.threads[0]?.messages[0]?.body).toBe(
        "Mini Appdan salom!"
      );

      // 5. Telegram Bot /start webhook sends ONE Mini App Open button + Consent buttons (anti-spam cooldown prevents duplicate spam)
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true }), { status: 200 })
        );

      try {
        const start1 = await app.request("/api/v1/telegram/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-bot-api-secret-token": "tma-webhook-secret",
          },
          body: JSON.stringify({
            message: {
              text: "/start",
              from: { id: tgUid },
              chat: { id: tgUid },
            },
          }),
        });
        expect(start1.status).toBe(200);

        // Immediate duplicate /start -> anti-spam suppresses duplicate bot reply
        await app.request("/api/v1/telegram/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-bot-api-secret-token": "tma-webhook-secret",
          },
          body: JSON.stringify({
            message: {
              text: "/start",
              from: { id: tgUid },
              chat: { id: tgUid },
            },
          }),
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const startPayload = String(
          (fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body ?? ""
        );
        expect(startPayload).toContain("Avero Mini Appni ochish");
        expect(startPayload).toContain("notif_consent:yes");

        // User taps Consent inline button -> enables Telegram notifications & answers callback query
        const consentCb = await app.request("/api/v1/telegram/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-bot-api-secret-token": "tma-webhook-secret",
          },
          body: JSON.stringify({
            callback_query: {
              id: "cb_12345",
              data: "notif_consent:yes",
              from: { id: tgUid },
            },
          }),
        });
        expect(consentCb.status).toBe(200);

        const meRes = (await (
          await app.request("/api/v1/auth/me", {
            headers: { Authorization: `Bearer ${tmaToken}` },
          })
        ).json()) as {
          data: {
            settings: {
              telegramBotStarted: boolean;
              telegramNotifications: boolean;
            };
          };
        };
        expect(meRes.data.settings.telegramBotStarted).toBe(true);
        expect(meRes.data.settings.telegramNotifications).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  }
);
