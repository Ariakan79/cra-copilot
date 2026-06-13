<script lang="ts">
  import { api, type Klassifizierungsvorschlag } from '../api';

  let {
    produktId,
    // Trigger: erhöht sich bei jeder Evidenzänderung, damit der Vorschlag neu lädt.
    version,
    onUebernehmen,
  }: {
    produktId: string;
    version: number;
    onUebernehmen: (kategorie: string, begruendung: string) => void;
  } = $props();

  let vorschlag = $state<Klassifizierungsvorschlag | null>(null);
  let geladen = $state(false);

  const kategorieText: Record<string, string> = {
    default: 'Standard',
    wichtig_klasse_1: 'Wichtig — Klasse I',
    wichtig_klasse_2: 'Wichtig — Klasse II',
    kritisch: 'Kritisch',
  };
  const bereichText: Record<string, string> = {
    ausserhalb: 'außerhalb des CRA',
    ausgenommen: 'ausgenommen (sektorales Regime)',
  };

  $effect(() => {
    // version + produktId als Abhängigkeiten: neu laden, wenn sich Evidenz ändert.
    void version;
    geladen = false;
    api.klassifizierungsvorschlag(produktId).then((v) => {
      vorschlag = v;
      geladen = true;
    });
  });

  const empfohleneKategorie = $derived(
    vorschlag?.vorschlag?.geltungsbereich === 'in_scope'
      ? (vorschlag.vorschlag.kategorie ?? null)
      : null,
  );
</script>

<section class="vorschlag" data-testid="klassifizierungsvorschlag">
  <h2>Vorschlag der Regel-Engine</h2>
  {#if !geladen}
    <p class="leise">Wird ermittelt…</p>
  {:else if vorschlag?.vorschlag === null}
    <p class="leise" data-testid="vorschlag-unvollstaendig">
      Noch kein Vorschlag möglich — fehlende Eingabe in Block 1:
      <strong>{vorschlag.fehlende_eingaben.join(', ')}</strong>
      (z. B. Produktgruppe).
    </p>
  {:else if vorschlag}
    {#if vorschlag.vorschlag.geltungsbereich === 'in_scope'}
      <p
        class="empfehlung"
        data-testid="vorschlag-kategorie"
        data-wert={empfohleneKategorie ?? 'default'}
      >
        Empfehlung:
        <strong
          >{vorschlag.vorschlag.sonderregime === 'os_steward'
            ? 'Sonderregime Open-Source-Steward'
            : kategorieText[empfohleneKategorie ?? 'default']}</strong
        >
      </p>
    {:else}
      <p
        class="empfehlung"
        data-testid="vorschlag-bereich"
        data-wert={vorschlag.vorschlag.geltungsbereich}
      >
        Empfehlung: <strong>{bereichText[vorschlag.vorschlag.geltungsbereich]}</strong>
      </p>
    {/if}

    {#if vorschlag.begruendungspfad.length > 0}
      <ul class="pfad">
        {#each vorschlag.begruendungspfad as ref (ref.regel_id)}
          <li><strong>{ref.titel}</strong> — {ref.begruendung}</li>
        {/each}
      </ul>
    {/if}

    {#if vorschlag.annahmen.length > 0}
      <details class="annahmen">
        <summary>Annahmen des Vorschlags ({vorschlag.annahmen.length})</summary>
        <ul>
          {#each vorschlag.annahmen as a, i (i)}<li>{a}</li>{/each}
        </ul>
      </details>
    {/if}

    {#if empfohleneKategorie !== null}
      <button
        type="button"
        class="primaer klein"
        data-testid="vorschlag-uebernehmen"
        onclick={() =>
          onUebernehmen(
            empfohleneKategorie,
            `Engine-Vorschlag übernommen: ${vorschlag!.begruendungspfad.map((r) => r.titel).join('; ')}`,
          )}
      >
        Vorschlag übernehmen
      </button>
    {/if}
    <p class="leise hinweis">
      Der Vorschlag ist unverbindlich — bestätige ihn oder überschreibe die Kategorie unten mit
      Begründung.
    </p>
  {/if}
</section>
