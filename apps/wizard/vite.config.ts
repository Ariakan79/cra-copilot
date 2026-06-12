import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  // Relative Pfade: der Build läuft auf beliebigem Webspace, auch in Unterordnern.
  base: './',
});
