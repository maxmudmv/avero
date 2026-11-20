import { z } from "zod";
import { isValidUsernameFormat, sanitizePlainText } from "./account";

export function extractMentionsFromText(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9._]{5,20})/g) ?? [];
  const unique: string[] = [];
  for (const m of matches) {
    const clean = m.slice(1).toLowerCase();
    if (isValidUsernameFormat(clean) && !unique.includes(clean)) {
      unique.push(clean);
    }
    if (unique.length >= 10) break;
  }
  return unique;
}

export const repostSchema = z
  .object({
    repostType: z.enum(["simple", "quote"]).default("simple"),
    quoteBody: z
      .string()
      .transform(sanitizePlainText)
      .pipe(z.string().min(1).max(500))
      .optional(),
  })
  .refine(
    (data) => data.repostType === "simple" || Boolean(data.quoteBody),
    {
      message: "Izohli repost uchun matn kiritish shart",
      path: ["quoteBody"],
    }
  );

export const blockUserSchema = z.object({
  level: z.enum(["dm_only", "follow_only", "content_only", "full"]),
});

export const sendDmSchema = z.object({
  recipientId: z.string().uuid(),
  body: z
    .string()
    .transform(sanitizePlainText)
    .pipe(
      z
        .string()
        .min(1, "Xabar matni bo‘sh bo‘lmasligi kerak")
        .max(1000, "Xabar maksimum 1000 belgi")
    ),
});

export const COMMENT_REPORT_REASONS = [
  { code: "spam", label: "Spam yoki reklama" },
  { code: "insult", label: "Haqorat yoki tahqirlash" },
  { code: "hate", label: "Nafrat va kamsitish" },
  { code: "illegal", label: "Noqonuniy yoki zararli kontent" },
  { code: "doxxing", label: "Shaxsiy ma’lumotlarni oshkor qilish" },
  { code: "other", label: "Boshqa sabab" },
] as const;

export const commentReportSchema = z.object({
  commentId: z.string().uuid(),
  reasonCode: z.enum([
    "spam",
    "insult",
    "hate",
    "illegal",
    "doxxing",
    "other",
  ]),
  details: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().max(300))
    .optional(),
});
