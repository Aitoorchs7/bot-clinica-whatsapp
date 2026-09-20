/**
 * La ventana de 24 horas.
 *
 * Cuando un paciente escribe se abre una ventana de 24 h durante la cual la
 * clinica puede contestarle con texto libre. Cerrada la ventana, solo
 * plantillas aprobadas: el texto libre devuelve 131047 y no llega.
 *
 * El reloj se reinicia con CADA mensaje entrante, no con el primero de la
 * conversacion.
 *
 * DOS FUENTES, Y LA DE META MANDA CUANDO VIENE
 *
 * Nosotros calculamos `entrante + 24 h`, que es correcto y esta siempre
 * disponible. Meta, en algunos webhooks de estado, manda
 * `conversation.expiration_timestamp`, que es lo que de verdad va a aplicar.
 * Cuando llega, gana: si nuestro reloj y el suyo discrepan aunque sea por el
 * retraso de la red, el que decide si un mensaje sale es el suyo.
 *
 * ESTE ARCHIVO SEPARA EL CALCULO DE LA ESCRITURA
 *
 * `expiraTras()` y `ventanaAbierta()` son puras: se comprueban con fechas
 * inventadas y sin base de datos. `guardarVentana()` es la unica que escribe.
 */
import type { ClienteDelBot } from '@/lib/barandillas/filtro'

export const HORAS_DE_VENTANA = 24
const MS_POR_HORA = 3_600_000

/** Cuando caduca la ventana que abre un mensaje recibido en `entrante`. */
export function expiraTras(entrante: Date): Date {
  return new Date(entrante.getTime() + HORAS_DE_VENTANA * MS_POR_HORA)
}

/**
 * `expira` es lo guardado en `conversaciones.ventana_24h_expira`.
 *
 * Sin valor, la ventana esta CERRADA. Es la respuesta prudente: tratar «no lo
 * se» como abierta manda texto libre que rebota con 131047 y deja al paciente
 * sin respuesta; tratarlo como cerrada manda una plantilla, que siempre llega.
 */
export function ventanaAbierta(expira: string | Date | null | undefined, ahora: Date): boolean {
  if (!expira) return false
  const cuando = typeof expira === 'string' ? new Date(expira) : expira
  if (Number.isNaN(cuando.getTime())) return false
  return cuando.getTime() > ahora.getTime()
}

/** El timestamp en segundos epoch que manda Meta, a `Date`. */
export function deEpoch(segundos: string | undefined): Date | undefined {
  if (!segundos) return undefined
  const n = Number(segundos)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000)
}

/**
 * Deja escrito en la conversacion hasta cuando se puede contestar con texto
 * libre. Tambien refresca `ultima_actividad`, que es por donde barre la purga
 * de 90 dias.
 *
 * SE FILTRA POR `id` Y POR NADA MAS, a proposito. Añadir
 * `.eq('clinica_id', ...)` parece prudencia y es justo lo que
 * `tests/barandillas/04-sin-filtro-en-codigo.test.ts` prohibe: la RLS ya acota
 * la fila a la clinica del token, y repetirlo en la consulta hace que un fallo
 * de la politica deje de notarse. La RLS filtra; el codigo comprueba y avisa.
 */
export async function guardarVentana(
  cliente: ClienteDelBot,
  conversacionId: string,
  expira: Date,
): Promise<void> {
  const { error } = await cliente
    .from('conversaciones')
    .update({
      ventana_24h_expira: expira.toISOString(),
      ultima_actividad: new Date().toISOString(),
    })
    .eq('id', conversacionId)

  if (error) {
    throw new Error(`No se pudo guardar la ventana de 24 h: ${error.message}`)
  }
}
