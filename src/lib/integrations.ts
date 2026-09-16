/**
 * Whether each integration has its configuration in place. "Configured" means
 * the env vars exist — not that a connection was verified; the sync status
 * screen reports actual connectivity.
 */
export interface IntegrationStatus {
  key: "salesforce" | "ga4" | "smoov";
  name: string;
  scope: string;
  envVars: string[];
  guide: string;
  configured: boolean;
}

const DEFINITIONS: Omit<IntegrationStatus, "configured">[] = [
  {
    key: "salesforce",
    name: "Salesforce",
    scope: "בקשות מידע (Case), היסטוריית סטטוסים ומשתמשים — קריאה בלבד",
    envVars: ["SF_LOGIN_URL", "SF_CLIENT_ID", "SF_CLIENT_SECRET"],
    guide: "docs/setup-salesforce.md",
  },
  {
    key: "ga4",
    name: "Google Analytics 4",
    scope: "meida.org.il — כניסות, צפיות, ערוצים וקמפיינים",
    envVars: ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"],
    guide: "docs/setup-google-analytics.md",
  },
  {
    key: "smoov",
    name: "SMOOV",
    scope: "רשימות תפוצה, דיוורים וסטטיסטיקות",
    envVars: ["SMOOV_API_KEY"],
    guide: "docs/setup-smoov.md",
  },
];

// Locally the Google key may come from a file instead of the JSON variable.
const isSet = (key: string) =>
  Boolean(process.env[key]) || (key === "GOOGLE_SERVICE_ACCOUNT_JSON" && Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_FILE));

export function integrationStatus(): IntegrationStatus[] {
  return DEFINITIONS.map((d) => ({ ...d, configured: d.envVars.every(isSet) }));
}
