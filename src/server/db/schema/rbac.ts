import {
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";

export const roles = pgTable("roles", {
  name: userRoleEnum("name").primaryKey(),
  description: varchar("description", { length: 255 }).notNull(),
  hierarchyLevel: integer("hierarchy_level").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permissions = pgTable("permissions", {
  code: varchar("code", { length: 64 }).primaryKey(),
  description: varchar("description", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleName: userRoleEnum("role_name")
      .notNull()
      .references(() => roles.name, { onDelete: "cascade" }),
    permissionCode: varchar("permission_code", { length: 64 })
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.roleName, table.permissionCode] })]
);
