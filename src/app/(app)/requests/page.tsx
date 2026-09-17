import type { Metadata } from "next";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { Pager } from "@/components/dashboard/Pager";
import { Badge, Card, NewTabNote, Table } from "@/components/ui";
import { dashboardAuth } from "@/lib/auth/guard";
import { formatDay } from "@/lib/dashboard/params";
import { parseFilters, viewPath } from "@/lib/foi/filters";
import { requestList } from "@/lib/foi/metrics";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "רשימת בקשות" };

const PAGE_SIZE = 50;

const TONE: Record<string, "success" | "warning" | "neutral" | "accent"> = {
  "נענה במועד": "success",
  "נענה בחריגה": "warning",
  "בקשה פתוחה": "accent",
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const f = parseFilters(search);
  const auth = await dashboardAuth("requests", viewPath("/requests", f));
  if (!auth.ok) return auth.render;

  const page = Math.min(Math.max(1, Math.floor(Number(search.page)) || 1), 10_000);
  const list = await requestList(f, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <DashboardFrame
      auth={auth}
      pageKey="requests"
      filters={f}
      keys={["status", "type", "org", "topic", "owner", "project", "petition"]}
      dateLabel="תאריך הגשה"
      search="חיפוש לפי שם, תיאור, רשות או מספר בקשה"
    >
      <Card title={`בקשות (${fmtInt(list.total)})`}>
        <Table
          caption="רשימת בקשות"
          head={["מספר", "שם הבקשה", "רשות", "סוג רשות", "בעלי בקשה", "הוגשה", "מענה מלא", "ימים", "מועד", "סטטוס", "פרסומים"]}
          empty={list.rows.length ? undefined : "לא נמצאו בקשות"}
        >
          {list.rows.map((r) => (
            <tr key={r.caseNumber}>
              <td className="px-3 py-2 tabular-nums">
                {r.sfUrl ? (
                  <a href={r.sfUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
                    {r.caseNumber}
                    <NewTabNote />
                  </a>
                ) : (
                  r.caseNumber
                )}
              </td>
              <td className="px-3 py-2 font-semibold">{r.name ?? "—"}</td>
              <td className="px-3 py-2">{r.organization ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted">{r.authorityType}</td>
              <td className="px-3 py-2">{r.owner ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDay(r.submittedOn)}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDay(r.fullResponseOn)}</td>
              <td className="px-3 py-2 tabular-nums">{r.lifecycleDays == null ? "—" : fmtInt(r.lifecycleDays)}</td>
              <td className="px-3 py-2">
                <Badge tone={TONE[r.timeliness] ?? "neutral"}>{r.timeliness}</Badge>
              </td>
              <td className="px-3 py-2 text-xs">{r.status ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{r.publications ? fmtInt(r.publications) : ""}</td>
            </tr>
          ))}
        </Table>
        <Pager page={page} pageSize={PAGE_SIZE} total={list.total} search={search} />
      </Card>
    </DashboardFrame>
  );
}
