import {
  fristFuer,
  vorlageFuer,
  type Meldungsart,
  type Stufe,
} from '@cra-copilot/meldung-vorlagen';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { finding, meldevorgang, meldungStufe, produkt, type MeldeArt } from '../db/schema';
import { aktuellerWert, ValidierungsFehler } from '../domain/evidenz';
import { protokolliere, pruefeIntegritaet } from './audit';

/**
 * Meldevorgang-Domäne (CRA Art. 14, ADR-029–034). Die Eröffnung ist die
 * menschliche Meldeentscheidung (ADR-034); Fristen sind abgeleitet (ADR-032);
 * Fristwerte/Feldvorlagen kommen aus dem versionierten Datenpaket (ADR-033).
 */

const MS_STUNDE = 60 * 60 * 1000;
const MS_TAG = 24 * MS_STUNDE;
const STUFEN: Stufe[] = ['fruehwarnung', 'meldung', 'abschluss'];

export interface EroeffnungFinding {
  findingId: string;
  titel: string;
  begruendung: string;
  eroeffnetVon: string;
}

/**
 * Eröffnet einen Meldevorgang aus einem Finding — die ausdrückliche menschliche
 * Einstufung „aktiv ausgenutzt" (ADR-034). Der Triage-Status allein genügt nicht.
 */
export async function eroeffneAusFinding(db: DB, e: EroeffnungFinding): Promise<string> {
  const [f] = await db.select().from(finding).where(eq(finding.id, e.findingId));
  if (f === undefined) throw new ValidierungsFehler('Finding nicht gefunden');
  const [zeile] = await db
    .insert(meldevorgang)
    .values({
      mandantId: f.mandantId,
      produktId: f.produktId,
      art: 'schwachstelle',
      quelleFindingId: f.id,
      titel: e.titel,
      begruendung: e.begruendung,
      eroeffnetVon: e.eroeffnetVon,
    })
    .returning({ id: meldevorgang.id });
  return zeile!.id;
}

export interface EroeffnungFrei {
  produktId: string;
  art: MeldeArt;
  titel: string;
  begruendung?: string;
  eroeffnetVon: string;
}

/** Eröffnet eine freie Vorfallmeldung (ohne Finding-Bezug). */
export async function eroeffneFrei(db: DB, e: EroeffnungFrei): Promise<string> {
  const [p] = await db
    .select({ mandantId: produkt.mandantId })
    .from(produkt)
    .where(eq(produkt.id, e.produktId));
  if (p === undefined) throw new ValidierungsFehler('Produkt unbekannt');
  const [zeile] = await db
    .insert(meldevorgang)
    .values({
      mandantId: p.mandantId,
      produktId: e.produktId,
      art: e.art,
      titel: e.titel,
      begruendung: e.begruendung ?? null,
      eroeffnetVon: e.eroeffnetVon,
    })
    .returning({ id: meldevorgang.id });
  return zeile!.id;
}

export async function setzeKorrekturmassnahme(db: DB, vorgangId: string, ab: Date): Promise<void> {
  await db
    .update(meldevorgang)
    .set({ korrekturmassnahmeAb: ab })
    .where(eq(meldevorgang.id, vorgangId));
}

export interface StufenFrist {
  stufe: Stufe;
  fristBis: Date | null;
  ueberfaellig: boolean;
  eingereichtAm: Date | null;
}

/**
 * Berechnet die drei Stufenfristen abgeleitet (ADR-032): aus Bezugszeitpunkt +
 * Fristwert (aus den versionierten Daten). `fristBis` ist null, solange der
 * Bezugspunkt fehlt (z. B. Abschluss vor gesetzter Korrekturmaßnahme).
 */
export async function stufenFristen(
  db: DB,
  vorgangId: string,
  jetzt: Date = new Date(),
): Promise<StufenFrist[]> {
  const [v] = await db.select().from(meldevorgang).where(eq(meldevorgang.id, vorgangId));
  if (v === undefined) throw new ValidierungsFehler('Meldevorgang nicht gefunden');
  const stufen = await db.select().from(meldungStufe).where(eq(meldungStufe.vorgangId, vorgangId));
  const stufeRow = (s: Stufe) => stufen.find((r) => r.stufe === s);

  const bezugDatum = (bezug: string): Date | null => {
    if (bezug === 'eroeffnet_am') return v.eroeffnetAm;
    if (bezug === 'korrekturmassnahme_ab') return v.korrekturmassnahmeAb;
    if (bezug === 'meldung_eingereicht_am') return stufeRow('meldung')?.eingereichtAm ?? null;
    return null;
  };

  return STUFEN.map((stufe): StufenFrist => {
    const frist = fristFuer(v.art as Meldungsart, stufe);
    const bezug = frist === undefined ? null : bezugDatum(frist.bezug);
    let fristBis: Date | null = null;
    if (frist !== undefined && bezug !== null) {
      const delta =
        frist.stunden !== undefined ? frist.stunden * MS_STUNDE : (frist.tage ?? 0) * MS_TAG;
      fristBis = new Date(bezug.getTime() + delta);
    }
    const eingereichtAm = stufeRow(stufe)?.eingereichtAm ?? null;
    const ueberfaellig =
      fristBis !== null && eingereichtAm === null && fristBis.getTime() < jetzt.getTime();
    return { stufe, fristBis, ueberfaellig, eingereichtAm };
  });
}

export interface EntwurfFeld {
  id: string;
  label: string;
  pflicht: boolean;
  wert: string;
}
export interface Entwurf {
  stufe: Stufe;
  art: Meldungsart;
  titel: string;
  hinweis: string | null;
  felder: EntwurfFeld[];
  /** Integritäts-Anker: Kopf-Hash der Nachweis-Kette zum Zeitpunkt der Erstellung (ADR-035). */
  integritaet: { kopfHash: string | null; intakt: boolean; geprueft: number };
}

/** Feld-ID, unter der der Ketten-Kopf-Hash in den Melde-Entwurf eingebettet wird. */
export const ANKER_FELD = 'kettenkopf_hash';

/** Baut den strukturierten Melde-Entwurf aus der Vorlage + ggf. bereits erfasstem Inhalt. */
export async function entwurf(db: DB, vorgangId: string, stufe: Stufe): Promise<Entwurf> {
  const [v] = await db.select().from(meldevorgang).where(eq(meldevorgang.id, vorgangId));
  if (v === undefined) throw new ValidierungsFehler('Meldevorgang nicht gefunden');
  const vorlage = vorlageFuer(v.art as Meldungsart, stufe);
  if (vorlage === undefined) throw new ValidierungsFehler(`Keine Vorlage für ${v.art}/${stufe}`);
  const [row] = await db
    .select()
    .from(meldungStufe)
    .where(and(eq(meldungStufe.vorgangId, vorgangId), eq(meldungStufe.stufe, stufe)));
  const inhalt = (row?.inhalt ?? {}) as Record<string, string>;
  const integritaet = await pruefeIntegritaet(db);
  const felder: EntwurfFeld[] = vorlage.felder.map((f) => ({
    id: f.id,
    label: f.label.de,
    pflicht: f.pflicht,
    wert: inhalt[f.id] ?? '',
  }));
  // Integritäts-Anker einbetten: der aktuelle Kopf-Hash der Nachweis-Kette geht
  // damit in die Behördenmeldung ein und wird so extern (zeit-)bezeugt (Option 1).
  felder.push({
    id: ANKER_FELD,
    label: 'Integritäts-Anker — Kopf-Hash der Nachweis-Kette (SHA-256)',
    pflicht: false,
    wert: inhalt[ANKER_FELD] ?? integritaet.kopfHash ?? '(noch keine Kette)',
  });
  return {
    stufe,
    art: v.art as Meldungsart,
    titel: vorlage.titel.de,
    hinweis: vorlage.hinweis?.de ?? null,
    felder,
    integritaet: {
      kopfHash: integritaet.kopfHash,
      intakt: integritaet.intakt,
      geprueft: integritaet.geprueft,
    },
  };
}

/** Speichert den Entwurfsinhalt einer noch nicht eingereichten Stufe. */
export async function speichereEntwurf(
  db: DB,
  vorgangId: string,
  stufe: Stufe,
  inhalt: Record<string, string>,
): Promise<void> {
  const [row] = await db
    .select()
    .from(meldungStufe)
    .where(and(eq(meldungStufe.vorgangId, vorgangId), eq(meldungStufe.stufe, stufe)));
  if (row === undefined) {
    await db.insert(meldungStufe).values({ vorgangId, stufe, inhalt });
  } else {
    await db.update(meldungStufe).set({ inhalt }).where(eq(meldungStufe.id, row.id));
  }
}

/** Reicht eine Stufe ein: setzt eingereicht_am/von; danach unveränderlich (Trigger). */
export async function reicheEin(
  db: DB,
  vorgangId: string,
  stufe: Stufe,
  daten: { inhalt: Record<string, string>; eingereichtVon: string; kanal?: string },
): Promise<void> {
  const [row] = await db
    .select()
    .from(meldungStufe)
    .where(and(eq(meldungStufe.vorgangId, vorgangId), eq(meldungStufe.stufe, stufe)));
  if (row?.eingereichtAm != null) throw new ValidierungsFehler('Stufe ist bereits eingereicht.');
  const werte = {
    inhalt: daten.inhalt,
    eingereichtAm: new Date(),
    eingereichtVon: daten.eingereichtVon,
    kanal: daten.kanal ?? 'manuell_enisa_csirt',
  };
  let stufeId: string;
  if (row === undefined) {
    const [neu] = await db
      .insert(meldungStufe)
      .values({ vorgangId, stufe, ...werte })
      .returning({ id: meldungStufe.id });
    stufeId = neu!.id;
  } else {
    await db.update(meldungStufe).set(werte).where(eq(meldungStufe.id, row.id));
    stufeId = row.id;
  }
  // Eingereichte Stufe in die Hash-Kette aufnehmen (ADR-035).
  await protokolliere(db, 'meldung_stufe', stufeId);
  // Vorgangsstatus fortschreiben.
  if (stufe === 'meldung') {
    await db.update(meldevorgang).set({ status: 'gemeldet' }).where(eq(meldevorgang.id, vorgangId));
  } else if (stufe === 'abschluss') {
    await db
      .update(meldevorgang)
      .set({ status: 'abgeschlossen' })
      .where(eq(meldevorgang.id, vorgangId));
  }
}

/** Eskalationskontakte aus der Block-4-Evidenz (ADR-032) — nicht im Portal dupliziert. */
export async function eskalationskontakte(
  db: DB,
  mandantId: string,
  produktId: string,
): Promise<Record<string, string>> {
  const felder = [
    's_meldung_csirt_zustaendig',
    's_cvd_kontaktstelle',
    'm_compliance_verantwortlicher',
  ];
  const kontakte: Record<string, string> = {};
  for (const feldId of felder) {
    const w = await aktuellerWert(db, mandantId, produktId, feldId);
    if (w !== undefined && typeof w.wert === 'string') kontakte[feldId] = w.wert;
  }
  return kontakte;
}

export async function vorgaengeFuerProdukt(db: DB, produktId: string) {
  return db.select().from(meldevorgang).where(eq(meldevorgang.produktId, produktId));
}
