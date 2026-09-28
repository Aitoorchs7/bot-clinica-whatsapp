/**
 * Los cerrojos que impiden que las pruebas toquen producción.
 *
 * Nivel 1: sin base de datos y sin red. Corre en `comprobaciones-estaticas`.
 *
 * ================ POR QUE EXISTEN (F9) ================
 *
 * Hasta F8 había uno solo, `exigirBaseDeDesarrollo()`, y reconoce producción
 * por lo que tiene DENTRO: pacientes o citas que no son de las clínicas de
 * prueba. Una producción recién creada no tiene ninguno y pasaba por
 * desarrollo. Y el SQL de mantenimiento iba adonde dijera el vínculo de la CLI,
 * no adonde sembraba la suite (ESTADO_F9 §3.1).
 *
 * Así que estas pruebas no miran el mensaje de error y ya: la de la siembra
 * PINCHA `fetch` y exige que el contador siga a cero. Un cerrojo que se niega
 * después de haber mandado la primera petición no es un cerrojo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  REFS_DE_PRODUCCION,
  exigirQueNoSeaProduccion,
  refDeCadenaDeConexion,
  refDeUrlSupabase,
} from '../ayuda/entorno'
import { cadenaDeMantenimiento, filasDeLaSalida, tapar } from '../ayuda/mantenimiento'

const PRODUCCION = REFS_DE_PRODUCCION[0]!
const URL_PRODUCCION = `https://${PRODUCCION}.supabase.co`
const DESARROLLO = 'ggalkkeobyxpodbzlwzj'
const URL_DESARROLLO = `https://${DESARROLLO}.supabase.co`
const OTRO = 'aaaaaaaaaaaaaaaaaaaa'

function pooler(ref: string, clave = 'Clave123Falsa'): string {
  return `postgresql://postgres.${ref}:${clave}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
}

describe('la referencia de un proyecto', () => {
  it('sale de su URL, y de nada que no sea una URL de Supabase', () => {
    expect(refDeUrlSupabase(URL_DESARROLLO)).toBe(DESARROLLO)
    expect(refDeUrlSupabase('http://127.0.0.1:54321')).toBeNull()
    expect(refDeUrlSupabase('')).toBeNull()
    expect(refDeUrlSupabase('esto no es una url')).toBeNull()
  })

  it('sale de la cadena del pooler (usuario) y de la directa (host)', () => {
    expect(refDeCadenaDeConexion(pooler(DESARROLLO))).toBe(DESARROLLO)
    expect(
      refDeCadenaDeConexion(`postgresql://postgres:x@db.${DESARROLLO}.supabase.co:5432/postgres`),
    ).toBe(DESARROLLO)
  })

  it('una cadena de la que no se sabe el proyecto da null, no un proyecto cualquiera', () => {
    expect(refDeCadenaDeConexion('postgresql://postgres:x@localhost:5432/postgres')).toBeNull()
    expect(refDeCadenaDeConexion('postgresql://…')).toBeNull()
    expect(refDeCadenaDeConexion('')).toBeNull()
  })
})

describe('exigirQueNoSeaProduccion', () => {
  it('se niega con la URL de produccion', () => {
    expect(() => exigirQueNoSeaProduccion(URL_PRODUCCION, 'La siembra')).toThrow(/PRODUCCIÓN/)
  })

  it('LA PAREJA: deja pasar la de desarrollo y una base local', () => {
    // Sin esta, un cerrojo que se negara SIEMPRE pasaría la de arriba, y la
    // suite entera se saltaría sin que nadie supiera por qué.
    expect(() => exigirQueNoSeaProduccion(URL_DESARROLLO, 'La siembra')).not.toThrow()
    expect(() => exigirQueNoSeaProduccion('http://127.0.0.1:54321', 'La siembra')).not.toThrow()
  })
})

describe('la cadena del SQL de mantenimiento', () => {
  it('sin cadena, se niega, y el mensaje dice que la prueba NO se da por buena', () => {
    expect(() => cadenaDeMantenimiento('', URL_DESARROLLO)).toThrow(/NO se da por buena/)

    // Y por el camino de verdad, que lee el entorno. Ojo: pasar `undefined`
    // NO vacía nada —activa el valor por defecto y lee .env.local—, así que
    // hay que quitar la variable. Pasó al escribir esto.
    vi.stubEnv('SUPABASE_DB_URL_DEV', '')
    try {
      expect(() => cadenaDeMantenimiento(undefined, URL_DESARROLLO)).toThrow(
        /Falta SUPABASE_DB_URL_DEV/,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('con la de produccion, se niega aunque la siembra tambien fuera produccion', () => {
    expect(() => cadenaDeMantenimiento(pooler(PRODUCCION), URL_PRODUCCION)).toThrow(/PRODUCCIÓN/)
  })

  it('con la de OTRO proyecto que el de la siembra, se niega: el SQL iria a otra base', () => {
    expect(() => cadenaDeMantenimiento(pooler(OTRO), URL_DESARROLLO)).toThrow(/base distinta/)
  })

  it('con una cadena sin proyecto reconocible, se niega', () => {
    expect(() =>
      cadenaDeMantenimiento('postgresql://postgres:x@localhost:5432/postgres', URL_DESARROLLO),
    ).toThrow(/no tiene forma/)
  })

  it('LA PAREJA: la del mismo proyecto que la siembra pasa tal cual', () => {
    expect(cadenaDeMantenimiento(pooler(DESARROLLO), URL_DESARROLLO)).toBe(pooler(DESARROLLO))
  })

  it('ningun mensaje deja salir la cadena ni su contrasena', () => {
    const cadena = pooler(DESARROLLO, 'Clave%40Secreta99')
    const texto = `fallo conectando a ${cadena} con la clave Clave@Secreta99 y Clave%40Secreta99`
    const tapado = tapar(texto, cadena)
    expect(tapado).not.toContain('Secreta99')
    expect(tapado).not.toContain(cadena)
    expect(tapado).toContain('fallo conectando a ***')
  })
})

describe('lo que contesta la CLI (las tres formas medidas el 28/09)', () => {
  it('con --agent no --output-format json: una lista, y se lee tal cual', () => {
    expect(filasDeLaSalida('[\n  {\n    "n": 1,\n    "usuario": "postgres"\n  }\n]\n')).toEqual([
      { n: 1, usuario: 'postgres' },
    ])
  })

  it('lanzada por un agente: { boundary, rows, warning }, y se leen las rows', () => {
    const salida = JSON.stringify({ boundary: 'x', rows: [{ n: 1 }], warning: 'untrusted' })
    expect(filasDeLaSalida(salida)).toEqual([{ n: 1 }])
  })

  it('LA TABLA DEL CI es un ERROR, no una lista vacia: una purga sin leer no pasa por limpia', () => {
    // Es lo que contestó la CLI en el CI del PR #2, sin `--output-format`.
    const tabla = '┌───┐\n│ n │\n├───┤\n│ 1 │\n└───┘\n'
    expect(() => filasDeLaSalida(tabla)).toThrow(/no hay JSON/)
  })

  it('un JSON que no son filas tambien es un error', () => {
    expect(() => filasDeLaSalida('{"message":"algo"}')).toThrow(/no es una lista de filas/)
  })
})

describe('la siembra y la limpieza, contra la URL de produccion', () => {
  let peticiones = 0

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function siembraContraProduccion() {
    peticiones = 0
    vi.stubGlobal('fetch', () => {
      peticiones += 1
      return Promise.resolve(new Response('[]', { status: 200 }))
    })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_PRODUCCION)
    // `entorno.ts` lee la URL al importarse: hay que volver a cargarlo con la
    // de produccion puesta, que es lo que pasaria con un .env.local equivocado.
    vi.resetModules()
    return import('../ayuda/siembra')
  }

  it('sembrar() se niega ANTES de mandar una sola peticion', async () => {
    const { sembrar } = await siembraContraProduccion()

    await expect(sembrar()).rejects.toThrow(/PRODUCCIÓN/)
    expect(
      peticiones,
      'La siembra se ha negado, pero después de salir a la red: contra producción ya habría mandado algo.',
    ).toBe(0)
  })

  it('limpiar() —que borra clinicas en cascada— tambien, y tampoco manda nada', async () => {
    const { limpiar } = await siembraContraProduccion()

    await expect(limpiar()).rejects.toThrow(/PRODUCCIÓN/)
    expect(peticiones).toBe(0)
  })
})
