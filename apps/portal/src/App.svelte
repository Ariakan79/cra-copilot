<script lang="ts">
  import {
    api,
    type Entwurf,
    type Finding,
    type Lieferung,
    type Meldevorgang,
    type NutzerEntwurf,
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

  // Organisation & Nachweise
  let integ = $state<{ intakt: boolean; geprueft: number; kopfHash: string | null } | null>(null);
  let secTxt = $state('');
  let secMeldung = $state<string | null>(null);
  let erst = $state<{ mandantName: string; kopfHash: string | null; text: string } | null>(null);
  let erstId = $state<string | null>(null);
  let erstAktenzeichen = $state('');
  let erstBestaetigt = $state(false);
  let aktiverNutzer = $state<{ vorgangId: string; entwurf: NutzerEntwurf } | null>(null);

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
    await nachweiseLaden();
  }

  async function vorgaengeLaden() {
    vorgaenge = await api.meldevorgaenge(aktivesProdukt);
    const eintraege = await Promise.all(
      vorgaenge.map(async (v) => [v.id, await api.fristen(v.id)] as const),
    );
    fristenJeVorgang = Object.fromEntries(eintraege);
  }

  async function nachweiseLaden() {
    integ = await api.integritaet();
    secTxt = await api.securityTxtAktuell(mandantId);
  }

  async function secVeroeffentlichen() {
    fehler = null;
    try {
      await api.securityTxtVeroeffentlichen(mandantId);
      secMeldung = 'Veröffentlicht und in die Nachweis-Kette aufgenommen.';
      await nachweiseLaden();
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  async function erstErzeugen() {
    erst = await api.erstanschreibenEntwurf(mandantId, aktivesProdukt);
    erstId = null;
    erstBestaetigt = false;
  }

  async function erstVersenden() {
    fehler = null;
    try {
      const r = await api.erstanschreibenVersenden(mandantId, benutzername, aktivesProdukt);
      erstId = r.id;
      await nachweiseLaden();
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  async function erstBestaetigen() {
    if (erstId === null || erstAktenzeichen.trim() === '') return;
    fehler = null;
    try {
      await api.eingangsbestaetigung(erstId, erstAktenzeichen.trim());
      erstBestaetigt = true;
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
  }

  async function nutzerOeffnen(vorgangId: string) {
    aktiverNutzer = { vorgangId, entwurf: await api.nutzerEntwurf(vorgangId) };
  }

  async function nutzerVersenden() {
    if (aktiverNutzer === null) return;
    fehler = null;
    try {
      const inhalt = Object.fromEntries(aktiverNutzer.entwurf.felder.map((f) => [f.id, f.wert]));
      await api.nutzerVersenden(aktiverNutzer.vorgangId, inhalt, benutzername);
      aktiverNutzer = null;
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
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
              <div class="triage-knoepfe">
                <button
                  type="button"
                  class="klein"
                  data-testid={`nutzerinfo-${v.id}`}
                  onclick={() => nutzerOeffnen(v.id)}>Nutzerinfo (Art. 14 Abs. 8)</button
                >
              </div>
            </li>
          {/each}
          {#if vorgaenge.length === 0}<li class="leise">Kein offener Meldevorgang.</li>{/if}
        </ul>

        {#if aktiverNutzer}
          <div class="entwurf" data-testid="nutzer-entwurf">
            <h3>{aktiverNutzer.entwurf.titel}</h3>
            {#if aktiverNutzer.entwurf.hinweis}<p class="hinweis">
                {aktiverNutzer.entwurf.hinweis}
              </p>{/if}
            {#each aktiverNutzer.entwurf.felder as feld (feld.id)}
              <label
                >{feld.label}{#if feld.pflicht}<span class="pflicht">*</span>{/if}
                <input bind:value={feld.wert} data-testid={`nutzerfeld-${feld.id}`} /></label
              >
            {/each}
            <p class="leise">
              Information an betroffene Nutzer/Kunden über die Herstellerkanäle. Nach dem Versand
              unveränderlich und in der Nachweis-Kette.
            </p>
            <div class="triage-knoepfe">
              <button
                type="button"
                class="primaer klein"
                data-testid="nutzer-versenden"
                onclick={nutzerVersenden}>Als versendet markieren</button
              >
              <button type="button" class="klein" onclick={() => (aktiverNutzer = null)}
                >Abbrechen</button
              >
            </div>
          </div>
        {/if}

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
            <div class="anker" data-testid="anker">
              <strong>Integritäts-Anker</strong> — Kopf-Hash der Nachweis-Kette ({aktiverEntwurf
                .entwurf.integritaet.intakt
                ? 'Kette intakt'
                : '⚠ Kette gebrochen'},
              {aktiverEntwurf.entwurf.integritaet.geprueft} Einträge):
              <code>{aktiverEntwurf.entwurf.integritaet.kopfHash ?? '—'}</code>
              <span class="leise"
                >Geht mit der Meldung an die Behörde und wird so extern zeitlich bezeugt.</span
              >
            </div>
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

      <section class="block">
        <h2>Organisation &amp; Nachweise</h2>

        {#if integ}
          <p data-testid="integritaet">
            Nachweis-Kette:
            <span class="ampel {integ.intakt ? 'aktuell' : 'ueberfaellig'}"
              >{integ.intakt ? 'intakt' : 'GEBROCHEN'}</span
            >
            <span class="leise">{integ.geprueft} Einträge</span>
            {#if integ.kopfHash}<code class="kopf">{integ.kopfHash}</code>{/if}
          </p>
        {/if}

        <h3>security.txt (Art. 13 Abs. 6)</h3>
        <pre class="sectxt" data-testid="security-txt">{secTxt}</pre>
        <button
          type="button"
          class="sekundaer klein"
          data-testid="sec-veroeffentlichen"
          onclick={secVeroeffentlichen}>Veröffentlichen (verketten)</button
        >
        {#if secMeldung}<p class="ok" data-testid="sec-ok">{secMeldung}</p>{/if}

        <h3>Meldebereitschaft — BSI-Erstanschreiben</h3>
        <p class="leise">
          Freiwillige Mitteilung der Art-14-Reaktionsfähigkeit; verankert den Kopf-Hash der
          Nachweis-Kette. Keine CRA-Pflicht.
        </p>
        <button
          type="button"
          class="sekundaer klein"
          data-testid="erst-erzeugen"
          onclick={erstErzeugen}>Entwurf erzeugen</button
        >
        {#if erst}
          <pre class="sectxt" data-testid="erst-text">{erst.text}</pre>
          {#if erstId === null}
            <button
              type="button"
              class="primaer klein"
              data-testid="erst-versenden"
              onclick={erstVersenden}>Als versendet markieren</button
            >
          {:else}
            <p class="ok" data-testid="erst-versendet">Versendet &amp; verkettet.</p>
            {#if !erstBestaetigt}
              <label
                >Eingangsbestätigung (Aktenzeichen)
                <input bind:value={erstAktenzeichen} data-testid="erst-az" /></label
              >
              <button
                type="button"
                class="sekundaer klein"
                data-testid="erst-bestaetigen"
                onclick={erstBestaetigen}>Eingangsbestätigung erfassen</button
              >
            {:else}
              <p class="ok" data-testid="erst-bestaetigt">Eingangsbestätigung erfasst (Anker).</p>
            {/if}
          {/if}
        {/if}
      </section>
    </main>
  </div>
{/if}
