/**
 * Lectura del entorno para las pruebas.
 *
 * Los tests de RLS tienen dos mitades y solo una necesita base de datos:
 *
 *   - ESTATICA: lee los .sql de supabase/migrations y comprueba que ninguna
 *     tabla se ha quedado sin RLS y sin politicas. Corre siempre, incluso en
 *     una maquina recien clonada, y es el trabajo `comprobaciones-estaticas`
 *     de .github/workflows/ci.yml.
 *
 *   - VIVA: se conecta como cada rol y comprueba, tabla por tabla, que ve y
 *     que no. Necesita un proyecto de Supabase de desarrollo.
 *
 * Si falta el entorno, la mitad viva se salta con un aviso ruidoso. No se
 * inventa un resultado verde.
 */
import { existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  // Node 20.12+. Evita una dependencia mas solo para leer un archivo de dos
  // columnas. No se lee .env.local desde ningun otro sitio del proyecto.
  process.loadEnvFile('.env.local')
}

export const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const CLAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const CLAVE_SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
export const SECRETO_JWT = process.env.SUPABASE_JWT_SECRET ?? ''

/** ¿Se puede correr la mitad viva? */
export const HAY_BASE_DE_DATOS = Boolean(
  URL_SUPABASE && CLAVE_ANON && CLAVE_SERVICIO && SECRETO_JWT,
)

export function avisarSiNoHayBaseDeDatos() {
  if (HAY_BASE_DE_DATOS) return
  console.warn(
    [
      '',
      '  ⚠  Los tests VIVOS de RLS se han saltado.',
      '     Faltan variables en .env.local: NEXT_PUBLIC_SUPABASE_URL,',
      '     NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,',
      '     SUPABASE_JWT_SECRET.',
      '',
      '     Solo se ha comprobado el esquema en los .sql. Eso demuestra que las',
      '     politicas estan ESCRITAS, no que la base de datos las tenga PUESTAS.',
      '',
    ].join('\n'),
  )
}

/**
 * Marcador unico que va sembrado en las filas confidenciales. Si aparece en una
 * respuesta del bot o en un prompt montado, hay fuga. La bateria adversaria
 * completa es la barandilla 4, en F7; aqui solo se usa para reconocer las filas
 * que el bot no debe ver nunca.
 */
export const MARCADOR = 'ZZMARGEN-7f3a'

/**
 * ¿Se admite que la barandilla 4 se salte por falta de entorno?
 *
 * Con `FUGA_EXIGIDA=1`, no: si falta la base de datos, la bateria de
 * `tests/fuga/` se pone ROJA en vez de saltarse. Lo pone el trabajo
 * `auditoria-de-fuga` de .github/workflows/ci.yml, que es el que bloquea el
 * merge.
 *
 * Existe porque un `describe.skipIf` es la forma mas comoda que hay de tener
 * un tick verde que no ha mirado nada, y este proyecto ya lo ha hecho tres
 * veces (ver `.claude/CLAUDE.md`, «un verde no es una garantia»). En una
 * maquina de desarrollo recien clonada saltarsela es razonable y se avisa a
 * gritos; en el CI que decide si se puede mezclar, no.
 */
export const FUGA_EXIGIDA = process.env.FUGA_EXIGIDA === '1'

export const CLAVE_GEMINI = process.env.GOOGLE_AI_API_KEY ?? ''

/**
 * ¿Se pueden correr las pruebas que llaman a Gemini DE VERDAD?
 *
 * Hacen falta las dos cosas: la clave y un `GEMINI_VIVO=1` puesto a mano. Tener
 * la clave en `.env.local` NO basta, y esa es toda la idea.
 *
 * En F1 el hallazgo mas serio fue una suite no determinista por agotar el
 * limite de peticiones de Supabase Auth. El equivalente aqui es peor: el limite
 * del tier gratuito de Gemini es DIARIO, asi que una suite que lo agote no
 * vuelve a estar verde hasta el dia siguiente, y el modelo ademas no es
 * determinista entre dos tiradas. Una bateria que se pone roja por la cuota
 * ensena a la gente a ignorar el rojo, que es la peor cosa que le puede pasar a
 * una bateria de seguridad.
 *
 * Asi que `pnpm test` no gasta ni una peticion. Ver ESTADO_F3 §1.
 */
export const HAY_GEMINI = Boolean(CLAVE_GEMINI) && process.env.GEMINI_VIVO === '1'

export function avisarSiNoHayGemini() {
  if (HAY_GEMINI) return
  console.warn(
    [
      '',
      '  ⓘ  Las pruebas de CONTRATO con Gemini se han saltado (es lo normal).',
      '     Para correrlas:  GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato',
      '',
      '     Gastan cuota del tier gratuito, que es diaria. Todo lo demas del',
      '     motor se comprueba sin llamar al modelo.',
      '',
    ].join('\n'),
  )
}
