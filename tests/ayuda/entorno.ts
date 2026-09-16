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
