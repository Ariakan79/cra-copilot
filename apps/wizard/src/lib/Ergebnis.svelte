<script lang="ts">
  import { regelwerk, type Ergebnis, type Frist, type Pflicht } from '@cra-copilot/rules-engine';
  import { de } from '../locales/de';

  let {
    ergebnis,
    onNeustart,
    onZurueck,
  }: {
    ergebnis: Ergebnis;
    onNeustart: () => void;
    onZurueck: () => void;
  } = $props();

  const fristGruppen = $derived.by((): [Frist, Pflicht[]][] => {
    const reihenfolge: Frist[] = ['2026-09', '2027-12'];
    return reihenfolge
      .map((frist): [Frist, Pflicht[]] => [
        frist,
        ergebnis.pflichten.filter((p) => p.frist === frist),
      ])
      .filter(([, pflichten]) => pflichten.length > 0);
  });
</script>

<section class="karte" data-testid="ergebnis">
  <h1>{de.ergebnis.titel}</h1>

  <p class="verdikt" data-testid="geltungsbereich" data-wert={ergebnis.geltungsbereich}>
    {de.ergebnis.geltungsbereich[ergebnis.geltungsbereich]}
  </p>

  {#if ergebnis.sonderregime === 'os_steward'}
    <p class="kategorie-badge sonderregime" data-testid="sonderregime">
      {de.ergebnis.sonderregimeSteward}
    </p>
  {:else if ergebnis.kategorie !== undefined}
    <p
      class="kategorie-badge {ergebnis.kategorie}"
      data-testid="kategorie"
      data-wert={ergebnis.kategorie}
    >
      {de.ergebnis.kategorieLabel}: <strong>{de.kategorien[ergebnis.kategorie]}</strong>
    </p>
  {/if}

  <h2>{de.ergebnis.begruendungTitel}</h2>
  <ol class="begruendung" data-testid="begruendungspfad">
    {#each ergebnis.begruendungspfad as ref (ref.regel_id)}
      <li>
        <strong>{ref.titel.de}</strong>
        <p>{ref.begruendung.de}</p>
        <p class="referenz">
          {de.ergebnis.referenzPrefix}
          {ref.referenz.dokument}, {ref.referenz.stelle}
        </p>
      </li>
    {/each}
  </ol>

  <h2>{de.ergebnis.pflichtenTitel}</h2>
  {#if ergebnis.pflichten.length === 0}
    <p data-testid="keine-pflichten">{de.ergebnis.keinePflichten}</p>
  {:else}
    {#each fristGruppen as [frist, pflichten] (frist)}
      <h3 class="frist" data-testid="frist" data-wert={frist}>{de.fristen[frist]}</h3>
      <ul class="pflichten">
        {#each pflichten as pflicht (pflicht.id)}
          <li>
            <strong>{pflicht.titel.de}</strong>
            <p>{pflicht.beschreibung.de}</p>
            <p class="referenz">
              {de.ergebnis.referenzPrefix}
              {pflicht.referenz.dokument}, {pflicht.referenz.stelle}
            </p>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}

  <aside class="cta nicht-drucken">
    <p>{de.ergebnis.cta.text}</p>
    <a class="primaer knopf" href={de.ergebnis.cta.mailto}>{de.ergebnis.cta.knopf}</a>
  </aside>

  <div class="aktionen nicht-drucken">
    <button type="button" class="sekundaer" onclick={onZurueck}>{de.frage.zurueck}</button>
    <button type="button" class="sekundaer" onclick={() => window.print()}>
      {de.ergebnis.drucken}
    </button>
    <button type="button" class="sekundaer" onclick={onNeustart}>{de.ergebnis.neustart}</button>
  </div>

  <p class="stand">{de.ergebnis.stand(regelwerk.rules_version, regelwerk.stand)}</p>
  <p class="disclaimer-druck">{de.disclaimer}</p>
</section>
