import { mapCaseFields, type FieldMapping } from "@/lib/foi/from-salesforce";
import { sf, SalesforceError } from "./client";
import type { SfChildRelationship, SfDescribe, SfField, SfRecordTypeInfo } from "./types";

/**
 * Discovers how the Movement's org is shaped before the dashboard reads it: Case
 * record types, every Case field with its label, which of the dashboard's fields
 * (the columns of the report exports) were found by label, and which fields
 * CaseHistory tracks.
 *
 * Reads metadata and counts; it writes nothing.
 */

export const DEFAULT_OBJECTS = ["Case"];


export interface FieldSummary {
  name: string;
  label: string;
  type: string;
  custom: boolean;
  referenceTo: string[];
  picklist: string[];
  formula: boolean;
}

export interface ObjectReport {
  name: string;
  label: string;
  recordCount: number | null;
  recordTypes: SfRecordTypeInfo[];
  fields: FieldSummary[];
  childRelationships: SfChildRelationship[];
}

export interface RecordTypeCount {
  developerName: string | null;
  name: string | null;
  count: number;
}

export interface SchemaReport {
  generatedAt: string;
  apiVersion: string;
  instanceUrl: string;
  apiUsage: { max: number; remaining: number } | null;
  customObjects: { name: string; label: string }[];
  objects: ObjectReport[];
  caseRecordTypeCounts: RecordTypeCount[] | { error: string };
  caseHistoryFields: { field: string; count: number }[] | { error: string };
  /** The dashboard's fields and the Case field each label resolved to. */
  fieldMapping: FieldMapping[];
}

function summarize(field: SfField): FieldSummary {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    custom: field.custom,
    referenceTo: field.referenceTo,
    picklist: field.picklistValues.filter((p) => p.active).map((p) => p.value),
    formula: field.calculated,
  };
}

async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof SalesforceError ? err.message : String(err) };
  }
}

export async function buildSchemaReport(objectNames: string[] = DEFAULT_OBJECTS): Promise<SchemaReport> {
  const [global, limits, instanceUrl] = await Promise.all([sf.describeGlobal(), sf.limits().catch(() => null), sf.instanceUrl()]);

  const describes: SfDescribe[] = [];
  for (const name of objectNames) describes.push(await sf.describe(name));

  const objects: ObjectReport[] = [];
  for (const d of describes) {
    const recordCount = d.queryable ? await sf.count(`SELECT COUNT() FROM ${d.name}`).catch(() => null) : null;
    objects.push({
      name: d.name,
      label: d.label,
      recordCount,
      recordTypes: d.recordTypeInfos.filter((rt) => !rt.master),
      fields: d.fields.map(summarize),
      childRelationships: d.childRelationships.filter((c) => c.relationshipName),
    });
  }

  const caseDescribe = describes.find((d) => d.name === "Case") ?? (await sf.describe("Case"));
  const hasRecordTypes = caseDescribe.fields.some((f) => f.name === "RecordTypeId");

  const caseRecordTypeCounts = await safe(async () => {
    if (!hasRecordTypes) {
      return [{ developerName: null, name: null, count: await sf.count("SELECT COUNT() FROM Case") }];
    }
    const rows = await sf.query<{ dn: string | null; n: string | null; c: number }>(
      "SELECT RecordType.DeveloperName dn, RecordType.Name n, COUNT(Id) c FROM Case GROUP BY RecordType.DeveloperName, RecordType.Name",
    );
    return rows.map((r) => ({ developerName: r.dn, name: r.n, count: r.c })).sort((a, b) => b.count - a.count);
  });

  const caseHistoryFields = await safe(async () => {
    const rows = await sf.query<{ Field: string; c: number }>("SELECT Field, COUNT(Id) c FROM CaseHistory GROUP BY Field");
    return rows.map((r) => ({ field: r.Field, count: r.c })).sort((a, b) => b.count - a.count);
  });

  const usage = limits?.DailyApiRequests;

  return {
    generatedAt: new Date().toISOString(),
    apiVersion: sf.apiVersion(),
    instanceUrl,
    apiUsage: usage ? { max: usage.Max, remaining: usage.Remaining } : null,
    customObjects: global.sobjects
      .filter((o) => o.custom && o.queryable && o.name.endsWith("__c"))
      .map((o) => ({ name: o.name, label: o.label })),
    objects,
    caseRecordTypeCounts,
    caseHistoryFields,
    fieldMapping: mapCaseFields(caseDescribe),
  };
}

export function reportToMarkdown(report: SchemaReport): string {
  const out: string[] = [];
  const isError = (v: unknown): v is { error: string } => typeof v === "object" && v !== null && "error" in v;
  const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");

  out.push("# Salesforce schema report", "");
  out.push(`- Generated: ${report.generatedAt}`);
  out.push(`- Instance: ${report.instanceUrl} (API v${report.apiVersion})`);
  if (report.apiUsage) {
    out.push(`- Daily API requests: ${report.apiUsage.max - report.apiUsage.remaining} used of ${report.apiUsage.max}`);
  }
  out.push("");

  out.push("## Case record types", "");
  if (isError(report.caseRecordTypeCounts)) out.push(`> ${report.caseRecordTypeCounts.error}`);
  else {
    out.push("| DeveloperName | Name | Cases |", "|---|---|---|");
    for (const r of report.caseRecordTypeCounts) out.push(`| ${r.developerName ?? "(none)"} | ${cell(r.name ?? "")} | ${r.count} |`);
  }
  out.push("");

  out.push("## Dashboard fields found on Case", "");
  out.push("| Dashboard field | Expected labels | Case field |", "|---|---|---|");
  for (const m of report.fieldMapping ?? []) {
    out.push(`| ${m.key} | ${cell(m.labels.join(" / "))} | ${m.apiName ? `\`${m.apiName}\`` : "**not found**"} |`);
  }
  out.push("");

  out.push("## Fields tracked in CaseHistory", "");
  if (isError(report.caseHistoryFields)) out.push(`> ${report.caseHistoryFields.error}`);
  else {
    out.push("| Field | History rows |", "|---|---|");
    for (const h of report.caseHistoryFields) out.push(`| ${h.field} | ${h.count} |`);
  }
  out.push("");

  out.push("## Custom objects", "");
  out.push(report.customObjects.length ? report.customObjects.map((o) => `- \`${o.name}\` — ${o.label}`).join("\n") : "None.");
  out.push("");

  for (const o of report.objects) {
    out.push(`## ${o.name} (${o.label}) — ${o.recordCount ?? "?"} records`, "");
    if (o.recordTypes.length) {
      out.push("**Record types:** " + o.recordTypes.map((rt) => `\`${rt.developerName}\` (${rt.name}${rt.active ? "" : ", inactive"})`).join(", "), "");
    }
    const lookups = o.fields.filter((f) => f.referenceTo.length);
    if (lookups.length) {
      out.push("**Lookups:** " + lookups.map((f) => `\`${f.name}\` → ${f.referenceTo.join("/")}`).join(", "), "");
    }
    out.push("| Field | Label | Type | Custom | Picklist values |", "|---|---|---|---|---|");
    for (const f of o.fields) {
      const type = f.formula ? `${f.type} (formula)` : f.type;
      const picklist = f.picklist.length > 12 ? `${f.picklist.slice(0, 12).join(", ")} … (+${f.picklist.length - 12})` : f.picklist.join(", ");
      out.push(`| ${f.name} | ${cell(f.label)} | ${type} | ${f.custom ? "✓" : ""} | ${cell(picklist)} |`);
    }
    out.push("");
    if (o.childRelationships.length) {
      out.push(
        "**Child relationships:** " + o.childRelationships.map((c) => `${c.relationshipName} (${c.childSObject}.${c.field})`).join(", "),
        "",
      );
    }
  }

  return out.join("\n");
}
