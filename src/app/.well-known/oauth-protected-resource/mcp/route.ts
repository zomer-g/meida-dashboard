import { json, mcpUrl, preflight, SCOPE } from "@/lib/mcp/config";

/**
 * RFC 9728 protected-resource metadata. It must sit at the ROOT host with the
 * resource's path as a suffix (/.well-known/oauth-protected-resource/mcp) — that
 * is where clients look, and serving it only under /mcp breaks discovery.
 */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return json(req, {
    resource: mcpUrl(req),
    authorization_servers: [mcpUrl(req)],
    bearer_methods_supported: ["header"],
    scopes_supported: [SCOPE],
    resource_name: "התנועה לחופש המידע — דשבורד",
  });
}

export const OPTIONS = preflight;
