# הדשבורד התפעולי של התנועה לחופש המידע

דשבורד פנימי שמחליף את דוחות ה-Looker Studio: דוח התקשורת (עמוד הבית), מדדי הרשויות, עתירות, פעילות התנועה, רשימת הבקשות, תנועה באתר ודיוורים — עם כניסת Google (SSO של xhostd), ניהול משתמשים, סוגי משתמשים והרשאות לכל עמוד.

## מדריכים

| נושא | קובץ |
|---|---|
| משתמשים, סוגי משתמשים, עמודים פומביים | [docs/users-and-access.md](docs/users-and-access.md) |
| חיבור Salesforce | [docs/setup-salesforce.md](docs/setup-salesforce.md) |
| חיבור Google Analytics 4 | [docs/setup-google-analytics.md](docs/setup-google-analytics.md) |
| חיבור SMOOV | [docs/setup-smoov.md](docs/setup-smoov.md) |
| הגדרות המדדים ומיפוי מ-Looker | [docs/metrics.md](docs/metrics.md) |

## משתני סביבה ב-xhostd

| משתנה | חובה | תיאור |
|---|---|---|
| `ADMIN_EMAILS` | כן | מיילים של אדמינים קבועים, מופרדים בפסיק |
| `XHOST_AUTH_AUDIENCES` | כן | כתובת האתר (hostname) — בלעדיו אף כניסה לא מתקבלת |
| `SYNC_WORKER` | כן | `true` — מריץ את תהליך הסנכרון |
| `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET` | לחיבור Salesforce | ראו המדריך |
| `GA4_PROPERTY_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` | לחיבור GA4 | ראו המדריך |
| `SMOOV_API_KEY` | לחיבור SMOOV | ראו המדריך |
| `CONTACT_EMAIL` | לא | כתובת לפניות בהצהרת הנגישות ובמדיניות הפרטיות (בלעדיה יוצג "מנהלי המערכת") |
| `SEED_ON_EMPTY` | לא | `true` (ברירת מחדל): טעינת קובצי CSV מתיקיית `seed/` לבסיס נתונים ריק (התיקייה אינה בריפו) |

`DATABASE_URL` מוזרק אוטומטית על ידי xhostd. אחרי כל שינוי במשתני סביבה צריך פריסה מחדש.

## פיתוח מקומי

```bash
npm ci
npm run db:local
```

> הריפו הזה פומבי ואינו מכיל נתונים: נתוני הבקשות הם מידע אישי ומגיעים מ-Salesforce (או מקובצי CSV שמעלים בממשק). אל תוסיפו לריפו ייצואים, דוחות מבנה או קובצי `.env`.

בטרמינל נוסף, עם `.env.local` (ראו `.env.example`):

```bash
npm run db:migrate:local
npm run import:csv -- seed/requests-export.csv seed/media-report.csv
npm run dev
```

פרטים טכניים למפתחים (ול-Claude): [CLAUDE.md](CLAUDE.md).
