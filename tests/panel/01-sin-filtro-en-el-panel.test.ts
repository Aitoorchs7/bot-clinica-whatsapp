/**
 * El guardian del panel. Hermano del de `tests/barandillas/04`, y con su propio
 * motivo, porque NO es el mismo motivo.
 *
 * POR QUE HACIA FALTA UN SEGUNDO GUARDIAN, MEDIDO Y NO SUPUESTO
 *
 * El de F2/F4 define «el camino del bot» como todo `src/lib/barandillas/` mas
 * cualquier archivo que nombre `crearClienteBot` o el tipo `ClienteDelBot`. El
 * panel no usa ninguno de los dos: lee con `servidor.ts` y `navegador.ts`, que
 * son otros clientes con otro rol. Asi que el panel se quedaba entero fuera de
 * aquel alcance, y podia meter un filtro de seguridad en la consulta sin que
 * nadie se enterara.
 *
 * Eso no se ha supuesto: hay una prueba aqui abajo que LISTA los dos alcances y
 * exige que el panel no este en el del bot. Si algun dia alguien amplia el 04 y
 * el panel entra, esa prueba se pone roja y avisa de que hay dos guardianes
 * pisandose.
 *
 * QUE SE PROHIBE AQUI Y POR QUE
 *
 *   `clinica_id` · Es el mismo fallo de F2 por el lado del panel. Si una
 *     consulta del panel repite el inquilino, el dia que una politica de
 *     `clinica_id` se rompa el panel seguira ensenando exactamente lo de
 *     siempre y nadie lo sabra. La RLS filtra; `comprobarInquilino` mira lo que
 *     llego y grita.
 *
 *   `publico` · Aqui el motivo es distinto y es de producto: el panel TIENE que
 *     ver las filas confidenciales, porque para decidir que puede decir el bot
 *     hay que poder ver lo que hoy no dice. Una consulta del panel que filtrara
 *     por `publico` escondería a la clinica justo las filas que tiene que
 *     gobernar, y encima lo haria en silencio.
 *
 * `service_role` no se comprueba aqui: ya lo hace `tests/rls/05`, que recorre
 * `src/` entero y por tanto cubre el panel desde el primer dia.
 *
 * No necesita base de datos: corre en `comprobaciones-estaticas` de CI.
 */
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  caminoDelBot,
  caminoDelPanel,
  filtrosSobre,
  sinComentarios,
} from '../ayuda/detector'

const RAIZ = process.cwd()

const ruta = (absoluta: string) => relative(RAIZ, absoluta).replace(/\\/g, '/')

const archivos = caminoDelPanel()

describe('el panel no filtra en la consulta lo que filtra la RLS', () => {
  it('hay archivos que revisar, y los que escriben y leen estan dentro', () => {
    // Sin esto, borrar consultas.ts pondria todo lo de abajo en verde.
    expect(archivos.length).toBeGreaterThan(0)
    const dentro = archivos.map(ruta)
    expect(dentro).toContain('src/lib/panel/consultas.ts')
    expect(dentro).toContain('src/lib/panel/acciones.ts')
    expect(dentro).toContain('src/lib/panel/auditoria.ts')
  })

  it.each(['clinica_id', 'publico'])('ningun archivo del panel filtra por `%s`', (columna) => {
    const culpables = archivos
      .map((archivo) => ({
        archivo: ruta(archivo),
        hallazgos: filtrosSobre(readFileSync(archivo, 'utf8'), columna),
      }))
      .filter(({ hallazgos }) => hallazgos.length > 0)

    expect(
      culpables,
      `Filtrar por \`${columna}\` en una consulta del panel tapa el fallo de la politica que ya ` +
        'lo filtra: el dia que ceda, el panel ensenara lo mismo de siempre y nadie se enterara. ' +
        'La RLS filtra; el codigo comprueba y avisa. Lee la cabecera de guardia.ts.',
    ).toEqual([])
  })

  it('pero la comprobacion EN CODIGO sigue estando, que es el otro lado', () => {
    // Una prueba que solo prohibe algo pasa igual si el archivo se queda vacio.
    const guardia = sinComentarios(readFileSync(join(RAIZ, 'src/lib/panel/guardia.ts'), 'utf8'))
    expect(guardia).toContain('fila.clinica_id === clinicaId')
    expect(guardia).toMatch(/AISLAMIENTO ROTO/)

    // Y las lecturas la usan de verdad: una guardia que nadie llama no guarda
    // nada. Once lecturas hoy; el numero exacto no importa, que sean varias si.
    const consultas = sinComentarios(readFileSync(join(RAIZ, 'src/lib/panel/consultas.ts'), 'utf8'))
    expect([...consultas.matchAll(/comprobarInquilino\(/g)].length).toBeGreaterThanOrEqual(8)
  })

  it('toda escritura mira si la base ha devuelto la fila', () => {
    // Cuando la RLS bloquea un UPDATE por su USING, PostgREST devuelve CERO
    // filas y NINGUN error. Sin `.select()` detras, el panel diria «guardado»
    // sin guardar: es el fallo 4 de ESTADO_F1 §6. Cada `.update(` de las
    // acciones tiene que llevar su `.select(`.
    const acciones = sinComentarios(readFileSync(join(RAIZ, 'src/lib/panel/acciones.ts'), 'utf8'))
    const updates = [...acciones.matchAll(/\.update\(/g)].length
    const selects = [...acciones.matchAll(/\.select\(/g)].length

    expect(updates).toBeGreaterThan(0)
    expect(selects).toBeGreaterThanOrEqual(updates)
  })

  it('el panel no escribe nunca en `eventos`: ese apunte es del asistente', () => {
    // `eventos` es donde el contador de la barandilla 2 deja lo que vio el bot.
    // Si el panel pudiera escribir ahi, el apunte dejaria de ser del asistente
    // y la pantalla de observabilidad dejaria de demostrar nada.
    for (const archivo of archivos) {
      const fuente = sinComentarios(readFileSync(archivo, 'utf8'))
      const escrituras = [...fuente.matchAll(/from\('eventos'\)[\s\S]{0,80}?\.(insert|update)\(/g)]
      expect(escrituras.map((m) => `${ruta(archivo)}: ${m[0]}`)).toEqual([])
    }
  })
})

describe('los dos guardianes no se pisan', () => {
  it('MEDIDO: ningun archivo del panel esta en el alcance del camino del bot', () => {
    const delBot = new Set(caminoDelBot().map(ruta))
    const solapados = archivos.map(ruta).filter((archivo) => delBot.has(archivo))

    expect(
      solapados,
      'Si un archivo cae en los dos alcances, los dos guardianes opinan sobre el y uno de los ' +
        'dos motivos escritos ha dejado de ser cierto. Hay que decidir cual manda antes de ' +
        'seguir.',
    ).toEqual([])
  })

  it('MEDIDO: el panel de verdad consulta la base, no es una lista vacia', () => {
    // La prueba de arriba pasaria sola si `caminoDelPanel()` no encontrara
    // nada. Esto exige que lo que hay dentro toque Supabase.
    const consultando = archivos.filter((archivo) =>
      /\.from\(/.test(sinComentarios(readFileSync(archivo, 'utf8'))),
    )
    expect(consultando.length).toBeGreaterThan(0)
  })
})
