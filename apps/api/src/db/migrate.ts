import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

/**
 * Schlanker Migrator: führt alle `drizzle/*.sql` in Dateinamenreihenfolge aus
 * und merkt sich angewandte Migrationen in `_migrationen`. Bewusst kein
 * drizzle-kit-Journal — die Migrationen enthalten Custom-Trigger (D2), die ich
 * direkt als SQL pflege und im Review lesen will.
 */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql`create table if not exists _migrationen (
    name text primary key,
    angewandt_am timestamptz not null default now()
  )`;
  const angewandt = new Set(
    (await sql<{ name: string }[]>`select name from _migrationen`).map((r) => r.name),
  );

  const ordner = fileURLToPath(new URL('../../drizzle/', import.meta.url));
  const dateien = readdirSync(ordner)
    .filter((d) => d.endsWith('.sql'))
    .sort();

  const neu: string[] = [];
  for (const datei of dateien) {
    if (angewandt.has(datei)) continue;
    const ddl = readFileSync(ordner + datei, 'utf8');
    await sql.unsafe(ddl);
    await sql`insert into _migrationen (name) values (${datei})`;
    neu.push(datei);
  }
  return neu;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { connect } = await import('./client.js');
  const { sql } = connect();
  const neu = await migrate(sql);
  console.log(
    neu.length > 0 ? `Migrationen angewandt: ${neu.join(', ')}` : 'Keine neuen Migrationen.',
  );
  await sql.end();
}
