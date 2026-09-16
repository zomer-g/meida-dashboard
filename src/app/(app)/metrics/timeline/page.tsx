import type { Metadata } from "next";
import { MonthlyColumns } from "@/components/charts/MonthlyColumns";
import { StackedBars } from "@/components/charts/StackedBars";
import { BarList } from "@/components/dashboard/BarList";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { BUCKET_CATEGORIES, COMPLETENESS_CATEGORIES, FORMAT_CATEGORIES, TIMELINESS_CATEGORIES } from "@/components/dashboard/GroupMetrics";
import { Card } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { EXPLAIN } from "@/lib/dashboard/explain";
import { parseFilters, viewPath } from "@/lib/foi/filters";
import { groupScores, monthlyRequests } from "@/lib/foi/metrics";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "ציר זמן" };

export default async function TimelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const auth = await dashboardAuth("timeline", viewPath("/metrics/timeline", f));
  if (!auth.ok) return auth.render;

  const [years, byType, byTopic] = await Promise.all([groupScores(f, "year", 50), monthlyRequests(f, "authorityType", 6), monthlyRequests(f, "topic", 6)]);
  const ordered = [...years].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <DashboardFrame auth={auth} pageKey="timeline" filters={f} keys={["type", "org", "topic", "owner", "project"]} dateLabel="תאריך הגשה">
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title="בקשות שהוגשו לאורך זמן · לפי סוג רשות">
            <MonthlyColumns points={byType} caption="בקשות לפי חודש וסוג רשות" unit="בקשות" />
          </Card>
          <Card title="בקשות שהוגשו לאורך זמן · לפי תחום">
            <MonthlyColumns points={byTopic} caption="בקשות לפי חודש ותחום" unit="בקשות" />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title="עמידה במועדים · לפי שנת הגשה">
            <StackedBars
              rows={ordered.map((g) => ({ label: g.label, counts: { "נענה במועד": g.onTime, "נענה בחריגה": g.late, "בקשה פתוחה": g.open, "נסגרה ללא מענה מלא": g.closedWithoutResponse } }))}
              categories={TIMELINESS_CATEGORIES}
              caption="עמידה במועדים לפי שנה"
            />
          </Card>
          <Card title="זמן עד מענה · לפי שנת הגשה">
            <StackedBars rows={ordered.map((g) => ({ label: g.label, counts: g.buckets }))} categories={BUCKET_CATEGORIES} caption="זמן עד מענה לפי שנה" />
          </Card>
          <Card title="התייחסות לכל הפריטים · לפי שנה">
            <StackedBars rows={ordered.map((g) => ({ label: g.label, counts: g.completeness }))} categories={COMPLETENESS_CATEGORIES} caption="שלמות המענה לפי שנה" />
          </Card>
          <Card title="פורמט מידע טבלאי · לפי שנה">
            <StackedBars rows={ordered.map((g) => ({ label: g.label, counts: g.formats }))} categories={FORMAT_CATEGORIES} caption="פורמט המענה לפי שנה" />
          </Card>
        </div>

        <Card title="אורח חיי הבקשה · ממוצע ימים לפי שנת הגשה">
          <p className="mb-3 text-xs text-muted">{EXPLAIN.lifecycle}</p>
          <BarList
            items={ordered.filter((g) => g.avgLifecycle != null).map((g) => ({ label: g.label, value: Math.round(g.avgLifecycle!), note: `${fmtInt(g.total)} בקשות` }))}
            caption="ממוצע ימים לפי שנה"
            format={(n) => `${fmtInt(n)} ימים`}
            valueHead="ימים"
          />
        </Card>
      </div>
    </DashboardFrame>
  );
}
