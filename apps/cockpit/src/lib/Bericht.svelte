<script lang="ts">
  import { katalog } from '@cra-copilot/aufnahme-katalog';
  import type { BlockStatus, Gap, SbomProfil } from '../api';

  let {
    mandantName,
    produktName,
    blockstatus,
    gaps,
    profil,
    abschluss,
  }: {
    mandantName: string;
    produktName: string;
    blockstatus: BlockStatus[];
    gaps: Gap[];
    profil: SbomProfil | null;
    abschluss: string | null;
  } = $props();

  const ampelText: Record<string, string> = {
    vollstaendig: 'vollständig',
    mit_luecken: 'mit Lücken',
    nicht_bearbeitet: 'nicht bearbeitet',
  };
  const blockTitel = (id: string) => katalog.bloecke.find((b) => b.id === id)?.titel.de ?? id;
  const prioReihenfolge = ['kritisch', 'hoch', 'mittel', 'niedrig'];
  const sortierteGaps = $derived(
    [...gaps].sort(
      (a, b) => prioReihenfolge.indexOf(a.prioritaet) - prioReihenfolge.indexOf(b.prioritaet),
    ),
  );
</script>

<section class="bericht" data-testid="bericht">
  <h1>Ergebnisbericht — Aufnahme</h1>
  <p class="meta">
    Mandant: <strong>{mandantName}</strong> · Produkt: <strong>{produktName}</strong>
  </p>
  {#if abschluss}
    <p class="abschluss" data-testid="abschluss-status">
      Workshop durchgeführt: {new Date(abschluss).toLocaleString('de-DE')}
    </p>
  {/if}

  <h2>Blockstatus</h2>
  <table class="ampel-tabelle">
    <tbody>
      {#each [...blockstatus].sort((a, b) => a.nummer - b.nummer) as bs (bs.blockId)}
        <tr>
          <td>Block {bs.nummer}</td>
          <td>{blockTitel(bs.blockId)}</td>
          <td class="ampel {bs.ampel}">{ampelText[bs.ampel]}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h2>Priorisierte Gap-Liste ({sortierteGaps.length})</h2>
  {#if sortierteGaps.length === 0}
    <p>Keine offenen Lücken.</p>
  {:else}
    <ul class="gaps">
      {#each sortierteGaps as gap (gap.id)}
        <li>
          <span class="prio {gap.prioritaet}">{gap.prioritaet}</span>
          {gap.feldId}
          <span class="gap-status"
            >— {gap.status}{gap.verantwortlich ? `, ${gap.verantwortlich}` : ''}{gap.frist
              ? `, Frist ${gap.frist}`
              : ''}</span
          >
        </li>
      {/each}
    </ul>
  {/if}

  {#if profil}
    <h2>SBOM-Profil</h2>
    <p>
      Konformitätsziel: {profil.konformitaetsziel ?? '—'} · Mindesttiefe: {profil.mindesttiefe ??
        '—'}
    </p>
    <p>
      Streams: {profil.streams.map((s) => `${s.name} (${s.format}, ${s.tool})`).join('; ') || '—'}
    </p>
  {/if}
</section>
