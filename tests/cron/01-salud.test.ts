/**
 * `/api/cron/salud`: un 404 del modelo NO es un fallo de red.
 *
 * ===================== QUE COMPRUEBA ESTE ARCHIVO =====================
 *
 * Que la ruta distingue dos cosas que se parecen en el codigo y no se parecen
 * en nada en la realidad:
 *
 *   404 «no longer available to new users» -> el bot esta MUERTO y seguira
 *        muerto manana. Hay que cambiar `gemini.ts` y volver a publicar.
 *   fallo de red / 503 -> en cinco minutos vuelve solo.
 *
 * Pasó de verdad el 18/09/2026 con `gemini-2.5-flash` (ESTADO_F3 §7.1). Lo cazo
 * `tests/bot-contrato`, que solo corre a mano con GEMINI_VIVO=1. En produccion
 * no hay nadie corriendo esa suite.
 *
 * ================== DONDE SE PINCHA, QUE ES LO QUE DECIDE ==================
 *
 * En `globalThis.fetch`, que es la ultima linea antes del HTTP: el SDK de
 * Google llama al fetch global (verificado en `@google/genai` 2.22.0). Asi
 * corre DE VERDAD todo lo de nuestro lado —`modeloDeGoogle()`, el manejo de
 * errores del propio SDK y la clasificacion de la ruta— y lo unico inventado es
 * el cuerpo que devolvio Google. Es la regla de ESTADO_F3 §1: un doble que
 * sustituyera a `modeloDeGoogle` comprobaria el doble, no la ruta.
 *
 * Por eso el 404 se escribe como Google lo manda, con su envoltorio y su
 * mensaje literal. Un `{ error: 404 }` inventado probaria que sabemos leer
 * nuestro propio invento.
 *
 * ================== LA QUE IMPORTA ES «SON DISTINTAS» ==================
 *
 * Cada caso por separado pasa tambien con un `try { ... } catch { caido }`, que
 * es como se escribe esto la primera vez. Lo que ese codigo NO puede pasar es
 * la prueba que compara las dos respuestas. Comprobado: con la version ingenua,
 * esa prueba y las dos del HTTP se ponen rojas.
 *
 * No hace falta base de datos ni red: corre en `comprobaciones-estaticas`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MODELO_CEREBRO, MODELO_CLASIFICADOR, olvidarCliente } from '@/lib/bot/gemini'

const SECRETO = 'cron-secreto-de-prueba'

/** Lo que `after()` recibio. La ruta no puede gritar durante la respuesta. */
const deberes: (() => unknown)[] = []

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    deberes.push(fn)
  },
}))

const { GET } = await import('@/app/api/cron/salud/route')

// ---------------------------------------------------------------------------
// Las respuestas de Google, como las manda Google
// ---------------------------------------------------------------------------

/**
 * El 404 literal del 18/09/2026, con el envoltorio `{ error: { ... } }` que usa
 * la API y el `content-type` que hace que el SDK lo lea como JSON.
 */
function respuesta404(modelo: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 404,
        message:
          `This model models/${modelo} is no longer available to new users. ` +
          'Please update your code to use models/gemini-3.6-flash',
        status: 'NOT_FOUND',
      },
    }),
    { status: 404, headers: { 'content-type': 'application/json' } },
  )
}

function respuestaOk(): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: 'pong' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** Un fallo de RED: `fetch` lanza. No hay respuesta, no hay status. */
function fallaLaRed(): never {
  throw new TypeError('fetch failed')
}

function pedirSalud(cabeceras: Record<string, string> = { authorization: `Bearer ${SECRETO}` }) {
  return GET(new Request('https://ejemplo.test/api/cron/salud', { headers: cabeceras }))
}

// ---------------------------------------------------------------------------

let peticiones: number

beforeEach(() => {
  peticiones = 0
  deberes.length = 0
  olvidarCliente()
  vi.stubEnv('CRON_SECRET', SECRETO)
  // La clave nunca se usa —el fetch esta pinchado— pero `gemini.ts` se niega a
  // construir el cliente sin ella, y con razon.
  vi.stubEnv('GOOGLE_AI_API_KEY', 'clave-de-prueba')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  olvidarCliente()
})

/** Pincha el fetch global y cuenta las peticiones que habria hecho. */
function conFetch(responder: (url: string) => Response | never) {
  vi.stubGlobal('fetch', (entrada: unknown) => {
    peticiones += 1
    const url = typeof entrada === 'string' ? entrada : String((entrada as Request).url ?? entrada)
    return Promise.resolve(responder(url))
  })
}

describe('un 404 del modelo se detecta, y no se confunde con un fallo de red', () => {
  it('EL CASO: el modelo devuelve 404 y la ruta lo llama por su nombre', async () => {
    conFetch(() => respuesta404(MODELO_CEREBRO))

    const respuesta = await pedirSalud()
    const cuerpo = (await respuesta.json()) as {
      estado: string
      modelos: { id: string; clase: string; http: number | null; detalle?: string }[]
    }

    // No es «caido»: es retirado, que es lo que decide si alguien tiene que
    // levantarse a cambiar codigo o puede esperar a manana.
    expect(cuerpo.estado).toBe('retirado')

    const cerebro = cuerpo.modelos.find((m) => m.id === MODELO_CEREBRO)!
    expect(cerebro.clase).toBe('retirado')

    // El codigo HTTP tiene que llegar hasta aqui. Si se perdiera por el camino,
    // 404 y 503 acabarian siendo la misma linea en el registro.
    expect(cerebro.http).toBe(404)

    // Y el modelo se nombra: quien lee la alarma a las tres de la manana tiene
    // que saber QUE cadena cambiar en gemini.ts.
    expect(cerebro.id).toBe(MODELO_CEREBRO)
    expect(cerebro.detalle).toContain('no longer available to new users')
  })

  it('un 404 responde 500: esto no se arregla esperando', async () => {
    conFetch(() => respuesta404(MODELO_CEREBRO))
    expect((await pedirSalud()).status).toBe(500)
  })

  it('un fallo de RED responde 503 y dice inestable', async () => {
    conFetch(fallaLaRed)

    const respuesta = await pedirSalud()
    const cuerpo = (await respuesta.json()) as { estado: string; modelos: { http: number | null }[] }

    expect(respuesta.status).toBe(503)
    expect(cuerpo.estado).toBe('inestable')
    // No hubo respuesta, asi que no hay codigo. `null` y `404` son la
    // diferencia entre «no se pudo preguntar» y «preguntamos y ya no existe».
    expect(cuerpo.modelos[0]!.http).toBeNull()
  })

  it('LA QUE MANDA: las dos respuestas NO son iguales', async () => {
    // Las tres de arriba pasan tambien con un `try { ... } catch { caido }`,
    // que es como se escribe esto la primera vez y que mete el 404 y el DNS en
    // el mismo saco. Esta es la unica que ese codigo no puede pasar.
    conFetch(() => respuesta404(MODELO_CEREBRO))
    const porElCuatrocientosCuatro = await pedirSalud()
    const cuerpo404 = await porElCuatrocientosCuatro.json()

    conFetch(fallaLaRed)
    const porLaRed = await pedirSalud()
    const cuerpoRed = await porLaRed.json()

    expect(
      cuerpo404,
      'Un 404 y un fallo de red han dado la MISMA respuesta. La ruta esta capturando ' +
        'todo en el mismo catch: el dia que Google retire el modelo, la alarma sonara ' +
        'igual que cuando se cae el wifi, y nadie ira a mirar.',
    ).not.toEqual(cuerpoRed)

    expect(porElCuatrocientosCuatro.status).not.toBe(porLaRed.status)
  })

  it('un 429 SI es inestable: no todo codigo HTTP es una condena', async () => {
    // La pareja por el otro lado. Sin esto, «clasificar por codigo» podria
    // significar «cualquier respuesta HTTP es permanente», y una tarde de
    // limite de cuota se leeria como un modelo retirado.
    conFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 429, message: 'Resource exhausted' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    )

    const cuerpo = (await pedirSalud()).json()
    expect((await cuerpo).estado).toBe('inestable')
  })

  it('una clave caducada (403) tampoco se arregla sola', async () => {
    conFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 403, message: 'PERMISSION_DENIED' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    )

    const cuerpo = (await (await pedirSalud()).json()) as { estado: string }
    expect(cuerpo.estado).toBe('credencial')
  })
})

describe('la pareja: cuando el modelo contesta, la ruta dice que si', () => {
  it('200 y ok, con los DOS modelos comprobados', async () => {
    // Sin esta, todas las de arriba seguirian verdes con una ruta que
    // devolviera «retirado» pasara lo que pasara.
    conFetch(() => respuestaOk())

    const respuesta = await pedirSalud()
    const cuerpo = (await respuesta.json()) as { estado: string; modelos: { id: string }[] }

    expect(respuesta.status).toBe(200)
    expect(cuerpo.estado).toBe('ok')
    // Los dos, no solo el cerebro: si el clasificador desaparece, el bot deja
    // de filtrar urgencias antes de llegar al cerebro.
    expect(cuerpo.modelos.map((m) => m.id).sort()).toEqual(
      [MODELO_CEREBRO, MODELO_CLASIFICADOR].sort(),
    )
  })

  it('si solo se retira el CLASIFICADOR, tambien se entera', async () => {
    conFetch((url) =>
      url.includes(MODELO_CLASIFICADOR) ? respuesta404(MODELO_CLASIFICADOR) : respuestaOk(),
    )

    const cuerpo = (await (await pedirSalud()).json()) as {
      estado: string
      modelos: { id: string; clase: string }[]
    }

    expect(cuerpo.estado).toBe('retirado')
    expect(cuerpo.modelos.find((m) => m.id === MODELO_CLASIFICADOR)!.clase).toBe('retirado')
    expect(cuerpo.modelos.find((m) => m.id === MODELO_CEREBRO)!.clase).toBe('ok')
  })
})

describe('el cerrojo y el ruido', () => {
  it('sin el secreto: 401, y NO se le pregunta a Google', async () => {
    conFetch(() => respuestaOk())

    const respuesta = await pedirSalud({})

    expect(respuesta.status).toBe(401)
    // Lo que de verdad importa: un 401 no gasta cuota. Contarlo, no fiarse del
    // codigo de estado (ESTADO_F4: un 401 que igualmente ejecuta el trabajo
    // pasaria una prueba que solo mire el numero).
    expect(peticiones).toBe(0)
  })

  it('con un secreto equivocado tampoco', async () => {
    conFetch(() => respuestaOk())
    const respuesta = await pedirSalud({ authorization: 'Bearer el-de-otro' })
    expect(respuesta.status).toBe(401)
    expect(peticiones).toBe(0)
  })

  it('el aviso ruidoso sale DESPUES de contestar, no durante', async () => {
    conFetch(() => respuesta404(MODELO_CEREBRO))
    await pedirSalud()

    // Un `console.error` a mitad de la respuesta no rompe nada hoy, pero el
    // dia que ahi haya un aviso al equipo, la ruta tardaria lo que tarde el
    // correo. La regla es la de F4: contestar primero, gritar despues.
    expect(deberes).toHaveLength(1)

    const gritos: string[] = []
    const antes = console.error
    console.error = (mensaje: string) => gritos.push(mensaje)
    try {
      deberes[0]!()
    } finally {
      console.error = antes
    }

    expect(gritos[0]).toContain(MODELO_CEREBRO)
    expect(gritos[0]).toContain('gemini.ts')
  })

  it('cuando todo va bien no se grita', async () => {
    conFetch(() => respuestaOk())
    await pedirSalud()
    expect(deberes).toHaveLength(0)
  })
})
