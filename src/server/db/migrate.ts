import "dotenv/config";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";
import { seedRbacData } from "./seed-rbac";

async function main() {
  const migrationUrl =
    process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

  if (!migrationUrl) {
    throw new Error(
      "DATABASE_MIGRATION_URL or DATABASE_URL must be set to run migrations"
    );
  }

  const useSsl = process.env.DATABASE_SSL === "true";
  const pool = new Pool({
    connectionString: migrationUrl,
    ssl: useSsl ? { rejectUnauthorized: true } : undefined,
  });

  try {
    const db = drizzle(pool, { schema });
    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    console.log(`[db:migrate] Applying migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log("[db:migrate] Migrations applied successfully.");

    console.log("[db:migrate] Seeding RBAC roles and permissions...");
    await seedRbacData(db);
    console.log("[db:migrate] RBAC seed completed.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[db:migrate] Failed:", err);
  process.exit(1);
});
