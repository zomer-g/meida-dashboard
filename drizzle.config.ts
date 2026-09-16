import { defineConfig } from "drizzle-kit";

// `generate` needs no database; the URL only matters for `drizzle-kit studio`/`push`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://127.0.0.1:5434/postgres" },
});
