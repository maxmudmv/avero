import { describe, expect, it } from "vitest";
import {
  blockUserSchema,
  COMMENT_REPORT_REASONS,
  commentReportSchema,
  extractMentionsFromText,
  repostSchema,
  sendDmSchema,
} from "@/lib/validation/social";

describe("Social interactions validation & mentions parsing", () => {
  it("extracts valid unique @mentions and caps at 10", () => {
    const mentions = extractMentionsFromText(
      "Salom @Azizbek va @madina.dev hamda @azizbek va @bad!"
    );
    expect(mentions).toEqual(["azizbek", "madina.dev"]);
  });

  it("validates simple vs quote reposts", () => {
    expect(repostSchema.safeParse({ repostType: "simple" }).success).toBe(true);
    expect(repostSchema.safeParse({ repostType: "quote" }).success).toBe(false);
    expect(
      repostSchema.safeParse({
        repostType: "quote",
        quoteBody: "Ajoyib fikr!",
      }).success
    ).toBe(true);
  });

  it("validates text-only DM bounds (1..1000 chars)", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(sendDmSchema.safeParse({ recipientId: uuid, body: "" }).success).toBe(
      false
    );
    expect(
      sendDmSchema.safeParse({ recipientId: uuid, body: "a".repeat(1001) })
        .success
    ).toBe(false);
    expect(
      sendDmSchema.safeParse({ recipientId: uuid, body: "Salom do‘stim!" })
        .success
    ).toBe(true);
  });

  it("validates granular block levels and comment-only report reasons", () => {
    for (const level of ["dm_only", "follow_only", "content_only", "full"]) {
      expect(blockUserSchema.safeParse({ level }).success).toBe(true);
    }
    expect(blockUserSchema.safeParse({ level: "partial" }).success).toBe(false);

    expect(COMMENT_REPORT_REASONS.map((r) => r.code)).toEqual([
      "spam",
      "insult",
      "hate",
      "illegal",
      "doxxing",
      "other",
    ]);

    expect(
      commentReportSchema.safeParse({
        commentId: "11111111-1111-4111-8111-111111111111",
        reasonCode: "doxxing",
      }).success
    ).toBe(true);
  });
});
