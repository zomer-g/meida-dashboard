/**
 * Categorical colors in fixed order (validated — see globals.css). A ninth value is
 * never a new hue: callers fold the tail into "אחר", which takes the neutral.
 */
export const SERIES = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
  "var(--color-series-8)",
] as const;

export const OTHER_COLOR = "var(--color-series-other)";
export const OTHER_LABEL = "אחר";

/** Ordered categories (fast → slow, good → bad) take one hue's ramp instead of distinct hues. */
export const ORDINAL = ["var(--color-ord-1)", "var(--color-ord-2)", "var(--color-ord-3)", "var(--color-ord-4)", "var(--color-ord-5)"] as const;

export function colorFor(label: string, index: number): string {
  return label === OTHER_LABEL ? OTHER_COLOR : SERIES[index % SERIES.length]!;
}

export interface Slice {
  label: string;
  value: number;
}

/** Keeps the largest `top` values and folds the rest into "אחר". */
export function foldTail(items: Slice[], top = 7): Slice[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= top + 1) return sorted;
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((s, i) => s + i.value, 0);
  const existingOther = head.find((h) => h.label === OTHER_LABEL);
  if (existingOther) existingOther.value += rest;
  else head.push({ label: OTHER_LABEL, value: rest });
  return head;
}

export const fmtNum = (n: number) => new Intl.NumberFormat("he-IL").format(n);
export const fmtPct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : "—");
