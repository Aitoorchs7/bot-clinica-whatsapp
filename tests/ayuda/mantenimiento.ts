/**
 * Ejecutar las funciones de `mantenimiento` desde una prueba.
 *
 * ================ POR QUE HACE FALTA UN RODEO ================
 *
 * `mantenimiento.purgar_historial()` y `mantenimiento.liberar_provisionales()`
 * viven en un esquema privado que PostgREST NO publica, y eso es justo lo que
 * impide que nadie las alcance desde la API. O sea que `supabase-js` no puede
 * llamarlas — ni con `service_role`—, y es correcto que no pueda.
 *
 * Las tres salidas eran:
 *
 *   1. Un envoltorio en `public` que las llame  -> ❌ ensancha la superficie de
 *      la API justo para poder probar que la superficie es estrecha. Es lo que
 *      ESTADO_F2 §7 descartó para el contador y F5 §2 para la auditoría.
 *   2. Conectar con un driver de Postgres        -> ❌ una dependencia nueva
 *      para el árbol de producción, solo para las pruebas.
 *   3. La CLI de Supabase, que ya está instalada -> ✅
 *
 * ================ Y ADEMAS CORRE CON LA IDENTIDAD BUENA ================
 *
 * Con la cadena de conexión del proyecto, la CLI entra como `postgres`, que es
 * exactamente el rol con el que `pg_cron` ejecuta estos jobs. Lo comprueba una
 * prueba de `03-purga` (`select current_user`). Así que la prueba no solo
 * ejecuta la misma función: la ejecuta con los mismos privilegios.
 *
 * ================ POR QUE `--db-url` Y NO `--linked` (F9) ================
 *
 * Hasta F8 esto lanzaba `supabase db query --linked`, y tenía dos agujeros:
 *
 *   - `--linked` no es una conexión: va por la API de gestión, con el proyecto
 *     VINCULADO en esta máquina y un token de cuenta que vale para todos los
 *     proyectos de la persona. En CI no había ni lo uno ni lo otro: 13 rojos
 *     («Cannot find project ref», ESTADO_F9 §0.3).
 *   - Y lo que decidía a qué base iba el SQL era el vínculo, no la siembra. Con
 *     esta máquina vinculada a producción «para mirar las migraciones», la
 *     siguiente `pnpm test` habría purgado el historial de producción como
 *     `postgres`, que se salta la RLS (ESTADO_F9 §3.1).
 *
 * Ahora va con `SUPABASE_DB_URL_DEV`, una credencial de UN solo proyecto, y se
 * niega a salir si ese proyecto no es el mismo que siembra la suite
 * (`NEXT_PUBLIC_SUPABASE_URL`) o si es uno de producción.
 *
 * ================ SIN SHELL, NI UNO ================
 *
 * Antes hacía falta `shell: true` para que Windows encontrara `pnpm.cmd`, y con
 * el shell por medio había que entrecomillar el SQL a mano (y prohibirle las
 * comillas dobles). Una cadena de conexión con la contraseña codificada (`%40`,
 * `&`) tampoco sobrevive a un shell. La CLI es un script de Node, así que se
 * lanza con el mismo Node que corre las pruebas y los argumentos van tal cual.
 *
 * ESTADO_F1 §5.1 cuenta lo que pasó por escribir `npm exec supabase db query
 * --linked`: npm se comió el `--linked`, la CLI se fue a una base local que no
 * existe y el comando que tenía que restaurar la RLS no llegó nunca. Sin
 * gestor de paquetes ni shell de por medio, no hay nadie que se coma nada.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  REFS_DE_PRODUCCION,
  URL_SUPABASE,
  refDeCadenaDeConexion,
  refDeUrlSupabase,
} from './entorno'

/** Lo que devuelve la CLI: a veces un preámbulo en texto y después el JSON. */
type Respuesta = { rows?: unknown[] }

const CLI = join(process.cwd(), 'node_modules', 'supabase', 'dist', 'supabase.js')

/**
 * La cadena de conexión, comprobada ANTES de usarla.
 *
 * Es pura salvo por el entorno que recibe, y está exportada para que las
 * pruebas del cerrojo la puedan ver negarse sin lanzar nada.
 */
export function cadenaDeMantenimiento(
  cadena: string | undefined = process.env.SUPABASE_DB_URL_DEV,
  urlDeLaSiembra: string = URL_SUPABASE,
): string {
  if (!cadena) {
    throw new Error(
      [
        'Falta SUPABASE_DB_URL_DEV: sin ella no se puede lanzar el SQL de mantenimiento,',
        'y esta prueba NO se da por buena. Es la cadena «Session pooler» del proyecto de',
        'DESARROLLO (Supabase → Connect). En local va en .env.local; en CI es el secreto',
        'del mismo nombre. Ver .env.example.',
      ].join('\n'),
    )
  }

  const refDeLaCadena = refDeCadenaDeConexion(cadena)
  if (refDeLaCadena === null) {
    throw new Error(
      'SUPABASE_DB_URL_DEV no tiene forma de cadena de Supabase (usuario postgres.<ref> ' +
        'o host db.<ref>.supabase.co). No se usa una cadena de la que no se sabe el proyecto.',
    )
  }

  if (REFS_DE_PRODUCCION.includes(refDeLaCadena)) {
    throw new Error(
      `SUPABASE_DB_URL_DEV es la de PRODUCCIÓN (${refDeLaCadena}). El SQL de mantenimiento ` +
        'purga historial como `postgres`, que se salta la RLS. No se lanza.',
    )
  }

  const refDeLaSiembra = refDeUrlSupabase(urlDeLaSiembra)
  if (refDeLaCadena !== refDeLaSiembra) {
    throw new Error(
      `SUPABASE_DB_URL_DEV apunta al proyecto ${refDeLaCadena} y la suite siembra en ` +
        `${refDeLaSiembra ?? '(una URL que no es de Supabase)'}. El SQL iría a una base ` +
        'distinta de la que se está comprobando, y se ha parado aquí.',
    )
  }

  return cadena
}

/** Quita la cadena y su contraseña de cualquier texto antes de que salga. */
export function tapar(texto: string, cadena: string): string {
  const secretos = [cadena]
  try {
    const { password } = new URL(cadena)
    secretos.push(password, decodeURIComponent(password))
  } catch {
    // Si no se puede leer, se tapa al menos la cadena entera.
  }
  return secretos
    .filter((s) => s.length >= 6)
    .sort((a, b) => b.length - a.length)
    .reduce((t, s) => t.split(s).join('***'), texto)
}

/**
 * Lanza SQL contra la base de DESARROLLO que siembra la suite y devuelve las
 * filas.
 *
 * Es lento (unos segundos por llamada: levanta un proceso y negocia la
 * conexión), así que se usa con cuentagotas y solo para lo que no se puede
 * alcanzar de otra forma.
 */
export function consultaDeMantenimiento(sql: string): unknown[] {
  const cadena = cadenaDeMantenimiento()

  if (!existsSync(CLI)) {
    throw new Error(`No está la CLI de Supabase en ${CLI}. ¿Falta pnpm install?`)
  }

  let salida: string
  try {
    salida = execFileSync(process.execPath, [CLI, 'db', 'query', '--db-url', cadena, sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
  } catch (fallo) {
    const f = fallo as { stderr?: string; stdout?: string; message?: string }
    throw new Error(
      tapar(`La CLI de Supabase ha fallado:\n${f.stderr || f.stdout || f.message}`, cadena),
    )
  }

  const abre = salida.indexOf('{')
  if (abre < 0) {
    throw new Error(tapar(`La CLI no ha devuelto JSON. Salida:\n${salida}`, cadena))
  }

  let leido: Respuesta
  try {
    leido = JSON.parse(salida.slice(abre)) as Respuesta
  } catch {
    throw new Error(tapar(`No se ha podido leer la respuesta de la CLI:\n${salida.slice(abre)}`, cadena))
  }

  return leido.rows ?? []
}

/** Libera las provisionales caducadas, como hace `pg_cron` cada cinco minutos. */
export function liberarProvisionales(): number {
  const filas = consultaDeMantenimiento('select mantenimiento.liberar_provisionales(5000) as n')
  return Number((filas[0] as { n?: number })?.n ?? 0)
}

/**
 * Corre la purga de retención con los plazos que se le pidan.
 *
 * Los parámetros existen desde F1 justo para esto: se le puede pedir «borra lo
 * de más de 0 días» y comprobar que borra de verdad, sin tener que esperar
 * noventa días ni falsear un reloj.
 */
export function purgarHistorial(dias: number, diasCargas: number): Record<string, unknown> {
  const filas = consultaDeMantenimiento(
    `select * from mantenimiento.purgar_historial(${dias}, 5000, ${diasCargas})`,
  )
  return (filas[0] ?? {}) as Record<string, unknown>
}
