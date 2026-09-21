/**
 * El formato de un guion de conversacion, y por que es JSON y no codigo.
 *
 * =========================================================================
 * QUE ES UN GUION
 * =========================================================================
 *
 * Una conversacion de referencia: lo que escribe el paciente, lo que el modelo
 * decide hacer en cada turno, y lo que TIENE que haber pasado al final. Los
 * quince de `tests/guiones/*.json` son los quince casos que una clinica
 * reconoce sin que nadie se los explique —«pedir cita», «pedir cita para mi
 * madre», «me duele»— y son el contrato de comportamiento del bot.
 *
 * Van en JSON y no en TypeScript por un motivo concreto: un guion es una
 * conversacion, y una conversacion la tiene que poder leer —y discutir— quien
 * no programa. Cuando la clinica diga «eso no es lo que queremos que conteste»,
 * lo que hay que enseñarle y cambiar es un archivo de estos, no un `it()`.
 *
 * =========================================================================
 * EL MODELO VA ESCRITO EN EL GUION. NO ES UNA TRAMPA, ES EL PUNTO
 * =========================================================================
 *
 * Cada turno dice lo que el modelo contesta y que herramientas pide. Podria
 * parecer que asi la prueba no comprueba nada —«claro, si le dices lo que tiene
 * que hacer»—, y es al reves: lo que se esta probando NO es el criterio del
 * modelo, es LA MAQUINARIA que hay debajo. Que `crear_cita` no escriba sin que
 * el paciente haya dicho que si. Que una hora fuera de horario vuelva como
 * `fuera_de_horario` y no como `ocupado`. Que tres citas seguidas dejen tres
 * filas y el borrador se vacie entre una y otra. Que un sintoma corte antes de
 * llegar al cerebro.
 *
 * Eso son garantias del sistema, valen para cualquier modelo, y con Gemini de
 * verdad serian imposibles de montar: habria que rezar para que pidiera
 * `crear_cita` sin confirmacion, que es justo el caso que hay que probar. El
 * doble se pincha donde manda ESTADO_F3 §1: en la frontera del SDK, la ultima
 * linea antes del HTTP. El bucle de herramientas, la validacion con Zod, la
 * puerta de la confirmacion, el montaje del prompt y la base de datos corren
 * TODOS de verdad.
 *
 * La prosa del modelo real se comprueba en otro sitio: `tests/bot-contrato`
 * (que el SDK sigue aceptando lo que le mandamos) y `tests/fuga/02-con-gemini`
 * (que no suelta lo que no debe). Ninguno de los quince necesita el modelo
 * real, y meterselo los volveria no deterministas, que es lo contrario de un
 * guion de referencia.
 *
 * =========================================================================
 * LOS HUECOS `{{...}}`
 * =========================================================================
 *
 * Un guion no puede llevar escrita una fecha ni una hora: mañana no seria
 * mañana y la hora libre de hoy estaria cogida. Se resuelven al correr:
 *
 *   {{DIA}}           Un dia laborable proximo, dentro de los 120 de V1.
 *   {{HORA_OFRECIDA}} El instante ISO de la primera opcion que devolvio el
 *                     ultimo `consultar_huecos` DE ESTA conversacion.
 *   {{HORA_LOCAL}}    Esa misma hora como HH:MM en la zona de la clinica.
 *                     Hace falta en el texto del bot: la puerta de
 *                     `crear_cita` exige que el paciente haya visto la hora
 *                     ESCRITA antes de decir que si.
 *   {{TELEFONO}}      El numero desde el que escriben.
 *
 * El que los resuelve es el modelo de mentira, leyendo los resultados de
 * herramienta que le llegan en su propio contexto — o sea, por la misma puerta
 * por la que se entera Gemini. No hay ningun atajo por detras.
 */

export type LlamadaDelGuion = {
  readonly nombre: string
  readonly argumentos?: Record<string, unknown>
}

/** Lo que el modelo contesta en una vuelta del bucle de herramientas. */
export type RespuestaDelGuion = {
  readonly texto?: string
  readonly llamadas?: readonly LlamadaDelGuion[]
}

/** Lo que tiene que haber devuelto una herramienta. */
export type ResultadoEsperado = {
  readonly herramienta: string
  readonly ok?: boolean
  /** El `motivo` de un resultado que no fue bien: `ocupado`, `fuera_de_horario`… */
  readonly motivo?: string
  /** Trozos que tienen que aparecer en el JSON del resultado. */
  readonly contiene?: readonly string[]
}

export type EsperaDelTurno = {
  /** En orden y exactas. Es la barandilla 3: ni una herramienta de mas. */
  readonly herramientas?: readonly string[]
  readonly respuestaContiene?: readonly string[]
  readonly respuestaNoContiene?: readonly string[]
  readonly escalado?: boolean
  readonly cortadoAntesDelCerebro?: boolean
  /** Si el cerebro corrio, cuantas veces se llamo al modelo. */
  readonly vueltasDelModelo?: number
  readonly resultados?: readonly ResultadoEsperado[]
  /** El borrador al acabar el turno. Solo los campos que se nombren. */
  readonly borrador?: Record<string, string | null>
}

export type TurnoDelGuion = {
  readonly paciente: string
  /** Una entrada por vuelta del bucle. La ultima no pide herramientas. */
  readonly modelo?: readonly RespuestaDelGuion[]
  readonly espera?: EsperaDelTurno
}

export type Guion = {
  readonly nombre: string
  /** Por que existe este guion. Se lee en el informe cuando falla. */
  readonly porque: string
  readonly turnos: readonly TurnoDelGuion[]
  readonly alFinal?: {
    /** Citas que tiene que haber creado ESTA conversacion. */
    readonly citas?: number
    readonly escalados?: number
    /** Trozos que tienen que estar —o no— en el prompt montado. */
    readonly promptContiene?: readonly string[]
    readonly promptNoContiene?: readonly string[]
  }
}
