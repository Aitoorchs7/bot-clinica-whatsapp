/**
 * Mandar un mensaje por WhatsApp.
 *
 * DOS CAMINOS, Y LO QUE DECIDE ES EL RELOJ, NO LAS GANAS
 *
 *   ventana abierta  -> texto libre
 *   ventana cerrada  -> plantilla aprobada, o no se manda nada
 *
 * Y ademas, cinturon: si se intenta texto libre y Meta contesta 131047 («han
 * pasado mas de 24 horas»), se cae a la plantilla de respaldo si quien llama la
 * dio. Nuestro reloj y el de Meta pueden discrepar por segundos, y esos
 * segundos son justo el borde de la ventana.
 *
 * EN WHATSAPP EL ASTERISCO ES NEGRITA, Y UNO SOLO
 *
 * `*asi*` sale en negrita. `**asi**` sale LITERAL, con los dos asteriscos a la
 * vista, y es lo que produce por defecto un modelo entrenado con markdown. El
 * prompt lo prohibe —bloque «20 - Como habla»—, pero una instruccion en el
 * prompt es una intencion: el modelo la incumple tarde o temprano. La garantia
 * es `limpiarMarkdown()`, que corre SIEMPRE, justo antes del `fetch`.
 *
 * Es la misma logica que la barandilla 1: no se le pide al modelo que se
 * porte bien, se hace que portarse mal no tenga efecto.
 */
import { exigir } from './config'
import { postearMensaje, ErrorDeMeta, type OpcionesDeLlamada, type RespuestaDeEnvio } from './meta'
import { paraMeta } from './botones'
import type { Plantilla } from './plantillas'

// ---------------------------------------------------------------------------
// El formato
// ---------------------------------------------------------------------------

/**
 * Deja el texto en el dialecto de WhatsApp.
 *
 *   **negrita**  -> *negrita*     (dos asteriscos se verian)
 *   __cursiva__  -> _cursiva_
 *   ## Titulo    -> Titulo        (no existen los titulos)
 *   - punto      -> • punto       (mas legible en el movil)
 *   [t](url)     -> t: url        (no hay enlaces con texto)
 *
 * No toca el asterisco simple: ese SI es negrita y el bot puede usarlo con
 * moderacion.
 */
export function limpiarMarkdown(texto: string): string {
  return (
    texto
      // Enlaces antes que nada: si no, los corchetes sobreviven sueltos.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2')
      // Cercas de codigo: WhatsApp usa ``` tambien, pero un ```ts del modelo
      // deja el lenguaje escrito dentro del mensaje.
      .replace(/```[a-zA-Z]*\n?/g, '')
      // Negrita doble -> simple. Se hace antes que la cursiva para que
      // `**texto**` no se lea como dos `*` sueltos.
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/__([^_]+)__/g, '_$1_')
      // Titulos: fuera la almohadilla, se queda el texto.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      // Vinetas de markdown -> punto de verdad.
      .replace(/^\s{0,3}[-*+]\s+/gm, '• ')
      // Rayas horizontales.
      .replace(/^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/gm, '')
      // Tres saltos de linea o mas quedan en dos: un mensaje de WhatsApp con
      // huecos enormes se lee mal.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** El limite de un mensaje de texto de WhatsApp. */
export const LIMITE_CARACTERES = 4096

/**
 * Corta por la ultima frase que quepa, no por el caracter 4096.
 *
 * Un mensaje cortado a mitad de palabra parece un error del sistema. El bot no
 * deberia acercarse nunca a este limite —el bloque 20 pide mensajes cortos—,
 * asi que esto es una red, no un comportamiento esperado.
 */
export function recortar(texto: string, limite: number = LIMITE_CARACTERES): string {
  if (texto.length <= limite) return texto
  const trozo = texto.slice(0, limite)
  const corte = Math.max(trozo.lastIndexOf('. '), trozo.lastIndexOf('\n'))
  return (corte > limite * 0.5 ? trozo.slice(0, corte + 1) : trozo).trim()
}

/** Lo que de verdad sale por el cable. */
export function prepararTexto(texto: string): string {
  return recortar(limpiarMarkdown(texto))
}

// ---------------------------------------------------------------------------
// El envio
// ---------------------------------------------------------------------------

export type Destino = {
  readonly phoneNumberId: string
  /** E.164 con `+`, como lo guarda la base. Aqui se le quita para Meta. */
  readonly telefono: string
}

export type OpcionesDeEnvio = OpcionesDeLlamada & {
  /** Para las pruebas. En produccion sale de `WHATSAPP_TOKEN`. */
  readonly token?: string
}

function token(opciones: OpcionesDeEnvio): string {
  return opciones.token ?? exigir('WHATSAPP_TOKEN')
}

/** Texto libre. Solo vale con la ventana abierta. */
export async function enviarTexto(
  destino: Destino,
  texto: string,
  opciones: OpcionesDeEnvio = {},
): Promise<RespuestaDeEnvio> {
  return postearMensaje(
    destino.phoneNumberId,
    token(opciones),
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: paraMeta(destino.telefono),
      type: 'text',
      // `preview_url: false` a proposito: una vista previa de un enlace ocupa
      // media pantalla y descoloca la conversacion.
      text: { body: prepararTexto(texto), preview_url: false },
    },
    opciones,
  )
}

/** Una plantilla aprobada. Vale siempre, abierta o cerrada la ventana. */
export async function enviarPlantilla(
  destino: Destino,
  plantilla: Plantilla,
  opciones: OpcionesDeEnvio = {},
): Promise<RespuestaDeEnvio> {
  return postearMensaje(
    destino.phoneNumberId,
    token(opciones),
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: paraMeta(destino.telefono),
      type: 'template',
      template: plantilla,
    },
    opciones,
  )
}

export type ResultadoDeRespuesta = RespuestaDeEnvio & {
  /** `texto` o `plantilla`: lo que de verdad salio. Se guarda en `mensajes`. */
  readonly via: 'texto' | 'plantilla'
}

/**
 * Contestar a un paciente, decidiendo el camino por la ventana.
 *
 * `respaldo` es la plantilla que se usa si la ventana esta cerrada. Sin ella y
 * con la ventana cerrada, NO se manda nada y se lanza: es mejor que recepcion
 * vea el fallo en el registro a que el sistema crea que contesto y no lo
 * hiciera.
 */
export async function responderAlPaciente(
  destino: Destino,
  texto: string,
  ventanaEstaAbierta: boolean,
  respaldo?: Plantilla,
  opciones: OpcionesDeEnvio = {},
): Promise<ResultadoDeRespuesta> {
  if (!ventanaEstaAbierta) {
    if (!respaldo) {
      throw new Error(
        'La ventana de 24 h esta cerrada y no hay plantilla de respaldo: no se manda ' +
          'texto libre, porque Meta lo rechazaria con 131047 y el paciente se quedaria ' +
          'sin respuesta sin que nadie lo supiera.',
      )
    }
    return { ...(await enviarPlantilla(destino, respaldo, opciones)), via: 'plantilla' }
  }

  try {
    return { ...(await enviarTexto(destino, texto, opciones)), via: 'texto' }
  } catch (fallo) {
    // Nuestro reloj decia abierta y el de Meta dice cerrada. El suyo manda.
    if (fallo instanceof ErrorDeMeta && fallo.ventanaCerrada && respaldo) {
      return { ...(await enviarPlantilla(destino, respaldo, opciones)), via: 'plantilla' }
    }
    throw fallo
  }
}
