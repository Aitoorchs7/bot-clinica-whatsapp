/**
 * Los botones de `recordatorio_cita`, de punta a punta.
 *
 * Nivel 2, y se entra POR `procesarMensaje()` y no llamando a
 * `atenderBotonDeCita()` a pelo. Es deliberado: lo que hay que demostrar no es
 * solo que la función decide bien, sino que está ENCHUFADA —en el sitio
 * correcto del orden de `procesar.ts`, después de guardar el entrante y antes
 * del motor—. Una prueba que llamara a la función directamente pasaría igual
 * con el cable suelto, y los botones seguirían sin hacer nada.
 *
 * ============ LO QUE EL ENCARGO PIDE POR SU NOMBRE ============
 *
 *   3. `CONFIRMAR:<id>` confirma esa cita y SOLO esa; el payload de otra
 *      clínica o de otra conversación no confirma nada. Y lo que se decidió
 *      para `CANCELAR` hace lo que se dijo que hace.
 *
 * ============ EL MODELO NO SE LLAMA, Y SE EXIGE ============
 *
 * El modelo que se le pasa a `procesarMensaje` en este archivo REVIENTA si
 * alguien lo llama. Confirmar una cita no es una conversación: el mensaje trae
 * el identificador exacto y pedirle a un modelo que adivine a cuál se refería
 * «Confirmar» sería inventarse una ambigüedad que no existe — y pagarla, en
 * cuota del tier gratuito y en latencia.
 */
import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest'

import { clienteServicio } from '../ayuda/clientes'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

import { procesarMensaje } from '@/lib/whatsapp/procesar'
import { olvidarMapa } from '@/lib/whatsapp/config'
import type { Entrante } from '@/lib/whatsapp/botones'
import type { Modelo } from '@/lib/bot/gemini'

describeVivo('los botones del recordatorio', () => {
  let s: Sembrado

  /**
   * ESTE ARCHIVO SE TRAE SU PROPIO PACIENTE, Y NO ES POR COMODIDAD.
   *
   * La primera versión usaba `pacienteA` y su teléfono, que es el mismo de la
   * `conversacionA` que siembra F1. Al limpiar, el `delete from conversaciones
   * where telefono_e164 = ...` se llevaba por delante la conversación sembrada,
   * y con ella —en cascada— sus mensajes; los escalados que la citaban se
   * quedaban con el puntero en null.
   *
   * El resultado fue once pruebas rojas en `tests/rls/03-operacion`,
   * `tests/panel-vivo` y `tests/bot-vivo`, todas por un fallo que no estaba en
   * ninguno de esos archivos. Es EXACTAMENTE el test destructivo de
   * ESTADO_F1 §5.2: una prueba que deja el fixture distinto de como lo encontró
   * rompe a los que vienen detrás, y el daño aparece en el archivo de al lado.
   *
   * Con un paciente propio, todo lo que este archivo borra es suyo.
   */
  const TELEFONO_A = '+34600777111' // el del paciente de ESTE archivo
  const OTRO_TELEFONO = '+34600555444' // un número cualquiera, de nadie
  let pacienteDelBoton: string

  let enviados: { cuerpo: Record<string, unknown> }[] = []
  let quejas: string[] = []
  const creadas: string[] = []

  /** Si esto se llega a ejecutar, es que el botón ha llegado al motor. */
  const modeloQueNoDebeCorrer: Modelo = async () => {
    throw new Error(
      'EL MODELO SE HA LLAMADO PARA UN BOTON. Confirmar una cita no es una ' +
        'conversación: `procesar.ts` tenía que haberlo atendido antes del motor.',
    )
  }

  function metaFalsa(): typeof fetch {
    let n = 0
    return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      n += 1
      enviados.push({ cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      return new Response(JSON.stringify({ messages: [{ id: `wamid.BOT.${n}` }] }), { status: 200 })
    }) as unknown as typeof fetch
  }

  function opciones() {
    return {
      modelo: modeloQueNoDebeCorrer,
      modeloClasificador: modeloQueNoDebeCorrer,
      envio: { fetch: metaFalsa(), token: 'TOKEN-DE-PRUEBA', intentos: 1 },
      fetchEmail: metaFalsa(),
      esperaMs: 0,
      registro: {
        info: () => {},
        error: (t: string) => {
          quejas.push(t)
        },
      },
    }
  }

  function boton(payload: string, telefono: string, numeroWa: string, wamid: string): Entrante {
    return {
      waMessageId: wamid,
      phoneNumberId: numeroWa,
      telefono,
      clase: 'boton',
      payload,
      // Lo que ve el paciente. El motor recibiría esto; el atajo recibe el payload.
      etiqueta: payload.startsWith('CONFIRMAR') ? 'Confirmar' : 'Cancelar',
    }
  }

  async function cita(
    clinicaId: string,
    pacienteId: string,
    tratamientoId: string,
    gabineteId: string,
    estado: 'provisional' | 'confirmada',
    horas: number,
  ): Promise<string> {
    const inicio = new Date(Date.now() + horas * 3600_000)
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
        estado,
        ...(estado === 'provisional'
          ? { expira_en: new Date(Date.now() + 600_000).toISOString() }
          : {}),
        quien_reserva: 'bot',
        motivo_cerrado: 'revision',
      } as never)
      .select('id')
      .single()

    if (error) throw new Error(`Sembrando la cita: ${error.message}`)
    const id = (data as { id: string }).id
    creadas.push(id)
    return id
  }

  async function estadoDe(id: string): Promise<string> {
    const { data } = await clienteServicio().from('citas').select('estado').eq('id', id).single()
    return (data as { estado: string }).estado
  }

  /**
   * Los avisos de la conversación de ESTE archivo.
   *
   * Filtrar por `motivo = 'pidio_persona'` contaría también el escalado que
   * siembra F1, que lleva ese mismo motivo: la prueba esperaría uno y vería
   * dos. Se filtra por la conversación, que sí es mía.
   */
  async function avisosMios(): Promise<
    { motivo: string; asunto: string; estado: string; mensaje_id: number | null }[]
  > {
    const db = clienteServicio()
    const { data: mias } = await db
      .from('conversaciones')
      .select('id')
      .eq('telefono_e164', TELEFONO_A)

    const ids = (mias ?? []).map((c) => (c as { id: string }).id)
    if (ids.length === 0) return []

    const { data } = await db
      .from('escalados')
      .select('motivo, asunto, estado, mensaje_id')
      .in('conversacion_id', ids)

    return (data ?? []) as { motivo: string; asunto: string; estado: string; mensaje_id: number | null }[]
  }

  /**
   * Borra SOLO lo de este archivo, y por eso da este rodeo.
   *
   * La versión corta —`delete from escalados where motivo = 'pidio_persona'`—
   * se llevaba también el escalado que siembra F1, que tiene exactamente ese
   * motivo. Mismo error que el del teléfono, por otra columna: limpiar por un
   * valor que el fixture también usa no es limpiar lo tuyo, es limpiar lo de
   * todos.
   *
   * Los escalados se borran ANTES que sus conversaciones. Si se hiciera al
   * revés, `conversacion_id` se quedaría en null por la clave foránea (ON
   * DELETE SET NULL) y ya no habría forma de saber cuáles eran míos.
   */
  async function limpiar(): Promise<void> {
    const db = clienteServicio()

    const { data: mias } = await db
      .from('conversaciones')
      .select('id')
      .in('telefono_e164', [TELEFONO_A, OTRO_TELEFONO])

    const ids = (mias ?? []).map((c) => (c as { id: string }).id)
    if (ids.length > 0) {
      await db.from('escalados').delete().in('conversacion_id', ids)
    }

    if (creadas.length > 0) {
      await db.from('citas').delete().in('id', creadas)
      creadas.length = 0
    }

    await db.from('conversaciones').delete().in('telefono_e164', [TELEFONO_A, OTRO_TELEFONO])
  }

  beforeAll(async () => {
    s = sembrado()
    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      [s.numeroWaA]: s.clinicaA,
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()

    const { data, error } = await clienteServicio()
      .from('pacientes')
      .insert({
        clinica_id: s.clinicaA,
        nombre: 'Marta',
        apellidos: 'Boton',
        telefono_e164: TELEFONO_A,
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el paciente del boton: ${error.message}`)
    pacienteDelBoton = (data as { id: string }).id

    await limpiar()
    enviados = []
    quejas = []
  })

  afterEach(async () => {
    await limpiar()
    enviados = []
    quejas = []
  })

  afterAll(async () => {
    // El paciente se borra AL FINAL y después de las citas: `citas.paciente_id`
    // va a NO ACTION desde la migración 007, así que con una cita viva delante
    // el borrado fallaría (ESTADO_F1 §7).
    await limpiar()
    await clienteServicio().from('pacientes').delete().eq('id', pacienteDelBoton)
    delete process.env.WHATSAPP_CLINICAS
    olvidarMapa()
  })

  // ---------------------------------------------------------------------------
  // CONFIRMAR
  // ---------------------------------------------------------------------------

  it('CONFIRMAR confirma la cita, y el modelo NI SE ENTERA', async () => {
    const id = await cita(
      s.clinicaA,
      pacienteDelBoton,
      s.tratamientoAPublico,
      s.gabineteA2,
      'provisional',
      30,
    )

    const salida = await procesarMensaje(
      boton(`CONFIRMAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.1'),
      opciones(),
    )

    expect(salida.hecho).toBe('boton')
    expect(salida).toMatchObject({ que: 'confirmada' })
    expect(await estadoDe(id)).toBe('confirmada')

    // Y se le contesta al paciente, por texto libre: acaba de escribir, así que
    // su ventana de 24 h está abierta.
    expect(enviados).toHaveLength(1)
    expect(enviados[0]!.cuerpo.type).toBe('text')
    expect(String((enviados[0]!.cuerpo.text as { body: string }).body)).toContain('confirmada')
  })

  it('CONFIRMAR dos veces no rompe nada y lo dice sin mentir', async () => {
    const id = await cita(
      s.clinicaA,
      pacienteDelBoton,
      s.tratamientoAPublico,
      s.gabineteA2,
      'provisional',
      31,
    )

    await procesarMensaje(boton(`CONFIRMAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.2a'), opciones())
    const segunda = await procesarMensaje(
      boton(`CONFIRMAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.2b'),
      opciones(),
    )

    expect(segunda).toMatchObject({ que: 'ya_estaba' })
    expect(await estadoDe(id)).toBe('confirmada')
  })

  // ---------------------------------------------------------------------------
  // 3 · SOLO ESA CITA
  // ---------------------------------------------------------------------------

  it('EL PAYLOAD DE OTRA CLINICA NO CONFIRMA NADA', async () => {
    // La cita es de B; el botón entra por el número de A. La RLS hace que, para
    // el cliente de A, esa fila no exista.
    const enB = await cita(
      s.clinicaB,
      s.pacienteB,
      s.tratamientoBPublico,
      s.gabineteB1,
      'provisional',
      32,
    )

    const salida = await procesarMensaje(
      boton(`CONFIRMAR:${enB}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.3'),
      opciones(),
    )

    expect(salida).toMatchObject({ que: 'no_es_suya' })

    // Y la cita de B sigue EXACTAMENTE como estaba. Es la aserción que
    // importa: que la respuesta sea «no es tuya» no demuestra que no se haya
    // tocado nada.
    expect(
      await estadoDe(enB),
      'Un botón entrado por el número de la clínica A ha confirmado una cita de la B.',
    ).toBe('provisional')

    // Y no se le cuenta a quien sondea que ese identificador existe.
    const contestado = String((enviados[0]!.cuerpo.text as { body: string }).body)
    expect(contestado).not.toContain(enB)
    expect(contestado.toLowerCase()).not.toContain('otra clínica')
  })

  it('EL PAYLOAD DESDE OTRO NUMERO TAMPOCO', async () => {
    // Misma clínica, cita real, pero pulsa alguien que no es su paciente. Es el
    // caso que la RLS no puede parar sola: la fila SÍ es visible para este
    // cliente. Lo para la comprobación del teléfono.
    const id = await cita(
      s.clinicaA,
      pacienteDelBoton,
      s.tratamientoAPublico,
      s.gabineteA2,
      'provisional',
      33,
    )

    const salida = await procesarMensaje(
      boton(`CONFIRMAR:${id}`, OTRO_TELEFONO, s.numeroWaA, 'wamid.BTN.4'),
      opciones(),
    )

    expect(salida).toMatchObject({ que: 'no_es_suya' })
    expect(
      await estadoDe(id),
      'Cualquiera con el identificador ha podido confirmar la cita de otro.',
    ).toBe('provisional')
    expect(quejas.join(' ')).toContain('no es el de su paciente')
  })

  it('un identificador inventado no confirma nada ni revienta', async () => {
    const salida = await procesarMensaje(
      boton(
        'CONFIRMAR:00000000-0000-4000-8000-000000000000',
        TELEFONO_A,
        s.numeroWaA,
        'wamid.BTN.5',
      ),
      opciones(),
    )

    expect(salida).toMatchObject({ que: 'no_es_suya' })
  })

  it('un payload con basura dentro NO es un boton de cita: sigue su camino', async () => {
    // `leerPayloadDeCita` devuelve undefined, así que `procesar.ts` sigue por
    // el camino normal y el mensaje acaba en el motor — que aquí revienta a
    // propósito. Eso es lo correcto: un botón de otra plantilla no es asunto de
    // `confirmar.ts`.
    await expect(
      procesarMensaje(
        boton("CONFIRMAR:' or 1=1--", TELEFONO_A, s.numeroWaA, 'wamid.BTN.6'),
        opciones(),
      ),
    ).rejects.toThrow('EL MODELO SE HA LLAMADO')
  })

  // ---------------------------------------------------------------------------
  // CANCELAR: hace lo que se dijo que hace
  // ---------------------------------------------------------------------------

  it('CANCELAR NO CANCELA: escala a recepcion y la cita SIGUE EN PIE', async () => {
    const id = await cita(
      s.clinicaA,
      pacienteDelBoton,
      s.tratamientoAPublico,
      s.gabineteA2,
      'confirmada',
      34,
    )

    const salida = await procesarMensaje(
      boton(`CANCELAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.7'),
      opciones(),
    )

    expect(salida).toMatchObject({ que: 'escalada' })

    // La cita no se toca. Cancelar por WhatsApp está fuera del producto.
    expect(await estadoDe(id)).toBe('confirmada')

    // Hay un aviso para recepción, con vocabulario cerrado y sin texto libre.
    const avisos = await avisosMios()

    expect(avisos).toHaveLength(1)
    expect(avisos[0]!.motivo).toBe('pidio_persona')
    expect(avisos[0]!.asunto).toBe('otro')
    expect(avisos[0]!.estado).toBe('pendiente')
    // Apunta al mensaje que lo disparó, que es por donde recepción abre el hilo.
    expect(avisos[0]!.mensaje_id).not.toBeNull()
  })

  it('y al paciente se le dice la verdad: que su cita NO esta cancelada', async () => {
    // Un botón que promete algo que no hace es peor que no tenerlo: el paciente
    // se queda convencido de que ha cancelado y no aparece el día de la cita.
    const id = await cita(
      s.clinicaA,
      pacienteDelBoton,
      s.tratamientoAPublico,
      s.gabineteA2,
      'confirmada',
      35,
    )

    await procesarMensaje(boton(`CANCELAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.8'), opciones())

    const alPaciente = enviados
      .filter((e) => e.cuerpo.type === 'text')
      .map((e) => String((e.cuerpo.text as { body: string }).body))
      .join(' ')

    // Le dice que su cita SIGUE en pie y que se avisa al equipo.
    expect(alPaciente).toContain('sigue')
    expect(alPaciente.toLowerCase()).toContain('aviso')
    // Y el teléfono de la clínica, que es lo que sí puede resolverlo hoy.
    expect(alPaciente).toContain('+34910000001')

    // Ninguna negativa a secas: la regla de copy de .claude/CLAUDE.md.
    expect(alPaciente).not.toContain('No puedo')
    expect(alPaciente).not.toContain('No te entiendo')
  })

  it('CANCELAR dos veces deja UN solo aviso', async () => {
    // La idempotencia no la comprueba el código: la da el índice único parcial
    // `escalados_uno_pendiente_idx`. V1 lo aprendió a golpes el 11/09 escalando
    // cuatro veces la misma conversación.
    const id = await cita(
      s.clinicaA,
      pacienteDelBoton,
      s.tratamientoAPublico,
      s.gabineteA2,
      'confirmada',
      36,
    )

    await procesarMensaje(boton(`CANCELAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.9a'), opciones())
    await procesarMensaje(boton(`CANCELAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.9b'), opciones())

    expect(await avisosMios()).toHaveLength(1)
  })

  it('el aviso al equipo NO lleva ni el motivo de la cita ni texto del paciente', async () => {
    // Lo que salga por WhatsApp o por correo se queda fuera del alcance de la
    // purga de 90 días para siempre (ESTADO_F4 §9).
    const id = await cita(
      s.clinicaA,
      pacienteDelBoton,
      s.tratamientoAPublico,
      s.gabineteA2,
      'confirmada',
      37,
    )

    await procesarMensaje(boton(`CANCELAR:${id}`, TELEFONO_A, s.numeroWaA, 'wamid.BTN.10'), opciones())

    const todo = JSON.stringify(enviados).toLowerCase()
    for (const palabra of ['revision', 'revisión', 'muela', 'dolor']) {
      expect(todo).not.toContain(palabra)
    }
  })
})
