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
 * `supabase db query --linked` se conecta como `postgres`, que es exactamente
 * el rol con el que `pg_cron` ejecuta estos jobs. Comprobado:
 *
 *     select current_user  ->  "postgres"
 *
 * Así que la prueba no solo ejecuta la misma función: la ejecuta con los
 * mismos privilegios. Un envoltorio en `public` la habría ejecutado como
 * `authenticated` y habría demostrado otra cosa.
 *
 * ================ PNPM, NUNCA NPM ================
 *
 * ESTADO_F1 §5.1 cuenta lo que pasó por escribir `npm exec supabase db query
 * --linked`: npm se comió el `--linked` como una opción desconocida, la CLI se
 * fue a la base LOCAL —que no existe— y el comando que tenía que restaurar la
 * RLS nunca llegó al proyecto remoto. La base se quedó abierta. Aquí va `pnpm`
 * y los argumentos van en un array, sin pasar por una cadena de shell.
 */
import { execFileSync } from 'node:child_process'

/** Lo que devuelve la CLI: un preámbulo en texto y después el JSON. */
type Respuesta = { rows?: unknown[] }

/**
 * Lanza SQL contra la base ENLAZADA y devuelve las filas.
 *
 * Es lento (unos segundos por llamada: levanta un proceso y negocia la
 * conexión), así que se usa con cuentagotas y solo para lo que no se puede
 * alcanzar de otra forma.
 */
export function consultaDeMantenimiento(sql: string): unknown[] {
  // Hace falta `shell: true` para que Windows encuentre `pnpm` (es un .cmd), y
  // con el shell de por medio los argumentos se vuelven a partir por los
  // espacios: sin comillas, `select mantenimiento.liberar_provisionales(5000)`
  // le llega a la CLI como tres argumentos sueltos y contesta con su ayuda.
  // Pasó al escribir esto.
  //
  // Las comillas se ponen aquí y se prohíbe la comilla doble dentro: es una
  // función de pruebas que solo recibe SQL escrito en este archivo, así que la
  // salida correcta es negarse, no intentar escapar nada.
  if (sql.includes('"')) {
    throw new Error('El SQL de mantenimiento no puede llevar comillas dobles.')
  }

  const salida = execFileSync(
    'pnpm',
    ['exec', 'supabase', 'db', 'query', '--linked', `"${sql}"`],
    { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 },
  )

  // La CLI escribe «Initialising login role...» antes del JSON.
  const abre = salida.indexOf('{')
  if (abre < 0) {
    throw new Error(`La CLI no ha devuelto JSON. Salida:\n${salida}`)
  }

  let leido: Respuesta
  try {
    leido = JSON.parse(salida.slice(abre)) as Respuesta
  } catch {
    throw new Error(`No se ha podido leer la respuesta de la CLI:\n${salida.slice(abre)}`)
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
