import "server-only";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  updateProfileSchema,
  updateSettingsSchema,
} from "@/lib/validation/account";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
  type NotificationPreferences,
} from "@/lib/validation/notifications";
import { PERMISSIONS } from "@/server/auth/permissions";
import { withDbContext } from "@/server/db/context";
import { authIdentities, userSettings } from "@/server/db/schema";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";
import {
  getOwnProfileDashboard,
  getPublicProfileByUsername,
  listIncomingFollowRequests,
  ProfileServiceError,
  respondToFollowRequest,
  suggestAvailableUsernames,
  updateOwnProfile,
} from "@/server/services/profile.service";
import { requirePermission } from "../middleware/authorize";
import type { AppEnv } from "../types";

export const accountRoutes = new Hono<AppEnv>();

const uuidSchema = z.string().uuid();

accountRoutes.get("/account/username-suggestions", async (c) => {
  const q = c.req.query("q") ?? "avero_user";
  const suggestions = await suggestAvailableUsernames(q);
  return c.json({
    ok: true,
    data: { suggestions },
    meta: { requestId: c.get("requestId") },
  });
});

accountRoutes.get(
  "/account/profile-dashboard",
  requirePermission(PERMISSIONS.PROFILE_SELF_READ),
  async (c) => {
    const actor = c.get("actor")!;
    const dashboard = await getOwnProfileDashboard(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: dashboard,
      meta: { requestId: c.get("requestId") },
    });
  }
);

accountRoutes.get("/users/:username", async (c) => {
  const username = c.req.param("username");
  const actor = c.get("actor");
  const profile = await getPublicProfileByUsername(
    username,
    actor ? { userId: actor.userId, role: actor.role } : null
  );

  if (!profile) {
    return c.json(
      {
        ok: false,
        error: { code: "PROFILE_NOT_FOUND", message: "Profil topilmadi" },
        meta: { requestId: c.get("requestId") },
      },
      404
    );
  }

  return c.json({
    ok: true,
    data: { profile },
    meta: { requestId: c.get("requestId") },
  });
});

accountRoutes.patch(
  "/account/profile",
  requirePermission(PERMISSIONS.PROFILE_SELF_UPDATE),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Profil ma’lumotlari noto‘g‘ri",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const updates = parsed.data;
    if (
      updates.username === undefined &&
      updates.displayName === undefined &&
      updates.bio === undefined &&
      updates.avatarId === undefined &&
      updates.externalLinks === undefined
    ) {
      return c.json(
        {
          ok: false,
          error: {
            code: "EMPTY_UPDATE",
            message: "Kamida bitta maydon yuborilishi kerak",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const profile = await updateOwnProfile({
        userId: actor.userId,
        role: actor.role,
        username: updates.username,
        displayName: updates.displayName,
        bio: updates.bio,
        avatarId: updates.avatarId,
        externalLinks: updates.externalLinks,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: { profile },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      if (err instanceof ProfileServiceError) {
        return c.json(
          {
            ok: false,
            error: { code: err.code, message: err.message },
            meta: { requestId: c.get("requestId") },
          },
          err.statusCode as 403 | 404 | 409
        );
      }
      throw err;
    }
  }
);

accountRoutes.get(
  "/account/settings",
  requirePermission(PERMISSIONS.SETTINGS_SELF_READ),
  async (c) => {
    const actor = c.get("actor")!;

    const settings = await withDbContext(
      { userId: actor.userId, role: actor.role },
      async (tx) => {
        const [row] = await tx
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, actor.userId))
          .limit(1);
        return row ?? null;
      }
    );

    return c.json({
      ok: true,
      data: { settings },
      meta: { requestId: c.get("requestId") },
    });
  }
);

accountRoutes.patch(
  "/account/settings",
  requirePermission(PERMISSIONS.SETTINGS_SELF_UPDATE),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = updateSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Sozlamalar ma’lumotlari noto‘g‘ri",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const updates = parsed.data;
    const outcome = await withDbContext(
      { userId: actor.userId, role: actor.role },
      async (tx) => {
        const [current] = await tx
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, actor.userId))
          .limit(1);

        if (
          updates.telegramNotifications === true &&
          !current?.telegramBotStarted
        ) {
          return { error: "BOT_NOT_STARTED" as const };
        }

        const {
          notificationPreferences: incomingPrefs,
          ...scalarUpdates
        } = updates;

        let mergedPrefs: NotificationPreferences | undefined;
        if (incomingPrefs) {
          const base: NotificationPreferences = {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...(current?.notificationPreferences ?? {}),
          };
          for (const key of NOTIFICATION_PREFERENCE_KEYS) {
            const val = incomingPrefs[key];
            if (typeof val === "boolean") {
              base[key] = val;
            }
          }
          mergedPrefs = base;
        }

        const [row] = await tx
          .update(userSettings)
          .set({
            ...scalarUpdates,
            ...(mergedPrefs ? { notificationPreferences: mergedPrefs } : {}),
            updatedAt: new Date(),
          })
          .where(eq(userSettings.userId, actor.userId))
          .returning();

        await writeAuditLog(tx, {
          actorId: actor.userId,
          actorRole: actor.role,
          eventType: AUDIT_EVENTS.SETTINGS_UPDATED,
          targetType: "user_settings",
          targetId: actor.userId,
          ipAddress: c.get("ipAddress"),
          requestId: c.get("requestId"),
          metadata: { fields: Object.keys(updates) },
        });

        return { row };
      }
    );

    if ("error" in outcome) {
      return c.json(
        {
          ok: false,
          error: {
            code: "TELEGRAM_BOT_NOT_STARTED",
            message:
              "Telegram bildirishnomalarini yoqish uchun avval botni /start orqali ishga tushiring",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    return c.json({
      ok: true,
      data: { settings: outcome.row },
      meta: { requestId: c.get("requestId") },
    });
  }
);

accountRoutes.post(
  "/account/telegram-bot/confirm-start",
  requirePermission(PERMISSIONS.SETTINGS_SELF_UPDATE),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        botStartedConsent: z.literal(true),
        enableNotifications: z.boolean().optional(),
      })
      .safeParse(rawBody);

    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "CONSENT_REQUIRED",
            message: "Bot /start va rozilik tasdiqlanishi shart",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const result = await withDbContext(
      { userId: actor.userId, role: actor.role },
      async (tx) => {
        const [tgIdentity] = await tx
          .select({ providerUserId: authIdentities.providerUserId })
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.userId, actor.userId),
              eq(authIdentities.provider, "telegram")
            )
          )
          .limit(1);

        if (!tgIdentity) {
          return { error: "TELEGRAM_NOT_LINKED" as const };
        }

        const [current] = await tx
          .select({ telegramChatId: userSettings.telegramChatId })
          .from(userSettings)
          .where(eq(userSettings.userId, actor.userId))
          .limit(1);

        const [updated] = await tx
          .update(userSettings)
          .set({
            telegramBotStarted: true,
            telegramChatId:
              current?.telegramChatId || tgIdentity.providerUserId,
            ...(parsed.data.enableNotifications !== undefined
              ? { telegramNotifications: parsed.data.enableNotifications }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(userSettings.userId, actor.userId))
          .returning();

        return { settings: updated };
      }
    );

    if ("error" in result) {
      return c.json(
        {
          ok: false,
          error: {
            code: "TELEGRAM_NOT_LINKED",
            message: "Avval Telegram akkauntingizni profilga ulang",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    return c.json({
      ok: true,
      data: { settings: result.settings },
      meta: { requestId: c.get("requestId") },
    });
  }
);

// --- Follow Requests Management ---

accountRoutes.get(
  "/account/follow-requests",
  requirePermission(PERMISSIONS.USER_FOLLOW),
  async (c) => {
    const actor = c.get("actor")!;
    const requests = await listIncomingFollowRequests(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: { requests },
      meta: { requestId: c.get("requestId") },
    });
  }
);

for (const action of ["accept", "decline"] as const) {
  accountRoutes.post(
    `/account/follow-requests/:requestId/${action}`,
    requirePermission(PERMISSIONS.USER_FOLLOW),
    async (c) => {
      const actor = c.get("actor")!;
      const requestId = c.req.param("requestId");
      if (!uuidSchema.safeParse(requestId).success) {
        return c.json(
          {
            ok: false,
            error: { code: "INVALID_ID", message: "Noto‘g‘ri request ID" },
            meta: { requestId: c.get("requestId") },
          },
          400
        );
      }

      try {
        const result = await respondToFollowRequest({
          requestId,
          ownerId: actor.userId,
          ownerRole: actor.role,
          action,
        });
        return c.json({
          ok: true,
          data: result,
          meta: { requestId: c.get("requestId") },
        });
      } catch (err) {
        if (err instanceof ProfileServiceError) {
          return c.json(
            {
              ok: false,
              error: { code: err.code, message: err.message },
              meta: { requestId: c.get("requestId") },
            },
            err.statusCode as 404
          );
        }
        throw err;
      }
    }
  );
}
