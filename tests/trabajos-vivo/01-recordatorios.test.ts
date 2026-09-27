/**
 * Los recordatorios contra Postgres de verdad, con Meta simulada.
 *
 * Nivel 2. La base es real —el `unique (clinica_id, cita_id)`, la RLS del rol
 * `bot`, las claves foráneas— y lo único inventado es lo que hay al otro lado
 * del cable, que es lo que no se puede pedir a voluntad.
 *
 * ============ AQUI VIVEN LAS PRUEBAS QUE EL ENCARGO PIDE POR SU NOMBRE ============
 *
 *   1. Un recordatorio no se manda dos veces, NI CON DOS INVOCACIONES
 *      CONCURRENTES. Con sus dos mitades: la secuencial y la concurrente.
 *   5. El cron sin `CRON_SECRET` no ejecuta nada — exigido CONTANDO FILAS.
 *   6. Aislamiento: ningún recordatorio sale con los datos de otra clínica.
 *
 * ============ POR QUE LA CONCURRENTE NO ES UN LUJO ============
 *
 * ESTADO_F4 §5.4 lo midió en el webhook: consultar-y-luego-insertar funciona
 * perfectamente hasta que dos corren a la vez, y entonces nueve de diez se
 * creen nuevas. Y lo que más importa: LA PRUEBA SECUENCIAL SE QUEDA VERDE
 * mientras eso pasa. Por eso están las dos, y por eso la concurrente lanza
 * diez y no dos.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

import { mandarRecordatorios } from '@/lib/trabajos/recordatorios'
import { olvidarMapa } from '@/lib/whatsapp/config'

describeVivo('los recordatorios de cita', () => {
  let s: Sembrado

  /** Lo que habría salido por el cable, con su URL y su cuerpo. */
  type Salida = { url: string; cuerpo: Record<string, unknown> }
  let enviados: Salida[] = []
  let quejas: string[] = []

  /** Meta simulada: acepta y devuelve un wamid distinto cada vez. */
  function metaFalsa(): typeof fetch {
    let n = 0
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      n += 1
      enviados.push({
        url: String(url),
        cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      })
      return new Response(JSON.stringify({ messages: [{ id: `wamid.REC.${n}` }] }), { status: 200 })
    }) as unknown as typeof fetch
  }

  /** Meta que se cae. Para la prueba de que la marca se coge ANTES de mandar. */
  function metaRota(): typeof fetch {
    return vi.fn(async () => {
      enviados.push({ url: 'ROTA', cuerpo: {} })
      return new Response(JSON.stringify({ error: { code: 131000, message: 'algo' } }), {
        status: 500,
      })
    }) as unknown as typeof fetch
  }

  /**
   * LA VENTANA DE ESTAS PRUEBAS ES ESTRECHA, Y NO ES UN DETALLE.
   *
   * En producción son 24 h. Aquí son 3, porque la siembra deja una cita
   * confirmada (`citaA`) «mañana a las 10:00 UTC», y con una ventana de 24 h
   * esa cita entra o no entra SEGUN LA HORA A LA QUE SE LANCE LA SUITE. Con
   * eso, `mandados` valía 1 por la mañana y 2 por la tarde: una batería cuyo
   * número cambia entre dos ejecuciones no demuestra nada (ESTADO_F1 §4).
   *
   * Pasó de verdad al escribir este archivo. Se cazó porque el recuento no
   * cuadraba en la segunda pasada, no porque se hubiera previsto.
   *
   * Lo que se prueba —reclamar, mandar una sola vez, no mezclar clínicas— no
   * depende del ancho de la ventana; el ancho de verdad se comprueba aparte,
   * sin base de datos, en `tests/trabajos/01-reloj.test.ts`.
   */
  const HORAS_DE_VENTANA = 3
  /** Y las citas de prueba se ponen dentro de ella. */
  const DENTRO = 2

  function opciones(fetchDeMeta: typeof fetch, ahora: Date) {
    return {
      envio: { fetch: fetchDeMeta, token: 'TOKEN-DE-PRUEBA', intentos: 1 },
      ahora,
      horasAntes: HORAS_DE_VENTANA,
      registro: {
        info: () => {},
        error: (t: string) => {
          quejas.push(t)
        },
      },
    }
  }

  // ---------------------------------------------------------------------------
  // Fixture: una cita confirmada dentro de la ventana
  // ---------------------------------------------------------------------------

  const creadas: string[] = []

  /** Dentro de N horas, en punto, en un gabinete que la siembra deja libre. */
  async function citaConfirmada(
    clinicaId: string,
    pacienteId: string,
    tratamientoId: string,
    gabineteId: string,
    dentroDeHoras: number,
  ): Promise<{ id: string; inicio: Date }> {
    const inicio = new Date(Date.now() + dentroDeHoras * 3600_000)
    inicio.setUTCMinutes(0, 0, 0)

    const { data, error } = await clienteServicio()
      .from('citas')
      .insert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        tratamiento_id: tratamientoId,
        gabinete_id: gabineteId,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
        estado: 'confirmada',
        quien_reserva: 'bot',
        motivo_cerrado: 'revision',
      } as never)
      .select('id')
      .single()

    if (error) throw new Error(`Sembrando la cita: ${error.message}`)
    const id = (data as { id: string }).id
    creadas.push(id)
    return { id, inicio }
  }

  /**
   * Borra lo que deje cada prueba. `recordatorios` no tiene DELETE por RLS para
   * nadie, así que la limpieza va con `service_role` — el único uso que admite
   * `.claude/CLAUDE.md`.
   *
   * Se borran TODAS las marcas de las dos clínicas de prueba, no solo las de
   * las citas que creó esta prueba: si alguna vez una cita sembrada entrara en
   * la ventana, su marca sobreviviría al `afterEach` y contaminaría el recuento
   * de las pruebas siguientes sin que nadie supiera de dónde salió.
   */
  async function limpiar(): Promise<void> {
    const db = clienteServicio()
    await db.from('recordatorios').delete().in('clinica_id', [s.clinicaA, s.clinicaB])
    if (creadas.length > 0) {
      await db.from('citas').delete().in('id', creadas)
      creadas.length = 0
    }
    await db.from('mensajes').delete().like('texto', '%te recordamos tu cita%')
  }

  beforeAll(() => {
    s = sembrado()
    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      [s.numeroWaA]: s.clinicaA,
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()
  })

  beforeEach(() => {
    enviados = []
    quejas = []
  })

  afterEach(limpiar)

  afterAll(async () => {
    await limpiar()
    delete process.env.WHATSAPP_CLINICAS
    olvidarMapa()
  })

  // ---------------------------------------------------------------------------
  // Que salga uno, para empezar
  // ---------------------------------------------------------------------------

  it('una cita confirmada dentro de la ventana recibe SU recordatorio', async () => {
    const cita = await citaConfirmada(
      s.clinicaA,
      s.pacienteA,
      s.tratamientoAPublico,
      s.gabineteA2,
      DENTRO,
    )

    const resumen = await mandarRecordatorios(
      opciones(metaFalsa(), new Date(cita.inicio.getTime() - DENTRO * 3600_000)),
    )

    expect(quejas, `El trabajo se ha quejado: ${quejas.join(' | ')}`).toEqual([])
    expect(resumen.mandados).toBe(1)
    expect(enviados).toHaveLength(1)

    // Va por PLANTILLA y no por texto libre: la ventana de 24 h de un paciente
    // que pidió cita hace una semana está cerrada, y el texto libre se lo
    // comería Meta con un 131047.
    expect(enviados[0]!.cuerpo.type).toBe('template')
    expect((enviados[0]!.cuerpo.template as { name: string }).name).toBe('recordatorio_cita')

    // Y la marca quedó en la base.
    const { count } = await clienteServicio()
      .from('recordatorios')
      .select('id', { count: 'exact', head: true })
      .eq('cita_id', cita.id)
    expect(count).toBe(1)
  })

  it('el recordatorio queda guardado en `mensajes`, con su wamid', async () => {
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    await mandarRecordatorios(opciones(metaFalsa(), new Date(cita.inicio.getTime() - DENTRO * 3600_000)))

    const { data } = await clienteServicio()
      .from('mensajes')
      .select('rol, texto, wa_message_id, estado_entrega')
      .like('texto', '%te recordamos tu cita%')

    expect(data).toHaveLength(1)
    expect(data![0]!.rol).toBe('bot')
    expect(data![0]!.estado_entrega).toBe('enviado')
    expect(data![0]!.wa_message_id).toMatch(/^wamid\.REC\./)
  })

  it('NI UNA PALABRA DEL MOTIVO DE LA VISITA, ni en el mensaje ni en la marca', async () => {
    // Un WhatsApp no se purga a los 90 días: se queda en el móvil del paciente
    // y en los servidores de Meta para siempre. Es lo mismo que la migración 007
    // sacó de `escalados.resumen` y lo que el aviso al equipo de F4 no lleva.
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    await mandarRecordatorios(opciones(metaFalsa(), new Date(cita.inicio.getTime() - DENTRO * 3600_000)))

    const loQueSalio = JSON.stringify(enviados)
    for (const palabra of ['revision', 'revisión', 'motivo', 'urgencia', 'ortodoncia']) {
      expect(loQueSalio.toLowerCase()).not.toContain(palabra.toLowerCase())
    }

    // Y la tabla de marcas no guarda más que identificadores y una fecha.
    const { data } = await clienteServicio()
      .from('recordatorios')
      .select('*')
      .eq('cita_id', cita.id)
      .single()
    expect(Object.keys(data as object).sort()).toEqual([
      'cita_id',
      'clinica_id',
      'enviado_en',
      'id',
    ])
  })

  // ---------------------------------------------------------------------------
  // 1 · UN RECORDATORIO NO SE MANDA DOS VECES
  // ---------------------------------------------------------------------------

  it('SECUENCIAL: dos pasadas del cron -> UN solo recordatorio', async () => {
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    const ahora = new Date(cita.inicio.getTime() - DENTRO * 3600_000)

    const primera = await mandarRecordatorios(opciones(metaFalsa(), ahora))
    const segunda = await mandarRecordatorios(opciones(metaFalsa(), ahora))

    expect(primera.mandados).toBe(1)
    expect(segunda.mandados).toBe(0)
    expect(segunda.yaEstaban).toBe(1)

    // Lo que importa no es el resumen, es cuántos salieron por el cable.
    expect(enviados).toHaveLength(1)
  })

  it('CONCURRENTE: diez pasadas a la vez -> SIGUE SIENDO UNO', async () => {
    // LA QUE MANDA. La secuencial de arriba se queda VERDE con una
    // implementación que consulte antes de insertar; esta no. Lo midió
    // ESTADO_F4 §5.4 en el webhook: nueve de diez se creyeron nuevas.
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    const ahora = new Date(cita.inicio.getTime() - DENTRO * 3600_000)

    const compartida = metaFalsa()
    const resumenes = await Promise.all(
      Array.from({ length: 10 }, () => mandarRecordatorios(opciones(compartida, ahora))),
    )

    const mandados = resumenes.reduce((n, r) => n + r.mandados, 0)

    expect(
      mandados,
      `Diez invocaciones a la vez han mandado ${mandados} recordatorios. La ` +
        'idempotencia no la está garantizando la base: alguien consulta antes de insertar.',
    ).toBe(1)

    expect(
      enviados,
      `Han salido ${enviados.length} plantillas por el cable para la misma cita.`,
    ).toHaveLength(1)

    const { count } = await clienteServicio()
      .from('recordatorios')
      .select('id', { count: 'exact', head: true })
      .eq('cita_id', cita.id)
    expect(count).toBe(1)
  })

  it('LA MARCA SE COGE ANTES DE MANDAR: si Meta falla, no se reintenta y se grita', async () => {
    // Es el coste escrito en los LÍMITES del contrato, y es deliberado: se
    // prefiere perder un recordatorio a mandar dos. Lo que NO se acepta es que
    // se pierda en silencio.
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    const ahora = new Date(cita.inicio.getTime() - DENTRO * 3600_000)

    const resumen = await mandarRecordatorios(opciones(metaRota(), ahora))

    expect(resumen.mandados).toBe(0)
    expect(resumen.fallidos).toBe(1)
    expect(quejas.join(' ')).toContain('no se reintentara')

    // La marca está puesta, así que la pasada siguiente NO lo vuelve a intentar.
    const segunda = await mandarRecordatorios(opciones(metaFalsa(), ahora))
    expect(segunda.mandados).toBe(0)
    expect(segunda.yaEstaban).toBe(1)

    // Y el fallo quedó donde la clínica lo ve.
    const { data } = await clienteServicio()
      .from('eventos')
      .select('tipo, datos')
      .eq('clinica_id', s.clinicaA)
      .eq('tipo', 'recordatorio_fallido')
    expect(data?.length).toBeGreaterThan(0)
    await clienteServicio().from('eventos').delete().eq('tipo', 'recordatorio_fallido')
  })

  // ---------------------------------------------------------------------------
  // 6 · AISLAMIENTO
  // ---------------------------------------------------------------------------

  it('NINGUN RECORDATORIO SALE CON LOS DATOS DE OTRA CLINICA', async () => {
    // Un cron recorre inquilinos en un bucle, que es justo donde se mezclan.
    const enA = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    const enB = await citaConfirmada(s.clinicaB, s.pacienteB, s.tratamientoBPublico, s.gabineteB1, DENTRO)

    await mandarRecordatorios(opciones(metaFalsa(), new Date(enA.inicio.getTime() - DENTRO * 3600_000)))

    expect(enviados).toHaveLength(2)

    const porNumero = new Map(
      enviados.map((e) => [e.url.includes(s.numeroWaA) ? 'A' : 'B', e] as const),
    )

    const deA = porNumero.get('A')!
    const deB = porNumero.get('B')!

    // Cada uno sale POR EL NUMERO DE SU CLINICA...
    expect(deA.url).toContain(s.numeroWaA)
    expect(deB.url).toContain(s.numeroWaB)

    // ...AL TELEFONO DE SU PACIENTE...
    expect(deA.cuerpo.to).toBe('34600111222')
    expect(deB.cuerpo.to).toBe('34600333444')

    // ...Y CON EL NOMBRE DE SU CLINICA DENTRO.
    const textoDeA = JSON.stringify(deA.cuerpo)
    const textoDeB = JSON.stringify(deB.cuerpo)

    expect(textoDeA).toContain('Clinica de prueba A')
    expect(textoDeA).not.toContain('Clinica de prueba B')
    expect(textoDeB).toContain('Clinica de prueba B')
    expect(textoDeB).not.toContain('Clinica de prueba A')

    // Y el identificador del botón es el de SU cita, no el de la otra.
    expect(textoDeA).toContain(enA.id)
    expect(textoDeA).not.toContain(enB.id)
    expect(textoDeB).toContain(enB.id)
  })

  it('una clinica que falla no deja sin recordatorio a las demas', async () => {
    // Un `throw` en el bucle convertiría un problema de configuración de una
    // clínica en una caída de todas.
    const enB = await citaConfirmada(s.clinicaB, s.pacienteB, s.tratamientoBPublico, s.gabineteB1, DENTRO)

    // Una clínica del mapa que no existe en la base: `exigirClinicaDelCanal`
    // lanzará al no encontrar su fila.
    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      '900000000000009': '00000000-0000-4000-8000-000000000009',
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()

    const resumen = await mandarRecordatorios(
      opciones(metaFalsa(), new Date(enB.inicio.getTime() - DENTRO * 3600_000)),
    )

    expect(resumen.clinicas).toBe(2)
    expect(resumen.mandados).toBe(1)
    expect(resumen.porClinica.find((c) => c.error !== undefined)).toBeDefined()
    expect(quejas.join(' ')).toContain('se queda sin recordatorios')

    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      [s.numeroWaA]: s.clinicaA,
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()
  })

  // ---------------------------------------------------------------------------
  // A quien NO se le manda
  // ---------------------------------------------------------------------------

  it('a una cita PROVISIONAL no se le manda nada', async () => {
    // Una provisional es una retención de diez minutos. Si llegara viva a las
    // veinticuatro horas sería que `liberar_provisionales` no está corriendo, y
    // mandarle un recordatorio a alguien que nunca confirmó es prometerle un
    // hueco que la agenda va a soltar.
    const inicio = new Date(Date.now() + DENTRO * 3600_000)
    inicio.setUTCMinutes(0, 0, 0)
    const { data } = await clienteServicio()
      .from('citas')
      .insert({
        clinica_id: s.clinicaA,
        paciente_id: s.pacienteA,
        tratamiento_id: s.tratamientoAPublico,
        gabinete_id: s.gabineteA2,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
        estado: 'provisional',
        expira_en: new Date(Date.now() + 600_000).toISOString(),
        quien_reserva: 'bot',
        motivo_cerrado: 'revision',
      } as never)
      .select('id')
      .single()
    creadas.push((data as { id: string }).id)

    const resumen = await mandarRecordatorios(
      opciones(metaFalsa(), new Date(inicio.getTime() - DENTRO * 3600_000)),
    )

    expect(resumen.mandados).toBe(0)
    expect(enviados).toHaveLength(0)
  })

  it('a una cita fuera de la ventana tampoco', async () => {
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, 40)

    // `ahora` cuarenta horas antes: la ventana de 24 h no llega.
    const resumen = await mandarRecordatorios(
      opciones(metaFalsa(), new Date(cita.inicio.getTime() - 40 * 3600_000)),
    )

    expect(resumen.mandados).toBe(0)
    expect(enviados).toHaveLength(0)
  })

  it('a una cita que YA EMPEZO tampoco: no se recuerda el pasado', async () => {
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)

    // `ahora` una hora DESPUES del comienzo.
    const resumen = await mandarRecordatorios(
      opciones(metaFalsa(), new Date(cita.inicio.getTime() + 3600_000)),
    )

    expect(resumen.mandados).toBe(0)
    expect(enviados).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // 5 · EL CRON SIN SECRETO NO EJECUTA NADA — CONTANDO FILAS
  // ---------------------------------------------------------------------------

  it('SIN CRON_SECRET la ruta no crea NI UNA FILA (contado, no supuesto)', async () => {
    const { GET } = await import('@/app/api/cron/recordatorios/route')
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)

    vi.stubEnv('CRON_SECRET', 'el-secreto-de-verdad')

    const respuesta = await GET(
      new Request('https://ejemplo.test/api/cron/recordatorios', {
        headers: { authorization: 'Bearer el-de-otro' },
      }),
    )

    expect(respuesta.status).toBe(401)

    // LO QUE DE VERDAD IMPORTA. Un 401 que igualmente ejecutara el trabajo
    // pasaría una prueba que solo mirase el número.
    const { count } = await clienteServicio()
      .from('recordatorios')
      .select('id', { count: 'exact', head: true })
      .eq('cita_id', cita.id)

    expect(
      count,
      'La ruta ha devuelto 401 y ha mandado el recordatorio igualmente.',
    ).toBe(0)

    vi.unstubAllEnvs()
  })

  // ---------------------------------------------------------------------------
  // Lo que ve el bot, que es lo que la RLS le deja ver
  // ---------------------------------------------------------------------------

  it('el bot de B no ve NI UNA marca de A', async () => {
    const enA = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    await mandarRecordatorios(opciones(metaFalsa(), new Date(enA.inicio.getTime() - DENTRO * 3600_000)))

    const { data } = await clienteBot(s.clinicaB).from('recordatorios').select('id, cita_id')

    expect((data ?? []).map((f) => f.cita_id)).not.toContain(enA.id)
  })

  it('el bot no puede BORRAR una marca: la idempotencia no se puede deshacer', async () => {
    // Si el bot pudiera borrar aquí, cualquier fallo lo dejaría todo listo para
    // mandar el recordatorio otra vez. `recordatorios` no tiene política de
    // DELETE para nadie, a propósito.
    const cita = await citaConfirmada(s.clinicaA, s.pacienteA, s.tratamientoAPublico, s.gabineteA2, DENTRO)
    await mandarRecordatorios(opciones(metaFalsa(), new Date(cita.inicio.getTime() - DENTRO * 3600_000)))

    const bot = clienteBot(s.clinicaA)
    const { data } = await bot.from('recordatorios').delete().eq('cita_id', cita.id).select('id')
    expect(data ?? []).toEqual([])

    // Y sigue ahí: la prueba de que el borrado no funcionó, no de que no había nada.
    const { count } = await clienteServicio()
      .from('recordatorios')
      .select('id', { count: 'exact', head: true })
      .eq('cita_id', cita.id)
    expect(count).toBe(1)
  })
})
