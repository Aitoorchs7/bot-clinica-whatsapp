/**
 * El cerebro: `gemini-3.6-flash` con las seis herramientas y nada mas.
 *
 * EL ORDEN DE LO QUE PASA AQUI ES EL PRODUCTO
 *
 *   1 · Se cargan los datos con el cliente del bot. Lo confidencial no llega:
 *       barandilla 1, y la garantiza la RLS, no este archivo.
 *   2 · Se monta el prompt con `montarPromptDeDatos()` y se CUENTA. La
 *       barandilla 2 no es opcional y no se salta ni cuando el clasificador va
 *       a cortar: un prompt que se monta se cuenta, siempre.
 *   3 · Clasificador. Si hay dolor, hinchazon, golpe o sangrado, se corta AQUI.
 *       El cerebro no llega a ver el mensaje.
 *   4 · Solo si no se corto: el bucle de herramientas.
 *
 * COMO SE ARMA EL CONTEXTO, QUE ES LO QUE MAS SE DEGRADA
 *
 *   [ prompt de sistema ]   <- montarPromptDeDatos(), los diez bloques
 *   [ ultimas 10 parejas ]  <- ventana(), no la conversacion entera
 *   [ mensaje de ahora ]
 *   [ RECORDATORIO ]        <- bloques 30, 50 y 60 otra vez, LITERALES
 *
 * El recordatorio va el ultimo a proposito. Un modelo atiende al principio y al
 * final de lo que lee, y el prompt de sistema queda en medio en cuanto la
 * conversacion pasa de unos pocos turnos: es el «lost in the middle». Las dos
 * reglas que mas caras salen si se diluyen —no inventar un hueco y no dar
 * consejo medico— son justo las que se repiten abajo del todo.
 *
 * NO SE METE TODO EN UN AGENTE
 *
 * PLAN.md lo advierte y V1 lo midio: a un modelo al que se le pide saludar,
 * calificar, consultar, reservar, confirmar y registrar en un solo paso empieza
 * a abandonar tareas por el quinto o el sexto, y llega a asegurar que ha hecho
 * algo que no hizo. Por eso el clasificador filtra antes y por eso las
 * herramientas son seis y cada una hace una cosa.
 */
import {
  cargarDatosDelPrompt,
  type ClienteDelBot,
  type DatosDelPrompt,
} from '@/lib/barandillas/filtro'
import { contar, type Registro, type ResultadoDelContador } from '@/lib/barandillas/contador'
import {
  montarPromptDeDatos,
  valoresDelPrompt,
  type PromptMontado,
} from '@/lib/barandillas/montaje'

import { clasificar, mensajeSeguro, type Clasificacion } from './clasificador'
import { MODELO_CEREBRO, SIN_PENSAR, type Modelo, type TurnoDelModelo } from './gemini'
import { recordatorio, ventana, type Turno } from './historial'
import {
  CATALOGO,
  declaraciones,
  ejecutar,
  type Borrador,
  type Contexto,
} from './herramientas'

/**
 * Cuantas veces se deja que el modelo pida herramientas antes de cortar.
 *
 * Seis da para la conversacion mas larga que tiene sentido en un turno —anotar
 * un par de datos, consultar huecos y reservar— sin dejar que un modelo que se
 * ha atascado llame a la misma herramienta cuarenta veces. Al llegar al tope se
 * contesta con lo que haya, no se lanza.
 */
export const VUELTAS_MAXIMAS = 6

export type Peticion = {
  readonly clinicaId: string
  readonly conversacionId: string
  readonly telefonoDelCanal: string
  readonly mensaje: string
  /** Lo dicho hasta ahora, sin el mensaje de ahora. Del mas viejo al mas nuevo. */
  readonly historial?: readonly Turno[]
  readonly borrador?: Borrador
  /**
   * La fila de `mensajes` del mensaje que se esta atendiendo.
   *
   * Es el pendiente §8.4 de ESTADO_F3: `escalar_a_recepcion` ya sabia apuntar
   * `escalados.mensaje_id`, pero en F3 los mensajes todavia no se guardaban —eso
   * es el webhook—, asi que el id no existia. Lo pone F4, y sin el recepcion
   * abre un escalado sin hilo que leer.
   *
   * Sigue siendo opcional: las pruebas del motor que no guardan mensajes
   * funcionan igual sin el, exactamente como en F3.
   */
  readonly mensajeId?: number
  readonly rondasDeAclaracion?: number
  readonly modelo?: Modelo
  readonly modeloClasificador?: Modelo
  readonly cliente?: ClienteDelBot
  readonly registro?: Registro
  readonly ahora?: Date
}

export type RespuestaDelBot = {
  readonly texto: string
  readonly escalado: boolean
  /** true si corto el clasificador y el cerebro no llego a correr. */
  readonly cortadoAntesDelCerebro: boolean
  readonly clasificacion: Clasificacion
  readonly herramientasUsadas: readonly string[]
  readonly borrador: Borrador
  readonly prompt: PromptMontado
  readonly recuento: ResultadoDelContador
  readonly datos: DatosDelPrompt
}

/**
 * Un mensaje entra, una respuesta sale.
 *
 * No toca WhatsApp ni guarda mensajes: eso es F4. Aqui se decide QUE se
 * contesta, no como llega.
 */
export async function responder(peticion: Peticion): Promise<RespuestaDelBot> {
  const {
    clinicaId,
    conversacionId,
    telefonoDelCanal,
    mensaje,
    historial = [],
    registro,
    ahora = new Date(),
  } = peticion

  // 1 · Los datos, con el cliente del bot. La RLS decide que llega.
  const datos = await cargarDatosDelPrompt(clinicaId, peticion.cliente)

  // 2 · El prompt y el contador. En este orden y sin excepciones.
  const prompt = montarPromptDeDatos(datos, { ahora, registro })
  const recuento = await contar(datos, { cliente: peticion.cliente, registro })

  const contexto: Contexto = {
    clinicaId,
    conversacionId,
    telefonoDelCanal,
    zonaHoraria: datos.clinica.dato.zona_horaria,
    telefonoRecepcion: datos.clinica.dato.telefono_recepcion,
    // Las lineas de `sistema` se caen aqui, y no es un detalle: esta
    // transcripcion es la que lee la puerta de la confirmacion, y una nota
    // interna («nota de voz transcrita») no la ha dicho el paciente. Metida
    // como si fuera suya, podria colarse como el «si» que abre la puerta.
    // Al modelo si se le pasan: eso va por `ventana()`, mas abajo.
    transcripcion: [...historial, { rol: 'paciente' as const, texto: mensaje }]
      .filter((turno) => turno.rol !== 'sistema')
      .map((turno) => ({
        rol: turno.rol === 'bot' ? ('bot' as const) : ('paciente' as const),
        texto: turno.texto,
      })),
    borrador: peticion.borrador ?? {},
    // El cable de ESTADO_F3 §8.4. `Contexto.mensajeId` y el `escalar()` que lo
    // escribe existen desde F3; lo unico que faltaba era quien se lo pasara.
    ...(peticion.mensajeId === undefined ? {} : { mensajeId: peticion.mensajeId }),
    cliente: peticion.cliente,
    registro,
    rondasDeAclaracion: peticion.rondasDeAclaracion ?? 0,
  }

  // 3 · El clasificador, ANTES del cerebro.
  const clasificacion = await clasificar(mensaje, peticion.modeloClasificador, { registro })

  if (clasificacion.escalar) {
    // Ultima capa de fallback. El cerebro no ve este mensaje, asi que no puede
    // opinar sobre un sintoma: no es que se le prohiba, es que no llega.
    // Ni una palabra del mensaje del paciente viaja a `escalados`: el asunto es
    // vocabulario cerrado y el detalle se sigue por `mensaje_id`. La migracion
    // 007 borro la columna de texto libre justo por esto, porque `escalados`
    // sobrevive a la purga de 90 dias y un sintoma escrito ahi se queda para
    // siempre. Recepcion abre la conversacion y la lee mientras exista.
    const escalada = await ejecutar(
      'escalar_a_recepcion',
      {
        motivo: clasificacion.motivoEscalado ?? 'pregunta_fuera_de_faq',
        asunto: clasificacion.urgencia === 'alta' ? 'urgencia' : 'otro',
      },
      contexto,
    )

    registro?.info(
      `  cortado antes del cerebro: ${clasificacion.intencion} / ${clasificacion.urgencia}`,
    )

    return {
      texto: mensajeSeguro(datos),
      escalado: true,
      cortadoAntesDelCerebro: true,
      clasificacion,
      herramientasUsadas: ['escalar_a_recepcion'],
      borrador: escalada.borrador,
      prompt,
      recuento,
      datos,
    }
  }

  // 4 · El cerebro.
  return conversarConElModelo({ peticion, datos, prompt, recuento, contexto, clasificacion, ahora })
}

async function conversarConElModelo(entrada: {
  peticion: Peticion
  datos: DatosDelPrompt
  prompt: PromptMontado
  recuento: ResultadoDelContador
  contexto: Contexto
  clasificacion: Clasificacion
  ahora: Date
}): Promise<RespuestaDelBot> {
  const { peticion, datos, prompt, recuento, clasificacion, ahora } = entrada
  const { registro } = peticion
  let contexto = entrada.contexto

  if (!peticion.modelo) {
    throw new Error(
      'El cerebro necesita un `modelo`. En pruebas se inyecta uno de mentira; ' +
        'en produccion, `modeloDeGoogle()` de gemini.ts.',
    )
  }

  // El recordatorio sale de los mismos bloques y con los mismos valores que el
  // prompt de arriba: si se recalcularan, podrian decir dos fechas distintas.
  const { valores } = valoresDelPrompt(datos, ahora)
  const recuerdo = recordatorio(prompt.bloques, valores, registro)

  const recientes = ventana([
    ...(peticion.historial ?? []),
    { rol: 'paciente', texto: peticion.mensaje },
  ])

  const turnos: TurnoDelModelo[] = recientes.map((turno) => ({
    rol: turno.rol === 'bot' ? ('modelo' as const) : ('usuario' as const),
    partes: [{ tipo: 'texto' as const, texto: turno.texto }],
  }))

  // El recordatorio, DESPUES del historial. Ver la cabecera.
  if (recuerdo.texto !== '') {
    turnos.push({ rol: 'usuario', partes: [{ tipo: 'texto', texto: recuerdo.texto }] })
  }

  const usadas: string[] = []
  let texto = ''

  for (let vuelta = 0; vuelta < VUELTAS_MAXIMAS; vuelta += 1) {
    const respuesta = await peticion.modelo({
      modelo: MODELO_CEREBRO,
      sistema: prompt.texto,
      turnos,
      herramientas: declaraciones(),
      presupuestoPensamiento: SIN_PENSAR,
    })

    texto = respuesta.texto

    if (respuesta.llamadas.length === 0) break

    turnos.push({
      rol: 'modelo',
      partes: respuesta.llamadas.map((llamada) => ({
        tipo: 'llamada' as const,
        nombre: llamada.nombre,
        argumentos: llamada.argumentos,
        // La firma de pensamiento viaja de vuelta con su llamada. Sin esta
        // linea, la vuelta siguiente se va en un 400 contra Gemini 3: ver
        // FIRMA DE PENSAMIENTO en gemini.ts y ESTADO_F7 §4.1.
        ...(llamada.firma === undefined ? {} : { firma: llamada.firma }),
      })),
    })

    const resultados: TurnoDelModelo['partes'][number][] = []

    for (const llamada of respuesta.llamadas) {
      const ejecucion = await ejecutar(llamada.nombre, llamada.argumentos, contexto)
      usadas.push(llamada.nombre)

      // El borrador y las rondas de aclaracion viajan de una herramienta a la
      // siguiente: `anotar` va juntando y `crear_cita` lee lo que haya.
      contexto = {
        ...contexto,
        borrador: ejecucion.borrador,
        rondasDeAclaracion:
          llamada.nombre === 'no_te_entiendo'
            ? contexto.rondasDeAclaracion + 1
            : contexto.rondasDeAclaracion,
      }

      resultados.push({
        tipo: 'resultado',
        nombre: llamada.nombre,
        resultado: ejecucion.resultado,
      })
    }

    turnos.push({ rol: 'usuario', partes: resultados })
  }

  if (usadas.length > 0) {
    registro?.info(`  herramientas usadas: ${usadas.join(', ')}`)
  }

  return {
    texto,
    escalado: usadas.includes('escalar_a_recepcion'),
    cortadoAntesDelCerebro: false,
    clasificacion,
    herramientasUsadas: usadas,
    borrador: contexto.borrador,
    prompt,
    recuento,
    datos,
  }
}

/** Para las pruebas y el panel: los nombres de las seis, sin importar el catalogo. */
export const HERRAMIENTAS_DEL_CEREBRO = Object.keys(CATALOGO)
