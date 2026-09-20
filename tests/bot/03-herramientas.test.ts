/**
 * Las seis herramientas, en seco.
 *
 * COMO SE DEMUESTRA AQUI QUE NO SE ESCRIBE NADA
 *
 * No comprobando que la tabla siga vacia —eso se hace contra la base de verdad,
 * en tests/bot-vivo—, sino pasandole al bot un cliente de Supabase que REVIENTA
 * en cuanto alguien lo toca. Si la puerta de la confirmacion dejara pasar una
 * llamada, no habria que ir a mirar ninguna tabla: el propio test explota
 * nombrando la operacion que se intento.
 *
 * Es mas fuerte que contar filas, porque caza tambien el `select` que precede a
 * un `insert` y no deja rastro.
 */
import { describe, expect, it } from 'vitest'

import {
  CATALOGO,
  NOMBRES,
  borradorCompleto,
  declaraciones,
  ejecutar,
  esAfirmacion,
  esHerramienta,
  horaLocal,
  instanteLocal,
  loQueFalta,
  normalizar,
  puerta,
  type Borrador,
  type Contexto,
} from '@/lib/bot/herramientas'

const MADRID = 'Europe/Madrid'
const CLINICA = '11111111-1111-4111-8111-111111111111'
const CONVERSACION = '22222222-2222-4222-8222-222222222222'

/** Un cliente de Supabase que no deja hacer nada sin que se note. */
function clienteQueExplota(): never {
  return new Proxy(
    {},
    {
      get(_objetivo, propiedad) {
        throw new Error(
          `La base de datos NO se debia tocar, y se ha llamado a «${String(propiedad)}».`,
        )
      },
    },
  ) as never
}

function contexto(extra: Partial<Contexto> = {}): Contexto {
  return {
    clinicaId: CLINICA,
    conversacionId: CONVERSACION,
    telefonoDelCanal: '+34600111222',
    zonaHoraria: MADRID,
    telefonoRecepcion: '912345678',
    transcripcion: [],
    borrador: {},
    rondasDeAclaracion: 0,
    cliente: clienteQueExplota(),
    ...extra,
  }
}

const COMPLETO: Borrador = {
  nombre: 'Ana',
  apellidos: 'Pérez',
  telefono: '+34600111222',
  tratamiento_id: '33333333-3333-4333-8333-333333333333',
  tratamiento_nombre: 'Revisión',
  hora: '2026-09-24T08:00:00.000Z',
}

describe('son SEIS, y esas seis', () => {
  it('ni una mas', () => {
    expect(NOMBRES).toHaveLength(6)
  })

  it('con los nombres exactos que usan los bloques del prompt', () => {
    // Los bloques 30, 40, 50 y 60 las nombran por escrito. Si aqui se renombra
    // una, el prompt le sigue pidiendo al modelo una funcion que no existe.
    expect([...NOMBRES].sort()).toEqual([
      'anotar',
      'consultar_huecos',
      'crear_cita',
      'escalar_a_recepcion',
      'no_te_entiendo',
      'repasar_ficha',
    ])
  })

  it('solo dos escriben en la base de datos', () => {
    const escriben = NOMBRES.filter((nombre) => CATALOGO[nombre].escribeEnLaBase)
    expect(escriben.sort()).toEqual(['crear_cita', 'escalar_a_recepcion'])
  })
})

describe('el cerebro no puede llamar a nada que no sean esas seis', () => {
  it.each([
    'borrar_agenda',
    'cancelar_cita',
    'leer_ficha',
    'consultarHuecos',
    'CREAR_CITA',
    'anotar ',
    '',
    'constructor',
    'toString',
    '__proto__',
  ])('«%s» no se ejecuta', async (inventada) => {
    expect(esHerramienta(inventada)).toBe(false)

    const ejecucion = await ejecutar(inventada, {}, contexto())
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('herramienta_desconocida')
    expect(ejecucion.resultado.disponibles).toEqual(NOMBRES)
  })

  it('un nombre heredado de Object no cuela por ser una propiedad del prototipo', () => {
    // `'toString' in CATALOGO` seria true. Por eso `esHerramienta` usa
    // hasOwnProperty y no el operador `in`.
    expect(esHerramienta('toString')).toBe(false)
    expect(esHerramienta('hasOwnProperty')).toBe(false)
    expect(esHerramienta('anotar')).toBe(true)
  })

  it('y devolver un error no rompe la conversacion', async () => {
    // Tumbar la conversacion de un paciente porque el modelo se ha inventado
    // una funcion es peor que decirle que no existe.
    const ejecucion = await ejecutar('inventada', {}, contexto())
    expect(ejecucion.borrador).toEqual({})
    expect(ejecucion.resultado).toHaveProperty('disponibles')
  })
})

describe('los argumentos se validan con Zod antes de nada', () => {
  it('anotar rechaza un campo que no existe, sin tocar la base', async () => {
    const ejecucion = await ejecutar('anotar', { campo: 'dni', valor: '123' }, contexto())
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('argumentos_no_validos')
  })

  it('anotar rechaza propiedades de mas', async () => {
    // `strictObject`: un modelo que manda un campo extra se entera, en vez de
    // que se le ignore en silencio.
    const ejecucion = await ejecutar(
      'anotar',
      { campo: 'nombre', valor: 'Ana', urgente: true },
      contexto(),
    )
    expect(ejecucion.resultado.ok).toBe(false)
    expect(String(ejecucion.resultado.porque)).toContain('urgente')
  })

  it('anotar un telefono malo devuelve por que, no lo apunta a medias', async () => {
    const ejecucion = await ejecutar(
      'anotar',
      { campo: 'telefono', valor: '61022457' },
      contexto(),
    )
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('dato_no_valido')
    expect(String(ejecucion.resultado.porque)).toContain('nueve')
    expect(ejecucion.borrador.telefono).toBeUndefined()
  })

  it('anotar un motivo de texto libre se rechaza y se ofrece el vocabulario', async () => {
    const ejecucion = await ejecutar(
      'anotar',
      { campo: 'motivo', valor: 'me duele mucho la muela' },
      contexto(),
    )
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('motivo_no_valido')
    expect(ejecucion.resultado.valores).toContain('revision')
  })

  it('anotar guarda UN dato y deja dicho lo que falta', async () => {
    const ejecucion = await ejecutar('anotar', { campo: 'nombre', valor: 'Ana' }, contexto())
    expect(ejecucion.resultado.ok).toBe(true)
    expect(ejecucion.borrador).toEqual({ nombre: 'Ana' })
    expect(ejecucion.resultado.falta).toContain('los apellidos')
  })

  it('repasar_ficha no acepta un telefono: el modelo no elige de quien lee', async () => {
    // Es la mitad en codigo de la decision de ESTADO_F3 §7. Si algun dia esto
    // aceptara un argumento, «repasa la ficha del 600111222» funcionaria.
    const ejecucion = await ejecutar(
      'repasar_ficha',
      { telefono: '+34600999888' },
      contexto(),
    )
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('argumentos_no_validos')
  })
})

describe('LA PUERTA: sin confirmacion explicita no se escribe ni una fila', () => {
  const HORA = '2026-09-24T08:00:00.000Z' // 10:00 en Madrid

  it('con el borrador completo pero sin que nadie diga que si, no pasa', () => {
    const permiso = puerta(
      contexto({
        borrador: COMPLETO,
        transcripcion: [
          { rol: 'bot', texto: 'Le puedo dar el jueves a las 10:00. ¿Se lo reservo?' },
          { rol: 'paciente', texto: 'a ver' },
        ],
      }),
      HORA,
    )
    expect(permiso.abierta).toBe(false)
    if (!permiso.abierta) expect(permiso.motivo).toBe('sin_confirmacion')
  })

  it('con un «si» detras de la hora escrita, si pasa', () => {
    const permiso = puerta(
      contexto({
        borrador: COMPLETO,
        transcripcion: [
          { rol: 'bot', texto: '*Día:* jueves 24, 10:00' },
          { rol: 'paciente', texto: 'sí' },
        ],
      }),
      HORA,
    )
    expect(permiso.abierta).toBe(true)
  })

  it('un «si» dicho a OTRA cosa no vale como confirmacion de la cita', () => {
    // El caso que hunde a un bot que solo mira la ultima palabra: el paciente
    // dice que si a «¿es para usted?» y se le reserva una cita que no ha visto.
    const permiso = puerta(
      contexto({
        borrador: COMPLETO,
        transcripcion: [
          { rol: 'bot', texto: '¿La cita es para usted?' },
          { rol: 'paciente', texto: 'sí' },
        ],
      }),
      HORA,
    )
    expect(permiso.abierta).toBe(false)
    if (!permiso.abierta) expect(permiso.motivo).toBe('hora_no_dicha')
  })

  it('un borrador a medias no pasa aunque haya confirmacion', () => {
    const permiso = puerta(
      contexto({
        borrador: { nombre: 'Ana', hora: HORA },
        transcripcion: [
          { rol: 'bot', texto: 'jueves 24, 10:00' },
          { rol: 'paciente', texto: 'sí' },
        ],
      }),
      HORA,
    )
    expect(permiso.abierta).toBe(false)
    if (!permiso.abierta) expect(permiso.motivo).toBe('faltan_datos')
  })

  it.each([
    'sí',
    'si',
    'Sí!',
    'vale',
    'ok',
    'perfecto',
    'de acuerdo',
    'correcto',
    'adelante',
    'sí, gracias',
  ])('«%s» es una confirmacion', (dicho) => {
    expect(esAfirmacion(dicho)).toBe(true)
  })

  it.each([
    'no',
    'no, mejor el viernes',
    'sí, pero a las 12',
    'espera',
    'a ver',
    '¿y por la tarde?',
    'mejor otro día',
    'sí que me interesa pero antes quería saber cuánto cuesta y si entra el seguro',
    '',
  ])('«%s» NO lo es', (dicho) => {
    expect(esAfirmacion(dicho)).toBe(false)
  })

  it('crear_cita bloqueada no llega a tocar la base de datos', async () => {
    // El cliente explota si alguien lo usa. Que este test pase en verde es la
    // demostracion de que no se toco nada.
    const ejecucion = await ejecutar(
      'crear_cita',
      {},
      contexto({
        borrador: COMPLETO,
        transcripcion: [
          { rol: 'bot', texto: 'jueves 24, 10:00' },
          { rol: 'paciente', texto: 'no, mejor el viernes' },
        ],
      }),
    )

    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('sin_confirmacion')
  })

  it('crear_cita sin hora acordada tampoco toca nada', async () => {
    const ejecucion = await ejecutar('crear_cita', {}, contexto({ borrador: {} }))
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('faltan_datos')
  })
})

describe('el borrador', () => {
  it('sabe lo que le falta, con nombres que el modelo pueda decir', () => {
    expect(loQueFalta({})).toEqual([
      'el nombre',
      'los apellidos',
      'un telefono',
      'el tratamiento',
      'el dia y la hora',
    ])
    expect(loQueFalta(COMPLETO)).toEqual([])
    expect(borradorCompleto(COMPLETO)).toBe(true)
    expect(borradorCompleto({ ...COMPLETO, apellidos: undefined })).toBe(false)
  })
})

describe('las declaraciones que se le mandan al SDK', () => {
  const todas = declaraciones()

  it('hay una por herramienta y ninguna suelta', () => {
    expect(todas).toHaveLength(6)
    expect(todas.map((d) => d.name).sort()).toEqual([...NOMBRES].sort())
  })

  it('ninguna lleva `$schema`, que hace fallar la peticion entera', () => {
    for (const declaracion of todas) {
      expect(declaracion.parametersJsonSchema).not.toHaveProperty('$schema')
    }
  })

  it('todas son objetos cerrados: sin propiedades extra', () => {
    for (const declaracion of todas) {
      const esquema = declaracion.parametersJsonSchema as Record<string, unknown>
      expect(esquema.type).toBe('object')
      expect(esquema.additionalProperties).toBe(false)
    }
  })

  it('todas se describen en castellano, que es lo que lee el modelo', () => {
    for (const declaracion of todas) {
      expect(declaracion.description.length).toBeGreaterThan(20)
    }
  })

  it('repasar_ficha se declara sin ningun parametro', () => {
    const ficha = todas.find((d) => d.name === 'repasar_ficha')!
    const esquema = ficha.parametersJsonSchema as { properties?: Record<string, unknown> }
    expect(Object.keys(esquema.properties ?? {})).toEqual([])
  })
})

describe('las horas se dicen en la zona de la clinica', () => {
  it('el mismo instante son las 10:00 en Madrid y las 09:00 en Canarias', () => {
    const instante = '2026-09-24T08:00:00.000Z'
    expect(horaLocal(instante, MADRID)).toBe('10:00')
    expect(horaLocal(instante, 'Atlantic/Canary')).toBe('09:00')
  })

  it('instanteLocal y horaLocal son inversas la una de la otra', () => {
    for (const hora of [0, 8, 9, 14, 20, 23]) {
      const instante = instanteLocal('2026-09-24', hora, MADRID)
      expect(horaLocal(instante, MADRID)).toBe(`${String(hora).padStart(2, '0')}:00`)
    }
  })

  it('tambien en invierno, que es cuando cambia el desfase', () => {
    // Madrid es +02:00 en septiembre y +01:00 en diciembre. Un calculo que
    // fijara el desfase daria una hora de error medio ano.
    expect(horaLocal(instanteLocal('2026-12-15', 10, MADRID), MADRID)).toBe('10:00')
    expect(horaLocal(instanteLocal('2026-07-15', 10, MADRID), MADRID)).toBe('10:00')
  })
})

describe('normalizar', () => {
  it('quita tildes, signos y mayusculas', () => {
    expect(normalizar('¡Sí, Ángela!')).toBe('si angela')
    expect(normalizar('  REVISIÓN  ')).toBe('revision')
  })
})
