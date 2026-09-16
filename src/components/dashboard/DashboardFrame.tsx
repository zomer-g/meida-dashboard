import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { formatDateTime } from "@/components/ui";
import type { DashboardAuth } from "@/lib/auth/guard";
import type { FilterKey } from "@/lib/foi/filter-keys";
import type { Filters } from "@/lib/foi/filters";
import { dataFreshness, filterOptions } from "@/lib/foi/metrics";
import { findPage, PAGES } from "@/lib/pages";
import { FilterBar } from "./FilterBar";
import { SubTabs } from "./SubTabs";

/**
 * The frame of every dashboard page: title, the sub-tabs of its group, the filter
 * row, and a note on where the data came from. A page an admin made public, seen
 * by someone not signed in, gets the site chrome here (the app layout only wraps
 * signed-in users).
 */
export async function DashboardFrame({
  auth,
  pageKey,
  filters,
  keys,
  dateLabel,
  search,
  children,
}: {
  auth: Extract<DashboardAuth, { ok: true }>;
  pageKey: string;
  filters: Filters;
  keys: FilterKey[];
  dateLabel: string;
  search?: string;
  children: ReactNode;
}) {
  const page = findPage(pageKey)!;
  const [options, freshness] = await Promise.all([filterOptions(), dataFreshness()]);
  const allowed = auth.user?.pages ?? [];
  const tabs = PAGES.filter((p) => p.group === page.group && (allowed.includes(p.key) || p.key === pageKey));
  const isAdmin = auth.user?.role === "admin";

  const body = (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink">{page.label}</h1>
          <p className="mt-1 text-muted">{page.description}</p>
        </div>
        {auth.isPublic ? <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">עמוד פומבי</span> : null}
      </header>
      {tabs.length > 1 ? <SubTabs tabs={tabs.map((t) => ({ href: t.path, label: t.label, active: t.key === pageKey }))} /> : null}

      {freshness.total === 0 ? (
        <div className="rounded-card border-2 border-dashed border-line bg-surface p-10 text-center">
          <h2 className="text-xl font-bold">עוד אין נתונים</h2>
          <p className="mt-2 text-muted">
            הדשבורד יתמלא אחרי העלאת קובץ CSV מ-Salesforce או חיבור Salesforce ישירות.
          </p>
          {isAdmin ? (
            <Link href="/admin/data" className="mt-4 inline-block font-semibold text-brand underline underline-offset-4">
              להעלאת נתונים
            </Link>
          ) : null}
        </div>
      ) : (
        <FilterBar
          range={filters.range}
          from={filters.from}
          to={filters.to}
          values={filters.values}
          q={filters.q}
          keys={keys}
          options={options}
          dateLabel={dateLabel}
          search={search}
        >
          {children}
          <p className="mt-10 text-xs text-muted">
            {freshness.sources.includes("salesforce") ? "מקור הנתונים: Salesforce" : "מקור הנתונים: קובצי CSV שהועלו ידנית"} · עודכן לאחרונה{" "}
            {formatDateTime(freshness.lastImport)} · {freshness.total.toLocaleString("he-IL")} בקשות במערכת
          </p>
        </FilterBar>
      )}
    </>
  );

  return auth.user ? body : <AppShell user={null}>{body}</AppShell>;
}
