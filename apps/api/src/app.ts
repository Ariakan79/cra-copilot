import { katalog } from '@cra-copilot/aufnahme-katalog';
import { and, desc, eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DB } from './db/client';
import {
  finding,
  ingestionToken,
  komponente,
  mandant,
  portalUser,
  produkt,
  sbomLieferung,
  sbomStream,
  type Quelle,
} from './db/schema';
import { hashPasswort, neuesToken, produktFuerToken, pruefePasswort } from './portal/auth';
import { ingest } from './portal/ingestion';
import { bewerteFindings, setzeFindingTriage } from './portal/findings';
import { heartbeat } from './portal/heartbeat';
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

  app.get('/mandanten/:id/produkte', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return db.select().from(produkt).where(eq(produkt.mandantId, id));
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

  // ================================================================= Portal

  // Ingestion-Token je Produkt erstellen (Klartext nur einmalig).
  app.post('/produkte/:id/ingestion-tokens', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ bezeichnung: z.string().optional() }).parse(req.body ?? {});
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    const { klartext, hash } = neuesToken();
    const [zeile] = await db
      .insert(ingestionToken)
      .values({ mandantId, produktId: id, tokenHash: hash, bezeichnung: body.bezeichnung ?? null })
      .returning({ id: ingestionToken.id });
    return reply.status(201).send({ id: zeile!.id, token: klartext });
  });

  app.get('/produkte/:id/ingestion-tokens', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return db
      .select({
        id: ingestionToken.id,
        bezeichnung: ingestionToken.bezeichnung,
        erstelltAm: ingestionToken.erstelltAm,
        widerrufenAm: ingestionToken.widerrufenAm,
      })
      .from(ingestionToken)
      .where(eq(ingestionToken.produktId, id));
  });

  app.delete('/ingestion-tokens/:tokenId', async (req, reply) => {
    const { tokenId } = z.object({ tokenId: z.string().uuid() }).parse(req.params);
    await db
      .update(ingestionToken)
      .set({ widerrufenAm: new Date() })
      .where(eq(ingestionToken.id, tokenId));
    return reply.status(204).send();
  });

  // SBOM-Upload per Ingestion-Token (CI-Kanal). Token im Authorization-Header.
  app.post('/ingest', async (req, reply) => {
    const auth = req.headers['authorization'];
    const klartext = typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : '';
    const produktId = klartext === '' ? undefined : await produktFuerToken(db, klartext);
    if (produktId === undefined)
      return reply.status(401).send({ fehler: 'Ungültiges Ingestion-Token' });
    const body = z
      .object({
        streamName: z.string().min(1),
        trigger: z.enum(['release', 'hotfix', 'dependency_change']).optional(),
        sbom: z.unknown(),
      })
      .parse(req.body);
    const ergebnis = await ingest(
      db,
      {
        produktId,
        streamName: body.streamName,
        kanal: 'api_token',
        trigger: body.trigger,
        roh: body.sbom,
      },
      bewerteFindings,
    );
    return reply.status(ergebnis.profilKonform ? 201 : 422).send(ergebnis);
  });

  // Manueller Upload (UI-Kanal), Produkt in der URL.
  app.post('/produkte/:id/ingest', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    const body = z
      .object({ streamName: z.string().min(1), trigger: z.string().optional(), sbom: z.unknown() })
      .parse(req.body);
    const ergebnis = await ingest(
      db,
      {
        produktId: id,
        streamName: body.streamName,
        kanal: 'manueller_upload',
        trigger: body.trigger,
        roh: body.sbom,
      },
      bewerteFindings,
    );
    return reply.status(ergebnis.profilKonform ? 201 : 422).send(ergebnis);
  });

  // Lieferstatus: jüngste Lieferungen + aktuelle Komponentenzahl je Stream.
  app.get('/produkte/:id/lieferungen', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const lieferungen = await db
      .select({
        id: sbomLieferung.id,
        streamName: sbomLieferung.streamName,
        format: sbomLieferung.format,
        kanal: sbomLieferung.kanal,
        profilKonform: sbomLieferung.profilKonform,
        validierung: sbomLieferung.validierung,
        eingegangenAm: sbomLieferung.eingegangenAm,
      })
      .from(sbomLieferung)
      .where(eq(sbomLieferung.produktId, id))
      .orderBy(desc(sbomLieferung.eingegangenAm))
      .limit(50);
    return lieferungen;
  });

  app.get('/produkte/:id/komponenten', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return db.select().from(komponente).where(eq(komponente.produktId, id));
  });

  app.get('/produkte/:id/heartbeat', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return heartbeat(db, id);
  });

  app.get('/produkte/:id/findings', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return db
      .select()
      .from(finding)
      .where(and(eq(finding.produktId, id), eq(finding.behobenDurchDaten, false)));
  });

  // Triage eines Findings (ADR-027): nur erlaubte Übergänge.
  app.patch('/findings/:findingId', async (req, reply) => {
    const { findingId } = z.object({ findingId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ status: z.enum(['neu', 'in_pruefung', 'bestaetigt', 'nicht_relevant', 'behoben']) })
      .parse(req.body);
    await setzeFindingTriage(db, findingId, body.status);
    return reply.status(204).send();
  });

  // Neubewertung anstoßen (z. B. nach OSV-Sync) — kontinuierlich gegen das
  // unveränderte SBOM (ADR-028).
  app.post('/produkte/:id/neubewertung', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const mandantId = await mandantVon(db, id);
    if (mandantId === undefined) return reply.status(404).send({ fehler: 'Produkt unbekannt' });
    await bewerteFindings(db, mandantId, id);
    return reply.status(204).send();
  });

  // Einfaches UI-Login (ADR-025). Self-hosted: ein Mandant pro Instanz.
  app.post('/portal/login', async (req, reply) => {
    const body = z
      .object({ benutzername: z.string().min(1), passwort: z.string().min(1) })
      .parse(req.body);
    const [user] = await db
      .select()
      .from(portalUser)
      .where(eq(portalUser.benutzername, body.benutzername));
    if (user === undefined || !pruefePasswort(body.passwort, user.passwortHash)) {
      return reply.status(401).send({ fehler: 'Anmeldung fehlgeschlagen' });
    }
    return { mandantId: user.mandantId, benutzername: user.benutzername };
  });

  // Portal-Nutzer anlegen (Setup; im Betrieb über ein Provisionierungsskript).
  app.post('/portal/users', async (req, reply) => {
    const body = z
      .object({
        mandantId: z.string().uuid(),
        benutzername: z.string().min(1),
        passwort: z.string().min(8),
      })
      .parse(req.body);
    const [zeile] = await db
      .insert(portalUser)
      .values({
        mandantId: body.mandantId,
        benutzername: body.benutzername,
        passwortHash: hashPasswort(body.passwort),
      })
      .returning({ id: portalUser.id });
    return reply.status(201).send({ id: zeile!.id });
  });

  return app;
}
