import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { connect, type DB } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import type { Sql } from 'postgres';

/**
 * Gemeinsames Test-Setup: ein echtes PostgreSQL via Testcontainers (TEST_STRATEGY
 * §7.2/§7.3 — kein SQLite, Dialekt-Drift ist genau die Fehlerklasse, die wir
 * testen). Migrationen laufen im Test mit, das prüft die Migrationskette gleich mit.
 */
export interface TestDB {
  db: DB;
  sql: Sql;
  container: StartedPostgreSqlContainer;
  reset: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function starteTestDB(): Promise<TestDB> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { sql, db } = connect(container.getConnectionUri());
  await migrate(sql);
  return {
    db,
    sql,
    container,
    // TRUNCATE umgeht den BEFORE-DELETE-Trigger (D2) — Reset bleibt möglich.
    reset: async () => {
      await sql`truncate workshop, sbom_stream, gap, evidenz_knoten, produkt, mandant cascade`;
    },
    stop: async () => {
      await sql.end();
      await container.stop();
    },
  };
}

export const QUELLE = {
  art: 'kundenaussage_aufnahmegespraech' as const,
  person: 'Frau Beispiel',
  datum: '2026-06-13',
  gespraechsleiter: 'Hr. Leiter',
};
