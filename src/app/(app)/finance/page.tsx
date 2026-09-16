import type { Metadata } from "next";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { Card } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { parseFilters, viewPath } from "@/lib/foi/filters";

export const metadata: Metadata = { title: "כספים" };

const PLANNED = [
  { title: "דוח הוצאות", text: "הוצאות לפי חודש, קטגוריה ונושא הוצאה (שכר, שירותים חיצוניים, פעילות משפטית, הפקת מידע…)." },
  { title: "דוח הכנסות", text: "הכנסות לפי חודש ומקור: קרנות, תרומות, הכנסות מפעילות." },
  { title: "דוח התקשרויות", text: "התקשרויות עם ספקים: ספק, נושא, סכום ותאריך." },
  { title: "תכנון מול ביצוע", text: "סכום מתוכנן שנתי מול ביצוע בפועל ואחוז ביצוע, להוצאות ולהכנסות." },
  { title: "צפי רב-שנתי", text: "תחזית הוצאות והכנסות לשנים הבאות לפי קטגוריה." },
  { title: "דיווח לקרנות (EU ואחרות)", text: "הוצאות ותכנון ביורו, ורשימת הבקשות שהוגשו במסגרת הפרויקט." },
];

/**
 * The finance pages of the detailed Looker report read a finance spreadsheet that
 * is not connected yet. The page exists so access can already be granted per user
 * type (board members only, by default).
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const auth = await dashboardAuth("finance", viewPath("/finance", f));
  if (!auth.ok) return auth.render;

  return (
    <DashboardFrame auth={auth} pageKey="finance" filters={f} keys={[]} dateLabel="תאריך">
      <div className="flex flex-col gap-6">
        <div className="rounded-card border-2 border-dashed border-line bg-surface p-6">
          <h2 className="text-xl font-bold">ממתין למקור נתונים</h2>
          <p className="mt-2 text-muted">
            המסכים הכספיים בדוח המפורט נשענים על גיליון כספים שעדיין לא חובר לדשבורד. אחרי החיבור (גיליון Google או ייצוא מהנהלת החשבונות) יוצגו כאן
            המסכים הבאים. הגישה לעמוד מוגבלת כבר עכשיו לפי סוג משתמש.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {PLANNED.map((p) => (
            <Card key={p.title} title={p.title} tone="accent-light">
              <p className="text-sm text-muted">{p.text}</p>
            </Card>
          ))}
        </div>
      </div>
    </DashboardFrame>
  );
}
