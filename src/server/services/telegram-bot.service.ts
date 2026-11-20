import "server-only";
import { and, eq } from "drizzle-orm";
import { getServerEnv } from "@/lib/env";
import { withDbContext } from "@/server/db/context";
import { authIdentities, userSettings } from "@/server/db/schema";

export interface TelegramSendResult {
  sent: boolean;
  skippedReason?: string;
}

const botReplyCooldownMap = new Map<string, number>();
const START_COOLDOWN_MS = 10_000;

export function clearBotCooldownForTests(): void {
  botReplyCooldownMap.clear();
}

export function formatTelegramNotificationMessage(params: {
  type: string;
  actorUsername?: string;
  actorDisplayName?: string;
  bodyPreview?: string | null;
}): string {
  const actor = params.actorUsername
    ? `@${params.actorUsername}`
    : params.actorDisplayName || "Avero";
  const preview = params.bodyPreview ? `\n\n“${params.bodyPreview}”` : "";

  switch (params.type) {
    case "like":
      return `❤️ ${actor} postingizga like bosdi.`;
    case "comment":
      return `💬 ${actor} postingizga izoh yozdi.${preview}`;
    case "reply":
      return `↩️ ${actor} izohingizga javob yozdi.${preview}`;
    case "follow":
      return `👤 ${actor} sizni kuzatishni boshladi.`;
    case "follow_request":
      return `🔔 ${actor} sizga kuzatish so‘rovi yubordi.`;
    case "mention":
      return `📣 ${actor} sizni matnda belgiladi.${preview}`;
    case "dm":
      return `✉️ ${actor} sizga yangi xabar yubordi.${preview}`;
    case "dm_request":
      return `📩 ${actor} sizga xabar so‘rovi yubordi.${preview}`;
    case "avatar_unlocked":
      return `✨ Tabriklaymiz! Yangi avatar (${params.bodyPreview ?? "kolleksiya"}) ochildi.`;
    case "announcement":
      return `📢 Avero muhim e’loni${preview}`;
    case "warning":
      return `⚠️ Moderatsiya ogohlantirishi${preview}`;
    case "appeal":
      return `⚖️ Apellyatsiyangiz bo‘yicha qaror qabul qilindi.${preview}`;
    default:
      return `🔔 Yangi bildirishnoma${preview}`;
  }
}

export function buildBotStartReplyMarkup(appUrl: string) {
  const isHttps = appUrl.startsWith("https://");
  return {
    inline_keyboard: [
      [
        isHttps
          ? { text: "🚀 Avero Mini Appni ochish", web_app: { url: appUrl } }
          : { text: "🚀 Avero Mini Appni ochish", url: appUrl },
      ],
      [
        {
          text: "✅ Bildirishnomalarga roziman",
          callback_data: "notif_consent:yes",
        },
        {
          text: "🔕 Yo‘q, faqat ilovada",
          callback_data: "notif_consent:no",
        },
      ],
    ],
  };
}

/**
 * Sends a notification message via Telegram Bot API strictly when:
 * 1) TELEGRAM_BOT_TOKEN is configured, AND
 * 2) User has started the bot (/start) and explicitly enabled Telegram notifications.
 */
export async function sendTelegramBotMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<TelegramSendResult> {
  const env = getServerEnv();
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { sent: false, skippedReason: "BOT_TOKEN_NOT_CONFIGURED" };
  }
  if (!chatId) {
    return { sent: false, skippedReason: "MISSING_CHAT_ID" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      }
    );
    if (!res.ok) {
      return { sent: false, skippedReason: `TELEGRAM_HTTP_${res.status}` };
    }
    return { sent: true };
  } catch {
    return { sent: false, skippedReason: "NETWORK_ERROR" };
  }
}

async function answerTelegramCallback(
  callbackQueryId: string,
  text: string
): Promise<void> {
  const env = getServerEnv();
  if (!env.TELEGRAM_BOT_TOKEN) return;

  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
    }
  ).catch(() => null);
}

export async function handleTelegramWebhookUpdate(update: {
  message?: {
    text?: string;
    from?: { id?: number | string };
    chat?: { id?: number | string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number | string };
  };
}): Promise<{
  handled: boolean;
  startedUserId?: string;
  consentUpdated?: boolean;
}> {
  const env = getServerEnv();

  // Handle notification consent inline callback button
  if (update.callback_query?.from?.id && update.callback_query.data) {
    const cbData = update.callback_query.data;
    if (cbData !== "notif_consent:yes" && cbData !== "notif_consent:no") {
      return { handled: false };
    }

    const tgUserId = String(update.callback_query.from.id);
    const consentEnabled = cbData === "notif_consent:yes";

    const updated = await withDbContext({ authFlow: true }, async (tx) => {
      const [identity] = await tx
        .select({ userId: authIdentities.userId })
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, "telegram"),
            eq(authIdentities.providerUserId, tgUserId)
          )
        )
        .limit(1);

      if (!identity) return false;

      await tx
        .update(userSettings)
        .set({
          telegramBotStarted: true,
          telegramNotifications: consentEnabled,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, identity.userId));

      return true;
    });

    if (update.callback_query.id) {
      await answerTelegramCallback(
        update.callback_query.id,
        consentEnabled
          ? "Telegram bildirishnomalari yoqildi!"
          : "Telegram bildirishnomalari o‘chirildi."
      );
    }

    return { handled: true, consentUpdated: updated };
  }

  // Handle /start command (anti-spam cooldown enforced)
  const msg = update.message;
  if (!msg?.from?.id || !msg?.chat?.id) {
    return { handled: false };
  }

  const text = (msg.text ?? "").trim();
  if (!text.startsWith("/start")) {
    return { handled: false };
  }

  const tgUserId = String(msg.from.id);
  const chatId = String(msg.chat.id);

  const startedUserId = await withDbContext({ authFlow: true }, async (tx) => {
    const [identity] = await tx
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "telegram"),
          eq(authIdentities.providerUserId, tgUserId)
        )
      )
      .limit(1);

    if (!identity) {
      return undefined;
    }

    await tx
      .update(userSettings)
      .set({
        telegramBotStarted: true,
        telegramChatId: chatId,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, identity.userId));

    return identity.userId;
  });

  // Anti-spam guard: send /start welcome + Mini App button at most once per cooldown window
  const nowMs = Date.now();
  const lastReplyMs = botReplyCooldownMap.get(tgUserId) ?? 0;
  if (nowMs - lastReplyMs >= START_COOLDOWN_MS) {
    botReplyCooldownMap.set(tgUserId, nowMs);
    await sendTelegramBotMessage(
      chatId,
      "Avero — faqat matnli ijtimoiy tarmoqqa xush kelibsiz.\n\nMini Appni ochish va Telegram bildirishnomalariga rozilik berish uchun quyidagi tugmalardan foydalaning:",
      buildBotStartReplyMarkup(env.APP_URL)
    );
  }

  return { handled: true, startedUserId };
}
