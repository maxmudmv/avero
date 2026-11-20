import "server-only";
import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

export function extractClientIp(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || "127.0.0.1";
  }
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

export const requestContextMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next
) => {
  const incomingId = c.req.header("x-request-id");
  const requestId =
    incomingId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId)
      ? incomingId
      : `req_${crypto.randomUUID()}`;

  c.set("requestId", requestId);
  c.set("ipAddress", extractClientIp(c.req.raw.headers));
  c.set("actor", null);

  await next();

  c.header("X-Request-Id", requestId);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
};
