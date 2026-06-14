import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { finding, mandant, meldevorgang, meldungStufe, produkt } from '../src/db/schema';
import { setzeEvidenz } from '../src/domain/evidenz';
import { bewerteFindings, setzeFindingTriage } from '../src/portal/findings';
import { ingest } from '../src/portal/ingestion';
import {
  entwurf,
  eroeffneAusFinding,
  eroeffneFrei,
  eskalationskontakte,
  reicheEin,
  setzeKorrekturmassnahme,
  stufenFristen,
  vorgaengeFuerProdukt,
} from '../src/portal/meldung';
import { spiegleOsv, type OsvEingang } from '../src/portal/osv-spiegel';
import { QUELLE, starteTestDB, type TestDB } from './setup';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'),
  );
}
const OSV: OsvEingang[] = [
  {
    osvId: 'GHSA-p6mc-m468-83gw',
    ecosystem: 'npm',
    paket: 'lodash',
    behoben: '4.17.21',
    schweregrad: '7.4',
  },
];

let t: TestDB;
beforeAll(async () => {
  t = await starteTestDB();
}, 120_000);
afterAll(async () => t?.stop());
beforeEach(async () => t.reset());

async function produktMitFinding() {
  const [m] = await t.db.insert(mandant).values({ name: 'K' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  await ingest(t.db, {
    produktId: p!.id,
    streamName: 'Firmware',
    kanal: 'api_token',
    roh: fixture('sbom-cyclonedx.json'),
  });
  await spiegleOsv(t.db, OSV);
  await bewerteFindings(t.db, m!.id, p!.id);
  const [f] = await t.db.select().from(finding).where(eq(finding.produktId, p!.id));
  return { mandantId: m!.id, produktId: p!.id, findingId: f!.id };
}

describe('R1/R3: Eröffnung aus Finding ist die menschliche Einstufung', () => {
  it('ein bestätigtes Finding allein eröffnet KEINEN Vorgang', async () => {
    const { produktId, findingId } = await produktMitFinding();
    await setzeFindingTriage(t.db, findingId, 'in_pruefung');
    await setzeFindingTriage(t.db, findingId, 'bestaetigt');
    expect((await vorgaengeFuerProdukt(t.db, produktId)).length).toBe(0); // R3
  });

  it('explizite Einstufung „aktiv ausgenutzt" eröffnet einen Schwachstellen-Vorgang', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'Aktiv ausgenutzte lodash-Lücke',
      begruendung: 'Exploit in Logs beobachtet',
      eroeffnetVon: 'CISO',
    });
    const [v] = await t.db.select().from(meldevorgang).where(eq(meldevorgang.id, id));
    expect(v!.art).toBe('schwachstelle');
    expect(v!.quelleFindingId).toBe(findingId);
    expect(v!.eroeffnetVon).toBe('CISO');
  });
});

describe('R2: freie Vorfallmeldung', () => {
  it('lässt sich ohne Finding eröffnen', async () => {
    const { produktId } = await produktMitFinding();
    const id = await eroeffneFrei(t.db, {
      produktId,
      art: 'vorfall',
      titel: 'DDoS auf Cloud',
      eroeffnetVon: 'SOC',
    });
    const [v] = await t.db.select().from(meldevorgang).where(eq(meldevorgang.id, id));
    expect(v!.art).toBe('vorfall');
    expect(v!.quelleFindingId).toBeNull();
  });
});

describe('R4/R5/R6: Fristen abgeleitet, Überfälligkeit', () => {
  it('Frühwarnung +24h, Meldung +72h ab Eröffnung', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    const [v] = await t.db.select().from(meldevorgang).where(eq(meldevorgang.id, id));
    const f = await stufenFristen(t.db, id, v!.eroeffnetAm);
    const fw = f.find((s) => s.stufe === 'fruehwarnung')!;
    const me = f.find((s) => s.stufe === 'meldung')!;
    expect(fw.fristBis!.getTime() - v!.eroeffnetAm.getTime()).toBe(24 * 3600 * 1000);
    expect(me.fristBis!.getTime() - v!.eroeffnetAm.getTime()).toBe(72 * 3600 * 1000);
  });

  it('Abschluss (Schwachstelle) = Korrekturmaßnahme + 14 Tage; vorher null', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    let f = await stufenFristen(t.db, id);
    expect(f.find((s) => s.stufe === 'abschluss')!.fristBis).toBeNull();
    const ab = new Date('2026-07-01T00:00:00Z');
    await setzeKorrekturmassnahme(t.db, id, ab);
    f = await stufenFristen(t.db, id);
    const ab14 = f.find((s) => s.stufe === 'abschluss')!.fristBis!;
    expect(ab14.getTime() - ab.getTime()).toBe(14 * 24 * 3600 * 1000);
  });

  it('überfällig, wenn Frist < jetzt und Stufe nicht eingereicht', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    const [v] = await t.db.select().from(meldevorgang).where(eq(meldevorgang.id, id));
    const spaeter = new Date(v!.eroeffnetAm.getTime() + 48 * 3600 * 1000); // 48h später
    const fw = (await stufenFristen(t.db, id, spaeter)).find((s) => s.stufe === 'fruehwarnung')!;
    expect(fw.ueberfaellig).toBe(true);
  });
});

describe('R8: Einreichung & Unveränderlichkeit', () => {
  it('eingereichte Stufe ist nicht mehr überfällig und nicht änderbar', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    await reicheEin(t.db, id, 'fruehwarnung', {
      inhalt: {
        produkt: 'P',
        schwachstelle: 'lodash',
        ausnutzung_bekannt: 'ja',
        erste_einschaetzung: 'hoch',
      },
      eingereichtVon: 'CISO',
    });
    const [stufe] = await t.db.select().from(meldungStufe).where(eq(meldungStufe.vorgangId, id));
    // weit in der Zukunft → nicht überfällig, weil eingereicht
    const weit = new Date(Date.now() + 999 * 24 * 3600 * 1000);
    const fw = (await stufenFristen(t.db, id, weit)).find((s) => s.stufe === 'fruehwarnung')!;
    expect(fw.ueberfaellig).toBe(false);
    // UPDATE auf eingereichte Stufe schlägt fehl (Trigger)
    let gefangen: unknown;
    await t.db
      .update(meldungStufe)
      .set({ kanal: 'x' })
      .where(eq(meldungStufe.id, stufe!.id))
      .catch((e: unknown) => (gefangen = e));
    expect(JSON.stringify(gefangen, Object.getOwnPropertyNames(gefangen ?? {}))).toMatch(
      /unveraenderlich/,
    );
    // zweite Einreichung abgelehnt
    await expect(
      reicheEin(t.db, id, 'fruehwarnung', { inhalt: {}, eingereichtVon: 'B' }),
    ).rejects.toThrow(/bereits eingereicht/);
  });

  it('Entwurf einer noch nicht eingereichten Stufe ist editierbar', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    const e = await entwurf(t.db, id, 'meldung');
    expect(e.art).toBe('schwachstelle');
    expect(e.felder.some((f) => f.pflicht)).toBe(true);
    // Geschäftsfelder sind leer; nur der Anker ist vorbelegt.
    expect(e.felder.filter((f) => f.id !== 'kettenkopf_hash').every((f) => f.wert === '')).toBe(
      true,
    );
  });
});

describe('Option 1: Integritäts-Anker im Melde-Entwurf', () => {
  it('Entwurf enthält den aktuellen Kopf-Hash der Nachweis-Kette', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    const e = await entwurf(t.db, id, 'fruehwarnung');
    expect(e.integritaet.intakt).toBe(true);
    expect(e.integritaet.kopfHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    const anker = e.felder.find((f) => f.id === 'kettenkopf_hash');
    expect(anker?.wert).toBe(e.integritaet.kopfHash);
  });

  it('Abschluss-Entwurf befüllt CVSS aus dem verknüpften Finding vor', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    const e = await entwurf(t.db, id, 'abschluss');
    const cvss = e.felder.find((f) => f.id === 'cvss');
    expect(cvss?.wert).toBe('7.4'); // aus OSV-Fixture (lodash)
  });

  it('eingereichte Meldung trägt den Anker dauerhaft im unveränderlichen Inhalt', async () => {
    const { findingId } = await produktMitFinding();
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    const e = await entwurf(t.db, id, 'fruehwarnung');
    const inhalt = Object.fromEntries(e.felder.map((f) => [f.id, f.wert]));
    await reicheEin(t.db, id, 'fruehwarnung', { inhalt, eingereichtVon: 'CISO' });
    const [stufe] = await t.db.select().from(meldungStufe).where(eq(meldungStufe.vorgangId, id));
    expect((stufe!.inhalt as Record<string, string>)['kettenkopf_hash']).toBe(
      e.integritaet.kopfHash,
    );
  });
});

describe('R10: Eskalationskontakte aus Block-4-Evidenz', () => {
  it('liest die im Cockpit erfassten Meldekontakte', async () => {
    const { mandantId, produktId, findingId } = await produktMitFinding();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 's_meldung_csirt_zustaendig',
      wert: 'CISO meldet an BSI-CSIRT',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 's_cvd_kontaktstelle',
      wert: 'security@firma.de',
      quelle: QUELLE,
    });
    const id = await eroeffneAusFinding(t.db, {
      findingId,
      titel: 'X',
      begruendung: 'y',
      eroeffnetVon: 'A',
    });
    void id;
    const k = await eskalationskontakte(t.db, mandantId, produktId);
    expect(k['s_meldung_csirt_zustaendig']).toBe('CISO meldet an BSI-CSIRT');
    expect(k['s_cvd_kontaktstelle']).toBe('security@firma.de');
  });
});
