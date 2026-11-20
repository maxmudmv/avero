import { z } from "zod";

const CONTROL_CHARS_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

function sanitizePlainText(input: string): string {
  return input.normalize("NFC").replace(CONTROL_CHARS_REGEX, "").trim();
}

export const NOTIFICATION_PREFERENCE_KEYS = [
  "like",
  "comment",
  "reply",
  "follow",
  "mention",
  "dm",
  "avatar_unlocked",
  "announcement",
] as const;

export type NotificationPreferenceKey =
  (typeof NOTIFICATION_PREFERENCE_KEYS)[number];

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  like: true,
  comment: true,
  reply: true,
  follow: true,
  mention: true,
  dm: true,
  avatar_unlocked: true,
  announcement: true,
};

export const notificationPreferencesSchema = z
  .object({
    like: z.boolean().optional(),
    comment: z.boolean().optional(),
    reply: z.boolean().optional(),
    follow: z.boolean().optional(),
    mention: z.boolean().optional(),
    dm: z.boolean().optional(),
    avatar_unlocked: z.boolean().optional(),
    announcement: z.boolean().optional(),
  })
  .strict();

export const NOTIFICATION_TYPE_LABELS: Array<{
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}> = [
  {
    key: "like",
    label: "Postga Like",
    description: "Postingiz yoqtirilganda bildirishnoma olish",
  },
  {
    key: "comment",
    label: "Postga izoh",
    description: "Postingizga yangi izoh yozilganda",
  },
  {
    key: "reply",
    label: "Izohga javob",
    description: "Izohingizga javob qoldirilganda",
  },
  {
    key: "follow",
    label: "Yangi follower",
    description: "Sizni kuzatish boshlanganda yoki so‘rov kelganda",
  },
  {
    key: "mention",
    label: "@mention",
    description: "Post yoki izohda @username orqali belgilanganda",
  },
  {
    key: "dm",
    label: "Yangi DM",
    description: "Shaxsiy xabar yoki xabar so‘rovi kelganda",
  },
  {
    key: "avatar_unlocked",
    label: "Yangi avatar ochilishi",
    description: "Yangi avatar kolleksiyasi ochilganda",
  },
  {
    key: "announcement",
    label: "Platforma e’lonlari",
    description: "Platformaning muhim yangiliklari va xavfsizlik e’lonlari",
  },
];

export const announcementSchema = z.object({
  title: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(3, "Sarlavha kamida 3 ta belgi").max(100)),
  body: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(5, "E’lon matni kamida 5 ta belgi").max(500)),
});
