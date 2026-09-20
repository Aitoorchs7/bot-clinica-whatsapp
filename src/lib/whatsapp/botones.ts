/**
 * El switch del principio: de la carga de Meta a algo con forma.
 *
 * LO QUE ESCRIBIO EL PACIENTE NO ESTA SIEMPRE EN EL MISMO SITIO
 *
 *   texto              -> messages[0].text.body
 *   nota de voz        -> messages[0].audio.id          (hay que transcribir)
 *   boton de PLANTILLA -> messages[0].button.payload
 *   boton INTERACTIVO  -> messages[0].interactive.button_reply.id
 *
 * Los dos ultimos son casos distintos de verdad, no dos nombres de lo mismo: un
 * boton de una plantilla aprobada llega como `button` con `payload`; un boton
 * de un mensaje interactivo mandado por la API llega como `interactive` con
 * `button_reply`. Un bot que solo mire uno de los dos se queda mudo la mitad de
 * las veces, y es la forma mas comun de que «el boton no hace nada».
 *
 * TODO ES UNA LISTA Y HAY QUE RECORRERLA
 *
 * Un webhook puede traer varias `entry`, varios `changes` y varios `messages`.
 * Leer `[0]` y marcharse pierde mensajes en silencio, que es el peor modo de
 * perderlos.
 *
 * ESTE ARCHIVO ES PURO
 *
 * Ni red, ni base, ni reloj. Entra un JSON y sale una lista. Asi se puede
 * comprobar con cargas reales de Meta sin levantar nada.
 */
// ---------------------------------------------------------------------------
// Lo que manda Meta, leido a la defensiva
// ---------------------------------------------------------------------------

/**
 * No se tipa la carga de Meta con interfaces optimistas: es entrada de fuera y
 * cualquier campo puede no estar. Se navega con lecturas que devuelven
 * `undefined` en vez de lanzar.
 */
type Json = Record<string, unknown>

function obj(valor: unknown): Json | undefined {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Json)
    : undefined
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : []
}

function cadena(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined
}

// ---------------------------------------------------------------------------
// Lo que sale
// ---------------------------------------------------------------------------

export type Entrante = {
  /** `wamid....`. Es el `wa_message_id` y la clave de idempotencia. */
  readonly waMessageId: string
  /** El numero de la clinica que lo recibio. Dice de que inquilino es. */
  readonly phoneNumberId: string
  /** E.164 CON el `+`. Meta lo manda sin el; aqui se normaliza a como lo guarda la base. */
  readonly telefono: string
  /** El nombre del perfil de WhatsApp, si vino. Nunca se usa como el nombre de la ficha. */
  readonly nombrePerfil?: string
  /** Segundos epoch, tal cual los manda Meta. */
  readonly timestamp?: string
} & (
  | { readonly clase: 'texto'; readonly texto: string }
  | { readonly clase: 'audio'; readonly mediaId: string; readonly mimeType?: string }
  | { readonly clase: 'boton'; readonly payload: string; readonly etiqueta?: string }
  | { readonly clase: 'sin_soporte'; readonly tipo: string }
)

export type EstadoEntrante = {
  readonly waMessageId: string
  readonly phoneNumberId: string
  /** `sent` | `delivered` | `read` | `failed`, tal cual lo dice Meta. */
  readonly estado: string
  readonly codigoError?: number
  /** Cuando Meta dice el fin de la ventana de 24 h, viene aqui. En segundos epoch. */
  readonly expiraVentana?: string
}

export type Leido = {
  readonly mensajes: readonly Entrante[]
  readonly estados: readonly EstadoEntrante[]
}

// ---------------------------------------------------------------------------
// El identificador del evento, que es lo que hace idempotente al webhook
// ---------------------------------------------------------------------------

/**
 * Sale del `id` del mensaje o del estado, NO de un hash del cuerpo.
 *
 * Meta puede reenviar el mismo mensaje con un cuerpo distinto en algun campo
 * accesorio; un hash lo veria como un evento nuevo y el bot contestaria dos
 * veces. El `wamid` es el mismo siempre.
 *
 * Los estados llevan su propio prefijo porque un mensaje genera hasta tres
 * webhooks (`sent`, `delivered`, `read`) con el MISMO `id`: sin el prefijo, el
 * `delivered` se tomaria por un duplicado del `sent` y no se guardaria nunca.
 */
export function idDeEvento(entrada: Entrante | EstadoEntrante): string {
  return 'clase' in entrada
    ? `msg:${entrada.waMessageId}`
    : `est:${entrada.waMessageId}:${entrada.estado}`
}

// ---------------------------------------------------------------------------
// El parser
// ---------------------------------------------------------------------------

/** Meta manda el numero sin `+`; la base lo guarda con `+` (lo exige un CHECK). */
export function aE164(deMeta: string): string {
  const limpio = deMeta.trim()
  return limpio.startsWith('+') ? limpio : `+${limpio}`
}

/** Y al reves, para el campo `to` de la API de envio. */
export function paraMeta(e164: string): string {
  return e164.startsWith('+') ? e164.slice(1) : e164
}

function leerMensaje(
  mensaje: Json,
  phoneNumberId: string,
  nombres: ReadonlyMap<string, string>,
): Entrante | undefined {
  const waMessageId = cadena(mensaje.id)
  const de = cadena(mensaje.from)
  if (!waMessageId || !de) return undefined

  const comun = {
    waMessageId,
    phoneNumberId,
    telefono: aE164(de),
    ...(nombres.get(de) ? { nombrePerfil: nombres.get(de) } : {}),
    ...(cadena(mensaje.timestamp) ? { timestamp: cadena(mensaje.timestamp) } : {}),
  }

  const tipo = cadena(mensaje.type) ?? 'desconocido'

  switch (tipo) {
    case 'text': {
      const texto = cadena(obj(mensaje.text)?.body)
      // Un texto vacio no es un mensaje: no se le contesta nada.
      return texto ? { ...comun, clase: 'texto', texto } : undefined
    }

    case 'audio': {
      const audio = obj(mensaje.audio)
      const mediaId = cadena(audio?.id)
      if (!mediaId) return { ...comun, clase: 'sin_soporte', tipo }
      return {
        ...comun,
        clase: 'audio',
        mediaId,
        ...(cadena(audio?.mime_type) ? { mimeType: cadena(audio?.mime_type) } : {}),
      }
    }

    // El boton de una PLANTILLA. `payload` es lo que se declaro al crearla;
    // `text` es lo que vio el paciente, y puede estar traducido.
    case 'button': {
      const boton = obj(mensaje.button)
      const payload = cadena(boton?.payload) ?? cadena(boton?.text)
      if (!payload) return { ...comun, clase: 'sin_soporte', tipo }
      return {
        ...comun,
        clase: 'boton',
        payload,
        ...(cadena(boton?.text) ? { etiqueta: cadena(boton?.text) } : {}),
      }
    }

    // El boton de un mensaje INTERACTIVO. Otro sitio, mismo significado.
    case 'interactive': {
      const inter = obj(mensaje.interactive)
      const respuesta = obj(inter?.button_reply) ?? obj(inter?.list_reply)
      const payload = cadena(respuesta?.id)
      if (!payload) return { ...comun, clase: 'sin_soporte', tipo }
      return {
        ...comun,
        clase: 'boton',
        payload,
        ...(cadena(respuesta?.title) ? { etiqueta: cadena(respuesta?.title) } : {}),
      }
    }

    // Imagen, documento, ubicacion, contacto, `unsupported`... Se reconocen para
    // poder contestar «esto no lo puedo leer, escribemelo» en vez de callarse.
    default:
      return { ...comun, clase: 'sin_soporte', tipo }
  }
}

function leerEstado(estado: Json, phoneNumberId: string): EstadoEntrante | undefined {
  const waMessageId = cadena(estado.id)
  const cual = cadena(estado.status)
  if (!waMessageId || !cual) return undefined

  const primerError = obj(lista(estado.errors)[0])
  const codigo = primerError?.code
  const conversacion = obj(estado.conversation)

  return {
    waMessageId,
    phoneNumberId,
    estado: cual,
    ...(typeof codigo === 'number' ? { codigoError: codigo } : {}),
    ...(cadena(conversacion?.expiration_timestamp)
      ? { expiraVentana: cadena(conversacion?.expiration_timestamp) }
      : {}),
  }
}

/**
 * Entra el JSON tal cual lo mando Meta, sale lo que hay que atender.
 *
 * Nunca lanza. Una carga que no se entiende da listas vacias, y eso acaba en un
 * 200 sin hacer nada: es lo correcto: si se devolviera un error, Meta
 * reintentaria durante 36 horas una carga que no vamos a saber leer nunca.
 */
export function leerCarga(carga: unknown): Leido {
  const mensajes: Entrante[] = []
  const estados: EstadoEntrante[] = []

  const raiz = obj(carga)
  if (!raiz) return { mensajes, estados }

  for (const entradaBruta of lista(raiz.entry)) {
    const entrada = obj(entradaBruta)
    if (!entrada) continue

    for (const cambioBruto of lista(entrada.changes)) {
      const cambio = obj(cambioBruto)
      const valor = obj(cambio?.value)
      if (!valor) continue

      const phoneNumberId = cadena(obj(valor.metadata)?.phone_number_id)
      if (!phoneNumberId) continue

      // El nombre del perfil viaja en `contacts`, no en el mensaje. Se indexa
      // por `wa_id` antes de recorrer los mensajes.
      const nombres = new Map<string, string>()
      for (const contactoBruto of lista(valor.contacts)) {
        const contacto = obj(contactoBruto)
        const waId = cadena(contacto?.wa_id)
        const nombre = cadena(obj(contacto?.profile)?.name)
        if (waId && nombre) nombres.set(waId, nombre)
      }

      for (const mensajeBruto of lista(valor.messages)) {
        const mensaje = obj(mensajeBruto)
        if (!mensaje) continue
        const leido = leerMensaje(mensaje, phoneNumberId, nombres)
        if (leido) mensajes.push(leido)
      }

      for (const estadoBruto of lista(valor.statuses)) {
        const estado = obj(estadoBruto)
        if (!estado) continue
        const leido = leerEstado(estado, phoneNumberId)
        if (leido) estados.push(leido)
      }
    }
  }

  return { mensajes, estados }
}

/**
 * El texto que se le pasa al motor.
 *
 * Un boton se convierte en su etiqueta si la trae: lo que el paciente cree que
 * ha dicho es «Confirmar», no `CONFIRMAR:9f3a`. Dejar entrar el payload crudo
 * mete un identificador interno en el contexto del modelo sin ninguna ganancia.
 */
export function textoDelEntrante(entrante: Entrante): string | undefined {
  switch (entrante.clase) {
    case 'texto':
      return entrante.texto
    case 'boton':
      return entrante.etiqueta ?? entrante.payload
    default:
      return undefined
  }
}
