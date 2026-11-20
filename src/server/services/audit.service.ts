import "server-only";
import { getServerEnv } from "@/lib/env";
import type { DbTransaction } from "@/server/db/context";
import { auditLogs, type UserRole } from "@/server/db/schema";
import { hashIpAddress } from "@/server/security/crypto";

export const AUDIT_EVENTS = {
  AUTH_LOGIN_GOOGLE: "AUTH_LOGIN_GOOGLE",
  AUTH_LOGIN_TELEGRAM: "AUTH_LOGIN_TELEGRAM",
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  AUTH_LOGOUT: "AUTH_LOGOUT",
  AUTH_LOGOUT_ALL: "AUTH_LOGOUT_ALL",
  EMAIL_VERIFICATION_CREATED: "EMAIL_VERIFICATION_CREATED",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  ACCOUNT_LINK_INITIATED: "ACCOUNT_LINK_INITIATED",
  ACCOUNT_LINKED: "ACCOUNT_LINKED",
  ACCOUNT_LINK_CONFLICT: "ACCOUNT_LINK_CONFLICT",
  ACCOUNT_UNLINKED: "ACCOUNT_UNLINKED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
  POST_CREATED: "POST_CREATED",
  POST_UPDATED: "POST_UPDATED",
  POST_DELETED: "POST_DELETED",
  COMMENT_DELETED: "COMMENT_DELETED",
  COMMENT_REPORTED: "COMMENT_REPORTED",
  USER_BLOCKED: "USER_BLOCKED",
  USER_UNBLOCKED: "USER_UNBLOCKED",
  POST_LIMIT_INCREASED: "POST_LIMIT_INCREASED",
  REFERRAL_RECORDED: "REFERRAL_RECORDED",
  ROLE_CHANGED: "ROLE_CHANGED",
  REPORT_REVIEWED: "REPORT_REVIEWED",
  MOD_COMMENT_DELETED: "MOD_COMMENT_DELETED",
  MOD_FLAG_CREATED: "MOD_FLAG_CREATED",
  MOD_FLAG_REVIEWED: "MOD_FLAG_REVIEWED",
  USER_WARNED: "USER_WARNED",
  USER_MUTED: "USER_MUTED",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_BANNED: "USER_BANNED",
  USER_UNBANNED: "USER_UNBANNED",
  APPEAL_SUBMITTED: "APPEAL_SUBMITTED",
  APPEAL_REVIEWED: "APPEAL_REVIEWED",
  ADMIN_PERMISSIONS_UPDATED: "ADMIN_PERMISSIONS_UPDATED",
  ANNOUNCEMENT_SENT: "ANNOUNCEMENT_SENT",
  ACCESS_DENIED: "ACCESS_DENIED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|initdata|authorization|cookie|verifier/i;

export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export interface WriteAuditLogInput {
  actorId?: string | null;
  actorRole?: UserRole | "anonymous" | null;
  eventType: AuditEventType;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  tx: DbTransaction,
  input: WriteAuditLogInput
): Promise<void> {
  const env = getServerEnv();
  const ipHash = hashIpAddress(input.ipAddress, env.AUDIT_IP_SALT);

  await tx.insert(auditLogs).values({
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    eventType: input.eventType,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    ipHash,
    requestId: input.requestId ?? null,
    metadata: sanitizeAuditMetadata(input.metadata),
  });
}
