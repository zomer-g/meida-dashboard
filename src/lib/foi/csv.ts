/**
 * RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line breaks —
 * Salesforce report exports have all three in request descriptions.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return body
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? "").trim()])));
}
