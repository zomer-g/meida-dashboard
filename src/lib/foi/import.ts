import { parseCsv } from "./csv";
import { storeRows, type StoreResult } from "./store";

export type ImportKind = "requests" | "media" | "mixed";

/**
 * Imports one Salesforce report export. The two known reports are the full request
 * export ("Case Number", refusal grounds, petition fields…) and the media report
 * ("מספר בקשה", publication dates and links); any report with a case-number column works.
 */
export async function importCsvText(text: string): Promise<StoreResult & { kind: ImportKind }> {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("הקובץ ריק או שאינו CSV");
  const header = Object.keys(rows[0]!);
  const hasCase = ["Case Number", "מספר בקשה", "Case_Number", "CaseNumber"].some((h) => header.includes(h));
  if (!hasCase) throw new Error('לא נמצאה עמודת מספר בקשה ("Case Number" או "מספר בקשה")');

  const media = header.some((h) => h.startsWith("קישור פרסומי"));
  const full = header.includes("Deadline") || header.includes("פורמט המענה");
  const kind: ImportKind = media && !full ? "media" : full && !media ? "requests" : "mixed";
  const result = await storeRows(rows, "csv");
  return { ...result, kind };
}
