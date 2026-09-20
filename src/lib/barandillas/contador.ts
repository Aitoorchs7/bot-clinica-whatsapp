/**
 * Barandilla 2: el contador.
 *
 * Cada prompt montado deja escrito, en el registro y en la tabla `eventos`,
 * cuantas filas vio el bot de cada tabla y cuantas de las que le llegaron no
 * debian haberle llegado:
 *
 *     faq: 14 de 14 (0 confidenciales)      <- lo normal
 *     faq: 14 de 16 (2 confidenciales)      <- la RLS ha cedido
 *
 * QUE SIGNIFICA EXACTAMENTE CADA NUMERO, QUE ES DONDE ESTA LA TRAMPA
 *
 * El segundo numero NO es el total de filas de la tabla. El bot no puede
 * conocerlo: para el, la fila confidencial no existe —ese es justamente el
 * producto—, y averiguarlo obligaria a una funcion `security definer` que
 * devolviera recuentos de lo que el bot no puede leer. Se descarto: el precio
 * era abrir un agujero para poder medir que no hay agujeros.
 *
 * Asi que aqui el segundo numero es **lo que la consulta le devolvio al bot**, y
 * el primero **lo que sobrevivio a la comprobacion de filtro.ts**. Con la RLS
 * en su sitio los dos coinciden y el tercero es 0. Que dejen de coincidir es la
 * alarma: significa que una fila con `publico = false`, o de otra clinica, ha
 * llegado hasta el proceso del bot.
 *
 * La comparacion contra el total de verdad —las 16— vive en la prueba, que lo
 * cuenta con `service_role` y falla si el bot ve tantas como hay habiendo
 * confidenciales sembradas. Es la prueba obligatoria de la barandilla 2:
 * tests/barandillas/02-contador.test.ts.
 *
 * De lo retenido se registra el ORIGEN (`faq#47e0aa43-...`), nunca el
 * contenido. Un aviso de fuga que copie el secreto en el log es otra fuga.
 */
import {
  TABLAS_CONTADAS,
  recuentosDe,
  retenidosDe,
  type ClienteDelBot,
  type DatosDelPrompt,
  type Recuento,
  type TablaContada,
} from './filtro'
import { crearClienteBot } from '@/lib/supabase/bot'
import type { Origen } from './origen'

/** El `tipo` con el que se guarda en `eventos`. Lo fija la migracion 002. */
export const TIPO_EVENTO = 'contador_prompt'

/** Para poder leer lo que se registro sin capturar la consola. */
export type Registro = {
  info: (mensaje: string) => void
  error: (mensaje: string) => void
}

const REGISTRO_CONSOLA: Registro = {
  info: (mensaje) => console.log(mensaje),
  error: (mensaje) => console.error(mensaje),
}

/**
 * La linea, literal.
 *
 * «confidenciales» y no «retenidas» a proposito: quien lee el log a las tres de
 * la manana necesita saber que es lo que ha pasado, no como se llama el campo.
 */
export function lineaDeTabla(tabla: string, recuento: Recuento): string {
  const { publicas, total, retenidas } = recuento
  return `${tabla}: ${publicas} de ${total} (${retenidas} confidenciales)`
}

export function lineasDelContador(recuentos: Record<TablaContada, Recuento>): string[] {
  return TABLAS_CONTADAS.map((tabla) => lineaDeTabla(tabla, recuentos[tabla]))
}

export type DatosDelEvento = {
  readonly clinica_id: string
  readonly alarma: boolean
  readonly retenidos: readonly Origen[]
} & { readonly [T in TablaContada]: Recuento }

export type ResultadoDelContador = {
  readonly datos: DatosDelEvento
  readonly lineas: readonly string[]
  /** false si el `insert` en `eventos` no llego a guardarse. */
  readonly guardado: boolean
}

/**
 * Registra el recuento de un prompt recien montado.
 *
 * NO lanza si la fuga existe: para cuando esto corre, `filtro.ts` ya ha tirado
 * las filas retenidas y el prompt es seguro. Lo que hace es gritar —en el log,
 * en `eventos` y en el valor que devuelve— y dejar que el que llama decida.
 * Tumbar la conversacion de un paciente no arregla una politica RLS.
 */
export async function contar(
  datos: DatosDelPrompt,
  opciones: { cliente?: ClienteDelBot; registro?: Registro } = {},
): Promise<ResultadoDelContador> {
  const registro = opciones.registro ?? REGISTRO_CONSOLA
  const recuentos = recuentosDe(datos)
  const retenidos = retenidosDe(datos)
  const alarma = retenidos.length > 0

  const delEvento: DatosDelEvento = {
    clinica_id: datos.clinicaId,
    alarma,
    retenidos,
    ...recuentos,
  }

  const lineas = lineasDelContador(recuentos)
  const escribir = alarma ? registro.error : registro.info

  escribir(`prompt montado · clinica ${datos.clinicaId}`)
  for (const linea of lineas) escribir(`  ${linea}`)

  if (alarma) {
    registro.error(
      `  ⚠  BARANDILLA 1 CAIDA: ${retenidos.length} fila(s) han llegado al bot sin ` +
        `derecho a hacerlo y se han descartado aqui. Origenes: ${retenidos.join(', ')}. ` +
        'Revisa las politicas RLS de supabase/migrations antes de seguir.',
    )
  }

  // El evento se escribe con el cliente del bot, que tiene `eventos_bot_insert`
  // y nada mas: el bot deja constancia, no puede releerla de otra clinica ni
  // borrarla. La migracion 004 le revoca UPDATE y DELETE sobre `eventos`.
  const bot = opciones.cliente ?? crearClienteBot(datos.clinicaId)
  const { error } = await bot.from('eventos').insert({
    clinica_id: datos.clinicaId,
    tipo: TIPO_EVENTO,
    // `retenidos` se copia a un array mutable porque la columna es `jsonb` y el
    // tipo generado no acepta `readonly`. El valor es el mismo.
    datos: { ...delEvento, retenidos: [...retenidos] },
  })

  if (error) {
    // Que no se pueda escribir el contador no justifica dejar sin respuesta a
    // quien esta esperando. Pero tampoco se traga en silencio: sin esta linea,
    // la barandilla 2 podria llevar semanas sin registrar nada y el panel
    // mostraria «ningun incidente» como si fuera una buena noticia.
    registro.error(`  ⚠  El contador no ha podido escribir en eventos: ${error.message}`)
    return { datos: delEvento, lineas, guardado: false }
  }

  return { datos: delEvento, lineas, guardado: true }
}
