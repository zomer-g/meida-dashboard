import { eq } from "drizzle-orm";
import { envAdmins } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import { getDb } from "@/lib/db/client";
import { userTypes, users } from "@/lib/db/schema";
import { PAGE_KEYS } from "@/lib/pages";
import { corsHeaders, mcpUrl, SCOPE } from "./config";
import { verifyToken } from "./tokens";

/**
 * Who is calling, and what may they see. Deliberately the same answer the UI gives:
 * an admin (by role or by ADMIN_EMAILS) gets every page, anyone else gets the pages
 * of their user type, and a deactivated user gets nothing at all.
 */
export interface McpUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  userType: string | null;
  userTypeLabel: string | null;
  pages: string[];
  tokenVersion: number;
  clientId: string;
}

export async function loadMcpUser(userId: string): Promise<Omit<McpUser, "clientId"> | null> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row || !row.active) return null;

  const isEnvAdmin = envAdmins().includes(row.email);
  const role: Role = isEnvAdmin ? "admin" : row.role;
  const [type] = row.userType ? await db.select().from(userTypes).where(eq(userTypes.key, row.userType)).limit(1) : [];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role,
    userType: type?.key ?? null,
    userTypeLabel: type?.label ?? null,
    pages: role === "admin" ? PAGE_KEYS : (type?.pages ?? []).filter((k) => PAGE_KEYS.includes(k)),
    tokenVersion: row.mcpTokenVersion,
  };
}

/**
 * The 401 an MCP client needs: without the `resource_metadata` pointer it cannot
 * discover where to authenticate, and the connector simply fails to start.
 */
export function challenge(req: Request, error: string, description: string): Response {
  return Response.json(
    { error, error_description: description },
    {
      status: 401,
      headers: {
        ...corsHeaders(req),
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer realm="${encodeURIComponent("meida-dashboard MCP")}", error="${error}", error_description="${description}", scope="${SCOPE}", resource_metadata="${mcpUrl(req, "/.well-known/oauth-protected-resource")}"`,
      },
    },
  );
}

export type AuthResult = { ok: true; user: McpUser } | { ok: false; response: Response };

/** Verifies the Bearer token and re-reads the user on every call, so a revoked or demoted user loses access at once. */
export async function authenticate(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, response: challenge(req, "invalid_token", "Missing Bearer token") };
  }
  const claims = await verifyToken(header.slice(7).trim(), "access");
  if (!claims) return { ok: false, response: challenge(req, "invalid_token", "Token invalid or expired") };

  const user = await loadMcpUser(claims.sub);
  if (!user) return { ok: false, response: challenge(req, "invalid_token", "The account is no longer active") };
  // Revocation: an admin bumps the version and every token issued before it stops working.
  if (user.tokenVersion !== claims.tv) return { ok: false, response: challenge(req, "invalid_token", "Access was revoked; sign in again") };

  return { ok: true, user: { ...user, clientId: claims.cid } };
}
