import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@/lib/validation/notifications";
import { extractMentionsFromText } from "@/lib/validation/social";
import { type DbTransaction, withDbContext } from "@/server/db/context";
import {
  commentReports,
  dmMessages,
  dmThreads,
  followRequests,
  follows,
  notifications,
  postComments,
  posts,
  profiles,
  userBlocks,
  type BlockLevel,
  type CommentReportReason,
  type UserRole,
} from "@/server/db/schema";
import { AUDIT_EVENTS, writeAuditLog } from "./audit.service";
import { recordAutomatedFlagInTx } from "./auto-moderation.service";
import {
  formatTelegramNotificationMessage,
  sendTelegramBotMessage,
} from "./telegram-bot.service";

export class SocialServiceError extends Error {
  constructor(
    public readonly code:
      | "USER_BLOCKED"
      | "CANNOT_BLOCK_SELF"
      | "CANNOT_DM_SELF"
      | "RECIPIENT_NOT_FOUND"
      | "DM_THREAD_NOT_FOUND"
      | "DM_REQUEST_DECLINED"
      | "DM_REQUEST_PENDING"
      | "COMMENT_NOT_FOUND"
      | "ALREADY_REPORTED",
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "SocialServiceError";
  }
}

export async function isBlockedInTx(
  tx: DbTransaction,
  userA: string,
  userB: string,
  scope: "dm_only" | "follow_only" | "content_only"
): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  const res = await tx.execute(
    sql`SELECT public.is_blocked_between(${userA}::uuid, ${userB}::uuid, ${scope}) AS blocked`
  );
  const row = (res as unknown as { rows: Array<{ blocked: boolean }> }).rows[0];
  return Boolean(row?.blocked);
}

export async function assertNotBlockedInTx(
  tx: DbTransaction,
  userA: string,
  userB: string,
  scope: "dm_only" | "follow_only" | "content_only"
): Promise<void> {
  if (await isBlockedInTx(tx, userA, userB, scope)) {
    throw new SocialServiceError(
      "USER_BLOCKED",
      "Foydalanuvchi cheklovi tufayli bu amalni bajarib bo‘lmaydi",
      403
    );
  }
}

// --- Mentions & Notifications ---

export async function dispatchMentionNotificationsInTx(
  tx: DbTransaction,
  params: {
    actorId: string;
    text: string;
    postId: string;
    commentId?: string | null;
  }
): Promise<void> {
  const handles = extractMentionsFromText(params.text);
  if (handles.length === 0) return;

  const matchedProfiles = await tx
    .select({ userId: profiles.userId, username: profiles.username })
    .from(profiles)
    .where(inArray(sql`lower(${profiles.username})`, handles));

  const preview = params.text.trim().slice(0, 140);

  for (const recipient of matchedProfiles) {
    if (recipient.userId === params.actorId) continue;
    await createNotificationInTx(tx, {
      recipientId: recipient.userId,
      actorId: params.actorId,
      type: "mention",
      postId: params.postId,
      commentId: params.commentId ?? null,
      bodyPreview: preview,
    });
  }
}

export type AppNotificationType =
  | "like"
  | "comment"
  | "reply"
  | "repost"
  | "follow"
  | "follow_request"
  | "mention"
  | "dm"
  | "dm_request"
  | "avatar_unlocked"
  | "announcement"
  | "warning"
  | "appeal";

function mapTypeToPreferenceKey(
  type: AppNotificationType
): NotificationPreferenceKey | null {
  switch (type) {
    case "like":
      return "like";
    case "comment":
      return "comment";
    case "reply":
      return "reply";
    case "follow":
    case "follow_request":
      return "follow";
    case "mention":
      return "mention";
    case "dm":
    case "dm_request":
      return "dm";
    case "avatar_unlocked":
      return "avatar_unlocked";
    case "announcement":
      return "announcement";
    case "repost":
    case "warning":
    case "appeal":
      return null;
  }
}

export async function createNotificationInTx(
  tx: DbTransaction,
  params: {
    recipientId: string;
    actorId: string;
    type: AppNotificationType;
    postId?: string | null;
    commentId?: string | null;
    bodyPreview?: string | null;
  }
): Promise<boolean> {
  const allowSelf =
    params.type === "avatar_unlocked" ||
    params.type === "announcement" ||
    params.type === "warning" ||
    params.type === "appeal";

  if (!allowSelf && params.recipientId === params.actorId) {
    return false;
  }

  const bypassBlockCheck =
    params.type === "announcement" ||
    params.type === "warning" ||
    params.type === "appeal" ||
    params.type === "avatar_unlocked";

  if (
    !bypassBlockCheck &&
    (await isBlockedInTx(tx, params.actorId, params.recipientId, "content_only"))
  ) {
    return false;
  }

  const deliveryRes = await tx.execute(
    sql`SELECT telegram_bot_started, telegram_notifications, telegram_chat_id, notification_preferences FROM public.get_notification_delivery_settings(${params.recipientId}::uuid)`
  );
  const delivery = (
    deliveryRes as unknown as {
      rows: Array<{
        telegram_bot_started: boolean;
        telegram_notifications: boolean;
        telegram_chat_id: string | null;
        notification_preferences: Partial<NotificationPreferences> | null;
      }>;
    }
  ).rows[0];

  const prefKey = mapTypeToPreferenceKey(params.type);
  if (prefKey) {
    const mergedPrefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(delivery?.notification_preferences ?? {}),
    };
    if (mergedPrefs[prefKey] === false) {
      return false;
    }
  }

  const safePreview = params.bodyPreview ? params.bodyPreview.slice(0, 140) : null;

  await tx.insert(notifications).values({
    recipientId: params.recipientId,
    actorId: params.actorId,
    type: params.type,
    postId: params.postId ?? null,
    commentId: params.commentId ?? null,
    bodyPreview: safePreview,
  });

  if (
    delivery?.telegram_bot_started &&
    delivery?.telegram_notifications &&
    delivery?.telegram_chat_id
  ) {
    let actorUsername: string | undefined;
    let actorDisplayName: string | undefined;
    if (params.actorId !== params.recipientId) {
      const [actorProf] = await tx
        .select({
          username: profiles.username,
          displayName: profiles.displayName,
        })
        .from(profiles)
        .where(eq(profiles.userId, params.actorId))
        .limit(1);
      actorUsername = actorProf?.username;
      actorDisplayName = actorProf?.displayName;
    }

    const msgText = formatTelegramNotificationMessage({
      type: params.type,
      actorUsername,
      actorDisplayName,
      bodyPreview: safePreview,
    });
    void sendTelegramBotMessage(delivery.telegram_chat_id, msgText);
  }

  return true;
}

export async function listMyNotifications(userId: string, role: UserRole) {
  return withDbContext({ userId, role }, async (tx) => {
    const rows = await tx
      .select({
        id: notifications.id,
        type: notifications.type,
        postId: notifications.postId,
        commentId: notifications.commentId,
        bodyPreview: notifications.bodyPreview,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        actorId: notifications.actorId,
        actorUsername: profiles.username,
        actorDisplayName: profiles.displayName,
        actorAvatarId: profiles.avatarId,
        postSnippet: sql<string | null>`left(${posts.body}, 120)`,
      })
      .from(notifications)
      .innerJoin(profiles, eq(notifications.actorId, profiles.userId))
      .leftJoin(posts, eq(notifications.postId, posts.id))
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return rows;
  });
}

export async function markAllNotificationsRead(userId: string, role: UserRole) {
  await withDbContext({ userId, role }, async (tx) => {
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientId, userId),
          isNull(notifications.readAt)
        )
      );
  });
}

// --- Granular Blocking ---

export async function setUserBlock(params: {
  blockerId: string;
  blockerRole: UserRole;
  blockedId: string;
  level: BlockLevel;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  if (params.blockerId === params.blockedId) {
    throw new SocialServiceError(
      "CANNOT_BLOCK_SELF",
      "O‘zingizni bloklay olmaysiz",
      400
    );
  }

  await withDbContext(
    { userId: params.blockerId, role: params.blockerRole },
    async (tx) => {
      await tx
        .insert(userBlocks)
        .values({
          blockerId: params.blockerId,
          blockedId: params.blockedId,
          level: params.level,
        })
        .onConflictDoUpdate({
          target: [userBlocks.blockerId, userBlocks.blockedId],
          set: { level: params.level, updatedAt: new Date() },
        });

      // If follow is restricted or full block, sever any follow relationship
      if (params.level === "follow_only" || params.level === "full") {
        await tx
          .delete(follows)
          .where(
            and(
              eq(follows.followerId, params.blockerId),
              eq(follows.followingId, params.blockedId)
            )
          );
        await tx
          .delete(followRequests)
          .where(
            or(
              and(
                eq(followRequests.requesterId, params.blockerId),
                eq(followRequests.targetId, params.blockedId)
              ),
              and(
                eq(followRequests.requesterId, params.blockedId),
                eq(followRequests.targetId, params.blockerId)
              )
            )
          );
      }

      await writeAuditLog(tx, {
        actorId: params.blockerId,
        actorRole: params.blockerRole,
        eventType: AUDIT_EVENTS.USER_BLOCKED,
        targetType: "user",
        targetId: params.blockedId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: { level: params.level },
      });
    }
  );
}

export async function removeUserBlock(params: {
  blockerId: string;
  blockerRole: UserRole;
  blockedId: string;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  await withDbContext(
    { userId: params.blockerId, role: params.blockerRole },
    async (tx) => {
      await tx
        .delete(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerId, params.blockerId),
            eq(userBlocks.blockedId, params.blockedId)
          )
        );

      await writeAuditLog(tx, {
        actorId: params.blockerId,
        actorRole: params.blockerRole,
        eventType: AUDIT_EVENTS.USER_UNBLOCKED,
        targetType: "user",
        targetId: params.blockedId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });
    }
  );
}

export async function listMyBlocks(userId: string, role: UserRole) {
  return withDbContext({ userId, role }, async (tx) => {
    return tx
      .select({
        blockedId: userBlocks.blockedId,
        level: userBlocks.level,
        createdAt: userBlocks.createdAt,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarId: profiles.avatarId,
      })
      .from(userBlocks)
      .innerJoin(profiles, eq(userBlocks.blockedId, profiles.userId))
      .where(eq(userBlocks.blockerId, userId))
      .orderBy(desc(userBlocks.updatedAt));
  });
}

// --- Direct Messages (Text-Only + Message Requests) ---

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function listDmThreads(userId: string, role: UserRole) {
  return withDbContext({ userId, role }, async (tx) => {
    const threads = await tx
      .select()
      .from(dmThreads)
      .where(or(eq(dmThreads.user1Id, userId), eq(dmThreads.user2Id, userId)))
      .orderBy(desc(dmThreads.lastMessageAt))
      .limit(50);

    if (threads.length === 0) return [];

    const partnerIds = Array.from(
      new Set(
        threads.map((t) => (t.user1Id === userId ? t.user2Id : t.user1Id))
      )
    );
    const partnerProfiles = await tx
      .select({
        userId: profiles.userId,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarId: profiles.avatarId,
      })
      .from(profiles)
      .where(inArray(profiles.userId, partnerIds));
    const partnerMap = new Map(partnerProfiles.map((p) => [p.userId, p]));

    const results = [];
    for (const thread of threads) {
      const partnerId =
        thread.user1Id === userId ? thread.user2Id : thread.user1Id;

      if (await isBlockedInTx(tx, userId, partnerId, "dm_only")) {
        continue;
      }

      const partner = partnerMap.get(partnerId);

      const messages = await tx
        .select()
        .from(dmMessages)
        .where(eq(dmMessages.threadId, thread.id))
        .orderBy(dmMessages.createdAt)
        .limit(100);

      results.push({
        id: thread.id,
        status: thread.status,
        initiatedBy: thread.initiatedBy,
        isIncomingRequest:
          thread.status === "pending" && thread.initiatedBy !== userId,
        lastMessageAt: thread.lastMessageAt.toISOString(),
        partner: partner ?? {
          userId: partnerId,
          username: "user",
          displayName: "Avero User",
          avatarId: "av_01",
        },
        messages: messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    }

    return results;
  });
}

export async function sendDmMessage(params: {
  senderId: string;
  senderRole: UserRole;
  recipientId: string;
  body: string;
}) {
  if (params.senderId === params.recipientId) {
    throw new SocialServiceError(
      "CANNOT_DM_SELF",
      "O‘zingizga shaxsiy xabar yubora olmaysiz",
      400
    );
  }

  return withDbContext(
    { userId: params.senderId, role: params.senderRole },
    async (tx) => {
      await assertNotBlockedInTx(tx, params.senderId, params.recipientId, "dm_only");

      const [recipientExists] = await tx
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.userId, params.recipientId))
        .limit(1);

      if (!recipientExists) {
        throw new SocialServiceError(
          "RECIPIENT_NOT_FOUND",
          "Qabul qiluvchi topilmadi",
          404
        );
      }

      const [u1, u2] = canonicalPair(params.senderId, params.recipientId);
      const [existingThread] = await tx
        .select()
        .from(dmThreads)
        .where(and(eq(dmThreads.user1Id, u1), eq(dmThreads.user2Id, u2)))
        .limit(1);

      let thread = existingThread;
      if (!thread) {
        // First-time message goes as a Message Request (`status = 'pending'`)
        const [created] = await tx
          .insert(dmThreads)
          .values({
            user1Id: u1,
            user2Id: u2,
            initiatedBy: params.senderId,
            status: "pending",
          })
          .returning();
        thread = created!;
      } else if (thread.status === "declined") {
        throw new SocialServiceError(
          "DM_REQUEST_DECLINED",
          "Xabar so‘rovi rad etilgan",
          403
        );
      } else if (
        thread.status === "pending" &&
        thread.initiatedBy === params.senderId
      ) {
        // Prevent spamming before recipient accepts the initial message request
        const existingMsgs = await tx
          .select({ id: dmMessages.id })
          .from(dmMessages)
          .where(eq(dmMessages.threadId, thread.id))
          .limit(1);

        if (existingMsgs.length >= 1) {
          throw new SocialServiceError(
            "DM_REQUEST_PENDING",
            "Qabul qiluvchi xabar so‘rovingizni tasdiqlashini kuting",
            429
          );
        }
      }

      const now = new Date();
      const [msg] = await tx
        .insert(dmMessages)
        .values({
          threadId: thread.id,
          senderId: params.senderId,
          body: params.body,
        })
        .returning();

      await tx
        .update(dmThreads)
        .set({ lastMessageAt: now })
        .where(eq(dmThreads.id, thread.id));

      await recordAutomatedFlagInTx(tx, {
        contentType: "dm",
        contentId: msg!.id,
        authorId: params.senderId,
        authorRole: params.senderRole,
        text: params.body,
      });

      await createNotificationInTx(tx, {
        recipientId: params.recipientId,
        actorId: params.senderId,
        type: !existingThread ? "dm_request" : "dm",
        bodyPreview: params.body.slice(0, 140),
      });

      return {
        threadId: thread.id,
        threadStatus: thread.status,
        message: {
          id: msg!.id,
          senderId: msg!.senderId,
          body: msg!.body,
          createdAt: msg!.createdAt.toISOString(),
        },
      };
    }
  );
}

export async function respondToDmRequest(params: {
  threadId: string;
  userId: string;
  role: UserRole;
  action: "accept" | "decline";
}) {
  return withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const [thread] = await tx
        .select()
        .from(dmThreads)
        .where(
          and(
            eq(dmThreads.id, params.threadId),
            or(
              eq(dmThreads.user1Id, params.userId),
              eq(dmThreads.user2Id, params.userId)
            )
          )
        )
        .limit(1);

      if (!thread || thread.initiatedBy === params.userId) {
        throw new SocialServiceError(
          "DM_THREAD_NOT_FOUND",
          "Xabar so‘rovi topilmadi",
          404
        );
      }

      const nextStatus = params.action === "accept" ? "accepted" : "declined";
      await tx
        .update(dmThreads)
        .set({ status: nextStatus })
        .where(eq(dmThreads.id, thread.id));

      return { status: nextStatus };
    }
  );
}

// --- Comment-Only Reports ---

export async function reportComment(params: {
  reporterId: string;
  reporterRole: UserRole;
  commentId: string;
  reasonCode: CommentReportReason;
  details?: string;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  return withDbContext(
    { userId: params.reporterId, role: params.reporterRole },
    async (tx) => {
      const [comment] = await tx
        .select({ id: postComments.id })
        .from(postComments)
        .where(eq(postComments.id, params.commentId))
        .limit(1);

      if (!comment) {
        throw new SocialServiceError(
          "COMMENT_NOT_FOUND",
          "Izoh topilmadi",
          404
        );
      }

      const existing = await tx
        .select({ id: commentReports.id })
        .from(commentReports)
        .where(
          and(
            eq(commentReports.reporterId, params.reporterId),
            eq(commentReports.commentId, params.commentId)
          )
        )
        .limit(1);

      if (existing[0]) {
        throw new SocialServiceError(
          "ALREADY_REPORTED",
          "Siz bu izoh ustidan allaqachon shikoyat yuborgansiz",
          409
        );
      }

      const [report] = await tx
        .insert(commentReports)
        .values({
          reporterId: params.reporterId,
          commentId: params.commentId,
          reasonCode: params.reasonCode,
          details: params.details ?? null,
        })
        .returning();

      await writeAuditLog(tx, {
        actorId: params.reporterId,
        actorRole: params.reporterRole,
        eventType: AUDIT_EVENTS.COMMENT_REPORTED,
        targetType: "comment",
        targetId: params.commentId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: { reasonCode: params.reasonCode },
      });

      return report!;
    }
  );
}
