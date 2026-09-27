/**
 * CONTRATO · La SEGUNDA vuelta del bucle de herramientas contra Gemini.
 *
 * =========================================================================
 * POR QUE HACIA FALTA ESTE ARCHIVO, Y QUE SE ESCAPABA SIN EL
 * =========================================================================
 *
 * `01-gemini.test.ts` comprueba que el SDK acepta nuestras declaraciones y que
 * lo que vuelve tiene la forma que parseamos. Todas sus llamadas son de UNA
 * vuelta: se manda un mensaje y se mira la respuesta. Ninguna devuelve al
 * modelo una llamada que el modelo acaba de hacer.
 *
 * Y el bucle de `cerebro.ts` vive justo de eso: el modelo pide una
 * herramienta, se ejecuta, y en la vuelta siguiente se le manda de vuelta SU
 * PROPIA llamada mas el resultado. Esa vuelta —la segunda, la que hace que una
 * cita se llegue a coger— no la tocaba ninguna prueba contra el modelo real.
 *
 * La auditoria de fuga con Gemini (F7) se la encontro de frente:
 *
 *   ApiError 400 INVALID_ARGUMENT
 *   «Function call is missing a thought_signature in functionCall parts. This
 *    is required for tools to work correctly... function call
 *    `default_api:escalar_a_recepcion`, position 3.»
 *
 * Gemini 3 pone una firma opaca en cada `functionCall` que predice y EXIGE que
 * se le devuelva. La trampa esta en donde vive: no dentro del `FunctionCall`,
 * sino al lado, en la `Part` que lo envuelve. El arreglo esta en `gemini.ts`
 * (F7, ver FIRMA DE PENSAMIENTO alli).
 *
 * =========================================================================
 * POR QUE ESTA PRUEBA ESTUVO ROJA DESPUES DE ESTAR ARREGLADO EL FALLO
 * =========================================================================
 *
 * Nacio para REPRODUCIR el 400, asi que armaba la vuelta 2 a mano. Cuando el
 * arreglo entro, entro en el bucle de `cerebro.ts` — no en la copia de aqui,
 * que siguio tirando la firma por el camino. Resultado: 400 otra vez, y una
 * prueba de contrato afirmando que el bot estaba roto cuando no lo estaba.
 * Es la leccion de F7 al derecho: una prueba que copia al llamante comprueba
 * a la copia. Por eso el turno de vuelta lo arma ahora
 * `turnoConLasLlamadas()`, la misma funcion —no una igual— que usa el bucle.
 *
 * =========================================================================
 * LAS TRES COSAS QUE MIRA, Y POR QUE SON TRES Y NO UNA
 * =========================================================================
 *
 *   1 · Gemini manda la firma, y nuestro parser la saca de la Part.
 *   2 · SIN ella, Gemini CORTA con un 400. Es el control negativo, y es lo
 *       que hace que el punto 3 signifique algo: sin este, un verde podria
 *       ser «Gemini ya no las pide» y nadie se enteraria de que el bot
 *       dejo de mandarla.
 *   3 · CON ella, por donde pasa de verdad, la segunda vuelta entra.
 *
 * Gasta TRES peticiones de las veinte diarias del tier gratuito. Por eso esta
 * separada de la bateria de fuga: se puede correr sola.
 *
 *   GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato/02-bucle-herramientas
 */
import { expect, it } from 'vitest'

import { avisarSiNoHayGemini } from '../ayuda/entorno'
import { describeConGemini } from '../ayuda/vivo'

import { MODELO_CEREBRO, SIN_PENSAR, modeloDeGoogle, turnoConLasLlamadas } from '@/lib/bot/gemini'
import type { TurnoDelModelo } from '@/lib/bot/gemini'
import { declaraciones } from '@/lib/bot/herramientas'

avisarSiNoHayGemini()

describeConGemini('el bucle de herramientas, dos vueltas', () => {
  it(
    'la firma de pensamiento vuelve con su llamada, y Gemini acepta la segunda vuelta',
    async () => {
      const modelo = modeloDeGoogle()
      const saludo: TurnoDelModelo = {
        rol: 'usuario',
        partes: [{ tipo: 'texto', texto: 'Hola, soy yo otra vez' }],
      }

      // Vuelta 1 · que pida algo. `repasar_ficha` no lleva argumentos, asi que
      // es la que menos cosas puede salir mal por el camino.
      const primera = await modelo({
        modelo: MODELO_CEREBRO,
        sistema:
          'Eres el asistente de una clinica dental. Antes de nada, mira la ficha del ' +
          'paciente con repasar_ficha. No contestes sin haberla mirado.',
        turnos: [saludo],
        herramientas: declaraciones(),
        presupuestoPensamiento: SIN_PENSAR,
      })

      expect(
        primera.llamadas.length,
        'El modelo no ha pedido ninguna herramienta, asi que no hay segunda vuelta que ' +
          'probar. No es un fallo del bucle: repite la prueba.',
      ).toBeGreaterThan(0)

      const llamada = primera.llamadas[0]!

      // 1 · La firma llega. El SDK la deja en la Part que envuelve al
      // functionCall, y `respuesta.functionCalls` —el atajo comodo— la tira
      // sin avisar; si esto se pone rojo, es que `preguntar()` volvio al atajo.
      expect(
        llamada.firma,
        'Gemini no ha mandado firma, o `preguntar()` no la esta recogiendo de la Part. ' +
          'Sin firma no hay nada que devolver y el punto 3 saldria verde por ausencia.',
      ).toBeTypeOf('string')

      const resultado: TurnoDelModelo = {
        rol: 'usuario',
        partes: [
          {
            tipo: 'resultado',
            nombre: llamada.nombre,
            resultado: { ok: true, conocido: true, nombre: 'Ana', proximas_citas: [] },
          },
        ],
      }
      const sistema = 'Eres el asistente de una clinica dental. Saluda a Ana por su nombre.'

      // 2 · El control negativo. Se le manda SU llamada sin la firma —que es
      // exactamente lo que hacia el bot antes del arreglo— y tiene que cortar.
      // Si algun dia esto pasa a estar verde, Gemini habra dejado de exigirla:
      // buena noticia, pero entonces el punto 3 ya no demuestra nada y hay que
      // releer este archivo antes de fiarse de el.
      const sinFirma: TurnoDelModelo = {
        rol: 'modelo',
        partes: [{ tipo: 'llamada', nombre: llamada.nombre, argumentos: llamada.argumentos }],
      }

      const corte = await modelo({
        modelo: MODELO_CEREBRO,
        sistema,
        turnos: [saludo, sinFirma, resultado],
        herramientas: declaraciones(),
        presupuestoPensamiento: SIN_PENSAR,
      }).then(
        () => null,
        (fallo: unknown) => (fallo instanceof Error ? fallo.message : String(fallo)),
      )

      expect(
        corte,
        'Sin la firma, Gemini tendria que cortar con un 400 y ha contestado tan tranquilo.',
      ).not.toBeNull()
      expect(corte).toMatch(/thought_signature/)
      expect(corte).toMatch(/400|INVALID_ARGUMENT/)

      // 3 · Y ahora por donde pasa de verdad: el turno lo arma la misma funcion
      // que usa el bucle de `cerebro.ts`, no una copia de ella.
      const segunda = await modelo({
        modelo: MODELO_CEREBRO,
        sistema,
        turnos: [saludo, turnoConLasLlamadas([llamada]), resultado],
        herramientas: declaraciones(),
        presupuestoPensamiento: SIN_PENSAR,
      })

      expect(segunda.texto.length + segunda.llamadas.length).toBeGreaterThan(0)
    },
    180_000,
  )
})
