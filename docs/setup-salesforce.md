# חיבור Salesforce (קריאה בלבד)

הדשבורד קורא את בקשות המידע (אובייקט **Case**) ישירות מ-Salesforce, ומחליף את העלאת קובצי ה-CSV. הוא **לא כותב** ל-Salesforce: משתמש האינטגרציה מקבל הרשאות קריאה בלבד, והקוד עצמו מסוגל לשלוח רק בקשות קריאה (GET), חוץ מבקשת האסימון.

החיבור בנוי משלושה חלקים:
1. **משתמש אינטגרציה:** משתמש ייעודי שהדשבורד פועל בשמו.
2. **Permission Set:** מה המשתמש הזה רשאי לקרוא.
3. **External Client App (ECA):** "האפליקציה" שדרכה השרת מקבל אסימון גישה בשיטת Client Credentials, בלי סיסמה של אדם.

> מאז Spring '26 אי אפשר ליצור Connected App חדש, ולכן משתמשים ב-External Client App. אם תפריט נראה אחרת אצלך, חפש את שם ההגדרה בתיבת **Quick Find** ב-Setup.

**מי עושה מה:** את שלבים 1–5 עושה אדמין Salesforce של התנועה. את ערכי הסודות מזינים בקונסולת xhostd (שלב 6) — **לא** בצ'אט, לא במייל ולא במסמך משותף.

---

## שלב 1 — משתמש אינטגרציה

1. **Setup → Users → Users → New User**.
2. ממלאים:
   - **Last Name:** `Meida Dashboard Integration`
   - **Email:** כתובת שלך (אליה יגיע מייל האימות)
   - **Username:** ייחודי בכל Salesforce, למשל `dashboard@meida.integration`
   - **User License:** `Salesforce Integration` (במהדורות Enterprise ומעלה יש 5 רישיונות כאלה בחינם; בארגון ללא מטרות רווח בדקו מול Power of Us)
   - **Profile:** `Minimum Access - API Only Integrations`
3. שומרים.
4. בדף המשתמש: **Permission Set License Assignments → Edit Assignments → `Salesforce API Integration`** ושומרים. **חובה** — בלי זה הוספת ה-Permission Set נכשלת עם `The user license doesn't allow the permission`.
   - לא נוגעים במשתמשי אינטגרציה קיימים; ייתכן שמערכות אחרות מתחברות דרכם.

## שלב 2 — Permission Set לקריאה בלבד

1. **Setup → Permission Sets → New**.
   - **Label:** `Meida Dashboard Read Only`
   - **License:** `--None--` (אם בוחרים רישיון, חלק מהאובייקטים לא יופיעו ב-Object Settings).
2. **Object Settings → Cases → Edit:**
   - מסמנים **Read** ו-**View All Records** (בלי View All הסנכרון יראה רק בקשות שמשתמש האינטגרציה הוא הבעלים שלהן).
   - **Field Permissions:** מסמנים **Read Access** לכל השדות. שדה בלי Read פשוט לא יגיע לדשבורד (למשל נימוקי הסירוב או קישורי הפרסומים).
3. **Object Settings → Accounts** ו-**Contacts:** **Read** ו-**View All Records**, ו-Read Access לשדה **Name**. הארגון שאליו מופנת הבקשה הוא ה-Account של ה-Case, והמטפל בבקשה הוא ה-Contact — בלי ההרשאה הזו שדות ה-lookup האלה בכלל לא נראים למשתמש האינטגרציה, והדשבורד לא יודע לאיזו רשות הוגשה בקשה.
4. **Object Settings → Users** (אם מופיע): **Read** — כדי להציג את שם בעלי הבקשה.
5. **לא** מסמנים Create, Edit או Delete באף אובייקט.
6. **Manage Assignments → Add Assignment** ובוחרים את משתמש האינטגרציה.

> היסטוריית הסטטוסים (CaseHistory) ו-Record Types נקראות אוטומטית כשיש קריאה ל-Case. היסטוריה קיימת רק לשדות שמסומנים ל-**Field History Tracking**, ורק מיום הסימון.
>
> **שינוי הרשאות לא מיידי:** Salesforce מחיל הרשאות רק על סשן חדש. הדשבורד מחליף סשן פעם בשעה, ולכן שינוי נכנס לתוקף תוך שעה לכל היותר.

## שלב 3 — External Client App

1. **Setup → External Client App Manager → New External Client App**.
2. **Basic Information:**
   - **Name:** `Meida Dashboard`
   - **Contact Email:** הכתובת שלך
   - **Distribution State:** `Local`
3. **API (Enable OAuth Settings)** → מסמנים **Enable OAuth**:
   - **Callback URL:** `https://login.salesforce.com/services/oauth2/success` (שדה חובה שלא בשימוש בזרימה הזו)
   - **OAuth Scopes:** `Manage user data via APIs (api)`
   - **Flow Enablement:** מסמנים **Enable Client Credentials Flow**
4. **Create**.
   > לא רואים את **Flow Enablement**? הוא מופיע רק אחרי **Enable OAuth**. באפליקציה קיימת: **Settings → OAuth Settings → Edit**.
5. לשונית **Policies → Edit → OAuth Policies**:
   - **Enable Client Credentials Flow** — זו תיבה **שנייה**, נפרדת מזו שב-Settings. שתיהן חייבות להיות מסומנות (אחרת: `invalid_client`).
   - **Run As (Username):** ה-Username של משתמש האינטגרציה משלב 1
   - **Permitted Users:** `All users may self-authorize`
   - **IP Relaxation:** `Relax IP restrictions` (כתובות היציאה של xhostd אינן קבועות)
   - שומרים.
6. לשונית **Settings → OAuth Settings → Consumer Key and Secret**. Salesforce ישלח קוד אימות למייל. תצטרכו את **Consumer Key** ואת **Consumer Secret** בשלב 6.

## שלב 4 — כתובת My Domain

**Setup → My Domain** → מעתיקים את **Current My Domain URL**, למשל `https://meida.my.salesforce.com`.

> Client Credentials עובד **רק** מול כתובת My Domain, לא מול `login.salesforce.com`. (בדוח שייצאתם הקישורים הם `eu11.salesforce.com` — זו כתובת השרת, לא ה-My Domain.)

## שלב 5 — (לא חובה) בדיקה עצמית בטרמינל

תשובה תקינה מכילה `access_token` ו-`instance_url`:

```bash
curl -s -X POST "https://<my-domain>.my.salesforce.com/services/oauth2/token" -d grant_type=client_credentials -d client_id="<Consumer Key>" -d client_secret="<Consumer Secret>"
```

## שלב 6 — הזנת הערכים בקונסולת xhostd

1. נכנסים ל-https://xhostd.com → האפליקציה **meida-dashboard** → **Environment**.
2. מוסיפים:

| משתנה | ערך | Secret? |
|---|---|---|
| `SF_LOGIN_URL` | כתובת ה-My Domain (עם או בלי `https://`) | לא |
| `SF_CLIENT_ID` | Consumer Key | כן |
| `SF_CLIENT_SECRET` | Consumer Secret | **כן** |

3. **Redeploy** (משתני סביבה נכנסים לתוקף רק בפריסה הבאה). אפשר גם לבקש מ-Claude "תפרוס מחדש את meida-dashboard".

## שלב 7 — אימות בדשבורד

1. **ניהול → Salesforce → בדיקת חיבור.** מוצגים: המשתמש שבשמו פועל החיבור, ומספר ה-Cases שהוא רואה. מספר נמוך מהצפוי = חסר **View All Records**.
2. **ניהול → Salesforce → הפקת דו״ח.** בטבלה **Dashboard fields found on Case** מופיע לכל שדה של הדשבורד שם ה-API שנמצא לפי התווית. שדה שמסומן **not found**:
   - אין לו Read Access (שלב 2), או
   - התווית שלו ב-Salesforce שונה מהכותרת בדוחות. במקרה כזה מוסיפים את התווית לרשימה `LABELS` בקובץ `src/lib/foi/normalize.ts` ופורסים.
3. **ניהול → סנכרון → סנכרון עכשיו.** תוך דקה מתחיל סנכרון מלא; בסיומו כל הבקשות מגיעות מ-Salesforce (בעמוד "העלאת נתונים" המונה "מ-Salesforce" עולה), והדשבורד מתעדכן כל 10 דקות.

## איך זה עובד מאחורי הקלעים

- כל 10 דקות: עדכונים אינקרמנטליים לפי `SystemModstamp` (כולל מחיקות מסל המחזור); פעם בלילה התאמה מלאה של מזהים. המידע נשמר במראה ב-Postgres, והדשבורד לא פונה ל-Salesforce בזמן טעינת עמוד.
- אחרי כל סנכרון, הבקשות נבנות מחדש מהמראה לפי **תוויות השדות** — אותן כותרות כמו בדוחות ה-CSV — כך שכל המדדים ממשיכים לעבוד בלי שינוי.
- בקשה שהועלתה קודם מ-CSV ונמצאת גם ב-Salesforce מתעדכנת לפי Salesforce (לפי מספר הבקשה). אחרי סנכרון מוצלח, בקשות שהגיעו **רק** מקובצי CSV נמחקות, כך שהדשבורד מציג את נתוני Salesforce בלבד (`SF_REPLACE_CSV=false` משאיר אותן).
- בכל סנכרון נרשם בלוג כמה משדות הדשבורד נמצאו ב-Case ואילו לא (`[sync] Case field mapping`), ואם חסר שדה — גם רשימת שדות ה-lookup שהמשתמש רואה.
- שדה lookup (Account, Contact, בעלי בקשה) מגיע לדשבורד כשם הרשומה המקושרת, כמו בדוח.
- כשמשתמש האינטגרציה מתחיל לראות שדות חדשים (אחרי שינוי הרשאות), הסנכרון הבא טוען מחדש את כל הבקשות, כך שגם בקשות ישנות מקבלות את הערכים.

## תקלות נפוצות

| תסמין | סיבה | פתרון |
|---|---|---|
| `invalid_client` / `no client credentials user enabled` | רק אחת משתי התיבות של Client Credentials מסומנת, או שאין Run As | לסמן גם ב-Settings וגם ב-Policies, ולהגדיר Run As |
| `invalid_grant` / `request not supported on this domain` | `SF_LOGIN_URL` הוא `login.salesforce.com` | להשתמש בכתובת My Domain |
| נתתי הרשאה ועדיין לא רואים שדה/רשומות | סשן ישן שומר הרשאות | להמתין עד שעה, או להפעיל מחדש את הדשבורד |
| שדה קיים ב-Salesforce אבל "not found" בדו״ח | אין Field-Level Security לקריאה, או תווית שונה | Field Permissions → Read, או להוסיף תווית ל-`LABELS` |
| `The user license doesn't allow the permission` | חסר Permission Set License | שלב 1, סעיף 4 |

## ניתוק

בכל רגע אפשר להשבית את משתמש האינטגרציה או לבטל את ה-ECA, והגישה נחסמת מיד. הנתונים שכבר סונכרנו נשארים בדשבורד עד שיימחקו.
