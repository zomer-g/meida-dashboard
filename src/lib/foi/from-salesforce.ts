import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requests, sfCase, sfFieldLabels, sfUser } from "@/lib/db/schema";
import { sf } from "@/lib/sf/client";
import type { SfDescribe } from "@/lib/sf/types";
import { LABELS, LEGAL_WARNINGS, ORDINALS, REFUSAL_GROUNDS, REMINDERS, type LabelRow } from "./normalize";
import { storeRows } from "./store";

/**
 * Salesforce mirror → requests. The report exports the dashboard started from are
 * keyed by field *labels*, so the mirror is read the same way: each Case field's
 * label (captured by the sync into sf_field_labels) becomes the row key, and the
 * very same normalizer turns it into a request. No API names are hard-coded for
 * custom fields; if an admin renames a field's label in Salesforce, add the new
 * label to LABELS in normalize.ts.
 *
 * Standard fields are keyed by API name, since their labels depend on the org's language.
 */

const norm = (label: string) => label.replace(/[״”“]/g, '"').replace(/\s+/g, " ").trim();

/** Every label the dashboard reads, with its field key for the schema report. */
function expectedLabels(): { key: string; labels: string[] }[] {
  const out: { key: string; labels: string[] }[] = Object.entries(LABELS).map(([key, labels]) => ({ key, labels: [...labels] }));
  REMINDERS.forEach((l, i) => out.push({ key: `reminder${i + 1}`, labels: [l] }));
  LEGAL_WARNINGS.forEach((l, i) => out.push({ key: `legalWarning${i + 1}`, labels: [l] }));
  REFUSAL_GROUNDS.forEach((l) => out.push({ key: `ground:${l}`, labels: [l] }));
  ORDINALS.forEach((o, i) => {
    out.push({ key: `publishedOn${i + 1}`, labels: [`תאריך פרסום ${o}`] });
    out.push({ key: `link${i + 1}`, labels: [`קישור פרסומי ${i + 1}`] });
  });
  return out;
}

const STANDARD: Record<string, string> = {
  caseNumber: "CaseNumber",
  status: "Status",
  description: "Description",
  owner: "OwnerId",
  sfId: "Id",
};

export interface FieldMapping {
  key: string;
  labels: string[];
  apiName: string | null;
}

/** Which Case field each dashboard field resolves to — for the schema report on /admin/salesforce. */
export function mapCaseFields(describe: Pick<SfDescribe, "fields">): FieldMapping[] {
  const byLabel = new Map(describe.fields.map((f) => [norm(f.label), f.name]));
  return expectedLabels().map(({ key, labels }) => ({
    key,
    labels,
    apiName: STANDARD[key] ?? labels.map((l) => byLabel.get(norm(l))).find(Boolean) ?? null,
  }));
}

/** Captured on every Case sync, so the mapping follows label changes without a describe per render. */
export async function saveCaseLabels(describe: SfDescribe): Promise<void> {
  const mapping = mapCaseFields(describe);
  const missing = mapping.filter((m) => !m.apiName).map((m) => m.key);
  console.log(`[sync] Case field mapping: ${mapping.length - missing.length}/${mapping.length} dashboard fields found${missing.length ? `; not found: ${missing.join(", ")}` : ""}`);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(sfFieldLabels).where(eq(sfFieldLabels.sobject, "Case"));
    const rows = describe.fields.map((f) => ({ sobject: "Case", name: f.name, label: f.label, type: f.type }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(sfFieldLabels).values(rows.slice(i, i + 500));
  });
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const BATCH = 1000;

/**
 * Rebuilds requests from every mirrored Case. Cheap enough to run after each
 * incremental sync (a few thousand rows); `since` limits it to recently synced Cases.
 */
export async function requestsFromSalesforce(since?: Date): Promise<{ upserted: number; removed: number }> {
  const db = getDb();
  const labels = await db.select().from(sfFieldLabels).where(eq(sfFieldLabels.sobject, "Case"));
  if (!labels.length) throw new Error("no Case field labels yet — run a Salesforce sync first");
  const labelOf = new Map(labels.map((l) => [l.name, norm(l.label)]));
  const owners = new Map((await db.select({ id: sfUser.id, name: sfUser.name }).from(sfUser)).map((u) => [u.id, u.name ?? ""]));
  const instanceUrl = await sf.instanceUrl().catch(() => null);

  let upserted = 0;
  let lastId = "";
  for (;;) {
    const page = await db
      .select({ id: sfCase.id, data: sfCase.data })
      .from(sfCase)
      .where(and(eq(sfCase.isDeleted, false), gt(sfCase.id, lastId), since ? gt(sfCase.syncedAt, since) : undefined))
      .orderBy(asc(sfCase.id))
      .limit(BATCH);
    if (!page.length) break;
    lastId = page.at(-1)!.id;

    const rows: LabelRow[] = page.map(({ id, data }) => {
      const record = data as Record<string, unknown>;
      const row: LabelRow = {};
      for (const [api, value] of Object.entries(record)) {
        const label = labelOf.get(api);
        if (label) row[label] = asText(value);
      }
      row["Case Number"] = asText(record.CaseNumber);
      row["__sf_id"] = id;
      if ("Status" in record) row["Status"] = asText(record.Status);
      if ("Description" in record) row["Description"] = asText(record.Description);
      if (typeof record.OwnerId === "string") row["Case Owner"] = owners.get(record.OwnerId) ?? "";
      if (instanceUrl && !row["URL TO MAIL"]) row["URL TO MAIL"] = `${instanceUrl}/${id}`;
      return row;
    });
    upserted += (await storeRows(rows, "salesforce")).rows;
  }

  // Cases deleted in Salesforce leave the dashboard too.
  const gone = await db.execute<{ case_number: string }>(
    sql`select r.case_number from requests r join sf_case c on c.id = r.sf_id where c.is_deleted`,
  );
  const numbers = gone.rows.map((g) => g.case_number);
  if (numbers.length) await db.delete(requests).where(inArray(requests.caseNumber, numbers));
  return { upserted, removed: numbers.length };
}
