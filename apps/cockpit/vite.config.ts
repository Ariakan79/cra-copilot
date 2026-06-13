import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Das Cockpit ist ein internes Werkzeug (ADR-014): es spricht die lokale API an.
// /api wird auf den API-Port gespiegelt (Default 3001, im E2E 3099).
const apiPort = process.env.API_PORT ?? '3001';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  server: {
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  preview: {
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
