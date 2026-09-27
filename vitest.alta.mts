import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * La configuracion del ACTA DE UN ALTA. No es la de la suite, y la diferencia
 * es la razon de que exista este archivo.
 *
 * `vitest.config.mts` tiene un `globalSetup` que SIEMBRA dos clinicas de
 * prueba y las BORRA EN CASCADA al terminar. Para la suite es lo correcto.
 * Para el acta seria inadmisible: se corre contra la base donde acaba de nacer
 * una clinica de verdad, que un dia sera produccion. Una comprobacion que
 * siembra clinicas de prueba y borra en cascada no se acerca a produccion.
 *
 * Asi que aqui: sin globalSetup, y con un `include` que solo coge los archivos
 * `*.comprobacion.ts` —que el `include` de la suite (`*.test.ts`) no toca—.
 * Las dos cosas a la vez: ni el acta siembra, ni `pnpm test` arrastra el acta.
 *
 *     pnpm alta:comprobar <slug>
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/alta/**/*.comprobacion.ts'],
    setupFiles: ['tests/configuracion.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
