/**
 * El muestreo, en seco: una lista entra, unas pocas salen.
 *
 * La prueba que manda aqui es la de la INCLUSION: toda opcion ofrecida tiene
 * que ser un elemento de la rejilla que entro. Es la mitad pura del bug de V1
 * —la otra mitad, contra la base de datos de verdad, esta en
 * tests/bot-vivo/01-huecos-y-cita.test.ts—, y se comprueba aqui ademas porque
 * aqui se puede hacer con cien listas distintas en un milisegundo.
 */
import { describe, expect, it } from 'vitest'

import {
  OPCIONES_MAXIMAS,
  muestrear,
  porInstante,
  repartir,
  type Hueco,
} from '@/lib/bot/muestreo'

const MADRID = 'Europe/Madrid'

/**
 * Una rejilla como la que devuelve el RPC: cada `paso` minutos, dentro de los
 * tramos, y una fila por gabinete libre.
 */
function rejilla(
  dia: string,
  tramos: [number, number][],
  opciones: { paso?: number; duracion?: number; gabinetes?: string[] } = {},
): Hueco[] {
  const { paso = 15, duracion = 30, gabinetes = ['gab-1'] } = opciones
  const huecos: Hueco[] = []

  for (const [desde, hasta] of tramos) {
    for (let minuto = desde * 60; minuto + duracion <= hasta * 60; minuto += paso) {
      // +02:00 es el verano de Madrid; lo que importa aqui es que sea un
      // instante fijo, no que acierte el cambio de hora.
      const hh = String(Math.floor(minuto / 60)).padStart(2, '0')
      const mm = String(minuto % 60).padStart(2, '0')
      const inicio = new Date(`${dia}T${hh}:${mm}:00+02:00`)
      const fin = new Date(inicio.getTime() + duracion * 60_000)
      for (const gabinete of gabinetes) {
        huecos.push({
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
          gabinete_id: gabinete,
        })
      }
    }
  }

  return huecos
}

const UN_JUEVES = rejilla('2026-09-24', [
  [9, 14],
  [15.5, 20],
])

describe('la rejilla que devuelve el RPC es tan grande como se dijo', () => {
  it('un dia normal con un gabinete pasa de treinta ranuras', () => {
    // Si esto bajara de treinta, el muestreo dejaria de hacer falta y esta
    // carpeta entera sobraria. Fija el supuesto del que parte la fase.
    expect(UN_JUEVES.length).toBeGreaterThan(30)
  })

  it('con dos gabinetes se duplica, y son la misma hora repetida', () => {
    const dos = rejilla('2026-09-24', [[9, 14]], { gabinetes: ['gab-1', 'gab-2'] })
    const uno = rejilla('2026-09-24', [[9, 14]], { gabinetes: ['gab-1'] })
    expect(dos.length).toBe(uno.length * 2)
    expect(porInstante(dos).length).toBe(uno.length)
  })
})

describe('LA REGLA: no se ofrece nada que no viniera en la rejilla', () => {
  it('toda opcion es un elemento de la entrada, instante a instante', () => {
    const entrada = new Set(UN_JUEVES.map((hueco) => hueco.inicio))
    const { opciones } = muestrear(UN_JUEVES, MADRID)

    expect(opciones.length).toBeGreaterThan(0)
    for (const opcion of opciones) {
      expect(entrada.has(opcion.inicio)).toBe(true)
    }
  })

  it('y tambien el `fin`, no solo el `inicio`', () => {
    // Si alguien recalculara el fin sumando la duracion, aqui se veria: un
    // minuto de diferencia y `crear_cita` reservaria otra cosa.
    const porInicio = new Map(UN_JUEVES.map((hueco) => [hueco.inicio, hueco]))
    for (const opcion of muestrear(UN_JUEVES, MADRID).opciones) {
      expect(opcion.fin).toBe(porInicio.get(opcion.inicio)!.fin)
    }
  })

  it('con cualquier rejilla, cualquier numero de opciones', () => {
    // Cien formas distintas de agenda. Barata de correr y caza el redondeo que
    // un solo caso de ejemplo no veria.
    for (let dia = 1; dia <= 25; dia += 1) {
      const fecha = `2026-09-${String(dia).padStart(2, '0')}`
      const rejillas = [
        rejilla(fecha, [[9, 14]]),
        rejilla(fecha, [[9, 10]]),
        rejilla(fecha, [[8, 20]], { paso: 10, duracion: 45 }),
        rejilla(fecha, [[16, 17]], { gabinetes: ['a', 'b', 'c'] }),
      ]

      for (const entrada of rejillas) {
        const permitidos = new Set(entrada.map((hueco) => hueco.inicio))
        for (let cuantas = 1; cuantas <= OPCIONES_MAXIMAS; cuantas += 1) {
          for (const opcion of muestrear(entrada, MADRID, cuantas).opciones) {
            expect(permitidos.has(opcion.inicio)).toBe(true)
          }
        }
      }
    }
  })

  it('una rejilla vacia no produce ninguna opcion inventada', () => {
    const { opciones, totalLibres } = muestrear([], MADRID)
    expect(opciones).toEqual([])
    expect(totalLibres).toBe(0)
  })
})

describe('se ofrecen pocas, y repartidas', () => {
  it('tres por defecto, aunque haya cuarenta libres', () => {
    expect(muestrear(UN_JUEVES, MADRID).opciones).toHaveLength(3)
  })

  it('nunca mas de cuatro, por mucho que se pidan', () => {
    expect(muestrear(UN_JUEVES, MADRID, 99).opciones.length).toBeLessThanOrEqual(
      OPCIONES_MAXIMAS,
    )
  })

  it('si solo hay dos horas libres, se ofrecen las dos y no se repite ninguna', () => {
    const pocas = rejilla('2026-09-24', [[9, 10]], { paso: 30, duracion: 30 })
    const { opciones } = muestrear(pocas, MADRID)
    expect(opciones.length).toBeLessThanOrEqual(porInstante(pocas).length)
    expect(new Set(opciones.map((o) => o.inicio)).size).toBe(opciones.length)
  })

  it('no se ofrece la misma hora dos veces aunque haya tres gabinetes', () => {
    const tres = rejilla('2026-09-24', [[9, 14]], { gabinetes: ['a', 'b', 'c'] })
    const { opciones } = muestrear(tres, MADRID)
    expect(new Set(opciones.map((o) => o.inicio)).size).toBe(opciones.length)
  })

  it('las opciones cubren la manana y la tarde, no tres seguidas a primera hora', () => {
    // «Tengo hueco a las 9:00, a las 9:15 o a las 9:30» no es ofrecer opciones.
    const { opciones } = muestrear(UN_JUEVES, MADRID)
    const horas = opciones.map((o) => new Date(o.inicio).getTime())
    const margen = horas[horas.length - 1]! - horas[0]!
    expect(margen).toBeGreaterThan(3 * 3_600_000)
  })

  it('prefiere las horas en punto cuando las hay', () => {
    const { opciones } = muestrear(UN_JUEVES, MADRID)
    const enPunto = opciones.filter((o) => o.cuando.endsWith(':00'))
    expect(enPunto.length).toBeGreaterThanOrEqual(2)
  })
})

describe('es estable entre dos llamadas', () => {
  it('la misma rejilla da exactamente las mismas opciones', () => {
    // Un bot que ofrece horas distintas cada vez que se le pregunta lo mismo es
    // imposible de depurar, y al paciente le parece que se lo esta inventando.
    const una = muestrear(UN_JUEVES, MADRID)
    const otra = muestrear(UN_JUEVES, MADRID)
    expect(otra.opciones).toEqual(una.opciones)
  })

  it('y no depende del orden en que venga la rejilla', () => {
    const desordenada = [...UN_JUEVES].reverse()
    expect(muestrear(desordenada, MADRID).opciones.map((o) => o.inicio)).toEqual(
      muestrear(UN_JUEVES, MADRID).opciones.map((o) => o.inicio),
    )
  })
})

describe('lo que se le dice al paciente', () => {
  it('lleva el dia y la hora en castellano y en la zona de la clinica', () => {
    const { opciones } = muestrear(UN_JUEVES, MADRID)
    expect(opciones[0]!.cuando).toMatch(/jueves 24 de septiembre, \d{2}:\d{2}/)
  })

  it('la misma hora se dice distinta en Canarias, que es una hora menos', () => {
    const madrid = muestrear(UN_JUEVES, MADRID).opciones[0]!
    const canarias = muestrear(UN_JUEVES, 'Atlantic/Canary').opciones[0]!
    expect(canarias.inicio).toBe(madrid.inicio)
    expect(canarias.cuando).not.toBe(madrid.cuando)
  })
})

describe('repartir, por dentro', () => {
  it('nunca devuelve mas de lo que se le pide', () => {
    for (let cuantas = 1; cuantas <= 4; cuantas += 1) {
      expect(repartir(porInstante(UN_JUEVES), cuantas, MADRID).length).toBeLessThanOrEqual(
        cuantas,
      )
    }
  })

  it('con cero o menos no devuelve nada', () => {
    expect(repartir(porInstante(UN_JUEVES), 0, MADRID)).toEqual([])
    expect(repartir(porInstante(UN_JUEVES), -3, MADRID)).toEqual([])
  })
})
