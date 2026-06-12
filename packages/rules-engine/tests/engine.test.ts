import { describe, expect, it } from 'vitest';
import { bereinigeAntworten, naechsterSchritt, pflichtenFuer, regelwerk } from '../src/index';

describe('naechsterSchritt', () => {
  it('beginnt ohne Antworten mit der ersten Frage (rolle)', () => {
    const schritt = naechsterSchritt(regelwerk, {});
    expect(schritt.typ).toBe('frage');
    if (schritt.typ === 'frage') {
      expect(schritt.frage.id).toBe('rolle');
      expect(schritt.fortschritt.beantwortet).toBe(0);
      expect(schritt.fortschritt.gesamt).toBeGreaterThan(0);
    }
  });

  it('beendet den Fluss vorzeitig, sobald eine Terminal-Regel greift', () => {
    const schritt = naechsterSchritt(regelwerk, {
      rolle: 'hersteller',
      produktart: 'kein_digitales_produkt',
    });
    expect(schritt.typ).toBe('ergebnis');
    if (schritt.typ === 'ergebnis') {
      expect(schritt.ergebnis.geltungsbereich).toBe('ausserhalb');
      expect(schritt.ergebnis.pflichten).toEqual([]);
    }
  });
});

describe('bereinigeAntworten (ADR-007: Zurück-Navigation)', () => {
  it('verwirft Antworten auf unerreichbar gewordene Folgefragen', () => {
    const vorher = {
      rolle: 'hersteller',
      produktart: 'reine_dienstleistung',
      dienstleistung_fuer_produkt: 'ja',
      datenverbindung: 'ja',
    };
    // Antwort auf produktart geändert: dienstleistung_fuer_produkt wird unsichtbar
    // und fliegt raus; datenverbindung bleibt sichtbar und gültig.
    const nachher = bereinigeAntworten(regelwerk, { ...vorher, produktart: 'software_produkt' });
    expect(nachher).toEqual({
      rolle: 'hersteller',
      produktart: 'software_produkt',
      datenverbindung: 'ja',
    });
  });

  it('verwirft ungültige Optionswerte samt allem, was dahinter kommt', () => {
    const nachher = bereinigeAntworten(regelwerk, {
      rolle: 'hersteller',
      produktart: 'gibt_es_nicht',
      datenverbindung: 'ja',
    });
    expect(nachher).toEqual({ rolle: 'hersteller' });
  });

  it('behält nichts hinter einer greifenden Terminal-Regel', () => {
    const nachher = bereinigeAntworten(regelwerk, {
      rolle: 'hersteller',
      produktart: 'software_produkt',
      datenverbindung: 'nein',
      eu_markt: 'ja',
    });
    expect(nachher).toEqual({
      rolle: 'hersteller',
      produktart: 'software_produkt',
      datenverbindung: 'nein',
    });
  });
});

describe('pflichtenFuer', () => {
  it('filtert Konformitätsbewertungs-Pflichten nach Kategorie', () => {
    const standard = pflichtenFuer(regelwerk, 'hersteller', 'default').map((p) => p.id);
    const wichtig = pflichtenFuer(regelwerk, 'hersteller', 'wichtig_klasse_1').map((p) => p.id);
    expect(standard).toContain('p_konformitaet_default');
    expect(standard).not.toContain('p_konformitaet_wichtig');
    expect(wichtig).toContain('p_konformitaet_wichtig');
    expect(wichtig).not.toContain('p_konformitaet_default');
  });

  it('gibt Rollen-Pflichten ohne Kategorien-Einschränkung immer aus', () => {
    const importeur = pflichtenFuer(regelwerk, 'importeur', 'kritisch').map((p) => p.id);
    expect(importeur).toContain('p_imp_pruefung');
    expect(importeur).not.toContain('p_meldung_schwachstellen');
  });
});
