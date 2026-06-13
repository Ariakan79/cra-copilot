<script lang="ts">
  import {
    api,
    type Entwurf,
    type Finding,
    type Lieferung,
    type Meldevorgang,
    type Produkt,
    type StreamHeartbeat,
    type StufenFrist,
  } from './api';

  let mandantId = $state('');
  let benutzername = $state('');
  let passwort = $state('');
  let fehler = $state<string | null>(null);

  let produkte = $state<Produkt[]>([]);
  let aktivesProdukt = $state<string>('');
  let heartbeat = $state<StreamHeartbeat[]>([]);
  let lieferungen = $state<Lieferung[]>([]);
  let findings = $state<Finding[]>([]);
  let neuesToken = $state<string | null>(null);
  let vorgaenge = $state<Meldevorgang[]>([]);
  let fristenJeVorgang = $state<Record<string, StufenFrist[]>>({});
  let aktiverEntwurf = $state<{ vorgangId: string; entwurf: Entwurf } | null>(null);

  const angemeldet = $derived(mandantId !== '');
  const triageNext: Record<string, string[]> = {
    neu: ['in_pruefung', 'nicht_relevant'],
    in_pruefung: ['bestaetigt', 'nicht_relevant'],
    bestaetigt: ['behoben', 'in_pruefung'],
    nicht_relevant: ['in_pruefung'],
    behoben: [],
  };

  async function anmelden() {
    fehler = null;
    try {
      const r = await api.login(benutzername, passwort);
      mandantId = r.mandantId;
      produkte = await api.produkte(mandantId);
      if (produkte[0]) await produktWaehlen(produkte[0].id);
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  async function produktWaehlen(id: string) {
    aktivesProdukt = id;
    [heartbeat, lieferungen, findings] = await Promise.all([
      api.heartbeat(id),
      api.lieferungen(id),
      api.findings(id),
    ]);
    await vorgaengeLaden();
  }

  async function vorgaengeLaden() {
    vorgaenge = await api.meldevorgaenge(aktivesProdukt);
    const eintraege = await Promise.all(
      vorgaenge.map(async (v) => [v.id, await api.fristen(v.id)] as const),
    );
    fristenJeVorgang = Object.fromEntries(eintraege);
  }

  async function triagieren(f: Finding, status: string) {
    await api.triage(f.id, status);
    findings = await api.findings(aktivesProdukt);
  }

  async function alsAktivAusgenutztMelden(f: Finding) {
    fehler = null;
    try {
      await api.meldenAusFinding(
        f.id,
        `Aktiv ausgenutzt: ${f.schwachstelleId}`,
        `Vom Bearbeiter als aktiv ausgenutzt eingestuft (${f.komponenteName ?? f.komponentePurl}).`,
        benutzername,
      );
      await vorgaengeLaden();
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  async function entwurfOeffnen(vorgangId: string, stufe: string) {
    aktiverEntwurf = { vorgangId, entwurf: await api.entwurf(vorgangId, stufe) };
  }

  async function entwurfEinreichen() {
    if (aktiverEntwurf === null) return;
    fehler = null;
    try {
      const inhalt = Object.fromEntries(aktiverEntwurf.entwurf.felder.map((f) => [f.id, f.wert]));
      await api.einreichen(
        aktiverEntwurf.vorgangId,
        aktiverEntwurf.entwurf.stufe,
        inhalt,
        benutzername,
      );
      aktiverEntwurf = null;
      await vorgaengeLaden();
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  const stufeText: Record<string, string> = {
    fruehwarnung: 'Frühwarnung (24h)',
    meldung: 'Meldung (72h)',
    abschluss: 'Abschlussbericht',
  };

  async function tokenErzeugen() {
    const r = await api.tokenErstellen(aktivesProdukt, 'CI-Upload');
    neuesToken = r.token;
  }

  const ampelText: Record<string, string> = {
    aktuell: 'aktuell',
    ueberfaellig: 'überfällig',
    keine_lieferung: 'keine Lieferung',
  };
</script>

<header class="kopf">
  <strong>CRA-Copilot · Kundenportal</strong>
  <span class="lokal">self-hosted</span>
</header>

{#if fehler}<p class="fehler" data-testid="fehler">{fehler}</p>{/if}

{#if !angemeldet}
  <main class="karte schmal">
    <h1>Anmeldung</h1>
    <label>Benutzername<input bind:value={benutzername} data-testid="benutzername" /></label>
    <label>Passwort<input type="password" bind:value={passwort} data-testid="passwort" /></label>
    <button
      type="button"
      class="primaer"
      disabled={!benutzername || !passwort}
      onclick={anmelden}
      data-testid="login">Anmelden</button
    >
  </main>
{:else}
  <div class="layout">
    <nav class="produkte" data-testid="produktliste">
      {#each produkte as p (p.id)}
        <button
          type="button"
          class="produkt-tab"
          class:aktiv={p.id === aktivesProdukt}
          onclick={() => produktWaehlen(p.id)}>{p.name}</button
        >
      {/each}
    </nav>

    <main class="inhalt">
      <section class="block">
        <h2>Heartbeat (Lieferdisziplin)</h2>
        <table data-testid="heartbeat">
          <tbody>
            {#each heartbeat as hb (hb.streamName)}
              <tr>
                <td>{hb.streamName}</td>
                <td><span class="ampel {hb.status}">{ampelText[hb.status]}</span></td>
                <td class="leise"
                  >{hb.alterTage === null ? '—' : `${hb.alterTage} T alt`}{hb.maxAgeTage
                    ? ` / max ${hb.maxAgeTage}`
                    : ''}</td
                >
              </tr>
            {/each}
            {#if heartbeat.length === 0}<tr><td class="leise">Keine Streams konfiguriert.</td></tr
              >{/if}
          </tbody>
        </table>
      </section>

      <section class="block">
        <h2>Findings ({findings.length})</h2>
        <ul class="findings" data-testid="findings">
          {#each findings as f (f.id)}
            <li>
              <div class="finding-kopf">
                <span class="schwere">{f.schweregrad ?? '—'}</span>
                <strong>{f.schwachstelleId}</strong>
                <span class="leise">{f.komponenteName ?? f.komponentePurl}</span>
                <span class="triage-status">{f.triageStatus}</span>
              </div>
              {#if f.exploitabilityHinweis}<p class="hinweis">
                  Exploitability: {f.exploitabilityHinweis}
                </p>{/if}
              <div class="triage-knoepfe">
                {#each triageNext[f.triageStatus] ?? [] as ziel (ziel)}
                  <button type="button" class="klein" onclick={() => triagieren(f, ziel)}
                    >→ {ziel}</button
                  >
                {/each}
                <button
                  type="button"
                  class="klein melden"
                  data-testid={`melden-${f.id}`}
                  title="Als aktiv ausgenutzt einstufen und Meldevorgang eröffnen (Art. 14)"
                  onclick={() => alsAktivAusgenutztMelden(f)}>⚠ aktiv ausgenutzt → melden</button
                >
              </div>
            </li>
          {/each}
          {#if findings.length === 0}<li class="leise" data-testid="keine-findings">
              Keine offenen Findings.
            </li>{/if}
        </ul>
      </section>

      <section class="block">
        <h2>Meldevorgänge (CRA Art. 14)</h2>
        <ul class="vorgaenge" data-testid="meldevorgaenge">
          {#each vorgaenge as v (v.id)}
            <li>
              <div class="finding-kopf">
                <strong>{v.titel}</strong>
                <span class="leise">{v.art}</span>
                <span class="triage-status">{v.status}</span>
              </div>
              <div class="stufen">
                {#each fristenJeVorgang[v.id] ?? [] as s (s.stufe)}
                  <div class="stufe" data-testid={`stufe-${v.id}-${s.stufe}`}>
                    <span>{stufeText[s.stufe]}</span>
                    {#if s.eingereichtAm}
                      <span class="ampel aktuell" data-testid={`eingereicht-${v.id}-${s.stufe}`}
                        >eingereicht</span
                      >
                    {:else if s.ueberfaellig}
                      <span class="ampel ueberfaellig">überfällig</span>
                    {:else if s.fristBis}
                      <span class="leise"
                        >Frist: {new Date(s.fristBis).toLocaleString('de-DE')}</span
                      >
                    {:else}
                      <span class="leise">—</span>
                    {/if}
                    {#if !s.eingereichtAm}
                      <button
                        type="button"
                        class="klein"
                        data-testid={`entwurf-${v.id}-${s.stufe}`}
                        onclick={() => entwurfOeffnen(v.id, s.stufe)}>Entwurf</button
                      >
                    {/if}
                  </div>
                {/each}
              </div>
            </li>
          {/each}
          {#if vorgaenge.length === 0}<li class="leise">Kein offener Meldevorgang.</li>{/if}
        </ul>

        {#if aktiverEntwurf}
          <div class="entwurf" data-testid="entwurf">
            <h3>{aktiverEntwurf.entwurf.titel}</h3>
            {#if aktiverEntwurf.entwurf.hinweis}<p class="hinweis">
                {aktiverEntwurf.entwurf.hinweis}
              </p>{/if}
            {#each aktiverEntwurf.entwurf.felder as feld (feld.id)}
              <label
                >{feld.label}{#if feld.pflicht}<span class="pflicht">*</span>{/if}
                <input bind:value={feld.wert} data-testid={`feld-${feld.id}`} /></label
              >
            {/each}
            <p class="leise">
              Entwurf zum Einreichen über das offizielle ENISA/CSIRT-Portal. Nach dem Einreichen ist
              die Stufe als Nachweis gesperrt.
            </p>
            <div class="triage-knoepfe">
              <button
                type="button"
                class="primaer klein"
                data-testid="einreichen"
                onclick={entwurfEinreichen}>Als eingereicht markieren</button
              >
              <button type="button" class="klein" onclick={() => (aktiverEntwurf = null)}
                >Abbrechen</button
              >
            </div>
          </div>
        {/if}
      </section>

      <section class="block">
        <h2>Letzte Lieferungen</h2>
        <ul class="lieferungen" data-testid="lieferungen">
          {#each lieferungen.slice(0, 8) as l (l.id)}
            <li>
              <span class="konform {l.profilKonform ? 'ja' : 'nein'}"
                >{l.profilKonform ? 'konform' : 'nicht konform'}</span
              >
              {l.streamName} · {l.format} · {l.kanal} · {new Date(l.eingegangenAm).toLocaleString(
                'de-DE',
              )}
              {#if !l.profilKonform && l.validierung}<span class="leise">
                  — {l.validierung.fehler.join('; ')}</span
                >{/if}
            </li>
          {/each}
          {#if lieferungen.length === 0}<li class="leise">Noch keine Lieferung.</li>{/if}
        </ul>
      </section>

      <section class="block nicht-kritisch">
        <h2>CI-Ingestion-Token</h2>
        <button
          type="button"
          class="sekundaer klein"
          onclick={tokenErzeugen}
          data-testid="token-erzeugen">Neues Token erzeugen</button
        >
        {#if neuesToken}
          <p class="token" data-testid="token">Einmalig sichtbar: <code>{neuesToken}</code></p>
        {/if}
      </section>
    </main>
  </div>
{/if}
