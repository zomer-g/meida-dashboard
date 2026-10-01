import { authenticate } from "@/lib/mcp/auth";
import { corsHeaders, disabled, json, mcpEnabled, preflight } from "@/lib/mcp/config";
import { rateLimit, TOOL_LIMIT } from "@/lib/mcp/rate-limit";
import { handleRpc, rpcError, type RpcRequest } from "@/lib/mcp/rpc";

/**
 * The MCP endpoint (Streamable HTTP). Stateless: the Bearer token carries the
 * identity, so there is no session to keep and every POST is answered on its own.
 * Read-only — the tools behind it only run SELECTs.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mcpEnabled()) return disabled(req);

  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const limit = rateLimit(`mcp:tools:${auth.user.id}`, TOOL_LIMIT);
  if (!limit.ok) {
    return json(req, { jsonrpc: "2.0", id: null, error: { code: -32000, message: `יותר מדי קריאות; נסו שוב בעוד ${limit.retryAfter} שניות` } }, { status: 429 });
  }

  let message: unknown;
  try {
    message = await req.json();
  } catch {
    return json(req, rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  // Batching was removed from the protocol in 2025-06-18, and nothing here needs it.
  if (Array.isArray(message)) return json(req, rpcError(null, -32600, "Batched requests are not supported"), { status: 400 });

  const rpc = message as RpcRequest;
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return json(req, rpcError(null, -32600, "Invalid JSON-RPC request"), { status: 400 });
  }

  const response = await handleRpc(rpc, auth.user);
  // A notification gets no body, only an acknowledgement.
  if (!response) return new Response(null, { status: 202, headers: corsHeaders(req) });
  return json(req, response);
}

/** No server-initiated stream: clients fall back to plain request/response. */
export async function GET(req: Request) {
  if (!mcpEnabled()) return disabled(req);
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return json(req, { error: "method_not_allowed", error_description: "This server does not open an SSE stream; POST JSON-RPC instead" }, { status: 405 });
}

/** Nothing to tear down — the server keeps no session. */
export async function DELETE(req: Request) {
  if (!mcpEnabled()) return disabled(req);
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export const OPTIONS = preflight;
