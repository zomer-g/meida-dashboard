import { DataTable } from "./DataTable";
import { colorFor, fmtNum, fmtPct, foldTail, type Slice } from "./palette";

const R = 80;
const INNER = 50;
const GAP_DEG = 1.2;

function arc(start: number, end: number): string {
  const pt = (angle: number, r: number) => {
    const a = ((angle - 90) * Math.PI) / 180;
    return `${100 + r * Math.cos(a)} ${100 + r * Math.sin(a)}`;
  };
  const large = end - start > 180 ? 1 : 0;
  return `M ${pt(start, R)} A ${R} ${R} 0 ${large} 1 ${pt(end, R)} L ${pt(end, INNER)} A ${INNER} ${INNER} 0 ${large} 0 ${pt(start, INNER)} Z`;
}

/**
 * Share of a whole, for a handful of parts: the largest seven keep their own
 * color, the rest fold into "אחר". Every part is named with its count and share
 * in the legend, so the ring never has to be read by color alone.
 */
export function Donut({ items, caption, centerLabel, top = 7 }: { items: Slice[]; caption: string; centerLabel?: string; top?: number }) {
  const slices = foldTail(items.filter((i) => i.value > 0), top);
  const total = slices.reduce((s, i) => s + i.value, 0);
  if (!total) return <p className="py-8 text-center text-sm text-muted">אין נתונים בסינון הזה</p>;

  let angle = 0;
  const gap = slices.length > 1 ? GAP_DEG : 0;
  return (
    <figure className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-5">
        <svg viewBox="0 0 200 200" className="size-48 shrink-0" role="img" aria-label={`${caption}: ${slices.map((s) => `${s.label} ${fmtPct(s.value, total)}`).join(", ")}`}>
          {slices.map((s, i) => {
            const sweep = (s.value / total) * 360;
            const start = angle + gap / 2;
            const end = angle + Math.max(sweep - gap / 2, start - angle + 0.01);
            angle += sweep;
            const d = sweep >= 359.99 ? null : arc(start, end);
            return d ? (
              <path key={s.label} d={d} style={{ fill: colorFor(s.label, i) }} className="transition-opacity hover:opacity-80">
                <title>{`${s.label}: ${fmtNum(s.value)} (${fmtPct(s.value, total)})`}</title>
              </path>
            ) : (
              <circle key={s.label} cx="100" cy="100" r={(R + INNER) / 2} fill="none" style={{ stroke: colorFor(s.label, i) }} strokeWidth={R - INNER}>
                <title>{`${s.label}: ${fmtNum(s.value)}`}</title>
              </circle>
            );
          })}
          <text x="100" y="98" textAnchor="middle" className="fill-ink text-[28px] font-bold">
            {fmtNum(total)}
          </text>
          {centerLabel ? (
            <text x="100" y="122" textAnchor="middle" className="fill-muted text-[13px]">
              {centerLabel}
            </text>
          ) : null}
        </svg>
        <ul className="flex w-full min-w-0 flex-col gap-1.5 text-sm" aria-label={`מקרא · ${caption}`}>
          {slices.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: colorFor(s.label, i) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink" title={s.label}>
                {s.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                <span className="font-semibold text-ink">{fmtNum(s.value)}</span> · {fmtPct(s.value, total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <DataTable
        caption={caption}
        head={["פריט", "כמות", "שיעור"]}
        rows={foldTail(items, 1000).map((s) => [s.label, fmtNum(s.value), fmtPct(s.value, total)])}
      />
    </figure>
  );
}
