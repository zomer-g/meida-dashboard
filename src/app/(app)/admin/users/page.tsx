import { and, asc, desc, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, formatDateTime, PageHeader, smallFieldClass, Table } from "@/components/ui";
import { pageAuth } from "@/lib/auth/guard";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import { envAdmins } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { accessRequests, invites, userTypes, users } from "@/lib/db/schema";
import { AdminTabs } from "../AdminTabs";
import { approveRequest, changeRole, changeUserType, dismissRequest, revokeInvite, setActive } from "./actions";
import { InviteForm } from "./InviteForm";

export const metadata: Metadata = { title: "משתמשים והרשאות" };

type TypeOption = { key: string; label: string };

export default async function UsersPage() {
  const auth = await pageAuth("admin", "/admin/users");
  if (!auth.ok) return auth.render;

  const db = getDb();
  const [userRows, inviteRows, requestRows, types] = await Promise.all([
    db.select().from(users).orderBy(desc(users.lastLoginAt)),
    db
      .select()
      .from(invites)
      .where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt)),
    db.select().from(accessRequests).orderBy(desc(accessRequests.lastAt)).limit(100),
    db.select({ key: userTypes.key, label: userTypes.label }).from(userTypes).orderBy(asc(userTypes.sortOrder), asc(userTypes.label)),
  ]);
  const configuredAdmins = envAdmins();
  const typeLabel = (key: string | null) => types.find((t) => t.key === key)?.label ?? "—";

  return (
    <>
      <PageHeader title="ניהול · משתמשים והרשאות" subtitle="מי נכנס לדשבורד, באיזה תפקיד ומאיזה סוג" />
      <AdminTabs />

      <div className="flex flex-col gap-8">
        <Card title="הזמנת משתמש">
          <InviteForm types={types} />
          <p className="mt-4 text-xs text-muted">
            <strong>תפקיד</strong> קובע מה אפשר לעשות: צופה רואה דשבורדים, עורך גם מתקן טבלאות עזר ומעלה נתונים, אדמין גם מנהל משתמשים וחיבורים (ורואה את כל העמודים).{" "}
            <strong>סוג משתמש</strong> קובע אילו עמודים רואים —{" "}
            <Link href="/admin/user-types" className="font-semibold text-accent underline underline-offset-4">
              ניהול סוגי המשתמשים
            </Link>
            .
          </p>
        </Card>

        {requestRows.length > 0 ? (
          <Card title={`בקשות גישה (${requestRows.length})`} tone="accent-light">
            <Table head={["אימייל", "שם", "ניסיונות", "ניסיון אחרון", ""]}>
              {requestRows.map((r) => (
                <tr key={r.email}>
                  <td className="px-3 py-3" dir="ltr">
                    {r.email}
                  </td>
                  <td className="px-3 py-3">{r.name ?? "—"}</td>
                  <td className="px-3 py-3">{r.attempts}</td>
                  <td className="px-3 py-3">{formatDateTime(r.lastAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <form action={approveRequest} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="email" value={r.email} />
                        <RoleSelect defaultValue="viewer" who={r.email} />
                        <TypeSelect types={types} defaultValue="" who={r.email} />
                        <button className={buttonClass("primary", "sm")}>
                          אישור<span className="sr-only"> · {r.email}</span>
                        </button>
                      </form>
                      <form action={dismissRequest}>
                        <input type="hidden" name="email" value={r.email} />
                        <button className={buttonClass("quiet", "sm")}>
                          הסרה<span className="sr-only"> · {r.email}</span>
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : null}

        <Card title={`משתמשים (${userRows.length})`}>
          <Table head={["משתמש", "תפקיד", "סוג משתמש", "סטטוס", "כניסה אחרונה", ""]}>
            {userRows.map((u) => {
              const isSelf = u.id === auth.user.id;
              const isConfigured = configuredAdmins.includes(u.email);
              const locked = isSelf || isConfigured;
              return (
                <tr key={u.id} className={u.active ? "" : "bg-panel"}>
                  <td className="px-3 py-3">
                    <p className="font-semibold">{u.name ?? "—"}</p>
                    <p className="text-xs text-muted" dir="ltr">
                      {u.email}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {locked ? (
                      <div className="flex items-center gap-2">
                        <Badge tone={u.role === "admin" ? "brand" : "accent"}>{ROLE_LABELS[u.role]}</Badge>
                        {isConfigured ? <span className="text-xs text-muted">מוגדר בהגדרות השרת</span> : null}
                        {isSelf && !isConfigured ? <span className="text-xs text-muted">(את/ה)</span> : null}
                      </div>
                    ) : (
                      <form action={changeRole} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <RoleSelect defaultValue={u.role} who={u.email} />
                        <button className={buttonClass("secondary", "sm")}>
                          עדכון<span className="sr-only"> · תפקיד · {u.email}</span>
                        </button>
                      </form>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <form action={changeUserType} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <TypeSelect types={types} defaultValue={u.userType ?? ""} who={u.email} />
                      <button className={buttonClass("secondary", "sm")}>
                        עדכון<span className="sr-only"> · סוג משתמש · {u.email}</span>
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-3">
                    {u.active ? <Badge tone="success">פעיל</Badge> : <Badge>מושבת</Badge>}
                    {!u.sub ? <span className="ms-2 text-xs text-muted">טרם התחבר</span> : null}
                  </td>
                  <td className="px-3 py-3">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="px-3 py-3 text-end">
                    {locked ? null : (
                      <form action={setActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={String(!u.active)} />
                        <button className={buttonClass(u.active ? "danger" : "secondary", "sm")}>
                          {u.active ? "השבתה" : "הפעלה מחדש"}
                          <span className="sr-only"> · {u.email}</span>
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card title={`הזמנות פתוחות (${inviteRows.length})`} tone="accent-light">
          <Table head={["אימייל", "תפקיד", "סוג משתמש", "הוזמן ע״י", "בתוקף עד", ""]} empty={inviteRows.length === 0 ? "אין הזמנות פתוחות" : undefined}>
            {inviteRows.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-3" dir="ltr">
                  {i.email}
                </td>
                <td className="px-3 py-3">{ROLE_LABELS[i.role]}</td>
                <td className="px-3 py-3">{typeLabel(i.userType)}</td>
                <td className="px-3 py-3" dir="ltr">
                  {i.invitedBy}
                </td>
                <td className="px-3 py-3">{formatDateTime(i.expiresAt)}</td>
                <td className="px-3 py-3 text-end">
                  <form action={revokeInvite}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className={buttonClass("danger", "sm")}>
                      ביטול<span className="sr-only"> · {i.email}</span>
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

function RoleSelect({ defaultValue, who }: { defaultValue: Role; who: string }) {
  return (
    <select name="role" defaultValue={defaultValue} className={smallFieldClass} aria-label={`תפקיד · ${who}`}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function TypeSelect({ types, defaultValue, who }: { types: TypeOption[]; defaultValue: string; who: string }) {
  return (
    <select name="userType" defaultValue={defaultValue} className={smallFieldClass} aria-label={`סוג משתמש · ${who}`}>
      <option value="">ללא סוג</option>
      {types.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
