/**
 * Las plantillas aprobadas por Meta.
 *
 * Una plantilla es lo UNICO que se puede mandar con la ventana de 24 h
 * cerrada. Fuera de la ventana, el texto libre devuelve 131047 y no llega.
 *
 * TODAS SON `utility`, Y ESO NO ES UNA ETIQUETA DECORATIVA
 *
 * Meta clasifica cada plantilla y la categoria decide el precio. Un
 * recordatorio de cita redactado como publicidad («¡no te pierdas nuestra
 * oferta en blanqueamientos!») se recategoriza a `marketing`, cuesta mas, y
 * ademas el paciente puede haber desactivado ese tipo de mensajes (131050): el
 * recordatorio de su cita no le llegaria.
 *
 * LOS PARAMETROS SON POSICIONALES
 *
 * `{{1}}`, `{{2}}`... y el orden tiene que ser el de la plantilla aprobada en
 * el panel de Meta. Si alguien reordena la plantilla alli sin tocar el codigo,
 * los datos salen cambiados de sitio SIN UN SOLO ERROR: el paciente recibe la
 * fecha donde iba su nombre. De ahi que cada plantilla declare aqui sus
 * parametros con nombre y los monte una funcion, en vez de armar el array a
 * mano en cada sitio que la use.
 *
 * EL IDIOMA ES EL DE LA PLANTILLA APROBADA
 *
 * `es_ES`, no `es`. Si no coincide exactamente con la del panel, Meta devuelve
 * 132001 y el mensaje no sale.
 */

export const IDIOMA = 'es_ES'

export type Componente =
  | { type: 'body'; parameters: { type: 'text'; text: string }[] }
  | {
      type: 'button'
      sub_type: 'quick_reply'
      index: number
      parameters: { type: 'payload'; payload: string }[]
    }

export type Plantilla = {
  readonly name: string
  readonly language: { readonly code: string }
  readonly components: readonly Componente[]
}

/** Lo que llega de vuelta en `button.payload` cuando el paciente pulsa. */
export const PAYLOAD_CONFIRMAR = 'CONFIRMAR'
export const PAYLOAD_CANCELAR = 'CANCELAR'

function cuerpo(...valores: string[]): Componente {
  return { type: 'body', parameters: valores.map((text) => ({ type: 'text', text })) }
}

function boton(index: number, payload: string): Componente {
  return { type: 'button', sub_type: 'quick_reply', index, parameters: [{ type: 'payload', payload }] }
}

// ---------------------------------------------------------------------------
// Las tres
// ---------------------------------------------------------------------------

/**
 * `recordatorio_cita` — utility, con botones Confirmar / Cancelar.
 *
 * La manda el trabajo programado de F6, no el webhook. Se declara aqui porque
 * la plantilla y el payload de sus botones son una sola decision con el parser
 * de `botones.ts`: quien lee `CONFIRMAR:<id>` tiene que ser el mismo que lo
 * escribio.
 *
 * Cuerpo aprobado:
 *   «Hola {{1}}, te recordamos tu cita en {{2}} el {{3}} a las {{4}}.»
 */
export function recordatorioCita(datos: {
  nombre: string
  clinica: string
  fecha: string
  hora: string
  citaId: string
}): Plantilla {
  return {
    name: 'recordatorio_cita',
    language: { code: IDIOMA },
    components: [
      cuerpo(datos.nombre, datos.clinica, datos.fecha, datos.hora),
      boton(0, `${PAYLOAD_CONFIRMAR}:${datos.citaId}`),
      boton(1, `${PAYLOAD_CANCELAR}:${datos.citaId}`),
    ],
  }
}

/**
 * `confirmacion_cita` — utility, sin botones.
 *
 * Cuerpo aprobado:
 *   «{{1}}, tu cita en {{2}} queda el {{3}} a las {{4}}. Si necesitas cambiarla,
 *    llamanos al {{5}}.»
 *
 * El telefono va como parametro y no escrito en la plantilla: cada clinica
 * tiene el suyo y la plantilla se aprueba una vez.
 */
export function confirmacionCita(datos: {
  nombre: string
  clinica: string
  fecha: string
  hora: string
  telefono: string
}): Plantilla {
  return {
    name: 'confirmacion_cita',
    language: { code: IDIOMA },
    components: [cuerpo(datos.nombre, datos.clinica, datos.fecha, datos.hora, datos.telefono)],
  }
}

/**
 * `aviso_escalado` — utility. Va al equipo, NO al paciente.
 *
 * Cuerpo aprobado:
 *   «Aviso de {{1}}: hay una conversacion que necesita a una persona.
 *    Motivo: {{2}}. Asunto: {{3}}. Telefono del paciente: {{4}}.»
 *
 * NI UNA PALABRA DE LO QUE ESCRIBIO EL PACIENTE, y no es por brevedad. El
 * motivo y el asunto son los dos enums de `escalados`; el detalle se lee
 * abriendo la conversacion, que es lo que la purga de 90 dias se lleva. Meter
 * el sintoma en un mensaje de WhatsApp lo sacaria de la unica tabla que se
 * borra y lo dejaria en el movil de recepcion para siempre — justo lo que la
 * migracion 007 quito de `escalados.resumen`, reabierto por otra puerta.
 */
export function avisoEscalado(datos: {
  clinica: string
  motivo: string
  asunto: string
  telefonoPaciente: string
}): Plantilla {
  return {
    name: 'aviso_escalado',
    language: { code: IDIOMA },
    components: [cuerpo(datos.clinica, datos.motivo, datos.asunto, datos.telefonoPaciente)],
  }
}

/** Los nombres, para que las pruebas puedan exigir la lista exacta. */
export const NOMBRES_DE_PLANTILLA = [
  'recordatorio_cita',
  'confirmacion_cita',
  'aviso_escalado',
] as const
