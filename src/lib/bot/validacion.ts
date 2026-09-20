/**
 * Lo que se le exige a un dato antes de dejarlo entrar.
 *
 * Aqui no hay ninguna regla nueva: es la tabla de casos de V1 (T4) portada a
 * Zod. V1 la resume en una linea que sigue mandando:
 *
 *   «Si algo no cuadra, no se apunta a medias ni se completa por el bot: se
 *    vuelve a preguntar explicando que ha pasado.»
 *
 * Por eso ninguna funcion de este archivo "arregla" un dato dudoso. Normaliza
 * lo que es inequivocamente lo mismo —quitar los espacios de un telefono, el
 * prefijo +34— y rechaza todo lo demas con un motivo escrito en castellano,
 * porque ese motivo se lo va a leer el modelo para volver a preguntar.
 *
 * EL MENSAJE DE ERROR ES PARTE DEL PRODUCTO
 *
 * `crear_cita` puede fallar por seis motivos distintos y el bloque 30 prohibe
 * expresamente confundirlos: decirle a alguien que su hora esta cogida cuando
 * la clinica esta cerrada es el fallo que V1 documenta. Lo mismo vale aqui: un
 * telefono al que le falta un digito y uno que empieza por 3 se rechazan con
 * dos frases distintas, porque el paciente tiene que saber que corregir.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Telefono
// ---------------------------------------------------------------------------

/**
 * Nueve digitos y empieza por 6, 7, 8 o 9. Es la definicion de V1 y no se
 * amplia: un movil frances o un 800 de pago no son telefonos a los que esta
 * clinica vaya a llamar para recordar una cita.
 */
const NUEVE_DIGITOS = /^[6-9][0-9]{8}$/

/** Lo que una persona escribe de verdad: `610 22 45 71`, `610-224-571`. */
const SEPARADORES = /[\s.\-()]/g

export const PREFIJO_ES = '+34'

export type TelefonoMal =
  | 'vacio'
  | 'tiene_letras'
  | 'faltan_digitos'
  | 'sobran_digitos'
  | 'no_empieza_bien'
  | 'prefijo_no_espanol'

/** La frase que leera el modelo para volver a preguntar. */
export const PORQUE_NO_VALE: Readonly<Record<TelefonoMal, string>> = {
  vacio: 'no me has dado ningun numero',
  tiene_letras: 'ese numero lleva letras',
  faltan_digitos: 'faltan digitos: un telefono espanol tiene nueve',
  sobran_digitos: 'sobran digitos: un telefono espanol tiene nueve',
  no_empieza_bien: 'un telefono espanol empieza por 6, 7, 8 o 9',
  prefijo_no_espanol: 'ese prefijo no es espanol',
}

export type TelefonoValidado =
  | { readonly ok: true; readonly e164: string; readonly nacional: string }
  | { readonly ok: false; readonly motivo: TelefonoMal; readonly porque: string }

/**
 * `610 22 45 71` y `+34610224571` son el mismo telefono y los dos salen de aqui
 * como `+34610224571`, que es lo que exige el CHECK de `pacientes`.
 */
export function validarTelefono(entrada: string): TelefonoValidado {
  const mal = (motivo: TelefonoMal): TelefonoValidado => ({
    ok: false,
    motivo,
    porque: PORQUE_NO_VALE[motivo],
  })

  const limpio = entrada.replace(SEPARADORES, '')
  if (limpio === '') return mal('vacio')

  // El `+` solo vale delante. Un `+` en medio es otra cosa, no un prefijo.
  const conMas = limpio.startsWith('+')
  const cuerpo = conMas ? limpio.slice(1) : limpio

  if (!/^[0-9]+$/.test(cuerpo)) return mal('tiene_letras')

  // El prefijo solo se quita si de verdad hay uno. Un numero de diez digitos
  // sin `+` no es un prefijo desconocido: es un telefono con un digito de mas,
  // y decirle a alguien que su prefijo no es espanol cuando lo que le sobra es
  // un numero le manda a corregir lo que no toca.
  let nacional = cuerpo
  if (cuerpo.startsWith('0034')) {
    // Como lo marca media Espana desde un fijo antiguo.
    nacional = cuerpo.slice(4)
  } else if (cuerpo.startsWith('34') && cuerpo.length > 9) {
    nacional = cuerpo.slice(2)
  } else if (conMas) {
    // Llevaba `+` y lo que sigue no es 34: eso si es otro pais.
    return mal('prefijo_no_espanol')
  }

  if (nacional.length < 9) return mal('faltan_digitos')
  if (nacional.length > 9) return mal('sobran_digitos')
  if (!NUEVE_DIGITOS.test(nacional)) return mal('no_empieza_bien')

  return { ok: true, e164: `${PREFIJO_ES}${nacional}`, nacional }
}

/** El mismo validador, como esquema, para los argumentos de `anotar`. */
export const zTelefono = z
  .string()
  .transform((valor, ctx) => {
    const resultado = validarTelefono(valor)
    if (!resultado.ok) {
      ctx.addIssue({ code: 'custom', message: resultado.porque })
      return z.NEVER
    }
    return resultado.e164
  })

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

/**
 * Letras, tildes, la enye, guiones y apostrofos. Ni digitos ni signos.
 *
 * Los apostrofos y guiones NO son un adorno: `O'Donnell`, `D'Angelo`,
 * `Sainz-Pardo` y `Mari Carmen` son apellidos espanoles corrientes y un
 * validador que los rechace manda a recepcion a gente que no lo necesita.
 * Se aceptan los dos apostrofos, el recto y el tipografico, porque el teclado
 * de un movil pone el segundo sin avisar.
 */
const LETRAS = /^[\p{L}][\p{L}\s'’\-·]*$/u

export type NombreMal = 'vacio' | 'muy_corto' | 'muy_largo' | 'tiene_numeros' | 'caracteres_raros'

export const PORQUE_NO_VALE_NOMBRE: Readonly<Record<NombreMal, string>> = {
  vacio: 'no me has dado ningun nombre',
  muy_corto: 'ese nombre es demasiado corto',
  muy_largo: 'ese nombre es demasiado largo',
  tiene_numeros: 'un nombre no lleva numeros',
  caracteres_raros: 'ahi hay algun caracter que no es una letra',
}

export type NombreValidado =
  | { readonly ok: true; readonly valor: string }
  | { readonly ok: false; readonly motivo: NombreMal; readonly porque: string }

const LARGO_MAX = 60

export function validarNombre(entrada: string): NombreValidado {
  const mal = (motivo: NombreMal): NombreValidado => ({
    ok: false,
    motivo,
    porque: PORQUE_NO_VALE_NOMBRE[motivo],
  })

  // Los espacios de dentro se colapsan: `Ana   Maria` es `Ana Maria`. Eso es
  // lo mismo escrito de dos formas, no un dato distinto.
  const valor = entrada.trim().replace(/\s+/g, ' ')

  if (valor === '') return mal('vacio')
  if (valor.length > LARGO_MAX) return mal('muy_largo')
  if (/[0-9]/.test(valor)) return mal('tiene_numeros')
  if (!LETRAS.test(valor)) return mal('caracteres_raros')
  // Detras de la longitud: `J.` da 'caracteres_raros', que explica mejor.
  if (valor.length < 2) return mal('muy_corto')

  return { ok: true, valor }
}

export const zNombre = z.string().transform((valor, ctx) => {
  const resultado = validarNombre(valor)
  if (!resultado.ok) {
    ctx.addIssue({ code: 'custom', message: resultado.porque })
    return z.NEVER
  }
  return resultado.valor
})

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

/**
 * `AAAA-MM-DD`, que es lo que el bloque 10 le manda calcular al modelo.
 *
 * La comprobacion no es solo la forma: `2026-02-31` encaja con la expresion
 * regular y no existe. Se reconstruye la fecha y se compara, que es la unica
 * manera de cazar un dia 31 en un mes de 30.
 */
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/

export type FechaMal = 'formato' | 'no_existe'

export const PORQUE_NO_VALE_FECHA: Readonly<Record<FechaMal, string>> = {
  formato: 'la fecha tiene que ir como AAAA-MM-DD',
  no_existe: 'ese dia no existe en el calendario',
}

export type FechaValidada =
  | { readonly ok: true; readonly valor: string }
  | { readonly ok: false; readonly motivo: FechaMal; readonly porque: string }

export function validarFecha(entrada: string): FechaValidada {
  const partes = DIA.exec(entrada.trim())
  if (!partes) {
    return { ok: false, motivo: 'formato', porque: PORQUE_NO_VALE_FECHA.formato }
  }

  const [, anio, mes, dia] = partes as unknown as [string, string, string, string]
  // UTC a proposito: aqui solo se comprueba que el dia exista en el calendario.
  // La zona horaria de la clinica entra despues, al convertir a instante.
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)))

  const existe =
    fecha.getUTCFullYear() === Number(anio) &&
    fecha.getUTCMonth() === Number(mes) - 1 &&
    fecha.getUTCDate() === Number(dia)

  if (!existe) {
    return { ok: false, motivo: 'no_existe', porque: PORQUE_NO_VALE_FECHA.no_existe }
  }

  return { ok: true, valor: `${anio}-${mes}-${dia}` }
}

export const zFecha = z.string().transform((valor, ctx) => {
  const resultado = validarFecha(valor)
  if (!resultado.ok) {
    ctx.addIssue({ code: 'custom', message: resultado.porque })
    return z.NEVER
  }
  return resultado.valor
})

/** Un instante exacto, que es lo que come `crear_cita`. */
export const zInstante = z.string().refine(
  (valor) => !Number.isNaN(Date.parse(valor)),
  'esa hora no es una fecha y hora validas',
)

// ---------------------------------------------------------------------------
// Vocabulario cerrado
// ---------------------------------------------------------------------------

/**
 * `motivo_visita` de la migracion 002, literal.
 *
 * ESTO NO ES UNA VALIDACION MAS. Que el motivo de la visita sea un enum y no
 * texto libre es lo que mantiene todo el sistema fuera del articulo 9 del RGPD:
 * «revision» es una categoria de cita, «me sangra la encia desde el martes» es
 * un dato de salud, y tratarlos igual cambia el regimen legal del producto
 * entero. Si algun dia hace falta un motivo nuevo, se anade al enum en una
 * migracion, nunca aqui y nunca dejandolo pasar como texto.
 */
export const MOTIVOS = ['revision', 'urgencia', 'estetica', 'ortodoncia', 'otro'] as const
export type Motivo = (typeof MOTIVOS)[number]
export const zMotivo = z.enum(MOTIVOS)

/** `motivo_escalado` de la migracion 002. Los cinco de V1, sin inventar ninguno. */
export const MOTIVOS_ESCALADO = [
  'pregunta_fuera_de_faq',
  'pidio_persona',
  'datos_incompletos',
  'urgencia_grave',
  'no_entendido',
] as const
export type MotivoEscalado = (typeof MOTIVOS_ESCALADO)[number]
export const zMotivoEscalado = z.enum(MOTIVOS_ESCALADO)

/** Un uuid, para los identificadores que el modelo copia de una herramienta. */
export const zUuid = z.string().uuid('eso no es un identificador valido')

// ---------------------------------------------------------------------------
// Normalizacion de texto
// ---------------------------------------------------------------------------

/**
 * Sin tildes, sin signos y en minusculas: `¡Sí!` y `si` son lo mismo.
 *
 * Vive aqui, en el modulo hoja, y no junto a quien mas lo usa, porque lo
 * necesitan tanto las herramientas (para casar el nombre de un tratamiento)
 * como el clasificador (para las reglas duras). Teniendolo en `herramientas.ts`,
 * el clasificador —que corre ANTES y no toca la base de datos— acababa
 * importando el modulo que trae `crearClienteBot` solo para esto.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
