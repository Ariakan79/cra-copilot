import type { Ampel } from '@cra-copilot/aufnahme-katalog';

/** Schmaler Client gegen die lokale Cockpit-API (über den Vite-Proxy /api). */

export interface Quelle {
  art: 'kundenaussage_aufnahmegespraech' | 'dokument' | 'zertifikat' | 'systempruefung';
  person: string;
  datum: string;
  gespraechsleiter: string;
}

export interface BlockStatus {
  blockId: string;
  nummer: number;
  ampel: Ampel;
}

export interface Gap {
  id: string;
  feldId: string;
  prioritaet: string;
  status: string;
  verantwortlich: string | null;
  frist: string | null;
}

export interface SbomProfil {
  produkt_id: string;
  konformitaetsziel: string | null;
  mindesttiefe: string | null;
  pflichtfelder: string[];
  streams: { name: string; format: string; tool: string; kanal: string }[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body: unknown) =>
  fetch(`/api${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const api = {
  async mandantAnlegen(name: string): Promise<{ id: string }> {
    return json(await post('/mandanten', { name }));
  },
  async produktAnlegen(mandantId: string, name: string): Promise<{ id: string }> {
    return json(await post(`/mandanten/${mandantId}/produkte`, { name }));
  },
  async evidenzProdukt(
    produktId: string,
    feldId: string,
    wert: string | string[],
    quelle: Quelle,
    anmerkung?: string,
  ): Promise<void> {
    await json(await post(`/produkte/${produktId}/evidenz`, { feldId, wert, quelle, anmerkung }));
  },
  async evidenzMandant(
    mandantId: string,
    feldId: string,
    wert: string | string[],
    quelle: Quelle,
    anmerkung?: string,
  ): Promise<void> {
    await json(await post(`/mandanten/${mandantId}/evidenz`, { feldId, wert, quelle, anmerkung }));
  },
  async werte(produktId: string): Promise<Record<string, string | string[]>> {
    return json(await fetch(`/api/produkte/${produktId}/werte`));
  },
  async blockstatus(produktId: string): Promise<BlockStatus[]> {
    return json(await fetch(`/api/produkte/${produktId}/blockstatus`));
  },
  async gaps(produktId: string): Promise<{ produkt: Gap[]; mandant: Gap[] }> {
    return json(await fetch(`/api/produkte/${produktId}/gaps`));
  },
  async sbomProfil(produktId: string): Promise<SbomProfil> {
    return json(await fetch(`/api/produkte/${produktId}/sbom-profil`));
  },
  sbomProfilYamlUrl: (produktId: string) => `/api/produkte/${produktId}/sbom-profil?format=yaml`,
  async workshopAbschluss(produktId: string): Promise<Record<string, unknown>> {
    return json(await post(`/produkte/${produktId}/workshop-abschluss`, {}));
  },
};
