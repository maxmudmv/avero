import "server-only";
import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { getDb } from "./index";
import type * as schema from "./schema";
import type { UserRole } from "./schema";

export type DbTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export interface DbActorContext {
  userId?: string | null;
  role?: UserRole | "anonymous";
  authFlow?: boolean;
}

/**
 * Executes database operations inside an isolated transaction with local
 * PostgreSQL session settings so Row Level Security (RLS) never leaks across
 * pooled connections.
 */
export async function withDbContext<T>(
  ctx: DbActorContext,
  callback: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const db = getDb();
  const userId = ctx.userId ?? "";
  const role = ctx.role ?? "anonymous";
  const authContext = ctx.authFlow ? "auth_flow" : "default";

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT
        set_config('app.current_user_id', ${userId}, true),
        set_config('app.current_user_role', ${role}, true),
        set_config('app.auth_context', ${authContext}, true)`
    );
    return callback(tx);
  });
}
