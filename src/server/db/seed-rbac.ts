import "server-only";
import type { AppDatabase } from "./index";
import { permissions, rolePermissions, roles, type UserRole } from "./schema";
import {
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
  ROLE_PERMISSIONS_MAP,
} from "@/server/auth/permissions";

export async function seedRbacData(db: AppDatabase): Promise<void> {
  for (const role of ROLE_DEFINITIONS) {
    await db
      .insert(roles)
      .values(role)
      .onConflictDoUpdate({
        target: roles.name,
        set: {
          description: role.description,
          hierarchyLevel: role.hierarchyLevel,
        },
      });
  }

  for (const perm of PERMISSION_DEFINITIONS) {
    await db
      .insert(permissions)
      .values(perm)
      .onConflictDoUpdate({
        target: permissions.code,
        set: {
          description: perm.description,
        },
      });
  }

  for (const [roleName, permSet] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    for (const permissionCode of permSet) {
      await db
        .insert(rolePermissions)
        .values({
          roleName: roleName as UserRole,
          permissionCode,
        })
        .onConflictDoNothing();
    }
  }
}
