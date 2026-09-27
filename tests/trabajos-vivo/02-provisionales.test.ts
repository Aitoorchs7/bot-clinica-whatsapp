/**
 * Las provisionales caducadas se liberan Y EL HUECO VUELVE A OFRECERSE.
 *
 * Nivel 2. Aquí no hay nada simulado: se ejecuta la función de verdad, con el
 * rol de verdad (`postgres`, el mismo que usa `pg_cron`), contra la base de
 * verdad, y lo que se mide es lo que ve el bot.
 *
 * ============ LA ASERCION QUE IMPORTA NO ES `estado` ============
 *
 * Es el FALLO #4 del contrato y es el eco directo del interruptor de F5: allí
 * se midió que comprobar que un `update` actualiza la columna NO demuestra que
 * el efecto llegue a donde tiene que llegar. Un `liberar_provisionales()` que
 * pusiera `estado = 'no_presentada'` pasaría cualquier prueba que mirase «¿ya
 * no está provisional?», y el hueco seguiría bloqueado, porque
 * `consultar_huecos` excluye `provisional`, `confirmada` Y `completada`.
 *
 * Así que la pregunta no se le hace a la columna: se le hace a
 * `consultar_huecos`, que es de donde el bot saca lo único que puede ofrecerle
 * a un paciente.
 *
 * ============ Y POR QUE NO LO HACE EL BOT ============
 *
 * Porque no puede, y está medido: `citas_bot_update` admite
 * `provisional -> confirmada` y nada más. Un intento de cancelar se lleva un
 * `42501`. Hay una prueba aquí abajo que lo exige, porque el día que alguien
 * ensanche esa política para «arreglar» algo, esto tiene que ponerse rojo.
 */
import { afterEach, beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { liberarProvisionales } from '../ayuda/mantenimiento'
import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

type Hueco = { inicio: string; fin: string; gabinete_id: string }

describeVivo('la liberacion de provisionales caducadas', () => {
  let s: Sembrado
  const creadas: string[] = []

  beforeAll(() => {
    s = sembrado()
  })

  afterEach(async () => {
    if (creadas.length > 0) {
      await clienteServicio().from('citas').delete().in('id', creadas)
      creadas.length = 0
    }
  })

  /**
   * Un hueco concreto de la agenda de A, mañana, lejos de lo que siembra F1.
   *
   * En punto y en `gabineteA2` para que no choque con la cita sembrada, y
   * dentro del horario de la clínica (9:00-14:00 y 15:30-20:00 de lunes a
   * viernes) para que `consultar_huecos` lo genere.
   */
  function proximoHueco(): Date {
    const cuando = new Date()
    // Se busca un día laborable a 48 h vista, para no caer en sábado o domingo.
    cuando.setUTCDate(cuando.getUTCDate() + 2)
    while (cuando.getUTCDay() === 0 || cuando.getUTCDay() === 6) {
      cuando.setUTCDate(cuando.getUTCDate() + 1)
    }
    cuando.setUTCHours(9, 0, 0, 0)
    return cuando
  }

  /** Lo que el BOT ve libre en ese gabinete a esa hora exacta. */
  async function seOfrece(inicio: Date): Promise<boolean> {
    const bot = clienteBot(s.clinicaA)
    const { data, error } = await bot.rpc('consultar_huecos', {
      p_clinica: s.clinicaA,
      p_tratamiento: s.tratamientoAPublico,
      p_desde: new Date(inicio.getTime() - 3600_000).toISOString(),
      p_hasta: new Date(inicio.getTime() + 3600_000).toISOString(),
    })

    if (error) throw new Error(`consultar_huecos: ${error.message}`)

    return ((data ?? []) as unknown as Hueco[]).some(
      (h) => h.gabinete_id === s.gabineteA2 && new Date(h.inicio).getTime() === inicio.getTime(),
    )
  }

  async function provisionalCaducada(inicio: Date): Promise<string> {
    const { data, error } = await clienteServicio()
      .from('citas')
      .insert({
        clinica_id: s.clinicaA,
        paciente_id: s.pacienteA,
        tratamiento_id: s.tratamientoAPublico,
        gabinete_id: s.gabineteA2,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
        estado: 'provisional',
        // Caducó hace una hora: el paciente nunca confirmó.
        expira_en: new Date(Date.now() - 3600_000).toISOString(),
        quien_reserva: 'bot',
        motivo_cerrado: 'revision',
      } as never)
      .select('id')
      .single()

    if (error) throw new Error(`Sembrando la provisional: ${error.message}`)
    const id = (data as { id: string }).id
    creadas.push(id)
    return id
  }

  // ---------------------------------------------------------------------------

  it('LA PRUEBA DE LA FASE: el hueco se tapa, se libera, y VUELVE A OFRECERSE', async () => {
    const inicio = proximoHueco()

    // 1 · Antes de nada, el hueco está libre. Sin esto, todo lo demás podría
    //     pasar con una agenda en la que ese hueco no existiera nunca: sería el
    //     falso verde por ausencia de ESTADO_F1 §5.2.
    expect(
      await seOfrece(inicio),
      'El hueco no estaba libre ANTES de empezar: esta prueba no probaría nada.',
    ).toBe(true)

    // 2 · Una provisional caducada lo tapa. Y lo tapa AUNQUE ESTE CADUCADA,
    //     que es justo el problema: `consultar_huecos` excluye por `estado` y
    //     no mira `expira_en`.
    const cita = await provisionalCaducada(inicio)
    expect(
      await seOfrece(inicio),
      'Una provisional no está bloqueando el hueco. Entonces dos pacientes pueden ' +
        'coger la misma hora mientras uno de los dos confirma.',
    ).toBe(false)

    // 3 · El trabajo, ejecutado de verdad y con el rol de `pg_cron`.
    const liberadas = liberarProvisionales()
    expect(liberadas).toBeGreaterThanOrEqual(1)

    // 4 · Y LA LINEA: el hueco vuelve a estar a la venta. Medido con
    //     `consultar_huecos`, no con la columna `estado`.
    expect(
      await seOfrece(inicio),
      'La cita se liberó pero el hueco NO ha vuelto a ofrecerse. Comprobar que un ' +
        'update actualiza no prueba nada: el paciente sigue sin poder coger esa hora.',
    ).toBe(true)

    // Y de paso, en qué estado quedó. Va AL FINAL y no en lugar de lo de
    // arriba: es información, no la garantía.
    const { data } = await clienteServicio()
      .from('citas')
      .select('estado')
      .eq('id', cita)
      .single()
    expect((data as { estado: string }).estado).toBe('cancelada')
  })

  it('una provisional QUE NO HA CADUCADO no se toca', async () => {
    // La pareja de la de arriba. Sin ella, `liberar_provisionales()` podría
    // cancelarlo todo y seguiría pasando la primera: el hueco volvería a
    // ofrecerse igual, y le habríamos quitado la reserva a alguien que estaba
    // confirmándola en ese momento.
    const inicio = proximoHueco()
    inicio.setUTCHours(11, 0, 0, 0)

    const { data: creada, error } = await clienteServicio()
      .from('citas')
      .insert({
        clinica_id: s.clinicaA,
        paciente_id: s.pacienteA,
        tratamiento_id: s.tratamientoAPublico,
        gabinete_id: s.gabineteA2,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
        estado: 'provisional',
        // Le quedan diez minutos de vida.
        expira_en: new Date(Date.now() + 600_000).toISOString(),
        quien_reserva: 'bot',
        motivo_cerrado: 'revision',
      } as never)
      .select('id')
      .single()

    if (error) throw new Error(`Sembrando la provisional viva: ${error.message}`)
    const id = (creada as { id: string }).id
    creadas.push(id)

    liberarProvisionales()

    const { data } = await clienteServicio().from('citas').select('estado').eq('id', id).single()
    expect(
      (data as { estado: string }).estado,
      'Se ha cancelado una reserva que todavía estaba viva. El paciente la estaba ' +
        'confirmando en ese momento.',
    ).toBe('provisional')

    // Y el hueco sigue tapado, que es lo que esa reserva viva significa.
    expect(await seOfrece(inicio)).toBe(false)
  })

  it('una cita CONFIRMADA no la toca nadie, tenga lo que tenga en expira_en', async () => {
    const inicio = proximoHueco()
    inicio.setUTCHours(12, 0, 0, 0)

    const { data: creada, error } = await clienteServicio()
      .from('citas')
      .insert({
        clinica_id: s.clinicaA,
        paciente_id: s.pacienteA,
        tratamiento_id: s.tratamientoAPublico,
        gabinete_id: s.gabineteA2,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
        estado: 'confirmada',
        // Caducado hace un mes, y da igual: ya no es una retención.
        expira_en: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
        quien_reserva: 'bot',
        motivo_cerrado: 'revision',
      } as never)
      .select('id')
      .single()

    if (error) throw new Error(`Sembrando la confirmada: ${error.message}`)
    const id = (creada as { id: string }).id
    creadas.push(id)

    liberarProvisionales()

    const { data } = await clienteServicio().from('citas').select('estado').eq('id', id).single()
    expect(
      (data as { estado: string }).estado,
      'Se ha cancelado una cita CONFIRMADA. El paciente se presenta y no tiene hueco.',
    ).toBe('confirmada')
  })

  it('EL BOT NO PUEDE HACER ESTO, y por eso lo hace pg_cron', async () => {
    // Si alguien ensancha `citas_bot_update` para que el bot pueda cancelar,
    // esta prueba se pone roja y obliga a volver aquí a leer por qué no debía.
    const inicio = proximoHueco()
    inicio.setUTCHours(13, 0, 0, 0)
    const id = await provisionalCaducada(inicio)

    const { error } = await clienteBot(s.clinicaA)
      .from('citas')
      .update({ estado: 'cancelada' })
      .eq('id', id)
      .select('id')

    expect(
      error?.code,
      'El rol `bot` ha podido cancelar una cita. La liberación de provisionales no ' +
        'necesita ese permiso: la hace pg_cron como postgres.',
    ).toBe('42501')

    // Y la fila sigue como estaba: la prueba de que el rechazo fue real y no
    // que la cita no existiera (ESTADO_F1 §5.2).
    const { data } = await clienteServicio().from('citas').select('estado').eq('id', id).single()
    expect((data as { estado: string }).estado).toBe('provisional')
  })
})
