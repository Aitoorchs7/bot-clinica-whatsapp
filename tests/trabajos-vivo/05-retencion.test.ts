/**
 * La comprobación de que la purga está limpiando, y de que la clínica lo ve.
 *
 * Nivel 2. No borra nada: cuenta lo que no debería quedar y deja el recuento
 * en `eventos`, que es lo que lee la pantalla de observabilidad del panel.
 *
 * ============ POR QUE ESTO NO ES UN ADORNO ============
 *
 * Un job de `pg_cron` puede desaparecer sin romper nada visible: alguien lo
 * desprograma, una restauración se lleva `cron.job`, o la función empieza a
 * morir por `statement_timeout`. El sistema sigue contestando por WhatsApp
 * perfectamente y lo único que pasa es que las conversaciones de los pacientes
 * dejan de borrarse — que es lo que sostiene por escrito que este sistema no
 * trata datos de salud.
 *
 * Lo que se comprueba aquí es que ese silencio se acaba: que el número sale, y
 * que sale DONDE LA CLINICA LO VE y no solo en un registro que nadie lee.
 */
import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

import { comprobarLaRetencion } from '@/lib/trabajos/retencion'
import { olvidarMapa } from '@/lib/whatsapp/config'

const DIA = 24 * 3600_000

describeVivo('la retencion se comprueba y se deja escrita', () => {
  let s: Sembrado
  let quejas: string[] = []
  const plantados: number[] = []

  function opciones() {
    return {
      registro: {
        info: () => {},
        error: (t: string) => {
          quejas.push(t)
        },
      },
    }
  }

  beforeAll(() => {
    s = sembrado()
    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      [s.numeroWaA]: s.clinicaA,
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()
  })

  afterEach(async () => {
    const db = clienteServicio()
    if (plantados.length > 0) {
      await db.from('mensajes').delete().in('id', plantados)
      plantados.length = 0
    }
    await db.from('eventos').delete().eq('tipo', 'retencion')
    quejas = []
  })

  afterAll(() => {
    delete process.env.WHATSAPP_CLINICAS
    olvidarMapa()
  })

  it('con la purga al dia: todo a cero, y queda anotado IGUALMENTE', async () => {
    const resumen = await comprobarLaRetencion(opciones())

    expect(resumen.clinicas).toBe(2)
    expect(resumen.alDia).toBe(true)
    expect(quejas).toEqual([])

    // El apunte se deja SIEMPRE, no solo cuando algo va mal. Un registro que
    // solo aparece cuando hay problema no distingue «todo bien» de «esto no se
    // ha comprobado nunca», que es justo la distinción que la pantalla de
    // observabilidad existe para no tener que adivinar.
    const { data } = await clienteServicio()
      .from('eventos')
      .select('clinica_id, tipo, datos')
      .eq('tipo', 'retencion')

    expect(data).toHaveLength(2)
    expect((data![0]!.datos as { al_dia: boolean }).al_dia).toBe(true)
  })

  it('CON ALGO SIN PURGAR: lo cuenta, lo grita y lo deja donde la clinica lo ve', async () => {
    const { data, error } = await clienteServicio()
      .from('mensajes')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: s.conversacionA,
        rol: 'paciente',
        texto: 'esto tenia que haberse borrado hace meses',
        creado_en: new Date(Date.now() - 200 * DIA).toISOString(),
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el mensaje viejo: ${error.message}`)
    plantados.push(Number((data as { id: number }).id))

    const resumen = await comprobarLaRetencion(opciones())

    expect(resumen.alDia).toBe(false)

    const deA = resumen.porClinica.find((c) => c.clinicaId === s.clinicaA)!
    expect(deA.sobrante.mensajes).toBeGreaterThanOrEqual(1)
    expect(deA.alDia).toBe(false)

    // Se grita, y el grito dice qué hay que mirar.
    expect(quejas.join(' ')).toContain('NO ESTA LIMPIANDO')
    expect(quejas.join(' ')).toContain('purgar-historial-90-dias')

    // Y la clínica puede verlo: el apunte está en `eventos`, que su propio rol
    // puede leer.
    const { data: visto } = await clienteBot(s.clinicaA)
      .from('eventos')
      .select('tipo, datos')
      .eq('tipo', 'retencion')

    expect(visto).toHaveLength(1)
    expect((visto![0]!.datos as { al_dia: boolean }).al_dia).toBe(false)
  })

  it('la clinica B no ve lo de A, ni en sus numeros ni en sus apuntes', async () => {
    const { data, error } = await clienteServicio()
      .from('mensajes')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: s.conversacionA,
        rol: 'paciente',
        texto: 'solo de A',
        creado_en: new Date(Date.now() - 200 * DIA).toISOString(),
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando: ${error.message}`)
    plantados.push(Number((data as { id: number }).id))

    const resumen = await comprobarLaRetencion(opciones())

    // Cada clínica cuenta LO SUYO, porque cuenta con su propio cliente y la RLS
    // decide qué filas ve. Si esto contara con `service_role`, las dos verían
    // el mismo número y el de B sería mentira.
    expect(resumen.porClinica.find((c) => c.clinicaId === s.clinicaA)!.alDia).toBe(false)
    expect(resumen.porClinica.find((c) => c.clinicaId === s.clinicaB)!.alDia).toBe(true)

    const { data: deB } = await clienteBot(s.clinicaB)
      .from('eventos')
      .select('datos')
      .eq('tipo', 'retencion')

    expect(deB).toHaveLength(1)
    expect((deB![0]!.datos as { sobrante: { mensajes: number } }).sobrante.mensajes).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // LA RUTA, no solo la funcion
  // ---------------------------------------------------------------------------
  //
  // Todo lo de arriba comprueba `comprobarLaRetencion()`. Quien vigila esto en
  // produccion no llama a una funcion: llama a una URL y mira el codigo de
  // estado. Si la ruta contestara 200 con la base sucia, la purga podria llevar
  // semanas parada con el panel de Vercel entero en verde.

  /** Planta un mensaje mas viejo que el plazo de retencion. */
  async function mensajeSinPurgar(): Promise<void> {
    const { data, error } = await clienteServicio()
      .from('mensajes')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: s.conversacionA,
        rol: 'paciente',
        texto: 'esto tenia que haberse borrado',
        creado_en: new Date(Date.now() - 200 * DIA).toISOString(),
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el mensaje viejo: ${error.message}`)
    plantados.push(Number((data as { id: number }).id))
  }

  function pedir(cabeceras: Record<string, string>) {
    return import('@/app/api/cron/retencion/route').then(({ GET }) =>
      GET(new Request('https://ejemplo.test/api/cron/retencion', { headers: cabeceras })),
    )
  }

  const AUTORIZADO = { authorization: 'Bearer secreto-de-retencion' }

  it('LA RUTA ALERTA: con la purga sin ejecutar NO contesta 200', async () => {
    // La prueba que pidió el encargo por su nombre. La primera versión de esta
    // ruta devolvía 200 aquí y dejaba la alarma solo en el cuerpo y en el
    // registro; con eso, un job de pg_cron parado no se distingue de uno sano.
    vi.stubEnv('CRON_SECRET', 'secreto-de-retencion')
    await mensajeSinPurgar()

    const respuesta = await pedir(AUTORIZADO)
    const cuerpo = (await respuesta.json()) as { alDia: boolean }

    expect(
      respuesta.status,
      'La ruta ha contestado 200 con mensajes sin purgar. Quien vigila un cron ' +
        'mira el código de estado: así la purga puede llevar semanas parada y ' +
        'el panel de Vercel seguir verde.',
    ).toBe(500)

    expect(cuerpo.alDia).toBe(false)
    vi.unstubAllEnvs()
  })

  it('LA PAREJA: con todo limpio SÍ contesta 200', async () => {
    // Sin esta, la de arriba pasaría con una ruta que devolviera 500 siempre —y
    // entonces la alarma sonaría todas las noches y se dejaría de mirar, que es
    // la peor cosa que le puede pasar a una alarma.
    vi.stubEnv('CRON_SECRET', 'secreto-de-retencion')

    const respuesta = await pedir(AUTORIZADO)
    const cuerpo = (await respuesta.json()) as { alDia: boolean }

    expect(respuesta.status).toBe(200)
    expect(cuerpo.alDia).toBe(true)
    vi.unstubAllEnvs()
  })

  it('LAS TRES RESPUESTAS SON DISTINTAS: limpio, sucio y «no he podido mirar»', async () => {
    // «Está sucio» y «no he podido comprobarlo» significan cosas opuestas: lo
    // primero exige que alguien toque pg_cron, lo segundo se arregla solo. Un
    // `try { … } catch { mal }` las juntaría, y es justo lo que
    // `/api/cron/salud` tiene prohibido desde que se escribió.
    vi.stubEnv('CRON_SECRET', 'secreto-de-retencion')

    const limpio = (await pedir(AUTORIZADO)).status

    await mensajeSinPurgar()
    const sucio = (await pedir(AUTORIZADO)).status

    // Una clínica del mapa que no existe en la base: no se puede comprobar.
    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      '900000000000009': '00000000-0000-4000-8000-000000000009',
    })
    olvidarMapa()
    const sinMirar = (await pedir(AUTORIZADO)).status

    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      [s.numeroWaA]: s.clinicaA,
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()
    vi.unstubAllEnvs()

    expect([limpio, sucio, sinMirar]).toEqual([200, 500, 503])
    expect(new Set([limpio, sucio, sinMirar]).size).toBe(3)
  })

  it('SIN el secreto no contesta ni mira: 401 aunque la base este sucia', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-de-retencion')
    await mensajeSinPurgar()

    const respuesta = await pedir({ authorization: 'Bearer el-de-otro' })

    expect(respuesta.status).toBe(401)
    // Y no ha dejado apunte: un 401 no ejecuta el trabajo.
    const { count } = await clienteServicio()
      .from('eventos')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'retencion')
    expect(count).toBe(0)
    vi.unstubAllEnvs()
  })

  it('el apunte lleva NUMEROS, nunca una palabra de lo que escribio nadie', async () => {
    const marcador = 'ANTICOAGULANTES-DESDE-ENERO'
    const { data, error } = await clienteServicio()
      .from('mensajes')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: s.conversacionA,
        rol: 'paciente',
        texto: marcador,
        creado_en: new Date(Date.now() - 200 * DIA).toISOString(),
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando: ${error.message}`)
    plantados.push(Number((data as { id: number }).id))

    await comprobarLaRetencion(opciones())

    const { data: apuntes } = await clienteServicio()
      .from('eventos')
      .select('datos')
      .eq('tipo', 'retencion')

    // `eventos` no la purga el job de los 90 días: lo que se escriba aquí se
    // queda. Es el mismo motivo por el que `auditoria` no copia el contenido
    // dentro (ESTADO_F5 §2) y por el que el aviso al equipo no lleva el síntoma.
    expect(JSON.stringify(apuntes)).not.toContain(marcador)
    expect(quejas.join(' ')).not.toContain(marcador)
  })
})
