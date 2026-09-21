/**
 * La firma de pensamiento, de ida y de vuelta. Nivel 1: sin red, sin base de
 * datos, sin modelo.
 *
 * QUE GARANTIZA ESTE ARCHIVO Y QUE NO
 *
 * No garantiza que Gemini acepte la peticion: eso solo lo puede decir Gemini, y
 * lo pregunta `tests/bot-contrato/02-bucle-herramientas`. Lo que garantiza es
 * lo unico que esta de nuestro lado: que la firma que llego con una llamada
 * VUELVE con esa llamada, y en el sitio donde el SDK la espera —al lado del
 * `functionCall`, no dentro—.
 *
 * Es la mitad barata del arreglo de ESTADO_F7 §4.1, y corre siempre. La otra
 * mitad cuesta dos peticiones de las veinte diarias.
 *
 * POR QUE HAY UNA PRUEBA QUE MIRA `respuesta.functionCalls`
 *
 * Porque el fallo original no fue olvidar un campo: fue coger el atajo comodo
 * del SDK, que devuelve los `FunctionCall` desnudos y tira la firma por el
 * camino sin decir nada. La prueba de abajo reproduce ese atajo y demuestra
 * que pierde la firma. Si algun dia alguien «simplifica» `preguntar()`
 * volviendo a `respuesta.functionCalls`, esa prueba seguira verde —porque
 * describe el atajo, no nuestro codigo— pero las otras dos se pondran rojas.
 */
import { describe, expect, it } from 'vitest'

import { aContenido, type TurnoDelModelo } from '@/lib/bot/gemini'

const FIRMA = 'ZmlybWEtZGUtcHJ1ZWJhLW9wYWNh'

describe('aContenido · la firma vuelve donde el SDK la espera', () => {
  it('la pone AL LADO del functionCall, no dentro', () => {
    const turnos: TurnoDelModelo[] = [
      {
        rol: 'modelo',
        partes: [
          {
            tipo: 'llamada',
            nombre: 'consultar_huecos',
            argumentos: { tratamiento: 'revision', dia: '2026-10-01' },
            firma: FIRMA,
          },
        ],
      },
    ]

    const parte = aContenido(turnos)[0]!.parts![0]!

    expect(parte.functionCall).toEqual({
      name: 'consultar_huecos',
      args: { tratamiento: 'revision', dia: '2026-10-01' },
    })
    // Al lado. Metida dentro del functionCall, el SDK no la ve y vuelve el 400.
    expect(parte.thoughtSignature).toBe(FIRMA)
    expect(JSON.stringify(parte.functionCall)).not.toContain(FIRMA)
  })

  it('una llamada sin firma no se inventa ninguna', () => {
    // No todas la traen, y mandar `thoughtSignature: undefined` no es lo mismo
    // que no mandar el campo.
    const parte = aContenido([
      {
        rol: 'modelo',
        partes: [{ tipo: 'llamada', nombre: 'repasar_ficha', argumentos: {} }],
      },
    ])[0]!.parts![0]!

    expect(parte.functionCall).toEqual({ name: 'repasar_ficha', args: {} })
    expect('thoughtSignature' in parte).toBe(false)
  })

  it('cada llamada se lleva LA SUYA cuando el modelo pide dos a la vez', () => {
    // El caso que se rompe en silencio si alguien guarda la firma en una sola
    // variable: el modelo pide dos herramientas en el mismo turno y las dos
    // acaban con la firma de la primera. Gemini rechaza la segunda.
    const partes = aContenido([
      {
        rol: 'modelo',
        partes: [
          { tipo: 'llamada', nombre: 'anotar', argumentos: { campo: 'nombre' }, firma: 'AAA' },
          { tipo: 'llamada', nombre: 'anotar', argumentos: { campo: 'telefono' }, firma: 'BBB' },
        ],
      },
    ])[0]!.parts!

    expect(partes.map((p) => p.thoughtSignature)).toEqual(['AAA', 'BBB'])
  })

  it('un resultado de herramienta no lleva firma: no es una prediccion', () => {
    const parte = aContenido([
      {
        rol: 'usuario',
        partes: [{ tipo: 'resultado', nombre: 'repasar_ficha', resultado: { ok: true } }],
      },
    ])[0]!.parts![0]!

    expect(parte.functionResponse).toBeTruthy()
    expect('thoughtSignature' in parte).toBe(false)
  })
})

describe('el atajo que causo el 400', () => {
  it('`respuesta.functionCalls` no puede llevar la firma, porque no vive ahi', () => {
    // La forma que devuelve la API: la firma es hermana del functionCall.
    const comoLoDevuelveLaApi = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: { name: 'escalar_a_recepcion', args: { motivo: 'pidio_persona' } },
                thoughtSignature: FIRMA,
              },
            ],
          },
        },
      ],
      // El atajo del SDK, que aplana las partes y se queda solo con esto.
      functionCalls: [{ name: 'escalar_a_recepcion', args: { motivo: 'pidio_persona' } }],
    }

    expect(JSON.stringify(comoLoDevuelveLaApi.functionCalls)).not.toContain(FIRMA)
    expect(JSON.stringify(comoLoDevuelveLaApi.candidates[0]!.content.parts)).toContain(FIRMA)
  })
})
