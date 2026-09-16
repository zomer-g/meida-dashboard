/**
 * First guesses for lookups that editors then correct at /admin/lookups:
 * the authority type of an organization, and the outlet behind a link.
 * A row an editor saved (`manual`) is never overwritten by these.
 */

export const AUTHORITY_TYPES = [
  "משרד ממשלתי",
  "יחידת סמך",
  "רשות מקומית",
  "קופת חולים",
  "השכלה גבוהה",
  "תאגיד סטטוטורי",
  "חברה ממשלתית",
  "חברה עירונית",
  "מוסד ממלכתי",
  "בית חולים ממשלתי",
  "אחר",
  "טרם סווג",
] as const;

const EXACT: Record<string, string> = {
  "משטרת ישראל": "יחידת סמך",
  "צבא הגנה לישראל": "יחידת סמך",
  "שירות בתי הסוהר": "יחידת סמך",
  "הנהלת בתי המשפט": "יחידת סמך",
  "המטה לביטחון לאומי": "יחידת סמך",
  "הלשכה המרכזית לסטטיסטיקה": "יחידת סמך",
  "מבקר המדינה": "מוסד ממלכתי",
  "הכנסת": "מוסד ממלכתי",
  "בנק ישראל": "מוסד ממלכתי",
  "נשיא המדינה": "מוסד ממלכתי",
  "המוסד לביטוח לאומי": "תאגיד סטטוטורי",
  "רכבת ישראל": "חברה ממשלתית",
  "חברת החשמל": "חברה ממשלתית",
};

const RULES: [RegExp, string][] = [
  [/^(ה)?משרד /, "משרד ממשלתי"],
  [/^קופת חולים/, "קופת חולים"],
  [/^(עיריית|עירית|מועצה (אזורית|מקומית)|המועצה (האזורית|המקומית)|איגוד ערים)/, "רשות מקומית"],
  [/(אוניברסיט|מכללה|המכללה|הטכניון|להשכלה גבוהה|מכון ויצמן|האקדמיה)/, "השכלה גבוהה"],
  [/(בית החולים|בית חולים|המרכז הרפואי|מרכז רפואי)/, "בית חולים ממשלתי"],
  [/(החברה הכלכלית|חברה עירונית|החברה העירונית)/, "חברה עירונית"],
  [/(בע"מ|בע״מ|^חברת |^החברה )/, "חברה ממשלתית"],
  [/^(רשות|הרשות|נציבות|הנציבות|היחידה|המנהל|מנהל|אגף|הממונה|שירות)/, "יחידת סמך"],
  [/(תאגיד|^המוסד|^מוסד|^קרן|^הקרן|^מועצת|^המועצה ל)/, "תאגיד סטטוטורי"],
];

export function guessAuthorityType(name: string): string {
  const n = name.trim();
  if (EXACT[n]) return EXACT[n]!;
  for (const [re, type] of RULES) if (re.test(n)) return type;
  return "טרם סווג";
}

export const MEDIA_CATEGORIES = ["ארצי", "מקומי", "מגזרי", "בינלאומי", "משפטי", "רשתות חברתיות", "רדיו", "אחר", "טרם סווג"] as const;

/** Known outlets by registrable domain. Anything else starts as "טרם סווג" under its domain name. */
const OUTLETS: Record<string, [string, string]> = {
  "ynet.co.il": ["Ynet", "ארצי"],
  "yediot.co.il": ["ידיעות אחרונות", "ארצי"],
  "ynetnews.com": ["Ynet", "ארצי"],
  "calcalist.co.il": ["כלכליסט", "ארצי"],
  "haaretz.co.il": ["הארץ", "ארצי"],
  "haaretz.com": ["הארץ", "ארצי"],
  "themarker.com": ["דה מרקר", "ארצי"],
  "globes.co.il": ["גלובס", "ארצי"],
  "mako.co.il": ["מאקו / N12", "ארצי"],
  "kan.org.il": ["כאן", "ארצי"],
  "maariv.co.il": ["מעריב", "ארצי"],
  "walla.co.il": ["וואלה", "ארצי"],
  "israelhayom.co.il": ["ישראל היום", "ארצי"],
  "ice.co.il": ["ice", "ארצי"],
  "13tv.co.il": ["רשת 13", "ארצי"],
  "13news.co.il": ["רשת 13", "ארצי"],
  "ch10.co.il": ["רשת 13", "ארצי"],
  "i24news.tv": ["i24NEWS", "ארצי"],
  "zman.co.il": ["זמן ישראל", "ארצי"],
  "davar1.co.il": ["דבר", "ארצי"],
  "makorrishon.co.il": ["מקור ראשון", "ארצי"],
  "news1.co.il": ["News1", "ארצי"],
  "timesofisrael.com": ["The Times of Israel", "ארצי"],
  "jpost.com": ["The Jerusalem Post", "ארצי"],
  "msn.com": ["MSN", "ארצי"],
  "the7eye.org.il": ["העין השביעית", "ארצי"],
  "shakuf.co.il": ["שקוף", "ארצי"],
  "ha-makom.co.il": ["המקום הכי חם בגיהנום", "ארצי"],
  "mekomit.co.il": ["שיחה מקומית", "ארצי"],
  "shomrim.news": ["שומרים", "ארצי"],
  "hashomrim.org": ["שומרים", "ארצי"],
  "tradersunion.com": ["Traders Union", "אחר"],
  "one.co.il": ["ONE", "ארצי"],
  "timeout.co.il": ["טיים אאוט", "ארצי"],
  "vesty.co.il": ["Vesty", "מגזרי"],
  "bhol.co.il": ["בחדרי חרדים", "מגזרי"],
  "kikar.co.il": ["כיכר השבת", "מגזרי"],
  "be106.net": ["בחדרי חרדים 106", "מגזרי"],
  "inn.co.il": ["ערוץ 7", "מגזרי"],
  "israelnationalnews.com": ["ערוץ 7", "מגזרי"],
  "kipa.co.il": ["כיפה", "מגזרי"],
  "srugim.co.il": ["סרוגים", "מגזרי"],
  "jdn.co.il": ["JDN", "מגזרי"],
  "hm-news.co.il": ["המחדש", "מגזרי"],
  "emess.co.il": ["אמס", "מגזרי"],
  "babli.co.il": ["בבלי", "מגזרי"],
  "melabes.co.il": ["מלבס", "מגזרי"],
  "mivzaklive.co.il": ["מבזק לייב", "מגזרי"],
  "bokra.net": ["בוקרא", "מגזרי"],
  "alquds.com": ["אל-קודס", "מגזרי"],
  "kul.co.il": ["כל העיר", "מגזרי"],
  "mynet.co.il": ["mynet", "מקומי"],
  "ashdodnet.com": ["אשדודנט", "מקומי"],
  "yomyom.net": ["יום יום", "מקומי"],
  "kula.co.il": ["כולה", "מקומי"],
  "mnews.co.il": ["mnews", "מקומי"],
  "tlvonline.co.il": ["תל אביב אונליין", "מקומי"],
  "colbonews.co.il": ["כלבו", "מקומי"],
  "ononews.co.il": ["אונו ניוז", "מקומי"],
  "kolhair.co.il": ["כל העיר", "מקומי"],
  "myrehovot.co.il": ["מיי רחובות", "מקומי"],
  "yehudili.co.il": ["יהודילי", "מקומי"],
  "bizzness.net": ["ביזנס", "מקומי"],
  "972mag.com": ["+972 Magazine", "בינלאומי"],
  "middleeastmonitor.com": ["Middle East Monitor", "בינלאומי"],
  "twitter.com": ["X (טוויטר)", "רשתות חברתיות"],
  "x.com": ["X (טוויטר)", "רשתות חברתיות"],
  "facebook.com": ["פייסבוק", "רשתות חברתיות"],
  "instagram.com": ["אינסטגרם", "רשתות חברתיות"],
  "youtube.com": ["יוטיוב", "רשתות חברתיות"],
  "youtu.be": ["יוטיוב", "רשתות חברתיות"],
  "t.me": ["טלגרם", "רשתות חברתיות"],
  "tiktok.com": ["טיקטוק", "רשתות חברתיות"],
  "linkedin.com": ["לינקדאין", "רשתות חברתיות"],
  "netunim.wordpress.com": ["בלוג נתונים", "רשתות חברתיות"],
  "spotify.com": ["ספוטיפיי (פודקאסט)", "רדיו"],
  "glz.co.il": ["גלי צה״ל", "רדיו"],
  "103fm.maariv.co.il": ["103FM", "רדיו"],
  "90fm.co.il": ["רדיו 90FM", "רדיו"],
  "meida.org.il": ["אתר התנועה", "אחר"],
};

// Second-level labels under which a registrable domain has three parts.
const SECOND_LEVEL = new Set(["co", "org", "ac", "gov", "net", "muni", "k12", "idf"]);

/** "https://news.walla.co.il/item/1" → "walla.co.il". Google alert redirects are unwrapped first. */
export function domainOf(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const wrapped = url.hostname.endsWith("google.com") && url.pathname === "/url" ? url.searchParams.get("url") : null;
  if (wrapped) return domainOf(wrapped);

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (OUTLETS[host]) return host;
  const parts = host.split(".");
  const keep = parts.length >= 3 && SECOND_LEVEL.has(parts.at(-2)!) ? 3 : 2;
  const registrable = parts.slice(-keep).join(".");
  // Blogs on shared hosts are different outlets.
  if (["wordpress.com", "blogspot.com", "substack.com", "medium.com"].includes(registrable)) return host;
  if (registrable === "spotify.com") return "spotify.com";
  return registrable;
}

export function guessOutlet(domain: string): { name: string; category: string } {
  const known = OUTLETS[domain];
  return known ? { name: known[0], category: known[1] } : { name: domain, category: "טרם סווג" };
}
