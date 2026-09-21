/**
 * UNA CITA COMPLETA POR EL CANAL DE VERDAD, MENSAJE A MENSAJE.
 *
 * =========================================================================
 * POR QUE ESTE ARCHIVO ENTRA POR `procesarMensaje()` Y NO POR `responder()`
 * =========================================================================
 *
 * La primera version de esta prueba llamaba a `responder()` copiando a mano la
 * convencion de `procesar.ts` —con historial, sin borrador, sin rondas— y
 * medio bien el agujero: `crear_cita` devolvia `faltan_datos` y cero citas.
 *
 * Pero al arreglar `procesar.ts`, LA PRUEBA SIGUIO EN VERDE. Y tenia razon en
 * seguir verde: no estaba mirando el canal, estaba mirando una copia del canal
 * que yo habia escrito al lado. `procesar.ts` cambio y la copia no, porque las
 * copias no cambian solas.
 *
 * Es la regla de ESTADO_F3 §1 con otra cara: «un doble que imitara el bucle de
 * herramientas comprobaria el doble, no el bot». Aqui el doble no era el
 * modelo: era el LLAMANTE. Y un llamante de mentira comprueba al llamante de
 * mentira.
 *
 * Asi que ahora entra por `procesarMensaje()`, que es la funcion que corre
 * cuando a una clinica le escribe un paciente. Lo unico simulado es lo que
 * habla con fuera: Meta (`fetch`) y el modelo. La base de datos, el debounce,
 * el guardado de mensajes, la ventana de 24 h, el borrador y el motor entero
 * corren de verdad.
 *
 * =========================================================================
 * LO QUE MIDE
 * =========================================================================
 *
 * Cuatro mensajes de WhatsApp seguidos, cada uno con su llamada a
 * `procesarMensaje()`, como llegan de verdad: uno, respuesta, otro, respuesta.
 * El modelo hace EXACTAMENTE lo que manda el bloque 50 —anotar solo lo que el
 * paciente acaba de decir, y no volver a anotar lo de antes—. Al final tiene
 * que haber UNA CITA en la base.
 *
 * Antes de la migracion 010 no habia ninguna: el borrador empezaba vacio en
 * cada mensaje y `crear_cita` moria en `faltan_datos`. Ver ESTADO_F7 §4.2.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import type { Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

import type { Modelo, Parte, Respuesta } from '@/lib/bot/gemini'
import { guardarBorrador } from '@/lib/whatsapp/almacen'
import { olvidarMapa } from '@/lib/whatsapp/config'
import type { Entrante } from '@/lib/whatsapp/botones'
import { procesarMensaje } from '@/lib/whatsapp/procesar'

describeVivo('una cita entera por el canal, mensaje a mensaje', () => {
  let s: Sembrado
  const TELEFONO = '+34600889999'
  let quejas: string[] = []

  /**
   * Meta simulada: acepta y devuelve un wamid distinto cada vez.
   *
   * El contador es DEL ARCHIVO, no de cada `metaFalsa()`. Empezando de cero en
   * cada prueba, el primer saliente de la segunda repetia el `wamid.CANAL.1`
   * de la primera, el indice unico de `mensajes` lo rechazaba y el canal se
   * quejaba. Era un fallo del probador y no del producto — y lo cazo la
   * asercion de `quejas`, que para eso esta: `procesar.ts` se traga los
   * fallos de envio a proposito, asi que sin mirarlas una prueba puede estar
   * verde con el guardado roto del todo.
   */
  let salientes = 0
  function metaFalsa(): typeof fetch {
    return vi.fn(async () => {
      salientes += 1
      return new Response(
        JSON.stringify({ messages: [{ id: `wamid.CANAL.${Date.now()}.${salientes}` }] }),
        { status: 200 },
      )
    }) as unknown as typeof fetch
  }

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
      nombrePerfil: 'Ana',
    }
  }

  async function limpiar(): Promise<void> {
    const db = clienteServicio()
    const { data } = await db.from('conversaciones').select('id').eq('telefono_e164', TELEFONO)
    for (const fila of (data ?? []) as { id: string }[]) {
      await db.from('citas').delete().eq('conversacion_id', fila.id)
      await db.from('escalados').delete().eq('conversacion_id', fila.id)
    }
    await db.from('conversaciones').delete().eq('telefono_e164', TELEFONO)
    await db.from('pacientes').delete().eq('telefono_e164', TELEFONO)
  }

  beforeAll(async () => {
    s = sembrado()
    process.env.WHATSAPP_CLINICAS = JSON.stringify({
      [s.numeroWaA]: s.clinicaA,
      [s.numeroWaB]: s.clinicaB,
    })
    olvidarMapa()
    await limpiar()
  })

  afterAll(async () => {
    await limpiar()
    delete process.env.WHATSAPP_CLINICAS
    olvidarMapa()
  })

  it('CUATRO MENSAJES DE WHATSAPP -> UNA CITA EN LA BASE', async () => {
    const db = clienteServicio()
    quejas = []

    // Un dia laborable lejos de los que usan los otros guiones.
    const dia = new Date()
    dia.setUTCDate(dia.getUTCDate() + 40)
    while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
      dia.setUTCDate(dia.getUTCDate() + 1)
    }
    const DIA = dia.toISOString().slice(0, 10)

    let horaOfrecida = ''
    const vistos: Parte[] = []

    // UNA sola Meta para los cuatro mensajes. Con una por mensaje, el
    // contador se reiniciaba y los cuatro salientes se guardaban con el mismo
    // `wamid.CANAL.1`: el indice unico de `mensajes` lo rechazaba y el canal
    // se quejaba cuatro veces. Era un fallo del probador, no del producto,
    // pero lo caza la asercion de `quejas` del final — que para eso esta.
    const meta = metaFalsa()

    /**
     * El modelo, obedeciendo el bloque 50 al pie de la letra: anota lo que el
     * paciente ACABA de decir y nada mas. No repesca nada de mensajes
     * anteriores, porque el prompt se lo prohibe.
     */
    function modeloDelTurno(turno: number): Modelo {
      let vuelta = 0
      return async (peticion): Promise<Respuesta> => {
        for (const t of peticion.turnos) {
          for (const parte of t.partes) {
            if (parte.tipo !== 'resultado' || vistos.includes(parte)) continue
            vistos.push(parte)
            if (parte.nombre === 'consultar_huecos') {
              const d = parte.resultado as { ok?: boolean; opciones?: { hora: string }[] }
              if (d?.ok && d.opciones?.[0]) horaOfrecida = d.opciones[0].hora
            }
          }
        }

        const primera = vuelta === 0
        vuelta += 1

        if (turno === 0) {
          return primera
            ? {
                texto: '',
                llamadas: [
                  { nombre: 'anotar', argumentos: { campo: 'tratamiento', valor: 'revision' } },
                ],
              }
            : { texto: 'Soy el asistente virtual. ¿Me dices nombre y apellidos?', llamadas: [] }
        }

        if (turno === 1) {
          return primera
            ? {
                texto: '',
                llamadas: [
                  { nombre: 'anotar', argumentos: { campo: 'nombre', valor: 'Ana' } },
                  { nombre: 'anotar', argumentos: { campo: 'apellidos', valor: 'Perez' } },
                  { nombre: 'anotar', argumentos: { campo: 'telefono', valor: '610224571' } },
                ],
              }
            : { texto: 'Gracias Ana. ¿Que dia te viene bien?', llamadas: [] }
        }

        if (turno === 2) {
          return primera
            ? {
                texto: '',
                llamadas: [
                  {
                    nombre: 'consultar_huecos',
                    argumentos: { tratamiento: 'revision', dia: DIA },
                  },
                ],
              }
            : {
                texto: `Tengo libre a las ${new Intl.DateTimeFormat('es-ES', {
                  timeZone: 'Europe/Madrid',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(horaOfrecida))}. ¿Te la reservo?`,
                llamadas: [],
              }
        }

        // Turno 4 · «Si». NO vuelve a anotar nada: el bloque 50 se lo prohibe.
        //
        // La hora SI va como argumento, y no es una trampa: `consultar_huecos`
        // no la deja en el borrador —solo deja el tratamiento y el dia— asi
        // que la unica forma de decir cual de las opciones se acepta es esta.
        // El modelo la acaba de leer en el resultado de la herramienta, en su
        // propio contexto. Lo que NO puede repescar de ahi es el nombre ni el
        // telefono, que se dijeron en un mensaje anterior y ya no estan.
        return primera
          ? {
              texto: '',
              llamadas: [{ nombre: 'crear_cita', argumentos: { hora: horaOfrecida } }],
            }
          : { texto: 'Hecho, Ana. Te espero.', llamadas: [] }
      }
    }

    const mensajes = ['Queria cita para una revision', 'Ana Perez, 610224571', `El ${DIA}`, 'Si']

    for (const [i, texto] of mensajes.entries()) {
      const salida = await procesarMensaje(entrante(texto, `wamid.CITA.${Date.now()}.${i}`), {
        modelo: modeloDelTurno(i),
        modeloClasificador: clasificadorTranquilo,
        envio: { fetch: meta, token: 'TOKEN-DE-PRUEBA' },
        esperaMs: 0,
        registro: {
          info: () => {},
          error: (t: string) => {
            quejas.push(t)
          },
        },
      })
      expect(salida.hecho, `mensaje ${i + 1}: «${texto}»`).toBe('contestado')
    }

    // -------------------------------------------------------------------
    // LO QUE IMPORTA: la cita existe.
    // -------------------------------------------------------------------
    const { data: conv } = await db
      .from('conversaciones')
      .select('id, borrador, rondas_aclaracion')
      .eq('telefono_e164', TELEFONO)
      .single()
    const conversacion = conv as { id: string; borrador: Record<string, unknown> }

    const { data: citas } = await db
      .from('citas')
      .select('id, inicio, estado, motivo_cerrado')
      .eq('conversacion_id', conversacion.id)

    expect(
      citas ?? [],
      'Cuatro mensajes pidiendo cita y no hay ninguna en la base. Es el fallo de ' +
        'ESTADO_F7 §4.2: el borrador no sobrevive de un mensaje al siguiente, asi que ' +
        'crear_cita se queda sin el nombre, los apellidos y el telefono que el paciente ' +
        'dio dos mensajes antes.',
    ).toHaveLength(1)

    // Y la ficha se creo al pasar la puerta, no antes.
    const { data: pacientes } = await db
      .from('pacientes')
      .select('id, nombre, apellidos')
      .eq('telefono_e164', TELEFONO)
    expect(pacientes ?? []).toHaveLength(1)
    expect((pacientes as { nombre: string }[])[0]!.nombre).toBe('Ana')

    // Reservada, el borrador se vacia: solo queda el telefono, como manda el
    // bloque 50. Si se quedara entero, la siguiente cita heredaria los datos
    // de esta.
    expect(Object.keys(conversacion.borrador).sort()).toEqual(['telefono'])

    // Y nadie se ha quejado por el camino. `procesar.ts` se traga a proposito
    // los fallos de envio, asi que sin esto la prueba podria estar verde con
    // el guardado del borrador roto del todo.
    expect(quejas, `El canal se ha quejado: ${quejas.join(' · ')}`).toEqual([])
  })

  // -------------------------------------------------------------------------
  // La otra mitad de la migracion 010: el bucle de aclaracion
  // -------------------------------------------------------------------------

  it('UNA SOLA RONDA DE ACLARACION: a la segunda se pasa a recepcion', async () => {
    quejas = []
    const db = clienteServicio()
    const meta = metaFalsa()

    /** El modelo pide aclarar; en la segunda ronda la herramienta le dira que escale. */
    function modeloQueNoEntiende(): Modelo {
      let vuelta = 0
      const recibidos: Parte[] = []
      return async (peticion): Promise<Respuesta> => {
        for (const t of peticion.turnos) {
          for (const parte of t.partes) {
            if (parte.tipo === 'resultado') recibidos.push(parte)
          }
        }
        vuelta += 1
        if (vuelta === 1) {
          return {
            texto: '',
            llamadas: [
              { nombre: 'no_te_entiendo', argumentos: { que_falta: 'que necesita' } },
            ],
          }
        }
        // Lo que devolvio la herramienta decide que puede decir el bot.
        const ultimo = recibidos.at(-1)?.tipo === 'resultado' ? recibidos.at(-1) : undefined
        const datos = (ultimo as { resultado: { escalar?: boolean } } | undefined)?.resultado
        return {
          texto: datos?.escalar
            ? 'Te paso con recepcion, que te atienden mejor que yo con esto.'
            : 'Perdona, no te he cogido. Puedo darte hora o pasarte con recepcion.',
          llamadas: [],
        }
      }
    }

    const primera = await procesarMensaje(entrante('asdkjh qwe??', `wamid.ACL.${Date.now()}.1`), {
      modelo: modeloQueNoEntiende(),
      modeloClasificador: clasificadorTranquilo,
      envio: { fetch: meta, token: 'TOKEN-DE-PRUEBA' },
      esperaMs: 0,
      registro: { info: () => {}, error: (t: string) => quejas.push(t) },
    })
    expect(primera.hecho).toBe('contestado')

    // La ronda quedo contada en la base. Sin la migracion 010 esto seria 0
    // para siempre y RONDAS_MAXIMAS no se aplicaria nunca.
    const { data: tras1 } = await db
      .from('conversaciones')
      .select('rondas_aclaracion')
      .eq('telefono_e164', TELEFONO)
      .single()
    expect(
      (tras1 as { rondas_aclaracion: number }).rondas_aclaracion,
      'La ronda de aclaracion no se ha contado. Con el contador siempre a cero, el bot ' +
        'puede pedir que le repitan la frase indefinidamente: el bucle que prohibe ' +
        '.claude/CLAUDE.md.',
    ).toBe(1)

    const segunda = await procesarMensaje(entrante('zzz ,,, ???', `wamid.ACL.${Date.now()}.2`), {
      modelo: modeloQueNoEntiende(),
      modeloClasificador: clasificadorTranquilo,
      envio: { fetch: meta, token: 'TOKEN-DE-PRUEBA' },
      esperaMs: 0,
      registro: { info: () => {}, error: (t: string) => quejas.push(t) },
    })
    expect(segunda.hecho).toBe('contestado')

    // Y en la segunda, `no_te_entiendo` manda escalar en vez de repreguntar.
    const { data: mensajes } = await db
      .from('mensajes')
      .select('texto, rol')
      .eq('clinica_id', s.clinicaA)
      .eq('rol', 'bot')
      .order('id', { ascending: false })
      .limit(1)
    expect((mensajes as { texto: string }[])[0]!.texto).toContain('recepcion')

    expect(quejas, `El canal se ha quejado: ${quejas.join(' · ')}`).toEqual([])
  })

  // -------------------------------------------------------------------------

  it('un borrador que NO se guarda no se informa como guardado', async () => {
    // El fallo de la migracion 009, calcado: un UPDATE que no alcanza ninguna
    // fila devuelve CERO FILAS Y NINGUN ERROR. Si `guardarBorrador` se fiara
    // de que no hay error, el borrador se perderia en silencio y cada mensaje
    // volveria a creerse el primero — el sintoma de antes de la 010, pero ya
    // sin nadie mirando.
    //
    // Se apunta a una conversacion que no existe, que es lo que ve el bot
    // cuando la politica no le deja escribir: ninguna fila.
    const dichas: string[] = []
    const guardado = await guardarBorrador(
      clienteBot(s.clinicaA),
      s.clinicaA,
      randomUUID(),
      { nombre: 'Ana' },
      0,
      { info: () => {}, error: (t: string) => dichas.push(t) },
    )

    expect(guardado).toBe(false)
    expect(dichas.join(' ')).toContain('sin guardarse')
  })
})
