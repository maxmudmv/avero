import "server-only";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

const MAX_JSON_BODY_BYTES = 16 * 1024;
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export const jsonOnlyGuardMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next
) => {
  if (!BODY_METHODS.has(c.req.method)) {
    return next();
  }

  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    return c.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body exceeds 16 KB limit",
        },
        meta: { requestId: c.get("requestId") },
      },
      413
    );
  }

  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.startsWith("text/") ||
    contentType.startsWith("image/") ||
    contentType.startsWith("video/")
  ) {
    return c.json(
      {
        ok: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Media, form, and non-JSON payloads are not permitted on this platform",
        },
        meta: { requestId: c.get("requestId") },
      },
      415
    );
  }

  if (contentLength > 0 && !contentType.includes("application/json")) {
    return c.json(
      {
        ok: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json",
        },
        meta: { requestId: c.get("requestId") },
      },
      415
    );
  }

  return next();
};
