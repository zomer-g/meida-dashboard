import { desc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, formatDateTime, PageHeader, StatCard, Table } from "@/components/ui";
import { pageAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { dataImports, requestPublications, requests } from "@/lib/db/schema";
import { salesforceConfigured } from "@/lib/sf/client";
import { fmtInt } from "@/lib/format";
import { AdminTabs } from "../AdminTabs";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = { title: "העלאת נתונים" };

const KIND: Record<string, string> = { requests: "ייצוא בקשות מלא", media: "דוח תקשורת", mixed: "דוח משולב" };

export default async function DataPage() {
  const auth = await pageAuth("editor", "/admin/data");
  if (!auth.ok) return auth.render;

  const db = getDb();
  const [imports, [counts], [pubs]] = await Promise.all([
    db.select().from(dataImports).orderBy(desc(dataImports.importedAt)).limit(30),
    db
      .select({
        total: sql<number>`count(*)::int`,
        csv: sql<number>`(count(*) filter (where ${requests.source} = 'csv'))::int`,
        sf: sql<number>`(count(*) filter (where ${requests.source} = 'salesforce'))::int`,
      })
      .from(requests),
    db.select({ n: sql<number>`count(*)::int` }).from(requestPublications),
  ]);

  return (
    <>
      <PageHeader title="ניהול · העלאת נתונים" subtitle="עד לחיבור Salesforce, הדשבורד נשען על קובצי ייצוא מהדוחות" />
      <AdminTabs role={auth.user.role} />

      <div className="flex flex-col gap-8">
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="מצב הנתונים">
          <StatCard label="בקשות במערכת" value={fmtInt(counts?.total ?? 0)} />
          <StatCard label="מקובצי CSV" value={fmtInt(counts?.csv ?? 0)} />
          <StatCard label="מ-Salesforce" value={fmtInt(counts?.sf ?? 0)} hint={salesforceConfigured() ? "החיבור מוגדר" : "טרם חובר"} />
          <StatCard label="פרסומים" value={fmtInt(pubs?.n ?? 0)} />
        </section>

        <Card title="העלאת קבצים">
          <div className="mb-4 flex flex-col gap-2 text-sm text-muted">
            <p>
              מייצאים ב-Salesforce את הדוח כ-CSV (Export › Details Only › Comma Delimited .csv, קידוד UTF-8) ומעלים כאן. כל שורה מתמזגת לפי מספר הבקשה:
              ייצוא הבקשות המלא מעדכן את נתוני הבקשה, ודוח התקשורת מעדכן את הפרסומים — אפשר להעלות את שניהם, בכל סדר.
            </p>
            <p>
              עמודות שלא קיימות בקובץ לא נמחקות מהבקשה. ארגונים וגופי תקשורת חדשים מקבלים סיווג אוטומטי, שאפשר לתקן בטבלאות העזר. אחרי חיבור Salesforce
              הנתונים יתעדכנו מעצמם והעלאה ידנית לא תידרש.
            </p>
          </div>
          <UploadForm />
        </Card>

        <Card title="העלאות אחרונות" tone="accent-light">
          <Table caption="העלאות אחרונות" head={["מתי", "קובץ", "סוג", "שורות", "חדשות", "עודכנו", "פרסומים", "מי"]} empty={imports.length ? undefined : "עוד לא הועלו קבצים"}>
            {imports.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(i.importedAt)}</td>
                <td className="px-3 py-2">{i.fileName}</td>
                <td className="px-3 py-2">{KIND[i.kind] ?? i.kind}</td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(i.rows)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(i.inserted)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(i.updated)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(i.publications)}</td>
                <td className="px-3 py-2 text-xs" dir="ltr">
                  {i.importedBy}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
