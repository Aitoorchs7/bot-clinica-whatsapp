/**
 * El vocabulario del interruptor, en un solo sitio.
 *
 * LA PALABRA `publico` NO SALE NUNCA EN PANTALLA
 *
 * `publico` es el nombre de una columna. Lo que la clinica decide cuando lo
 * mueve es otra cosa, y hay que decirsela con sus palabras: «el asistente
 * puede decir esto» o «solo para el equipo». Quien esta en el mostrador no
 * tiene por que saber como se llaman nuestras columnas, y una etiqueta que
 * dice `publico: true` invita a pensar que va de una pagina web.
 *
 * Aqui tambien vive `textoQueDiria()`: lo que el bot pasaria a decir palabra
 * por palabra si se enciende esa fila. Es lo que se ensena en la confirmacion,
 * y sale de la MISMA columna que lee el montador del prompt (F2), no de un
 * resumen escrito para la pantalla. Enseñar un texto y mandar otro convertiria
 * la confirmacion en un tramite.
 */
export const TABLAS_CON_PUBLICO = ['faq', 'tratamientos', 'config'] as const
export type TablaConPublico = (typeof TABLAS_CON_PUBLICO)[number]

/** Los dos estados, como se leen. */
export const PUEDE_DECIRLO = 'El asistente puede decir esto'
export const SOLO_EQUIPO = 'Solo para el equipo'

/** Lo que dice el interruptor cuando está en cada posición. */
export function comoSeLee(publico: boolean): string {
  return publico ? PUEDE_DECIRLO : SOLO_EQUIPO
}

export const NOMBRE_DE_LA_TABLA: Readonly<Record<TablaConPublico, string>> = {
  faq: 'Preguntas frecuentes',
  tratamientos: 'Tratamientos',
  config: 'Datos de la clínica',
}

/**
 * El texto exacto que el asistente pasaria a decir.
 *
 * Cada tabla lo guarda en una columna distinta, y son las mismas que usa
 * `montaje.ts` para armar el prompt:
 *
 *   faq          -> `respuesta_aprobada`, que el bot dice PALABRA POR PALABRA
 *   tratamientos -> `frase_bot`, y si no la hay, el nombre y lo que dura
 *   config       -> `valor`, que entra en la lista de datos de la clinica
 */
export function textoQueDiria(
  tabla: TablaConPublico,
  fila: {
    respuesta_aprobada?: string | null
    frase_bot?: string | null
    nombre?: string | null
    duracion_min?: number | null
    clave?: string | null
    valor?: string | null
  },
): string {
  if (tabla === 'faq') return fila.respuesta_aprobada ?? ''
  if (tabla === 'config') return `${fila.clave ?? ''}: ${fila.valor ?? ''}`
  if (fila.frase_bot && fila.frase_bot.trim() !== '') return fila.frase_bot
  return `${fila.nombre ?? ''} · ${fila.duracion_min ?? 0} minutos`
}

/** Lo que se pregunta antes de encender. Encender es la acción peligrosa. */
export const PREGUNTA_AL_ENCENDER =
  '¿Seguro que quieres que el asistente pueda decirle esto a un paciente por WhatsApp?'

/** Y lo que se dice al apagar, que no necesita confirmación. */
export const AL_APAGAR = 'El asistente dejará de decirlo a partir de ahora.'
