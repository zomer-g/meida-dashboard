import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

// One pool per process; kept on globalThis so `next dev` reloads don't leak pools.
const g = globalThis as unknown as { __meidaDb?: Db; __meidaPool?: Pool };

/** Created lazily: the build imports this module but must never connect. */
export function getPool(): Pool {
  if (!g.__meidaPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__meidaPool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
    g.__meidaPool.on("error", (err) => console.error("[db] idle client error:", err.message));
  }
  return g.__meidaPool;
}

export function getDb(): Db {
  g.__meidaDb ??= drizzle(getPool(), { schema });
  return g.__meidaDb;
}

/**
 * One connection to the Postgres server itself, for session state such as an advisory lock.
 * DATABASE_URL can go through a transaction-mode pooler, which may run each query on a
 * different server connection. DATABASE_URL_DIRECT never does; it is unset in local dev.
 * The caller ends the client.
 */
export async function connectDirect(): Promise<Client> {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  client.on("error", (err) => console.error("[db] direct client error:", err.message));
  await client.connect();
  return client;
}
