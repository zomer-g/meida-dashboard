# חיבור Google Analytics 4 (קריאה בלבד)

הדשבורד מושך מ-GA4 של meida.org.il כניסות, צפיות בדפים, ערוצי הגעה, אירועים וקמפיינים (UTM), ומציג אותם בעמוד **אתר ודיוור**. הקריאה נעשית דרך **Service Account** — חשבון שירות של Google Cloud שמוסיפים ל-GA4 כצופה (Viewer) בלבד.

**מי עושה מה:** את שלבים 1–3 עושה מי שיש לו גישת Admin ל-GA4 של התנועה ולחשבון Google Cloud. את קובץ המפתח מזינים בקונסולת xhostd (שלב 4) — **לא** שולחים אותו בצ'אט, במייל או בתיקייה משותפת.

---

## שלב 1 — פרויקט ב-Google Cloud

1. https://console.cloud.google.com → יוצרים פרויקט חדש (למשל `meida-dashboard`) או בוחרים קיים.
2. **APIs & Services → Library** → מחפשים **Google Analytics Data API** → **Enable**.

## שלב 2 — Service Account ומפתח

1. **IAM & Admin → Service Accounts → Create Service Account**.
   - **Name:** `meida-dashboard-reader`
   - **Grant access / Roles:** לא צריך — מדלגים.
2. נכנסים לחשבון שנוצר → **Keys → Add Key → Create new key → JSON**. קובץ JSON יורד למחשב.
3. מעתיקים את כתובת המייל של החשבון: `meida-dashboard-reader@<project>.iam.gserviceaccount.com`.

> אם הארגון חוסם יצירת מפתחות (`iam.disableServiceAccountKeyCreation`), אדמין Google Workspace צריך לאפשר זאת לפרויקט הזה.

## שלב 3 — גישה ל-GA4

1. https://analytics.google.com → ה-Property של meida.org.il.
2. **Admin → Property → Property access management → + → Add users**.
3. מדביקים את מייל ה-Service Account, תפקיד **Viewer**, ומבטלים את "Notify new users by email".
4. **Admin → Property settings → Property details** → מעתיקים את **Property ID** — מספר של כ-9 ספרות (**לא** ה-`G-XXXXXXX`).

## שלב 4 — הזנת הערכים בקונסולת xhostd

1. https://xhostd.com → **meida-dashboard** → **Environment**.
2. מוסיפים:

| משתנה | ערך | Secret? |
|---|---|---|
| `GA4_PROPERTY_ID` | ה-Property ID המספרי | לא |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **כל התוכן** של קובץ ה-JSON (פותחים בפנקס רשימות, מעתיקים הכל) | **כן** |
| `GA_START_DAY` | (לא חובה) מאיזה תאריך למשוך היסטוריה, `YYYY-MM-DD`. ברירת מחדל `2024-01-01` | לא |

3. **Redeploy**.

## שלב 5 — אימות

1. **ניהול → חיבורים → Google Analytics 4 → בדיקת חיבור.** מוצגים מספר הצפיות ב-7 הימים האחרונים ומכסת ה-API שנותרה. שגיאה 403 = ה-Service Account לא נוסף כ-Viewer, או שה-API לא הופעל.
2. הסנכרון הראשון (משיכת ההיסטוריה) מתחיל תוך דקה מהפריסה ורץ בחלונות של חודש. אחר כך הנתונים מתעדכנים כל 6 שעות, וכל ריצה מושכת מחדש את 3 הימים האחרונים (GA ממשיך לעדכן אותם).
3. השוו את סך הכניסות בעמוד **אתר ודיוור** מול GA → Reports באותו טווח. סטייה קטנה בימים האחרונים תקינה.

## קישור דיוורים לתנועה באתר

כדי לראות כמה כניסות הביא כל דיוור, הקישורים בדיוורים צריכים לשאת תגיות UTM, למשל:

```
https://www.meida.org.il/?p=1234&utm_source=smoov&utm_medium=email&utm_campaign=newsletter-2026-09
```

ה-`utm_campaign` הוא המפתח המשותף: בעמוד **ניהול → חיבורים** מזינים אותו ליד מזהה הדיוור ב-SMOOV (ראו [setup-smoov.md](setup-smoov.md)).

## מה נספר — הערות פרשנות

- **כניסות, משתמשים חדשים וצפיות** מותר לסכום על פני ימים. **משתמשים פעילים** לא (אדם שחזר בכמה ימים ייספר כמה פעמים), ולכן הדשבורד לא מציג סכום שלהם.
- פער מול מערכות אחרות נובע בדרך כלל מחוסמי פרסומות ומסירוב לעוגיות — זה צפוי ולא "תקלה".
- מכסת GA4 היא כ-200 אלף tokens ליום ל-Property. הדשבורד קורא מהמראה ב-Postgres ולא פונה ל-GA בזמן טעינת עמוד.

## ניתוק

מסירים את ה-Service Account מ-Property access management, או מוחקים את המפתח ב-Google Cloud. הגישה נחסמת מיד.
