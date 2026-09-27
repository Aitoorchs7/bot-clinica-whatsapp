/**
 * La frontera con el SDK de Google, y nada mas.
 *
 * Todo lo que este proyecto tiene que decirle a un modelo pasa por el tipo
 * `Modelo`: una funcion, una peticion, una respuesta. El cerebro y el
 * clasificador no importan `@google/genai` ni saben que existe.
 *
 * ESTO ES LA COSTURA POR LA QUE SE SIMULA, Y POR ESO ES TAN FINA
 *
 * ESTADO_F3 §1 lo razona entero: la suite por defecto no gasta ni una peticion
 * de Gemini, asi que casi todas las pruebas inyectan un `Modelo` de mentira. Lo
 * que decide si esas pruebas sirven es DONDE se corta.
 *
 * Aqui se corta en el ultimo sitio posible: justo antes de la llamada HTTP. El
 * bucle de herramientas, la validacion con Zod, la puerta de la confirmacion y
 * el montaje del prompt quedan todos del lado de aca, y corren de verdad en
 * todas las pruebas. Un doble que imitara el bucle comprobaria el doble, no el
 * bot.
 *
 * Es el mismo principio que hizo comprobable `aplicarGuardia` en F2: se aparta
 * lo que habla con fuera para poder alimentar lo de dentro con datos
 * inventados.
 *
 * LOS NOMBRES DE PARAMETRO DEL SDK ESTAN VERIFICADOS, NO RECORDADOS
 *
 * PLAN.md avisa de que los de Google cambian mas a menudo que los de Anthropic
 * y que esta parte venia escrita para otro SDK. Comprobados contra
 * `node_modules/@google/genai/dist/genai.d.ts` de la version 2.22.0 que hay
 * instalada:
 *
 *   - `config.thinkingConfig.thinkingBudget` — 0 desactiva, -1 automatico
 *   - `config.systemInstruction`
 *   - `config.tools[].functionDeclarations[].parametersJsonSchema`
 *   - `respuesta.functionCalls`
 *
 * Si un dia dejan de existir, lo que se rompe es este archivo y solo este.
 *
 * FIRMA DE PENSAMIENTO (`thoughtSignature`) — ANADIDO EN F7, Y COSTO UN 400
 *
 * Gemini 3 pone una firma opaca en cada `functionCall` que predice, y EXIGE
 * que se le devuelva cuando se le manda esa llamada de vuelta. Si no:
 *
 *   400 INVALID_ARGUMENT · «Function call is missing a thought_signature in
 *   functionCall parts. This is required for tools to work correctly...»
 *
 * O sea: la SEGUNDA vuelta del bucle de herramientas —la que hace que una
 * cita se llegue a coger— moria. En produccion.
 *
 * La trampa esta en DONDE vive la firma: no dentro del `FunctionCall`, sino al
 * lado, en la `Part` que lo envuelve. `respuesta.functionCalls`, que es el
 * atajo comodo del SDK, devuelve los `FunctionCall` desnudos y la tira por el
 * camino sin avisar. Por eso `preguntar()` recorre las partes a mano.
 *
 * Y no lo cazo nadie hasta F7 porque `tests/bot-contrato/01-gemini` hace todas
 * sus llamadas de UNA vuelta: ninguna le devuelve al modelo una llamada que el
 * modelo acababa de hacer. El unico sitio donde eso pasaba era produccion.
 * Ahora hay una prueba que lo hace: `02-bucle-herramientas`.
 */
import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from '@google/genai'

/**
 * POR QUE NO SON LOS `2.5` QUE DECIA EL PLAN AL EMPEZAR
 *
 * `PLAN.md` y `.claude/CLAUDE.md` fijaban `gemini-2.5-flash` y
 * `gemini-2.5-flash-lite`. Los dos devuelven 404 con una clave nueva de Google
 * AI Studio:
 *
 *   «This model models/gemini-2.5-flash is no longer available to new users.
 *    Please update your code to use models/gemini-3.6-flash»
 *
 * No es una suposicion: lo devolvio la API el 18/09/2026 al correr
 * `tests/bot-contrato`, que existe exactamente para esto. Se probaron diez
 * candidatos uno a uno y estos dos son los que respondieron OK. Los dos
 * documentos ya estan actualizados. Ver ESTADO_F3 §7.1.
 *
 * VAN CLAVADOS A UNA VERSION, NO A UN ALIAS. `gemini-flash-latest` existe y
 * seria mas comodo, pero un modelo que cambia solo invalida la auditoria de
 * fuga (barandilla 4) sin que nadie se entere: el dia que Google mueva el
 * alias, lo que se aprobo en F7 ya no es lo que corre. Prefiero un 404 ruidoso
 * a un cambio silencioso.
 */
export const MODELO_CEREBRO = 'gemini-3.6-flash'
/** El clasificador. Solo enruta, asi que aguanta un modelo mas simple. */
export const MODELO_CLASIFICADOR = 'gemini-3.1-flash-lite'

/**
 * Pensar cuesta tokens y tiempo, y coger una cita no necesita razonar.
 * 0 lo desactiva. El clasificador tampoco piensa: devuelve tres campos.
 */
export const SIN_PENSAR = 0

// ---------------------------------------------------------------------------
// Lo que se manda y lo que vuelve
// ---------------------------------------------------------------------------

export type Parte =
  | { readonly tipo: 'texto'; readonly texto: string }
  | {
      readonly tipo: 'llamada'
      readonly nombre: string
      readonly argumentos: Record<string, unknown>
      /**
       * La `thoughtSignature` con la que vino esta llamada. Ver FIRMA, abajo.
       *
       * Opcional porque no todas las llamadas la traen, y porque las pruebas
       * que arman turnos a mano no tienen ninguna que poner. Cuando la hay,
       * TIENE que volver: sin ella, la vuelta siguiente es un 400.
       */
      readonly firma?: string
    }
  | { readonly tipo: 'resultado'; readonly nombre: string; readonly resultado: unknown }

/** `modelo` es lo que dijo el bot; `usuario` todo lo demas, resultados incluidos. */
export type TurnoDelModelo = {
  readonly rol: 'usuario' | 'modelo'
  readonly partes: readonly Parte[]
}

export type Peticion = {
  readonly modelo: string
  readonly sistema?: string
  readonly turnos: readonly TurnoDelModelo[]
  readonly herramientas?: readonly FunctionDeclaration[]
  readonly presupuestoPensamiento?: number
  readonly temperatura?: number
  /** Para el clasificador: obliga a que conteste un JSON y nada mas. */
  readonly soloJson?: boolean
}

export type LlamadaAHerramienta = {
  readonly nombre: string
  readonly argumentos: Record<string, unknown>
  /** La firma de pensamiento que hay que devolverle. Ver FIRMA, abajo. */
  readonly firma?: string
}

export type Respuesta = {
  readonly texto: string
  readonly llamadas: readonly LlamadaAHerramienta[]
  readonly tokensEntrada?: number
  readonly tokensSalida?: number
}

/** Lo unico que el resto del bot conoce de un modelo de lenguaje. */
export type Modelo = (peticion: Peticion) => Promise<Respuesta>

// ---------------------------------------------------------------------------
// Traduccion a lo que habla el SDK
// ---------------------------------------------------------------------------

/**
 * Un resultado de herramienta va en un turno de rol `user`, no `model`: es algo
 * que el modelo RECIBE. Escribirlo como `model` hace que crea que ya lo dijo el
 * y deje de pedir la herramienta.
 */
export function aContenido(turnos: readonly TurnoDelModelo[]): Content[] {
  return turnos.map((turno) => ({
    role: turno.rol === 'modelo' ? 'model' : 'user',
    parts: turno.partes.map((parte): Part => {
      if (parte.tipo === 'texto') return { text: parte.texto }
      if (parte.tipo === 'llamada') {
        return {
          functionCall: { name: parte.nombre, args: parte.argumentos },
          // La firma vuelve por donde vino: al lado del functionCall, no
          // dentro. Ver FIRMA DE PENSAMIENTO, en la cabecera.
          ...(parte.firma === undefined ? {} : { thoughtSignature: parte.firma }),
        }
      }
      return {
        functionResponse: {
          name: parte.nombre,
          // La clave `output` es la que el SDK documenta para el valor de
          // vuelta. Sin envolver, un resultado que fuera un array se
          // interpretaria como la respuesta entera y no como un campo.
          response: { output: parte.resultado },
        },
      }
    }),
  }))
}

/**
 * El turno que hay que devolverle al modelo con SUS PROPIAS llamadas, antes de
 * mandarle los resultados.
 *
 * Son cinco lineas y vive aqui, exportada, por una razon concreta: es donde se
 * pone —o se pierde— la firma de pensamiento. Cuando esto estaba escrito a mano
 * dentro del bucle de `cerebro.ts`, la prueba de contrato lo copiaba a mano
 * tambien; el arreglo entro en el bucle y no en la copia, y la prueba siguio
 * roja contra Gemini de verdad diciendo que el bot estaba roto cuando no lo
 * estaba. Una prueba que copia al llamante comprueba a la copia.
 *
 * Ahora el bucle y la prueba llaman a esta. Si alguien quita la firma de aqui,
 * se entera por los dos sitios.
 */
export function turnoConLasLlamadas(llamadas: readonly LlamadaAHerramienta[]): TurnoDelModelo {
  return {
    rol: 'modelo',
    partes: llamadas.map((llamada) => ({
      tipo: 'llamada' as const,
      nombre: llamada.nombre,
      argumentos: llamada.argumentos,
      // La firma de pensamiento viaja de vuelta con su llamada. Sin esta
      // linea, la vuelta siguiente se va en un 400 contra Gemini 3: ver
      // FIRMA DE PENSAMIENTO en la cabecera y ESTADO_F7 §4.1.
      ...(llamada.firma === undefined ? {} : { firma: llamada.firma }),
    })),
  }
}

function exigir(clave: string): string {
  const valor = process.env[clave]
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${clave}. Mira .env.example.`)
  }
  return valor
}

let cliente: GoogleGenAI | null = null

/** Un cliente por proceso: crearlo en cada mensaje es gasto inutil. */
function clienteDeGoogle(): GoogleGenAI {
  cliente ??= new GoogleGenAI({ apiKey: exigir('GOOGLE_AI_API_KEY') })
  return cliente
}

/** Para las pruebas: obliga a construirlo otra vez. */
export function olvidarCliente(): void {
  cliente = null
}

/**
 * El `Modelo` de verdad. El unico sitio del proyecto que hace una peticion a
 * Google.
 */
export function modeloDeGoogle(): Modelo {
  return async function preguntar(peticion: Peticion): Promise<Respuesta> {
    const respuesta = await clienteDeGoogle().models.generateContent({
      model: peticion.modelo,
      contents: aContenido(peticion.turnos),
      config: {
        ...(peticion.sistema ? { systemInstruction: peticion.sistema } : {}),
        ...(peticion.herramientas && peticion.herramientas.length > 0
          ? { tools: [{ functionDeclarations: [...peticion.herramientas] }] }
          : {}),
        thinkingConfig: { thinkingBudget: peticion.presupuestoPensamiento ?? SIN_PENSAR },
        ...(peticion.temperatura === undefined ? {} : { temperature: peticion.temperatura }),
        ...(peticion.soloJson ? { responseMimeType: 'application/json' } : {}),
      },
    })

    // -------------------------------------------------------------------
    // Las llamadas salen de las PARTES, no de `respuesta.functionCalls`.
    //
    // `functionCalls` es un atajo del SDK que devuelve los `FunctionCall` ya
    // desnudos, y la `thoughtSignature` NO esta dentro del functionCall: esta
    // al lado, en la Part que lo envuelve (`Part.thoughtSignature`,
    // genai.d.ts). Usando el atajo se perdia, y sin ella la vuelta siguiente
    // del bucle se va en un 400. Ver FIRMA DE PENSAMIENTO en la cabecera.
    // -------------------------------------------------------------------
    const partes = respuesta.candidates?.[0]?.content?.parts ?? []

    const deLasPartes = partes.flatMap((parte) =>
      parte.functionCall
        ? [
            {
              nombre: parte.functionCall.name ?? '',
              argumentos: (parte.functionCall.args ?? {}) as Record<string, unknown>,
              ...(parte.thoughtSignature === undefined
                ? {}
                : { firma: parte.thoughtSignature }),
            },
          ]
        : [],
    )

    // Reserva: si un dia una respuesta trajera `functionCalls` sin partes que
    // recorrer, perder las llamadas seria peor que perder la firma. Se queda
    // el camino viejo, y se nota en el log porque no llevara firma.
    const llamadas =
      deLasPartes.length > 0
        ? deLasPartes
        : (respuesta.functionCalls ?? []).map((llamada) => ({
            nombre: llamada.name ?? '',
            argumentos: (llamada.args ?? {}) as Record<string, unknown>,
          }))

    return {
      // `?? ''` y no un error: un turno que solo trae llamadas a herramienta no
      // lleva texto, y es el caso normal, no una anomalia.
      texto: respuesta.text ?? '',
      llamadas,
      tokensEntrada: respuesta.usageMetadata?.promptTokenCount,
      tokensSalida: respuesta.usageMetadata?.candidatesTokenCount,
    }
  }
}
