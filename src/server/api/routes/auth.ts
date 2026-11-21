import "server-only";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { getServerEnv } from "@/lib/env";
import {
  completeAccountSetupSchema,
  confirmTelegramLinkSchema,
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  initLinkSchema,
  passwordLoginSchema,
  telegramInitDataSchema,
} from "@/lib/validation/account";
import {
  AccountAccessError,
  completeAccountSetup,
  loginOrRegisterWithGoogle,
  loginOrRegisterWithTelegram,
  loginWithUsernamePassword,
  PasswordAuthError,
} from "@/server/auth/account";
import {
  createEmailVerificationRequest,
  EmailVerificationError,
  verifyEmailToken,
} from "@/server/auth/email-verification";
import {
  createGoogleAuthorizationRequest,
  exchangeGoogleCodeAndVerify,
  GOOGLE_OAUTH_COOKIE_NAME,
  GoogleOAuthError,
  verifyGoogleStateCookie,
} from "@/server/auth/google";
import {
  AccountLinkingError,
  completeAccountLinkWithToken,
  initiateAccountLink,
  unlinkProviderIdentity,
} from "@/server/auth/linking";
import { resolveActorPermissionsInTx } from "@/server/auth/actor-permissions";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  createUserSession,
  revokeAllUserSessions,
  revokeSessionById,
} from "@/server/auth/session";
import {
  consumeTelegramInitDataReplay,
  TelegramAuthError,
  verifyTelegramInitData,
} from "@/server/auth/telegram";
import { withDbContext } from "@/server/db/context";
import {
  authIdentities,
  profiles,
  userSettings,
  users,
} from "@/server/db/schema";
import { RATE_LIMIT_RULES } from "@/server/security/rate-limit";
import { recordActivityVisitInTx } from "@/server/services/activity.service";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";
import { requireAuth, requirePermission } from "../middleware/authorize";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>();

function resolveRequestOrigin(c: {
  req: { url: string; header: (name: string) => string | undefined };
}): string {
  const forwardedHost = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || c.req.header("host")?.trim();
  const forwardedProto = c.req
    .header("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    const proto = forwardedProto || "https";
    return `${proto}://${host}`;
  }
  const env = getServerEnv();
  if (env.APP_URL && !env.APP_URL.includes("localhost")) {
    return env.APP_URL.replace(/\/$/, "");
  }
  return new URL(c.req.url).origin;
}

// 1. Google OAuth 2.0 Web Login (with PKCE)
authRoutes.get(
  "/auth/google/start",
  rateLimitMiddleware(RATE_LIMIT_RULES.AUTH_FLOW),
  (c) => {
    const env = getServerEnv();
    const requestOrigin = resolveRequestOrigin(c);
    const linkToken = c.req.query("linkToken");
    const mode = linkToken ? "link" : "login";

    try {
      const { authorizationUrl, signedStateCookie } =
        createGoogleAuthorizationRequest({ mode, linkToken });

      setCookie(c, GOOGLE_OAUTH_COOKIE_NAME, signedStateCookie, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: env.NODE_ENV === "production",
        maxAge: 600,
      });

      return c.redirect(authorizationUrl, 302);
    } catch (err) {
      if (err instanceof GoogleOAuthError) {
        const accept = c.req.header("accept") ?? "";
        if (accept.includes("text/html")) {
          const fallbackUrl = new URL(requestOrigin);
          fallbackUrl.searchParams.set("auth_error", err.code.toLowerCase());
          return c.redirect(fallbackUrl.toString(), 302);
        }
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          503
        );
      }
      throw err;
    }
  }
);

authRoutes.get(
  "/auth/google/callback",
  rateLimitMiddleware(RATE_LIMIT_RULES.AUTH_FLOW),
  async (c) => {
    const env = getServerEnv();
    const requestOrigin = resolveRequestOrigin(c);
    const code = c.req.query("code");
    const state = c.req.query("state");
    const oauthError = c.req.query("error");
    const signedCookie = getCookie(c, GOOGLE_OAUTH_COOKIE_NAME);

    deleteCookie(c, GOOGLE_OAUTH_COOKIE_NAME, { path: "/" });

    const accept = c.req.header("accept") ?? "";
    const wantsJson =
      accept.includes("application/json") && !accept.includes("text/html");

    const redirectWithError = (code: string) => {
      const target = new URL(requestOrigin);
      target.searchParams.set("auth_error", code.toLowerCase());
      return c.redirect(target.toString(), 302);
    };

    if (oauthError) {
      if (!wantsJson) {
        return redirectWithError("oauth_denied");
      }
      return c.json(
        {
          ok: false,
          error: {
            code: "OAUTH_DENIED",
            message: "Google authorization was cancelled or denied",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    if (!code) {
      if (!wantsJson) {
        return redirectWithError("invalid_callback");
      }
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_CALLBACK", message: "Missing OAuth code" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const statePayload = verifyGoogleStateCookie(signedCookie, state);
      const googleProfile = await exchangeGoogleCodeAndVerify({
        code,
        codeVerifier: statePayload.codeVerifier,
        expectedNonce: statePayload.nonce,
      });

      if (statePayload.mode === "link" && statePayload.linkToken) {
        const linked = await completeAccountLinkWithToken({
          rawLinkToken: statePayload.linkToken,
          provider: "google",
          providerUserId: googleProfile.sub,
          providerEmail: googleProfile.email,
          emailVerified: googleProfile.emailVerified,
          ipAddress: c.get("ipAddress"),
          requestId: c.get("requestId"),
        });

        if (!wantsJson) {
          const linkTarget = new URL(requestOrigin);
          linkTarget.pathname = "/settings";
          linkTarget.searchParams.set("linked", "google");
          return c.redirect(linkTarget.toString(), 302);
        }

        return c.json({
          ok: true,
          data: {
            linked: true,
            provider: linked.provider,
            userId: linked.userId,
          },
          meta: { requestId: c.get("requestId") },
        });
      }

      const result = await loginOrRegisterWithGoogle({
        sub: googleProfile.sub,
        email: googleProfile.email,
        emailVerified: googleProfile.emailVerified,
        displayName: googleProfile.name,
        ipAddress: c.get("ipAddress"),
        userAgent: c.req.header("user-agent"),
        requestId: c.get("requestId"),
      });

      c.header(
        "Set-Cookie",
        buildSessionCookieHeader(
          result.sessionToken,
          result.expiresAt,
          env.NODE_ENV === "production"
        ),
        { append: true }
      );

      if (!wantsJson) {
        const successTarget = new URL(requestOrigin);
        successTarget.pathname = "/";
        successTarget.searchParams.set(
          "auth",
          result.needsOnboarding ? "setup" : "success"
        );
        return c.redirect(successTarget.toString(), 302);
      }

      return c.json({
        ok: true,
        data: {
          userId: result.userId,
          role: result.role,
          isNewUser: result.isNewUser,
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof AccountLinkingError) {
        if (!wantsJson) {
          return redirectWithError(err.code);
        }
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode as 400 | 409
        );
      }
      if (err instanceof GoogleOAuthError) {
        if (!wantsJson) {
          return redirectWithError(err.code);
        }
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.code === "GOOGLE_NOT_CONFIGURED" ? 503 : 401
        );
      }
      if (err instanceof AccountAccessError) {
        if (!wantsJson) {
          return redirectWithError(err.code);
        }
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          403
        );
      }
      throw err;
    }
  }
);

// 2. Telegram Mini App initData Verification Endpoint (Prepared for TMA phase)
authRoutes.post(
  "/auth/telegram",
  rateLimitMiddleware(RATE_LIMIT_RULES.AUTH_FLOW),
  async (c) => {
    const env = getServerEnv();
    const rawBody = await c.req.json().catch(() => null);
    const parsed = telegramInitDataSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid Telegram initData payload",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const verified = verifyTelegramInitData(
        parsed.data.initData,
        env.TELEGRAM_BOT_TOKEN,
        { maxAgeSeconds: env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS }
      );

      await consumeTelegramInitDataReplay({
        rawInitData: parsed.data.initData,
        telegramUserId: verified.user.id,
        authDate: verified.authDate,
        maxAgeSeconds: env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
      });

      const loginResult = await loginOrRegisterWithTelegram({
        telegramUserId: verified.user.id,
        username: verified.user.username,
        firstName: verified.user.first_name,
        lastName: verified.user.last_name,
        languageCode: verified.user.language_code,
        authChannel: "tma_bearer",
        ipAddress: c.get("ipAddress"),
        userAgent: c.req.header("user-agent"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: {
          sessionToken: loginResult.sessionToken,
          expiresAt: loginResult.expiresAt.toISOString(),
          userId: loginResult.userId,
          role: loginResult.role,
          isNewUser: loginResult.isNewUser,
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof TelegramAuthError) {
        await withDbContext({ authFlow: true }, async (tx) => {
          await writeAuditLog(tx, {
            actorRole: "anonymous",
            eventType: AUDIT_EVENTS.AUTH_LOGIN_FAILED,
            targetType: "auth_identity",
            targetId: "telegram",
            ipAddress: c.get("ipAddress"),
            requestId: c.get("requestId"),
            metadata: { reason: err.code },
          });
        });

        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.code === "TELEGRAM_NOT_CONFIGURED" ? 503 : 401
        );
      }
      if (err instanceof AccountAccessError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          403
        );
      }
      throw err;
    }
  }
);

// 2b. Username + Password Login
authRoutes.post(
  "/auth/login",
  rateLimitMiddleware(RATE_LIMIT_RULES.AUTH_FLOW),
  async (c) => {
    const env = getServerEnv();
    const rawBody = await c.req.json().catch(() => null);
    const parsed = passwordLoginSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Username va parolni to‘g‘ri kiriting",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const result = await loginWithUsernamePassword({
        username: parsed.data.username,
        password: parsed.data.password,
        authChannel: "web_cookie",
        ipAddress: c.get("ipAddress"),
        userAgent: c.req.header("user-agent"),
        requestId: c.get("requestId"),
      });

      c.header(
        "Set-Cookie",
        buildSessionCookieHeader(
          result.sessionToken,
          result.expiresAt,
          env.NODE_ENV === "production"
        )
      );

      return c.json({
        ok: true,
        data: {
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt.toISOString(),
          userId: result.userId,
          role: result.role,
          needsOnboarding: result.needsOnboarding,
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof PasswordAuthError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode
        );
      }
      if (err instanceof AccountAccessError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          403
        );
      }
      throw err;
    }
  }
);

// 2c. Complete Post-Google / Initial Account Setup (Username + Password + Display Name + Bio)
authRoutes.post(
  "/auth/complete-setup",
  requireAuth,
  rateLimitMiddleware(RATE_LIMIT_RULES.AUTH_FLOW),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = completeAccountSetupSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Ma’lumotlarni to‘g‘ri kiriting",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const updated = await completeAccountSetup({
        userId: actor.userId,
        role: actor.role,
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        password: parsed.data.password,
        bio: parsed.data.bio,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: {
          ...updated,
          onboardingCompleted: true,
          hasPassword: true,
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof PasswordAuthError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode
        );
      }
      throw err;
    }
  }
);

// 3. Current Authenticated User
authRoutes.get("/auth/me", requireAuth, async (c) => {
  const actor = c.get("actor")!;

  const data = await withDbContext(
    { userId: actor.userId, role: actor.role },
    async (tx) => {
      await recordActivityVisitInTx(tx, actor.userId);

      const [userRow] = await tx
        .select({
          id: users.id,
          role: users.role,
          status: users.status,
          suspendedUntil: users.suspendedUntil,
          primaryEmail: users.primaryEmail,
          emailVerifiedAt: users.emailVerifiedAt,
          passwordHash: users.passwordHash,
          onboardingCompleted: users.onboardingCompleted,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1);

      const [profileRow] = await tx
        .select({
          username: profiles.username,
          displayName: profiles.displayName,
          bio: profiles.bio,
          avatarId: profiles.avatarId,
          externalLinks: profiles.externalLinks,
          followersCount: profiles.followersCount,
          followingCount: profiles.followingCount,
          postsCount: profiles.postsCount,
        })
        .from(profiles)
        .where(eq(profiles.userId, actor.userId))
        .limit(1);

      const [settingsRow] = await tx
        .select({
          language: userSettings.language,
          theme: userSettings.theme,
          privacyLevel: userSettings.privacyLevel,
          autoApproveFollows: userSettings.autoApproveFollows,
          showOnlineStatus: userSettings.showOnlineStatus,
          allowMentions: userSettings.allowMentions,
          emailNotifications: userSettings.emailNotifications,
          telegramNotifications: userSettings.telegramNotifications,
          telegramBotStarted: userSettings.telegramBotStarted,
          notificationPreferences: userSettings.notificationPreferences,
        })
        .from(userSettings)
        .where(eq(userSettings.userId, actor.userId))
        .limit(1);

      const identities = await tx
        .select({
          provider: authIdentities.provider,
          providerUsername: authIdentities.providerUsername,
          emailVerified: authIdentities.emailVerified,
          linkedAt: authIdentities.linkedAt,
        })
        .from(authIdentities)
        .where(eq(authIdentities.userId, actor.userId));

      const effectivePermissions = userRow
        ? await resolveActorPermissionsInTx(tx, userRow.id, userRow.role)
        : [];

      return {
        user: userRow
          ? {
              id: userRow.id,
              role: userRow.role,
              status: userRow.status,
              suspendedUntil: userRow.suspendedUntil,
              primaryEmail: userRow.primaryEmail,
              emailVerifiedAt: userRow.emailVerifiedAt,
              hasPassword: Boolean(userRow.passwordHash),
              onboardingCompleted: Boolean(userRow.onboardingCompleted),
              createdAt: userRow.createdAt,
            }
          : null,
        effectivePermissions,
        profile: profileRow ?? null,
        settings: settingsRow ?? null,
        identities,
      };
    }
  );

  return c.json({
    ok: true,
    data,
    meta: { requestId: c.get("requestId") },
  });
});

// 4. Logout & Session Revocation
authRoutes.post("/auth/logout", requireAuth, async (c) => {
  const env = getServerEnv();
  const actor = c.get("actor")!;

  await revokeSessionById(actor.userId, actor.role, actor.sessionId);

  await withDbContext(
    { userId: actor.userId, role: actor.role },
    async (tx) => {
      await writeAuditLog(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        eventType: AUDIT_EVENTS.AUTH_LOGOUT,
        targetType: "session",
        targetId: actor.sessionId,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
    }
  );

  c.header(
    "Set-Cookie",
    buildClearSessionCookieHeader(env.NODE_ENV === "production")
  );

  return c.json({
    ok: true,
    data: { loggedOut: true },
    meta: { requestId: c.get("requestId") },
  });
});

authRoutes.post("/auth/logout-all", requireAuth, async (c) => {
  const env = getServerEnv();
  const actor = c.get("actor")!;

  await revokeAllUserSessions(actor.userId, actor.role);

  await withDbContext(
    { userId: actor.userId, role: actor.role },
    async (tx) => {
      await writeAuditLog(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        eventType: AUDIT_EVENTS.AUTH_LOGOUT_ALL,
        targetType: "user",
        targetId: actor.userId,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
    }
  );

  c.header(
    "Set-Cookie",
    buildClearSessionCookieHeader(env.NODE_ENV === "production")
  );

  return c.json({
    ok: true,
    data: { loggedOutAll: true },
    meta: { requestId: c.get("requestId") },
  });
});

// 5. Email Verification
authRoutes.post(
  "/auth/email/verify-request",
  requirePermission(PERMISSIONS.EMAIL_VERIFY_MANAGE),
  rateLimitMiddleware(RATE_LIMIT_RULES.EMAIL_VERIFY),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = emailVerificationRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid email address",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const result = await createEmailVerificationRequest({
      userId: actor.userId,
      role: actor.role,
      email: parsed.data.email,
      ipAddress: c.get("ipAddress"),
      requestId: c.get("requestId"),
    });

    // Note: Email delivery adapter plugs in here; raw token is never returned in production API responses.
    return c.json({
      ok: true,
      data: {
        verificationPending: true,
        expiresAt: result.expiresAt.toISOString(),
      },
      meta: { requestId: c.get("requestId") },
    });
  }
);

authRoutes.post(
  "/auth/email/verify",
  rateLimitMiddleware(RATE_LIMIT_RULES.EMAIL_VERIFY),
  async (c) => {
    const rawBody = await c.req.json().catch(() => null);
    const parsed = emailVerificationConfirmSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid verification token payload",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const verified = await verifyEmailToken({
        rawToken: parsed.data.token,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: {
          verified: true,
          email: verified.email,
          verifiedAt: verified.verifiedAt.toISOString(),
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof EmailVerificationError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.code === "EMAIL_ALREADY_IN_USE" ? 409 : 400
        );
      }
      throw err;
    }
  }
);

// 6. Consent-Based Account Linking (Google <-> Telegram)
authRoutes.post(
  "/auth/link/telegram/init",
  requirePermission(PERMISSIONS.AUTH_LINK_MANAGE),
  rateLimitMiddleware(RATE_LIMIT_RULES.ACCOUNT_LINK),
  async (c) => {
    const env = getServerEnv();
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = initLinkSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "CONSENT_REQUIRED",
            message: "Explicit user consent is required to link Telegram",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const { linkToken, expiresAt } = await initiateAccountLink({
        userId: actor.userId,
        role: actor.role,
        targetProvider: "telegram",
        consentAccepted: parsed.data.consentAccepted,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      const botUsername =
        env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "averoappbot";
      const deepLink = `https://t.me/${botUsername}?start=link_${linkToken}`;

      return c.json({
        ok: true,
        data: {
          linkToken,
          deepLink,
          expiresAt: expiresAt.toISOString(),
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof AccountLinkingError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode as 400 | 409
        );
      }
      throw err;
    }
  }
);

authRoutes.post(
  "/auth/link/telegram/confirm",
  rateLimitMiddleware(RATE_LIMIT_RULES.ACCOUNT_LINK),
  async (c) => {
    const env = getServerEnv();
    const rawBody = await c.req.json().catch(() => null);
    const parsed = confirmTelegramLinkSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid Telegram link confirmation payload",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const verified = verifyTelegramInitData(
        parsed.data.initData,
        env.TELEGRAM_BOT_TOKEN,
        { maxAgeSeconds: env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS }
      );

      const result = await completeAccountLinkWithToken({
        rawLinkToken: parsed.data.linkToken,
        provider: "telegram",
        providerUserId: String(verified.user.id),
        providerUsername: verified.user.username ?? null,
        emailVerified: false,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      // Also issue a TMA bearer session for the unified linked user
      const session = await withDbContext({ authFlow: true }, async (tx) => {
        return createUserSession(tx, {
          userId: result.userId,
          authChannel: "tma_bearer",
          provider: "telegram",
          ipAddress: c.get("ipAddress"),
          userAgent: c.req.header("user-agent"),
        });
      });

      return c.json({
        ok: true,
        data: {
          linked: true,
          provider: result.provider,
          userId: result.userId,
          sessionToken: session.sessionToken,
          expiresAt: session.expiresAt.toISOString(),
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof TelegramAuthError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.code === "TELEGRAM_NOT_CONFIGURED" ? 503 : 401
        );
      }
      if (err instanceof AccountLinkingError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode as 400 | 409
        );
      }
      throw err;
    }
  }
);

authRoutes.post(
  "/auth/link/google/init",
  requirePermission(PERMISSIONS.AUTH_LINK_MANAGE),
  rateLimitMiddleware(RATE_LIMIT_RULES.ACCOUNT_LINK),
  async (c) => {
    const env = getServerEnv();
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = initLinkSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "CONSENT_REQUIRED",
            message: "Explicit user consent is required to link Google",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const { linkToken, expiresAt } = await initiateAccountLink({
        userId: actor.userId,
        role: actor.role,
        targetProvider: "google",
        consentAccepted: parsed.data.consentAccepted,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      const startUrl = `${env.APP_URL.replace(/\/$/, "")}/api/v1/auth/google/start?linkToken=${encodeURIComponent(linkToken)}`;

      return c.json({
        ok: true,
        data: {
          authorizationStartUrl: startUrl,
          expiresAt: expiresAt.toISOString(),
        },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof AccountLinkingError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode as 400 | 409
        );
      }
      throw err;
    }
  }
);

authRoutes.delete(
  "/auth/identities/:provider",
  requirePermission(PERMISSIONS.AUTH_LINK_MANAGE),
  rateLimitMiddleware(RATE_LIMIT_RULES.ACCOUNT_LINK),
  async (c) => {
    const actor = c.get("actor")!;
    const provider = c.req.param("provider");
    if (provider !== "google" && provider !== "telegram") {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_PROVIDER", message: "Unsupported provider" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      await unlinkProviderIdentity({
        userId: actor.userId,
        role: actor.role,
        provider,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: { unlinked: true, provider },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof AccountLinkingError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode as 400 | 409
        );
      }
      throw err;
    }
  }
);
