import { describe, expect, it } from "vitest";
import {
  AVATAR_CATALOG,
  computeUnlockedAvatarIds,
  STARTER_AVATAR_IDS,
} from "@/lib/avatars/catalog";
import {
  isValidUsernameFormat,
  updateProfileSchema,
} from "@/lib/validation/account";

describe("Profile Validation & 30-Avatar Catalog", () => {
  it("validates 5-20 char usernames with latin letters, numbers, dot, and underscore", () => {
    expect(isValidUsernameFormat("ali_01")).toBe(true);
    expect(isValidUsernameFormat("ali.karimov_99")).toBe(true);
    expect(isValidUsernameFormat("abcde")).toBe(true);
    expect(isValidUsernameFormat("a".repeat(20))).toBe(true);

    expect(isValidUsernameFormat("abcd")).toBe(false); // < 5
    expect(isValidUsernameFormat("a".repeat(21))).toBe(false); // > 20
    expect(isValidUsernameFormat(".ali_01")).toBe(false);
    expect(isValidUsernameFormat("ali_01.")).toBe(false);
    expect(isValidUsernameFormat("ali..01")).toBe(false);
    expect(isValidUsernameFormat("ali-01")).toBe(false);
  });

  it("enforces displayName (1-40), bio (<=150), and https-only externalLinks (max 4)", () => {
    expect(
      updateProfileSchema.safeParse({
        displayName: "Azizbek Karimov",
        bio: "Matnli fikrlar.",
        avatarId: "av_01",
        externalLinks: [{ label: "Site", url: "https://avero.uz" }],
      }).success
    ).toBe(true);

    expect(
      updateProfileSchema.safeParse({ displayName: "a".repeat(41) }).success
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({ bio: "a".repeat(151) }).success
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({
        externalLinks: [{ label: "Bad", url: "http://insecure.example.com" }],
      }).success
    ).toBe(false);
  });

  it("contains 30 mixed-style avatars and unlocks strictly 1 per active day", () => {
    expect(AVATAR_CATALOG).toHaveLength(30);
    expect(
      AVATAR_CATALOG.filter((a) => a.category === "illustration")
    ).toHaveLength(10);
    expect(
      AVATAR_CATALOG.filter((a) => a.category === "abstract")
    ).toHaveLength(10);
    expect(
      AVATAR_CATALOG.filter((a) => a.category === "minimal")
    ).toHaveLength(10);
    expect(STARTER_AVATAR_IDS).toEqual(["av_01"]);

    const dayOne = computeUnlockedAvatarIds({
      previouslyUnlocked: [],
      activeDaysCount: 1,
      accountAgeDays: 0,
      activeThreeDayCycles: 0,
      postsCount: 0,
    });
    expect(dayOne).toEqual(["av_01"]);

    const dayTwo = computeUnlockedAvatarIds({
      previouslyUnlocked: dayOne,
      activeDaysCount: 2,
      accountAgeDays: 1,
      activeThreeDayCycles: 0,
      postsCount: 0,
    });
    expect(dayTwo).toEqual(["av_01", "av_02"]);

    const dayFive = computeUnlockedAvatarIds({
      previouslyUnlocked: dayTwo,
      activeDaysCount: 5,
      accountAgeDays: 5,
      activeThreeDayCycles: 1,
      postsCount: 2,
    });
    expect(dayFive).toEqual(["av_01", "av_02", "av_03", "av_04", "av_05"]);

    const dayThirty = computeUnlockedAvatarIds({
      previouslyUnlocked: dayFive,
      activeDaysCount: 30,
      accountAgeDays: 30,
      activeThreeDayCycles: 8,
      postsCount: 10,
    });
    expect(dayThirty).toHaveLength(30);
  });
});
