import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getServerEnv } from "@/lib/env";
import { type DbTransaction, withDbContext } from "@/server/db/context";
import {
  type AuthChannel,
  type AuthProvider,
  type UserRole,
  type UserStatus,
  userSessions,
  users,
} from "@/server/db/schema";
import {
  generateOpaqueToken,
  hashIpAddress,
  sha256Hex,
} from "@/server/security/crypto";

export const SESSION_COOKIE_NAME = "avero_session";

export interface AuthenticatedActor {
  sessionId: string;
  userId: string;
  role: UserRole;
  status: UserStatus;
  suspendedUntil: Date | null;
  primaryEmail: string | null;
  emailVerifiedAt: Date | null;
  authChannel: AuthChannel;
  provider: AuthProvider;
}

export async function createUserSession(
  tx: DbTransaction,
  params: {
    userId: string;
    authChannel: AuthChannel;
    provider: AuthProvider;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<{
  sessionId: string;
  sessionToken: string;
  expiresAt: Date;
}> {
  const env = getServerEnv();
  const sessionToken = generateOpaqueToken(32);
  const tokenHash = sha256Hex(sessionToken);
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  const ipHash = hashIpAddress(params.ipAddress, env.AUDIT_IP_SALT);

  const [created] = await tx
    .insert(userSessions)
    .values({
      userId: params.userId,
      tokenHash,
      authChannel: params.authChannel,
      provider: params.provider,
      ipHash,
      userAgent: params.userAgent ? params.userAgent.slice(0, 255) : null,
      expiresAt,
    })
    .returning({ id: userSessions.id });

  if (!created) {
    throw new Error("Failed to persist user session");
  }

  return {
    sessionId: created.id,
    sessionToken,
    expiresAt,
  };
}

export async function authenticateSessionToken(
  sessionToken: string
): Promise<AuthenticatedActor | null> {
  if (!sessionToken || sessionToken.length < 20) {
    return null;
  }

  const tokenHash = sha256Hex(sessionToken);
  const now = new Date();

  return withDbContext({ authFlow: true }, async (tx) => {
    const rows = await tx
      .select({
        sessionId: userSessions.id,
        userId: users.id,
        role: users.role,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
        primaryEmail: users.primaryEmail,
        emailVerifiedAt: users.emailVerifiedAt,
        authChannel: userSessions.authChannel,
        provider: userSessions.provider,
        lastSeenAt: userSessions.lastSeenAt,
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(
        and(
          eq(userSessions.tokenHash, tokenHash),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, now)
        )
      )
      .limit(1);

    const record = rows[0];
    if (!record) {
      return null;
    }

    if (record.status === "banned") {
      return null;
    }

    if (
      record.status === "suspended" &&
      record.suspendedUntil &&
      record.suspendedUntil > now
    ) {
      return null;
    }

    // Throttle last_seen_at writes to once every 5 minutes
    if (now.getTime() - record.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await tx
        .update(userSessions)
        .set({ lastSeenAt: now })
        .where(eq(userSessions.id, record.sessionId));
    }

    return {
      sessionId: record.sessionId,
      userId: record.userId,
      role: record.role,
      status: record.status,
      suspendedUntil: record.suspendedUntil,
      primaryEmail: record.primaryEmail,
      emailVerifiedAt: record.emailVerifiedAt,
      authChannel: record.authChannel,
      provider: record.provider,
    };
  });
}

export async function revokeSessionById(
  userId: string,
  role: UserRole,
  sessionId: string
): Promise<void> {
  await withDbContext({ userId, role }, async (tx) => {
    await tx
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId))
      );
  });
}

export async function revokeAllUserSessions(
  userId: string,
  role: UserRole
): Promise<void> {
  await withDbContext({ userId, role }, async (tx) => {
    await tx
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt))
      );
  });
}

export function buildSessionCookieHeader(
  sessionToken: string,
  expiresAt: Date,
  isProduction: boolean
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearSessionCookieHeader(isProduction: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
