import { z } from "zod";
import { isValidAvatarId } from "@/lib/avatars/catalog";
import { notificationPreferencesSchema } from "./notifications";

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

export function sanitizePlainText(input: string): string {
  return input.normalize("NFC").replace(CONTROL_CHARS_REGEX, "").trim();
}

export const USERNAME_REGEX = /^[a-z0-9._]{5,20}$/;

export function isValidUsernameFormat(username: string): boolean {
  return (
    USERNAME_REGEX.test(username) &&
    !username.startsWith(".") &&
    !username.endsWith(".") &&
    !username.includes("..")
  );
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    isValidUsernameFormat,
    "Username 5–20 ta belgi (lotin harflari, raqam, nuqta va _) dan iborat bo‘lishi kerak"
  );

export const externalLinkSchema = z.object({
  label: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(1, "Havola nomi kerak").max(32)),
  url: z
    .string()
    .trim()
    .url("To‘g‘ri URL kiriting")
    .refine(
      (val) => val.startsWith("https://"),
      "Tashqi havola faqat https:// bilan boshlanishi shart"
    )
    .pipe(z.string().max(255)),
});

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(1, "Ism bo‘sh bo‘lmasin").max(40, "Ism maksimum 40 belgi"))
    .optional(),
  bio: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().max(150, "Bio maksimum 150 belgi"))
    .optional(),
  avatarId: z
    .string()
    .trim()
    .refine(isValidAvatarId, "Noto‘g‘ri avatar tanlandi")
    .optional(),
  externalLinks: z
    .array(externalLinkSchema)
    .max(4, "Maksimum 4 ta tashqi havola qo‘shish mumkin")
    .optional(),
});

export const updateSettingsSchema = z.object({
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  privacyLevel: z.enum(["public", "private", "followers_only"]).optional(),
  autoApproveFollows: z.boolean().optional(),
  showOnlineStatus: z.boolean().optional(),
  allowMentions: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  telegramNotifications: z.boolean().optional(),
  notificationPreferences: notificationPreferencesSchema.optional(),
});

export const telegramInitDataSchema = z.object({
  initData: z.string().min(10).max(8192),
});

export const initLinkSchema = z.object({
  consentAccepted: z.literal(true, {
    errorMap: () => ({
      message: "Explicit user consent is required to link accounts",
    }),
  }),
});

export const confirmTelegramLinkSchema = z.object({
  initData: z.string().min(10).max(8192),
  linkToken: z.string().min(16).max(256),
});

export const emailVerificationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().min(16).max(256),
});

export const assignRoleSchema = z.object({
  role: z.enum(["user", "moderator", "admin"]),
  reason: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(5, "Kamida 5 belgi sabab kiriting").max(300))
    .optional(),
});

export const passwordSchema = z
  .string()
  .min(6, "Parol kamida 6 ta belgidan iborat bo‘lishi kerak")
  .max(72, "Parol maksimum 72 ta belgi bo‘lishi mumkin");

export const completeAccountSetupSchema = z.object({
  username: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@+/, "").toLowerCase())
    .pipe(usernameSchema),
  displayName: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(1, "Ism bo‘sh bo‘lmasin").max(40, "Ism maksimum 40 belgi")),
  password: passwordSchema,
  bio: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().max(150, "Bio maksimum 150 belgi"))
    .optional(),
});

export const passwordLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@+/, "").toLowerCase())
    .pipe(z.string().min(1, "Username kiriting").max(30)),
  password: z.string().min(1, "Parol kiriting").max(72),
});
