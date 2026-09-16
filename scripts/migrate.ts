/**
 * Applies the SQL migrations in ./drizzle, then creates the default user types if
 * there are none yet. Run at boot by launch.sh and locally with `npm run db:migrate`.
 * Migrations are generated from src/lib/db/schema.ts with `npm run db:generate` and committed.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { userTypes } from "../src/lib/db/schema";
import { DEFAULT_USER_TYPES } from "../src/lib/pages";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const started = Date.now();
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "drizzle" });

    // Only into an empty table: once admins edit the types, boot never touches them again.
    const existing = await db.select({ key: userTypes.key }).from(userTypes).limit(1);
    if (!existing.length) {
      await db
        .insert(userTypes)
        .values(DEFAULT_USER_TYPES.map((t, i) => ({ ...t, sortOrder: i })))
        .onConflictDoNothing();
      console.log(`[migrate] created ${DEFAULT_USER_TYPES.length} default user types`);
    }
    console.log(`[migrate] up to date in ${Date.now() - started}ms`);
  } finally {
    await pool.end();
  }
}

main().catch((err: Error) => {
  console.error("[migrate] FAILED:", err.stack ?? err.message);
  process.exit(1);
});
