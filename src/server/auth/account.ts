import "server-only";
import { and, eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { type DbTransaction, withDbContext } from "@/server/db/context";
import {
  type AuthChannel,
  type UserRole,
  type UserStatus,
  authIdentities,
  profiles,
  userActivity,
  userSettings,
  users,
} from "@/server/db/schema";
import { isValidUsernameFormat } from "@/lib/validation/account";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";
import { createUserSession } from "./session";

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "moderator",
  "avero",
  "login",
  "logout",
  "settings",
  "staff",
  "support",
  "system",
  "profile",
  "search",
  "compose",
]);

export class AccountAccessError extends Error {
  constructor(
    public readonly code: "ACCOUNT_BANNED" | "ACCOUNT_SUSPENDED",
    message: string
  ) {
    super(message);
    this.name = "AccountAccessError";
  }
}

export function sanitizeBaseUsername(raw: string): string {
  let cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 20);

  if (cleaned.length < 5) {
    cleaned = `${cleaned || "avero"}_user`.slice(0, 20);
  }
  if (!isValidUsernameFormat(cleaned) || RESERVED_USERNAMES.has(cleaned)) {
    return "avero_user";
  }
  return cleaned;
}

export async function allocateUniqueUsername(
  tx: DbTransaction,
  preferred: string
): Promise<string> {
  const base = sanitizeBaseUsername(preferred);

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = crypto.randomBytes(2).toString("hex");
    const candidate =
      attempt === 0
        ? base
        : `${base.slice(0, 15)}_${suffix}`;

    if (
      !isValidUsernameFormat(candidate) ||
      RESERVED_USERNAMES.has(candidate)
    ) {
      continue;
    }

    const existing = await tx
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(sql`lower(${profiles.username}) = ${candidate.toLowerCase()}`)
      .limit(1);

    if (existing.length === 0) {
      return candidate;
    }
  }

  return `u_${crypto.randomBytes(6).toString("hex")}`.slice(0, 20);
}

function assertAccountActive(
  status: UserStatus,
  suspendedUntil: Date | null
): void {
  if (status === "banned") {
    throw new AccountAccessError("ACCOUNT_BANNED", "Account is banned");
  }
  if (
    status === "suspended" &&
    suspendedUntil &&
    suspendedUntil > new Date()
  ) {
    throw new AccountAccessError(
      "ACCOUNT_SUSPENDED",
      "Account is temporarily suspended"
    );
  }
}

export interface LoginSuccessResult {
  userId: string;
  role: UserRole;
  isNewUser: boolean;
  sessionId: string;
  sessionToken: string;
  expiresAt: Date;
}

/**
 * Authenticates or registers a user via Google OAuth 2.0.
 * Security rule: NEVER merges automatically with an existing user by email.
 * Lookup is strictly keyed on `(provider='google', providerUserId=sub)`.
 */
export async function loginOrRegisterWithGoogle(params: {
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}): Promise<LoginSuccessResult> {
  if (!params.emailVerified) {
    throw new Error("Google email must be verified before login");
  }

  const normalizedEmail = params.email.trim().toLowerCase();

  return withDbContext({ authFlow: true }, async (tx) => {
    const existing = await tx
      .select({
        identityId: authIdentities.id,
        userId: users.id,
        role: users.role,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
      })
      .from(authIdentities)
      .innerJoin(users, eq(authIdentities.userId, users.id))
      .where(
        and(
          eq(authIdentities.provider, "google"),
          eq(authIdentities.providerUserId, params.sub)
        )
      )
      .limit(1);

    let userId: string;
    let role: UserRole;
    let isNewUser = false;

    if (existing[0]) {
      assertAccountActive(existing[0].status, existing[0].suspendedUntil);
      userId = existing[0].userId;
      role = existing[0].role;

      await tx
        .update(authIdentities)
        .set({
          providerEmail: normalizedEmail,
          emailVerified: true,
          lastLoginAt: new Date(),
        })
        .where(eq(authIdentities.id, existing[0].identityId));
    } else {
      // Check if an account already holds primaryEmail (no automatic merge!)
      const emailCollision = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.primaryEmail}) = ${normalizedEmail}`)
        .limit(1);

      const now = new Date();
      const superAdminEmails = getServerEnv()
        .SUPER_ADMIN_EMAILS.split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const initialRole: UserRole =
        !emailCollision[0] && superAdminEmails.includes(normalizedEmail)
          ? "super_admin"
          : "user";

      const [newUser] = await tx
        .insert(users)
        .values({
          role: initialRole,
          status: "active",
          primaryEmail: emailCollision[0] ? null : normalizedEmail,
          emailVerifiedAt: emailCollision[0] ? null : now,
        })
        .returning({ id: users.id, role: users.role });

      if (!newUser) {
        throw new Error("Failed to create user record");
      }

      userId = newUser.id;
      role = newUser.role;
      isNewUser = true;

      const preferredUsername = normalizedEmail.split("@")[0] || "user";
      const username = await allocateUniqueUsername(tx, preferredUsername);
      const safeDisplayName = params.displayName.trim().slice(0, 40) || username;

      await tx.insert(profiles).values({
        userId,
        username,
        displayName: safeDisplayName,
        bio: "",
      });

      await tx.insert(userSettings).values({
        userId,
        language: "uz",
        theme: "system",
        privacyLevel: "public",
      });

      await tx.insert(userActivity).values({
        userId,
      });

      await tx.insert(authIdentities).values({
        userId,
        provider: "google",
        providerUserId: params.sub,
        providerEmail: normalizedEmail,
        emailVerified: true,
        lastLoginAt: now,
      });
    }

    const session = await createUserSession(tx, {
      userId,
      authChannel: "web_cookie",
      provider: "google",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    await writeAuditLog(tx, {
      actorId: userId,
      actorRole: role,
      eventType: AUDIT_EVENTS.AUTH_LOGIN_GOOGLE,
      targetType: "session",
      targetId: session.sessionId,
      ipAddress: params.ipAddress,
      requestId: params.requestId,
      metadata: { isNewUser },
    });

    return {
      userId,
      role,
      isNewUser,
      ...session,
    };
  });
}

/**
 * Authenticates or registers a user via server-verified Telegram `initData`.
 * Prepared cleanly for the Telegram Mini App phase.
 */
export async function loginOrRegisterWithTelegram(params: {
  telegramUserId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  languageCode?: string;
  authChannel?: AuthChannel;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}): Promise<LoginSuccessResult> {
  const providerUserId = String(params.telegramUserId);

  return withDbContext({ authFlow: true }, async (tx) => {
    const existing = await tx
      .select({
        identityId: authIdentities.id,
        userId: users.id,
        role: users.role,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
      })
      .from(authIdentities)
      .innerJoin(users, eq(authIdentities.userId, users.id))
      .where(
        and(
          eq(authIdentities.provider, "telegram"),
          eq(authIdentities.providerUserId, providerUserId)
        )
      )
      .limit(1);

    let userId: string;
    let role: UserRole;
    let isNewUser = false;

    if (existing[0]) {
      assertAccountActive(existing[0].status, existing[0].suspendedUntil);
      userId = existing[0].userId;
      role = existing[0].role;

      await tx
        .update(authIdentities)
        .set({
          providerUsername: params.username ?? null,
          lastLoginAt: new Date(),
        })
        .where(eq(authIdentities.id, existing[0].identityId));
    } else {
      const [newUser] = await tx
        .insert(users)
        .values({
          role: "user",
          status: "active",
        })
        .returning({ id: users.id, role: users.role });

      if (!newUser) {
        throw new Error("Failed to create Telegram user record");
      }

      userId = newUser.id;
      role = newUser.role;
      isNewUser = true;

      const username = await allocateUniqueUsername(
        tx,
        params.username || `tg_${providerUserId}`
      );
      const fullName = [params.firstName, params.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
        .slice(0, 40);

      await tx.insert(profiles).values({
        userId,
        username,
        displayName: fullName || username,
        bio: "",
      });

      await tx.insert(userSettings).values({
        userId,
        language: params.languageCode?.slice(0, 10) || "uz",
        theme: "system",
        privacyLevel: "public",
      });

      await tx.insert(userActivity).values({
        userId,
      });

      await tx.insert(authIdentities).values({
        userId,
        provider: "telegram",
        providerUserId,
        providerUsername: params.username ?? null,
        emailVerified: false,
        lastLoginAt: new Date(),
      });
    }

    const session = await createUserSession(tx, {
      userId,
      authChannel: params.authChannel ?? "tma_bearer",
      provider: "telegram",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    await writeAuditLog(tx, {
      actorId: userId,
      actorRole: role,
      eventType: AUDIT_EVENTS.AUTH_LOGIN_TELEGRAM,
      targetType: "session",
      targetId: session.sessionId,
      ipAddress: params.ipAddress,
      requestId: params.requestId,
      metadata: { isNewUser },
    });

    return {
      userId,
      role,
      isNewUser,
      ...session,
    };
  });
}
