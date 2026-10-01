import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { ACCESS_TOKEN_TTL_SECONDS, mcpSecret, REFRESH_TOKEN_TTL_SECONDS, STATE_TTL_SECONDS, TOKEN_AUDIENCE } from "./config";

/** Access, refresh and the sign-in state are all short-lived HS256 JWTs signed with MCP_JWT_SECRET. */

const ISSUER = "meida-dashboard-mcp";

export interface TokenClaims {
  /** The dashboard user's id. */
  sub: string;
  /** The MCP client that holds this token. */
  cid: string;
  /** The user's mcp_token_version when the token was issued; a bump revokes it. */
  tv: number;
  typ: "access" | "refresh";
}

async function sign(payload: Omit<TokenClaims, never>, ttlSeconds: number): Promise<string> {
  const secret = mcpSecret();
  if (!secret) throw new Error("MCP_JWT_SECRET is not set");
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export const signAccessToken = (claims: Omit<TokenClaims, "typ">) => sign({ ...claims, typ: "access" }, ACCESS_TOKEN_TTL_SECONDS);
export const signRefreshToken = (claims: Omit<TokenClaims, "typ">) => sign({ ...claims, typ: "refresh" }, REFRESH_TOKEN_TTL_SECONDS);

export async function verifyToken(token: string, typ: "access" | "refresh"): Promise<TokenClaims | null> {
  const secret = mcpSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: ["HS256"],
      requiredClaims: ["exp", "sub", "aud", "iss"],
    });
    // A refresh token must never be accepted where an access token is expected.
    if (payload.typ !== typ || typeof payload.sub !== "string" || typeof payload.cid !== "string") return null;
    return { sub: payload.sub, cid: payload.cid, tv: Number(payload.tv ?? 0), typ };
  } catch {
    return null;
  }
}

export interface AuthState {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  clientState?: string;
}

export async function signState(state: AuthState): Promise<string> {
  const secret = mcpSecret();
  if (!secret) throw new Error("MCP_JWT_SECRET is not set");
  return new SignJWT({ ...state })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("mcp-authorize")
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyState(token: string): Promise<AuthState | null> {
  const secret = mcpSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: "mcp-authorize", algorithms: ["HS256"] });
    const { clientId, redirectUri, codeChallenge, clientState } = payload as Record<string, unknown>;
    if (typeof clientId !== "string" || typeof redirectUri !== "string" || typeof codeChallenge !== "string") return null;
    return { clientId, redirectUri, codeChallenge, clientState: typeof clientState === "string" ? clientState : undefined };
  } catch {
    return null;
  }
}

export const newAuthorizationCode = () => randomBytes(32).toString("base64url");

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** PKCE S256, compared in constant time. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  const a = Buffer.from(s256(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
