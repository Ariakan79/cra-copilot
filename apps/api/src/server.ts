import { buildApp } from './app';
import { connect } from './db/client';
import { migrate } from './db/migrate';

/**
 * Lokaler Single-User-Betrieb (ADR-014): bindet ausschließlich an 127.0.0.1.
 * Mandantendaten verlassen den Rechner nicht.
 */
const { sql, db } = connect();
await migrate(sql);

const app = buildApp(db);
const port = Number(process.env.PORT ?? 3001);
await app.listen({ host: '127.0.0.1', port });
console.log(`Cockpit-API läuft auf http://127.0.0.1:${port}`);
