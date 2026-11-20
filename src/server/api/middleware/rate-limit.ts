import "server-only";
import type { MiddlewareHandler } from "hono";
import { withDbContext } from "@/server/db/context";
import {
  consumeRateLimit,
  type RateLimitRule,
} from "@/server/security/rate-limit";
import { AUDIT_EVENTS, writeAuditLog } from "@/server/services/audit.service";
import type { AppEnv } from "../types";

export function rateLimitMiddleware(
  rule: RateLimitRule
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const actor = c.get("actor");
    const ip = c.get("ipAddress");
    const key = actor ? `u:${actor.userId}` : `ip:${ip}`;

    const result = await consumeRateLimit(key, rule);

    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(result.resetAtEpochSeconds));

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));

      try {
        await withDbContext({ authFlow: true }, async (tx) => {
          await writeAuditLog(tx, {
            actorId: actor?.userId ?? null,
            actorRole: actor?.role ?? "anonymous",
            eventType: AUDIT_EVENTS.RATE_LIMIT_EXCEEDED,
            targetType: "endpoint",
            targetId: c.req.path,
            ipAddress: ip,
            requestId: c.get("requestId"),
            metadata: { ruleId: rule.id, backend: result.backend },
          });
        });
      } catch {
        // Do not mask 429 if audit DB write fails
      }

      return c.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later.",
          },
          meta: { requestId: c.get("requestId") },
        },
        429
      );
    }

    return next();
  };
}
