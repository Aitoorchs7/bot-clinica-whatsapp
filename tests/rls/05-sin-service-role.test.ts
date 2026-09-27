/**
 * La regla de .claude/CLAUDE.md convertida en prueba:
 *
 *   "La clave service_role jamas sale del servidor ni entra en NEXT_PUBLIC_*.
 *    Solo en migraciones y scripts de alta — nunca en el camino del bot, nunca
 *    en el navegador."
 *
 * No necesita base de datos: lee el arbol de src/.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function archivosDe(directorio: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada)
    if (statSync(ruta).isDirectory()) {
      salida.push(...archivosDe(ruta))
    } else if (/\.(ts|tsx|js|mjs|jsx)$/.test(entrada)) {
      salida.push(ruta)
    }
  }
  return salida
}

const RAIZ = process.cwd()
const archivosDeSrc = archivosDe(join(RAIZ, 'src'))

describe('service_role', () => {
  it('hay archivos que revisar', () => {
    expect(archivosDeSrc.length).toBeGreaterThan(0)
  })

  it('no aparece en ningun archivo de src/', () => {
    const culpables = archivosDeSrc.filter((ruta) =>
      readFileSync(ruta, 'utf8').includes('SERVICE_ROLE'),
    )

    expect(culpables.map((r) => r.replace(RAIZ, ''))).toEqual([])
  })

  it('no hay ninguna variable NEXT_PUBLIC_ que la lleve', () => {
    const plantilla = readFileSync(join(RAIZ, '.env.example'), 'utf8')
    const publicas = plantilla.match(/^NEXT_PUBLIC_\w+/gm) ?? []

    for (const clave of publicas) {
      expect(clave).not.toMatch(/SERVICE|SECRET|JWT|TOKEN/i)
    }
  })

  it('el secreto del JWT del bot tampoco es publico', () => {
    const plantilla = readFileSync(join(RAIZ, '.env.example'), 'utf8')

    expect(plantilla).toContain('SUPABASE_JWT_SECRET=')
    expect(plantilla).not.toContain('NEXT_PUBLIC_SUPABASE_JWT_SECRET')
  })

  it('.env y .env.local siguen ignorados por git', () => {
    const ignorados = readFileSync(join(RAIZ, '.gitignore'), 'utf8')

    expect(ignorados).toMatch(/^\.env$/m)
    expect(ignorados).toMatch(/^\.env\.local$/m)
    expect(ignorados).toMatch(/^!\.env\.example$/m)
  })
})

describe('los tres clientes siguen separados', () => {
  it('bot.ts firma su propio JWT y no usa createBrowserClient ni cookies', () => {
    const bot = readFileSync(join(RAIZ, 'src/lib/supabase/bot.ts'), 'utf8')

    expect(bot).toContain('accessToken')
    expect(bot).toContain('app_metadata')
    expect(bot).not.toContain('user_metadata')
    expect(bot).not.toContain('createBrowserClient')
    expect(bot).not.toContain('next/headers')
  })

  it('navegador.ts solo usa la clave anonima', () => {
    const navegador = readFileSync(join(RAIZ, 'src/lib/supabase/navegador.ts'), 'utf8')

    expect(navegador).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(navegador).not.toContain('SignJWT')
  })

  it('servidor.ts usa @supabase/ssr con getAll y setAll', () => {
    const servidor = readFileSync(join(RAIZ, 'src/lib/supabase/servidor.ts'), 'utf8')

    expect(servidor).toContain('createServerClient')
    expect(servidor).toContain('getAll')
    expect(servidor).toContain('setAll')
    expect(servidor).not.toContain('SignJWT')
  })
})
