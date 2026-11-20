import "server-only";
import { Hono } from "hono";
import { z } from "zod";
import {
  createCommentSchema,
  createPostSchema,
  feedQuerySchema,
  saveDraftSchema,
  searchQuerySchema,
  updatePostSchema,
} from "@/lib/validation/posts";
import { repostSchema } from "@/lib/validation/social";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  claimFriendReferral,
  getUserPostLimitBreakdown,
  ReferralError,
} from "@/server/services/post-limit.service";
import {
  createPost,
  createPostComment,
  createPostRepost,
  deletePostComment,
  deletePostPermanently,
  deleteUserDraft,
  getFeedPosts,
  getPostById,
  listPostComments,
  listUserBookmarks,
  listUserDrafts,
  PostServiceError,
  recordUniquePostView,
  saveUserDraft,
  setFollowUser,
  setPostReaction,
  toggleCommentLike,
  togglePostLike,
  updatePost,
} from "@/server/services/posts.service";
import { searchPlatform } from "@/server/services/search.service";
import { SocialServiceError } from "@/server/services/social.service";
import { requireAuth, requirePermission } from "../middleware/authorize";
import type { AppEnv } from "../types";

export const postsRoutes = new Hono<AppEnv>();

const uuidParamSchema = z.string().uuid();

function handlePostError(
  err: unknown,
  requestId: string
): {
  status: 400 | 403 | 404 | 409 | 429;
  body: Record<string, unknown>;
} | null {
  if (err instanceof PostServiceError || err instanceof SocialServiceError) {
    return {
      status: err.statusCode as 400 | 403 | 404 | 409 | 429,
      body: {
        ok: false,
        error: { code: err.code, message: err.message },
        meta: { requestId },
      },
    };
  }
  if (err instanceof ReferralError) {
    return {
      status: err.statusCode as 400 | 404 | 409,
      body: {
        ok: false,
        error: { code: err.code, message: err.message },
        meta: { requestId },
      },
    };
  }
  return null;
}

// --- Feeds & Search (All Queries Server-Side) ---

postsRoutes.get("/feed", async (c) => {
  const parsed = feedQuerySchema.safeParse({
    tab: c.req.query("tab"),
    postType: c.req.query("postType") || undefined,
    tag: c.req.query("tag") || undefined,
    window: c.req.query("window"),
    cursor: c.req.query("cursor") || undefined,
    limit: c.req.query("limit"),
  });

  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Noto‘g‘ri feed parametrlari",
        },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  const actor = c.get("actor");
  const posts = await getFeedPosts({
    tab: parsed.data.tab,
    postType: parsed.data.postType,
    tag: parsed.data.tag,
    window: parsed.data.window,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
    viewer: actor ? { userId: actor.userId, role: actor.role } : null,
  });

  let nextCursor: string | null = null;
  if (posts.length >= parsed.data.limit) {
    if (parsed.data.tab === "following") {
      nextCursor = posts[posts.length - 1]?.createdAt ?? null;
    } else {
      const currentOffset = parsed.data.cursor?.startsWith("offset:")
        ? Math.max(0, Number.parseInt(parsed.data.cursor.slice(7), 10) || 0)
        : 0;
      nextCursor = `offset:${currentOffset + posts.length}`;
    }
  }

  return c.json({
    ok: true,
    data: { posts, tab: parsed.data.tab, nextCursor },
    meta: { requestId: c.get("requestId") },
  });
});

postsRoutes.get("/search", async (c) => {
  const parsed = searchQuerySchema.safeParse({
    q: c.req.query("q") ?? "",
    type: c.req.query("type"),
    tag: c.req.query("tag") || undefined,
    limit: c.req.query("limit"),
  });

  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Noto‘g‘ri qidiruv parametrlari",
        },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  const actor = c.get("actor");
  const results = await searchPlatform({
    query: parsed.data.q,
    type: parsed.data.type,
    tag: parsed.data.tag,
    limit: parsed.data.limit,
    viewer: actor ? { userId: actor.userId, role: actor.role } : null,
  });

  return c.json({
    ok: true,
    data: results,
    meta: { requestId: c.get("requestId") },
  });
});

// --- Bookmarks ---

postsRoutes.get(
  "/bookmarks",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const posts = await listUserBookmarks(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: { posts },
      meta: { requestId: c.get("requestId") },
    });
  }
);

// --- Drafts (Strictly Private to Owner) ---

postsRoutes.get(
  "/drafts",
  requirePermission(PERMISSIONS.DRAFT_MANAGE_SELF),
  async (c) => {
    const actor = c.get("actor")!;
    const drafts = await listUserDrafts(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: { drafts },
      meta: { requestId: c.get("requestId") },
    });
  }
);

postsRoutes.post(
  "/drafts",
  requirePermission(PERMISSIONS.DRAFT_MANAGE_SELF),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = saveDraftSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri qoralama",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const draft = await saveUserDraft({
      authorId: actor.userId,
      authorRole: actor.role,
      postType: parsed.data.postType,
      body: parsed.data.body,
      styleConfig: parsed.data.styleConfig,
      hashtags: parsed.data.hashtags,
    });

    return c.json(
      {
        ok: true,
        data: { draft },
        meta: { requestId: c.get("requestId") },
      },
      201
    );
  }
);

postsRoutes.put(
  "/drafts/:id",
  requirePermission(PERMISSIONS.DRAFT_MANAGE_SELF),
  async (c) => {
    const actor = c.get("actor")!;
    const draftId = c.req.param("id");
    if (!uuidParamSchema.safeParse(draftId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri draft ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = saveDraftSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri qoralama",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const draft = await saveUserDraft({
        draftId,
        authorId: actor.userId,
        authorRole: actor.role,
        postType: parsed.data.postType,
        body: parsed.data.body,
        styleConfig: parsed.data.styleConfig,
        hashtags: parsed.data.hashtags,
      });
      return c.json({
        ok: true,
        data: { draft },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.delete(
  "/drafts/:id",
  requirePermission(PERMISSIONS.DRAFT_MANAGE_SELF),
  async (c) => {
    const actor = c.get("actor")!;
    const draftId = c.req.param("id");
    if (!uuidParamSchema.safeParse(draftId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri draft ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const deleted = await deleteUserDraft(draftId, actor.userId, actor.role);
    if (!deleted) {
      return c.json(
        {
          ok: false,
          error: { code: "DRAFT_NOT_FOUND", message: "Qoralama topilmadi" },
          meta: { requestId: c.get("requestId") },
        },
        404
      );
    }

    return c.json({
      ok: true,
      data: { deleted: true },
      meta: { requestId: c.get("requestId") },
    });
  }
);

// --- Posts CRUD ---

postsRoutes.post(
  "/posts",
  requirePermission(PERMISSIONS.POST_CREATE),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = createPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri post ma’lumotlari",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const post = await createPost({
        authorId: actor.userId,
        authorRole: actor.role,
        postType: parsed.data.postType,
        body: parsed.data.body,
        styleConfig: parsed.data.styleConfig,
        hashtags: parsed.data.hashtags,
        commentPolicy: parsed.data.commentPolicy,
        draftId: parsed.data.draftId,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json(
        {
          ok: true,
          data: { post },
          meta: { requestId: c.get("requestId") },
        },
        201
      );
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.get("/posts/:id", async (c) => {
  const postId = c.req.param("id");
  if (!uuidParamSchema.safeParse(postId).success) {
    return c.json(
      {
        ok: false,
        error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  const actor = c.get("actor");
  const post = await getPostById(
    postId,
    actor ? { userId: actor.userId, role: actor.role } : null
  );

  if (!post) {
    return c.json(
      {
        ok: false,
        error: { code: "POST_NOT_FOUND", message: "Post topilmadi" },
        meta: { requestId: c.get("requestId") },
      },
      404
    );
  }

  return c.json({
    ok: true,
    data: { post },
    meta: { requestId: c.get("requestId") },
  });
});

postsRoutes.patch(
  "/posts/:id",
  requirePermission(PERMISSIONS.POST_UPDATE_SELF),
  async (c) => {
    const actor = c.get("actor")!;
    const postId = c.req.param("id");
    if (!uuidParamSchema.safeParse(postId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = updatePostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri yangilanish",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const post = await updatePost({
        postId,
        authorId: actor.userId,
        authorRole: actor.role,
        postType: parsed.data.postType,
        body: parsed.data.body,
        styleConfig: parsed.data.styleConfig,
        hashtags: parsed.data.hashtags,
        commentPolicy: parsed.data.commentPolicy,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
      return c.json({
        ok: true,
        data: { post },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.delete(
  "/posts/:id",
  requirePermission(PERMISSIONS.POST_DELETE_SELF),
  async (c) => {
    const actor = c.get("actor")!;
    const postId = c.req.param("id");
    if (!uuidParamSchema.safeParse(postId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      await deletePostPermanently({
        postId,
        authorId: actor.userId,
        authorRole: actor.role,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
      return c.json({
        ok: true,
        data: { deleted: true },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

// --- Views (1 per user) & Interactions ---

postsRoutes.post(
  "/posts/:id/view",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const postId = c.req.param("id");
    if (!uuidParamSchema.safeParse(postId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const result = await recordUniquePostView({
        postId,
        userId: actor.userId,
        role: actor.role,
      });
      return c.json({
        ok: true,
        data: result,
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.post(
  "/posts/:id/like/toggle",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const postId = c.req.param("id");
    if (!uuidParamSchema.safeParse(postId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const result = await togglePostLike({
        postId,
        userId: actor.userId,
        role: actor.role,
      });
      return c.json({
        ok: true,
        data: result,
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.post(
  "/posts/:id/repost",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const postId = c.req.param("id");
    if (!uuidParamSchema.safeParse(postId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => ({}));
    const parsed = repostSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri repost ma’lumotlari",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const repost = await createPostRepost({
        postId,
        userId: actor.userId,
        role: actor.role,
        repostType: parsed.data.repostType,
        quoteBody: parsed.data.quoteBody,
      });
      return c.json(
        {
          ok: true,
          data: { repost },
          meta: { requestId: c.get("requestId") },
        },
        201
      );
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.delete(
  "/posts/:id/repost",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const postId = c.req.param("id");
    if (!uuidParamSchema.safeParse(postId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      await setPostReaction({
        postId,
        userId: actor.userId,
        role: actor.role,
        kind: "repost",
        active: false,
      });
      return c.json({
        ok: true,
        data: { active: false },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

for (const kind of ["like", "bookmark"] as const) {
  postsRoutes.post(
    `/posts/:id/${kind}`,
    requirePermission(PERMISSIONS.POST_INTERACT),
    async (c) => {
      const actor = c.get("actor")!;
      const postId = c.req.param("id");
      if (!uuidParamSchema.safeParse(postId).success) {
        return c.json(
          {
            ok: false,
            error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
            meta: { requestId: c.get("requestId") },
          },
          400
        );
      }

      try {
        await setPostReaction({
          postId,
          userId: actor.userId,
          role: actor.role,
          kind,
          active: true,
        });
        return c.json({
          ok: true,
          data: { active: true },
          meta: { requestId: c.get("requestId") },
        });
      } catch (err) {
        const mapped = handlePostError(err, c.get("requestId"));
        if (mapped) return c.json(mapped.body, mapped.status);
        throw err;
      }
    }
  );

  postsRoutes.delete(
    `/posts/:id/${kind}`,
    requirePermission(PERMISSIONS.POST_INTERACT),
    async (c) => {
      const actor = c.get("actor")!;
      const postId = c.req.param("id");
      if (!uuidParamSchema.safeParse(postId).success) {
        return c.json(
          {
            ok: false,
            error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
            meta: { requestId: c.get("requestId") },
          },
          400
        );
      }

      try {
        await setPostReaction({
          postId,
          userId: actor.userId,
          role: actor.role,
          kind,
          active: false,
        });
        return c.json({
          ok: true,
          data: { active: false },
          meta: { requestId: c.get("requestId") },
        });
      } catch (err) {
        const mapped = handlePostError(err, c.get("requestId"));
        if (mapped) return c.json(mapped.body, mapped.status);
        throw err;
      }
    }
  );
}

postsRoutes.get("/posts/:id/comments", async (c) => {
  const postId = c.req.param("id");
  if (!uuidParamSchema.safeParse(postId).success) {
    return c.json(
      {
        ok: false,
        error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  const actor = c.get("actor");
  try {
    const comments = await listPostComments(
      postId,
      actor ? { userId: actor.userId, role: actor.role } : null
    );
    return c.json({
      ok: true,
      data: { comments },
      meta: { requestId: c.get("requestId") },
    });
  } catch (err) {
    const mapped = handlePostError(err, c.get("requestId"));
    if (mapped) return c.json(mapped.body, mapped.status);
    throw err;
  }
});

postsRoutes.post(
  "/posts/:id/comments",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const postId = c.req.param("id");
    if (!uuidParamSchema.safeParse(postId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri post ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = createCommentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri izoh",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const comment = await createPostComment({
        postId,
        authorId: actor.userId,
        authorRole: actor.role,
        body: parsed.data.body,
        parentCommentId: parsed.data.parentCommentId,
      });
      return c.json(
        {
          ok: true,
          data: { comment },
          meta: { requestId: c.get("requestId") },
        },
        201
      );
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.delete(
  "/comments/:commentId",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const commentId = c.req.param("commentId");
    if (!uuidParamSchema.safeParse(commentId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri comment ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      await deletePostComment({
        commentId,
        actorId: actor.userId,
        actorRole: actor.role,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
      return c.json({
        ok: true,
        data: { deleted: true },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.post(
  "/comments/:commentId/like/toggle",
  requirePermission(PERMISSIONS.POST_INTERACT),
  async (c) => {
    const actor = c.get("actor")!;
    const commentId = c.req.param("commentId");
    if (!uuidParamSchema.safeParse(commentId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri comment ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const result = await toggleCommentLike({
        commentId,
        userId: actor.userId,
        role: actor.role,
      });
      return c.json({
        ok: true,
        data: result,
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

// --- Follows ---

postsRoutes.post(
  "/users/:userId/follow",
  requirePermission(PERMISSIONS.USER_FOLLOW),
  async (c) => {
    const actor = c.get("actor")!;
    const targetUserId = c.req.param("userId");
    if (!uuidParamSchema.safeParse(targetUserId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri user ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const result = await setFollowUser({
        followerId: actor.userId,
        followerRole: actor.role,
        targetUserId,
        follow: true,
      });
      return c.json({
        ok: true,
        data: { following: result.status === "following", status: result.status },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

postsRoutes.delete(
  "/users/:userId/follow",
  requirePermission(PERMISSIONS.USER_FOLLOW),
  async (c) => {
    const actor = c.get("actor")!;
    const targetUserId = c.req.param("userId");
    if (!uuidParamSchema.safeParse(targetUserId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri user ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const result = await setFollowUser({
        followerId: actor.userId,
        followerRole: actor.role,
        targetUserId,
        follow: false,
      });
      return c.json({
        ok: true,
        data: { following: false, status: result.status },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handlePostError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

// --- Configurable Post Limits & Referrals ---

postsRoutes.get("/account/post-limit", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const limit = await getUserPostLimitBreakdown(actor.userId, actor.role);
  return c.json({
    ok: true,
    data: { limit },
    meta: { requestId: c.get("requestId") },
  });
});

postsRoutes.post("/account/referrals", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const rawBody = await c.req.json().catch(() => null);
  const parsed = z
    .object({ inviterUsername: z.string().trim().min(3).max(30) })
    .safeParse(rawBody);

  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Taklif qiluvchi username noto‘g‘ri",
        },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  try {
    const result = await claimFriendReferral({
      inviteeUserId: actor.userId,
      inviteeRole: actor.role,
      inviterUsername: parsed.data.inviterUsername,
      ipAddress: c.get("ipAddress"),
      requestId: c.get("requestId"),
    });

    return c.json(
      {
        ok: true,
        data: result,
        meta: { requestId: c.get("requestId") },
      },
      201
    );
  } catch (err) {
    const mapped = handlePostError(err, c.get("requestId"));
    if (mapped) return c.json(mapped.body, mapped.status);
    throw err;
  }
});
