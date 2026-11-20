import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
  notificationPreferencesSchema,
} from "@/lib/validation/notifications";
import {
  hasMinimumRole,
  hasPermission,
  PERMISSIONS,
  ROLE_HIERARCHY,
} from "@/server/auth/permissions";
import { runAutomatedContentCheck } from "@/server/services/auto-moderation.service";
import { formatTelegramNotificationMessage } from "@/server/services/telegram-bot.service";

describe("Notifications, Auto-Moderation & RBAC Hierarchy", () => {
  it("supports super_admin > admin > moderator > user hierarchy and permission boundaries", () => {
    expect(ROLE_HIERARCHY.super_admin).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.moderator);
    expect(ROLE_HIERARCHY.moderator).toBeGreaterThan(ROLE_HIERARCHY.user);

    expect(hasMinimumRole("super_admin", "admin")).toBe(true);
    expect(hasMinimumRole("admin", "super_admin")).toBe(false);

    expect(hasPermission("moderator", PERMISSIONS.MOD_COMMENT_DELETE)).toBe(true);
    expect(hasPermission("moderator", PERMISSIONS.MOD_USER_WARN)).toBe(true);
    expect(hasPermission("moderator", PERMISSIONS.ADMIN_USER_BAN)).toBe(false);
    expect(hasPermission("moderator", PERMISSIONS.ADMIN_PERMISSIONS_GRANT)).toBe(
      false
    );
    expect(hasPermission("super_admin", PERMISSIONS.ADMIN_PERMISSIONS_GRANT)).toBe(
      true
    );
  });

  it("validates all 8 notification preference keys and Telegram formatter", () => {
    expect(NOTIFICATION_PREFERENCE_KEYS).toEqual([
      "like",
      "comment",
      "reply",
      "follow",
      "mention",
      "dm",
      "avatar_unlocked",
      "announcement",
    ]);
    expect(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)).toHaveLength(8);
    expect(
      notificationPreferencesSchema.safeParse({ like: false, dm: true }).success
    ).toBe(true);

    expect(
      formatTelegramNotificationMessage({
        type: "like",
        actorUsername: "azizbek",
      })
    ).toContain("@azizbek");
    expect(
      formatTelegramNotificationMessage({
        type: "avatar_unlocked",
        bodyPreview: "av_12",
      })
    ).toContain("av_12");
  });

  it("detects high/medium risk content in automated check without flagging normal text", () => {
    expect(
      runAutomatedContentCheck("Bugun havo juda go‘zal, yangi she’r yozdim.").flagged
    ).toBe(false);

    const dox = runAutomatedContentCheck("Karta raqam: 8600 1234 5678 9012");
    expect(dox.flagged).toBe(true);
    expect(dox.severity).toBe("high");

    const spam = runAutomatedContentCheck(
      "Tekin pul va free crypto olish uchun kirish!"
    );
    expect(spam.flagged).toBe(true);
    expect(spam.severity).toBe("medium");
  });
});
