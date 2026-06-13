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
};
