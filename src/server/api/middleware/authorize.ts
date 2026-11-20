import "server-only";
import type { MiddlewareHandler } from "hono";
import { actorHasRuntimePermission } from "@/server/auth/actor-permissions";
import {
  hasMinimumRole,
  isGovernancePermission,
  PERMISSIONS,
  type PermissionCode,
} from "@/server/auth/permissions";

const MUTE_RESTRICTED_PERMISSIONS = new Set<PermissionCode>([
  PERMISSIONS.POST_CREATE,
  PERMISSIONS.POST_UPDATE_SELF,
  PERMISSIONS.POST_INTERACT,
  PERMISSIONS.DM_SEND,
]);
import { withDbContext } from "@/server/db/context";
import type { UserRole } from "@/server/db/schema";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";
import type { AppEnv } from "../types";

/**
 * Authorization layer — strictly separated from authentication.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const actor = c.get("actor");
  if (!actor) {
    return c.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required",
        },
        meta: { requestId: c.get("requestId") },
      },
      401
    );
  }
  return next();
};

export function requirePermission(
  permission: PermissionCode
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication is required",
          },
          meta: { requestId: c.get("requestId") },
        },
        401
      );
    }

    const isActivelyMuted =
      actor.status === "muted" &&
      (!actor.suspendedUntil || actor.suspendedUntil.getTime() > Date.now());

    if (isActivelyMuted && MUTE_RESTRICTED_PERMISSIONS.has(permission)) {
      return c.json(
        {
          ok: false,
          error: {
            code: "ACCOUNT_MUTED",
            message:
              "Hisobingiz vaqtincha cheklangan (mute). Apellyatsiya yuborishingiz mumkin.",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    if (isGovernancePermission(permission) && actor.status !== "active") {
      await withDbContext(
        { userId: actor.userId, role: actor.role },
        async (tx) => {
          await writeAuditLog(tx, {
            actorId: actor.userId,
            actorRole: actor.role,
            eventType: AUDIT_EVENTS.ACCESS_DENIED,
            targetType: "permission",
            targetId: permission,
            ipAddress: c.get("ipAddress"),
            requestId: c.get("requestId"),
            metadata: { path: c.req.path, reason: "STAFF_ACCOUNT_RESTRICTED" },
          });
        }
      );

      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Staff account is restricted from governance actions",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    const allowed = await actorHasRuntimePermission(
      actor.userId,
      actor.role,
      permission
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
            targetId: permission,
            ipAddress: c.get("ipAddress"),
            requestId: c.get("requestId"),
            metadata: { path: c.req.path },
          });
        }
      );

      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "You do not have permission to perform this action",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    return next();
  };
}

export function requireRole(minRole: UserRole): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const actor = c.get("actor");
    if (!actor) {
      return c.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication is required",
          },
          meta: { requestId: c.get("requestId") },
        },
        401
      );
    }

    if (!hasMinimumRole(actor.role, minRole)) {
      await withDbContext(
        { userId: actor.userId, role: actor.role },
        async (tx) => {
          await writeAuditLog(tx, {
            actorId: actor.userId,
            actorRole: actor.role,
            eventType: AUDIT_EVENTS.ACCESS_DENIED,
            targetType: "role",
            targetId: minRole,
            ipAddress: c.get("ipAddress"),
            requestId: c.get("requestId"),
            metadata: { path: c.req.path },
          });
        }
      );

      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Insufficient role privileges",
          },
          meta: { requestId: c.get("requestId") },
        },
        403
      );
    }

    return next();
  };
}
