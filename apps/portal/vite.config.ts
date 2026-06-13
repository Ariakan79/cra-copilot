import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Portal (ADR-023): spricht die geteilte API über den Proxy /api an.
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
