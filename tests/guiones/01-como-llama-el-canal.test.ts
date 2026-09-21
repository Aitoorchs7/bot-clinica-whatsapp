/**
 * EL MISMO GUION, LLAMADO COMO LO LLAMA EL CANAL DE VERDAD.
 *
 * =========================================================================
 * POR QUE EXISTE ESTE ARCHIVO
 * =========================================================================
 *
 * `00-guiones.test.ts` enhebra el borrador y las rondas de aclaracion de un
 * turno al siguiente, porque el motor lo admite y porque un llamante correcto
 * lo haria. `src/lib/whatsapp/procesar.ts` —el llamante que existe— NO lo
 * hace: llama a `responder()` con `historial`, pero sin `borrador` y sin
 * `rondasDeAclaracion`.
 *
 * O sea que los quince guiones miden el MOTOR, y esto mide EL PRODUCTO. La
 * diferencia entre los dos numeros es el agujero, y mientras exista hay que
 * poder verlo, no deducirlo de un comentario.
 *
 * =========================================================================
 * LO QUE MIDE, Y POR QUE NO ES UNA PRUEBA INJUSTA
 * =========================================================================
 *
 * Se podria decir: «claro que falla, si el modelo de mentira no vuelve a
 * anotar los datos en el ultimo mensaje». Y ahi esta el asunto: **el prompt
 * le PROHIBE hacerlo**. El bloque 50, literal:
 *
 *     «Cada vez que el paciente te dé uno, llama a anotar con ese dato, y solo
 *      con ese. NUNCA ANOTES ALGO QUE EL PACIENTE NO ACABE DE DECIR.»
 *
 * Un paciente que ya dijo su nombre hace tres mensajes no lo «acaba de decir»
 * cuando escribe «sí». Asi que el modelo que obedece el prompt no vuelve a
 * anotar, el borrador llega vacio a `crear_cita`, y la cita no se coge. El
 * unico modelo que cerraria la reserva es uno que desobedezca sus
 * instrucciones — y eso no es una garantia, es una loteria.
 *
 * El guion de abajo es `01-cita-simple.json`, el camino feliz, turno por
 * turno, con el modelo haciendo EXACTAMENTE lo que manda el bloque 50.
 *
 * =========================================================================
 * ESTA PRUEBA NO AFIRMA QUE ESTE BIEN. AFIRMA LO QUE PASA HOY
 * =========================================================================
 *
 * Es una prueba de caracterizacion: deja escrito y medido el comportamiento
 * actual para que el arreglo tenga contra que compararse. El dia que
 * `procesar.ts` enhebre el borrador, ESTA PRUEBA SE PONDRA ROJA, y eso sera
 * la señal de que el agujero se cerro: hay que borrarla entonces, no
 * arreglarla. Lo dice tambien su nombre en el informe.
 */
import { beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import type { Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

import { responder } from '@/lib/bot/cerebro'
import type { Modelo, Parte, Respuesta } from '@/lib/bot/gemini'
import type { Turno } from '@/lib/bot/historial'

describeVivo('el canal, tal y como llama hoy', () => {
  let s: Sembrado
  const TELEFONO = '+34600889999'
  let conversacion = ''
  let paciente = ''

  beforeAll(async () => {
    s = sembrado()
    const db = clienteServicio()

    const { data: ficha } = await db
      .from('pacientes')
      .insert({
        clinica_id: s.clinicaA,
        nombre: 'Canal',
        apellidos: 'De Prueba',
        telefono_e164: TELEFONO,
      })
      .select('id')
      .single()
    paciente = (ficha as { id: string }).id

    const { data: hilo } = await db
      .from('conversaciones')
      .insert({ clinica_id: s.clinicaA, telefono_e164: TELEFONO, paciente_id: paciente })
      .select('id')
      .single()
    conversacion = (hilo as { id: string }).id
  })

  it('UNA CITA EN CUATRO MENSAJES NO SE LLEGA A COGER', async () => {
    const db = clienteServicio()
    const manana = new Date(Date.now() + 14 * 86_400_000)
    while (manana.getUTCDay() === 0 || manana.getUTCDay() === 6) {
      manana.setUTCDate(manana.getUTCDate() + 1)
    }
    const DIA = manana.toISOString().slice(0, 10)

    /** Lo que pide el modelo en cada mensaje. El bloque 50, obedecido. */
    const guion: Respuesta[][] = [
      // 1 · «Queria cita para una revision» -> anota lo que acaba de decir.
      [
        { texto: '', llamadas: [{ nombre: 'anotar', argumentos: { campo: 'tratamiento', valor: 'revision' } }] },
        { texto: 'Soy el asistente virtual. ¿Me dices tu nombre y apellidos?', llamadas: [] },
      ],
      // 2 · «Ana Perez, 610224571» -> anota lo que acaba de decir.
      [
        {
          texto: '',
          llamadas: [
            { nombre: 'anotar', argumentos: { campo: 'nombre', valor: 'Ana' } },
            { nombre: 'anotar', argumentos: { campo: 'apellidos', valor: 'Perez' } },
            { nombre: 'anotar', argumentos: { campo: 'telefono', valor: '610224571' } },
          ],
        },
        { texto: 'Gracias Ana. ¿Que dia te viene bien?', llamadas: [] },
      ],
      // 3 · «El <dia>» -> consulta huecos.
      [
        { texto: '', llamadas: [{ nombre: 'consultar_huecos', argumentos: { tratamiento: 'revision', dia: DIA } }] },
        { texto: 'PENDIENTE_DE_RELLENAR', llamadas: [] },
      ],
      // 4 · «Si» -> reserva. NO vuelve a anotar: el bloque 50 se lo prohibe.
      [
        { texto: '', llamadas: [{ nombre: 'crear_cita', argumentos: {} }] },
        { texto: 'Listo.', llamadas: [] },
      ],
    ]

    const mensajes = ['Queria cita para una revision', 'Ana Perez, 610224571', `El ${DIA}`, 'Si']
    const dicho: string[] = []
    let horaOfrecida = ''
    const resultados: Parte[] = []

    for (const [i, mensaje] of mensajes.entries()) {
      let vuelta = 0
      const modelo: Modelo = async (peticion) => {
        for (const turno of peticion.turnos) {
          for (const parte of turno.partes) {
            if (parte.tipo === 'resultado' && !resultados.includes(parte)) {
              resultados.push(parte)
              if (parte.nombre === 'consultar_huecos') {
                const datos = parte.resultado as { ok?: boolean; opciones?: { hora: string }[] }
                if (datos?.ok && datos.opciones?.[0]) horaOfrecida = datos.opciones[0].hora
              }
            }
          }
        }
        const paso = guion[i]![Math.min(vuelta, guion[i]!.length - 1)]!
        vuelta += 1
        const texto =
          paso.texto === 'PENDIENTE_DE_RELLENAR'
            ? `Tengo libre a las ${new Intl.DateTimeFormat('es-ES', {
                timeZone: 'Europe/Madrid',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(new Date(horaOfrecida))}. ¿Te la reservo?`
            : paso.texto
        return { ...paso, texto }
      }

      const historial: Turno[] = mensajes.slice(0, i).flatMap((anterior, j) => [
        { rol: 'paciente' as const, texto: anterior },
        { rol: 'bot' as const, texto: dicho[j] ?? '' },
      ])

      // ------------------------------------------------------------------
      // ESTA LLAMADA ES LA COPIA EXACTA DE procesar.ts:308. Sin `borrador`
      // y sin `rondasDeAclaracion`. Es lo unico que esta prueba cambia
      // respecto a `00-guiones.test.ts`, y es todo lo que hace falta.
      // ------------------------------------------------------------------
      const respuesta = await responder({
        clinicaId: s.clinicaA,
        conversacionId: conversacion,
        telefonoDelCanal: TELEFONO,
        mensaje,
        historial,
        cliente: clienteBot(s.clinicaA),
        modelo,
        registro: { info: () => {}, error: () => {} },
      })
      dicho.push(respuesta.texto)
    }

    // -------------------------------------------------------------------
    const cita = resultados.find((p) => p.tipo === 'resultado' && p.nombre === 'crear_cita')
    const datos = (cita as { resultado: { ok: boolean; motivo?: string; porque?: string } })
      .resultado

    console.log(`\n  ── El canal, hoy ──\n  crear_cita -> ${JSON.stringify(datos)}\n`)

    // Lo que pasa hoy. Si esto se pone rojo, el agujero se ha cerrado: BORRA
    // este archivo, no lo arregles.
    expect(datos.ok).toBe(false)
    expect(datos.motivo).toBe('faltan_datos')

    const { count } = await db
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', conversacion)
    expect(count ?? 0).toBe(0)

    // Y la prueba de que el agujero es el borrador y no otra cosa: el MISMO
    // guion, con el borrador enhebrado, si reserva. Eso es `00-guiones`.
    const db2 = clienteServicio()
    await db2.from('citas').delete().eq('conversacion_id', conversacion)
  })

  it('zzz limpia', async () => {
    const db = clienteServicio()
    if (conversacion) await db.from('citas').delete().eq('conversacion_id', conversacion)
    if (conversacion) await db.from('escalados').delete().eq('conversacion_id', conversacion)
    if (conversacion) await db.from('conversaciones').delete().eq('id', conversacion)
    if (paciente) await db.from('pacientes').delete().eq('id', paciente)
    expect(true).toBe(true)
  })
})
