import "server-only";
import { Hono } from "hono";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { submitAppealSchema } from "@/lib/validation/moderation";
import {
  blockUserSchema,
  commentReportSchema,
  sendDmSchema,
} from "@/lib/validation/social";
import { PERMISSIONS } from "@/server/auth/permissions";
import { timingSafeEqualString } from "@/server/security/crypto";
import {
  listMyWarningsAndAppeals,
  submitModerationAppeal,
} from "@/server/services/moderation.service";
import {
  listDmThreads,
  listMyBlocks,
  listMyNotifications,
  markAllNotificationsRead,
  removeUserBlock,
  reportComment,
  respondToDmRequest,
  sendDmMessage,
  setUserBlock,
  SocialServiceError,
} from "@/server/services/social.service";
import { handleTelegramWebhookUpdate } from "@/server/services/telegram-bot.service";
import { requireAuth, requirePermission } from "../middleware/authorize";
import type { AppEnv } from "../types";

export const socialRoutes = new Hono<AppEnv>();

const uuidParamSchema = z.string().uuid();

function handleSocialError(
  err: unknown,
  requestId: string
): {
  status: 400 | 403 | 404 | 409 | 429;
  body: Record<string, unknown>;
} | null {
  if (err instanceof SocialServiceError) {
    return {
      status: err.statusCode as 400 | 403 | 404 | 409 | 429,
      body: {
        ok: false,
        error: { code: err.code, message: err.message },
        meta: { requestId },
      },
    };
  }
  return null;
}

// --- Notifications ---

socialRoutes.get("/notifications", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const items = await listMyNotifications(actor.userId, actor.role);
  return c.json({
    ok: true,
    data: {
      notifications: items.map((n) => ({
        ...n,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
    },
    meta: { requestId: c.get("requestId") },
  });
});

socialRoutes.post("/notifications/read-all", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  await markAllNotificationsRead(actor.userId, actor.role);
  return c.json({
    ok: true,
    data: { marked: true },
    meta: { requestId: c.get("requestId") },
  });
});

// --- Granular User Blocking (dm_only | follow_only | content_only | full) ---

socialRoutes.get("/account/blocks", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const blocks = await listMyBlocks(actor.userId, actor.role);
  return c.json({
    ok: true,
    data: {
      blocks: blocks.map((b) => ({
        ...b,
        createdAt: b.createdAt.toISOString(),
      })),
    },
    meta: { requestId: c.get("requestId") },
  });
});

socialRoutes.put(
  "/users/:userId/block",
  requirePermission(PERMISSIONS.USER_BLOCK),
  async (c) => {
    const actor = c.get("actor")!;
    const blockedId = c.req.param("userId");
    if (!uuidParamSchema.safeParse(blockedId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri user ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = blockUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Noto‘g‘ri bloklash darajasi",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      await setUserBlock({
        blockerId: actor.userId,
        blockerRole: actor.role,
        blockedId,
        level: parsed.data.level,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: { blockedId, level: parsed.data.level },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handleSocialError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

socialRoutes.delete(
  "/users/:userId/block",
  requirePermission(PERMISSIONS.USER_BLOCK),
  async (c) => {
    const actor = c.get("actor")!;
    const blockedId = c.req.param("userId");
    if (!uuidParamSchema.safeParse(blockedId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri user ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    await removeUserBlock({
      blockerId: actor.userId,
      blockerRole: actor.role,
      blockedId,
      ipAddress: c.get("ipAddress"),
      requestId: c.get("requestId"),
    });

    return c.json({
      ok: true,
      data: { blockedId, level: "none" },
      meta: { requestId: c.get("requestId") },
    });
  }
);

// --- Direct Messages (Text-Only + Message Requests) ---

socialRoutes.get("/messages/threads", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const threads = await listDmThreads(actor.userId, actor.role);
  return c.json({
    ok: true,
    data: { threads },
    meta: { requestId: c.get("requestId") },
  });
});

socialRoutes.post(
  "/messages/send",
  requirePermission(PERMISSIONS.DM_SEND),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = sendDmSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri xabar",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const result = await sendDmMessage({
        senderId: actor.userId,
        senderRole: actor.role,
        recipientId: parsed.data.recipientId,
        body: parsed.data.body,
      });

      return c.json(
        {
          ok: true,
          data: result,
          meta: { requestId: c.get("requestId") },
        },
        201
      );
    } catch (err) {
      const mapped = handleSocialError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

for (const action of ["accept", "decline"] as const) {
  socialRoutes.post(
    `/messages/threads/:threadId/${action}`,
    requirePermission(PERMISSIONS.DM_SEND),
    async (c) => {
      const actor = c.get("actor")!;
      const threadId = c.req.param("threadId");
      if (!uuidParamSchema.safeParse(threadId).success) {
        return c.json(
          {
            ok: false,
            error: { code: "INVALID_ID", message: "Noto‘g‘ri thread ID" },
            meta: { requestId: c.get("requestId") },
          },
          400
        );
      }

      try {
        const result = await respondToDmRequest({
          threadId,
          userId: actor.userId,
          role: actor.role,
          action,
        });
        return c.json({
          ok: true,
          data: result,
          meta: { requestId: c.get("requestId") },
        });
      } catch (err) {
        const mapped = handleSocialError(err, c.get("requestId"));
        if (mapped) return c.json(mapped.body, mapped.status);
        throw err;
      }
    }
  );
}

// --- Comment-Only Reports ---

socialRoutes.post(
  "/reports/comments",
  requirePermission(PERMISSIONS.COMMENT_REPORT),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = commentReportSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Shikoyat ma’lumotlari noto‘g‘ri",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const report = await reportComment({
        reporterId: actor.userId,
        reporterRole: actor.role,
        commentId: parsed.data.commentId,
        reasonCode: parsed.data.reasonCode,
        details: parsed.data.details,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json(
        {
          ok: true,
          data: {
            report: {
              id: report.id,
              commentId: report.commentId,
              reasonCode: report.reasonCode,
              status: report.status,
              createdAt: report.createdAt.toISOString(),
            },
          },
          meta: { requestId: c.get("requestId") },
        },
        201
      );
    } catch (err) {
      const mapped = handleSocialError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

// --- User Moderation Warnings & Appeals ---

socialRoutes.get("/moderation/appeals/my", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const data = await listMyWarningsAndAppeals(actor.userId, actor.role);
  return c.json({
    ok: true,
    data,
    meta: { requestId: c.get("requestId") },
  });
});

socialRoutes.post("/moderation/appeals", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const rawBody = await c.req.json().catch(() => null);
  const parsed = submitAppealSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            parsed.error.issues[0]?.message ?? "Apellyatsiya matni noto‘g‘ri",
        },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  const appeal = await submitModerationAppeal({
    userId: actor.userId,
    role: actor.role,
    actionType: parsed.data.actionType,
    reason: parsed.data.reason,
    ipAddress: c.get("ipAddress"),
    requestId: c.get("requestId"),
  });

  return c.json(
    {
      ok: true,
      data: {
        appeal: {
          ...appeal,
          createdAt: appeal.createdAt.toISOString(),
          reviewedAt: appeal.reviewedAt
            ? appeal.reviewedAt.toISOString()
            : null,
        },
      },
      meta: { requestId: c.get("requestId") },
    },
    201
  );
});

// --- Telegram Bot Webhook (/start detection + consent callback) ---

socialRoutes.post("/telegram/webhook", async (c) => {
  const env = getServerEnv();
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const headerSecret = c.req.header("x-telegram-bot-api-secret-token") ?? "";
    if (!timingSafeEqualString(headerSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
      return c.json(
        {
          ok: false,
          error: { code: "FORBIDDEN", message: "Invalid webhook secret" },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }
  }

  const update = await c.req.json().catch(() => ({}));
  const result = await handleTelegramWebhookUpdate(update);
  return c.json({
    ok: true,
    data: result,
    meta: { requestId: c.get("requestId") },
  });
});
