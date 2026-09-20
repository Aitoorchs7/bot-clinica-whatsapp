/**
 * La ventana de historial y el recordatorio del final.
 *
 * El recordatorio se comprueba contra los bloques DE VERDAD, leidos de
 * `contenido/bloques/` con el mismo lector que usa `pnpm bloques`. Es el patron
 * que fijo F2: si se comprobara contra bloques inventados, renumerar el 30 en
 * la carpeta real dejaria el recordatorio mudo y esta carpeta seguiria verde.
 */
import { describe, expect, it } from 'vitest'

import { leerBloques } from '../../scripts/bloques-a-filas.mjs'

import {
  CABECERA_RECORDATORIO,
  ORDENES_DEL_RECORDATORIO,
  PAREJAS,
  recordatorio,
  ventana,
  type Turno,
} from '@/lib/bot/historial'
import type { BloqueMontable } from '@/lib/barandillas/montaje'
import type { ConOrigen } from '@/lib/barandillas/origen'

type BloqueLeido = {
  archivo: string
  titulo: string
  orden: number
  activo: boolean
  contenido: string
}

/** Los bloques reales, en la forma que le llega al montador. */
function bloquesReales(): ConOrigen<BloqueMontable>[] {
  return (leerBloques() as BloqueLeido[])
    .filter((bloque) => bloque.activo && !bloque.titulo.startsWith('_'))
    .map((bloque) => ({
      dato: {
        id: `id-${bloque.orden}`,
        orden: bloque.orden,
        titulo: bloque.titulo,
        contenido: bloque.contenido,
        activo: bloque.activo,
      },
      origen: `bloques_prompt#id-${bloque.orden}` as const,
    }))
}

const VALORES = {
  clinica: 'Clinica Ejemplo',
  bot: 'Marta',
  trato: 'Trata de usted.',
  privacidad: 'https://ejemplo.test/privacidad',
  fecha_hoy: 'jueves, 24 de septiembre de 2026, 09:00',
  datos: 'Telefono de recepcion: 912345678',
  tratamientos: 'Revision (REV) - 30 min.',
  faq: 'P: ¿Aparcamiento?\nR: Hay parking en la puerta.',
  horario: 'Lunes a viernes: 09:00 a 14:00',
}

function turnos(...pares: [Turno['rol'], string][]): Turno[] {
  return pares.map(([rol, texto]) => ({ rol, texto }))
}

describe('la ventana son diez parejas, no la conversacion entera', () => {
  it('con menos de diez, entra todo', () => {
    const corta = turnos(
      ['paciente', 'hola'],
      ['bot', 'buenas'],
      ['paciente', 'quiero cita'],
    )
    expect(ventana(corta)).toEqual(corta)
  })

  it('con treinta parejas, solo entran las diez ultimas', () => {
    const larga: Turno[] = []
    for (let i = 0; i < 30; i += 1) {
      larga.push({ rol: 'paciente', texto: `pregunta ${i}` })
      larga.push({ rol: 'bot', texto: `respuesta ${i}` })
    }

    const recortada = ventana(larga)
    expect(recortada).toHaveLength(PAREJAS * 2)
    expect(recortada[0]).toEqual({ rol: 'paciente', texto: 'pregunta 20' })
    expect(recortada.at(-1)).toEqual({ rol: 'bot', texto: 'respuesta 29' })
  })

  it('el corte cae siempre donde el paciente empezo a hablar', () => {
    const larga: Turno[] = []
    for (let i = 0; i < 20; i += 1) {
      larga.push({ rol: 'paciente', texto: `p${i}` })
      larga.push({ rol: 'bot', texto: `b${i}` })
    }
    expect(ventana(larga)[0]!.rol).toBe('paciente')
  })

  it('cuenta intervenciones del paciente, no mensajes de dos en dos', () => {
    // En WhatsApp nadie alterna limpiamente: llegan cuatro seguidos y el bot
    // contesta una vez. Cortar de dos en dos partiria por un sitio arbitrario.
    const arracimada = turnos(
      ...(Array.from({ length: 12 }, (_, i) => ['paciente', `p${i}`]) as [Turno['rol'], string][]),
    )
    const recortada = ventana(arracimada)
    expect(recortada).toHaveLength(PAREJAS)
    expect(recortada[0]!.texto).toBe('p2')
  })

  it('las lineas de sistema no cuentan como pareja pero viajan con la suya', () => {
    const conSistema = turnos(
      ['paciente', 'hola'],
      ['sistema', 'nota de voz transcrita'],
      ['bot', 'buenas'],
    )
    expect(ventana(conSistema, 1)).toEqual(conSistema)
  })

  it('una conversacion vacia no revienta', () => {
    expect(ventana([])).toEqual([])
  })

  it('pedir cero parejas no devuelve nada', () => {
    expect(ventana(turnos(['paciente', 'hola']), 0)).toEqual([])
  })
})

describe('el recordatorio sale de los bloques, no de una cadena en el codigo', () => {
  const bloques = bloquesReales()
  const recuerdo = recordatorio(bloques, VALORES)

  it('los bloques de verdad existen y estan activos', () => {
    // Si esto fallara, todo lo de abajo estaria comprobando el vacio.
    expect(bloques.length).toBeGreaterThan(5)
  })

  it('encuentra los tres bloques duros y no falta ninguno', () => {
    expect(recuerdo.ordenes).toEqual([...ORDENES_DEL_RECORDATORIO])
    expect(recuerdo.faltan).toEqual([])
  })

  it('lleva las dos reglas que mas caras salen si se diluyen', () => {
    // No inventar un hueco, y nada de consejo medico. Literales de los bloques.
    expect(recuerdo.texto).toContain('Jamás inventes un hueco')
    expect(recuerdo.texto).toContain('Nunca des consejo médico')
  })

  it('lleva la regla de no escribir sin confirmacion', () => {
    expect(recuerdo.texto).toContain('Espera a que diga que sí')
  })

  it('lleva lo de dolor, hinchazon, golpe o sangrado', () => {
    expect(recuerdo.texto).toContain('hinchazón')
    expect(recuerdo.texto).toContain('sangrado')
  })

  it('el texto es EL del bloque, palabra por palabra', () => {
    // La prueba de que no hay una copia parafraseada en el codigo: se compara
    // con el contenido del bloque tal y como esta en la carpeta.
    const bloque30 = bloques.find((b) => b.dato.orden === 30)!
    const primeraLinea = bloque30.dato.contenido.trim().split('\n')[0]!
    expect(recuerdo.texto).toContain(primeraLinea)
  })

  it('los huecos vienen sustituidos, igual que en el prompt de arriba', () => {
    expect(recuerdo.texto).toContain(VALORES.horario)
    expect(recuerdo.texto).not.toContain('{{horario}}')
  })

  it('va precedido de una cabecera que lo pone por encima de lo anterior', () => {
    expect(recuerdo.texto.startsWith(CABECERA_RECORDATORIO)).toBe(true)
  })

  it('los bloques salen en orden', () => {
    expect([...recuerdo.ordenes]).toEqual([...recuerdo.ordenes].sort((a, b) => a - b))
  })
})

describe('si alguien renumera los bloques, el recordatorio GRITA', () => {
  it('avisa por el registro nombrando los que faltan', () => {
    const avisos: string[] = []
    const registro = { info: () => {}, error: (m: string) => avisos.push(m) }

    const soloUno = bloquesReales().filter((b) => b.dato.orden === 30)
    const recuerdo = recordatorio(soloUno, VALORES, registro)

    expect(recuerdo.faltan).toEqual([50, 60])
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('50, 60')
    expect(avisos[0]).toContain('ORDENES_DEL_RECORDATORIO')
  })

  it('y si no encuentra ninguno, devuelve vacio en vez de una cabecera suelta', () => {
    // Una cabecera que anuncia reglas y no trae ninguna es peor que nada: el
    // modelo leeria «RECUERDA POR ENCIMA DE TODO:» y detras, el silencio.
    const avisos: string[] = []
    const recuerdo = recordatorio([], VALORES, {
      info: () => {},
      error: (m: string) => avisos.push(m),
    })

    expect(recuerdo.texto).toBe('')
    expect(avisos[0]).toContain('NO se estan reinyectando')
  })
})
