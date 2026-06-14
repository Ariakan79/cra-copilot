/** Portal-Client gegen die geteilte API (ADR-023), über den Vite-Proxy /api. */

export interface Produkt {
  id: string;
  name: string;
}
export interface StreamHeartbeat {
  streamName: string;
  maxAgeTage: number | null;
  letzteLieferung: string | null;
  alterTage: number | null;
  status: 'aktuell' | 'ueberfaellig' | 'keine_lieferung';
}
export interface Lieferung {
  id: string;
  streamName: string;
  format: string;
  kanal: string;
  profilKonform: boolean;
  validierung: { fehler: string[] } | null;
  eingegangenAm: string;
}
export interface Finding {
  id: string;
  komponentePurl: string | null;
  komponenteName: string | null;
  schwachstelleId: string;
  schweregrad: string | null;
  triageStatus: string;
  exploitabilityHinweis: string | null;
}

export interface Meldevorgang {
  id: string;
  art: 'schwachstelle' | 'vorfall';
  titel: string;
  status: string;
  eroeffnetVon: string;
  eroeffnetAm: string;
}
export interface StufenFrist {
  stufe: 'fruehwarnung' | 'meldung' | 'abschluss';
  fristBis: string | null;
  ueberfaellig: boolean;
  eingereichtAm: string | null;
}
export interface EntwurfFeld {
  id: string;
  label: string;
  pflicht: boolean;
  wert: string;
}
export interface Entwurf {
  stufe: string;
  art: string;
  titel: string;
  hinweis: string | null;
  felder: EntwurfFeld[];
  integritaet: { kopfHash: string | null; intakt: boolean; geprueft: number };
}

export interface NutzerEntwurf {
  vorgangId: string;
  art: string;
  titel: string;
  hinweis: string | null;
  versendet: boolean;
  felder: EntwurfFeld[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
const post = (url: string, body: unknown) =>
  fetch(`/api${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const api = {
  async login(benutzername: string, passwort: string): Promise<{ mandantId: string }> {
    return json(await post('/portal/login', { benutzername, passwort }));
  },
  async produkte(mandantId: string): Promise<Produkt[]> {
    return json(await fetch(`/api/mandanten/${mandantId}/produkte`));
  },
  async heartbeat(produktId: string): Promise<StreamHeartbeat[]> {
    return json(await fetch(`/api/produkte/${produktId}/heartbeat`));
  },
  async lieferungen(produktId: string): Promise<Lieferung[]> {
    return json(await fetch(`/api/produkte/${produktId}/lieferungen`));
  },
  async findings(produktId: string): Promise<Finding[]> {
    return json(await fetch(`/api/produkte/${produktId}/findings`));
  },
  async triage(findingId: string, status: string): Promise<void> {
    const res = await fetch(`/api/findings/${findingId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(await res.text());
  },
  async tokenErstellen(produktId: string, bezeichnung: string): Promise<{ token: string }> {
    return json(await post(`/produkte/${produktId}/ingestion-tokens`, { bezeichnung }));
  },
  async meldenAusFinding(
    findingId: string,
    titel: string,
    begruendung: string,
    eroeffnetVon: string,
  ): Promise<{ id: string }> {
    return json(
      await post(`/findings/${findingId}/meldevorgang`, { titel, begruendung, eroeffnetVon }),
    );
  },
  async meldevorgaenge(produktId: string): Promise<Meldevorgang[]> {
    return json(await fetch(`/api/produkte/${produktId}/meldevorgaenge`));
  },
  async fristen(vorgangId: string): Promise<StufenFrist[]> {
    return json(await fetch(`/api/meldevorgaenge/${vorgangId}/fristen`));
  },
  async entwurf(vorgangId: string, stufe: string): Promise<Entwurf> {
    return json(await fetch(`/api/meldevorgaenge/${vorgangId}/entwurf/${stufe}`));
  },
  async einreichen(
    vorgangId: string,
    stufe: string,
    inhalt: Record<string, string>,
    eingereichtVon: string,
  ): Promise<void> {
    const res = await post(`/meldevorgaenge/${vorgangId}/einreichen/${stufe}`, {
      inhalt,
      eingereichtVon,
    });
    if (!res.ok) throw new Error(await res.text());
  },

  // --- Integrität / Nachweise -------------------------------------------------
  async integritaet(): Promise<{ intakt: boolean; geprueft: number; kopfHash: string | null }> {
    return json(await fetch('/api/integritaet'));
  },
  async securityTxtAktuell(mandantId: string): Promise<string> {
    const res = await fetch(`/api/mandanten/${mandantId}/security.txt`);
    return res.text();
  },
  async securityTxtVeroeffentlichen(mandantId: string): Promise<{ vorhanden: boolean }> {
    return json(await post(`/mandanten/${mandantId}/security-txt/veroeffentlichen`, {}));
  },

  // --- Erstanschreiben (Meldebereitschaft) -----------------------------------
  async erstanschreibenEntwurf(
    mandantId: string,
    produktId: string,
  ): Promise<{ mandantName: string; kopfHash: string | null; text: string }> {
    return json(
      await fetch(`/api/mandanten/${mandantId}/erstanschreiben-entwurf?produktId=${produktId}`),
    );
  },
  async erstanschreibenVersenden(
    mandantId: string,
    versendetVon: string,
    produktId: string,
  ): Promise<{ id: string; kopfHash: string | null }> {
    return json(
      await post(`/mandanten/${mandantId}/erstanschreiben/versenden`, { versendetVon, produktId }),
    );
  },
  async eingangsbestaetigung(anschreibenId: string, aktenzeichen: string): Promise<void> {
    const res = await fetch(`/api/erstanschreiben/${anschreibenId}/eingangsbestaetigung`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aktenzeichen }),
    });
    if (!res.ok) throw new Error(await res.text());
  },

  // --- Nutzerbenachrichtigung -------------------------------------------------
  async nutzerEntwurf(vorgangId: string): Promise<NutzerEntwurf> {
    return json(await fetch(`/api/meldevorgaenge/${vorgangId}/nutzer-entwurf`));
  },
  async nutzerVersenden(
    vorgangId: string,
    inhalt: Record<string, string>,
    versendetVon: string,
  ): Promise<void> {
    const res = await post(`/meldevorgaenge/${vorgangId}/nutzer-benachrichtigung/versenden`, {
      inhalt,
      versendetVon,
    });
    if (!res.ok) throw new Error(await res.text());
  },
};
