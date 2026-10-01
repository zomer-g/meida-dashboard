# הדשבורד התפעולי — התנועה לחופש המידע

Internal operations dashboard for the Movement for Freedom of Information (meida.org.il): media coverage of its
requests, response metrics of public authorities, petitions, site traffic and mailings. Hebrew, RTL.
Replaces two Looker Studio reports (the media report and the 18-page detailed report) — mapping in `docs/metrics.md`.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Drizzle ORM + pg · jose. Hosted on xhostd, app
`meida-dashboard` (template `app`: `install.sh` builds, `launch.sh` migrates, seeds an empty DB, starts the sync worker
and `next start`). Database: xhostd's own Postgres (`DATABASE_URL`, injected). Exact-pinned dependencies.
Started from a sibling admin codebase (SKEELZ Admin) — auth, sync and admin patterns match it.

## Commands
- `npm run db:local` (PGlite on 5434) · `npm run db:migrate:local` · `npm run dev` (with `.env.local`: `DATABASE_URL`, `ALLOW_DEV_AUTH=true`, `DEV_AUTH_EMAIL`, `ADMIN_EMAILS`)
- `npm run import:csv -- file.csv [more.csv]` — same importer as `/admin/data`
- `npm run typecheck` · `npm run build`
- `npm run db:generate` after editing `src/lib/db/schema.ts` (commit `drizzle/`)
- `npm run sf:check` / `npm run sf:describe` — Salesforce connectivity and schema (needs SF_* env)

## Data model — the one rule
Every page reads **`requests`** + **`request_publications`**, never a source directly. Sources write into them through
`storeRows()` (`src/lib/foi/store.ts`), keyed by **Salesforce field labels** (the column headers of report exports):
- CSV upload / `seed/` → `parseCsv` → `storeRows(rows, "csv")`
- Salesforce mirror (`sf_case.data`) → labels from `sf_field_labels` → `requestsFromSalesforce()` → `storeRows(rows, "salesforce")`

`normalizeRow()` (`src/lib/foi/normalize.ts`) is the only place that knows labels (`LABELS`, `REFUSAL_GROUNDS`, reminders,
publication date/link columns). A row sets only the columns it has, so the media export and the full export merge by
case number. A renamed Salesforce label = add it to `LABELS`.

Metrics: `src/lib/foi/views.ts` defines the derived view `r` (authority type, lifecycle, legal deadline, timeliness,
bucket) and `p` (publications with outlet/category); `src/lib/foi/metrics.ts` holds every query. Grouping dimensions are
whitelisted SQL (`DIMS`, `MEDIA_DIMS`) — never interpolate a URL value as SQL. Filters: `src/lib/foi/filters.ts` (URL →
`whereClause`); the client-safe vocabulary is `filter-keys.ts`. Definitions live in three places kept in step:
`views.ts`, `src/lib/dashboard/explain.ts` (the "?" tooltips) and `docs/metrics.md`.

Lookups not in Salesforce, editable at `/admin/lookups` (editor+): `organizations.authority_type` and `media_outlets`
(domain → name, category). New values get a guess from `src/lib/foi/classify.ts`; `manual=true` rows are never overwritten.

## Access
- **Identity:** xhostd SSO cookie `__Host-xhost_id`, verified in `src/lib/auth/xhost.ts` against `XHOST_AUTH_AUDIENCES`.
- **Who may enter:** `ADMIN_EMAILS` / active `users` row / open invite (`src/lib/auth/session.ts`).
- **Role** (viewer < editor < admin) = what you can do. **User type** (`user_types`: board, staff, journalists…) = which
  dashboard pages you see. Admins see all pages. Page registry: `src/lib/pages.ts`.
- Dashboard pages call `dashboardAuth(pageKey, path)`; admin/editor pages call `pageAuth(minRole, path)`; every server
  action calls `requireUser(minRole)`. Never rely on the layout.
- **Public pages:** `page_settings.is_public` (admin, `/admin/pages`) lets anonymous visitors see a page; `DashboardFrame`
  then renders the chrome itself. All pages are internal by default.
- "View as" (`src/lib/auth/preview.ts`): cookie `meida_view_as` = `editor` | `viewer` | `type:<key>`, honoured only for real admins.

## Integrations (read-only)
- Salesforce: `src/lib/sf/` — GET-only client (token + revoke are the only POSTs), Client Credentials against My Domain,
  hourly revoke. Objects: RecordType, User, Case (all fields), CaseHistory. Guide: `docs/setup-salesforce.md`.
- GA4: `src/lib/google/` (JWT + REST, `analytics.readonly`) → `ga_*_daily`. Guide: `docs/setup-google-analytics.md`.
- SMOOV: `src/lib/smoov/client.ts` (GET only) → `smoov_*`; campaigns registered by id + utm_campaign. Guide: `docs/setup-smoov.md`.
- Worker `src/worker/sync-worker.ts` (launch.sh, `SYNC_WORKER=true`, one instance per DB): SF every 10 min + nightly
  reconcile, GA/SMOOV every 6 h, failed sources retried after 30 min, manual requests from `/admin/sync`.
- Secrets only as xhostd env secrets; never log them or send them to the client.

## MCP server (read-only, `src/lib/mcp/` + `src/app/mcp/`)
A remote MCP server over the same data, switched on by `MCP_JWT_SECRET` (503 without it). Identity is the dashboard's
own xhostd SSO — no second IdP: `/mcp/oauth/authorize` sends the person through `loginUrl()`, `/mcp/consent` shows what
the client would get, and only `/mcp/oauth/approve` (signed state + origin check) mints a code. Tokens are HS256 JWTs
(access 1h, refresh 30d) carrying `sub`, `cid` and `tv`; `authenticate()` re-reads the user on every call, so a
deactivated user, a changed user type or a bumped `users.mcp_token_version` cuts access off at once.
**Permissions are the UI's:** `toolsFor(user)` filters the tool list by `user.pages`, and `tools/call` refuses anything
outside it (`src/lib/mcp/tools.ts`, each tool declares its `page`). Every tool calls the existing metric queries — never
write anything here. Metadata lives at the ROOT paths `/.well-known/oauth-{protected-resource,authorization-server}/mcp`
(RFC 8414/9728) with `issuer` equal to `<origin>/mcp`, mirrored under `/mcp/.well-known/*`; the token endpoint must keep
accepting `application/x-www-form-urlencoded`. Usage goes to `mcp_usage` (admin screen `/admin/mcp`, pruned nightly).
Guide: `docs/setup-mcp.md`.

## Design (meida.org.il)
Tokens in `src/app/globals.css`: navy `#0b2149` (brand-dark: header strip, headings, footer, active pills), blue
`#2274da` (brand: CTAs), sky `#c6e3f4` (accent-light panels), `#144683` (accent: card bands), Assistant font, logos in
`public/brand/`. Charts (`src/components/charts/`) use the validated categorical palette `--color-series-1..8` in fixed
order with "אחר" as neutral, an ordinal blue ramp for ordered buckets, and always a "הצגה כטבלה" table. Logical CSS
only (`ms-*`, `text-start`). Every page works at 320–375px with no sideways scroll.

## Accessibility (IS 5568 = WCAG 2.1 AA) and security
Same rules as SKEELZ Admin: text ≥ 4.5:1, one h1 per page, card titles are headings, status messages in an always-mounted
`role="status"`, repeated link text gets sr-only context. CSP in `next.config.ts` — the browser loads nothing cross-origin.
No server-side redirects to absolute URLs (xhostd proxy); anonymous page requests render `SignInScreen` with 200.

## Public repository — what must never be committed
The repository is public (github.com/zomer-g/meida-dashboard) and the xhostd remote mirrors it. Request data is
personal data: names of staff, lawyers, journalists and free-text descriptions. `seed/` (the static CSV exports the
dashboard started with) is gitignored and was purged from history; keep it that way, and never commit an export,
a `.sf-describe/` report, `docs/sf-schema-report.md` or a `.env*` file. Real addresses live in the environment:
`CONTACT_EMAIL` (shown on the public documents) and `ADMIN_EMAILS`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
