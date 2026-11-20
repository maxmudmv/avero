import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { withDbContext } from "@/server/db/context";
import {
  type AuthProvider,
  type UserRole,
  accountLinkTokens,
  authIdentities,
  userSessions,
  users,
} from "@/server/db/schema";
import { getServerEnv } from "@/lib/env";
import {
  generateOpaqueToken,
  hashIpAddress,
  sha256Hex,
} from "@/server/security/crypto";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";

const LINK_TOKEN_TTL_MS = 5 * 60 * 1000;

export class AccountLinkingError extends Error {
  constructor(
    public readonly code:
      | "CONSENT_REQUIRED"
      | "PROVIDER_ALREADY_LINKED_TO_SELF"
      | "ACCOUNT_ALREADY_LINKED"
      | "INVALID_OR_EXPIRED_LINK_TOKEN"
      | "LAST_IDENTITY_CANNOT_UNLINK",
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "AccountLinkingError";
  }
}

export async function initiateAccountLink(params: {
  userId: string;
  role: UserRole;
  targetProvider: AuthProvider;
  consentAccepted: boolean;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<{
  linkToken: string;
  expiresAt: Date;
}> {
  if (!params.consentAccepted) {
    throw new AccountLinkingError(
      "CONSENT_REQUIRED",
      "Explicit user consent is required to link an external account",
      400
    );
  }

  const env = getServerEnv();
  const rawToken = generateOpaqueToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
  const ipHash = hashIpAddress(params.ipAddress, env.AUDIT_IP_SALT);

  await withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const existingSelf = await tx
        .select({ id: authIdentities.id })
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.userId, params.userId),
            eq(authIdentities.provider, params.targetProvider)
          )
        )
        .limit(1);

      if (existingSelf[0]) {
        throw new AccountLinkingError(
          "PROVIDER_ALREADY_LINKED_TO_SELF",
          `${params.targetProvider} is already linked to this account`,
          409
        );
      }

      await tx.insert(accountLinkTokens).values({
        userId: params.userId,
        targetProvider: params.targetProvider,
        tokenHash,
        consentGivenAt: new Date(),
        ipHash,
        expiresAt,
      });

      await writeAuditLog(tx, {
        actorId: params.userId,
        actorRole: params.role,
        eventType: AUDIT_EVENTS.ACCOUNT_LINK_INITIATED,
        targetType: "auth_identity",
        targetId: params.targetProvider,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });
    }
  );

  return {
    linkToken: rawToken,
    expiresAt,
  };
}

export async function completeAccountLinkWithToken(params: {
  rawLinkToken: string;
  provider: AuthProvider;
  providerUserId: string;
  providerEmail?: string | null;
  providerUsername?: string | null;
  emailVerified?: boolean;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<{ userId: string; provider: AuthProvider }> {
  const tokenHash = sha256Hex(params.rawLinkToken);
  const now = new Date();

  return withDbContext({ authFlow: true }, async (tx) => {
    // Atomically consume the one-time link token inside the transaction
    const [consumed] = await tx
      .update(accountLinkTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(accountLinkTokens.tokenHash, tokenHash),
          eq(accountLinkTokens.targetProvider, params.provider),
          isNull(accountLinkTokens.usedAt),
          gt(accountLinkTokens.expiresAt, now)
        )
      )
      .returning({
        id: accountLinkTokens.id,
        userId: accountLinkTokens.userId,
      });

    if (!consumed) {
      throw new AccountLinkingError(
        "INVALID_OR_EXPIRED_LINK_TOKEN",
        "Account link token is invalid, expired, or already used",
        400
      );
    }

    // Prevent pre-hijacking & automatic merges: fail with 409 if already owned by anyone
    const ownedByOther = await tx
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, params.provider),
          eq(authIdentities.providerUserId, params.providerUserId)
        )
      )
      .limit(1);

    if (ownedByOther[0]) {
      await writeAuditLog(tx, {
        actorId: consumed.userId,
        actorRole: "user",
        eventType: AUDIT_EVENTS.ACCOUNT_LINK_CONFLICT,
        targetType: "auth_identity",
        targetId: params.provider,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
        metadata: { conflict: true },
      });

      throw new AccountLinkingError(
        "ACCOUNT_ALREADY_LINKED",
        `This ${params.provider} account is already linked to another user`,
        409
      );
    }

    const userAlreadyHasProvider = await tx
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.userId, consumed.userId),
          eq(authIdentities.provider, params.provider)
        )
      )
      .limit(1);

    if (userAlreadyHasProvider[0]) {
      throw new AccountLinkingError(
        "PROVIDER_ALREADY_LINKED_TO_SELF",
        `Your account already has a linked ${params.provider} identity`,
        409
      );
    }

    await tx.insert(authIdentities).values({
      userId: consumed.userId,
      provider: params.provider,
      providerUserId: params.providerUserId,
      providerEmail: params.providerEmail?.toLowerCase() ?? null,
      providerUsername: params.providerUsername ?? null,
      emailVerified: Boolean(params.emailVerified),
      linkedAt: now,
    });

    if (
      params.provider === "google" &&
      params.emailVerified &&
      params.providerEmail
    ) {
      const normalized = params.providerEmail.trim().toLowerCase();
      const [emailCollision] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.primaryEmail}) = ${normalized}`)
        .limit(1);

      if (!emailCollision) {
        await tx
          .update(users)
          .set({
            primaryEmail: normalized,
            emailVerifiedAt: now,
            updatedAt: now,
          })
          .where(
            and(eq(users.id, consumed.userId), isNull(users.primaryEmail))
          );
      }
    }

    await writeAuditLog(tx, {
      actorId: consumed.userId,
      actorRole: "user",
      eventType: AUDIT_EVENTS.ACCOUNT_LINKED,
      targetType: "auth_identity",
      targetId: params.provider,
      ipAddress: params.ipAddress,
      requestId: params.requestId,
    });

    return {
      userId: consumed.userId,
      provider: params.provider,
    };
  });
}

export async function unlinkProviderIdentity(params: {
  userId: string;
  role: UserRole;
  provider: AuthProvider;
  ipAddress?: string | null;
  requestId?: string | null;
}): Promise<void> {
  await withDbContext(
    { userId: params.userId, role: params.role },
    async (tx) => {
      const identities = await tx
        .select({
          id: authIdentities.id,
          provider: authIdentities.provider,
        })
        .from(authIdentities)
        .where(eq(authIdentities.userId, params.userId));

      const target = identities.find((i) => i.provider === params.provider);
      if (!target) {
        return;
      }

      if (identities.length <= 1) {
        throw new AccountLinkingError(
          "LAST_IDENTITY_CANNOT_UNLINK",
          "Cannot unlink your only remaining sign-in method",
          400
        );
      }

      await tx
        .delete(authIdentities)
        .where(
          and(
            eq(authIdentities.id, target.id),
            eq(authIdentities.userId, params.userId)
          )
        );

      // Revoke active sessions issued via the unlinked provider
      await tx
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(userSessions.userId, params.userId),
            eq(userSessions.provider, params.provider),
            isNull(userSessions.revokedAt)
          )
        );

      await writeAuditLog(tx, {
        actorId: params.userId,
        actorRole: params.role,
        eventType: AUDIT_EVENTS.ACCOUNT_UNLINKED,
        targetType: "auth_identity",
        targetId: params.provider,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      });
    }
  );
}
