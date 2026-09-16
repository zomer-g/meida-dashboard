"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { FILTER_KEYS, RANGES, type FilterKey, type RangeKey } from "@/lib/foi/filter-keys";

const segment = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-brand-dark text-white" : "bg-white text-ink ring-1 ring-line hover:bg-accent-light/50"}`;

const selectClass =
  "h-10 w-full rounded-full border border-field bg-white px-3 text-sm text-ink shadow-field focus:outline-hidden focus:ring-2 focus:ring-brand";

const PETITION_OPTIONS = [
  { value: "yes", label: "כן" },
  { value: "no", label: "לא" },
];

/**
 * One filter row above everything it scopes, like the Looker reports it replaces:
 * a date range and a select per dimension. Everything lives in the URL. While the
 * next slice loads, the previous render stays in place at reduced opacity.
 */
export function FilterBar({
  range,
  from,
  to,
  values,
  q,
  keys,
  options,
  dateLabel,
  search,
  children,
}: {
  range: RangeKey;
  from: string | null;
  to: string | null;
  values: Partial<Record<FilterKey, string>>;
  q: string;
  keys: FilterKey[];
  options: Partial<Record<FilterKey, string[]>>;
  /** Which date the range applies to ("תאריך פרסום", "תאריך הגשה"). */
  dateLabel: string;
  search?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState({ from: from ?? "", to: to ?? "" });
  const [query, setQuery] = useState(q);

  function go(next: { range?: RangeKey; set?: [FilterKey, string]; q?: string; reset?: boolean }) {
    const params = new URLSearchParams();
    const nextRange = next.reset ? "all" : (next.range ?? range);
    if (nextRange !== "all") params.set("range", nextRange);
    if (nextRange === "custom") {
      if (custom.from) params.set("from", custom.from);
      if (custom.to) params.set("to", custom.to);
    }
    if (!next.reset) {
      const merged = { ...values };
      if (next.set) merged[next.set[0]] = next.set[1];
      for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
      const text = (next.q ?? query).trim();
      if (search && text) params.set("q", text);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const active = Object.values(values).filter(Boolean).length + (range !== "all" ? 1 : 0) + (q ? 1 : 0);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 rounded-card border border-line bg-accent-light/35 p-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`טווח ${dateLabel}`}>
          <span className="me-1 text-sm font-semibold text-accent">{dateLabel}:</span>
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={range === r.key} className={segment(range === r.key)} onClick={() => go({ range: r.key })}>
              {r.label}
            </button>
          ))}
          {range === "custom" ? (
            <span className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label="מתאריך" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 rounded-full border border-field bg-white px-3 text-sm" />
              <span className="text-muted">עד</span>
              <input type="date" aria-label="עד תאריך" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 rounded-full border border-field bg-white px-3 text-sm" />
              <button type="button" className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover" onClick={() => go({ range: "custom" })}>
                הצגה
              </button>
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {keys.map((k) => {
            const list = k === "petition" ? PETITION_OPTIONS : (options[k] ?? []).map((v) => ({ value: v, label: v }));
            return (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted">{FILTER_KEYS[k]}</span>
                <select className={selectClass} value={values[k] ?? ""} onChange={(e) => go({ set: [k, e.target.value] })}>
                  <option value="">הכל</option>
                  {list.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {values[k] && !list.some((o) => o.value === values[k]) ? <option value={values[k]}>{values[k]}</option> : null}
                </select>
              </label>
            );
          })}
        </div>

        {search ? (
          <form
            role="search"
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              go({});
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={search}
              aria-label={search}
              className="h-10 min-w-[10rem] flex-1 rounded-full border border-field bg-white px-4 text-sm shadow-field placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
            <button type="submit" className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
              חיפוש
            </button>
          </form>
        ) : null}

        {active ? (
          <p className="text-sm">
            <button type="button" className="font-semibold text-accent underline underline-offset-4" onClick={() => go({ reset: true })}>
              ניקוי כל הסינונים ({active})
            </button>
          </p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {pending ? "טוען נתונים…" : ""}
      </p>
      <div aria-busy={pending} className={`transition-opacity ${pending ? "opacity-50" : "opacity-100"}`}>
        {children}
      </div>
    </>
  );
}
