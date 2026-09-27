/**
 * EL BUG DE V1, contra la base de datos de verdad.
 *
 * Nivel 2 de ESTADO_F3 §1: Supabase real, sin Gemini. Aqui no hace falta
 * ningun modelo, porque lo que se comprueba no es lo que dice el bot sino que
 * las dos puntas de la agenda encajen.
 *
 * QUE PASO EN V1
 *
 * La rejilla de 15 minutos con la que se OFRECEN huecos se uso como si fuera
 * una restriccion de RESERVA. Pedir «las cinco y veinte» con la agenda vacia se
 * rechazaba con un «ese hueco ya no esta libre, se lo acaban de coger»: una
 * mentira, y de las que se notan.
 *
 * Aqui eso se parte en dos afirmaciones, y las dos tienen que ser ciertas:
 *
 *   1. Todo hueco que el bot OFRECE, `crear_cita` lo ACEPTA.
 *   2. Una hora que el bot NO ha ofrecido tambien se puede reservar, si la
 *      clinica esta abierta y el sillon libre. Que no saliera ofrecida no
 *      significa que este cogida.
 *
 * La 1 sola no basta: se cumpliria ofreciendo una sola hora. La 2 es la que
 * cierra el agujero por el que se colo V1.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

import { ejecutar, type Contexto } from '@/lib/bot/herramientas'
import { muestrear, type Hueco } from '@/lib/bot/muestreo'

describeVivo('el bug de V1: lo que se ofrece se puede reservar', () => {
  let s: Sembrado
  const creadas: string[] = []

  beforeAll(() => {
    s = sembrado()
  })

  afterAll(async () => {
    if (creadas.length > 0) {
      await clienteServicio().from('citas').delete().in('id', creadas)
    }
  })

  /** Un miercoles dentro de la ventana de antelacion. Nunca fin de semana. */
  function unDiaLaborable(dentroDeDias = 10): string {
    const dia = new Date(Date.now() + dentroDeDias * 86_400_000)
    while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
      dia.setUTCDate(dia.getUTCDate() + 1)
    }
    return dia.toISOString().slice(0, 10)
  }

  function contexto(extra: Partial<Contexto> = {}): Contexto {
    return {
      clinicaId: s.clinicaA,
      conversacionId: s.conversacionA,
      telefonoDelCanal: '+34600111222',
      zonaHoraria: 'Europe/Madrid',
      telefonoRecepcion: '+34910000001',
      transcripcion: [],
      borrador: {},
      rondasDeAclaracion: 0,
      cliente: clienteBot(s.clinicaA),
      ...extra,
    }
  }

  async function ofrecidas(dia: string) {
    const ejecucion = await ejecutar(
      'consultar_huecos',
      { tratamiento: 'Revision', dia },
      contexto(),
    )
    expect(ejecucion.resultado.ok, JSON.stringify(ejecucion.resultado)).toBe(true)
    return ejecucion
  }

  /** Reserva saltandose la puerta: aqui se prueba la agenda, no la confirmacion. */
  async function reservar(hora: string) {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot.rpc('crear_cita', {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: hora,
      p_motivo: 'revision',
      p_conversacion: s.conversacionA,
    })

    expect(error).toBeNull()
    const salida = (Array.isArray(data) ? data[0] : data) as {
      ok: boolean
      motivo: string
      cita_id: string | null
    }
    if (salida?.cita_id) creadas.push(salida.cita_id)
    return salida
  }

  it('la herramienta ofrece entre una y cuatro opciones, no la rejilla entera', async () => {
    const dia = unDiaLaborable()
    const { resultado } = await ofrecidas(dia)
    const opciones = resultado.opciones as { hora: string; cuando: string }[]

    expect(opciones.length).toBeGreaterThan(0)
    expect(opciones.length).toBeLessThanOrEqual(4)
  })

  it('al modelo NO se le da el total de huecos, para que no lo suelte', async () => {
    const { resultado } = await ofrecidas(unDiaLaborable())
    // «Hay treinta y siete huecos» no es una frase que diga una recepcionista.
    expect(resultado).not.toHaveProperty('totalLibres')
    expect(resultado).not.toHaveProperty('instantesLibres')
  })

  it('1 · TODO hueco ofrecido se puede reservar de verdad', async () => {
    const dia = unDiaLaborable(11)
    const { resultado } = await ofrecidas(dia)
    const opciones = resultado.opciones as { hora: string; cuando: string }[]

    for (const opcion of opciones) {
      const salida = await reservar(opcion.hora)
      expect(
        salida.ok,
        `Se ofrecio ${opcion.cuando} (${opcion.hora}) y crear_cita lo rechazo ` +
          `con «${salida.motivo}». Es el bug de V1.`,
      ).toBe(true)
    }
  })

  it('2 · una hora que NO se ofrecio tambien se reserva', async () => {
    // La otra mitad del bug: solo se ofrecen dos o tres de las muchas libres.
    const dia = unDiaLaborable(12)
    const bot = clienteBot(s.clinicaA)

    const { data } = await bot.rpc('consultar_huecos', {
      p_clinica: s.clinicaA,
      p_tratamiento: s.tratamientoAPublico,
      p_desde: `${dia}T00:00:00Z`,
      p_hasta: `${dia}T23:59:59Z`,
    })
    const rejilla = (data ?? []) as unknown as Hueco[]
    const { opciones } = muestrear(rejilla, 'Europe/Madrid')

    const ofrecidasAhora = new Set(opciones.map((o) => o.inicio))
    const noOfrecida = rejilla.find((hueco) => !ofrecidasAhora.has(hueco.inicio))
    expect(noOfrecida, 'la rejilla tiene que tener mas horas que las ofrecidas').toBeDefined()

    const salida = await reservar(noOfrecida!.inicio)
    expect(
      salida.ok,
      `La hora ${noOfrecida!.inicio} no se ofrecio y se ha rechazado con ` +
        `«${salida.motivo}». Que no se ofreciera NO significa que este cogida.`,
    ).toBe(true)
  })

  it('las opciones ofrecidas salen todas de la rejilla del RPC', async () => {
    const dia = unDiaLaborable(13)
    const bot = clienteBot(s.clinicaA)

    const { data } = await bot.rpc('consultar_huecos', {
      p_clinica: s.clinicaA,
      p_tratamiento: s.tratamientoAPublico,
      p_desde: `${dia}T00:00:00Z`,
      p_hasta: `${dia}T23:59:59Z`,
    })
    const dePostgres = new Set(((data ?? []) as unknown as Hueco[]).map((h) => h.inicio))

    const { resultado } = await ofrecidas(dia)
    for (const opcion of resultado.opciones as { hora: string }[]) {
      expect(dePostgres.has(opcion.hora)).toBe(true)
    }
  })

  it('un hueco ya reservado deja de ofrecerse', async () => {
    const dia = unDiaLaborable(14)
    const primera = await ofrecidas(dia)
    const opcion = (primera.resultado.opciones as { hora: string }[])[0]!

    // Se ocupan los DOS gabinetes a esa hora: con uno solo, el otro sigue libre
    // y la hora seguiria saliendo, con razon.
    const bot = clienteBot(s.clinicaA)
    for (const gabinete of [s.gabineteA1, s.gabineteA2]) {
      const { data } = await bot.rpc('crear_cita', {
        p_clinica: s.clinicaA,
        p_paciente: s.pacienteA,
        p_tratamiento: s.tratamientoAPublico,
        p_inicio: opcion.hora,
        p_gabinete: gabinete,
        p_conversacion: s.conversacionA,
      })
      const salida = (Array.isArray(data) ? data[0] : data) as { cita_id: string | null }
      if (salida?.cita_id) creadas.push(salida.cita_id)
    }

    const segunda = await ofrecidas(dia)
    const ahora = (segunda.resultado.opciones as { hora: string }[]).map((o) => o.hora)
    expect(ahora).not.toContain(opcion.hora)
  })

  it('un tratamiento confidencial no produce ni una opcion', async () => {
    // La RLS deja al bot sin la fila, asi que no hay ni tratamiento que buscar.
    const ejecucion = await ejecutar(
      'consultar_huecos',
      { tratamiento: 'Implante', dia: unDiaLaborable() },
      contexto(),
    )
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('tratamiento_desconocido')
    expect(JSON.stringify(ejecucion.resultado)).not.toContain('Implante')
  })

  it('un dia sin horario no inventa huecos, dice que no hay', async () => {
    const domingo = new Date(Date.now() + 10 * 86_400_000)
    while (domingo.getUTCDay() !== 0) domingo.setUTCDate(domingo.getUTCDate() + 1)

    const ejecucion = await ejecutar(
      'consultar_huecos',
      { tratamiento: 'Revision', dia: domingo.toISOString().slice(0, 10) },
      contexto(),
    )
    expect(ejecucion.resultado.ok).toBe(false)
    expect(ejecucion.resultado.motivo).toBe('sin_huecos')
  })
})
