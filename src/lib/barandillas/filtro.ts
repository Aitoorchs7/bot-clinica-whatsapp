/**
 * Barandilla 1: el filtro de entrada ES la RLS.
 *
 * Este archivo carga lo que va a entrar en el prompt, y lo carga con el cliente
 * del bot. Eso significa que la fila con `publico = false` no se descarta aqui:
 * NO LLEGA. La consulta la devuelve sin ella porque las politicas de
 * supabase/migrations/20260916100400_rls.sql llevan `and publico = true`.
 *
 * LO QUE AQUI **NO** SE HACE, Y ES LO IMPORTANTE
 *
 * No hay un solo `.eq('publico', true)` en las consultas de este archivo, y su
 * ausencia es deliberada. Si lo hubiera, el filtrado ocurriria dos veces —una
 * en Postgres y otra en TypeScript— y la segunda taparia el fallo de la
 * primera: el dia que una politica se rompiera, este modulo seguiria
 * devolviendo solo filas publicas y nadie se enteraria. F1 ya midio lo que pasa
 * cuando una barandilla se cae en silencio.
 *
 * Asi que se pide sin filtrar y despues se COMPRUEBA lo que ha llegado. Lo que
 * no debia venir se cuenta, se nombra por su origen y se tira:
 *
 *   - `publicas`  filas que pasaron la comprobacion y van al prompt
 *   - `retenidas` filas que llegaron y NO debian. Con la RLS puesta es siempre
 *                 0; cualquier otra cosa es una fuga en curso
 *
 * De lo retenido no se registra ni una palabra de su contenido: solo su origen
 * `tabla#id` (ver origen.ts). Un aviso de fuga que copie el secreto en el log
 * es otra fuga.
 *
 * Y la comprobacion no mira solo `publico`. Mira tambien `clinica_id`, que es
 * la otra mitad de la promesa: el bot de una clinica no ve nada de la de al
 * lado.
 */
import { crearClienteBot } from '@/lib/supabase/bot'
import type { Database } from '@/tipos/bd'

import { conOrigenes, origenDe, type ConOrigen, type Origen } from './origen'

type Tablas = Database['public']['Tables']

/**
 * Columnas, no `*`. Lo que no se pide no puede colarse por accidente:
 * `config.comentario` son las notas internas de la clinica y `faq.embedding`
 * son 768 numeros que no pintan nada en un prompt.
 */
export type FilaClinica = Pick<
  Tablas['clinicas']['Row'],
  'id' | 'nombre' | 'nombre_bot' | 'trato' | 'zona_horaria' | 'telefono_recepcion'
>
export type FilaConfig = Pick<
  Tablas['config']['Row'],
  'id' | 'clinica_id' | 'clave' | 'valor' | 'publico'
>
export type FilaTratamiento = Pick<
  Tablas['tratamientos']['Row'],
  'id' | 'clinica_id' | 'codigo' | 'nombre' | 'duracion_min' | 'frase_bot' | 'publico' | 'activo'
>
export type FilaFaq = Pick<
  Tablas['faq']['Row'],
  'id' | 'clinica_id' | 'pregunta' | 'respuesta_aprobada' | 'publico'
>
export type FilaHorario = Pick<
  Tablas['horarios']['Row'],
  'id' | 'clinica_id' | 'dia_semana' | 'hora_inicio' | 'hora_fin'
>
export type FilaBloque = Pick<
  Tablas['bloques_prompt']['Row'],
  'id' | 'clinica_id' | 'orden' | 'titulo' | 'contenido' | 'activo'
>

const COLUMNAS_CLINICA = 'id, nombre, nombre_bot, trato, zona_horaria, telefono_recepcion'
const COLUMNAS_CONFIG = 'id, clinica_id, clave, valor, publico'
const COLUMNAS_TRATAMIENTOS =
  'id, clinica_id, codigo, nombre, duracion_min, frase_bot, publico, activo'
const COLUMNAS_FAQ = 'id, clinica_id, pregunta, respuesta_aprobada, publico'
const COLUMNAS_HORARIOS = 'id, clinica_id, dia_semana, hora_inicio, hora_fin'
const COLUMNAS_BLOQUES = 'id, clinica_id, orden, titulo, contenido, activo'

/** Lo que pide la barandilla 2. Siempre `total = publicas + retenidas`. */
export type Recuento = {
  readonly total: number
  readonly publicas: number
  readonly retenidas: number
}

export type Cargado<T> = {
  /** Solo lo que paso la comprobacion. Es lo unico que ve el montador. */
  readonly filas: readonly ConOrigen<T>[]
  readonly recuento: Recuento
  /** Origenes de lo retenido. Sin contenido, a proposito. */
  readonly retenidos: readonly Origen[]
}

/** Devuelve true si la fila tenia derecho a llegar hasta aqui. */
type Guardia<T> = (fila: T) => boolean

/**
 * El nucleo comprobable de este archivo, separado a proposito de la consulta
 * para poder alimentarlo con filas inventadas desde las pruebas: simular una
 * RLS rota es tan facil como pasarle una fila con `publico: false`.
 */
export function aplicarGuardia<T extends { id: string | number }>(
  tabla: string,
  filas: readonly T[],
  guardia: Guardia<T>,
): Cargado<T> {
  const buenas: T[] = []
  const retenidos: Origen[] = []

  for (const fila of filas) {
    if (guardia(fila)) buenas.push(fila)
    else retenidos.push(origenDe(tabla, fila.id))
  }

  return {
    filas: conOrigenes(tabla, buenas),
    recuento: {
      total: filas.length,
      publicas: buenas.length,
      retenidas: retenidos.length,
    },
    retenidos,
  }
}

/**
 * Un error de PostgREST aqui NO se traga.
 *
 * Devolver una lista vacia seria peor que fallar: el modelo diria con toda
 * naturalidad que la clinica no tiene preguntas frecuentes, o que no abre
 * ningun dia, y sonaria igual de seguro que cuando dice la verdad.
 */
function exigir<T>(tabla: string, data: T[] | null, error: { message: string } | null): T[] {
  if (error) throw new Error(`Cargando ${tabla} para el prompt: ${error.message}`)
  return data ?? []
}

export type DatosDelPrompt = {
  readonly clinicaId: string
  readonly clinica: ConOrigen<FilaClinica>
  readonly config: Cargado<FilaConfig>
  readonly tratamientos: Cargado<FilaTratamiento>
  readonly faq: Cargado<FilaFaq>
  readonly horarios: Cargado<FilaHorario>
  readonly bloques: Cargado<FilaBloque>
}

/** Las tablas que cuenta la barandilla 2, en el orden en que se registran. */
export const TABLAS_CONTADAS = ['config', 'tratamientos', 'faq', 'horarios', 'bloques'] as const
export type TablaContada = (typeof TABLAS_CONTADAS)[number]

export type ClienteDelBot = ReturnType<typeof crearClienteBot>

/**
 * Carga todo lo que necesita un prompt, con el cliente del bot.
 *
 * El `clinicaId` que se pasa aqui es el mismo que viaja firmado dentro del JWT,
 * asi que comprobar `clinica_id` no es una tautologia: compara lo que ha
 * devuelto Postgres contra lo que este proceso creia estar pidiendo.
 */
export async function cargarDatosDelPrompt(
  clinicaId: string,
  cliente?: ClienteDelBot,
): Promise<DatosDelPrompt> {
  const bot = cliente ?? crearClienteBot(clinicaId)
  const deEstaClinica = (fila: { clinica_id: string }) => fila.clinica_id === clinicaId

  const [clinicas, config, tratamientos, faq, horarios, bloques] = await Promise.all([
    bot.from('clinicas').select(COLUMNAS_CLINICA),
    bot.from('config').select(COLUMNAS_CONFIG).order('clave'),
    // `activo` aqui es negocio, no seguridad: un tratamiento retirado del
    // catalogo no se ofrece, pero que llegue no es ninguna fuga. Por eso se
    // filtra en la consulta y no en la guardia.
    bot.from('tratamientos').select(COLUMNAS_TRATAMIENTOS).eq('activo', true).order('nombre'),
    bot.from('faq').select(COLUMNAS_FAQ).order('pregunta'),
    bot.from('horarios').select(COLUMNAS_HORARIOS).order('dia_semana').order('hora_inicio'),
    bot.from('bloques_prompt').select(COLUMNAS_BLOQUES).order('orden'),
  ])

  // La clinica es una fila y no una lista, pero se pide sin `.single()` y pasa
  // por la misma guardia: con `.single()`, una RLS rota que devolviera tambien
  // la clinica de al lado reventaria con un error de PostgREST que no distingue
  // "no hay ninguna" de "hay dos", y se perderia el unico sintoma util.
  const clinicas_ = aplicarGuardia(
    'clinicas',
    exigir('clinicas', clinicas.data, clinicas.error),
    (fila) => fila.id === clinicaId,
  )

  const propia = clinicas_.filas[0]
  if (!propia || clinicas_.filas.length !== 1 || clinicas_.recuento.retenidas > 0) {
    throw new Error(
      `El bot de la clinica ${clinicaId} no ha recibido exactamente su clinica y solo la suya ` +
        `(recibidas ${clinicas_.recuento.total}, suyas ${clinicas_.recuento.publicas}). ` +
        'Sin ese dato no se monta ningun prompt.',
    )
  }

  return {
    clinicaId,
    clinica: propia,
    config: aplicarGuardia(
      'config',
      exigir('config', config.data, config.error),
      (fila) => deEstaClinica(fila) && fila.publico === true,
    ),
    tratamientos: aplicarGuardia(
      'tratamientos',
      exigir('tratamientos', tratamientos.data, tratamientos.error),
      (fila) => deEstaClinica(fila) && fila.publico === true,
    ),
    faq: aplicarGuardia(
      'faq',
      exigir('faq', faq.data, faq.error),
      (fila) => deEstaClinica(fila) && fila.publico === true,
    ),
    // horarios no tiene `publico`: los tramos de apertura son publicos por
    // definicion. Lo que sigue importando es de quien son.
    horarios: aplicarGuardia('horarios', exigir('horarios', horarios.data, horarios.error), (fila) =>
      deEstaClinica(fila),
    ),
    // Para los bloques, `activo` SI es seguridad: un borrador sin aprobar es
    // exactamente lo que la clinica todavia no quiere que se diga, y la
    // politica del bot lo excluye. El montador lo vuelve a comprobar.
    bloques: aplicarGuardia(
      'bloques_prompt',
      exigir('bloques_prompt', bloques.data, bloques.error),
      (fila) => deEstaClinica(fila) && fila.activo === true,
    ),
  }
}

/** Los recuentos por tabla, que es lo que registra el contador. */
export function recuentosDe(datos: DatosDelPrompt): Record<TablaContada, Recuento> {
  return {
    config: datos.config.recuento,
    tratamientos: datos.tratamientos.recuento,
    faq: datos.faq.recuento,
    horarios: datos.horarios.recuento,
    bloques: datos.bloques.recuento,
  }
}

/** Todo lo retenido, de todas las tablas, para el aviso de fuga. */
export function retenidosDe(datos: DatosDelPrompt): Origen[] {
  return [
    ...datos.config.retenidos,
    ...datos.tratamientos.retenidos,
    ...datos.faq.retenidos,
    ...datos.horarios.retenidos,
    ...datos.bloques.retenidos,
  ]
}
