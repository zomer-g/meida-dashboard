"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userTypes, users } from "@/lib/db/schema";
import { PAGE_KEYS } from "@/lib/pages";

export type TypeState = { ok: boolean; message: string } | null;

const PATH = "/admin/user-types";
const KEY_RE = /^[a-z0-9-]{2,40}$/;

function readForm(form: FormData) {
  const label = String(form.get("label") ?? "").trim().slice(0, 80);
  const description = String(form.get("description") ?? "").trim().slice(0, 300) || null;
  const pages = form.getAll("pages").map(String).filter((p) => PAGE_KEYS.includes(p));
  const sortOrder = Number(form.get("sortOrder") ?? 0) || 0;
  return { label, description, pages: [...new Set(pages)], sortOrder };
}

export async function createUserType(_prev: TypeState, form: FormData): Promise<TypeState> {
  const admin = await requireUser("admin");
  const key = String(form.get("key") ?? "").trim().toLowerCase();
  const values = readForm(form);
  if (!KEY_RE.test(key)) return { ok: false, message: "המזהה צריך להיות באנגלית: אותיות קטנות, ספרות ומקף (2–40 תווים)" };
  if (!values.label) return { ok: false, message: "יש לתת שם לסוג המשתמש" };

  const [created] = await getDb().insert(userTypes).values({ key, ...values }).onConflictDoNothing().returning();
  if (!created) return { ok: false, message: "כבר קיים סוג משתמש עם המזהה הזה" };
  await writeAudit(admin.email, "user_type.created", key, values);
  revalidatePath(PATH);
  return { ok: true, message: `סוג המשתמש "${values.label}" נוצר` };
}

export async function updateUserType(_prev: TypeState, form: FormData): Promise<TypeState> {
  const admin = await requireUser("admin");
  const key = String(form.get("key") ?? "");
  const values = readForm(form);
  if (!values.label) return { ok: false, message: "יש לתת שם לסוג המשתמש" };

  const db = getDb();
  const [before] = await db.select().from(userTypes).where(eq(userTypes.key, key)).limit(1);
  if (!before) return { ok: false, message: "סוג המשתמש לא נמצא" };
  await db.update(userTypes).set({ ...values, updatedAt: new Date() }).where(eq(userTypes.key, key));
  await writeAudit(admin.email, "user_type.updated", key, { from: { label: before.label, pages: before.pages }, to: { label: values.label, pages: values.pages } });
  revalidatePath(PATH);
  revalidatePath("/", "layout");
  return { ok: true, message: `נשמר: ${values.pages.length} עמודים` };
}

export async function deleteUserType(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const key = String(form.get("key") ?? "");
  const db = getDb();
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.userType, key))) as [{ n: number }];
  // Deleting a type in use would silently strip its users of every page.
  if (n > 0) throw new Error("user type still assigned to users");
  const [removed] = await db.delete(userTypes).where(eq(userTypes.key, key)).returning();
  if (removed) await writeAudit(admin.email, "user_type.deleted", key);
  revalidatePath(PATH);
}
