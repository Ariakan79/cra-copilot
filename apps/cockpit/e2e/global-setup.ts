import { buildApp } from '@cra-copilot/api/app';
import { connect } from '@cra-copilot/api/db/client';
import { migrate } from '@cra-copilot/api/db/migrate';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * E2E gegen den echten Stack (TEST_STRATEGY §7.4): startet ein Postgres via
 * Testcontainers und die Cockpit-API in-process auf Port 3099; der Vite-Preview
 * spiegelt /api dorthin. Rückgabe ist die Teardown-Funktion.
 */
const API_PORT = 3099;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { sql, db } = connect(container.getConnectionUri());
  await migrate(sql);

  const app = buildApp(db);
  await app.listen({ host: '127.0.0.1', port: API_PORT });

  // Damit der Vite-Preview-Proxy (Subprozess) den API-Port kennt.
  process.env.API_PORT = String(API_PORT);

  return async () => {
    await app.close();
    await sql.end();
    await container.stop();
  };
}
