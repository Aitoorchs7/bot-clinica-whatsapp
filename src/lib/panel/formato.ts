/**
 * Fechas, horas y etiquetas, en castellano de Espana.
 *
 * Todo lo que se ensena en el panel pasa por aqui. Dos motivos:
 *
 *   1. LA ZONA HORARIA ES LA DE LA CLINICA, no la del navegador ni la del
 *      servidor. Una cita guardada como 2026-09-20T08:00:00Z son las 10:00 en
 *      Madrid, y recepcion tiene que leer «10:00». Renderizar la hora en el
 *      cliente con el reloj del cliente es como se consigue que la agenda diga
 *      una cosa en el mostrador y otra en el movil del dueno de vacaciones.
 *
 *   2. Los enums de la base son vocabulario cerrado y en corto
 *      (`no_presentada`). Eso esta bien para Postgres y no para una persona.
 *      Aqui se traducen a lo que diria alguien en el mostrador, y en un solo
 *      sitio: si manana «provisional» pasa a llamarse «sin confirmar», se
 *      cambia una linea.
 */
import { addDays, startOfDay, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'

import type { Database } from '@/tipos/bd'

type EstadoCita = Database['public']['Enums']['estado_cita']
type EstadoEscalado = Database['public']['Enums']['estado_escalado']
type EstadoConversacion = Database['public']['Enums']['estado_conversacion']
type MotivoEscalado = Database['public']['Enums']['motivo_escalado']
type MotivoVisita = Database['public']['Enums']['motivo_visita']
type QuienReserva = Database['public']['Enums']['quien_reserva']
type EstadoEntrega = Database['public']['Enums']['estado_entrega']

// -----------------------------------------------------------------------------
// Rangos
// -----------------------------------------------------------------------------

export type Rango = { readonly desde: string; readonly hasta: string }

/** El dia natural de la clinica, en instantes UTC para preguntarle a Postgres. */
export function rangoDelDia(ahora: Date, zonaHoraria: string, saltoDeDias = 0): Rango {
  const enLaClinica = toZonedTime(ahora, zonaHoraria)
  const inicio = addDays(startOfDay(enLaClinica), saltoDeDias)
  return {
    desde: fromZonedTime(inicio, zonaHoraria).toISOString(),
    hasta: fromZonedTime(addDays(inicio, 1), zonaHoraria).toISOString(),
  }
}

/** La semana natural de la clinica. Empieza en lunes, como el calendario de aqui. */
export function rangoDeLaSemana(ahora: Date, zonaHoraria: string, saltoDeSemanas = 0): Rango {
  const enLaClinica = toZonedTime(ahora, zonaHoraria)
  const lunes = addDays(startOfWeek(enLaClinica, { weekStartsOn: 1 }), saltoDeSemanas * 7)
  return {
    desde: fromZonedTime(lunes, zonaHoraria).toISOString(),
    hasta: fromZonedTime(addDays(lunes, 7), zonaHoraria).toISOString(),
  }
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

export function hora(instante: string, zonaHoraria: string): string {
  return formatInTimeZone(new Date(instante), zonaHoraria, 'HH:mm')
}

export function diaLargo(instante: string, zonaHoraria: string): string {
  return formatInTimeZone(new Date(instante), zonaHoraria, "EEEE d 'de' MMMM", { locale: es })
}

export function diaCorto(instante: string, zonaHoraria: string): string {
  return formatInTimeZone(new Date(instante), zonaHoraria, 'EEE d MMM', { locale: es })
}

export function fechaYHora(instante: string, zonaHoraria: string): string {
  return formatInTimeZone(new Date(instante), zonaHoraria, "d MMM yyyy 'a las' HH:mm", {
    locale: es,
  })
}

/** Para los `<input type="datetime-local">`: la hora de la clinica, sin zona. */
export function paraFormulario(instante: string, zonaHoraria: string): string {
  return formatInTimeZone(new Date(instante), zonaHoraria, "yyyy-MM-dd'T'HH:mm")
}

/** El camino de vuelta: lo que escribio recepcion, en el instante que toca. */
export function desdeFormulario(local: string, zonaHoraria: string): Date {
  return fromZonedTime(local, zonaHoraria)
}

// -----------------------------------------------------------------------------
// Etiquetas
// -----------------------------------------------------------------------------

export const ESTADO_CITA: Readonly<Record<EstadoCita, string>> = {
  provisional: 'Sin confirmar',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Atendida',
  no_presentada: 'No se presentó',
}

export const ESTADO_ESCALADO: Readonly<Record<EstadoEscalado, string>> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  resuelto: 'Resuelto',
}

export const ESTADO_CONVERSACION: Readonly<Record<EstadoConversacion, string>> = {
  abierta: 'Abierta',
  cerrada: 'Cerrada',
  escalada: 'Escalada',
}

export const MOTIVO_ESCALADO: Readonly<Record<MotivoEscalado, string>> = {
  pregunta_fuera_de_faq: 'Preguntó algo que no está aprobado',
  pidio_persona: 'Pidió hablar con una persona',
  datos_incompletos: 'Faltaban datos para la cita',
  urgencia_grave: 'Urgencia',
  no_entendido: 'No se entendió',
}

export const MOTIVO_VISITA: Readonly<Record<MotivoVisita, string>> = {
  revision: 'Revisión',
  urgencia: 'Urgencia',
  estetica: 'Estética',
  ortodoncia: 'Ortodoncia',
  otro: 'Otro',
}

export const QUIEN_RESERVA: Readonly<Record<QuienReserva, string>> = {
  bot: 'Asistente',
  recepcion: 'Recepción',
  paciente: 'Paciente',
}

export const ESTADO_ENTREGA: Readonly<Record<EstadoEntrega, string>> = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  entregado: 'Entregado',
  leido: 'Leído',
  fallido: 'No se pudo entregar',
}

/** El tono de cada estado, para la etiqueta de color. Ver `etiqueta.tsx`. */
export const TONO_CITA: Readonly<Record<EstadoCita, 'verde' | 'amarillo' | 'rojo' | 'neutro'>> = {
  provisional: 'amarillo',
  confirmada: 'verde',
  cancelada: 'neutro',
  completada: 'neutro',
  no_presentada: 'rojo',
}

export const TONO_ESCALADO: Readonly<
  Record<EstadoEscalado, 'verde' | 'amarillo' | 'rojo' | 'neutro'>
> = {
  pendiente: 'rojo',
  en_curso: 'amarillo',
  resuelto: 'verde',
}
