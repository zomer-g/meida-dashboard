"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { useActiveInStrip } from "../useActiveInStrip";

/**
 * The pages of one group (e.g. the request metrics), one level below the main nav.
 * Links keep the current filters, so switching tabs keeps the same slice.
 */
export function SubTabs({ tabs }: { tabs: { href: string; label: string; active: boolean }[] }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  const search = useSearchParams();
  const query = search.toString();
  useActiveInStrip(activeRef, tabs.find((t) => t.active)?.href ?? "");

  return (
    <nav className="mb-6 flex items-center gap-1 overflow-x-auto rounded-full bg-panel p-1.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible" aria-label="עמודי הקבוצה">
      {tabs.map((t) => (
        <Link
          key={t.href}
          ref={t.active ? activeRef : undefined}
          href={query ? `${t.href}?${query}` : t.href}
          aria-current={t.active ? "page" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            t.active ? "bg-white text-accent shadow-sm ring-1 ring-brand" : "text-ink hover:bg-white/70"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
