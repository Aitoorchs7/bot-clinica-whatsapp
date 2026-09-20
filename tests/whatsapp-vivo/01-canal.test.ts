/**
 * El canal entero contra Supabase de verdad, con Meta y Gemini simulados.
 *
 * Nivel 2, igual que `tests/bot-vivo/` en F3: la base es real —las politicas
 * RLS, los indices unicos y las claves foraneas corren de verdad— y lo unico
 * que se inventa es lo que hay al otro lado del cable, que es lo que no se
 * puede pedir a voluntad.
 *
 * AQUI VIVEN LAS CUATRO PRUEBAS QUE EL ENCARGO PIDE POR SU NOMBRE
 *
 *   2. El mismo `wa_event_id` dos veces -> UNA sola fila
 *   3. Cuatro mensajes seguidos -> UNA respuesta que tiene en cuenta los cuatro
 *   4. Una escalacion deja `escalados.mensaje_id` apuntando al mensaje CORRECTO
 *
 * (La 1 —firma invalida 401, valida 200— no necesita base y esta en
 * `tests/whatsapp/07-webhook.test.ts`.)
 *
 * POR QUE NO SE SIMULA LA BASE
 *
 * Porque lo que se quiere comprobar ES la base: que el indice unico de
 * `eventos_webhook` para el duplicado, que la clave foranea de
 * `escalados.mensaje_id` acepta el id, que la RLS del rol `bot` deja escribir
 * en `mensajes`. Un doble de Supabase diria que si a todo.
 */
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

import { anotarEvento, costeEur, guardarMensaje } from '@/lib/whatsapp/almacen'
import { agrupar, concatenar } from '@/lib/whatsapp/agrupar'
import { olvidarMapa } from '@/lib/whatsapp/config'
import { procesarMensaje } from '@/lib/whatsapp/procesar'
import type { Entrante } from '@/lib/whatsapp/botones'
import type { Modelo, Respuesta } from '@/lib/bot/gemini'

describeVivo('el canal de WhatsApp', () => {
  let s: Sembrado
  const TELEFONO = '+34600777888'

  /** Meta simulada: siempre acepta y devuelve un wamid distinto. */
  let enviados: { cuerpo: Record<string, unknown> }[] = []
  function metaFalsa(): typeof fetch {
    let n = 0
    return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      n += 1
      enviados.push({ cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      return new Response(JSON.stringify({ messages: [{ id: `wamid.SAL.${n}` }] }), { status: 200 })
    }) as unknown as typeof fetch
  }

  /** Un modelo que contesta lo que se le diga, sin pedir herramientas. */
  function modeloQueDice(texto: string, tokens = { entrada: 100, salida: 40 }): Modelo {
    return async (): Promise<Respuesta> => ({
      texto,
      llamadas: [],
      tokensEntrada: tokens.entrada,
      tokensSalida: tokens.salida,
    })
  }

  /** El clasificador no escala salvo que se le pida. */
  const clasificadorTranquilo: Modelo = async () => ({
    texto: JSON.stringify({ intencion: 'cita', urgencia: 'ninguna', escalar: false }),
    llamadas: [],
  })

  function entrante(texto: string, wamid: string): Entrante {
    return {
      waMessageId: wamid,
      phoneNumberId: s.numeroWaA,
      telefono: TELEFONO,
      clase: 'texto',
      texto,
      nombrePerfil: 'Lucia',
    }
  }

  /**
   * Las opciones comunes: sin red de verdad y sin esperar 8 segundos.
   *
   * El registro GUARDA los errores en vez de tirarlos. `procesar.ts` se traga a
   * proposito los fallos de envio —un error ahi haria que Meta reintentara el
   * webhook y el paciente recibiria todo dos veces—, asi que sin esto una
   * prueba podria quedarse verde con el envio roto del todo.
   */
  let quejas: string[] = []
  function opciones(modelo: Modelo) {
    return {
      modelo,
      modeloClasificador: clasificadorTranquilo,
      envio: { fetch: metaFalsa(), token: 'TOKEN-DE-PRUEBA' },
      esperaMs: 0,
      registro: {
        info: () => {},
        error: (texto: string) => {
          quejas.push(texto)
        },
      },
    }
  }

  async function limpiarConversacion(): Promise<void> {
    const db = clienteServicio()
    await db.from('conversaciones').delete().eq('telefono_e164', TELEFONO)
    await db.from('eventos_webhook').delete().eq('clinica_id', s.clinicaA).like('wa_event_id', 'prueba:%')
  }

  beforeAll(async () => {
    s = sembrado()
    // El mapa que dice de que clinica es cada numero. En produccion sale de
    // `WHATSAPP_CLINICAS`; aqui se arma con los ids que acaba de sembrar.
    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      [s.numeroWaA]: s.clinicaA,
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()
    await limpiarConversacion()
  })

  beforeEach(() => {
    enviados = []
    quejas = []
  })

  afterAll(async () => {
    await limpiarConversacion()
    delete process.env.WHATSAPP_CLINICAS
    olvidarMapa()
  })

  // -------------------------------------------------------------------------
  // Un mensaje de punta a punta
  // -------------------------------------------------------------------------

  it('un mensaje entra, una respuesta sale, y LAS DOS quedan guardadas', async () => {
    const salida = await procesarMensaje(
      entrante('hola, querria pedir cita', 'wamid.E2E.1'),
      opciones(modeloQueDice('Hola, claro. ¿Qué día te viene bien?')),
    )

    expect(salida.hecho).toBe('contestado')

    const db = clienteServicio()
    // Por la conversacion, no por el texto: la siembra deja mensajes suyos en
    // esta misma clinica y un filtro por palabras cogeria los de otro hilo.
    const { data: conversacion } = await db
      .from('conversaciones')
      .select('id')
      .eq('telefono_e164', TELEFONO)
      .single()

    const { data } = await db
      .from('mensajes')
      .select('rol, texto, wa_message_id, estado_entrega, tokens_in, tokens_out, coste_eur')
      .eq('conversacion_id', conversacion!.id)
      .order('id')

    const mios = data ?? []
    const entrada = mios.find((m) => m.rol === 'paciente')
    const respuesta = mios.find((m) => m.rol === 'bot')

    // El entrante: con su wa_message_id, que es lo que lo ata al webhook.
    expect(entrada).toMatchObject({
      texto: 'hola, querria pedir cita',
      wa_message_id: 'wamid.E2E.1',
      estado_entrega: 'entregado',
    })

    // El saliente: con el wamid que devolvio Meta, tokens y coste. Requisito
    // del cliente, no un extra.
    expect(respuesta).toMatchObject({ wa_message_id: 'wamid.SAL.1', estado_entrega: 'enviado' })
    expect(respuesta?.tokens_in).toBeGreaterThan(0)
    expect(respuesta?.tokens_out).toBeGreaterThan(0)
    expect(respuesta?.coste_eur).not.toBeNull()

    // Y salio por el cable de verdad, con el telefono sin `+`.
    expect(enviados).toHaveLength(1)
    expect(enviados[0]?.cuerpo).toMatchObject({ type: 'text', to: '34600777888' })
  })

  it('la ventana de 24 h queda escrita en la conversacion', async () => {
    const db = clienteServicio()
    const { data } = await db
      .from('conversaciones')
      .select('ventana_24h_expira')
      .eq('telefono_e164', TELEFONO)
      .single()

    expect(data?.ventana_24h_expira).not.toBeNull()
    const expira = new Date(data!.ventana_24h_expira!).getTime()
    const dentroDe24h = Date.now() + 24 * 3_600_000
    // Con un minuto de holgura: lo que importa es que son ~24 h, no 30 s.
    expect(Math.abs(expira - dentroDe24h)).toBeLessThan(60_000)
  })

  it('el markdown NO llega al paciente', async () => {
    await procesarMensaje(
      entrante('¿y el jueves?', 'wamid.E2E.MD'),
      opciones(modeloQueDice('Te espero el **jueves** a las **12:00**.')),
    )

    const texto = (enviados.at(-1)?.cuerpo.text as { body: string }).body
    expect(texto).not.toContain('**')
    expect(texto).toContain('*jueves*')
  })

  // -------------------------------------------------------------------------
  // 2 · Idempotencia: el mismo wa_event_id dos veces
  // -------------------------------------------------------------------------

  it('EL MISMO wa_event_id DOS VECES deja UNA sola fila', async () => {
    const evento = `prueba:${Date.now()}`

    const primera = await anotarEvento(s.clinicaA, evento, { hola: 1 }, clienteBot(s.clinicaA))
    const segunda = await anotarEvento(s.clinicaA, evento, { hola: 1 }, clienteBot(s.clinicaA))

    expect(primera.nuevo).toBe(true)
    expect(segunda.nuevo).toBe(false)

    // Contado con service_role desde fuera, no preguntandole al que escribe.
    const db = clienteServicio()
    const { count } = await db
      .from('eventos_webhook')
      .select('id', { count: 'exact', head: true })
      .eq('clinica_id', s.clinicaA)
      .eq('wa_event_id', evento)

    expect(count).toBe(1)
  })

  it('LO GARANTIZA LA BASE: diez a la vez y sigue habiendo una', async () => {
    // Esta es la que de verdad importa. Una comprobacion en memoria pasaria la
    // de arriba —dos llamadas seguidas— y fallaria aqui, que es el caso real:
    // Meta reintenta y dos invocaciones serverless no comparten memoria.
    const evento = `prueba:concurrente:${Date.now()}`

    const resultados = await Promise.all(
      Array.from({ length: 10 }, () =>
        anotarEvento(s.clinicaA, evento, { x: 1 }, clienteBot(s.clinicaA)),
      ),
    )

    expect(resultados.filter((r) => r.nuevo)).toHaveLength(1)

    const db = clienteServicio()
    const { count } = await db
      .from('eventos_webhook')
      .select('id', { count: 'exact', head: true })
      .eq('clinica_id', s.clinicaA)
      .eq('wa_event_id', evento)

    expect(count).toBe(1)
  })

  it('un mensaje con el mismo wa_message_id tampoco se guarda dos veces', async () => {
    // La segunda linea de idempotencia, por debajo de `eventos_webhook`.
    const db = clienteServicio()
    const { data: conversacion } = await db
      .from('conversaciones')
      .select('id')
      .eq('telefono_e164', TELEFONO)
      .single()

    const wamid = `wamid.DUP.${Date.now()}`
    const base = {
      clinicaId: s.clinicaA,
      conversacionId: conversacion!.id,
      rol: 'paciente' as const,
      texto: 'duplicado',
      waMessageId: wamid,
    }

    expect(await guardarMensaje(base, clienteBot(s.clinicaA))).toBeTypeOf('number')
    expect(await guardarMensaje(base, clienteBot(s.clinicaA))).toBeNull()

    const { count } = await db
      .from('mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('clinica_id', s.clinicaA)
      .eq('wa_message_id', wamid)

    expect(count).toBe(1)
  })

  // -------------------------------------------------------------------------
  // 3 · El debounce
  // -------------------------------------------------------------------------

  it('CUATRO MENSAJES SEGUIDOS -> UNA respuesta, que tiene en cuenta los cuatro', async () => {
    await limpiarConversacion()

    const cuatro = ['hola', 'queria cita', 'para el jueves', 'por la tarde']
    let vioElModelo = ''

    const modelo: Modelo = async (peticion) => {
      // Lo que de verdad llego al modelo, no lo que creemos que llego.
      vioElModelo = peticion.turnos
        .flatMap((t) => t.partes)
        .map((p) => (p.tipo === 'texto' ? p.texto : ''))
        .join('\n')
      return { texto: 'Te puedo dar hueco el jueves por la tarde.', llamadas: [], tokensEntrada: 10, tokensSalida: 5 }
    }

    // Los cuatro llegan «a la vez», como en WhatsApp de verdad.
    const resultados = await Promise.all(
      cuatro.map((texto, i) =>
        procesarMensaje(entrante(texto, `wamid.GRUPO.${Date.now()}.${i}`), {
          ...opciones(modelo),
          // Una espera corta pero real: sin ella las cuatro ramas se
          // resolverian sin llegar a verse, que es justo lo que no se quiere
          // comprobar.
          esperaMs: 300,
        }),
      ),
    )

    // UNA contesta, las otras se agrupan.
    const contestadas = resultados.filter((r) => r.hecho === 'contestado')
    const agrupadas = resultados.filter((r) => r.hecho === 'agrupado')

    expect(contestadas).toHaveLength(1)
    expect(agrupadas).toHaveLength(3)

    // UN solo mensaje sale por el cable.
    expect(enviados).toHaveLength(1)

    // Y TIENE EN CUENTA LOS CUATRO: los cuatro textos llegaron al modelo.
    for (const texto of cuatro) expect(vioElModelo).toContain(texto)

    // Y en la base hay cuatro del paciente y UNA del bot.
    const db = clienteServicio()
    const { data: conversacion } = await db
      .from('conversaciones')
      .select('id')
      .eq('telefono_e164', TELEFONO)
      .single()
    const { data } = await db
      .from('mensajes')
      .select('rol')
      .eq('conversacion_id', conversacion!.id)

    expect((data ?? []).filter((m) => m.rol === 'paciente')).toHaveLength(4)
    expect((data ?? []).filter((m) => m.rol === 'bot')).toHaveLength(1)
  })

  it('«el mas reciente» se decide contra la BASE, no en memoria', async () => {
    // Si se decidiera con una variable de modulo, esta llamada —que no sabe
    // nada de las anteriores— se creeria la ultima y contestaria.
    await limpiarConversacion()

    const db = clienteServicio()
    const bot = clienteBot(s.clinicaA)

    const { data: conversacion } = await bot
      .from('conversaciones')
      .insert({ clinica_id: s.clinicaA, telefono_e164: TELEFONO, estado: 'abierta' })
      .select('id')
      .single()

    const viejo = await guardarMensaje(
      { clinicaId: s.clinicaA, conversacionId: conversacion!.id, rol: 'paciente', texto: 'uno' },
      bot,
    )
    const nuevo = await guardarMensaje(
      { clinicaId: s.clinicaA, conversacionId: conversacion!.id, rol: 'paciente', texto: 'dos' },
      bot,
    )

    const delViejo = await agrupar(s.clinicaA, conversacion!.id, viejo!, { cliente: bot, esperaMs: 0 })
    const delNuevo = await agrupar(s.clinicaA, conversacion!.id, nuevo!, { cliente: bot, esperaMs: 0 })

    expect(delViejo.meToca).toBe(false)
    expect(delNuevo.meToca).toBe(true)
    expect(delNuevo.textos).toEqual(['uno', 'dos'])

    await db.from('conversaciones').delete().eq('id', conversacion!.id)
  })

  it('los mensajes agrupados se unen por lineas, no pegados', () => {
    expect(concatenar(['hola', 'queria cita'])).toBe('hola\nqueria cita')
    expect(concatenar(['hola', '  ', 'dos'])).toBe('hola\ndos')
  })

  // -------------------------------------------------------------------------
  // 4 · El escalado y su mensaje_id
  // -------------------------------------------------------------------------

  it('UNA ESCALACION DEJA `escalados.mensaje_id` APUNTANDO AL MENSAJE CORRECTO', async () => {
    await limpiarConversacion()

    // El clasificador corta por urgencia con su capa 1, sin red: «me duele»
    // es una de las cuatro reglas duras de `.claude/CLAUDE.md`.
    const texto = 'me duele mucho una muela desde anoche'

    // Con proveedor de correo configurado: asi se ejercitan las DOS vias del
    // aviso al equipo, no solo la de WhatsApp.
    process.env.RESEND_API_KEY = 'clave-de-prueba'
    process.env.EMAIL_REMITENTE = 'bot@ejemplo.test'
    const correos: { destino: unknown; cuerpo: string }[] = []
    const fetchEmail = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const enviado = JSON.parse(String(init?.body ?? '{}')) as { to: unknown }
      correos.push({ destino: enviado.to, cuerpo: String(init?.body ?? '') })
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch

    const salida = await procesarMensaje(entrante(texto, `wamid.ESC.${Date.now()}`), {
      ...opciones(modeloQueDice('no deberia llamarse al cerebro')),
      fetchEmail,
    })

    expect(salida.hecho).toBe('contestado')
    if (salida.hecho !== 'contestado') return

    expect(salida.respuesta.escalado).toBe(true)
    expect(salida.respuesta.cortadoAntesDelCerebro).toBe(true)

    // Al paciente le llega el mensaje seguro CON el telefono de la clinica.
    // Se comprueba aqui y no en un `it` aparte: `enviados` se vacia entre
    // pruebas, y una asercion sobre una lista vacia pasa sola.
    // Si el envio se hubiera caido, `procesar.ts` lo habria tragado: se mira.
    expect(quejas).toEqual([])
    // El de texto es el del paciente; el de plantilla, el del equipo. Coger
    // `at(-1)` cogeria el del equipo y la prueba diria otra cosa.
    const alPaciente =
      (enviados.find((e) => e.cuerpo.type === 'text')?.cuerpo.text as { body: string } | undefined)
        ?.body ?? ''
    expect(alPaciente).not.toBe('')
    expect(alPaciente).toContain('+34910000001')

    // Se lee con service_role desde fuera: no se le pregunta al que escribio.
    const db = clienteServicio()
    const { data: conversacion } = await db
      .from('conversaciones')
      .select('id')
      .eq('telefono_e164', TELEFONO)
      .single()

    const { data: filas } = await db
      .from('escalados')
      .select('id, mensaje_id, motivo, asunto')
      .eq('conversacion_id', conversacion!.id)

    expect(filas).toHaveLength(1)
    const fila = filas![0]!

    // NO «no es null»: el id CORRECTO. Apuntar al mensaje equivocado pasaria
    // igual una asercion de «no nulo», y es el FALLO #5 del contrato.
    expect(fila.mensaje_id).toBe(salida.mensajeId)

    // Y ese mensaje es el que escribio el paciente, no la respuesta del bot.
    const { data: apuntado } = await db
      .from('mensajes')
      .select('rol, texto')
      .eq('id', fila.mensaje_id!)
      .single()

    expect(apuntado).toMatchObject({ rol: 'paciente', texto })

    // EL EQUIPO SE ENTERA POR LAS DOS VIAS.
    expect(correos).toHaveLength(1)
    expect(correos[0]?.destino).toEqual(['avisos-a@ejemplo.test'])

    // Al equipo se le manda una PLANTILLA: puede llevar horas sin escribirle al
    // bot, asi que su ventana de 24 h no tiene por que estar abierta.
    const alEquipo = enviados.find((e) => e.cuerpo.type === 'template')
    expect(alEquipo).toBeDefined()
    expect(alEquipo?.cuerpo).toMatchObject({ to: '34910000001' })

    // NI UNA PALABRA DEL SINTOMA sale de la clinica, ni por WhatsApp ni por
    // correo. Es lo mismo que quito `escalados.resumen` en la migracion 007.
    expect(JSON.stringify(alEquipo?.cuerpo)).not.toContain('muela')
    expect(correos[0]?.cuerpo).not.toContain('muela')

    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_REMITENTE
  })

  it('el escalado NO lleva ni una palabra de lo que escribio el paciente', async () => {
    // La migracion 007 quito `escalados.resumen` justo por esto: la tabla
    // sobrevive a la purga de 90 dias. Si alguien volviera a meter texto libre,
    // esto se pone rojo.
    const db = clienteServicio()
    const { data: conversacion } = await db
      .from('conversaciones')
      .select('id')
      .eq('telefono_e164', TELEFONO)
      .single()

    const { data } = await db.from('escalados').select('*').eq('conversacion_id', conversacion!.id)
    const fila = data![0]! as Record<string, unknown>

    expect(Object.keys(fila)).not.toContain('resumen')
    for (const valor of Object.values(fila)) {
      if (typeof valor === 'string') expect(valor).not.toContain('muela')
    }
  })

})

// ---------------------------------------------------------------------------
// El coste no necesita base de datos, pero se comprueba junto a lo que lo usa
// ---------------------------------------------------------------------------

it('el coste es 0 mientras el tier sea gratuito, y explicito, no null', () => {
  delete process.env.GEMINI_EUR_POR_MTOKEN_ENTRADA
  delete process.env.GEMINI_EUR_POR_MTOKEN_SALIDA
  // «No costo nada» y «no lo hemos medido» son cosas distintas, y el panel de
  // F5 tendra que distinguirlas.
  expect(costeEur(1000, 500)).toBe(0)
})

it('con tarifa puesta, el coste sale de verdad', () => {
  process.env.GEMINI_EUR_POR_MTOKEN_ENTRADA = '0.30'
  process.env.GEMINI_EUR_POR_MTOKEN_SALIDA = '2.50'
  // 1M de entrada a 0,30 y 1M de salida a 2,50.
  expect(costeEur(1_000_000, 1_000_000)).toBeCloseTo(2.8, 6)
  // Y se redondea a los seis decimales que admite numeric(10,6).
  expect(String(costeEur(1, 1)).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(6)
  delete process.env.GEMINI_EUR_POR_MTOKEN_ENTRADA
  delete process.env.GEMINI_EUR_POR_MTOKEN_SALIDA
})
