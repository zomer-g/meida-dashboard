import type { Metadata } from "next";
import { Donut } from "@/components/charts/Donut";
import { TimeColumns } from "@/components/charts/TimeColumns";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { Pager } from "@/components/dashboard/Pager";
import { Card, NewTabNote, StatCard, Table } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { EXPLAIN } from "@/lib/dashboard/explain";
import { formatDay } from "@/lib/dashboard/params";
import { parseFilters, viewPath } from "@/lib/foi/filters";
import { mediaCounts, mediaKpis, mediaOverTime, publicationList } from "@/lib/foi/metrics";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "דוח תקשורת" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const PAGE_SIZE = 50;

export default async function MediaReportPage({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const f = parseFilters(search);
  const auth = await dashboardAuth("media", viewPath("/", f));
  if (!auth.ok) return auth.render;

  const page = Math.max(1, Number(search.page) || 1);
  const [kpis, byOutlet, byCategory, byOrg, monthlyOutlet, monthlyCategory, monthlyOrg, list] = await Promise.all([
    mediaKpis(f),
    mediaCounts(f, "outlet"),
    mediaCounts(f, "category"),
    mediaCounts(f, "organization"),
    mediaOverTime(f, "outlet", 6),
    mediaOverTime(f, "category", 6),
    mediaOverTime(f, "organization", 6),
    publicationList(f, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);
  const slices = (rows: { label: string; n: number }[]) => rows.map((r) => ({ label: r.label, value: r.n }));

  return (
    <DashboardFrame
      auth={auth}
      pageKey="media"
      filters={f}
      keys={["owner", "outlet", "category", "org", "petition", "entity", "project"]}
      dateLabel="תאריך פרסום"
    >
      <section aria-label="מדדים מרכזיים" className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="פרסומים" value={fmtInt(kpis.publications)} info={EXPLAIN.publications} />
        <StatCard label="בקשות שפורסמו" value={fmtInt(kpis.requests)} info={EXPLAIN.coveredRequests} />
        <StatCard label="גופי תקשורת" value={fmtInt(kpis.outlets)} info={EXPLAIN.outlets} />
        <StatCard
          label="ימים מהגשה ועד פרסום"
          value={kpis.avgDaysSubmitToPublish == null ? "—" : fmtInt(kpis.avgDaysSubmitToPublish)}
          hint={kpis.medianDaysSubmitToPublish == null ? undefined : `חציון ${fmtInt(kpis.medianDaysSubmitToPublish)}`}
          info={EXPLAIN.daysSubmitToPublish}
        />
        <StatCard
          label="ימים ממענה ועד פרסום"
          value={kpis.avgDaysResponseToPublish == null ? "—" : fmtInt(kpis.avgDaysResponseToPublish)}
          info={EXPLAIN.daysResponseToPublish}
        />
      </section>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="לפי גוף תקשורת">
          <Donut items={slices(byOutlet)} caption="פרסומים לפי גוף תקשורת" centerLabel="פרסומים" />
        </Card>
        <Card title="לפי קטגוריית תקשורת">
          <Donut items={slices(byCategory)} caption="פרסומים לפי קטגוריית תקשורת" centerLabel="פרסומים" />
        </Card>
        <Card title="לפי הרשות שאליה הוגשה הבקשה">
          <Donut items={slices(byOrg)} caption="פרסומים לפי רשות" centerLabel="פרסומים" />
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="פרסומים לאורך זמן · גוף תקשורת" level={2}>
          <TimeColumns points={monthlyOutlet} caption="פרסומים לאורך זמן לפי גוף תקשורת" unit="פרסומים" defaultResolution="year" />
        </Card>
        <Card title="פרסומים לאורך זמן · קטגוריה">
          <TimeColumns points={monthlyCategory} caption="פרסומים לאורך זמן לפי קטגוריה" unit="פרסומים" defaultResolution="year" />
        </Card>
        <Card title="פרסומים לאורך זמן · רשות">
          <TimeColumns points={monthlyOrg} caption="פרסומים לאורך זמן לפי רשות" unit="פרסומים" defaultResolution="year" />
        </Card>
      </div>

      <Card title={`רשימת הפרסומים (${fmtInt(list.total)})`}>
        <Table
          caption="רשימת הפרסומים"
          head={["תאריך פרסום", "שם הבקשה", "גוף תקשורת", "קטגוריה", "רשות", "בעלי בקשה", "סוג אייטם"]}
          empty={list.rows.length ? undefined : "אין פרסומים בסינון הזה"}
        >
          {list.rows.map((r, i) => (
            <tr key={`${r.caseNumber}-${i}`}>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDay(r.publishedOn)}</td>
              <td className="px-3 py-2">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
                    {r.requestName ?? `בקשה ${r.caseNumber}`}
                    <NewTabNote />
                  </a>
                ) : (
                  (r.requestName ?? `בקשה ${r.caseNumber}`)
                )}
              </td>
              <td className="px-3 py-2">{r.outlet}</td>
              <td className="px-3 py-2">{r.category}</td>
              <td className="px-3 py-2">{r.organization ?? "—"}</td>
              <td className="px-3 py-2">{r.owner ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted">{r.entityKind ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <Pager page={page} pageSize={PAGE_SIZE} total={list.total} search={search} />
      </Card>
    </DashboardFrame>
  );
}
