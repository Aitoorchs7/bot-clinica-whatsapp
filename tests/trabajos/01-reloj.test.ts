/**
 * La hora que lee el paciente sale del reloj de LA CLINICA.
 *
 * Nivel 1: sin red y sin base. Todo lo de aqui es puro, así que el cambio de
 * hora de marzo se comprueba en septiembre.
 *
 * ================ POR QUE ESTE ARCHIVO EXISTE ================
 *
 * Es el FALLO #3 del contrato de F6. El trabajo programado corre en Vercel,
 * que corre en UTC. La forma natural de escribir la hora de una cita
 * —`new Date(cita.inicio)` y formatear— usa el reloj del proceso, así que en
 * verano un paciente de Madrid recibiría su cita de las 10:00 como si fuera a
 * las 08:00 y se presentaría dos horas antes.
 *
 * No se comprueba «que llama a date-fns-tz»: se comprueba el resultado con
 * instantes reales a los dos lados del cambio de hora, que es lo único que
 * distingue un formateo correcto de uno que funciona en invierno.
 */
import { describe, expect, it } from 'vitest'

import {
  fechaParaElPaciente,
  horaParaElPaciente,
  ventanaDeRecordatorios,
} from '@/lib/trabajos/reloj'

const MADRID = 'Europe/Madrid'
/** Canarias va una hora por detrás de la península. Misma España, otra hora. */
const CANARIAS = 'Atlantic/Canary'

describe('la hora es la de la clinica, no la del servidor', () => {
  it('VERANO: 08:00 UTC son las 10:00 en Madrid', () => {
    // 2026-07-15, horario de verano peninsular: UTC+02:00.
    expect(horaParaElPaciente('2026-07-15T08:00:00Z', MADRID)).toBe('10:00')
  })

  it('INVIERNO: el mismo 08:00 UTC son las 09:00 en Madrid', () => {
    // 2026-01-15, UTC+01:00. Si alguien «arreglara» esto sumando dos horas
    // fijas, esta prueba se pondría roja y la de arriba seguiría verde.
    expect(horaParaElPaciente('2026-01-15T08:00:00Z', MADRID)).toBe('09:00')
  })

  it('la misma cita, dos clinicas, dos horas distintas', () => {
    // La prueba de que la zona se usa de verdad y no está clavada a Madrid.
    const instante = '2026-07-15T08:00:00Z'
    expect(horaParaElPaciente(instante, MADRID)).toBe('10:00')
    expect(horaParaElPaciente(instante, CANARIAS)).toBe('09:00')
  })

  it('la hora va en veinticuatro, que es como se dice aqui', () => {
    // Un «5:30 PM» en un WhatsApp de una clinica española canta.
    expect(horaParaElPaciente('2026-07-15T15:30:00Z', MADRID)).toBe('17:30')
  })

  it('LA NOCHE ANTERIOR: la zona tambien cambia el DIA, no solo la hora', () => {
    // 23:30 UTC del día 14 son las 01:30 del día 15 en Madrid. Si la fecha se
    // formateara en UTC, el recordatorio diría el día de antes — y un paciente
    // que lee «martes» cuando su cita es el miércoles no viene.
    expect(fechaParaElPaciente('2026-07-14T23:30:00Z', MADRID)).toBe('miércoles 15 de julio')
    expect(horaParaElPaciente('2026-07-14T23:30:00Z', MADRID)).toBe('01:30')
  })

  it('la fecha se escribe en castellano y en minusculas, como se habla', () => {
    expect(fechaParaElPaciente('2026-09-22T08:00:00Z', MADRID)).toBe('martes 22 de septiembre')
  })

  it('sin ano: un recordatorio no es una carta del banco', () => {
    expect(fechaParaElPaciente('2026-09-22T08:00:00Z', MADRID)).not.toContain('2026')
  })
})

describe('la ventana de los recordatorios', () => {
  const ahora = new Date('2026-09-20T10:00:00Z')

  it('mira hacia delante y nunca hacia atras', () => {
    const { desde, hasta } = ventanaDeRecordatorios(ahora, 24)

    // El borde de abajo es AHORA: una cita que ya empezó no necesita aviso.
    expect(desde).toBe('2026-09-20T10:00:00.000Z')
    expect(hasta).toBe('2026-09-21T10:00:00.000Z')
  })

  it('la ventana es ancha a proposito, y se puede solapar sin riesgo', () => {
    // Lo que impide mandar dos veces es el unique de la base, no la puntualidad
    // del cron. Dos pasadas con una hora de diferencia cubren casi lo mismo, y
    // eso es DESEABLE: una ventana estrecha que se salta una pasada deja a esos
    // pacientes sin aviso y nadie se entera.
    const primera = ventanaDeRecordatorios(ahora, 24)
    const segunda = ventanaDeRecordatorios(new Date('2026-09-20T11:00:00Z'), 24)

    expect(segunda.desde < primera.hasta).toBe(true)
  })
})
