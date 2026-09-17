import type { Metadata } from "next";
import Link from "next/link";
import { Donut } from "@/components/charts/Donut";
import { TimeColumns } from "@/components/charts/TimeColumns";
import { BarList } from "@/components/dashboard/BarList";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { Badge, Card, formatDateTime, StatCard, Table } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { EXPLAIN } from "@/lib/dashboard/explain";
import { formatDay } from "@/lib/dashboard/params";
import { parseFilters, viewPath } from "@/lib/foi/filters";
import { webMetrics } from "@/lib/foi/web-metrics";
import { fmtInt, fmtPercent } from "@/lib/format";
import { integrationStatus } from "@/lib/integrations";

export const metadata: Metadata = { title: "אתר ודיוור" };

export default async function WebPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const auth = await dashboardAuth("web", viewPath("/web", f));
  if (!auth.ok) return auth.render;

  const m = await webMetrics(f);
  const status = Object.fromEntries(integrationStatus().map((i) => [i.key, i.configured]));
  const isAdmin = auth.user?.role === "admin";
  const notConnected = (name: string) => (
    <div className="rounded-card border-2 border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
      {name} עדיין לא מחובר.{" "}
      {isAdmin ? (
        <Link href="/admin/integrations" className="font-semibold text-brand underline underline-offset-4">
          להגדרת החיבור
        </Link>
      ) : (
        "הנתונים יופיעו כאן אחרי שמנהלי המערכת יחברו אותו."
      )}
    </div>
  );

  return (
    <DashboardFrame auth={auth} pageKey="web" filters={f} keys={[]} dateLabel="תאריך">
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted">
          טווח: {formatDay(m.from)} – {formatDay(m.to)} {f.range === "all" ? "(ב״כל התקופה״ מוצגים 12 החודשים האחרונים)" : ""}
        </p>

        <section aria-labelledby="ga-heading" className="flex flex-col gap-6">
          <h2 id="ga-heading" className="text-2xl font-bold">
            האתר · Google Analytics
          </h2>
          {!status.ga4 && m.sessions === 0 ? (
            notConnected("Google Analytics")
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="כניסות" value={fmtInt(m.sessions)} info={EXPLAIN.sessions} />
                <StatCard label="משתמשים חדשים" value={fmtInt(m.newUsers)} info={EXPLAIN.newUsers} />
                <StatCard label="צפיות בדפים" value={fmtInt(m.pageViews)} info={EXPLAIN.pageViews} />
                <StatCard label="מעורבות" value={fmtPercent(m.engaged, m.sessions)} info={EXPLAIN.engagement} />
              </div>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card title="כניסות לאורך זמן לפי ערוץ" className="xl:col-span-2">
                  <TimeColumns points={m.overTime} caption="כניסות לאורך זמן לפי ערוץ" unit="כניסות" />
                </Card>
                <Card title="ערוצי הגעה">
                  <Donut items={m.channels.map((c) => ({ label: c.label, value: Number(c.n) }))} caption="כניסות לפי ערוץ" centerLabel="כניסות" top={6} />
                </Card>
              </div>
              <Card title="הדפים הנצפים ביותר">
                <BarList items={m.pages.map((p) => ({ label: p.title || p.path, value: Number(p.views) }))} caption="צפיות לפי דף" showShareOf={m.pageViews} />
              </Card>
            </>
          )}
        </section>

        <section aria-labelledby="smoov-heading" className="flex flex-col gap-6">
          <h2 id="smoov-heading" className="text-2xl font-bold">
            דיוורים · SMOOV
          </h2>
          {!status.smoov && m.campaigns.length === 0 ? (
            notConnected("SMOOV")
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <StatCard label="רשימות תפוצה" value={fmtInt(m.lists)} />
                <StatCard label="אנשי קשר ברשימות" value={fmtInt(m.contacts)} hint="כולל כפילויות בין רשימות" />
                <StatCard label="דיוורים במעקב" value={fmtInt(m.campaigns.length)} />
              </div>
              <Card title="דיוורים">
                <Table caption="דיוורים" head={["דיוור", "נשלח", "נמענים", "פתיחות", "הקלקות", "הסרות", "UTM"]} empty={m.campaigns.length ? undefined : "עוד לא נוספו דיוורים למעקב (ניהול › חיבורים)"}>
                  {m.campaigns.map(({ campaign, stats }) => (
                    <tr key={campaign.id}>
                      <td className="px-3 py-2 font-semibold">{campaign.label}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(stats?.sentAt)}</td>
                      <td className="px-3 py-2 tabular-nums">{stats?.sent == null ? "—" : fmtInt(stats.sent)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {stats?.opens == null ? "—" : fmtInt(stats.opens)} <span className="text-xs text-muted">{fmtPercent(stats?.opens ?? 0, stats?.sent ?? 0)}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {stats?.clicks == null ? "—" : fmtInt(stats.clicks)} <span className="text-xs text-muted">{fmtPercent(stats?.clicks ?? 0, stats?.sent ?? 0)}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{stats?.unsubscribes == null ? "—" : fmtInt(stats.unsubscribes)}</td>
                      <td className="px-3 py-2 text-xs" dir="ltr">
                        {campaign.utmCampaign ? <Badge>{campaign.utmCampaign}</Badge> : "—"}
                      </td>
                    </tr>
                  ))}
                </Table>
              </Card>
            </>
          )}
        </section>
      </div>
    </DashboardFrame>
  );
}
