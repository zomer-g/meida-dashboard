import { desc, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Badge, buttonClass, Card, formatDateTime, PageHeader, Table } from "@/components/ui";
import { pageAuth } from "@/lib/auth/guard";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getDb } from "@/lib/db/client";
import { mcpClients, mcpUsage, users } from "@/lib/db/schema";
import { mcpEnabled } from "@/lib/mcp/config";
import { TOOLS } from "@/lib/mcp/tools";
import { fmtInt } from "@/lib/format";
import { findPage } from "@/lib/pages";
import { AdminTabs } from "../AdminTabs";
import { removeClient, revokeUserTokens } from "./actions";

export const metadata: Metadata = { title: "MCP" };

const STATUS_LABELS: Record<string, string> = { ok: "תקין", error: "שגיאה", denied: "נחסם" };

export default async function McpAdminPage() {
  const auth = await pageAuth("admin", "/admin/mcp");
  if (!auth.ok) return auth.render;

  // The address the client must be given, taken from the request so it is right on
  // the xhostd hostname, on a custom domain and in local development alike.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const connectUrl = `${proto}://${host}/mcp`;

  const db = getDb();
  const [clients, recent, perUser] = await Promise.all([
    db.select().from(mcpClients).orderBy(desc(mcpClients.lastUsedAt)).limit(30),
    db.select().from(mcpUsage).orderBy(desc(mcpUsage.at)).limit(40),
    db
      .select({
        userId: mcpUsage.userId,
        email: mcpUsage.userEmail,
        calls: sql<number>`count(*)::int`,
        lastAt: sql<Date>`max(${mcpUsage.at})`,
      })
      .from(mcpUsage)
      .groupBy(mcpUsage.userId, mcpUsage.userEmail)
      .orderBy(desc(sql`max(${mcpUsage.at})`))
      .limit(50),
  ]);
  // Role and the revoke button come from the user row; a usage row survives a deleted user.
  const ids = perUser.map((u) => u.userId).filter((id): id is string => Boolean(id));
  const rows = ids.length ? await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, ids)) : [];
  const roleOf = new Map(rows.map((r) => [r.id, r.role]));
  const active = perUser.map((u) => ({ ...u, role: u.userId ? roleOf.get(u.userId) : undefined }));

  const enabled = mcpEnabled();

  return (
    <>
      <PageHeader title="ניהול · MCP" subtitle="חיבור כלי AI לדשבורד — קריאה בלבד, עם ההרשאות של כל משתמש" />
      <AdminTabs />

      <div className="flex flex-col gap-8">
        <Card title="כתובת החיבור">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {enabled ? <Badge tone="success">פעיל</Badge> : <Badge tone="warning">כבוי — חסר MCP_JWT_SECRET</Badge>}
              <code dir="ltr" className="rounded-full bg-white px-4 py-2 font-mono text-sm ring-1 ring-line">
                {connectUrl}
              </code>
            </div>
            <p className="text-sm text-muted">
              מוסיפים את הכתובת ככלי מותאם (Custom connector) ב-Claude או בכלי MCP אחר. הכלי יפתח חלון התחברות עם אותו חשבון Google של הדשבורד, יבקש
              אישור, ומשם יראה בדיוק מה שהמשתמש רואה בממשק — ורק לקריאה. מדריך מלא: <span dir="ltr" className="font-mono text-xs">docs/setup-mcp.md</span>
            </p>
          </div>
        </Card>

        <Card title={`הכלים שהשרת חושף (${TOOLS.length})`} tone="accent-light">
          <Table caption="כלי MCP" head={["כלי", "מה הוא מחזיר", "העמוד שמתיר אותו"]}>
            {TOOLS.map((t) => (
              <tr key={t.name}>
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                  {t.name}
                </td>
                <td className="px-3 py-2 text-sm">{t.description}</td>
                <td className="px-3 py-2 text-sm">{t.page ? (findPage(t.page)?.label ?? t.page) : "כל משתמש"}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`משתמשים שהתחברו (${active.length})`}>
          <Table caption="משתמשי MCP" head={["משתמש", "תפקיד", "קריאות", "אחרונה", ""]} empty={active.length ? undefined : "עוד אף אחד לא חיבר כלי AI"}>
            {active.map((u) => (
              <tr key={u.email}>
                <td className="px-3 py-2" dir="ltr">
                  {u.email}
                </td>
                <td className="px-3 py-2">{u.role ? ROLE_LABELS[u.role] : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{fmtInt(u.calls)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(u.lastAt ? new Date(u.lastAt) : null)}</td>
                <td className="px-3 py-2 text-end">
                  {u.userId ? (
                    <form action={revokeUserTokens}>
                      <input type="hidden" name="id" value={u.userId} />
                      <button className={buttonClass("danger", "sm")}>
                        ניתוק החיבורים<span className="sr-only"> · {u.email}</span>
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-muted">ניתוק מבטל מיד את כל האסימונים של אותו משתמש; בפעם הבאה הכלי יבקש התחברות מחדש.</p>
        </Card>

        <Card title={`לקוחות רשומים (${clients.length})`} tone="accent-light">
          <Table caption="לקוחות MCP" head={["לקוח", "נרשם", "שימוש אחרון", ""]} empty={clients.length ? undefined : "אין לקוחות רשומים"}>
            {clients.map((c) => (
              <tr key={c.clientId}>
                <td className="px-3 py-2 font-semibold">{c.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(c.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(c.lastUsedAt)}</td>
                <td className="px-3 py-2 text-end">
                  <form action={removeClient}>
                    <input type="hidden" name="clientId" value={c.clientId} />
                    <button className={buttonClass("quiet", "sm")}>
                      הסרה<span className="sr-only"> · {c.name}</span>
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="קריאות אחרונות">
          <Table caption="קריאות MCP אחרונות" head={["מתי", "משתמש", "כלי", "שורות", "משך", "מצב"]} empty={recent.length ? undefined : "אין קריאות"}>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(r.at)}</td>
                <td className="px-3 py-2" dir="ltr">
                  {r.userEmail}
                </td>
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                  {r.tool}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.resultRows == null ? "—" : fmtInt(r.resultRows)}</td>
                <td className="px-3 py-2 tabular-nums">{r.latencyMs == null ? "—" : `${fmtInt(r.latencyMs)} ms`}</td>
                <td className="px-3 py-2">
                  {r.status === "ok" ? (
                    <Badge tone="success">{STATUS_LABELS.ok}</Badge>
                  ) : (
                    <Badge tone="warning" >{STATUS_LABELS[r.status] ?? r.status}</Badge>
                  )}
                  {r.error ? <span className="ms-2 text-xs text-muted">{r.error.slice(0, 80)}</span> : null}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
