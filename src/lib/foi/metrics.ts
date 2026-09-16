import { sql, type SQL } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { whereClause, type Filters } from "./filters";
export { BUCKETS, COMPLETENESS, FORMATS, TIMELINESS, requestKpis, type Dim, type GroupScore, type MediaDim, type RequestKpis } from "./views";

import {
  BUCKETS,
  COMPLETENESS,
  DIMS,
  FORMATS,
  MEDIA_DIMS,
  MEDIA_VIEW,
  REQUEST_VIEW,
  TIMELINESS,
  key,
  rows,
  type Dim,
  type GroupScore,
  type MediaDim,
} from "./views";

const submitted = sql`r.submitted_on`;

/** `count(*) filter (where <column> = '<value>')` for each listed value, aliased c0, c1, … */
function countsOf(column: SQL, values: readonly string[], prefix: string): SQL {
  return sql.join(
    values.map((v, i) => sql`count(*) filter (where ${column} = ${v})::int as ${sql.raw(`${prefix}${i}`)}`),
    sql`, `,
  );
}

function pickCounts(row: Record<string, unknown>, values: readonly string[], prefix: string): Record<string, number> {
  return Object.fromEntries(values.map((v, i) => [v, Number(row[`${prefix}${i}`] ?? 0)]));
}

function mean(counts: Record<string, number>, weights: Record<string, number>): number | null {
  let total = 0;
  let weighted = 0;
  for (const [k, w] of Object.entries(weights)) {
    total += counts[k] ?? 0;
    weighted += (counts[k] ?? 0) * w;
  }
  return total ? weighted / total : null;
}

const COMPLETENESS_WEIGHTS = { "התייחסו להכל": 3, "התייחסו באופן חלקי": 2, "קטסטרופה": 1 };
const FORMAT_WEIGHTS = { "קובץ אקסל או טבלה סבירה": 3, "מענה שניתן לעבד אך לא מסודר": 1.5, "אשכרה הדפיסו טבלה וסרקו אותה": 0 };

/** Per organization / authority type / topic / year: everything the rankings and stacked bars need, in one pass. */
export function groupScores(f: Filters, dim: Dim, limit = 20, minRequests = 1): Promise<GroupScore[]> {
  return cached(key("groupScores", f, dim, limit, minRequests), async () => {
    const data = await rows<Record<string, unknown>>(sql`${REQUEST_VIEW}
      select ${DIMS[dim]} as label,
        count(*)::int as total,
        ${countsOf(sql`r.timeliness`, TIMELINESS, "t")},
        ${countsOf(sql`r.bucket`, BUCKETS, "b")},
        ${countsOf(sql`r.completeness`, COMPLETENESS, "c")},
        ${countsOf(sql`r.response_format`, FORMATS, "f")},
        avg(r.lifecycle_days)::float as avg_lifecycle,
        avg(greatest(r.lifecycle_days - r.allowed_days, 0)) filter (where r.timeliness in ('נענה בחריגה', 'בקשה פתוחה'))::float as avg_overdue
      from r ${whereClause(f, submitted, [sql`r.timeliness <> 'טרם הוגשה'`, ...(dim === "organization" ? [sql`r.organization is not null`] : [])])}
      group by 1
      having count(*) >= ${minRequests}
      order by 2 desc
      limit ${limit}`);
    return data.map((row) => {
      const t = pickCounts(row, TIMELINESS, "t");
      const completeness = pickCounts(row, COMPLETENESS, "c");
      const formats = pickCounts(row, FORMATS, "f");
      const answered = t["נענה במועד"]! + t["נענה בחריגה"]!;
      return {
        label: String(row.label),
        total: Number(row.total),
        onTime: t["נענה במועד"]!,
        late: t["נענה בחריגה"]!,
        open: t["בקשה פתוחה"]!,
        closedWithoutResponse: t["נסגרה ללא מענה מלא"]!,
        onTimeRate: answered ? t["נענה במועד"]! / answered : null,
        avgLifecycle: row.avg_lifecycle == null ? null : Number(row.avg_lifecycle),
        avgOverdue: row.avg_overdue == null ? null : Number(row.avg_overdue),
        buckets: pickCounts(row, BUCKETS, "b"),
        completeness,
        completenessScore: mean(completeness, COMPLETENESS_WEIGHTS),
        formats,
        formatScore: mean(formats, FORMAT_WEIGHTS),
      };
    });
  });
}

export interface GroundShare {
  ground: string;
  count: number;
  share: number;
}

/** How often each refusal ground was marked, out of all submitted requests in the slice. */
export function refusalGrounds(f: Filters): Promise<{ total: number; grounds: GroundShare[] }> {
  return cached(key("refusalGrounds", f), async () => {
    const [totals] = await rows<{ total: number }>(sql`${REQUEST_VIEW}
      select count(*)::int as total from r ${whereClause(f, submitted, [sql`r.timeliness <> 'טרם הוגשה'`])}`);
    const data = await rows<{ ground: string; n: number }>(sql`${REQUEST_VIEW}
      select g.ground, count(*)::int as n
      from r cross join lateral unnest(r.refusal_grounds) as g(ground)
      ${whereClause(f, submitted, [sql`r.timeliness <> 'טרם הוגשה'`])}
      group by 1 order by 2 desc`);
    const total = Number(totals?.total ?? 0);
    return {
      total,
      grounds: data.map((d) => ({ ground: String(d.ground), count: Number(d.n), share: total ? Number(d.n) / total : 0 })),
    };
  });
}

export interface MonthlyRow {
  month: string;
  label: string;
  n: number;
}

/** Requests submitted per month, split by a dimension; everything beyond the top `top` values is "אחר". */
export function monthlyRequests(f: Filters, dim: Dim, top = 5): Promise<MonthlyRow[]> {
  return cached(key("monthlyRequests", f, dim, top), async () => {
    const data = await rows<MonthlyRow>(sql`${REQUEST_VIEW}
      , s as (select r.submitted_on, ${DIMS[dim]} as label from r ${whereClause(f, submitted, [sql`r.submitted_on is not null`, sql`r.timeliness <> 'טרם הוגשה'`])}),
      t as (select label from s group by 1 order by count(*) desc limit ${top})
      select to_char(s.submitted_on, 'YYYY-MM') as month,
        case when s.label in (select label from t) then s.label else 'אחר' end as label,
        count(*)::int as n
      from s group by 1, 2 order by 1`);
    return data.map((d) => ({ month: d.month, label: d.label, n: Number(d.n) }));
  });
}

export interface CountRow {
  label: string;
  n: number;
}

export function requestCounts(f: Filters, dim: Dim, limit = 30): Promise<CountRow[]> {
  return cached(key("requestCounts", f, dim, limit), async () => {
    const data = await rows<CountRow>(sql`${REQUEST_VIEW}
      select ${DIMS[dim]} as label, count(*)::int as n from r ${whereClause(f, submitted, [sql`r.timeliness <> 'טרם הוגשה'`])}
      group by 1 order by 2 desc limit ${limit}`);
    return data.map((d) => ({ label: String(d.label), n: Number(d.n) }));
  });
}

export interface RequestRow {
  caseNumber: string;
  name: string | null;
  organization: string | null;
  authorityType: string;
  status: string | null;
  owner: string | null;
  submittedOn: string | null;
  fullResponseOn: string | null;
  lifecycleDays: number | null;
  allowedDays: number;
  timeliness: string;
  projects: string[];
  sfUrl: string | null;
  publications: number;
}

export type RequestOrder = "submitted" | "overdue";

export function requestList(
  f: Filters,
  opts: { order?: RequestOrder; limit?: number; offset?: number; onlyOverdue?: boolean } = {},
): Promise<{ rows: RequestRow[]; total: number }> {
  const { order = "submitted", limit = 50, offset = 0, onlyOverdue = false } = opts;
  return cached(key("requestList", f, order, limit, offset, onlyOverdue), async () => {
    const extra = onlyOverdue ? [sql`r.timeliness in ('נענה בחריגה', 'בקשה פתוחה')`, sql`r.lifecycle_days > r.allowed_days`] : [];
    const orderBy = order === "overdue" ? sql`(r.lifecycle_days - r.allowed_days) desc nulls last` : sql`r.submitted_on desc nulls last, r.case_number desc`;
    const data = await rows<Record<string, unknown>>(sql`${REQUEST_VIEW}
      select r.case_number, r.name, r.organization, r.authority_type, r.status, r.owner, r.submitted_on::text as submitted_on,
        r.full_response_on::text as full_response_on, r.lifecycle_days, r.allowed_days, r.timeliness, r.projects, r.sf_url,
        (select count(*) from request_publications x where x.case_number = r.case_number)::int as pubs,
        count(*) over ()::int as total_rows
      from r ${whereClause(f, submitted, extra)}
      order by ${orderBy}
      limit ${limit} offset ${offset}`);
    return {
      total: Number(data[0]?.total_rows ?? 0),
      rows: data.map((d) => ({
        caseNumber: String(d.case_number),
        name: (d.name as string) ?? null,
        organization: (d.organization as string) ?? null,
        authorityType: String(d.authority_type),
        status: (d.status as string) ?? null,
        owner: (d.owner as string) ?? null,
        submittedOn: (d.submitted_on as string) ?? null,
        fullResponseOn: (d.full_response_on as string) ?? null,
        lifecycleDays: d.lifecycle_days == null ? null : Number(d.lifecycle_days),
        allowedDays: Number(d.allowed_days),
        timeliness: String(d.timeliness),
        projects: (d.projects as string[]) ?? [],
        sfUrl: (d.sf_url as string) ?? null,
        publications: Number(d.pubs),
      })),
    };
  });
}

/* ---------------------------------------------------------------- petitions */

export interface PetitionRow {
  caseNumber: string;
  name: string | null;
  organization: string | null;
  filedOn: string | null;
  courtCaseNumber: string | null;
  procedure: string | null;
  outcome: string | null;
  judge: string | null;
  lawFirm: string | null;
  infoReceived: boolean | null;
  costsAwarded: number | null;
  costsReceived: number | null;
  feeRefunded: boolean | null;
  sfUrl: string | null;
}

export function petitions(f: Filters): Promise<PetitionRow[]> {
  return cached(key("petitions", f), async () => {
    const data = await rows<Record<string, unknown>>(sql`${REQUEST_VIEW}
      select r.case_number, r.name, r.organization, r.petition_filed_on::text as filed_on, r.court_case_number, r.petition_procedure,
        r.petition_outcome, r.judge, r.law_firm, r.info_received_after_petition, r.costs_awarded, r.costs_received, r.fee_refunded, r.sf_url
      from r ${whereClause(f, sql`coalesce(r.petition_filed_on, r.submitted_on)`, [sql`(r.petition_filed_on is not null or r.court_case_number is not null)`])}
      order by r.petition_filed_on desc nulls last`);
    return data.map((d) => ({
      caseNumber: String(d.case_number),
      name: (d.name as string) ?? null,
      organization: (d.organization as string) ?? null,
      filedOn: (d.filed_on as string) ?? null,
      courtCaseNumber: (d.court_case_number as string) ?? null,
      procedure: (d.petition_procedure as string) ?? null,
      outcome: (d.petition_outcome as string) ?? null,
      judge: (d.judge as string) ?? null,
      lawFirm: (d.law_firm as string) ?? null,
      infoReceived: (d.info_received_after_petition as boolean) ?? null,
      costsAwarded: d.costs_awarded == null ? null : Number(d.costs_awarded),
      costsReceived: d.costs_received == null ? null : Number(d.costs_received),
      feeRefunded: (d.fee_refunded as boolean) ?? null,
      sfUrl: (d.sf_url as string) ?? null,
    }));
  });
}

/* ----------------------------------------------------------------- projects */

export interface ProjectRow {
  project: string;
  total: number;
  onTime: number;
  late: number;
  open: number;
  publications: number;
  petitions: number;
}

export function projectSummary(f: Filters): Promise<ProjectRow[]> {
  return cached(key("projectSummary", f), async () => {
    const data = await rows<Record<string, unknown>>(sql`${REQUEST_VIEW}
      select pr.project,
        count(*)::int as total,
        count(*) filter (where r.timeliness = 'נענה במועד')::int as on_time,
        count(*) filter (where r.timeliness = 'נענה בחריגה')::int as late,
        count(*) filter (where r.timeliness = 'בקשה פתוחה')::int as open,
        coalesce(sum((select count(*) from request_publications x where x.case_number = r.case_number)), 0)::int as pubs,
        count(*) filter (where r.petition_filed_on is not null or r.court_case_number is not null)::int as petitions
      from r cross join lateral unnest(r.projects) as pr(project)
      ${whereClause(f, submitted, [sql`r.timeliness <> 'טרם הוגשה'`])}
      group by 1 order by 2 desc`);
    return data.map((d) => ({
      project: String(d.project),
      total: Number(d.total),
      onTime: Number(d.on_time),
      late: Number(d.late),
      open: Number(d.open),
      publications: Number(d.pubs),
      petitions: Number(d.petitions),
    }));
  });
}

/* -------------------------------------------------------------------- media */

const published = sql`p.published_on`;
const MEDIA_FROM = sql`from p join r on r.case_number = p.case_number`;

export interface MediaKpis {
  publications: number;
  requests: number;
  outlets: number;
  /** Average days from submitting a request to its first publication in the slice. */
  avgDaysSubmitToPublish: number | null;
  avgDaysResponseToPublish: number | null;
  medianDaysSubmitToPublish: number | null;
}

export function mediaKpis(f: Filters): Promise<MediaKpis> {
  return cached(key("mediaKpis", f), async () => {
    const [row] = await rows<Record<string, unknown>>(sql`${REQUEST_VIEW} ${MEDIA_VIEW}
      , s as (select p.*, r.submitted_on, r.full_response_on ${MEDIA_FROM} ${whereClause(f, published)}),
      firsts as (
        select case_number, min(published_on) as first_on, min(submitted_on) as submitted_on, min(full_response_on) as full_response_on
        from s where published_on is not null group by 1
      )
      select
        (select count(*) from s)::int as publications,
        (select count(distinct case_number) from s)::int as requests,
        (select count(distinct outlet) from s)::int as outlets,
        (select round(avg(first_on - submitted_on)) from firsts where first_on >= submitted_on)::int as avg_submit,
        (select percentile_cont(0.5) within group (order by first_on - submitted_on) from firsts where first_on >= submitted_on)::int as median_submit,
        (select round(avg(first_on - full_response_on)) from firsts where first_on >= full_response_on)::int as avg_response`);
    const num = (k: string) => (row?.[k] == null ? null : Number(row[k]));
    return {
      publications: num("publications") ?? 0,
      requests: num("requests") ?? 0,
      outlets: num("outlets") ?? 0,
      avgDaysSubmitToPublish: num("avg_submit"),
      avgDaysResponseToPublish: num("avg_response"),
      medianDaysSubmitToPublish: num("median_submit"),
    };
  });
}

export function mediaCounts(f: Filters, dim: MediaDim, limit = 50): Promise<CountRow[]> {
  return cached(key("mediaCounts", f, dim, limit), async () => {
    const data = await rows<CountRow>(sql`${REQUEST_VIEW} ${MEDIA_VIEW}
      select ${MEDIA_DIMS[dim]} as label, count(*)::int as n ${MEDIA_FROM} ${whereClause(f, published)}
      group by 1 order by 2 desc limit ${limit}`);
    return data.map((d) => ({ label: String(d.label), n: Number(d.n) }));
  });
}

export function mediaMonthly(f: Filters, dim: MediaDim, top = 6): Promise<MonthlyRow[]> {
  return cached(key("mediaMonthly", f, dim, top), async () => {
    const data = await rows<MonthlyRow>(sql`${REQUEST_VIEW} ${MEDIA_VIEW}
      , s as (select p.published_on, ${MEDIA_DIMS[dim]} as label ${MEDIA_FROM} ${whereClause(f, published, [sql`p.published_on is not null`])}),
      t as (select label from s group by 1 order by count(*) desc limit ${top})
      select to_char(published_on, 'YYYY-MM') as month,
        case when label in (select label from t) then label else 'אחר' end as label,
        count(*)::int as n
      from s group by 1, 2 order by 1`);
    return data.map((d) => ({ month: d.month, label: d.label, n: Number(d.n) }));
  });
}

export interface PublicationRow {
  caseNumber: string;
  requestName: string | null;
  publishedOn: string | null;
  url: string | null;
  outlet: string;
  category: string;
  organization: string | null;
  owner: string | null;
  entityKind: string | null;
}

export function publicationList(f: Filters, limit = 50, offset = 0): Promise<{ rows: PublicationRow[]; total: number }> {
  return cached(key("publicationList", f, limit, offset), async () => {
    const data = await rows<Record<string, unknown>>(sql`${REQUEST_VIEW} ${MEDIA_VIEW}
      select p.case_number, r.name, p.published_on::text as published_on, p.url, p.outlet, p.category, r.organization, r.owner, r.entity_kind,
        count(*) over ()::int as total_rows
      ${MEDIA_FROM} ${whereClause(f, published)}
      order by p.published_on desc nulls last, p.case_number desc, p.position
      limit ${limit} offset ${offset}`);
    return {
      total: Number(data[0]?.total_rows ?? 0),
      rows: data.map((d) => ({
        caseNumber: String(d.case_number),
        requestName: (d.name as string) ?? null,
        publishedOn: (d.published_on as string) ?? null,
        url: (d.url as string) ?? null,
        outlet: String(d.outlet),
        category: String(d.category),
        organization: (d.organization as string) ?? null,
        owner: (d.owner as string) ?? null,
        entityKind: (d.entity_kind as string) ?? null,
      })),
    };
  });
}

/* ---------------------------------------------------------- filter options */

export type FilterOptions = Record<"org" | "type" | "topic" | "owner" | "project" | "status" | "entity" | "outlet" | "category", string[]>;

/** The values each filter select offers, most frequent first. */
export function filterOptions(): Promise<FilterOptions> {
  return cached("filterOptions", async () => {
    const list = (inner: SQL) => sql`(select coalesce(array_agg(v order by n desc), '{}') from (${inner}) x)`;
    const [row] = await rows<FilterOptions>(sql`${REQUEST_VIEW} ${MEDIA_VIEW}
      select
        ${list(sql`select organization v, count(*) n from r where organization is not null group by 1`)} as org,
        ${list(sql`select authority_type v, count(*) n from r group by 1`)} as type,
        ${list(sql`select coalesce(topic, 'לא סווג') v, count(*) n from r group by 1`)} as topic,
        ${list(sql`select owner v, count(*) n from r where owner is not null group by 1`)} as owner,
        ${list(sql`select pr v, count(*) n from r cross join lateral unnest(r.projects) pr group by 1`)} as project,
        ${list(sql`select status v, count(*) n from r where status is not null group by 1`)} as status,
        ${list(sql`select entity_kind v, count(*) n from r where entity_kind is not null group by 1`)} as entity,
        ${list(sql`select outlet v, count(*) n from p group by 1`)} as outlet,
        ${list(sql`select category v, count(*) n from p group by 1`)} as category`);
    return row!;
  });
}

/** How many requests the dashboard holds, when they were last refreshed and from where. */
export function dataFreshness(): Promise<{ total: number; lastImport: Date | null; sources: string[] }> {
  return cached(
    "dataFreshness",
    async () => {
      const [row] = await rows<{ total: number; last: Date | string | null; sources: string[] | null }>(
        sql`select count(*)::int as total, max(imported_at) as last, array_remove(array_agg(distinct source), null) as sources from requests`,
      );
      return { total: Number(row?.total ?? 0), lastImport: row?.last ? new Date(row.last) : null, sources: row?.sources ?? [] };
    },
    30_000,
  );
}
