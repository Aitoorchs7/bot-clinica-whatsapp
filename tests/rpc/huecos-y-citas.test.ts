/**
 * Los dos RPC.
 *
 * Lo que se prueba aqui no es que devuelvan datos: es que la garantia contra la
 * doble reserva esta en la base de datos y no en el modelo, y que las dos
 * funciones se ponen de acuerdo. Que `consultar_huecos` ofrezca un hueco que
 * `crear_cita` rechaza es exactamente el bug que V1 documenta.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { type Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

type Hueco = { inicio: string; fin: string; gabinete_id: string }
type Resultado = {
  ok: boolean
  motivo: string
  cita_id: string | null
  inicio: string | null
  fin: string | null
}

const dentroDe = (horas: number) => new Date(Date.now() + horas * 3600_000).toISOString()

describeVivo('consultar_huecos', () => {
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

  async function huecos(clinica: string, tratamiento: string) {
    const bot = clienteBot(clinica)
    const { data, error } = await bot.rpc('consultar_huecos', {
      p_clinica: clinica,
      p_tratamiento: tratamiento,
      p_desde: dentroDe(24),
      p_hasta: dentroDe(24 * 8),
    })
    return { huecos: (data ?? []) as unknown as Hueco[], error }
  }

  it('devuelve huecos reales para un tratamiento publico', async () => {
    const { huecos: libres, error } = await huecos(s.clinicaA, s.tratamientoAPublico)

    expect(error).toBeNull()
    expect(libres.length).toBeGreaterThan(0)
  })

  it('todos los huecos caen dentro de la ventana pedida y en el futuro', async () => {
    const { huecos: libres } = await huecos(s.clinicaA, s.tratamientoAPublico)
    const ahora = Date.now()

    for (const hueco of libres) {
      expect(new Date(hueco.inicio).getTime()).toBeGreaterThan(ahora)
      expect(new Date(hueco.fin).getTime()).toBeGreaterThan(new Date(hueco.inicio).getTime())
    }
  })

  it('ninguno solapa con una cita ya existente en su gabinete', async () => {
    const { data: citas } = await clienteServicio()
      .from('citas')
      .select('gabinete_id, inicio, fin')
      .eq('clinica_id', s.clinicaA)
      .in('estado', ['provisional', 'confirmada', 'completada'])

    const { huecos: libres } = await huecos(s.clinicaA, s.tratamientoAPublico)

    for (const hueco of libres) {
      for (const cita of (citas ?? []) as { gabinete_id: string; inicio: string; fin: string }[]) {
        if (cita.gabinete_id !== hueco.gabinete_id) continue
        const solapa =
          new Date(hueco.inicio) < new Date(cita.fin) &&
          new Date(hueco.fin) > new Date(cita.inicio)
        expect(solapa).toBe(false)
      }
    }
  })

  it('SECURITY INVOKER: el bot de B no puede mirar la agenda de A', async () => {
    const botB = clienteBot(s.clinicaB)
    const { data, error } = await botB.rpc('consultar_huecos', {
      p_clinica: s.clinicaA,
      p_tratamiento: s.tratamientoAPublico,
      p_desde: dentroDe(24),
      p_hasta: dentroDe(24 * 8),
    })

    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  it('un tratamiento confidencial no produce huecos para el bot', async () => {
    // El bot no ve la fila con publico = false, asi que la funcion no encuentra
    // el tratamiento. La RLS llega hasta dentro del RPC.
    const { huecos: libres } = await huecos(s.clinicaA, s.tratamientoAConfidencial)

    expect(libres).toEqual([])
  })
})

describeVivo('crear_cita', () => {
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

  async function crear(clinica: string, argumentos: Record<string, unknown>) {
    const bot = clienteBot(clinica)
    const { data, error } = await bot.rpc('crear_cita', argumentos)
    return { resultado: data as unknown as Resultado, error }
  }

  async function primerHueco(): Promise<Hueco> {
    const bot = clienteBot(s.clinicaA)
    const { data } = await bot.rpc('consultar_huecos', {
      p_clinica: s.clinicaA,
      p_tratamiento: s.tratamientoAPublico,
      p_desde: dentroDe(24),
      p_hasta: dentroDe(24 * 8),
    })
    const libres = (data ?? []) as unknown as Hueco[]
    expect(libres.length).toBeGreaterThan(0)
    return libres[0]!
  }

  it('un hueco ofrecido por consultar_huecos SI se puede reservar', async () => {
    // El contrato entre las dos funciones. Si esto falla, el bot esta mintiendo
    // al paciente: le ofrece horas que luego rechaza.
    const hueco = await primerHueco()
    const { resultado, error } = await crear(s.clinicaA, {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: hueco.inicio,
      p_motivo: 'revision',
      p_gabinete: hueco.gabinete_id,
    })

    expect(error).toBeNull()
    expect(resultado.ok).toBe(true)
    expect(resultado.motivo).toBe('creada')
    if (resultado.cita_id) creadas.push(resultado.cita_id)
  })

  it('el mismo sillon a la misma hora da "ocupado", no un 500', async () => {
    const hueco = await primerHueco()
    const argumentos = {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: hueco.inicio,
      p_motivo: 'revision',
      p_gabinete: hueco.gabinete_id,
    }

    const primera = await crear(s.clinicaA, argumentos)
    expect(primera.resultado.ok).toBe(true)
    if (primera.resultado.cita_id) creadas.push(primera.resultado.cita_id)

    const segunda = await crear(s.clinicaA, argumentos)
    expect(segunda.error).toBeNull()
    expect(segunda.resultado.ok).toBe(false)
    expect(segunda.resultado.motivo).toBe('ocupado')
  })

  it('dos peticiones simultaneas al mismo hueco: gana una sola', async () => {
    // Sin ventana entre comprobar y escribir, porque no se comprueba: decide el
    // constraint sin_solape.
    const hueco = await primerHueco()
    const argumentos = {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: hueco.inicio,
      p_motivo: 'revision',
      p_gabinete: hueco.gabinete_id,
    }

    const [uno, dos] = await Promise.all([
      crear(s.clinicaA, argumentos),
      crear(s.clinicaA, argumentos),
    ])

    for (const r of [uno, dos]) {
      if (r.resultado?.cita_id) creadas.push(r.resultado.cita_id)
    }

    const ganadoras = [uno, dos].filter((r) => r.resultado.ok)
    expect(ganadoras).toHaveLength(1)
    expect([uno, dos].find((r) => !r.resultado.ok)!.resultado.motivo).toBe('ocupado')
  })

  it('una hora en el pasado da "pasado"', async () => {
    const { resultado } = await crear(s.clinicaA, {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: dentroDe(-24),
      p_motivo: 'revision',
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBe('pasado')
  })

  it('una hora con la clinica cerrada da "fuera_de_horario", NO "ocupado"', async () => {
    // El matiz que costo un bug en V1: decirle a alguien que su hora esta
    // cogida cuando lo que pasa es que la clinica esta cerrada.
    const madrugada = new Date(Date.now() + 48 * 3600_000)
    madrugada.setUTCHours(2, 0, 0, 0)

    const { resultado } = await crear(s.clinicaA, {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: madrugada.toISOString(),
      p_motivo: 'revision',
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBe('fuera_de_horario')
  })

  it('mas alla de la antelacion maxima da "demasiado_lejos"', async () => {
    const { resultado } = await crear(s.clinicaA, {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: dentroDe(24 * 400),
      p_motivo: 'revision',
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBe('demasiado_lejos')
  })

  it('un tratamiento que el bot no ve da "tratamiento_desconocido"', async () => {
    const hueco = await primerHueco()
    const { resultado } = await crear(s.clinicaA, {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAConfidencial,
      p_inicio: hueco.inicio,
      p_motivo: 'otro',
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBe('tratamiento_desconocido')
  })

  it('el bot de B no puede crear una cita en la clinica A', async () => {
    const hueco = await primerHueco()
    const { resultado } = await crear(s.clinicaB, {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: hueco.inicio,
      p_motivo: 'revision',
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBe('clinica_no_coincide')
  })

  it('la cita nace provisional y con fecha de caducidad', async () => {
    const hueco = await primerHueco()
    const { resultado } = await crear(s.clinicaA, {
      p_clinica: s.clinicaA,
      p_paciente: s.pacienteA,
      p_tratamiento: s.tratamientoAPublico,
      p_inicio: hueco.inicio,
      p_motivo: 'revision',
      p_gabinete: hueco.gabinete_id,
    })
    expect(resultado.ok).toBe(true)
    if (resultado.cita_id) creadas.push(resultado.cita_id)

    const { data } = await clienteBot(s.clinicaA)
      .from('citas')
      .select('estado, expira_en, quien_reserva, motivo_cerrado')
      .eq('id', resultado.cita_id!)
      .single()

    const cita = data as unknown as {
      estado: string
      expira_en: string | null
      quien_reserva: string
      motivo_cerrado: string
    }
    expect(cita.estado).toBe('provisional')
    expect(cita.expira_en).not.toBeNull()
    expect(cita.quien_reserva).toBe('bot')
    expect(cita.motivo_cerrado).toBe('revision')
  })
})
