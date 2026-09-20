/**
 * El montador del prompt.
 *
 * Coge los bloques de `contenido/bloques/` —que viven en la tabla
 * `bloques_prompt`, una copia por clinica— y los convierte en el texto que lee
 * el modelo. Tres reglas y ninguna sorpresa:
 *
 *   1. Se ordenan por `orden`, de menor a mayor.
 *   2. Se descarta lo que lleve `activo = false`.
 *   3. Se descarta lo que tenga un titulo que empiece por `_`.
 *
 * Las reglas 2 y 3 ya las aplica la RLS para el bot (`bloques_prompt_bot_select`
 * lleva `and activo = true`). Se repiten aqui a proposito y NO es lo mismo que
 * el doble filtrado que filtro.ts evita: alli el filtro en codigo taparia un
 * fallo de la RLS; aqui el montador tambien lo usa el panel, que lee con el
 * cliente de la clinica y SI ve los borradores. Sin la regla 2, la vista previa
 * del panel enseñaria un prompt que el bot nunca tendra.
 *
 * LOS HUECOS
 *
 * `{{clinica}}` `{{bot}}` `{{trato}}` `{{privacidad}}` `{{fecha_hoy}}`
 * `{{datos}}` `{{tratamientos}}` `{{faq}}` `{{horario}}`
 *
 * Un hueco que no este en esa lista se avisa en el registro y se deja escrito
 * tal cual. No se borra y no revienta el montaje: si una clinica se equivoca al
 * escribir `{{horarios}}` en plural un martes por la tarde, el bot sigue
 * atendiendo y el error sale en el log, en vez de quedarse el prompt a medias o
 * sin arrancar.
 *
 * La sustitucion es de UNA pasada: lo que entra por un hueco no se vuelve a
 * mirar. Si una respuesta de la FAQ contuviera `{{faq}}`, se queda como texto.
 */
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'

import type { Registro } from './contador'
import type {
  Cargado,
  DatosDelPrompt,
  FilaConfig,
  FilaFaq,
  FilaHorario,
  FilaTratamiento,
} from './filtro'
import {
  origenDe,
  soloOrigenes,
  type ConOrigen,
  type Origen,
  type RegistroDeOrigenes,
} from './origen'

/** Lo minimo que necesita un bloque para poder montarse. */
export type BloqueMontable = {
  readonly id: string
  readonly orden: number
  readonly titulo: string
  readonly contenido: string
  readonly activo: boolean
}

export const HUECOS_CONOCIDOS = [
  'clinica',
  'bot',
  'trato',
  // Tiene hueco propio, y no una linea mas dentro de {{datos}}, porque
  // identificarse y enlazar la politica de privacidad es una obligacion legal
  // (art. 50 del Reglamento europeo de IA, art. 13 del RGPD) y no puede
  // depender de que el modelo redacte bien una URL que ha leido en una lista.
  // Aqui entra el enlace solo, literal, y el bloque 05 manda copiarlo tal cual.
  'privacidad',
  'fecha_hoy',
  'datos',
  'tratamientos',
  'faq',
  'horario',
] as const
export type HuecoConocido = (typeof HUECOS_CONOCIDOS)[number]

export type Valores = Readonly<Record<string, string>>

/**
 * Tolera espacios dentro de las llaves (`{{ faq }}`) porque quien edita esto
 * desde el panel es la clinica, no un programador.
 */
const HUECO = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

export type Sustitucion = {
  readonly texto: string
  readonly usados: readonly string[]
  readonly desconocidos: readonly string[]
}

export function sustituir(texto: string, valores: Valores): Sustitucion {
  const usados = new Set<string>()
  const desconocidos = new Set<string>()

  const resultado = texto.replace(HUECO, (completo, nombre: string) => {
    const valor = valores[nombre]
    if (valor === undefined) {
      desconocidos.add(nombre)
      // Tal cual, con sus llaves y sus espacios. Que se vea en el prompt es
      // feo; que desaparezca sin dejar rastro es peor.
      return completo
    }
    usados.add(nombre)
    return valor
  })

  return { texto: resultado, usados: [...usados], desconocidos: [...desconocidos] }
}

// ---------------------------------------------------------------------------
// Como se escribe cada hueco
// ---------------------------------------------------------------------------

const VACIO = {
  datos: '(esta clinica no tiene ningun dato publicado)',
  tratamientos: '(esta clinica no tiene ningun tratamiento publicado)',
  faq: '(esta clinica no tiene ninguna pregunta frecuente aprobada)',
  horario: '(esta clinica no tiene ningun horario configurado)',
  privacidad: '(esta clinica no ha configurado su politica de privacidad)',
} as const

/**
 * La clave de `config` de la que sale `{{privacidad}}`.
 *
 * Vive en `config` y no en el texto de un bloque porque es un dato de la
 * clinica, no una forma de hablar: se cambia desde el panel un martes por la
 * mañana. Lo que si esta escrito en el bloque 05 es la orden de copiarlo
 * literalmente.
 */
export const CLAVE_PRIVACIDAD = 'politica_privacidad'

/** `09:00:00` de Postgres -> `09:00`, que es como lo diria una persona. */
function hhmm(hora: string): string {
  return hora.slice(0, 5)
}

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const
/** Lunes primero, domingo el ultimo: como lo lee cualquiera en España. */
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0] as const

function conMayuscula(palabra: string): string {
  return palabra.charAt(0).toUpperCase() + palabra.slice(1)
}

/** Las filas de `config` que van a {{datos}}: todas menos la de privacidad. */
function configDeDatos(config: Cargado<FilaConfig>) {
  return config.filas.filter(({ dato }) => dato.clave !== CLAVE_PRIVACIDAD)
}

export function escribirDatos(config: Cargado<FilaConfig>, telefono: string): string {
  // El telefono de recepcion sale de `clinicas` y siempre esta, asi que este
  // hueco nunca queda en blanco. Cuando no hay nada mas se dice con todas las
  // letras: un hueco vacio invita a rellenarlo, y lo que rellena un modelo
  // cuando no tiene el dato es exactamente lo que este producto no hace.
  //
  // La politica de privacidad NO se repite aqui: tiene su propio hueco. Dos
  // copias del mismo enlace, una presentada como «dato» y otra como texto
  // literal, es una invitacion a parafrasear la primera.
  const filas = configDeDatos(config)
  const lineas = [`Telefono de recepcion: ${telefono}`]
  if (filas.length === 0) lineas.push(VACIO.datos)
  else lineas.push(...filas.map(({ dato }) => `${dato.clave}: ${dato.valor}`))
  return lineas.join('\n')
}

/**
 * El enlace de la politica de privacidad, solo y tal cual.
 *
 * Sin adornos, sin «puedes consultarla en»: el bloque 05 pone alrededor lo que
 * haga falta. Cuanto menos texto acompañe a la URL, menos hay que reescribir
 * para colocarla, y menos ocasiones de equivocarla.
 */
export function escribirPrivacidad(config: Cargado<FilaConfig>): string {
  const fila = config.filas.find(({ dato }) => dato.clave === CLAVE_PRIVACIDAD)
  const valor = fila?.dato.valor.trim()
  return valor ? valor : VACIO.privacidad
}

export function escribirTratamientos(tratamientos: Cargado<FilaTratamiento>): string {
  if (tratamientos.filas.length === 0) return VACIO.tratamientos
  return tratamientos.filas
    .map(({ dato }) => {
      const cabecera = `${dato.nombre} (${dato.codigo}) - ${dato.duracion_min} min`
      return dato.frase_bot ? `${cabecera}. ${dato.frase_bot}` : `${cabecera}.`
    })
    .join('\n')
}

export function escribirFaq(faq: Cargado<FilaFaq>): string {
  if (faq.filas.length === 0) return VACIO.faq
  return faq.filas
    .map(({ dato }) => `P: ${dato.pregunta}\nR: ${dato.respuesta_aprobada}`)
    .join('\n\n')
}

/**
 * Agrupa los dias que abren exactamente igual: «Lunes a viernes: 09:00 a 14:00
 * y 15:30 a 20:00» en vez de cinco lineas identicas. El modelo lee menos y se
 * equivoca menos.
 */
export function escribirHorario(horarios: Cargado<FilaHorario>): string {
  if (horarios.filas.length === 0) return VACIO.horario

  const porDia = new Map<number, string[]>()
  for (const { dato } of horarios.filas) {
    const tramos = porDia.get(dato.dia_semana) ?? []
    tramos.push(`${hhmm(dato.hora_inicio)} a ${hhmm(dato.hora_fin)}`)
    porDia.set(dato.dia_semana, tramos)
  }

  const abiertos = ORDEN_DIAS.filter((dia) => porDia.has(dia)).map((dia) => ({
    dia,
    tramos: porDia.get(dia)!.join(' y '),
  }))

  const grupos: { desde: number; hasta: number; tramos: string }[] = []
  for (const { dia, tramos } of abiertos) {
    const ultimo = grupos[grupos.length - 1]
    const seguido =
      ultimo !== undefined &&
      ultimo.tramos === tramos &&
      ORDEN_DIAS.indexOf(dia as (typeof ORDEN_DIAS)[number]) ===
        ORDEN_DIAS.indexOf(ultimo.hasta as (typeof ORDEN_DIAS)[number]) + 1

    if (seguido) ultimo.hasta = dia
    else grupos.push({ desde: dia, hasta: dia, tramos })
  }

  return grupos
    .map(({ desde, hasta, tramos }) => {
      const nombre =
        desde === hasta
          ? conMayuscula(DIAS[desde]!)
          : `${conMayuscula(DIAS[desde]!)} a ${DIAS[hasta]!}`
      return `${nombre}: ${tramos}`
    })
    .join('\n')
}

/** «jueves, 17 de septiembre de 2026, 21:30», en la hora de la clinica. */
export function escribirFechaHoy(ahora: Date, zonaHoraria: string): string {
  return formatInTimeZone(ahora, zonaHoraria, "EEEE, d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
}

/** Lo que V1 ponia en la hoja: «Trata de usted» o «Tutea». */
export function escribirTrato(trato: 'usted' | 'tu'): string {
  return trato === 'usted'
    ? 'Trata de usted. Nunca tutees, ni aunque el paciente te tutee a ti.'
    : 'Tutea. Con naturalidad, sin exceso de confianza.'
}

// ---------------------------------------------------------------------------
// El montaje
// ---------------------------------------------------------------------------

export type Descartado = {
  readonly origen: Origen
  readonly titulo: string
  readonly motivo: 'inactivo' | 'guion_bajo'
}

export type PromptMontado = {
  readonly texto: string
  /** Los bloques que entraron, en el orden en que entraron. */
  readonly bloques: readonly ConOrigen<BloqueMontable>[]
  readonly descartados: readonly Descartado[]
  /** Que hueco se llevo que filas. Para la auditoria de fuga. */
  readonly origenes: RegistroDeOrigenes
  readonly huecosDesconocidos: readonly string[]
}

/** Un bloque cuyo titulo empieza por `_` es un apunte, no un trozo de prompt. */
function esApunte(titulo: string): boolean {
  return titulo.trimStart().startsWith('_')
}

export function ordenarBloques(bloques: readonly BloqueMontable[]): BloqueMontable[] {
  // El desempate por titulo no deberia hacer falta —`bloques_prompt` tiene
  // `unique (clinica_id, orden)`— pero esta funcion tambien monta listas que no
  // vienen de la base, y un prompt que cambia de orden entre dos ejecuciones es
  // imposible de depurar.
  return [...bloques].sort((a, b) => a.orden - b.orden || (a.titulo < b.titulo ? -1 : 1))
}

/**
 * Monta el prompt a partir de bloques ya cargados y de los valores de los
 * huecos. Es la mitad pura: ni toca la base de datos ni conoce el reloj.
 */
export function montarPrompt(
  bloques: readonly BloqueMontable[],
  valores: Valores,
  origenes: RegistroDeOrigenes = {},
  registro?: Registro,
): PromptMontado {
  const descartados: Descartado[] = []
  const admitidos: ConOrigen<BloqueMontable>[] = []

  for (const bloque of ordenarBloques(bloques)) {
    const origen = origenDe('bloques_prompt', bloque.id)

    if (!bloque.activo) {
      descartados.push({ origen, titulo: bloque.titulo, motivo: 'inactivo' })
      continue
    }
    if (esApunte(bloque.titulo)) {
      descartados.push({ origen, titulo: bloque.titulo, motivo: 'guion_bajo' })
      continue
    }
    admitidos.push({ dato: bloque, origen })
  }

  const desconocidos = new Set<string>()
  const partes: string[] = []

  for (const { dato } of admitidos) {
    const sustituido = sustituir(dato.contenido, valores)
    for (const nombre of sustituido.desconocidos) desconocidos.add(nombre)
    partes.push(sustituido.texto.trim())
  }

  const huecosDesconocidos = [...desconocidos]

  if (registro) {
    for (const d of descartados) {
      const porque = d.motivo === 'inactivo' ? 'activo = false' : 'el titulo empieza por "_"'
      registro.info(`  bloque descartado (${porque}): ${d.origen} «${d.titulo}»`)
    }
    if (huecosDesconocidos.length > 0) {
      registro.error(
        `  ⚠  Huecos que no existen y se han dejado escritos tal cual en el prompt: ` +
          `${huecosDesconocidos.map((h) => `{{${h}}}`).join(', ')}. ` +
          `Los que hay son: ${HUECOS_CONOCIDOS.map((h) => `{{${h}}}`).join(', ')}.`,
      )
    }
  }

  return {
    texto: partes.join('\n\n'),
    bloques: admitidos,
    descartados,
    origenes,
    huecosDesconocidos,
  }
}

/**
 * Los ocho valores, con la lista de filas de la que sale cada uno.
 *
 * `ahora` se pasa por parametro y no se lee del reloj aqui dentro para que la
 * prueba pueda fijar el dia: un prompt que cambia solo no se puede comprobar.
 */
export function valoresDelPrompt(
  datos: DatosDelPrompt,
  ahora: Date = new Date(),
): { valores: Record<HuecoConocido, string>; origenes: RegistroDeOrigenes } {
  const clinica = datos.clinica.dato

  const valores: Record<HuecoConocido, string> = {
    clinica: clinica.nombre,
    bot: clinica.nombre_bot,
    trato: escribirTrato(clinica.trato),
    privacidad: escribirPrivacidad(datos.config),
    fecha_hoy: escribirFechaHoy(ahora, clinica.zona_horaria),
    datos: escribirDatos(datos.config, clinica.telefono_recepcion),
    tratamientos: escribirTratamientos(datos.tratamientos),
    faq: escribirFaq(datos.faq),
    horario: escribirHorario(datos.horarios),
  }

  const deLaClinica = [datos.clinica.origen]
  const laPrivacidad = datos.config.filas.filter(
    ({ dato }) => dato.clave === CLAVE_PRIVACIDAD,
  )

  const origenes: RegistroDeOrigenes = {
    clinica: deLaClinica,
    bot: deLaClinica,
    trato: deLaClinica,
    privacidad: soloOrigenes(laPrivacidad),
    fecha_hoy: [],
    // El telefono de recepcion sale de `clinicas`, las demas lineas de `config`
    // menos la de privacidad, que se lleva su propio hueco.
    datos: [...deLaClinica, ...soloOrigenes(configDeDatos(datos.config))],
    tratamientos: soloOrigenes(datos.tratamientos.filas),
    faq: soloOrigenes(datos.faq.filas),
    horario: soloOrigenes(datos.horarios.filas),
  }

  return { valores, origenes }
}

/** Todo junto: de lo que cargo `filtro.ts` al texto final. */
export function montarPromptDeDatos(
  datos: DatosDelPrompt,
  opciones: { ahora?: Date; registro?: Registro } = {},
): PromptMontado {
  const { valores, origenes } = valoresDelPrompt(datos, opciones.ahora)
  const bloques = datos.bloques.filas.map(({ dato }) => dato)
  return montarPrompt(bloques, valores, origenes, opciones.registro)
}
