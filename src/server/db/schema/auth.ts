import {
  boolean,
  char,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authChannelEnum, authProviderEnum } from "./enums";
import { users } from "./users";

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProviderEnum("provider").notNull(),
    providerUserId: varchar("provider_user_id", { length: 128 }).notNull(),
    providerEmail: varchar("provider_email", { length: 255 }),
    providerUsername: varchar("provider_username", { length: 64 }),
    emailVerified: boolean("email_verified").notNull().default(false),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("idx_auth_identities_provider_uid").on(
      table.provider,
      table.providerUserId
    ),
    uniqueIndex("idx_auth_identities_user_provider").on(
      table.userId,
      table.provider
    ),
  ]
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    authChannel: authChannelEnum("auth_channel").notNull(),
    provider: authProviderEnum("provider").notNull(),
    ipHash: char("ip_hash", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_sessions_token_hash").on(table.tokenHash),
    index("idx_user_sessions_user_active").on(table.userId, table.expiresAt),
  ]
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_email_verification_token_hash").on(table.tokenHash),
    index("idx_email_verification_user").on(table.userId),
  ]
);

export const accountLinkTokens = pgTable(
  "account_link_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetProvider: authProviderEnum("target_provider").notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipHash: char("ip_hash", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_account_link_token_hash").on(table.tokenHash),
    index("idx_account_link_user_expires").on(table.userId, table.expiresAt),
  ]
);

export const telegramInitDataReplays = pgTable(
  "telegram_init_data_replays",
  {
    initDataHash: char("init_data_hash", { length: 64 }).primaryKey(),
    telegramUserId: varchar("telegram_user_id", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_tg_replays_expires").on(table.expiresAt)]
);
