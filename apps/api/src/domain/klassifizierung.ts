import { istLueckenWert, type FeldWert } from '@cra-copilot/aufnahme-katalog';
import {
  naechsterSchritt,
  regelwerk,
  type Antworten,
  type Kategorie,
} from '@cra-copilot/rules-engine';
import type { DB } from '../db/client';
import { alleAktuellenWerte } from './evidenz';

/**
 * Adapter Cockpit → Regel-Engine (ADR-001: dieselbe Engine wie der Wizard, keine
 * Zweitimplementierung). Bildet die im Aufnahme-Interview erfassten Felder auf
 * die Selbstauskunfts-Fragen des Regelwerks ab und liefert einen
 * Klassifizierungs-**Vorschlag** für Block 2 — der Gesprächsleiter bestätigt
 * oder überschreibt ihn (Spec, Cockpit-Verhalten Block 2).
 *
 * Die Mappings unten enthalten fachliche Annahmen; sie sind bewusst transparent
 * (Feld `annahmen` im Ergebnis) und stehen wie die Katalogdaten unter
 * Director-Review.
 */

export interface Klassifizierungsvorschlag {
  vorschlag:
    | { geltungsbereich: 'in_scope'; kategorie?: Kategorie; sonderregime?: 'os_steward' }
    | { geltungsbereich: 'ausserhalb' | 'ausgenommen' }
    | null;
  begruendungspfad: { regel_id: string; titel: string; begruendung: string }[];
  annahmen: string[];
  fehlende_eingaben: string[];
}

function einzelwert(wert: FeldWert | undefined): string | undefined {
  if (wert === undefined || istLueckenWert(wert)) return undefined;
  return typeof wert === 'string' ? wert : wert[0];
}

function liste(wert: FeldWert | undefined): string[] {
  if (wert === undefined || istLueckenWert(wert)) return [];
  return typeof wert === 'string' ? [wert] : [...wert];
}

const ROLLEN_PRIO = ['hersteller', 'importeur', 'haendler', 'os_steward'] as const;

export async function klassifizierungsvorschlag(
  db: DB,
  mandantId: string,
  produktId: string,
): Promise<Klassifizierungsvorschlag> {
  const w = await alleAktuellenWerte(db, mandantId, produktId);
  const annahmen: string[] = [];
  const antworten: Record<string, string | string[]> = {};

  // rolle ← m_rollen (höchste Verantwortung); auftragsfertiger ~ Herstellerpflichten.
  const rollen = liste(w['m_rollen']);
  const rolle =
    ROLLEN_PRIO.find((r) => rollen.includes(r)) ??
    (rollen.includes('auftragsfertiger') ? 'hersteller' : undefined);
  if (rolle !== undefined) {
    antworten['rolle'] = rolle;
    if (
      rollen.includes('auftragsfertiger') &&
      !rollen.some((r) => ROLLEN_PRIO.includes(r as never))
    ) {
      annahmen.push('Rolle „Auftragsfertiger" als „Hersteller" gewertet.');
    }
  }

  // produktart ← p_produktumfang.
  const umfang = liste(w['p_produktumfang']);
  if (umfang.length > 0) {
    if (umfang.includes('hardware')) antworten['produktart'] = 'hardware_mit_software';
    else if (umfang.some((u) => ['lokale_software', 'companion_app', 'bibliotheken'].includes(u)))
      antworten['produktart'] = 'software_produkt';
    else if (umfang.includes('entfernte_datenverarbeitung')) {
      antworten['produktart'] = 'reine_dienstleistung';
      antworten['dienstleistung_fuer_produkt'] = 'ja';
      annahmen.push(
        'Reine entfernte Datenverarbeitung als produktzugehörig gewertet (Teil des Produktumfangs).',
      );
    }
  }

  // datenverbindung: im Onboarding-Kontext angenommen (CRA-Produkt mit digitalen Elementen).
  antworten['datenverbindung'] = 'ja';
  annahmen.push(
    'Datenverbindung angenommen (ja) — bei vollständig offline-Produkt in Block 1 korrigieren.',
  );

  // eu_markt ← p_inverkehrbringen.
  const ivk = einzelwert(w['p_inverkehrbringen']);
  if (ivk !== undefined) antworten['eu_markt'] = ivk === 'nicht_geplant' ? 'nein' : 'ja';

  // ausnahmebereich ← p_ausnahmebereich.
  const ausnahme = einzelwert(w['p_ausnahmebereich']);
  if (ausnahme !== undefined) antworten['ausnahmebereich'] = ausnahme;

  // oss ← p_oss_konstellation.
  const ossMap: Record<string, string> = {
    kommerziell: 'nicht_oss',
    oss_kommerziell: 'oss_kommerziell',
    oss_beitrag: 'oss_nicht_kommerziell',
  };
  const oss = einzelwert(w['p_oss_konstellation']);
  if (oss !== undefined && ossMap[oss] !== undefined) antworten['oss'] = ossMap[oss];

  // produkttyp ← p_produkttyp (Identitäts-Mapping der Optionswerte).
  const produkttyp = liste(w['p_produkttyp']);
  if (produkttyp.length > 0) antworten['produkttyp'] = produkttyp;

  const schritt = naechsterSchritt(regelwerk, antworten as Antworten);
  if (schritt.typ === 'frage') {
    // Die Engine braucht noch eine Eingabe, die im Interview fehlt.
    return {
      vorschlag: null,
      begruendungspfad: [],
      annahmen,
      fehlende_eingaben: [schritt.frage.id],
    };
  }

  const e = schritt.ergebnis;
  const begruendungspfad = e.begruendungspfad.map((ref) => ({
    regel_id: ref.regel_id,
    titel: ref.titel.de,
    begruendung: ref.begruendung.de,
  }));
  const vorschlag =
    e.geltungsbereich === 'in_scope'
      ? {
          geltungsbereich: 'in_scope' as const,
          kategorie: e.kategorie,
          sonderregime: e.sonderregime,
        }
      : { geltungsbereich: e.geltungsbereich };

  return { vorschlag, begruendungspfad, annahmen, fehlende_eingaben: [] };
}
