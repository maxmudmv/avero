import "server-only";
import type { UserRole } from "@/server/db/schema";

export const PERMISSIONS = {
  AUTH_SESSION_READ: "auth:session:read",
  AUTH_SESSION_REVOKE: "auth:session:revoke",
  AUTH_LINK_MANAGE: "auth:link:manage",
  PROFILE_SELF_READ: "profile:self:read",
  PROFILE_SELF_UPDATE: "profile:self:update",
  SETTINGS_SELF_READ: "settings:self:read",
  SETTINGS_SELF_UPDATE: "settings:self:update",
  EMAIL_VERIFY_MANAGE: "email:verify:manage",
  POST_CREATE: "post:create",
  POST_UPDATE_SELF: "post:update:self",
  POST_DELETE_SELF: "post:delete:self",
  DRAFT_MANAGE_SELF: "draft:manage:self",
  POST_INTERACT: "post:interact",
  USER_FOLLOW: "user:follow",
  USER_BLOCK: "user:block",
  DM_SEND: "dm:send",
  COMMENT_REPORT: "comment:report",
  MOD_REPORTS_READ: "mod:reports:read",
  MOD_REPORTS_RESOLVE: "mod:reports:resolve",
  MOD_COMMENT_DELETE: "mod:comment:delete",
  MOD_USER_WARN: "mod:user:warn",
  MOD_USER_MUTE: "mod:user:mute",
  MOD_USER_SUSPEND: "mod:user:suspend",
  MOD_FLAGS_READ: "mod:flags:read",
  MOD_FLAGS_RESOLVE: "mod:flags:resolve",
  MOD_APPEALS_READ: "mod:appeals:read",
  MOD_APPEALS_RESOLVE: "mod:appeals:resolve",
  ADMIN_ROLE_ASSIGN: "admin:role:assign",
  ADMIN_PERMISSIONS_GRANT: "admin:permissions:grant",
  ADMIN_USER_BAN: "admin:user:ban",
  ADMIN_AUDIT_READ: "admin:audit:read",
  ADMIN_ANNOUNCEMENT_SEND: "admin:announcement:send",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 10,
  moderator: 50,
  admin: 100,
  super_admin: 200,
};

export const ROLE_DEFINITIONS: Array<{
  name: UserRole;
  description: string;
  hierarchyLevel: number;
}> = [
  {
    name: "user",
    description: "Standard authenticated user",
    hierarchyLevel: ROLE_HIERARCHY.user,
  },
  {
    name: "moderator",
    description: "Content and user safety moderator",
    hierarchyLevel: ROLE_HIERARCHY.moderator,
  },
  {
    name: "admin",
    description: "Delegated administrator with permissions assigned by Super Admin",
    hierarchyLevel: ROLE_HIERARCHY.admin,
  },
  {
    name: "super_admin",
    description: "Super Administrator with unrestricted governance and permission delegation",
    hierarchyLevel: ROLE_HIERARCHY.super_admin,
  },
];

export const PERMISSION_DEFINITIONS: Array<{
  code: PermissionCode;
  description: string;
}> = [
  {
    code: PERMISSIONS.AUTH_SESSION_READ,
    description: "Read own active authentication sessions",
  },
  {
    code: PERMISSIONS.AUTH_SESSION_REVOKE,
    description: "Revoke own authentication sessions",
  },
  {
    code: PERMISSIONS.AUTH_LINK_MANAGE,
    description: "Link and unlink Google and Telegram identities",
  },
  {
    code: PERMISSIONS.PROFILE_SELF_READ,
    description: "Read own profile details",
  },
  {
    code: PERMISSIONS.PROFILE_SELF_UPDATE,
    description: "Update own username, display name, and bio",
  },
  {
    code: PERMISSIONS.SETTINGS_SELF_READ,
    description: "Read own account preferences",
  },
  {
    code: PERMISSIONS.SETTINGS_SELF_UPDATE,
    description: "Update own account preferences",
  },
  {
    code: PERMISSIONS.EMAIL_VERIFY_MANAGE,
    description: "Request and complete email verification",
  },
  {
    code: PERMISSIONS.POST_CREATE,
    description: "Publish text posts",
  },
  {
    code: PERMISSIONS.POST_UPDATE_SELF,
    description: "Edit own published text posts",
  },
  {
    code: PERMISSIONS.POST_DELETE_SELF,
    description: "Permanently delete own posts",
  },
  {
    code: PERMISSIONS.DRAFT_MANAGE_SELF,
    description: "Create, edit, and delete own private drafts",
  },
  {
    code: PERMISSIONS.POST_INTERACT,
    description: "Like, comment, repost, bookmark, and view posts",
  },
  {
    code: PERMISSIONS.USER_FOLLOW,
    description: "Follow or unfollow other authors",
  },
  {
    code: PERMISSIONS.USER_BLOCK,
    description: "Block or unblock other users with granular levels",
  },
  {
    code: PERMISSIONS.DM_SEND,
    description: "Send text-only direct messages and respond to requests",
  },
  {
    code: PERMISSIONS.COMMENT_REPORT,
    description: "Report abusive comments",
  },
  {
    code: PERMISSIONS.MOD_REPORTS_READ,
    description: "View moderation report queue",
  },
  {
    code: PERMISSIONS.MOD_REPORTS_RESOLVE,
    description: "Resolve moderation reports",
  },
  {
    code: PERMISSIONS.MOD_COMMENT_DELETE,
    description: "Delete reported or policy-violating comments",
  },
  {
    code: PERMISSIONS.MOD_USER_WARN,
    description: "Send formal moderation warnings to users",
  },
  {
    code: PERMISSIONS.MOD_USER_MUTE,
    description: "Temporarily mute standard user accounts",
  },
  {
    code: PERMISSIONS.MOD_USER_SUSPEND,
    description: "Temporarily suspend standard user accounts",
  },
  {
    code: PERMISSIONS.MOD_FLAGS_READ,
    description: "Inspect automated content moderation flags",
  },
  {
    code: PERMISSIONS.MOD_FLAGS_RESOLVE,
    description: "Review and resolve automated moderation flags",
  },
  {
    code: PERMISSIONS.MOD_APPEALS_READ,
    description: "View user moderation appeals",
  },
  {
    code: PERMISSIONS.MOD_APPEALS_RESOLVE,
    description: "Approve or reject user moderation appeals",
  },
  {
    code: PERMISSIONS.ADMIN_ROLE_ASSIGN,
    description: "Assign or revoke user/moderator/admin roles",
  },
  {
    code: PERMISSIONS.ADMIN_PERMISSIONS_GRANT,
    description: "Delegate or revoke individual permissions for Admin accounts",
  },
  {
    code: PERMISSIONS.ADMIN_USER_BAN,
    description: "Permanently ban or unban accounts",
  },
  {
    code: PERMISSIONS.ADMIN_AUDIT_READ,
    description: "Inspect security and moderation audit logs",
  },
  {
    code: PERMISSIONS.ADMIN_ANNOUNCEMENT_SEND,
    description: "Broadcast important platform announcements",
  },
];

export const USER_PERMS: PermissionCode[] = [
  PERMISSIONS.AUTH_SESSION_READ,
  PERMISSIONS.AUTH_SESSION_REVOKE,
  PERMISSIONS.AUTH_LINK_MANAGE,
  PERMISSIONS.PROFILE_SELF_READ,
  PERMISSIONS.PROFILE_SELF_UPDATE,
  PERMISSIONS.SETTINGS_SELF_READ,
  PERMISSIONS.SETTINGS_SELF_UPDATE,
  PERMISSIONS.EMAIL_VERIFY_MANAGE,
  PERMISSIONS.POST_CREATE,
  PERMISSIONS.POST_UPDATE_SELF,
  PERMISSIONS.POST_DELETE_SELF,
  PERMISSIONS.DRAFT_MANAGE_SELF,
  PERMISSIONS.POST_INTERACT,
  PERMISSIONS.USER_FOLLOW,
  PERMISSIONS.USER_BLOCK,
  PERMISSIONS.DM_SEND,
  PERMISSIONS.COMMENT_REPORT,
];

export const MODERATOR_PERMS: PermissionCode[] = [
  ...USER_PERMS,
  PERMISSIONS.MOD_REPORTS_READ,
  PERMISSIONS.MOD_REPORTS_RESOLVE,
  PERMISSIONS.MOD_COMMENT_DELETE,
  PERMISSIONS.MOD_USER_WARN,
  PERMISSIONS.MOD_USER_MUTE,
  PERMISSIONS.MOD_USER_SUSPEND,
  PERMISSIONS.MOD_FLAGS_READ,
  PERMISSIONS.MOD_FLAGS_RESOLVE,
  PERMISSIONS.MOD_APPEALS_READ,
];

export const DELEGATABLE_ADMIN_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.MOD_REPORTS_READ,
  PERMISSIONS.MOD_REPORTS_RESOLVE,
  PERMISSIONS.MOD_COMMENT_DELETE,
  PERMISSIONS.MOD_USER_WARN,
  PERMISSIONS.MOD_USER_MUTE,
  PERMISSIONS.MOD_USER_SUSPEND,
  PERMISSIONS.MOD_FLAGS_READ,
  PERMISSIONS.MOD_FLAGS_RESOLVE,
  PERMISSIONS.MOD_APPEALS_READ,
  PERMISSIONS.MOD_APPEALS_RESOLVE,
  PERMISSIONS.ADMIN_ROLE_ASSIGN,
  PERMISSIONS.ADMIN_USER_BAN,
  PERMISSIONS.ADMIN_AUDIT_READ,
  PERMISSIONS.ADMIN_ANNOUNCEMENT_SEND,
];

const ADMIN_PERMS: PermissionCode[] = [
  ...MODERATOR_PERMS,
  PERMISSIONS.MOD_APPEALS_RESOLVE,
  PERMISSIONS.ADMIN_ROLE_ASSIGN,
  PERMISSIONS.ADMIN_USER_BAN,
  PERMISSIONS.ADMIN_AUDIT_READ,
  PERMISSIONS.ADMIN_ANNOUNCEMENT_SEND,
];

const SUPER_ADMIN_PERMS: PermissionCode[] = PERMISSION_DEFINITIONS.map(
  (p) => p.code
);

export const ROLE_PERMISSIONS_MAP: Record<UserRole, ReadonlySet<PermissionCode>> =
  {
    user: new Set(USER_PERMS),
    moderator: new Set(MODERATOR_PERMS),
    admin: new Set(ADMIN_PERMS),
    super_admin: new Set(SUPER_ADMIN_PERMS),
  };

export function hasPermission(
  role: UserRole,
  permission: PermissionCode
): boolean {
  return ROLE_PERMISSIONS_MAP[role].has(permission);
}

export function isGovernancePermission(permission: PermissionCode): boolean {
  return !USER_PERMS.includes(permission);
}

export function hasMinimumRole(role: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
}
