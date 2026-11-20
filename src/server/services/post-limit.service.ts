import "server-only";
import { and, count, eq } from "drizzle-orm";
import {
  computeUnlockedPostLength,
  POST_LIMIT_CONFIG,
  type PostLimitBreakdown,
} from "@/server/config/post-limits";
import { type DbTransaction, withDbContext } from "@/server/db/context";
import {
  profiles,
  referrals,
  users,
  type UserRole,
} from "@/server/db/schema";
import { AUDIT_EVENTS, writeAuditLog } from "./audit.service";

export class ReferralError extends Error {
  constructor(
    public readonly code:
      | "INVITER_NOT_FOUND"
      | "SELF_REFERRAL_FORBIDDEN"
      | "ALREADY_REFERRED",
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "ReferralError";
  }
}

export async function syncUserPostLimitInTx(
  tx: DbTransaction,
  userId: string,
  role: UserRole | "anonymous",
  ipAddress?: string | null,
  requestId?: string | null
): Promise<PostLimitBreakdown> {
  const [userRow] = await tx
    .select({
      maxPostLength: users.maxPostLength,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    throw new Error("User not found");
  }

  const [refCountRow] = await tx
    .select({ total: count() })
    .from(referrals)
    .where(
      and(eq(referrals.inviterId, userId), eq(referrals.status, "verified"))
    );

  const verifiedReferralsCount = Number(refCountRow?.total ?? 0);
  const hasVerifiedEmail = Boolean(userRow.emailVerifiedAt);

  const calc = computeUnlockedPostLength({
    currentMaxLength: userRow.maxPostLength,
    verifiedReferralsCount,
    hasVerifiedEmail,
  });

  if (calc.unlockedMaxLength > userRow.maxPostLength) {
    await tx
      .update(users)
      .set({
        maxPostLength: calc.unlockedMaxLength,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await writeAuditLog(tx, {
      actorId: userId,
      actorRole: role === "anonymous" ? "user" : role,
      eventType: AUDIT_EVENTS.POST_LIMIT_INCREASED,
      targetType: "user",
      targetId: userId,
      ipAddress,
      requestId,
      metadata: {
        previousMaxLength: userRow.maxPostLength,
        newMaxLength: calc.unlockedMaxLength,
        verifiedReferralsCount,
      },
    });
  }

  const remainingToMax = Math.max(
    0,
    POST_LIMIT_CONFIG.absoluteMaxLimit - calc.unlockedMaxLength
  );

  return {
    currentMaxLength: calc.unlockedMaxLength,
    baseLimit: POST_LIMIT_CONFIG.baseLimit,
    verifiedReferralsCount,
    emailVerifiedBonus: calc.emailVerifiedBonus,
    referralBonus: calc.referralBonus,
    nextMilestoneHint:
      remainingToMax > 0
        ? `Har bir haqiqiy do‘st taklifi +${POST_LIMIT_CONFIG.referralBonusPerFriend} belgi ochadi`
        : "Maksimal post limiti ochilgan",
  };
}

export async function getUserPostLimitBreakdown(
  userId: string,
  role: UserRole
): Promise<PostLimitBreakdown> {
  return withDbContext({ userId, role }, async (tx) => {
    return syncUserPostLimitInTx(tx, userId, role);
  });
}

/**
 * Records a verified referral when an authenticated user claims an inviter's
 * username, then atomically re-evaluates the inviter's post length limit.
 */
export async function claimFriendReferral(params: {
  inviteeUserId: string;
  inviteeRole: UserRole;
  inviterUsername: string;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<{ inviterUserId: string; inviterNewMaxLength: number }> {
  const normalizedUsername = params.inviterUsername.trim().toLowerCase();

  return withDbContext({ authFlow: true }, async (tx) => {
    const [inviterProfile] = await tx
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.username, normalizedUsername))
      .limit(1);

    if (!inviterProfile) {
      throw new ReferralError(
        "INVITER_NOT_FOUND",
        "Taklif qilgan foydalanuvchi topilmadi",
        404
      );
    }

    if (inviterProfile.userId === params.inviteeUserId) {
      throw new ReferralError(
        "SELF_REFERRAL_FORBIDDEN",
        "O‘zingizni taklif qila olmaysiz",
        400
      );
    }

    const existing = await tx
      .select({ id: referrals.id })
      .from(referrals)
      .where(eq(referrals.inviteeId, params.inviteeUserId))
      .limit(1);

    if (existing[0]) {
      throw new ReferralError(
        "ALREADY_REFERRED",
        "Siz allaqachon taklif orqali ro‘yxatdan o‘tgansiz",
        409
      );
    }

    await tx.insert(referrals).values({
      inviterId: inviterProfile.userId,
      inviteeId: params.inviteeUserId,
      status: "verified",
    });

    const updatedLimit = await syncUserPostLimitInTx(
      tx,
      inviterProfile.userId,
      "user",
      params.ipAddress,
      params.requestId
    );

    await writeAuditLog(tx, {
      actorId: params.inviteeUserId,
      actorRole: params.inviteeRole,
      eventType: AUDIT_EVENTS.REFERRAL_RECORDED,
      targetType: "user",
      targetId: inviterProfile.userId,
      ipAddress: params.ipAddress,
      requestId: params.requestId,
    });

    return {
      inviterUserId: inviterProfile.userId,
      inviterNewMaxLength: updatedLimit.currentMaxLength,
    };
  });
}
