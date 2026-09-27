/**
 * La ventana de 24 h y el envio, con Meta simulada.
 *
 * El doble se pincha en `fetch`, que es la ultima linea antes del HTTP: la
 * decision de texto-o-plantilla, la limpieza del markdown, el cuerpo que se
 * arma y la lectura del `wamid` corren DE VERDAD. Es el mismo criterio que
 * ESTADO_F3 §1 uso con Gemini, y por el mismo motivo: un doble que imitara la
 * decision comprobaria el doble, no el canal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { enviarPlantilla, enviarTexto, responderAlPaciente } from '@/lib/whatsapp/enviar'
import { ErrorDeMeta, VENTANA_CERRADA } from '@/lib/whatsapp/meta'
import { confirmacionCita } from '@/lib/whatsapp/plantillas'
import { deEpoch, expiraTras, HORAS_DE_VENTANA, ventanaAbierta } from '@/lib/whatsapp/ventana'

const DESTINO = { phoneNumberId: '111222333', telefono: '+34600111222' }
const AHORA = new Date('2026-09-19T10:00:00Z')

/** Un `fetch` que responde lo que se le diga y apunta lo que le llega. */
function metaFalsa(respuestas: (() => Response)[]) {
  const llamadas: { url: string; cuerpo: Record<string, unknown> }[] = []
  let i = 0
  const hacer = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({
      url: String(url),
      cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    })
    const siguiente = respuestas[Math.min(i, respuestas.length - 1)]!
    i += 1
    return siguiente()
  })
  return { hacer: hacer as unknown as typeof fetch, llamadas }
}

const ok = (wamid = 'wamid.SALIENTE') => () =>
  new Response(JSON.stringify({ messages: [{ id: wamid }] }), { status: 200 })

const fallo = (codigo: number, estado = 400) => () =>
  new Response(JSON.stringify({ error: { code: codigo, message: 'no' } }), { status: estado })

describe('cuando caduca la ventana', () => {
  it('son 24 horas desde el mensaje entrante', () => {
    expect(HORAS_DE_VENTANA).toBe(24)
    expect(expiraTras(AHORA).toISOString()).toBe('2026-09-20T10:00:00.000Z')
  })

  it('el reloj se reinicia con CADA entrante, no con el primero', () => {
    const primero = expiraTras(new Date('2026-09-19T10:00:00Z'))
    const segundo = expiraTras(new Date('2026-09-19T18:00:00Z'))
    expect(segundo.getTime()).toBeGreaterThan(primero.getTime())
  })

  it('abierta antes de que caduque, cerrada despues', () => {
    const expira = new Date('2026-09-20T10:00:00Z')
    expect(ventanaAbierta(expira, new Date('2026-09-20T09:59:59Z'))).toBe(true)
    expect(ventanaAbierta(expira, new Date('2026-09-20T10:00:01Z'))).toBe(false)
  })

  it('SIN VALOR, la ventana esta CERRADA', () => {
    // Es la respuesta prudente y merece prueba propia: tratar «no lo se» como
    // abierta manda texto libre que rebota con 131047 y deja al paciente sin
    // respuesta. Tratarlo como cerrada manda plantilla, que siempre llega.
    expect(ventanaAbierta(null, AHORA)).toBe(false)
    expect(ventanaAbierta(undefined, AHORA)).toBe(false)
    expect(ventanaAbierta('', AHORA)).toBe(false)
    expect(ventanaAbierta('no es una fecha', AHORA)).toBe(false)
  })

  it('acepta el texto que devuelve Postgres', () => {
    expect(ventanaAbierta('2026-09-20T10:00:00+00:00', AHORA)).toBe(true)
  })

  it('el timestamp de Meta viene en segundos, no en milisegundos', () => {
    expect(deEpoch('1789898400')?.toISOString()).toBe('2026-09-20T10:00:00.000Z')
    expect(deEpoch(undefined)).toBeUndefined()
    expect(deEpoch('no')).toBeUndefined()
  })
})

describe('el envio', () => {
  beforeEach(() => {
    process.env.GRAPH_API_VERSION = 'v25.0'
  })
  afterEach(() => {
    delete process.env.GRAPH_API_VERSION
  })

  it('un texto va a /messages con la version clavada y el token', async () => {
    const meta = metaFalsa([ok()])
    const salida = await enviarTexto(DESTINO, 'hola', { fetch: meta.hacer, token: 'T' })

    expect(salida.waMessageId).toBe('wamid.SALIENTE')
    expect(meta.llamadas[0]?.url).toBe('https://graph.facebook.com/v25.0/111222333/messages')
    expect(meta.llamadas[0]?.cuerpo).toMatchObject({
      messaging_product: 'whatsapp',
      to: '34600111222', // sin el `+`
      type: 'text',
      text: { body: 'hola', preview_url: false },
    })
  })

  it('EL MARKDOWN SE LIMPIA ANTES DEL FETCH, no despues', async () => {
    // Aqui se mide lo que de verdad sale por el cable. Si la limpieza viviera
    // en otro sitio y alguien se saltara ese sitio, esto se pondria rojo.
    const meta = metaFalsa([ok()])
    await enviarTexto(DESTINO, 'Te espero el **jueves**.', { fetch: meta.hacer, token: 'T' })

    const texto = (meta.llamadas[0]?.cuerpo.text as { body: string }).body
    expect(texto).toBe('Te espero el *jueves*.')
    expect(texto).not.toContain('**')
  })

  it('una plantilla va con su idioma y sus componentes', async () => {
    const meta = metaFalsa([ok()])
    await enviarPlantilla(
      DESTINO,
      confirmacionCita({
        nombre: 'Ana',
        clinica: 'Clinica A',
        fecha: 'jueves 24',
        hora: '12:00',
        telefono: '+34910000001',
      }),
      { fetch: meta.hacer, token: 'T' },
    )

    expect(meta.llamadas[0]?.cuerpo).toMatchObject({
      type: 'template',
      template: { name: 'confirmacion_cita', language: { code: 'es_ES' } },
    })
  })
})

describe('texto o plantilla: lo decide el reloj', () => {
  it('con la ventana abierta va texto libre', async () => {
    const meta = metaFalsa([ok()])
    const salida = await responderAlPaciente(DESTINO, 'hola', true, undefined, {
      fetch: meta.hacer,
      token: 'T',
    })
    expect(salida.via).toBe('texto')
    expect(meta.llamadas[0]?.cuerpo.type).toBe('text')
  })

  it('con la ventana cerrada va la plantilla de respaldo', async () => {
    const meta = metaFalsa([ok()])
    const respaldo = confirmacionCita({
      nombre: 'Ana',
      clinica: 'A',
      fecha: 'jueves',
      hora: '12:00',
      telefono: '+34910000001',
    })
    const salida = await responderAlPaciente(DESTINO, 'hola', false, respaldo, {
      fetch: meta.hacer,
      token: 'T',
    })
    expect(salida.via).toBe('plantilla')
    expect(meta.llamadas[0]?.cuerpo.type).toBe('template')
  })

  it('con la ventana cerrada y SIN respaldo no se manda nada, y se entera alguien', async () => {
    // Mandar texto libre igual seria peor: Meta lo rechaza con 131047, el
    // paciente se queda sin respuesta, y el sistema cree que contesto.
    const meta = metaFalsa([ok()])
    await expect(
      responderAlPaciente(DESTINO, 'hola', false, undefined, { fetch: meta.hacer, token: 'T' }),
    ).rejects.toThrow(/131047|ventana/i)
    expect(meta.llamadas).toHaveLength(0)
  })

  it('CINTURON: si Meta dice 131047 aunque nuestro reloj diga abierta, se cae a la plantilla', async () => {
    // Nuestro reloj y el suyo pueden discrepar por segundos, y esos segundos
    // son justo el borde de la ventana. El suyo manda.
    const meta = metaFalsa([fallo(VENTANA_CERRADA), ok('wamid.PLANTILLA')])
    const respaldo = confirmacionCita({
      nombre: 'Ana',
      clinica: 'A',
      fecha: 'jueves',
      hora: '12:00',
      telefono: '+34910000001',
    })

    const salida = await responderAlPaciente(DESTINO, 'hola', true, respaldo, {
      fetch: meta.hacer,
      token: 'T',
      intentos: 1,
    })

    expect(salida.via).toBe('plantilla')
    expect(salida.waMessageId).toBe('wamid.PLANTILLA')
    expect(meta.llamadas[0]?.cuerpo.type).toBe('text')
    expect(meta.llamadas[1]?.cuerpo.type).toBe('template')
  })

  it('131047 NO se reintenta: esperar no abre la ventana', async () => {
    const meta = metaFalsa([fallo(VENTANA_CERRADA)])
    await expect(
      enviarTexto(DESTINO, 'hola', { fetch: meta.hacer, token: 'T', dormir: async () => {} }),
    ).rejects.toBeInstanceOf(ErrorDeMeta)
    expect(meta.llamadas).toHaveLength(1)
  })
})
