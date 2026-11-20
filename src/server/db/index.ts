import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

export type AppDatabase = NodePgDatabase<typeof schema>;

let appPool: Pool | null = null;
let appDb: AppDatabase | null = null;

function createPool(connectionString: string, useSsl: boolean): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: useSsl ? { rejectUnauthorized: true } : undefined,
  });
}

export function getPool(): Pool {
  if (!appPool) {
    const env = getServerEnv();
    appPool = createPool(env.DATABASE_URL, env.DATABASE_SSL);
  }
  return appPool;
}

export function getDb(): AppDatabase {
  if (!appDb) {
    appDb = drizzle(getPool(), { schema });
  }
  return appDb;
}

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
}> {
  const start = Date.now();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } finally {
    client.release();
  }
}

export async function closeDbPool(): Promise<void> {
  if (appPool) {
    await appPool.end();
    appPool = null;
    appDb = null;
  }
}
