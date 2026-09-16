import type { ReactNode } from "react";

/** The accessible twin of every chart: a collapsed table holding every value. */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-accent underline-offset-4 hover:underline">הצגה כטבלה</summary>
      <div className="relative mt-2 max-h-80 overflow-auto" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full text-start">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              {head.map((h) => (
                <th key={h} scope="col" className="px-2 py-1 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-b border-line/60">
                {cells.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-2 py-1 text-start font-normal">
                      {c}
                    </th>
                  ) : (
                    <td key={j} className="px-2 py-1 tabular-nums">
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
