import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { isValidUsernameFormat } from "@/lib/validation/account";
import { sanitizeBaseUsername } from "@/server/auth/account";
import { withDbContext } from "@/server/db/context";
import {
  followRequests,
  follows,
  posts,
  profiles,
  userBlocks,
  type BlockLevel,
  type ExternalLinkItem,
  type UserRole,
} from "@/server/db/schema";
import {
  getOwnerActivityStats,
  type OwnerActivityStats,
} from "./activity.service";
import { AUDIT_EVENTS, writeAuditLog } from "./audit.service";
import { hydratePostsForViewer, type HydratedPost } from "./posts.service";
import { createNotificationInTx, isBlockedInTx } from "./social.service";

export class ProfileServiceError extends Error {
  constructor(
    public readonly code:
      | "PROFILE_NOT_FOUND"
      | "USERNAME_TAKEN"
      | "AVATAR_LOCKED"
      | "FOLLOW_REQUEST_NOT_FOUND",
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "ProfileServiceError";
  }
}

export interface ProfileBadge {
  id: string;
  label: string;
  tone: "accent" | "success" | "glass" | "matte";
}

export interface PublicProfileData {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarId: string;
  externalLinks: ExternalLinkItem[];
  followersCount: number;
  followingCount: number;
  postsCount: number;
  badges: ProfileBadge[];
  privacyLevel: "public" | "private" | "followers_only";
  autoApproveFollows: boolean;
  online: boolean;
  followStatus: "self" | "none" | "following" | "requested";
  myBlockLevel: BlockLevel | "none";
  contentBlocked: boolean;
  createdAt: string;
  posts: HydratedPost[];
}

export interface IncomingFollowRequestItem {
  id: string;
  requesterId: string;
  requesterUsername: string;
  requesterDisplayName: string;
  requesterAvatarId: string;
  createdAt: string;
}

function buildProfileBadges(params: {
  role: UserRole;
  verified: boolean;
  postsCount: number;
  privacyLevel: string;
}): ProfileBadge[] {
  const badges: ProfileBadge[] = [];
  if (params.verified) {
    badges.push({ id: "verified", label: "Tasdiqlangan", tone: "accent" });
  }
  if (params.role === "admin") {
    badges.push({ id: "admin", label: "Admin", tone: "glass" });
  } else if (params.role === "moderator") {
    badges.push({ id: "moderator", label: "Moderator", tone: "glass" });
  }
  if (params.postsCount >= 5) {
    badges.push({ id: "writer", label: "Faol muallif", tone: "success" });
  }
  if (params.privacyLevel === "private") {
    badges.push({ id: "private_follow", label: "Yopiq kuzatuv", tone: "matte" });
  }
  return badges;
}

export async function getPublicProfileByUsername(
  username: string,
  viewer: { userId: string; role: UserRole } | null
): Promise<PublicProfileData | null> {
  const normalized = username.trim().toLowerCase();

  return withDbContext(
    viewer
      ? { userId: viewer.userId, role: viewer.role }
      : { role: "anonymous", authFlow: true },
    async (tx) => {
      const [row] = await tx
        .select({
          userId: profiles.userId,
          username: profiles.username,
          displayName: profiles.displayName,
          bio: profiles.bio,
          avatarId: profiles.avatarId,
          externalLinks: profiles.externalLinks,
          followersCount: profiles.followersCount,
          followingCount: profiles.followingCount,
          postsCount: profiles.postsCount,
          createdAt: profiles.createdAt,
          verified: sql<boolean>`public.is_user_verified(${profiles.userId})`,
          online: sql<boolean>`public.is_profile_online(${profiles.userId})`,
        })
        .from(profiles)
        .where(sql`lower(${profiles.username}) = ${normalized}`)
        .limit(1);

      if (!row) return null;

      const policyResult = await tx.execute(
        sql`SELECT privacy_level, auto_approve_follows FROM public.get_follow_policy(${row.userId})`
      );
      const policyRow = (policyResult as unknown as {
        rows: Array<{ privacy_level: string; auto_approve_follows: boolean }>;
      }).rows[0];

      const privacyLevel =
        (policyRow?.privacy_level as "public" | "private" | "followers_only") ??
        "public";
      const autoApproveFollows = policyRow?.auto_approve_follows ?? true;

      let followStatus: PublicProfileData["followStatus"] = "none";
      if (viewer) {
        if (viewer.userId === row.userId) {
          followStatus = "self";
        } else {
          const [isFollowing] = await tx
            .select({ followerId: follows.followerId })
            .from(follows)
            .where(
              and(
                eq(follows.followerId, viewer.userId),
                eq(follows.followingId, row.userId)
              )
            )
            .limit(1);
          if (isFollowing) {
            followStatus = "following";
          } else {
            const [pendingReq] = await tx
              .select({ id: followRequests.id })
              .from(followRequests)
              .where(
                and(
                  eq(followRequests.requesterId, viewer.userId),
                  eq(followRequests.targetId, row.userId),
                  eq(followRequests.status, "pending")
                )
              )
              .limit(1);
            if (pendingReq) {
              followStatus = "requested";
            }
          }
        }
      }

      // All profiles and posts are public even when privacyLevel === 'private',
      // unless a content_only / full block applies between viewer and profile owner.
      let myBlockLevel: BlockLevel | "none" = "none";
      let contentBlocked = false;
      if (viewer && viewer.userId !== row.userId) {
        const [myBlock] = await tx
          .select({ level: userBlocks.level })
          .from(userBlocks)
          .where(
            and(
              eq(userBlocks.blockerId, viewer.userId),
              eq(userBlocks.blockedId, row.userId)
            )
          )
          .limit(1);
        myBlockLevel = (myBlock?.level as BlockLevel) ?? "none";
        contentBlocked = await isBlockedInTx(
          tx,
          viewer.userId,
          row.userId,
          "content_only"
        );
      }

      let hydratedPosts: HydratedPost[] = [];
      if (!contentBlocked) {
        const rawPosts = await tx
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
          .where(eq(posts.authorId, row.userId))
          .orderBy(desc(posts.createdAt))
          .limit(30);

        hydratedPosts = await hydratePostsForViewer(
          tx,
          rawPosts,
          viewer?.userId ?? null
        );
      }

      return {
        userId: row.userId,
        username: row.username,
        displayName: row.displayName,
        bio: row.bio,
        avatarId: row.avatarId,
        externalLinks: row.externalLinks ?? [],
        followersCount: row.followersCount,
        followingCount: row.followingCount,
        postsCount: row.postsCount,
        badges: buildProfileBadges({
          role: "user",
          verified: Boolean(row.verified),
          postsCount: row.postsCount,
          privacyLevel,
        }),
        privacyLevel,
        autoApproveFollows,
        online: Boolean(row.online),
        followStatus,
        myBlockLevel,
        contentBlocked,
        createdAt: row.createdAt.toISOString(),
        posts: hydratedPosts,
      };
    }
  );
}

export async function getOwnProfileDashboard(
  userId: string,
  role: UserRole
): Promise<{
  profile: PublicProfileData;
  activity: OwnerActivityStats;
  followRequests: IncomingFollowRequestItem[];
}> {
  const activity = await getOwnerActivityStats(userId, role);

  return withDbContext({ userId, role }, async (tx) => {
    const [row] = await tx
      .select({
        userId: profiles.userId,
        username: profiles.username,
        displayName: profiles.displayName,
        bio: profiles.bio,
        avatarId: profiles.avatarId,
        externalLinks: profiles.externalLinks,
        followersCount: profiles.followersCount,
        followingCount: profiles.followingCount,
        postsCount: profiles.postsCount,
        createdAt: profiles.createdAt,
        verified: sql<boolean>`public.is_user_verified(${profiles.userId})`,
        online: sql<boolean>`public.is_profile_online(${profiles.userId})`,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!row) {
      throw new ProfileServiceError("PROFILE_NOT_FOUND", "Profil topilmadi", 404);
    }

    const policyResult = await tx.execute(
      sql`SELECT privacy_level, auto_approve_follows FROM public.get_follow_policy(${userId})`
    );
    const policyRow = (policyResult as unknown as {
      rows: Array<{ privacy_level: string; auto_approve_follows: boolean }>;
    }).rows[0];

    const privacyLevel =
      (policyRow?.privacy_level as "public" | "private" | "followers_only") ??
      "public";
    const autoApproveFollows = policyRow?.auto_approve_follows ?? true;

    const rawPosts = await tx
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
      .where(eq(posts.authorId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(30);

    const hydratedPosts = await hydratePostsForViewer(tx, rawPosts, userId);

    const reqRows = await tx
      .select({
        id: followRequests.id,
        requesterId: followRequests.requesterId,
        requesterUsername: profiles.username,
        requesterDisplayName: profiles.displayName,
        requesterAvatarId: profiles.avatarId,
        createdAt: followRequests.createdAt,
      })
      .from(followRequests)
      .innerJoin(profiles, eq(followRequests.requesterId, profiles.userId))
      .where(
        and(
          eq(followRequests.targetId, userId),
          eq(followRequests.status, "pending")
        )
      )
      .orderBy(desc(followRequests.createdAt));

    return {
      profile: {
        userId: row.userId,
        username: row.username,
        displayName: row.displayName,
        bio: row.bio,
        avatarId: row.avatarId,
        externalLinks: row.externalLinks ?? [],
        followersCount: row.followersCount,
        followingCount: row.followingCount,
        postsCount: row.postsCount,
        badges: buildProfileBadges({
          role,
          verified: Boolean(row.verified),
          postsCount: row.postsCount,
          privacyLevel,
        }),
        privacyLevel,
        autoApproveFollows,
        online: Boolean(row.online),
        followStatus: "self",
        myBlockLevel: "none",
        contentBlocked: false,
        createdAt: row.createdAt.toISOString(),
        posts: hydratedPosts,
      },
      activity,
      followRequests: reqRows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });
}

export async function suggestAvailableUsernames(
  preferred: string
): Promise<string[]> {
  const base = sanitizeBaseUsername(preferred || "avero_user");
  const candidates = new Set<string>();
  const year = String(new Date().getFullYear()).slice(-2);

  const seeds = [
    base,
    `${base.slice(0, 17)}.uz`,
    `${base.slice(0, 17)}_${year}`,
    `${base.slice(0, 14)}_${crypto.randomBytes(2).toString("hex")}`,
    `${base.slice(0, 14)}.${crypto.randomBytes(2).toString("hex")}`,
  ];

  for (const s of seeds) {
    if (isValidUsernameFormat(s)) {
      candidates.add(s);
    }
  }

  return withDbContext({ role: "anonymous" }, async (tx) => {
    const available: string[] = [];
    for (const c of candidates) {
      const exists = await tx
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(sql`lower(${profiles.username}) = ${c}`)
        .limit(1);
      if (exists.length === 0) {
        available.push(c);
      }
      if (available.length >= 4) break;
    }
    return available;
  });
}

export async function updateOwnProfile(params: {
  userId: string;
  role: UserRole;
  username?: string;
  displayName?: string;
  bio?: string;
  avatarId?: string;
  externalLinks?: ExternalLinkItem[];
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  const activity = await getOwnerActivityStats(params.userId, params.role);

  if (
    params.avatarId &&
    !activity.unlockedAvatars.includes(params.avatarId)
  ) {
    throw new ProfileServiceError(
      "AVATAR_LOCKED",
      "Bu avatar hali ochilmagan. Vaqt va 3 kunlik faollik orqali ochiladi.",
      403
    );
  }

  return withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      if (params.username) {
        const taken = await tx
          .select({ userId: profiles.userId })
          .from(profiles)
          .where(sql`lower(${profiles.username}) = ${params.username}`)
          .limit(1);

        if (taken[0] && taken[0].userId !== params.userId) {
          throw new ProfileServiceError(
            "USERNAME_TAKEN",
            "Bu username allaqachon band qilingan",
            409
          );
        }
      }

      const [updated] = await tx
        .update(profiles)
        .set({
          ...(params.username !== undefined
            ? { username: params.username }
            : {}),
          ...(params.displayName !== undefined
            ? { displayName: params.displayName }
            : {}),
          ...(params.bio !== undefined ? { bio: params.bio } : {}),
          ...(params.avatarId !== undefined
            ? { avatarId: params.avatarId }
            : {}),
          ...(params.externalLinks !== undefined
            ? { externalLinks: params.externalLinks }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, params.userId))
        .returning();

      await writeAuditLog(tx, {
        actorId: params.userId,
        actorRole: params.role,
        eventType: AUDIT_EVENTS.PROFILE_UPDATED,
        targetType: "profile",
        targetId: params.userId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });

      return updated!;
    }
  );
}

export async function listIncomingFollowRequests(
  userId: string,
  role: UserRole
): Promise<IncomingFollowRequestItem[]> {
  return withDbContext({ userId, role }, async (tx) => {
    const rows = await tx
      .select({
        id: followRequests.id,
        requesterId: followRequests.requesterId,
        requesterUsername: profiles.username,
        requesterDisplayName: profiles.displayName,
        requesterAvatarId: profiles.avatarId,
        createdAt: followRequests.createdAt,
      })
      .from(followRequests)
      .innerJoin(profiles, eq(followRequests.requesterId, profiles.userId))
      .where(
        and(
          eq(followRequests.targetId, userId),
          eq(followRequests.status, "pending")
        )
      )
      .orderBy(desc(followRequests.createdAt));

    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function respondToFollowRequest(params: {
  requestId: string;
  ownerId: string;
  ownerRole: UserRole;
  action: "accept" | "decline";
}): Promise<{ status: "accepted" | "declined" }> {
  return withDbContext(
    { userId: params.ownerId, role: params.ownerRole },
    async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(followRequests)
        .where(
          and(
            eq(followRequests.id, params.requestId),
            eq(followRequests.targetId, params.ownerId),
            eq(followRequests.status, "pending")
          )
        )
        .limit(1);

      if (!reqRow) {
        throw new ProfileServiceError(
          "FOLLOW_REQUEST_NOT_FOUND",
          "Kuzatish so‘rovi topilmadi",
          404
        );
      }

      const nextStatus = params.action === "accept" ? "accepted" : "declined";

      await tx
        .update(followRequests)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(followRequests.id, reqRow.id));

      if (params.action === "accept") {
        await tx
          .insert(follows)
          .values({
            followerId: reqRow.requesterId,
            followingId: reqRow.targetId,
          })
          .onConflictDoNothing();

        await createNotificationInTx(tx, {
          recipientId: reqRow.requesterId,
          actorId: params.ownerId,
          type: "follow",
          bodyPreview: "Kuzatish so‘rovingiz tasdiqlandi",
        });
      }

      return { status: nextStatus };
    }
  );
}
