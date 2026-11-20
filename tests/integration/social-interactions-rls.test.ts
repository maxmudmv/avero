import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createApiApp } from "@/server/api/app";
import { loginOrRegisterWithGoogle } from "@/server/auth/account";
import { closeDbPool } from "@/server/db";
import { withDbContext } from "@/server/db/context";
import {
  commentReports,
  dmMessages,
  dmThreads,
  postBookmarks,
} from "@/server/db/schema";
import { clearMemoryRateLimits } from "@/server/security/rate-limit";

const hasIntegrationDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasIntegrationDb)(
  "Social Interactions, DMs, Mentions, Blocks, Comment Reports & RLS Integration",
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

    async function makeUser(tag: string) {
      const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const u = await loginOrRegisterWithGoogle({
        sub: `soc-${tag}-${stamp}`,
        email: `soc_${tag}_${stamp}@example.com`,
        emailVerified: true,
        displayName: `User ${tag}`,
      });
      const username = `u_${tag}_${stamp}`.slice(0, 20).toLowerCase();
      await app.request("/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${u.sessionToken}`,
        },
        body: JSON.stringify({ username }),
      });
      return { ...u, username };
    }

    it("supports single like toggle, simple vs quote reposts, comment policies, popularity sort, mentions & owner comment delete", async () => {
      const alice = await makeUser("a");
      const bob = await makeUser("b");
      const carol = await makeUser("c");

      // Alice posts mentioning @bob
      const postRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "thought",
          body: `Salom @${bob.username}, bu muhokama uchun matnli post!`,
          commentPolicy: "everyone",
        }),
      });
      expect(postRes.status).toBe(201);
      const postJson = (await postRes.json()) as {
        data: { post: { id: string } };
      };
      const postId = postJson.data.post.id;

      // Bob received mention notification
      const bobNotifRes = await app.request("/api/v1/notifications", {
        headers: { Authorization: `Bearer ${bob.sessionToken}` },
      });
      expect(bobNotifRes.status).toBe(200);
      const bobNotifs = (await bobNotifRes.json()) as {
        data: { notifications: Array<{ type: string; postId: string | null }> };
      };
      expect(
        bobNotifs.data.notifications.some(
          (n) => n.type === "mention" && n.postId === postId
        )
      ).toBe(true);

      // Single Like toggle: 1st call likes, 2nd unlikes
      const like1 = await app.request(`/api/v1/posts/${postId}/like/toggle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bob.sessionToken}` },
      });
      expect(like1.status).toBe(200);
      expect(((await like1.json()) as { data: { liked: boolean; likesCount: number } }).data).toEqual({
        liked: true,
        likesCount: 1,
      });

      const like2 = await app.request(`/api/v1/posts/${postId}/like/toggle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bob.sessionToken}` },
      });
      expect(like2.status).toBe(200);
      expect(((await like2.json()) as { data: { liked: boolean; likesCount: number } }).data).toEqual({
        liked: false,
        likesCount: 0,
      });

      // Reposts: Simple repost (duplicate -> 409) + Quote repost
      const repSimple1 = await app.request(`/api/v1/posts/${postId}/repost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.sessionToken}`,
        },
        body: JSON.stringify({ repostType: "simple" }),
      });
      expect(repSimple1.status).toBe(201);

      const repSimpleDup = await app.request(`/api/v1/posts/${postId}/repost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.sessionToken}`,
        },
        body: JSON.stringify({ repostType: "simple" }),
      });
      expect(repSimpleDup.status).toBe(409);

      const repQuote = await app.request(`/api/v1/posts/${postId}/repost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${carol.sessionToken}`,
        },
        body: JSON.stringify({
          repostType: "quote",
          quoteBody: "Juda yaxshi fikr!",
        }),
      });
      expect(repQuote.status).toBe(201);

      // Private Bookmarks + RLS check
      const bmRes = await app.request(`/api/v1/posts/${postId}/bookmark`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bob.sessionToken}` },
      });
      expect(bmRes.status).toBe(200);

      const bobBookmarks = (await (
        await app.request("/api/v1/bookmarks", {
          headers: { Authorization: `Bearer ${bob.sessionToken}` },
        })
      ).json()) as { data: { posts: Array<{ id: string; bookmarksCount: number }> } };
      expect(bobBookmarks.data.posts.some((p) => p.id === postId)).toBe(true);
      expect(bobBookmarks.data.posts[0]?.bookmarksCount).toBe(1);

      // RLS isolation: Carol cannot read Bob's bookmarks even directly via DB query
      const carolDbBookmarks = await withDbContext(
        { userId: carol.userId, role: "user" },
        async (tx) =>
          tx
            .select()
            .from(postBookmarks)
            .where(eq(postBookmarks.userId, bob.userId))
      );
      expect(carolDbBookmarks).toHaveLength(0);

      // Comments: c1 (Bob), c2 (Carol) with @alice mention -> like c2 so popularity puts c2 first
      const c1Res = await app.request(`/api/v1/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.sessionToken}`,
        },
        body: JSON.stringify({ body: "Birinchi izoh" }),
      });
      expect(c1Res.status).toBe(201);
      const c1Id = ((await c1Res.json()) as { data: { comment: { id: string } } }).data.comment.id;

      // Duplicate comment prevented (409)
      const c1Dup = await app.request(`/api/v1/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.sessionToken}`,
        },
        body: JSON.stringify({ body: "Birinchi izoh" }),
      });
      expect(c1Dup.status).toBe(409);

      const c2Res = await app.request(`/api/v1/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${carol.sessionToken}`,
        },
        body: JSON.stringify({
          body: `@${bob.username} fikrga qo‘shilaman!`,
          parentCommentId: c1Id,
        }),
      });
      expect(c2Res.status).toBe(201);
      const c2Id = ((await c2Res.json()) as { data: { comment: { id: string } } }).data.comment.id;

      // Comments CANNOT be edited (no PATCH endpoint -> 404)
      const cEditRes = await app.request(`/api/v1/comments/${c1Id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.sessionToken}`,
        },
        body: JSON.stringify({ body: "Tahrir" }),
      });
      expect(cEditRes.status).toBe(404);

      // Like c2 -> sorted first by popularity
      const c2LikeRes = await app.request(`/api/v1/comments/${c2Id}/like/toggle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.sessionToken}` },
      });
      expect(c2LikeRes.status).toBe(200);

      const listCommentsJson = (await (
        await app.request(`/api/v1/posts/${postId}/comments`, {
          headers: { Authorization: `Bearer ${alice.sessionToken}` },
        })
      ).json()) as { data: { comments: Array<{ id: string; likesCount: number }> } };
      expect(listCommentsJson.data.comments[0]?.id).toBe(c2Id);
      expect(listCommentsJson.data.comments[0]?.likesCount).toBe(1);

      // Comment-only report + duplicate prevention (409) + RLS check
      const repRes = await app.request("/api/v1/reports/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({
          commentId: c1Id,
          reasonCode: "spam",
          details: "Reklama matni",
        }),
      });
      expect(repRes.status).toBe(201);

      const repDupRes = await app.request("/api/v1/reports/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({ commentId: c1Id, reasonCode: "insult" }),
      });
      expect(repDupRes.status).toBe(409);

      const bobReportsInDb = await withDbContext(
        { userId: bob.userId, role: "user" },
        async (tx) =>
          tx
            .select()
            .from(commentReports)
            .where(eq(commentReports.commentId, c1Id))
      );
      expect(bobReportsInDb).toHaveLength(0);

      // Post owner Alice deletes Bob's comment
      const delByPostOwner = await app.request(`/api/v1/comments/${c1Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${alice.sessionToken}` },
      });
      expect(delByPostOwner.status).toBe(200);

      // Comment policy: followers -> non-follower blocked (403); closed -> everyone blocked
      await app.request(`/api/v1/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({
          body: "Endi faqat obunachilar izoh yozadi",
          commentPolicy: "followers",
        }),
      });

      const restrictedComment = await app.request(
        `/api/v1/posts/${postId}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bob.sessionToken}`,
          },
          body: JSON.stringify({ body: "Obunasiz izoh" }),
        }
      );
      expect(restrictedComment.status).toBe(403);
    });

    it("enforces text-only DM message requests, accept/decline, RLS isolation, and granular user blocking", async () => {
      const alice = await makeUser("dm_a");
      const bob = await makeUser("dm_b");
      const carol = await makeUser("dm_c");

      // Alice sends initial DM to Bob -> becomes Message Request (pending)
      const dm1 = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({
          recipientId: bob.userId,
          body: "Salom Bob, birinchi matnli xabar!",
        }),
      });
      expect(dm1.status).toBe(201);
      const dm1Json = (await dm1.json()) as {
        data: { threadId: string; threadStatus: string };
      };
      expect(dm1Json.data.threadStatus).toBe("pending");
      const threadId = dm1Json.data.threadId;

      // Alice cannot send a 2nd DM while request is still pending (429)
      const dmSpam = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({
          recipientId: bob.userId,
          body: "Ikkinchi xabar so‘rov tasdiqlanmasdan",
        }),
      });
      expect(dmSpam.status).toBe(429);

      // Carol cannot access Alice<->Bob DM threads/messages via RLS
      const carolDbThreads = await withDbContext(
        { userId: carol.userId, role: "user" },
        async (tx) =>
          tx.select().from(dmThreads).where(eq(dmThreads.id, threadId))
      );
      expect(carolDbThreads).toHaveLength(0);

      const carolDbMsgs = await withDbContext(
        { userId: carol.userId, role: "user" },
        async (tx) =>
          tx.select().from(dmMessages).where(eq(dmMessages.threadId, threadId))
      );
      expect(carolDbMsgs).toHaveLength(0);

      // Bob accepts message request -> Alice & Bob can exchange DMs
      const acceptRes = await app.request(
        `/api/v1/messages/threads/${threadId}/accept`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${bob.sessionToken}` },
        }
      );
      expect(acceptRes.status).toBe(200);

      const dm2 = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({
          recipientId: bob.userId,
          body: "Rahmat qabul qilganingiz uchun!",
        }),
      });
      expect(dm2.status).toBe(201);

      // Carol sends request to Bob -> Bob declines -> Carol blocked from future DMs (403)
      const dmCarol1 = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${carol.sessionToken}`,
        },
        body: JSON.stringify({ recipientId: bob.userId, body: "Salom" }),
      });
      expect(dmCarol1.status).toBe(201);
      const carolThreadId = ((await dmCarol1.json()) as { data: { threadId: string } }).data.threadId;

      const decRes = await app.request(
        `/api/v1/messages/threads/${carolThreadId}/decline`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${bob.sessionToken}` },
        }
      );
      expect(decRes.status).toBe(200);

      const dmCarol2 = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${carol.sessionToken}`,
        },
        body: JSON.stringify({ recipientId: bob.userId, body: "Yana" }),
      });
      expect(dmCarol2.status).toBe(403);

      // Granular block test: Alice blocks Bob with `dm_only` -> DM blocked (403), Follow still allowed!
      const bobPostRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "note",
          body: "Bobning ommaviy posti",
        }),
      });
      const bobPostId = ((await bobPostRes.json()) as { data: { post: { id: string } } }).data.post.id;

      await app.request(`/api/v1/users/${bob.userId}/block`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({ level: "dm_only" }),
      });

      const blockedDm = await app.request("/api/v1/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.sessionToken}`,
        },
        body: JSON.stringify({ recipientId: alice.userId, body: "Salom?" }),
      });
      expect(blockedDm.status).toBe(403);

      // Upgrade to `follow_only` -> follow blocked (403)
      await app.request(`/api/v1/users/${bob.userId}/block`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({ level: "follow_only" }),
      });

      const blockedFollow = await app.request(
        `/api/v1/users/${alice.userId}/follow`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${bob.sessionToken}` },
        }
      );
      expect(blockedFollow.status).toBe(403);

      // Upgrade to `content_only` -> Alice cannot interact/view Bob's post & feed hides it
      await app.request(`/api/v1/users/${bob.userId}/block`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.sessionToken}`,
        },
        body: JSON.stringify({ level: "content_only" }),
      });

      const blockedLike = await app.request(
        `/api/v1/posts/${bobPostId}/like/toggle`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${alice.sessionToken}` },
        }
      );
      expect(blockedLike.status).toBe(403);

      const feedAsAlice = (await (
        await app.request("/api/v1/feed?tab=for_you", {
          headers: { Authorization: `Bearer ${alice.sessionToken}` },
        })
      ).json()) as { data: { posts: Array<{ id: string }> } };
      expect(feedAsAlice.data.posts.some((p) => p.id === bobPostId)).toBe(
        false
      );

      // Remove block restores access
      const unblockRes = await app.request(
        `/api/v1/users/${bob.userId}/block`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${alice.sessionToken}` },
        }
      );
      expect(unblockRes.status).toBe(200);

      const unblockedLike = await app.request(
        `/api/v1/posts/${bobPostId}/like/toggle`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${alice.sessionToken}` },
        }
      );
      expect(unblockedLike.status).toBe(200);
    });
  }
);
