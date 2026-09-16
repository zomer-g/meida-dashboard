import { asc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { pageAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { userTypes, users } from "@/lib/db/schema";
import { PAGES } from "@/lib/pages";
import { AdminTabs } from "../AdminTabs";
import { deleteUserType } from "./actions";
import { TypeForm } from "./TypeForm";

export const metadata: Metadata = { title: "סוגי משתמשים" };

export default async function UserTypesPage() {
  const auth = await pageAuth("admin", "/admin/user-types");
  if (!auth.ok) return auth.render;

  const db = getDb();
  const [types, counts] = await Promise.all([
    db.select().from(userTypes).orderBy(asc(userTypes.sortOrder), asc(userTypes.label)),
    db.select({ key: users.userType, n: sql<number>`count(*)::int` }).from(users).groupBy(users.userType),
  ]);
  const usersOf = (key: string) => counts.find((c) => c.key === key)?.n ?? 0;

  return (
    <>
      <PageHeader title="ניהול · סוגי משתמשים" subtitle="כל סוג משתמש רואה רק את העמודים שסומנו לו. אדמינים רואים הכל." />
      <AdminTabs />

      <div className="flex flex-col gap-8">
        {types.map((t) => (
          <Card key={t.key} title={`${t.label} · ${usersOf(t.key)} משתמשים`} tone="accent-light">
            <TypeForm pages={PAGES} initial={{ key: t.key, label: t.label, description: t.description, pages: t.pages, sortOrder: t.sortOrder }} />
            {usersOf(t.key) === 0 ? (
              <form action={deleteUserType} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="key" value={t.key} />
                <button className={buttonClass("danger", "sm")}>
                  מחיקת הסוג<span className="sr-only"> · {t.label}</span>
                </button>
              </form>
            ) : (
              <p className="mt-4 border-t border-line pt-4 text-xs text-muted">אי אפשר למחוק סוג שמשויכים אליו משתמשים.</p>
            )}
          </Card>
        ))}

        <Card title="סוג משתמש חדש">
          <TypeForm pages={PAGES} />
        </Card>
      </div>
    </>
  );
}
