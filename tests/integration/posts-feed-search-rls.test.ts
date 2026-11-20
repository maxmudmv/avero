import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createApiApp } from "@/server/api/app";
import { loginOrRegisterWithGoogle } from "@/server/auth/account";
import { closeDbPool } from "@/server/db";
import { withDbContext } from "@/server/db/context";
import { postDrafts } from "@/server/db/schema";
import { clearMemoryRateLimits } from "@/server/security/rate-limit";

const hasIntegrationDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasIntegrationDb)(
  "Posts, Drafts, Hashtags, Configurable Limits, Feeds, Search & Views Integration",
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

    it("supports post types, CSS styleConfig, max 3 hashtags, edit (latest only), and hard delete", async () => {
      const author = await loginOrRegisterWithGoogle({
        sub: `post-author-${Date.now()}`,
        email: `postauthor_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Poet Author",
      });
      const otherUser = await loginOrRegisterWithGoogle({
        sub: `other-user-${Date.now()}`,
        email: `otheruser_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Reader User",
      });

      // Reject >3 hashtags
      const tooManyTagsRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${author.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "poem",
          body: "She'r matni",
          hashtags: ["bir", "ikki", "uch", "tort"],
        }),
      });
      expect(tooManyTagsRes.status).toBe(400);

      // Create poem with Advanced CSS style + 2 hashtags
      const createRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${author.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "poem",
          body: "Yangi tong otdi shaffof osmon ostida.",
          styleConfig: {
            editorMode: "advanced",
            templateId: "poetic_center",
            fontFamily: "serif",
            textColor: "pearl",
            bgStyle: "aurora",
            isItalic: true,
            textAlign: "center",
          },
          hashtags: ["Tong", "Sheriyat"],
        }),
      });
      expect(createRes.status).toBe(201);
      const createdJson = (await createRes.json()) as {
        data: { post: { id: string; hashtags: string[]; isEdited: boolean } };
      };
      const postId = createdJson.data.post.id;
      expect(createdJson.data.post.hashtags.sort()).toEqual(["sheriyat", "tong"]);
      expect(createdJson.data.post.isEdited).toBe(false);

      // Other user cannot edit or delete
      const forbiddenEdit = await app.request(`/api/v1/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherUser.sessionToken}`,
        },
        body: JSON.stringify({ body: "Buzilgan matn" }),
      });
      expect(forbiddenEdit.status).toBe(403);

      // Owner edits post anytime (latest version kept)
      const editRes = await app.request(`/api/v1/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${author.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "quote",
          body: "Tahrirlangan oxirgi versiya.",
          hashtags: ["iqtibos"],
        }),
      });
      expect(editRes.status).toBe(200);
      const editedJson = (await editRes.json()) as {
        data: {
          post: {
            body: string;
            postType: string;
            isEdited: boolean;
            hashtags: string[];
          };
        };
      };
      expect(editedJson.data.post.body).toBe("Tahrirlangan oxirgi versiya.");
      expect(editedJson.data.post.postType).toBe("quote");
      expect(editedJson.data.post.isEdited).toBe(true);
      expect(editedJson.data.post.hashtags).toEqual(["iqtibos"]);

      // Permanent hard delete
      const deleteRes = await app.request(`/api/v1/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${author.sessionToken}` },
      });
      expect(deleteRes.status).toBe(200);

      const getAfterDelete = await app.request(`/api/v1/posts/${postId}`);
      expect(getAfterDelete.status).toBe(404);
    });

    it("enforces strictly private drafts via PostgreSQL RLS", async () => {
      const owner = await loginOrRegisterWithGoogle({
        sub: `draft-owner-${Date.now()}`,
        email: `draftowner_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Draft Owner",
      });
      const stranger = await loginOrRegisterWithGoogle({
        sub: `draft-stranger-${Date.now()}`,
        email: `draftstranger_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Stranger",
      });

      const saveRes = await app.request("/api/v1/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${owner.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "story",
          body: "Maxfiy qoralama hikoya...",
          hashtags: ["hikoya"],
        }),
      });
      expect(saveRes.status).toBe(201);
      const draftJson = (await saveRes.json()) as {
        data: { draft: { id: string } };
      };

      // Stranger querying post_drafts via RLS sees 0 rows
      const leaked = await withDbContext(
        { userId: stranger.userId, role: "user" },
        async (tx) =>
          tx
            .select()
            .from(postDrafts)
            .where(eq(postDrafts.id, draftJson.data.draft.id))
      );
      expect(leaked).toHaveLength(0);

      // Stranger API call to update owner's draft fails
      const updateAttempt = await app.request(
        `/api/v1/drafts/${draftJson.data.draft.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${stranger.sessionToken}`,
          },
          body: JSON.stringify({ postType: "note", body: "Hijack" }),
        }
      );
      expect(updateAttempt.status).toBe(404);
    });

    it("enforces configurable post length limit and increases it via friend referral without decreasing", async () => {
      const inviter = await loginOrRegisterWithGoogle({
        sub: `inviter-${Date.now()}`,
        email: `inviter_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Inviter User",
      });
      const friend = await loginOrRegisterWithGoogle({
        sub: `friend-${Date.now()}`,
        email: `friend_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Invited Friend",
      });

      // Get inviter's username from /auth/me
      const meRes = await app.request("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${inviter.sessionToken}` },
      });
      const meJson = (await meRes.json()) as {
        data: { profile: { username: string } };
      };
      const inviterUsername = meJson.data.profile.username;

      // Initial limit includes verified email bonus (1000 + 200 = 1200)
      const limitBefore = await app.request("/api/v1/account/post-limit", {
        headers: { Authorization: `Bearer ${inviter.sessionToken}` },
      });
      const limitBeforeJson = (await limitBefore.json()) as {
        data: { limit: { currentMaxLength: number } };
      };
      expect(limitBeforeJson.data.limit.currentMaxLength).toBe(1200);

      // 1300 chars fails before referral
      const overLimitRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${inviter.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "story",
          body: "a".repeat(1300),
        }),
      });
      expect(overLimitRes.status).toBe(400);

      // Friend claims referral -> inviter limit unlocks +250 => 1450
      const refRes = await app.request("/api/v1/account/referrals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${friend.sessionToken}`,
        },
        body: JSON.stringify({ inviterUsername }),
      });
      expect(refRes.status).toBe(201);
      const refJson = (await refRes.json()) as {
        data: { inviterNewMaxLength: number };
      };
      expect(refJson.data.inviterNewMaxLength).toBe(1450);

      // Now 1300 chars succeeds!
      const underNewLimitRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${inviter.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "story",
          body: "a".repeat(1300),
        }),
      });
      expect(underNewLimitRes.status).toBe(201);
    });

    it("counts unique views once per user, supports likes/comments/reposts/bookmarks, feeds, and server-side search", async () => {
      const author = await loginOrRegisterWithGoogle({
        sub: `feed-author-${Date.now()}`,
        email: `feedauthor_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Ziyoda Writer",
      });
      const reader = await loginOrRegisterWithGoogle({
        sub: `feed-reader-${Date.now()}`,
        email: `feedreader_${Date.now()}@example.com`,
        emailVerified: true,
        displayName: "Reader One",
      });

      const postRes = await app.request("/api/v1/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${author.sessionToken}`,
        },
        body: JSON.stringify({
          postType: "thought",
          body: "Toshkentda quyoshli tong va samarkand qahvasi haqida qisqa fikr.",
          hashtags: ["toshkent", "qahva"],
        }),
      });
      const postJson = (await postRes.json()) as {
        data: { post: { id: string } };
      };
      const postId = postJson.data.post.id;

      // View called twice by reader => counted ONLY once!
      const v1 = await app.request(`/api/v1/posts/${postId}/view`, {
        method: "POST",
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      const v1Json = (await v1.json()) as {
        data: { counted: boolean; viewsCount: number };
      };
      expect(v1Json.data.counted).toBe(true);
      expect(v1Json.data.viewsCount).toBe(1);

      const v2 = await app.request(`/api/v1/posts/${postId}/view`, {
        method: "POST",
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      const v2Json = (await v2.json()) as {
        data: { counted: boolean; viewsCount: number };
      };
      expect(v2Json.data.counted).toBe(false);
      expect(v2Json.data.viewsCount).toBe(1);

      // Author views => increments to 2
      const v3 = await app.request(`/api/v1/posts/${postId}/view`, {
        method: "POST",
        headers: { Authorization: `Bearer ${author.sessionToken}` },
      });
      const v3Json = (await v3.json()) as {
        data: { counted: boolean; viewsCount: number };
      };
      expect(v3Json.data.viewsCount).toBe(2);

      // Like, repost, bookmark, comment
      await app.request(`/api/v1/posts/${postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      await app.request(`/api/v1/posts/${postId}/repost`, {
        method: "POST",
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      await app.request(`/api/v1/posts/${postId}/bookmark`, {
        method: "POST",
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      await app.request(`/api/v1/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reader.sessionToken}`,
        },
        body: JSON.stringify({ body: "Juda ajoyib fikr!" }),
      });

      // Verify all 5 metrics on GET /posts/:id
      const fetched = await app.request(`/api/v1/posts/${postId}`, {
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      const fetchedJson = (await fetched.json()) as {
        data: {
          post: {
            likesCount: number;
            commentsCount: number;
            viewsCount: number;
            repostsCount: number;
            bookmarksCount: number;
            likedByMe: boolean;
            bookmarkedByMe: boolean;
          };
        };
      };
      expect(fetchedJson.data.post.likesCount).toBe(1);
      expect(fetchedJson.data.post.commentsCount).toBe(1);
      expect(fetchedJson.data.post.viewsCount).toBe(2);
      expect(fetchedJson.data.post.repostsCount).toBe(1);
      expect(fetchedJson.data.post.bookmarksCount).toBe(1);
      expect(fetchedJson.data.post.likedByMe).toBe(true);
      expect(fetchedJson.data.post.bookmarkedByMe).toBe(true);

      // Follow author -> appears in following feed
      await app.request(`/api/v1/users/${author.userId}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      const followingFeed = await app.request("/api/v1/feed?tab=following", {
        headers: { Authorization: `Bearer ${reader.sessionToken}` },
      });
      const followingJson = (await followingFeed.json()) as {
        data: { posts: Array<{ id: string }> };
      };
      expect(followingJson.data.posts.some((p) => p.id === postId)).toBe(true);

      // For you & trending feeds
      const forYouFeed = await app.request("/api/v1/feed?tab=for_you");
      expect(forYouFeed.status).toBe(200);
      const trendingFeed = await app.request(
        "/api/v1/feed?tab=trending&window=24h"
      );
      expect(trendingFeed.status).toBe(200);

      // Server-side Search: by text, by hashtag, by user
      const searchText = await app.request("/api/v1/search?q=samarkand");
      const searchTextJson = (await searchText.json()) as {
        data: { posts: Array<{ id: string }> };
      };
      expect(searchTextJson.data.posts.some((p) => p.id === postId)).toBe(true);

      const searchTag = await app.request("/api/v1/search?tag=qahva");
      const searchTagJson = (await searchTag.json()) as {
        data: { posts: Array<{ id: string }> };
      };
      expect(searchTagJson.data.posts.some((p) => p.id === postId)).toBe(true);

      const searchUser = await app.request("/api/v1/search?q=Ziyoda&type=users");
      const searchUserJson = (await searchUser.json()) as {
        data: { users: Array<{ userId: string }> };
      };
      expect(
        searchUserJson.data.users.some((u) => u.userId === author.userId)
      ).toBe(true);
    });
  }
);
