import { FILTER_KEYS, RANGES, type FilterKey } from "@/lib/foi/filter-keys";
import { parseFilters, type Filters } from "@/lib/foi/filters";
import {
  dataFreshness,
  filterOptions,
  groupScores,
  mediaCounts,
  mediaKpis,
  mediaOverTime,
  petitions,
  projectSummary,
  publicationList,
  refusalGrounds,
  requestCounts,
  requestKpis,
  requestList,
  requestsOverTime,
  type Dim,
} from "@/lib/foi/metrics";
import { webMetrics } from "@/lib/foi/web-metrics";
import type { McpUser } from "./auth";

/**
 * The read-only tool surface. Every tool names the dashboard page it belongs to,
 * and a user only sees the tools for pages they may open — the same permission the
 * UI applies, enforced again here rather than assumed.
 *
 * Nothing in this file writes: each tool calls one of the dashboard's own metric
 * queries (src/lib/foi/metrics.ts), which are SELECTs.
 */

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  /** The dashboard page this tool reads; null = available to every signed-in user. */
  page: string | null;
  inputSchema: Record<string, unknown>;
  run(user: McpUser, args: Record<string, unknown>): Promise<{ data: unknown; rows?: number }>;
}

/* ------------------------------------------------------------- arguments */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown, fallback: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};

/** Tool arguments are the dashboard's own URL filters, so the answers match the screens exactly. */
function toFilters(args: Record<string, unknown>): Filters {
  const search: Record<string, string> = {};
  for (const key of ["range", "from", "to", ...(Object.keys(FILTER_KEYS) as FilterKey[]), "q"]) {
    const value = str(args[key]);
    if (value) search[key] = value;
  }
  return parseFilters(search);
}

const FILTER_PROPERTIES: Record<string, unknown> = {
  range: { type: "string", enum: RANGES.map((r) => r.key), description: "טווח תאריכים; ברירת מחדל: כל התקופה" },
  from: { type: "string", description: "YYYY-MM-DD, רק עם range=custom" },
  to: { type: "string", description: "YYYY-MM-DD, רק עם range=custom" },
  org: { type: "string", description: "שם הארגון אליו הוגשה הבקשה, בדיוק כפי שהוא מופיע ב-list_filter_options" },
  type: { type: "string", description: "סוג רשות (משרד ממשלתי, רשות מקומית…)" },
  topic: { type: "string", description: "תחום הבקשה" },
  owner: { type: "string", description: "בעלי הבקשה" },
  project: { type: "string", description: "שיוך לפרויקט" },
  status: { type: "string", description: "סטטוס הבקשה ב-Salesforce" },
  entity: { type: "string", description: "מהות היישות / סוג אייטם" },
  petition: { type: "string", enum: ["yes", "no"], description: "האם הוגשה עתירה" },
};

const MEDIA_FILTERS: Record<string, unknown> = {
  ...FILTER_PROPERTIES,
  outlet: { type: "string", description: "גוף תקשורת" },
  category: { type: "string", description: "קטגוריית תקשורת (ארצי, מקומי, מגזרי…)" },
};

const schema = (properties: Record<string, unknown>) => ({ type: "object", properties, additionalProperties: false });

const counts = (rows: { label: string; n: number }[], limit = 15) => rows.slice(0, limit).map((r) => ({ label: r.label, count: r.n }));

/* ----------------------------------------------------------------- tools */

export const TOOLS: ToolDef[] = [
  {
    name: "dashboard_info",
    title: "מה יש בדשבורד",
    page: null,
    description:
      "מצב הנתונים והרשאות המשתמש: כמה בקשות יש במערכת, מתי עודכנו לאחרונה, מאיזה מקור, ואילו עמודים וכלים פתוחים למשתמש הנוכחי. כדאי לקרוא לזה ראשון.",
    inputSchema: schema({}),
    async run(user) {
      const freshness = await dataFreshness();
      return {
        data: {
          requests: freshness.total,
          lastUpdated: freshness.lastImport,
          sources: freshness.sources,
          you: { email: user.email, role: user.role, userType: user.userTypeLabel ?? user.userType, pages: user.pages },
          toolsAvailable: toolsFor(user).map((t) => t.name),
          note: "קריאה בלבד. כל המספרים מוגבלים למה שהמשתמש רשאי לראות בממשק.",
        },
      };
    },
  },
  {
    name: "list_filter_options",
    title: "ערכי הסינון האפשריים",
    page: null,
    description: "הערכים התקפים לכל פרמטר סינון (ארגונים, סוגי רשות, תחומים, פרויקטים, גופי תקשורת…), לפי ההרשאות של המשתמש.",
    inputSchema: schema({}),
    async run(user) {
      const all = await filterOptions();
      const may = (page: string) => user.pages.includes(page);
      const data: Record<string, string[]> = {};
      if (may("authorities") || may("authority-types") || may("topics") || may("ranking") || may("media")) {
        data.org = all.org;
        data.type = all.type;
        data.topic = all.topic;
      }
      if (may("media")) {
        data.outlet = all.outlet;
        data.category = all.category;
        data.entity = all.entity;
      }
      // Owners are staff names and projects are internal: only for the pages that show them.
      if (may("requests") || may("activity")) {
        data.owner = all.owner;
        data.project = all.project;
        data.status = all.status;
      }
      return { data };
    },
  },
  {
    name: "media_report",
    title: "דוח תקשורת",
    page: "media",
    description:
      "פרסומים בתקשורת בעקבות בקשות המידע של התנועה: סיכום (כמה פרסומים, כמה בקשות, ימים מהגשה/ממענה ועד פרסום), ופילוח לפי גוף תקשורת, קטגוריה ורשות.",
    inputSchema: schema({ ...MEDIA_FILTERS, breakdownLimit: { type: "integer", description: "כמה ערכים בכל פילוח (ברירת מחדל 15)" } }),
    async run(_user, args) {
      const f = toFilters(args);
      const limit = num(args.breakdownLimit, 15, 100);
      const [kpis, byOutlet, byCategory, byOrg] = await Promise.all([
        mediaKpis(f),
        mediaCounts(f, "outlet"),
        mediaCounts(f, "category"),
        mediaCounts(f, "organization"),
      ]);
      return { data: { summary: kpis, byOutlet: counts(byOutlet, limit), byCategory: counts(byCategory, limit), byOrganization: counts(byOrg, limit) } };
    },
  },
  {
    name: "media_over_time",
    title: "פרסומים לאורך זמן",
    page: "media",
    description: "ספירת פרסומים לפי יום, מפוצלת לפי גוף תקשורת / קטגוריה / רשות. מתאים לגרפים ולמגמות.",
    inputSchema: schema({
      ...MEDIA_FILTERS,
      splitBy: { type: "string", enum: ["outlet", "category", "organization", "owner", "entity"], description: "לפי מה לפצל (ברירת מחדל: גוף תקשורת)" },
      top: { type: "integer", description: "כמה סדרות לשמור, השאר מתקבצות ל״אחר״ (ברירת מחדל 6)" },
    }),
    async run(_user, args) {
      const split = (str(args.splitBy) ?? "outlet") as "outlet" | "category" | "organization" | "owner" | "entity";
      const rows = await mediaOverTime(toFilters(args), split, num(args.top, 6, 12));
      return { data: { splitBy: split, points: rows }, rows: rows.length };
    },
  },
  {
    name: "publications_list",
    title: "רשימת פרסומים",
    page: "media",
    description: "הפרסומים עצמם: תאריך, שם הבקשה, קישור, גוף תקשורת, קטגוריה והרשות שאליה הוגשה הבקשה.",
    inputSchema: schema({ ...MEDIA_FILTERS, limit: { type: "integer", description: "עד 200 (ברירת מחדל 50)" }, offset: { type: "integer" } }),
    async run(_user, args) {
      const list = await publicationList(toFilters(args), num(args.limit, 50, 200), num(args.offset, 0, 100_000) || 0);
      return { data: { total: list.total, publications: list.rows }, rows: list.rows.length };
    },
  },
  {
    name: "authority_metrics",
    title: "מדדי רשויות",
    page: "authorities",
    description:
      "עמידת הרשויות בחוק: לכל רשות (או סוג רשות / תחום / שנה) כמה בקשות, כמה נענו במועד ובחריגה, כמה פתוחות, ממוצע ימים עד מענה, ציון שלמות המענה (1–3) וציון הפורמט (0–3).",
    inputSchema: schema({
      ...FILTER_PROPERTIES,
      groupBy: { type: "string", enum: ["organization", "authorityType", "topic", "year", "owner", "status"], description: "ברירת מחדל: רשות" },
      limit: { type: "integer", description: "כמה קבוצות (ברירת מחדל 20, עד 200)" },
      minRequests: { type: "integer", description: "מינימום בקשות לקבוצה (ברירת מחדל 1)" },
    }),
    async run(user, args) {
      const groupBy = (str(args.groupBy) ?? "organization") as Dim;
      // Each grouping belongs to a page; a journalist without "ציר זמן" cannot group by year.
      const PAGE_OF: Partial<Record<Dim, string>> = { authorityType: "authority-types", topic: "topics", year: "timeline" };
      const needed = PAGE_OF[groupBy];
      if (needed && !user.pages.includes(needed)) {
        throw new Error(`הפילוח הזה שייך לעמוד שאינו בהרשאות שלך (${needed})`);
      }
      const f = toFilters(args);
      const [kpis, groups] = await Promise.all([
        requestKpis(f),
        groupScores(f, groupBy, num(args.limit, 20, 200), num(args.minRequests, 1, 1000)),
      ]);
      return { data: { summary: kpis, groupBy, groups }, rows: groups.length };
    },
  },
  {
    name: "refusal_grounds",
    title: "נימוקי סירוב",
    page: "authorities",
    description: "באיזו תדירות כל נימוק סירוב (סעיפים 8–9 לחוק) סומן על הבקשות בטווח, כמספר וכאחוז.",
    inputSchema: schema(FILTER_PROPERTIES),
    async run(_user, args) {
      const result = await refusalGrounds(toFilters(args));
      return { data: result, rows: result.grounds.length };
    },
  },
  {
    name: "requests_over_time",
    title: "בקשות לאורך זמן",
    page: "timeline",
    description: "ספירת בקשות שהוגשו לפי יום, מפוצלת לפי סוג רשות / תחום / רשות / בעלי בקשה.",
    inputSchema: schema({
      ...FILTER_PROPERTIES,
      splitBy: { type: "string", enum: ["authorityType", "topic", "organization", "owner", "status"], description: "ברירת מחדל: סוג רשות" },
      top: { type: "integer", description: "כמה סדרות (ברירת מחדל 6)" },
    }),
    async run(_user, args) {
      const split = (str(args.splitBy) ?? "authorityType") as Dim;
      const rows = await requestsOverTime(toFilters(args), split, num(args.top, 6, 12));
      return { data: { splitBy: split, points: rows }, rows: rows.length };
    },
  },
  {
    name: "authority_ranking",
    title: "דירוג רשויות",
    page: "ranking",
    description:
      "דירוג משוקלל של הרשויות: 50% עמידה במועדים, 25% שלמות המענה, 25% איכות הפורמט, לרשויות עם מספר בקשות מינימלי. זה הבסיס לדוח התקלות הציבורי.",
    inputSchema: schema({ ...FILTER_PROPERTIES, minRequests: { type: "integer", description: "ברירת מחדל 10" }, limit: { type: "integer" } }),
    async run(_user, args) {
      const groups = await groupScores(toFilters(args), "organization", 500, num(args.minRequests, 10, 1000));
      const ranked = groups
        .map((g) => {
          const parts: [number | null, number][] = [
            [g.onTimeRate == null ? null : g.onTimeRate * 100, 0.5],
            [g.completenessScore == null ? null : ((g.completenessScore - 1) / 2) * 100, 0.25],
            [g.formatScore == null ? null : (g.formatScore / 3) * 100, 0.25],
          ];
          const present = parts.filter(([v]) => v != null) as [number, number][];
          const weight = present.reduce((s, [, w]) => s + w, 0);
          return {
            organization: g.label,
            score: weight ? Math.round(present.reduce((s, [v, w]) => s + v * w, 0) / weight) : null,
            requests: g.total,
            onTimeRate: g.onTimeRate,
            completenessScore: g.completenessScore,
            formatScore: g.formatScore,
            avgDaysToAnswer: g.avgLifecycle == null ? null : Math.round(g.avgLifecycle),
          };
        })
        .filter((r) => r.score != null)
        .sort((a, b) => b.score! - a.score!)
        .slice(0, num(args.limit, 100, 500));
      return { data: { ranking: ranked }, rows: ranked.length };
    },
  },
  {
    name: "requests_search",
    title: "חיפוש בקשות",
    page: "requests",
    description:
      "בקשות מידע בודדות: מספר, שם, רשות, בעלי הבקשה, תאריכי הגשה ומענה, ימי טיפול ומצב מול המועד בחוק. אפשר לחפש טקסט חופשי ב-q.",
    inputSchema: schema({
      ...FILTER_PROPERTIES,
      q: { type: "string", description: "חיפוש בשם הבקשה, בתיאור, ברשות או במספר הבקשה" },
      order: { type: "string", enum: ["submitted", "overdue"], description: "מיון: לפי תאריך הגשה (ברירת מחדל) או לפי ימי חריגה" },
      onlyOverdue: { type: "boolean", description: "רק בקשות שחרגו מהמועד בחוק" },
      limit: { type: "integer", description: "עד 200 (ברירת מחדל 50)" },
      offset: { type: "integer" },
    }),
    async run(_user, args) {
      const list = await requestList(toFilters(args), {
        order: str(args.order) === "overdue" ? "overdue" : "submitted",
        onlyOverdue: args.onlyOverdue === true,
        limit: num(args.limit, 50, 200),
        offset: num(args.offset, 0, 100_000) || 0,
      });
      return { data: { total: list.total, requests: list.rows }, rows: list.rows.length };
    },
  },
  {
    name: "petitions_list",
    title: "עתירות",
    page: "petitions",
    description: "העתירות שהוגשו בעקבות בקשות מידע: תיק, רשות, סוג הליך, תוצאה, שופט/ת, משרד עו״ד, הוצאות שנפסקו ומה התקבל בפועל.",
    inputSchema: schema(FILTER_PROPERTIES),
    async run(_user, args) {
      const rows = await petitions(toFilters(args));
      const awarded = rows.reduce((s, p) => s + (p.costsAwarded ?? 0), 0);
      const received = rows.reduce((s, p) => s + (p.costsReceived ?? 0), 0);
      return {
        data: { summary: { petitions: rows.length, costsAwarded: awarded, costsReceived: received, infoReceived: rows.filter((p) => p.infoReceived).length }, petitions: rows },
        rows: rows.length,
      };
    },
  },
  {
    name: "activity_summary",
    title: "פעילות התנועה",
    page: "activity",
    description: "סיכום פעילות: בקשות שהוגשו, עתירות, תזכורות, פילוח לפי סטטוס ולפי רשות, וטבלת הפרויקטים.",
    inputSchema: schema(FILTER_PROPERTIES),
    async run(_user, args) {
      const f = toFilters(args);
      const [kpis, statuses, byOrg, projects] = await Promise.all([
        requestKpis(f),
        requestCounts(f, "status", 20),
        requestCounts(f, "organization", 15),
        projectSummary(f),
      ]);
      return { data: { summary: kpis, byStatus: counts(statuses, 20), topOrganizations: counts(byOrg), projects } };
    },
  },
  {
    name: "site_traffic",
    title: "אתר ודיוור",
    page: "web",
    description: "תנועה באתר meida.org.il מ-Google Analytics (כניסות, משתמשים, ערוצים, דפים מובילים) ודיוורי SMOOV שבמעקב.",
    inputSchema: schema({ range: FILTER_PROPERTIES.range, from: FILTER_PROPERTIES.from, to: FILTER_PROPERTIES.to }),
    async run(_user, args) {
      const m = await webMetrics(toFilters(args));
      return {
        data: {
          range: { from: m.from, to: m.to },
          sessions: m.sessions,
          newUsers: m.newUsers,
          engagedSessions: m.engaged,
          pageViews: m.pageViews,
          channels: m.channels.map((c) => ({ channel: c.label, sessions: Number(c.n) })),
          topPages: m.pages.map((p) => ({ path: p.path, title: p.title, views: Number(p.views) })),
          mailings: m.campaigns.map(({ campaign, stats }) => ({
            label: campaign.label,
            utmCampaign: campaign.utmCampaign,
            sentAt: stats?.sentAt ?? null,
            sent: stats?.sent ?? null,
            opens: stats?.opens ?? null,
            clicks: stats?.clicks ?? null,
          })),
        },
      };
    },
  },
];

/** The tools this user may call — the dashboard's page permissions, applied to the tool list. */
export function toolsFor(user: McpUser): ToolDef[] {
  return TOOLS.filter((t) => t.page === null || user.pages.includes(t.page));
}

export function findTool(user: McpUser, name: string): ToolDef | undefined {
  return toolsFor(user).find((t) => t.name === name);
}
