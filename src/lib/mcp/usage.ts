import { getDb } from "@/lib/db/client";
import { mcpUsage } from "@/lib/db/schema";
import type { McpUser } from "./auth";

/** One row per tool call, for the admin's MCP screen. Fire-and-forget: logging never fails a call. */
export function logToolCall(entry: {
  user: McpUser;
  tool: string;
  args: unknown;
  resultRows: number | null;
  resultBytes: number | null;
  latencyMs: number;
  status: "ok" | "error" | "denied";
  error?: string;
}): void {
  void getDb()
    .insert(mcpUsage)
    .values({
      userId: entry.user.id,
      userEmail: entry.user.email,
      clientId: entry.user.clientId,
      tool: entry.tool.slice(0, 80),
      // Arguments are filters and page sizes — no free text beyond the search term.
      args: (entry.args ?? null) as Record<string, unknown> | null,
      resultRows: entry.resultRows,
      resultBytes: entry.resultBytes,
      latencyMs: entry.latencyMs,
      status: entry.status,
      error: entry.error?.slice(0, 500) ?? null,
    })
    .catch((err: unknown) => console.error("[mcp] usage log failed:", (err as Error).message));
}

/** Keeps the log from growing without bound; called by the sync worker. */
export async function pruneUsage(days = 90): Promise<number> {
  const res = await getDb().execute(`delete from mcp_usage where at < now() - interval '${Math.max(1, Math.floor(days))} days'`);
  return res.rowCount ?? 0;
}
