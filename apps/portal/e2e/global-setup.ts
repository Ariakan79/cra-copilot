import { buildApp } from '@cra-copilot/api/app';
import { connect } from '@cra-copilot/api/db/client';
import { migrate } from '@cra-copilot/api/db/migrate';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Portal-E2E gegen den echten Stack (TEST_STRATEGY §8.4): Postgres via
 * Testcontainers + die geteilte API in-process auf Port 3098, mit Seed-Daten
 * (Mandant, Produkt, Portal-Nutzer, Stream, OSV-Fixture, eine konforme
 * Lieferung → Findings + Heartbeat).
 */
const API_PORT = 3098;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { sql, db } = connect(container.getConnectionUri());
  await migrate(sql);

  // Seed über die Domänenmodule der API (dynamischer Import: TS-Quellen).
  const { mandant, produkt, sbomStream, portalUser } = await import('@cra-copilot/api/db/schema');
  const { hashPasswort, neuesToken } = await import('@cra-copilot/api/portal/auth');
  const { ingest } = await import('@cra-copilot/api/portal/ingestion');
  const { spiegleOsv } = await import('@cra-copilot/api/portal/osv-spiegel');
  const { bewerteFindings } = await import('@cra-copilot/api/portal/findings');

  const [m] = await db.insert(mandant).values({ name: 'Musterfirma IoT GmbH' }).returning();
  const [p] = await db
    .insert(produkt)
    .values({ mandantId: m!.id, name: 'Smart-Lock Pro' })
    .returning();
  await db.insert(portalUser).values({
    mandantId: m!.id,
    benutzername: 'kunde',
    passwortHash: hashPasswort('portal1234'),
  });
  await db.insert(sbomStream).values({
    mandantId: m!.id,
    produktId: p!.id,
    name: 'Firmware',
    format: 'cyclonedx',
    tool: 'syft',
    kanal: 'api_token',
    maxAgeHeartbeatTage: '90',
  });
  const { hash } = neuesToken();
  const { ingestionToken } = await import('@cra-copilot/api/db/schema');
  await db.insert(ingestionToken).values({ mandantId: m!.id, produktId: p!.id, tokenHash: hash });

  await spiegleOsv(db, [
    {
      osvId: 'GHSA-p6mc-m468-83gw',
      ecosystem: 'npm',
      paket: 'lodash',
      behoben: '4.17.21',
      schweregrad: '7.4',
      zusammenfassung: 'Prototype pollution',
    },
  ]);
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    metadata: { timestamp: '2026-06-13T08:00:00Z', tools: [{ name: 'syft' }] },
    components: [
      {
        type: 'library',
        name: 'lodash',
        version: '4.17.20',
        purl: 'pkg:npm/lodash@4.17.20',
        supplier: { name: 'OpenJS' },
      },
    ],
  };
  await ingest(
    db,
    { produktId: p!.id, streamName: 'Firmware', kanal: 'api_token', roh: sbom },
    bewerteFindings,
  );

  const app = buildApp(db);
  await app.listen({ host: '127.0.0.1', port: API_PORT });
  process.env.API_PORT = String(API_PORT);

  return async () => {
    await app.close();
    await sql.end();
    await container.stop();
  };
}
