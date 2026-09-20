/**
 * Lleva contenido/bloques/*.md a la tabla `bloques_prompt` de una clinica.
 *
 *   pnpm bloques <slug-de-la-clinica> [--forzar]
 *
 * Es un SCRIPT DE ALTA, y por eso puede usar service_role: exactamente el uso
 * que admite .claude/CLAUDE.md. Nunca en el camino del bot.
 *
 * No hay bloques "globales": `bloques_prompt.clinica_id` es NOT NULL desde F1.
 * Cada clinica se lleva su juego completo, porque un NULL dentro de una
 * politica RLS es la fuente numero uno de fugas entre inquilinos.
 *
 * La lectura de la carpeta vive aparte, en `bloques-a-filas.mjs`, y se
 * reexporta aqui para no romper a quien ya la importaba de este archivo.
 *
 * Si la clinica YA tiene bloques, el script se para. Los bloques son editables
 * desde el panel y una clinica que lleve seis meses afinando su prompt no puede
 * perderlo porque alguien relance el alta. `--forzar` los reemplaza, y lo dice.
 */
import { pathToFileURL } from 'node:url'

import { filasParaClinica, leerBloques, separarFrontmatter } from './bloques-a-filas.mjs'

export { filasParaClinica, leerBloques, separarFrontmatter }

async function principal() {
  const { createClient } = await import('@supabase/supabase-js')
  const { existsSync } = await import('node:fs')
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')

  const argumentos = process.argv.slice(2)
  const forzar = argumentos.includes('--forzar')
  const slug = argumentos.find((a) => !a.startsWith('--'))

  if (!slug) {
    console.error('Uso: pnpm bloques <slug-de-la-clinica> [--forzar]')
    process.exitCode = 1
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) {
    console.error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.\n' +
        'La plantilla esta en .env.example.',
    )
    process.exitCode = 1
    return
  }

  const db = createClient(url, clave, { auth: { persistSession: false } })

  const { data: clinica, error: errorClinica } = await db
    .from('clinicas')
    .select('id, nombre')
    .eq('slug', slug)
    .maybeSingle()

  if (errorClinica) {
    console.error(`No se ha podido buscar la clinica: ${errorClinica.message}`)
    process.exitCode = 1
    return
  }
  if (!clinica) {
    console.error(`No hay ninguna clinica con el slug "${slug}".`)
    process.exitCode = 1
    return
  }

  const { count } = await db
    .from('bloques_prompt')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinica.id)

  if ((count ?? 0) > 0 && !forzar) {
    console.error(
      `"${clinica.nombre}" ya tiene ${count} bloques. Se han editado desde el panel y\n` +
        'volver a sembrar los borraria. Si de verdad quieres reemplazarlos:\n' +
        `  pnpm bloques ${slug} --forzar`,
    )
    process.exitCode = 1
    return
  }

  if ((count ?? 0) > 0) {
    console.warn(`  ⚠  --forzar: se reemplazan los ${count} bloques de "${clinica.nombre}".`)
    const { error } = await db.from('bloques_prompt').delete().eq('clinica_id', clinica.id)
    if (error) {
      console.error(`Borrando los bloques anteriores: ${error.message}`)
      process.exitCode = 1
      return
    }
  }

  const filas = filasParaClinica(clinica.id)
  const { error } = await db.from('bloques_prompt').insert(filas)
  if (error) {
    console.error(`Sembrando bloques: ${error.message}`)
    process.exitCode = 1
    return
  }

  const activos = filas.filter((f) => f.activo).length
  console.log(
    `${filas.length} bloques sembrados en "${clinica.nombre}" ` +
      `(${activos} activos, ${filas.length - activos} no).`,
  )
}

// Solo cuando se ejecuta como script. Al importarlo desde las pruebas, no.
// `pathToFileURL` y no una plantilla `file://...`: en Windows la ruta llega como
// C:\... y concatenarla produce una URL que no coincide nunca, asi que el script
// no haria nada al lanzarlo y tampoco daria error.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal()
}
