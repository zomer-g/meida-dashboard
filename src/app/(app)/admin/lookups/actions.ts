"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { mediaOutlets, organizations } from "@/lib/db/schema";
import { AUTHORITY_TYPES, MEDIA_CATEGORIES } from "@/lib/foi/classify";

export async function setAuthorityType(form: FormData): Promise<void> {
  const user = await requireUser("editor");
  const name = String(form.get("name") ?? "");
  const type = String(form.get("type") ?? "");
  if (!(AUTHORITY_TYPES as readonly string[]).includes(type)) throw new Error("unknown authority type");
  const [row] = await getDb()
    .update(organizations)
    .set({ authorityType: type, manual: true, updatedBy: user.email, updatedAt: new Date() })
    .where(eq(organizations.name, name))
    .returning();
  if (row) await writeAudit(user.email, "lookup.authority_type", name, { type });
  revalidatePath("/", "layout");
}

export async function setOutlet(form: FormData): Promise<void> {
  const user = await requireUser("editor");
  const domain = String(form.get("domain") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const category = String(form.get("category") ?? "");
  if (!name || !(MEDIA_CATEGORIES as readonly string[]).includes(category)) throw new Error("invalid outlet");
  const [row] = await getDb()
    .update(mediaOutlets)
    .set({ name, category, manual: true, updatedBy: user.email, updatedAt: new Date() })
    .where(eq(mediaOutlets.domain, domain))
    .returning();
  if (row) await writeAudit(user.email, "lookup.outlet", domain, { name, category });
  revalidatePath("/", "layout");
}
