import "server-only";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import {
  extractHashtagsFromBody,
  MAX_HASHTAGS_PER_POST,
  normalizeHashtag,
} from "@/lib/validation/posts";
import { type PostStyleTokens } from "@/lib/posts/styles";
import { type DbTransaction, withDbContext } from "@/server/db/context";
import {
  commentLikes,
  followRequests,
  follows,
  hashtags,
  postBookmarks,
  postComments,
  postDrafts,
  postHashtags,
  postLikes,
  postReposts,
  postViews,
  posts,
  profiles,
  users,
  type PostType,
  type UserRole,
} from "@/server/db/schema";
import { recordActivityPostInTx } from "./activity.service";
import { AUDIT_EVENTS, writeAuditLog } from "./audit.service";
import { recordAutomatedFlagInTx } from "./auto-moderation.service";
import {
  assertNotBlockedInTx,
  createNotificationInTx,
  dispatchMentionNotificationsInTx,
  isBlockedInTx,
} from "./social.service";

export type CommentPolicy = "everyone" | "followers" | "closed";

export class PostServiceError extends Error {
  constructor(
    public readonly code:
      | "POST_NOT_FOUND"
      | "POST_TOO_LONG"
      | "TOO_MANY_HASHTAGS"
      | "DRAFT_NOT_FOUND"
      | "FORBIDDEN"
      | "CANNOT_FOLLOW_SELF"
      | "COMMENTS_CLOSED"
      | "COMMENTS_FOLLOWERS_ONLY"
      | "COMMENT_NOT_FOUND"
      | "DUPLICATE_COMMENT"
      | "DUPLICATE_REPOST",
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "PostServiceError";
  }
}

export interface HydratedPost {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarId: string;
  authorOnline?: boolean;
  authorVerified: boolean;
  postType: PostType;
  body: string;
  styleConfig: PostStyleTokens;
  commentPolicy: CommentPolicy;
  hashtags: string[];
  isEdited: boolean;
  editedAt: string | null;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  repostsCount: number;
  bookmarksCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  bookmarkedByMe: boolean;
  followedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

function resolvePostHashtags(
  explicitHashtags: string[] | undefined,
  body: string
): string[] {
  if (explicitHashtags !== undefined) {
    if (explicitHashtags.length > MAX_HASHTAGS_PER_POST) {
      throw new PostServiceError(
        "TOO_MANY_HASHTAGS",
        `Har bir postga maksimum ${MAX_HASHTAGS_PER_POST} ta hashtag ruxsat etiladi`,
        400
      );
    }
    return explicitHashtags;
  }

  const extracted = extractHashtagsFromBody(body);
  if (extracted.length > MAX_HASHTAGS_PER_POST) {
    throw new PostServiceError(
      "TOO_MANY_HASHTAGS",
      `Matnda maksimum ${MAX_HASHTAGS_PER_POST} ta hashtag bo‘lishi mumkin`,
      400
    );
  }
  return extracted;
}

async function syncPostHashtags(
  tx: DbTransaction,
  postId: string,
  tags: string[]
): Promise<void> {
  await tx.delete(postHashtags).where(eq(postHashtags.postId, postId));

  if (tags.length === 0) return;

  for (const tag of tags) {
    await tx
      .insert(hashtags)
      .values({ tag })
      .onConflictDoNothing();

    const [tagRow] = await tx
      .select({ id: hashtags.id })
      .from(hashtags)
      .where(sql`lower(${hashtags.tag}) = ${tag.toLowerCase()}`)
      .limit(1);

    if (tagRow) {
      await tx
        .insert(postHashtags)
        .values({ postId, hashtagId: tagRow.id })
        .onConflictDoNothing();
    }
  }
}

export async function hydratePostsForViewer(
  tx: DbTransaction,
  rawRows: Array<{
    id: string;
    authorId: string;
    authorUsername: string;
    authorDisplayName: string;
    authorAvatarId?: string;
    authorVerified: boolean;
    postType: PostType;
    body: string;
    styleConfig: PostStyleTokens;
    commentPolicy?: string;
    isEdited: boolean;
    editedAt: Date | null;
    likesCount: number;
    commentsCount: number;
    viewsCount: number;
    repostsCount: number;
    bookmarksCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>,
  viewerUserId: string | null
): Promise<HydratedPost[]> {
  if (rawRows.length === 0) return [];

  const postIds = rawRows.map((r) => r.id);
  const authorIds = Array.from(new Set(rawRows.map((r) => r.authorId)));

  const tagRows = await tx
    .select({
      postId: postHashtags.postId,
      tag: hashtags.tag,
    })
    .from(postHashtags)
    .innerJoin(hashtags, eq(postHashtags.hashtagId, hashtags.id))
    .where(inArray(postHashtags.postId, postIds));

  const tagsByPost = new Map<string, string[]>();
  for (const tr of tagRows) {
    const arr = tagsByPost.get(tr.postId) ?? [];
    arr.push(tr.tag);
    tagsByPost.set(tr.postId, arr);
  }

  const likedSet = new Set<string>();
  const repostedSet = new Set<string>();
  const bookmarkedSet = new Set<string>();
  const followedSet = new Set<string>();

  if (viewerUserId) {
    const likes = await tx
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(
        and(
          eq(postLikes.userId, viewerUserId),
          inArray(postLikes.postId, postIds)
        )
      );
    const reposts = await tx
      .select({ postId: postReposts.postId })
      .from(postReposts)
      .where(
        and(
          eq(postReposts.userId, viewerUserId),
          inArray(postReposts.postId, postIds)
        )
      );
    const bookmarks = await tx
      .select({ postId: postBookmarks.postId })
      .from(postBookmarks)
      .where(
        and(
          eq(postBookmarks.userId, viewerUserId),
          inArray(postBookmarks.postId, postIds)
        )
      );
    const followRows = await tx
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, viewerUserId),
          inArray(follows.followingId, authorIds)
        )
      );

    for (const r of likes) likedSet.add(r.postId);
    for (const r of reposts) repostedSet.add(r.postId);
    for (const r of bookmarks) bookmarkedSet.add(r.postId);
    for (const r of followRows) followedSet.add(r.followingId);
  }

  return rawRows.map((row) => ({
    id: row.id,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    authorAvatarId: row.authorAvatarId ?? "av_01",
    authorVerified: Boolean(row.authorVerified),
    postType: row.postType,
    body: row.body,
    styleConfig: row.styleConfig ?? {},
    commentPolicy: (row.commentPolicy as CommentPolicy) ?? "everyone",
    hashtags: tagsByPost.get(row.id) ?? [],
    isEdited: row.isEdited,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    likesCount: row.likesCount,
    commentsCount: row.commentsCount,
    viewsCount: row.viewsCount,
    repostsCount: row.repostsCount,
    bookmarksCount: row.bookmarksCount,
    likedByMe: likedSet.has(row.id),
    repostedByMe: repostedSet.has(row.id),
    bookmarkedByMe: bookmarkedSet.has(row.id),
    followedByMe: followedSet.has(row.authorId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createPost(params: {
  authorId: string;
  authorRole: UserRole;
  postType: PostType;
  body: string;
  styleConfig?: PostStyleTokens;
  commentPolicy?: CommentPolicy;
  hashtags?: string[];
  draftId?: string;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<HydratedPost> {
  const tags = resolvePostHashtags(params.hashtags, params.body);

  return withDbContext(
    { userId: params.authorId, role: params.authorRole },
    async (tx) => {
      const [userRow] = await tx
        .select({ maxPostLength: users.maxPostLength })
        .from(users)
        .where(eq(users.id, params.authorId))
        .limit(1);

      const maxLen = userRow?.maxPostLength ?? 1000;
      if (params.body.length > maxLen) {
        throw new PostServiceError(
          "POST_TOO_LONG",
          `Post matni sizning joriy ${maxLen} belgilik limitingizdan oshib ketdi`,
          400
        );
      }

      const [created] = await tx
        .insert(posts)
        .values({
          authorId: params.authorId,
          postType: params.postType,
          body: params.body,
          styleConfig: params.styleConfig ?? {},
          commentPolicy: params.commentPolicy ?? "everyone",
        })
        .returning();

      if (!created) {
        throw new Error("Failed to create post");
      }

      await syncPostHashtags(tx, created.id, tags);
      await recordActivityPostInTx(tx, params.authorId);
      await recordAutomatedFlagInTx(tx, {
        contentType: "post",
        contentId: created.id,
        authorId: params.authorId,
        authorRole: params.authorRole,
        text: params.body,
      });
      await dispatchMentionNotificationsInTx(tx, {
        actorId: params.authorId,
        text: params.body,
        postId: created.id,
      });

      if (params.draftId) {
        await tx
          .delete(postDrafts)
          .where(
            and(
              eq(postDrafts.id, params.draftId),
              eq(postDrafts.authorId, params.authorId)
            )
          );
      }

      await writeAuditLog(tx, {
        actorId: params.authorId,
        actorRole: params.authorRole,
        eventType: AUDIT_EVENTS.POST_CREATED,
        targetType: "post",
        targetId: created.id,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: { postType: params.postType, hashtagsCount: tags.length },
      });

      const [authorRow] = await tx
        .select({
          username: profiles.username,
          displayName: profiles.displayName,
          avatarId: profiles.avatarId,
          authorVerified: sql<boolean>`public.is_user_verified(${params.authorId})`,
        })
        .from(profiles)
        .where(eq(profiles.userId, params.authorId))
        .limit(1);

      const [hydrated] = await hydratePostsForViewer(
        tx,
        [
          {
            ...created,
            authorUsername: authorRow?.username ?? "user",
            authorDisplayName: authorRow?.displayName ?? "Avero User",
            authorAvatarId: authorRow?.avatarId ?? "av_01",
            authorVerified: Boolean(authorRow?.authorVerified),
          },
        ],
        params.authorId
      );

      return hydrated!;
    }
  );
}

/**
 * Edits an existing post in-place, keeping ONLY the latest version.
 */
export async function updatePost(params: {
  postId: string;
  authorId: string;
  authorRole: UserRole;
  postType?: PostType;
  body: string;
  styleConfig?: PostStyleTokens;
  commentPolicy?: CommentPolicy;
  hashtags?: string[];
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<HydratedPost> {
  const tags = resolvePostHashtags(params.hashtags, params.body);

  return withDbContext(
    { userId: params.authorId, role: params.authorRole },
    async (tx) => {
      const [existing] = await tx
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      if (!existing) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }
      if (existing.authorId !== params.authorId) {
        throw new PostServiceError(
          "FORBIDDEN",
          "Faqat o‘z postingizni tahrirlashingiz mumkin",
          403
        );
      }

      const [userRow] = await tx
        .select({ maxPostLength: users.maxPostLength })
        .from(users)
        .where(eq(users.id, params.authorId))
        .limit(1);

      const maxLen = userRow?.maxPostLength ?? 1000;
      if (params.body.length > maxLen) {
        throw new PostServiceError(
          "POST_TOO_LONG",
          `Post matni sizning joriy ${maxLen} belgilik limitingizdan oshib ketdi`,
          400
        );
      }

      const now = new Date();
      const [updated] = await tx
        .update(posts)
        .set({
          ...(params.postType ? { postType: params.postType } : {}),
          body: params.body,
          ...(params.styleConfig !== undefined
            ? { styleConfig: params.styleConfig }
            : {}),
          ...(params.commentPolicy !== undefined
            ? { commentPolicy: params.commentPolicy }
            : {}),
          isEdited: true,
          editedAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(posts.id, params.postId), eq(posts.authorId, params.authorId))
        )
        .returning();

      if (!updated) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }

      await syncPostHashtags(tx, updated.id, tags);
      await dispatchMentionNotificationsInTx(tx, {
        actorId: params.authorId,
        text: params.body,
        postId: updated.id,
      });

      await writeAuditLog(tx, {
        actorId: params.authorId,
        actorRole: params.authorRole,
        eventType: AUDIT_EVENTS.POST_UPDATED,
        targetType: "post",
        targetId: updated.id,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });

      const [authorRow] = await tx
        .select({
          username: profiles.username,
          displayName: profiles.displayName,
          avatarId: profiles.avatarId,
          authorVerified: sql<boolean>`public.is_user_verified(${params.authorId})`,
        })
        .from(profiles)
        .where(eq(profiles.userId, params.authorId))
        .limit(1);

      const [hydrated] = await hydratePostsForViewer(
        tx,
        [
          {
            ...updated,
            authorUsername: authorRow?.username ?? "user",
            authorDisplayName: authorRow?.displayName ?? "Avero User",
            authorAvatarId: authorRow?.avatarId ?? "av_01",
            authorVerified: Boolean(authorRow?.authorVerified),
          },
        ],
        params.authorId
      );

      return hydrated!;
    }
  );
}

/**
 * Permanently deletes a post from PostgreSQL (hard delete).
 */
export async function deletePostPermanently(params: {
  postId: string;
  authorId: string;
  authorRole: UserRole;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<void> {
  await withDbContext(
    { userId: params.authorId, role: params.authorRole },
    async (tx) => {
      const [existing] = await tx
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      if (!existing) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }
      if (existing.authorId !== params.authorId) {
        throw new PostServiceError(
          "FORBIDDEN",
          "Faqat o‘z postingizni o‘chirishingiz mumkin",
          403
        );
      }

      const deleted = await tx
        .delete(posts)
        .where(
          and(eq(posts.id, params.postId), eq(posts.authorId, params.authorId))
        )
        .returning({ id: posts.id });

      if (!deleted[0]) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }

      await writeAuditLog(tx, {
        actorId: params.authorId,
        actorRole: params.authorRole,
        eventType: AUDIT_EVENTS.POST_DELETED,
        targetType: "post",
        targetId: params.postId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });
    }
  );
}

export async function getPostById(
  postId: string,
  viewer: { userId: string; role: UserRole } | null
): Promise<HydratedPost | null> {
  return withDbContext(
    viewer
      ? { userId: viewer.userId, role: viewer.role }
      : { role: "anonymous", authFlow: true },
    async (tx) => {
      const rows = await tx
        .select({
          id: posts.id,
          authorId: posts.authorId,
          authorUsername: profiles.username,
          authorDisplayName: profiles.displayName,
          authorAvatarId: profiles.avatarId,
          authorVerified: sql<boolean>`public.is_user_verified(${posts.authorId})`,
          postType: posts.postType,
          body: posts.body,
          styleConfig: posts.styleConfig,
          commentPolicy: posts.commentPolicy,
          isEdited: posts.isEdited,
          editedAt: posts.editedAt,
          likesCount: posts.likesCount,
          commentsCount: posts.commentsCount,
          viewsCount: posts.viewsCount,
          repostsCount: posts.repostsCount,
          bookmarksCount: posts.bookmarksCount,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .innerJoin(profiles, eq(posts.authorId, profiles.userId))
        .where(eq(posts.id, postId))
        .limit(1);

      if (rows[0] && viewer && rows[0].authorId !== viewer.userId) {
        await assertNotBlockedInTx(
          tx,
          viewer.userId,
          rows[0].authorId,
          "content_only"
        );
      }

      const [hydrated] = await hydratePostsForViewer(
        tx,
        rows,
        viewer?.userId ?? null
      );
      return hydrated ?? null;
    }
  );
}

/**
 * Counts a unique view at most once per authenticated user.
 */
export async function recordUniquePostView(params: {
  postId: string;
  userId: string;
  role: UserRole;
}): Promise<{ counted: boolean; viewsCount: number }> {
  return withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const [postExists] = await tx
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      if (!postExists) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }

      if (postExists.authorId !== params.userId) {
        await assertNotBlockedInTx(
          tx,
          params.userId,
          postExists.authorId,
          "content_only"
        );
      }

      const inserted = await tx
        .insert(postViews)
        .values({ postId: params.postId, userId: params.userId })
        .onConflictDoNothing()
        .returning({ postId: postViews.postId });

      const [updatedPost] = await tx
        .select({ viewsCount: posts.viewsCount })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      return {
        counted: inserted.length > 0,
        viewsCount: updatedPost?.viewsCount ?? 0,
      };
    }
  );
}

export async function setPostReaction(params: {
  postId: string;
  userId: string;
  role: UserRole;
  kind: "like" | "repost" | "bookmark";
  active: boolean;
}): Promise<void> {
  await withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const [postExists] = await tx
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);
      if (!postExists) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }

      if (postExists.authorId !== params.userId) {
        await assertNotBlockedInTx(
          tx,
          params.userId,
          postExists.authorId,
          "content_only"
        );
      }

      if (params.kind === "like") {
        if (params.active) {
          const inserted = await tx
            .insert(postLikes)
            .values({ userId: params.userId, postId: params.postId })
            .onConflictDoNothing()
            .returning({ postId: postLikes.postId });
          if (inserted.length > 0) {
            await createNotificationInTx(tx, {
              recipientId: postExists.authorId,
              actorId: params.userId,
              type: "like",
              postId: params.postId,
            });
          }
        } else {
          await tx
            .delete(postLikes)
            .where(
              and(
                eq(postLikes.userId, params.userId),
                eq(postLikes.postId, params.postId)
              )
            );
        }
      } else if (params.kind === "repost") {
        if (params.active) {
          const inserted = await tx
            .insert(postReposts)
            .values({
              userId: params.userId,
              postId: params.postId,
              repostType: "simple",
            })
            .onConflictDoNothing()
            .returning({ id: postReposts.id });
          if (inserted.length > 0) {
            await createNotificationInTx(tx, {
              recipientId: postExists.authorId,
              actorId: params.userId,
              type: "repost",
              postId: params.postId,
            });
          }
        } else {
          await tx
            .delete(postReposts)
            .where(
              and(
                eq(postReposts.userId, params.userId),
                eq(postReposts.postId, params.postId),
                eq(postReposts.repostType, "simple")
              )
            );
        }
      } else {
        if (params.active) {
          await tx
            .insert(postBookmarks)
            .values({ userId: params.userId, postId: params.postId })
            .onConflictDoNothing();
        } else {
          await tx
            .delete(postBookmarks)
            .where(
              and(
                eq(postBookmarks.userId, params.userId),
                eq(postBookmarks.postId, params.postId)
              )
            );
        }
      }
    }
  );
}

/**
 * Single ❤️ Like toggle: adds Like if absent, removes it if already liked.
 */
export async function togglePostLike(params: {
  postId: string;
  userId: string;
  role: UserRole;
}): Promise<{ liked: boolean; likesCount: number }> {
  return withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const [postRow] = await tx
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      if (!postRow) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }

      if (postRow.authorId !== params.userId) {
        await assertNotBlockedInTx(
          tx,
          params.userId,
          postRow.authorId,
          "content_only"
        );
      }

      const deleted = await tx
        .delete(postLikes)
        .where(
          and(
            eq(postLikes.userId, params.userId),
            eq(postLikes.postId, params.postId)
          )
        )
        .returning({ postId: postLikes.postId });

      let liked = false;
      if (deleted.length === 0) {
        await tx
          .insert(postLikes)
          .values({ userId: params.userId, postId: params.postId })
          .onConflictDoNothing();
        liked = true;
        await createNotificationInTx(tx, {
          recipientId: postRow.authorId,
          actorId: params.userId,
          type: "like",
          postId: params.postId,
        });
      }

      const [updated] = await tx
        .select({ likesCount: posts.likesCount })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      return { liked, likesCount: updated?.likesCount ?? 0 };
    }
  );
}

/**
 * Creates either a simple repost or a quote repost, preventing duplicates.
 */
export async function createPostRepost(params: {
  postId: string;
  userId: string;
  role: UserRole;
  repostType: "simple" | "quote";
  quoteBody?: string;
}) {
  return withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const [postRow] = await tx
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      if (!postRow) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }

      if (postRow.authorId !== params.userId) {
        await assertNotBlockedInTx(
          tx,
          params.userId,
          postRow.authorId,
          "content_only"
        );
      }

      if (params.repostType === "simple") {
        const existing = await tx
          .select({ id: postReposts.id })
          .from(postReposts)
          .where(
            and(
              eq(postReposts.userId, params.userId),
              eq(postReposts.postId, params.postId),
              eq(postReposts.repostType, "simple")
            )
          )
          .limit(1);

        if (existing[0]) {
          throw new PostServiceError(
            "DUPLICATE_REPOST",
            "Siz bu postni allaqachon repost qilgansiz",
            409
          );
        }
      } else if (params.quoteBody) {
        const recentCutoff = new Date(Date.now() - 60_000);
        const dupQuote = await tx
          .select({ id: postReposts.id })
          .from(postReposts)
          .where(
            and(
              eq(postReposts.userId, params.userId),
              eq(postReposts.postId, params.postId),
              eq(postReposts.repostType, "quote"),
              eq(postReposts.quoteBody, params.quoteBody),
              gte(postReposts.createdAt, recentCutoff)
            )
          )
          .limit(1);

        if (dupQuote[0]) {
          throw new PostServiceError(
            "DUPLICATE_REPOST",
            "Bir xil izohli repost allaqachon yuborilgan",
            409
          );
        }
      }

      const [repost] = await tx
        .insert(postReposts)
        .values({
          userId: params.userId,
          postId: params.postId,
          repostType: params.repostType,
          quoteBody:
            params.repostType === "quote" ? (params.quoteBody ?? "") : null,
        })
        .returning();

      await createNotificationInTx(tx, {
        recipientId: postRow.authorId,
        actorId: params.userId,
        type: "repost",
        postId: params.postId,
        bodyPreview: params.quoteBody ?? null,
      });

      if (params.repostType === "quote" && params.quoteBody) {
        await dispatchMentionNotificationsInTx(tx, {
          actorId: params.userId,
          text: params.quoteBody,
          postId: params.postId,
        });
      }

      return repost!;
    }
  );
}

/**
 * Lists comments sorted by popularity (likesCount DESC, repliesCount DESC, createdAt ASC).
 */
export async function listPostComments(
  postId: string,
  viewer: { userId: string; role: UserRole } | null = null
) {
  return withDbContext(
    viewer ? { userId: viewer.userId, role: viewer.role } : { role: "anonymous" },
    async (tx) => {
      const rows = await tx
        .select({
          id: postComments.id,
          postId: postComments.postId,
          authorId: postComments.authorId,
          parentCommentId: postComments.parentCommentId,
          authorUsername: profiles.username,
          authorDisplayName: profiles.displayName,
          authorAvatarId: profiles.avatarId,
          body: postComments.body,
          likesCount: postComments.likesCount,
          repliesCount: postComments.repliesCount,
          createdAt: postComments.createdAt,
        })
        .from(postComments)
        .innerJoin(profiles, eq(postComments.authorId, profiles.userId))
        .where(eq(postComments.postId, postId))
        .orderBy(
          desc(postComments.likesCount),
          desc(postComments.repliesCount),
          postComments.createdAt
        );

      const likedSet = new Set<string>();
      const visible = [];
      for (const r of rows) {
        if (
          viewer &&
          r.authorId !== viewer.userId &&
          (await isBlockedInTx(tx, viewer.userId, r.authorId, "content_only"))
        ) {
          continue;
        }
        visible.push(r);
      }

      if (viewer && visible.length > 0) {
        const likes = await tx
          .select({ commentId: commentLikes.commentId })
          .from(commentLikes)
          .where(
            and(
              eq(commentLikes.userId, viewer.userId),
              inArray(
                commentLikes.commentId,
                visible.map((c) => c.id)
              )
            )
          );
        for (const l of likes) likedSet.add(l.commentId);
      }

      return visible.map((c) => ({
        ...c,
        likedByMe: likedSet.has(c.id),
      }));
    }
  );
}

export async function createPostComment(params: {
  postId: string;
  authorId: string;
  authorRole: UserRole;
  body: string;
  parentCommentId?: string;
}) {
  return withDbContext(
    { userId: params.authorId, role: params.authorRole },
    async (tx) => {
      const [postRow] = await tx
        .select({
          id: posts.id,
          authorId: posts.authorId,
          commentPolicy: posts.commentPolicy,
        })
        .from(posts)
        .where(eq(posts.id, params.postId))
        .limit(1);

      if (!postRow) {
        throw new PostServiceError("POST_NOT_FOUND", "Post topilmadi", 404);
      }

      if (postRow.authorId !== params.authorId) {
        await assertNotBlockedInTx(
          tx,
          params.authorId,
          postRow.authorId,
          "content_only"
        );

        if (postRow.commentPolicy === "closed") {
          throw new PostServiceError(
            "COMMENTS_CLOSED",
            "Bu postda izoh yozish yopilgan",
            403
          );
        }

        if (postRow.commentPolicy === "followers") {
          const [isFollower] = await tx
            .select({ followerId: follows.followerId })
            .from(follows)
            .where(
              and(
                eq(follows.followerId, params.authorId),
                eq(follows.followingId, postRow.authorId)
              )
            )
            .limit(1);

          if (!isFollower) {
            throw new PostServiceError(
              "COMMENTS_FOLLOWERS_ONLY",
              "Bu postda faqat obunachilar izoh qoldira oladi",
              403
            );
          }
        }
      }

      let parentAuthorId: string | null = null;
      if (params.parentCommentId) {
        const [parent] = await tx
          .select({
            id: postComments.id,
            postId: postComments.postId,
            authorId: postComments.authorId,
          })
          .from(postComments)
          .where(eq(postComments.id, params.parentCommentId))
          .limit(1);

        if (!parent || parent.postId !== params.postId) {
          throw new PostServiceError(
            "COMMENT_NOT_FOUND",
            "Javob berilayotgan izoh topilmadi",
            404
          );
        }
        if (parent.authorId !== params.authorId) {
          await assertNotBlockedInTx(
            tx,
            params.authorId,
            parent.authorId,
            "content_only"
          );
        }
        parentAuthorId = parent.authorId;
      }

      // Duplicate comment prevention within 60 seconds
      const recentCutoff = new Date(Date.now() - 60_000);
      const dupCheck = await tx
        .select({ id: postComments.id })
        .from(postComments)
        .where(
          and(
            eq(postComments.postId, params.postId),
            eq(postComments.authorId, params.authorId),
            eq(postComments.body, params.body),
            gte(postComments.createdAt, recentCutoff),
            params.parentCommentId
              ? eq(postComments.parentCommentId, params.parentCommentId)
              : sql`${postComments.parentCommentId} IS NULL`
          )
        )
        .limit(1);

      if (dupCheck[0]) {
        throw new PostServiceError(
          "DUPLICATE_COMMENT",
          "Bir xil izoh allaqachon yuborilgan",
          409
        );
      }

      const [comment] = await tx
        .insert(postComments)
        .values({
          postId: params.postId,
          authorId: params.authorId,
          parentCommentId: params.parentCommentId ?? null,
          body: params.body,
        })
        .returning();

      await recordAutomatedFlagInTx(tx, {
        contentType: "comment",
        contentId: comment!.id,
        authorId: params.authorId,
        authorRole: params.authorRole,
        text: params.body,
      });

      await createNotificationInTx(tx, {
        recipientId: postRow.authorId,
        actorId: params.authorId,
        type: parentAuthorId === postRow.authorId ? "reply" : "comment",
        postId: params.postId,
        commentId: comment!.id,
        bodyPreview: params.body,
      });

      if (parentAuthorId && parentAuthorId !== postRow.authorId) {
        await createNotificationInTx(tx, {
          recipientId: parentAuthorId,
          actorId: params.authorId,
          type: "reply",
          postId: params.postId,
          commentId: comment!.id,
          bodyPreview: params.body,
        });
      }

      await dispatchMentionNotificationsInTx(tx, {
        actorId: params.authorId,
        text: params.body,
        postId: params.postId,
        commentId: comment!.id,
      });

      const [profileRow] = await tx
        .select({
          username: profiles.username,
          displayName: profiles.displayName,
          avatarId: profiles.avatarId,
        })
        .from(profiles)
        .where(eq(profiles.userId, params.authorId))
        .limit(1);

      return {
        ...comment!,
        authorUsername: profileRow?.username ?? "user",
        authorDisplayName: profileRow?.displayName ?? "Avero User",
        authorAvatarId: profileRow?.avatarId ?? "av_01",
        likedByMe: false,
      };
    }
  );
}

/**
 * Deletes a comment. Allowed for BOTH the comment author AND the post owner.
 */
export async function deletePostComment(params: {
  commentId: string;
  actorId: string;
  actorRole: UserRole;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  await withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [commentRow] = await tx
        .select({
          id: postComments.id,
          authorId: postComments.authorId,
          postAuthorId: posts.authorId,
        })
        .from(postComments)
        .innerJoin(posts, eq(postComments.postId, posts.id))
        .where(eq(postComments.id, params.commentId))
        .limit(1);

      if (!commentRow) {
        throw new PostServiceError(
          "COMMENT_NOT_FOUND",
          "Izoh topilmadi",
          404
        );
      }

      if (
        commentRow.authorId !== params.actorId &&
        commentRow.postAuthorId !== params.actorId
      ) {
        throw new PostServiceError(
          "FORBIDDEN",
          "Faqat izoh muallifi yoki post egasi izohni o‘chira oladi",
          403
        );
      }

      await tx
        .delete(postComments)
        .where(eq(postComments.id, params.commentId));

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.COMMENT_DELETED,
        targetType: "comment",
        targetId: params.commentId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });
    }
  );
}

export async function toggleCommentLike(params: {
  commentId: string;
  userId: string;
  role: UserRole;
}): Promise<{ liked: boolean; likesCount: number }> {
  return withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const [commentRow] = await tx
        .select({ id: postComments.id, authorId: postComments.authorId })
        .from(postComments)
        .where(eq(postComments.id, params.commentId))
        .limit(1);

      if (!commentRow) {
        throw new PostServiceError(
          "COMMENT_NOT_FOUND",
          "Izoh topilmadi",
          404
        );
      }

      if (commentRow.authorId !== params.userId) {
        await assertNotBlockedInTx(
          tx,
          params.userId,
          commentRow.authorId,
          "content_only"
        );
      }

      const deleted = await tx
        .delete(commentLikes)
        .where(
          and(
            eq(commentLikes.userId, params.userId),
            eq(commentLikes.commentId, params.commentId)
          )
        )
        .returning({ commentId: commentLikes.commentId });

      let liked = false;
      if (deleted.length === 0) {
        await tx
          .insert(commentLikes)
          .values({ userId: params.userId, commentId: params.commentId })
          .onConflictDoNothing();
        liked = true;
      }

      const [updated] = await tx
        .select({ likesCount: postComments.likesCount })
        .from(postComments)
        .where(eq(postComments.id, params.commentId))
        .limit(1);

      return { liked, likesCount: updated?.likesCount ?? 0 };
    }
  );
}

// --- Drafts (Strictly Private to Owner via RLS) ---

export async function listUserDrafts(userId: string, role: UserRole) {
  return withDbContext({ userId, role }, async (tx) => {
    return tx
      .select()
      .from(postDrafts)
      .where(eq(postDrafts.authorId, userId))
      .orderBy(desc(postDrafts.updatedAt));
  });
}

export async function saveUserDraft(params: {
  draftId?: string;
  authorId: string;
  authorRole: UserRole;
  postType: PostType;
  body: string;
  styleConfig?: PostStyleTokens;
  hashtags?: string[];
}) {
  return withDbContext(
    { userId: params.authorId, role: params.authorRole },
    async (tx) => {
      const now = new Date();
      if (params.draftId) {
        const [updated] = await tx
          .update(postDrafts)
          .set({
            postType: params.postType,
            body: params.body,
            styleConfig: params.styleConfig ?? {},
            hashtags: params.hashtags ?? [],
            updatedAt: now,
          })
          .where(
            and(
              eq(postDrafts.id, params.draftId),
              eq(postDrafts.authorId, params.authorId)
            )
          )
          .returning();

        if (!updated) {
          throw new PostServiceError("DRAFT_NOT_FOUND", "Qoralama topilmadi", 404);
        }
        return updated;
      }

      const [created] = await tx
        .insert(postDrafts)
        .values({
          authorId: params.authorId,
          postType: params.postType,
          body: params.body,
          styleConfig: params.styleConfig ?? {},
          hashtags: params.hashtags ?? [],
          updatedAt: now,
        })
        .returning();

      return created!;
    }
  );
}

export async function deleteUserDraft(
  draftId: string,
  userId: string,
  role: UserRole
) {
  return withDbContext({ userId, role }, async (tx) => {
    const deleted = await tx
      .delete(postDrafts)
      .where(
        and(eq(postDrafts.id, draftId), eq(postDrafts.authorId, userId))
      )
      .returning({ id: postDrafts.id });
    return deleted.length > 0;
  });
}

// --- Follows & Bookmarks ---

export async function setFollowUser(params: {
  followerId: string;
  followerRole: UserRole;
  targetUserId: string;
  follow: boolean;
}): Promise<{ status: "following" | "requested" | "none" }> {
  if (params.followerId === params.targetUserId) {
    throw new PostServiceError(
      "CANNOT_FOLLOW_SELF",
      "O‘zingizga obuna bo‘la olmaysiz",
      400
    );
  }

  return withDbContext(
    { userId: params.followerId, role: params.followerRole },
    async (tx) => {
      if (!params.follow) {
        await tx
          .delete(follows)
          .where(
            and(
              eq(follows.followerId, params.followerId),
              eq(follows.followingId, params.targetUserId)
            )
          );
        await tx
          .delete(followRequests)
          .where(
            and(
              eq(followRequests.requesterId, params.followerId),
              eq(followRequests.targetId, params.targetUserId)
            )
          );
        return { status: "none" as const };
      }

      await assertNotBlockedInTx(
        tx,
        params.followerId,
        params.targetUserId,
        "follow_only"
      );

      // Already following?
      const [existingFollow] = await tx
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, params.followerId),
            eq(follows.followingId, params.targetUserId)
          )
        )
        .limit(1);

      if (existingFollow) {
        return { status: "following" as const };
      }

      const policyResult = await tx.execute(
        sql`SELECT privacy_level, auto_approve_follows FROM public.get_follow_policy(${params.targetUserId})`
      );
      const policyRow = (policyResult as unknown as {
        rows: Array<{ privacy_level: string; auto_approve_follows: boolean }>;
      }).rows[0];

      const requiresApproval =
        policyRow?.privacy_level === "private" ||
        policyRow?.auto_approve_follows === false;

      if (requiresApproval) {
        await tx
          .insert(followRequests)
          .values({
            requesterId: params.followerId,
            targetId: params.targetUserId,
            status: "pending",
          })
          .onConflictDoUpdate({
            target: [followRequests.requesterId, followRequests.targetId],
            set: { status: "pending", updatedAt: new Date() },
          });
        await createNotificationInTx(tx, {
          recipientId: params.targetUserId,
          actorId: params.followerId,
          type: "follow_request",
        });
        return { status: "requested" as const };
      }

      await tx
        .insert(follows)
        .values({
          followerId: params.followerId,
          followingId: params.targetUserId,
        })
        .onConflictDoNothing();
      await createNotificationInTx(tx, {
        recipientId: params.targetUserId,
        actorId: params.followerId,
        type: "follow",
      });
      return { status: "following" as const };
    }
  );
}

export async function listUserBookmarks(userId: string, role: UserRole) {
  return withDbContext({ userId, role }, async (tx) => {
    const rows = await tx
      .select({
        id: posts.id,
        authorId: posts.authorId,
        authorUsername: profiles.username,
        authorDisplayName: profiles.displayName,
        authorAvatarId: profiles.avatarId,
        authorVerified: sql<boolean>`public.is_user_verified(${posts.authorId})`,
        postType: posts.postType,
        body: posts.body,
        styleConfig: posts.styleConfig,
        commentPolicy: posts.commentPolicy,
        isEdited: posts.isEdited,
        editedAt: posts.editedAt,
        likesCount: posts.likesCount,
        commentsCount: posts.commentsCount,
        viewsCount: posts.viewsCount,
        repostsCount: posts.repostsCount,
        bookmarksCount: posts.bookmarksCount,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
      })
      .from(postBookmarks)
      .innerJoin(posts, eq(postBookmarks.postId, posts.id))
      .innerJoin(profiles, eq(posts.authorId, profiles.userId))
      .where(eq(postBookmarks.userId, userId))
      .orderBy(desc(postBookmarks.createdAt))
      .limit(50);

    return hydratePostsForViewer(tx, rows, userId);
  });
}

// --- Feeds: Siz uchun (for_you), Kuzatilayotganlar (following), Mashhurlar (trending) ---

export async function getFeedPosts(params: {
  tab: "for_you" | "following" | "trending";
  postType?: PostType;
  tag?: string;
  window: "24h" | "7d" | "30d";
  cursor?: string;
  limit: number;
  viewer: { userId: string; role: UserRole } | null;
}): Promise<HydratedPost[]> {
  return withDbContext(
    params.viewer
      ? { userId: params.viewer.userId, role: params.viewer.role }
      : { role: "anonymous", authFlow: true },
    async (tx) => {
      if (params.tab === "following" && !params.viewer) {
        return [];
      }

      const conditions = [];
      if (params.postType) {
        conditions.push(eq(posts.postType, params.postType));
      }

      let offset = 0;
      if (params.cursor) {
        if (params.cursor.startsWith("offset:")) {
          const parsedOffset = Number.parseInt(params.cursor.slice(7), 10);
          if (Number.isFinite(parsedOffset) && parsedOffset > 0 && parsedOffset <= 5000) {
            offset = parsedOffset;
          }
        } else {
          const cursorDate = new Date(params.cursor);
          if (!Number.isNaN(cursorDate.getTime())) {
            conditions.push(lt(posts.createdAt, cursorDate));
          }
        }
      }

      if (params.tag) {
        const cleanTag = normalizeHashtag(params.tag);
        if (!cleanTag) return [];
        const tagIds = await tx
          .select({ postId: postHashtags.postId })
          .from(postHashtags)
          .innerJoin(hashtags, eq(postHashtags.hashtagId, hashtags.id))
          .where(sql`lower(${hashtags.tag}) = ${cleanTag}`);

        if (tagIds.length === 0) return [];
        conditions.push(
          inArray(
            posts.id,
            tagIds.map((r) => r.postId)
          )
        );
      }

      if (params.tab === "following" && params.viewer) {
        const followingRows = await tx
          .select({ followingId: follows.followingId })
          .from(follows)
          .where(eq(follows.followerId, params.viewer.userId));

        if (followingRows.length === 0) return [];
        conditions.push(
          inArray(
            posts.authorId,
            followingRows.map((f) => f.followingId)
          )
        );
      }

      if (params.tab === "trending") {
        const windowHours =
          params.window === "24h" ? 24 : params.window === "30d" ? 720 : 168;
        const since = new Date(Date.now() - windowHours * 3600 * 1000);
        conditions.push(gte(posts.createdAt, since));
      }

      if (params.viewer) {
        conditions.push(
          sql`NOT public.is_blocked_between(${params.viewer.userId}::uuid, ${posts.authorId}, 'content_only')`
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Order strategies:
      // 1. following: strictly chronological
      // 2. trending: time-decay engagement score within time window
      // 3. for_you: discovery blend giving new authors a visibility boost
      const orderExpr =
        params.tab === "following"
          ? [desc(posts.createdAt), desc(posts.id)]
          : params.tab === "trending"
            ? [
                desc(
                  sql`(${posts.likesCount} * 2 + ${posts.commentsCount} * 3 + ${posts.repostsCount} * 4 + ${posts.bookmarksCount} * 2 + ${posts.viewsCount} * 0.2) / POWER(GREATEST(1, EXTRACT(EPOCH FROM (now() - ${posts.createdAt})) / 3600.0 + 2), 1.35)`
                ),
                desc(posts.createdAt),
              ]
            : [
                desc(
                  sql`((${posts.likesCount} * 1.5 + ${posts.commentsCount} * 2.5 + ${posts.repostsCount} * 3 + ${posts.bookmarksCount} * 1.5) + CASE WHEN ${profiles.postsCount} <= 5 OR ${profiles.followersCount} <= 20 THEN 12 ELSE 0 END) / POWER(GREATEST(1, EXTRACT(EPOCH FROM (now() - ${posts.createdAt})) / 3600.0 + 2), 1.1)`
                ),
                desc(posts.createdAt),
              ];

      const rows = await tx
        .select({
          id: posts.id,
          authorId: posts.authorId,
          authorUsername: profiles.username,
          authorDisplayName: profiles.displayName,
          authorAvatarId: profiles.avatarId,
          authorVerified: sql<boolean>`public.is_user_verified(${posts.authorId})`,
          postType: posts.postType,
          body: posts.body,
          styleConfig: posts.styleConfig,
          commentPolicy: posts.commentPolicy,
          isEdited: posts.isEdited,
          editedAt: posts.editedAt,
          likesCount: posts.likesCount,
          commentsCount: posts.commentsCount,
          viewsCount: posts.viewsCount,
          repostsCount: posts.repostsCount,
          bookmarksCount: posts.bookmarksCount,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .innerJoin(profiles, eq(posts.authorId, profiles.userId))
        .where(whereClause)
        .orderBy(...orderExpr)
        .limit(params.limit)
        .offset(offset);

      return hydratePostsForViewer(tx, rows, params.viewer?.userId ?? null);
    }
  );
}
