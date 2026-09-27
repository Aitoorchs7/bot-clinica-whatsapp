/**
 * El alambre estatico del proxy.
 *
 * ESTO NO DEMUESTRA QUE EL PANEL ESTE PROTEGIDO. Que el archivo exista y se
 * llame como toca no dice nada sobre si Next lo ejecuta; de eso se encarga
 * `tests/e2e/01-proxy.spec.ts`, que pide `/panel` por HTTP a un servidor
 * levantado y exige la cabecera que solo pone proxy.ts.
 *
 * ESTE ES EL QUE CAZA EL RENOMBRADO, Y SE MIDIO
 *
 * En F5 se renombro `proxy.ts` a `middleware.ts` para verlo ponerse rojo. La
 * prueba de navegador NO se puso roja: en Next.js 16.3.5 el convenio viejo
 * esta deprecado pero SIGUE EJECUTANDOSE, con un aviso en el arranque. El que
 * se puso rojo —en cinco sitios— fue este archivo. Salida en ESTADO_F5 §5.1.
 *
 * Asi que esto no es un adorno del de navegador: hoy es el unico que distingue
 * «esta escrito con el convenio que va a durar» de «esta escrito con el que
 * Next va a retirar», y el dia que lo retire, el panel se quedaria sin
 * guardian sin romper ninguna compilacion. Ademas corre en cinco milisegundos,
 * sin navegador y sin base de datos, que es lo que hay en
 * `comprobaciones-estaticas` de CI.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const PROXY = join(RAIZ, 'src', 'proxy.ts')

describe('proxy.ts, NUNCA middleware.ts', () => {
  it('src/proxy.ts existe', () => {
    expect(existsSync(PROXY), 'Sin src/proxy.ts el panel se queda sin guardian').toBe(true)
  })

  it.each([
    'src/middleware.ts',
    'src/middleware.js',
    'middleware.ts',
    'middleware.js',
  ])('no hay ningun %s', (ruta) => {
    expect(
      existsSync(join(RAIZ, ruta)),
      `${ruta} existe. En Next.js 16 el convenio «middleware» esta DEPRECADO. En 16.3.5 ` +
        'todavia se ejecuta, con un aviso por delante, pero el dia que Next lo retire el ' +
        'guardian dejara de correr sin romper ninguna compilacion y sin poner roja ninguna ' +
        'prueba que mire solo la redireccion. El archivo bueno es src/proxy.ts.',
    ).toBe(false)
  })

  it('exporta una funcion `proxy`, que es el nombre que Next busca', () => {
    const fuente = readFileSync(PROXY, 'utf8')
    expect(fuente).toMatch(/export\s+(async\s+)?function\s+proxy\s*\(/)
  })

  it('protege /panel y deja fuera /api', () => {
    const fuente = readFileSync(PROXY, 'utf8')

    expect(fuente).toContain("'/panel'")
    // El webhook de Meta no se autentica con cookie sino con firma HMAC, y
    // vive bajo /api. Si el matcher lo cogiera, el canal entero se caeria.
    expect(fuente).toMatch(/matcher:\s*\[[^\]]*\(\?!api\b/)
  })

  it('pone su marca, que es lo que hace comprobable todo lo demas', () => {
    const fuente = readFileSync(PROXY, 'utf8')
    expect(fuente).toContain('x-panel-guardia')
  })
})
