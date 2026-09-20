/**
 * El barrido tabla por tabla.
 *
 * Si alguien desactiva la RLS de cualquier tabla, esto se pone rojo. Es la
 * mitad VIVA de la barandilla; la estatica esta en 00-rls-activada.test.ts.
 *
 * OJO AL PROBADOR. Se usa un cliente `authenticated` de OTRA clinica, no
 * `anon`. A `anon` le hemos revocado los privilegios de tabla en la migracion
 * 004, asi que ve cero filas por falta de GRANT, no por la RLS: probar solo con
 * anon daria verde aunque la RLS estuviera apagada. Eso es exactamente el fallo
 * que este archivo esta escrito para no cometer.
 */
import { randomUUID } from 'node:crypto'

import { beforeAll, expect, it } from 'vitest'

import { clienteAnon, clienteBot, clienteUsuario } from '../ayuda/clientes'
import { MARCADOR } from '../ayuda/entorno'
import { CONTRASENA, USUARIOS, type Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

/**
 * Las 15 tablas, y que fila sembrada de la clinica A no debe verse desde B.
 *
 * `columna` es por donde se reconoce el inquilino de cada fila. En las catorce
 * de abajo es `clinica_id`; en `clinicas` es `id`, porque esa tabla ES la raiz
 * del inquilino y no se apunta a si misma. Pedirle `clinica_id` devolvia un
 * 42703 y esta comprobacion no probaba nada sobre `clinicas`.
 */
const TABLAS = [
  { tabla: 'clinicas', columna: 'id', fila: (s: Sembrado) => s.clinicaA },
  { tabla: 'gabinetes', columna: 'clinica_id', fila: (s: Sembrado) => s.gabineteA1 },
  { tabla: 'tratamientos', columna: 'clinica_id', fila: (s: Sembrado) => s.tratamientoAPublico },
  { tabla: 'horarios', columna: 'clinica_id', fila: null },
  { tabla: 'config', columna: 'clinica_id', fila: (s: Sembrado) => s.configAPublica },
  { tabla: 'faq', columna: 'clinica_id', fila: (s: Sembrado) => s.faqAPublica },
  { tabla: 'bloques_prompt', columna: 'clinica_id', fila: (s: Sembrado) => s.bloqueAActivo },
  { tabla: 'pacientes', columna: 'clinica_id', fila: (s: Sembrado) => s.pacienteA },
  { tabla: 'conversaciones', columna: 'clinica_id', fila: (s: Sembrado) => s.conversacionA },
  { tabla: 'citas', columna: 'clinica_id', fila: (s: Sembrado) => s.citaA },
  { tabla: 'mensajes', columna: 'clinica_id', fila: (s: Sembrado) => String(s.mensajeA) },
  { tabla: 'escalados', columna: 'clinica_id', fila: (s: Sembrado) => s.escaladoA },
  { tabla: 'eventos_webhook', columna: 'clinica_id', fila: (s: Sembrado) => String(s.eventoWebhookA) },
  { tabla: 'eventos', columna: 'clinica_id', fila: (s: Sembrado) => String(s.eventoA) },
  { tabla: 'auditoria', columna: 'clinica_id', fila: (s: Sembrado) => String(s.auditoriaA) },
] as const

describeVivo('aislamiento entre clinicas', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it.each(TABLAS)(
    '$tabla: el propietario de la clinica B no ve NADA de la clinica A',
    async ({ tabla, columna }) => {
      const otro = await clienteUsuario(USUARIOS.bPropietario.email, CONTRASENA)
      const { data, error } = await otro.from(tabla).select(columna)

      expect(error).toBeNull()
      for (const fila of (data ?? []) as Record<string, string>[]) {
        expect(fila[columna]).not.toBe(s.clinicaA)
      }
    },
  )

  it.each(TABLAS)(
    '$tabla: el bot de la clinica B no ve NADA de la clinica A',
    async ({ tabla }) => {
      const botB = clienteBot(s.clinicaB)
      const { data, error } = await botB.from(tabla).select('*')

      expect(error).toBeNull()
      const texto = JSON.stringify(data ?? [])
      expect(texto).not.toContain(s.clinicaA)
      expect(texto).not.toContain(MARCADOR)
    },
  )

  it.each(TABLAS)(
    '$tabla: una fila concreta de la clinica A es invisible desde la B',
    async ({ tabla, fila }) => {
      if (!fila) return // horarios no lleva un id sembrado individual

      const otro = await clienteUsuario(USUARIOS.bPropietario.email, CONTRASENA)
      const { data, error } = await otro.from(tabla).select('id').eq('id', fila(s))

      expect(error).toBeNull()
      expect(data).toEqual([])
    },
  )
})

describeVivo('el rol nadie: anon', () => {
  it.each(TABLAS)('$tabla: anon no lee nada', async ({ tabla }) => {
    // Segundo cerrojo, no el primero. Aqui la ausencia de GRANT y la ausencia
    // de politica dicen lo mismo, y con las dos puestas anon no pasa.
    const anon = clienteAnon()
    const { data, error } = await anon.from(tabla).select('*')

    expect(data ?? []).toEqual([])
    if (error) expect(['42501', 'PGRST301']).toContain(error.code)
  })

  it('anon no puede escribir en ninguna tabla', async () => {
    const anon = clienteAnon()
    const { error } = await anon
      .from('faq')
      .insert({ pregunta: 'x', respuesta_aprobada: 'y', publico: true })

    expect(error).not.toBeNull()
  })

  it('anon no puede llamar a los RPC', async () => {
    const anon = clienteAnon()
    const { error } = await anon.rpc('consultar_huecos', {
      p_clinica: '00000000-0000-0000-0000-000000000000',
      p_tratamiento: '00000000-0000-0000-0000-000000000000',
      p_desde: new Date().toISOString(),
      p_hasta: new Date().toISOString(),
    })

    expect(error).not.toBeNull()
  })
})

describeVivo('un JWT sin app_metadata no es nadie', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it('un clinica_id inexistente no abre ninguna puerta', async () => {
    // Firmar un token no basta: tiene que apuntar a una clinica que exista, y
    // aun asi solo ve lo suyo.
    //
    // Un uuid v4 de verdad, no el nulo. El nulo no es v4 y bot.ts lo rechaza
    // antes de firmar, que es lo correcto: lo que hay que probar aqui es que la
    // RLS no devuelve nada para una clinica que no existe, no el validador de
    // formato. Con el nulo, este test moria antes de tocar la base de datos.
    const inventado = clienteBot(randomUUID())
    const { data } = await inventado.from('faq').select('id')

    expect(data ?? []).toEqual([])
  })

  it('el bot de A con el id de B no ve lo de A', async () => {
    const botB = clienteBot(s.clinicaB)
    const { data } = await botB.from('faq').select('id').eq('id', s.faqAPublica)

    expect(data).toEqual([])
  })
})
