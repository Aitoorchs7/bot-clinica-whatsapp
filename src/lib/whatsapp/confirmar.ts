/**
 * Los botones de `recordatorio_cita`: `CONFIRMAR:<id>` y `CANCELAR:<id>`.
 *
 * ============== POR QUE ESTO NO PASA POR EL MOTOR ==============
 *
 * Hasta F6 el payload de estos botones se parseaba y se tiraba: `botones.ts`
 * sabia leerlo, pero `textoDelEntrante()` le pasaba al modelo la ETIQUETA
 * («Confirmar»), no el identificador, y con razon —un uuid interno no pinta
 * nada en el contexto de un modelo—. El resultado es que nadie lo atendia.
 *
 * Confirmar una cita no es una conversacion: es una transicion de estado con
 * un identificador exacto. Pasarla por el cerebro seria pedirle a un modelo
 * que adivine a que cita se refiere «Confirmar» cuando el propio mensaje lo
 * dice sin ambiguedad, y ademas dejaria la escritura a su criterio. Se atiende
 * antes, contra la base, y el modelo no llega a enterarse.
 *
 * ============== UN PAYLOAD ES ENTRADA DEL USUARIO ==============
 *
 * `CONFIRMAR:<id>` viene de fuera. Que lo hayamos escrito nosotros al montar
 * la plantilla no lo convierte en un dato de confianza cuando vuelve. Si no se
 * comprobara de quien es la cita, cualquiera que consiguiera un identificador
 * confirmaria la cita de otro.
 *
 * Se comprueba por DOS sitios, y el primero no es codigo:
 *
 *   1 · LA CLINICA la garantiza la RLS. El cliente lleva el `clinica_id`
 *       firmado en el JWT, asi que `citas_bot_select` no devuelve la cita de
 *       otra clinica: para este cliente, esa fila NO EXISTE. No hay ningun
 *       `.eq('clinica_id', ...)` aqui, porque repetir en la consulta un
 *       predicado que ya aplica la RLS taparia la politica rota en vez de
 *       delatarla. Lo que si hay es una comprobacion posterior que AVISA.
 *
 *   2 · EL PACIENTE lo comprueba este archivo: el telefono de la ficha de la
 *       cita tiene que ser el de la conversacion por la que llego el boton.
 *
 * Por que el telefono y no `citas.conversacion_id`: porque una cita que cogio
 * recepcion por telefono tiene `conversacion_id` en null, y comparar por ahi
 * dejaria a esos pacientes sin poder confirmar —callandose, ademas—. El
 * telefono es la identidad de verdad del otro lado de WhatsApp, y es la misma
 * llave con la que `conversacionAbierta()` decide de quien es un hilo.
 *
 * ============== Y CANCELAR NO CANCELA ==============
 *
 * Cancelar o mover citas por WhatsApp esta FUERA DEL PRODUCTO, no solo fuera
 * de esta fase. Pero la plantilla declara el boton, y un boton que no hace
 * nada es peor que no tenerlo: el paciente se queda convencido de que ha
 * cancelado y no aparece el dia de la cita.
 *
 * Asi que `CANCELAR` hace lo unico honesto que se puede hacer sin construir lo
 * que esta fuera de alcance: AVISA AL EQUIPO, como cualquier otro escalado, y
 * se lo dice al paciente con todas las letras. La cita no se toca. Ademas el
 * rol `bot` no podria tocarla aunque quisiera: `citas_bot_update` admite
 * `provisional -> confirmada` y nada mas, y un intento de cancelar se lleva un
 * `42501`. Medido.
 *
 * La idempotencia del escalado no se comprueba aqui: la migracion 002 tiene un
 * indice unico parcial que impide dos escalados pendientes en la misma
 * conversacion. Pulsar «Cancelar» cinco veces deja UN aviso.
 */
import type { Registro } from '@/lib/barandillas/contador'
import { fechaParaElPaciente, horaParaElPaciente } from '@/lib/trabajos/reloj'

import { leerPayloadDeCita, type Entrante } from './botones'
import type { ClienteDelBot, ClinicaDelCanal } from './almacen'

export type RespuestaAlBoton = {
  /** Que paso de verdad. Lo usan las pruebas y el registro, no el paciente. */
  readonly hecho: 'confirmada' | 'ya_estaba' | 'escalada' | 'no_es_suya'
  /** Lo que se le contesta al paciente. Lo manda `procesar.ts`. */
  readonly texto: string
  /** Si hay que avisar al equipo. Solo lo rellena `CANCELAR`. */
  readonly avisar?: { readonly motivo: string; readonly asunto: string }
}

type CitaDelBoton = {
  id: string
  clinica_id: string
  inicio: string
  estado: string
  pacientes: { nombre: string; telefono_e164: string } | null
}

/**
 * Atiende el boton si el payload es de los nuestros.
 *
 * `undefined` significa «esto no es un boton de cita»: entonces `procesar.ts`
 * sigue por el camino de siempre y el mensaje llega al motor como cualquier
 * otro texto. Un paciente puede tener botones de otras cosas, y esta funcion no
 * tiene por que saber de ellos.
 */
export async function atenderBotonDeCita(
  entrante: Entrante,
  contexto: {
    readonly clinicaId: string
    readonly clinica: ClinicaDelCanal
    readonly conversacionId: string
    readonly mensajeId: number
  },
  bot: ClienteDelBot,
  registro?: Registro,
): Promise<RespuestaAlBoton | undefined> {
  if (entrante.clase !== 'boton') return undefined

  const accion = leerPayloadDeCita(entrante.payload)
  if (!accion) return undefined

  const telefono = contexto.clinica.telefono_recepcion

  // Busqueda por identidad, no filtro de seguridad: es el mismo caso que
  // `repasar_ficha` buscando al paciente por su telefono (ESTADO_F3 §3.2).
  const { data, error } = await bot
    .from('citas')
    .select('id, clinica_id, inicio, estado, pacientes(nombre, telefono_e164)')
    .eq('id', accion.citaId)
    .maybeSingle()

  if (error) throw new Error(`Buscando la cita del boton: ${error.message}`)

  const cita = data as CitaDelBoton | null

  if (!cita) {
    // O no existe, o es de otra clinica y la RLS la ha hecho desaparecer. Desde
    // aqui son lo mismo a proposito: decir «esa cita es de otra clinica» seria
    // confirmarle a quien sondea que ese identificador existe.
    registro?.error(
      `  ⚠  Boton ${accion.accion} sobre la cita ${accion.citaId}, que este cliente no ve. ` +
        'No se toca nada.',
    )
    return { hecho: 'no_es_suya', texto: noLaEncuentro(telefono) }
  }

  // La RLS ya deberia haberlo impedido. Si esto salta, hay una politica rota y
  // hay que enterarse: la RLS filtra, el codigo comprueba y AVISA.
  if (cita.clinica_id !== contexto.clinicaId) {
    registro?.error(
      `  ⚠  citas_bot_select ha devuelto la cita ${cita.id} de la clinica ${cita.clinica_id} ` +
        `a un cliente de ${contexto.clinicaId}. Revisa la politica.`,
    )
    return { hecho: 'no_es_suya', texto: noLaEncuentro(telefono) }
  }

  // Y la comprobacion que de verdad hace esta funcion: que quien pulsa es el
  // paciente de esa cita.
  if (!cita.pacientes || cita.pacientes.telefono_e164 !== entrante.telefono) {
    registro?.error(
      `  ⚠  Boton ${accion.accion} sobre la cita ${cita.id} desde un numero que no es el de ` +
        'su paciente. No se toca nada.',
    )
    return { hecho: 'no_es_suya', texto: noLaEncuentro(telefono) }
  }

  const zona = contexto.clinica.zona_horaria
  const cuando = `el ${fechaParaElPaciente(cita.inicio, zona)} a las ${horaParaElPaciente(cita.inicio, zona)}`

  if (accion.accion === 'cancelar') {
    return cancelar(cita, contexto, bot, cuando, telefono, registro)
  }

  return confirmar(cita, bot, cuando, telefono, registro)
}

// ---------------------------------------------------------------------------

function noLaEncuentro(telefono: string): string {
  // Una negativa nunca va sola: siempre con lo que SI se puede hacer. Es la
  // regla de copy de .claude/CLAUDE.md.
  return (
    'No encuentro esa cita a tu nombre. Si quieres te busco hueco por aquí, ' +
    `o llama al ${telefono} y te lo miran en un momento.`
  )
}

async function confirmar(
  cita: CitaDelBoton,
  bot: ClienteDelBot,
  cuando: string,
  telefono: string,
  registro?: Registro,
): Promise<RespuestaAlBoton> {
  // `citas_bot_update` solo admite provisional -> confirmada. Una cita que ya
  // estaba confirmada devuelve CERO FILAS Y NINGUN ERROR, asi que no se puede
  // distinguir «no se pudo» de «no hacia falta» mirando solo el resultado: hay
  // que mirar el estado que ya se leyo.
  if (cita.estado === 'confirmada') {
    return {
      hecho: 'ya_estaba',
      texto: `Ya la tenías confirmada: te esperamos ${cuando}. Si necesitas cambiarla, llámanos al ${telefono}.`,
    }
  }

  if (cita.estado !== 'provisional') {
    registro?.error(
      `  ⚠  Boton CONFIRMAR sobre la cita ${cita.id}, que esta en estado ${cita.estado}.`,
    )
    return { hecho: 'no_es_suya', texto: noLaEncuentro(telefono) }
  }

  const { data, error } = await bot
    .from('citas')
    .update({ estado: 'confirmada' })
    .eq('id', cita.id)
    .select('id')

  if (error) throw new Error(`Confirmando la cita ${cita.id}: ${error.message}`)

  // Si la RLS bloquea un UPDATE por su USING, PostgREST NO devuelve error:
  // devuelve cero filas y un 200. Sin mirar esto, el bot diria «confirmada» sin
  // haber confirmado nada — el fallo numero 4 de ESTADO_F1 §6.
  if (!data || data.length === 0) {
    registro?.error(
      `  ⚠  El UPDATE de la cita ${cita.id} no ha alcanzado ninguna fila. No se confirma nada.`,
    )
    return { hecho: 'no_es_suya', texto: noLaEncuentro(telefono) }
  }

  return {
    hecho: 'confirmada',
    texto: `¡Perfecto! Tu cita queda confirmada ${cuando}. Si necesitas cambiarla, llámanos al ${telefono}.`,
  }
}

async function cancelar(
  cita: CitaDelBoton,
  contexto: { readonly clinicaId: string; readonly conversacionId: string; readonly mensajeId: number },
  bot: ClienteDelBot,
  cuando: string,
  telefono: string,
  registro?: Registro,
): Promise<RespuestaAlBoton> {
  // NI UNA COLUMNA DE TEXTO LIBRE. `motivo` y `asunto` son los dos enums de
  // `escalados`, que sobrevive a la purga de 90 dias; el detalle se sigue por
  // `mensaje_id` mientras el mensaje exista. Migracion 007.
  const { error } = await bot.from('escalados').insert({
    clinica_id: contexto.clinicaId,
    conversacion_id: contexto.conversacionId,
    motivo: 'pidio_persona',
    asunto: 'otro',
    mensaje_id: contexto.mensajeId,
    estado: 'pendiente',
  })

  // El 23505 es el indice unico parcial impidiendo un segundo aviso pendiente
  // en la misma conversacion. No es un fallo: es lo que V1 aprendio a golpes el
  // 11/09 escalando cuatro veces la misma llamada.
  if (error && error.code !== '23505') {
    throw new Error(`Escalando la cancelacion de la cita ${cita.id}: ${error.message}`)
  }

  if (error?.code === '23505') {
    registro?.info(`  ya habia un aviso pendiente en la conversacion ${contexto.conversacionId}`)
  }

  return {
    hecho: 'escalada',
    // Se le dice lo que pasa de verdad: que la cita SIGUE EN PIE. Prometerle
    // una cancelacion que nadie ha hecho es como no se presenta a una cita.
    texto:
      `Aviso ahora mismo al equipo para que te llamen y lo veáis. De momento tu cita sigue ${cuando}: ` +
      `si prefieres adelantarlo, llama al ${telefono}.`,
    avisar: { motivo: 'pidio_persona', asunto: 'otro' },
  }
}
