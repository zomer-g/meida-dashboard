import type { Metadata } from "next";
import Link from "next/link";
import { Donut } from "@/components/charts/Donut";
import { MonthlyColumns } from "@/components/charts/MonthlyColumns";
import { BarList } from "@/components/dashboard/BarList";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { Card, StatCard, Table } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { EXPLAIN } from "@/lib/dashboard/explain";
import { filtersQuery, parseFilters, viewPath } from "@/lib/foi/filters";
import { monthlyRequests, petitions, projectSummary, requestCounts, requestKpis } from "@/lib/foi/metrics";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "פעילות התנועה" };

const shekel = (n: number) => `₪${fmtInt(n)}`;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const auth = await dashboardAuth("activity", viewPath("/activity", f));
  if (!auth.ok) return auth.render;

  const [kpis, statuses, byOrg, monthlyType, petitionRows, projects] = await Promise.all([
    requestKpis(f),
    requestCounts(f, "status", 20),
    requestCounts(f, "organization", 15),
    monthlyRequests(f, "authorityType", 6),
    petitions(f),
    projectSummary(f),
  ]);
  const awarded = petitionRows.reduce((s, p) => s + (p.costsAwarded ?? 0), 0);
  const received = petitionRows.reduce((s, p) => s + (p.costsReceived ?? 0), 0);
  const refunds = petitionRows.filter((p) => p.feeRefunded).length;
  const allowedPetitions = auth.user?.pages.includes("petitions");

  return (
    <DashboardFrame auth={auth} pageKey="activity" filters={f} keys={["type", "org", "topic", "owner", "project", "status", "petition"]} dateLabel="תאריך הגשה">
      <div className="flex flex-col gap-8">
        <section aria-label="מדדים מרכזיים" className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatCard label="בקשות שהוגשו" value={fmtInt(kpis.submitted)} info={EXPLAIN.submitted} />
          <StatCard label="עתירות" value={fmtInt(kpis.petitions)} info={EXPLAIN.petitions} />
          <StatCard label="הוצאות שנפסקו לטובת התנועה" value={shekel(awarded)} info={EXPLAIN.costsAwarded} />
          <StatCard label="התקבל בפועל" value={shekel(received)} info={EXPLAIN.costsReceived} />
          <StatCard label="החזרי אגרה" value={fmtInt(refunds)} />
          <StatCard label="תזכורות לרשויות" value={fmtInt(kpis.remindersSent)} info={EXPLAIN.reminders} />
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card title="בקשות לפי סוג רשות · לאורך זמן" className="xl:col-span-2">
            <MonthlyColumns points={monthlyType} caption="בקשות לפי חודש וסוג רשות" unit="בקשות" />
          </Card>
          <Card title="סטטוס הבקשות">
            <Donut items={statuses.map((s) => ({ label: s.label, value: s.n }))} caption="בקשות לפי סטטוס" centerLabel="בקשות" top={6} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="הרשויות שקיבלו הכי הרבה בקשות">
            <BarList items={byOrg.map((o) => ({ label: o.label, value: o.n }))} caption="בקשות לפי רשות" showShareOf={kpis.submitted} />
          </Card>
          <Card title="פרויקטים">
            <Table caption="בקשות לפי פרויקט" head={["פרויקט", "בקשות", "במועד", "בחריגה", "פתוחות", "פרסומים", "עתירות"]} empty={projects.length ? undefined : "אין בקשות משויכות לפרויקט"}>
              {projects.map((p) => (
                <tr key={p.project}>
                  <td className="px-3 py-2 font-semibold">
                    <Link href={`?${new URLSearchParams([...new URLSearchParams(filtersQuery(f, ["project"])), ["project", p.project]]).toString()}`} className="text-accent underline underline-offset-4">
                      {p.project}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtInt(p.total)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtInt(p.onTime)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtInt(p.late)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtInt(p.open)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtInt(p.publications)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtInt(p.petitions)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        {allowedPetitions ? (
          <p className="text-sm">
            <Link href={`/petitions${filtersQuery(f) ? `?${filtersQuery(f)}` : ""}`} className="font-semibold text-brand underline underline-offset-4">
              לטבלת העתירות המלאה ›
            </Link>
          </p>
        ) : null}
      </div>
    </DashboardFrame>
  );
}
