/**
 * globalSetup de Vitest: siembra una vez, limpia al final.
 *
 * Si no hay credenciales, no siembra y deja `sembrado` a null. Los archivos de
 * test vivos se saltan solos; el estatico (00-rls-activada) corre igualmente.
 */
import { HAY_BASE_DE_DATOS } from './ayuda/entorno'
import { limpiar, sembrar, type Sembrado } from './ayuda/siembra'

declare module 'vitest' {
  export interface ProvidedContext {
    sembrado: Sembrado | null
  }
}

export default async function preparar(contexto: {
  provide: (clave: 'sembrado', valor: Sembrado | null) => void
}) {
  if (!HAY_BASE_DE_DATOS) {
    contexto.provide('sembrado', null)
    return
  }

  contexto.provide('sembrado', await sembrar())

  return async () => {
    await limpiar()
  }
}
