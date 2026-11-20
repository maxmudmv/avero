import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createApiApp } from "@/server/api/app";
import { loginOrRegisterWithGoogle } from "@/server/auth/account";
import { createUserSession } from "@/server/auth/session";
import { closeDbPool } from "@/server/db";
import { withDbContext } from "@/server/db/context";
import { users } from "@/server/db/schema";
import { clearMemoryRateLimits } from "@/server/security/rate-limit";

const hasIntegrationDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasIntegrationDb)(
  "Full Security & QA Audit Suite (CSRF, SQLi, IDOR, Rate Limit, Muted Enforcement, Pagination)",
  () => {
    let app: ReturnType<typeof createApiApp>;

    beforeAll(() => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_SSL = "false";
      process.env.APP_URL = "http://localhost:3000";
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      process.env.AUTH_SESSION_SECRET =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.AUDIT_IP_SALT = "fedcba9876543210fedcba9876543210";
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

    it("blocks cross-site CSRF origins, form/media uploads, oversized payloads, and attaches security headers", async () => {
      const user = await loginOrRegisterWithGoogle({
        sub: `sec-csrf-${Date.now()}`,
        email: `csrf_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Sec User",
      });

      // Cross-site Origin on state-changing POST -> 403 CSRF_ORIGIN_MISMATCH
      const csrfRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.attacker.example",
          Authorization: `Bearer ${user.sessionToken}`,
        },
        body: JSON.stringify({ postType: "note", body: "CSRF test" }),
      });
      expect(csrfRes.status).toBe(403);
      expect(csrfRes.headers.get("x-content-type-options")).toBe("nosniff");
      expect(csrfRes.headers.get("x-frame-options")).toBe("DENY");
      expect(csrfRes.headers.get("x-request-id")).toBeTruthy();

      // Same-origin passes CSRF guard
      const sameOriginRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          Authorization: `Bearer ${user.sessionToken}`,
        },
        body: JSON.stringify({ postType: "note", body: "Legit same origin" }),
      });
      expect(sameOriginRes.status).toBe(201);

      // Form-urlencoded & image uploads blocked with 415 even without Content-Length
      const formRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${user.sessionToken}`,
        },
        body: "body=hello",
      });
      expect(formRes.status).toBe(415);

      const imgRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          Authorization: `Bearer ${user.sessionToken}`,
        },
        body: "fake-binary",
      });
      expect(imgRes.status).toBe(415);

      // Oversized payload (> 16KB) rejected with 413
      const bigBody = JSON.stringify({
        postType: "note",
        body: "x".repeat(20_000),
      });
      const bigRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(bigBody)),
          Authorization: `Bearer ${user.sessionToken}`,
        },
        body: bigBody,
      });
      expect(bigRes.status).toBe(413);
    });

    it("prevents IDOR, SQL injection, client userId spoofing, and enforces muted restrictions while preserving appeals", async () => {
      const victim = await loginOrRegisterWithGoogle({
        sub: `sec-victim-${Date.now()}`,
        email: `victim_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Victim",
      });
      const attacker = await loginOrRegisterWithGoogle({
        sub: `sec-attacker-${Date.now()}`,
        email: `attacker_qa_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Attacker",
      });
      const modBase = await loginOrRegisterWithGoogle({
        sub: `sec-mod-${Date.now()}`,
        email: `mod_qa_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Mod QA",
      });
      const modSession = await withDbContext({ authFlow: true }, async (tx) => {
        await tx
          .update(users)
          .set({ role: "moderator" })
          .where(eq(users.id, modBase.userId));
        return createUserSession(tx, {
          userId: modBase.userId,
          authChannel: "web_cookie",
          provider: "google",
        });
      });

      // Victim creates post and private draft
      const vPostRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${victim.sessionToken}`,
        },
        body: JSON.stringify({ postType: "note", body: "Victim post" }),
      });
      const vPostId = ((await vPostRes.json()) as { data: { post: { id: string } } }).data.post.id;

      const vDraftRes = await app.request("/api/v1/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${victim.sessionToken}`,
        },
        body: JSON.stringify({ postType: "note", body: "Secret draft" }),
      });
      const vDraftId = ((await vDraftRes.json()) as { data: { draft: { id: string } } }).data.draft.id;

      // IDOR: Attacker tries to edit/delete victim's post & draft with spoofed headers/body
      const spoofedEdit = await app.request(`/api/v1/posts/${vPostId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": victim.userId,
          Authorization: `Bearer ${attacker.sessionToken}`,
        },
        body: JSON.stringify({
          authorId: victim.userId,
          body: "Hacked!",
        }),
      });
      expect(spoofedEdit.status).toBe(403);

      const spoofedDraftDel = await app.request(`/api/v1/drafts/${vDraftId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${attacker.sessionToken}` },
      });
      expect(spoofedDraftDel.status).toBe(404);

      // SQL injection payload in search & profile lookup is parameterized safely
      const sqliSearch = await app.request(
        `/api/v1/search?q=${encodeURIComponent("' OR 1=1; DROP TABLE posts; --")}`
      );
      expect(sqliSearch.status).toBe(200);

      // Still intact: victim's post exists
      expect((await app.request(`/api/v1/posts/${vPostId}`)).status).toBe(200);

      // Moderator mutes attacker -> attacker blocked (403 ACCOUNT_MUTED) on post/comment/DM, but CAN submit appeal!
      const muteRes = await app.request(
        `/api/v1/admin/users/${attacker.userId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${modSession.sessionToken}`,
          },
          body: JSON.stringify({
            action: "mute",
            reason: "Qoidabuzarlik uchun 6 soat mute",
            durationHours: 6,
            humanConfirmed: true,
          }),
        }
      );
      expect(muteRes.status).toBe(200);

      const mutedPost = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${attacker.sessionToken}`,
        },
        body: JSON.stringify({ postType: "note", body: "Muted post attempt" }),
      });
      expect(mutedPost.status).toBe(403);
      expect(((await mutedPost.json()) as { error: { code: string } }).error.code).toBe(
        "ACCOUNT_MUTED"
      );

      const mutedDm = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${attacker.sessionToken}`,
        },
        body: JSON.stringify({ recipientId: victim.userId, body: "Hi" }),
      });
      expect(mutedDm.status).toBe(403);

      // Muted user CAN still submit an appeal
      const appealRes = await app.request("/api/v1/moderation/appeals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${attacker.sessionToken}`,
        },
        body: JSON.stringify({
          actionType: "mute",
          reason: "Mute cheklovini qayta ko‘rib chiqishingizni so‘rayman.",
        }),
      });
      expect(appealRes.status).toBe(201);
    });

    it("enforces cursor pagination on feed and sliding-window rate limiting", async () => {
      const author = await loginOrRegisterWithGoogle({
        sub: `sec-pag-${Date.now()}`,
        email: `pag_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Paginator",
      });

      const createdIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await app.request("/api/v1/posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${author.sessionToken}`,
          },
          body: JSON.stringify({
            postType: "note",
            body: `Pagination post #${i + 1}`,
          }),
        });
        expect(res.status).toBe(201);
        createdIds.push(
          ((await res.json()) as { data: { post: { id: string } } }).data.post.id
        );
        await new Promise((r) => setTimeout(r, 15));
      }

      const page1 = (await (
        await app.request("/api/v1/feed?tab=for_you&limit=2")
      ).json()) as {
        data: { posts: Array<{ id: string }>; nextCursor: string | null };
      };
      expect(page1.data.posts).toHaveLength(2);
      expect(page1.data.nextCursor).toBeTruthy();

      const page2 = (await (
        await app.request(
          `/api/v1/feed?tab=for_you&limit=2&cursor=${encodeURIComponent(page1.data.nextCursor!)}`
        )
      ).json()) as {
        data: { posts: Array<{ id: string }> };
      };
      expect(page2.data.posts.length).toBeGreaterThan(0);
      const page1Ids = new Set(page1.data.posts.map((p) => p.id));
      for (const p of page2.data.posts) {
        expect(page1Ids.has(p.id)).toBe(false);
      }

      // Rate limiting check on AUTH_FLOW (limit = 20 / 60s)
      clearMemoryRateLimits();
      let hit429 = false;
      for (let i = 0; i < 25; i++) {
        const r = await app.request("/api/v1/auth/telegram", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "198.51.100.42",
          },
          body: JSON.stringify({ initData: "short" }),
        });
        if (r.status === 429) {
          hit429 = true;
          expect(r.headers.get("retry-after")).toBeTruthy();
          break;
        }
      }
      expect(hit429).toBe(true);
    });
  }
);
