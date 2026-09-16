/**
 * pacientes · conversaciones · mensajes · citas · escalados.
 *
 * Las tablas que escribe el bot. Aqui lo que se comprueba no es que no vea,
 * sino que no pueda hacer mas de lo que le toca: confirmar lo que el mismo
 * reservo, y nada mas.
 */
import { beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteServicio, clienteUsuario } from '../ayuda/clientes'
import { CONTRASENA, USUARIOS, type Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

describeVivo('pacientes', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it('pacientes_bot_select: el bot ve los pacientes de su clinica', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot.from('pacientes').select('id')

    expect(error).toBeNull()
    expect((data as { id: string }[]).map((p) => p.id)).toEqual([s.pacienteA])
  })

  it('pacientes_bot_select: el bot no ve pacientes de otra clinica', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data } = await bot.from('pacientes').select('id').eq('id', s.pacienteB)

    expect(data).toEqual([])
  })

  it('pacientes_bot_insert: el bot puede dar de alta un paciente suyo', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot
      .from('pacientes')
      .insert({ clinica_id: s.clinicaA, nombre: 'Nuevo', telefono_e164: '+34600999888' })
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await clienteServicio()
      .from('pacientes')
      .delete()
      .eq('id', (data as { id: string }[])[0]!.id)
  })

  it('pacientes_bot_insert: el WITH CHECK impide darlo de alta en otra clinica', async () => {
    const bot = clienteBot(s.clinicaA)
    const { error } = await bot
      .from('pacientes')
      .insert({ clinica_id: s.clinicaB, nombre: 'Colado', telefono_e164: '+34600999777' })

    expect(error?.code).toBe('42501')
  })

  it('pacientes_bot_update: el bot puede completar la ficha', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot
      .from('pacientes')
      .update({ apellidos: 'Perez Lopez' })
      .eq('id', s.pacienteA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

describeVivo('conversaciones y mensajes', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it('conversaciones_bot_select: el bot ve solo las suyas', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot.from('conversaciones').select('id')

    expect(error).toBeNull()
    expect((data as { id: string }[]).map((c) => c.id)).toEqual([s.conversacionA])
  })

  it('conversaciones_bot_update: el bot puede mover la ventana de 24 h', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot
      .from('conversaciones')
      .update({ ultima_actividad: new Date().toISOString() })
      .eq('id', s.conversacionA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('conversaciones_clinica_select: el panel las lee', async () => {
    const panel = await clienteUsuario(USUARIOS.aLectura.email, CONTRASENA)
    const { data, error } = await panel.from('conversaciones').select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('conversaciones: el panel NO escribe (esta version no tiene bandeja humana)', async () => {
    const panel = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)
    const { data, error } = await panel
      .from('conversaciones')
      .update({ requiere_humano: true })
      .eq('id', s.conversacionA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('mensajes_bot_select: el bot lee el historial de su clinica', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot.from('mensajes').select('id')

    expect(error).toBeNull()
    expect((data as { id: number }[]).map((m) => m.id)).toEqual([s.mensajeA])
  })

  it('mensajes_bot_select: el bot no lee el historial de la otra clinica', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data } = await bot.from('mensajes').select('id').eq('id', s.mensajeB)

    expect(data).toEqual([])
  })

  it('mensajes_bot_insert: el bot guarda cada mensaje', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot
      .from('mensajes')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: s.conversacionA,
        rol: 'bot',
        texto: 'Buenos dias, soy el asistente virtual.',
      })
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('mensajes: nadie del panel puede borrar el historial', async () => {
    const panel = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)
    const { error } = await panel.from('mensajes').delete().eq('id', s.mensajeA)

    // Ni siquiera tiene el GRANT: el borrado a 90 dias es del job, de nadie mas.
    expect(error).not.toBeNull()
  })
})

describeVivo('citas', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it('citas_bot_select: el bot ve la agenda de su clinica', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot.from('citas').select('id')

    expect(error).toBeNull()
    expect((data as { id: string }[]).map((c) => c.id)).toContain(s.citaA)
  })

  it('citas_bot_insert: el bot no puede hacerse pasar por recepcion', async () => {
    const bot = clienteBot(s.clinicaA)
    const dentro = new Date(Date.now() + 72 * 60 * 60 * 1000)
    const { error } = await bot.from('citas').insert({
      clinica_id: s.clinicaA,
      paciente_id: s.pacienteA,
      tratamiento_id: s.tratamientoAPublico,
      gabinete_id: s.gabineteA2,
      inicio: dentro.toISOString(),
      fin: new Date(dentro.getTime() + 30 * 60 * 1000).toISOString(),
      estado: 'confirmada',
      quien_reserva: 'recepcion', // <- lo que el WITH CHECK prohibe
      motivo_cerrado: 'revision',
    })

    expect(error?.code).toBe('42501')
  })

  it('citas_bot_update: el bot NO puede cancelar una cita confirmada', async () => {
    // El USING de la politica solo alcanza las provisionales. Una cita ya
    // confirmada es invisible para su UPDATE.
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot
      .from('citas')
      .update({ estado: 'cancelada' })
      .eq('id', s.citaA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('citas_bot_update: el bot SI puede confirmar una provisional suya', async () => {
    const bot = clienteBot(s.clinicaA)
    const dentro = new Date(Date.now() + 96 * 60 * 60 * 1000)

    const { data: creada, error: errorCrear } = await bot
      .from('citas')
      .insert({
        clinica_id: s.clinicaA,
        paciente_id: s.pacienteA,
        tratamiento_id: s.tratamientoAPublico,
        gabinete_id: s.gabineteA2,
        inicio: dentro.toISOString(),
        fin: new Date(dentro.getTime() + 30 * 60 * 1000).toISOString(),
        estado: 'provisional',
        expira_en: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        quien_reserva: 'bot',
        motivo_cerrado: 'revision',
      })
      .select('id')
    expect(errorCrear).toBeNull()
    const id = (creada as { id: string }[])[0]!.id

    const { data: confirmada, error } = await bot
      .from('citas')
      .update({ estado: 'confirmada' })
      .eq('id', id)
      .select('id, estado')
    expect(error).toBeNull()
    expect(confirmada).toHaveLength(1)

    // Y ya no puede volver a tocarla: ha dejado de ser provisional.
    const { data: segundoIntento } = await bot
      .from('citas')
      .update({ estado: 'cancelada' })
      .eq('id', id)
      .select('id')
    expect(segundoIntento).toEqual([])

    await clienteServicio().from('citas').delete().eq('id', id)
  })

  it('citas_clinica_update: recepcion si puede cancelar', async () => {
    const panel = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)
    const { data, error } = await panel
      .from('citas')
      .update({ estado: 'cancelada' })
      .eq('id', s.citaA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await panel.from('citas').update({ estado: 'confirmada' }).eq('id', s.citaA)
  })
})

describeVivo('escalados', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it('escalados_bot_insert: el bot solo crea escalados pendientes', async () => {
    const bot = clienteBot(s.clinicaA)
    const { error } = await bot.from('escalados').insert({
      clinica_id: s.clinicaA,
      motivo: 'urgencia_grave',
      estado: 'resuelto', // <- no puede darlo por resuelto el mismo
      asunto: 'urgencia',
    })

    expect(error?.code).toBe('42501')
  })

  it('escalados: una conversacion no puede tener dos escalados pendientes', async () => {
    // La leccion del 11/09 de V1: el modelo escalo cuatro veces seguidas.
    const bot = clienteBot(s.clinicaA)
    const { error } = await bot.from('escalados').insert({
      clinica_id: s.clinicaA,
      conversacion_id: s.conversacionA,
      motivo: 'pidio_persona',
      asunto: 'otro',
    })

    expect(error?.code).toBe('23505')
  })

  it('escalados: el bot no puede resolver un escalado', async () => {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot
      .from('escalados')
      .update({ estado: 'resuelto' })
      .eq('id', s.escaladoA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('escalados_clinica_update: recepcion resuelve la cola', async () => {
    const panel = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)
    const { data, error } = await panel
      .from('escalados')
      .update({ estado: 'resuelto', resuelto_en: new Date().toISOString() })
      .eq('id', s.escaladoA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await panel
      .from('escalados')
      .update({ estado: 'pendiente', resuelto_en: null })
      .eq('id', s.escaladoA)
  })
})
