/** Filter vocabulary shared by the server (filters.ts) and the client filter bar — no server imports here. */

export const RANGES = [
  { key: "all", label: "כל התקופה" },
  { key: "12m", label: "12 חודשים" },
  { key: "ytd", label: "השנה" },
  { key: "last-year", label: "השנה שעברה" },
  { key: "custom", label: "טווח אחר" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

/** Dimension filters: URL key → label. Each page shows the ones that apply to it. */
export const FILTER_KEYS = {
  org: "ארגון",
  type: "סוג רשות",
  topic: "תחום",
  owner: "בעלי בקשה",
  project: "פרויקט",
  status: "מצב",
  outlet: "גוף תקשורת",
  category: "קטגוריית תקשורת",
  entity: "סוג אייטם",
  petition: "האם הוגשה עתירה",
} as const;

export type FilterKey = keyof typeof FILTER_KEYS;

