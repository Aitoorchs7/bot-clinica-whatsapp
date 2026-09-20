/**
 * Todo lo que el panel LEE. Ni una escritura.
 *
 * LA REGLA QUE MANDA EN ESTE ARCHIVO
 *
 * Ninguna consulta de aqui lleva un filtro por `clinica_id` ni por `publico`.
 * No es un descuido y no es una optimizacion pendiente: es la regla de F2
 * aplicada al panel. La RLS decide que filas existen para quien pregunta; este
 * archivo comprueba que lo que llego es de esta clinica y AVISA si no
 * (`guardia.ts`). Repetir el filtro en la consulta convertiria una politica
 * rota en un dia normal.
 *
 * Lo vigila `tests/panel/01-sin-filtro-en-el-panel.test.ts`, hermano del
 * guardian del camino del bot y con su propio motivo escrito.
 *
 * SI SE PUEDE FILTRAR por fecha, por `tipo` de evento o por `id`: eso es
 * negocio, no seguridad. La diferencia, de ESTADO_F3 §3.2: lo prohibido es
 * duplicar un predicado que la RLS ya aplica, porque tapa su fallo. Buscar una
 * fila por su identidad no tapa nada.
 */
import { crearClienteServidor } from '@/lib/supabase/servidor'
import type { Database } from '@/tipos/bd'

import { comprobarInquilino, exigirFilas, type Comprobado } from './guardia'
import type { Sesion } from './sesion'

type Tablas = Database['public']['Tables']

export type Clinica = Tablas['clinicas']['Row']
export type Tratamiento = Tablas['tratamientos']['Row']
export type Faq = Tablas['faq']['Row']
export type Config = Tablas['config']['Row']
export type Paciente = Tablas['pacientes']['Row']
export type Mensaje = Tablas['mensajes']['Row']
export type Apunte = Tablas['auditoria']['Row']

// -----------------------------------------------------------------------------
// Formas que salen de aqui
// -----------------------------------------------------------------------------

export type CitaDeAgenda = {
  id: string
  clinica_id: string
  inicio: string
  fin: string
  estado: Database['public']['Enums']['estado_cita']
  quien_reserva: Database['public']['Enums']['quien_reserva']
  motivo_cerrado: Database['public']['Enums']['motivo_visita']
  paciente_id: string
  conversacion_id: string | null
  paciente: { nombre: string; apellidos: string | null; telefono_e164: string } | null
  tratamiento: { nombre: string; duracion_min: number } | null
  gabinete: { nombre: string } | null
}

export type ConversacionDeLista = {
  id: string
  clinica_id: string
  telefono_e164: string
  estado: Database['public']['Enums']['estado_conversacion']
  requiere_humano: boolean
  iniciada_en: string
  ultima_actividad: string
  paciente_id: string | null
  paciente: { nombre: string; apellidos: string | null } | null
}

const COLUMNAS_CITA = 'id, clinica_id, inicio, fin, estado, quien_reserva, motivo_cerrado, paciente_id, conversacion_id, pacientes(nombre, apellidos, telefono_e164), tratamientos(nombre, duracion_min), gabinetes(nombre)'

const COLUMNAS_CONVERSACION = 'id, clinica_id, telefono_e164, estado, requiere_humano, iniciada_en, ultima_actividad, paciente_id, pacientes(nombre, apellidos)'

type CitaCruda = Omit<CitaDeAgenda, 'paciente' | 'tratamiento' | 'gabinete'> & {
  pacientes: { nombre: string; apellidos: string | null; telefono_e164: string } | null
  tratamientos: { nombre: string; duracion_min: number } | null
  gabinetes: { nombre: string } | null
}

type ConversacionCruda = Omit<ConversacionDeLista, 'paciente'> & {
  pacientes: { nombre: string; apellidos: string | null } | null
}

/**
 * Las dos listas de columnas de arriba van en UNA SOLA LINEA, sin partirlas con
 * `+`, y no es cuestion de gusto.
 *
 * `supabase-js` deduce la forma de la respuesta del literal que se le pasa. Dos
 * trozos unidos con `+` son un `string` cualquiera para el compilador: la
 * deduccion se cae, `data` pasa a ser un tipo de error y hay que taparlo con un
 * cast. Con el literal entero no hace falta NI UN cast en este archivo, y el
 * compilador comprueba de verdad que `pacientes(nombre, apellidos)` trae un
 * nombre y unos apellidos.
 *
 * Se descubrio quitando el cast para ver si hacia falta. Antes habia aqui un
 * comentario que culpaba a las foraneas compuestas de la migracion 007; era
 * falso, y un comentario falso sobrevive mucho mas que un cast.
 */
function aplanarCita(fila: CitaCruda): CitaDeAgenda {
  const { pacientes, tratamientos, gabinetes, ...resto } = fila
  return { ...resto, paciente: pacientes, tratamiento: tratamientos, gabinete: gabinetes }
}

function aplanarConversacion(fila: ConversacionCruda): ConversacionDeLista {
  const { pacientes, ...resto } = fila
  return { ...resto, paciente: pacientes }
}

function aplanar<A extends { id: string | number; clinica_id: string }, B>(
  comprobado: Comprobado<A>,
  mapa: (fila: A) => B,
): Comprobado<B> {
  return { ...comprobado, filas: comprobado.filas.map(mapa) }
}

// -----------------------------------------------------------------------------
// La propia clinica
// -----------------------------------------------------------------------------

/**
 * Se pide SIN `.single()` y se comprueba que vuelve exactamente una, igual que
 * hace `filtro.ts` con el bot: `.single()` revienta con un error de PostgREST
 * que no distingue «no hay ninguna» de «hay dos», y «hay dos» es justo el
 * sintoma de una politica que no acota por inquilino.
 */
export async function leerClinica(sesion: Sesion): Promise<Clinica> {
  const db = await crearClienteServidor()
  const { data, error } = await db.from('clinicas').select('*')
  const filas = exigirFilas('la clinica', data, error)

  const suyas = filas.filter((fila) => fila.id === sesion.clinicaId)
  if (filas.length !== 1 || suyas.length !== 1) {
    throw new Error(
      `El panel de la clinica ${sesion.clinicaId} no ha recibido exactamente su clinica y solo ` +
        `la suya (recibidas ${filas.length}, suyas ${suyas.length}). Sin ese dato no se ensena ` +
        'ninguna pantalla.',
    )
  }
  return suyas[0]!
}

// -----------------------------------------------------------------------------
// Agenda
// -----------------------------------------------------------------------------

export async function leerAgenda(
  sesion: Sesion,
  rango: { desde: string; hasta: string },
): Promise<Comprobado<CitaDeAgenda>> {
  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('citas')
    .select(COLUMNAS_CITA)
    .gte('inicio', rango.desde)
    .lt('inicio', rango.hasta)
    .order('inicio')

  const crudas = exigirFilas('la agenda', data, error)
  return aplanar(comprobarInquilino('citas', crudas, sesion.clinicaId), aplanarCita)
}

// -----------------------------------------------------------------------------
// Fichas
// -----------------------------------------------------------------------------

export async function leerPacientes(sesion: Sesion): Promise<Comprobado<Paciente>> {
  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('pacientes')
    .select('*')
    .order('apellidos', { nullsFirst: false })
    .order('nombre')

  return comprobarInquilino(
    'pacientes',
    exigirFilas('los pacientes', data, error),
    sesion.clinicaId,
  )
}

export type Ficha = {
  paciente: Paciente
  citas: Comprobado<CitaDeAgenda>
  conversaciones: Comprobado<ConversacionDeLista>
}

export async function leerFicha(sesion: Sesion, pacienteId: string): Promise<Ficha | null> {
  const db = await crearClienteServidor()

  const { data, error } = await db.from('pacientes').select('*').eq('id', pacienteId)
  const paciente = comprobarInquilino(
    'pacientes',
    exigirFilas('la ficha', data, error),
    sesion.clinicaId,
  ).filas[0]
  if (!paciente) return null

  const [citas, conversaciones] = await Promise.all([
    db
      .from('citas')
      .select(COLUMNAS_CITA)
      .eq('paciente_id', pacienteId)
      .order('inicio', { ascending: false }),
    db
      .from('conversaciones')
      .select(COLUMNAS_CONVERSACION)
      .eq('paciente_id', pacienteId)
      .order('ultima_actividad', { ascending: false }),
  ])

  return {
    paciente,
    citas: aplanar(
      comprobarInquilino(
        'citas',
        exigirFilas('las citas de la ficha', citas.data, citas.error),
        sesion.clinicaId,
      ),
      aplanarCita,
    ),
    conversaciones: aplanar(
      comprobarInquilino(
        'conversaciones',
        exigirFilas('las conversaciones de la ficha', conversaciones.data, conversaciones.error),
        sesion.clinicaId,
      ),
      aplanarConversacion,
    ),
  }
}

// -----------------------------------------------------------------------------
// Conocimiento
// -----------------------------------------------------------------------------

export type Conocimiento = {
  tratamientos: Comprobado<Tratamiento>
  faq: Comprobado<Faq>
  config: Comprobado<Config>
}

/**
 * Las tres tablas con `publico`, ENTERAS.
 *
 * El panel las ve todas —publicas y confidenciales— porque esa es exactamente
 * la diferencia entre el rol `clinica` y el rol `bot` en la RLS de F1: para
 * decidir que puede decir el bot hay que poder ver lo que hoy no dice.
 */
export async function leerConocimiento(sesion: Sesion): Promise<Conocimiento> {
  const db = await crearClienteServidor()

  const [tratamientos, faq, config] = await Promise.all([
    db.from('tratamientos').select('*').order('nombre'),
    db.from('faq').select('*').order('pregunta'),
    db.from('config').select('*').order('clave'),
  ])

  return {
    tratamientos: comprobarInquilino(
      'tratamientos',
      exigirFilas('los tratamientos', tratamientos.data, tratamientos.error),
      sesion.clinicaId,
    ),
    faq: comprobarInquilino('faq', exigirFilas('la FAQ', faq.data, faq.error), sesion.clinicaId),
    config: comprobarInquilino(
      'config',
      exigirFilas('la configuracion', config.data, config.error),
      sesion.clinicaId,
    ),
  }
}

// -----------------------------------------------------------------------------
// Escalados
// -----------------------------------------------------------------------------

export type EscaladoDeCola = {
  id: string
  clinica_id: string
  motivo: Database['public']['Enums']['motivo_escalado']
  asunto: Database['public']['Enums']['motivo_visita']
  estado: Database['public']['Enums']['estado_escalado']
  creado_en: string
  resuelto_en: string | null
  resuelto_por: string | null
  conversacion_id: string | null
  /** El mensaje que lo disparo. F4 lo deja apuntando bien; aqui se sigue. */
  mensaje_id: number | null
}

export async function leerEscalados(sesion: Sesion): Promise<Comprobado<EscaladoDeCola>> {
  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('escalados')
    // En una sola linea y sin concatenar: `supabase-js` infiere la forma de la
    // respuesta a partir del literal, y dos trozos unidos con `+` son un
    // `string` cualquiera para el compilador. Se pierde el tipo y se gana un
    // `any` disfrazado.
    .select('id, clinica_id, motivo, asunto, estado, creado_en, resuelto_en, resuelto_por, conversacion_id, mensaje_id')
    .order('creado_en', { ascending: false })

  return comprobarInquilino(
    'escalados',
    exigirFilas('la cola de escalados', data, error),
    sesion.clinicaId,
  )
}

/**
 * De un escalado a la conversacion que lo disparo, siguiendo `mensaje_id`.
 *
 * F4 dejo ese puntero apuntando bien —es su §5.1, la garantia que se rompio a
 * proposito para verla roja— y esto es lo que lo usa: recepcion abre el
 * escalado y lee lo que el paciente habia escrito, sin buscarlo a mano.
 */
export async function conversacionesDeMensajes(
  sesion: Sesion,
  mensajeIds: readonly number[],
): Promise<Map<number, string>> {
  const ids = [...new Set(mensajeIds)]
  if (ids.length === 0) return new Map()

  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('mensajes')
    .select('id, clinica_id, conversacion_id')
    .in('id', ids)

  const encontrados = comprobarInquilino(
    'mensajes',
    exigirFilas('los mensajes de los escalados', data, error),
    sesion.clinicaId,
  )

  // Una sola consulta para toda la cola, no una por fila. Con veinte avisos
  // abiertos, lo segundo son veinte viajes a la base para pintar una lista.
  return new Map(encontrados.filas.map((fila) => [fila.id, fila.conversacion_id]))
}

// -----------------------------------------------------------------------------
// Conversaciones  ·  SOLO LECTURA
// -----------------------------------------------------------------------------
// No hay bandeja de respuesta humana en esta version, y no es un olvido: lo
// decidio el usuario. El panel ensena lo que se dijo; contestar se sigue
// haciendo por WhatsApp, con el telefono de siempre.
// -----------------------------------------------------------------------------

export async function leerConversaciones(sesion: Sesion): Promise<Comprobado<ConversacionDeLista>> {
  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('conversaciones')
    .select(COLUMNAS_CONVERSACION)
    .order('ultima_actividad', { ascending: false })
    .limit(200)

  return aplanar(
    comprobarInquilino(
      'conversaciones',
      exigirFilas('las conversaciones', data, error),
      sesion.clinicaId,
    ),
    aplanarConversacion,
  )
}

export type Hilo = {
  conversacion: ConversacionDeLista
  mensajes: Comprobado<Mensaje>
}

export async function leerHilo(sesion: Sesion, conversacionId: string): Promise<Hilo | null> {
  const db = await crearClienteServidor()

  const { data, error } = await db
    .from('conversaciones')
    .select(COLUMNAS_CONVERSACION)
    .eq('id', conversacionId)

  const conversacion = aplanar(
    comprobarInquilino(
      'conversaciones',
      exigirFilas('la conversacion', data, error),
      sesion.clinicaId,
    ),
    aplanarConversacion,
  ).filas[0]
  if (!conversacion) return null

  const mensajes = await db
    .from('mensajes')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('creado_en')

  return {
    conversacion,
    mensajes: comprobarInquilino(
      'mensajes',
      exigirFilas('los mensajes', mensajes.data, mensajes.error),
      sesion.clinicaId,
    ),
  }
}

// -----------------------------------------------------------------------------
// Observabilidad  ·  la barandilla 2, puesta delante de quien paga
// -----------------------------------------------------------------------------

export type Recuento = { total: number; publicas: number; retenidas: number }

/**
 * Un recuento puede faltar, y eso NO es lo mismo que valer cero.
 *
 * «El asistente vio 0 preguntas» y «este apunte no dice cuántas vio» son cosas
 * distintas, y enseñarlas igual sería mentir en la pantalla que existe
 * precisamente para no tener que fiarse de nadie. Lo dejó escrito F4 en
 * `.env.example` a cuenta del coste: un 0 explícito no es un null.
 */
export type ApunteDelContador = {
  id: number
  creado_en: string
  alarma: boolean
  retenidos: string[]
  config: Recuento | null
  tratamientos: Recuento | null
  faq: Recuento | null
  horarios: Recuento | null
  bloques: Recuento | null
}

/** Lo que la clinica TIENE, contado aqui a partir de lo que devolvio la RLS. */
export type LoQueHay = { tabla: string; total: number; publicas: number }

export type Observabilidad = {
  apuntes: ApunteDelContador[]
  ajenas: readonly string[]
  loQueHay: LoQueHay[]
}

function leerRecuento(valor: unknown): Recuento | null {
  if (typeof valor !== 'object' || valor === null) return null
  const fila = valor as Record<string, unknown>
  const numero = (x: unknown) => (typeof x === 'number' ? x : 0)
  return {
    total: numero(fila.total),
    publicas: numero(fila.publicas),
    retenidas: numero(fila.retenidas),
  }
}

/**
 * Los apuntes del contador y, al lado, lo que hay de verdad.
 *
 * ESTA ES LA PANTALLA QUE CONVIERTE LA BARANDILLA 2 EN ALGO AUDITABLE
 *
 * El bot no puede decir «14 de 16»: las dos filas que no debe ver NO EXISTEN
 * para el, y eso es el producto, no una limitacion (ESTADO_F2 §7 y §8.1). En
 * ejecucion su linea dice «14 de 14».
 *
 * El panel SI puede, porque lee con el rol de la clinica y ve las dieciseis. Y
 * las cuenta aqui, en codigo, sobre las filas que devolvio la RLS —no con un
 * filtro en la consulta, que es justo lo prohibido—. Poner los dos numeros uno
 * al lado del otro es lo que permite a la clinica comprobar por su cuenta que
 * el bot solo ve lo aprobado, en vez de fiarse de nuestra palabra.
 */
export async function leerObservabilidad(
  sesion: Sesion,
  conocimiento: Conocimiento,
): Promise<Observabilidad> {
  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('eventos')
    .select('id, clinica_id, tipo, datos, creado_en')
    .eq('tipo', 'contador_prompt')
    .order('creado_en', { ascending: false })
    .limit(50)

  const eventos = comprobarInquilino(
    'eventos',
    exigirFilas('los apuntes del contador', data, error),
    sesion.clinicaId,
  )

  const apuntes = eventos.filas.map((fila) => {
    const datos = (fila.datos ?? {}) as Record<string, unknown>
    return {
      id: fila.id,
      creado_en: fila.creado_en,
      alarma: datos.alarma === true,
      retenidos: Array.isArray(datos.retenidos) ? (datos.retenidos as string[]) : [],
      config: leerRecuento(datos.config),
      tratamientos: leerRecuento(datos.tratamientos),
      faq: leerRecuento(datos.faq),
      horarios: leerRecuento(datos.horarios),
      bloques: leerRecuento(datos.bloques),
    }
  })

  const contar = (tabla: string, filas: readonly { publico: boolean }[]): LoQueHay => ({
    tabla,
    total: filas.length,
    publicas: filas.filter((fila) => fila.publico).length,
  })

  return {
    apuntes,
    ajenas: eventos.ajenas,
    loQueHay: [
      contar('config', conocimiento.config.filas),
      contar('tratamientos', conocimiento.tratamientos.filas),
      contar('faq', conocimiento.faq.filas),
    ],
  }
}

// -----------------------------------------------------------------------------
// Auditoria  ·  quien movio el interruptor
// -----------------------------------------------------------------------------

export async function leerAuditoria(sesion: Sesion, limite = 50): Promise<Comprobado<Apunte>> {
  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('auditoria')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(limite)

  return comprobarInquilino('auditoria', exigirFilas('el rastro', data, error), sesion.clinicaId)
}
