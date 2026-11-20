import { z } from "zod";
import { sanitizePlainText } from "./account";

export const moderationReasonSchema = z
  .string()
  .transform(sanitizePlainText)
  .pipe(
    z
      .string()
      .min(5, "Qaror sababi kamida 5 ta belgi bo‘lishi kerak")
      .max(300, "Sabab maksimum 300 belgi")
  );

export const reviewReportSchema = z.object({
  status: z.enum(["under_review", "resolved_action", "resolved_dismissed"]),
  reason: moderationReasonSchema,
  deleteComment: z.boolean().optional(),
  warnAuthor: z.boolean().optional(),
});

export const deleteCommentByModSchema = z.object({
  reason: moderationReasonSchema,
});

export const reviewFlagSchema = z.object({
  status: z.enum(["reviewed_safe", "reviewed_action"]),
  reason: moderationReasonSchema,
  warnAuthor: z.boolean().optional(),
});

export const warnUserSchema = z.object({
  reason: moderationReasonSchema,
  reportId: z.string().uuid().optional(),
});

export const moderateUserStatusSchema = z.object({
  action: z.enum(["mute", "suspend", "ban", "restore"]),
  reason: moderationReasonSchema,
  durationHours: z.coerce.number().int().min(1).max(720).optional(),
  humanConfirmed: z.literal(true, {
    errorMap: () => ({
      message: "Jiddiy moderatsiya qarori uchun inson tasdiqlashi majburiy",
    }),
  }),
});

export const setAdminPermissionsSchema = z.object({
  permissions: z.array(z.string().min(3).max(64)).max(32),
  reason: moderationReasonSchema,
});

export const submitAppealSchema = z.object({
  actionType: z.enum(["warning", "mute", "suspend", "ban", "comment_deleted"]),
  reason: z
    .string()
    .transform(sanitizePlainText)
    .pipe(
      z
        .string()
        .min(10, "Apellyatsiya sababi kamida 10 belgi bo‘lishi kerak")
        .max(500)
    ),
});

export const reviewAppealSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: moderationReasonSchema,
  humanConfirmed: z.literal(true, {
    errorMap: () => ({
      message: "Apellyatsiya qarori uchun inson tasdiqlashi shart",
    }),
  }),
});
