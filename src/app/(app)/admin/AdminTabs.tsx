"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/user-types", label: "סוגי משתמשים" },
  { href: "/admin/pages", label: "עמודים פומביים" },
  { href: "/admin/data", label: "העלאת נתונים", editor: true },
  { href: "/admin/lookups", label: "טבלאות עזר", editor: true },
  { href: "/admin/integrations", label: "חיבורים" },
  { href: "/admin/salesforce", label: "Salesforce" },
  { href: "/admin/sync", label: "סנכרון" },
  { href: "/admin/mcp", label: "MCP" },
  { href: "/admin/texts", label: "טקסטים" },
  { href: "/admin/audit", label: "יומן פעילות" },
];

/** Editors reach only the data screens; everything else is admin-only. */
export function AdminTabs({ role = "admin" }: { role?: "admin" | "editor" | "viewer" }) {
  const pathname = usePathname();
  return (
    <nav aria-label="לשוניות ניהול" className="mb-8 flex flex-wrap gap-2 border-b-2 border-line pb-3">
      {TABS.filter((t) => role === "admin" || ("editor" in t && t.editor)).map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-5 py-2 text-sm font-medium ${
              active ? "bg-brand-dark text-white" : "bg-surface text-ink hover:bg-panel"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
