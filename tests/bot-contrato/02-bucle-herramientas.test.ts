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
 * Es un fallo NUESTRO, no de cuota. `gemini.ts` traduce nuestras `Parte` a
 * `Content` del SDK y no arrastra el `thoughtSignature` que Gemini 3 pone en
 * cada `functionCall`: ni `Respuesta.llamadas` lo expone, ni `aContenido()` lo
 * vuelve a poner. El SDK instalado si tiene el campo
 * (`Part.thoughtSignature`, genai.d.ts), asi que no falta nada que instalar:
 * falta llevarlo de ida y vuelta.
 *
 * ESTA PRUEBA NO ARREGLA NADA. Deja el fallo REPRODUCIDO en el sitio mas
 * barato que hay —dos llamadas— para que quien lo arregle sepa cuando lo ha
 * arreglado. Mientras no se arregle, se pone roja, y eso es lo correcto: el
 * bucle de herramientas contra `gemini-3.6-flash` esta roto hoy en produccion
 * y no se informa de otra manera.
 *
 * Gasta DOS peticiones de las veinte diarias del tier gratuito. Por eso esta
 * separada de la bateria de fuga: se puede correr sola.
 *
 *   GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato/02-bucle-herramientas
 */
import { expect, it } from 'vitest'

import { avisarSiNoHayGemini } from '../ayuda/entorno'
import { describeConGemini } from '../ayuda/vivo'

import { MODELO_CEREBRO, SIN_PENSAR, modeloDeGoogle } from '@/lib/bot/gemini'
import type { TurnoDelModelo } from '@/lib/bot/gemini'
import { declaraciones } from '@/lib/bot/herramientas'

avisarSiNoHayGemini()

describeConGemini('el bucle de herramientas, dos vueltas', () => {
  it(
    'se le puede devolver al modelo una llamada suya y el resultado',
    async () => {
      const modelo = modeloDeGoogle()

      // Vuelta 1 · que pida algo. `repasar_ficha` no lleva argumentos, asi que
      // es la que menos cosas puede salir mal por el camino.
      const primera = await modelo({
        modelo: MODELO_CEREBRO,
        sistema:
          'Eres el asistente de una clinica dental. Antes de nada, mira la ficha del ' +
          'paciente con repasar_ficha. No contestes sin haberla mirado.',
        turnos: [{ rol: 'usuario', partes: [{ tipo: 'texto', texto: 'Hola, soy yo otra vez' }] }],
        herramientas: declaraciones(),
        presupuestoPensamiento: SIN_PENSAR,
      })

      expect(
        primera.llamadas.length,
        'El modelo no ha pedido ninguna herramienta, asi que no hay segunda vuelta que ' +
          'probar. No es un fallo del bucle: repite la prueba.',
      ).toBeGreaterThan(0)

      const llamada = primera.llamadas[0]!

      // Vuelta 2 · exactamente lo que arma `cerebro.ts`: su llamada, y debajo
      // el resultado. Aqui es donde salta el 400.
      const turnos: TurnoDelModelo[] = [
        { rol: 'usuario', partes: [{ tipo: 'texto', texto: 'Hola, soy yo otra vez' }] },
        {
          rol: 'modelo',
          partes: [
            { tipo: 'llamada', nombre: llamada.nombre, argumentos: llamada.argumentos },
          ],
        },
        {
          rol: 'usuario',
          partes: [
            {
              tipo: 'resultado',
              nombre: llamada.nombre,
              resultado: { ok: true, conocido: true, nombre: 'Ana', proximas_citas: [] },
            },
          ],
        },
      ]

      const segunda = await modelo({
        modelo: MODELO_CEREBRO,
        sistema: 'Eres el asistente de una clinica dental. Saluda a Ana por su nombre.',
        turnos,
        herramientas: declaraciones(),
        presupuestoPensamiento: SIN_PENSAR,
      })

      // Si esto llega, el bucle de herramientas funciona contra el modelo real.
      expect(segunda.texto.length + segunda.llamadas.length).toBeGreaterThan(0)
    },
    120_000,
  )
})
