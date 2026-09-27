/**
 * Barandillas 1 y 2 contra la base de datos de verdad.
 *
 * La prueba OBLIGATORIA de este archivo es la primera: si hay filas
 * confidenciales sembradas y el recuento dice que el bot las ve todas, falla.
 *
 * Los totales de verdad se cuentan con `service_role`, que salta la RLS. Tienen
 * que contarse desde fuera: el bot no puede saber cuantas filas hay, porque las
 * que no debe ver no existen para el. Contar con el mismo cliente que se esta
 * probando es la trampa clasica —el probador ve lo mismo que el probado y todo
 * cuadra siempre—, la misma que en F1 hacia que `anon` certificara una base
 * insegura (ver ESTADO_F1 §5, observacion 2).
 */
import { beforeAll, expect, it } from 'vitest'

import { cargarDatosDelPrompt, aplicarGuardia } from '@/lib/barandillas/filtro'
import type { FilaFaq } from '@/lib/barandillas/filtro'
import { contar, lineaDeTabla, TIPO_EVENTO, type Registro } from '@/lib/barandillas/contador'
import { montarPromptDeDatos } from '@/lib/barandillas/montaje'

import { clienteServicio } from '../ayuda/clientes'
import { MARCADOR } from '../ayuda/entorno'
import type { Sembrado } from '../ayuda/siembra'
import { describeVivo, sembrado } from '../ayuda/vivo'

type Tabla = 'faq' | 'config' | 'tratamientos'

/** El total REAL y cuantas de esas filas son confidenciales. Con service_role. */
async function contarDeVerdad(tabla: Tabla, clinicaId: string) {
  const db = clienteServicio()
  const { count: total } = await db
    .from(tabla)
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
  const { count: confidenciales } = await db
    .from(tabla)
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .eq('publico', false)

  return { total: total ?? 0, confidenciales: confidenciales ?? 0 }
}

function registroDePrueba() {
  const avisos: string[] = []
  const errores: string[] = []
  const registro: Registro = {
    info: (mensaje) => avisos.push(mensaje),
    error: (mensaje) => errores.push(mensaje),
  }
  return { registro, avisos, errores }
}

describeVivo('barandilla 2 · el contador', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it.each(['faq', 'config', 'tratamientos'] as const)(
    'OBLIGATORIA · %s: habiendo filas confidenciales, el bot NO ve el total',
    async (tabla) => {
      const real = await contarDeVerdad(tabla, s.clinicaA)

      // Sin esta guarda la prueba pasaria igual con la tabla vacia, y una
      // asercion negativa que se cumple por ausencia no demuestra nada. Es
      // exactamente el falso verde de ESTADO_F1 §5.2.
      expect(
        real.confidenciales,
        `No hay filas confidenciales sembradas en ${tabla}: esta prueba no estaria probando nada.`,
      ).toBeGreaterThan(0)

      const datos = await cargarDatosDelPrompt(s.clinicaA)
      const recuento = datos[tabla].recuento

      // LA LINEA. Si el bot ve tantas como hay, la RLS ha cedido.
      expect(
        recuento.publicas,
        `El bot ve ${recuento.publicas} filas de ${tabla} y en la base hay ${real.total}, ` +
          `de las cuales ${real.confidenciales} son confidenciales. Si coinciden, hay fuga.`,
      ).toBeLessThan(real.total)

      expect(recuento.publicas).toBe(real.total - real.confidenciales)
      // Nada retenido: no es que el codigo las haya filtrado, es que no llegaron.
      expect(recuento.retenidas).toBe(0)
      expect(recuento.total).toBe(recuento.publicas)
    },
  )

  it('el MARCADOR no aparece en nada de lo que carga el bot', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    expect(JSON.stringify(datos)).not.toContain(MARCADOR)
  })

  it('el MARCADOR no aparece en el prompt montado', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const montado = montarPromptDeDatos(datos)
    expect(montado.texto).not.toContain(MARCADOR)
  })

  it('escribe la linea y la deja en `eventos`', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const { registro, avisos, errores } = registroDePrueba()
    const resultado = await contar(datos, { registro })

    expect(resultado.guardado).toBe(true)
    expect(resultado.datos.alarma).toBe(false)
    expect(errores).toEqual([])

    const real = await contarDeVerdad('faq', s.clinicaA)
    const publicas = real.total - real.confidenciales
    expect(avisos.join('\n')).toContain(`faq: ${publicas} de ${publicas} (0 confidenciales)`)

    // Y en la tabla, con la forma que documenta la migracion 002.
    const db = clienteServicio()
    const { data } = await db
      .from('eventos')
      .select('tipo, datos')
      .eq('clinica_id', s.clinicaA)
      .eq('tipo', TIPO_EVENTO)
      .order('id', { ascending: false })
      .limit(1)

    const evento = (data as { tipo: string; datos: Record<string, unknown> }[])[0]!
    expect(evento.tipo).toBe(TIPO_EVENTO)
    expect(evento.datos.faq).toEqual({ total: publicas, publicas, retenidas: 0 })
    expect(evento.datos.alarma).toBe(false)
  })

  it('con la RLS rota, el contador lo dice y NO copia el secreto en el log', async () => {
    // Se simula la fuga alimentando la guardia con la fila que la RLS tendria
    // que haber escondido. Apagar la RLS de verdad se hace a mano y con la
    // restauracion atada en la misma orden (ESTADO_F1 §5.1).
    const filtrada: FilaFaq = {
      id: '00000000-0000-4000-8000-00000000beef',
      clinica_id: s.clinicaA,
      pregunta: '¿Cual es el margen de un implante?',
      respuesta_aprobada: `El margen es ${MARCADOR}.`,
      publico: false,
    }

    const cargado = aplicarGuardia(
      'faq',
      [filtrada],
      (fila) => fila.clinica_id === s.clinicaA && fila.publico === true,
    )

    expect(cargado.recuento).toEqual({ total: 1, publicas: 0, retenidas: 1 })
    expect(cargado.filas).toEqual([])
    expect(cargado.retenidos).toEqual(['faq#00000000-0000-4000-8000-00000000beef'])

    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const { registro, errores } = registroDePrueba()
    const resultado = await contar({ ...datos, faq: cargado }, { registro })

    expect(resultado.datos.alarma).toBe(true)
    const log = errores.join('\n')
    expect(log).toContain('faq: 0 de 1 (1 confidenciales)')
    expect(log).toContain('BARANDILLA 1 CAIDA')
    expect(log).toContain('faq#00000000-0000-4000-8000-00000000beef')
    // Lo que NO puede pasar: que el aviso de fuga sea otra fuga.
    expect(log).not.toContain(MARCADOR)
    expect(JSON.stringify(resultado.datos)).not.toContain(MARCADOR)
  })
})

describeVivo('barandilla 1 · lo que carga el filtro', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it('el bot de B no ve ni un dato de A', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaB)
    const todo = JSON.stringify(datos)

    expect(todo).not.toContain(s.clinicaA)
    expect(todo).not.toContain(MARCADOR)
    expect(todo).not.toContain('Calle Mayor 1')
    // B no tiene bloques sembrados: su prompt sale vacio, y eso se ve.
    expect(datos.bloques.recuento.publicas).toBe(0)
  })

  it('no ve los bloques desactivados', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const titulos = datos.bloques.filas.map(({ dato }) => dato.titulo)

    expect(titulos).toContain('_atrezo rls activo')
    expect(titulos).not.toContain('_atrezo rls inactivo')
    expect(titulos).not.toContain('00 - LEEME primero')
    expect(datos.bloques.recuento.retenidas).toBe(0)
  })

  it('la linea del contador se escribe como dice la barandilla 2', () => {
    expect(lineaDeTabla('faq', { total: 16, publicas: 14, retenidas: 2 })).toBe(
      'faq: 14 de 16 (2 confidenciales)',
    )
  })
})

describeVivo('el prompt montado de la clinica de desarrollo', () => {
  let s: Sembrado
  beforeAll(() => {
    s = sembrado()
  })

  it('lleva los bloques reales, en orden, y ninguno de atrezo', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const montado = montarPromptDeDatos(datos, {
      ahora: new Date('2026-09-17T19:30:00Z'),
    })

    const titulos = montado.bloques.map(({ dato }) => dato.titulo)
    expect(titulos).toEqual([
      '05 - Aviso inicial',
      '10 - Quien es',
      '20 - Como habla',
      '25 - No interpretes de mas',
      '30 - Que no puede decir',
      '40 - Cuando cuesta entenderse',
      '50 - Como coge una cita',
      '60 - Cuando pasa a una persona',
      '90 - Lo que sabe',
    ])
    // El de atrezo se descarta por el guion bajo, no por estar inactivo.
    expect(montado.descartados.map((d) => d.motivo)).toEqual(['guion_bajo'])
  })

  it('no queda ni un hueco sin rellenar', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const montado = montarPromptDeDatos(datos, { ahora: new Date('2026-09-17T19:30:00Z') })

    expect(montado.huecosDesconocidos).toEqual([])
    // Ni unas llaves sueltas: lo que ve el paciente no lleva plantilla dentro.
    expect(montado.texto).not.toContain('{{')
  })

  it('los huecos traen datos de verdad, no el nombre del hueco', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const montado = montarPromptDeDatos(datos, { ahora: new Date('2026-09-17T19:30:00Z') })

    expect(montado.texto).toContain('Clinica de prueba A')
    expect(montado.texto).toContain('jueves, 17 de septiembre de 2026, 21:30')
    expect(montado.texto).toContain('Telefono de recepcion: +34910000001')
    expect(montado.texto).toContain('https://ejemplo.test/privacidad')
    // El enlace legal llega por {{privacidad}}, entero y solo. Y NO aparece
    // ademas como una linea `politica_privacidad: ...` dentro de {{datos}}:
    // una segunda copia presentada como dato invita a parafrasearla.
    expect(montado.texto).not.toContain('politica_privacidad:')
    expect(montado.texto).toContain('Lunes a viernes: 09:00 a 14:00 y 15:30 a 20:00')
    expect(montado.texto).toContain('Revision (REV) - 30 min')
    expect(montado.texto).toContain('R: En la calle Mayor 1.')
    expect(montado.texto).toContain('Trata de usted')
  })

  it('cada dato inyectado sabe de que fila salio', async () => {
    const datos = await cargarDatosDelPrompt(s.clinicaA)
    const montado = montarPromptDeDatos(datos)

    expect(montado.origenes.faq).toContain(`faq#${s.faqAPublica}`)
    expect(montado.origenes.faq).not.toContain(`faq#${s.faqAConfidencial}`)
    expect(montado.origenes.datos).toContain(`config#${s.configAPublica}`)
    expect(montado.origenes.datos).not.toContain(`config#${s.configAConfidencial}`)
    // El enlace legal sale de su hueco, y solo de ahi.
    expect(montado.origenes.privacidad).toEqual([`config#${s.configAPrivacidad}`])
    expect(montado.origenes.datos).not.toContain(`config#${s.configAPrivacidad}`)
    expect(montado.origenes.tratamientos).toContain(`tratamientos#${s.tratamientoAPublico}`)
    expect(montado.origenes.clinica).toEqual([`clinicas#${s.clinicaA}`])
  })
})
