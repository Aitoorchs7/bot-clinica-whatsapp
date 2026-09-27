/**
 * `procesarMensaje()`: lo que corre DESPUES de haber contestado 200 a Meta.
 *
 * Este archivo no decide nada de lo que dice el bot. Eso es F3 y es intocable:
 * aqui solo se le da de comer `responder()` y se manda lo que devuelve.
 *
 * EL ORDEN
 *
 *   1 · de que clinica es        config + comprobacion contra la base
 *   2 · conversacion abierta     una por numero, garantizada por indice unico
 *   3 · el switch                texto / audio / boton / lo que no se puede leer
 *   4 · GUARDAR el entrante      <- aqui nace el `mensaje_id` del escalado
 *   5 · ventana de 24 h          se reinicia con cada entrante
 *  5b · BOTON DE CITA            si lo es, se atiende AQUI y se acaba (F6)
 *   6 · DEBOUNCE                 8 s; si llego otro, esta rama se calla
 *   7 · historial                de la base, no de memoria
 *   8 · responder()              el motor de F3, con `mensajeId` puesto
 *   9 · enviar                   texto si la ventana esta abierta
 *  10 · GUARDAR el saliente      con wa_message_id, tokens y coste
 *  11 · si escalo                avisar al equipo
 *
 * POR QUE EL ENTRANTE SE GUARDA ANTES DEL DEBOUNCE
 *
 * Porque el debounce se decide preguntando a la base cual es el ultimo mensaje
 * de la conversacion. Si se guardara despues, las cuatro ramas dormirian sin
 * que ninguna viera a las otras y contestarian las cuatro. Guardar primero es
 * lo que hace que el patron funcione en serverless.
 */
import { responder, type RespuestaDelBot } from '@/lib/bot/cerebro'
import { modeloDeGoogle, type Modelo } from '@/lib/bot/gemini'
import type { Registro } from '@/lib/barandillas/contador'

import {
  anotarEnEventos,
  anotarEstadoDeEntrega,
  anotarWaMessageId,
  clienteDe,
  conversacionAbierta,
  costeEur,
  exigirClinicaDelCanal,
  guardarMensaje,
  guardarBorrador,
  historialDe,
  type ClienteDelBot,
} from './almacen'
import { agrupar, concatenar } from './agrupar'
import { PEDIR_POR_ESCRITO, textoDeLaNotaDeVoz } from './audio'
import { textoDelEntrante, type Entrante, type EstadoEntrante } from './botones'
import { atenderBotonDeCita } from './confirmar'
import { clinicaDelNumero } from './config'
import { responderAlPaciente, type OpcionesDeEnvio } from './enviar'
import { avisarAlEquipo } from './escalado'
import { expiraTras, guardarVentana, ventanaAbierta } from './ventana'
import type { Fetch } from './meta'

// ---------------------------------------------------------------------------
// El modelo, con contador
// ---------------------------------------------------------------------------

export type Consumo = { tokensEntrada: number; tokensSalida: number }

/**
 * Envuelve un `Modelo` y va sumando lo que gasta.
 *
 * F3 no expone los tokens en `RespuestaDelBot`, y no hacia falta: el motor no
 * guarda mensajes. Guardarlos es trabajo de F4, y F4 es quien construye el
 * `Modelo` que le pasa a `responder()`, asi que puede contar por fuera SIN
 * TOCAR NI UNA LINEA DEL MOTOR.
 *
 * Suma las dos cosas —cerebro y clasificador— porque las dos se gastan para
 * producir una sola respuesta, y es esa respuesta la que lleva el coste.
 */
export function modeloContado(modelo: Modelo, consumo: Consumo): Modelo {
  return async (peticion) => {
    const respuesta = await modelo(peticion)
    consumo.tokensEntrada += respuesta.tokensEntrada ?? 0
    consumo.tokensSalida += respuesta.tokensSalida ?? 0
    return respuesta
  }
}

// ---------------------------------------------------------------------------
// Lo que se puede inyectar
// ---------------------------------------------------------------------------

export type OpcionesDeProceso = {
  readonly cliente?: ClienteDelBot
  readonly modelo?: Modelo
  readonly modeloClasificador?: Modelo
  readonly envio?: OpcionesDeEnvio
  readonly fetchDeepgram?: Fetch
  readonly fetchEmail?: Fetch
  readonly esperaMs?: number
  readonly dormir?: (ms: number) => Promise<void>
  readonly registro?: Registro
  readonly ahora?: Date
}

export type ResultadoDelProceso =
  | { readonly hecho: 'contestado'; readonly respuesta: RespuestaDelBot; readonly mensajeId: number }
  | {
      /** Un boton de `recordatorio_cita`. No pasa por el motor: ver `confirmar.ts`. */
      readonly hecho: 'boton'
      readonly que: 'confirmada' | 'ya_estaba' | 'escalada' | 'no_es_suya'
      readonly mensajeId: number
    }
  | { readonly hecho: 'agrupado' }
  | { readonly hecho: 'sin_soporte' }
  | { readonly hecho: 'audio_ilegible' }
  | { readonly hecho: 'ignorado'; readonly porque: string }

// ---------------------------------------------------------------------------
// Mensajes entrantes
// ---------------------------------------------------------------------------

export async function procesarMensaje(
  entrante: Entrante,
  opciones: OpcionesDeProceso = {},
): Promise<ResultadoDelProceso> {
  const { registro } = opciones

  // 1 · De que clinica es. El mapa lo dice y la base lo confirma.
  const clinicaId = clinicaDelNumero(entrante.phoneNumberId)
  if (!clinicaId) {
    registro?.error(
      `  ⚠  Webhook de un phone_number_id que no es nuestro: ${entrante.phoneNumberId}`,
    )
    return { hecho: 'ignorado', porque: 'numero desconocido' }
  }

  const cliente = clienteDe(clinicaId, opciones.cliente)
  const clinica = await exigirClinicaDelCanal(clinicaId, entrante.phoneNumberId, cliente)

  // 2 · La conversacion. Una abierta por numero; lo garantiza un indice unico.
  const conversacion = await conversacionAbierta(clinicaId, entrante.telefono, cliente)

  // 3 · El switch. Lo que dijo el paciente no esta siempre en el mismo sitio.
  let texto = textoDelEntrante(entrante)
  let nota: string | undefined

  if (entrante.clase === 'audio') {
    const transcrito = await textoDeLaNotaDeVoz(entrante.mediaId, {
      ...(opciones.envio?.token ? { token: opciones.envio.token } : {}),
      ...(opciones.envio?.fetch ? { fetch: opciones.envio.fetch } : {}),
      ...(opciones.fetchDeepgram ? { fetchDeepgram: opciones.fetchDeepgram } : {}),
      ...(registro ? { registro } : {}),
    })

    if (!transcrito) {
      // NO SE ADIVINA. Se pide por escrito y se acaba aqui: el modelo no llega
      // a ver nada, porque no hay nada que ensenarle.
      await guardarMensaje(
        {
          clinicaId,
          conversacionId: conversacion.id,
          rol: 'sistema',
          texto: 'nota de voz que no se ha podido transcribir',
          waMessageId: entrante.waMessageId,
          estadoEntrega: 'entregado',
        },
        cliente,
      )

      await contestarSinModelo(
        { clinicaId, conversacion: conversacion.id, entrante, clinica },
        PEDIR_POR_ESCRITO,
        cliente,
        opciones,
      )

      await anotarEnEventos(clinicaId, 'audio_ilegible', { conversacion: conversacion.id }, cliente, registro)
      return { hecho: 'audio_ilegible' }
    }

    texto = transcrito
    nota = 'nota de voz transcrita'
  }

  if (entrante.clase === 'sin_soporte' || !texto) {
    await guardarMensaje(
      {
        clinicaId,
        conversacionId: conversacion.id,
        rol: 'sistema',
        texto: `mensaje de tipo ${entrante.clase === 'sin_soporte' ? entrante.tipo : entrante.clase} que el bot no lee`,
        waMessageId: entrante.waMessageId,
        estadoEntrega: 'entregado',
      },
      cliente,
    )

    await contestarSinModelo(
      { clinicaId, conversacion: conversacion.id, entrante, clinica },
      'Perdona, por aquí solo puedo leer mensajes de texto y notas de voz. ' +
        '¿Me escribes qué necesitas? Con eso te busco hueco.',
      cliente,
      opciones,
    )

    return { hecho: 'sin_soporte' }
  }

  // Una nota interna, para que quede por que ese texto no lo tecleo nadie.
  // Va como `sistema`: `responder()` la deja fuera de la transcripcion que lee
  // la puerta de la confirmacion, a proposito (ver cerebro.ts).
  if (nota) {
    await guardarMensaje(
      { clinicaId, conversacionId: conversacion.id, rol: 'sistema', texto: nota },
      cliente,
    )
  }

  // 4 · El entrante, guardado. AQUI NACE EL `mensaje_id` DEL ESCALADO.
  const mensajeId = await guardarMensaje(
    {
      clinicaId,
      conversacionId: conversacion.id,
      rol: 'paciente',
      texto,
      waMessageId: entrante.waMessageId,
      estadoEntrega: 'entregado',
    },
    cliente,
  )

  if (mensajeId === null) {
    // Ya estaba: otro reintento de Meta se nos adelanto. La idempotencia de
    // `eventos_webhook` deberia haberlo parado antes; esto es la segunda linea.
    registro?.info(`  el mensaje ${entrante.waMessageId} ya estaba guardado`)
    return { hecho: 'ignorado', porque: 'mensaje duplicado' }
  }

  // 5 · La ventana de 24 h se reinicia con cada entrante.
  const ahora = opciones.ahora ?? new Date()
  const expira = expiraTras(ahora)
  await guardarVentana(cliente, conversacion.id, expira)

  // 5b · Un boton de `recordatorio_cita`, si lo es. VA AQUI Y NO MAS ABAJO:
  //
  //   - Despues del paso 4 porque el escalado de «Cancelar» necesita el
  //     `mensaje_id` del mensaje que lo disparo, y ese id nace ahi.
  //   - Antes del debounce porque pulsar un boton no es escribir: no hay nada
  //     que agrupar, y hacer esperar ocho segundos a quien confirma su cita
  //     seria cobrarle la latencia de un problema que no tiene.
  //   - Antes del motor porque confirmar una cita no es una conversacion. El
  //     mensaje trae el identificador exacto; pedirle al modelo que adivine a
  //     cual se referia «Confirmar» seria inventarse una ambiguedad.
  const porBoton = await atenderBotonDeCita(
    entrante,
    { clinicaId, clinica, conversacionId: conversacion.id, mensajeId },
    cliente,
    registro,
  )

  if (porBoton) {
    await contestarSinModelo(
      { clinicaId, conversacion: conversacion.id, entrante, clinica },
      porBoton.texto,
      cliente,
      opciones,
    )

    if (porBoton.avisar) {
      await avisarAlEquipo(
        {
          clinicaId,
          nombreClinica: clinica.nombre,
          telefonoRecepcion: clinica.telefono_recepcion,
          emailAvisos: clinica.email_avisos,
          phoneNumberId: entrante.phoneNumberId,
          telefonoPaciente: entrante.telefono,
          motivo: porBoton.avisar.motivo,
          asunto: porBoton.avisar.asunto,
        },
        {
          ...(opciones.envio ?? {}),
          ...(opciones.fetchEmail ? { fetchEmail: opciones.fetchEmail } : {}),
          ...(registro ? { registro } : {}),
        },
      )
    }

    await anotarEnEventos(clinicaId, 'boton_de_cita', { hecho: porBoton.hecho }, cliente, registro)
    return { hecho: 'boton', que: porBoton.hecho, mensajeId }
  }

  // 6 · El debounce. Si llego otro mensaje, esta rama se calla.
  const grupo = await agrupar(clinicaId, conversacion.id, mensajeId, {
    cliente,
    ...(opciones.esperaMs === undefined ? {} : { esperaMs: opciones.esperaMs }),
    ...(opciones.dormir ? { dormir: opciones.dormir } : {}),
    ...(registro ? { registro } : {}),
  })

  if (!grupo.meToca) return { hecho: 'agrupado' }

  // 7 · El historial: lo anterior al primero del grupo.
  const primeroDelGrupo = mensajeId - (grupo.textos.length - 1)
  const historial = await historialDe(clinicaId, conversacion.id, primeroDelGrupo, cliente)

  // 8 · El motor de F3. `mensajeId` es el pendiente §8.4 de ESTADO_F3.
  const consumo: Consumo = { tokensEntrada: 0, tokensSalida: 0 }
  const cerebro = modeloContado(opciones.modelo ?? modeloDeGoogle(), consumo)
  const clasificador = modeloContado(
    opciones.modeloClasificador ?? opciones.modelo ?? modeloDeGoogle(),
    consumo,
  )

  const respuesta = await responder({
    clinicaId,
    conversacionId: conversacion.id,
    telefonoDelCanal: entrante.telefono,
    mensaje: concatenar(grupo.textos),
    historial,
    mensajeId,
    // ---------------------------------------------------------------------
    // EL BORRADOR Y LAS RONDAS, QUE HASTA F7 NO SE PASABAN.
    //
    // `responder()` los admite desde F3 y este archivo nunca se los dio, asi
    // que cada mensaje empezaba con el borrador vacio y NO SE COGIA NINGUNA
    // CITA: `crear_cita` moria en `faltan_datos` porque le faltaban el
    // nombre, los apellidos, el telefono y el tratamiento — los datos que el
    // paciente habia dado dos mensajes antes.
    //
    // Y no se podia arreglar pidiendole al modelo que volviera a anotarlos,
    // porque el bloque 50 se lo prohibe: «nunca anotes algo que el paciente no
    // acabe de decir». El modelo que obedecia no reservaba. Ver ESTADO_F7 §4.2
    // y la migracion 010.
    //
    // `rondas_aclaracion` es lo mismo por el otro lado: llegando siempre a 0,
    // `RONDAS_MAXIMAS` no se aplicaba nunca y `no_te_entiendo` podia pedir una
    // aclaracion detras de otra. El bucle que `.claude/CLAUDE.md` prohibe.
    // ---------------------------------------------------------------------
    borrador: conversacion.borrador,
    rondasDeAclaracion: conversacion.rondas_aclaracion,
    modelo: cerebro,
    modeloClasificador: clasificador,
    cliente,
    ...(registro ? { registro } : {}),
    ahora,
  })

  // 8b · Y se guardan para el mensaje siguiente, ANTES de enviar.
  //
  // Antes de enviar a proposito: si el envio se cae, el paciente reescribe y
  // la conversacion sigue donde estaba. Guardandolo despues, un fallo de Meta
  // se llevaria por delante lo que el paciente ya habia contado.
  //
  // Las rondas se cuentan aqui y no en el motor porque el motor no tiene
  // memoria entre mensajes: es este archivo el que sabe cuantas llevaba.
  await guardarBorrador(
    cliente,
    clinicaId,
    conversacion.id,
    respuesta.borrador,
    conversacion.rondas_aclaracion +
      respuesta.herramientasUsadas.filter((h) => h === 'no_te_entiendo').length,
    registro,
  )

  // 9 y 10 · Enviar y guardar lo enviado.
  await mandarYGuardar(
    {
      clinicaId,
      conversacion: conversacion.id,
      entrante,
      clinica,
      expira,
      ahora,
    },
    respuesta.texto,
    { tokensEntrada: consumo.tokensEntrada, tokensSalida: consumo.tokensSalida },
    cliente,
    opciones,
  )

  // 11 · Si escalo, avisar al equipo. El paciente ya tiene su mensaje seguro.
  if (respuesta.escalado) {
    await avisarAlEquipo(
      {
        clinicaId,
        nombreClinica: clinica.nombre,
        telefonoRecepcion: clinica.telefono_recepcion,
        emailAvisos: clinica.email_avisos,
        phoneNumberId: entrante.phoneNumberId,
        telefonoPaciente: entrante.telefono,
        motivo: respuesta.clasificacion.motivoEscalado ?? 'pregunta_fuera_de_faq',
        asunto: respuesta.clasificacion.urgencia === 'alta' ? 'urgencia' : 'otro',
      },
      {
        ...(opciones.envio ?? {}),
        ...(opciones.fetchEmail ? { fetchEmail: opciones.fetchEmail } : {}),
        ...(registro ? { registro } : {}),
      },
    )
  }

  return { hecho: 'contestado', respuesta, mensajeId }
}

// ---------------------------------------------------------------------------
// Enviar y dejar constancia
// ---------------------------------------------------------------------------

type Envio = {
  clinicaId: string
  conversacion: string
  entrante: Entrante
  clinica: { nombre: string; telefono_recepcion: string }
  expira?: Date
  ahora?: Date
}

/**
 * Manda la respuesta y guarda la fila con el `wa_message_id` que devolvio Meta.
 *
 * Se guarda ANTES de enviar y se completa despues. Si se guardara solo al
 * volver, un fallo de Meta dejaria la respuesta sin rastro en ningun sitio, y
 * recepcion no sabria que el bot intento contestar.
 */
async function mandarYGuardar(
  envio: Envio,
  texto: string,
  consumo: Consumo,
  cliente: ClienteDelBot,
  opciones: OpcionesDeProceso,
): Promise<void> {
  const mensajeId = await guardarMensaje(
    {
      clinicaId: envio.clinicaId,
      conversacionId: envio.conversacion,
      rol: 'bot',
      texto,
      estadoEntrega: 'pendiente',
      tokensEntrada: consumo.tokensEntrada,
      tokensSalida: consumo.tokensSalida,
      costeEur: costeEur(consumo.tokensEntrada, consumo.tokensSalida),
    },
    cliente,
  )

  const ahora = envio.ahora ?? new Date()
  // Acabamos de recibir un mensaje del paciente, asi que la ventana esta
  // abierta salvo que el reloj diga otra cosa. `enviar.ts` tiene ademas el
  // cinturon del 131047 por si el reloj de Meta discrepa.
  const abierta = envio.expira ? ventanaAbierta(envio.expira, ahora) : false

  try {
    const salida = await responderAlPaciente(
      { phoneNumberId: envio.entrante.phoneNumberId, telefono: envio.entrante.telefono },
      texto,
      abierta,
      undefined,
      opciones.envio ?? {},
    )

    if (mensajeId !== null && salida.waMessageId) {
      await anotarWaMessageId(envio.clinicaId, mensajeId, salida.waMessageId, 'enviado', cliente)
    }
  } catch (fallo) {
    opciones.registro?.error(
      `  ⚠  No se ha podido enviar la respuesta: ${
        fallo instanceof Error ? fallo.message : String(fallo)
      }`,
    )
    if (mensajeId !== null) {
      const bot = clienteDe(envio.clinicaId, cliente)
      await bot.from('mensajes').update({ estado_entrega: 'fallido' }).eq('id', mensajeId)
    }
  }
}

/** Para las respuestas que no pasan por el modelo (audio ilegible, tipo no soportado). */
async function contestarSinModelo(
  envio: Envio,
  texto: string,
  cliente: ClienteDelBot,
  opciones: OpcionesDeProceso,
): Promise<void> {
  const ahora = opciones.ahora ?? new Date()
  await mandarYGuardar(
    { ...envio, expira: expiraTras(ahora), ahora },
    texto,
    { tokensEntrada: 0, tokensSalida: 0 },
    cliente,
    opciones,
  )
}

// ---------------------------------------------------------------------------
// Webhooks de estado
// ---------------------------------------------------------------------------

/**
 * `sent` / `delivered` / `read` / `failed`. Se anotan y NO se contestan.
 *
 * Un mensaje saliente genera hasta tres de estos con el mismo `wamid`; por eso
 * `idDeEvento()` les pone el estado en la clave de idempotencia.
 */
export async function procesarEstado(
  estado: EstadoEntrante,
  opciones: OpcionesDeProceso = {},
): Promise<{ anotado: boolean }> {
  const clinicaId = clinicaDelNumero(estado.phoneNumberId)
  if (!clinicaId) return { anotado: false }

  const cliente = clienteDe(clinicaId, opciones.cliente)
  const anotado = await anotarEstadoDeEntrega(clinicaId, estado.waMessageId, estado.estado, cliente)

  if (estado.estado === 'failed' && estado.codigoError !== undefined) {
    opciones.registro?.error(
      `  ⚠  Meta no ha podido entregar ${estado.waMessageId}: codigo ${estado.codigoError}`,
    )
    await anotarEnEventos(
      clinicaId,
      'entrega_fallida',
      { wa_message_id: estado.waMessageId, codigo: estado.codigoError },
      cliente,
      opciones.registro,
    )
  }

  return { anotado }
}
