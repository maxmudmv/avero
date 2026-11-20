import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createApiApp } from "@/server/api/app";
import { loginOrRegisterWithGoogle } from "@/server/auth/account";
import { closeDbPool } from "@/server/db";
import { withDbContext } from "@/server/db/context";
import { userActivity } from "@/server/db/schema";
import { clearMemoryRateLimits } from "@/server/security/rate-limit";

const hasIntegrationDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasIntegrationDb)(
  "Profile, 30 Avatars, 3-Day Activity, Privacy & Follow Requests Integration",
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
      resetEnvCacheForTests();
      app = createApiApp();
    });

    beforeEach(() => {
      clearMemoryRateLimits();
    });

    afterAll(async () => {
      await closeDbPool();
    });

    it("enforces username rules, suggestions, repeated displayNames, bio/links, and avatar unlock guard", async () => {
      const user1 = await loginOrRegisterWithGoogle({
        sub: `prof-u1-${Date.now()}`,
        email: `profu1_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Shared Display Name",
      });
      const user2 = await loginOrRegisterWithGoogle({
        sub: `prof-u2-${Date.now()}`,
        email: `profu2_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Shared Display Name",
      });

      // Automatic username suggestions
      const sugRes = await app.request(
        "/api/v1/account/username-suggestions?q=dilshod"
      );
      expect(sugRes.status).toBe(200);
      const sugJson = (await sugRes.json()) as {
        data: { suggestions: string[] };
      };
      expect(sugJson.data.suggestions.length).toBeGreaterThan(0);

      // Update username with dot + underscore, bio, externalLinks, starter avatar av_02
      const uniqueHandle = `aziz.dev_${String(Date.now()).slice(-5)}`;
      const patchRes = await app.request("/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1.sessionToken}`,
        },
        body: JSON.stringify({
          username: uniqueHandle,
          displayName: "Shared Display Name",
          bio: "Minimalist matn yozuvchisi.",
          avatarId: "av_02",
          externalLinks: [
            { label: "Blog", url: "https://example.com/blog" },
            { label: "Telegram", url: "https://t.me/avero_uz" },
          ],
        }),
      });
      expect(patchRes.status).toBe(200);

      // Duplicate username rejected with 409; repeated displayName is fine
      const dupRes = await app.request("/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user2.sessionToken}`,
        },
        body: JSON.stringify({
          username: uniqueHandle,
          displayName: "Shared Display Name",
        }),
      });
      expect(dupRes.status).toBe(409);

      // Locked avatar (av_10) rejected with 403
      const lockedAvatarRes = await app.request("/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1.sessionToken}`,
        },
        body: JSON.stringify({ avatarId: "av_10" }),
      });
      expect(lockedAvatarRes.status).toBe(403);
    });

    it("keeps activity stats strictly private to owner and updates 3-day cadence on post", async () => {
      const owner = await loginOrRegisterWithGoogle({
        sub: `act-owner-${Date.now()}`,
        email: `actowner_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Active Writer",
      });
      const viewer = await loginOrRegisterWithGoogle({
        sub: `act-viewer-${Date.now()}`,
        email: `actviewer_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Curious Viewer",
      });

      // Publish a post -> increments 3-day activity cycle
      const postRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${owner.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "note",
          body: "3 kunlik faollik uchun yangi post.",
        }),
      });
      expect(postRes.status).toBe(201);

      const dashRes = await app.request("/api/v1/account/profile-dashboard", {
        headers: { Authorization: `Bearer ${owner.sessionToken}` },
      });
      expect(dashRes.status).toBe(200);
      const dashJson = (await dashRes.json()) as {
        data: {
          profile: { username: string };
          activity: {
            activeThreeDayCycles: number;
            withinThreeDayCadence: boolean;
            unlockedAvatars: string[];
          };
        };
      };
      expect(dashJson.data.activity.activeThreeDayCycles).toBe(1);
      expect(dashJson.data.activity.withinThreeDayCadence).toBe(true);
      expect(dashJson.data.activity.unlockedAvatars.length).toBeGreaterThanOrEqual(8);

      // Viewer cannot query owner's user_activity under RLS
      const leaked = await withDbContext(
        { userId: viewer.userId, role: "user" },
        async (tx) =>
          tx
            .select()
            .from(userActivity)
            .where(eq(userActivity.userId, owner.userId))
      );
      expect(leaked).toHaveLength(0);

      // Public profile endpoint shows posts and profile, NEVER activity stats
      const pubRes = await app.request(
        `/api/v1/users/${dashJson.data.profile.username}`,
        { headers: { Authorization: `Bearer ${viewer.sessionToken}` } }
      );
      expect(pubRes.status).toBe(200);
      const pubJson = (await pubRes.json()) as {
        data: Record<string, unknown> & {
          profile: { posts: Array<{ body: string }> };
        };
      };
      expect(pubJson.data.activity).toBeUndefined();
      expect(pubJson.data.profile.posts).toHaveLength(1);
    });

    it("supports private follow requests (accept/decline) while keeping profile & posts public, and online toggle", async () => {
      const target = await loginOrRegisterWithGoogle({
        sub: `priv-target-${Date.now()}`,
        email: `privtarget_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Private Follow Target",
      });
      const follower1 = await loginOrRegisterWithGoogle({
        sub: `priv-f1-${Date.now()}`,
        email: `privf1_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Follower One",
      });
      const follower2 = await loginOrRegisterWithGoogle({
        sub: `priv-f2-${Date.now()}`,
        email: `privf2_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Follower Two",
      });

      // Set private follow mode and turn off online status
      const setRes = await app.request("/api/v1/account/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${target.sessionToken}`,
        },
        body: JSON.stringify({
          privacyLevel: "private",
          autoApproveFollows: false,
          showOnlineStatus: false,
        }),
      });
      expect(setRes.status).toBe(200);

      const targetPost = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${target.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "thought",
          body: "Private kuzatuv rejimi yoqilgan, lekin post ommaviy.",
        }),
      });
      expect(targetPost.status).toBe(201);

      const targetMe = await app.request("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${target.sessionToken}` },
      });
      const targetMeJson = (await targetMe.json()) as {
        data: { profile: { username: string } };
      };
      const targetUsername = targetMeJson.data.profile.username;

      // Follower1 can still view target's public profile & post, and online is false
      const pubView = await app.request(`/api/v1/users/${targetUsername}`, {
        headers: { Authorization: `Bearer ${follower1.sessionToken}` },
      });
      expect(pubView.status).toBe(200);
      const pubViewJson = (await pubView.json()) as {
        data: { profile: { online: boolean; posts: unknown[] } };
      };
      expect(pubViewJson.data.profile.online).toBe(false);
      expect(pubViewJson.data.profile.posts).toHaveLength(1);

      // Follow creates a pending follow_request instead of immediate follow
      const req1 = await app.request(`/api/v1/users/${target.userId}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${follower1.sessionToken}` },
      });
      expect(req1.status).toBe(200);
      const req1Json = (await req1.json()) as {
        data: { following: boolean; status: string };
      };
      expect(req1Json.data.following).toBe(false);
      expect(req1Json.data.status).toBe("requested");

      const req2 = await app.request(`/api/v1/users/${target.userId}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${follower2.sessionToken}` },
      });
      expect(req2.status).toBe(200);

      // Target lists incoming requests
      const listRes = await app.request("/api/v1/account/follow-requests", {
        headers: { Authorization: `Bearer ${target.sessionToken}` },
      });
      const listJson = (await listRes.json()) as {
        data: { requests: Array<{ id: string; requesterId: string }> };
      };
      expect(listJson.data.requests).toHaveLength(2);

      const f1Req = listJson.data.requests.find(
        (r) => r.requesterId === follower1.userId
      )!;
      const f2Req = listJson.data.requests.find(
        (r) => r.requesterId === follower2.userId
      )!;

      // Accept follower1, decline follower2
      const acc = await app.request(
        `/api/v1/account/follow-requests/${f1Req.id}/accept`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${target.sessionToken}` },
        }
      );
      expect(acc.status).toBe(200);

      const dec = await app.request(
        `/api/v1/account/follow-requests/${f2Req.id}/decline`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${target.sessionToken}` },
        }
      );
      expect(dec.status).toBe(200);

      // Verify followersCount === 1 and follower1 sees status === 'following'
      const afterView = await app.request(`/api/v1/users/${targetUsername}`, {
        headers: { Authorization: `Bearer ${follower1.sessionToken}` },
      });
      const afterJson = (await afterView.json()) as {
        data: {
          profile: { followersCount: number; followStatus: string };
        };
      };
      expect(afterJson.data.profile.followersCount).toBe(1);
      expect(afterJson.data.profile.followStatus).toBe("following");
    });
  }
);
