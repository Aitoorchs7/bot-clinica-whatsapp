/**
 * La barandilla dura: si alguien desactiva la RLS en cualquier tabla, o crea
 * una tabla nueva sin politicas, esto se pone rojo.
 *
 * Es la mitad ESTATICA. No necesita base de datos ni credenciales: lee los
 * .sql de supabase/migrations. Por eso corre siempre, tambien en el trabajo
 * `comprobaciones-estaticas` de .github/workflows/ci.yml. Que ademas impida
 * mezclar una rama depende de una regla de rama en GitHub, que se activa a
 * mano: sin ella este archivo avisa, pero no para nada.
 *
 * La mitad VIVA esta en los demas archivos de esta carpeta.
 */
import { describe, expect, it } from 'vitest'

import { TABLAS_CON_PUBLICO, leerEsquema } from '../ayuda/esquema'

const esquema = leerEsquema()

describe('las migraciones existen', () => {
  it('hay siete migraciones, una por tema', () => {
    expect(esquema.archivos).toEqual([
      '20260916100100_extensiones.sql',
      '20260916100200_tablas.sql',
      '20260916100300_solape.sql',
      '20260916100400_rls.sql',
      '20260916100500_rpc.sql',
      '20260916100600_retencion.sql',
      '20260916100700_integridad.sql',
    ])
  })

  it('se han encontrado las 15 tablas del plan', () => {
    expect(esquema.tablas).toEqual([
      'auditoria',
      'bloques_prompt',
      'citas',
      'clinicas',
      'config',
      'conversaciones',
      'escalados',
      'eventos',
      'eventos_webhook',
      'faq',
      'gabinetes',
      'horarios',
      'mensajes',
      'pacientes',
      'tratamientos',
    ])
  })
})

describe('RLS activada en TODAS las tablas, sin excepcion', () => {
  it.each(esquema.tablas)('%s tiene enable row level security', (tabla) => {
    expect(esquema.conRlsActivada).toContain(tabla)
  })

  it('no hay ninguna tabla con RLS activada que no exista', () => {
    for (const tabla of esquema.conRlsActivada) {
      expect(esquema.tablas).toContain(tabla)
    }
  })

  it.each(esquema.tablas)('%s tiene al menos una politica', (tabla) => {
    const suyas = esquema.politicas.filter((p) => p.tabla === tabla)
    expect(suyas.length).toBeGreaterThan(0)
  })
})

describe('forma de las politicas', () => {
  it('ninguna politica usa FOR ALL', () => {
    // FOR ALL mezcla el USING del SELECT con el WITH CHECK del INSERT y acaba
    // concediendo de mas. Una politica por comando, siempre.
    const conForAll = esquema.politicas.filter((p) => p.comando === 'all')
    expect(conForAll.map((p) => p.nombre)).toEqual([])
  })

  it('toda politica declara su comando', () => {
    const sinComando = esquema.politicas.filter((p) => p.comando === 'desconocido')
    expect(sinComando.map((p) => p.nombre)).toEqual([])
  })

  it('toda politica se limita al rol authenticated', () => {
    const otros = esquema.politicas.filter((p) => p.roles !== 'authenticated')
    expect(otros.map((p) => `${p.nombre} -> "${p.roles}"`)).toEqual([])
  })

  it('todo INSERT lleva WITH CHECK', () => {
    const sinCheck = esquema.politicas.filter(
      (p) => p.comando === 'insert' && !p.tieneWithCheck,
    )
    expect(sinCheck.map((p) => p.nombre)).toEqual([])
  })

  it('todo UPDATE lleva WITH CHECK y tambien USING', () => {
    // Sin USING, el UPDATE no encuentra la fila y devuelve cero filas en
    // silencio, sin error.
    const mal = esquema.politicas.filter(
      (p) => p.comando === 'update' && !(p.tieneWithCheck && p.tieneUsing),
    )
    expect(mal.map((p) => p.nombre)).toEqual([])
  })

  it('toda politica filtra por clinica_id', () => {
    const sinInquilino = esquema.politicas.filter(
      (p) => !/clinica_id\(\)/.test(p.cuerpo),
    )
    expect(sinInquilino.map((p) => p.nombre)).toEqual([])
  })

  it('las funciones del JWT van envueltas en (select ...)', () => {
    // Sin el subselect se evaluan una vez por fila. No es estilo: es 100x.
    const sueltas = esquema.politicas.filter((p) =>
      /(?<!\(select\s)autorizacion\.\w+\(\)/.test(
        p.cuerpo.replace(/\(select\s+autorizacion\.\w+\(\)\)/g, ''),
      ),
    )
    expect(sueltas.map((p) => p.nombre)).toEqual([])
  })
})

describe('el corazon del producto: el bot solo ve lo publico', () => {
  it.each(TABLAS_CON_PUBLICO)(
    'la politica de SELECT del bot sobre %s exige publico = true',
    (tabla) => {
      const politica = esquema.politicas.find((p) => p.nombre === `${tabla}_bot_select`)
      expect(politica, `falta la politica ${tabla}_bot_select`).toBeDefined()
      expect(politica!.cuerpo).toMatch(/publico\s*=\s*true/)
    },
  )

  it.each(TABLAS_CON_PUBLICO)(
    'el bot no tiene ninguna politica de escritura sobre %s',
    (tabla) => {
      const escrituras = esquema.politicas.filter(
        (p) =>
          p.tabla === tabla &&
          p.nombre.includes('_bot_') &&
          p.comando !== 'select',
      )
      expect(escrituras.map((p) => p.nombre)).toEqual([])
    },
  )

  it('ninguna politica lee user_metadata', () => {
    // user_metadata lo edita el propio usuario: valdria para declararse de otra
    // clinica. Siempre app_metadata.
    expect(esquema.sql).not.toContain('user_metadata')
  })

  it('las funciones auxiliares leen app_metadata', () => {
    expect(esquema.sql).toContain("'app_metadata'")
  })
})

describe('trampas de Supabase', () => {
  it('no hay ninguna funcion SECURITY DEFINER', () => {
    // Si alguna vez hiciera falta, .claude/CLAUDE.md exige justificarla en un
    // COMMENT del propio SQL. Mientras no la haya, este test es el guardian.
    expect(esquema.sql).not.toMatch(/security\s+definer/)
  })

  it('toda funcion fija su search_path', () => {
    const funciones = esquema.sql.match(/create\s+or\s+replace\s+function/g) ?? []
    const conSearchPath = esquema.sql.match(/set\s+search_path\s*=\s*''/g) ?? []
    expect(conSearchPath.length).toBeGreaterThanOrEqual(funciones.length)
  })

  it('toda vista se crearia con security_invoker', () => {
    // Las vistas se saltan la RLS por defecto. Hoy no hay ninguna; el dia que
    // la haya, este test obliga a acordarse.
    const vistas = esquema.sql.match(/create\s+(?:or\s+replace\s+)?view/g) ?? []
    const invoker = esquema.sql.match(/security_invoker\s*=\s*true/g) ?? []
    expect(invoker.length).toBeGreaterThanOrEqual(vistas.length)
  })

  it('anon se queda sin privilegios de tabla', () => {
    expect(esquema.sql).toMatch(/revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon/)
  })

  it('el constraint sin_solape sigue ahi', () => {
    expect(esquema.sql).toContain('sin_solape')
    expect(esquema.sql).toMatch(/exclude\s+using\s+gist/)
  })

  it('citas.motivo_cerrado es un enum cerrado, no texto libre', () => {
    expect(esquema.sql).toMatch(
      /create\s+type\s+public\.motivo_visita\s+as\s+enum/,
    )
    expect(esquema.sql).toMatch(/motivo_cerrado\s+public\.motivo_visita\s+not\s+null/)
  })

  it('toda tabla salvo clinicas lleva clinica_id con ON DELETE CASCADE', () => {
    const conInquilino = [
      ...esquema.sql.matchAll(
        /clinica_id\s+uuid\s+not\s+null\s+references\s+public\.clinicas\(id\)\s+on\s+delete\s+cascade/g,
      ),
    ]
    expect(conInquilino.length).toBe(esquema.tablas.length - 1)
  })
})
