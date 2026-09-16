import Link from "next/link";
import { fmtInt } from "@/lib/format";

/** Previous / next links that keep every other query parameter. */
export function Pager({
  page,
  pageSize,
  total,
  search,
}: {
  page: number;
  pageSize: number;
  total: number;
  search: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(search)) if (typeof v === "string" && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `?${s}` : "?";
  };
  const link = "rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-line hover:bg-accent-light/50";
  return (
    <nav aria-label="דפדוף" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        עמוד {fmtInt(page)} מתוך {fmtInt(pages)} · {fmtInt(total)} שורות
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={link} scroll={false}>
            הקודם
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={link} scroll={false}>
            הבא
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
