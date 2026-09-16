import { eachMonth, formatMonth } from "@/lib/dashboard/params";
import { DataTable } from "./DataTable";
import { colorFor, fmtNum, OTHER_LABEL } from "./palette";

export interface MonthlyPoint {
  month: string;
  label: string;
  n: number;
}

const W = 760;
const H = 220;
const PAD = { top: 12, bottom: 28, start: 36, end: 8 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/**
 * Counts per month as stacked columns, one series per value (the largest few,
 * the rest as "אחר"). Long ranges switch to quarters so a column never gets thinner
 * than a few pixels. Every column names its month and each series on hover.
 */
export function MonthlyColumns({ points, caption, unit }: { points: MonthlyPoint[]; caption: string; unit: string }) {
  if (!points.length) return <p className="py-8 text-center text-sm text-muted">אין נתונים בסינון הזה</p>;

  const byLabel = new Map<string, number>();
  for (const p of points) byLabel.set(p.label, (byLabel.get(p.label) ?? 0) + p.n);
  const labels = [...byLabel.entries()].sort((a, b) => (a[0] === OTHER_LABEL ? 1 : b[0] === OTHER_LABEL ? -1 : b[1] - a[1])).map(([l]) => l);

  const months = eachMonth(points.reduce((m, p) => (p.month < m ? p.month : m), points[0]!.month), points.reduce((m, p) => (p.month > m ? p.month : m), points[0]!.month));
  const quarterly = months.length > 48;
  const bucketOf = (month: string) => (quarterly ? `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}` : month);
  const buckets = [...new Set(months.map(bucketOf))];
  const bucketLabel = (b: string) => (quarterly ? `${b.slice(5)} ${b.slice(2, 4)}` : formatMonth(b));

  const grid = new Map<string, Map<string, number>>();
  for (const b of buckets) grid.set(b, new Map());
  for (const p of points) {
    const cell = grid.get(bucketOf(p.month))!;
    cell.set(p.label, (cell.get(p.label) ?? 0) + p.n);
  }
  const totals = buckets.map((b) => [...grid.get(b)!.values()].reduce((s, n) => s + n, 0));
  const max = niceMax(Math.max(...totals));

  const plotW = W - PAD.start - PAD.end;
  const plotH = H - PAD.top - PAD.bottom;
  const step = plotW / buckets.length;
  const barW = Math.max(2, step - Math.min(6, step * 0.3));
  const labelEvery = Math.ceil(buckets.length / 12);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  return (
    <figure className="flex flex-col gap-3">
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
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${caption}, ${quarterly ? "לפי רבעון" : "לפי חודש"}`} direction="ltr">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.start} x2={W - PAD.end} y1={y(max * t)} y2={y(max * t)} style={{ stroke: "var(--color-line)" }} strokeWidth={1} />
            <text x={PAD.start - 6} y={y(max * t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {fmtNum(max * t)}
            </text>
          </g>
        ))}
        {buckets.map((b, bi) => {
          const x = PAD.start + bi * step + (step - barW) / 2;
          let acc = 0;
          const cell = grid.get(b)!;
          return (
            <g key={b} className="hover:opacity-80">
              <title>{`${bucketLabel(b)}: ${fmtNum(totals[bi]!)} ${unit}${labels.length > 1 ? `\n${labels.filter((l) => cell.get(l)).map((l) => `${l}: ${fmtNum(cell.get(l)!)}`).join("\n")}` : ""}`}</title>
              {/* Invisible full-height hit area, so thin columns are easy to hover. */}
              <rect x={PAD.start + bi * step} y={PAD.top} width={step} height={plotH} fill="transparent" />
              {labels.map((l, li) => {
                const n = cell.get(l) ?? 0;
                if (!n) return null;
                const top = y(acc + n);
                const h = y(acc) - top;
                acc += n;
                const isTop = acc === totals[bi];
                return <rect key={l} x={x} y={top + (isTop ? 0 : 1)} width={barW} height={Math.max(h - (isTop ? 0 : 1), 0.5)} rx={isTop ? Math.min(3, barW / 3) : 0} style={{ fill: colorFor(l, li) }} />;
              })}
              {bi % labelEvery === 0 ? (
                <text x={PAD.start + bi * step + step / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
                  {bucketLabel(b)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <DataTable
        caption={caption}
        head={[quarterly ? "רבעון" : "חודש", ...labels, "סה״כ"]}
        rows={buckets.map((b, bi) => [bucketLabel(b), ...labels.map((l) => fmtNum(grid.get(b)!.get(l) ?? 0)), fmtNum(totals[bi]!)])}
      />
    </figure>
  );
}
