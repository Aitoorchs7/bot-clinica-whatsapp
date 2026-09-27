/**
 * El detector de filtros en la consulta, compartido por los dos guardianes.
 *
 * Nacio dentro de `tests/barandillas/04-sin-filtro-en-codigo.test.ts` (F2) y se
 * saco aqui en F5, cuando hizo falta un segundo guardian para el panel. Se saca
 * en vez de copiarse por un motivo concreto: dos copias de un detector se
 * separan a la primera mejora, y la que se quede vieja seguira dando verde sin
 * que nadie note que ya no mira lo mismo.
 *
 * Las pruebas de que MUERDE —las ocho formas que tiene que cazar y las cuatro
 * que no debe confundir— siguen viviendo en el archivo 04. Un guardian que no
 * se ha visto nunca saltar es un guardian sin comprobar.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Todos los archivos de codigo por debajo de un directorio. */
export function archivosDe(directorio: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada)
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta))
    else if (/\.(ts|tsx|js|mjs|jsx)$/.test(entrada)) salida.push(ruta)
  }
  return salida
}

/**
 * Quita comentarios respetando las comillas.
 *
 * Hace falta de verdad: la cabecera de `filtro.ts` contiene literalmente el
 * texto de un filtro prohibido para explicar por que no esta. Un buscador
 * ingenuo lo denunciaria, el test se volveria ruido, y el siguiente que pasara
 * por aqui lo borraria o lo relajaria hasta que dejara de servir.
 */
export function sinComentarios(fuente: string): string {
  let salida = ''
  let i = 0
  let comilla: string | null = null

  while (i < fuente.length) {
    const c = fuente[i]!
    const siguiente = fuente[i + 1]

    if (comilla !== null) {
      if (c === '\\') {
        salida += c + (siguiente ?? '')
        i += 2
        continue
      }
      if (c === comilla) comilla = null
      salida += c
      i += 1
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      comilla = c
      salida += c
      i += 1
      continue
    }
    if (c === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && siguiente === '*') {
      i += 2
      while (i < fuente.length && !(fuente[i] === '*' && fuente[i + 1] === '/')) i += 1
      i += 2
      continue
    }

    salida += c
    i += 1
  }

  return salida
}

/** Los constructores de PostgREST que reciben el nombre de la columna. */
const CONSTRUCTORES =
  'eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|overlaps|textSearch|filter|not'

/** Toda forma conocida de filtrar por una columna desde el cliente. */
export function filtrosSobre(codigo: string, columna: string): string[] {
  const limpio = sinComentarios(codigo)
  const formas = [
    // .eq('publico', true) y sus quince hermanos
    new RegExp(`\\.\\s*(?:${CONSTRUCTORES})\\s*\\(\\s*['"\`]${columna}['"\`]`, 'g'),
    // .match({ publico: true })
    new RegExp(`\\.\\s*match\\s*\\(\\s*\\{[^}]*\\b${columna}\\b`, 'g'),
    // .or('publico.eq.true')
    new RegExp(`\\.\\s*or\\s*\\(\\s*['"\`][^'"\`]*\\b${columna}\\b`, 'g'),
    // ?publico=eq.true, por si alguien arma la URL a mano
    new RegExp(`${columna}=(?:eq|neq|is|in)\\.`, 'g'),
  ]

  return formas.flatMap((forma) => [...limpio.matchAll(forma)].map((m) => m[0].trim()))
}

/** Lee un archivo y devuelve sus infracciones sobre una columna. */
export function infraccionesDe(ruta: string, columna: string): string[] {
  return filtrosSobre(readFileSync(ruta, 'utf8'), columna)
}

// -----------------------------------------------------------------------------
// Los dos alcances
// -----------------------------------------------------------------------------
// Viven aqui, y no en sus archivos de prueba, por un motivo de fontaneria que
// importa: si `tests/panel/01` importara de `tests/barandillas/04`, vitest
// registraria las dieciseis pruebas del 04 DENTRO del 01 y la suite daria un
// numero distinto sin que nadie hubiera tocado una aserción. El criterio de
// cierre de todas las fases es «el mismo numero dos veces seguidas»; un
// recuento que se infla solo por un import es la peor forma de perderlo.
// -----------------------------------------------------------------------------

const RAIZ = process.cwd()

/**
 * El camino del BOT: todo `src/lib/barandillas/`, mas quien nombre
 * `crearClienteBot` o el tipo `ClienteDelBot`.
 */
export const SENALES_DEL_BOT = ['crearClienteBot', 'ClienteDelBot']

export function caminoDelBot(): string[] {
  const barandillas = join(RAIZ, 'src', 'lib', 'barandillas')
  return archivosDe(join(RAIZ, 'src')).filter((ruta) => {
    if (ruta.startsWith(barandillas)) return true
    const fuente = readFileSync(ruta, 'utf8')
    return SENALES_DEL_BOT.some((senal) => fuente.includes(senal))
  })
}

/**
 * El camino del PANEL: todo `src/lib/panel/`, mas quien nombre uno de los dos
 * clientes con sesion de usuario.
 */
export const SENALES_DEL_PANEL = ['crearClienteServidor', 'crearClienteNavegador']

export function caminoDelPanel(): string[] {
  const panel = join(RAIZ, 'src', 'lib', 'panel')
  return archivosDe(join(RAIZ, 'src')).filter((ruta) => {
    if (ruta.startsWith(panel)) return true
    const fuente = readFileSync(ruta, 'utf8')
    return SENALES_DEL_PANEL.some((senal) => fuente.includes(senal))
  })
}
