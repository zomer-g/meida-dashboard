import { MCP_NAME, MCP_VERSION, PROTOCOL_VERSIONS } from "./config";
import type { McpUser } from "./auth";
import { findTool, toolsFor } from "./tools";
import { logToolCall } from "./usage";

/**
 * The MCP wire protocol (JSON-RPC 2.0 over Streamable HTTP), the small read-only
 * subset this server needs: initialize, tools/list, tools/call, ping. Written
 * directly rather than through the SDK, whose HTTP transport expects Node's
 * req/res objects and not the Web Request/Response a Next route handler gets.
 */

export interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 };

const result = (id: RpcRequest["id"], value: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result: value });
const error = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

/** A single answer must stay small enough for a model's context; the caller can page or narrow the filters. */
const MAX_RESULT_BYTES = 400_000;

const INSTRUCTIONS = `הדשבורד התפעולי של התנועה לחופש המידע, לקריאה בלבד.
הכלים מחזירים את אותם מדדים שמוצגים בממשק, ורק את מה שמשתמש זה מורשה לראות.
כדאי להתחיל ב-dashboard_info (מה קיים ומה מותר) וב-list_filter_options (ערכי סינון תקפים).
לכל הכלים אותם פרמטרי סינון: range/from/to, org, type, topic, owner, project, status, entity, petition.
"נענה במועד" נמדד מול המועד בחוק: 30 יום, ועוד 30 בארכה לפי 7(ב) ועוד 60 בארכת מנכ״ל לפי 7(ג).`;

export async function handleRpc(message: RpcRequest, user: McpUser): Promise<object | null> {
  const { id, method } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const asked = (message.params?.protocolVersion as string | undefined) ?? PROTOCOL_VERSIONS[0]!;
      return result(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: MCP_NAME, title: "התנועה לחופש המידע — דשבורד", version: MCP_VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, {
        tools: toolsFor(user).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "resources/list":
      return result(id, { resources: [] });
    case "prompts/list":
      return result(id, { prompts: [] });
    case "tools/call":
      return callTool(message, user);
    default:
      return isNotification ? null : error(id, ERRORS.methodNotFound, `Unknown method: ${method}`);
  }
}

async function callTool(message: RpcRequest, user: McpUser): Promise<object> {
  const { id } = message;
  const name = typeof message.params?.name === "string" ? message.params.name : "";
  const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
  if (!name) return error(id, ERRORS.invalidParams, "Missing tool name");

  const tool = findTool(user, name);
  if (!tool) {
    // A tool the user may not use is reported as unavailable, and the attempt is recorded.
    const known = toolsFor(user).map((t) => t.name).join(", ");
    logToolCall({ user, tool: name, args, resultRows: null, resultBytes: null, latencyMs: 0, status: "denied", error: "not permitted or unknown" });
    return error(id, ERRORS.invalidParams, `הכלי "${name}" אינו זמין להרשאות שלך. כלים זמינים: ${known}`);
  }

  const started = Date.now();
  try {
    const { data, rows } = await tool.run(user, args);
    let text = JSON.stringify(data, null, 2);
    let truncated = false;
    if (text.length > MAX_RESULT_BYTES) {
      text = `${text.slice(0, MAX_RESULT_BYTES)}\n… התוצאה נקטעה. אפשר לצמצם עם limit/offset או עם סינון צר יותר.`;
      truncated = true;
    }
    logToolCall({ user, tool: name, args, resultRows: rows ?? null, resultBytes: text.length, latencyMs: Date.now() - started, status: "ok" });
    return result(id, {
      content: [{ type: "text", text }],
      ...(truncated ? {} : { structuredContent: data as Record<string, unknown> }),
    });
  } catch (err) {
    const message_ = err instanceof Error ? err.message : String(err);
    console.error(`[mcp] tool ${name} failed:`, message_);
    logToolCall({ user, tool: name, args, resultRows: null, resultBytes: null, latencyMs: Date.now() - started, status: "error", error: message_ });
    // Tool errors belong in the result, not in the JSON-RPC envelope, so the model can react to them.
    return result(id, { content: [{ type: "text", text: `שגיאה: ${message_}` }], isError: true });
  }
}

export { ERRORS, error as rpcError };
