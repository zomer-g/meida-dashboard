"use server";

import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { pageSettings } from "@/lib/db/schema";
import { findPage } from "@/lib/pages";

export async function setPagePublic(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const page = findPage(String(form.get("page") ?? ""));
  if (!page) throw new Error("unknown page");
  const isPublic = form.get("public") === "true";
  // Publishing needs the explicit tick; the form enforces it too, but an action is a public endpoint.
  if (isPublic && form.get("confirm") !== "yes") throw new Error("confirmation required");

  await getDb()
    .insert(pageSettings)
    .values({ pageKey: page.key, isPublic, updatedBy: admin.email })
    .onConflictDoUpdate({ target: pageSettings.pageKey, set: { isPublic, updatedBy: admin.email, updatedAt: new Date() } });
  await writeAudit(admin.email, isPublic ? "page.published" : "page.unpublished", page.key);
  revalidatePath("/admin/pages");
  revalidatePath(page.path);
}
