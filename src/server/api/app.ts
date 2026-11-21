import "server-only";
import { Hono } from "hono";
import { RATE_LIMIT_RULES } from "@/server/security/rate-limit";
import { authenticationMiddleware } from "./middleware/auth";
import { csrfOriginGuardMiddleware } from "./middleware/csrf";
import { jsonOnlyGuardMiddleware } from "./middleware/json-guard";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { requestContextMiddleware } from "./middleware/request-context";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { postsRoutes } from "./routes/posts";
import { socialRoutes } from "./routes/social";
import type { AppEnv } from "./types";

export function createApiApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath("/api/v1");

  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "private, no-store, no-cache, must-revalidate");
  });
  app.use("*", requestContextMiddleware);
  app.use("*", csrfOriginGuardMiddleware);
  app.use("*", jsonOnlyGuardMiddleware);
  app.use("*", authenticationMiddleware);
  app.use("*", rateLimitMiddleware(RATE_LIMIT_RULES.API_GENERAL));

  app.route("/", healthRoutes);
  app.route("/", authRoutes);
  app.route("/", accountRoutes);
  app.route("/", adminRoutes);
  app.route("/", postsRoutes);
  app.route("/", socialRoutes);

  app.notFound((c) => {
    return c.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "API endpoint not found",
        },
        meta: { requestId: c.get("requestId") },
      },
      404
    );
  });

  app.onError((err, c) => {
    console.error("[API_ERROR]", {
      requestId: c.get("requestId"),
      path: c.req.path,
      message: err.message,
    });

    return c.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected server error occurred",
        },
        meta: { requestId: c.get("requestId") },
      },
      500
    );
  });

  return app;
}

export const apiApp = createApiApp();
