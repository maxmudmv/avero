import "server-only";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  authenticateSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";
import type { AppEnv } from "../types";

/**
 * Server-side Authentication Middleware.
 * Resolves the actor strictly from an opaque session cookie or Authorization Bearer token.
 * NEVER trusts any client-supplied user ID headers, query params, or body fields.
 */
export const authenticationMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next
) => {
  const authHeader = c.req.header("authorization");
  let token: string | undefined;

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    token = getCookie(c, SESSION_COOKIE_NAME);
  }

  if (token) {
    const actor = await authenticateSessionToken(token);
    c.set("actor", actor);
  } else {
    c.set("actor", null);
  }

  await next();
};
