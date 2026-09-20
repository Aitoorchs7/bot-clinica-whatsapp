/**
 * Lo comun a los tests VIVOS: el sembrado y un `describe` que se salta solo
 * cuando no hay base de datos.
 */
import { describe, inject } from 'vitest'

import { HAY_BASE_DE_DATOS, HAY_GEMINI } from './entorno'
import type { Sembrado } from './siembra'

export const describeVivo = describe.skipIf(!HAY_BASE_DE_DATOS)

/**
 * Las pruebas de contrato con Gemini de verdad. Apagadas salvo `GEMINI_VIVO=1`.
 *
 * No comprueban lo que CONTESTA el modelo —eso cambia entre dos tiradas y
 * convertiria la suite en una moneda al aire—, sino que el SDK sigue aceptando
 * nuestras declaraciones y que lo que vuelve tiene la forma que parseamos.
 */
export const describeConGemini = describe.skipIf(!HAY_GEMINI)

/**
 * El sembrado. Dentro de un describeVivo nunca es null; fuera no se usa.
 */
export function sembrado(): Sembrado {
  const datos = inject('sembrado')
  if (!datos) {
    throw new Error('No hay siembra: este test deberia estar dentro de describeVivo.')
  }
  return datos
}
