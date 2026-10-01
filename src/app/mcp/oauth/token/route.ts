import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { mcpClients, mcpCodes } from "@/lib/db/schema";
import { loadMcpUser } from "@/lib/mcp/auth";
import { ACCESS_TOKEN_TTL_SECONDS, disabled, json, mcpEnabled, oauthError, preflight, SCOPE } from "@/lib/mcp/config";
import { clientIp, OAUTH_LIMIT, rateLimit } from "@/lib/mcp/rate-limit";
import { signAccessToken, signRefreshToken, verifyPkce, verifyToken } from "@/lib/mcp/tokens";

/**
 * The token endpoint: authorization_code (PKCE) and refresh_token.
 *
 * OAuth 2.0 mandates form-encoded bodies here, and that is what clients send —
 * JSON is accepted too, but the form parser is the one that matters.
 */
export const dynamic = "force-dynamic";

async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  const form = await req.formData().catch(() => new FormData());
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

export async function POST(req: Request) {
  if (!mcpEnabled()) return disabled(req);
  const limit = rateLimit(`mcp:token:${clientIp(req)}`, OAUTH_LIMIT);
  if (!limit.ok) return oauthError(req, 429, "temporarily_unavailable", `Too many requests; retry in ${limit.retryAfter}s`);

  const body = await readBody(req);
  const db = getDb();

  if (body.grant_type === "refresh_token") {
    const claims = await verifyToken(body.refresh_token ?? "", "refresh");
    if (!claims) return oauthError(req, 400, "invalid_grant", "Refresh token invalid or expired");
    if (body.client_id && body.client_id !== claims.cid) return oauthError(req, 400, "invalid_grant", "Token was issued to another client");
    const user = await loadMcpUser(claims.sub);
    if (!user || user.tokenVersion !== claims.tv) return oauthError(req, 400, "invalid_grant", "Access was revoked");
    return issue(req, user.id, claims.cid, user.tokenVersion);
  }

  if (body.grant_type !== "authorization_code") return oauthError(req, 400, "unsupported_grant_type", "Use authorization_code or refresh_token");
  for (const field of ["code", "redirect_uri", "client_id", "code_verifier"]) {
    if (!body[field]) return oauthError(req, 400, "invalid_request", `Missing ${field}`);
  }

  // Expired codes are cleared on the way past, so the table stays small without a job.
  await db.delete(mcpCodes).where(lt(mcpCodes.expiresAt, new Date()));

  const [row] = await db.select().from(mcpCodes).where(eq(mcpCodes.code, body.code!)).limit(1);
  if (!row) return oauthError(req, 400, "invalid_grant", "authorization code not found");
  // Single use: spent whether or not the rest of the checks pass.
  await db.delete(mcpCodes).where(eq(mcpCodes.code, row.code));

  if (row.expiresAt.getTime() < Date.now()) return oauthError(req, 400, "invalid_grant", "authorization code expired");
  if (row.clientId !== body.client_id) return oauthError(req, 400, "invalid_grant", "client mismatch");
  if (row.redirectUri !== body.redirect_uri) return oauthError(req, 400, "invalid_grant", "redirect_uri mismatch");
  if (!verifyPkce(body.code_verifier!, row.codeChallenge)) return oauthError(req, 400, "invalid_grant", "PKCE verification failed");

  const [client] = await db.select().from(mcpClients).where(eq(mcpClients.clientId, row.clientId)).limit(1);
  if (!client) return oauthError(req, 400, "invalid_client", "client no longer registered");

  const user = await loadMcpUser(row.userId);
  if (!user) return oauthError(req, 400, "invalid_grant", "the account is no longer active");

  await db.update(mcpClients).set({ lastUsedAt: new Date() }).where(and(eq(mcpClients.clientId, client.clientId)));
  return issue(req, user.id, client.clientId, user.tokenVersion);
}

async function issue(req: Request, userId: string, clientId: string, tokenVersion: number): Promise<Response> {
  const [access, refresh] = await Promise.all([
    signAccessToken({ sub: userId, cid: clientId, tv: tokenVersion }),
    signRefreshToken({ sub: userId, cid: clientId, tv: tokenVersion }),
  ]);
  return json(req, {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: SCOPE,
  });
}

export const OPTIONS = preflight;
