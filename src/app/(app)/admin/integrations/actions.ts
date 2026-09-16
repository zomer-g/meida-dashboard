"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { smoovCampaigns } from "@/lib/db/schema";
import { serviceAccountEmail } from "@/lib/google/auth";
import { ga4Configured, runReport } from "@/lib/google/ga4";
import { smoov, smoovAuthScheme, smoovConfigured } from "@/lib/smoov/client";

export type TestState = { ok: boolean; lines: string[] } | null;

const PATH = "/admin/integrations";
const fail = (err: unknown): TestState => ({ ok: false, lines: [err instanceof Error ? err.message : String(err)] });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

export async function testGa4(_prev: TestState, _form: FormData): Promise<TestState> {
  const admin = await requireUser("admin");
  if (!ga4Configured()) return { ok: false, lines: ["חסרים GA4_PROPERTY_ID ו/או GOOGLE_SERVICE_ACCOUNT_JSON"] };
  try {
    const { rows, quotaRemaining } = await runReport({
      startDate: "7daysAgo",
      endDate: "today",
      dimensions: ["pagePath"],
      metrics: ["screenPageViews"],
    });
    const total = rows.reduce((s, r) => s + (r.metrics.screenPageViews ?? 0), 0);
    await writeAudit(admin.email, "integration.test", "GA4", { ok: true });
    return {
      ok: true,
      lines: [
        `7 ימים אחרונים: ${fmt(total)} צפיות בדפים`,
        `${fmt(rows.length)} דפים שונים`,
        quotaRemaining == null ? "" : `מכסה שנותרה היום: ${fmt(quotaRemaining)}`,
      ].filter(Boolean),
    };
  } catch (err) {
    await writeAudit(admin.email, "integration.test", "GA4", { ok: false });
    return fail(err);
  }
}

export async function testSmoov(_prev: TestState, _form: FormData): Promise<TestState> {
  const admin = await requireUser("admin");
  if (!smoovConfigured()) return { ok: false, lines: ["חסר SMOOV_API_KEY"] };
  try {
    const lists = await smoov.lists();
    const contacts = lists.reduce((s, l) => s + (typeof l.contactsCount === "number" ? l.contactsCount : 0), 0);
    await writeAudit(admin.email, "integration.test", "SMOOV", { ok: true });
    return {
      ok: true,
      lines: [`${fmt(lists.length)} רשימות · ${fmt(contacts)} אנשי קשר ברשימות`, `אימות: ${smoovAuthScheme() === "bearer" ? "Bearer" : "מפתח ישיר"}`],
    };
  } catch (err) {
    await writeAudit(admin.email, "integration.test", "SMOOV", { ok: false });
    return fail(err);
  }
}

export async function addSmoovCampaign(_prev: TestState, form: FormData): Promise<TestState> {
  const admin = await requireUser("admin");
  const id = Number(String(form.get("id") ?? "").trim());
  const label = String(form.get("label") ?? "").trim();
  const utmCampaign = String(form.get("utm") ?? "").trim().slice(0, 200) || null;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, lines: ["מזהה קמפיין חייב להיות מספר"] };
  if (!label) return { ok: false, lines: ["יש לתת שם לקמפיין"] };

  const lines: string[] = [];
  if (smoovConfigured()) {
    try {
      const s = await smoov.campaignStatistics(id);
      lines.push(`נמצא ב-SMOOV: נשלח ל-${fmt(Number(s.howManyWasSent ?? 0))} נמענים`);
    } catch (err) {
      return { ok: false, lines: [`SMOOV לא מצא את הקמפיין ${id}: ${(err as Error).message}`] };
    }
  }

  await getDb()
    .insert(smoovCampaigns)
    .values({ id, label, utmCampaign, addedBy: admin.email })
    .onConflictDoUpdate({ target: smoovCampaigns.id, set: { label, utmCampaign, active: true } });
  await writeAudit(admin.email, "smoov.campaign_added", String(id), { label });
  revalidatePath(PATH);
  return { ok: true, lines: [`הקמפיין "${label}" נוסף למעקב. הסטטיסטיקות יתעדכנו בסנכרון הבא.`, ...lines] };
}

export async function removeSmoovCampaign(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await getDb().update(smoovCampaigns).set({ active: false }).where(eq(smoovCampaigns.id, id));
  await writeAudit(admin.email, "smoov.campaign_removed", String(id));
  revalidatePath(PATH);
}

export async function googleServiceAccount(): Promise<string | null> {
  await requireUser("admin");
  return serviceAccountEmail();
}
