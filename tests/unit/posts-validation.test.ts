import { describe, expect, it } from "vitest";
import { getPostStyleClasses } from "@/lib/posts/styles";
import {
  createPostSchema,
  extractHashtagsFromBody,
  hashtagsArraySchema,
} from "@/lib/validation/posts";
import { computeUnlockedPostLength } from "@/server/config/post-limits";

describe("Posts Validation, Hashtags, Styles & Configurable Limits", () => {
  it("enforces max 3 unique normalized hashtags", () => {
    const valid = hashtagsArraySchema.safeParse(["#SheRiyat", "sheriyat", "Ijod", "Fikr"]);
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toEqual(["sheriyat", "ijod", "fikr"]);
    }

    const tooMany = hashtagsArraySchema.safeParse(["one", "two", "three", "four"]);
    expect(tooMany.success).toBe(false);

    expect(extractHashtagsFromBody("Assalom #avero #ozbek #matn")).toEqual([
      "avero",
      "ozbek",
      "matn",
    ]);
  });

  it("validates all 5 post types and strict CSS styleConfig", () => {
    for (const postType of ["note", "poem", "quote", "thought", "story"] as const) {
      const parsed = createPostSchema.safeParse({
        postType,
        body: "Sinov matni",
        styleConfig: {
          editorMode: "advanced",
          fontFamily: "serif",
          textColor: "sky",
          bgStyle: "aurora",
          isItalic: true,
          textAlign: "center",
        },
      });
      expect(parsed.success).toBe(true);
    }

    const classes = getPostStyleClasses({
      editorMode: "advanced",
      fontFamily: "serif",
      textColor: "sky",
      bgStyle: "aurora",
      isItalic: true,
      textAlign: "center",
    });
    expect(classes.containerClass).toContain("bg-gradient-to-br");
    expect(classes.textClass).toContain("italic");
    expect(classes.textClass).toContain("text-center");
  });

  it("computes configurable post limits and never decreases unlocked limit", () => {
    const base = computeUnlockedPostLength({
      currentMaxLength: 1000,
      verifiedReferralsCount: 0,
      hasVerifiedEmail: false,
    });
    expect(base.unlockedMaxLength).toBe(1000);

    const boosted = computeUnlockedPostLength({
      currentMaxLength: 1000,
      verifiedReferralsCount: 2,
      hasVerifiedEmail: true,
    });
    expect(boosted.unlockedMaxLength).toBe(1700); // 1000 + 200 + 500

    // Even if config lowers later, previously unlocked 2200 never drops
    const neverDecreases = computeUnlockedPostLength({
      currentMaxLength: 2200,
      verifiedReferralsCount: 0,
      hasVerifiedEmail: false,
    });
    expect(neverDecreases.unlockedMaxLength).toBe(2200);
  });
});
