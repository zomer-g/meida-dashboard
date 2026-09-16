import { sql, type SQL } from "drizzle-orm";
import { addDays, israelDay } from "@/lib/dashboard/params";
import { FILTER_KEYS, RANGES, type FilterKey, type RangeKey } from "./filter-keys";

/**
 * Dashboard filters live in the URL, so a view can be shared and bookmarked.
 * Dates are inclusive Israel days. `range` is a preset; `custom` reads from/to.
 */

export { FILTER_KEYS, RANGES, type FilterKey, type RangeKey } from "./filter-keys";

export interface Filters {
  range: RangeKey;
  from: string | null;
  to: string | null;
  values: Partial<Record<FilterKey, string>>;
  q: string;
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(search: SearchParams, now = new Date()): Filters {
  const requested = first(search.range);
  const range: RangeKey = RANGES.some((r) => r.key === requested) ? (requested as RangeKey) : "all";
  const today = israelDay(now);
  const year = Number(today.slice(0, 4));
  let from: string | null = null;
  let to: string | null = null;
  if (range === "12m") from = addDays(today, -364);
  if (range === "ytd") from = `${year}-01-01`;
  if (range === "last-year") [from, to] = [`${year - 1}-01-01`, `${year - 1}-12-31`];
  if (range === "custom") {
    const f = first(search.from);
    const t = first(search.to);
    from = f && DAY_RE.test(f) ? f : null;
    to = t && DAY_RE.test(t) ? t : null;
    if (from && to && from > to) [from, to] = [to, from];
  }
  const values: Filters["values"] = {};
  for (const key of Object.keys(FILTER_KEYS) as FilterKey[]) {
    const v = first(search[key])?.trim();
    if (v) values[key] = v.slice(0, 200);
  }
  return { range, from, to, values, q: (first(search.q) ?? "").trim().slice(0, 100) };
}

/** The query string that reproduces these filters, for links between pages. */
export function filtersQuery(f: Filters, drop: string[] = []): string {
  const q = new URLSearchParams();
  if (f.range !== "all") q.set("range", f.range);
  if (f.range === "custom") {
    if (f.from) q.set("from", f.from);
    if (f.to) q.set("to", f.to);
  }
  for (const [k, v] of Object.entries(f.values)) if (v && !drop.includes(k)) q.set(k, v);
  if (f.q && !drop.includes("q")) q.set("q", f.q);
  return q.toString();
}

/** The path written to the activity log. */
export function viewPath(base: string, f: Filters): string {
  const q = filtersQuery(f);
  return q ? `${base}?${q}` : base;
}

/**
 * SQL conditions over the request view `r` (see metrics.ts). `dateColumn` is the
 * column the range applies to: submitted_on for requests, published_on for media.
 */
export function whereClause(f: Filters, dateColumn: SQL, extra: SQL[] = []): SQL {
  const parts: SQL[] = [...extra];
  if (f.from) parts.push(sql`${dateColumn} >= ${f.from}`);
  if (f.to) parts.push(sql`${dateColumn} <= ${f.to}`);
  const v = f.values;
  if (v.org) parts.push(sql`r.organization = ${v.org}`);
  if (v.type) parts.push(sql`r.authority_type = ${v.type}`);
  if (v.topic) parts.push(sql`coalesce(r.topic, 'לא סווג') = ${v.topic}`);
  if (v.owner) parts.push(sql`r.owner = ${v.owner}`);
  if (v.project) parts.push(sql`${v.project} = any(r.projects)`);
  if (v.status) parts.push(sql`r.status = ${v.status}`);
  if (v.entity) parts.push(sql`r.entity_kind = ${v.entity}`);
  if (v.petition === "yes") parts.push(sql`(r.petition_filed_on is not null or r.court_case_number is not null)`);
  if (v.petition === "no") parts.push(sql`(r.petition_filed_on is null and r.court_case_number is null)`);
  if (v.outlet) parts.push(sql`p.outlet = ${v.outlet}`);
  if (v.category) parts.push(sql`p.category = ${v.category}`);
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    parts.push(sql`(r.name ilike ${like} or r.description ilike ${like} or r.case_number = ${f.q} or r.organization ilike ${like})`);
  }
  return parts.length ? sql`where ${sql.join(parts, sql` and `)}` : sql``;
}
