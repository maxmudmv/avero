import { z } from "zod";
import { sanitizePlainText } from "./account";

export const MAX_HASHTAGS_PER_POST = 3;

export const postTypeSchema = z.enum([
  "note",
  "poem",
  "quote",
  "thought",
  "story",
]);

export const postStyleConfigSchema = z
  .object({
    editorMode: z.enum(["simple", "advanced"]).optional(),
    templateId: z.string().max(32).optional(),
    fontFamily: z.enum(["sans", "display", "serif", "mono"]).optional(),
    textColor: z
      .enum(["default", "pearl", "sky", "mint", "amber", "rose"])
      .optional(),
    bgStyle: z
      .enum(["matte", "aurora", "midnight", "sunset", "emerald", "pearl"])
      .optional(),
    isBold: z.boolean().optional(),
    isItalic: z.boolean().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
  })
  .strict()
  .default({});

const SINGLE_TAG_REGEX = /^[a-z0-9_\u0400-\u04FF]{2,32}$/;

export function normalizeHashtag(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#+/, "").toLowerCase();
  if (!SINGLE_TAG_REGEX.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function extractHashtagsFromBody(body: string): string[] {
  const matches = body.match(/#([a-zA-Z0-9_\u0400-\u04FF]{2,32})/g) ?? [];
  const unique: string[] = [];
  for (const m of matches) {
    const tag = normalizeHashtag(m);
    if (tag && !unique.includes(tag)) {
      unique.push(tag);
    }
  }
  return unique;
}

export const hashtagsArraySchema = z
  .array(z.string().trim().min(2).max(34))
  .max(10, "Juda ko‘p hashtag kiritildi")
  .transform((arr, ctx) => {
    const unique: string[] = [];
    for (const item of arr) {
      const normalized = normalizeHashtag(item);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Noto‘g‘ri hashtag formati: ${item}`,
        });
        return z.NEVER;
      }
      if (!unique.includes(normalized)) {
        unique.push(normalized);
      }
    }
    if (unique.length > MAX_HASHTAGS_PER_POST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Har bir postga maksimum ${MAX_HASHTAGS_PER_POST} ta hashtag mumkin`,
      });
      return z.NEVER;
    }
    return unique;
  });

export const commentPolicySchema = z.enum(["everyone", "followers", "closed"]);

export const createPostSchema = z.object({
  postType: postTypeSchema.default("note"),
  body: z
    .string()
    .transform((s) => sanitizePlainText(s))
    .pipe(z.string().min(1, "Post matni bo‘sh bo‘lmasligi kerak").max(5000)),
  styleConfig: postStyleConfigSchema.optional(),
  commentPolicy: commentPolicySchema.default("everyone"),
  hashtags: hashtagsArraySchema.optional(),
  draftId: z.string().uuid().optional(),
});

export const updatePostSchema = z.object({
  postType: postTypeSchema.optional(),
  body: z
    .string()
    .transform((s) => sanitizePlainText(s))
    .pipe(z.string().min(1, "Post matni bo‘sh bo‘lmasligi kerak").max(5000)),
  styleConfig: postStyleConfigSchema.optional(),
  commentPolicy: commentPolicySchema.optional(),
  hashtags: hashtagsArraySchema.optional(),
});

export const saveDraftSchema = z.object({
  postType: postTypeSchema.default("note"),
  body: z
    .string()
    .transform((s) => s.normalize("NFC"))
    .pipe(z.string().max(5000))
    .default(""),
  styleConfig: postStyleConfigSchema.optional(),
  hashtags: hashtagsArraySchema.optional(),
});

export const createCommentSchema = z.object({
  body: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(1, "Izoh bo‘sh bo‘lmasligi kerak").max(500)),
  parentCommentId: z.string().uuid().optional(),
});

export const feedQuerySchema = z.object({
  tab: z.enum(["for_you", "following", "trending"]).default("for_you"),
  postType: postTypeSchema.optional(),
  tag: z.string().trim().max(40).optional(),
  window: z.enum(["24h", "7d", "30d"]).default("7d"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  type: z.enum(["all", "posts", "users", "hashtags"]).default("all"),
  tag: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
