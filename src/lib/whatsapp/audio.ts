/**
 * Notas de voz: de `messages[0].audio.id` a texto.
 *
 * Tres pasos, y los dos primeros son de Meta:
 *
 *   1. GET graph.facebook.com/<VERSION>/<MEDIA_ID>   -> { url, mime_type, ... }
 *   2. GET <url>  CON Bearer                         -> los bytes
 *   3. POST api.deepgram.com/v1/listen               -> el texto
 *
 * EL PASO 2 TAMBIEN LLEVA EL TOKEN, Y ES LO QUE MAS SE OLVIDA
 *
 * La `url` del paso 1 apunta a un CDN de Meta, no a `graph.facebook.com`.
 * Parece una descarga publica y no lo es: sin la cabecera `Authorization`
 * devuelve un error. Ademas caduca a los 5 minutos, asi que no se guarda: se
 * pide justo antes de descargar.
 *
 * SI NO SE PUEDE TRANSCRIBIR, SE PIDE POR ESCRITO. NUNCA SE ADIVINA.
 *
 * Esta es la regla que manda sobre todo lo demas de este archivo. Un audio mal
 * entendido que acabe en una cita —o peor, en un sintoma mal leido— es mucho
 * peor que un mensaje de mas pidiendo que lo escriban. `transcribir()` devuelve
 * `undefined` cuando no esta segura, y quien llama tiene UNA sola forma de
 * seguir: pedirlo por escrito. No hay ninguna rama que rellene el hueco.
 */
import { exigir, opcional } from './config'
import { llamarAMeta, urlDeMedia, type Fetch, type OpcionesDeLlamada } from './meta'

/**
 * El vocabulario dental, para `keyterm` de Deepgram.
 *
 * Sin esto, «endodoncia» se transcribe como cualquier cosa y el bot acaba
 * llamando a `no_te_entiendo` con una palabra que el paciente dijo bien.
 *
 * En nova-3 el parametro es `keyterm` (repetido, uno por termino), NO
 * `keywords`, que es el de nova-2 y se ignora en silencio. El limite son 500
 * tokens por peticion; esta lista anda lejos.
 */
export const VOCABULARIO_DENTAL = [
  'endodoncia',
  'ortodoncia',
  'periodoncia',
  'periodontitis',
  'gingivitis',
  'implante',
  'implantologia',
  'empaste',
  'caries',
  'muela del juicio',
  'cordal',
  'extraccion',
  'corona',
  'funda',
  'puente',
  'protesis',
  'ferula',
  'bruxismo',
  'blanqueamiento',
  'limpieza bucal',
  'tartrectomia',
  'sarro',
  'flemon',
  'absceso',
  'higiene dental',
  'revision',
  'brackets',
  'invisalign',
  'carilla',
  'pulpitis',
  'sensibilidad dental',
] as const

export const MODELO_DEEPGRAM = 'nova-3'
export const IDIOMA_DEEPGRAM = 'es'

/**
 * Por debajo de esto no nos fiamos y se pide por escrito.
 *
 * Deepgram devuelve una confianza por alternativa. Un 0.4 en una nota de voz
 * con ruido de fondo es «he entendido algo», no «he entendido esto», y actuar
 * sobre ello es exactamente lo que este archivo no hace.
 */
export const CONFIANZA_MINIMA = 0.6

// ---------------------------------------------------------------------------
// 1 y 2 · Traerse el audio de Meta
// ---------------------------------------------------------------------------

export type Media = {
  readonly bytes: ArrayBuffer
  readonly mimeType: string
}

export async function descargarAudio(
  mediaId: string,
  opciones: OpcionesDeLlamada & { token?: string } = {},
): Promise<Media> {
  const token = opciones.token ?? exigir('WHATSAPP_TOKEN')
  const cabeceras = { authorization: `Bearer ${token}` }

  const meta = await llamarAMeta(urlDeMedia(mediaId), { method: 'GET', headers: cabeceras }, opciones)
  const descripcion = (await meta.json()) as { url?: string; mime_type?: string }

  if (!descripcion.url) {
    throw new Error(`Meta no ha devuelto url para el media ${mediaId}.`)
  }

  // La misma cabecera otra vez. Sin ella, esto falla.
  const archivo = await llamarAMeta(
    descripcion.url,
    { method: 'GET', headers: cabeceras },
    opciones,
  )

  return {
    bytes: await archivo.arrayBuffer(),
    mimeType: descripcion.mime_type ?? 'audio/ogg',
  }
}

// ---------------------------------------------------------------------------
// 3 · Deepgram
// ---------------------------------------------------------------------------

export function urlDeDeepgram(): string {
  const parametros = new URLSearchParams({
    model: MODELO_DEEPGRAM,
    language: IDIOMA_DEEPGRAM,
    smart_format: 'true',
    punctuate: 'true',
  })
  // `keyterm` va repetido, uno por termino. `append`, no `set`.
  for (const termino of VOCABULARIO_DENTAL) parametros.append('keyterm', termino)
  return `https://api.deepgram.com/v1/listen?${parametros.toString()}`
}

export type Transcripcion = {
  readonly texto: string
  readonly confianza: number
}

/**
 * `undefined` significa «no lo se», y es una respuesta legitima.
 *
 * Nunca lanza por un fallo de Deepgram: que se caiga el proveedor de
 * transcripcion no puede tumbar la conversacion. Se registra y se pide por
 * escrito.
 */
export async function transcribir(
  media: Media,
  opciones: {
    fetch?: Fetch
    clave?: string
    registro?: { info(t: string): void; error(t: string): void }
  } = {},
): Promise<Transcripcion | undefined> {
  const clave = opciones.clave ?? opcional('DEEPGRAM_API_KEY')
  if (!clave) {
    opciones.registro?.error('  ⚠  No hay DEEPGRAM_API_KEY: la nota de voz no se transcribe.')
    return undefined
  }

  const hacer = opciones.fetch ?? fetch

  try {
    const respuesta = await hacer(urlDeDeepgram(), {
      method: 'POST',
      headers: {
        authorization: `Token ${clave}`,
        'content-type': media.mimeType,
      },
      body: media.bytes,
    })

    if (!respuesta.ok) {
      opciones.registro?.error(`  ⚠  Deepgram ha contestado ${respuesta.status}.`)
      return undefined
    }

    const json = (await respuesta.json()) as {
      results?: {
        channels?: { alternatives?: { transcript?: string; confidence?: number }[] }[]
      }
    }

    const alternativa = json.results?.channels?.[0]?.alternatives?.[0]
    const texto = alternativa?.transcript?.trim() ?? ''
    const confianza = alternativa?.confidence ?? 0

    // Un audio de ruido devuelve transcripcion vacia y confianza alta. Las dos
    // condiciones hacen falta.
    if (texto === '') {
      opciones.registro?.info('  la nota de voz ha vuelto vacia: se pide por escrito')
      return undefined
    }
    if (confianza < CONFIANZA_MINIMA) {
      opciones.registro?.info(
        `  la nota de voz ha vuelto con confianza ${confianza.toFixed(2)}: se pide por escrito`,
      )
      return undefined
    }

    return { texto, confianza }
  } catch (fallo) {
    opciones.registro?.error(
      `  ⚠  No se ha podido transcribir la nota de voz: ${
        fallo instanceof Error ? fallo.message : String(fallo)
      }`,
    )
    return undefined
  }
}

/**
 * Lo que se le dice al paciente cuando no se ha podido leer su audio.
 *
 * `.claude/CLAUDE.md` prohibe el «no te entiendo» a secas: toda negativa va
 * seguida de lo que SI se puede hacer.
 */
export const PEDIR_POR_ESCRITO =
  'Perdona, no he conseguido escuchar bien tu nota de voz. ¿Me lo escribes en un mensaje? ' +
  'Con saber qué necesitas y qué día te viene bien, te busco hueco.'

/** De la nota de voz al texto, o a `undefined` si no se pudo. */
export async function textoDeLaNotaDeVoz(
  mediaId: string,
  opciones: OpcionesDeLlamada & {
    token?: string
    claveDeepgram?: string
    fetchDeepgram?: Fetch
    registro?: { info(t: string): void; error(t: string): void }
  } = {},
): Promise<string | undefined> {
  let media: Media
  try {
    media = await descargarAudio(mediaId, opciones)
  } catch (fallo) {
    opciones.registro?.error(
      `  ⚠  No se ha podido descargar la nota de voz: ${
        fallo instanceof Error ? fallo.message : String(fallo)
      }`,
    )
    return undefined
  }

  const transcrito = await transcribir(media, {
    ...(opciones.fetchDeepgram ? { fetch: opciones.fetchDeepgram } : {}),
    ...(opciones.claveDeepgram ? { clave: opciones.claveDeepgram } : {}),
    ...(opciones.registro ? { registro: opciones.registro } : {}),
  })

  return transcrito?.texto
}
