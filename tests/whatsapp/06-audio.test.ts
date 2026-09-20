/**
 * Las notas de voz.
 *
 * LA REGLA QUE MANDA SOBRE TODO LO DEMAS DE ESTE ARCHIVO
 *
 * Si no se puede transcribir, SE PIDE POR ESCRITO. Nunca se adivina. Un audio
 * mal entendido que acabe en una cita —o peor, en un sintoma mal leido— es
 * mucho peor que un mensaje de mas. Es el FALLO #8 del contrato de F4, y la
 * mitad de estas pruebas existen para que no haya ninguna rama que rellene el
 * hueco.
 *
 * Y el paso 2 de la descarga LLEVA TOKEN. La URL que devuelve Meta apunta a un
 * CDN y parece publica; sin la cabecera falla. Es lo que mas se olvida.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CONFIANZA_MINIMA,
  descargarAudio,
  IDIOMA_DEEPGRAM,
  MODELO_DEEPGRAM,
  PEDIR_POR_ESCRITO,
  textoDeLaNotaDeVoz,
  transcribir,
  urlDeDeepgram,
  VOCABULARIO_DENTAL,
} from '@/lib/whatsapp/audio'

const URL_CDN = 'https://lookaside.fbsbx.com/whatsapp/media/123'

/** Meta: primero la descripcion del media, luego los bytes. */
function metaFalsa() {
  const cabeceras: (string | null)[] = []
  const urls: string[] = []
  const hacer = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url))
    cabeceras.push(new Headers(init?.headers).get('authorization'))
    if (String(url).includes('graph.facebook.com')) {
      return new Response(
        JSON.stringify({ url: URL_CDN, mime_type: 'audio/ogg', file_size: 1234, id: 'media-1' }),
        { status: 200 },
      )
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  })
  return { hacer: hacer as unknown as typeof fetch, cabeceras, urls }
}

function deepgramFalso(cuerpo: unknown, estado = 200) {
  const urls: string[] = []
  const hacer = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url))
    return new Response(JSON.stringify(cuerpo), { status: estado })
  })
  return { hacer: hacer as unknown as typeof fetch, urls }
}

const conTexto = (transcript: string, confidence = 0.95) => ({
  results: { channels: [{ alternatives: [{ transcript, confidence }] }] },
})

describe('traerse el audio de Meta', () => {
  it('son DOS peticiones: la descripcion y luego los bytes', async () => {
    const meta = metaFalsa()
    const media = await descargarAudio('media-1', { fetch: meta.hacer, token: 'T' })

    expect(meta.urls).toHaveLength(2)
    expect(meta.urls[0]).toContain('graph.facebook.com')
    expect(meta.urls[1]).toBe(URL_CDN)
    expect(media.mimeType).toBe('audio/ogg')
    expect(media.bytes.byteLength).toBe(3)
  })

  it('LAS DOS LLEVAN EL TOKEN, incluida la del CDN', async () => {
    // Es lo que mas se olvida: la url del paso 1 apunta a un CDN de Meta, no a
    // graph.facebook.com, parece una descarga publica, y sin la cabecera falla.
    const meta = metaFalsa()
    await descargarAudio('media-1', { fetch: meta.hacer, token: 'T' })
    expect(meta.cabeceras).toEqual(['Bearer T', 'Bearer T'])
  })

  it('si Meta no da url, se entera quien llama', async () => {
    const hacer = vi.fn(async () =>
      new Response(JSON.stringify({ mime_type: 'audio/ogg' }), { status: 200 }),
    ) as unknown as typeof fetch
    await expect(descargarAudio('media-1', { fetch: hacer, token: 'T' })).rejects.toThrow(/url/)
  })
})

describe('la peticion a Deepgram', () => {
  it('va a nova-3 en espanol', () => {
    const url = new URL(urlDeDeepgram())
    expect(url.origin + url.pathname).toBe('https://api.deepgram.com/v1/listen')
    expect(url.searchParams.get('model')).toBe(MODELO_DEEPGRAM)
    expect(MODELO_DEEPGRAM).toBe('nova-3')
    expect(url.searchParams.get('language')).toBe(IDIOMA_DEEPGRAM)
    expect(IDIOMA_DEEPGRAM).toBe('es')
  })

  it('el vocabulario dental va en `keyterm`, REPETIDO, no en `keywords`', () => {
    // En nova-3 el parametro es `keyterm`. `keywords` es el de nova-2 y se
    // ignora EN SILENCIO: la llamada funcionaria y «endodoncia» seguiria
    // saliendo mal, que es la peor forma de fallar.
    const url = new URL(urlDeDeepgram())
    const terminos = url.searchParams.getAll('keyterm')

    expect(url.searchParams.getAll('keywords')).toEqual([])
    expect(terminos).toHaveLength(VOCABULARIO_DENTAL.length)
    expect(terminos).toContain('endodoncia')
    expect(terminos).toContain('ortodoncia')
    expect(terminos).toContain('muela del juicio')
  })

  it('manda los bytes con el mime que dijo Meta y el token de Deepgram', async () => {
    const deepgram = deepgramFalso(conTexto('quiero una revision'))
    const espia = vi.spyOn(globalThis, 'fetch')
    espia.mockRestore()

    let cabeceras: Headers | undefined
    const hacer = vi.fn(async (_url: unknown, init?: RequestInit) => {
      cabeceras = new Headers(init?.headers)
      return new Response(JSON.stringify(conTexto('hola')), { status: 200 })
    }) as unknown as typeof fetch

    await transcribir(
      { bytes: new ArrayBuffer(3), mimeType: 'audio/ogg; codecs=opus' },
      { fetch: hacer, clave: 'DG' },
    )

    expect(cabeceras?.get('authorization')).toBe('Token DG')
    expect(cabeceras?.get('content-type')).toBe('audio/ogg; codecs=opus')
    expect(deepgram.urls).toHaveLength(0)
  })
})

describe('cuando SI se entiende', () => {
  it('devuelve el texto y la confianza', async () => {
    const deepgram = deepgramFalso(conTexto('quiero cita para una revision', 0.91))
    const salida = await transcribir(
      { bytes: new ArrayBuffer(3), mimeType: 'audio/ogg' },
      { fetch: deepgram.hacer, clave: 'DG' },
    )
    expect(salida).toEqual({ texto: 'quiero cita para una revision', confianza: 0.91 })
  })
})

describe('cuando NO se entiende: se pide por escrito, no se adivina', () => {
  const media = { bytes: new ArrayBuffer(3), mimeType: 'audio/ogg' }

  it('sin clave de Deepgram', async () => {
    const anterior = process.env.DEEPGRAM_API_KEY
    delete process.env.DEEPGRAM_API_KEY
    const salida = await transcribir(media, { fetch: deepgramFalso(conTexto('x')).hacer })
    if (anterior !== undefined) process.env.DEEPGRAM_API_KEY = anterior
    expect(salida).toBeUndefined()
  })

  it('si Deepgram contesta un error', async () => {
    const deepgram = deepgramFalso({ err: 'no' }, 500)
    expect(await transcribir(media, { fetch: deepgram.hacer, clave: 'DG' })).toBeUndefined()
  })

  it('si Deepgram se cae del todo', async () => {
    const hacer = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    }) as unknown as typeof fetch
    expect(await transcribir(media, { fetch: hacer, clave: 'DG' })).toBeUndefined()
  })

  it('si la transcripcion vuelve VACIA (ruido de fondo)', async () => {
    const deepgram = deepgramFalso(conTexto('', 0.99))
    expect(await transcribir(media, { fetch: deepgram.hacer, clave: 'DG' })).toBeUndefined()
  })

  it('si la CONFIANZA es baja', async () => {
    // «He entendido algo» no es «he entendido esto».
    const deepgram = deepgramFalso(conTexto('algo ininteligible', CONFIANZA_MINIMA - 0.01))
    expect(await transcribir(media, { fetch: deepgram.hacer, clave: 'DG' })).toBeUndefined()
  })

  it('justo en el umbral SI se acepta', async () => {
    const deepgram = deepgramFalso(conTexto('una revision', CONFIANZA_MINIMA))
    expect(await transcribir(media, { fetch: deepgram.hacer, clave: 'DG' })).not.toBeUndefined()
  })

  it('si la respuesta de Deepgram no tiene la forma esperada', async () => {
    const deepgram = deepgramFalso({ otra: 'cosa' })
    expect(await transcribir(media, { fetch: deepgram.hacer, clave: 'DG' })).toBeUndefined()
  })

  it('NUNCA lanza: un proveedor caido no tumba la conversacion', async () => {
    const hacer = vi.fn(async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch
    await expect(transcribir(media, { fetch: hacer, clave: 'DG' })).resolves.toBeUndefined()
  })
})

describe('de la nota de voz al texto, de punta a punta', () => {
  it('sale el texto cuando todo va bien', async () => {
    const meta = metaFalsa()
    const deepgram = deepgramFalso(conTexto('quiero cita el jueves'))
    const texto = await textoDeLaNotaDeVoz('media-1', {
      fetch: meta.hacer,
      token: 'T',
      fetchDeepgram: deepgram.hacer,
      claveDeepgram: 'DG',
    })
    expect(texto).toBe('quiero cita el jueves')
  })

  it('si falla la DESCARGA, tampoco se adivina', async () => {
    const hacer = vi.fn(async () => new Response('no', { status: 404 })) as unknown as typeof fetch
    const texto = await textoDeLaNotaDeVoz('media-1', {
      fetch: hacer,
      token: 'T',
      dormir: async () => {},
      claveDeepgram: 'DG',
    })
    expect(texto).toBeUndefined()
  })
})

describe('lo que se le dice al paciente', () => {
  it('no es un «no te entiendo» a secas: dice lo que SI se puede hacer', () => {
    // `.claude/CLAUDE.md` lo prohibe expresamente. Toda negativa va seguida de
    // una salida.
    expect(PEDIR_POR_ESCRITO.toLowerCase()).not.toMatch(/^no te entiendo/)
    expect(PEDIR_POR_ESCRITO).toMatch(/escrib/i)
    expect(PEDIR_POR_ESCRITO).toMatch(/hueco|cita/i)
  })
})
