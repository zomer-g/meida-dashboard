"use server";

import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { dataImports } from "@/lib/db/schema";
import { importCsvText } from "@/lib/foi/import";

export type ImportState = { ok: boolean; lines: string[] } | null;

// The import holds the file, the parsed rows and the normalized rows at once, in a
// web process with a 256MB heap — a report export is a few MB, so this is generous.
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_FILES = 4;

/** Editors upload Salesforce report exports; each file merges into the requests by case number. */
export async function uploadCsv(_prev: ImportState, form: FormData): Promise<ImportState> {
  const user = await requireUser("editor");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, lines: ["יש לבחור לפחות קובץ CSV אחד"] };
  if (files.length > MAX_FILES) return { ok: false, lines: [`אפשר להעלות עד ${MAX_FILES} קבצים בפעם אחת`] };

  const lines: string[] = [];
  let ok = true;
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      ok = false;
      lines.push(`${file.name}: הקובץ גדול מ-${MAX_BYTES / 1024 / 1024}MB`);
      continue;
    }
    try {
      const result = await importCsvText(await file.text());
      await getDb().insert(dataImports).values({
        fileName: file.name.slice(0, 200),
        kind: result.kind,
        rows: result.rows,
        inserted: result.inserted,
        updated: result.updated,
        publications: result.publications,
        importedBy: user.email,
      });
      await writeAudit(user.email, "data.imported", file.name, { ...result });
      lines.push(
        `${file.name}: ${result.rows.toLocaleString("he-IL")} שורות · ${result.inserted} בקשות חדשות · ${result.updated} עודכנו · ${result.publications} פרסומים${result.skipped ? ` · ${result.skipped} שורות בלי מספר בקשה דולגו` : ""}`,
      );
    } catch (err) {
      ok = false;
      lines.push(`${file.name}: ${(err as Error).message}`);
    }
  }
  revalidatePath("/", "layout");
  return { ok, lines };
}
