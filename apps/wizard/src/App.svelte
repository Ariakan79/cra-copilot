<script lang="ts">
  import {
    bereinigeAntworten,
    istSichtbar,
    naechsterSchritt,
    regelwerk,
    type Antworten,
    type Frage as FrageTyp,
  } from '@cra-copilot/rules-engine';
  import Ergebnis from './lib/Ergebnis.svelte';
  import Frage from './lib/Frage.svelte';
  import Start from './lib/Start.svelte';
  import { de } from './locales/de';

  // ADR-007: Das Antwort-Objekt ist die einzige fachliche Wahrheit; alles andere
  // (aktuelle Frage, Fortschritt, Ergebnis) wird pro Render aus der Engine abgeleitet.
  let gestartet = $state(false);
  let antworten = $state<Antworten>({});
  // Reine Navigations-Anzeige für "Zurück": zeigt eine bereits beantwortete Frage
  // erneut an, ohne die Antwort anzutasten.
  let zurueckZu = $state<string | null>(null);

  const schritt = $derived(naechsterSchritt(regelwerk, antworten));
  const sichtbare = $derived(regelwerk.fragen.filter((f) => istSichtbar(f, antworten)));
  const beantworteteIds = $derived(
    sichtbare.filter((f) => antworten[f.id] !== undefined).map((f) => f.id),
  );

  const angezeigteFrage = $derived.by((): FrageTyp | null => {
    if (zurueckZu !== null) return regelwerk.fragen.find((f) => f.id === zurueckZu) ?? null;
    return schritt.typ === 'frage' ? schritt.frage : null;
  });

  const frageNummer = $derived(
    angezeigteFrage === null ? 0 : sichtbare.findIndex((f) => f.id === angezeigteFrage.id) + 1,
  );

  function beantworte(frageId: string, wert: string | string[]) {
    antworten = bereinigeAntworten(regelwerk, { ...antworten, [frageId]: wert });
    zurueckZu = null;
  }

  function zurueck() {
    const pos =
      zurueckZu === null ? beantworteteIds.length - 1 : beantworteteIds.indexOf(zurueckZu) - 1;
    const ziel = pos >= 0 ? beantworteteIds[pos] : undefined;
    if (ziel !== undefined) {
      zurueckZu = ziel;
    } else {
      zurueckZu = null;
      gestartet = false;
    }
  }

  function neustart() {
    antworten = {};
    zurueckZu = null;
    gestartet = false;
  }
</script>

<header class="kopf">
  <p class="marke">{de.app.titel}</p>
  <p class="versprechen" title={de.datenschutz.details}>{de.datenschutz.versprechen}</p>
</header>

<main>
  {#if !gestartet}
    <Start onStart={() => (gestartet = true)} />
  {:else if angezeigteFrage !== null}
    {#key angezeigteFrage.id}
      <Frage
        frage={angezeigteFrage}
        nummer={frageNummer}
        gesamt={sichtbare.length}
        aktuelleAntwort={antworten[angezeigteFrage.id]}
        onAntwort={(wert) => beantworte(angezeigteFrage.id, wert)}
        onZurueck={zurueck}
      />
    {/key}
  {:else if schritt.typ === 'ergebnis'}
    <Ergebnis ergebnis={schritt.ergebnis} onNeustart={neustart} onZurueck={zurueck} />
  {/if}
</main>

<footer class="fuss">
  <p>{de.disclaimer}</p>
</footer>
