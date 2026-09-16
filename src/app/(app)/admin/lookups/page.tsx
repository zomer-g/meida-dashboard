import { asc, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, PageHeader, smallFieldClass, Table } from "@/components/ui";
import { pageAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { mediaOutlets, organizations, requestPublications, requests } from "@/lib/db/schema";
import { AUTHORITY_TYPES, MEDIA_CATEGORIES } from "@/lib/foi/classify";
import { fmtInt } from "@/lib/format";
import { AdminTabs } from "../AdminTabs";
import { setAuthorityType, setOutlet } from "./actions";

export const metadata: Metadata = { title: "טבלאות עזר" };

export default async function LookupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const tab = search.tab === "outlets" ? "outlets" : "orgs";
  const onlyUnclassified = search.only === "unclassified";
  const auth = await pageAuth("editor", `/admin/lookups?tab=${tab}`);
  if (!auth.ok) return auth.render;

  const db = getDb();
  const orgs =
    tab === "orgs"
      ? await db
          .select({ name: organizations.name, type: organizations.authorityType, manual: organizations.manual, n: sql<number>`count(${requests.caseNumber})::int` })
          .from(organizations)
          .leftJoin(requests, eq(requests.organization, organizations.name))
          .where(onlyUnclassified ? eq(organizations.authorityType, "טרם סווג") : undefined)
          .groupBy(organizations.name)
          .orderBy(desc(sql`4`), asc(organizations.name))
      : [];
  const outlets =
    tab === "outlets"
      ? await db
          .select({ domain: mediaOutlets.domain, name: mediaOutlets.name, category: mediaOutlets.category, manual: mediaOutlets.manual, n: sql<number>`count(${requestPublications.caseNumber})::int` })
          .from(mediaOutlets)
          .leftJoin(requestPublications, eq(requestPublications.domain, mediaOutlets.domain))
          .where(onlyUnclassified ? eq(mediaOutlets.category, "טרם סווג") : undefined)
          .groupBy(mediaOutlets.domain)
          .orderBy(desc(sql`5`), asc(mediaOutlets.domain))
      : [];

  const tabLink = (t: string, label: string) => (
    <Link href={`?tab=${t}${onlyUnclassified ? "&only=unclassified" : ""}`} aria-current={tab === t ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t ? "bg-brand-dark text-white" : "bg-surface hover:bg-panel"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="ניהול · טבלאות עזר" subtitle="סיווגים שלא קיימים ב-Salesforce ומשמשים את הגרפים: סוג כל רשות, ושם וקטגוריה לכל גוף תקשורת" />
      <AdminTabs role={auth.user.role} />

      <nav className="mb-6 flex flex-wrap items-center gap-2" aria-label="טבלאות">
        {tabLink("orgs", "סוגי רשויות")}
        {tabLink("outlets", "גופי תקשורת")}
        <Link href={`?tab=${tab}${onlyUnclassified ? "" : "&only=unclassified"}`} className="ms-auto text-sm font-semibold text-accent underline underline-offset-4">
          {onlyUnclassified ? "הצגת הכל" : "רק מה שטרם סווג"}
        </Link>
      </nav>

      {tab === "orgs" ? (
        <Card title={`ארגונים (${fmtInt(orgs.length)})`}>
          <p className="mb-4 text-sm text-muted">הסיווג הראשוני נקבע לפי השם (למשל "משרד…" ← משרד ממשלתי). שינוי ידני נשמר ולא נדרס בהעלאות הבאות.</p>
          <Table caption="סוגי רשויות" head={["ארגון", "בקשות", "סוג רשות", ""]} empty={orgs.length ? undefined : "אין ארגונים להצגה"}>
            {orgs.map((o) => (
              <tr key={o.name}>
                <td className="px-3 py-2 font-semibold">{o.name}</td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(o.n)}</td>
                <td className="px-3 py-2" colSpan={2}>
                  <form action={setAuthorityType} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="name" value={o.name} />
                    <select name="type" defaultValue={o.type} className={smallFieldClass} aria-label={`סוג רשות · ${o.name}`}>
                      {AUTHORITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button className={buttonClass("secondary", "sm")}>
                      שמירה<span className="sr-only"> · {o.name}</span>
                    </button>
                    {o.manual ? <Badge tone="accent">עודכן ידנית</Badge> : null}
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : (
        <Card title={`גופי תקשורת (${fmtInt(outlets.length)})`}>
          <p className="mb-4 text-sm text-muted">כל דומיין של קישור פרסום הוא גוף תקשורת. אפשר לתת לכמה דומיינים אותו שם (למשל haaretz.co.il ו-haaretz.com), והם יאוחדו בגרפים.</p>
          <Table caption="גופי תקשורת" head={["דומיין", "פרסומים", "שם וקטגוריה", ""]} empty={outlets.length ? undefined : "אין גופי תקשורת להצגה"}>
            {outlets.map((o) => (
              <tr key={o.domain}>
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                  {o.domain}
                </td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(o.n)}</td>
                <td className="px-3 py-2" colSpan={2}>
                  <form action={setOutlet} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="domain" value={o.domain} />
                    <input name="name" defaultValue={o.name} required className={`${smallFieldClass} w-48`} aria-label={`שם · ${o.domain}`} />
                    <select name="category" defaultValue={o.category} className={smallFieldClass} aria-label={`קטגוריה · ${o.domain}`}>
                      {MEDIA_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button className={buttonClass("secondary", "sm")}>
                      שמירה<span className="sr-only"> · {o.domain}</span>
                    </button>
                    {o.manual ? <Badge tone="accent">עודכן ידנית</Badge> : null}
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
