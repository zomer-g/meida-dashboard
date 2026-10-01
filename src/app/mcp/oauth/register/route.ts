import { getDb } from "@/lib/db/client";
import { mcpClients } from "@/lib/db/schema";
import { disabled, json, mcpEnabled, oauthError, preflight, SCOPE } from "@/lib/mcp/config";
import { clientIp, OAUTH_LIMIT, rateLimit } from "@/lib/mcp/rate-limit";

/**
 * Dynamic Client Registration (RFC 7591). Registering is not access: the client
 * still has to send a person through the xhostd sign-in, and that person still has
 * to be an active dashboard user. Public clients only — PKCE, no client secret.
 */
export const dynamic = "force-dynamic";

const MAX_REDIRECTS = 10;

export async function POST(req: Request) {
  if (!mcpEnabled()) return disabled(req);
  const limit = rateLimit(`mcp:register:${clientIp(req)}`, OAUTH_LIMIT);
  if (!limit.ok) return oauthError(req, 429, "temporarily_unavailable", `Too many registrations; retry in ${limit.retryAfter}s`);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return oauthError(req, 400, "invalid_client_metadata", "Body must be JSON");
  }

  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 120) : "MCP client";
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  // https only, except loopback for local inspectors and desktop clients.
  const redirectUris = uris.slice(0, MAX_REDIRECTS).filter((u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.protocol === "http:" && url.hostname === "[::1]";
    } catch {
      return false;
    }
  });
  if (!redirectUris.length) return oauthError(req, 400, "invalid_redirect_uri", "At least one https (or loopback) redirect_uri is required");

  const [client] = await getDb().insert(mcpClients).values({ name, redirectUris }).returning();
  return json(
    req,
    {
      client_id: client!.clientId,
      client_name: client!.name,
      redirect_uris: client!.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
      client_id_issued_at: Math.floor(client!.createdAt.getTime() / 1000),
    },
    { status: 201 },
  );
}

export const OPTIONS = preflight;
