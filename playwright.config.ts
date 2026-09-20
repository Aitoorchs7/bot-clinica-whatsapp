import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright entra en juego en F5.
 *
 * Esta en el stack desde F0 y no lo habia usado ninguna fase, porque hasta
 * ahora no habia nada que solo se pudiera comprobar con un navegador de verdad.
 * F5 trae dos cosas asi:
 *
 *   1. QUE `proxy.ts` PROTEGE EL PANEL. No hay forma de comprobarlo leyendo
 *      codigo ni llamando a una funcion: el archivo lo lee Next al arrancar, y
 *      si se llamara `middleware.ts` se ignoraria EN SILENCIO. Solo se ve
 *      pidiendo `/panel` por HTTP a un servidor levantado.
 *   2. QUE EL INTERRUPTOR LLEGA HASTA EL MODELO. Se pulsa en la pantalla y se
 *      comprueba, con el cliente del bot, que la fila deja de entrar en el
 *      prompt. De punta a punta, desde la mano de la clinica.
 *
 * SE COMPILA Y SE ARRANCA, NO SE USA `next dev`
 *
 * Lo que se prueba aqui es el artefacto que se publica. `next dev` compila a
 * demanda y es mas rapido de arrancar, pero entonces la prueba diria que el
 * panel esta protegido «en desarrollo», que es exactamente el matiz que no se
 * puede permitir una prueba de autenticacion.
 *
 * UNA SOLA TIRADA A LA VEZ CONTRA LA BASE DE DESARROLLO
 *
 * La regla de ESTADO_F3 §5.4 ahora vale tambien para esto: Playwright siembra
 * y limpia el MISMO fixture que Vitest. Lanzar `pnpm test` y `pnpm test:e2e` a
 * la vez hace que el que acabe primero le borre las clinicas al otro.
 */
const PUERTO = Number(process.env.PUERTO_E2E ?? 3210)
const BASE = `http://127.0.0.1:${PUERTO}`

export default defineConfig({
  testDir: './tests/e2e',
  // Los ficheros de Vitest son `*.test.ts` y los de aqui `*.spec.ts`. No es
  // cosmetico: asi `pnpm test` no intenta correr estos, que necesitan un
  // servidor levantado.
  testMatch: /.*\.spec\.ts/,

  // Nada en paralelo: todas las pruebas comparten una base sembrada, igual que
  // en Vitest (`fileParallelism: false`). Dos a la vez se pisan las filas y los
  // fallos dejan de ser reproducibles, que es como se pierde el criterio de
  // «el mismo numero dos veces seguidas».
  fullyParallel: false,
  workers: 1,

  // Cero reintentos, tambien en CI. Un reintento convierte una prueba de
  // seguridad inestable en una prueba de seguridad verde, y eso es peor que
  // una roja.
  retries: 0,

  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  globalSetup: './tests/e2e/siembra-e2e.ts',
  globalTeardown: './tests/e2e/limpieza-e2e.ts',

  use: {
    baseURL: BASE,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PUERTO}`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
