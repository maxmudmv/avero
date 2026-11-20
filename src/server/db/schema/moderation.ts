import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { permissions } from "./rbac";
import { users } from "./users";

export const adminUserPermissions = pgTable(
  "admin_user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionCode: varchar("permission_code", { length: 64 })
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.permissionCode] })]
);

export const moderationFlags = pgTable(
  "moderation_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentType: varchar("content_type", { length: 16 }).notNull(),
    contentId: uuid("content_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    severity: varchar("severity", { length: 16 }).notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    excerpt: varchar("excerpt", { length: 280 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decisionReason: varchar("decision_reason", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_moderation_flags_status_created").on(
      table.status,
      table.createdAt
    ),
  ]
);

export const userWarnings = pgTable(
  "user_warnings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportId: uuid("report_id"),
    reason: varchar("reason", { length: 300 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_user_warnings_user_created").on(table.userId, table.createdAt)]
);

export const moderationAppeals = pgTable(
  "moderation_appeals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actionType: varchar("action_type", { length: 24 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewReason: varchar("review_reason", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_moderation_appeals_status_created").on(
      table.status,
      table.createdAt
    ),
    index("idx_moderation_appeals_user").on(table.userId, table.createdAt),
  ]
);

export const platformAnnouncements = pgTable("platform_announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deliveredCount: integer("delivered_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
