import { sql, type SQL } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { getDb } from "@/lib/db/client";
import { whereClause, type Filters } from "./filters";

/**
 * Every figure on the request and media pages. Definitions are in
 * docs/metrics.md and, in short, in src/lib/dashboard/explain.ts — keep all three in step.
 *
 * `r` is a request with its derived columns:
 *   authority_type  from organizations (editable at /admin/lookups)
 *   is_closed       status בקשה סגורה / סירוב / מידע התקבל, or a close reason is set
 *   lifecycle_days  submission → full response, → today while open, unknown when closed without a response date
 *   allowed_days    the legal deadline: 30 days, +30 with a section 7(ב) extension, +60 with 7(ג)
 *   timeliness      נענה במועד / נענה בחריגה / בקשה פתוחה / נסגרה ללא מענה מלא / טרם הוגשה
 *   bucket          answered requests by days to answer: עד 15 / 30 / 60 / 120 / מעל 120
 */

export const REQUEST_VIEW = sql`
  with base as (
    select q.*,
      coalesce(o.authority_type, 'טרם סווג') as authority_type,
      (q.status in ('בקשה סגורה', 'סירוב', 'מידע התקבל') or q.close_reason is not null) as is_closed,
      case
        when q.submitted_on is null then null
        when q.full_response_on is not null then greatest(q.full_response_on - q.submitted_on, 0)
        -- Closed without a response date: how long it took is unknown, not "until today".
        when q.status in ('בקשה סגורה', 'סירוב', 'מידע התקבל') or q.close_reason is not null then null
        else greatest(current_date - q.submitted_on, 0)
      end as lifecycle_days,
      30 + case when q.extension_30_on is not null then 30 else 0 end
         + case when q.extension_60_on is not null then 60 else 0 end as allowed_days
    from requests q
    left join organizations o on o.name = q.organization
  ),
  r as (
    select b.*,
      case
        when b.status = 'בקשה חדשה' then 'טרם הוגשה'
        when b.full_response_on is not null and b.lifecycle_days <= b.allowed_days then 'נענה במועד'
        when b.full_response_on is not null then 'נענה בחריגה'
        when b.is_closed then 'נסגרה ללא מענה מלא'
        else 'בקשה פתוחה'
      end as timeliness,
      case
        when b.full_response_on is null or b.lifecycle_days is null then null
        when b.lifecycle_days <= 15 then '1. עד 15 ימים'
        when b.lifecycle_days <= 30 then '2. עד 30 ימים'
        when b.lifecycle_days <= 60 then '3. עד 60 ימים'
        when b.lifecycle_days <= 120 then '4. עד 120 ימים'
        else '5. מעל 120 ימים'
      end as bucket
    from base b
  )`;

export const MEDIA_VIEW = sql`
  , p as (
    select pub.case_number, pub.position, pub.published_on, pub.url, pub.domain,
      coalesce(m.name, pub.domain, 'לא ידוע') as outlet,
      coalesce(m.category, 'טרם סווג') as category
    from request_publications pub
    left join media_outlets m on m.domain = pub.domain
  )`;

export const TIMELINESS = ["נענה במועד", "נענה בחריגה", "בקשה פתוחה", "נסגרה ללא מענה מלא"] as const;
export const BUCKETS = ["1. עד 15 ימים", "2. עד 30 ימים", "3. עד 60 ימים", "4. עד 120 ימים", "5. מעל 120 ימים"] as const;
export const COMPLETENESS = ["התייחסו להכל", "התייחסו באופן חלקי", "קטסטרופה"] as const;
export const FORMATS = ["קובץ אקסל או טבלה סבירה", "מענה שניתן לעבד אך לא מסודר", "אשכרה הדפיסו טבלה וסרקו אותה"] as const;

/** Grouping dimensions over `r`. Whitelisted: the key is never interpolated as SQL. */
export const DIMS = {
  organization: sql`coalesce(r.organization, 'לא צוין')`,
  authorityType: sql`r.authority_type`,
  topic: sql`coalesce(r.topic, 'לא סווג')`,
  owner: sql`coalesce(r.owner, 'לא צוין')`,
  status: sql`coalesce(r.status, 'לא צוין')`,
  year: sql`coalesce(extract(year from r.submitted_on)::int::text, 'ללא תאריך')`,
  entity: sql`coalesce(r.entity_kind, 'לא צוין')`,
} as const;

export type Dim = keyof typeof DIMS;

export const MEDIA_DIMS = {
  outlet: sql`p.outlet`,
  category: sql`p.category`,
  organization: sql`coalesce(r.organization, 'לא צוין')`,
  owner: sql`coalesce(r.owner, 'לא צוין')`,
  entity: sql`coalesce(r.entity_kind, 'לא צוין')`,
} as const;

export type MediaDim = keyof typeof MEDIA_DIMS;

export async function rows<T>(query: SQL): Promise<T[]> {
  const res = await getDb().execute(query);
  return res.rows as T[];
}

export const key = (name: string, ...parts: unknown[]) => `${name}:${JSON.stringify(parts)}`;
const submitted = sql`r.submitted_on`;

/* ----------------------------------------------------------------- requests */

export interface RequestKpis {
  total: number;
  submitted: number;
  onTime: number;
  late: number;
  open: number;
  closedWithoutResponse: number;
  avgDaysToAnswer: number | null;
  medianDaysToAnswer: number | null;
  petitions: number;
  withPublications: number;
  remindersSent: number;
}

export function requestKpis(f: Filters): Promise<RequestKpis> {
  return cached(key("requestKpis", f), async () => {
    const [row] = await rows<Record<string, string | number | null>>(sql`${REQUEST_VIEW}
      select
        count(*)::int as total,
        count(*) filter (where r.timeliness <> 'טרם הוגשה')::int as submitted,
        count(*) filter (where r.timeliness = 'נענה במועד')::int as on_time,
        count(*) filter (where r.timeliness = 'נענה בחריגה')::int as late,
        count(*) filter (where r.timeliness = 'בקשה פתוחה')::int as open,
        count(*) filter (where r.timeliness = 'נסגרה ללא מענה מלא')::int as closed_without,
        round(avg(r.lifecycle_days) filter (where r.full_response_on is not null))::int as avg_days,
        (percentile_cont(0.5) within group (order by r.lifecycle_days) filter (where r.full_response_on is not null))::int as median_days,
        count(*) filter (where r.petition_filed_on is not null or r.court_case_number is not null)::int as petitions,
        count(*) filter (where exists (select 1 from request_publications x where x.case_number = r.case_number))::int as with_pubs,
        coalesce(sum(r.reminders_count), 0)::int as reminders
      from r ${whereClause(f, submitted)}`);
    const n = (k: string) => Number(row?.[k] ?? 0);
    return {
      total: n("total"),
      submitted: n("submitted"),
      onTime: n("on_time"),
      late: n("late"),
      open: n("open"),
      closedWithoutResponse: n("closed_without"),
      avgDaysToAnswer: row?.avg_days == null ? null : Number(row.avg_days),
      medianDaysToAnswer: row?.median_days == null ? null : Number(row.median_days),
      petitions: n("petitions"),
      withPublications: n("with_pubs"),
      remindersSent: n("reminders"),
    };
  });
}

export interface GroupScore {
  label: string;
  total: number;
  onTime: number;
  late: number;
  open: number;
  closedWithoutResponse: number;
  /** Share answered on time out of answered (0–1). */
  onTimeRate: number | null;
  avgLifecycle: number | null;
  avgOverdue: number | null;
  buckets: Record<string, number>;
  completeness: Record<string, number>;
  /** Mean of התייחסו להכל = 3, באופן חלקי = 2, קטסטרופה = 1. */
  completenessScore: number | null;
  formats: Record<string, number>;
  /** Mean of אקסל = 3, לא מסודר = 1.5, סרוק = 0 ("לא רלוונטי" left out). */
  formatScore: number | null;
}

