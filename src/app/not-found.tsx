import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "העמוד לא נמצא" };

/** Hebrew 404 for unknown URLs and for records that `notFound()` refuses. Shows no data, so no auth check. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <BrandLogo className="h-14 w-auto" />
      <h1 className="text-3xl font-bold">העמוד לא נמצא</h1>
      <p className="text-muted">ייתכן שהקישור שגוי, או שהרשומה כבר לא קיימת.</p>
      <Link href="/" className={buttonClass("primary")}>
        חזרה לדשבורד
      </Link>
    </main>
  );
}
