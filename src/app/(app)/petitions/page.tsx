import type { Metadata } from "next";
import { Donut } from "@/components/charts/Donut";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { Badge, Card, NewTabNote, StatCard, Table } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { EXPLAIN } from "@/lib/dashboard/explain";
import { formatDay } from "@/lib/dashboard/params";
import { parseFilters, viewPath } from "@/lib/foi/filters";
import { petitions } from "@/lib/foi/metrics";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "עתירות" };

const shekel = (n: number | null) => (n == null ? "—" : `₪${fmtInt(n)}`);

function tally(values: (string | null)[]): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v ?? "טרם הוכרע", (m.get(v ?? "טרם הוכרע") ?? 0) + 1);
  return [...m].map(([label, value]) => ({ label, value }));
}

export default async function PetitionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const auth = await dashboardAuth("petitions", viewPath("/petitions", f));
  if (!auth.ok) return auth.render;

  const rows = await petitions(f);
  const awarded = rows.reduce((s, p) => s + (p.costsAwarded ?? 0), 0);
  const received = rows.reduce((s, p) => s + (p.costsReceived ?? 0), 0);
  const infoReceived = rows.filter((p) => p.infoReceived).length;

  return (
    <DashboardFrame auth={auth} pageKey="petitions" filters={f} keys={["type", "org", "topic", "owner", "project"]} dateLabel="תאריך הגשת העתירה">
      <div className="flex flex-col gap-8">
        <section aria-label="מדדים מרכזיים" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="עתירות" value={fmtInt(rows.length)} info={EXPLAIN.petitions} />
          <StatCard label="התקבל מידע בעקבות העתירה" value={fmtInt(infoReceived)} hint={rows.length ? `${Math.round((infoReceived / rows.length) * 100)}% מהעתירות` : undefined} />
          <StatCard label="הוצאות שנפסקו" value={shekel(awarded)} info={EXPLAIN.costsAwarded} />
          <StatCard label="התקבל בפועל" value={shekel(received)} info={EXPLAIN.costsReceived} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="תוצאת העתירה">
            <Donut items={tally(rows.map((r) => r.outcome))} caption="עתירות לפי תוצאה" centerLabel="עתירות" />
          </Card>
          <Card title="סוג ההליך">
            <Donut items={tally(rows.map((r) => r.procedure))} caption="עתירות לפי סוג הליך" centerLabel="עתירות" />
          </Card>
        </div>

        <Card title={`טבלת עתירות (${fmtInt(rows.length)})`}>
          <Table
            caption="טבלת עתירות"
            head={["תיק", "שם הבקשה", "רשות", "הוגשה", "סוג הליך", "תוצאה", "שופט/ת", "משרד עו״ד", "הוצאות", "התקבל", "מידע"]}
            empty={rows.length ? undefined : "אין עתירות בסינון הזה"}
          >
            {rows.map((r) => (
              <tr key={r.caseNumber}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums" dir="ltr">
                  {r.courtCaseNumber ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {r.sfUrl ? (
                    <a href={r.sfUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
                      {r.name ?? r.caseNumber}
                      <NewTabNote />
                    </a>
                  ) : (
                    (r.name ?? r.caseNumber)
                  )}
                </td>
                <td className="px-3 py-2">{r.organization ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDay(r.filedOn)}</td>
                <td className="px-3 py-2">{r.procedure ?? "—"}</td>
                <td className="px-3 py-2">{r.outcome ? <Badge tone={r.outcome === "נדחה" ? "warning" : "accent"}>{r.outcome}</Badge> : "—"}</td>
                <td className="px-3 py-2">{r.judge ?? "—"}</td>
                <td className="px-3 py-2">{r.lawFirm ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{shekel(r.costsAwarded)}</td>
                <td className="px-3 py-2 tabular-nums">{shekel(r.costsReceived)}</td>
                <td className="px-3 py-2">{r.infoReceived ? <Badge tone="success">התקבל</Badge> : "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </DashboardFrame>
  );
}
