import type { Frist, Kategorie } from '@cra-copilot/rules-engine';

/**
 * UI-Texte des Wizards (ADR-004/ADR-011): typisierter Katalog, Zugriff nur über
 * Schlüssel. Fachtexte (Fragen, Regeln, Pflichten) kommen aus dem Regelwerk.
 */
export const de = {
  app: {
    titel: 'CRA-Betroffenheits-Check',
    untertitel: 'Betrifft der EU Cyber Resilience Act Ihr Produkt?',
  },
  datenschutz: {
    versprechen: 'Ihre Angaben verlassen Ihren Browser nicht.',
    details:
      'Dieser Check läuft vollständig in Ihrem Browser: keine Übertragung, keine Speicherung, keine Cookies, kein Tracking.',
  },
  disclaimer:
    'Dieser Check ist eine unverbindliche Ersteinschätzung und keine Rechtsberatung. Die Einstufung ersetzt keine fachliche und juristische Prüfung im Einzelfall.',
  start: {
    einleitung:
      'Der Cyber Resilience Act (CRA) verpflichtet Hersteller, Importeure und Händler von Software und vernetzbaren Geräten zu Cybersicherheit über den gesamten Produktlebenszyklus. In wenigen Fragen erhalten Sie eine Ersteinschätzung: Gilt der CRA für Ihr Produkt, in welche Kategorie fällt es, und welche Pflichten kommen wann auf Sie zu?',
    dauer: 'Dauer: unter 5 Minuten. Keine Anmeldung.',
    knopf: 'Check starten',
  },
  frage: {
    schrittVon: (nummer: number, gesamt: number) => `Frage ${nummer} von ${gesamt}`,
    weiter: 'Weiter',
    zurueck: 'Zurück',
  },
  ergebnis: {
    titel: 'Ihre Ersteinschätzung',
    geltungsbereich: {
      in_scope: 'Der CRA ist auf Ihr Produkt voraussichtlich anwendbar.',
      ausserhalb: 'Ihr Produkt fällt nach Ihren Angaben voraussichtlich nicht unter den CRA.',
      ausgenommen:
        'Ihr Produkt unterliegt einem eigenen sektoralen Regime — der CRA ist voraussichtlich nicht anwendbar.',
    },
    sonderregimeSteward:
      'Als Open-Source-Steward gilt für Sie ein erleichtertes Pflichtenregime nach Art. 24 CRA.',
    kategorieLabel: 'Kategorie',
    begruendungTitel: 'Begründung',
    pflichtenTitel: 'Ihre Pflichten im Überblick',
    referenzPrefix: 'Referenz:',
    bestandsproduktHinweis:
      'Hinweis: Für Produkte, die vor dem Geltungsbeginn in Verkehr gebracht wurden und danach nicht wesentlich geändert werden, gilt der CRA nur eingeschränkt. Diese Ersteinschätzung bezieht sich auf Produkte, die ab Dezember 2027 (weiterhin) angeboten werden.',
    keinePflichten:
      'Aus dieser Einstufung ergeben sich keine CRA-Pflichten. Beachten Sie: Bei Änderungen (EU-Markteintritt, Kommerzialisierung, neue Produktfunktionen) kann sich das ändern.',
    cta: {
      text: 'Sie möchten die Einschätzung absichern und einen konkreten Fahrplan zu SBOM, Dokumentation und Meldeprozessen?',
      knopf: 'Aufnahme-Gespräch anfragen',
      // TODO(Director): Zieladresse vor Produktivgang festlegen.
      mailto:
        'mailto:kontakt@example.de?subject=Anfrage%20CRA-Aufnahmegespr%C3%A4ch&body=Guten%20Tag%2C%0A%0Awir%20haben%20den%20CRA-Betroffenheits-Check%20durchgef%C3%BChrt%20und%20m%C3%B6chten%20ein%20Aufnahme-Gespr%C3%A4ch%20vereinbaren.',
    },
    drucken: 'Ergebnis drucken / als PDF speichern',
    neustart: 'Check neu beginnen',
    stand: (version: string, datum: string) => `Regelwerk ${version}, Stand ${datum}`,
  },
  kategorien: {
    default: 'Standardkategorie',
    wichtig_klasse_1: 'Wichtiges Produkt — Klasse I',
    wichtig_klasse_2: 'Wichtiges Produkt — Klasse II',
    kritisch: 'Kritisches Produkt',
  } satisfies Record<Kategorie, string>,
  fristen: {
    '2026-09': 'Ab September 2026 (Meldepflichten)',
    '2027-12': 'Ab Dezember 2027 (volle Anwendung)',
  } satisfies Record<Frist, string>,
} as const;
