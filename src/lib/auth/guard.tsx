import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { Forbidden } from "@/components/Forbidden";
import { SignInScreen } from "@/components/SignInScreen";
import { logPageView } from "@/lib/audit";
import { cached } from "@/lib/cache";
import { getDb } from "@/lib/db/client";
import { pageSettings } from "@/lib/db/schema";
import { findPage } from "@/lib/pages";
import { hasRole, type Role } from "./roles";
import { getSession, type SessionUser } from "./session";

export type PageAuth = { ok: true; user: SessionUser } | { ok: false; render: ReactNode };

/**
 * Every page checks for itself rather than trusting the layout: layouts are not
 * re-rendered on client navigation, so a check that lives only there can be
 * skipped. Anonymous visitors get the sign-in screen with a 200, which also
 * keeps xhostd's readiness probe on GET / green.
 *
 * Every permitted view is written to the activity log; `returnTo` is the path
 * that gets logged, so pages include the query string that shapes what they show.
 */
export async function pageAuth(minimum: Role, returnTo: string): Promise<PageAuth> {
  const session = await getSession();
  if (session.status === "anonymous") {
    return { ok: false, render: <SignInScreen returnTo={returnTo} /> };
  }
  if (session.status === "refused") {
    return { ok: false, render: <Forbidden email={session.identity.email} reason="not_invited" /> };
  }
  if (!hasRole(session.user.role, minimum)) {
    return { ok: false, render: <Forbidden email={session.user.email} reason="role" required={minimum} /> };
  }
  logPageView(session.user.email, returnTo);
  return { ok: true, user: session.user };
}

export type DashboardAuth = { ok: true; user: SessionUser | null; isPublic: boolean } | { ok: false; render: ReactNode };

/** Whether an admin opened this page to the public. Cached briefly: it is read on every render. */
export function isPagePublic(pageKey: string): Promise<boolean> {
  return cached(
    `page-public:${pageKey}`,
    async () => {
      const [row] = await getDb().select().from(pageSettings).where(eq(pageSettings.pageKey, pageKey)).limit(1);
      return row?.isPublic ?? false;
    },
    30_000,
  );
}

/**
 * Dashboard pages: allowed when the page is in the user's pages (admins have all
 * of them), or when an admin made the page public — then anyone may view it,
 * signed in or not, and `user` is null for anonymous visitors.
 */
export async function dashboardAuth(pageKey: string, returnTo: string): Promise<DashboardAuth> {
  const page = findPage(pageKey);
  if (!page) throw new Error(`unknown page ${pageKey}`);
  const session = await getSession();

  if (session.status === "ok" && session.user.pages.includes(pageKey)) {
    logPageView(session.user.email, returnTo);
    return { ok: true, user: session.user, isPublic: false };
  }
  if (await isPagePublic(pageKey)) {
    const user = session.status === "ok" ? session.user : null;
    logPageView(user?.email ?? "anonymous", returnTo);
    return { ok: true, user, isPublic: true };
  }
  if (session.status === "anonymous") return { ok: false, render: <SignInScreen returnTo={returnTo} /> };
  if (session.status === "refused") return { ok: false, render: <Forbidden email={session.identity.email} reason="not_invited" /> };
  return { ok: false, render: <Forbidden email={session.user.email} reason="page" pageLabel={page.label} /> };
}
