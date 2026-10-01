"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { mcpClients, mcpCodes, users } from "@/lib/db/schema";

const PATH = "/admin/mcp";
const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Ends every MCP connection of one user: tokens carry the version they were issued with. */
export async function revokeUserTokens(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const id = String(form.get("id") ?? "");
  if (!UUID_RE.test(id)) throw new Error("invalid id");

  const [user] = await getDb()
    .update(users)
    .set({ mcpTokenVersion: sql`${users.mcpTokenVersion} + 1` })
    .where(eq(users.id, id))
    .returning();
  if (user) await writeAudit(admin.email, "mcp.tokens_revoked", user.email);
  revalidatePath(PATH);
}

/** Removes a registered client; its codes go with it and its tokens stop resolving. */
export async function removeClient(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const clientId = String(form.get("clientId") ?? "");
  if (!UUID_RE.test(clientId)) throw new Error("invalid client id");

  const db = getDb();
  await db.delete(mcpCodes).where(eq(mcpCodes.clientId, clientId));
  const [removed] = await db.delete(mcpClients).where(eq(mcpClients.clientId, clientId)).returning();
  if (removed) await writeAudit(admin.email, "mcp.client_removed", removed.name, { clientId });
  revalidatePath(PATH);
}
