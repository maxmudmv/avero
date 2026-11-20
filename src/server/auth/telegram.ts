import "server-only";
import { lt } from "drizzle-orm";
import { z } from "zod";
import { withDbContext } from "@/server/db/context";
import { telegramInitDataReplays } from "@/server/db/schema";
import {
  hmacSha256Buffer,
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqualHex,
} from "@/server/security/crypto";

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_bot: z.boolean().optional(),
});

export interface VerifiedTelegramInitData {
  authDate: number;
  queryId?: string;
  startParam?: string;
  user: z.infer<typeof telegramUserSchema>;
}

export class TelegramAuthError extends Error {
  constructor(
    public readonly code:
      | "TELEGRAM_NOT_CONFIGURED"
      | "INVALID_INIT_DATA"
      | "INVALID_SIGNATURE"
      | "AUTH_DATA_EXPIRED"
      | "INIT_DATA_REPLAYED",
    message: string
  ) {
    super(message);
    this.name = "TelegramAuthError";
  }
}

/**
 * Cryptographically verifies Telegram Mini App `initData` on the server per
 * official Telegram WebApp documentation:
 *   secret_key = HMAC_SHA256("WebAppData", bot_token)
 *   expected   = HMAC_SHA256(secret_key, sorted_data_check_string)
 */
export function verifyTelegramInitData(
  rawInitData: string,
  botToken: string,
  options?: { maxAgeSeconds?: number; nowEpochSeconds?: number }
): VerifiedTelegramInitData {
  if (!botToken || botToken.trim().length === 0) {
    throw new TelegramAuthError(
      "TELEGRAM_NOT_CONFIGURED",
      "Telegram bot token is not configured on the server"
    );
  }

  if (!rawInitData || rawInitData.trim().length === 0) {
    throw new TelegramAuthError("INVALID_INIT_DATA", "initData is required");
  }

  const params = new URLSearchParams(rawInitData);
  const hash = params.get("hash");
  if (!hash) {
    throw new TelegramAuthError(
      "INVALID_INIT_DATA",
      "initData is missing hash parameter"
    );
  }

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") {
      continue;
    }
    pairs.push(`${key}=${value}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = hmacSha256Buffer("WebAppData", botToken);
  const expectedHash = hmacSha256Hex(secretKey, dataCheckString);

  if (!timingSafeEqualHex(hash, expectedHash)) {
    throw new TelegramAuthError(
      "INVALID_SIGNATURE",
      "Telegram initData signature verification failed"
    );
  }

  const authDateRaw = params.get("auth_date");
  const authDate = Number(authDateRaw);
  if (!authDateRaw || !Number.isInteger(authDate) || authDate <= 0) {
    throw new TelegramAuthError(
      "INVALID_INIT_DATA",
      "initData contains an invalid auth_date"
    );
  }

  const maxAge = options?.maxAgeSeconds ?? 300;
  const nowSeconds = options?.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > maxAge || authDate - nowSeconds > 60) {
    throw new TelegramAuthError(
      "AUTH_DATA_EXPIRED",
      "Telegram initData has expired"
    );
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new TelegramAuthError(
      "INVALID_INIT_DATA",
      "initData is missing user payload"
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(userRaw);
  } catch {
    throw new TelegramAuthError(
      "INVALID_INIT_DATA",
      "initData user payload is not valid JSON"
    );
  }

  const userParsed = telegramUserSchema.safeParse(parsedJson);
  if (!userParsed.success || userParsed.data.is_bot) {
    throw new TelegramAuthError(
      "INVALID_INIT_DATA",
      "initData user payload is invalid"
    );
  }

  return {
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    user: userParsed.data,
  };
}

/**
 * Atomic DB-backed replay protection for Telegram initData.
 * Rejects re-submission of the exact same signed initData payload within its validity window.
 */
export async function consumeTelegramInitDataReplay(params: {
  rawInitData: string;
  telegramUserId: number;
  authDate: number;
  maxAgeSeconds: number;
}): Promise<void> {
  const initDataHash = sha256Hex(params.rawInitData);
  const now = new Date();
  const expiresAt = new Date(
    Math.max(now.getTime(), params.authDate * 1000) +
      (params.maxAgeSeconds + 60) * 1000
  );

  const inserted = await withDbContext({ authFlow: true }, async (tx) => {
    await tx
      .delete(telegramInitDataReplays)
      .where(lt(telegramInitDataReplays.expiresAt, now));

    const rows = await tx
      .insert(telegramInitDataReplays)
      .values({
        initDataHash,
        telegramUserId: String(params.telegramUserId),
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ initDataHash: telegramInitDataReplays.initDataHash });

    return rows[0] ?? null;
  });

  if (!inserted) {
    throw new TelegramAuthError(
      "INIT_DATA_REPLAYED",
      "Telegram initData allaqachon ishlatilgan (replay himoyasi)"
    );
  }
}
