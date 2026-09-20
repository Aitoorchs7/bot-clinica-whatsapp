/**
 * Los recordatorios de cita: el primer mensaje que este sistema manda SOLO.
 *
 * Hasta F5 el bot solo contestaba. Un error se quedaba dentro de una
 * conversacion que alguien habia empezado. A partir de aqui, un error sale por
 * WhatsApp a un paciente que no ha pedido nada.
 *
 * ============== DE QUE CLINICA ES UN CRON ==============
 *
 * Un trabajo programado no tiene sesion, no tiene cookie y no tiene
 * `phone_number_id`: nadie le ha escrito. Es el mismo problema que resolvio
 * ESTADO_F4 §3 para el webhook, y se resuelve igual, porque las razones no han
 * cambiado: la RLS del rol `bot` exige que el `clinica_id` viaje YA FIRMADO
 * dentro del JWT, asi que para leer la fila de una clinica hay que saber antes
 * que clinica eres.
 *
 *   1 · `WHATSAPP_CLINICAS` dice QUE clinicas hay. Es configuracion, no datos.
 *   2 · Se firma un token de bot por cada una, una detras de otra.
 *   3 · Y se COMPRUEBA contra la base con el mismo `exigirClinicaDelCanal()`
 *       que usa el webhook: si el `wa_phone_number_id` de la fila no es el del
 *       mapa, esa clinica no recibe nada. Mandarle a un paciente el
 *       recordatorio con el nombre y el telefono de otra clinica es la peor
 *       cosa que puede hacer un sistema multi-inquilino, y un cron que
 *       recorre inquilinos en un bucle es justo donde eso pasa.
 *
 * Ni `service_role` ni una funcion `SECURITY DEFINER`. Sigue habiendo cero de
 * las dos cosas en todo el camino del bot.
 *
 * LO QUE ESTO CUESTA, Y HAY QUE DECIRLO: agrava ESTADO_F4 §8.5. Una clinica
 * que falte en `WHATSAPP_CLINICAS` ya no solo se queda sin contestar a quien
 * le escribe —eso al menos lo nota el paciente y acaba llamando—, sino tambien
 * SIN MANDAR RECORDATORIOS, y eso no lo nota nadie hasta que alguien no se
 * presenta a una cita. El bucle avisa a gritos por cada clinica que se cae,
 * pero el aviso solo sirve si alguien lee el registro.
 *
 * ============== LA IDEMPOTENCIA ==============
 *
 * SE RECLAMA Y SE MIRA EL ERROR; NO SE CONSULTA ANTES.
 *
 * Es la leccion de ESTADO_F4 §5.4, medida: consultar-y-luego-insertar funciona
 * perfectamente hasta que dos corren a la vez, y entonces nueve de diez se
 * creen nuevas. La prueba secuencial se queda verde mientras tanto. El unico
 * sitio donde dos invocaciones del cron se ponen de acuerdo es la base de
 * datos, y el `23505` del `unique (clinica_id, cita_id)` ES la deteccion.
 *
 * Y SE RECLAMA ANTES DE MANDAR, no despues. Es deliberado y tiene un coste
 * escrito en el contrato: si el envio falla despues de coger la marca, ese
 * recordatorio NO sale y NO se reintenta. Se elige asi porque los dos fallos
 * no son iguales:
 *
 *   marca despues -> dos invocaciones a la vez mandan DOS recordatorios al
 *                    mismo paciente. Llamada a recepcion preguntando cual vale.
 *   marca antes   -> un paciente se queda sin recordatorio si Meta falla en
 *                    ese segundo. Sigue teniendo su cita en la agenda.
 *
 * El fallo no se traga: se grita en el registro y queda en `eventos`, que es lo
 * que ve la clinica en la pantalla de observabilidad.
 *
 * ============== NI UNA PALABRA DE SALUD ==============
 *
 * El recordatorio lleva nombre, clinica, fecha y hora. NO lleva
 * `motivo_cerrado`, ni aunque sea un enum. Un WhatsApp no se purga a los 90
 * dias: se queda en el movil del paciente y en los servidores de Meta para
 * siempre, que es exactamente el motivo por el que la migracion 007 saco el
 * texto libre de `escalados` y por el que el aviso al equipo de F4 no lleva el
 * sintoma (ESTADO_F4 §9).
 */
import type { Registro } from '@/lib/barandillas/contador'
import {
  anotarEnEventos,
  clienteDe,
  conversacionAbierta,
  exigirClinicaDelCanal,
  guardarMensaje,
  type ClienteDelBot,
} from '@/lib/whatsapp/almacen'
import { mapaDeClinicas, numeroDeLaClinica } from '@/lib/whatsapp/config'
import { enviarPlantilla, type OpcionesDeEnvio } from '@/lib/whatsapp/enviar'
import { recordatorioCita } from '@/lib/whatsapp/plantillas'

import { fechaParaElPaciente, horaParaElPaciente, ventanaDeRecordatorios } from './reloj'

/** Cuantas horas antes se avisa. Se puede mover sin tocar codigo. */
export const HORAS_ANTES_POR_DEFECTO = 24

export function horasAntes(): number {
  const crudo = Number(process.env.RECORDATORIO_HORAS_ANTES)
  return Number.isFinite(crudo) && crudo > 0 ? crudo : HORAS_ANTES_POR_DEFECTO
}

export type OpcionesDelTrabajo = {
  /** Para las pruebas: el cliente de una clinica. En produccion lo firma `bot.ts`. */
  readonly cliente?: (clinicaId: string) => ClienteDelBot
  readonly envio?: OpcionesDeEnvio
  readonly ahora?: Date
  readonly registro?: Registro
  readonly horasAntes?: number
}

export type ResumenDeUnaClinica = {
  readonly clinicaId: string
  readonly candidatas: number
  readonly mandados: number
  /** Las que ya tenian marca: otra invocacion llego antes. No es un fallo. */
  readonly yaEstaban: number
  readonly fallidos: number
  readonly error?: string
}

export type ResumenDelTrabajo = {
  readonly clinicas: number
  readonly mandados: number
  readonly yaEstaban: number
  readonly fallidos: number
  readonly porClinica: readonly ResumenDeUnaClinica[]
}

/** Lo que hace falta saber de una cita para recordarla. Y nada mas. */
type CitaPorRecordar = {
  id: string
  inicio: string
  pacientes: { nombre: string; telefono_e164: string } | null
}

// ---------------------------------------------------------------------------
// El trabajo
// ---------------------------------------------------------------------------

/**
 * Recorre las clinicas del mapa y manda lo que toque.
 *
 * Una clinica que falle NO se lleva a las demas por delante: se anota su error
 * y se sigue. Un `throw` aqui dejaria sin recordatorio a todas las que vinieran
 * detras por un problema de una sola, y en un bucle de inquilinos eso convierte
 * un fallo de configuracion de una clinica en una caida de todas.
 */
export async function mandarRecordatorios(
  opciones: OpcionesDelTrabajo = {},
): Promise<ResumenDelTrabajo> {
  const { registro } = opciones
  const ahora = opciones.ahora ?? new Date()
  const horas = opciones.horasAntes ?? horasAntes()

  const porClinica: ResumenDeUnaClinica[] = []

  for (const clinicaId of Object.values(mapaDeClinicas())) {
    try {
      porClinica.push(await unaClinica(clinicaId, ahora, horas, opciones))
    } catch (fallo) {
      const error = fallo instanceof Error ? fallo.message : String(fallo)
      registro?.error(
        `  ⚠  La clinica ${clinicaId} se queda sin recordatorios en esta pasada: ${error}`,
      )
      porClinica.push({ clinicaId, candidatas: 0, mandados: 0, yaEstaban: 0, fallidos: 0, error })
    }
  }

  return {
    clinicas: porClinica.length,
    mandados: porClinica.reduce((n, c) => n + c.mandados, 0),
    yaEstaban: porClinica.reduce((n, c) => n + c.yaEstaban, 0),
    fallidos: porClinica.reduce((n, c) => n + c.fallidos, 0),
    porClinica,
  }
}

async function unaClinica(
  clinicaId: string,
  ahora: Date,
  horas: number,
  opciones: OpcionesDelTrabajo,
): Promise<ResumenDeUnaClinica> {
  const { registro } = opciones
  const bot = opciones.cliente ? opciones.cliente(clinicaId) : clienteDe(clinicaId)

  // El mapa dice de quien es este numero; la base lo confirma. Si no cuadran,
  // esto lanza y la clinica se queda fuera de la pasada. Ver la cabecera.
  const phoneNumberId = numeroDeLaClinica(clinicaId)
  const clinica = await exigirClinicaDelCanal(clinicaId, phoneNumberId, bot)

  const citas = await citasPorRecordar(bot, ahora, horas)

  let mandados = 0
  let yaEstaban = 0
  let fallidos = 0

  for (const cita of citas) {
    const paciente = cita.pacientes
    if (!paciente) {
      // La clave foranea es NOT NULL, asi que esto no deberia pasar nunca. Si
      // pasa, es que la RLS de `pacientes` no dejo ver la fila: se dice, no se
      // adivina un telefono.
      registro?.error(`  ⚠  La cita ${cita.id} no trae paciente legible. No se recuerda.`)
      fallidos += 1
      continue
    }

    const reclamada = await reclamar(bot, clinicaId, cita.id)
    if (!reclamada) {
      yaEstaban += 1
      continue
    }

    const salio = await mandarUno(
      { clinicaId, phoneNumberId, zonaHoraria: clinica.zona_horaria, nombreClinica: clinica.nombre },
      cita,
      paciente,
      bot,
      opciones,
    )

    if (salio) mandados += 1
    else fallidos += 1
  }

  return { clinicaId, candidatas: citas.length, mandados, yaEstaban, fallidos }
}

/**
 * Las citas a las que les toca.
 *
 * NI UN FILTRO DE SEGURIDAD EN LA CONSULTA. No hay `.eq('clinica_id', ...)`:
 * eso ya lo aplica `citas_bot_select` y repetirlo taparia una politica rota en
 * vez de delatarla. Lo vigila
 * `tests/barandillas/04-sin-filtro-en-codigo.test.ts`, en cuyo alcance entra
 * este archivo por nombrar `ClienteDelBot`.
 *
 * `estado` e `inicio` SI se filtran, y no es lo mismo: no son predicados de
 * seguridad que la RLS aplique, son la pregunta que se esta haciendo. Es la
 * misma distincion que ESTADO_F3 §3.2 hizo con `telefono_e164`.
 *
 * Solo `confirmada`: una provisional es una retencion de diez minutos y no
 * llega viva a las veinticuatro horas — de eso se encarga
 * `mantenimiento.liberar_provisionales()`, que la cancela.
 *
 * La lista de columnas va ENTERA EN UNA LINEA. Partirla con `+` deja a
 * `supabase-js` sin poder deducir la forma de la respuesta y obliga a un cast
 * que apaga el compilador justo donde hace falta (ESTADO_F5 §9).
 */
async function citasPorRecordar(
  bot: ClienteDelBot,
  ahora: Date,
  horas: number,
): Promise<CitaPorRecordar[]> {
  const ventana = ventanaDeRecordatorios(ahora, horas)

  const { data, error } = await bot
    .from('citas')
    .select('id, inicio, pacientes(nombre, telefono_e164)')
    .eq('estado', 'confirmada')
    .gte('inicio', ventana.desde)
    .lte('inicio', ventana.hasta)
    .order('inicio')

  if (error) throw new Error(`Leyendo las citas por recordar: ${error.message}`)
  return (data ?? []) as CitaPorRecordar[]
}

/**
 * Coge la marca. `true` si es la primera vez; `false` si ya estaba.
 *
 * El `23505` no es un error: es el indice unico haciendo su trabajo. Mismo
 * patron que `anotarEvento()` en el webhook.
 */
async function reclamar(
  bot: ClienteDelBot,
  clinicaId: string,
  citaId: string,
): Promise<boolean> {
  const { data, error } = await bot
    .from('recordatorios')
    .insert({ clinica_id: clinicaId, cita_id: citaId })
    .select('id')
    .single()

  if (data) return true
  if (error?.code === '23505') return false
  throw new Error(`Reclamando el recordatorio de la cita ${citaId}: ${error?.message}`)
}

type Destinatario = { nombre: string; telefono_e164: string }
type Contexto = {
  clinicaId: string
  phoneNumberId: string
  zonaHoraria: string
  nombreClinica: string
}

/**
 * Manda uno y deja constancia.
 *
 * POR PLANTILLA Y NO POR TEXTO LIBRE, y no es una eleccion de estilo: un
 * paciente que pidio cita hace una semana tiene la ventana de 24 h cerrada, y
 * fuera de la ventana el texto libre lo rechaza Meta con 131047. La plantilla
 * es lo unico que llega.
 */
async function mandarUno(
  contexto: Contexto,
  cita: CitaPorRecordar,
  paciente: Destinatario,
  bot: ClienteDelBot,
  opciones: OpcionesDelTrabajo,
): Promise<boolean> {
  const { registro } = opciones

  const fecha = fechaParaElPaciente(cita.inicio, contexto.zonaHoraria)
  const hora = horaParaElPaciente(cita.inicio, contexto.zonaHoraria)

  const plantilla = recordatorioCita({
    nombre: paciente.nombre,
    clinica: contexto.nombreClinica,
    fecha,
    hora,
    citaId: cita.id,
  })

  // Lo que se guarda en `mensajes` es lo que dice la plantilla aprobada, con
  // sus huecos ya rellenos. No lleva el motivo de la visita: ver la cabecera.
  const texto =
    `Hola ${paciente.nombre}, te recordamos tu cita en ${contexto.nombreClinica} ` +
    `el ${fecha} a las ${hora}.`

  // La conversacion, para que la respuesta del paciente caiga en el mismo hilo.
  // Puede no existir: una cita que cogio recepcion por telefono no nacio de
  // ninguna conversacion. `conversacionAbierta()` la crea si hace falta, y es
  // idempotente por indice unico parcial.
  const conversacion = await conversacionAbierta(
    contexto.clinicaId,
    paciente.telefono_e164,
    bot,
  )

  const mensajeId = await guardarMensaje(
    {
      clinicaId: contexto.clinicaId,
      conversacionId: conversacion.id,
      rol: 'bot',
      texto,
      estadoEntrega: 'pendiente',
    },
    bot,
  )

  try {
    const salida = await enviarPlantilla(
      { phoneNumberId: contexto.phoneNumberId, telefono: paciente.telefono_e164 },
      plantilla,
      opciones.envio ?? {},
    )

    if (mensajeId !== null && salida.waMessageId) {
      await bot
        .from('mensajes')
        .update({ wa_message_id: salida.waMessageId, estado_entrega: 'enviado' })
        .eq('id', mensajeId)
    }

    return true
  } catch (fallo) {
    const porque = fallo instanceof Error ? fallo.message : String(fallo)

    // La marca YA esta cogida y no se puede soltar: `recordatorios` no tiene
    // politica de DELETE para nadie, a proposito. Asi que este recordatorio no
    // sale y no se reintenta, y lo unico que queda es que se sepa.
    registro?.error(
      `  ⚠  El recordatorio de la cita ${cita.id} NO ha salido y no se reintentara: ${porque}`,
    )

    if (mensajeId !== null) {
      await bot.from('mensajes').update({ estado_entrega: 'fallido' }).eq('id', mensajeId)
    }

    await anotarEnEventos(
      contexto.clinicaId,
      'recordatorio_fallido',
      { cita: cita.id },
      bot,
      registro,
    )

    return false
  }
}
