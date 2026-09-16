/**
 * config · tratamientos · faq — las tres tablas con columna `publico`.
 *
 * Aqui vive la promesa del producto. Un test por politica.
 */
import { beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteUsuario } from '../ayuda/clientes'
import { MARCADOR } from '../ayuda/entorno'
import { CONTRASENA, USUARIOS, type Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

type Descriptor = {
  tabla: 'config' | 'tratamientos' | 'faq'
  publica: (s: Sembrado) => string
  confidencial: (s: Sembrado) => string
  filaNueva: (clinicaId: string) => Record<string, unknown>
  campoTexto: string
}

const TABLAS: Descriptor[] = [
  {
    tabla: 'config',
    publica: (s) => s.configAPublica,
    confidencial: (s) => s.configAConfidencial,
    filaNueva: (clinica_id) => ({ clinica_id, clave: 'telefono_web', valor: '910000000' }),
    campoTexto: 'valor',
  },
  {
    tabla: 'tratamientos',
    publica: (s) => s.tratamientoAPublico,
    confidencial: (s) => s.tratamientoAConfidencial,
    filaNueva: (clinica_id) => ({
      clinica_id,
      codigo: 'HIG',
      nombre: 'Higiene',
      duracion_min: 45,
    }),
    campoTexto: 'frase_bot',
  },
  {
    tabla: 'faq',
    publica: (s) => s.faqAPublica,
    confidencial: (s) => s.faqAConfidencial,
    filaNueva: (clinica_id) => ({
      clinica_id,
      pregunta: '¿Teneis parking?',
      respuesta_aprobada: 'Si, en el numero 3.',
    }),
    campoTexto: 'respuesta_aprobada',
  },
]

describeVivo('conocimiento — config, tratamientos, faq', () => {
  let s: Sembrado

  beforeAll(() => {
    s = sembrado()
  })

  // ---------------------------------------------------------------------------
  // El bot
  // ---------------------------------------------------------------------------
  it.each(TABLAS)(
    '$tabla -> bot_select: el bot ve la fila publica de su clinica',
    async ({ tabla, publica }) => {
      const bot = clienteBot(s.clinicaA)
      const { data, error } = await bot.from(tabla).select('id').eq('id', publica(s))

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    },
  )

  it.each(TABLAS)(
    '$tabla -> bot_select: el bot NO ve la fila con publico = false',
    async ({ tabla, confidencial }) => {
      const bot = clienteBot(s.clinicaA)
      const { data, error } = await bot.from(tabla).select('id').eq('id', confidencial(s))

      expect(error).toBeNull()
      expect(data).toEqual([])
    },
  )

  it.each(TABLAS)(
    '$tabla -> bot_select: el marcador confidencial no aparece en NINGUNA fila que vea el bot',
    async ({ tabla }) => {
      // Esta es la prueba que importa. No mira ids: mira si el texto prohibido
      // ha llegado hasta el bot por cualquier via.
      const bot = clienteBot(s.clinicaA)
      const { data, error } = await bot.from(tabla).select('*')

      expect(error).toBeNull()
      expect(JSON.stringify(data)).not.toContain(MARCADOR)
    },
  )

  it.each(TABLAS)(
    '$tabla -> bot_select: el bot de otra clinica no ve nada de esta',
    async ({ tabla, publica }) => {
      const botB = clienteBot(s.clinicaB)
      const { data, error } = await botB.from(tabla).select('id').eq('id', publica(s))

      expect(error).toBeNull()
      expect(data).toEqual([])
    },
  )

  it.each(TABLAS)(
    '$tabla: el bot no tiene INSERT (no existe la politica)',
    async ({ tabla, filaNueva }) => {
      const bot = clienteBot(s.clinicaA)
      const { error } = await bot.from(tabla).insert(filaNueva(s.clinicaA))

      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    },
  )

  it.each(TABLAS)(
    '$tabla: el bot no tiene UPDATE (la actualizacion no alcanza ninguna fila)',
    async ({ tabla, publica, campoTexto }) => {
      const bot = clienteBot(s.clinicaA)
      const { data, error } = await bot
        .from(tabla)
        .update({ [campoTexto]: 'manipulado por el bot' } as never)
        .eq('id', publica(s))
        .select('id')

      // Sin politica de UPDATE la fila no es ni visible: cero filas, sin error.
      expect(error).toBeNull()
      expect(data).toEqual([])
    },
  )

  it.each(TABLAS)('$tabla: el bot no tiene DELETE', async ({ tabla, publica }) => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot.from(tabla).delete().eq('id', publica(s)).select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  // ---------------------------------------------------------------------------
  // La clinica
  // ---------------------------------------------------------------------------
  it.each(TABLAS)(
    '$tabla -> clinica_select: el propietario SI ve la fila confidencial',
    async ({ tabla, confidencial }) => {
      const panel = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)
      const { data, error } = await panel.from(tabla).select('id').eq('id', confidencial(s))

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    },
  )

  it.each(TABLAS)(
    '$tabla -> clinica_select: el rol lectura tambien ve lo confidencial de su clinica',
    async ({ tabla, confidencial }) => {
      const panel = await clienteUsuario(USUARIOS.aLectura.email, CONTRASENA)
      const { data, error } = await panel.from(tabla).select('id').eq('id', confidencial(s))

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    },
  )

  it.each(TABLAS)(
    '$tabla -> clinica_insert: recepcion puede crear filas de su clinica',
    async ({ tabla, filaNueva }) => {
      const panel = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)
      const { data, error } = await panel.from(tabla).insert(filaNueva(s.clinicaA)).select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)

      await panel.from(tabla).delete().eq('id', (data as { id: string }[])[0]!.id)
    },
  )

  it.each(TABLAS)(
    '$tabla -> clinica_insert: el WITH CHECK impide escribir en la clinica de al lado',
    async ({ tabla, filaNueva }) => {
      const panel = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)
      const { error } = await panel.from(tabla).insert(filaNueva(s.clinicaB))

      expect(error?.code).toBe('42501')
    },
  )

  it.each(TABLAS)(
    '$tabla -> clinica_insert: el rol lectura no puede crear',
    async ({ tabla, filaNueva }) => {
      const panel = await clienteUsuario(USUARIOS.aLectura.email, CONTRASENA)
      const { error } = await panel.from(tabla).insert(filaNueva(s.clinicaA))

      expect(error?.code).toBe('42501')
    },
  )

  it.each(TABLAS)(
    '$tabla -> clinica_update: recepcion puede cambiar el interruptor publico',
    async ({ tabla, confidencial }) => {
      // Esta es LA pantalla del producto: marcar algo como publico o dejar de
      // hacerlo. Tiene que funcionar desde el panel y solo desde el panel.
      const panel = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)

      const { data, error } = await panel
        .from(tabla)
        .update({ publico: true })
        .eq('id', confidencial(s))
        .select('id, publico')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)

      await panel.from(tabla).update({ publico: false }).eq('id', confidencial(s))
    },
  )

  it.each(TABLAS)('$tabla -> clinica_update: el rol lectura no puede cambiar nada', async ({
    tabla,
    publica,
    campoTexto,
  }) => {
    const panel = await clienteUsuario(USUARIOS.aLectura.email, CONTRASENA)
    const { data, error } = await panel
      .from(tabla)
      .update({ [campoTexto]: 'cambiado por alguien de solo lectura' } as never)
      .eq('id', publica(s))
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it.each(TABLAS)(
    '$tabla -> clinica_delete: recepcion no borra; solo el propietario',
    async ({ tabla, filaNueva }) => {
      const propietario = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)
      const { data: creada } = await propietario
        .from(tabla)
        .insert(filaNueva(s.clinicaA))
        .select('id')
      const id = (creada as { id: string }[])[0]!.id

      const recepcion = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)
      const { data: intento } = await recepcion.from(tabla).delete().eq('id', id).select('id')
      expect(intento).toEqual([])

      const { data: borrada } = await propietario.from(tabla).delete().eq('id', id).select('id')
      expect(borrada).toHaveLength(1)
    },
  )

  it.each(TABLAS)(
    '$tabla -> clinica_select: un propietario de otra clinica no ve nada de esta',
    async ({ tabla, publica, confidencial }) => {
      const otro = await clienteUsuario(USUARIOS.bPropietario.email, CONTRASENA)
      const { data, error } = await otro
        .from(tabla)
        .select('id')
        .in('id', [publica(s), confidencial(s)])

      expect(error).toBeNull()
      expect(data).toEqual([])
    },
  )
})
