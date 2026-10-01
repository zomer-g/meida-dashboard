import { json, mcpUrl, preflight, SCOPE } from "@/lib/mcp/config";

/**
 * RFC 8414 authorization-server metadata, again at the root host with /mcp as the
 * suffix. `issuer` must equal the resource URL the client asked about, or the
 * client rejects the document.
 */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = mcpUrl(req);
  return json(req, {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    service_documentation: `${base}/docs`,
  });
}

export const OPTIONS = preflight;
