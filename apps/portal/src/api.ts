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
};
