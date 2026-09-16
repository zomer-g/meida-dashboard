"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { PAGES, type PageGroup } from "@/lib/pages";
import { useActiveInStrip } from "./useActiveInStrip";

interface NavItem {
  href: string;
  label: string;
  /** Path prefixes (besides href itself) that belong to this item. */
  also?: string[];
}

const GROUP_LABELS: Record<PageGroup, string> = {
  media: "דוח תקשורת",
  metrics: "מדדי בקשות",
  petitions: "עתירות",
  requests: "רשימת בקשות",
  web: "אתר ודיוור",
  finance: "כספים",
};

/** One item per page group, pointing at the first page of the group the user may open. */
function itemsFor(pages: string[]): NavItem[] {
  const items: NavItem[] = [];
  for (const group of Object.keys(GROUP_LABELS) as PageGroup[]) {
    const allowed = PAGES.filter((p) => p.group === group && pages.includes(p.key));
    if (!allowed.length) continue;
    items.push({ href: allowed[0]!.path, label: GROUP_LABELS[group], also: allowed.map((p) => p.path).filter((p) => p !== "/") });
  }
  return items;
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) return true;
  return (item.also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** One scrolling row on phones, wrapping from `lg` up. */
export function NavLinks({ pages, role, className = "" }: { pages: string[]; role: "admin" | "editor" | "viewer" | null; className?: string }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  useActiveInStrip(activeRef, pathname);
  const items = itemsFor(pages);
  if (role === "admin") items.push({ href: "/admin/users", label: "ניהול", also: ["/admin"] });
  if (role === "editor") items.push({ href: "/admin/data", label: "נתונים", also: ["/admin"] });
  if (!items.length) return null;

  return (
    <nav className={`flex items-center gap-1 overflow-x-auto p-1 [scrollbar-width:thin] lg:flex-wrap lg:overflow-visible ${className}`} aria-label="ניווט ראשי">
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            ref={active ? activeRef : undefined}
            href={item.href}
            aria-current={active ? (pathname === item.href ? "page" : "true") : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 font-semibold transition-colors sm:px-4 ${
              active ? "bg-brand-dark text-white" : "text-ink hover:bg-accent-light/60"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
