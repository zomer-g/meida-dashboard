import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { loginUrl } from "@/lib/auth/urls";
import { getDb } from "@/lib/db/client";
import { mcpClients } from "@/lib/db/schema";
import { baseUrl, mcpEnabled, SCOPE } from "@/lib/mcp/config";
import { clientIp, OAUTH_LIMIT, rateLimit } from "@/lib/mcp/rate-limit";
import { signState } from "@/lib/mcp/tokens";

/**
 * The authorization endpoint. There is no second identity provider here: the person
 * signs in with the dashboard's own xhostd SSO, and only an active dashboard user can
 * approve a client. What they approve is read access to the pages they already have.
 */
export const dynamic = "force-dynamic";

/** A browser is on the other end, so failures that cannot be redirected are rendered. */
function page(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f5f8fb;color:#0b2149;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{background:#fff;border:2px solid #dbe3ec;border-radius:16px;max-width:30rem;padding:32px;text-align:center}h1{font-size:1.4rem;margin:0 0 12px}p{color:#3b4763;line-height:1.6;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

/** Errors the client can handle go back to it, as OAuth 2.0 requires. */
function redirectError(redirectUri: string, state: string | null, error: string, description: string): Response {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return Response.redirect(url.toString(), 303);
}

export async function GET(req: Request) {
  if (!mcpEnabled()) return page(503, "החיבור אינו זמין", "שרת ה-MCP לא הוגדר בשרת הזה.");
  const limit = rateLimit(`mcp:authorize:${clientIp(req)}`, OAUTH_LIMIT);
  if (!limit.ok) return page(429, "יותר מדי בקשות", "נסו שוב בעוד דקה.");

  const q = new URL(req.url).searchParams;
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const state = q.get("state");

  const UUID = /^[0-9a-f-]{36}$/i;
  const [client] = UUID.test(clientId) ? await getDb().select().from(mcpClients).where(eq(mcpClients.clientId, clientId)).limit(1) : [];
  if (!client) return page(400, "לקוח לא מוכר", "ה-client_id אינו רשום. נסו להוסיף את החיבור מחדש.");
  // Never redirect anywhere the client did not register: that is what keeps a stolen code from leaving.
  if (!client.redirectUris.includes(redirectUri)) return page(400, "כתובת החזרה שגויה", "ה-redirect_uri אינו תואם למה שנרשם עבור הלקוח הזה.");

  if (q.get("response_type") !== "code") return redirectError(redirectUri, state, "unsupported_response_type", "Only response_type=code is supported");
  const codeChallenge = q.get("code_challenge") ?? "";
  if (!codeChallenge || q.get("code_challenge_method") !== "S256") {
    return redirectError(redirectUri, state, "invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  const scope = q.get("scope");
  if (scope && !scope.split(/\s+/).includes(SCOPE)) return redirectError(redirectUri, state, "invalid_scope", `Only ${SCOPE} is supported`);

  const session = await getSession();
  if (session.status === "anonymous") {
    // Through the dashboard's own sign-in, then straight back here with the same query.
    // Built from the proxy's headers, never from req.url: inside the container that is 0.0.0.0:3000.
    const back = `/mcp/oauth/authorize?${q.toString()}`;
    return Response.redirect(`${baseUrl(req)}${loginUrl(back)}`, 303);
  }
  if (session.status === "refused") {
    return page(403, "אין לך גישה לדשבורד", `החשבון ${session.identity.email} אינו מורשה. אפשר לבקש גישה ממנהלי המערכת, ואז לנסות שוב.`);
  }

  const approval = await signState({ clientId, redirectUri, codeChallenge, clientState: state ?? undefined });
  return Response.redirect(`${baseUrl(req)}/mcp/consent?state=${encodeURIComponent(approval)}`, 303);
}
