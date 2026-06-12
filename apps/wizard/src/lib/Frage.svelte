<script lang="ts">
  import type { AntwortWert, Frage } from '@cra-copilot/rules-engine';
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
    aktuelleAntwort: AntwortWert | undefined;
    onAntwort: (wert: string | string[]) => void;
    onZurueck: () => void;
  } = $props();

  // Initialwert genügt: Komponente wird pro Frage neu erzeugt ({#key} in App.svelte).
  // svelte-ignore state_referenced_locally
  const mehrfach = frage.typ === 'mehrfachauswahl';

  // Bewusst nur der Initialwert: App.svelte erzeugt die Komponente pro Frage
  // neu ({#key frage.id}), die Auswahl gehört danach der Nutzerin.
  // svelte-ignore state_referenced_locally
  let ausgewaehlt = $state<string[]>(
    aktuelleAntwort === undefined
      ? []
      : typeof aktuelleAntwort === 'string'
        ? [aktuelleAntwort]
        : [...aktuelleAntwort],
  );

  function istGewaehlt(wert: string): boolean {
    return ausgewaehlt.includes(wert);
  }

  function waehle(wert: string) {
    if (!mehrfach) {
      ausgewaehlt = [wert];
      return;
    }
    const option = frage.optionen.find((o) => o.wert === wert);
    if (istGewaehlt(wert)) {
      ausgewaehlt = ausgewaehlt.filter((w) => w !== wert);
    } else if (option?.exklusiv === true) {
      // "Keine davon" verdrängt alles andere …
      ausgewaehlt = [wert];
    } else {
      // … und wird selbst verdrängt, sobald eine echte Gruppe gewählt wird.
      ausgewaehlt = [
        ...ausgewaehlt.filter((w) => frage.optionen.find((o) => o.wert === w)?.exklusiv !== true),
        wert,
      ];
    }
  }

  function weiter(event: SubmitEvent) {
    event.preventDefault();
    if (ausgewaehlt.length === 0) return;
    const erster = ausgewaehlt[0];
    if (erster === undefined) return;
    onAntwort(mehrfach ? ausgewaehlt : erster);
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
      {#if mehrfach}
        <p class="erlaeuterung mehrfach-hinweis">{de.frage.mehrfachHinweis}</p>
      {/if}

      <div class="optionen" role={mehrfach ? 'group' : 'radiogroup'} aria-label={frage.text.de}>
        {#each frage.optionen as option (option.wert)}
          <label class="option" class:gewaehlt={istGewaehlt(option.wert)}>
            <input
              type={mehrfach ? 'checkbox' : 'radio'}
              name={frage.id}
              value={option.wert}
              checked={istGewaehlt(option.wert)}
              onchange={() => waehle(option.wert)}
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
      <button type="submit" class="primaer" disabled={ausgewaehlt.length === 0}>
        {de.frage.weiter}
      </button>
    </div>
  </form>
</section>
