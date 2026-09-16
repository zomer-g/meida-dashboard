/** Israel-day helpers. Dates in the dashboard are Israel days (YYYY-MM-DD), not UTC days. */

const TZ = "Asia/Jerusalem";

export function israelDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The instant Israel's day begins — the offset is +02:00 or +03:00 depending on DST. */
export function israelMidnight(day: string): Date {
  const noon = new Date(`${day}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(noon)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = zone?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return new Date(`${day}T00:00:00${m ? `${m[1]}:${m[2] ?? "00"}` : "+02:00"}`);
}

/** "2026-09-16" → "16.09.2026" */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

/** "2026-09" → "ספט׳ 26" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y!.slice(2)}`;
}

/** Every month from..to inclusive, as YYYY-MM. */
export function eachMonth(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while ((y < ty || (y === ty && m <= tm)) && out.length < 600) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}
