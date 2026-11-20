import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { normalizeHashtag } from "@/lib/validation/posts";
import { withDbContext } from "@/server/db/context";
import {
  hashtags,
  postHashtags,
  posts,
  profiles,
  type UserRole,
} from "@/server/db/schema";
import { hydratePostsForViewer, type HydratedPost } from "./posts.service";

export interface SearchResults {
  users: Array<{
    userId: string;
    username: string;
    displayName: string;
    bio: string;
    avatarId: string;
    followersCount: number;
    postsCount: number;
    verified: boolean;
  }>;
  hashtags: Array<{
    id: string;
    tag: string;
    postsCount: number;
  }>;
  posts: HydratedPost[];
}

export async function searchPlatform(params: {
  query: string;
  type: "all" | "posts" | "users" | "hashtags";
  tag?: string;
  limit: number;
  viewer: { userId: string; role: UserRole } | null;
}): Promise<SearchResults> {
  const q = params.query.trim();
  const cleanTag = params.tag ? normalizeHashtag(params.tag) : null;

  return withDbContext(
    params.viewer
      ? { userId: params.viewer.userId, role: params.viewer.role }
      : { role: "anonymous", authFlow: true },
    async (tx) => {
      const result: SearchResults = {
        users: [],
        hashtags: [],
        posts: [],
      };

      // Exact hashtag filter lookup
      if (cleanTag) {
        const tagRows = await tx
          .select({ postId: postHashtags.postId })
          .from(postHashtags)
          .innerJoin(hashtags, eq(postHashtags.hashtagId, hashtags.id))
          .where(sql`lower(${hashtags.tag}) = ${cleanTag}`);

        if (tagRows.length > 0) {
          const postRows = await tx
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
            .where(
              and(
                inArray(
                  posts.id,
                  tagRows.map((r) => r.postId)
                ),
                params.viewer
                  ? sql`NOT public.is_blocked_between(${params.viewer.userId}::uuid, ${posts.authorId}, 'content_only')`
                  : undefined
              )
            )
            .orderBy(desc(posts.createdAt))
            .limit(params.limit);

          result.posts = await hydratePostsForViewer(
            tx,
            postRows,
            params.viewer?.userId ?? null
          );
        }
      }

      if (!q && !cleanTag) {
        // Return top hashtags and recent users when query is empty
        result.hashtags = await tx
          .select({
            id: hashtags.id,
            tag: hashtags.tag,
            postsCount: hashtags.postsCount,
          })
          .from(hashtags)
          .orderBy(desc(hashtags.postsCount), hashtags.tag)
          .limit(10);
        return result;
      }

      if (!q) {
        return result;
      }

      const likePattern = `%${q.toLowerCase()}%`;
      const strippedTagQuery = `%${q.replace(/^#+/, "").toLowerCase()}%`;

      if (params.type === "all" || params.type === "users") {
        const userRows = await tx
          .select({
            userId: profiles.userId,
            username: profiles.username,
            displayName: profiles.displayName,
            bio: profiles.bio,
            avatarId: profiles.avatarId,
            followersCount: profiles.followersCount,
            postsCount: profiles.postsCount,
            verified: sql<boolean>`public.is_user_verified(${profiles.userId})`,
          })
          .from(profiles)
          .where(
            and(
              or(
                sql`lower(${profiles.username}) LIKE ${likePattern}`,
                sql`lower(${profiles.displayName}) LIKE ${likePattern}`
              ),
              params.viewer
                ? sql`NOT public.is_blocked_between(${params.viewer.userId}::uuid, ${profiles.userId}, 'content_only')`
                : undefined
            )
          )
          .orderBy(desc(profiles.followersCount), profiles.username)
          .limit(params.limit);

        result.users = userRows.map((u) => ({
          userId: u.userId,
          username: u.username,
          displayName: u.displayName,
          bio: u.bio,
          avatarId: u.avatarId,
          followersCount: u.followersCount,
          postsCount: u.postsCount,
          verified: Boolean(u.verified),
        }));
      }

      if (params.type === "all" || params.type === "hashtags") {
        result.hashtags = await tx
          .select({
            id: hashtags.id,
            tag: hashtags.tag,
            postsCount: hashtags.postsCount,
          })
          .from(hashtags)
          .where(sql`lower(${hashtags.tag}) LIKE ${strippedTagQuery}`)
          .orderBy(desc(hashtags.postsCount), hashtags.tag)
          .limit(params.limit);
      }

      if (!cleanTag && (params.type === "all" || params.type === "posts")) {
        const postRows = await tx
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
          .where(
            and(
              or(
                sql`"posts"."search_vector" @@ plainto_tsquery('simple', ${q})`,
                sql`lower(${posts.body}) LIKE ${likePattern}`
              ),
              params.viewer
                ? sql`NOT public.is_blocked_between(${params.viewer.userId}::uuid, ${posts.authorId}, 'content_only')`
                : undefined
            )
          )
          .orderBy(desc(posts.createdAt))
          .limit(params.limit);

        result.posts = await hydratePostsForViewer(
          tx,
          postRows,
          params.viewer?.userId ?? null
        );
      }

      return result;
    }
  );
}
