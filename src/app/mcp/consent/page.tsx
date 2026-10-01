import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { buttonClass } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { mcpClients } from "@/lib/db/schema";
import { verifyState } from "@/lib/mcp/tokens";
import { toolsFor } from "@/lib/mcp/tools";
import { findPage } from "@/lib/pages";

export const metadata: Metadata = { title: "אישור חיבור", robots: { index: false } };
export const dynamic = "force-dynamic";

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-dots px-4 py-12">
      <BrandLogo className="h-14 w-auto" />
      <div className="w-full max-w-xl overflow-hidden rounded-modal border-2 border-line bg-white shadow-sm">
        <h1 className="bg-brand-dark px-8 py-5 text-center text-xl font-bold text-white">{title}</h1>
        <div className="flex flex-col gap-5 px-8 py-7">{children}</div>
      </div>
    </main>
  );
}

/**
 * The approval step. The person sees which client asked, which account they are
 * signed in with, and exactly which read-only tools that client would get — their
 * own dashboard permissions, nothing wider. Nothing is issued without pressing אישור.
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const parsed = state ? await verifyState(state) : null;
  if (!parsed) {
    return (
      <Frame title="הבקשה אינה תקפה">
        <p className="text-muted">בקשת החיבור פגה או שאינה תקינה. נסו להוסיף את החיבור מחדש מהכלי שלכם.</p>
      </Frame>
    );
  }

  const session = await getSession();
  if (session.status !== "ok") {
    return (
      <Frame title="נדרשת התחברות">
        <p className="text-muted">צריך להיות מחובר לדשבורד כדי לאשר חיבור. התחברו ונסו שוב.</p>
      </Frame>
    );
  }

  const [client] = await getDb().select().from(mcpClients).where(eq(mcpClients.clientId, parsed.clientId)).limit(1);
  if (!client) {
    return (
      <Frame title="לקוח לא מוכר">
        <p className="text-muted">הלקוח שביקש את החיבור אינו רשום.</p>
      </Frame>
    );
  }

  const user = session.user;
  const tools = toolsFor({ ...user, tokenVersion: 0, clientId: client.clientId });
  const pages = user.pages.map((key) => findPage(key)?.label ?? key);

  return (
    <Frame title="אישור חיבור לכלי AI">
      <p className="text-muted">
        <span className="font-semibold text-ink">{client.name}</span> מבקש לקרוא מהדשבורד בשמך, בחשבון{" "}
        <span dir="ltr" className="font-semibold text-ink">
          {user.email}
        </span>
        .
      </p>

      <div className="rounded-card bg-surface p-4 text-sm">
        <p className="font-semibold">מה הכלי יוכל לעשות</p>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-muted">
          <li>
            <span className="font-semibold text-ink">לקרוא בלבד</span> — אין אפשרות לשנות, למחוק או להוסיף נתונים.
          </li>
          <li>לראות רק את העמודים שמותרים לך: {pages.length ? pages.join(" · ") : "אין כרגע עמודים מורשים"}.</li>
          <li>{tools.length} כלים: {tools.map((t) => t.title).join(" · ") || "—"}</li>
          <li>כל שאילתה נרשמת ביומן, ואפשר לנתק את הגישה בכל רגע ב״ניהול › MCP״.</li>
        </ul>
      </div>

      <form action="/mcp/oauth/approve" method="post" className="flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="state" value={state} />
        <button type="submit" name="decision" value="approve" className={buttonClass("primary")}>
          אישור החיבור
        </button>
        <button type="submit" name="decision" value="deny" className={buttonClass("secondary")}>
          ביטול
        </button>
      </form>
    </Frame>
  );
}
