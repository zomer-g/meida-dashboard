import { createHash } from "node:crypto";
import { and, eq, getTableColumns, inArray, like, ne, sql } from "drizzle-orm";
import { connectDirect, getDb } from "@/lib/db/client";
import { requests, syncRuns, syncState } from "@/lib/db/schema";
import { requestsFromSalesforce } from "@/lib/foi/from-salesforce";
import { sf, SalesforceError } from "./client";
import { SYNC_OBJECTS, toDate, type SfRecord, type SyncObjectDef } from "./sync-objects";
import type { SfDescribe } from "./types";

/**
 * Mirrors Salesforce into Postgres, read-only on the Salesforce side.
 *
 *   incremental  records whose cursor field moved since the last run (the first
 *                run has no cursor, so it is a full load), plus recycle-bin deletions
 *   full         everything again, ignoring the cursor
 *   reconcile    compares ids and removes rows Salesforce no longer has — records
 *                purged from the recycle bin never show up as deletions
 *
 * Pages stream straight into upserts, so memory stays flat however large an
 * object is. Upserts are idempotent, which is what makes the cursor overlap safe.
 */

export type SyncMode = "incremental" | "full" | "reconcile";

export interface ObjectResult {
  object: string;
  upserted: number;
  deleted: number;
  skipped?: string;
  error?: string;
  ms: number;
}

// Re-read a little before the cursor: a record saved in the same second as the
// last one seen, but committed after that query ran, would otherwise be missed.
const CURSOR_OVERLAP_MS = 2 * 60_000;
const UPSERT_CHUNK = 500;
const ADVISORY_LOCK_KEY = 724_150_001;
const UNSUPPORTED_TYPES = new Set(["base64", "address", "location"]);

function soqlDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function selectFields(describe: SfDescribe, def: SyncObjectDef): string[] {
  const available = describe.fields.filter((f) => !UNSUPPORTED_TYPES.has(f.type)).map((f) => f.name);
  let fields = def.include ? def.include.filter((f) => available.includes(f)) : available;
  if (def.exclude) fields = fields.filter((f) => !def.exclude!.includes(f));
  for (const required of ["Id", def.cursorField]) if (!fields.includes(required)) fields.unshift(required);
  if (def.lookupNames) {
    for (const f of describe.fields) {
      if (f.type !== "reference" || !f.relationshipName || !fields.includes(f.name)) continue;
      // Polymorphic lookups (Owner → User/Group) qualify only when every target has a Name.
      if (f.referenceTo.length && f.referenceTo.every((o) => def.lookupNames!.includes(o) || o.endsWith("__c"))) {
        fields.push(`${f.relationshipName}.Name`);
      }
    }
  }
  return [...new Set(fields)];
}

function withoutAttributes(record: SfRecord): SfRecord {
  const { attributes: _attributes, ...rest } = record;
  return rest;
}

async function upsert(def: SyncObjectDef, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const columns = getTableColumns(def.table);
  const set = Object.fromEntries(
    (Object.entries(columns) as [string, { name: string }][])
      .filter(([key]) => key !== "id")
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  );
  const db = getDb();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await db
      .insert(def.table)
      .values(rows.slice(i, i + UPSERT_CHUNK))
      .onConflictDoUpdate({ target: columns.id!, set });
  }
}

async function saveState(object: string, values: Partial<typeof syncState.$inferInsert>): Promise<void> {
  await getDb()
    .insert(syncState)
    .values({ object, ...values })
    .onConflictDoUpdate({ target: syncState.object, set: values });
}

async function reconcile(def: SyncObjectDef): Promise<number> {
  const remote = new Set<string>();
  for await (const page of sf.queryPages<{ Id: string }>(`SELECT Id FROM ${def.name}${def.where ? ` WHERE ${def.where}` : ""}`)) {
    for (const r of page) remote.add(r.Id);
  }
  const db = getDb();
  const idColumn = getTableColumns(def.table).id!;
  const local = (await db.select({ id: idColumn }).from(def.table)) as { id: string }[];
  // An empty answer against a populated table is far likelier a permission
  // change than every record vanishing; refuse rather than wipe the mirror.
  if (remote.size === 0 && local.length > 0) {
    throw new Error(`reconcile saw no ${def.name} ids but the mirror holds ${local.length}; refusing to purge`);
  }
  const stale = local.map((r) => r.id).filter((id) => !remote.has(id));
  for (let i = 0; i < stale.length; i += UPSERT_CHUNK) {
    await db.delete(def.table).where(inArray(idColumn, stale.slice(i, i + UPSERT_CHUNK)));
  }
  return stale.length;
}

async function syncObject(def: SyncObjectDef, mode: SyncMode, trigger: string): Promise<ObjectResult> {
  const db = getDb();
  const started = Date.now();
  const [run] = await db.insert(syncRuns).values({ object: def.name, mode, trigger }).returning({ id: syncRuns.id });
  const finish = async (result: Omit<ObjectResult, "object" | "ms">): Promise<ObjectResult> => {
    await db
      .update(syncRuns)
      .set({
        finishedAt: new Date(),
        upserted: result.upserted,
        deleted: result.deleted,
        apiUsage: sf.lastLimitInfo(),
        error: result.error ?? result.skipped ?? null,
      })
      .where(eq(syncRuns.id, run!.id));
    return { object: def.name, ms: Date.now() - started, ...result };
  };

  await saveState(def.name, { lastStartedAt: new Date() });

  try {
    let describe: SfDescribe;
    try {
      describe = await sf.describe(def.name);
    } catch (err) {
      if (def.optional && err instanceof SalesforceError && err.status === 404) {
        const skipped = "not visible to the integration user";
        await saveState(def.name, { lastError: skipped });
        return finish({ upserted: 0, deleted: 0, skipped });
      }
      throw err;
    }
    if (def.onDescribe) await def.onDescribe(describe);

    if (mode === "reconcile") {
      const deleted = def.reconcile ? await reconcile(def) : 0;
      return finish({ upserted: 0, deleted });
    }

    const [state] = await db.select().from(syncState).where(eq(syncState.object, def.name));
    const selected = selectFields(describe, def);
    // The field set's fingerprint lives in its own sync_state row: "Case (fields a1b2c3d4)".
    const versionKey = def.reloadOnFieldChange ? `${def.name} (fields ${createHash("sha1").update([...selected].sort().join(",")).digest("hex").slice(0, 8)})` : null;
    const [version] = versionKey ? await db.select().from(syncState).where(eq(syncState.object, versionKey)) : [];
    const reload = Boolean(versionKey && state?.cursor && !version?.lastSuccessAt);
    if (reload) console.log(`[sync] ${def.name}: the visible fields changed (${selected.length} now); full reload`);
    const since = mode === "full" || reload || !state?.cursor ? null : new Date(state.cursor.getTime() - CURSOR_OVERLAP_MS);
    const conditions = [def.where, since ? `${def.cursorField} > ${soqlDateTime(since)}` : null].filter(Boolean);
    const soql =
      `SELECT ${selected.join(", ")} FROM ${def.name}` +
      (conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "") +
      ` ORDER BY ${def.cursorField} ASC`;

    let cursor = state?.cursor ?? null;
    let upserted = 0;
    for await (const page of sf.queryPages<SfRecord>(soql)) {
      await upsert(def, page.map((r) => def.toRow(withoutAttributes(r))));
      upserted += page.length;
      const last = toDate(page.at(-1)?.[def.cursorField]);
      if (last && (!cursor || last > cursor)) cursor = last;
    }

    let deleted = 0;
    if (def.hasIsDeleted && since) {
      const gone = await sf.query<{ Id: string }>(
        `SELECT Id FROM ${def.name} WHERE IsDeleted = true AND SystemModstamp > ${soqlDateTime(since)}` +
          (def.where ? ` AND ${def.where}` : ""),
        { includeDeleted: true },
      );
      const idColumn = getTableColumns(def.table).id!;
      for (let i = 0; i < gone.length; i += UPSERT_CHUNK) {
        await db
          .update(def.table)
          .set({ isDeleted: true })
          .where(inArray(idColumn, gone.slice(i, i + UPSERT_CHUNK).map((g) => g.Id)));
      }
      deleted = gone.length;
    }

    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(def.table)) as [{ n: number }];
    await saveState(def.name, { cursor, lastSuccessAt: new Date(), lastError: null, rowCount: n });
    if (versionKey) {
      await db.delete(syncState).where(and(like(syncState.object, `${def.name} (%`), ne(syncState.object, versionKey)));
      await saveState(versionKey, { lastSuccessAt: new Date(), rowCount: n });
    }
    return finish({ upserted, deleted });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[sync] ${def.name} ${mode} failed: ${error}`);
    await saveState(def.name, { lastError: error.slice(0, 2000) });
    return finish({ upserted: 0, deleted: 0, error });
  }
}

export interface SyncSummary {
  locked: boolean;
  mode: SyncMode;
  results: ObjectResult[];
  ms: number;
}

/** Runs every object in order. A second concurrent run returns `locked: true` and does nothing. */
export async function runSync(mode: SyncMode, trigger: string): Promise<SyncSummary> {
  const started = Date.now();
  // The lock is session-scoped and the sync spans many transactions, so it needs a connection
  // of its own to the server, not a pooled one. The sync's queries still use the pool.
  const client = await connectDirect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [ADVISORY_LOCK_KEY]);
    if (!rows[0]?.ok) return { locked: true, mode, results: [], ms: 0 };
    try {
      const results: ObjectResult[] = [];
      for (const def of SYNC_OBJECTS) {
        const result = await syncObject(def, mode, trigger);
        results.push(result);
        const note = result.error ? ` ERROR ${result.error}` : result.skipped ? ` skipped (${result.skipped})` : "";
        console.log(`[sync] ${mode} ${def.name}: +${result.upserted} -${result.deleted} in ${result.ms}ms${note}`);
      }
      // Mirror → the requests every page reads. A full rebuild: cheap at the Movement's volume, and it picks up label changes.
      if (results.some((r) => r.object === "Case" && !r.error && !r.skipped)) {
        const started = Date.now();
        try {
          const { upserted, removed } = await requestsFromSalesforce();
          console.log(`[sync] requests from Salesforce: ${upserted} rows, ${removed} removed in ${Date.now() - started}ms`);
          // Real data replaces the static CSV snapshot the dashboard started with (SF_REPLACE_CSV=false keeps both).
          if (upserted > 0 && process.env.SF_REPLACE_CSV !== "false") {
            const dropped = await getDb().delete(requests).where(eq(requests.source, "csv")).returning({ c: requests.caseNumber });
            if (dropped.length) console.log(`[sync] removed ${dropped.length} requests that came only from CSV uploads`);
          }
        } catch (err) {
          console.error(`[sync] requests from Salesforce failed: ${(err as Error).message}`);
          results.push({ object: "requests", upserted: 0, deleted: 0, error: (err as Error).message, ms: Date.now() - started });
        }
      }
      if (mode === "reconcile") {
        // History rows of Cases that no longer exist.
        await getDb().execute(
          sql`DELETE FROM sf_case_history h WHERE EXISTS (SELECT 1 FROM sf_case) AND NOT EXISTS (SELECT 1 FROM sf_case c WHERE c.id = h.case_id)`,
        );
      }
      return { locked: false, mode, results, ms: Date.now() - started };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}
