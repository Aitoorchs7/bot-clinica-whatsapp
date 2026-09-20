/**
 * Nivel 3 de ESTADO_F3 §1: Gemini DE VERDAD. Apagado salvo `GEMINI_VIVO=1`.
 *
 *     GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato
 *
 * QUE COMPRUEBA Y QUE NO
 *
 * Comprueba el CONTRATO: que el SDK sigue aceptando nuestras declaraciones, que
 * los nombres de parametro que PLAN.md avisaba que cambian siguen existiendo, y
 * que lo que vuelve tiene la forma que parsea `gemini.ts`.
 *
 * NO comprueba lo que el modelo contesta. Ni una asercion sobre su prosa, ni
 * sobre que herramienta elige, ni sobre el orden en que las pide. Eso cambia
 * entre dos tiradas sin que nadie toque nada, y una bateria cuyo resultado
 * cambia solo no demuestra nada —es la leccion de F1, donde el hallazgo mas
 * serio fue una suite no determinista—.
 *
 * Por eso estas pruebas son deterministas POR CONSTRUCCION: afirman que se
 * habla el mismo idioma, no que se diga lo mismo.
 *
 * Y son pocas a proposito: el tier gratuito tiene limite DIARIO. Una suite que
 * lo agota no vuelve a estar verde hasta manana, y eso ensena a la gente a
 * ignorar el rojo.
 */
import { expect, it } from 'vitest'

import { avisarSiNoHayGemini } from '../ayuda/entorno'
import { describeConGemini } from '../ayuda/vivo'

// Si se corre esta carpeta sin el interruptor, que se vea por que sale vacia.
avisarSiNoHayGemini()

import { CATALOGO, declaraciones, esHerramienta } from '@/lib/bot/herramientas'
import {
  MODELO_CEREBRO,
  MODELO_CLASIFICADOR,
  SIN_PENSAR,
  modeloDeGoogle,
} from '@/lib/bot/gemini'
import { clasificar } from '@/lib/bot/clasificador'

describeConGemini('el contrato con el SDK de Google', () => {
  const modelo = modeloDeGoogle()

  it('acepta las seis declaraciones sin protestar', async () => {
    // Si Google cambiara `parametersJsonSchema`, o dejara de tragar un esquema
    // con `additionalProperties: false`, se veria aqui y en ningun otro sitio.
    const respuesta = await modelo({
      modelo: MODELO_CEREBRO,
      sistema:
        'Eres el asistente de una clinica dental. Usa las herramientas cuando hagan falta.',
      turnos: [
        {
          rol: 'usuario',
          partes: [{ tipo: 'texto', texto: 'Me llamo Ana. Apúntalo.' }],
        },
      ],
      herramientas: declaraciones(),
      presupuestoPensamiento: SIN_PENSAR,
    })

    // Contesta algo: texto, una llamada, o las dos. Lo que no vale es nada.
    expect(respuesta.texto.length + respuesta.llamadas.length).toBeGreaterThan(0)
  }, 120_000)

  it('si pide una herramienta, es una de las seis y sus argumentos validan', async () => {
    const respuesta = await modelo({
      modelo: MODELO_CEREBRO,
      sistema: [
        'Eres el asistente de una clinica dental.',
        'El paciente acaba de decirte su nombre. Apúntalo con la herramienta `anotar`.',
        'No contestes con texto: usa la herramienta.',
      ].join('\n'),
      turnos: [{ rol: 'usuario', partes: [{ tipo: 'texto', texto: 'Me llamo Ana Pérez' }] }],
      herramientas: declaraciones(),
      presupuestoPensamiento: SIN_PENSAR,
    })

    // Si no pidio ninguna, no se falla: el modelo esta en su derecho y esta
    // prueba no afirma nada sobre lo que elige. Solo sobre lo que vale si elige.
    for (const llamada of respuesta.llamadas) {
      expect(
        esHerramienta(llamada.nombre),
        `El modelo ha pedido «${llamada.nombre}», que no es una de las seis.`,
      ).toBe(true)

      if (esHerramienta(llamada.nombre)) {
        const validacion = CATALOGO[llamada.nombre].esquema.safeParse(llamada.argumentos)
        expect(
          validacion.success,
          `«${llamada.nombre}» con ${JSON.stringify(llamada.argumentos)} no valida: ` +
            (validacion.success ? '' : JSON.stringify(validacion.error.issues)),
        ).toBe(true)
      }
    }
  }, 120_000)

  it('el clasificador devuelve un JSON que se puede leer', async () => {
    // El mensaje no lleva ninguna palabra de las reglas duras, para que llegue
    // de verdad al modelo y no lo corte la capa 1.
    const clasificacion = await clasificar('Buenas, ¿a qué hora abrís los martes?', modelo)

    expect(clasificacion.porRegla).toBe(false)
    expect(['saludo', 'cita', 'pregunta', 'urgencia', 'persona', 'otro']).toContain(
      clasificacion.intencion,
    )
    expect(['ninguna', 'alta']).toContain(clasificacion.urgencia)
    expect(typeof clasificacion.escalar).toBe('boolean')
  }, 120_000)

  it('los dos modelos del plan existen y responden', async () => {
    for (const cual of [MODELO_CEREBRO, MODELO_CLASIFICADOR]) {
      const respuesta = await modelo({
        modelo: cual,
        turnos: [{ rol: 'usuario', partes: [{ tipo: 'texto', texto: 'Di "ok".' }] }],
        presupuestoPensamiento: SIN_PENSAR,
      })
      expect(respuesta.texto.length, `${cual} no ha contestado nada`).toBeGreaterThan(0)
    }
  }, 120_000)

  it('thinkingBudget 0 se acepta y cuenta los tokens', async () => {
    // Es el parametro del que avisaba PLAN.md. Que se acepte sin error es lo
    // que se comprueba; cuantos tokens salgan da igual.
    const respuesta = await modelo({
      modelo: MODELO_CEREBRO,
      turnos: [{ rol: 'usuario', partes: [{ tipo: 'texto', texto: '¿Cuánto es 2 + 2?' }] }],
      presupuestoPensamiento: SIN_PENSAR,
    })

    expect(respuesta.texto.length).toBeGreaterThan(0)
    expect(respuesta.tokensEntrada ?? 0).toBeGreaterThan(0)
  }, 120_000)
})
