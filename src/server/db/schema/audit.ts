import {
  bigserial,
  char,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id"),
    actorRole: varchar("actor_role", { length: 16 }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }),
    targetId: varchar("target_id", { length: 64 }),
    ipHash: char("ip_hash", { length: 64 }),
    requestId: varchar("request_id", { length: 64 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_logs_event_created").on(table.eventType, table.createdAt),
    index("idx_audit_logs_actor_created").on(table.actorId, table.createdAt),
  ]
);
