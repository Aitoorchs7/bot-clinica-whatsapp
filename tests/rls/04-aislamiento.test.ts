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

import { afterAll, beforeAll, expect, it } from 'vitest'

import { clienteAnon, clienteBot, clienteServicio, clienteUsuario } from '../ayuda/clientes'
import { MARCADOR } from '../ayuda/entorno'
import { leerEsquema } from '../ayuda/esquema'
import { CONTRASENA, USUARIOS, type Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

/**
 * Las 16 tablas, y que fila sembrada de la clinica A no debe verse desde B.
 *
 * `columna` es por donde se reconoce el inquilino de cada fila. En las quince
 * de abajo es `clinica_id`; en `clinicas` es `id`, porque esa tabla ES la raiz
 * del inquilino y no se apunta a si misma. Pedirle `clinica_id` devolvia un
 * 42703 y esta comprobacion no probaba nada sobre `clinicas`.
 *
 * ⚠ SON DIECISEIS DESDE F7, Y ERAN QUINCE DESDE F1.
 *
 * `recordatorios` la creo la migracion 009 en F6 y se quedo fuera de esta
 * lista. No fue inocuo: la mitad estatica (`00-rls-activada`) SI la cogia
 * —deriva la lista de los .sql y la nombra— asi que el barrido salia verde y
 * nadie echaba en falta la fila diecisexta. La mitad viva, que es la que
 * demuestra que la politica esta PUESTA y no solo escrita, no la miraba.
 *
 * Es el aviso que deja esta fase: una lista escrita a mano al lado de una que
 * se deriva sola acaba desincronizada, y el tick verde de al lado tapa el
 * hueco. Lo vigila ahora la primera prueba del describe, que compara esta
 * lista con la que salga de `leerEsquema()`.
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
  // F6 · migracion 009. La fila la crea este archivo en su `beforeAll`, no la
  // siembra global: `trabajos-vivo/01-recordatorios` borra en su `afterEach`
  // TODOS los recordatorios de las dos clinicas de prueba, asi que una fila
  // sembrada globalmente desapareceria segun que archivo corriera antes y
  // este barrido pasaria a ser verde por ausencia — que es exactamente el
  // fallo que F6 documenta con su nombre.
  { tabla: 'recordatorios', columna: 'clinica_id', fila: () => String(recordatorioA) },
] as const

/**
 * El recordatorio de la clinica A, creado y borrado por este archivo.
 *
 * `let` y no una constante porque su id lo da la base al insertar. Vive fuera
 * del `describe` porque `TABLAS` se evalua al cargar el modulo.
 */
let recordatorioA = 0

describeVivo('aislamiento entre clinicas', () => {
  let s: Sembrado

  beforeAll(async () => {
    s = sembrado()

    // La fila de `recordatorios` de la clinica A. Se crea aqui, se borra aqui,
    // y no la ve ningun otro archivo.
    const db = clienteServicio()
    const { data, error } = await db
      .from('recordatorios')
      .insert({ clinica_id: s.clinicaA, cita_id: s.citaA })
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el recordatorio del aislamiento: ${error.message}`)
    recordatorioA = Number((data as { id: number }).id)
  })

  afterAll(async () => {
    if (recordatorioA) await clienteServicio().from('recordatorios').delete().eq('id', recordatorioA)
  })

  /**
   * LA LISTA DE ARRIBA CONTRA LAS MIGRACIONES, NO CONTRA LA MEMORIA.
   *
   * Sin esto, la proxima tabla que añada una migracion se quedara fuera del
   * barrido igual que se quedo `recordatorios` en F6, y el archivo seguira en
   * verde diciendo que ha comprobado el aislamiento «tabla por tabla».
   */
  it('la lista cubre TODAS las tablas de supabase/migrations', () => {
    const { tablas } = leerEsquema()
    expect(TABLAS.map((t) => t.tabla).sort()).toEqual([...tablas].sort())
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

      // ---------------------------------------------------------------
      // CONTROL POSITIVO. La fila tiene que EXISTIR antes de exigir que no
      // se vea, y se comprueba con un rol DISTINTO del que se esta probando.
      //
      // Sin esta mitad, una lista vacia significa dos cosas a la vez: «la RLS
      // la ha escondido» y «la fila ya no esta». Es el primero de los tres
      // falsos verdes de `.claude/CLAUDE.md` —F1 §5.2, verde por ausencia,
      // porque un test destructivo doce lineas mas arriba habia borrado la
      // fila— y cualquier limpieza de otro archivo que se lleve el fixture
      // por delante lo reproduce sin hacer ruido.
      // ---------------------------------------------------------------
      const { data: existe, error: errorExiste } = await clienteServicio()
        .from(tabla)
        .select('id')
        .eq('id', fila(s))
      expect(errorExiste).toBeNull()
      expect(
        existe ?? [],
        `La fila de ${tabla} que esta prueba dice esconder NO EXISTE. Sin ella, el «no ` +
          'se ve desde B» de abajo es verde por ausencia y no demuestra nada.',
      ).toHaveLength(1)

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
