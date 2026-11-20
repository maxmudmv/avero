import "server-only";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assignRoleSchema } from "@/lib/validation/account";
import {
  deleteCommentByModSchema,
  moderateUserStatusSchema,
  reviewAppealSchema,
  reviewFlagSchema,
  reviewReportSchema,
  setAdminPermissionsSchema,
  warnUserSchema,
} from "@/lib/validation/moderation";
import { announcementSchema } from "@/lib/validation/notifications";
import { actorHasRuntimePermission } from "@/server/auth/actor-permissions";
import { PERMISSIONS } from "@/server/auth/permissions";
import { withDbContext } from "@/server/db/context";
import { adminUserPermissions, users } from "@/server/db/schema";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";
import {
  applyUserModerationStatus,
  broadcastPlatformAnnouncement,
  deleteCommentAsStaff,
  issueUserWarning,
  listAppealsForStaff,
  listAuditLogsForGovernance,
  listCommentReportsForStaff,
  listGovernanceUsers,
  listModerationFlagsForStaff,
  ModerationServiceError,
  reviewCommentReport,
  reviewModerationAppeal,
  reviewModerationFlag,
  setAdminDelegatedPermissions,
} from "@/server/services/moderation.service";
import { requireAuth, requirePermission } from "../middleware/authorize";
import type { AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();

const uuidSchema = z.string().uuid();

function handleModError(
  err: unknown,
  requestId: string
): {
  status: 400 | 403 | 404;
  body: Record<string, unknown>;
} | null {
  if (err instanceof ModerationServiceError) {
    return {
      status: err.statusCode as 400 | 403 | 404,
      body: {
        ok: false,
        error: { code: err.code, message: err.message },
        meta: { requestId },
      },
    };
  }
  return null;
}

// --- Moderation: Reports & Automated Content Flags ---

adminRoutes.get(
  "/admin/reports",
  requirePermission(PERMISSIONS.MOD_REPORTS_READ),
  async (c) => {
    const actor = c.get("actor")!;
    const reports = await listCommentReportsForStaff(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: { reports },
      meta: { requestId: c.get("requestId") },
    });
  }
);

adminRoutes.post(
  "/admin/reports/:reportId/review",
  requirePermission(PERMISSIONS.MOD_REPORTS_RESOLVE),
  async (c) => {
    const actor = c.get("actor")!;
    const reportId = c.req.param("reportId");
    if (!uuidSchema.safeParse(reportId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri report ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = reviewReportSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri so‘rov",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    if (
      parsed.data.deleteComment &&
      !(await actorHasRuntimePermission(
        actor.userId,
        actor.role,
        PERMISSIONS.MOD_COMMENT_DELETE
      ))
    ) {
      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Izohni o‘chirish vakolati yo‘q",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    if (
      parsed.data.warnAuthor &&
      !(await actorHasRuntimePermission(
        actor.userId,
        actor.role,
        PERMISSIONS.MOD_USER_WARN
      ))
    ) {
      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Ogohlantirish yuborish vakolati yo‘q",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    try {
      const report = await reviewCommentReport({
        reportId,
        actorId: actor.userId,
        actorRole: actor.role,
        status: parsed.data.status,
        reason: parsed.data.reason,
        deleteComment: parsed.data.deleteComment,
        warnAuthor: parsed.data.warnAuthor,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: { report },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handleModError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

adminRoutes.delete(
  "/admin/comments/:commentId",
  requirePermission(PERMISSIONS.MOD_COMMENT_DELETE),
  async (c) => {
    const actor = c.get("actor")!;
    const commentId = c.req.param("commentId");
    if (!uuidSchema.safeParse(commentId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri comment ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = deleteCommentByModSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ?? "O‘chirish sababi majburiy",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      await deleteCommentAsStaff({
        commentId,
        actorId: actor.userId,
        actorRole: actor.role,
        reason: parsed.data.reason,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
      return c.json({
        ok: true,
        data: { deleted: true },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handleModError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

adminRoutes.get(
  "/admin/flags",
  requirePermission(PERMISSIONS.MOD_FLAGS_READ),
  async (c) => {
    const actor = c.get("actor")!;
    const flags = await listModerationFlagsForStaff(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: { flags },
      meta: { requestId: c.get("requestId") },
    });
  }
);

adminRoutes.post(
  "/admin/flags/:flagId/review",
  requirePermission(PERMISSIONS.MOD_FLAGS_RESOLVE),
  async (c) => {
    const actor = c.get("actor")!;
    const flagId = c.req.param("flagId");
    if (!uuidSchema.safeParse(flagId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri flag ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = reviewFlagSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri ma’lumot",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const flag = await reviewModerationFlag({
        flagId,
        actorId: actor.userId,
        actorRole: actor.role,
        status: parsed.data.status,
        reason: parsed.data.reason,
        warnAuthor: parsed.data.warnAuthor,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
      return c.json({
        ok: true,
        data: { flag },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handleModError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

// --- User Warnings & Status Enforcement ---

adminRoutes.post(
  "/admin/users/:userId/warn",
  requirePermission(PERMISSIONS.MOD_USER_WARN),
  async (c) => {
    const actor = c.get("actor")!;
    const targetUserId = c.req.param("userId");
    if (!uuidSchema.safeParse(targetUserId).success) {
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
    const parsed = warnUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ?? "Ogohlantirish sababi xato",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const warning = await issueUserWarning({
        targetUserId,
        actorId: actor.userId,
        actorRole: actor.role,
        reason: parsed.data.reason,
        reportId: parsed.data.reportId,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });
      return c.json(
        {
          ok: true,
          data: { warning },
          meta: { requestId: c.get("requestId") },
        },
        201
      );
    } catch (err) {
      const mapped = handleModError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

adminRoutes.post("/admin/users/:userId/status", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  const targetUserId = c.req.param("userId");
  if (!uuidSchema.safeParse(targetUserId).success) {
    return c.json(
      {
        ok: false,
        error: { code: "INVALID_ID", message: "Noto‘g‘ri user ID" },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  if (actor.status !== "active") {
    return c.json(
      {
        ok: false,
        error: { code: "FORBIDDEN", message: "Hisobingiz cheklangan" },
        meta: { requestId: c.get("requestId") },
      },
      403
    );
  }

  const rawBody = await c.req.json().catch(() => null);
  const parsed = moderateUserStatusSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri amal",
        },
        meta: { requestId: c.get("requestId") },
      },
      400
    );
  }

  const requiredPermission =
    parsed.data.action === "mute"
      ? PERMISSIONS.MOD_USER_MUTE
      : parsed.data.action === "suspend"
        ? PERMISSIONS.MOD_USER_SUSPEND
        : parsed.data.action === "ban"
          ? PERMISSIONS.ADMIN_USER_BAN
          : actor.role === "moderator"
            ? PERMISSIONS.MOD_USER_SUSPEND
            : PERMISSIONS.ADMIN_USER_BAN;

  const allowed = await actorHasRuntimePermission(
    actor.userId,
    actor.role,
    requiredPermission
  );
  if (!allowed) {
    await withDbContext(
      { userId: actor.userId, role: actor.role },
      async (tx) => {
        await writeAuditLog(tx, {
          actorId: actor.userId,
          actorRole: actor.role,
          eventType: AUDIT_EVENTS.ACCESS_DENIED,
          targetType: "permission",
          targetId: requiredPermission,
          ipAddress: c.get("ipAddress"),
          requestId: c.get("requestId"),
          metadata: {
            path: c.req.path,
            targetUserId,
            action: parsed.data.action,
          },
        });
      }
    );

    return c.json(
      {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Ushbu cheklov amalini bajarish vakolatingiz yo‘q",
        },
        meta: { requestId: c.get("requestId") },
      },
      403
    );
  }

  try {
    const user = await applyUserModerationStatus({
      targetUserId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: parsed.data.action,
      reason: parsed.data.reason,
      durationHours: parsed.data.durationHours,
      humanConfirmed: parsed.data.humanConfirmed,
      ipAddress: c.get("ipAddress"),
      requestId: c.get("requestId"),
    });
    return c.json({
      ok: true,
      data: { user },
      meta: { requestId: c.get("requestId") },
    });
  } catch (err) {
    const mapped = handleModError(err, c.get("requestId"));
    if (mapped) return c.json(mapped.body, mapped.status);
    throw err;
  }
});

// --- Users Governance, Role Assignment & Super Admin Permission Delegation ---

adminRoutes.get("/admin/users", requireAuth, async (c) => {
  const actor = c.get("actor")!;
  if (actor.status !== "active") {
    return c.json(
      {
        ok: false,
        error: { code: "FORBIDDEN", message: "Hisobingiz cheklangan" },
        meta: { requestId: c.get("requestId") },
      },
      403
    );
  }

  const canInspect =
    (await actorHasRuntimePermission(
      actor.userId,
      actor.role,
      PERMISSIONS.MOD_REPORTS_READ
    )) ||
    (await actorHasRuntimePermission(
      actor.userId,
      actor.role,
      PERMISSIONS.ADMIN_ROLE_ASSIGN
    )) ||
    (await actorHasRuntimePermission(
      actor.userId,
      actor.role,
      PERMISSIONS.ADMIN_USER_BAN
    )) ||
    (await actorHasRuntimePermission(
      actor.userId,
      actor.role,
      PERMISSIONS.ADMIN_PERMISSIONS_GRANT
    ));

  if (!canInspect) {
    return c.json(
      {
        ok: false,
        error: { code: "FORBIDDEN", message: "Boshqaruv ruxsati yo‘q" },
        meta: { requestId: c.get("requestId") },
      },
      403
    );
  }

  const usersList = await listGovernanceUsers(
    actor.userId,
    actor.role,
    c.req.query("q")
  );
  return c.json({
    ok: true,
    data: { users: usersList },
    meta: { requestId: c.get("requestId") },
  });
});

adminRoutes.patch(
  "/admin/users/:userId/role",
  requirePermission(PERMISSIONS.ADMIN_ROLE_ASSIGN),
  async (c) => {
    const actor = c.get("actor")!;
    const targetUserId = c.req.param("userId");
    if (!uuidSchema.safeParse(targetUserId).success) {
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
    const parsed = assignRoleSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Noto‘g‘ri rol ma’lumotlari",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    if (targetUserId === actor.userId) {
      return c.json(
        {
          ok: false,
          error: {
            code: "SELF_ROLE_CHANGE_FORBIDDEN",
            message: "O‘z rolingizni o‘zgartira olmaysiz",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    if (parsed.data.role === "admin" && actor.role !== "super_admin") {
      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin rolini faqat Super Admin tayinlay oladi",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    const updated = await withDbContext(
      { userId: actor.userId, role: actor.role },
      async (tx) => {
        const [target] = await tx
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        if (!target) {
          return null;
        }
        if (target.role === "super_admin") {
          return "FORBIDDEN_SUPER_ADMIN" as const;
        }
        if (target.role === "admin" && actor.role !== "super_admin") {
          return "FORBIDDEN_ADMIN" as const;
        }

        const [row] = await tx
          .update(users)
          .set({ role: parsed.data.role, updatedAt: new Date() })
          .where(eq(users.id, targetUserId))
          .returning({ id: users.id, role: users.role });

        if (target.role === "admin" && parsed.data.role !== "admin") {
          await tx
            .delete(adminUserPermissions)
            .where(eq(adminUserPermissions.userId, targetUserId));
        }

        await writeAuditLog(tx, {
          actorId: actor.userId,
          actorRole: actor.role,
          eventType: AUDIT_EVENTS.ROLE_CHANGED,
          targetType: "user",
          targetId: targetUserId,
          ipAddress: c.get("ipAddress"),
          requestId: c.get("requestId"),
          metadata: {
            targetUserId,
            previousRole: target.role,
            newRole: parsed.data.role,
            reason: parsed.data.reason ?? `Role updated to ${parsed.data.role}`,
          },
        });

        return row;
      }
    );

    if (updated === "FORBIDDEN_SUPER_ADMIN" || updated === "FORBIDDEN_ADMIN") {
      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Ushbu hisob rolini o‘zgartirish taqiqlangan",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    if (!updated) {
      return c.json(
        {
          ok: false,
          error: { code: "USER_NOT_FOUND", message: "Target user not found" },
          meta: { requestId: c.get("requestId") },
        },
        404
      );
    }

    return c.json({
      ok: true,
      data: { user: updated },
      meta: { requestId: c.get("requestId") },
    });
  }
);

adminRoutes.put(
  "/admin/admins/:userId/permissions",
  requirePermission(PERMISSIONS.ADMIN_PERMISSIONS_GRANT),
  async (c) => {
    const actor = c.get("actor")!;
    const targetUserId = c.req.param("userId");
    if (!uuidSchema.safeParse(targetUserId).success) {
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
    const parsed = setAdminPermissionsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Vakolat ma’lumotlari noto‘g‘ri",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const permissions = await setAdminDelegatedPermissions({
        actorId: actor.userId,
        actorRole: actor.role,
        targetUserId,
        permissions: parsed.data.permissions,
        reason: parsed.data.reason,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: { userId: targetUserId, permissions },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handleModError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

// --- Appeals Governance ---

adminRoutes.get(
  "/admin/appeals",
  requirePermission(PERMISSIONS.MOD_APPEALS_READ),
  async (c) => {
    const actor = c.get("actor")!;
    const appeals = await listAppealsForStaff(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: { appeals },
      meta: { requestId: c.get("requestId") },
    });
  }
);

adminRoutes.post(
  "/admin/appeals/:appealId/review",
  requirePermission(PERMISSIONS.MOD_APPEALS_RESOLVE),
  async (c) => {
    const actor = c.get("actor")!;
    const appealId = c.req.param("appealId");
    if (!uuidSchema.safeParse(appealId).success) {
      return c.json(
        {
          ok: false,
          error: { code: "INVALID_ID", message: "Noto‘g‘ri appeal ID" },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = reviewAppealSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Noto‘g‘ri so‘rov",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    try {
      const appeal = await reviewModerationAppeal({
        appealId,
        actorId: actor.userId,
        actorRole: actor.role,
        decision: parsed.data.decision,
        reason: parsed.data.reason,
        humanConfirmed: parsed.data.humanConfirmed,
        ipAddress: c.get("ipAddress"),
        requestId: c.get("requestId"),
      });

      return c.json({
        ok: true,
        data: { appeal },
        meta: { requestId: c.get("requestId") },
      });
    } catch (err) {
      const mapped = handleModError(err, c.get("requestId"));
      if (mapped) return c.json(mapped.body, mapped.status);
      throw err;
    }
  }
);

// --- Important Platform Announcements ---

adminRoutes.post(
  "/admin/announcements",
  requirePermission(PERMISSIONS.ADMIN_ANNOUNCEMENT_SEND),
  async (c) => {
    const actor = c.get("actor")!;
    const rawBody = await c.req.json().catch(() => null);
    const parsed = announcementSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ?? "E’lon ma’lumotlari noto‘g‘ri",
          },
          meta: { requestId: c.get("requestId") },
        },
        400
      );
    }

    const announcement = await broadcastPlatformAnnouncement({
      actorId: actor.userId,
      actorRole: actor.role,
      title: parsed.data.title,
      body: parsed.data.body,
      ipAddress: c.get("ipAddress"),
      requestId: c.get("requestId"),
    });

    return c.json(
      {
        ok: true,
        data: { announcement },
        meta: { requestId: c.get("requestId") },
      },
      201
    );
  }
);

// --- Audit Logs (Admin & Super Admin ONLY — Moderators CANNOT access or modify) ---

adminRoutes.get(
  "/admin/audit-logs",
  requirePermission(PERMISSIONS.ADMIN_AUDIT_READ),
  async (c) => {
    const actor = c.get("actor")!;
    const logs = await listAuditLogsForGovernance(actor.userId, actor.role);
    return c.json({
      ok: true,
      data: { logs },
      meta: { requestId: c.get("requestId") },
    });
  }
);
