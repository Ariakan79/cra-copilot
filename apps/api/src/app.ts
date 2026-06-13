import { katalog } from '@cra-copilot/aufnahme-katalog';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DB } from './db/client';
import { mandant, produkt, sbomStream, type Quelle } from './db/schema';
import {
  alleAktuellenWerte,
  setzeEvidenz,
  ValidierungsFehler,
  ZURUECK_AUF_DEFAULT,
} from './domain/evidenz';
import {
  aktualisiereGapMeta,
  blockStatusListe,
  gapsFuerProdukt,
  mandantGaps,
  setzeGapStatus,
  synchronisiereGaps,
} from './domain/gaps';
import { klassifizierungsvorschlag } from './domain/klassifizierung';
import { baueSbomProfil, sbomProfilAlsYaml } from './domain/sbom-profil';
import { markiereWorkshopDurchgefuehrt, workshopStatus } from './domain/workshop';

const QuelleSchema = z.object({
  art: z.enum(['kundenaussage_aufnahmegespraech', 'dokument', 'zertifikat', 'systempruefung']),
  person: z.string().min(1),
  datum: z.string().min(1),
  gespraechsleiter: z.string().min(1),
});

const EvidenzBody = z.object({
  produktId: z.string().uuid().nullish(),
  feldId: z.string().min(1),
  wert: z.union([z.string(), z.array(z.string())]),
  anmerkung: z.string().optional(),
  quelle: QuelleSchema,
});

async function mandantVon(db: DB, produktId: string): Promise<string | undefined> {
  const [zeile] = await db
    .select({ mandantId: produkt.mandantId })
    .from(produkt)
    .where(eq(produkt.id, produktId));
  return zeile?.mandantId;
}

export function buildApp(db: DB): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ValidierungsFehler) return reply.status(400).send({ fehler: err.message });
    if (err instanceof z.ZodError) return reply.status(400).send({ fehler: err.issues });
    const nachricht = err instanceof Error ? err.message : 'Unbekannter Fehler';
    reply.status(500).send({ fehler: nachricht });
  });

  app.get('/gesund', async () => ({ ok: true }));

  // Katalog für das Cockpit (read-only Stammdaten).
  app.get('/katalog', async () => katalog);

  app.post('/mandanten', async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    const [zeile] = await db.insert(mandant).values({ name: body.name }).returning();
    return reply.status(201).send(zeile);
  });

  app.post('/mandanten/:id/produkte', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    const [zeile] = await db.insert(produkt).values({ mandantId: id, name: body.name }).returning();
    return reply.status(201).send(zeile);
  });

  // Evidenz setzen (append-only; Supersession in der Domänenschicht).
  app.post('/produkte/:id/evidenz', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = EvidenzBody.parse(req.body);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    const knotenId = await setzeEvidenz(db, {
      mandantId,
      produktId: body.produktId === undefined ? id : body.produktId,
      feldId: body.feldId,
      wert: body.wert,
      anmerkung: body.anmerkung,
      quelle: body.quelle as Quelle,
    });
    await synchronisiereGaps(db, mandantId, id);
    return reply.status(201).send({ knotenId });
  });

  // Mandantenweite Evidenz (produktId NULL), z. B. Block 0/4/6-Defaults.
  app.post('/mandanten/:id/evidenz', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = EvidenzBody.parse(req.body);
    const knotenId = await setzeEvidenz(db, {
      mandantId: id,
      produktId: null,
      feldId: body.feldId,
      wert: body.wert,
      anmerkung: body.anmerkung,
      quelle: body.quelle as Quelle,
    });
    return reply.status(201).send({ knotenId });
  });

  app.get('/produkte/:id/werte', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    return alleAktuellenWerte(db, mandantId, id);
  });

  // Klassifizierungs-Vorschlag der Regel-Engine aus den Block-1-Daten (Block 2).
  app.get('/produkte/:id/klassifizierungsvorschlag', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    return klassifizierungsvorschlag(db, mandantId, id);
  });

  app.get('/produkte/:id/blockstatus', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    const werte = await alleAktuellenWerte(db, mandantId, id);
    return blockStatusListe(werte);
  });

  app.get('/produkte/:id/gaps', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    await synchronisiereGaps(db, mandantId, id);
    const produktGaps = await gapsFuerProdukt(db, mandantId, id);
    const orgGaps = await mandantGaps(db, mandantId);
    return { produkt: produktGaps, mandant: orgGaps };
  });

  app.patch('/gaps/:gapId', async (req, reply) => {
    const { gapId } = z.object({ gapId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        status: z.enum(['offen', 'in_arbeit', 'erledigt', 'verifiziert']).optional(),
        verantwortlich: z.string().optional(),
        frist: z.string().optional(),
      })
      .parse(req.body);
    if (body.verantwortlich !== undefined || body.frist !== undefined) {
      await aktualisiereGapMeta(db, gapId, {
        verantwortlich: body.verantwortlich,
        frist: body.frist,
      });
    }
    if (body.status !== undefined) await setzeGapStatus(db, gapId, body.status);
    return reply.status(204).send();
  });

  app.post('/produkte/:id/sbom-streams', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    const body = z
      .object({
        name: z.string().min(1),
        format: z.string().min(1),
        tool: z.string().min(1),
        ciJob: z.string().optional(),
        kanal: z.string().min(1),
        maxAgeHeartbeatTage: z.string().optional(),
      })
      .parse(req.body);
    const [zeile] = await db
      .insert(sbomStream)
      .values({ mandantId, produktId: id, ...body })
      .returning();
    return reply.status(201).send(zeile);
  });

  app.get('/produkte/:id/sbom-profil', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    const profil = await baueSbomProfil(db, mandantId, id);
    const alsYaml = z.object({ format: z.literal('yaml').optional() }).parse(req.query).format;
    if (alsYaml === 'yaml') {
      return reply
        .header('content-type', 'application/yaml; charset=utf-8')
        .send(sbomProfilAlsYaml(profil));
    }
    return profil;
  });

  app.post('/produkte/:id/workshop-abschluss', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    await markiereWorkshopDurchgefuehrt(db, mandantId, id);
    return workshopStatus(db, id);
  });

  app.get('/produkte/:id/bericht', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    await synchronisiereGaps(db, mandantId, id);
    const werte = await alleAktuellenWerte(db, mandantId, id);
    return {
      blockstatus: blockStatusListe(werte),
      gaps: await gapsFuerProdukt(db, mandantId, id),
      sbom_profil: await baueSbomProfil(db, mandantId, id),
      workshop: await workshopStatus(db, id),
    };
  });

  // Konstante als API-Hinweis: Override entfernen.
  app.get('/konstanten', async () => ({ zurueckAufDefault: ZURUECK_AUF_DEFAULT }));

  return app;
}
