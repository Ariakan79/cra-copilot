<script lang="ts">
  import type { Frage } from '@cra-copilot/rules-engine';
  import { de } from '../locales/de';

  let {
    frage,
    nummer,
    gesamt,
    aktuelleAntwort,
    onAntwort,
    onZurueck,
  }: {
    frage: Frage;
    nummer: number;
    gesamt: number;
    aktuelleAntwort: string | undefined;
    onAntwort: (wert: string) => void;
    onZurueck: () => void;
  } = $props();

  // Bewusst nur der Initialwert: App.svelte erzeugt die Komponente pro Frage
  // neu ({#key frage.id}), die Auswahl gehört danach der Nutzerin.
  // svelte-ignore state_referenced_locally
  let ausgewaehlt = $state<string | null>(aktuelleAntwort ?? null);

  function weiter(event: SubmitEvent) {
    event.preventDefault();
    if (ausgewaehlt !== null) onAntwort(ausgewaehlt);
  }
</script>

<section class="karte" data-testid="frage" data-frage-id={frage.id}>
  <p class="fortschritt-text">{de.frage.schrittVon(nummer, gesamt)}</p>
  <progress value={nummer - 1} max={gesamt} aria-hidden="true"></progress>

  <form onsubmit={weiter}>
    <fieldset>
      <legend>
        <h1>{frage.text.de}</h1>
      </legend>
      {#if frage.erlaeuterung}
        <p class="erlaeuterung">{frage.erlaeuterung.de}</p>
      {/if}

      <div class="optionen" role="radiogroup" aria-label={frage.text.de}>
        {#each frage.optionen as option (option.wert)}
          <label class="option" class:gewaehlt={ausgewaehlt === option.wert}>
            <input
              type="radio"
              name={frage.id}
              value={option.wert}
              checked={ausgewaehlt === option.wert}
              onchange={() => (ausgewaehlt = option.wert)}
            />
            <span>
              <span class="option-text">{option.text.de}</span>
              {#if option.erlaeuterung}
                <span class="option-erlaeuterung">{option.erlaeuterung.de}</span>
              {/if}
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="aktionen">
      <button type="button" class="sekundaer" onclick={onZurueck}>{de.frage.zurueck}</button>
      <button type="submit" class="primaer" disabled={ausgewaehlt === null}>
        {de.frage.weiter}
      </button>
    </div>
  </form>
</section>
