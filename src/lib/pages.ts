/**
 * Every dashboard page, in menu order. Access is per page: an admin sees all of
 * them; anyone else sees the pages their user type lists (/admin/user-types).
 * A page an admin marks public (/admin/pages) opens without signing in.
 *
 * Adding a page: add it here, render it with `dashboardAuth(key, path)`, and
 * decide which default user types get it in DEFAULT_USER_TYPES.
 */

export type PageGroup = "media" | "metrics" | "petitions" | "requests" | "web" | "finance";

export interface DashboardPage {
  key: string;
  path: string;
  label: string;
  group: PageGroup;
  description: string;
  /** Holds names, amounts or internal notes — shown with a warning before making it public. */
  sensitive?: boolean;
}

export const PAGES: DashboardPage[] = [
  { key: "media", path: "/", label: "דוח תקשורת", group: "media", description: "פרסומים בתקשורת בעקבות בקשות ועתירות של התנועה" },
  { key: "authorities", path: "/metrics/authorities", label: "רשויות", group: "metrics", description: "עמידה במועדים, שלמות ופורמט המענה, ונימוקי סירוב לפי רשות" },
  { key: "authority-types", path: "/metrics/authority-types", label: "סוגי רשויות", group: "metrics", description: "אותם מדדים לפי סוג רשות" },
  { key: "topics", path: "/metrics/topics", label: "תחומי פעילות", group: "metrics", description: "מדדים לפי תחום הבקשה" },
  { key: "timeline", path: "/metrics/timeline", label: "ציר זמן", group: "metrics", description: "מגמות לאורך השנים" },
  { key: "ranking", path: "/metrics/ranking", label: "דירוג רשויות", group: "metrics", description: "דירוג משולב של הרשויות, בסיס לדוח התקלות הציבורי" },
  { key: "activity", path: "/activity", label: "פעילות התנועה", group: "metrics", description: "בקשות, עתירות, הוצאות משפט ופרויקטים", sensitive: true },
  { key: "petitions", path: "/petitions", label: "עתירות", group: "petitions", description: "טבלת העתירות, תוצאותיהן והוצאות המשפט", sensitive: true },
  { key: "requests", path: "/requests", label: "רשימת בקשות", group: "requests", description: "חיפוש וסינון של כל בקשות המידע", sensitive: true },
  { key: "web", path: "/web", label: "אתר ודיוור", group: "web", description: "תנועה באתר (Google Analytics) ודיוורים (SMOOV)" },
  { key: "finance", path: "/finance", label: "כספים", group: "finance", description: "הוצאות, הכנסות, התקשרויות ותכנון מול ביצוע", sensitive: true },
];

export const PAGE_KEYS = PAGES.map((p) => p.key);

export const findPage = (key: string) => PAGES.find((p) => p.key === key);

export interface DefaultUserType {
  key: string;
  label: string;
  description: string;
  pages: string[];
}

/** Created on first boot (scripts/migrate.ts); admins edit or add types afterwards. */
export const DEFAULT_USER_TYPES: DefaultUserType[] = [
  {
    key: "board",
    label: "חברי ועד מנהל",
    description: "תמונה מלאה של פעילות התנועה, כולל כספים",
    pages: PAGE_KEYS,
  },
  {
    key: "staff",
    label: "עובדי התנועה",
    description: "כל מדדי הבקשות, העתירות והתקשורת",
    pages: PAGE_KEYS.filter((k) => k !== "finance"),
  },
  {
    key: "journalists",
    label: "עיתונאים",
    description: "דוח התקשורת ומדדי הרשויות, בלי פרטים פנימיים",
    pages: ["media", "authorities", "authority-types", "topics", "timeline", "ranking"],
  },
  {
    key: "volunteers",
    label: "מתנדבים ושותפים",
    description: "דוח התקשורת בלבד",
    pages: ["media"],
  },
];
