import { getTableColumns, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { mediaOutlets, organizations, requestPublications, requests } from "@/lib/db/schema";
import { guessAuthorityType, guessOutlet } from "./classify";
import { normalizeRow, type LabelRow, type Publication } from "./normalize";

const CHUNK = 300;

/** camelCase schema key → SQL column name, for the columns an import may set. */
const COLUMNS: Record<string, string> = Object.fromEntries(Object.entries(getTableColumns(requests)).map(([k, c]) => [k, c.name]));

interface Pending {
  values: Record<string, unknown>;
  publications: Publication[] | null;
  fields: LabelRow;
}

export interface StoreResult {
  rows: number;
  inserted: number;
  updated: number;
  publications: number;
  skipped: number;
}

/**
 * Upserts requests by case number. Each row sets only the columns its source
 * carries; `fields` is merged, so importing the full export and then the media
 * report leaves one complete request.
 */
export async function storeRows(rows: LabelRow[], source: "csv" | "salesforce"): Promise<StoreResult> {
  const db = getDb();
  const normalized = new Map<string, Pending>();
  let skipped = 0;
  for (const row of rows) {
    const n = normalizeRow(row);
    if (!n) {
      skipped++;
      continue;
    }
    // A case listed twice in one file: the later row wins, as in the file.
    normalized.set(n.caseNumber, { values: n.values, publications: n.publications, fields: row });
  }

  const caseNumbers = [...normalized.keys()];
  const existing = new Set<string>();
  for (let i = 0; i < caseNumbers.length; i += CHUNK) {
    const found = await db.select({ c: requests.caseNumber }).from(requests).where(inArray(requests.caseNumber, caseNumbers.slice(i, i + CHUNK)));
    for (const f of found) existing.add(f.c);
  }

  // Rows from one export share a column set; group so each statement updates exactly those columns.
  const groups = new Map<string, [string, Pending][]>();
  for (const entry of normalized) {
    const key = Object.keys(entry[1].values).sort().join("|");
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  for (const group of groups.values()) {
    const keys = Object.keys(group[0]![1].values);
    const set: Record<string, unknown> = {
      source: sql`excluded.source`,
      importedAt: sql`now()`,
      fields: sql`${requests.fields} || excluded.fields`,
    };
    for (const k of keys) set[k] = sql.raw(`excluded."${COLUMNS[k]}"`);
    for (let i = 0; i < group.length; i += CHUNK) {
      await db
        .insert(requests)
        .values(group.slice(i, i + CHUNK).map(([caseNumber, r]) => ({ caseNumber, source, fields: r.fields, ...r.values })))
        .onConflictDoUpdate({ target: requests.caseNumber, set });
    }
  }

  let publications = 0;
  const withPublications = [...normalized].filter(([, r]) => r.publications !== null);
  for (let i = 0; i < withPublications.length; i += CHUNK) {
    const slice = withPublications.slice(i, i + CHUNK);
    await db.transaction(async (tx) => {
      await tx.delete(requestPublications).where(inArray(requestPublications.caseNumber, slice.map(([c]) => c)));
      const values = slice.flatMap(([caseNumber, r]) => r.publications!.map((p) => ({ caseNumber, ...p })));
      if (values.length) await tx.insert(requestPublications).values(values);
      publications += values.length;
    });
  }

  await refreshLookups();
  return { rows: rows.length, inserted: caseNumbers.length - existing.size, updated: existing.size, publications, skipped };
}

/** Adds organizations and outlet domains seen for the first time, with a guessed type. */
export async function refreshLookups(): Promise<void> {
  const db = getDb();
  const orgs = await db.execute<{ name: string }>(
    sql`select distinct r.organization as name from requests r left join organizations o on o.name = r.organization where r.organization is not null and o.name is null`,
  );
  if (orgs.rows.length) {
    await db
      .insert(organizations)
      .values(orgs.rows.map((o) => ({ name: o.name, authorityType: guessAuthorityType(o.name) })))
      .onConflictDoNothing();
  }
  const domains = await db.execute<{ domain: string }>(
    sql`select distinct p.domain from request_publications p left join media_outlets m on m.domain = p.domain where p.domain is not null and m.domain is null`,
  );
  if (domains.rows.length) {
    await db
      .insert(mediaOutlets)
      .values(domains.rows.map((d) => ({ domain: d.domain, ...guessOutlet(d.domain) })))
      .onConflictDoNothing();
  }
}
