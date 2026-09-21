/**
 * PUNTO 5 · Las plantillas de Meta. El unico que no se puede comprobar desde
 * el codigo, y el centinela que lo comprueba desde fuera.
 *
 * ===========================================================================
 * EL FALLO QUE SE BUSCA NO DA NINGUN ERROR
 * ===========================================================================
 *
 * `recordatorio_cita` lleva sus parametros POR POSICION: `{{1}}` `{{2}}`
 * `{{3}}` `{{4}}`. El codigo los manda en el orden nombre, clinica, fecha,
 * hora. Si en el panel de Meta la plantilla se aprobo con el cuerpo en otro
 * orden, Meta acepta el envio, devuelve 200, el mensaje llega, y el paciente
 * lee la fecha donde iba su nombre. No hay codigo de error, no hay reintento,
 * no hay nada en el registro. Se ve leyendolo en un movil, y de ninguna otra
 * forma.
 *
 * ===========================================================================
 * POR QUE VALORES CENTINELA Y NO DATOS PLAUSIBLES
 * ===========================================================================
 *
 * Con datos de verdad —«Hola Ana, te recordamos tu cita en Sonrisa Viva el
 * martes a las 10:00»— un orden cambiado se lee como una frase rara que
 * cualquiera da por buena a las ocho de la tarde. Con centinelas numerados no
 * hay forma de confundirse: lo que tiene que leerse es UNO, DOS, TRES, CUATRO
 * en ese orden, y si sale «te recordamos tu cita en UNO-NOMBRE» esta mal y se
 * ve desde el otro lado de la habitacion.
 *
 * Aqui hay dos cosas, y solo una manda un mensaje:
 *
 *   SIEMPRE · que el orden que dice el procedimiento sea el que monta el
 *     codigo. Si alguien reordena `plantillas.ts`, las instrucciones que se le
 *     dan a quien mira el movil se quedarian mintiendo, y eso si se caza aqui.
 *
 *   CON `--plantilla <movil>` · manda el centinela DE VERDAD, por el mismo
 *     camino que lo manda el trabajo de los recordatorios. Cuesta un mensaje
 *     de plantilla y se lee en el movil de quien lo pide.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { clienteServicio } from '../ayuda/clientes'

import { enviarPlantilla } from '@/lib/whatsapp/enviar'
import { recordatorioCita } from '@/lib/whatsapp/plantillas'

/**
 * El cuerpo tal y como tiene que estar aprobado en Meta. Es la misma frase que
 * documenta `src/lib/whatsapp/plantillas.ts`, y hay una prueba aqui abajo que
 * exige que sigan siendo la misma: dos copias de una frase que nadie compara
 * se separan solas.
 */
export const CUERPO_APROBADO = 'Hola {{1}}, te recordamos tu cita en {{2}} el {{3}} a las {{4}}.'

/** Uno por hueco, numerados, y diciendo cual les toca. */
const CENTINELAS = {
  nombre: 'UNO-NOMBRE',
  clinica: 'DOS-CLINICA',
  fecha: 'TRES-FECHA',
  hora: 'CUATRO-HORA',
} as const

/** Un id que no es de ninguna cita. Los botones tienen que VERSE, no pulsarse. */
const CITA_FALSA = '00000000-0000-4000-8000-000000000000'

const MOVIL = (process.env.ALTA_PLANTILLA_A ?? '').trim()
const SLUG = (process.env.ALTA_SLUG ?? '').trim()

function conCentinelas() {
  return recordatorioCita({ ...CENTINELAS, citaId: CITA_FALSA })
}

function cuerpoRelleno(): string {
  const plantilla = conCentinelas()
  const cuerpo = plantilla.components.find((c) => c.type === 'body')
  const valores = (cuerpo as { parameters: { text: string }[] }).parameters.map((p) => p.text)
  return CUERPO_APROBADO.replace(/\{\{(\d)\}\}/g, (_, n) => valores[Number(n) - 1] ?? '(falta)')
}

describe('punto 5 · el orden de los parametros de `recordatorio_cita`', () => {
  it('el codigo los manda en el orden que dice el procedimiento', () => {
    const plantilla = conCentinelas()
    const cuerpo = plantilla.components.find((c) => c.type === 'body')
    expect(cuerpo, 'La plantilla no lleva componente `body`').toBeDefined()

    expect(
      (cuerpo as { parameters: { text: string }[] }).parameters.map((p) => p.text),
      'El orden de los parametros ha cambiado. Las instrucciones que se le dan a quien mira el ' +
        'movil dejarian de valer, y una plantilla aprobada con el orden viejo pasaria por buena.',
    ).toEqual([CENTINELAS.nombre, CENTINELAS.clinica, CENTINELAS.fecha, CENTINELAS.hora])
  })

  it('y el cuerpo aprobado que documenta el codigo sigue siendo este', () => {
    // La frase vive en dos sitios: en el comentario de `plantillas.ts`, que es
    // lo que alguien copia y pega en el panel de Meta, y aqui, que es contra
    // lo que se compara el movil. Si se separan, el procedimiento comprueba
    // una frase que ya no es la que se aprobo.
    const fuente = readFileSync('src/lib/whatsapp/plantillas.ts', 'utf8')
    const sinSaltos = fuente.replace(/\s+/g, ' ')
    expect(
      sinSaltos,
      'El cuerpo documentado en plantillas.ts ya no coincide con el de esta comprobacion.',
    ).toContain(CUERPO_APROBADO.replace(/\s+/g, ' '))
  })

  it('lleva sus dos botones', () => {
    const botones = conCentinelas().components.filter((c) => c.type === 'button')
    expect(botones).toHaveLength(2)
  })

  it('deja escrito lo que hay que leer en el movil', () => {
    const esperado = cuerpoRelleno()
    console.log(
      '\n  Lo que TIENE que leerse en el movil, palabra por palabra:\n\n' +
        `    «${esperado}»\n\n` +
        '  Y debajo, dos botones: Confirmar y Cancelar. No los pulses.\n' +
        '  Si los cuatro centinelas no salen en ese orden, la plantilla esta aprobada en\n' +
        '  Meta con el cuerpo cambiado: se corrige ALLI, no en el codigo. Los pacientes\n' +
        '  de esta clinica estarian recibiendo sus datos cambiados de sitio.\n',
    )
    expect(esperado).toContain(CENTINELAS.nombre)
    expect(esperado.indexOf(CENTINELAS.nombre)).toBeLessThan(esperado.indexOf(CENTINELAS.clinica))
    expect(esperado.indexOf(CENTINELAS.clinica)).toBeLessThan(esperado.indexOf(CENTINELAS.fecha))
    expect(esperado.indexOf(CENTINELAS.fecha)).toBeLessThan(esperado.indexOf(CENTINELAS.hora))
  })
})

// ---------------------------------------------------------------------------
// El envio de verdad. Solo con --plantilla <movil>.
// ---------------------------------------------------------------------------
// No se salta «porque falta el entorno»: se salta porque NADIE LO HA PEDIDO,
// que es distinto. Y el resumen del comando dice, siempre, que el punto 5
// sigue sin comprobar mientras no se haga esto.

describe.skipIf(!MOVIL)('punto 5 · el centinela, mandado de verdad', () => {
  it('sale por el mismo camino que un recordatorio de verdad', async () => {
    const db = clienteServicio()
    const { data, error } = await db
      .from('clinicas')
      .select('id, nombre, wa_phone_number_id')
      .eq('slug', SLUG)
      .maybeSingle()
    if (error) throw new Error(`Buscando la clinica "${SLUG}": ${error.message}`)
    if (!data) throw new Error(`No hay ninguna clinica con el slug "${SLUG}".`)

    const clinica = data as { id: string; nombre: string; wa_phone_number_id: string | null }
    if (!clinica.wa_phone_number_id) {
      throw new Error(
        'La clinica no tiene wa_phone_number_id, asi que no se puede mandar nada desde su ' +
          'numero. Eso es el punto 1 del acta y sale rojo alli tambien.',
      )
    }

    // `enviarPlantilla` es la misma funcion que usa `recordatorios.ts`. Armar
    // aqui el POST a mano comprobaria este archivo y no el camino de verdad
    // (la leccion de F7: una prueba que copia al llamante comprueba a la copia).
    const respuesta = await enviarPlantilla(
      { phoneNumberId: clinica.wa_phone_number_id, telefono: MOVIL },
      conCentinelas(),
    )

    expect(respuesta.waMessageId, 'Meta no ha devuelto id de mensaje').toBeTruthy()

    console.log(
      `\n  Mandado a ${MOVIL} desde ${clinica.nombre} (${respuesta.waMessageId}).\n` +
        `  Ahora abre ese movil y comprueba que se lee:\n\n    «${cuerpoRelleno()}»\n\n` +
        '  Que Meta haya devuelto 200 NO significa que el orden sea el correcto: con el\n' +
        '  cuerpo cambiado tambien devuelve 200. Lo unico que lo dice es el movil.\n',
    )
  })
})
