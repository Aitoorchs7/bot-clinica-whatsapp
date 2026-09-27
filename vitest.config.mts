import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/configuracion.ts'],
    globalSetup: ['tests/siembra-global.ts'],
    // Los tests de RLS comparten una misma base sembrada: si corren en
    // paralelo se pisan las filas entre ellos y los fallos dejan de ser
    // reproducibles.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
