/**
 * El montador, sin base de datos.
 *
 * Corre en una maquina recien clonada y en el trabajo `comprobaciones-estaticas`
 * de CI, igual que 00-rls-activada: lo que comprueba es la mitad del prompt que
 * no depende de ninguna fila.
 */
import { describe, expect, it } from 'vitest'

import { aplicarGuardia, type Cargado } from '@/lib/barandillas/filtro'
import type { FilaConfig, FilaFaq, FilaHorario, FilaTratamiento } from '@/lib/barandillas/filtro'
import {
  CLAVE_PRIVACIDAD,
  HUECOS_CONOCIDOS,
  escribirDatos,
  escribirFaq,
  escribirPrivacidad,
  escribirFechaHoy,
  escribirHorario,
  escribirTratamientos,
  escribirTrato,
  montarPrompt,
  ordenarBloques,
  sustituir,
  type BloqueMontable,
} from '@/lib/barandillas/montaje'
import type { Registro } from '@/lib/barandillas/contador'

const CLINICA = '11111111-1111-4111-8111-111111111111'

/** Envuelve filas inventadas con la misma forma que devuelve filtro.ts. */
function cargado<T extends { id: string | number }>(tabla: string, filas: T[]): Cargado<T> {
  return aplicarGuardia(tabla, filas, () => true)
}

function bloque(parcial: Partial<BloqueMontable> & { id: string }): BloqueMontable {
  return {
    orden: 10,
    titulo: 'Un bloque',
    contenido: 'texto',
    activo: true,
    ...parcial,
  }
}

/** Un registro de mentira, para leer lo que se habria escrito en el log. */
function registroDePrueba() {
  const avisos: string[] = []
  const errores: string[] = []
  const registro: Registro = {
    info: (mensaje) => avisos.push(mensaje),
    error: (mensaje) => errores.push(mensaje),
  }
  return { registro, avisos, errores }
}

describe('sustituir', () => {
  const valores = { clinica: 'Dental Sol', bot: 'Marta' }

  it('rellena los huecos que conoce', () => {
    const { texto } = sustituir('Eres {{bot}} de {{clinica}}.', valores)
    expect(texto).toBe('Eres Marta de Dental Sol.')
  })

  it('tolera espacios dentro de las llaves', () => {
    expect(sustituir('{{ bot }}', valores).texto).toBe('Marta')
  })

  it('un hueco desconocido se deja TAL CUAL y se avisa', () => {
    const { texto, desconocidos } = sustituir('Abrimos {{horarios}} y ya.', valores)
    // En plural, que no existe. Ni se borra ni revienta el montaje.
    expect(texto).toBe('Abrimos {{horarios}} y ya.')
    expect(desconocidos).toEqual(['horarios'])
  })

  it('no vuelve a mirar lo que acaba de meter', () => {
    // Si una respuesta de la FAQ trae llaves dentro, se quedan como texto. Una
    // sustitucion que se repita sobre si misma es una via para que el contenido
    // de una fila acabe pidiendo otra.
    const { texto, desconocidos } = sustituir('{{clinica}}', { clinica: '{{bot}}', bot: 'Marta' })
    expect(texto).toBe('{{bot}}')
    expect(desconocidos).toEqual([])
  })

  it('los huecos de la documentacion son los que hay', () => {
    expect([...HUECOS_CONOCIDOS]).toEqual([
      'clinica',
      'bot',
      'trato',
      'privacidad',
      'fecha_hoy',
      'datos',
      'tratamientos',
      'faq',
      'horario',
    ])
  })
})

describe('montarPrompt', () => {
  it('ordena por `orden`, no por el orden de llegada', () => {
    const montado = montarPrompt(
      [
        bloque({ id: 'c', orden: 90, contenido: 'ultimo' }),
        bloque({ id: 'a', orden: 5, contenido: 'primero' }),
        bloque({ id: 'b', orden: 20, contenido: 'medio' }),
      ],
      {},
    )
    expect(montado.texto).toBe('primero\n\nmedio\n\nultimo')
  })

  it('descarta activo = false', () => {
    const montado = montarPrompt(
      [
        bloque({ id: 'a', orden: 10, contenido: 'entra' }),
        bloque({ id: 'b', orden: 20, contenido: 'NO entra', activo: false }),
      ],
      {},
    )
    expect(montado.texto).toBe('entra')
    expect(montado.descartados).toEqual([
      { origen: 'bloques_prompt#b', titulo: 'Un bloque', motivo: 'inactivo' },
    ])
  })

  it('descarta los titulos que empiezan por guion bajo', () => {
    const montado = montarPrompt(
      [
        bloque({ id: 'a', orden: 10, contenido: 'entra' }),
        bloque({ id: 'b', orden: 20, titulo: '_apuntes', contenido: 'NO entra' }),
      ],
      {},
    )
    expect(montado.texto).toBe('entra')
    expect(montado.descartados[0]!.motivo).toBe('guion_bajo')
  })

  it('un hueco desconocido no rompe el montaje, y sale en el log', () => {
    const { registro, errores } = registroDePrueba()
    const montado = montarPrompt(
      [bloque({ id: 'a', contenido: 'Hoy es {{fecha_de_hoy}}, en {{clinica}}.' })],
      { clinica: 'Dental Sol' },
      {},
      registro,
    )

    expect(montado.texto).toBe('Hoy es {{fecha_de_hoy}}, en Dental Sol.')
    expect(montado.huecosDesconocidos).toEqual(['fecha_de_hoy'])
    expect(errores.join('\n')).toContain('{{fecha_de_hoy}}')
  })

  it('el orden es estable entre dos montajes iguales', () => {
    // Un prompt que cambia solo entre dos ejecuciones es imposible de depurar,
    // y rompe cualquier cache de prompt que se ponga mas adelante.
    const bloques = [
      bloque({ id: 'a', orden: 10, titulo: 'B', contenido: 'uno' }),
      bloque({ id: 'b', orden: 10, titulo: 'A', contenido: 'dos' }),
    ]
    expect(ordenarBloques(bloques).map((b) => b.id)).toEqual(['b', 'a'])
    expect(ordenarBloques([...bloques].reverse()).map((b) => b.id)).toEqual(['b', 'a'])
  })
})

describe('como se escribe cada hueco', () => {
  it('{{datos}} abre con el telefono de recepcion', () => {
    const config = cargado<FilaConfig>('config', [
      { id: 'c1', clinica_id: CLINICA, clave: 'direccion', valor: 'Calle Mayor 1', publico: true },
    ])
    expect(escribirDatos(config, '+34910000001')).toBe(
      'Telefono de recepcion: +34910000001\ndireccion: Calle Mayor 1',
    )
  })

  it('{{datos}} sin config dice que no hay, en vez de quedarse en blanco', () => {
    const texto = escribirDatos(cargado<FilaConfig>('config', []), '+34910000001')
    expect(texto).toContain('no tiene ningun dato publicado')
  })

  it('{{privacidad}} sale sola y literal, sin una palabra alrededor', () => {
    const config = cargado<FilaConfig>('config', [
      {
        id: 'c2',
        clinica_id: CLINICA,
        clave: CLAVE_PRIVACIDAD,
        valor: 'https://dentalsol.example/privacidad',
        publico: true,
      },
    ])
    // Ni «puedes consultarla en», ni comillas, ni punto final: cuanto menos
    // texto acompañe a la URL, menos hay que reescribir para colocarla.
    expect(escribirPrivacidad(config)).toBe('https://dentalsol.example/privacidad')
  })

  it('{{privacidad}} sin configurar no se inventa un enlace', () => {
    expect(escribirPrivacidad(cargado<FilaConfig>('config', []))).toContain(
      'no ha configurado su politica de privacidad',
    )
    // Y desde luego no puede salir algo que parezca una direccion.
    expect(escribirPrivacidad(cargado<FilaConfig>('config', []))).not.toContain('http')
  })

  it('el enlace NO se repite dentro de {{datos}}', () => {
    // Dos copias del mismo enlace, una como «dato» y otra como texto literal,
    // es una invitacion a parafrasear la primera.
    const config = cargado<FilaConfig>('config', [
      { id: 'c1', clinica_id: CLINICA, clave: 'direccion', valor: 'Calle Mayor 1', publico: true },
      {
        id: 'c2',
        clinica_id: CLINICA,
        clave: CLAVE_PRIVACIDAD,
        valor: 'https://dentalsol.example/privacidad',
        publico: true,
      },
    ])
    const texto = escribirDatos(config, '+34910000001')
    expect(texto).toContain('direccion: Calle Mayor 1')
    expect(texto).not.toContain(CLAVE_PRIVACIDAD)
    expect(texto).not.toContain('https://dentalsol.example/privacidad')
  })

  it('{{tratamientos}} lleva codigo, duracion y la frase de la clinica', () => {
    const texto = escribirTratamientos(
      cargado<FilaTratamiento>('tratamientos', [
        {
          id: 't1',
          clinica_id: CLINICA,
          codigo: 'REV',
          nombre: 'Revision',
          duracion_min: 30,
          frase_bot: 'Una revision dura media hora.',
          publico: true,
          activo: true,
        },
      ]),
    )
    expect(texto).toBe('Revision (REV) - 30 min. Una revision dura media hora.')
  })

  it('{{faq}} sale en pregunta y respuesta, sin tocar la respuesta', () => {
    const texto = escribirFaq(
      cargado<FilaFaq>('faq', [
        {
          id: 'f1',
          clinica_id: CLINICA,
          pregunta: '¿Donde estais?',
          respuesta_aprobada: 'En la calle Mayor 1.',
          publico: true,
        },
      ]),
    )
    expect(texto).toBe('P: ¿Donde estais?\nR: En la calle Mayor 1.')
  })

  it('{{horario}} agrupa los dias que abren igual', () => {
    const filas: FilaHorario[] = []
    for (let dia = 1; dia <= 5; dia += 1) {
      filas.push(
        {
          id: `h${dia}a`,
          clinica_id: CLINICA,
          dia_semana: dia,
          hora_inicio: '09:00:00',
          hora_fin: '14:00:00',
        },
        {
          id: `h${dia}b`,
          clinica_id: CLINICA,
          dia_semana: dia,
          hora_inicio: '15:30:00',
          hora_fin: '20:00:00',
        },
      )
    }
    filas.push({
      id: 'h6',
      clinica_id: CLINICA,
      dia_semana: 6,
      hora_inicio: '10:00:00',
      hora_fin: '13:00:00',
    })

    expect(escribirHorario(cargado('horarios', filas))).toBe(
      'Lunes a viernes: 09:00 a 14:00 y 15:30 a 20:00\nSabado: 10:00 a 13:00',
    )
  })

  it('{{horario}} sin tramos lo dice, para que el modelo no rellene el hueco', () => {
    expect(escribirHorario(cargado<FilaHorario>('horarios', []))).toContain(
      'no tiene ningun horario configurado',
    )
  })

  it('{{fecha_hoy}} va en la zona horaria de la clinica', () => {
    const momento = new Date('2026-09-17T19:30:00Z')
    expect(escribirFechaHoy(momento, 'Europe/Madrid')).toBe(
      'jueves, 17 de septiembre de 2026, 21:30',
    )
    // Una clinica en Canarias no puede leer la hora peninsular: calcularia mal
    // «esta tarde» y «mañana» a partir de las 22:00.
    expect(escribirFechaHoy(momento, 'Atlantic/Canary')).toBe(
      'jueves, 17 de septiembre de 2026, 20:30',
    )
  })

  it('{{trato}} sale de la columna, no del texto del bloque', () => {
    expect(escribirTrato('usted')).toContain('Trata de usted')
    expect(escribirTrato('tu')).toContain('Tutea')
  })
})
