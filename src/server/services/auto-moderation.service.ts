import "server-only";
import { type DbTransaction } from "@/server/db/context";
import { moderationFlags, type UserRole } from "@/server/db/schema";
import { AUDIT_EVENTS, writeAuditLog } from "./audit.service";

export interface AutoModerationResult {
  flagged: boolean;
  severity: "low" | "medium" | "high";
  reasons: string[];
}

const DOXXING_PATTERNS = [
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  /(pasport|passport|karta\s*raqam|pinfl|jshshir)\s*[:#-]?\s*[a-z0-9]{6,}/i,
];

const SEVERE_ABUSE_PATTERNS = [
  /\b(o['‘`]?ldiraman|joniga\s*qasd|bomb|terror)\b/i,
];

const SPAM_SCAM_PATTERNS = [
  /(tekin\s*pul|kafolatlangan\s*daromad|kazino|stavka|free\s*crypto)/i,
  /(https?:\/\/[^\s]+.*){3,}/i,
];

/**
 * Deterministic first-pass automated content screening.
 * Serious enforcement decisions always require human moderator/admin confirmation.
 */
export function runAutomatedContentCheck(text: string): AutoModerationResult {
  const normalized = text.normalize("NFC").trim();
  const reasons: string[] = [];
  let severity: "low" | "medium" | "high" = "low";

  if (DOXXING_PATTERNS.some((re) => re.test(normalized))) {
    reasons.push("Shaxsiy yoki moliyaviy ma’lumot (doxxing) ehtimoli");
    severity = "high";
  }

  if (SEVERE_ABUSE_PATTERNS.some((re) => re.test(normalized))) {
    reasons.push("Tahdid yoki zo‘ravonlikka oid ibora");
    severity = "high";
  }

  if (SPAM_SCAM_PATTERNS.some((re) => re.test(normalized))) {
    reasons.push("Spam yoki shubhali havolalar");
    if (severity === "low") severity = "medium";
  }

  return {
    flagged: reasons.length > 0,
    severity,
    reasons,
  };
}

export async function recordAutomatedFlagInTx(
  tx: DbTransaction,
  params: {
    contentType: "post" | "comment" | "dm";
    contentId: string;
    authorId: string;
    authorRole: UserRole;
    text: string;
  }
): Promise<AutoModerationResult> {
  const scan = runAutomatedContentCheck(params.text);
  if (!scan.flagged) {
    return scan;
  }

  await tx.insert(moderationFlags).values({
    contentType: params.contentType,
    contentId: params.contentId,
    authorId: params.authorId,
    severity: scan.severity,
    reasons: scan.reasons,
    excerpt: params.text.trim().slice(0, 280),
    status: "open",
  });

  await writeAuditLog(tx, {
    actorId: params.authorId,
    actorRole: params.authorRole,
    eventType: AUDIT_EVENTS.MOD_FLAG_CREATED,
    targetType: params.contentType,
    targetId: params.contentId,
    metadata: {
      targetUserId: params.authorId,
      severity: scan.severity,
      reason: scan.reasons.join("; "),
    },
  });

  return scan;
}
