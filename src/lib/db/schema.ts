import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Role } from "@/lib/auth/roles";
import type { SchemaReport } from "@/lib/sf/schema-report";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: "string" });

/* ------------------------------------------------------------------ access */

/**
 * A kind of user — board member, staff, journalist… — and the dashboard pages it
 * may open. Admins manage these at /admin/user-types; `pages` holds page keys
 * from src/lib/pages.ts. Admins see every page whatever their type.
 */
export const userTypes = pgTable("user_types", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description"),
  pages: text("pages").array().notNull().default(sql`'{}'::text[]`),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** People allowed into the platform. Emails are stored lowercased. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    // Google subject from the xhostd token; bound on first sign-in.
    sub: text("sub").unique(),
    name: text("name"),
    picture: text("picture"),
    role: text("role").$type<Role>().notNull().default("viewer"),
    /** Bumped to revoke this user's MCP tokens (an issued token carries the version it was signed with). */
    mcpTokenVersion: integer("mcp_token_version").notNull().default(0),
    userType: text("user_type").references(() => userTypes.key, { onUpdate: "cascade", onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastLoginAt: ts("last_login_at"),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('viewer', 'editor', 'admin')`)],
);

/** An admin's invitation, redeemed when that email first signs in. */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: text("role").$type<Role>().notNull(),
    userType: text("user_type").references(() => userTypes.key, { onUpdate: "cascade", onDelete: "set null" }),
    invitedBy: text("invited_by").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    check("invites_role_check", sql`${t.role} in ('viewer', 'editor', 'admin')`),
    uniqueIndex("invites_open_email_idx").on(t.email).where(sql`accepted_at is null and revoked_at is null`),
  ],
);

/** Sign-ins that were refused, so an admin can approve them with one click. */
export const accessRequests = pgTable("access_requests", {
  email: text("email").primaryKey(),
  name: text("name"),
  attempts: integer("attempts").notNull().default(1),
  firstAt: ts("first_at").notNull().defaultNow(),
  lastAt: ts("last_at").notNull().defaultNow(),
});

/**
 * Per-page settings. `isPublic` opens a page to anyone without signing in — off
 * for every page until an admin deliberately turns it on at /admin/pages.
 */
export const pageSettings = pgTable("page_settings", {
  pageKey: text("page_key").primaryKey(),
  isPublic: boolean("is_public").notNull().default(false),
  updatedBy: text("updated_by").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Sign-ins, permission changes and manual operations. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    details: jsonb("details"),
  },
  (t) => [index("audit_log_at_idx").on(t.at), index("audit_log_actor_at_idx").on(t.actor, t.at)],
);

/* -------------------------------------------------------------------- mcp */

/*
 * The read-only MCP server (src/lib/mcp/): an MCP client signs in with the same
 * xhostd SSO as the dashboard, and every tool answers with exactly what that user
 * may see in the UI. These tables hold only the OAuth plumbing and a usage log.
 */

/** MCP clients that registered themselves (RFC 7591 Dynamic Client Registration). */
export const mcpClients = pgTable("mcp_clients", {
  clientId: uuid("client_id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastUsedAt: ts("last_used_at"),
});

/** Single-use authorization codes (PKCE), ten minutes each. */
export const mcpCodes = pgTable(
  "mcp_codes",
  {
    code: text("code").primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => mcpClients.clientId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("mcp_codes_expires_idx").on(t.expiresAt)],
);

/** One row per tool call: who, which tool, how much came back, how long it took. */
export const mcpUsage = pgTable(
  "mcp_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userEmail: text("user_email").notNull(),
    clientId: uuid("client_id"),
    tool: text("tool").notNull(),
    args: jsonb("args"),
    resultRows: integer("result_rows"),
    resultBytes: integer("result_bytes"),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull(),
    error: text("error"),
  },
  (t) => [index("mcp_usage_at_idx").on(t.at), index("mcp_usage_user_idx").on(t.userId, t.at)],
);

/* --------------------------------------------------------- foi requests */

/**
 * One information request (a Salesforce Case), whatever its source: a CSV export
 * uploaded at /admin/data, or the Salesforce mirror (src/lib/foi/from-salesforce.ts).
 * Every metric reads this table, so switching the source changes no page.
 *
 * Typed columns for what the dashboards filter and group on; `fields` keeps every
 * column of the source row by its Hebrew label, so a new metric needs no migration.
 */
export const requests = pgTable(
  "requests",
  {
    caseNumber: text("case_number").primaryKey(),
    source: text("source").$type<"csv" | "salesforce">().notNull(),
    sfId: varchar("sf_id", { length: 18 }),
    name: text("name"),
    description: text("description"),
    status: text("status"),
    organization: text("organization"),
    /** Who the request belongs to (Case Owner / בעלי בקשה). */
    owner: text("owner"),
    /** The staff member handling it (המטפל בבקשה). */
    handler: text("handler"),
    journalist: text("journalist"),
    /** The outlet typed on the request; publications carry the outlet read from each link. */
    mediaOutlet: text("media_outlet"),
    topic: text("topic"),
    entityKind: text("entity_kind"),
    projects: text("projects").array().notNull().default(sql`'{}'::text[]`),
    submittedOn: day("submitted_on"),
    deadlineOn: day("deadline_on"),
    fullResponseOn: day("full_response_on"),
    extension30On: day("extension_30_on"),
    extension60On: day("extension_60_on"),
    thirdPartyOn: day("third_party_on"),
    completeness: text("completeness"),
    responseFormat: text("response_format"),
    closeReason: text("close_reason"),
    remindersCount: integer("reminders_count").notNull().default(0),
    legalWarningsCount: integer("legal_warnings_count").notNull().default(0),
    petitionPlanned: boolean("petition_planned"),
    petitionFiledOn: day("petition_filed_on"),
    petitionProcedure: text("petition_procedure"),
    petitionOutcome: text("petition_outcome"),
    courtCaseNumber: text("court_case_number"),
    judge: text("judge"),
    lawFirm: text("law_firm"),
    infoReceivedAfterPetition: boolean("info_received_after_petition"),
    costsAwarded: integer("costs_awarded"),
    costsReceived: integer("costs_received"),
    feeRefunded: boolean("fee_refunded"),
    /** Refusal grounds (sections 8–9 of the law) marked on the request. */
    refusalGrounds: text("refusal_grounds").array().notNull().default(sql`'{}'::text[]`),
    refusalNotes: text("refusal_notes"),
    sfUrl: text("sf_url"),
    fields: jsonb("fields").$type<Record<string, string>>().notNull(),
    importedAt: ts("imported_at").notNull().defaultNow(),
  },
  (t) => [
    index("requests_submitted_idx").on(t.submittedOn),
    index("requests_org_idx").on(t.organization),
    index("requests_status_idx").on(t.status),
  ],
);

/** Media coverage of a request: up to ten dated links per request. */
export const requestPublications = pgTable(
  "request_publications",
  {
    caseNumber: text("case_number")
      .notNull()
      .references(() => requests.caseNumber, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    publishedOn: day("published_on"),
    url: text("url"),
    /** Registrable domain of the link, the key into media_outlets. */
    domain: text("domain"),
  },
  (t) => [primaryKey({ columns: [t.caseNumber, t.position] }), index("request_publications_on_idx").on(t.publishedOn)],
);

/** What kind of public authority each organization is. Seeded by a name heuristic, corrected by editors. */
export const organizations = pgTable("organizations", {
  name: text("name").primaryKey(),
  authorityType: text("authority_type").notNull(),
  /** true once a person set the type, so the heuristic never overwrites it. */
  manual: boolean("manual").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Media outlets by link domain: display name and category (ארצי, מקומי, מגזרי…). */
export const mediaOutlets = pgTable("media_outlets", {
  domain: text("domain").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  manual: boolean("manual").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** CSV uploads, newest first on /admin/data. */
export const dataImports = pgTable("data_imports", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fileName: text("file_name").notNull(),
  kind: text("kind").notNull(),
  rows: integer("rows").notNull(),
  inserted: integer("inserted").notNull(),
  updated: integer("updated").notNull(),
  publications: integer("publications").notNull(),
  importedBy: text("imported_by").notNull(),
  importedAt: ts("imported_at").notNull().defaultNow(),
});

/* -------------------------------------------------------------- salesforce */

/*
 * Mirror tables. The typed columns are what the sync and the request mapping
 * need; `data` holds the full record so a new field never needs a migration.
 */
const sfId = (name: string) => varchar(name, { length: 18 });
const syncedAt = () => ts("synced_at").notNull().defaultNow();

export const sfRecordType = pgTable("sf_record_type", {
  id: sfId("id").primaryKey(),
  sobjectType: text("sobject_type").notNull(),
  developerName: text("developer_name").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull(),
  systemModstamp: ts("system_modstamp").notNull(),
  syncedAt: syncedAt(),
});

export const sfUser = pgTable("sf_user", {
  id: sfId("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  isActive: boolean("is_active").notNull(),
  systemModstamp: ts("system_modstamp").notNull(),
  syncedAt: syncedAt(),
});

export const sfCase = pgTable(
  "sf_case",
  {
    id: sfId("id").primaryKey(),
    caseNumber: text("case_number"),
    recordTypeId: sfId("record_type_id"),
    status: text("status"),
    ownerId: sfId("owner_id"),
    createdDate: ts("created_date"),
    closedDate: ts("closed_date"),
    systemModstamp: ts("system_modstamp").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    data: jsonb("data").notNull(),
    syncedAt: syncedAt(),
  },
  (t) => [index("sf_case_case_number_idx").on(t.caseNumber), index("sf_case_modstamp_idx").on(t.systemModstamp)],
);

export const sfCaseHistory = pgTable(
  "sf_case_history",
  {
    id: sfId("id").primaryKey(),
    caseId: sfId("case_id").notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    dataType: text("data_type"),
    createdDate: ts("created_date").notNull(),
    createdById: sfId("created_by_id"),
    syncedAt: syncedAt(),
  },
  (t) => [index("sf_case_history_case_field_idx").on(t.caseId, t.field, t.createdDate)],
);

/** Case field API names by label, captured by the sync so the request mapping can resolve labels. */
export const sfFieldLabels = pgTable("sf_field_labels", {
  sobject: text("sobject").notNull(),
  name: text("name").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  syncedAt: syncedAt(),
}, (t) => [primaryKey({ columns: [t.sobject, t.name] })]);

/* ------------------------------------------------------------------- sync */

/** Where each object's incremental sync resumes. */
export const syncState = pgTable("sync_state", {
  object: text("object").primaryKey(),
  cursor: ts("cursor"),
  lastStartedAt: ts("last_started_at"),
  lastSuccessAt: ts("last_success_at"),
  lastError: text("last_error"),
  rowCount: integer("row_count"),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    object: text("object").notNull(),
    mode: text("mode").notNull(),
    trigger: text("trigger").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    upserted: integer("upserted"),
    deleted: integer("deleted"),
    apiUsage: text("api_usage"),
    error: text("error"),
  },
  (t) => [index("sync_runs_started_idx").on(t.startedAt)],
);

/** Manual "sync now" requests from the admin screen, picked up by the worker. */
export const syncRequests = pgTable("sync_requests", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  mode: text("mode").notNull(),
  requestedBy: text("requested_by").notNull(),
  requestedAt: ts("requested_at").notNull().defaultNow(),
  pickedAt: ts("picked_at"),
  doneAt: ts("done_at"),
});

/* -------------------------------------------------------- google analytics */

/** GA4 page views per day and path on meida.org.il. */
export const gaPageDaily = pgTable(
  "ga_page_daily",
  {
    date: day("date").notNull(),
    pagePath: text("page_path").notNull(),
    pageTitle: text("page_title").notNull(),
    views: integer("views").notNull(),
    activeUsers: integer("active_users").notNull(),
    sessions: integer("sessions").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.pagePath, t.pageTitle] })],
);

/** GA4 events per day and name (newsletter sign-ups, donations, downloads…). */
export const gaEventDaily = pgTable(
  "ga_event_daily",
  {
    date: day("date").notNull(),
    eventName: text("event_name").notNull(),
    eventCount: integer("event_count").notNull(),
    totalUsers: integer("total_users").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.eventName] })],
);

/** GA4 traffic per day by channel group, source and medium. */
export const gaChannelDaily = pgTable(
  "ga_channel_daily",
  {
    date: day("date").notNull(),
    channelGroup: text("channel_group").notNull(),
    source: text("source").notNull(),
    medium: text("medium").notNull(),
    sessions: integer("sessions").notNull(),
    activeUsers: integer("active_users").notNull(),
    newUsers: integer("new_users").notNull(),
    engagedSessions: integer("engaged_sessions").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.channelGroup, t.source, t.medium] })],
);

/** GA4 sessions per day by UTM campaign, source and medium — the join key to SMOOV mailings. */
export const gaCampaignDaily = pgTable(
  "ga_campaign_daily",
  {
    date: day("date").notNull(),
    campaign: text("campaign").notNull(),
    source: text("source").notNull(),
    medium: text("medium").notNull(),
    sessions: integer("sessions").notNull(),
    newUsers: integer("new_users").notNull(),
    engagedSessions: integer("engaged_sessions").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.campaign, t.source, t.medium] }), index("ga_campaign_daily_campaign_idx").on(t.campaign, t.date)],
);

/* ------------------------------------------------------------------ smoov */

export const smoovLists = pgTable("smoov_lists", {
  id: integer("id").primaryKey(),
  name: text("name"),
  contactsCount: integer("contacts_count"),
  data: jsonb("data").notNull(),
  syncedAt: syncedAt(),
});

/** Campaigns to track — SMOOV's API cannot list them, so admins register ids. */
export const smoovCampaigns = pgTable("smoov_campaigns", {
  id: integer("id").primaryKey(),
  label: text("label").notNull(),
  /** The utm_campaign the mailing's links carry, to join GA sessions. */
  utmCampaign: text("utm_campaign"),
  addedBy: text("added_by").notNull(),
  addedAt: ts("added_at").notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
});

/** Latest aggregated statistics per tracked campaign. */
export const smoovCampaignStats = pgTable("smoov_campaign_stats", {
  campaignId: integer("campaign_id").primaryKey(),
  sentAt: ts("sent_at"),
  sent: integer("sent"),
  opens: integer("opens"),
  clicks: integer("clicks"),
  bounces: integer("bounces"),
  unsubscribes: integer("unsubscribes"),
  data: jsonb("data").notNull(),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ texts */

/** Admin-edited copy for pages such as the accessibility statement; src/lib/texts/registry.ts lists the texts. */
export const siteTexts = pgTable("site_texts", {
  key: text("key").primaryKey(),
  body: text("body").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Every saved version of a text, so any edit can be undone. The newest version is the current text. */
export const siteTextVersions = pgTable(
  "site_text_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    body: text("body").notNull(),
    savedBy: text("saved_by").notNull(),
    savedAt: ts("saved_at").notNull().defaultNow(),
  },
  (t) => [index("site_text_versions_key_idx").on(t.key, t.id)],
);

/** Schema discovery runs, generated on the server so credentials never leave it. */
export const sfSchemaReports = pgTable("sf_schema_reports", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  report: jsonb("report").$type<SchemaReport>().notNull(),
  markdown: text("markdown").notNull(),
});
