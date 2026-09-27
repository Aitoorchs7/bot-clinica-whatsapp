/**
 * config · tratamientos · faq — las tres tablas con columna `publico`.
 *
 * Aqui vive la promesa del producto. Un test por politica.
 */
import { beforeAll, expect, it, onTestFinished } from 'vitest'

import { clienteBot, clienteServicio, clienteUsuario } from '../ayuda/clientes'
import { MARCADOR } from '../ayuda/entorno'
import { CONTRASENA, USUARIOS, type Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

type Descriptor = {
  tabla: 'config' | 'tratamientos' | 'faq'
  publica: (s: Sembrado) => string
  confidencial: (s: Sembrado) => string
  filaNueva: (clinicaId: string) => Record<string, unknown>
  /**
   * Por donde se vuelve a encontrar la fila que crea `filaNueva`. No vale el
   * id: si el insert falla no hay id, y la limpieza tiene que correr igual.
   */
  claveNueva: { columna: string; valor: string }
  campoTexto: string
}

const TABLAS: Descriptor[] = [
  {
    tabla: 'config',
    publica: (s) => s.configAPublica,
    confidencial: (s) => s.configAConfidencial,
    filaNueva: (clinica_id) => ({ clinica_id, clave: 'telefono_web', valor: '910000000' }),
    claveNueva: { columna: 'clave', valor: 'telefono_web' },
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
    claveNueva: { columna: 'codigo', valor: 'HIG' },
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
    claveNueva: { columna: 'pregunta', valor: '¿Teneis parking?' },
    campoTexto: 'respuesta_aprobada',
  },
]

/**
 * Borra la fila que crea `filaNueva`, pase lo que pase con el test.
 *
 * Antes la limpieza la hacia el propio cliente de recepcion... y el test
 * "clinica_delete" de mas abajo demuestra que recepcion NO tiene DELETE. Era un
 * no-op garantizado por diseno: la fila sobrevivia y, sesenta lineas despues,
 * el mismo `filaNueva` chocaba contra `unique (clinica_id, codigo)`. El insert
 * devolvia null, el test descartaba el error y el fallo salia a la superficie
 * como un TypeError sin ninguna relacion aparente.
 *
 * Se limpia con service_role porque esto es teardown, no una asercion: ninguna
 * comprobacion de este archivo depende de que la limpieza tenga permiso. Y va
 * en onTestFinished para que corra tambien cuando el test revienta.
 */
function limpiarDespues(
  tabla: string,
  clinicaId: string,
  clave: { columna: string; valor: string },
) {
  onTestFinished(async () => {
    await clienteServicio()
      .from(tabla)
      .delete()
      .eq('clinica_id', clinicaId)
      .eq(clave.columna, clave.valor)
  })
}

/**
 * Exige que la fila exista DE VERDAD antes de dar por buena una lista vacia.
 *
 * Una asercion negativa cuya unica prueba es "cero filas" pasa igual si la fila
 * no existe: verde por ausencia en vez de verde por permiso. No es teorico.
 * Al apagar la RLS de faq para comprobar que esta bateria mira, el test "el bot
 * no tiene DELETE" fallo y borro de verdad la fila publica; a partir de ahi,
 * todo test que la tocara veia cero filas y se ponia verde. Un guardarrail
 * roto dejaba en verde a los de despues, que es la peor forma de fallar.
 *
 * Se comprueba con service_role a proposito: no puede depender del rol que se
 * esta probando, o volveria a confundir "no existe" con "no puedes".
 */
async function exigirQueExista(tabla: string, id: string) {
  const { data } = await clienteServicio().from(tabla).select('id').eq('id', id)
  expect(
    data,
    `la fila ${id} de ${tabla} ya no existe: un test anterior la destruyo, y sin ` +
      'ella las comprobaciones de "cero filas" pasan por ausencia, no por permiso',
  ).toHaveLength(1)
}

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
      const { error } = await bot.from(tabla).insert(filaNueva(s.clinicaA) as never)

      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    },
  )

  it.each(TABLAS)(
    '$tabla: el bot no tiene UPDATE (la actualizacion no alcanza ninguna fila)',
    async ({ tabla, publica, campoTexto }) => {
      await exigirQueExista(tabla, publica(s))

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
    // Este test es DESTRUCTIVO si la barandilla cede: el borrado se ejecuta de
    // verdad. Comprobar que la fila sigue ahi es lo que impide que un fallo
    // aqui se propague en silencio a todos los tests que vienen detras.
    await exigirQueExista(tabla, publica(s))
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
    async ({ tabla, filaNueva, claveNueva }) => {
      const panel = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)
      limpiarDespues(tabla, s.clinicaA, claveNueva)

      const { data, error } = await panel.from(tabla).insert(filaNueva(s.clinicaA)).select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
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
    await exigirQueExista(tabla, publica(s))

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
    async ({ tabla, filaNueva, claveNueva }) => {
      const propietario = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)
      limpiarDespues(tabla, s.clinicaA, claveNueva)

      // El error del alta NO se descarta: si el insert falla, que lo diga aqui
      // y con su codigo, no sesenta lineas mas abajo disfrazado de otra cosa.
      const { data: creada, error: errorAlta } = await propietario
        .from(tabla)
        .insert(filaNueva(s.clinicaA))
        .select('id')
      expect(errorAlta).toBeNull()
      expect(creada).toHaveLength(1)
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
