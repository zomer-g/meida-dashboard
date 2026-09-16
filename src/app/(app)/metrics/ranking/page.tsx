import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/dashboard/BarList";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { Card, Table } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { EXPLAIN } from "@/lib/dashboard/explain";
import { filtersQuery, parseFilters, viewPath } from "@/lib/foi/filters";
import { groupScores, type GroupScore } from "@/lib/foi/metrics";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "דירוג רשויות" };

const MIN_OPTIONS = [5, 10, 20];

/** 50% on time, 25% completeness, 25% format — each normalised to 0–100; a part without data drops out and the rest are reweighted. */
function composite(g: GroupScore): number | null {
  const parts: [number | null, number][] = [
    [g.onTimeRate == null ? null : g.onTimeRate * 100, 0.5],
    [g.completenessScore == null ? null : ((g.completenessScore - 1) / 2) * 100, 0.25],
    [g.formatScore == null ? null : (g.formatScore / 3) * 100, 0.25],
  ];
  const present = parts.filter(([v]) => v != null) as [number, number][];
  const weight = present.reduce((s, [, w]) => s + w, 0);
  return weight ? present.reduce((s, [v, w]) => s + v * w, 0) / weight : null;
}

export default async function RankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const f = parseFilters(search);
  const auth = await dashboardAuth("ranking", viewPath("/metrics/ranking", f));
  if (!auth.ok) return auth.render;

  const min = MIN_OPTIONS.includes(Number(search.min)) ? Number(search.min) : 10;
  const groups = await groupScores(f, "organization", 500, min);
  const ranked = groups
    .map((g) => ({ g, score: composite(g) }))
    .filter((r): r is { g: GroupScore; score: number } => r.score != null)
    .sort((a, b) => b.score - a.score);
  const base = filtersQuery(f);

  return (
    <DashboardFrame auth={auth} pageKey="ranking" filters={f} keys={["type", "topic", "owner", "project"]} dateLabel="תאריך הגשה">
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="מספר בקשות מינימלי">
          <span className="font-semibold text-accent">רק רשויות עם לפחות:</span>
          {MIN_OPTIONS.map((m) => (
            <Link
              key={m}
              href={`?${new URLSearchParams([...new URLSearchParams(base), ["min", String(m)]]).toString()}`}
              aria-current={m === min ? "true" : undefined}
              className={`rounded-full px-4 py-1.5 font-semibold ${m === min ? "bg-brand-dark text-white" : "bg-white ring-1 ring-line hover:bg-accent-light/50"}`}
            >
              {m} בקשות
            </Link>
          ))}
        </div>

        <p className="rounded-card bg-surface p-4 text-sm text-muted">{EXPLAIN.ranking}</p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="10 הרשויות המובילות">
            <BarList items={ranked.slice(0, 10).map((r) => ({ label: r.g.label, value: Math.round(r.score) }))} caption="הרשויות המובילות" max={100} format={(n) => `${n}`} valueHead="ציון" />
          </Card>
          <Card title="10 הרשויות בתחתית">
            <BarList items={ranked.slice(-10).reverse().map((r) => ({ label: r.g.label, value: Math.round(r.score) }))} caption="הרשויות בתחתית" max={100} format={(n) => `${n}`} valueHead="ציון" />
          </Card>
        </div>

        <Card title={`הדירוג המלא (${fmtInt(ranked.length)} רשויות)`}>
          <Table
            caption="דירוג הרשויות"
            head={["#", "רשות", "בקשות", "במועד", "התייחסות (1–3)", "פורמט (0–3)", "ממוצע ימים", "ציון"]}
            empty={ranked.length ? undefined : "אין רשויות עם מספיק בקשות בסינון הזה"}
          >
            {ranked.map((r, i) => (
              <tr key={r.g.label}>
                <td className="px-3 py-2 tabular-nums text-muted">{i + 1}</td>
                <td className="px-3 py-2 font-semibold">{r.g.label}</td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(r.g.total)}</td>
                <td className="px-3 py-2 tabular-nums">{r.g.onTimeRate == null ? "—" : `${Math.round(r.g.onTimeRate * 100)}%`}</td>
                <td className="px-3 py-2 tabular-nums">{r.g.completenessScore?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.g.formatScore?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.g.avgLifecycle == null ? "—" : fmtInt(Math.round(r.g.avgLifecycle))}</td>
                <td className="px-3 py-2 font-bold tabular-nums">{Math.round(r.score)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </DashboardFrame>
  );
}
