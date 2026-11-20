import "server-only";
import type { MiddlewareHandler } from "hono";
import { getServerEnv } from "@/lib/env";
import type { AppEnv } from "../types";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Defense-in-depth CSRF Origin verification for state-changing API requests.
 * Rejects browser requests originating from untrusted third-party origins.
 */
export const csrfOriginGuardMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next
) => {
  if (!STATE_CHANGING_METHODS.has(c.req.method)) {
    return next();
  }

  // Telegram Bot API calls webhook server-to-server (authenticated via secret header)
  if (c.req.path === "/api/v1/telegram/webhook") {
    return next();
  }

  const originHeader = c.req.header("origin");
  if (!originHeader) {
    return next();
  }

  const env = getServerEnv();
  const allowedOrigins = new Set<string>();
  try {
    allowedOrigins.add(new URL(env.APP_URL).origin);
  } catch {
    // ignore malformed APP_URL
  }
  try {
    allowedOrigins.add(new URL(env.NEXT_PUBLIC_APP_URL).origin);
  } catch {
    // ignore malformed NEXT_PUBLIC_APP_URL
  }

  let requestOrigin = "";
  try {
    requestOrigin = new URL(originHeader).origin;
  } catch {
    return c.json(
      {
        ok: false,
        error: {
          code: "CSRF_ORIGIN_MISMATCH",
          message: "Invalid Origin header",
        },
        meta: { requestId: c.get("requestId") },
      },
      403
    );
  }

  if (!allowedOrigins.has(requestOrigin)) {
    return c.json(
      {
        ok: false,
        error: {
          code: "CSRF_ORIGIN_MISMATCH",
          message: "Cross-site request origin is not permitted",
        },
        meta: { requestId: c.get("requestId") },
      },
      403
    );
  }

  return next();
};
