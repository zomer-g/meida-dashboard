import type { Metadata } from "next";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { GroupMetrics } from "@/components/dashboard/GroupMetrics";
import { dashboardAuth } from "@/lib/auth/guard";
import { parseFilters, viewPath } from "@/lib/foi/filters";

export const metadata: Metadata = { title: "רשויות" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const auth = await dashboardAuth("authorities", viewPath("/metrics/authorities", f));
  if (!auth.ok) return auth.render;

  return (
    <DashboardFrame auth={auth} pageKey="authorities" filters={f} keys={["type", "org", "topic", "owner", "project"]} dateLabel="תאריך הגשה">
      <GroupMetrics filters={f} dim="organization" limit={15} showOverdue={true} />
    </DashboardFrame>
  );
}
