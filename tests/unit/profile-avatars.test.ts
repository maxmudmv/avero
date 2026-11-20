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

  it("contains 30 mixed-style avatars and unlocks progressively by time + 3-day activity", () => {
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
    expect(STARTER_AVATAR_IDS.length).toBe(8);

    const dayZero = computeUnlockedAvatarIds({
      previouslyUnlocked: [],
      accountAgeDays: 0,
      activeThreeDayCycles: 0,
      postsCount: 0,
    });
    expect(dayZero).toEqual(STARTER_AVATAR_IDS);

    const dayThreeActive = computeUnlockedAvatarIds({
      previouslyUnlocked: dayZero,
      accountAgeDays: 3,
      activeThreeDayCycles: 1,
      postsCount: 2,
    });
    expect(dayThreeActive).toContain("av_04");
    expect(dayThreeActive).toContain("av_05");
    expect(dayThreeActive).toContain("av_13");
    expect(dayThreeActive).toContain("av_24");
    expect(dayThreeActive.length).toBeGreaterThan(STARTER_AVATAR_IDS.length);
  });
});
