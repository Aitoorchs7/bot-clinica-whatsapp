/**
 * Regenera src/tipos/bd.ts desde el esquema real.
 *
 *   pnpm tipos
 *
 * Existe como script de Node y no como una linea en package.json porque la
 * expansion de variables de entorno no es igual en PowerShell que en sh, y
 * porque asi la referencia del proyecto no acaba en el historial de la consola.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const ref = process.env.SUPABASE_PROJECT_REF
if (!ref) {
  console.error(
    'Falta SUPABASE_PROJECT_REF. Es la parte <ref> de https://<ref>.supabase.co.\n' +
      'Ponla en .env.local; la plantilla esta en .env.example.',
  )
  process.exit(1)
}

const salida = execFileSync(
  'pnpm',
  ['exec', 'supabase', 'gen', 'types', 'typescript', '--project-id', ref, '--schema', 'public'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
)

if (!salida.includes('export type Database')) {
  console.error('La CLI no ha devuelto tipos. ¿Has hecho `pnpm supabase login`?')
  process.exit(1)
}

writeFileSync('src/tipos/bd.ts', salida)
console.log('src/tipos/bd.ts regenerado.')
