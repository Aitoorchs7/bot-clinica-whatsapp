/**
 * Lector estatico de supabase/migrations/*.sql.
 *
 * Lo que comprueba no es que la base de datos este bien: es que el SQL que la
 * define lo esta. Sirve en una maquina sin credenciales y en el trabajo
 * `comprobaciones-estaticas` de .github/workflows/ci.yml, y es lo que hace que
 * una tabla nueva sin RLS rompa la compilacion antes de que nadie la aplique.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIRECTORIO = join(process.cwd(), 'supabase', 'migrations')

export type Politica = {
  nombre: string
  tabla: string
  comando: 'select' | 'insert' | 'update' | 'delete' | 'all' | 'desconocido'
  roles: string
  tieneUsing: boolean
  tieneWithCheck: boolean
  cuerpo: string
}

export type Esquema = {
  archivos: string[]
  sql: string
  tablas: string[]
  conRlsActivada: string[]
  politicas: Politica[]
}

function quitarComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n')
}

export function leerEsquema(): Esquema {
  const archivos = readdirSync(DIRECTORIO)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const sql = quitarComentarios(
    archivos.map((f) => readFileSync(join(DIRECTORIO, f), 'utf8')).join('\n'),
  ).toLowerCase()

  const tablas = [
    ...new Set(
      [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/g)].map(
        (m) => m[1]!,
      ),
    ),
  ].sort()

  const conRlsActivada = [
    ...new Set(
      [
        ...sql.matchAll(
          /alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security/g,
        ),
      ].map((m) => m[1]!),
    ),
  ].sort()

  // Nuestras politicas no llevan punto y coma por dentro, asi que cortar por
  // `;` basta para aislar cada sentencia completa.
  const politicas: Politica[] = []
  for (const trozo of sql.split(';')) {
    const cabecera = trozo.match(/create\s+policy\s+(\w+)\s+on\s+public\.(\w+)/)
    if (!cabecera) continue

    const cuerpo = trozo.slice(trozo.indexOf('create policy'))
    const comando = cuerpo.match(/\bfor\s+(select|insert|update|delete|all)\b/)?.[1]
    const roles = cuerpo.match(/\bto\s+([\w\s,]+?)\s+(?:using|with\s+check)\b/)?.[1] ?? ''

    politicas.push({
      nombre: cabecera[1]!,
      tabla: cabecera[2]!,
      comando: (comando ?? 'desconocido') as Politica['comando'],
      roles: roles.trim(),
      tieneUsing: /\busing\s*\(/.test(cuerpo),
      tieneWithCheck: /\bwith\s+check\s*\(/.test(cuerpo),
      cuerpo,
    })
  }

  return { archivos, sql, tablas, conRlsActivada, politicas }
}

/** Las tres tablas de conocimiento cuya fila confidencial no debe llegar al bot. */
export const TABLAS_CON_PUBLICO = ['config', 'tratamientos', 'faq'] as const


// =============================================================================
// Columnas efectivas de una tabla
// =============================================================================
// Un grep no sirve para esto. `escalados.resumen` aparece en la migracion 002,
// que lo crea, y en la 007, que lo quita: buscar la palabra da un falso
// positivo en las dos. Lo que hace falta es la forma de la tabla DESPUES de
// aplicar las migraciones en orden, que es lo que reconstruye `columnasDe`.
// =============================================================================

export type Columna = { nombre: string; definicion: string }

const PALABRAS_DE_CONSTRAINT = new Set([
  'unique',
  'check',
  'primary',
  'foreign',
  'constraint',
  'exclude',
  'like',
])

/** Cuerpo de un `create table`, respetando los parentesis anidados de los check. */
function cuerpoDeCreateTable(sql: string, tabla: string): string | null {
  const inicio = new RegExp(
    String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?public\.${tabla}\s*\(`,
    'g',
  )
  const encontrado = inicio.exec(sql)
  if (!encontrado) return null

  let i = inicio.lastIndex
  let profundidad = 1
  while (i < sql.length && profundidad > 0) {
    if (sql[i] === '(') profundidad += 1
    else if (sql[i] === ')') profundidad -= 1
    i += 1
  }
  return sql.slice(inicio.lastIndex, i - 1)
}

/** Corta por las comas de primer nivel, no por las de dentro de un check. */
function partirPorComas(cuerpo: string): string[] {
  const partes: string[] = []
  let profundidad = 0
  let actual = ''

  for (const caracter of cuerpo) {
    if (caracter === '(') profundidad += 1
    if (caracter === ')') profundidad -= 1
    if (caracter === ',' && profundidad === 0) {
      partes.push(actual)
      actual = ''
    } else {
      actual += caracter
    }
  }
  if (actual.trim()) partes.push(actual)
  return partes
}

/**
 * Las columnas que tiene una tabla una vez aplicadas TODAS las migraciones:
 * las del `create table`, mas los `add column`, menos los `drop column`, en el
 * orden en que se aplican los archivos.
 */
export function columnasDe(tabla: string): Columna[] {
  const { sql } = leerEsquema()

  const cuerpo = cuerpoDeCreateTable(sql, tabla)
  if (cuerpo === null) return []

  const columnas = new Map<string, string>()
  for (const parte of partirPorComas(cuerpo)) {
    const texto = parte.trim()
    if (!texto) continue
    const nombre = texto.split(/\s+/)[0]!
    if (PALABRAS_DE_CONSTRAINT.has(nombre)) continue
    columnas.set(nombre, texto.slice(nombre.length).trim())
  }

  type Cambio = { posicion: number; tipo: 'add' | 'drop'; nombre: string; definicion: string }
  const cambios: Cambio[] = []

  const anadidos = new RegExp(
    String.raw`alter\s+table\s+public\.${tabla}\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)([^;]*);`,
    'g',
  )
  for (const m of sql.matchAll(anadidos)) {
    cambios.push({
      posicion: m.index ?? 0,
      tipo: 'add',
      nombre: m[1]!,
      definicion: (m[2] ?? '').trim(),
    })
  }

  const quitados = new RegExp(
    String.raw`alter\s+table\s+public\.${tabla}\s+drop\s+column\s+(?:if\s+exists\s+)?(\w+)`,
    'g',
  )
  for (const m of sql.matchAll(quitados)) {
    cambios.push({ posicion: m.index ?? 0, tipo: 'drop', nombre: m[1]!, definicion: '' })
  }

  for (const cambio of cambios.sort((a, b) => a.posicion - b.posicion)) {
    if (cambio.tipo === 'add') columnas.set(cambio.nombre, cambio.definicion)
    else columnas.delete(cambio.nombre)
  }

  return [...columnas].map(([nombre, definicion]) => ({ nombre, definicion }))
}

/** El SQL entero con los espacios colapsados, para buscar declaraciones a trozos. */
export function sqlPlano(): string {
  return leerEsquema().sql.replace(/\s+/g, ' ')
}
