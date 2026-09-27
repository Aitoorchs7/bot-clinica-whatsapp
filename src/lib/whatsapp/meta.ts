/**
 * La frontera HTTP con Meta, y nada mas.
 *
 * Mismo principio que `gemini.ts` en F3: todo lo que sale hacia fuera pasa por
 * un tipo, `Fetch`, que se puede sustituir en las pruebas. `enviar.ts` y
 * `audio.ts` no llaman a `fetch` directamente, asi que la suite por defecto no
 * hace ni una peticion a Meta.
 *
 * QUE SE REINTENTA Y QUE NO
 *
 * Reintentar un error permanente es gastar tiempo y cuota para acabar igual;
 * NO reintentar uno temporal es perder el mensaje de un paciente porque Meta
 * estaba saturada dos segundos. La lista de abajo sale de la documentacion de
 * codigos de error, verificada el 19/09/2026, y esta en la skill
 * `whatsapp-cloud` con su enlace.
 *
 * El caso que mas importa es el 131047: la ventana de 24 h se cerro. Es
 * PERMANENTE. Reintentarlo no la abre; lo que hay que hacer es mandar una
 * plantilla, y de eso se encarga `enviar.ts`.
 */
import { baseGraph } from './config'

export type Fetch = typeof fetch

/** Errores que se van solos: limites, saturacion y el «desconocido» de Meta. */
export const CODIGOS_TEMPORALES: ReadonlySet<number> = new Set([
  4, // limite de la app
  80007, // limite de la cuenta de WhatsApp Business
  130429, // caudal de mensajes excedido
  131056, // demasiados mensajes al mismo destinatario
  133016, // limite de intentos de registro
  2, // caido o saturado
  131016, // servicio no disponible temporalmente
  131057, // cuenta en mantenimiento
  133004, // servidor no disponible temporalmente
  131000, // fallo desconocido
])

/** La ventana de 24 h se cerro. No se reintenta: se manda plantilla. */
export const VENTANA_CERRADA = 131047

export class ErrorDeMeta extends Error {
  constructor(
    readonly estadoHttp: number,
    readonly codigo: number | undefined,
    readonly detalle: string,
  ) {
    super(`Meta ${estadoHttp}${codigo === undefined ? '' : ` (${codigo})`}: ${detalle}`)
    this.name = 'ErrorDeMeta'
  }

  get ventanaCerrada(): boolean {
    return this.codigo === VENTANA_CERRADA
  }

  get temporal(): boolean {
    // Un 5xx sin codigo tambien es temporal: es Meta cayendose, no una
    // peticion mal formada.
    if (this.codigo === undefined) return this.estadoHttp >= 500
    return CODIGOS_TEMPORALES.has(this.codigo)
  }
}

function codigoDelCuerpo(cuerpo: string): { codigo?: number; detalle: string } {
  try {
    const json = JSON.parse(cuerpo) as { error?: { code?: number; message?: string } }
    const codigo = json.error?.code
    return {
      ...(typeof codigo === 'number' ? { codigo } : {}),
      detalle: json.error?.message ?? cuerpo.slice(0, 300),
    }
  } catch {
    return { detalle: cuerpo.slice(0, 300) }
  }
}

// ---------------------------------------------------------------------------
// Reintentos
// ---------------------------------------------------------------------------

export const INTENTOS = 3
export const ESPERA_BASE_MS = 500

/**
 * Backoff exponencial CON jitter.
 *
 * Sin el jitter, cien conversaciones que chocan con el mismo limite reintentan
 * todas en el mismo milisegundo y vuelven a chocar todas a la vez. El aleatorio
 * se inyecta para poder fijarlo en las pruebas.
 */
export function espera(intento: number, aleatorio: () => number = Math.random): number {
  const techo = ESPERA_BASE_MS * 2 ** intento
  return Math.round(techo * (0.5 + aleatorio() * 0.5))
}

export type OpcionesDeLlamada = {
  readonly fetch?: Fetch
  readonly intentos?: number
  readonly dormir?: (ms: number) => Promise<void>
  readonly aleatorio?: () => number
}

const dormirDeVerdad = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms))

/**
 * Una peticion a Meta con reintentos.
 *
 * Devuelve la `Response` si fue bien. Lanza `ErrorDeMeta` si no, ya con el
 * codigo leido: quien llama decide si mandar plantilla (ventana cerrada),
 * registrar el fallo, o rendirse.
 */
export async function llamarAMeta(
  url: string,
  init: RequestInit,
  opciones: OpcionesDeLlamada = {},
): Promise<Response> {
  const hacer = opciones.fetch ?? fetch
  const intentos = opciones.intentos ?? INTENTOS
  const dormir = opciones.dormir ?? dormirDeVerdad

  let ultimo: unknown

  for (let intento = 0; intento < intentos; intento += 1) {
    if (intento > 0) await dormir(espera(intento - 1, opciones.aleatorio))

    try {
      const respuesta = await hacer(url, init)
      if (respuesta.ok) return respuesta

      const cuerpo = await respuesta.text()
      const { codigo, detalle } = codigoDelCuerpo(cuerpo)
      const error = new ErrorDeMeta(respuesta.status, codigo, detalle)

      // Un permanente no mejora esperando. Sale ya, para que quien llama pueda
      // hacer lo unico util que queda (por ejemplo: mandar una plantilla).
      if (!error.temporal) throw error
      ultimo = error
    } catch (fallo) {
      // Un fallo de red no llega a ser `ErrorDeMeta`: no hubo respuesta.
      // Se reintenta, que es justo lo que hace falta cuando se cae el DNS.
      if (fallo instanceof ErrorDeMeta && !fallo.temporal) throw fallo
      ultimo = fallo
    }
  }

  if (ultimo instanceof Error) throw ultimo
  throw new Error(`No se pudo hablar con Meta despues de ${intentos} intentos.`)
}

// ---------------------------------------------------------------------------
// Los dos verbos que usa el canal
// ---------------------------------------------------------------------------

export function urlDeMensajes(phoneNumberId: string): string {
  return `${baseGraph()}/${phoneNumberId}/messages`
}

export function urlDeMedia(mediaId: string): string {
  return `${baseGraph()}/${mediaId}`
}

export type RespuestaDeEnvio = {
  /** El `wamid`. Es lo unico que une nuestra fila con los webhooks de estado. */
  readonly waMessageId?: string
}

/** POST a /messages con el token de envio. */
export async function postearMensaje(
  phoneNumberId: string,
  token: string,
  cuerpo: unknown,
  opciones: OpcionesDeLlamada = {},
): Promise<RespuestaDeEnvio> {
  const respuesta = await llamarAMeta(
    urlDeMensajes(phoneNumberId),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
    },
    opciones,
  )

  const json = (await respuesta.json().catch(() => ({}))) as {
    messages?: { id?: string }[]
  }

  const id = json.messages?.[0]?.id
  return id ? { waMessageId: id } : {}
}
