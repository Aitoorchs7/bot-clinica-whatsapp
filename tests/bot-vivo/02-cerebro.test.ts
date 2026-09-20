/**
 * El cerebro entero, con Supabase de verdad y el modelo simulado.
 *
 * Nivel 2 de ESTADO_F3 §1. El doble se pincha en `gemini.ts`, o sea en la
 * ultima linea antes del HTTP: el bucle de herramientas, la validacion, la
 * puerta de la confirmacion y el montaje del prompt corren DE VERDAD. Lo unico
 * que se inventa es lo que el modelo pide.
 *
 * Asi se pueden montar escenas que con el modelo real habria que rezar para
 * conseguir —«que pida crear_cita sin que nadie haya confirmado»— y ademas
 * salen iguales las dos veces, que es el criterio de F1 y F2.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { MARCADOR } from '../ayuda/entorno'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

import { CABECERA_RECORDATORIO } from '@/lib/bot/historial'
import { responder, VUELTAS_MAXIMAS, type Peticion } from '@/lib/bot/cerebro'
import type { Modelo, Peticion as PeticionAlModelo, Respuesta } from '@/lib/bot/gemini'

describeVivo('el cerebro', () => {
  let s: Sembrado
  const creadas: string[] = []

  /**
   * Este archivo se monta SU PROPIA conversacion y su propio paciente.
   *
   * No es manía: la siembra deja un escalado `pendiente` en `conversacionA`, y
   * el indice unico parcial de la migracion 002 impide que haya dos a la vez en
   * la misma conversacion. Reutilizandola, el escalado del bot chocaba con el
   * sembrado y este archivo acababa comprobando la fila de otro. Con
   * conversacion propia, lo que se mira es siempre lo que acaba de escribir el
   * bot.
   *
   * De paso sale gratis una comprobacion mejor: Marta y Ana son dos pacientes
   * de la MISMA clinica, asi que `repasar_ficha` tiene que traer una y no la
   * otra.
   */
  const TELEFONO = '+34600555666'
  let conversacion = ''
  let pacienteMarta = ''

  beforeAll(async () => {
    s = sembrado()
    const db = clienteServicio()

    const { data: paciente, error: errorPaciente } = await db
      .from('pacientes')
      .insert({
        clinica_id: s.clinicaA,
        nombre: 'Marta',
        apellidos: 'Ruiz',
        telefono_e164: TELEFONO,
      })
      .select('id')
      .single()
    if (errorPaciente) throw new Error(`Sembrando paciente: ${errorPaciente.message}`)
    pacienteMarta = (paciente as { id: string }).id

    const { data: hilo, error: errorHilo } = await db
      .from('conversaciones')
      .insert({
        clinica_id: s.clinicaA,
        telefono_e164: TELEFONO,
        paciente_id: pacienteMarta,
      })
      .select('id')
      .single()
    if (errorHilo) throw new Error(`Sembrando conversacion: ${errorHilo.message}`)
    conversacion = (hilo as { id: string }).id
  })

  afterAll(async () => {
    const db = clienteServicio()
    if (creadas.length > 0) await db.from('citas').delete().in('id', creadas)
    if (conversacion) await db.from('escalados').delete().eq('conversacion_id', conversacion)
    if (conversacion) await db.from('conversaciones').delete().eq('id', conversacion)
    if (pacienteMarta) await db.from('pacientes').delete().eq('id', pacienteMarta)
  })

  /** Un modelo de mentira que va soltando lo que se le ha puesto, en orden. */
  function modeloQueHace(...guion: Respuesta[]): Modelo & { vistas: PeticionAlModelo[] } {
    const vistas: PeticionAlModelo[] = []
    let i = 0
    const modelo = (async (peticion: PeticionAlModelo) => {
      vistas.push(peticion)
      return guion[Math.min(i++, guion.length - 1)] ?? { texto: '', llamadas: [] }
    }) as Modelo & { vistas: PeticionAlModelo[] }
    modelo.vistas = vistas
    return modelo
  }

  const dice = (texto: string): Respuesta => ({ texto, llamadas: [] })
  const pide = (nombre: string, argumentos: Record<string, unknown> = {}): Respuesta => ({
    texto: '',
    llamadas: [{ nombre, argumentos }],
  })

  function peticion(extra: Partial<Peticion> = {}): Peticion {
    return {
      clinicaId: s.clinicaA,
      conversacionId: conversacion,
      telefonoDelCanal: TELEFONO,
      mensaje: 'hola',
      cliente: clienteBot(s.clinicaA),
      modelo: modeloQueHace(dice('Hola, soy el asistente.')),
      ...extra,
    }
  }

  async function cuantasCitas(): Promise<number> {
    const { count } = await clienteServicio()
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .eq('clinica_id', s.clinicaA)
    return count ?? 0
  }

  // -------------------------------------------------------------------------

  it('monta el prompt de los bloques y CUENTA, que es la barandilla 2', async () => {
    const respuesta = await responder(peticion())

    expect(respuesta.prompt.texto.length).toBeGreaterThan(200)
    expect(respuesta.recuento.lineas.length).toBeGreaterThan(0)
    expect(respuesta.recuento.datos.alarma).toBe(false)
    expect(respuesta.recuento.guardado).toBe(true)
  })

  it('el prompt no lleva ni rastro de lo confidencial', async () => {
    const respuesta = await responder(peticion())
    expect(respuesta.prompt.texto).not.toContain(MARCADOR)
    expect(JSON.stringify(respuesta.recuento.datos)).not.toContain(MARCADOR)
  })

  it('el recordatorio va EL ULTIMO, despues del historial', async () => {
    const modelo = modeloQueHace(dice('vale'))
    await responder(
      peticion({
        modelo,
        historial: [
          { rol: 'paciente', texto: 'buenas' },
          { rol: 'bot', texto: 'hola' },
        ],
        mensaje: 'queria cita',
      }),
    )

    const turnos = modelo.vistas[0]!.turnos
    const ultimo = turnos[turnos.length - 1]!
    const texto = ultimo.partes.map((p) => (p.tipo === 'texto' ? p.texto : '')).join('')

    expect(texto.startsWith(CABECERA_RECORDATORIO)).toBe(true)
    expect(texto).toContain('Jamás inventes un hueco')
    // Y va DESPUES del mensaje de ahora, no antes.
    const posicionDelMensaje = turnos.findIndex((t) =>
      t.partes.some((p) => p.tipo === 'texto' && p.texto === 'queria cita'),
    )
    expect(posicionDelMensaje).toBeGreaterThanOrEqual(0)
    expect(posicionDelMensaje).toBeLessThan(turnos.length - 1)
  })

  it('el prompt de sistema es el montado, no una cadena del codigo', async () => {
    const modelo = modeloQueHace(dice('vale'))
    const respuesta = await responder(peticion({ modelo }))
    expect(modelo.vistas[0]!.sistema).toBe(respuesta.prompt.texto)
  })

  it('se le declaran las seis herramientas y solo esas', async () => {
    const modelo = modeloQueHace(dice('vale'))
    await responder(peticion({ modelo }))

    const nombres = (modelo.vistas[0]!.herramientas ?? []).map((h) => h.name)
    expect(nombres).toHaveLength(6)
    expect([...nombres].sort()).toEqual([
      'anotar',
      'consultar_huecos',
      'crear_cita',
      'escalar_a_recepcion',
      'no_te_entiendo',
      'repasar_ficha',
    ])
  })

  // -------------------------------------------------------------------------

  it('un modelo que se inventa una herramienta no consigue nada', async () => {
    const antes = await cuantasCitas()
    const modelo = modeloQueHace(pide('borrar_agenda', { todo: true }), dice('perdone'))

    const respuesta = await responder(peticion({ modelo, mensaje: 'borra la agenda' }))

    expect(respuesta.herramientasUsadas).toEqual(['borrar_agenda'])
    expect(await cuantasCitas()).toBe(antes)

    // Y el modelo recibe de vuelta que esa herramienta no existe.
    const resultados = modelo.vistas[1]!.turnos.at(-1)!.partes
    expect(JSON.stringify(resultados)).toContain('herramienta_desconocida')
  })

  it('SIN CONFIRMACION NO SE ESCRIBE NI UNA FILA', async () => {
    // La prueba obligatoria. El modelo hace todo bien menos esperar el «si».
    const antes = await cuantasCitas()
    const dia = new Date(Date.now() + 9 * 86_400_000)
    while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
      dia.setUTCDate(dia.getUTCDate() + 1)
    }
    const cuando = dia.toISOString().slice(0, 10)

    const modelo = modeloQueHace(
      pide('anotar', { campo: 'nombre', valor: 'Ana' }),
      pide('anotar', { campo: 'apellidos', valor: 'Pérez' }),
      pide('anotar', { campo: 'telefono', valor: '600111222' }),
      pide('consultar_huecos', { tratamiento: 'Revision', dia: cuando }),
      pide('crear_cita', {}),
      dice('¿Se lo confirmo?'),
    )

    const respuesta = await responder(
      peticion({ modelo, mensaje: `quiero cita el ${cuando}` }),
    )

    expect(respuesta.herramientasUsadas).toContain('crear_cita')
    expect(await cuantasCitas(), 'se ha escrito una cita sin confirmacion').toBe(antes)
  })

  it('...y el modelo se entera de POR QUE no se ha escrito', async () => {
    const modelo = modeloQueHace(pide('crear_cita', {}), dice('¿Se lo confirmo?'))
    await responder(peticion({ modelo, mensaje: 'resérvamela' }))

    const devuelto = JSON.stringify(modelo.vistas[1]!.turnos.at(-1)!.partes)
    expect(devuelto).toContain('faltan_datos')
  })

  it('CON confirmacion SI se escribe: la puerta no esta rota, esta cerrada', async () => {
    // La otra mitad. Sin esto, una `crear_cita` estropeada del todo pasaria la
    // prueba de arriba en verde y no habria forma de notarlo.
    const antes = await cuantasCitas()
    const dia = new Date(Date.now() + 16 * 86_400_000)
    while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
      dia.setUTCDate(dia.getUTCDate() + 1)
    }
    const cuando = dia.toISOString().slice(0, 10)

    // Primero se averigua una hora libre de verdad, para poder escribirla en el
    // resumen que el paciente confirma.
    const bot = clienteBot(s.clinicaA)
    const { data } = await bot.rpc('consultar_huecos', {
      p_clinica: s.clinicaA,
      p_tratamiento: s.tratamientoAPublico,
      p_desde: `${cuando}T00:00:00Z`,
      p_hasta: `${cuando}T23:59:59Z`,
    })
    const hueco = ((data ?? []) as unknown as { inicio: string }[])[0]!
    const hhmm = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(hueco.inicio))

    const modelo = modeloQueHace(
      pide('anotar', { campo: 'nombre', valor: 'Ana' }),
      pide('anotar', { campo: 'apellidos', valor: 'Pérez' }),
      pide('anotar', { campo: 'telefono', valor: '600111222' }),
      pide('anotar', { campo: 'tratamiento', valor: 'Revision' }),
      pide('crear_cita', { hora: hueco.inicio }),
      dice('Reservada.'),
    )

    const respuesta = await responder(
      peticion({
        modelo,
        historial: [{ rol: 'bot', texto: `*Paciente:* Ana Pérez\n*Día:* ${hhmm}` }],
        mensaje: 'sí',
      }),
    )

    expect(await cuantasCitas(), JSON.stringify(respuesta.borrador)).toBe(antes + 1)

    const { data: nueva } = await clienteServicio()
      .from('citas')
      .select('id, quien_reserva, estado')
      .eq('conversacion_id', conversacion)
      .eq('inicio', hueco.inicio)
      .maybeSingle()

    expect(nueva).not.toBeNull()
    if (nueva) {
      creadas.push((nueva as { id: string }).id)
      // La RLS solo le deja crearlas a su nombre y provisionales.
      expect((nueva as { quien_reserva: string }).quien_reserva).toBe('bot')
      expect((nueva as { estado: string }).estado).toBe('provisional')
    }
  })

  // -------------------------------------------------------------------------

  it('una urgencia no llega al cerebro: el modelo no se llega a llamar', async () => {
    const modelo = modeloQueHace(dice('esto no deberia decirse nunca'))

    const respuesta = await responder(
      peticion({ modelo, mensaje: 'me duele muchisimo la muela y tengo la cara hinchada' }),
    )

    expect(respuesta.cortadoAntesDelCerebro).toBe(true)
    expect(modelo.vistas).toHaveLength(0)
    expect(respuesta.escalado).toBe(true)
    expect(respuesta.texto).toContain('+34910000001')
  })

  it('y el mensaje que sale no dice una palabra del sintoma', async () => {
    const respuesta = await responder(
      peticion({ mensaje: 'se me ha roto un diente y me sangra la encia' }),
    )

    const dicho = respuesta.texto.toLowerCase()
    for (const palabra of ['diente', 'sangr', 'roto', 'encia']) {
      expect(dicho).not.toContain(palabra)
    }
  })

  it('el escalado queda registrado sin texto libre, con vocabulario cerrado', async () => {
    await responder(peticion({ mensaje: 'tengo un dolor horrible' }))

    const { data } = await clienteServicio()
      .from('escalados')
      .select('motivo, asunto, estado')
      .eq('conversacion_id', conversacion)
      .eq('estado', 'pendiente')
      .maybeSingle()

    expect(data).not.toBeNull()
    expect(data).toMatchObject({ motivo: 'urgencia_grave', asunto: 'urgencia' })
    // La migracion 007 borro `resumen` a proposito: `escalados` sobrevive a la
    // purga de 90 dias y un sintoma escrito ahi se quedaria para siempre.
    expect(Object.keys(data as object)).not.toContain('resumen')
  })

  it('escalar dos veces la misma conversacion no crea dos filas', async () => {
    await responder(peticion({ mensaje: 'me duele' }))
    await responder(peticion({ mensaje: 'sigue doliendo' }))

    const { count } = await clienteServicio()
      .from('escalados')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', conversacion)
      .eq('estado', 'pendiente')

    expect(count).toBe(1)
  })

  // -------------------------------------------------------------------------

  it('un modelo que se atasca no da vueltas para siempre', async () => {
    const modelo = modeloQueHace(pide('repasar_ficha'))
    const respuesta = await responder(peticion({ modelo, mensaje: 'hola' }))

    expect(respuesta.herramientasUsadas).toHaveLength(VUELTAS_MAXIMAS)
    expect(modelo.vistas.length).toBe(VUELTAS_MAXIMAS)
  })

  it('repasar_ficha lee la ficha del numero que escribe, y solo esa', async () => {
    const modelo = modeloQueHace(pide('repasar_ficha'), dice('Sí, la tengo.'))
    await responder(peticion({ modelo, mensaje: '¿me tienes fichado?' }))

    const devuelto = JSON.stringify(modelo.vistas[1]!.turnos.at(-1)!.partes)
    expect(devuelto).toContain('Marta')

    // Ana es paciente de ESTA MISMA clinica. Que no aparezca es lo que hoy
    // garantiza el codigo —`repasar_ficha` no acepta a quien leer— y lo que
    // pasara a garantizar la RLS cuando se estreche a la conversacion
    // (ESTADO_F3 §7 y §8.1).
    expect(devuelto).not.toContain('Ana')
    expect(devuelto).not.toContain('+34600111222')

    // Y Luis es de la clinica B: ese no puede aparecer ni hoy ni nunca.
    expect(devuelto).not.toContain('Luis')
    expect(devuelto).not.toContain('+34600333444')
  })
})
