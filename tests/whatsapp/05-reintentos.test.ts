/**
 * Los reintentos contra Meta.
 *
 * LA DISTINCION QUE IMPORTA
 *
 * Reintentar un error PERMANENTE es gastar tiempo y cuota para acabar igual.
 * No reintentar uno TEMPORAL es perder el mensaje de un paciente porque Meta
 * estaba saturada dos segundos. La lista sale de la documentacion de codigos
 * de error (verificada el 19/09/2026, enlaces en la skill `whatsapp-cloud`).
 *
 * Y el jitter no es cosmetico: sin el, cien conversaciones que chocan con el
 * mismo limite reintentan en el mismo milisegundo y vuelven a chocar todas.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CODIGOS_TEMPORALES,
  ErrorDeMeta,
  ESPERA_BASE_MS,
  INTENTOS,
  espera,
  llamarAMeta,
  VENTANA_CERRADA,
} from '@/lib/whatsapp/meta'

function respuestas(lista: (() => Response)[]) {
  let i = 0
  const hacer = vi.fn(async () => {
    const siguiente = lista[Math.min(i, lista.length - 1)]!
    i += 1
    return siguiente()
  })
  return hacer as unknown as typeof fetch
}

const ok = () => () => new Response('{}', { status: 200 })
const conCodigo = (codigo: number, estado = 400) => () =>
  new Response(JSON.stringify({ error: { code: codigo, message: 'mensaje de Meta' } }), {
    status: estado,
  })

const sinDormir = { dormir: async () => {} }

describe('que es temporal y que es permanente', () => {
  it.each([...CODIGOS_TEMPORALES])('%i es temporal', (codigo) => {
    expect(new ErrorDeMeta(400, codigo, '').temporal).toBe(true)
  })

  it.each([131047, 131050, 100, 131008, 132001, 368, 190])('%i es permanente', (codigo) => {
    expect(new ErrorDeMeta(400, codigo, '').temporal).toBe(false)
  })

  it('un 5xx sin codigo es temporal: es Meta cayendose', () => {
    expect(new ErrorDeMeta(503, undefined, 'gateway').temporal).toBe(true)
  })

  it('un 4xx sin codigo NO es temporal: la peticion esta mal', () => {
    expect(new ErrorDeMeta(400, undefined, 'bad request').temporal).toBe(false)
  })

  it('131047 se reconoce como «la ventana se cerro»', () => {
    expect(VENTANA_CERRADA).toBe(131047)
    expect(new ErrorDeMeta(400, VENTANA_CERRADA, '').ventanaCerrada).toBe(true)
    expect(new ErrorDeMeta(400, 130429, '').ventanaCerrada).toBe(false)
  })
})

describe('el reintento', () => {
  it('a la primera, una sola llamada', async () => {
    const hacer = respuestas([ok()])
    await llamarAMeta('https://x.test', {}, { fetch: hacer, ...sinDormir })
    expect(hacer).toHaveBeenCalledTimes(1)
  })

  it('un temporal se reintenta y acaba pasando', async () => {
    const hacer = respuestas([conCodigo(130429), conCodigo(130429), ok()])
    const respuesta = await llamarAMeta('https://x.test', {}, { fetch: hacer, ...sinDormir })
    expect(respuesta.status).toBe(200)
    expect(hacer).toHaveBeenCalledTimes(3)
  })

  it('un PERMANENTE no se reintenta ni una vez', async () => {
    const hacer = respuestas([conCodigo(131047)])
    await expect(
      llamarAMeta('https://x.test', {}, { fetch: hacer, ...sinDormir }),
    ).rejects.toBeInstanceOf(ErrorDeMeta)
    expect(hacer).toHaveBeenCalledTimes(1)
  })

  it('si todos los intentos fallan, lanza el ultimo error con su codigo', async () => {
    const hacer = respuestas([conCodigo(130429)])
    const fallo = await llamarAMeta('https://x.test', {}, { fetch: hacer, ...sinDormir }).catch(
      (e: unknown) => e,
    )
    expect(fallo).toBeInstanceOf(ErrorDeMeta)
    expect((fallo as ErrorDeMeta).codigo).toBe(130429)
    expect(hacer).toHaveBeenCalledTimes(INTENTOS)
  })

  it('un fallo de RED tambien se reintenta: no hubo respuesta que clasificar', async () => {
    let i = 0
    const hacer = vi.fn(async () => {
      i += 1
      if (i < 3) throw new Error('ECONNRESET')
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch

    const respuesta = await llamarAMeta('https://x.test', {}, { fetch: hacer, ...sinDormir })
    expect(respuesta.status).toBe(200)
    expect(hacer).toHaveBeenCalledTimes(3)
  })

  it('el mensaje del error lleva el codigo y lo que dijo Meta', async () => {
    const hacer = respuestas([conCodigo(131047)])
    await expect(llamarAMeta('https://x.test', {}, { fetch: hacer, ...sinDormir })).rejects.toThrow(
      /131047.*mensaje de Meta/,
    )
  })

  it('un cuerpo de error que no es JSON no rompe la clasificacion', async () => {
    const hacer = respuestas([() => new Response('<html>502</html>', { status: 502 })])
    const fallo = await llamarAMeta('https://x.test', {}, { fetch: hacer, ...sinDormir }).catch(
      (e: unknown) => e,
    )
    // 502 sin codigo: temporal, asi que se reintento hasta el final.
    expect((fallo as ErrorDeMeta).temporal).toBe(true)
    expect(hacer).toHaveBeenCalledTimes(INTENTOS)
  })
})

describe('el backoff', () => {
  it('crece de forma exponencial', () => {
    // Con el aleatorio fijado al maximo se ve el techo de cada intento.
    const alMaximo = () => 1
    expect(espera(0, alMaximo)).toBe(ESPERA_BASE_MS)
    expect(espera(1, alMaximo)).toBe(ESPERA_BASE_MS * 2)
    expect(espera(2, alMaximo)).toBe(ESPERA_BASE_MS * 4)
  })

  it('LLEVA JITTER: dos esperas del mismo intento no son iguales', () => {
    // Sin esto, cien conversaciones bloqueadas por el mismo limite reintentan
    // todas a la vez y vuelven a chocar todas a la vez.
    const valores = new Set(Array.from({ length: 50 }, () => espera(2)))
    expect(valores.size).toBeGreaterThan(1)
  })

  it('el jitter nunca baja de la mitad del techo', () => {
    for (let i = 0; i < 200; i += 1) {
      const ms = espera(1)
      expect(ms).toBeGreaterThanOrEqual(ESPERA_BASE_MS)
      expect(ms).toBeLessThanOrEqual(ESPERA_BASE_MS * 2)
    }
  })

  it('espera de verdad entre intentos', async () => {
    const dormido: number[] = []
    const hacer = respuestas([conCodigo(130429), conCodigo(130429), ok()])
    await llamarAMeta(
      'https://x.test',
      {},
      {
        fetch: hacer,
        dormir: async (ms) => {
          dormido.push(ms)
        },
      },
    )
    // Dos esperas para tres intentos, y la segunda mayor que la primera.
    expect(dormido).toHaveLength(2)
    expect(dormido[1]!).toBeGreaterThan(dormido[0]!)
  })
})
