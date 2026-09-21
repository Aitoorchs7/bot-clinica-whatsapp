/**
 * Los quince guiones de conversacion de referencia.
 *
 * Este archivo es el motor; los guiones son los `*.json` de al lado y el
 * formato esta razonado en `formato.ts`. Aqui solo hay tres cosas: como se
 * rellenan los huecos `{{...}}`, como se le da cuerda al modelo de mentira, y
 * como se comprueba lo que dice cada guion que tiene que pasar.
 *
 * NIVEL 2 · Supabase de desarrollo de verdad, cero llamadas a Gemini.
 *
 * CADA GUION, SU PROPIA CONVERSACION Y SU PROPIO PACIENTE
 *
 * No por limpieza: por correccion. Varios guiones escalan, y el indice unico
 * parcial de la migracion 002 impide dos escalados pendientes en la misma
 * conversacion; varios crean citas, y `alFinal.citas` cuenta las de SU hilo.
 * Compartiendo conversacion, cada guion contaria las del anterior y el numero
 * dependeria del orden en que corrieran. Eso es justo lo que el criterio de
 * cierre de fase —«el mismo numero dos veces seguidas»— no admite.
 *
 * Y se limpia POR ID, en cascada desde la conversacion. Nunca por telefono ni
 * por motivo: es el segundo falso verde de `.claude/CLAUDE.md`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import type { Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

import { responder } from '@/lib/bot/cerebro'
import type { Modelo, Parte, Peticion as PeticionAlModelo } from '@/lib/bot/gemini'
import { horaLocal } from '@/lib/bot/herramientas'
import type { Turno } from '@/lib/bot/historial'

import type { Guion, RespuestaDelGuion } from './formato'

const CARPETA = join(process.cwd(), 'tests', 'guiones')

const GUIONES: { archivo: string; guion: Guion }[] = readdirSync(CARPETA)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((archivo) => ({
    archivo,
    guion: JSON.parse(readFileSync(join(CARPETA, archivo), 'utf8')) as Guion,
  }))

/**
 * UN DIA LABORABLE DISTINTO PARA CADA GUION.
 *
 * Empezo siendo el mismo para todos y fue un error que costo un rojo, y el
 * rojo fue el util: `10-hueco-ocupado` —que reserva hasta llenar una hora— se
 * encontro la hora ya medio llena por lo que habian reservado `01` y `03` ese
 * mismo dia, y fallo en la segunda reserva en vez de en la tercera.
 *
 * El fallo de fondo no era el numero: era que el resultado de un guion
 * dependia de los que hubieran corrido antes. Un guion que pasa o falla segun
 * el orden no es un guion de referencia, y rompe el criterio de cierre de
 * fase —«el mismo numero dos veces seguidas»— en cuanto alguien añada el
 * decimosexto.
 *
 * Con un dia por guion, cada uno arranca sobre una agenda vacia y se lleva
 * consigo todo lo que reserva. Se cuentan dias LABORABLES porque los horarios
 * sembrados son de lunes a viernes: un guion que pidiera hueco un domingo no
 * probaria lo que dice probar. Y quince dias laborables desde dentro de una
 * semana caben de sobra en los 120 de antelacion maxima de V1.
 */
function diaLaborable(indice: number): string {
  const dia = new Date()
  dia.setUTCDate(dia.getUTCDate() + 7)

  let porDelante = indice
  while (true) {
    const finDeSemana = dia.getUTCDay() === 0 || dia.getUTCDay() === 6
    if (!finDeSemana) {
      if (porDelante === 0) break
      porDelante -= 1
    }
    dia.setUTCDate(dia.getUTCDate() + 1)
  }
  return dia.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------

describeVivo('los quince guiones de referencia', () => {
  let s: Sembrado
  const creados: { conversacion: string; paciente: string }[] = []

  beforeAll(() => {
    s = sembrado()
  })

  afterAll(async () => {
    const db = clienteServicio()
    for (const { conversacion, paciente } of creados) {
      await db.from('citas').delete().eq('conversacion_id', conversacion)
      await db.from('escalados').delete().eq('conversacion_id', conversacion)
      await db.from('conversaciones').delete().eq('id', conversacion)
      await db.from('pacientes').delete().eq('id', paciente)
    }
  })

  it('son quince, ni mas ni menos', () => {
    expect(GUIONES.map((g) => g.archivo)).toHaveLength(15)
  })

  it('todos traen nombre y el porque de su existencia', () => {
    for (const { archivo, guion } of GUIONES) {
      expect(guion.nombre, archivo).toBeTruthy()
      expect(guion.porque.length, `${archivo} no explica para que esta`).toBeGreaterThan(30)
    }
  })

  it.each(GUIONES)('$archivo · $guion.nombre', async ({ archivo, guion }) => {
    const db = clienteServicio()

    // Un numero por guion, estable entre tiradas: el indice del archivo. Asi
    // dos guiones no comparten ficha y el numero no cambia de una vez a otra.
    const indice = GUIONES.findIndex((g) => g.archivo === archivo)
    const TELEFONO = `+3460088${String(1000 + indice).slice(-4)}`

    const { data: ficha, error: errorFicha } = await db
      .from('pacientes')
      .insert({
        clinica_id: s.clinicaA,
        nombre: 'Guion',
        apellidos: `Numero ${indice}`,
        telefono_e164: TELEFONO,
      })
      .select('id')
      .single()
    if (errorFicha) throw new Error(`${archivo}: sembrando paciente: ${errorFicha.message}`)
    const paciente = (ficha as { id: string }).id

    const { data: hilo, error: errorHilo } = await db
      .from('conversaciones')
      .insert({ clinica_id: s.clinicaA, telefono_e164: TELEFONO, paciente_id: paciente })
      .select('id')
      .single()
    if (errorHilo) throw new Error(`${archivo}: sembrando conversacion: ${errorHilo.message}`)
    const conversacion = (hilo as { id: string }).id
    creados.push({ conversacion, paciente })

    // -----------------------------------------------------------------------
    // Los huecos `{{...}}` y el modelo de mentira
    // -----------------------------------------------------------------------

    const DIA = diaLaborable(indice)
    /** La primera opcion del ultimo `consultar_huecos` de ESTA conversacion. */
    let horaOfrecida = ''

    function rellenar(texto: string): string {
      return texto
        .replaceAll('{{DIA}}', DIA)
        .replaceAll('{{TELEFONO}}', TELEFONO)
        .replaceAll('{{HORA_OFRECIDA}}', horaOfrecida)
        .replaceAll(
          '{{HORA_LOCAL}}',
          horaOfrecida ? horaLocal(horaOfrecida, 'Europe/Madrid') : '',
        )
    }

    function rellenarHondo(valor: unknown): unknown {
      if (typeof valor === 'string') return rellenar(valor)
      if (Array.isArray(valor)) return valor.map(rellenarHondo)
      if (valor && typeof valor === 'object') {
        return Object.fromEntries(
          Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, rellenarHondo(v)]),
        )
      }
      return valor
    }

    /**
     * Lee los resultados de herramienta que le han llegado al modelo.
     *
     * Por la MISMA puerta por la que se entera Gemini: las partes de tipo
     * `resultado` de su propio contexto. No hay ningun atajo por detras.
     */
    function apuntarResultados(peticion: PeticionAlModelo, en: Parte[]): void {
      for (const turno of peticion.turnos) {
        for (const parte of turno.partes) {
          if (parte.tipo === 'resultado' && !en.includes(parte)) en.push(parte)
        }
      }
    }

    /**
     * Lo que va diciendo el bot, el borrador y el ultimo prompt montado.
     *
     * El borrador viaja de un turno al siguiente A MANO, y es lo que hace en
     * produccion el webhook: `responder()` no tiene memoria entre mensajes —la
     * memoria entre conversaciones distintas esta fuera de alcance— y lo que
     * se sabe a medias vive en el borrador, no en ninguna fila.
     */
    const dichoPorElBot: string[] = []
    let borrador: Record<string, unknown> = {}
    let ultimoPrompt = ''
    /**
     * Las rondas de aclaracion gastadas, que tambien viajan de un mensaje al
     * siguiente. `RONDAS_MAXIMAS` es 1: a la segunda, `no_te_entiendo` manda
     * escalar en vez de volver a preguntar.
     *
     * ⚠ OJO, Y ESTA ANOTADO EN ESTADO_F7 §4: esto lo hace aqui el probador
     * porque el motor lo admite, pero `src/lib/whatsapp/procesar.ts` NO le
     * pasa hoy ni `borrador` ni `rondasDeAclaracion` a `responder()`. O sea:
     * este guion mide el motor, y en el canal de verdad las dos cosas empiezan
     * de cero en cada mensaje. No se arregla aqui —tocar el camino del bot no
     * es esta fase— pero no se informa como si estuviera bien.
     */
    let rondas = 0

    for (const [numero, turno] of guion.turnos.entries()) {
      const recibidos: Parte[] = []
      const guionDelTurno: readonly RespuestaDelGuion[] = turno.modelo ?? [{ texto: '' }]
      let vueltas = 0

      const modelo: Modelo = async (peticion) => {
        apuntarResultados(peticion, recibidos)

        // Se guarda la primera opcion en cuanto aparece, para los `{{HORA_*}}`
        // de este mismo turno y de los siguientes.
        for (const parte of recibidos) {
          if (parte.tipo !== 'resultado' || parte.nombre !== 'consultar_huecos') continue
          const datos = parte.resultado as { ok?: boolean; opciones?: { hora: string }[] }
          if (datos?.ok && datos.opciones?.[0]) horaOfrecida = datos.opciones[0].hora
        }

        const paso = guionDelTurno[Math.min(vueltas, guionDelTurno.length - 1)]!
        vueltas += 1

        return {
          texto: rellenar(paso.texto ?? ''),
          llamadas: (paso.llamadas ?? []).map((llamada) => ({
            nombre: llamada.nombre,
            argumentos: rellenarHondo(llamada.argumentos ?? {}) as Record<string, unknown>,
          })),
        }
      }

      const historial: Turno[] = guion.turnos.slice(0, numero).flatMap((anterior, i) => [
        { rol: 'paciente' as const, texto: rellenar(anterior.paciente) },
        { rol: 'bot' as const, texto: dichoPorElBot[i] ?? '' },
      ])

      const respuesta = await responder({
        clinicaId: s.clinicaA,
        conversacionId: conversacion,
        telefonoDelCanal: TELEFONO,
        mensaje: rellenar(turno.paciente),
        historial,
        borrador,
        rondasDeAclaracion: rondas,
        cliente: clienteBot(s.clinicaA),
        modelo,
        registro: { info: () => {}, error: () => {} },
      })

      dichoPorElBot.push(respuesta.texto)
      borrador = respuesta.borrador
      ultimoPrompt = respuesta.prompt.texto
      rondas += respuesta.herramientasUsadas.filter((h) => h === 'no_te_entiendo').length

      // ---------------------------------------------------------------------
      // Lo que el guion dice que tiene que haber pasado
      // ---------------------------------------------------------------------
      const espera = turno.espera
      const donde = `${archivo} · turno ${numero + 1} («${turno.paciente.slice(0, 40)}…»)`
      if (!espera) continue

      if (espera.herramientas) {
        // Exactas y en orden: es la barandilla 3. Una herramienta de mas
        // tambien es un fallo.
        expect(respuesta.herramientasUsadas, `${donde}: herramientas`).toEqual(
          espera.herramientas,
        )
      }
      if (espera.cortadoAntesDelCerebro !== undefined) {
        expect(respuesta.cortadoAntesDelCerebro, `${donde}: corte`).toBe(
          espera.cortadoAntesDelCerebro,
        )
      }
      if (espera.escalado !== undefined) {
        expect(respuesta.escalado, `${donde}: escalado`).toBe(espera.escalado)
      }
      if (espera.vueltasDelModelo !== undefined) {
        expect(vueltas, `${donde}: vueltas del bucle`).toBe(espera.vueltasDelModelo)
      }
      for (const trozo of espera.respuestaContiene ?? []) {
        expect(respuesta.texto, `${donde}: la respuesta`).toContain(rellenar(trozo))
      }
      for (const trozo of espera.respuestaNoContiene ?? []) {
        expect(respuesta.texto, `${donde}: la respuesta`).not.toContain(rellenar(trozo))
      }

      for (const esperado of espera.resultados ?? []) {
        const parte = recibidos.find(
          (p) => p.tipo === 'resultado' && p.nombre === esperado.herramienta,
        )
        expect(parte, `${donde}: no llego ningun resultado de ${esperado.herramienta}`).toBeTruthy()

        const datos = (parte as { resultado: { ok: boolean; motivo?: string } }).resultado
        if (esperado.ok !== undefined) {
          expect(datos.ok, `${donde}: ${esperado.herramienta}.ok`).toBe(esperado.ok)
        }
        if (esperado.motivo !== undefined) {
          // `ocupado` y `fuera_de_horario` son cosas distintas y el bloque 30
          // prohibe confundirlas. Por eso se compara el motivo exacto.
          expect(datos.motivo, `${donde}: ${esperado.herramienta}.motivo`).toBe(esperado.motivo)
        }
        for (const trozo of esperado.contiene ?? []) {
          expect(JSON.stringify(datos), `${donde}: ${esperado.herramienta}`).toContain(trozo)
        }
      }

      for (const [campo, valor] of Object.entries(espera.borrador ?? {})) {
        const actual = (borrador as Record<string, unknown>)[campo]
        if (valor === null) expect(actual, `${donde}: borrador.${campo}`).toBeUndefined()
        else expect(String(actual ?? ''), `${donde}: borrador.${campo}`).toContain(rellenar(valor))
      }
    }

    // -----------------------------------------------------------------------
    // El final del guion, contra la base de datos
    // -----------------------------------------------------------------------
    const alFinal = guion.alFinal
    if (!alFinal) return

    if (alFinal.citas !== undefined) {
      const { count } = await db
        .from('citas')
        .select('id', { count: 'exact', head: true })
        .eq('conversacion_id', conversacion)
      expect(count ?? 0, `${archivo}: citas creadas en esta conversacion`).toBe(alFinal.citas)
    }

    if (alFinal.escalados !== undefined) {
      const { count } = await db
        .from('escalados')
        .select('id', { count: 'exact', head: true })
        .eq('conversacion_id', conversacion)
      expect(count ?? 0, `${archivo}: escalados`).toBe(alFinal.escalados)
    }

    for (const trozo of alFinal.promptContiene ?? []) {
      expect(ultimoPrompt, `${archivo}: el prompt montado`).toContain(trozo)
    }
    for (const trozo of alFinal.promptNoContiene ?? []) {
      expect(ultimoPrompt, `${archivo}: el prompt montado`).not.toContain(trozo)
    }
  })
})
