/**
 * La regla que `filtro.ts` explica en su cabecera, convertida en prueba:
 *
 *   El camino del bot NO filtra por `publico` ni por `clinica_id` en la
 *   consulta. De eso se encarga la RLS.
 *
 * POR QUE ES UNA PRUEBA Y NO UN COMENTARIO
 *
 * Añadir `.eq('publico', true)` a las consultas de filtro.ts parece una mejora:
 * menos filas por el cable, la intencion mas explicita, y todos los tests
 * siguen en verde. Y es exactamente el cambio que deja ciegas a las dos
 * barandillas a la vez. Con ese `.eq` puesto:
 *
 *   - Postgres devolveria solo filas publicas aunque la politica RLS estuviera
 *     rota, asi que `retenidas` volveria a ser 0 y el contador no avisaria.
 *   - `publicas` seguiria siendo menor que el total real, asi que la prueba
 *     OBLIGATORIA de 03-filtro-y-contador tambien pasaria.
 *
 * El sistema seguiria siendo seguro por casualidad —nada confidencial llegaria
 * al prompt— pero **nadie se enteraria de que la RLS ha cedido**, que es lo que
 * la barandilla 2 existe para detectar. No lo caza ninguna prueba en vivo,
 * porque el sintoma que buscan es justo el que ese `.eq` borra. Solo se puede
 * cazar leyendo el codigo. Eso es esto.
 *
 * No necesita base de datos: corre en `comprobaciones-estaticas` de CI.
 */
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { caminoDelBot, filtrosSobre, sinComentarios } from '../ayuda/detector'

const RAIZ = process.cwd()

/**
 * Que se considera "el camino del bot".
 *
 * Todo lo de `src/lib/barandillas/`, mas cualquier archivo de `src/` que use el
 * cliente del bot. Lo segundo hace que esto se extienda solo: las seis
 * herramientas de F3 entraron en la lista el dia que importaron
 * `crearClienteBot`, sin que nadie tuviera que acordarse de venir aqui a
 * anadirlas.
 *
 * AMPLIADO EN F4, Y POR UN MOTIVO MEDIDO
 *
 * El canal de WhatsApp consulta la base desde varios modulos que reciben el
 * cliente ya construido (`ventana.ts`, `agrupar.ts`, `procesar.ts`): usan el
 * cliente del bot, pero NO contienen la cadena `crearClienteBot`, asi que se
 * quedaban fuera del alcance y podian meter un filtro por `clinica_id` sin que
 * nadie se enterara. Se comprobo listando el alcance, no suponiendolo.
 *
 * Por eso ahora tambien entra quien nombre el TIPO `ClienteDelBot`, que es como
 * viaja el cliente entre modulos. Quien toque la base con la identidad del bot
 * esta en la lista, lo construya el o se lo den hecho.
 *
 * EL PANEL (F5) NO ENTRA AQUI, Y TAMBIEN SE MIDIO
 *
 * El panel lee con `servidor.ts` y `navegador.ts`, que no son este cliente: no
 * aparece ni `crearClienteBot` ni `ClienteDelBot` en ninguno de sus archivos.
 * Se comprobo listando el alcance —hay una prueba que lo fija— y por eso F5
 * trajo un guardian hermano, con su propio motivo escrito, en
 * `tests/panel/01-sin-filtro-en-el-panel.test.ts`. El detector es el mismo para
 * los dos y vive en `tests/ayuda/detector.ts`.
 */
const archivos = caminoDelBot()

describe('el camino del bot no filtra en la consulta lo que filtra la RLS', () => {
  it('hay archivos que revisar, y filtro.ts es uno de ellos', () => {
    // Sin esto, borrar filtro.ts pondria todo lo de abajo en verde.
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.map((r) => relative(RAIZ, r).replace(/\\/g, '/'))).toContain(
      'src/lib/barandillas/filtro.ts',
    )
  })

  it.each(['publico', 'clinica_id'])('ningun archivo filtra por `%s`', (columna) => {
    const culpables = archivos
      .map((ruta) => ({
        archivo: relative(RAIZ, ruta).replace(/\\/g, '/'),
        hallazgos: filtrosSobre(readFileSync(ruta, 'utf8'), columna),
      }))
      .filter(({ hallazgos }) => hallazgos.length > 0)

    expect(
      culpables,
      `Filtrar por \`${columna}\` en la consulta deja ciega a la barandilla 2: ` +
        'con la RLS rota, `retenidas` seguiria siendo 0 y nadie se enteraria. ' +
        'La RLS filtra; el codigo comprueba y avisa. Lee la cabecera de filtro.ts.',
    ).toEqual([])
  })

  it('pero la comprobacion EN CODIGO sigue estando, que es el otro lado', () => {
    // Una prueba que solo prohibe algo pasa igual si el archivo se queda vacio.
    // Estas tres son las guardias que hacen que `retenidas` signifique algo.
    const filtro = readFileSync(join(RAIZ, 'src/lib/barandillas/filtro.ts'), 'utf8')
    const limpio = sinComentarios(filtro)

    expect([...limpio.matchAll(/publico\s*===\s*true/g)]).toHaveLength(3)
    expect(limpio).toContain('fila.clinica_id === clinicaId')
    expect(limpio).toContain('activo === true')
  })

  it('filtrar por `activo` si vale: es negocio, no seguridad', () => {
    // Un tratamiento retirado del catalogo no se ofrece, y que llegue no es
    // ninguna fuga. Si esta linea desapareciera, el test de arriba no se
    // enteraria, asi que se fija aqui que la distincion es deliberada.
    const filtro = sinComentarios(
      readFileSync(join(RAIZ, 'src/lib/barandillas/filtro.ts'), 'utf8'),
    )
    expect(filtro).toContain(".eq('activo', true)")
    expect(filtrosSobre(filtro, 'activo').length).toBeGreaterThan(0)
  })
})

describe('el detector muerde', () => {
  // Un guardian que no se ha visto nunca saltar es un guardian sin comprobar.
  it.each([
    [".from('faq').select('*').eq('publico', true)", 'publico'],
    ['.from("faq").select("*").eq("publico", true)', 'publico'],
    ['.from(`faq`).is(`publico`, true)', 'publico'],
    [".from('faq').filter('publico', 'eq', true)", 'publico'],
    [".from('faq').match({ publico: true })", 'publico'],
    [".from('faq').or('publico.eq.true')", 'publico'],
    ["const url = '/rest/v1/faq?publico=eq.true'", 'publico'],
    [".from('faq').eq('clinica_id', clinicaId)", 'clinica_id'],
  ])('caza %s', (codigo, columna) => {
    expect(filtrosSobre(codigo, columna).length).toBeGreaterThan(0)
  })

  it('no confunde un comentario con codigo', () => {
    expect(filtrosSobre("// No hay un solo .eq('publico', true) en este archivo", 'publico')).toEqual(
      [],
    )
    expect(filtrosSobre("/* ni .eq('publico', true) aqui */", 'publico')).toEqual([])
  })

  it('no confunde la comprobacion en codigo con un filtro de consulta', () => {
    expect(filtrosSobre('(fila) => fila.publico === true', 'publico')).toEqual([])
    expect(filtrosSobre('if (fila.clinica_id !== clinicaId) return false', 'clinica_id')).toEqual([])
  })

  it('no se traga un `//` que vive dentro de una cadena', () => {
    // Si el quitador de comentarios cortara aqui, se llevaria por delante el
    // resto de la linea y con el cualquier infraccion que viniera detras.
    const codigo = "const u = 'https://x.test'; db.from('faq').eq('publico', true)"
    expect(filtrosSobre(codigo, 'publico')).toHaveLength(1)
  })
})
