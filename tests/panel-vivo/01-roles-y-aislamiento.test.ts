/**
 * El panel contra la base de datos de verdad.
 *
 * QUE PRUEBA ESTE ARCHIVO Y QUE NO
 *
 * Aqui NO se levanta ningun navegador ni se pulsa ningun boton: eso es
 * `tests/e2e/`. Lo de aqui es la mitad que importa cuando alguien se salta el
 * boton, y por eso corre en `pnpm test` y no hace falta Playwright para verla.
 *
 * Las tres cosas, en el orden en que se pierden:
 *
 *   1. El rol `lectura` no puede escribir NADA, y no porque el panel le
 *      esconda el boton, sino porque la base le dice que no. Esconder un boton
 *      es comodidad; esto es la garantia.
 *   2. Un usuario de la clinica A no recibe NI UNA fila de la B por ninguna de
 *      las tablas que lee el panel.
 *   3. Apagar el interruptor deja al bot sin esa fila EN EL PROMPT MONTADO. No
 *      se comprueba la columna: se monta el prompt y se mira si el texto sigue
 *      ahi. Comprobar la columna seria comprobar que un `update` actualiza.
 *
 * LA TRAMPA DE F1 §5.2, QUE AQUI VUELVE A ACECHAR
 *
 * «El `update` devolvio cero filas» y «la fila no existia» se parecen
 * demasiado. Un test que solo mire la lista vacia pasa igual si el fixture se
 * ha ido al garete. Por eso cada aserción negativa comprueba ANTES con
 * `service_role` que la fila existe, y DESPUES que sigue con su valor de
 * siempre.
 */
import { beforeAll, expect, it, onTestFinished } from 'vitest'

import { cargarDatosDelPrompt } from '@/lib/barandillas/filtro'
import { montarPromptDeDatos } from '@/lib/barandillas/montaje'

import { clienteBot, clienteServicio, clienteUsuario } from '../ayuda/clientes'
import { CONTRASENA, USUARIOS } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

/**
 * PEREZOSO A PROPOSITO, Y COSTO EL PRIMER CI QUE CORRIO DESDE F1.
 *
 * `clienteServicio()` construye el cliente de Supabase, y sin credenciales
 * `createClient` LANZA («supabaseUrl is required»). Llamandolo al nivel del
 * modulo, eso reventaba la RECOLECCION del archivo entero —antes de que
 * `describeVivo` tuviera ocasion de saltarselo—, asi que en una maquina recien
 * clonada, y en el CI, la suite se ponia ROJA por no tener entorno. Que es lo
 * contrario de lo que hace el resto del nivel 2, que se salta y avisa.
 *
 * Nadie lo vio en cinco fases porque todo el mundo tenia .env.local y el CI
 * llevaba sin correr desde F1. Ver ESTADO_F7 §7.4.
 */
let elServicio: ReturnType<typeof clienteServicio> | null = null
const servicio = () => (elServicio ??= clienteServicio())

/** La fila existe y vale lo que decimos, mirado con service_role. */
async function exigirValor(tabla: string, id: string, columna: string, esperado: unknown) {
  const { data, error } = await servicio().from(tabla).select(`id, ${columna}`).eq('id', id).single()
  expect(error, `No se ha podido leer ${tabla}#${id} con service_role`).toBeNull()
  expect(
    (data as Record<string, unknown> | null)?.[columna],
    `${tabla}#${id}.${columna} no vale lo que este test da por hecho. Sin eso, lo que venga ` +
      'despues seria verde por ausencia, no por permiso (ESTADO_F1 §5.2).',
  ).toBe(esperado)
}

describeVivo('el rol lectura no escribe. Lo dice la base, no el panel', () => {
  let lectura: Awaited<ReturnType<typeof clienteUsuario>>
  let recepcion: Awaited<ReturnType<typeof clienteUsuario>>

  beforeAll(async () => {
    lectura = await clienteUsuario(USUARIOS.aLectura.email, CONTRASENA)
    recepcion = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)
  })

  it('LECTURA: apagar el interruptor de una FAQ no cambia nada', async () => {
    const s = sembrado()
    await exigirValor('faq', s.faqAPublica, 'publico', true)

    const { data, error } = await lectura
      .from('faq')
      .update({ publico: false })
      .eq('id', s.faqAPublica)
      .select('id')

    // La RLS no da error en un UPDATE que su USING no deja pasar: devuelve
    // cero filas y un 200. Por eso el panel mira SIEMPRE lo que vuelve.
    expect(error).toBeNull()
    expect(data).toEqual([])

    // Y la mitad que impide el falso verde: la fila sigue encendida.
    await exigirValor('faq', s.faqAPublica, 'publico', true)
  })

  it('LECTURA: tampoco puede cambiar el estado de una cita', async () => {
    const s = sembrado()
    await exigirValor('citas', s.citaA, 'estado', 'confirmada')

    const { data, error } = await lectura
      .from('citas')
      .update({ estado: 'cancelada' })
      .eq('id', s.citaA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
    await exigirValor('citas', s.citaA, 'estado', 'confirmada')
  })

  it('LECTURA: tampoco puede tocar la cola de avisos', async () => {
    const s = sembrado()
    await exigirValor('escalados', s.escaladoA, 'estado', 'pendiente')

    const { data, error } = await lectura
      .from('escalados')
      .update({ estado: 'resuelto' })
      .eq('id', s.escaladoA)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
    await exigirValor('escalados', s.escaladoA, 'estado', 'pendiente')
  })

  it('LECTURA: tampoco puede dejar un apunte de auditoria', async () => {
    const s = sembrado()
    const usuario = await lectura.auth.getUser()

    const { error } = await lectura.from('auditoria').insert({
      clinica_id: s.clinicaA,
      actor: usuario.data.user?.id ?? '',
      accion: 'publico_encendido',
      tabla: 'faq',
      fila_id: s.faqAPublica,
    })

    // Aqui si hay error, y es el de siempre: un INSERT que no pasa el WITH
    // CHECK devuelve 42501. La diferencia con el UPDATE de arriba no es un
    // capricho de Postgres: en un UPDATE la fila simplemente no se encuentra.
    expect(error?.code).toBe('42501')
  })

  it('...Y RECEPCION SI PUEDE: la puerta no esta rota, esta cerrada', async () => {
    // Sin esta mitad, las cuatro de arriba seguirian verdes con la tabla
    // `auditoria` inaccesible para todo el mundo, o con la migracion 008 sin
    // aplicar. Es el mismo par que ESTADO_F3 §5.2.
    const s = sembrado()
    const usuario = await recepcion.auth.getUser()
    const actor = usuario.data.user?.id ?? ''

    const { data, error } = await recepcion
      .from('auditoria')
      .insert({
        clinica_id: s.clinicaA,
        actor,
        accion: 'publico_apagado',
        tabla: 'faq',
        fila_id: s.faqAPublica,
        datos: { antes: true, despues: false },
      })
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const creado = (data as { id: number }[])[0]!.id
    onTestFinished(async () => {
      // Con service_role: la 004 revoca DELETE sobre `auditoria` a todo el
      // mundo, que es justo lo que hace que el rastro sirva de algo.
      await servicio().from('auditoria').delete().eq('id', creado)
    })
  })

  it('RECEPCION no puede firmar un apunte con el nombre de otro', async () => {
    // La tercera linea del WITH CHECK de la migracion 008. Un registro que se
    // puede firmar por otro no es un registro: es una coartada.
    const s = sembrado()

    const { error } = await recepcion.from('auditoria').insert({
      clinica_id: s.clinicaA,
      actor: '00000000-0000-4000-8000-000000000000',
      accion: 'publico_encendido',
      tabla: 'faq',
      fila_id: s.faqAPublica,
    })

    expect(error?.code).toBe('42501')
  })

  it('NADIE puede editar ni borrar un apunte ya escrito', async () => {
    const s = sembrado()

    const cambio = await recepcion
      .from('auditoria')
      .update({ accion: 'publico_encendido' })
      .eq('id', s.auditoriaA)
      .select('id')
    expect(cambio.error?.code).toBe('42501')

    const borrado = await recepcion.from('auditoria').delete().eq('id', s.auditoriaA).select('id')
    expect(borrado.error?.code).toBe('42501')

    await exigirValor('auditoria', String(s.auditoriaA), 'accion', 'insert')
  })
})

describeVivo('un usuario de la clinica A no ve NI UNA fila de la B', () => {
  // Las nueve tablas que lee el panel, cada una con la fila de B que existe de
  // verdad. Si una consulta del panel repitiera `.eq('clinica_id', ...)`, este
  // barrido seguiria verde con la politica rota: por eso existe ademas el
  // guardian estatico de tests/panel/.
  const TABLAS = [
    { tabla: 'clinicas', columna: 'id', fila: (s: ReturnType<typeof sembrado>) => s.clinicaB },
    { tabla: 'tratamientos', columna: 'clinica_id', fila: (s: ReturnType<typeof sembrado>) => s.tratamientoBPublico },
    { tabla: 'faq', columna: 'clinica_id', fila: (s: ReturnType<typeof sembrado>) => s.faqBPublica },
    { tabla: 'pacientes', columna: 'clinica_id', fila: (s: ReturnType<typeof sembrado>) => s.pacienteB },
    { tabla: 'conversaciones', columna: 'clinica_id', fila: (s: ReturnType<typeof sembrado>) => s.conversacionB },
    { tabla: 'mensajes', columna: 'clinica_id', fila: (s: ReturnType<typeof sembrado>) => String(s.mensajeB) },
  ] as const

  it.each(TABLAS.map((t) => t.tabla))(
    'el propietario de A no recibe la fila de B en %s',
    async (tabla) => {
      const s = sembrado()
      const descriptor = TABLAS.find((t) => t.tabla === tabla)!
      const idDeB = descriptor.fila(s)

      // Primero: esa fila de B existe. Si no existiera, lo de abajo seria
      // verde por ausencia.
      const deVerdad = await servicio().from(tabla).select('id').eq('id', idDeB)
      expect(deVerdad.data, `La fila de B en ${tabla} no existe: el fixture esta roto`).toHaveLength(1)

      const propietarioA = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)
      const { data, error } = await propietarioA.from(tabla).select('*')

      expect(error).toBeNull()

      // El cast es porque `tabla` es una union de seis nombres y el tipo de la
      // respuesta seria la union de sus seis filas. No afloja ninguna
      // comprobacion: lo que se mira es el contenido de cada fila.
      const filas = (data ?? []) as unknown as Record<string, unknown>[]
      const ajenas = filas.filter((fila) => fila[descriptor.columna] !== s.clinicaA)

      expect(ajenas, `El panel de A ha recibido filas ajenas de ${tabla}`).toEqual([])
      expect(filas.map((fila) => String(fila.id))).not.toContain(String(idDeB))
    },
  )

  it('y el marcador de lo confidencial de A tampoco viaja al panel de B', async () => {
    // El propietario de B es un usuario legitimo con todos los permisos de SU
    // clinica. Es el probador que importa: con `anon` esto saldria verde
    // aunque la RLS estuviera apagada, porque `anon` no tiene ni los GRANT
    // (ESTADO_F1 §5, observación 2).
    const s = sembrado()
    const propietarioB = await clienteUsuario(USUARIOS.bPropietario.email, CONTRASENA)

    const { data } = await propietarioB.from('faq').select('*')
    expect(JSON.stringify(data ?? [])).not.toContain(s.faqAConfidencial)
    expect(JSON.stringify(data ?? [])).not.toContain('ZZMARGEN-7f3a')
  })
})

describeVivo('EL TOGGLE DE VERDAD: lo que se apaga aqui deja de llegar al bot', () => {
  it('apagar una FAQ con el usuario de recepcion la borra DEL PROMPT MONTADO', async () => {
    const s = sembrado()
    const recepcion = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)

    // 1 · De partida, el bot la dice: esta en el prompt, con todas sus letras.
    const datosAntes = await cargarDatosDelPrompt(s.clinicaA, clienteBot(s.clinicaA))
    const antes = montarPromptDeDatos(datosAntes)
    expect(
      antes.texto,
      'El fixture no arranca como este test da por hecho: si la respuesta no estaba en el ' +
        'prompt al principio, apagarla no demuestra nada.',
    ).toContain('En la calle Mayor 1.')

    // 2 · Recepcion la apaga. Esto es exactamente lo que hace el interruptor
    //     del panel: un update sobre `publico`, sin tocar nada mas.
    onTestFinished(async () => {
      await servicio().from('faq').update({ publico: true }).eq('id', s.faqAPublica)
    })

    const { data, error } = await recepcion
      .from('faq')
      .update({ publico: false })
      .eq('id', s.faqAPublica)
      .select('id, publico')

    expect(error).toBeNull()
    expect(data, 'Recepcion tiene que poder apagarlo: si no, el resto no prueba nada').toHaveLength(1)

    // 3 · Y ahora la parte que importa: NO se comprueba la columna. Se vuelve
    //     a montar el prompt con el cliente del bot y se mira si el texto
    //     sigue ahi. La fila ya no existe para el bot: no es que no la use, es
    //     que su consulta no la devuelve.
    const despues = await cargarDatosDelPrompt(s.clinicaA, clienteBot(s.clinicaA))
    const montado = montarPromptDeDatos(despues)

    expect(montado.texto).not.toContain('En la calle Mayor 1.')
    expect(despues.faq.filas.map(({ dato }) => dato.id)).not.toContain(s.faqAPublica)

    // Y el contador lo nota: exactamente una fila menos de las que veia. El
    // numero exacto importa —no un `toBeLessThan`— porque apagar una fila y
    // que desaparezcan tres es tan sintoma como que no desaparezca ninguna.
    expect(despues.faq.recuento.total).toBe(datosAntes.faq.recuento.total - 1)

    // Y `retenidas` sigue en cero: la fila no ha llegado para que el codigo la
    // descarte, es que la RLS no la ha devuelto. Esa es la barandilla 1; si
    // aqui saliera 1, la fila habria llegado al proceso del bot.
    expect(despues.faq.recuento.retenidas).toBe(0)
  })

  it('y volver a encenderla la devuelve al prompt', async () => {
    // La otra mitad. Sin esta, el test de arriba seguiria verde con la FAQ
    // borrada, con el fixture roto o con el montador devolviendo siempre
    // cadena vacia.
    const s = sembrado()
    const recepcion = await clienteUsuario(USUARIOS.aRecepcion.email, CONTRASENA)

    await recepcion.from('faq').update({ publico: false }).eq('id', s.faqAPublica).select('id')
    const apagada = montarPromptDeDatos(await cargarDatosDelPrompt(s.clinicaA, clienteBot(s.clinicaA)))
    expect(apagada.texto).not.toContain('En la calle Mayor 1.')

    await recepcion.from('faq').update({ publico: true }).eq('id', s.faqAPublica).select('id')
    const encendida = montarPromptDeDatos(await cargarDatosDelPrompt(s.clinicaA, clienteBot(s.clinicaA)))
    expect(encendida.texto).toContain('En la calle Mayor 1.')
  })
})
