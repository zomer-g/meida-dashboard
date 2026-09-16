import type { Metadata } from "next";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { GroupMetrics } from "@/components/dashboard/GroupMetrics";
import { dashboardAuth } from "@/lib/auth/guard";
import { parseFilters, viewPath } from "@/lib/foi/filters";

export const metadata: Metadata = { title: "תחומי פעילות" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const auth = await dashboardAuth("topics", viewPath("/metrics/topics", f));
  if (!auth.ok) return auth.render;

  return (
    <DashboardFrame auth={auth} pageKey="topics" filters={f} keys={["type", "org", "topic", "owner", "project"]} dateLabel="תאריך הגשה">
      <GroupMetrics filters={f} dim="topic" limit={20} showOverdue={false} />
    </DashboardFrame>
  );
}
