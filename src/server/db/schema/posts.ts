import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { postTypeEnum } from "./enums";
import { users } from "./users";

export interface PostStyleConfig {
  editorMode?: "simple" | "advanced";
  templateId?: string;
  fontFamily?: "sans" | "display" | "serif" | "mono";
  textColor?: "default" | "pearl" | "sky" | "mint" | "amber" | "rose";
  bgStyle?: "matte" | "aurora" | "midnight" | "sunset" | "emerald" | "pearl";
  isBold?: boolean;
  isItalic?: boolean;
  textAlign?: "left" | "center" | "right";
}

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postType: postTypeEnum("post_type").notNull().default("note"),
    body: text("body").notNull(),
    styleConfig: jsonb("style_config")
      .$type<PostStyleConfig>()
      .notNull()
      .default({}),
    commentPolicy: varchar("comment_policy", { length: 16 })
      .notNull()
      .default("everyone"),
    isEdited: boolean("is_edited").notNull().default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    viewsCount: integer("views_count").notNull().default(0),
    repostsCount: integer("reposts_count").notNull().default(0),
    bookmarksCount: integer("bookmarks_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_posts_created_id").on(table.createdAt, table.id),
    index("idx_posts_author_created").on(table.authorId, table.createdAt),
    index("idx_posts_type_created").on(table.postType, table.createdAt),
    check("chk_posts_body_non_empty", sql`char_length(trim(${table.body})) >= 1`),
    check(
      "chk_posts_counts_non_negative",
      sql`${table.likesCount} >= 0 AND ${table.commentsCount} >= 0 AND ${table.viewsCount} >= 0 AND ${table.repostsCount} >= 0 AND ${table.bookmarksCount} >= 0`
    ),
  ]
);

export const postDrafts = pgTable(
  "post_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postType: postTypeEnum("post_type").notNull().default("note"),
    body: text("body").notNull().default(""),
    styleConfig: jsonb("style_config")
      .$type<PostStyleConfig>()
      .notNull()
      .default({}),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_post_drafts_author_updated").on(table.authorId, table.updatedAt),
  ]
);

export const hashtags = pgTable(
  "hashtags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tag: varchar("tag", { length: 40 }).notNull(),
    postsCount: integer("posts_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_hashtags_tag_lower").on(sql`lower(${table.tag})`),
    check("chk_hashtags_count_non_negative", sql`${table.postsCount} >= 0`),
  ]
);

export const postHashtags = pgTable(
  "post_hashtags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    hashtagId: uuid("hashtag_id")
      .notNull()
      .references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.hashtagId] }),
    index("idx_post_hashtags_hashtag").on(table.hashtagId, table.postId),
  ]
);

export const postComments = pgTable(
  "post_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => postComments.id,
      { onDelete: "cascade" }
    ),
    body: varchar("body", { length: 500 }).notNull(),
    likesCount: integer("likes_count").notNull().default(0),
    repliesCount: integer("replies_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_post_comments_post_created").on(table.postId, table.createdAt),
    index("idx_post_comments_popular").on(
      table.postId,
      table.likesCount,
      table.repliesCount
    ),
    check(
      "chk_post_comments_body_non_empty",
      sql`char_length(trim(${table.body})) >= 1`
    ),
    check(
      "chk_post_comments_counts_non_negative",
      sql`${table.likesCount} >= 0 AND ${table.repliesCount} >= 0`
    ),
  ]
);

export const postLikes = pgTable(
  "post_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.postId] })]
);

export const postReposts = pgTable(
  "post_reposts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    repostType: varchar("repost_type", { length: 16 })
      .notNull()
      .default("simple"),
    quoteBody: varchar("quote_body", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_post_reposts_simple_unique")
      .on(table.userId, table.postId)
      .where(sql`${table.repostType} = 'simple'`),
    index("idx_post_reposts_post").on(table.postId, table.createdAt),
  ]
);

export const postBookmarks = pgTable(
  "post_bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.postId] })]
);

export const postViews = pgTable(
  "post_views",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })]
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followingId] }),
    index("idx_follows_following").on(table.followingId, table.createdAt),
    check(
      "chk_follows_no_self",
      sql`${table.followerId} <> ${table.followingId}`
    ),
  ]
);

export const followRequests = pgTable(
  "follow_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_follow_requests_pair").on(
      table.requesterId,
      table.targetId
    ),
    index("idx_follow_requests_target_status").on(table.targetId, table.status),
    check(
      "chk_follow_requests_no_self",
      sql`${table.requesterId} <> ${table.targetId}`
    ),
  ]
);

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeId: uuid("invitee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("verified"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_referrals_invitee_unique").on(table.inviteeId),
    index("idx_referrals_inviter").on(table.inviterId),
    check(
      "chk_referrals_no_self",
      sql`${table.inviterId} <> ${table.inviteeId}`
    ),
  ]
);
