/**
 * El cerrojo de las rutas de cron.
 *
 * Nivel 1: sin red y sin base. Corre en `comprobaciones-estaticas`.
 *
 * ================ POR QUE UN 401 NO BASTA CON DEVOLVERLO ================
 *
 * Es el FALLO #6 del contrato: una ruta que comprueba el secreto DESPUÉS de
 * hacer el trabajo, o que lanza el trabajo y devuelve 401 por otro lado, pasa
 * cualquier prueba que mire solo el número. Así que aquí no se mira el número:
 * se PINCHA `globalThis.fetch` —la última línea antes de que salga nada de este
 * proceso, hacia Supabase o hacia Meta— y se exige que el contador esté a cero.
 *
 * Es la misma técnica de `tests/cron/01-salud.test.ts`, que la usa para
 * demostrar que un 401 no gasta cuota de Gemini.
 *
 * La otra mitad —que con el secreto el trabajo SÍ corre y escribe filas— no
 * cabe aquí: necesita una base de datos. Está en
 * `tests/trabajos-vivo/01-recordatorios.test.ts`, y cuenta filas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { olvidarMapa } from '@/lib/whatsapp/config'

const SECRETO = 'cron-secreto-de-prueba'

const { GET: recordatorios } = await import('@/app/api/cron/recordatorios/route')
const { GET: retencion } = await import('@/app/api/cron/retencion/route')
const { GET: clinicas } = await import('@/app/api/cron/clinicas/route')

/**
 * La ruta, y lo que tiene que contestar CON el secreto y el mapa vacío.
 *
 * `clinicas` (F9) contesta 500 y no 200, y es a propósito: un despliegue que no
 * conoce ninguna clínica no está «al día», no atiende a nadie. Las otras dos
 * con cero clínicas no tienen nada que hacer, y lo hacen bien.
 */
const RUTAS = [
  ['recordatorios', recordatorios, 200],
  ['retencion', retencion, 200],
  ['clinicas', clinicas, 500],
] as const

let peticiones: number

beforeEach(() => {
  peticiones = 0
  vi.stubEnv('CRON_SECRET', SECRETO)
  // Un mapa VACÍO: la ruta se abre y el trabajo recorre cero clínicas. Así el
  // camino feliz se puede comprobar sin base de datos. Lo que demuestra es que
  // el cerrojo abre, no que el trabajo sirva — eso es el nivel 2.
  vi.stubEnv('WHATSAPP_CLINICAS', '{}')
  olvidarMapa()
  vi.stubGlobal('fetch', () => {
    peticiones += 1
    return Promise.resolve(new Response('{}', { status: 200 }))
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  olvidarMapa()
})

function pedir(ruta: (p: Request) => Promise<Response>, cabeceras: Record<string, string>) {
  return ruta(new Request('https://ejemplo.test/api/cron/x', { headers: cabeceras }))
}

describe.each(RUTAS)('/api/cron/%s · el cerrojo', (nombre, ruta, conElSecreto) => {
  it('sin cabecera: 401, y NO se ejecuta nada', async () => {
    const respuesta = await pedir(ruta, {})

    expect(respuesta.status).toBe(401)
    expect(
      peticiones,
      `La ruta de ${nombre} ha devuelto 401 pero ha salido a la red igualmente: ` +
        'el trabajo se está ejecutando sin autorizar.',
    ).toBe(0)
  })

  it('con el secreto de otro: 401, y tampoco se ejecuta nada', async () => {
    const respuesta = await pedir(ruta, { authorization: 'Bearer el-de-otro' })

    expect(respuesta.status).toBe(401)
    expect(peticiones).toBe(0)
  })

  it('con el secreto bien escrito pero sin «Bearer»: 401', async () => {
    const respuesta = await pedir(ruta, { authorization: SECRETO })
    expect(respuesta.status).toBe(401)
    expect(peticiones).toBe(0)
  })

  it('LA PAREJA: con el secreto, la ruta se abre (si no, las de arriba pasarian con la ruta rota)', async () => {
    // Sin esta, una ruta que devolviera 401 SIEMPRE —por ejemplo, con el
    // secreto mal leído del entorno— pasaría las tres anteriores y nadie
    // recibiría jamás un recordatorio.
    const respuesta = await pedir(ruta, { authorization: `Bearer ${SECRETO}` })
    expect(respuesta.status).toBe(conElSecreto)
  })

  it('SIN CRON_SECRET EN EL ENTORNO NO SE ABRE LA PUERTA, se cierra del todo', async () => {
    // El fallo que importa: si un despliegue se deja la variable sin poner, lo
    // cómodo es que la comprobación se salte y la ruta quede abierta a
    // cualquiera con la URL. Aquí pasa lo contrario, y eso se nota (no salen
    // recordatorios) en vez de no notarse (los dispara un desconocido).
    vi.stubEnv('CRON_SECRET', '')

    const respuesta = await pedir(ruta, { authorization: 'Bearer ' })

    expect(respuesta.status).toBe(401)
    expect(peticiones).toBe(0)
  })
})
