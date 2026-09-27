/**
 * Las SEIS herramientas. Ni una mas.
 *
 *   anotar · repasar_ficha · consultar_huecos · crear_cita · no_te_entiendo ·
 *   escalar_a_recepcion
 *
 * El numero no es una casualidad ni un redondeo: es la barandilla 3. El modelo
 * no sabe horarios ni precios, los pregunta. Y `CATALOGO` es la unica lista:
 * `ejecutar()` rechaza cualquier nombre que no este en ella, asi que un modelo
 * que se invente `cancelar_cita` recibe un error, no una excepcion sin recoger
 * ni —mucho peor— un apano silencioso.
 *
 * NINGUNA USA service_role
 *
 * Todas hablan con la base por `crearClienteBot`, igual que `filtro.ts`. Eso
 * mete este archivo dentro del alcance de
 * `tests/barandillas/04-sin-filtro-en-codigo.test.ts` en cuanto se importe, que
 * es exactamente lo que se busca: el guardian se extiende solo.
 *
 * POR QUE AQUI SI HAY UN `.eq('telefono_e164', ...)` Y NO ES LO PROHIBIDO
 *
 * Lo que F2 prohibio fue duplicar en la consulta un predicado de SEGURIDAD que
 * ya aplica la RLS —`publico`, `clinica_id`—, porque el filtro en codigo tapa
 * el fallo de la politica y deja mudo al contador. `telefono_e164` no es eso:
 * es la identidad de la fila que se esta buscando, la trae el canal y no la
 * elige nunca el modelo. Buscar al paciente por su telefono es la consulta, no
 * un filtro encima de la consulta.
 *
 * Y aun asi se comprueba lo que vuelve, por el mismo motivo que `filtro.ts`
 * comprueba `clinica_id`: si algun dia la RLS devolviera la ficha de otra
 * persona, hay que enterarse.
 */
import { z } from 'zod'

import { crearClienteBot } from '@/lib/supabase/bot'
import type { Registro } from '@/lib/barandillas/contador'
import { origenDe, type Origen } from '@/lib/barandillas/origen'

import { muestrear, type Hueco, type Muestra, type Opcion } from './muestreo'
import {
  zFecha,
  zInstante,
  zMotivo,
  zMotivoEscalado,
  zNombre,
  zTelefono,
  normalizar,
  type Motivo,
} from './validacion'

// Se re-exporta porque las pruebas y el resto del motor la venian usando desde
// aqui. La definicion vive en validacion.ts: ver su cabecera.
export { normalizar }

export type ClienteDelBot = ReturnType<typeof crearClienteBot>

// ---------------------------------------------------------------------------
// El borrador: lo que se sabe de la cita antes de escribirla
// ---------------------------------------------------------------------------

/**
 * Lo que `anotar` va juntando. **No es una fila de la base de datos**: mientras
 * la cita esta a medias no existe en ningun sitio salvo aqui.
 *
 * Es deliberado. V1 lo dice en una linea: «hasta entonces no se toca ni el
 * calendario ni la hoja». Un borrador a medias guardado en `pacientes` deja
 * fichas de gente que nunca llego a pedir cita.
 */
export type Borrador = {
  quien_llama?: string
  nombre?: string
  apellidos?: string
  telefono?: string
  tratamiento_id?: string
  tratamiento_nombre?: string
  dia?: string
  motivo?: Motivo
  /** El instante que se acordo, en ISO. Sale de `consultar_huecos` o lo pide el paciente. */
  hora?: string
}

/** Los cinco datos de V1 sin los cuales no se reserva. */
export function borradorCompleto(borrador: Borrador): boolean {
  return Boolean(
    borrador.nombre &&
      borrador.apellidos &&
      borrador.telefono &&
      borrador.tratamiento_id &&
      borrador.hora,
  )
}

export function loQueFalta(borrador: Borrador): string[] {
  const falta: string[] = []
  if (!borrador.nombre) falta.push('el nombre')
  if (!borrador.apellidos) falta.push('los apellidos')
  if (!borrador.telefono) falta.push('un telefono')
  if (!borrador.tratamiento_id) falta.push('el tratamiento')
  if (!borrador.hora) falta.push('el dia y la hora')
  return falta
}

// ---------------------------------------------------------------------------
// El contexto de la conversacion
// ---------------------------------------------------------------------------

export type Contexto = {
  readonly clinicaId: string
  readonly conversacionId: string
  /** El numero desde el que escriben. Lo pone el canal, NUNCA el modelo. */
  readonly telefonoDelCanal: string
  readonly zonaHoraria: string
  readonly telefonoRecepcion: string
  /** Lo que se ha dicho hasta ahora, del mas viejo al mas nuevo. */
  readonly transcripcion: readonly { rol: 'paciente' | 'bot'; texto: string }[]
  readonly borrador: Borrador
  /**
   * La fila de `mensajes` del mensaje que se esta atendiendo, si ya se guardo.
   * Es lo que `escalar_a_recepcion` apunta en vez de copiar el texto. En F3
   * todavia no existe —los mensajes los guarda el webhook, que es F4—, asi que
   * es opcional y el escalado se crea igual sin el.
   */
  readonly mensajeId?: number
  readonly cliente?: ClienteDelBot
  readonly registro?: Registro
  /** Cuantas veces se ha pedido ya una aclaracion. El bloque 40 permite UNA. */
  readonly rondasDeAclaracion: number
}

export type Resultado = {
  readonly ok: boolean
  /** Lo que lee el modelo. Nunca prosa para el paciente: datos y motivos. */
  readonly [clave: string]: unknown
}

function bien(datos: Record<string, unknown>): Resultado {
  return { ok: true, ...datos }
}

function mal(motivo: string, datos: Record<string, unknown> = {}): Resultado {
  return { ok: false, motivo, ...datos }
}

function clienteDe(contexto: Contexto): ClienteDelBot {
  return contexto.cliente ?? crearClienteBot(contexto.clinicaId)
}

// ---------------------------------------------------------------------------
// La puerta: nada se escribe sin confirmacion explicita del paciente
// ---------------------------------------------------------------------------

/**
 * Afirmaciones, en cerrado.
 *
 * Lista corta a proposito: ante la duda, que no pase. Volver a preguntar cuesta
 * un mensaje; una cita que nadie pidio cuesta un hueco y una llamada de
 * recepcion.
 */
const AFIRMACIONES = [
  'si',
  'sii',
  'sip',
  'vale',
  'ok',
  'okey',
  'oka',
  'correcto',
  'exacto',
  'perfecto',
  'confirmo',
  'confirmado',
  'adelante',
  'de acuerdo',
  'me vale',
  'esta bien',
  'asi es',
  'eso es',
  'venga',
  'genial',
  'estupendo',
]


/**
 * Una negacion delante manda: «si, pero mejor el viernes» NO es un si.
 * Tampoco «no» a secas, ni «si no puede ser...».
 */
const NIEGA = /\b(no|mejor|pero|cambia|cambiar|espera|espere|otro|otra|prefiero)\b/

export function esAfirmacion(texto: string): boolean {
  const limpio = normalizar(texto)
  if (limpio === '') return false
  if (NIEGA.test(limpio)) return false

  const palabras = limpio.split(' ')
  // Una afirmacion es corta. «si» dentro de un parrafo de treinta palabras no
  // es una confirmacion, es una conjuncion.
  if (palabras.length > 6) return false

  return AFIRMACIONES.some(
    (afirmacion) => limpio === afirmacion || palabras.includes(afirmacion),
  )
}

/** `2026-09-24T10:00:00Z` -> `10:00` en la hora de la clinica. */
export function horaLocal(instante: string, zonaHoraria: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: zonaHoraria,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instante))
}

export type Puerta =
  | { readonly abierta: true }
  | { readonly abierta: false; readonly motivo: string; readonly porque: string }

/**
 * Las TRES condiciones para escribir una cita. Las tres, no dos.
 *
 * 1 · El borrador esta completo. No se escribe una ficha a medias.
 *
 * 2 · El ultimo mensaje del paciente es una afirmacion. Y se mira el mensaje
 *     DE VERDAD, el que llego por WhatsApp — no un argumento que el modelo
 *     rellene diciendo que el paciente dijo que si. Un `confirmado: true` que
 *     pone el propio modelo es el modelo vigilandose a si mismo, que es justo
 *     lo que este proyecto no hace en ningun sitio.
 *
 * 3 · Esa hora aparece escrita en la conversacion reciente. Es lo que impide
 *     que un «si» dicho a otra cosa —«¿es para usted?» «si»— se cuele como
 *     confirmacion de una cita: para que valga, el paciente tiene que haber
 *     visto la hora escrita antes de decir que si. Vale tanto si la ofrecio el
 *     bot como si la pidio el paciente, porque el bloque 30 exige aceptar horas
 *     que no estaban entre las ofrecidas.
 */
export function puerta(contexto: Contexto, hora: string): Puerta {
  const { borrador, transcripcion, zonaHoraria } = contexto

  if (!borradorCompleto({ ...borrador, hora })) {
    return {
      abierta: false,
      motivo: 'faltan_datos',
      porque: `todavia falta ${loQueFalta({ ...borrador, hora }).join(', ')}`,
    }
  }

  const ultimoDelPaciente = [...transcripcion].reverse().find((t) => t.rol === 'paciente')
  if (!ultimoDelPaciente || !esAfirmacion(ultimoDelPaciente.texto)) {
    return {
      abierta: false,
      motivo: 'sin_confirmacion',
      porque:
        'el paciente todavia no ha dicho que si. Repitele los datos juntos y espera a que confirme',
    }
  }

  const hhmm = horaLocal(hora, zonaHoraria)
  // Las cuatro ultimas intervenciones: el resumen y el si van pegados.
  const reciente = transcripcion.slice(-4).map((t) => t.texto).join(' ')
  if (!reciente.includes(hhmm)) {
    return {
      abierta: false,
      motivo: 'hora_no_dicha',
      porque: `el paciente no ha visto escrita la hora ${hhmm} antes de decir que si. Repitele los datos con la hora y espera a que confirme`,
    }
  }

  return { abierta: true }
}

// ---------------------------------------------------------------------------
// 1 · anotar
// ---------------------------------------------------------------------------

export const CAMPOS_DE_ANOTAR = [
  'quien_llama',
  'nombre',
  'apellidos',
  'telefono',
  'tratamiento',
  'dia',
  'motivo',
] as const
export type CampoDeAnotar = (typeof CAMPOS_DE_ANOTAR)[number]

/**
 * UN dato por llamada.
 *
 * `campo` y `valor`, y no un objeto con siete claves opcionales, porque un
 * modelo al que se le deja rellenar siete campos de una vez rellena los siete
 * —incluidos los que nadie le ha dicho— y el bloque 50 lo prohibe expresamente:
 * «nunca anotes algo que el paciente no acabe de decir».
 */
export const esquemaAnotar = z.strictObject({
  campo: z.enum(CAMPOS_DE_ANOTAR),
  valor: z.string().min(1, 'un dato vacio no se anota'),
})

async function anotar(
  bruto: unknown,
  contexto: Contexto,
): Promise<{ resultado: Resultado; borrador: Borrador }> {
  const args = esquemaAnotar.parse(bruto)
  const borrador = { ...contexto.borrador }

  switch (args.campo) {
    case 'nombre':
    case 'apellidos':
    case 'quien_llama': {
      const validado = zNombre.safeParse(args.valor)
      if (!validado.success) {
        return {
          resultado: mal('dato_no_valido', {
            campo: args.campo,
            porque: validado.error.issues[0]?.message,
          }),
          borrador,
        }
      }
      borrador[args.campo] = validado.data
      break
    }

    case 'telefono': {
      const validado = zTelefono.safeParse(args.valor)
      if (!validado.success) {
        return {
          resultado: mal('dato_no_valido', {
            campo: 'telefono',
            porque: validado.error.issues[0]?.message,
          }),
          borrador,
        }
      }
      borrador.telefono = validado.data
      break
    }

    case 'dia': {
      const validado = zFecha.safeParse(args.valor)
      if (!validado.success) {
        return {
          resultado: mal('dato_no_valido', {
            campo: 'dia',
            porque: validado.error.issues[0]?.message,
          }),
          borrador,
        }
      }
      borrador.dia = validado.data
      break
    }

    case 'motivo': {
      const validado = zMotivo.safeParse(args.valor)
      if (!validado.success) {
        // El enum NO se amplia sobre la marcha: es lo que mantiene el sistema
        // fuera del articulo 9 del RGPD. Ver validacion.ts.
        return {
          resultado: mal('motivo_no_valido', {
            porque: 'el motivo tiene que ser uno de estos, tal cual',
            valores: zMotivo.options,
          }),
          borrador,
        }
      }
      borrador.motivo = validado.data
      break
    }

    case 'tratamiento': {
      const encontrado = await buscarTratamiento(args.valor, contexto)
      if (!encontrado.ok) return { resultado: encontrado, borrador }
      borrador.tratamiento_id = encontrado.id as string
      borrador.tratamiento_nombre = encontrado.nombre as string
      break
    }
  }

  return {
    resultado: bien({ anotado: args.campo, falta: loQueFalta(borrador) }),
    borrador,
  }
}

/**
 * El nombre que dice el paciente -> la fila de `tratamientos`.
 *
 * El modelo NUNCA inventa un identificador: si lo que ha dicho el paciente no
 * casa con ningun tratamiento publicado, vuelve la lista de los que hay para
 * que pregunte. La RLS ya ha dejado fuera los confidenciales, asi que la lista
 * que se le ofrece es la que la clinica aprobo.
 */
async function buscarTratamiento(texto: string, contexto: Contexto): Promise<Resultado> {
  const bot = clienteDe(contexto)
  const { data, error } = await bot
    .from('tratamientos')
    .select('id, clinica_id, codigo, nombre, publico, activo')
    .eq('activo', true)

  if (error) return mal('error_de_base', { porque: error.message })

  const filas = (data ?? []) as {
    id: string
    clinica_id: string
    codigo: string
    nombre: string
    publico: boolean
  }[]

  // La misma comprobacion que hace `filtro.ts`, por el mismo motivo: la RLS
  // filtra, el codigo comprueba y avisa. Si llega algo que no debia, no se usa
  // y se deja escrito el origen, nunca el contenido.
  const coladas: Origen[] = []
  const legitimas = filas.filter((fila) => {
    const suya = fila.clinica_id === contexto.clinicaId && fila.publico === true
    if (!suya) coladas.push(origenDe('tratamientos', fila.id))
    return suya
  })

  if (coladas.length > 0) {
    contexto.registro?.error(
      `  ⚠  BARANDILLA 1 CAIDA en buscarTratamiento: ${coladas.length} fila(s) sin derecho ` +
        `a llegar. Origenes: ${coladas.join(', ')}.`,
    )
  }

  const buscado = normalizar(texto)
  const exacto = legitimas.find(
    (fila) => normalizar(fila.nombre) === buscado || normalizar(fila.codigo) === buscado,
  )
  const parcial =
    exacto ??
    legitimas.find(
      (fila) => normalizar(fila.nombre).includes(buscado) || buscado.includes(normalizar(fila.nombre)),
    )

  if (!parcial) {
    return mal('tratamiento_desconocido', {
      porque: 'eso no esta en el catalogo de la clinica. Preguntale cual de estos es',
      disponibles: legitimas.map((fila) => fila.nombre),
    })
  }

  return bien({ id: parcial.id, nombre: parcial.nombre })
}

// ---------------------------------------------------------------------------
// 2 · repasar_ficha
// ---------------------------------------------------------------------------

/**
 * SIN ARGUMENTOS, y es lo importante de esta herramienta.
 *
 * El modelo no elige de quien lee la ficha: se lee la del numero que esta
 * escribiendo, que lo pone el canal. Si aceptara un telefono, bastaria con que
 * un paciente escribiera «repasa la ficha del 600111222» para que el modelo lo
 * intentara, y hoy la RLS se lo permitiria —el bot ve toda su clinica— porque
 * el estrechamiento a la conversacion sigue sin hacerse (ESTADO_F3 §7).
 *
 * Quitar el argumento cierra ese camino en codigo. Es una intencion, no una
 * garantia, y esta escrito asi a proposito: la garantia es el paso F3b.
 */
export const esquemaRepasarFicha = z.strictObject({})

async function repasarFicha(bruto: unknown, contexto: Contexto): Promise<Resultado> {
  esquemaRepasarFicha.parse(bruto)
  const bot = clienteDe(contexto)

  const { data, error } = await bot
    .from('pacientes')
    .select('id, clinica_id, nombre, apellidos, telefono_e164')
    .eq('telefono_e164', contexto.telefonoDelCanal)

  if (error) return mal('error_de_base', { porque: error.message })

  const filas = (data ?? []) as {
    id: string
    clinica_id: string
    nombre: string
    apellidos: string | null
    telefono_e164: string
  }[]

  const suyas = filas.filter(
    (fila) =>
      fila.clinica_id === contexto.clinicaId &&
      fila.telefono_e164 === contexto.telefonoDelCanal,
  )

  if (suyas.length !== filas.length) {
    contexto.registro?.error(
      '  ⚠  BARANDILLA 1 CAIDA en repasar_ficha: han llegado fichas que no son de esta ' +
        `conversacion. Origenes: ${filas
          .filter((f) => !suyas.includes(f))
          .map((f) => origenDe('pacientes', f.id))
          .join(', ')}.`,
    )
  }

  const paciente = suyas[0]
  if (!paciente) {
    return bien({ conocido: false, porque: 'este numero no tiene ficha todavia' })
  }

  const { data: citas, error: errorCitas } = await bot
    .from('citas')
    .select('id, inicio, fin, estado, tratamiento_id')
    .eq('paciente_id', paciente.id)
    .in('estado', ['provisional', 'confirmada'])
    .gte('inicio', new Date().toISOString())
    .order('inicio')

  if (errorCitas) return mal('error_de_base', { porque: errorCitas.message })

  return bien({
    conocido: true,
    nombre: paciente.nombre,
    apellidos: paciente.apellidos,
    proximas_citas: (citas ?? []).map((cita) => ({
      cuando: horaLocal(cita.inicio as string, contexto.zonaHoraria),
      dia: (cita.inicio as string).slice(0, 10),
      estado: cita.estado,
    })),
  })
}

// ---------------------------------------------------------------------------
// 3 · consultar_huecos
// ---------------------------------------------------------------------------

export const esquemaConsultarHuecos = z.strictObject({
  tratamiento: z.string().min(1).describe('El tratamiento, como lo dijo el paciente'),
  dia: zFecha.describe('El dia que pide, en AAAA-MM-DD'),
  franja: z
    .enum(['manana', 'tarde', 'cualquiera'])
    .optional()
    .describe('Solo si el paciente lo ha dicho'),
})

/** Franjas en hora local, como las diria una persona. */
const FRANJAS = {
  manana: { desde: 0, hasta: 14 },
  tarde: { desde: 14, hasta: 24 },
  cualquiera: { desde: 0, hasta: 24 },
} as const

async function consultarHuecos(
  bruto: unknown,
  contexto: Contexto,
): Promise<{ resultado: Resultado; borrador: Borrador; ofrecidas?: readonly Opcion[] }> {
  const args = esquemaConsultarHuecos.parse(bruto)
  const borrador = { ...contexto.borrador }

  const tratamiento = await buscarTratamiento(args.tratamiento, contexto)
  if (!tratamiento.ok) return { resultado: tratamiento, borrador }

  borrador.tratamiento_id = tratamiento.id as string
  borrador.tratamiento_nombre = tratamiento.nombre as string
  borrador.dia = args.dia

  const franja = FRANJAS[args.franja ?? 'cualquiera']
  // La ventana se construye en la zona de la clinica y se manda como instante:
  // pedir «el jueves» desde Canarias y desde Madrid no es el mismo rango.
  const desde = instanteLocal(args.dia, franja.desde, contexto.zonaHoraria)
  const hasta = instanteLocal(args.dia, franja.hasta, contexto.zonaHoraria)

  const bot = clienteDe(contexto)
  const { data, error } = await bot.rpc('consultar_huecos', {
    p_clinica: contexto.clinicaId,
    p_tratamiento: borrador.tratamiento_id,
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) return { resultado: mal('error_de_base', { porque: error.message }), borrador }

  const huecos = (data ?? []) as unknown as Hueco[]
  const muestra: Muestra = muestrear(huecos, contexto.zonaHoraria)

  contexto.registro?.info(
    `  consultar_huecos: ${muestra.totalLibres} ranuras, ${muestra.instantesLibres} horas ` +
      `distintas, se ofrecen ${muestra.opciones.length}`,
  )

  if (muestra.opciones.length === 0) {
    return {
      resultado: mal('sin_huecos', {
        porque: 'ese dia no queda nada libre para ese tratamiento. Ofrecele otro dia',
        dia: args.dia,
      }),
      borrador,
    }
  }

  return {
    resultado: bien({
      dia: args.dia,
      tratamiento: borrador.tratamiento_nombre,
      // Solo lo que se puede decir en voz alta. El total no se le da al modelo
      // para que no lo suelte: al paciente se le ofrecen dos o tres, no «hay
      // treinta y siete huecos».
      opciones: muestra.opciones.map((opcion) => ({
        hora: opcion.inicio,
        cuando: opcion.cuando,
      })),
    }),
    borrador,
    ofrecidas: muestra.opciones,
  }
}

/** `2026-09-24` + hora local -> instante ISO en la zona de la clinica. */
export function instanteLocal(dia: string, hora: number, zonaHoraria: string): string {
  // Se parte de medianoche UTC y se corrige por el desfase real de ESE dia, que
  // es lo unico que respeta el cambio de hora de octubre y marzo.
  const base = new Date(`${dia}T00:00:00Z`)
  const desfase = desfaseDe(base, zonaHoraria)
  return new Date(base.getTime() - desfase + hora * 3_600_000).toISOString()
}

/** Milisegundos que una zona lleva por delante de UTC en un instante dado. */
function desfaseDe(instante: Date, zonaHoraria: string): number {
  const comoSiFueraUtc = new Date(
    instante.toLocaleString('en-US', { timeZone: 'UTC' }),
  )
  const enLaZona = new Date(instante.toLocaleString('en-US', { timeZone: zonaHoraria }))
  return enLaZona.getTime() - comoSiFueraUtc.getTime()
}

// ---------------------------------------------------------------------------
// 4 · crear_cita
// ---------------------------------------------------------------------------

/**
 * `hora` es opcional y eso es la leccion de V1.
 *
 * Si el paciente pide «las cinco y veinte» y esa hora no estaba entre las
 * ofrecidas, el modelo la pasa aqui tal cual y se INTENTA. No se le dice que
 * esta ocupada: eso solo lo puede decir la base de datos. El bloque 30 se lo
 * repite al modelo con todas las letras y `crear_cita` del RPC acepta
 * cualquier hora exacta justo por esto.
 */
export const esquemaCrearCita = z.strictObject({
  hora: zInstante
    .optional()
    .describe('Solo si el paciente pide una hora distinta de las ofrecidas'),
})

async function crearCita(
  bruto: unknown,
  contexto: Contexto,
): Promise<{ resultado: Resultado; borrador: Borrador }> {
  const args = esquemaCrearCita.parse(bruto)
  const borrador = { ...contexto.borrador }
  const hora = args.hora ?? borrador.hora

  if (!hora) {
    return {
      resultado: mal('faltan_datos', {
        porque: 'todavia no hay ninguna hora acordada. Consulta huecos y ofrecele',
      }),
      borrador,
    }
  }

  // LA PUERTA. Antes de esta linea no se ha escrito nada en la base de datos, y
  // si no se abre, no se escribe.
  const permiso = puerta({ ...contexto, borrador }, hora)
  if (!permiso.abierta) {
    contexto.registro?.info(
      `  crear_cita BLOQUEADA (${permiso.motivo}): no se ha escrito nada en la base.`,
    )
    return { resultado: mal(permiso.motivo, { porque: permiso.porque }), borrador }
  }

  const bot = clienteDe(contexto)

  const paciente = await buscarOCrearPaciente(contexto, borrador)
  if (!paciente.ok) return { resultado: paciente, borrador }

  const { data, error } = await bot.rpc('crear_cita', {
    p_clinica: contexto.clinicaId,
    p_paciente: paciente.id as string,
    p_tratamiento: borrador.tratamiento_id!,
    p_inicio: hora,
    p_motivo: borrador.motivo ?? 'otro',
    p_conversacion: contexto.conversacionId,
    // El gabinete NO se fija: que elija el RPC de entre los libres. Fijarlo
    // convertiria «ese sillon se acaba de ocupar» en un `ocupado` con los otros
    // dos sillones vacios. Ver la cabecera de muestreo.ts.
  })

  if (error) return { resultado: mal('error_de_base', { porque: error.message }), borrador }

  const salida = (Array.isArray(data) ? data[0] : data) as {
    ok: boolean
    motivo: string
    cita_id: string | null
    inicio: string | null
    fin: string | null
  } | null

  if (!salida || !salida.ok) {
    // Los motivos del RPC se pasan TAL CUAL. `fuera_de_horario` y `ocupado` son
    // cosas distintas y el bloque 30 prohibe confundirlas.
    return {
      resultado: mal(salida?.motivo ?? 'desconocido', {
        porque: EXPLICACION[salida?.motivo ?? 'desconocido'] ?? 'no se ha podido reservar',
      }),
      borrador,
    }
  }

  return {
    resultado: bien({
      cita_id: salida.cita_id,
      cuando: horaLocal(salida.inicio!, contexto.zonaHoraria),
      dia: salida.inicio!.slice(0, 10),
      paciente: `${borrador.nombre} ${borrador.apellidos}`,
    }),
    // Reservada: el borrador se vacia. Si piden otra cita se empieza de cero,
    // que es lo que manda el bloque 50.
    borrador: { telefono: borrador.telefono },
  }
}

/** Lo que significa cada motivo del RPC, en una frase que el modelo pueda usar. */
const EXPLICACION: Readonly<Record<string, string>> = {
  ocupado: 'esa hora ya esta cogida. Ofrecele otra',
  fuera_de_horario: 'a esa hora la clinica esta CERRADA. No digas que esta ocupada, di que esta cerrada',
  pasado: 'esa hora ya ha pasado',
  demasiado_lejos: 'esa fecha esta demasiado lejos para reservar',
  tratamiento_desconocido: 'ese tratamiento no esta en el catalogo',
  clinica_no_coincide: 'no se ha podido reservar. Pasa a recepcion',
  sin_permiso: 'no se ha podido reservar. Pasa a recepcion',
  duplicada: 'esa cita ya estaba puesta',
  paciente_desconocido: 'no se ha podido reservar. Pasa a recepcion',
}

/**
 * La ficha se crea AQUI y no antes, ya pasada la puerta.
 *
 * Es la diferencia entre una base de datos con pacientes y una con
 * conversaciones a medias: si se creara al anotar el nombre, cada persona que
 * escribe «hola, me llamo Ana» y se va dejaria una ficha.
 */
async function buscarOCrearPaciente(contexto: Contexto, borrador: Borrador): Promise<Resultado> {
  const bot = clienteDe(contexto)

  const { data, error } = await bot
    .from('pacientes')
    .select('id, clinica_id, telefono_e164')
    .eq('telefono_e164', contexto.telefonoDelCanal)

  if (error) return mal('error_de_base', { porque: error.message })

  const suyo = ((data ?? []) as { id: string; clinica_id: string; telefono_e164: string }[]).find(
    (fila) =>
      fila.clinica_id === contexto.clinicaId &&
      fila.telefono_e164 === contexto.telefonoDelCanal,
  )

  if (suyo) return bien({ id: suyo.id })

  const { data: creado, error: errorAlta } = await bot
    .from('pacientes')
    .insert({
      clinica_id: contexto.clinicaId,
      nombre: borrador.nombre!,
      apellidos: borrador.apellidos!,
      telefono_e164: contexto.telefonoDelCanal,
      origen: 'whatsapp',
    })
    .select('id')
    .single()

  if (errorAlta) return mal('error_de_base', { porque: errorAlta.message })
  return bien({ id: (creado as { id: string }).id })
}

// ---------------------------------------------------------------------------
// 5 · no_te_entiendo
// ---------------------------------------------------------------------------

/**
 * Una sola ronda. El bloque 40 lo fija: «una sola ronda de aclaracion, nunca
 * bucles». A la segunda, esto devuelve `escalar` y el modelo pasa a recepcion.
 */
export const esquemaNoTeEntiendo = z.strictObject({
  que_falta: z.string().min(1).describe('Que dato concreto no ha quedado claro'),
})

export const RONDAS_MAXIMAS = 1

async function noTeEntiendo(bruto: unknown, contexto: Contexto): Promise<Resultado> {
  const args = esquemaNoTeEntiendo.parse(bruto)

  if (contexto.rondasDeAclaracion >= RONDAS_MAXIMAS) {
    return bien({
      escalar: true,
      porque:
        'ya has pedido una aclaracion. No preguntes otra vez: pasa a recepcion con escalar_a_recepcion',
    })
  }

  return bien({
    escalar: false,
    // El copy prohibido de `.claude/CLAUDE.md` va nombrado aqui para que el
    // modelo no lo escriba: toda negativa va seguida de lo que SI puede hacer.
    como: `Pide solo ${args.que_falta}, en una frase, sin decir que no le entiendes ni mencionar faltas de ortografia. Si es una pregunta abierta, hazla cerrada.`,
  })
}

// ---------------------------------------------------------------------------
// 6 · escalar_a_recepcion
// ---------------------------------------------------------------------------

/**
 * NO HAY NINGUN CAMPO DE TEXTO LIBRE, Y ES EL PUNTO ENTERO DE ESTA HERRAMIENTA.
 *
 * `escalados` tuvo una columna `resumen` y la migracion 007 la borro a
 * proposito. Su cabecera lo explica mejor que nadie: «Le duele el 26 y tiene la
 * cara hinchada» es articulo 9 del RGPD, y `escalados` sobrevive a la purga de
 * 90 dias, asi que ese texto se quedaba ahi para siempre.
 *
 * Ahora son dos enums y un puntero:
 *   `motivo` · POR QUE hubo que avisar (motivo_escalado)
 *   `asunto` · DE QUE iba (motivo_visita, el mismo vocabulario que la agenda)
 *   `mensaje_id` · el mensaje que lo disparo. Recepcion lo abre y lee la
 *                  conversacion mientras exista; cuando la purga se la lleva,
 *                  el puntero queda en null y el escalado sobrevive sin una
 *                  sola palabra de salud dentro.
 *
 * Si alguien anade aqui un `resumen: z.string()` porque «a recepcion le vendria
 * bien el contexto», esta reabriendo el agujero que cerro la 007.
 */
export const esquemaEscalar = z.strictObject({
  motivo: zMotivoEscalado.describe('Por que pasa a una persona'),
  asunto: zMotivo
    .optional()
    .describe('De que iba, del vocabulario cerrado. Nunca texto libre'),
})

/**
 * Escribe en `escalados` sin confirmacion del paciente, y es correcto: no
 * reserva nada ni toca su ficha. Pedirle permiso a alguien con la cara hinchada
 * para avisar al equipo seria justo lo contrario de lo que pide el bloque 60.
 *
 * La idempotencia no se comprueba aqui: la migracion 002 tiene un indice unico
 * parcial que impide dos escalados pendientes en la misma conversacion. V1
 * aprendio esto a golpes —el modelo escalo cuatro veces y la llamada se cayo— y
 * la garantia vive en la base, no en una comprobacion que se puede olvidar.
 */
async function escalar(bruto: unknown, contexto: Contexto): Promise<Resultado> {
  const args = esquemaEscalar.parse(bruto)
  const bot = clienteDe(contexto)

  const { error } = await bot.from('escalados').insert({
    clinica_id: contexto.clinicaId,
    conversacion_id: contexto.conversacionId,
    motivo: args.motivo,
    asunto: args.asunto ?? 'otro',
    // El detalle vive en `mensajes`, que SI se purga. Aqui solo el puntero.
    ...(contexto.mensajeId === undefined ? {} : { mensaje_id: contexto.mensajeId }),
    estado: 'pendiente',
  })

  // 23505: ya habia uno pendiente. No es un fallo, es la idempotencia
  // funcionando, y el paciente tiene que recibir el mensaje igual.
  const yaHabia = error?.code === '23505'
  if (error && !yaHabia) {
    contexto.registro?.error(`  ⚠  No se ha podido registrar el escalado: ${error.message}`)
  }

  return bien({
    avisado: true,
    ya_estaba: yaHabia,
    telefono_recepcion: contexto.telefonoRecepcion,
    como: 'Dile que recepcion le escribe o le llama hoy mismo y dale ese telefono. Ni una palabra sobre lo que pueda tener.',
  })
}

// ---------------------------------------------------------------------------
// El catalogo
// ---------------------------------------------------------------------------

export type Herramienta = {
  readonly nombre: string
  readonly descripcion: string
  readonly esquema: z.ZodType
  readonly escribeEnLaBase: boolean
}

/**
 * Las seis, y el orden en que se le presentan al modelo.
 *
 * `escribeEnLaBase` no lo usa el modelo: lo usan las pruebas, para poder
 * afirmar «ninguna herramienta de las que escriben ha llegado a correr» sin
 * tener que mantener la lista a mano en dos sitios.
 */
export const CATALOGO = {
  anotar: {
    nombre: 'anotar',
    descripcion:
      'Apunta UN dato de la cita que el paciente acabe de decir. Un dato por llamada, nunca dos. No escribe nada en la base de datos.',
    esquema: esquemaAnotar,
    escribeEnLaBase: false,
  },
  repasar_ficha: {
    nombre: 'repasar_ficha',
    descripcion:
      'Mira si el numero desde el que escriben ya tiene ficha y que citas tiene pendientes. No lleva argumentos.',
    esquema: esquemaRepasarFicha,
    escribeEnLaBase: false,
  },
  consultar_huecos: {
    nombre: 'consultar_huecos',
    descripcion:
      'Las horas libres de verdad para un tratamiento y un dia. Es la UNICA forma de saber un hueco: nunca digas una hora que no venga de aqui.',
    esquema: esquemaConsultarHuecos,
    escribeEnLaBase: false,
  },
  crear_cita: {
    nombre: 'crear_cita',
    descripcion:
      'Reserva la cita. Solo despues de repetirle los datos al paciente y de que el diga que si. Acepta cualquier hora exacta, tambien una que no estuviera entre las ofrecidas.',
    esquema: esquemaCrearCita,
    escribeEnLaBase: true,
  },
  no_te_entiendo: {
    nombre: 'no_te_entiendo',
    descripcion:
      'Cuando lo que has leido no se entiende. Te dice como volver a preguntar. Una sola vez por conversacion.',
    esquema: esquemaNoTeEntiendo,
    escribeEnLaBase: false,
  },
  escalar_a_recepcion: {
    nombre: 'escalar_a_recepcion',
    descripcion:
      'Pasa la conversacion a una persona y avisa al equipo. Ante dolor, hinchazon, un golpe o sangrado, esto va primero y va solo.',
    esquema: esquemaEscalar,
    escribeEnLaBase: true,
  },
} as const satisfies Record<string, Herramienta>

export type NombreDeHerramienta = keyof typeof CATALOGO
export const NOMBRES = Object.keys(CATALOGO) as NombreDeHerramienta[]

export function esHerramienta(nombre: string): nombre is NombreDeHerramienta {
  return Object.prototype.hasOwnProperty.call(CATALOGO, nombre)
}

/** Lo que `gemini.ts` le pasa al SDK. Zod es la unica fuente del esquema. */
export function declaraciones() {
  return NOMBRES.map((nombre) => {
    const herramienta = CATALOGO[nombre]
    const esquema = z.toJSONSchema(herramienta.esquema, { io: 'input' }) as Record<string, unknown>
    // `$schema` no lo entiende la API de Google y hace fallar la peticion
    // entera con un error que no nombra el campo.
    delete esquema.$schema
    return {
      name: herramienta.nombre,
      description: herramienta.descripcion,
      parametersJsonSchema: esquema,
    }
  })
}

export type Ejecucion = {
  readonly nombre: string
  readonly resultado: Resultado
  readonly borrador: Borrador
  readonly ofrecidas?: readonly Opcion[]
}

/**
 * El unico sitio por el que se llama a una herramienta.
 *
 * Un nombre que no este en `CATALOGO` no se ejecuta. No lanza: devuelve un
 * resultado de error, porque tumbar la conversacion de un paciente porque el
 * modelo se ha inventado una funcion es peor que decirle que esa funcion no
 * existe y dejar que siga.
 */
export async function ejecutar(
  nombre: string,
  argumentos: unknown,
  contexto: Contexto,
): Promise<Ejecucion> {
  if (!esHerramienta(nombre)) {
    contexto.registro?.error(
      `  ⚠  El modelo ha pedido una herramienta que no existe: ${JSON.stringify(nombre)}. ` +
        `Las que hay son: ${NOMBRES.join(', ')}.`,
    )
    return {
      nombre,
      resultado: mal('herramienta_desconocida', {
        porque: 'esa herramienta no existe',
        disponibles: NOMBRES,
      }),
      borrador: contexto.borrador,
    }
  }

  try {
    switch (nombre) {
      case 'anotar': {
        const { resultado, borrador } = await anotar(argumentos, contexto)
        return { nombre, resultado, borrador }
      }
      case 'repasar_ficha':
        return {
          nombre,
          resultado: await repasarFicha(argumentos, contexto),
          borrador: contexto.borrador,
        }
      case 'consultar_huecos': {
        const { resultado, borrador, ofrecidas } = await consultarHuecos(argumentos, contexto)
        return { nombre, resultado, borrador, ofrecidas }
      }
      case 'crear_cita': {
        const { resultado, borrador } = await crearCita(argumentos, contexto)
        return { nombre, resultado, borrador }
      }
      case 'no_te_entiendo':
        return {
          nombre,
          resultado: await noTeEntiendo(argumentos, contexto),
          borrador: contexto.borrador,
        }
      case 'escalar_a_recepcion':
        return {
          nombre,
          resultado: await escalar(argumentos, contexto),
          borrador: contexto.borrador,
        }
    }
  } catch (fallo) {
    // Un error de Zod es lo normal aqui: el modelo ha mandado algo que no
    // valida. Se le devuelve el motivo para que lo corrija, no se revienta.
    const porque =
      fallo instanceof z.ZodError
        ? fallo.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        : fallo instanceof Error
          ? fallo.message
          : String(fallo)

    contexto.registro?.info(`  ${nombre} rechazada: ${porque}`)
    return {
      nombre,
      resultado: mal('argumentos_no_validos', { porque }),
      borrador: contexto.borrador,
    }
  }
}
