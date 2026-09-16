import { loginUrl } from "@/lib/auth/urls";
import { BrandLogo } from "./BrandLogo";
import { PublicDocLinks } from "./PublicDoc";
import { buttonClass } from "./ui";

export function SignInScreen({ returnTo }: { returnTo: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-dots px-4 py-12">
      <BrandLogo className="h-16 w-auto" />
      <div className="w-full max-w-md overflow-hidden rounded-modal border-2 border-line bg-white shadow-sm">
        <h1 className="bg-brand-dark px-8 py-6 text-center text-2xl font-bold text-white">הדשבורד התפעולי</h1>
        <div className="flex flex-col items-center gap-6 px-8 py-8 text-center">
          <p className="text-muted">
            מערכת פנימית של התנועה לחופש המידע.
            <br />
            הכניסה בחשבון Google, למשתמשים שהוזמנו בלבד.
          </p>
          <a href={loginUrl(returnTo)} className={`${buttonClass("primary")} w-full`}>
            התחברות
          </a>
        </div>
      </div>
      <PublicDocLinks className="justify-center" />
    </main>
  );
}
