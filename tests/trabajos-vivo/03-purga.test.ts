/**
 * La purga de 90 días: comprobar que BORRA DE VERDAD.
 *
 * Nivel 2. Se ejecuta `mantenimiento.purgar_historial()` de verdad, como rol
 * `postgres`, que es como la ejecuta `pg_cron`.
 *
 * ============ ESTO NO SE HABIA COMPROBADO NUNCA ============
 *
 * La purga es de F1 (migración 006, reescrita en la 007) y hasta hoy lo único
 * que la miraba era estático: `tests/rls/06` lee el `.sql` y comprueba que DICE
 * `update public.eventos_webhook set carga = null`. Eso demuestra que la
 * migración está escrita, no que Postgres la acepte ni que el job siga vivo.
 * Es la distinción que ESTADO_F1 §5 dejó medida: «la mitad estática no puede
 * ver esto ni en principio».
 *
 * Y es la pieza de la que depende poder decir por escrito que este sistema no
 * trata datos de salud: si un paciente cuenta por WhatsApp que toma
 * anticoagulantes, eso vive en `mensajes` y tiene que desaparecer.
 *
 * ============ POR QUE SE PLANTAN FILAS VIEJAS Y NO SE ACORTA EL PLAZO ============
 *
 * `purgar_historial(0, 5000, 0)` sería más cómodo y BORRARIA EL FIXTURE
 * ENTERO: la función corre como `postgres`, que tiene BYPASSRLS, así que no
 * distingue inquilinos ni respeta a nadie. Se llevaría por delante las
 * conversaciones y los mensajes que siembra F1 y los archivos de prueba
 * siguientes fallarían sin relación aparente — que es exactamente el test
 * destructivo de ESTADO_F1 §5.2, ahora con una escopeta más grande.
 *
 * Así que se planta lo viejo y se llama con los plazos REALES (90 y 7). Lo
 * recién sembrado no los cumple y sobrevive, y además se comprueba que
 * sobrevive: sin esa mitad, un `delete from mensajes` sin `where` pasaría.
 */
import { afterEach, beforeAll, expect, it } from 'vitest'

import { clienteServicio } from '../ayuda/clientes'
import { purgarHistorial } from '../ayuda/mantenimiento'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

const DIA = 24 * 3600_000

describeVivo('la purga de 90 dias', () => {
  let s: Sembrado

  const conversaciones: string[] = []
  const eventos: number[] = []

  beforeAll(() => {
    s = sembrado()
  })

  afterEach(async () => {
    const db = clienteServicio()
    if (conversaciones.length > 0) {
      await db.from('conversaciones').delete().in('id', conversaciones)
      conversaciones.length = 0
    }
    if (eventos.length > 0) {
      await db.from('eventos_webhook').delete().in('id', eventos)
      eventos.length = 0
    }
  })

  /** Una conversación con su mensaje, fechada hace `dias` días. */
  async function conversacionVieja(dias: number): Promise<{ conversacion: string; mensaje: number }> {
    const db = clienteServicio()
    const cuando = new Date(Date.now() - dias * DIA).toISOString()

    const { data: conv, error: errConv } = await db
      .from('conversaciones')
      .insert({
        clinica_id: s.clinicaA,
        telefono_e164: '+34600999888',
        estado: 'cerrada',
        iniciada_en: cuando,
        ultima_actividad: cuando,
      } as never)
      .select('id')
      .single()
    if (errConv) throw new Error(`Sembrando la conversacion vieja: ${errConv.message}`)
    const conversacion = (conv as { id: string }).id
    conversaciones.push(conversacion)

    const { data: msj, error: errMsj } = await db
      .from('mensajes')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: conversacion,
        rol: 'paciente',
        // Justo lo que la purga existe para llevarse.
        texto: 'tomo anticoagulantes desde enero',
        creado_en: cuando,
      } as never)
      .select('id')
      .single()
    if (errMsj) throw new Error(`Sembrando el mensaje viejo: ${errMsj.message}`)

    return { conversacion, mensaje: Number((msj as { id: number }).id) }
  }

  async function existe(tabla: 'conversaciones' | 'mensajes', id: string | number): Promise<boolean> {
    const { count } = await clienteServicio()
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq('id', id as never)
    return (count ?? 0) > 0
  }

  // ---------------------------------------------------------------------------

  it('BORRA DE VERDAD lo que pasa de 90 dias, y NO toca lo reciente', async () => {
    const vieja = await conversacionVieja(100)

    // La guarda: si lo plantado no estuviera ahí, todo lo de abajo pasaría por
    // ausencia (ESTADO_F1 §5.2).
    expect(await existe('conversaciones', vieja.conversacion)).toBe(true)
    expect(await existe('mensajes', vieja.mensaje)).toBe(true)

    const resultado = purgarHistorial(90, 7)

    expect(Number(resultado.conversaciones_borradas ?? 0)).toBeGreaterThanOrEqual(1)

    expect(
      await existe('conversaciones', vieja.conversacion),
      'La conversación de hace 100 días sigue ahí: la purga no está borrando.',
    ).toBe(false)

    // El mensaje cae en cascada con su conversación.
    expect(
      await existe('mensajes', vieja.mensaje),
      'El texto del paciente sigue en la base después de la purga.',
    ).toBe(false)

    // Y LA OTRA MITAD, que es la que impide que esto pase con un `delete` sin
    // `where`: lo recién sembrado sigue entero.
    expect(
      await existe('conversaciones', s.conversacionA),
      'La purga se ha llevado una conversación de hoy. Está borrando de más.',
    ).toBe(true)
    expect(await existe('mensajes', s.mensajeA)).toBe(true)
  })

  it('un mensaje viejo en una conversacion VIVA tambien se va: el plazo es del mensaje', async () => {
    // Una conversación activa hoy puede arrastrar mensajes de hace cuatro
    // meses, y esos también caducan. Es el paso 2 de la función.
    const db = clienteServicio()
    const { data, error } = await db
      .from('mensajes')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: s.conversacionA,
        rol: 'paciente',
        texto: 'esto lo escribi hace cuatro meses',
        creado_en: new Date(Date.now() - 120 * DIA).toISOString(),
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el mensaje antiguo: ${error.message}`)
    const id = Number((data as { id: number }).id)

    expect(await existe('mensajes', id)).toBe(true)

    purgarHistorial(90, 7)

    expect(await existe('mensajes', id)).toBe(false)
    // Su conversación, que está viva, sigue ahí.
    expect(await existe('conversaciones', s.conversacionA)).toBe(true)
  })

  it('`escalados` SOBREVIVE, con conversacion_id y mensaje_id en NULL', async () => {
    // Es lo que F1 §7 eligió a propósito: recepción necesita el historial de
    // casos resueltos, y el detalle clínico vive en `mensajes`, que SÍ se
    // borra. Cuando la purga se lleva el mensaje, el puntero queda en null y el
    // escalado sobrevive sin una palabra de salud dentro.
    const vieja = await conversacionVieja(100)

    const db = clienteServicio()
    const { data, error } = await db
      .from('escalados')
      .insert({
        clinica_id: s.clinicaA,
        conversacion_id: vieja.conversacion,
        mensaje_id: vieja.mensaje,
        motivo: 'urgencia_grave',
        asunto: 'urgencia',
        estado: 'resuelto',
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el escalado: ${error.message}`)
    const escalado = (data as { id: string }).id

    purgarHistorial(90, 7)

    const { data: despues } = await db
      .from('escalados')
      .select('id, conversacion_id, mensaje_id, motivo, asunto')
      .eq('id', escalado)
      .single()

    expect(despues, 'El escalado ha desaparecido con la purga.').not.toBeNull()

    const fila = despues as {
      conversacion_id: string | null
      mensaje_id: number | null
      motivo: string
      asunto: string
    }

    expect(fila.conversacion_id).toBeNull()
    expect(fila.mensaje_id).toBeNull()

    // Lo que SI se queda es vocabulario cerrado, los dos enums. Ni una palabra
    // libre: eso lo quitó la migración 007 y esto lo vuelve a comprobar en el
    // único momento en que se notaría, que es después de purgar.
    expect(fila.motivo).toBe('urgencia_grave')
    expect(fila.asunto).toBe('urgencia')

    await db.from('escalados').delete().eq('id', escalado)
  })

  it('la carga cruda de Meta se VACIA a los 7 dias, y la fila se queda', async () => {
    // La fila sobrevive porque `wa_event_id` es la clave de idempotencia: un
    // reintento de Meta meses después se tiene que seguir reconociendo como
    // duplicado, y para eso no hace falta guardar lo que escribió nadie.
    const db = clienteServicio()
    const { data, error } = await db
      .from('eventos_webhook')
      .insert({
        clinica_id: s.clinicaA,
        wa_event_id: 'purga:hace-diez-dias',
        carga: { mensaje: 'me duele una muela desde el lunes' },
        recibido_en: new Date(Date.now() - 10 * DIA).toISOString(),
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el evento: ${error.message}`)
    const id = Number((data as { id: number }).id)
    eventos.push(id)

    purgarHistorial(90, 7)

    const { data: despues } = await db
      .from('eventos_webhook')
      .select('id, wa_event_id, carga')
      .eq('id', id)
      .single()

    const fila = despues as { wa_event_id: string; carga: unknown } | null

    expect(fila, 'La fila se ha borrado a los 7 días; solo debía perder la carga.').not.toBeNull()
    expect(fila!.wa_event_id).toBe('purga:hace-diez-dias')
    expect(
      fila!.carga,
      'El texto del paciente sigue dentro de eventos_webhook.carga pasados 7 días.',
    ).toBeNull()
  })

  it('a los 90 dias la fila de `eventos_webhook` desaparece entera', async () => {
    const db = clienteServicio()
    const { data, error } = await db
      .from('eventos_webhook')
      .insert({
        clinica_id: s.clinicaA,
        wa_event_id: 'purga:hace-cien-dias',
        carga: null,
        recibido_en: new Date(Date.now() - 100 * DIA).toISOString(),
      } as never)
      .select('id')
      .single()
    if (error) throw new Error(`Sembrando el evento viejo: ${error.message}`)
    const id = Number((data as { id: number }).id)

    purgarHistorial(90, 7)

    const { count } = await db
      .from('eventos_webhook')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(0)
  })

  it('EL JOB SIGUE PROGRAMADO en pg_cron, que es lo que hace que todo esto corra solo', async () => {
    // Todo lo de arriba comprueba que la FUNCION borra. Si el job desapareciera
    // de `cron.job`, la función seguiría siendo perfecta y no la llamaría nadie
    // nunca, y lo único que pasaría es que el historial dejaría de borrarse en
    // silencio. Se comprueban los dos jobs: la purga de F1 y la liberación de F6.
    const { consultaDeMantenimiento } = await import('../ayuda/mantenimiento')
    const filas = consultaDeMantenimiento(
      'select jobname, schedule, active from cron.job order by jobname',
    ) as { jobname: string; schedule: string; active: boolean }[]

    const porNombre = new Map(filas.map((f) => [f.jobname, f]))

    expect(porNombre.get('purgar-historial-90-dias')?.schedule).toBe('15 3 * * *')
    expect(porNombre.get('purgar-historial-90-dias')?.active).toBe(true)
    expect(porNombre.get('liberar-provisionales-caducadas')?.schedule).toBe('*/5 * * * *')
    expect(porNombre.get('liberar-provisionales-caducadas')?.active).toBe(true)
  })
})
