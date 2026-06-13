import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import yaml from 'js-yaml';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { QUELLE, starteTestDB, type TestDB } from './setup';

interface Fixture {
  mandant: string;
  mandant_evidenz: Record<string, string | string[]>;
  produkte: {
    name: string;
    evidenz: Record<string, string | string[]>;
    overrides?: Record<string, string | string[]>;
    sbom_streams: Record<string, string>[];
  }[];
}

const fixture = yaml.load(
  readFileSync(fileURLToPath(new URL('./fixtures/musterfirma.yaml', import.meta.url)), 'utf8'),
  { schema: yaml.JSON_SCHEMA },
) as Fixture;

let t: TestDB;
let app: FastifyInstance;

beforeAll(async () => {
  t = await starteTestDB();
  app = buildApp(t.db);
  await app.ready();
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});
beforeEach(async () => t.reset());

async function post(url: string, body: Record<string, unknown>) {
  const res = await app.inject({ method: 'POST', url, payload: body });
  return { status: res.statusCode, json: res.json() as Record<string, unknown> };
}

/** Spielt die Golden-Aufnahme komplett über die HTTP-API ein. */
async function spieleEin() {
  const m = await post('/mandanten', { name: fixture.mandant });
  const mandantId = m.json.id as string;
  for (const [feldId, wert] of Object.entries(fixture.mandant_evidenz)) {
    const r = await post(`/mandanten/${mandantId}/evidenz`, { feldId, wert, quelle: QUELLE });
    expect(r.status, `mandant ${feldId}`).toBe(201);
  }
  const produktIds: string[] = [];
  for (const p of fixture.produkte) {
    const pr = await post(`/mandanten/${mandantId}/produkte`, { name: p.name });
    const produktId = pr.json.id as string;
    produktIds.push(produktId);
    for (const [feldId, wert] of Object.entries(p.evidenz)) {
      const r = await post(`/produkte/${produktId}/evidenz`, { feldId, wert, quelle: QUELLE });
      expect(r.status, `${p.name} ${feldId}`).toBe(201);
    }
    for (const [feldId, wert] of Object.entries(p.overrides ?? {})) {
      await post(`/produkte/${produktId}/evidenz`, { feldId, wert, quelle: QUELLE });
    }
    for (const stream of p.sbom_streams) {
      const r = await post(`/produkte/${produktId}/sbom-streams`, stream);
      expect(r.status).toBe(201);
    }
  }
  return { mandantId, produktIds };
}

describe('Golden-Aufnahme Musterfirma IoT GmbH', () => {
  it('alle Blöcke sind nach der Aufnahme bearbeitet', async () => {
    const { produktIds } = await spieleEin();
    const res = await app.inject({ url: `/produkte/${produktIds[0]}/blockstatus` });
    const status = res.json() as { nummer: number; ampel: string }[];
    expect(status.length).toBe(9);
    expect(status.every((b) => b.ampel !== 'nicht_bearbeitet')).toBe(true);
  });

  it('geteilte CVD-Policy als Default, Produkt 2 mit Kontakt-Override', async () => {
    const { produktIds } = await spieleEin();
    const w1 = (await app.inject({ url: `/produkte/${produktIds[0]}/werte` })).json() as Record<
      string,
      unknown
    >;
    const w2 = (await app.inject({ url: `/produkte/${produktIds[1]}/werte` })).json() as Record<
      string,
      unknown
    >;
    // Produkt 1 erbt den Mandanten-Default, Produkt 2 überschreibt nur den Kontakt.
    expect(w1['s_cvd_kontaktstelle']).toBe('security@musterfirma.de');
    expect(w2['s_cvd_kontaktstelle']).toBe('produktsec-cam@musterfirma.de');
    // Die Policy selbst gilt für beide aus dem Default.
    expect(w1['s_cvd_policy_vorhanden']).toBe('ja');
    expect(w2['s_cvd_policy_vorhanden']).toBe('ja');
  });

  it('Gap-Report nennt die erwarteten Lücken pro Produkt', async () => {
    const { produktIds } = await spieleEin();
    const g1 = (await app.inject({ url: `/produkte/${produktIds[0]}/gaps` })).json() as {
      produkt: { feldId: string; prioritaet: string }[];
    };
    const g2 = (await app.inject({ url: `/produkte/${produktIds[1]}/gaps` })).json() as {
      produkt: { feldId: string; prioritaet: string }[];
    };
    expect(g1.produkt.map((g) => g.feldId)).toContain('d_av_risikobewertung');
    expect(g2.produkt.map((g) => g.feldId)).toContain('r_sf_sichere_defaults');
  });

  it('SBOM-Profil von Produkt 1 hat zwei Streams und abgeleitete Pflichtfelder', async () => {
    const { produktIds } = await spieleEin();
    const profil = (await app.inject({ url: `/produkte/${produktIds[0]}/sbom-profil` })).json() as {
      streams: unknown[];
      pflichtfelder: string[];
      konformitaetsziel: string;
    };
    expect(profil.streams.length).toBe(2);
    expect(profil.konformitaetsziel).toBe('bsi_tr_03183_2');
    expect(profil.pflichtfelder).toContain('abhaengigkeitsbeziehung');
  });

  it('SBOM-Profil als YAML exportierbar', async () => {
    const { produktIds } = await spieleEin();
    const res = await app.inject({ url: `/produkte/${produktIds[0]}/sbom-profil?format=yaml` });
    expect(res.headers['content-type']).toContain('yaml');
    expect(res.body).toContain('streams:');
    expect(res.body).toContain('Firmware');
  });

  it('Workshop ist abschließbar, sobald alle Blöcke bearbeitet sind (D6)', async () => {
    const { produktIds } = await spieleEin();
    const res = await app.inject({
      method: 'POST',
      url: `/produkte/${produktIds[0]}/workshop-abschluss`,
    });
    expect(res.statusCode).toBe(200);
    const status = res.json() as Record<string, unknown>;
    expect(status['workshop_durchgefuehrt']).not.toBeNull();
    expect(status['onboarding_abgeschlossen']).toBeNull();
  });

  it('Bericht bündelt Blockstatus, Gaps, SBOM-Profil und Workshop-Status', async () => {
    const { produktIds } = await spieleEin();
    const bericht = (await app.inject({ url: `/produkte/${produktIds[0]}/bericht` })).json() as {
      blockstatus: unknown[];
      gaps: unknown[];
      sbom_profil: { streams: unknown[] };
    };
    expect(bericht.blockstatus).toHaveLength(9);
    expect(bericht.gaps.length).toBeGreaterThan(0);
    expect(bericht.sbom_profil.streams).toHaveLength(2);
  });
});
