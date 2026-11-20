import "server-only";
import { Hono } from "hono";
import { checkDatabaseHealth } from "@/server/db";
import type { AppEnv } from "../types";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/health", async (c) => {
  try {
    const db = await checkDatabaseHealth();
    return c.json({
      ok: true,
      data: {
        status: "healthy",
        database: db,
        timestamp: new Date().toISOString(),
      },
      meta: { requestId: c.get("requestId") },
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message:
            err instanceof Error ? err.message : "Database connection failed",
        },
        meta: { requestId: c.get("requestId") },
      },
      503
    );
  }
});
