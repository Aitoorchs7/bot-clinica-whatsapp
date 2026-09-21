/**
 * La ficha de alta: la mitad que se puede comprobar sin base de datos.
 *
 * Es la unica parte del alta que corre en CI, asi que aqui va lo que mas caro
 * sale si se rompe en silencio: el vocabulario cerrado, los roles y las dos
 * claves de `config` sin las que el bot dice algo que no es de esta clinica.
 *
 * NINGUNA DE ESTAS PRUEBAS TOCA LA BASE. El acta del alta —la que comprueba
 * los cinco puntos contra un Supabase de verdad— es `02-acta.comprobacion.ts`
 * y se lanza con `pnpm alta:comprobar <slug>`, no con `pnpm test`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { MOTIVOS } from '@/lib/bot/validacion'

import {
  CLAVES_OBLIGATORIAS,
  CODIGO_RESERVADO,
  DIAS,
  MOTIVOS as MOTIVOS_DE_LA_FICHA,
  ROLES,
  validarFicha,
} from '../../scripts/ficha.mjs'

const EJEMPLO = JSON.parse(readFileSync('fichas/ejemplo.json', 'utf8'))

/** Una copia de la ficha de ejemplo con un cambio. Nunca se muta el original. */
function conCambio(cambio: (ficha: Record<string, unknown>) => void): Record<string, unknown> {
  const copia = JSON.parse(JSON.stringify(EJEMPLO))
  cambio(copia)
  return copia
}

function erroresDe(ficha: unknown): string[] {
  return validarFicha(ficha).errores
}

/** Que alguno de los errores hable de esto. */
function seQueja(ficha: unknown, sobre: RegExp): boolean {
  return erroresDe(ficha).some((e) => sobre.test(e))
}

describe('la ficha de ejemplo', () => {
  it('pasa la validacion entera', () => {
    const { errores } = validarFicha(EJEMPLO)
    expect(errores, `La ficha de ejemplo no valida:\n${errores.join('\n')}`).toEqual([])
  })

  it('trae filas confidenciales, que es lo que hace util el ejemplo', () => {
    // Una ficha de ejemplo sin nada confidencial ensena a dar de alta clinicas
    // sin marcar nada como interno, y entonces la barandilla 1 no tiene nada
    // que filtrar y el acta del alta no puede demostrar nada. Es el mismo
    // fallo que «la clinica fantasma» de F6, a nivel de plantilla.
    const config = Object.values(EJEMPLO.config as Record<string, { publico: boolean }>)
    expect(config.filter((c) => c.publico === false).length).toBeGreaterThan(0)
    expect(
      (EJEMPLO.faq as { publico: boolean }[]).filter((f) => f.publico === false).length,
    ).toBeGreaterThan(0)
    expect(
      (EJEMPLO.tratamientos as { publico: boolean }[]).filter((t) => t.publico === false).length,
    ).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Las copias que vigila esta prueba
// ---------------------------------------------------------------------------
// `scripts/ficha.mjs` es JavaScript y no puede importar el TypeScript de
// `src/`, asi que repite dos listas. Repetir una lista es exactamente como se
// pierden de vista: aqui se exige que coincidan con su original, y ademas con
// el .sql, que es la unica fuente de verdad de las dos.

describe('el vocabulario cerrado no se duplica sin vigilancia', () => {
  it('los motivos de la ficha son los de validacion.ts', () => {
    expect([...MOTIVOS_DE_LA_FICHA].sort()).toEqual([...MOTIVOS].sort())
  })

  it('y son los del enum `motivo_visita` de la migracion 002', () => {
    const sql = readFileSync('supabase/migrations/20260916100200_tablas.sql', 'utf8')
    const declaracion = /create type public\.motivo_visita as enum\s*\(([^)]*)\)/i.exec(sql)
    expect(declaracion, 'No se ha encontrado el enum motivo_visita en la migracion 002').not.toBeNull()

    const enElSql = [...declaracion![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(
      enElSql.sort(),
      'El enum de Postgres y la lista de scripts/ficha.mjs han dejado de coincidir. Si se ha ' +
        'anadido un motivo, se anade en las dos; si alguien lo ha metido como texto libre, esto ' +
        'es el aviso.',
    ).toEqual([...MOTIVOS_DE_LA_FICHA].sort())
  })

  it('los roles de la ficha son los del panel', () => {
    // Se lee el texto de `sesion.ts` en vez de importarlo: ese modulo arrastra
    // `next/navigation` y el cliente de servidor, que fuera de Next no
    // levantan. Lo que interesa aqui es la lista, no el modulo.
    const fuente = readFileSync('src/lib/panel/sesion.ts', 'utf8')
    const declaracion = /export const ROLES = \[([^\]]*)\] as const/.exec(fuente)
    expect(declaracion, 'No se ha encontrado ROLES en src/lib/panel/sesion.ts').not.toBeNull()

    const delPanel = [...declaracion![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
    expect([...ROLES].sort()).toEqual(delPanel.sort())
  })

  it('los dias son los siete, con domingo en el 0 como `extract(dow)`', () => {
    expect(DIAS).toEqual({
      domingo: 0,
      lunes: 1,
      martes: 2,
      miercoles: 3,
      jueves: 4,
      viernes: 5,
      sabado: 6,
    })
  })
})

// ---------------------------------------------------------------------------
// Lo que la validacion TIENE que rechazar
// ---------------------------------------------------------------------------
// Cada uno de estos casos es un alta que hoy se podia hacer y que no daba
// ningun error: la clinica quedaba creada y el fallo aparecia semanas despues
// en la conversacion de un paciente. Por eso la prueba no es «valida bien»,
// es «se niega a hacerlo».

describe('un motivo de visita que no existe NO se apana con texto libre', () => {
  it('se rechaza, y el mensaje dice que eso es una migracion', () => {
    const ficha = conCambio((f) => {
      ;(f.tratamientos as { motivo: string }[])[0]!.motivo = 'blanqueamiento'
    })
    expect(seQueja(ficha, /migracion/i)).toBe(true)
    expect(seQueja(ficha, /Art\. 9|RGPD/)).toBe(true)
  })

  it('los cinco de siempre siguen valiendo', () => {
    for (const motivo of MOTIVOS_DE_LA_FICHA) {
      const ficha = conCambio((f) => {
        ;(f.tratamientos as { motivo: string }[])[0]!.motivo = motivo
      })
      expect(erroresDe(ficha), `"${motivo}" deberia valer`).toEqual([])
    }
  })
})

describe('las dos claves de config sin las que el bot habla de otra clinica', () => {
  for (const clave of CLAVES_OBLIGATORIAS as string[]) {
    it(`sin ${clave} el alta no sale`, () => {
      const ficha = conCambio((f) => {
        delete (f.config as Record<string, unknown>)[clave]
      })
      expect(seQueja(ficha, new RegExp(clave))).toBe(true)
    })

    it(`con ${clave} puesta pero publico=false, tampoco`, () => {
      // La trampa fina, y la unica de las cinco que se ve bien mirando la
      // base: la fila esta. Lo que no esta es al alcance del bot, porque la
      // RLS no se la devuelve, asi que se comporta igual que si faltara.
      const ficha = conCambio((f) => {
        ;(f.config as Record<string, { publico: boolean }>)[clave]!.publico = false
      })
      expect(seQueja(ficha, new RegExp(`${clave}[\\s\\S]*true`))).toBe(true)
    })

    it(`y con ${clave} vacia, tampoco`, () => {
      const ficha = conCambio((f) => {
        ;(f.config as Record<string, { valor: string }>)[clave]!.valor = '   '
      })
      expect(seQueja(ficha, new RegExp(clave))).toBe(true)
    })
  }
})

describe('el canal', () => {
  it('sin wa_phone_number_id no hay alta', () => {
    const ficha = conCambio((f) => {
      delete f.wa_phone_number_id
    })
    expect(seQueja(ficha, /wa_phone_number_id/)).toBe(true)
  })

  it('y el mensaje avisa de los recordatorios, no solo de los mensajes', () => {
    // El agravante de F6: una clinica que falta en el mapa deja de contestar
    // —lo nota el paciente— y ademas deja de mandar recordatorios, que no lo
    // nota nadie hasta que alguien no se presenta.
    const ficha = conCambio((f) => {
      delete f.wa_phone_number_id
    })
    expect(seQueja(ficha, /recordatorio/i)).toBe(true)
  })
})

describe('los usuarios del panel', () => {
  it('sin ninguno, no hay alta', () => {
    const ficha = conCambio((f) => {
      f.usuarios = []
    })
    expect(seQueja(ficha, /usuarios/)).toBe(true)
  })

  it('un rol inventado se rechaza', () => {
    const ficha = conCambio((f) => {
      ;(f.usuarios as { rol: string }[])[0]!.rol = 'administrador'
    })
    expect(seQueja(ficha, /rol/)).toBe(true)
  })

  it('hace falta al menos un propietario', () => {
    const ficha = conCambio((f) => {
      for (const u of f.usuarios as { rol: string }[]) u.rol = 'lectura'
    })
    expect(seQueja(ficha, /propietario/)).toBe(true)
  })
})

describe('las trampas que no dan error por si solas', () => {
  it('una clave mal escrita se caza en vez de ignorarse', () => {
    // `horario` por `horarios` seria un alta sin horarios, y una clinica sin
    // horarios es un bot que contesta «no tengo huecos» para siempre.
    const ficha = conCambio((f) => {
      f.horario = f.horarios
      delete f.horarios
    })
    expect(seQueja(ficha, /"horario"/)).toBe(true)
  })

  it('sin horarios, tampoco', () => {
    const ficha = conCambio((f) => {
      f.horarios = []
    })
    expect(seQueja(ficha, /horarios/)).toBe(true)
  })

  it('un tramo con descanso dentro (de 09:00 a 20:00 "con parada") no cuela', () => {
    const ficha = conCambio((f) => {
      ;(f.horarios as { de: string; a: string }[])[0] = { dia: 'lunes', de: '14:00', a: '09:00' } as never
    })
    expect(seQueja(ficha, /anterior/)).toBe(true)
  })

  it('si ningun tratamiento es publico, el bot no podria ofrecer nada', () => {
    const ficha = conCambio((f) => {
      for (const t of f.tratamientos as { publico: boolean }[]) t.publico = false
    })
    expect(seQueja(ficha, /publico/)).toBe(true)
  })

  it('un `publico` sin poner NO se toma por false: se pide a mano', () => {
    // Tener un valor por defecto aqui seria decidir por la clinica si algo
    // suyo es publico. Ante la duda es false, pero la duda la resuelve ella.
    const ficha = conCambio((f) => {
      delete (f.faq as { publico?: boolean }[])[0]!.publico
    })
    expect(seQueja(ficha, /publico/)).toBe(true)
  })

  it('el codigo reservado del canario no se le puede dar a una clinica', () => {
    // El acta siembra y borra un tratamiento con ese codigo. Si una clinica lo
    // usara, el barrido del acta se llevaria por delante uno suyo.
    const ficha = conCambio((f) => {
      ;(f.tratamientos as { codigo: string }[])[0]!.codigo = CODIGO_RESERVADO
    })
    expect(seQueja(ficha, /reservado/)).toBe(true)
  })

  it('un gabinete que no esta en la lista se caza', () => {
    const ficha = conCambio((f) => {
      ;(f.tratamientos as { gabinete?: string }[])[0]!.gabinete = 'Gabinete 9'
    })
    expect(seQueja(ficha, /Gabinete 9/)).toBe(true)
  })

  it('un telefono que no es E.164 se caza', () => {
    const ficha = conCambio((f) => {
      f.telefono_recepcion = '912345678'
    })
    expect(seQueja(ficha, /telefono_recepcion/)).toBe(true)
  })
})

describe('la validacion no se para en el primer fallo', () => {
  it('una ficha vacia los cuenta todos de una vez', () => {
    // Quien da de alta una clinica esta al telefono con ella: una lista
    // completa se resuelve en una llamada y un fallo cada vez son cinco.
    const errores = erroresDe({})
    expect(errores.length).toBeGreaterThan(5)
  })

  it('y algo que ni siquiera es un objeto no revienta', () => {
    expect(erroresDe('una clinica')).toHaveLength(1)
    expect(erroresDe(null)).toHaveLength(1)
  })
})
