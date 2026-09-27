/**
 * globalSetup de Playwright: la misma siembra que usa Vitest.
 *
 * Se reutiliza `tests/ayuda/siembra.ts` a proposito, en vez de escribir un
 * fixture propio para el navegador. Dos fixtures que se parecen acaban
 * separandose, y el dia que uno de los dos tenga una fila confidencial que el
 * otro no tenga, una de las dos baterias dejara de comprobar lo que cree.
 *
 * Si no hay credenciales, no se siembra y las pruebas se saltan solas (cada
 * spec lo mira). No se inventa un verde.
 */
import { HAY_BASE_DE_DATOS } from '../ayuda/entorno'
import { sembrar } from '../ayuda/siembra'

export default async function preparar() {
  if (!HAY_BASE_DE_DATOS) {
    console.warn(
      [
        '',
        '  ⚠  Las pruebas del panel en navegador se han saltado.',
        '     Falta el entorno de Supabase en .env.local.',
        '',
      ].join('\n'),
    )
    return
  }

  await sembrar()
}
