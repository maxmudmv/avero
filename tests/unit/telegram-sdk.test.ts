import { describe, expect, it } from "vitest";
import { extractLinkTokenFromStartParam } from "@/lib/telegram-sdk";
import { buildBotStartReplyMarkup } from "@/server/services/telegram-bot.service";

describe("Telegram Mini App SDK & Bot Helpers", () => {
  it("extracts one-time link tokens safely from start_param", () => {
    expect(extractLinkTokenFromStartParam("link_abcdef0123456789")).toBe(
      "abcdef0123456789"
    );
    expect(extractLinkTokenFromStartParam("link_short")).toBeNull();
    expect(extractLinkTokenFromStartParam("referral_123456789")).toBeNull();
    expect(extractLinkTokenFromStartParam(null)).toBeNull();
  });

  it("builds Mini App web_app open button and notification consent inline keyboard", () => {
    const markup = buildBotStartReplyMarkup("https://avero.uz");
    expect(markup.inline_keyboard).toHaveLength(2);
    expect(markup.inline_keyboard[0]?.[0]).toMatchObject({
      text: "🚀 Avero Mini Appni ochish",
      web_app: { url: "https://avero.uz" },
    });
    expect(markup.inline_keyboard[1]?.[0]).toMatchObject({
      callback_data: "notif_consent:yes",
    });
    expect(markup.inline_keyboard[1]?.[1]).toMatchObject({
      callback_data: "notif_consent:no",
    });
  });
});
