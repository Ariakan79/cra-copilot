<script lang="ts">
  import {
    LUECKE_EXISTIERT_NICHT,
    LUECKE_UNBEKANNT,
    type Feld,
  } from '@cra-copilot/aufnahme-katalog';

  let {
    feld,
    wert,
    onSpeichern,
  }: {
    feld: Feld;
    wert: string | string[] | undefined;
    onSpeichern: (wert: string | string[]) => void;
  } = $props();

  const istMehrfach = $derived(feld.typ === 'mehrfachauswahl');
  const aktuell = $derived(Array.isArray(wert) ? wert : wert === undefined ? [] : [wert]);

  function istLuecke(w: string | undefined): boolean {
    return w === LUECKE_UNBEKANNT || w === LUECKE_EXISTIERT_NICHT;
  }

  // Einmalige Vorbelegung aus dem gespeicherten Wert: App.svelte mountet die
  // Komponente pro Feld neu ({#each … (feld.id)}), daher kein $effect-Sync —
  // der würde via bind:value den Tipp-Wert zurücksetzen.
  // svelte-ignore state_referenced_locally
  let entwurf = $state<string>(typeof wert === 'string' && !istLuecke(wert) ? wert : '');
  // svelte-ignore state_referenced_locally
  let mehrfachAuswahl = $state<string[]>(Array.isArray(wert) ? [...wert] : []);
  const entwurfText = $derived(entwurf.trim());

  function umschalten(optWert: string) {
    mehrfachAuswahl = mehrfachAuswahl.includes(optWert)
      ? mehrfachAuswahl.filter((w) => w !== optWert)
      : [...mehrfachAuswahl, optWert];
  }

  const lueckeAktiv = $derived(typeof wert === 'string' && istLuecke(wert));
</script>

<div class="feld" data-feld-id={feld.id} data-ampel-relevant={feld.pflicht}>
  <p class="feld-frage">
    {feld.frage.de}{#if feld.pflicht}<span class="pflicht" title="Pflichtfeld">*</span>{/if}
  </p>
  {#if feld.erlaeuterung}<p class="feld-hint">{feld.erlaeuterung.de}</p>{/if}

  {#if feld.typ === 'einfachauswahl' || feld.typ === 'ja_nein'}
    {@const optionen =
      feld.typ === 'ja_nein'
        ? [
            { wert: 'ja', text: { de: 'Ja' } },
            { wert: 'nein', text: { de: 'Nein' } },
          ]
        : feld.optionen}
    <div class="optionen">
      {#each optionen as opt (opt.wert)}
        <button
          type="button"
          class="chip"
          class:aktiv={aktuell.includes(opt.wert)}
          onclick={() => onSpeichern(opt.wert)}
        >
          {opt.text.de}
        </button>
      {/each}
    </div>
  {:else if istMehrfach}
    <div class="optionen">
      {#each feld.optionen as opt (opt.wert)}
        <button
          type="button"
          class="chip"
          class:aktiv={mehrfachAuswahl.includes(opt.wert)}
          onclick={() => umschalten(opt.wert)}
        >
          {opt.text.de}
        </button>
      {/each}
    </div>
    <button type="button" class="primaer klein" onclick={() => onSpeichern(mehrfachAuswahl)}>
      Auswahl speichern
    </button>
  {:else}
    <div class="textzeile">
      <input
        type={feld.typ === 'datum' ? 'date' : 'text'}
        inputmode={feld.typ === 'zahl' ? 'numeric' : undefined}
        bind:value={entwurf}
        placeholder="Antwort…"
        onkeydown={(e) => {
          if (e.key === 'Enter' && entwurfText !== '') onSpeichern(entwurfText);
        }}
      />
      <button
        type="button"
        class="primaer klein"
        disabled={entwurfText === ''}
        onclick={() => onSpeichern(entwurfText)}>Speichern</button
      >
    </div>
  {/if}

  {#if feld.luecke_erlaubt}
    <div class="luecken">
      <button
        type="button"
        class="luecke"
        class:aktiv={wert === LUECKE_UNBEKANNT}
        onclick={() => onSpeichern(LUECKE_UNBEKANNT)}>unbekannt</button
      >
      <button
        type="button"
        class="luecke"
        class:aktiv={wert === LUECKE_EXISTIERT_NICHT}
        onclick={() => onSpeichern(LUECKE_EXISTIERT_NICHT)}>existiert nicht</button
      >
    </div>
  {/if}

  {#if wert !== undefined}
    <p class="gespeichert" data-testid="gespeichert">
      Erfasst: <strong
        >{lueckeAktiv
          ? wert === LUECKE_UNBEKANNT
            ? 'unbekannt'
            : 'existiert nicht'
          : aktuell.join(', ')}</strong
      >
    </p>
  {/if}
</div>
