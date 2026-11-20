import "server-only";
import { eq } from "drizzle-orm";
import { withDbContext, type DbTransaction } from "@/server/db/context";
import { adminUserPermissions, type UserRole } from "@/server/db/schema";
import {
  MODERATOR_PERMS,
  PERMISSION_DEFINITIONS,
  type PermissionCode,
  ROLE_PERMISSIONS_MAP,
  USER_PERMS,
} from "./permissions";

/**
 * Resolves the effective permissions of an actor strictly server-side:
 * - super_admin: ALL permissions
 * - admin: base user permissions + ONLY permissions explicitly granted by Super Admin in `admin_user_permissions`
 * - moderator: MODERATOR_PERMS
 * - user: USER_PERMS
 */
export async function resolveActorPermissionsInTx(
  tx: DbTransaction,
  userId: string,
  role: UserRole
): Promise<PermissionCode[]> {
  if (role === "super_admin") {
    return PERMISSION_DEFINITIONS.map((p) => p.code);
  }

  if (role === "moderator") {
    return [...MODERATOR_PERMS];
  }

  if (role === "user") {
    return [...USER_PERMS];
  }

  // role === 'admin': strictly base user permissions + Super Admin delegated permissions
  const rows = await tx
    .select({ permissionCode: adminUserPermissions.permissionCode })
    .from(adminUserPermissions)
    .where(eq(adminUserPermissions.userId, userId));

  const combined = new Set<PermissionCode>(USER_PERMS);
  const allowedAdminSet = ROLE_PERMISSIONS_MAP.admin;
  for (const r of rows) {
    const code = r.permissionCode as PermissionCode;
    if (allowedAdminSet.has(code)) {
      combined.add(code);
    }
  }
  return Array.from(combined);
}

export async function actorHasRuntimePermission(
  userId: string,
  role: UserRole,
  permission: PermissionCode
): Promise<boolean> {
  if (role === "super_admin") {
    return true;
  }
  if (role === "user" || role === "moderator") {
    return ROLE_PERMISSIONS_MAP[role].has(permission);
  }

  // role === 'admin': base user permissions are always active; governance permissions require Super Admin grant
  if (new Set<PermissionCode>(USER_PERMS).has(permission)) {
    return true;
  }

  return withDbContext({ userId, role }, async (tx) => {
    const perms = await resolveActorPermissionsInTx(tx, userId, role);
    return perms.includes(permission);
  });
}
