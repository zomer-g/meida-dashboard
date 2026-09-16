import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, formatDateTime, PageHeader, Table } from "@/components/ui";
import { pageAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { pageSettings } from "@/lib/db/schema";
import { PAGES } from "@/lib/pages";
import { AdminTabs } from "../AdminTabs";
import { setPagePublic } from "./actions";

export const metadata: Metadata = { title: "עמודים פומביים" };

export default async function PagesAdmin() {
  const auth = await pageAuth("admin", "/admin/pages");
  if (!auth.ok) return auth.render;

  const settings = await getDb().select().from(pageSettings);
  const byKey = new Map(settings.map((s) => [s.pageKey, s]));

  return (
    <>
      <PageHeader title="ניהול · עמודים פומביים" subtitle="כרגע כל העמודים פנימיים. עמוד פומבי נפתח לכל מי שיש לו את הקישור, בלי התחברות." />
      <AdminTabs />

      <Card title="עמודי הדשבורד">
        <Table caption="עמודים ומצב הפרסום" head={["עמוד", "תיאור", "מצב", "עודכן", ""]}>
          {PAGES.map((p) => {
            const s = byKey.get(p.key);
            const isPublic = s?.isPublic ?? false;
            return (
              <tr key={p.key}>
                <td className="px-3 py-3 font-semibold">
                  <Link href={p.path} className="text-accent underline underline-offset-4">
                    {p.label}
                  </Link>
                </td>
                <td className="px-3 py-3 text-sm text-muted">
                  {p.description}
                  {p.sensitive ? <span className="ms-2 text-xs font-semibold text-warning">כולל מידע פנימי</span> : null}
                </td>
                <td className="px-3 py-3">{isPublic ? <Badge tone="warning">פומבי</Badge> : <Badge tone="success">פנימי</Badge>}</td>
                <td className="px-3 py-3 text-xs text-muted">{s ? `${formatDateTime(s.updatedAt)} · ${s.updatedBy}` : "—"}</td>
                <td className="px-3 py-3">
                  <form action={setPagePublic} className="flex flex-wrap items-center justify-end gap-2">
                    <input type="hidden" name="page" value={p.key} />
                    <input type="hidden" name="public" value={String(!isPublic)} />
                    {!isPublic ? (
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" name="confirm" value="yes" required className="size-4 accent-brand" />
                        {p.sensitive ? "הבנתי שהעמוד כולל מידע פנימי" : "אישור"}
                      </label>
                    ) : null}
                    <button className={buttonClass(isPublic ? "secondary" : "danger", "sm")}>
                      {isPublic ? "החזרה לפנימי" : "פרסום"}
                      <span className="sr-only"> · {p.label}</span>
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
