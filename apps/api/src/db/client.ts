import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

/** Öffnet eine Verbindung; ohne Argument aus DATABASE_URL (lokaler Compose). */
export function connect(url?: string): { sql: postgres.Sql; db: DB } {
  const verbindung =
    url ?? process.env.DATABASE_URL ?? 'postgres://cra:cra_local_dev@127.0.0.1:5433/cra_copilot';
  const sql = postgres(verbindung);
  return { sql, db: drizzle(sql, { schema }) };
}
