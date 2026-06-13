<script lang="ts">
  import { katalog, type Block } from '@cra-copilot/aufnahme-katalog';
  import { api, type BlockStatus, type Gap, type Quelle, type SbomProfil } from './api';
  import Bericht from './lib/Bericht.svelte';
  import FeldEingabe from './lib/FeldEingabe.svelte';
  import Klassifizierungsvorschlag from './lib/Klassifizierungsvorschlag.svelte';

  type Phase = 'setup' | 'interview' | 'bericht';
  let phase = $state<Phase>('setup');

  // Setup-Eingaben
  let mandantName = $state('');
  let produktName = $state('');
  let gespraechsleiter = $state('');
  let person = $state('');
  let datum = $state(new Date().toISOString().slice(0, 10));

  let mandantId = $state('');
  let produktId = $state('');
  let werte = $state<Record<string, string | string[]>>({});
  let blockstatus = $state<BlockStatus[]>([]);
  let gaps = $state<Gap[]>([]);
  let aktiverBlockNr = $state(0);
  let profil = $state<SbomProfil | null>(null);
  let abschluss = $state<string | null>(null);
  let fehler = $state<string | null>(null);
  // Erhöht sich bei jeder Evidenzänderung → triggert Neuladen des Engine-Vorschlags.
  let evidenzVersion = $state(0);

  const quelle = $derived<Quelle>({
    art: 'kundenaussage_aufnahmegespraech',
    person,
    datum,
    gespraechsleiter,
  });

  const aktiverBlock = $derived<Block>(
    katalog.bloecke.find((b) => b.nummer === aktiverBlockNr) ?? katalog.bloecke[0]!,
  );
  const ampelVon = (nr: number) =>
    blockstatus.find((b) => b.nummer === nr)?.ampel ?? 'nicht_bearbeitet';
  const alleBearbeitet = $derived(
    blockstatus.length === katalog.bloecke.length &&
      blockstatus.every((b) => b.ampel !== 'nicht_bearbeitet'),
  );

  async function starten() {
    fehler = null;
    try {
      const m = await api.mandantAnlegen(mandantName);
      mandantId = m.id;
      const p = await api.produktAnlegen(mandantId, produktName);
      produktId = p.id;
      phase = 'interview';
      await aktualisieren();
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  async function aktualisieren() {
    [werte, blockstatus, gaps] = await Promise.all([
      api.werte(produktId),
      api.blockstatus(produktId),
      api.gaps(produktId).then((g) => g.produkt.concat(g.mandant)),
    ]);
    evidenzVersion += 1;
  }

  async function vorschlagUebernehmen(kategorie: string, begruendung: string) {
    await speichern('k_kategorie', 'produkt', kategorie);
    await speichern('k_kategorie_begruendung', 'produkt', begruendung);
  }

  async function speichern(feldId: string, ebene: string, wert: string | string[]) {
    fehler = null;
    try {
      if (ebene === 'produkt') {
        await api.evidenzProdukt(produktId, feldId, wert, quelle);
      } else {
        await api.evidenzMandant(mandantId, feldId, wert, quelle);
      }
      await aktualisieren();
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  async function berichtAnzeigen() {
    profil = await api.sbomProfil(produktId);
    await aktualisieren();
    phase = 'bericht';
  }

  async function workshopAbschliessen() {
    fehler = null;
    try {
      const status = await api.workshopAbschluss(produktId);
      abschluss = (status['workshop_durchgefuehrt'] as string | null) ?? null;
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<header class="kopf">
  <strong>CRA-Copilot · Aufnahme-Cockpit</strong>
  <span class="lokal">lokal · Single-User</span>
</header>

{#if fehler}<p class="fehler" data-testid="fehler">{fehler}</p>{/if}

{#if phase === 'setup'}
  <main class="karte">
    <h1>Neue Aufnahme</h1>
    <label>Mandant (Firmenname)<input bind:value={mandantName} data-testid="mandant" /></label>
    <label>Erstes Produkt<input bind:value={produktName} data-testid="produkt" /></label>
    <fieldset>
      <legend>Evidenzquelle (Aufnahmegespräch)</legend>
      <label
        >Gesprächsleiter<input
          bind:value={gespraechsleiter}
          data-testid="gespraechsleiter"
        /></label
      >
      <label>Auskunftsperson (Kunde)<input bind:value={person} data-testid="person" /></label>
      <label>Datum<input type="date" bind:value={datum} /></label>
    </fieldset>
    <button
      type="button"
      class="primaer"
      disabled={!mandantName || !produktName || !gespraechsleiter || !person}
      onclick={starten}
      data-testid="start">Aufnahme starten</button
    >
  </main>
{:else if phase === 'interview'}
  <div class="layout">
    <nav class="bloecke" data-testid="blockliste">
      {#each katalog.bloecke as block (block.id)}
        <button
          type="button"
          class="block-tab"
          class:aktiv={block.nummer === aktiverBlockNr}
          onclick={() => (aktiverBlockNr = block.nummer)}
        >
          <span class="ampelpunkt {ampelVon(block.nummer)}" data-testid={`ampel-${block.nummer}`}
          ></span>
          {block.nummer}. {block.titel.de}
        </button>
      {/each}
    </nav>

    <main class="inhalt">
      <h1>{aktiverBlock.nummer}. {aktiverBlock.titel.de}</h1>
      <p class="ziel">{aktiverBlock.ziel.de}</p>
      {#if aktiverBlockNr === 2}
        <Klassifizierungsvorschlag
          {produktId}
          version={evidenzVersion}
          onUebernehmen={vorschlagUebernehmen}
        />
      {/if}
      {#each aktiverBlock.felder as feld (feld.id)}
        <FeldEingabe
          {feld}
          wert={werte[feld.id]}
          onSpeichern={(w) => speichern(feld.id, feld.ebene, w)}
        />
      {/each}

      <div class="block-navi">
        <button
          type="button"
          class="sekundaer"
          disabled={aktiverBlockNr === 0}
          onclick={() => (aktiverBlockNr = Math.max(0, aktiverBlockNr - 1))}>Zurück</button
        >
        <button
          type="button"
          class="sekundaer"
          disabled={aktiverBlockNr === 8}
          onclick={() => (aktiverBlockNr = Math.min(8, aktiverBlockNr + 1))}>Weiter</button
        >
      </div>
    </main>

    <aside class="seitenleiste">
      <h2>Lücken ({gaps.length})</h2>
      <ul class="gap-liste" data-testid="gap-liste">
        {#each gaps as gap (gap.id)}
          <li><span class="prio {gap.prioritaet}">{gap.prioritaet}</span> {gap.feldId}</li>
        {/each}
      </ul>

      <button
        type="button"
        class="primaer voll"
        disabled={!alleBearbeitet}
        title={alleBearbeitet ? '' : 'Erst alle Blöcke bearbeiten'}
        onclick={workshopAbschliessen}
        data-testid="abschluss">Workshop abschließen</button
      >
      {#if abschluss}<p class="ok" data-testid="abschluss-ok">Workshop durchgeführt ✓</p>{/if}
      <a
        class="knopf-link"
        href={api.sbomProfilYamlUrl(produktId)}
        download
        data-testid="sbom-download">SBOM-Profil (YAML)</a
      >
      <button
        type="button"
        class="sekundaer voll"
        onclick={berichtAnzeigen}
        data-testid="zum-bericht">Bericht ansehen</button
      >
    </aside>
  </div>
{:else}
  <main class="karte">
    <Bericht {mandantName} {produktName} {blockstatus} {gaps} {profil} {abschluss} />
    <div class="block-navi nicht-drucken">
      <button type="button" class="sekundaer" onclick={() => (phase = 'interview')}
        >Zurück zur Aufnahme</button
      >
      <button type="button" class="sekundaer" onclick={() => window.print()}>Drucken / PDF</button>
    </div>
  </main>
{/if}
