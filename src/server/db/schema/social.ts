import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { postComments, posts } from "./posts";
import { users } from "./users";

export type BlockLevel = "dm_only" | "follow_only" | "content_only" | "full";
export type CommentReportReason =
  | "spam"
  | "insult"
  | "hate"
  | "illegal"
  | "doxxing"
  | "other";

export const commentLikes = pgTable(
  "comment_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => postComments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.commentId] })]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 24 }).notNull(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => postComments.id, {
      onDelete: "cascade",
    }),
    bodyPreview: varchar("body_preview", { length: 140 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notifications_recipient_created").on(
      table.recipientId,
      table.createdAt
    ),
  ]
);

export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    level: varchar("level", { length: 24 }).notNull().default("full"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    index("idx_user_blocks_blocked").on(table.blockedId),
    check(
      "chk_user_blocks_no_self",
      sql`${table.blockerId} <> ${table.blockedId}`
    ),
    check(
      "chk_user_blocks_valid_level",
      sql`${table.level} IN ('dm_only', 'follow_only', 'content_only', 'full')`
    ),
  ]
);

export const dmThreads = pgTable(
  "dm_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user1Id: uuid("user1_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    user2Id: uuid("user2_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    initiatedBy: uuid("initiated_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_dm_threads_pair").on(table.user1Id, table.user2Id),
    index("idx_dm_threads_last_msg").on(table.lastMessageAt),
    check(
      "chk_dm_threads_canonical_order",
      sql`${table.user1Id} < ${table.user2Id}`
    ),
  ]
);

export const dmMessages = pgTable(
  "dm_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => dmThreads.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 1000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_dm_messages_thread_created").on(table.threadId, table.createdAt),
    check(
      "chk_dm_messages_body_non_empty",
      sql`char_length(trim(${table.body})) >= 1`
    ),
  ]
);

export const commentReports = pgTable(
  "comment_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => postComments.id, { onDelete: "cascade" }),
    reasonCode: varchar("reason_code", { length: 32 }).notNull(),
    details: varchar("details", { length: 300 }),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolutionReason: varchar("resolution_reason", { length: 300 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_comment_reports_unique").on(
      table.reporterId,
      table.commentId
    ),
    check(
      "chk_comment_reports_reason",
      sql`${table.reasonCode} IN ('spam', 'insult', 'hate', 'illegal', 'doxxing', 'other')`
    ),
  ]
);
