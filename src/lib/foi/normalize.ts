import { domainOf } from "./classify";

/**
 * Turns one source row — keyed by Salesforce field *labels*, as in a report export
 * or the label-resolved Salesforce mirror — into a request and its publications.
 *
 * Only columns the row actually has are returned, so a narrow export (the media
 * report) updates what it carries and leaves everything else on the request intact.
 */

export type LabelRow = Record<string, string>;

/** Alternative labels for the same field across the two report exports and Salesforce itself. */
export const LABELS = {
  caseNumber: ["Case Number", "מספר בקשה", "Case_Number", "CaseNumber"],
  sfId: ["Case ID", "__sf_id"],
  status: ["Status", "מצב"],
  name: ["שם הבקשה", "Subject"],
  description: ["Description", "תיאור"],
  organization: ["שם הארגון אליו מופנת הבקשה", "Account.Name"],
  owner: ["Case Owner", "בעלי בקשה"],
  handler: ["המטפל בבקשה", "Contact.Name"],
  journalist: ["עיתונאי שותף לבקשה"],
  mediaOutlet: ["גוף תקשורת"],
  topic: ["תחום בקשה"],
  entityKind: ["מהות היישות"],
  projects: ["שיוך לפרויקט"],
  submittedOn: ["תאריך הגשת הבקשה"],
  deadlineOn: ["Deadline"],
  fullResponseOn: ["מענה מלא לבקשה"],
  extension30On: ["ארכה ראשונה (30 ימים) 7ב"],
  extension60On: ['ארכת מנכ"ל (60 ימים) 7ג'],
  thirdPartyOn: ["פנייה לצד שלישי 13א"],
  completeness: ["התייחסות לכל הפריטים שנתבקשו"],
  responseFormat: ["פורמט המענה"],
  closeReason: ["סיבת הסגירה"],
  petitionPlanned: ["האם לפתוח עתירה?"],
  petitionFiledOn: ["תאריך הגשת העתירה"],
  petitionProcedure: ["סוג ההליך"],
  petitionOutcome: ["תוצאת העתירה"],
  courtCaseNumber: ["מספר תיק בית משפט"],
  judge: ["שם השופט"],
  lawFirm: ["משרד עורכי דין"],
  infoReceivedAfterPetition: ["האם התקבל מידע בעקבות העתירה"],
  costsAwarded: ["פסיקת הוצאות לטובת התנועה"],
  costsReceived: ["סכום בפועל לזכות התנועה"],
  feeRefunded: ["החזר אגרה"],
  refusalNotes: ["הערות כלליות על סירוב למסירת המידע"],
  sfUrl: ["URL TO MAIL"],
} as const;

export const REMINDERS = ["תזכורת ראשונה", "תזכורת שנייה", "תזכורת שלישית", "תזכורת רביעית"];
export const LEGAL_WARNINGS = ["התראה לפני נקיטת הליכים משפטיים", "התראה שנייה לפני נקיטת הליכים משפטיים"];

/** The refusal grounds of sections 8–9 of the Freedom of Information Law, as checkbox labels. */
export const REFUSAL_GROUNDS = [
  "הקצאת משאבים",
  "נוצר או התקבל לפני יותר מ-7 שנים",
  "לא ניתן לאתר את המידע",
  "המידע פורסם",
  "נוצר בידי רשות ציבורית אחרת",
  "חשש לביטחון, חוץ או שלומו של אדם",
  "שר הביטחון קבע בצו",
  "פגיעה בפרטיות",
  "אין לגלות לפי דין",
  "שמירת דינים",
  "שיבוש התפקוד התקין",
  "מדיניות בשלבי עיצוב",
  "משא ומתן",
  "דיונים פנימיים",
  "ניהול פנימי ללא חשיבות לציבור",
  "סוד מסחרי",
  "אי גילויו תנאי למסירתו",
  "שיטות עבודה ונהלים באכיפה",
  "ענייני משמעת",
  "צנעת הפרט של נפטר",
  "פגיעה בעניינים אקדמאיים",
] as const;

export const ORDINALS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שביעי", "שמיני", "תשיעי", "עשירי"];

type Key = keyof typeof LABELS;

function pick(row: LabelRow, key: Key): string | undefined {
  for (const label of LABELS[key]) if (label in row) return row[label]!.trim();
  return undefined;
}

const has = (row: LabelRow, key: Key) => LABELS[key].some((l) => l in row);

/** dd/mm/yyyy (reports) or yyyy-mm-dd[Thh:mm…] (Salesforce) → yyyy-mm-dd. */
export function parseDay(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  let m = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    const day = `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return isValidDay(day) ? day : null;
  }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m && isValidDay(m[0]) ? m[0] : null;
}

function isValidDay(day: string): boolean {
  const d = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

function parseBool(value: string | undefined): boolean | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (["true", "כן", "1", "yes"].includes(v)) return true;
  if (["false", "לא", "0", "no"].includes(v)) return false;
  return null;
}

function parseInt0(value: string | undefined): number | null {
  const v = value?.replace(/[,\s₪]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const text = (value: string | undefined) => (value ? value : null);

/** Anything rendered as a link must be http(s): a "javascript:" cell would otherwise run on click. */
const httpUrl = (value: string | undefined) => {
  const v = value?.trim();
  return v && /^https?:\/\//i.test(v) ? v : null;
};

/** '["eu2020","קורונה"]' (reports) or 'eu2020;קורונה' (a Salesforce multi-picklist). */
function parseList(value: string | undefined): string[] {
  const v = value?.trim();
  if (!v || v === "[]") return [];
  if (v.startsWith("[")) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return v.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Link cells come as the report's HTML popup anchor, as a plain URL, or empty.
 * The anchor's title attribute and its href both carry the URL, percent-encoded in the href.
 */
export function extractUrl(cell: string | undefined): string | null {
  if (!cell?.trim()) return null;
  let decoded = cell;
  try {
    decoded = decodeURIComponent(cell);
  } catch {
    /* a stray % — use it as is */
  }
  const title = cell.match(/title="(https?:\/\/[^"\s]+)/)?.[1];
  const found = title ?? decoded.match(/https?:\/\/[^\s'"<>)]+/)?.[0];
  return found ? found.replace(/[.,;]+$/, "") : null;
}

export interface Publication {
  position: number;
  publishedOn: string | null;
  url: string | null;
  domain: string | null;
}

export interface NormalizedRequest {
  caseNumber: string;
  /** Only the columns present in the source row. */
  values: Record<string, unknown>;
  /** null when the row has no publication columns at all (keep what is stored). */
  publications: Publication[] | null;
}

export function normalizeRow(row: LabelRow): NormalizedRequest | null {
  const caseNumber = pick(row, "caseNumber")?.replace(/^0+(?=\d)/, "");
  if (!caseNumber) return null;

  const values: Record<string, unknown> = {};
  const set = (key: Key, value: unknown) => {
    if (has(row, key)) values[key] = value;
  };

  for (const key of [
    "status",
    "name",
    "description",
    "organization",
    "owner",
    "handler",
    "journalist",
    "mediaOutlet",
    "topic",
    "entityKind",
    "completeness",
    "responseFormat",
    "closeReason",
    "petitionProcedure",
    "petitionOutcome",
    "courtCaseNumber",
    "judge",
    "lawFirm",
    "refusalNotes",
    "sfId",
  ] as const) {
    set(key, text(pick(row, key)));
  }
  set("sfUrl", httpUrl(pick(row, "sfUrl")));
  for (const key of ["submittedOn", "deadlineOn", "fullResponseOn", "extension30On", "extension60On", "thirdPartyOn", "petitionFiledOn"] as const) {
    set(key, parseDay(pick(row, key)));
  }
  for (const key of ["petitionPlanned", "infoReceivedAfterPetition", "feeRefunded"] as const) set(key, parseBool(pick(row, key)));
  for (const key of ["costsAwarded", "costsReceived"] as const) set(key, parseInt0(pick(row, key)));
  set("projects", parseList(pick(row, "projects")));

  if (REMINDERS.some((l) => l in row)) values.remindersCount = REMINDERS.filter((l) => parseDay(row[l])).length;
  if (LEGAL_WARNINGS.some((l) => l in row)) values.legalWarningsCount = LEGAL_WARNINGS.filter((l) => parseDay(row[l])).length;
  if (REFUSAL_GROUNDS.some((l) => l in row)) values.refusalGrounds = REFUSAL_GROUNDS.filter((l) => parseBool(row[l]) === true);

  let publications: Publication[] | null = null;
  if (ORDINALS.some((o) => `תאריך פרסום ${o}` in row) || "קישור פרסומי 1" in row) {
    publications = [];
    ORDINALS.forEach((ordinal, i) => {
      const publishedOn = parseDay(row[`תאריך פרסום ${ordinal}`]);
      const url = extractUrl(row[`קישור פרסומי ${i + 1}`]);
      if (!publishedOn && !url) return;
      publications!.push({ position: i + 1, publishedOn, url, domain: url ? domainOf(url) : null });
    });
  }

  return { caseNumber, values, publications };
}
