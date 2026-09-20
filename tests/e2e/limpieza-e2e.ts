/**
 * globalTeardown de Playwright: deja la base como estaba.
 *
 * El mismo `limpiar()` de Vitest. Si esto no corriera, la tirada siguiente de
 * cualquiera de las dos baterias se encontraria las clinicas de prueba ya
 * creadas y moriria en el `unique (slug)` de la siembra.
 */
import { HAY_BASE_DE_DATOS } from '../ayuda/entorno'
import { limpiar } from '../ayuda/siembra'

export default async function recoger() {
  if (!HAY_BASE_DE_DATOS) return
  await limpiar()
}
