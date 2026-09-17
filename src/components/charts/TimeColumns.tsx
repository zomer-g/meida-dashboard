"use client";

import { useMemo, useState } from "react";
import { DataTable } from "./DataTable";
import { colorFor, fmtNum, OTHER_LABEL } from "./palette";

/** One count on one day, for one series. The chart sums days into the chosen resolution. */
export interface TimePoint {
  day: string; // YYYY-MM-DD
  label: string;
  n: number;
}

export type Resolution = "week" | "month" | "quarter" | "year";

const RESOLUTIONS: { key: Resolution; label: string; noun: string }[] = [
  { key: "week", label: "שבוע", noun: "שבוע" },
  { key: "month", label: "חודש", noun: "חודש" },
  { key: "quarter", label: "רבעון", noun: "רבעון" },
  { key: "year", label: "שנה", noun: "שנה" },
];

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

const W = 760;
const H = 220;
const PAD = { top: 12, bottom: 28, start: 36, end: 8 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

const utc = (day: string) => new Date(`${day}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The period a day belongs to. Weeks start on Sunday, the Israeli work week. */
function periodOf(day: string, r: Resolution): string {
  const y = day.slice(0, 4);
  const m = Number(day.slice(5, 7));
  if (r === "year") return y;
  if (r === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  if (r === "month") return day.slice(0, 7);
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return iso(d);
}

function nextPeriod(p: string, r: Resolution): string {
  if (r === "year") return String(Number(p) + 1);
  if (r === "quarter") {
    const [y, q] = [Number(p.slice(0, 4)), Number(p.slice(6))];
    return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
  }
  if (r === "month") {
    const [y, m] = [Number(p.slice(0, 4)), Number(p.slice(5, 7))];
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  const d = utc(p);
  d.setUTCDate(d.getUTCDate() + 7);
  return iso(d);
}

function periodLabel(p: string, r: Resolution): string {
  if (r === "year") return p;
  if (r === "quarter") return `${p.slice(5)} ${p.slice(2, 4)}`;
  if (r === "month") return `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;
  return `${p.slice(8, 10)}.${p.slice(5, 7)}.${p.slice(2, 4)}`;
}

/** A sensible first view: weeks for a short span, quarters for many years. */
function defaultResolution(first: string, last: string): Resolution {
  const days = (utc(last).getTime() - utc(first).getTime()) / 86_400_000;
  if (days <= 180) return "week";
  if (days <= 4 * 366) return "month";
  return "quarter";
}

/**
 * Counts over time as stacked columns, one series per value (the largest few, the
 * rest as "אחר"), with a switch between weeks, months, quarters and years. Every
 * column names its period and each series on hover; the table holds every value.
 */
export function TimeColumns({ points, caption, unit }: { points: TimePoint[]; caption: string; unit: string }) {
  const [first, last] = useMemo(() => {
    let a = points[0]?.day ?? "";
    let b = a;
    for (const p of points) {
      if (p.day < a) a = p.day;
      if (p.day > b) b = p.day;
    }
    return [a, b];
  }, [points]);
  const [resolution, setResolution] = useState<Resolution>(() => (points.length ? defaultResolution(first, last) : "month"));

  const chart = useMemo(() => {
    if (!points.length) return null;
    const totalsByLabel = new Map<string, number>();
    for (const p of points) totalsByLabel.set(p.label, (totalsByLabel.get(p.label) ?? 0) + p.n);
    const labels = [...totalsByLabel.entries()]
      .sort((a, b) => (a[0] === OTHER_LABEL ? 1 : b[0] === OTHER_LABEL ? -1 : b[1] - a[1]))
      .map(([l]) => l);

    const periods: string[] = [];
    const end = periodOf(last, resolution);
    for (let p = periodOf(first, resolution); periods.length < 2000; p = nextPeriod(p, resolution)) {
      periods.push(p);
      if (p === end) break;
    }
    const grid = new Map(periods.map((p) => [p, new Map<string, number>()]));
    for (const pt of points) {
      const cell = grid.get(periodOf(pt.day, resolution));
      if (cell) cell.set(pt.label, (cell.get(pt.label) ?? 0) + pt.n);
    }
    const totals = periods.map((p) => [...grid.get(p)!.values()].reduce((s, n) => s + n, 0));
    return { labels, periods, grid, totals, max: niceMax(Math.max(...totals)) };
  }, [points, first, last, resolution]);

  if (!chart) return <p className="py-8 text-center text-sm text-muted">אין נתונים בסינון הזה</p>;
  const { labels, periods, grid, totals, max } = chart;
  const noun = RESOLUTIONS.find((r) => r.key === resolution)!.noun;

  const plotW = W - PAD.start - PAD.end;
  const plotH = H - PAD.top - PAD.bottom;
  const step = plotW / periods.length;
  const barW = Math.max(1, step - Math.min(6, step * 0.3));
  const labelEvery = Math.ceil(periods.length / 10);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-full bg-panel p-1" role="group" aria-label={`רזולוציית זמן · ${caption}`}>
          {RESOLUTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={resolution === r.key}
              onClick={() => setResolution(r.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                resolution === r.key ? "bg-white text-accent shadow-sm ring-1 ring-brand" : "text-ink hover:bg-white/70"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {labels.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label={`מקרא · ${caption}`}>
            {labels.map((l, i) => (
              <li key={l} className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ background: colorFor(l, i) }} aria-hidden />
                {l}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${caption}, לפי ${noun}`} direction="ltr">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.start} x2={W - PAD.end} y1={y(max * t)} y2={y(max * t)} style={{ stroke: "var(--color-line)" }} strokeWidth={1} />
            <text x={PAD.start - 6} y={y(max * t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {fmtNum(max * t)}
            </text>
          </g>
        ))}
        {periods.map((p, pi) => {
          const x = PAD.start + pi * step + (step - barW) / 2;
          let acc = 0;
          const cell = grid.get(p)!;
          return (
            <g key={p} className="hover:opacity-80">
              <title>{`${periodLabel(p, resolution)}: ${fmtNum(totals[pi]!)} ${unit}${
                labels.length > 1 ? `\n${labels.filter((l) => cell.get(l)).map((l) => `${l}: ${fmtNum(cell.get(l)!)}`).join("\n")}` : ""
              }`}</title>
              {/* Invisible full-height hit area, so thin columns are easy to hover. */}
              <rect x={PAD.start + pi * step} y={PAD.top} width={step} height={plotH} fill="transparent" />
              {labels.map((l, li) => {
                const n = cell.get(l) ?? 0;
                if (!n) return null;
                const top = y(acc + n);
                const h = y(acc) - top;
                acc += n;
                const isTop = acc === totals[pi];
                const gap = !isTop && barW > 3 ? 1 : 0;
                return (
                  <rect
                    key={l}
                    x={x}
                    y={top + gap}
                    width={barW}
                    height={Math.max(h - gap, 0.5)}
                    rx={isTop ? Math.min(3, barW / 3) : 0}
                    style={{ fill: colorFor(l, li) }}
                  />
                );
              })}
              {pi % labelEvery === 0 ? (
                <text x={PAD.start + pi * step + step / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
                  {periodLabel(p, resolution)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <DataTable
        caption={`${caption}, לפי ${noun}`}
        head={[noun, ...labels, "סה״כ"]}
        rows={periods.map((p, pi) => [periodLabel(p, resolution), ...labels.map((l) => fmtNum(grid.get(p)!.get(l) ?? 0)), fmtNum(totals[pi]!)])}
      />
    </figure>
  );
}
