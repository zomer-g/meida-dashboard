import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { mcpClients, mcpCodes } from "@/lib/db/schema";
import { baseUrl, CODE_TTL_SECONDS, mcpEnabled } from "@/lib/mcp/config";
import { newAuthorizationCode, verifyState } from "@/lib/mcp/tokens";

/**
 * What the consent form posts. The authorization code is created here and nowhere
 * else, so a code only ever exists after a signed-in dashboard user pressed אישור.
 */
export const dynamic = "force-dynamic";

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Hands the browser back to the MCP client.
 *
 * Not a redirect: the app's CSP says `form-action 'self'`, and browsers apply that
 * to the whole redirect chain of a form submission — a 303 to claude.ai from this
 * POST is blocked, and the button looks dead. A page that navigates itself is a
 * plain navigation, which CSP does not restrict, and it needs no JavaScript.
 */
function back(redirectUri: string, params: Record<string, string | undefined>): Response {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const target = escapeHtml(url.toString());
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${target}"><title>מתחבר…</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f5f8fb;color:#0b2149;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
a{color:#2274da}</style></head>
<body><div><p>מחזירים אותך לכלי…</p><p><a href="${target}">להמשך, אם הדף לא מתקדם מעצמו</a></p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  if (!mcpEnabled()) return new Response("MCP is not configured", { status: 503 });

  // The form is ours; a cross-site POST never gets to spend someone's session here.
  const origin = req.headers.get("origin");
  if (origin && origin !== baseUrl(req)) return new Response("Bad origin", { status: 403 });

  const form = await req.formData();
  const state = await verifyState(String(form.get("state") ?? ""));
  if (!state) return new Response("בקשת החיבור פגה. נסו שוב מהכלי שלכם.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const session = await getSession();
  if (session.status !== "ok") return new Response("נדרשת התחברות", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  if (String(form.get("decision")) !== "approve") {
    return back(state.redirectUri, { error: "access_denied", error_description: "The user declined", state: state.clientState });
  }

  const [client] = await getDb().select().from(mcpClients).where(eq(mcpClients.clientId, state.clientId)).limit(1);
  // Re-checked against the registration: the state is signed, but the client may have been removed since.
  if (!client || !client.redirectUris.includes(state.redirectUri)) return new Response("לקוח לא מוכר", { status: 400 });

  const code = newAuthorizationCode();
  await getDb().insert(mcpCodes).values({
    code,
    clientId: state.clientId,
    userId: session.user.id,
    redirectUri: state.redirectUri,
    codeChallenge: state.codeChallenge,
    expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
  });
  await getDb().update(mcpClients).set({ lastUsedAt: new Date() }).where(eq(mcpClients.clientId, state.clientId));
  await writeAudit(session.user.email, "mcp.authorized", client.name, { clientId: state.clientId });

  return back(state.redirectUri, { code, state: state.clientState });
}
