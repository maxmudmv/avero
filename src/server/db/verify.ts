import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const useSsl = process.env.DATABASE_SSL === "true";
  const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: true } : undefined,
  });

  try {
    const client = await pool.connect();
    try {
      const versionRes = await client.query<{ version: string }>(
        "SELECT version()"
      );
      const roleRes = await client.query<{
        current_user: string;
        rolbypassrls: boolean;
        rolsuper: boolean;
      }>(
        "SELECT current_user, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user"
      );
      const tablesRes = await client.query<{
        tablename: string;
        rowsecurity: boolean;
      }>(
        "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
      );

      console.log("[db:verify] PostgreSQL:", versionRes.rows[0]?.version);
      console.log("[db:verify] Active DB Role:", roleRes.rows[0]);
      console.log("[db:verify] Tables & RLS:", tablesRes.rows);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[db:verify] Failed:", err);
  process.exit(1);
});
