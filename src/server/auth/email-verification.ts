import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { withDbContext } from "@/server/db/context";
import {
  type UserRole,
  emailVerificationTokens,
  users,
} from "@/server/db/schema";
import { generateOpaqueToken, sha256Hex } from "@/server/security/crypto";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export class EmailVerificationError extends Error {
  constructor(
    public readonly code:
      | "INVALID_OR_EXPIRED_TOKEN"
      | "EMAIL_ALREADY_IN_USE",
    message: string
  ) {
    super(message);
    this.name = "EmailVerificationError";
  }
}

export async function createEmailVerificationRequest(params: {
  userId: string;
  role: UserRole;
  email: string;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const rawToken = generateOpaqueToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);

  await withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      await tx.insert(emailVerificationTokens).values({
        userId: params.userId,
        email: normalizedEmail,
        tokenHash,
        expiresAt,
      });

      await writeAuditLog(tx, {
        actorId: params.userId,
        actorRole: params.role,
        eventType: AUDIT_EVENTS.EMAIL_VERIFICATION_CREATED,
        targetType: "user",
        targetId: params.userId,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });
    }
  );

  return { token: rawToken, expiresAt };
}

export async function verifyEmailToken(params: {
  rawToken: string;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<{ userId: string; email: string; verifiedAt: Date }> {
  const tokenHash = sha256Hex(params.rawToken);
  const now = new Date();

  return withDbContext({ authFlow: true }, async (tx) => {
    const [consumed] = await tx
      .update(emailVerificationTokens)
      .set({ verifiedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.verifiedAt),
          gt(emailVerificationTokens.expiresAt, now)
        )
      )
      .returning({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
        email: emailVerificationTokens.email,
      });

    if (!consumed) {
      throw new EmailVerificationError(
        "INVALID_OR_EXPIRED_TOKEN",
        "Email verification token is invalid or expired"
      );
    }

    const emailInUse = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.primaryEmail}) = ${consumed.email}`)
      .limit(1);

    if (emailInUse[0] && emailInUse[0].id !== consumed.userId) {
      throw new EmailVerificationError(
        "EMAIL_ALREADY_IN_USE",
        "This email is already verified on another account"
      );
    }

    await tx
      .update(users)
      .set({
        primaryEmail: consumed.email,
        emailVerifiedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, consumed.userId));

    await writeAuditLog(tx, {
      actorId: consumed.userId,
      actorRole: "user",
      eventType: AUDIT_EVENTS.EMAIL_VERIFIED,
      targetType: "user",
      targetId: consumed.userId,
      ipAddress: params.ipAddress,
      requestId: params.requestId,
    });

    return {
      userId: consumed.userId,
      email: consumed.email,
      verifiedAt: now,
    };
  });
}
