/**
 * El payload de los botones de `recordatorio_cita`, leído a la defensiva.
 *
 * Nivel 1: puro, sin red y sin base.
 *
 * ================ LO QUE ESTE ARCHIVO NO PRUEBA ================
 *
 * No prueba que confirmar una cita sea seguro. `leerPayloadDeCita()` solo dice
 * qué forma tiene lo que llegó; de quién es la cita lo decide la RLS y lo
 * comprueba `confirmar.ts` contra la base, y eso se prueba en
 * `tests/trabajos-vivo/04-boton.test.ts`.
 *
 * Aquí se comprueba la criba, que es lo que impide que basura llegue a la
 * consulta, y —lo que más importa— que el que LEE el payload y el que lo
 * ESCRIBE no puedan separarse.
 */
import { describe, expect, it } from 'vitest'

import { leerPayloadDeCita } from '@/lib/whatsapp/botones'
import {
  PAYLOAD_CANCELAR,
  PAYLOAD_CONFIRMAR,
  recordatorioCita,
} from '@/lib/whatsapp/plantillas'

const CITA = '3f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b'

describe('lo que se escribio en la plantilla es lo que se lee de vuelta', () => {
  it('LA QUE MANDA: el payload que monta la plantilla lo entiende el parser', () => {
    // Sin esta, los dos lados pueden separarse sin que nada se ponga rojo: el
    // payload saldría como `CONFIRMAR:<id>` y el parser buscaría `CONFIRM:<id>`,
    // y lo único que se vería es que los botones «no hacen nada». Se lee del
    // objeto que se manda de verdad, no de una cadena escrita a mano aquí.
    const plantilla = recordatorioCita({
      nombre: 'Lucía',
      clinica: 'Clínica de prueba',
      fecha: 'martes 22 de septiembre',
      hora: '10:00',
      citaId: CITA,
    })

    const botones = plantilla.components.filter((c) => c.type === 'button')
    expect(botones).toHaveLength(2)

    const leidos = botones.map((b) =>
      leerPayloadDeCita((b as { parameters: { payload: string }[] }).parameters[0]!.payload),
    )

    expect(leidos).toEqual([
      { accion: 'confirmar', citaId: CITA },
      { accion: 'cancelar', citaId: CITA },
    ])
  })
})

describe('la criba', () => {
  it('CONFIRMAR con un uuid: se entiende', () => {
    expect(leerPayloadDeCita(`${PAYLOAD_CONFIRMAR}:${CITA}`)).toEqual({
      accion: 'confirmar',
      citaId: CITA,
    })
  })

  it('CANCELAR con un uuid: se entiende', () => {
    expect(leerPayloadDeCita(`${PAYLOAD_CANCELAR}:${CITA}`)).toEqual({
      accion: 'cancelar',
      citaId: CITA,
    })
  })

  it('un uuid en mayusculas tambien vale', () => {
    // Nadie lo manda así hoy, pero rechazarlo sería un «no hace nada» difícil
    // de diagnosticar el día que algo normalice el payload.
    expect(leerPayloadDeCita(`${PAYLOAD_CONFIRMAR}:${CITA.toUpperCase()}`)?.accion).toBe('confirmar')
  })

  it.each([
    ['sin dos puntos', 'CONFIRMAR'],
    ['sin identificador', 'CONFIRMAR:'],
    ['el identificador no es un uuid', 'CONFIRMAR:12345'],
    ['un uuid a medias', 'CONFIRMAR:3f2a9c1e-8b7d-4e6f'],
    ['una accion que no existe', `BORRAR:${CITA}`],
    ['minusculas: el prefijo es exacto', `confirmar:${CITA}`],
    ['la etiqueta que ve el paciente, no el payload', 'Confirmar'],
    ['vacio', ''],
    ['solo dos puntos', ':'],
  ])('no se entiende: %s', (_caso, payload) => {
    expect(leerPayloadDeCita(payload)).toBeUndefined()
  })

  it('UNA INYECCION NI SIQUIERA LLEGA A LA CONSULTA', () => {
    // La garantía de verdad es que supabase-js parametriza, no esto. Pero un
    // identificador que no tiene forma de uuid no tiene por qué llegar tan
    // lejos, y esta criba es gratis.
    expect(leerPayloadDeCita("CONFIRMAR:' or 1=1--")).toBeUndefined()
    expect(leerPayloadDeCita(`CONFIRMAR:${CITA}' or '1'='1`)).toBeUndefined()
  })

  it('un payload de otro tipo de boton se deja pasar sin tocarlo', () => {
    // Devolver `undefined` es lo que hace que `procesar.ts` siga por el camino
    // de siempre. Si esto devolviera algo, un botón de otra plantilla dejaría
    // de llegar al motor.
    expect(leerPayloadDeCita('MENU:precios')).toBeUndefined()
  })
})
