import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testcontainers + echte DB: großzügige Timeouts, Dateien seriell
    // (jede Datei hat einen eigenen Container, kein paralleler Docker-Druck).
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
