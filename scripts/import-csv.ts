/**
 * Imports Salesforce report exports (CSV) from the command line — the same code
 * as the upload screen at /admin/data.
 *
 *   npm run import:csv -- "path/to/DATA.csv" "path/to/media report.csv"
 *
 * On boot, launch.sh runs it for the files in seed/ when the requests table is
 * empty (SEED_ON_EMPTY=true), so a fresh deployment has something to show.
 */
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb, getPool } from "../src/lib/db/client";
import { importCsvText } from "../src/lib/foi/import";

async function main() {
  const args = process.argv.slice(2);
  const onlyIfEmpty = args.includes("--if-empty");
  const files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) throw new Error("usage: npm run import:csv -- <file.csv> [more.csv] [--if-empty]");

  if (onlyIfEmpty) {
    const res = await getDb().execute<{ n: number }>(sql`select count(*)::int as n from requests`);
    if (Number(res.rows[0]?.n ?? 0) > 0) {
      console.log("[import-csv] requests already present; seed skipped");
      return;
    }
  }

  for (const file of files) {
    const started = Date.now();
    const result = await importCsvText(await readFile(file, "utf8"));
    console.log(
      `[import-csv] ${file}: ${result.kind}, ${result.rows} rows, ${result.inserted} new, ${result.updated} updated, ${result.publications} publications, ${result.skipped} skipped (${Date.now() - started}ms)`,
    );
  }
}

main()
  .catch((err: Error) => {
    console.error("[import-csv] FAILED:", err.stack ?? err.message);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
