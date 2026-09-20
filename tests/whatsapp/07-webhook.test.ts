/**
 * La ruta del webhook: los cinco pasos, en orden, medidos.
 *
 * Aqui se simula lo de DEBAJO de la ruta (la base y el procesado) y corre de
 * verdad todo lo de la ruta: la lectura del cuerpo crudo, la verificacion de la
 * firma, la decision de idempotencia y el momento en que sale el 200. Es donde
 * se comprueban tres de las cuatro pruebas que el encargo pide por su nombre.
 *
 * LA MAS DIFICIL DE ESCRIBIR ES LA DEL ORDEN
 *
 * «Se contesta 200 antes de llamar al modelo» no se puede comprobar leyendo el
 * codigo, porque un `after()` mal puesto se lee igual de bien. Se comprueba
 * mirando el reloj: cuando `POST` ya ha devuelto su respuesta, `procesarMensaje`
 * NO puede haber corrido todavia. Y despues se ejecuta la devolucion de llamada
 * para demostrar que si corre — si no, la prueba pasaria igual con un webhook
 * que no procesa nada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { firmar } from '@/lib/whatsapp/firma'

const SECRETO = 'app-secret-de-prueba'
const NUMERO = '111222333444555'
const CLINICA = '11111111-1111-4111-8111-111111111111'

/** Las devoluciones de llamada que la ruta le paso a `after()`. */
const deberes: (() => unknown)[] = []

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    deberes.push(fn)
  },
}))

const anotarEvento = vi.fn()
const marcarProcesado = vi.fn()
const procesarMensaje = vi.fn()
const procesarEstado = vi.fn()

vi.mock('@/lib/whatsapp/almacen', () => ({
  anotarEvento: (...args: unknown[]) => anotarEvento(...args),
  marcarProcesado: (...args: unknown[]) => marcarProcesado(...args),
  clienteDe: () => ({}),
}))

vi.mock('@/lib/whatsapp/procesar', () => ({
  procesarMensaje: (...args: unknown[]) => procesarMensaje(...args),
  procesarEstado: (...args: unknown[]) => procesarEstado(...args),
}))

const { GET, POST, maxDuration } = await import('@/app/api/whatsapp/webhook/route')

// ---------------------------------------------------------------------------

function cargaDeTexto(texto: string, wamid = 'wamid.AAA') {
  // Escapado como lo manda Meta: los no-ASCII van en \uXXXX.
  const cuerpo = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '34910000001', phone_number_id: NUMERO },
              contacts: [{ profile: { name: 'Ana' }, wa_id: '34600111222' }],
              messages: [
                { from: '34600111222', id: wamid, timestamp: '1789812000', type: 'text', text: { body: texto } },
              ],
            },
          },
        ],
      },
    ],
  }
  // El escapado de Meta, reproducido: es lo que se firma.
  return JSON.stringify(cuerpo).replace(/[-￿]/g, (c) =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}

function peticion(cuerpo: string, firma?: string | null): Request {
  const cabeceras = new Headers({ 'content-type': 'application/json' })
  if (firma !== null && firma !== undefined) cabeceras.set('x-hub-signature-256', firma)
  return new Request('https://app.test/api/whatsapp/webhook', {
    method: 'POST',
    headers: cabeceras,
    body: cuerpo,
  })
}

const bienFirmada = (cuerpo: string) => peticion(cuerpo, firmar(cuerpo, SECRETO))

beforeEach(() => {
  deberes.length = 0
  anotarEvento.mockReset().mockResolvedValue({ nuevo: true, id: 7 })
  marcarProcesado.mockReset().mockResolvedValue(undefined)
  procesarMensaje.mockReset().mockResolvedValue({ hecho: 'contestado' })
  procesarEstado.mockReset().mockResolvedValue({ anotado: true })

  process.env.META_APP_SECRET = SECRETO
  process.env.WHATSAPP_VERIFY_TOKEN = 'token-de-alta'
  process.env.WHATSAPP_CLINICAS = JSON.stringify({ [NUMERO]: CLINICA })
})

afterEach(async () => {
  const { olvidarMapa } = await import('@/lib/whatsapp/config')
  olvidarMapa()
})

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

function verificacion(parametros: Record<string, string>): Request {
  const url = new URL('https://app.test/api/whatsapp/webhook')
  for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v)
  return new Request(url)
}

describe('GET · la verificacion de Meta', () => {
  it('con el token correcto devuelve el challenge TAL CUAL, en texto plano', async () => {
    const respuesta = GET(
      verificacion({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-de-alta',
        'hub.challenge': '1158201444',
      }),
    )

    expect(respuesta.status).toBe(200)
    // Tal cual: Meta compara el cuerpo literal. Envuelto en JSON no vale.
    expect(await respuesta.text()).toBe('1158201444')
    expect(respuesta.headers.get('content-type')).toMatch(/text\/plain/)
  })

  it('con otro token: 403 y NO se devuelve el challenge', async () => {
    const respuesta = GET(
      verificacion({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'el-que-no-es',
        'hub.challenge': '1158201444',
      }),
    )
    expect(respuesta.status).toBe(403)
    expect(await respuesta.text()).not.toContain('1158201444')
  })

  it('sin token: 403', () => {
    expect(GET(verificacion({ 'hub.mode': 'subscribe', 'hub.challenge': '1' })).status).toBe(403)
  })

  it('con un modo que no es subscribe: 403', () => {
    expect(
      GET(
        verificacion({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': 'token-de-alta',
          'hub.challenge': '1',
        }),
      ).status,
    ).toBe(403)
  })

  it('sin challenge: 403', () => {
    expect(
      GET(verificacion({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-de-alta' })).status,
    ).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// POST · la firma
// ---------------------------------------------------------------------------

describe('POST · la firma', () => {
  it('FIRMA VALIDA -> 200', async () => {
    const cuerpo = cargaDeTexto('hola')
    const respuesta = await POST(bienFirmada(cuerpo))
    expect(respuesta.status).toBe(200)
  })

  it('FIRMA INVALIDA -> 401', async () => {
    const cuerpo = cargaDeTexto('hola')
    const respuesta = await POST(peticion(cuerpo, firmar(cuerpo, 'otro-secreto')))
    expect(respuesta.status).toBe(401)
  })

  it('con firma invalida NO SE ESCRIBE NADA y NO se procesa nada', async () => {
    // Un 401 que ya hubiera tocado la base no serviria de gran cosa.
    await POST(peticion(cargaDeTexto('hola'), 'sha256=00'))
    expect(anotarEvento).not.toHaveBeenCalled()
    expect(deberes).toHaveLength(0)
  })

  it('sin cabecera de firma -> 401', async () => {
    expect((await POST(peticion(cargaDeTexto('hola'), null))).status).toBe(401)
  })

  it('ACENTOS: una carga con acentos y firma valida -> 200', async () => {
    // El fallo clasico de este webhook. Si alguien cambiara `req.text()` por
    // `req.json()`, ESTA se pondria roja y la de «hola» seguiria verde.
    const cuerpo = cargaDeTexto('quiero cita el miércoles por la mañana')
    expect(cuerpo).toContain('\\u00e9')
    expect((await POST(bienFirmada(cuerpo))).status).toBe(200)
  })

  it('sin META_APP_SECRET no se procesa nada: 500, no 200', async () => {
    delete process.env.META_APP_SECRET
    const cuerpo = cargaDeTexto('hola')
    const respuesta = await POST(peticion(cuerpo, firmar(cuerpo, SECRETO)))
    expect(respuesta.status).toBe(500)
    expect(anotarEvento).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST · el orden
// ---------------------------------------------------------------------------

describe('POST · el 200 sale ANTES de llamar al modelo', () => {
  it('cuando POST devuelve, procesarMensaje TODAVIA no ha corrido', async () => {
    const respuesta = await POST(bienFirmada(cargaDeTexto('hola')))

    expect(respuesta.status).toBe(200)
    // Lo que se mide: Meta ya tiene su 200 y el trabajo lento sigue pendiente.
    expect(procesarMensaje).not.toHaveBeenCalled()
    expect(deberes).toHaveLength(1)
  })

  it('...y luego SI corre: la prueba de arriba no pasa por no hacer nada', async () => {
    // Sin esta mitad, un webhook que no procesara nunca nada pasaria la
    // anterior con nota. Es el mismo principio que ESTADO_F3 §5.2.
    await POST(bienFirmada(cargaDeTexto('hola')))
    await deberes[0]!()

    expect(procesarMensaje).toHaveBeenCalledTimes(1)
    expect(procesarMensaje.mock.calls[0]?.[0]).toMatchObject({
      clase: 'texto',
      texto: 'hola',
      telefono: '+34600111222',
    })
  })

  it('un fallo del procesado no cambia el 200 que ya se dio', async () => {
    procesarMensaje.mockRejectedValue(new Error('Gemini se ha caido'))
    const respuesta = await POST(bienFirmada(cargaDeTexto('hola')))
    expect(respuesta.status).toBe(200)
    // Y la devolucion de llamada no propaga: si lanzara, Meta lo veria como
    // una entrega fallida y reintentaria durante 36 horas.
    await expect(deberes[0]!()).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// POST · idempotencia
// ---------------------------------------------------------------------------

describe('POST · idempotencia', () => {
  it('el evento se anota ANTES de responder, no dentro del after()', async () => {
    // Si se anotara dentro de `after()`, dos reintentos simultaneos de Meta
    // pasarian los dos el filtro y crearian dos citas.
    await POST(bienFirmada(cargaDeTexto('hola')))
    expect(anotarEvento).toHaveBeenCalledTimes(1)
    expect(anotarEvento.mock.calls[0]?.[1]).toBe('msg:wamid.AAA')
  })

  it('EL MISMO wa_event_id DOS VECES: la segunda no procesa nada', async () => {
    const cuerpo = cargaDeTexto('hola')

    anotarEvento.mockResolvedValueOnce({ nuevo: true, id: 7 })
    await POST(bienFirmada(cuerpo))
    expect(deberes).toHaveLength(1)

    // El reintento de Meta: la base dice que ya estaba.
    anotarEvento.mockResolvedValueOnce({ nuevo: false })
    const segunda = await POST(bienFirmada(cuerpo))

    expect(segunda.status).toBe(200) // 200, para que Meta deje de reintentar
    expect(deberes).toHaveLength(1) // pero ni un deber nuevo
  })

  it('el evento se marca como procesado al terminar', async () => {
    await POST(bienFirmada(cargaDeTexto('hola')))
    await deberes[0]!()
    expect(marcarProcesado).toHaveBeenCalledWith(CLINICA, 7, expect.anything())
  })

  it('si no se pudo anotar el evento, NO se procesa', async () => {
    // Sin idempotencia no se procesa: es preferible perder un mensaje a
    // duplicar una cita.
    anotarEvento.mockRejectedValue(new Error('la base no responde'))
    const respuesta = await POST(bienFirmada(cargaDeTexto('hola')))
    expect(respuesta.status).toBe(200)
    expect(deberes).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// POST · lo demas
// ---------------------------------------------------------------------------

describe('POST · el resto', () => {
  it('de un numero que no es nuestro: 200 y nada mas', async () => {
    // 200 y no error: si se devolviera un fallo, Meta reintentaria 36 horas
    // algo que nunca vamos a atender.
    process.env.WHATSAPP_CLINICAS = JSON.stringify({ 'otro-numero': CLINICA })
    const { olvidarMapa } = await import('@/lib/whatsapp/config')
    olvidarMapa()

    const respuesta = await POST(bienFirmada(cargaDeTexto('hola')))
    expect(respuesta.status).toBe(200)
    expect(anotarEvento).not.toHaveBeenCalled()
    expect(deberes).toHaveLength(0)
  })

  it('un cuerpo que no es JSON, con firma valida: 200 y nada mas', async () => {
    const cuerpo = 'esto no es json'
    const respuesta = await POST(peticion(cuerpo, firmar(cuerpo, SECRETO)))
    expect(respuesta.status).toBe(200)
    expect(deberes).toHaveLength(0)
  })

  it('un webhook de estado se anota y NO se contesta', async () => {
    const cuerpo = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: NUMERO },
                statuses: [{ id: 'wamid.SAL', status: 'delivered', recipient_id: '34600111222' }],
              },
            },
          ],
        },
      ],
    })

    await POST(peticion(cuerpo, firmar(cuerpo, SECRETO)))
    await deberes[0]!()

    expect(procesarEstado).toHaveBeenCalledTimes(1)
    expect(procesarMensaje).not.toHaveBeenCalled()
  })

  it('varios mensajes en un webhook: cada uno con su propia clave de idempotencia', async () => {
    const cuerpo = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: NUMERO },
                messages: [
                  { from: '34600111222', id: 'wamid.1', type: 'text', text: { body: 'hola' } },
                  { from: '34600111222', id: 'wamid.2', type: 'text', text: { body: 'queria cita' } },
                ],
              },
            },
          ],
        },
      ],
    })

    await POST(peticion(cuerpo, firmar(cuerpo, SECRETO)))
    expect(anotarEvento.mock.calls.map((c) => c[1])).toEqual(['msg:wamid.1', 'msg:wamid.2'])
  })

  it('hay maxDuration, y cubre el debounce mas la vuelta del modelo', () => {
    // Sin esto, la plataforma corta `after()` a mitad y el paciente se queda
    // sin respuesta despues de que Meta haya recibido su 200.
    expect(maxDuration).toBeGreaterThanOrEqual(30)
  })
})
