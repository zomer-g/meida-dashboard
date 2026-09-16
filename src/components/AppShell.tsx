import Link from "next/link";
import type { ReactNode } from "react";
import { setPreview } from "@/app/(app)/preview-actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { loginUrl, logoutUrl } from "@/lib/auth/urls";
import { getDb } from "@/lib/db/client";
import { userTypes } from "@/lib/db/schema";
import { BrandLogo } from "./BrandLogo";
import { NavLinks } from "./NavLinks";
import { PreviewSwitcher } from "./PreviewSwitcher";
import { PublicDocLinks } from "./PublicDoc";
import { Badge, buttonClass } from "./ui";

// A red deep enough for white text to stay readable (AA) at banner size.
const PREVIEW_RED = "#b42318";

/** Header, navigation and footer. `user` is null for an anonymous visitor on a page an admin made public. */
export async function AppShell({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  const types = user?.realRole === "admin" ? await getDb().select({ key: userTypes.key, label: userTypes.label }).from(userTypes).orderBy(userTypes.sortOrder) : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-medium focus:text-white"
      >
        דילוג לתוכן הראשי
      </a>
      {user?.previewing ? (
        <div role="region" aria-label="מצב צפייה" className="text-white" style={{ background: PREVIEW_RED }}>
          <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center justify-between gap-3 px-4 py-2">
            <p className="text-sm font-medium">
              מצב צפייה: המערכת מוצגת כ<span className="font-bold">{user.userTypeLabel ?? ROLE_LABELS[user.role]}</span>. מה שמעבר להרשאה הזו מוסתר
              ונחסם, כמו אצל משתמש אמיתי.
            </p>
            <form action={setPreview}>
              <button
                name="as"
                value="admin"
                className="rounded-full bg-white px-4 py-1.5 text-sm font-bold transition-opacity hover:opacity-90 focus-visible:outline-white"
                style={{ color: PREVIEW_RED }}
              >
                יציאה ממצב צפייה
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* The site's navy strip above a white header. */}
      <div className="h-2 bg-brand-dark" aria-hidden />
      <header className="border-b border-line bg-white shadow-[0_2px_8px_#0b214914]">
        <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="order-1 flex items-center gap-3" aria-label="הדשבורד של התנועה לחופש המידע — דף הבית">
            <BrandLogo className="h-11 w-auto" />
            <span className="hidden border-s border-line ps-3 text-sm font-semibold text-accent sm:inline">דשבורד תפעולי</span>
          </Link>

          <NavLinks
            pages={user?.pages ?? []}
            role={user?.role ?? null}
            className="order-3 -mx-1 w-[calc(100%+0.5rem)] lg:order-2 lg:mx-0 lg:w-auto"
          />

          <div className="order-2 ms-auto flex flex-wrap items-center justify-end gap-3 lg:order-3">
            {user ? (
              <>
                {user.realRole === "admin" ? <PreviewSwitcher current={user.previewing ? (user.userType ? `type:${user.userType}` : user.role) : "admin"} types={types} /> : null}
                <div className="flex flex-col items-end leading-tight">
                  <span className="text-sm font-semibold">{user.name ?? user.email}</span>
                  <Badge tone={user.previewing ? "warning" : user.role === "admin" ? "brand" : "accent"}>
                    {user.userTypeLabel ? `${user.userTypeLabel} · ` : ""}
                    {ROLE_LABELS[user.role]}
                    {user.previewing ? " · תצוגה" : ""}
                  </Badge>
                </div>
                <a href={logoutUrl("/")} className={buttonClass("secondary", "sm")}>
                  יציאה
                </a>
              </>
            ) : (
              <a href={loginUrl("/")} className={buttonClass("primary", "sm")}>
                כניסה לצוות
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[80rem] flex-1 px-4 py-6 focus:outline-none sm:py-8">
        {children}
      </main>

      <footer className="bg-brand-dark text-white">
        <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center justify-between gap-4 px-4 py-8">
          <BrandLogo variant="white" className="h-10 w-auto" />
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
            הדשבורד התפעולי של התנועה לחופש המידע
            <PublicDocLinks linkClassName="text-white focus-visible:outline-white" />
          </span>
        </div>
      </footer>
    </div>
  );
}
