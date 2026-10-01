/**
 * A remote MCP server over the dashboard's own data, read-only.
 *
 * Identity is the same xhostd SSO the dashboard uses: an MCP client runs an OAuth
 * 2.1 + PKCE flow against this app, the person signs in with Google through xhostd,
 * approves the client, and every tool call afterwards answers with exactly what that
 * person may see in the UI — same role, same user type, same page permissions.
 *
 * Switched on by MCP_JWT_SECRET; without it every MCP route answers 503.
 */

export const MCP_NAME = "meida-dashboard";
export const MCP_VERSION = "0.1.0";
/** Protocol revisions this server speaks; the first is what it offers. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SCOPE = "mcp:read";

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600;
export const CODE_TTL_SECONDS = 600;
/** The signed state that survives the trip through the xhostd sign-in. */
export const STATE_TTL_SECONDS = 900;

export const TOKEN_AUDIENCE = "meida-dashboard-mcp";

export function mcpSecret(): Uint8Array | null {
  const secret = process.env.MCP_JWT_SECRET?.trim();
  // Short secrets are refused rather than silently weakening every token.
  return secret && secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

export const mcpEnabled = () => mcpSecret() !== null;

/**
 * The public origin, from the proxy's headers — never hardcoded, so dev, the
 * xhostd hostname and a custom domain all produce metadata that matches the URL
 * the client actually fetched (an issuer mismatch fails discovery).
 */
export function baseUrl(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-host");
  const host = forwarded ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const mcpUrl = (req: Request, path = "") => `${baseUrl(req)}/mcp${path}`;

/**
 * MCP clients live on other origins (claude.ai, chatgpt.com, an inspector on
 * localhost), so these routes are the one place that answers cross-origin. They are
 * safe to open: every one of them is either public metadata or gated by a Bearer
 * token, and tokens are never sent as cookies.
 */
export function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { ...corsHeaders(req), "Cache-Control": "no-store", ...(init.headers as Record<string, string> | undefined) },
  });
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function oauthError(req: Request, status: number, error: string, description: string): Response {
  return json(req, { error, error_description: description }, { status });
}

export function disabled(req: Request): Response {
  return oauthError(req, 503, "temporarily_unavailable", "The MCP server is not configured (MCP_JWT_SECRET)");
}
