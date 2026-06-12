<script lang="ts">
  import { de } from '../locales/de';

  let { onStart }: { onStart: () => void } = $props();
</script>

<section class="karte" data-testid="start">
  <h1>{de.app.untertitel}</h1>
  <p>{de.start.einleitung}</p>
  <p class="hinweis">{de.start.dauer}</p>
  <aside class="datenschutz-box">
    <p><strong>{de.datenschutz.versprechen}</strong></p>
    <p>{de.datenschutz.details}</p>
  </aside>
  <button type="button" class="primaer" onclick={onStart}>{de.start.knopf}</button>
</section>
