import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  DELEGATABLE_ADMIN_PERMISSIONS,
  ROLE_HIERARCHY,
  type PermissionCode,
} from "@/server/auth/permissions";
import { type DbTransaction, withDbContext } from "@/server/db/context";
import {
  adminUserPermissions,
  auditLogs,
  commentReports,
  moderationAppeals,
  moderationFlags,
  platformAnnouncements,
  postComments,
  profiles,
  userSessions,
  userWarnings,
  users,
  type UserRole,
} from "@/server/db/schema";
import { AUDIT_EVENTS, writeAuditLog } from "./audit.service";
import { createNotificationInTx } from "./social.service";

export class ModerationServiceError extends Error {
  constructor(
    public readonly code:
      | "TARGET_NOT_FOUND"
      | "CANNOT_MODIFY_SELF"
      | "INSUFFICIENT_HIERARCHY"
      | "INVALID_TARGET_ROLE"
      | "INVALID_PERMISSION"
      | "HUMAN_CONFIRMATION_REQUIRED"
      | "REPORT_NOT_FOUND"
      | "FLAG_NOT_FOUND"
      | "APPEAL_NOT_FOUND"
      | "COMMENT_NOT_FOUND",
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "ModerationServiceError";
  }
}

export interface AutoModerationResult {
  flagged: boolean;
  severity: "low" | "medium" | "high";
  reasons: string[];
}

const DOXXING_PATTERNS = [
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  /(pasport|passport|karta\s*raqam|pinfl|jshshir)\s*[:#-]?\s*[a-z0-9]{6,}/i,
];

const SEVERE_ABUSE_PATTERNS = [
  /\b(o['‘`]?ldiraman|joniga\s*qasd|bomb|terror)\b/i,
];

const SPAM_SCAM_PATTERNS = [
  /(tekin\s*pul|kafolatlangan\s*daromad|kazino|stavka|free\s*crypto)/i,
  /(https?:\/\/[^\s]+.*){3,}/i,
];

/**
 * Deterministic automated first-pass content screening.
 * Never performs automatic permanent bans; high/medium matches are queued for human Moderator/Admin review.
 */
export function runAutomatedContentCheck(text: string): AutoModerationResult {
  const normalized = text.normalize("NFC").trim();
  const reasons: string[] = [];
  let severity: "low" | "medium" | "high" = "low";

  if (DOXXING_PATTERNS.some((re) => re.test(normalized))) {
    reasons.push("Shaxsiy yoki moliyaviy ma’lumot (doxxing) ehtimoli");
    severity = "high";
  }

  if (SEVERE_ABUSE_PATTERNS.some((re) => re.test(normalized))) {
    reasons.push("Tahdid yoki zo‘ravonlikka oid ibora");
    severity = "high";
  }

  if (SPAM_SCAM_PATTERNS.some((re) => re.test(normalized))) {
    reasons.push("Spam yoki shubhali havolalar");
    if (severity === "low") severity = "medium";
  }

  return {
    flagged: reasons.length > 0,
    severity,
    reasons,
  };
}

export async function recordAutomatedFlagInTx(
  tx: DbTransaction,
  params: {
    contentType: "post" | "comment" | "dm";
    contentId: string;
    authorId: string;
    authorRole: UserRole;
    text: string;
  }
): Promise<AutoModerationResult> {
  const scan = runAutomatedContentCheck(params.text);
  if (!scan.flagged) {
    return scan;
  }

  await tx.insert(moderationFlags).values({
    contentType: params.contentType,
    contentId: params.contentId,
    authorId: params.authorId,
    severity: scan.severity,
    reasons: scan.reasons,
    excerpt: params.text.trim().slice(0, 280),
    status: "open",
  });

  await writeAuditLog(tx, {
    actorId: params.authorId,
    actorRole: params.authorRole,
    eventType: AUDIT_EVENTS.MOD_FLAG_CREATED,
    targetType: params.contentType,
    targetId: params.contentId,
    metadata: {
      targetUserId: params.authorId,
      severity: scan.severity,
      reason: scan.reasons.join("; "),
    },
  });

  return scan;
}

// --- Moderation Queue: Comment Reports ---

export async function listCommentReportsForStaff(
  actorId: string,
  actorRole: UserRole
) {
  return withDbContext({ userId: actorId, role: actorRole }, async (tx) => {
    const rows = await tx
      .select({
        id: commentReports.id,
        commentId: commentReports.commentId,
        reporterId: commentReports.reporterId,
        reasonCode: commentReports.reasonCode,
        details: commentReports.details,
        status: commentReports.status,
        resolutionReason: commentReports.resolutionReason,
        createdAt: commentReports.createdAt,
        resolvedAt: commentReports.resolvedAt,
        commentBody: postComments.body,
        commentPostId: postComments.postId,
        commentAuthorId: postComments.authorId,
      })
      .from(commentReports)
      .leftJoin(postComments, eq(commentReports.commentId, postComments.id))
      .orderBy(desc(commentReports.createdAt))
      .limit(100);

    const userIds = Array.from(
      new Set(
        rows.flatMap((r) =>
          [r.reporterId, r.commentAuthorId].filter(Boolean) as string[]
        )
      )
    );
    const profMap = new Map<string, { username: string; displayName: string }>();
    if (userIds.length > 0) {
      const profs = await tx
        .select({
          userId: profiles.userId,
          username: profiles.username,
          displayName: profiles.displayName,
        })
        .from(profiles)
        .where(inArray(profiles.userId, userIds));
      for (const p of profs) {
        profMap.set(p.userId, {
          username: p.username,
          displayName: p.displayName,
        });
      }
    }

    return rows.map((r) => ({
      id: r.id,
      commentId: r.commentId,
      postId: r.commentPostId,
      commentBody: r.commentBody ?? "[Izoh o‘chirilgan]",
      commentAuthorId: r.commentAuthorId,
      commentAuthorUsername: r.commentAuthorId
        ? profMap.get(r.commentAuthorId)?.username ?? "user"
        : null,
      reporterUsername: profMap.get(r.reporterId)?.username ?? "user",
      reasonCode: r.reasonCode,
      details: r.details,
      status: r.status,
      resolutionReason: r.resolutionReason,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }));
  });
}

export async function reviewCommentReport(params: {
  reportId: string;
  actorId: string;
  actorRole: UserRole;
  status: "under_review" | "resolved_action" | "resolved_dismissed";
  reason: string;
  deleteComment?: boolean;
  warnAuthor?: boolean;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [report] = await tx
        .select()
        .from(commentReports)
        .where(eq(commentReports.id, params.reportId))
        .limit(1);

      if (!report) {
        throw new ModerationServiceError(
          "REPORT_NOT_FOUND",
          "Shikoyat topilmadi",
          404
        );
      }

      const [comment] = await tx
        .select({
          id: postComments.id,
          authorId: postComments.authorId,
          postId: postComments.postId,
        })
        .from(postComments)
        .where(eq(postComments.id, report.commentId))
        .limit(1);

      const now = new Date();
      const [updated] = await tx
        .update(commentReports)
        .set({
          status: params.status,
          reviewedBy: params.actorId,
          resolutionReason: params.reason,
          resolvedAt: params.status === "under_review" ? null : now,
        })
        .where(eq(commentReports.id, params.reportId))
        .returning();

      if (params.deleteComment && comment) {
        await tx.delete(postComments).where(eq(postComments.id, comment.id));
        await writeAuditLog(tx, {
          actorId: params.actorId,
          actorRole: params.actorRole,
          eventType: AUDIT_EVENTS.MOD_COMMENT_DELETED,
          targetType: "comment",
          targetId: comment.id,
          ipAddress: params.ipAddress,
          requestId: params.requestId,
          metadata: {
            targetUserId: comment.authorId,
            reportId: params.reportId,
            reason: params.reason,
          },
        });
      }

      if (params.warnAuthor && comment) {
        await tx.insert(userWarnings).values({
          userId: comment.authorId,
          issuedBy: params.actorId,
          reportId: params.reportId,
          reason: params.reason,
        });
        await createNotificationInTx(tx, {
          recipientId: comment.authorId,
          actorId: params.actorId,
          type: "warning",
          bodyPreview: params.reason,
        });
        await writeAuditLog(tx, {
          actorId: params.actorId,
          actorRole: params.actorRole,
          eventType: AUDIT_EVENTS.USER_WARNED,
          targetType: "user",
          targetId: comment.authorId,
          ipAddress: params.ipAddress,
          requestId: params.requestId,
          metadata: {
            targetUserId: comment.authorId,
            reportId: params.reportId,
            reason: params.reason,
          },
        });
      }

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.REPORT_REVIEWED,
        targetType: "comment_report",
        targetId: params.reportId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: comment?.authorId ?? null,
          status: params.status,
          reason: params.reason,
        },
      });

      return updated!;
    }
  );
}

export async function deleteCommentAsStaff(params: {
  commentId: string;
  actorId: string;
  actorRole: UserRole;
  reason: string;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [comment] = await tx
        .select({
          id: postComments.id,
          authorId: postComments.authorId,
        })
        .from(postComments)
        .where(eq(postComments.id, params.commentId))
        .limit(1);

      if (!comment) {
        throw new ModerationServiceError(
          "COMMENT_NOT_FOUND",
          "Izoh topilmadi",
          404
        );
      }

      await tx.delete(postComments).where(eq(postComments.id, comment.id));

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.MOD_COMMENT_DELETED,
        targetType: "comment",
        targetId: comment.id,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: comment.authorId,
          reason: params.reason,
        },
      });
    }
  );
}

// --- Automated Content Flags Review ---

export async function listModerationFlagsForStaff(
  actorId: string,
  actorRole: UserRole
) {
  return withDbContext({ userId: actorId, role: actorRole }, async (tx) => {
    const rows = await tx
      .select({
        id: moderationFlags.id,
        contentType: moderationFlags.contentType,
        contentId: moderationFlags.contentId,
        authorId: moderationFlags.authorId,
        severity: moderationFlags.severity,
        reasons: moderationFlags.reasons,
        excerpt: moderationFlags.excerpt,
        status: moderationFlags.status,
        decisionReason: moderationFlags.decisionReason,
        createdAt: moderationFlags.createdAt,
        reviewedAt: moderationFlags.reviewedAt,
        authorUsername: profiles.username,
      })
      .from(moderationFlags)
      .innerJoin(profiles, eq(moderationFlags.authorId, profiles.userId))
      .orderBy(desc(moderationFlags.createdAt))
      .limit(100);

    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    }));
  });
}

export async function reviewModerationFlag(params: {
  flagId: string;
  actorId: string;
  actorRole: UserRole;
  status: "reviewed_safe" | "reviewed_action";
  reason: string;
  warnAuthor?: boolean;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [flag] = await tx
        .select()
        .from(moderationFlags)
        .where(eq(moderationFlags.id, params.flagId))
        .limit(1);

      if (!flag) {
        throw new ModerationServiceError(
          "FLAG_NOT_FOUND",
          "Avto-tekshiruv yozuvi topilmadi",
          404
        );
      }

      const [updated] = await tx
        .update(moderationFlags)
        .set({
          status: params.status,
          reviewedBy: params.actorId,
          decisionReason: params.reason,
          reviewedAt: new Date(),
        })
        .where(eq(moderationFlags.id, params.flagId))
        .returning();

      if (params.warnAuthor && params.status === "reviewed_action") {
        await tx.insert(userWarnings).values({
          userId: flag.authorId,
          issuedBy: params.actorId,
          reason: params.reason,
        });
        await createNotificationInTx(tx, {
          recipientId: flag.authorId,
          actorId: params.actorId,
          type: "warning",
          bodyPreview: params.reason,
        });
      }

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.MOD_FLAG_REVIEWED,
        targetType: "moderation_flag",
        targetId: params.flagId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: flag.authorId,
          status: params.status,
          reason: params.reason,
        },
      });

      return updated!;
    }
  );
}

// --- User Warnings & Status Governance (Mute / Temporary Suspend / Ban) ---

export async function issueUserWarning(params: {
  targetUserId: string;
  actorId: string;
  actorRole: UserRole;
  reason: string;
  reportId?: string;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  if (params.targetUserId === params.actorId) {
    throw new ModerationServiceError(
      "CANNOT_MODIFY_SELF",
      "O‘zingizga ogohlantirish yubora olmaysiz",
      400
    );
  }

  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [target] = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, params.targetUserId))
        .limit(1);

      if (!target) {
        throw new ModerationServiceError(
          "TARGET_NOT_FOUND",
          "Foydalanuvchi topilmadi",
          404
        );
      }

      if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[params.actorRole]) {
        throw new ModerationServiceError(
          "INSUFFICIENT_HIERARCHY",
          "Teng yoki yuqori rolli foydalanuvchiga chora ko‘rib bo‘lmaydi",
          403
        );
      }

      const [warning] = await tx
        .insert(userWarnings)
        .values({
          userId: params.targetUserId,
          issuedBy: params.actorId,
          reportId: params.reportId ?? null,
          reason: params.reason,
        })
        .returning();

      await createNotificationInTx(tx, {
        recipientId: params.targetUserId,
        actorId: params.actorId,
        type: "warning",
        bodyPreview: params.reason,
      });

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.USER_WARNED,
        targetType: "user",
        targetId: params.targetUserId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: params.targetUserId,
          reason: params.reason,
          reportId: params.reportId ?? null,
        },
      });

      return warning!;
    }
  );
}

export async function applyUserModerationStatus(params: {
  targetUserId: string;
  actorId: string;
  actorRole: UserRole;
  action: "mute" | "suspend" | "ban" | "restore";
  reason: string;
  durationHours?: number;
  humanConfirmed: boolean;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  if (!params.humanConfirmed) {
    throw new ModerationServiceError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "Jiddiy qarorlar uchun inson tasdiqlashi shart",
      400
    );
  }
  if (params.targetUserId === params.actorId) {
    throw new ModerationServiceError(
      "CANNOT_MODIFY_SELF",
      "O‘z hisobingiz holatini o‘zgartira olmaysiz",
      400
    );
  }

  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [target] = await tx
        .select({ id: users.id, role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, params.targetUserId))
        .limit(1);

      if (!target) {
        throw new ModerationServiceError(
          "TARGET_NOT_FOUND",
          "Foydalanuvchi topilmadi",
          404
        );
      }

      if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[params.actorRole]) {
        throw new ModerationServiceError(
          "INSUFFICIENT_HIERARCHY",
          "Yuqori yoki teng rolli xodimga cheklov qo‘yib bo‘lmaydi",
          403
        );
      }

      if (params.actorRole === "moderator" && params.action === "ban") {
        throw new ModerationServiceError(
          "INSUFFICIENT_HIERARCHY",
          "Doimiy ban faqat Admin yoki Super Admin vakolatida",
          403
        );
      }

      const now = new Date();
      const durationMs = (params.durationHours ?? 24) * 3600 * 1000;
      const nextStatus =
        params.action === "mute"
          ? "muted"
          : params.action === "suspend"
            ? "suspended"
            : params.action === "ban"
              ? "banned"
              : "active";
      const suspendedUntil =
        params.action === "suspend" || params.action === "mute"
          ? new Date(now.getTime() + durationMs)
          : null;

      const [updated] = await tx
        .update(users)
        .set({
          status: nextStatus,
          suspendedUntil,
          updatedAt: now,
        })
        .where(eq(users.id, params.targetUserId))
        .returning({
          id: users.id,
          role: users.role,
          status: users.status,
          suspendedUntil: users.suspendedUntil,
        });

      // Immediately revoke active sessions on suspension or permanent ban
      if (params.action === "suspend" || params.action === "ban") {
        await tx
          .update(userSessions)
          .set({ revokedAt: now })
          .where(
            and(
              eq(userSessions.userId, params.targetUserId),
              isNull(userSessions.revokedAt)
            )
          );
      }

      if (params.action === "mute" || params.action === "restore") {
        await createNotificationInTx(tx, {
          recipientId: params.targetUserId,
          actorId: params.actorId,
          type: "warning",
          bodyPreview:
            params.action === "mute"
              ? `Hisobingizga vaqtincha cheklov qo‘yildi: ${params.reason}`
              : `Hisobingizdagi cheklov olib tashlandi: ${params.reason}`,
        });
      }

      const eventType =
        params.action === "mute"
          ? AUDIT_EVENTS.USER_MUTED
          : params.action === "suspend"
            ? AUDIT_EVENTS.USER_SUSPENDED
            : params.action === "ban"
              ? AUDIT_EVENTS.USER_BANNED
              : AUDIT_EVENTS.USER_UNBANNED;

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType,
        targetType: "user",
        targetId: params.targetUserId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: params.targetUserId,
          previousStatus: target.status,
          newStatus: nextStatus,
          durationHours:
            params.action === "mute" || params.action === "suspend"
              ? (params.durationHours ?? 24)
              : null,
          humanConfirmed: true,
          reason: params.reason,
        },
      });

      return updated!;
    }
  );
}

// --- Governance: Users, Roles & Super Admin Permission Delegation ---

export async function listGovernanceUsers(
  actorId: string,
  actorRole: UserRole,
  query?: string
) {
  return withDbContext({ userId: actorId, role: actorRole }, async (tx) => {
    const q = (query ?? "").trim().toLowerCase();
    const likePattern = `%${q}%`;

    const rows = await tx
      .select({
        userId: users.id,
        role: users.role,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
        createdAt: users.createdAt,
        username: profiles.username,
        displayName: profiles.displayName,
      })
      .from(users)
      .innerJoin(profiles, eq(users.id, profiles.userId))
      .where(
        q
          ? or(
              sql`lower(${profiles.username}) LIKE ${likePattern}`,
              sql`lower(${profiles.displayName}) LIKE ${likePattern}`
            )
          : undefined
      )
      .orderBy(desc(users.createdAt))
      .limit(50);

    const adminIds = rows.filter((r) => r.role === "admin").map((r) => r.userId);
    const adminPermsMap = new Map<string, string[]>();
    if (adminIds.length > 0 && actorRole === "super_admin") {
      const permRows = await tx
        .select({
          userId: adminUserPermissions.userId,
          permissionCode: adminUserPermissions.permissionCode,
        })
        .from(adminUserPermissions)
        .where(inArray(adminUserPermissions.userId, adminIds));
      for (const pr of permRows) {
        const list = adminPermsMap.get(pr.userId) ?? [];
        list.push(pr.permissionCode);
        adminPermsMap.set(pr.userId, list);
      }
    }

    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      role: r.role,
      status: r.status,
      suspendedUntil: r.suspendedUntil ? r.suspendedUntil.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      delegatedPermissions: adminPermsMap.get(r.userId) ?? [],
    }));
  });
}

export async function setAdminDelegatedPermissions(params: {
  actorId: string;
  actorRole: UserRole;
  targetUserId: string;
  permissions: string[];
  reason: string;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  if (params.actorRole !== "super_admin") {
    throw new ModerationServiceError(
      "INSUFFICIENT_HIERARCHY",
      "Admin vakolatlarini faqat Super Admin bera oladi",
      403
    );
  }

  const allowedSet = new Set<string>(DELEGATABLE_ADMIN_PERMISSIONS);
  for (const p of params.permissions) {
    if (!allowedSet.has(p)) {
      throw new ModerationServiceError(
        "INVALID_PERMISSION",
        `Ruxsat etilmagan vakolat kodi: ${p}`,
        400
      );
    }
  }

  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [target] = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, params.targetUserId))
        .limit(1);

      if (!target) {
        throw new ModerationServiceError(
          "TARGET_NOT_FOUND",
          "Foydalanuvchi topilmadi",
          404
        );
      }
      if (target.role !== "admin") {
        throw new ModerationServiceError(
          "INVALID_TARGET_ROLE",
          "Faqat Admin rolidagi foydalanuvchiga individual vakolat beriladi",
          400
        );
      }

      await tx
        .delete(adminUserPermissions)
        .where(eq(adminUserPermissions.userId, params.targetUserId));

      const uniquePerms = Array.from(new Set(params.permissions)) as PermissionCode[];
      if (uniquePerms.length > 0) {
        await tx.insert(adminUserPermissions).values(
          uniquePerms.map((code) => ({
            userId: params.targetUserId,
            permissionCode: code,
            grantedBy: params.actorId,
          }))
        );
      }

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.ADMIN_PERMISSIONS_UPDATED,
        targetType: "user",
        targetId: params.targetUserId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: params.targetUserId,
          permissions: uniquePerms,
          reason: params.reason,
        },
      });

      return uniquePerms;
    }
  );
}

// --- Platform Important Announcements ---

export async function broadcastPlatformAnnouncement(params: {
  actorId: string;
  actorRole: UserRole;
  title: string;
  body: string;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [announcement] = await tx
        .insert(platformAnnouncements)
        .values({
          title: params.title,
          body: params.body,
          createdBy: params.actorId,
        })
        .returning();

      const recipients = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.status, "active"))
        .limit(1000);

      let delivered = 0;
      const preview = `${params.title}: ${params.body}`.slice(0, 140);
      for (const r of recipients) {
        const sent = await createNotificationInTx(tx, {
          recipientId: r.id,
          actorId: params.actorId,
          type: "announcement",
          bodyPreview: preview,
        });
        if (sent) delivered++;
      }

      await tx
        .update(platformAnnouncements)
        .set({ deliveredCount: delivered })
        .where(eq(platformAnnouncements.id, announcement!.id));

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.ANNOUNCEMENT_SENT,
        targetType: "announcement",
        targetId: announcement!.id,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          title: params.title,
          deliveredCount: delivered,
          reason: params.title,
        },
      });

      return {
        id: announcement!.id,
        title: announcement!.title,
        body: announcement!.body,
        deliveredCount: delivered,
        createdAt: announcement!.createdAt.toISOString(),
      };
    }
  );
}

// --- Appeals ---

export async function listMyWarningsAndAppeals(userId: string, role: UserRole) {
  return withDbContext({ userId, role }, async (tx) => {
    const warnings = await tx
      .select()
      .from(userWarnings)
      .where(eq(userWarnings.userId, userId))
      .orderBy(desc(userWarnings.createdAt))
      .limit(20);

    const appeals = await tx
      .select()
      .from(moderationAppeals)
      .where(eq(moderationAppeals.userId, userId))
      .orderBy(desc(moderationAppeals.createdAt))
      .limit(20);

    return {
      warnings: warnings.map((w) => ({
        id: w.id,
        reason: w.reason,
        createdAt: w.createdAt.toISOString(),
      })),
      appeals: appeals.map((a) => ({
        id: a.id,
        actionType: a.actionType,
        reason: a.reason,
        status: a.status,
        reviewReason: a.reviewReason,
        createdAt: a.createdAt.toISOString(),
        reviewedAt: a.reviewedAt ? a.reviewedAt.toISOString() : null,
      })),
    };
  });
}

export async function submitModerationAppeal(params: {
  userId: string;
  role: UserRole;
  actionType: "warning" | "mute" | "suspend" | "ban" | "comment_deleted";
  reason: string;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  return withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const [appeal] = await tx
        .insert(moderationAppeals)
        .values({
          userId: params.userId,
          actionType: params.actionType,
          reason: params.reason,
          status: "pending",
        })
        .returning();

      await writeAuditLog(tx, {
        actorId: params.userId,
        actorRole: params.role,
        eventType: AUDIT_EVENTS.APPEAL_SUBMITTED,
        targetType: "moderation_appeal",
        targetId: appeal!.id,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: params.userId,
          actionType: params.actionType,
          reason: params.reason,
        },
      });

      return appeal!;
    }
  );
}

export async function listAppealsForStaff(actorId: string, actorRole: UserRole) {
  return withDbContext({ userId: actorId, role: actorRole }, async (tx) => {
    const rows = await tx
      .select({
        id: moderationAppeals.id,
        userId: moderationAppeals.userId,
        username: profiles.username,
        displayName: profiles.displayName,
        actionType: moderationAppeals.actionType,
        reason: moderationAppeals.reason,
        status: moderationAppeals.status,
        reviewReason: moderationAppeals.reviewReason,
        createdAt: moderationAppeals.createdAt,
        reviewedAt: moderationAppeals.reviewedAt,
      })
      .from(moderationAppeals)
      .innerJoin(profiles, eq(moderationAppeals.userId, profiles.userId))
      .orderBy(desc(moderationAppeals.createdAt))
      .limit(100);

    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    }));
  });
}

export async function reviewModerationAppeal(params: {
  appealId: string;
  actorId: string;
  actorRole: UserRole;
  decision: "approved" | "rejected";
  reason: string;
  humanConfirmed: boolean;
  ipAddress?: string | null;
  requestId?: string | null;
}) {
  if (!params.humanConfirmed) {
    throw new ModerationServiceError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "Inson tasdiqlashi talab qilinadi",
      400
    );
  }

  return withDbContext(
    { userId: params.actorId, role: params.actorRole },
    async (tx) => {
      const [appeal] = await tx
        .select()
        .from(moderationAppeals)
        .where(eq(moderationAppeals.id, params.appealId))
        .limit(1);

      if (!appeal) {
        throw new ModerationServiceError(
          "APPEAL_NOT_FOUND",
          "Apellyatsiya topilmadi",
          404
        );
      }

      const [updated] = await tx
        .update(moderationAppeals)
        .set({
          status: params.decision,
          reviewedBy: params.actorId,
          reviewReason: params.reason,
          reviewedAt: new Date(),
        })
        .where(eq(moderationAppeals.id, params.appealId))
        .returning();

      if (params.decision === "approved") {
        await tx
          .update(users)
          .set({ status: "active", suspendedUntil: null, updatedAt: new Date() })
          .where(eq(users.id, appeal.userId));
      }

      await createNotificationInTx(tx, {
        recipientId: appeal.userId,
        actorId: params.actorId,
        type: "appeal",
        bodyPreview:
          params.decision === "approved"
            ? `Apellyatsiyangiz qanoatlantirildi: ${params.reason}`
            : `Apellyatsiya rad etildi: ${params.reason}`,
      });

      await writeAuditLog(tx, {
        actorId: params.actorId,
        actorRole: params.actorRole,
        eventType: AUDIT_EVENTS.APPEAL_REVIEWED,
        targetType: "moderation_appeal",
        targetId: params.appealId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: {
          targetUserId: appeal.userId,
          decision: params.decision,
          reason: params.reason,
        },
      });

      return updated!;
    }
  );
}

// --- Enriched Audit Log Feed (Admin / Super Admin ONLY) ---

export async function listAuditLogsForGovernance(
  actorId: string,
  actorRole: UserRole
) {
  return withDbContext({ userId: actorId, role: actorRole }, async (tx) => {
    const logs = await tx
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(120);

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const uids = new Set<string>();
    for (const log of logs) {
      if (log.actorId) uids.add(log.actorId);
      const mUserId = log.metadata?.targetUserId;
      if (typeof mUserId === "string" && uuidRegex.test(mUserId)) {
        uids.add(mUserId);
      } else if (log.targetId && uuidRegex.test(log.targetId)) {
        uids.add(log.targetId);
      }
    }

    const profMap = new Map<string, string>();
    if (uids.size > 0) {
      const profs = await tx
        .select({ userId: profiles.userId, username: profiles.username })
        .from(profiles)
        .where(inArray(profiles.userId, Array.from(uids)));
      for (const p of profs) {
        profMap.set(p.userId, p.username);
      }
    }

    return logs.map((l) => {
      const mTargetUser =
        typeof l.metadata?.targetUserId === "string"
          ? l.metadata.targetUserId
          : l.targetId;
      return {
        id: l.id,
        actorId: l.actorId,
        actorUsername: l.actorId ? profMap.get(l.actorId) ?? null : null,
        actorRole: l.actorRole,
        eventType: l.eventType,
        targetType: l.targetType,
        targetId: l.targetId,
        targetUsername: mTargetUser ? profMap.get(mTargetUser) ?? null : null,
        reason:
          typeof l.metadata?.reason === "string" ? l.metadata.reason : null,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      };
    });
  });
}
