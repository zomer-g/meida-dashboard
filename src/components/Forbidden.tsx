import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { logoutUrl } from "@/lib/auth/urls";
import { BrandLogo } from "./BrandLogo";
import { PublicDocLinks } from "./PublicDoc";
import { buttonClass } from "./ui";

export function Forbidden({
  email,
  reason,
  required,
  pageLabel,
}: {
  email: string;
  reason: "not_invited" | "role" | "page";
  required?: Role;
  pageLabel?: string;
}) {
  if (reason === "role" || reason === "page") {
    return (
      <div className="mx-auto max-w-lg rounded-card border-2 border-line bg-surface p-8 text-center">
        <h1 className="text-2xl font-bold">אין הרשאה לעמוד הזה</h1>
        <p className="mt-3 text-muted">
          {reason === "page"
            ? `העמוד "${pageLabel ?? ""}" אינו כלול בהרשאות של סוג המשתמש שלך. אפשר לבקש גישה ממנהלי המערכת.`
            : `העמוד דורש הרשאת ${required ? ROLE_LABELS[required] : "גבוהה יותר"}. אפשר לבקש שינוי הרשאה ממנהלי המערכת.`}
        </p>
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-12">
      <BrandLogo className="h-16 w-auto" />
      <div className="w-full max-w-md overflow-hidden rounded-modal border-2 border-line">
        <h1 className="bg-brand-dark px-8 py-6 text-center text-2xl font-bold text-white">הגישה טרם אושרה</h1>
        <div className="flex flex-col items-center gap-6 bg-surface px-8 py-8 text-center">
          <p className="text-muted">
            החשבון <span dir="ltr" className="font-medium text-ink">{email}</span> אינו מורשה עדיין.
            <br />
            הבקשה נרשמה, ומנהלי המערכת יכולים לאשר אותה.
          </p>
          <a href={logoutUrl("/")} className={`${buttonClass("secondary")} w-full`}>
            התחברות עם חשבון אחר
          </a>
        </div>
      </div>
      <PublicDocLinks className="justify-center" />
    </main>
  );
}
