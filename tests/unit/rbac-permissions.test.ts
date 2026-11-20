import { describe, expect, it } from "vitest";
import {
  hasMinimumRole,
  hasPermission,
  PERMISSIONS,
} from "@/server/auth/permissions";

describe("RBAC Roles & Permissions", () => {
  it("separates standard user, moderator, and admin permissions", () => {
    expect(hasPermission("user", PERMISSIONS.PROFILE_SELF_UPDATE)).toBe(true);
    expect(hasPermission("user", PERMISSIONS.AUTH_LINK_MANAGE)).toBe(true);
    expect(hasPermission("user", PERMISSIONS.MOD_REPORTS_READ)).toBe(false);
    expect(hasPermission("user", PERMISSIONS.ADMIN_AUDIT_READ)).toBe(false);

    expect(hasPermission("moderator", PERMISSIONS.MOD_REPORTS_READ)).toBe(true);
    expect(hasPermission("moderator", PERMISSIONS.MOD_USER_SUSPEND)).toBe(true);
    expect(hasPermission("moderator", PERMISSIONS.ADMIN_ROLE_ASSIGN)).toBe(false);
    expect(hasPermission("moderator", PERMISSIONS.ADMIN_AUDIT_READ)).toBe(false);

    expect(hasPermission("admin", PERMISSIONS.ADMIN_ROLE_ASSIGN)).toBe(true);
    expect(hasPermission("admin", PERMISSIONS.ADMIN_AUDIT_READ)).toBe(true);
  });

  it("enforces role hierarchy", () => {
    expect(hasMinimumRole("admin", "moderator")).toBe(true);
    expect(hasMinimumRole("moderator", "admin")).toBe(false);
    expect(hasMinimumRole("user", "user")).toBe(true);
  });
});
