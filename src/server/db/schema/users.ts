import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/lib/validation/notifications";
import {
  privacyLevelEnum,
  themePreferenceEnum,
  userRoleEnum,
  userStatusEnum,
} from "./enums";
import { roles } from "./rbac";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: userRoleEnum("role")
      .notNull()
      .default("user")
      .references(() => roles.name),
    status: userStatusEnum("status").notNull().default("active"),
    primaryEmail: varchar("primary_email", { length: 255 }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    maxPostLength: integer("max_post_length").notNull().default(1000),
    suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_users_primary_email_lower")
      .on(sql`lower(${table.primaryEmail})`)
      .where(sql`${table.primaryEmail} IS NOT NULL`),
    check("chk_users_max_post_length_min", sql`${table.maxPostLength} >= 1000`),
  ]
);

export interface ExternalLinkItem {
  label: string;
  url: string;
}

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 30 }).notNull(),
    displayName: varchar("display_name", { length: 40 }).notNull(),
    bio: varchar("bio", { length: 150 }).notNull().default(""),
    avatarId: varchar("avatar_id", { length: 16 }).notNull().default("av_01"),
    externalLinks: jsonb("external_links")
      .$type<ExternalLinkItem[]>()
      .notNull()
      .default([]),
    followersCount: integer("followers_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    postsCount: integer("posts_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_profiles_username_lower").on(sql`lower(${table.username})`),
    check(
      "chk_profiles_username_format",
      sql`${table.username} ~ '^[a-z0-9._]{5,20}$' AND ${table.username} !~ '(^\\.|\\.$|\\.\\.)'`
    ),
    check(
      "chk_profiles_counts_non_negative",
      sql`${table.followersCount} >= 0 AND ${table.followingCount} >= 0 AND ${table.postsCount} >= 0`
    ),
  ]
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  language: varchar("language", { length: 10 }).notNull().default("uz"),
  theme: themePreferenceEnum("theme").notNull().default("system"),
  privacyLevel: privacyLevelEnum("privacy_level").notNull().default("public"),
  autoApproveFollows: boolean("auto_approve_follows").notNull().default(true),
  showOnlineStatus: boolean("show_online_status").notNull().default(true),
  allowMentions: boolean("allow_mentions").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(false),
  telegramNotifications: boolean("telegram_notifications")
    .notNull()
    .default(false),
  telegramBotStarted: boolean("telegram_bot_started").notNull().default(false),
  telegramChatId: varchar("telegram_chat_id", { length: 64 }),
  notificationPreferences: jsonb("notification_preferences")
    .$type<NotificationPreferences>()
    .notNull()
    .default(DEFAULT_NOTIFICATION_PREFERENCES),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userActivity = pgTable("user_activity", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastVisitAt: timestamp("last_visit_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastPostAt: timestamp("last_post_at", { withTimezone: true }),
  lastQualifiedAt: timestamp("last_qualified_at", { withTimezone: true }),
  activeThreeDayCycles: integer("active_three_day_cycles")
    .notNull()
    .default(0),
  totalVisitsCount: integer("total_visits_count").notNull().default(1),
  unlockedAvatars: jsonb("unlocked_avatars")
    .$type<string[]>()
    .notNull()
    .default([
      "av_01",
      "av_02",
      "av_03",
      "av_04",
      "av_05",
      "av_06",
      "av_07",
      "av_08",
    ]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
