/**
 * Migracion 007 — integridad entre inquilinos y cierre del dato de salud.
 *
 * Las tres cosas que se prueban aqui son las que la auditoria encontro despues
 * de dar las seis primeras migraciones por buenas:
 *
 *   1. Que `escalados` y `citas`, que sobreviven a la purga de 90 dias, no
 *      tengan ni una columna donde quepa una frase escrita por el modelo.
 *   2. Que ninguna fila pueda apuntar a una fila de otra clinica.
 *   3. Que borrar un paciente ya no se lleve sus citas por delante saltandose
 *      los dos cerrojos que impiden borrar citas.
 *
 * La mitad estatica corre sin base de datos, en el trabajo
 * `comprobaciones-estaticas` de .github/workflows/ci.yml.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { crearClienteBot } from '@/lib/supabase/bot'

import { clienteServicio, clienteUsuario } from '../ayuda/clientes'
import { columnasDe, sqlPlano } from '../ayuda/esquema'
import { CONTRASENA, USUARIOS, type Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

/**
 * Las nueve referencias entre tablas del inquilino. Cada una tuvo que pasar de
 * una columna a dos: la fila referida y la clinica a la que pertenece.
 */
const REFERENCIAS = [
  { hija: 'conversaciones', columna: 'paciente_id', padre: 'pacientes', existia: true },
  { hija: 'tratamientos', columna: 'gabinete_id', padre: 'gabinetes', existia: true },
  { hija: 'citas', columna: 'paciente_id', padre: 'pacientes', existia: true },
  { hija: 'citas', columna: 'tratamiento_id', padre: 'tratamientos', existia: true },
  { hija: 'citas', columna: 'gabinete_id', padre: 'gabinetes', existia: true },
  { hija: 'citas', columna: 'conversacion_id', padre: 'conversaciones', existia: true },
  { hija: 'mensajes', columna: 'conversacion_id', padre: 'conversaciones', existia: true },
  { hija: 'escalados', columna: 'conversacion_id', padre: 'conversaciones', existia: true },
  { hija: 'escalados', columna: 'mensaje_id', padre: 'mensajes', existia: false },
] as const

const PADRES = ['pacientes', 'tratamientos', 'gabinetes', 'conversaciones', 'mensajes'] as const

/** Cualquier tipo donde quepa una frase libre. */
const TIPO_LIBRE = /\b(text|varchar|character|citext|json|jsonb)\b/

// =============================================================================
// Estatico — sin base de datos
// =============================================================================
describe('007 · el dato de salud vive en un solo sitio, y ese sitio se borra', () => {
  it.each(['escalados', 'citas'])(
    '%s no conserva ninguna columna donde quepa texto libre',
    (tabla) => {
      // Estas dos tablas sobreviven a la purga de 90 dias a proposito: recepcion
      // necesita el historial de casos y la clinica necesita su agenda. Por eso
      // mismo no pueden guardar una palabra escrita por el modelo.
      const columnas = columnasDe(tabla)
      // Sin esto el test pasaria tambien si el analizador no encontrara la
      // tabla: cero columnas, cero de texto libre, verde por no haber mirado.
      expect(columnas.length).toBeGreaterThan(5)

      const libres = columnas.filter((c) => TIPO_LIBRE.test(c.definicion))
      expect(libres.map((c) => `${tabla}.${c.nombre}: ${c.definicion}`)).toEqual([])
    },
  )

  it('escalados.resumen ya no existe', () => {
    const nombres = columnasDe('escalados').map((c) => c.nombre)

    expect(nombres).not.toContain('resumen')
    expect(nombres.length).toBeGreaterThan(0) // el analizador encuentra la tabla
  })

  it('escalados.asunto usa el mismo enum cerrado que citas.motivo_cerrado', () => {
    const asunto = columnasDe('escalados').find((c) => c.nombre === 'asunto')
    const motivoCerrado = columnasDe('citas').find((c) => c.nombre === 'motivo_cerrado')

    expect(asunto?.definicion).toContain('public.motivo_visita')
    expect(motivoCerrado?.definicion).toContain('public.motivo_visita')
  })

  it('escalados.mensaje_id es el puntero que se queda en null al purgar', () => {
    const nombres = columnasDe('escalados').map((c) => c.nombre)
    expect(nombres).toContain('mensaje_id')

    expect(sqlPlano()).toContain("('escalados', 'mensaje_id', 'mensajes', 'set null (mensaje_id)')")
  })

  it('la purga vacia la carga cruda de Meta, que antes no tocaba nadie', () => {
    const sql = sqlPlano()

    expect(sql).toContain('update public.eventos_webhook set carga = null')
    expect(sql).toContain('p_dias_cargas')
  })
})

describe('007 · ninguna fila puede apuntar a una fila de otra clinica', () => {
  it('las cinco tablas padre reciben la clave unica (id, clinica_id)', () => {
    // El nombre lo compone la migracion (`t || '_id_clinica_key'`), asi que lo
    // que hay que comprobar es la lista de tablas y la plantilla, no un literal
    // que no existe en el SQL.
    const sql = sqlPlano()

    expect(sql).toContain(`array[${PADRES.map((t) => `'${t}'`).join(', ')}]`)
    expect(sql).toContain("t || '_id_clinica_key'")
    expect(sql).toContain('unique (id, clinica_id)')
  })

  it.each(REFERENCIAS)(
    '$hija · $columna -> $padre es una clave foranea compuesta',
    ({ hija, columna, padre, existia }) => {
      const sql = sqlPlano()

      // La compuesta se declara...
      expect(sql).toContain(`('${hija}', '${columna}', '${padre}', '`)
      // ...y la de una sola columna, si la habia, esta en la lista de bajas.
      // `escalados.mensaje_id` no estaba: la columna nace en esta migracion.
      if (existia) expect(sql).toContain(`('${hija}', '${columna}')`)
    },
  )

  it('todas se nombran igual, para que una que falte se vea de un vistazo', () => {
    expect(sqlPlano()).toContain("format('%s_%s_clinica_fkey', f.hija, f.columna)")
  })

  it('la clave compuesta lleva siempre clinica_id como segunda columna', () => {
    expect(sqlPlano()).toContain('foreign key (%i, clinica_id) references public.%i (id, clinica_id)')
  })

  it('sin_solape sigue intacto: no se le ha metido clinica_id', () => {
    // La otra propuesta para este mismo agujero era acotar el EXCLUDE por
    // clinica. Habria cambiado un bloqueo ruidoso por una doble reserva
    // silenciosa en el sillon de otra clinica. Si alguien lo intenta, aqui se
    // entera.
    const sql = sqlPlano()
    const constraint = sql.slice(sql.indexOf('constraint sin_solape'))
    const exclude = constraint.slice(0, constraint.indexOf('where'))

    expect(exclude).toContain('gabinete_id with =')
    expect(exclude).not.toContain('clinica_id')
  })
})

describe('007 · borrar un paciente ya no borra sus citas', () => {
  it('citas.paciente_id pasa a no action, que es lo que respeta los cerrojos', () => {
    expect(sqlPlano()).toContain("('citas', 'paciente_id', 'pacientes', 'no action')")
  })

  it.each(['paciente_id', 'tratamiento_id', 'gabinete_id'])(
    'citas.%s no borra en cascada',
    (columna) => {
      const sql = sqlPlano()
      // Con la coma detras: asi cae en la lista de claves nuevas y no en la de
      // las que se retiran, donde la pareja tambien aparece.
      const posicion = sql.indexOf(`('citas', '${columna}', '`)

      expect(posicion).toBeGreaterThan(-1)
      expect(sql.slice(posicion, posicion + 90)).not.toContain('cascade')
    },
  )
})

describe('007 · el GRANT que anon heredaba de PUBLIC', () => {
  it('se revoca execute a PUBLIC sobre las funciones de public, presentes y futuras', () => {
    const sql = sqlPlano()

    expect(sql).toContain('revoke execute on all functions in schema public from public')
    expect(sql).toContain(
      'alter default privileges in schema public revoke execute on functions from public',
    )
  })

  it('y los dos RPC conservan su permiso explicito', () => {
    const sql = sqlPlano()

    expect(sql).toContain('grant execute on function public.consultar_huecos')
    expect(sql).toContain('grant execute on function public.crear_cita')
  })
})

// =============================================================================
// Unitario — el cliente del bot, sin base de datos
// =============================================================================
describe('007 · el bot no firma un token para una identidad sin forma', () => {
  it.each([
    ['vacio', ''],
    ['no es un uuid', 'clinica-de-pruebas'],
    ['inyeccion', "' or true --"],
    ['uuid a medias', '3f2504e0-4f89-11d3-9a'],
  ])('rechaza un clinica_id %s antes de firmar', (_caso, valor) => {
    expect(() => crearClienteBot(valor)).toThrowError(/uuid/i)
  })

  it('acepta un uuid bien formado', () => {
    // Sin .env.local fallara por falta de variables, pero NO por el uuid: eso
    // es lo unico que se comprueba aqui.
    let mensaje = ''
    try {
      crearClienteBot('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
    } catch (error) {
      mensaje = (error as Error).message
    }

    expect(mensaje).not.toMatch(/uuid/i)
  })
})

// =============================================================================
// Vivo — contra la base de datos
// =============================================================================
describeVivo('007 · comportamiento contra la base de datos', () => {
  let s: Sembrado

  beforeAll(() => {
    s = sembrado()
  })

  it('una cita no puede ocupar el gabinete de otra clinica', async () => {
    // Este era el agujero: la RLS deja pasar la fila porque citas.clinica_id es
    // el mio. Lo que la paraba antes no era nada. Ahora la para la clave.
    const panel = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)

    const inicio = new Date(Date.now() + 72 * 3600_000)
    inicio.setUTCHours(11, 0, 0, 0)

    const { error } = await panel.from('citas').insert({
      clinica_id: s.clinicaA,
      paciente_id: s.pacienteA,
      tratamiento_id: s.tratamientoAPublico,
      gabinete_id: s.gabineteB1, // <- el sillon del vecino
      inicio: inicio.toISOString(),
      fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
      estado: 'confirmada',
      motivo_cerrado: 'revision',
    } as never)

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23503')
  })

  it('una conversacion no puede apuntar al paciente de otra clinica', async () => {
    const { error } = await clienteServicio()
      .from('conversaciones')
      .insert({
        clinica_id: s.clinicaA,
        telefono_e164: '+34600999888',
        paciente_id: s.pacienteB, // <- paciente de la clinica B
      } as never)

    // Ni siquiera con service_role, que salta la RLS: esto no es una politica,
    // es integridad referencial.
    expect(error?.code).toBe('23503')
  })

  it('borrar un paciente con citas falla, no se lleva las citas por delante', async () => {
    const propietario = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)

    const { error } = await propietario.from('pacientes').delete().eq('id', s.pacienteA)

    expect(error?.code).toBe('23503')

    // Y la cita sigue donde estaba.
    const { data } = await clienteServicio().from('citas').select('id').eq('id', s.citaA)
    expect(data).toHaveLength(1)
  })

  it('el bot no puede escribir texto libre en un escalado', async () => {
    const bot = crearClienteBot(s.clinicaA)

    const { error } = await bot.from('escalados').insert({
      clinica_id: s.clinicaA,
      conversacion_id: s.conversacionA,
      motivo: 'urgencia_grave',
      resumen: 'Le duele el 26 y tiene la cara hinchada',
    } as never)

    // La columna no existe. No hay forma de que una frase del modelo entre en
    // una tabla que sobrevive a la purga.
    expect(error).not.toBeNull()
  })

  it('dar de baja una clinica sigue siendo posible pese a las claves nuevas', async () => {
    // Es la razon de usar NO ACTION y no RESTRICT. Con RESTRICT, la baja de una
    // clinica fallaria: la comprobacion de citas -> tratamientos saltaria antes
    // de que la cascada hubiera borrado las citas. Si alguien cambia esto a
    // RESTRICT, este test se pone rojo y la limpieza de los demas tambien.
    const db = clienteServicio()

    const nueva = await db
      .from('clinicas')
      .insert({
        nombre: 'Clinica de baja',
        slug: 'rls-prueba-baja',
        telefono_recepcion: '+34910000009',
      } as never)
      .select('id')
      .single()
    expect(nueva.error).toBeNull()
    const clinicaId = (nueva.data as { id: string }).id

    const gabinete = await db
      .from('gabinetes')
      .insert({ clinica_id: clinicaId, nombre: 'Gabinete 1' } as never)
      .select('id')
      .single()
    const tratamiento = await db
      .from('tratamientos')
      .insert({
        clinica_id: clinicaId,
        codigo: 'REV',
        nombre: 'Revision',
        duracion_min: 30,
      } as never)
      .select('id')
      .single()
    const paciente = await db
      .from('pacientes')
      .insert({ clinica_id: clinicaId, nombre: 'Baja', telefono_e164: '+34600000009' } as never)
      .select('id')
      .single()

    const inicio = new Date(Date.now() + 96 * 3600_000)
    inicio.setUTCHours(9, 0, 0, 0)
    const cita = await db.from('citas').insert({
      clinica_id: clinicaId,
      paciente_id: (paciente.data as { id: string }).id,
      tratamiento_id: (tratamiento.data as { id: string }).id,
      gabinete_id: (gabinete.data as { id: string }).id,
      inicio: inicio.toISOString(),
      fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
      estado: 'confirmada',
      motivo_cerrado: 'revision',
    } as never)
    expect(cita.error).toBeNull()

    const { error } = await db.from('clinicas').delete().eq('id', clinicaId)
    expect(error).toBeNull()
  })
})
