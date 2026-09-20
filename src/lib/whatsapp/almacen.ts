/**
 * Lo que el canal escribe y lee en la base.
 *
 * TODO MENSAJE SE GUARDA. ENTRANTE Y SALIENTE. ES REQUISITO DEL CLIENTE.
 *
 * Con `wa_message_id`, estado de entrega, tokens y coste. No es telemetria
 * opcional: es lo que recepcion abre cuando llega un escalado, y es de donde
 * sale el hilo al que apunta `escalados.mensaje_id`.
 *
 * NADA DE ESTO USA `service_role`
 *
 * `crearClienteBot(clinicaId)` y nada mas, igual que las herramientas de F3.
 * El `clinica_id` viaja firmado dentro del JWT, asi que ninguna consulta de
 * este archivo lleva `.eq('clinica_id', ...)`: repetir en la consulta un
 * predicado que ya aplica la RLS es lo que prohibe
 * `tests/barandillas/04-sin-filtro-en-codigo.test.ts`, y con razon — taparia
 * una politica rota en vez de delatarla.
 *
 * Los INSERT si llevan `clinica_id` en la fila, porque la columna es NOT NULL
 * y el `WITH CHECK` de la politica exige que coincida con el del token. Eso no
 * es filtrar: es declarar de quien es la fila, y la RLS lo verifica.
 */
import { crearClienteBot } from '@/lib/supabase/bot'
import type { Registro } from '@/lib/barandillas/contador'
import type { Turno } from '@/lib/bot/historial'

export type ClienteDelBot = ReturnType<typeof crearClienteBot>

export function clienteDe(clinicaId: string, dado?: ClienteDelBot): ClienteDelBot {
  return dado ?? crearClienteBot(clinicaId)
}

// ---------------------------------------------------------------------------
// De que clinica es este webhook, confirmado contra la base
// ---------------------------------------------------------------------------

/**
 * El mapa del entorno dice que clinica es; esto lo COMPRUEBA.
 *
 * `config.ts` explica por que la primera resolucion no puede ser una consulta:
 * la RLS del rol `bot` exige saber ya de que clinica eres. Pero una vez firmado
 * el token, la propia fila de la clinica si es legible, y ahi esta escrito su
 * `wa_phone_number_id`. Si no coincide con el del webhook, el mapa esta mal
 * puesto y no se atiende el mensaje: contestarle a un paciente con los datos de
 * otra clinica es la peor cosa que puede hacer un sistema multi-inquilino.
 *
 * Devuelve la fila de la clinica, que hace falta luego para el telefono de
 * recepcion y el nombre.
 */
export type ClinicaDelCanal = {
  readonly id: string
  readonly nombre: string
  readonly telefono_recepcion: string
  readonly email_avisos: string
  readonly zona_horaria: string
}

export async function exigirClinicaDelCanal(
  clinicaId: string,
  phoneNumberId: string,
  cliente?: ClienteDelBot,
): Promise<ClinicaDelCanal> {
  const bot = clienteDe(clinicaId, cliente)

  const { data, error } = await bot
    .from('clinicas')
    .select('id, nombre, telefono_recepcion, email_avisos, zona_horaria, wa_phone_number_id, activa')
    .limit(2)

  if (error) throw new Error(`No se ha podido leer la clinica: ${error.message}`)

  // La RLS devuelve exactamente la del token. Dos filas significaria que la
  // politica no acota por clinica, y eso no se deja pasar en silencio.
  if (!data || data.length !== 1) {
    throw new Error(
      `El cliente del bot de ${clinicaId} ha visto ${data?.length ?? 0} clinicas. ` +
        'Deberia ver exactamente una: revisa clinicas_bot_select.',
    )
  }

  const fila = data[0]!

  if (fila.id !== clinicaId) {
    throw new Error(`El token es de ${clinicaId} pero la fila devuelta es ${fila.id}.`)
  }

  if (fila.wa_phone_number_id !== phoneNumberId) {
    throw new Error(
      `WHATSAPP_CLINICAS dice que ${phoneNumberId} es de la clinica ${clinicaId}, pero su ` +
        `wa_phone_number_id es ${fila.wa_phone_number_id ?? 'null'}. No se atiende el mensaje.`,
    )
  }

  if (!fila.activa) {
    throw new Error(`La clinica ${clinicaId} esta dada de baja: no se atiende el mensaje.`)
  }

  return {
    id: fila.id,
    nombre: fila.nombre,
    telefono_recepcion: fila.telefono_recepcion,
    email_avisos: fila.email_avisos,
    zona_horaria: fila.zona_horaria,
  }
}

// ---------------------------------------------------------------------------
// La conversacion
// ---------------------------------------------------------------------------

export type Conversacion = {
  readonly id: string
  readonly ventana_24h_expira: string | null
  readonly paciente_id: string | null
}

/**
 * La conversacion abierta de ese numero, o una nueva.
 *
 * La migracion 002 tiene un indice unico parcial
 * —`conversaciones_abierta_unica_idx`, sobre (clinica_id, telefono) where
 * estado = 'abierta'`— justo para esto: dos webhooks a la vez abrian dos hilos
 * y el bot acababa contestandose a si mismo. Aqui el `23505` no es un fallo,
 * es ese indice haciendo su trabajo: se vuelve a leer y se usa la que gano.
 */
export async function conversacionAbierta(
  clinicaId: string,
  telefono: string,
  cliente?: ClienteDelBot,
): Promise<Conversacion> {
  const bot = clienteDe(clinicaId, cliente)

  const existente = await bot
    .from('conversaciones')
    .select('id, ventana_24h_expira, paciente_id')
    .eq('telefono_e164', telefono)
    .eq('estado', 'abierta')
    .maybeSingle()

  if (existente.error) {
    throw new Error(`Buscando la conversacion: ${existente.error.message}`)
  }
  if (existente.data) return existente.data

  const creada = await bot
    .from('conversaciones')
    .insert({ clinica_id: clinicaId, telefono_e164: telefono, estado: 'abierta' })
    .select('id, ventana_24h_expira, paciente_id')
    .single()

  if (creada.data) return creada.data

  if (creada.error?.code === '23505') {
    const segunda = await bot
      .from('conversaciones')
      .select('id, ventana_24h_expira, paciente_id')
      .eq('telefono_e164', telefono)
      .eq('estado', 'abierta')
      .single()
    if (segunda.data) return segunda.data
    throw new Error(`Carrera al abrir conversacion y no se recupera: ${segunda.error?.message}`)
  }

  throw new Error(`Abriendo la conversacion: ${creada.error?.message}`)
}

// ---------------------------------------------------------------------------
// Los mensajes
// ---------------------------------------------------------------------------

/**
 * El coste en euros de una respuesta.
 *
 * El tier gratuito de Gemini cuesta 0, asi que por defecto la columna se llena
 * con 0 y no con un numero inventado. Cuando la clinica pase a un plan de pago,
 * se ponen las dos tarifas en el entorno y la columna empieza a decir la verdad
 * sin tocar codigo.
 *
 * Se prefiere un 0 explicito a un `null`: «no costo nada» y «no lo hemos
 * medido» son cosas distintas, y el panel de F5 tendra que distinguirlas.
 */
export function costeEur(tokensEntrada: number, tokensSalida: number): number {
  const porMillon = (clave: string): number => {
    const valor = Number(process.env[clave] ?? '0')
    return Number.isFinite(valor) ? valor : 0
  }
  const entrada = (tokensEntrada / 1_000_000) * porMillon('GEMINI_EUR_POR_MTOKEN_ENTRADA')
  const salida = (tokensSalida / 1_000_000) * porMillon('GEMINI_EUR_POR_MTOKEN_SALIDA')
  // La columna es numeric(10,6): mas de seis decimales los redondea Postgres.
  return Number((entrada + salida).toFixed(6))
}

export type MensajeAGuardar = {
  readonly clinicaId: string
  readonly conversacionId: string
  readonly rol: 'paciente' | 'bot' | 'sistema'
  readonly texto: string
  readonly waMessageId?: string
  readonly estadoEntrega?: 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido'
  readonly tokensEntrada?: number
  readonly tokensSalida?: number
  readonly costeEur?: number
  readonly origen?: Record<string, unknown>
}

/**
 * Guarda un mensaje y devuelve su `id`.
 *
 * ESE `id` ES EL QUE ACABA EN `escalados.mensaje_id`. Es el pendiente §8.4 de
 * ESTADO_F3: la herramienta ya sabia apuntarlo, pero el id no existia porque
 * nadie guardaba los mensajes todavia. Esta funcion es la que lo crea.
 *
 * `null` si la fila ya existia (mismo `wa_message_id`): el indice unico parcial
 * `mensajes_wa_message_id_idx` es la idempotencia de segunda linea, por debajo
 * de la de `eventos_webhook`.
 */
export async function guardarMensaje(
  mensaje: MensajeAGuardar,
  cliente?: ClienteDelBot,
): Promise<number | null> {
  const bot = clienteDe(mensaje.clinicaId, cliente)

  const { data, error } = await bot
    .from('mensajes')
    .insert({
      clinica_id: mensaje.clinicaId,
      conversacion_id: mensaje.conversacionId,
      rol: mensaje.rol,
      texto: mensaje.texto,
      ...(mensaje.waMessageId ? { wa_message_id: mensaje.waMessageId } : {}),
      estado_entrega: mensaje.estadoEntrega ?? 'pendiente',
      ...(mensaje.tokensEntrada === undefined ? {} : { tokens_in: mensaje.tokensEntrada }),
      ...(mensaje.tokensSalida === undefined ? {} : { tokens_out: mensaje.tokensSalida }),
      ...(mensaje.costeEur === undefined ? {} : { coste_eur: mensaje.costeEur }),
      ...(mensaje.origen ? { origen: mensaje.origen as never } : {}),
    })
    .select('id')
    .single()

  if (data) return data.id
  if (error?.code === '23505') return null
  throw new Error(`Guardando el mensaje: ${error?.message}`)
}

/** Apunta el `wa_message_id` que devolvio Meta en la fila que ya se guardo. */
export async function anotarWaMessageId(
  clinicaId: string,
  mensajeId: number,
  waMessageId: string,
  estado: 'enviado' | 'fallido' = 'enviado',
  cliente?: ClienteDelBot,
): Promise<void> {
  const bot = clienteDe(clinicaId, cliente)
  const { error } = await bot
    .from('mensajes')
    .update({ wa_message_id: waMessageId, estado_entrega: estado })
    .eq('id', mensajeId)

  if (error) throw new Error(`Anotando el wa_message_id: ${error.message}`)
}

/**
 * Los webhooks de estado (`sent`/`delivered`/`read`/`failed`) actualizan la
 * fila por su `wa_message_id`. No se contestan.
 */
const ESTADOS: Readonly<Record<string, 'enviado' | 'entregado' | 'leido' | 'fallido'>> = {
  sent: 'enviado',
  delivered: 'entregado',
  read: 'leido',
  failed: 'fallido',
}

export function aEstadoDeEntrega(
  deMeta: string,
): 'enviado' | 'entregado' | 'leido' | 'fallido' | undefined {
  return ESTADOS[deMeta]
}

export async function anotarEstadoDeEntrega(
  clinicaId: string,
  waMessageId: string,
  estadoDeMeta: string,
  cliente?: ClienteDelBot,
): Promise<boolean> {
  const estado = aEstadoDeEntrega(estadoDeMeta)
  // `played` y cualquier estado que Meta añada en el futuro se ignoran en vez
  // de romper: un estado desconocido no es un fallo del canal.
  if (!estado) return false

  const bot = clienteDe(clinicaId, cliente)
  const { data, error } = await bot
    .from('mensajes')
    .update({ estado_entrega: estado })
    .eq('wa_message_id', waMessageId)
    .select('id')

  if (error) throw new Error(`Anotando el estado de entrega: ${error.message}`)
  return (data?.length ?? 0) > 0
}

// ---------------------------------------------------------------------------
// El historial que ve el modelo
// ---------------------------------------------------------------------------

/** Cuantos mensajes se leen de la base. `ventana()` de F3 recorta luego a 10 parejas. */
export const MENSAJES_A_LEER = 40

/**
 * Lo dicho hasta ahora, del mas viejo al mas nuevo, SIN el mensaje de ahora.
 *
 * `ventana()` de `historial.ts` se encarga del recorte fino; aqui solo se evita
 * traerse una conversacion de seiscientos mensajes por el cable.
 */
export async function historialDe(
  clinicaId: string,
  conversacionId: string,
  hastaMensajeId: number,
  cliente?: ClienteDelBot,
): Promise<Turno[]> {
  const bot = clienteDe(clinicaId, cliente)

  const { data, error } = await bot
    .from('mensajes')
    .select('id, rol, texto')
    .eq('conversacion_id', conversacionId)
    .lt('id', hastaMensajeId)
    .order('id', { ascending: false })
    .limit(MENSAJES_A_LEER)

  if (error) throw new Error(`Leyendo el historial: ${error.message}`)

  return (data ?? []).reverse().map((fila) => ({ rol: fila.rol, texto: fila.texto }))
}

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------

export type Anotacion = { readonly nuevo: boolean; readonly id?: number }

/**
 * Anota el evento y dice si es la primera vez que se ve.
 *
 * SE INSERTA Y SE MIRA EL ERROR; NO SE CONSULTA ANTES.
 *
 * Un `select` seguido de un `insert` deja un hueco entre las dos operaciones, y
 * en ese hueco cabe justo el reintento de Meta: las dos invocaciones consultan,
 * las dos ven que no existe, las dos insertan, y una crea una cita duplicada.
 * El indice unico `(clinica_id, wa_event_id)` lo resuelve en la base, que es el
 * unico sitio donde dos procesos se ponen de acuerdo. El `23505` ES la
 * deteccion.
 */
export async function anotarEvento(
  clinicaId: string,
  waEventId: string,
  carga: unknown,
  cliente?: ClienteDelBot,
): Promise<Anotacion> {
  const bot = clienteDe(clinicaId, cliente)

  const { data, error } = await bot
    .from('eventos_webhook')
    .insert({
      clinica_id: clinicaId,
      wa_event_id: waEventId,
      carga: carga as never,
    })
    .select('id')
    .single()

  if (data) return { nuevo: true, id: data.id }
  if (error?.code === '23505') return { nuevo: false }
  throw new Error(`Anotando el evento del webhook: ${error?.message}`)
}

/** Deja constancia de que el evento se termino de procesar. */
export async function marcarProcesado(
  clinicaId: string,
  eventoId: number,
  cliente?: ClienteDelBot,
): Promise<void> {
  const bot = clienteDe(clinicaId, cliente)
  const { error } = await bot
    .from('eventos_webhook')
    .update({ procesado_en: new Date().toISOString() })
    .eq('id', eventoId)

  if (error) throw new Error(`Marcando el evento como procesado: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Observabilidad
// ---------------------------------------------------------------------------

/** Un apunte en `eventos`. Nunca lleva texto del paciente. */
export async function anotarEnEventos(
  clinicaId: string,
  tipo: string,
  datos: Record<string, unknown>,
  cliente?: ClienteDelBot,
  registro?: Registro,
): Promise<void> {
  const bot = clienteDe(clinicaId, cliente)
  const { error } = await bot
    .from('eventos')
    .insert({ clinica_id: clinicaId, tipo, datos: datos as never })

  // Un fallo de observabilidad no tumba una conversacion.
  if (error) registro?.error(`  ⚠  No se ha podido anotar el evento ${tipo}: ${error.message}`)
}
