import { DataTable } from "./DataTable";
import { fmtNum, fmtPct } from "./palette";

export interface StackRow {
  label: string;
  counts: Record<string, number>;
}

export interface StackCategory {
  key: string;
  label?: string;
  color: string;
}

/**
 * One 100% bar per row (an organization, a type, a year), split into ordered
 * categories. Rows keep their order; each segment is separated by a 2px surface
 * gap and names itself on hover, and the row's total is written beside it.
 */
export function StackedBars({ rows, categories, caption }: { rows: StackRow[]; categories: StackCategory[]; caption: string }) {
  const visible = rows.filter((r) => categories.some((c) => (r.counts[c.key] ?? 0) > 0));
  if (!visible.length) return <p className="py-8 text-center text-sm text-muted">אין נתונים בסינון הזה</p>;

  return (
    <figure className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label={`מקרא · ${caption}`}>
        {categories.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: c.color }} aria-hidden />
            {c.label ?? c.key}
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2.5" aria-label={caption}>
        {visible.map((row) => {
          const total = categories.reduce((s, c) => s + (row.counts[c.key] ?? 0), 0);
          const summary = categories
            .filter((c) => row.counts[c.key])
            .map((c) => `${c.label ?? c.key}: ${fmtNum(row.counts[c.key]!)} (${fmtPct(row.counts[c.key]!, total)})`)
            .join(" · ");
          return (
            <li key={row.label} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-3 text-sm max-sm:grid-cols-[1fr_auto]">
              <span className="truncate text-ink max-sm:col-span-2" title={row.label}>
                {row.label}
              </span>
              <div className="flex h-5 w-full gap-[2px] overflow-hidden" role="img" aria-label={`${row.label}: ${summary}`}>
                {categories.map((c) => {
                  const n = row.counts[c.key] ?? 0;
                  if (!n) return null;
                  return (
                    <div
                      key={c.key}
                      className="h-full first:rounded-s-none last:rounded-e-[4px] hover:opacity-80"
                      style={{ width: `${(n / total) * 100}%`, background: c.color, minWidth: 2 }}
                      title={`${row.label} · ${c.label ?? c.key}: ${fmtNum(n)} (${fmtPct(n, total)})`}
                    />
                  );
                })}
              </div>
              <span className="w-10 text-end tabular-nums text-muted">{fmtNum(total)}</span>
            </li>
          );
        })}
      </ul>
      <DataTable
        caption={caption}
        head={["", ...categories.map((c) => c.label ?? c.key), "סה״כ"]}
        rows={visible.map((r) => [
          r.label,
          ...categories.map((c) => fmtNum(r.counts[c.key] ?? 0)),
          fmtNum(categories.reduce((s, c) => s + (r.counts[c.key] ?? 0), 0)),
        ])}
      />
    </figure>
  );
}
