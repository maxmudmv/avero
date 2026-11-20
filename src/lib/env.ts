import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_MIGRATION_URL: z.string().optional(),
  DATABASE_SSL: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  AUTH_SESSION_SECRET: z
    .string()
    .min(32, "AUTH_SESSION_SECRET must be at least 32 characters"),
  AUDIT_IP_SALT: z
    .string()
    .min(16, "AUDIT_IP_SALT must be at least 16 characters"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  // Google OAuth 2.0 (optional until OAuth routes are invoked)
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),

  // Telegram Mini App & Bot Notifications (server-only)
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(""),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional().default(""),
  NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME: z.string().optional().default(""),
  SUPER_ADMIN_EMAILS: z.string().optional().default(""),

  // Upstash Redis (optional; falls back to in-memory sliding window when unset)
  UPSTASH_REDIS_REST_URL: z.string().optional().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment configuration: ${formatted}`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function resetEnvCacheForTests(): void {
  cachedServerEnv = null;
}

export function getPublicEnv() {
  return {
    APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "",
    TELEGRAM_APP_SHORT_NAME: process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME || "",
  };
}
