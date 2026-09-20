/**
 * El entorno del canal, leido en un solo sitio.
 *
 * Nada de `process.env.X` desperdigado por los modulos: una variable que falta
 * tiene que fallar con su nombre escrito y en el arranque de la operacion, no
 * a mitad de una conversacion con un paciente.
 *
 * NINGUNA DE ESTAS VARIABLES LLEVA PREFIJO `NEXT_PUBLIC_`, Y ES DELIBERADO
 *
 * `META_APP_SECRET` y `WHATSAPP_TOKEN` firman y autorizan; en el navegador
 * servirian para suplantar a la clinica entera. `.claude/CLAUDE.md` lo exige y
 * hay una prueba que recorre `src/lib/whatsapp/` buscando `NEXT_PUBLIC_`.
 */

/**
 * La version de la Graph API, CLAVADA.
 *
 * Mismo criterio que los modelos de Gemini en `gemini.ts`: un alias que cambia
 * solo convierte una rotura ruidosa en un cambio de comportamiento silencioso.
 * Meta mantiene cada version unos dos anos; v25.0 salio el 18/02/2026 y caduca
 * el 29/07/2028, asi que lleva medio ano de rodaje y da margen de sobra.
 *
 * La mas nueva el 19/09/2026 es v26.0 (29/07/2026). Se elige la anterior a
 * proposito: una version de dos meses todavia esta moviendose.
 *
 * Se puede forzar otra con `GRAPH_API_VERSION` sin tocar codigo, para el dia
 * que haya que subir.
 */
export const VERSION_GRAPH_POR_DEFECTO = 'v25.0'

export function versionGraph(): string {
  return process.env.GRAPH_API_VERSION || VERSION_GRAPH_POR_DEFECTO
}

export function baseGraph(): string {
  return `https://graph.facebook.com/${versionGraph()}`
}

export function exigir(clave: string): string {
  const valor = process.env[clave]
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${clave}. Mira .env.example.`)
  }
  return valor
}

export function opcional(clave: string): string | undefined {
  return process.env[clave] || undefined
}

// ---------------------------------------------------------------------------
// De que clinica es este webhook
// ---------------------------------------------------------------------------

/**
 * POR QUE ESTE MAPA VIVE EN EL ENTORNO Y NO EN LA BASE DE DATOS
 *
 * `clinicas.wa_phone_number_id` existe y es unico, asi que lo natural seria
 * resolverlo con una consulta. No se puede, y el motivo es la propia promesa
 * del producto:
 *
 *   La RLS del rol `bot` exige que el `clinica_id` viaje YA FIRMADO dentro del
 *   JWT (`bot.ts`). Para leer la fila de una clinica hay que saber antes que
 *   clinica eres. Una consulta «dame la clinica cuyo phone_number_id es X»
 *   tendria que correr sin identidad de inquilino, y la unica llave que abre
 *   eso es `service_role` — prohibida en el camino del bot, sin excepciones.
 *
 * Asi que la primera resolucion es configuracion, no datos. Y despues se
 * COMPRUEBA contra la base (`almacen.exigirClinicaDelCanal`): ya con el cliente
 * del bot firmado, se lee la propia fila de la clinica y se exige que su
 * `wa_phone_number_id` sea el que vino en el webhook. Si el mapa estuviera mal,
 * no se atiende el mensaje.
 *
 * Es una vuelta mas larga, pero mantiene en pie la regla que sostiene todo lo
 * demas. La alternativa —una funcion `SECURITY DEFINER` que resuelva el mapa—
 * exigiria justificacion escrita en un COMMENT del SQL y una migracion nueva;
 * esta fase no toca migraciones.
 *
 * FORMATO:  WHATSAPP_CLINICAS={"123456789":"uuid-de-la-clinica", ...}
 */
export type MapaDeClinicas = Readonly<Record<string, string>>

let cache: MapaDeClinicas | null = null

export function mapaDeClinicas(): MapaDeClinicas {
  if (cache) return cache

  const crudo = process.env.WHATSAPP_CLINICAS
  if (!crudo) {
    throw new Error(
      'Falta WHATSAPP_CLINICAS. Es el mapa {"<phone_number_id>":"<clinica_id>"} ' +
        'que dice de que clinica es cada webhook. Mira .env.example.',
    )
  }

  let leido: unknown
  try {
    leido = JSON.parse(crudo)
  } catch {
    throw new Error('WHATSAPP_CLINICAS no es un JSON valido. Mira .env.example.')
  }

  if (typeof leido !== 'object' || leido === null || Array.isArray(leido)) {
    throw new Error('WHATSAPP_CLINICAS tiene que ser un objeto {phone_number_id: clinica_id}.')
  }

  const mapa: Record<string, string> = {}
  for (const [numero, clinica] of Object.entries(leido as Record<string, unknown>)) {
    if (typeof clinica !== 'string' || clinica === '') {
      throw new Error(`WHATSAPP_CLINICAS: el valor de ${numero} no es un clinica_id.`)
    }
    mapa[numero] = clinica
  }

  cache = mapa
  return mapa
}

/** `undefined` si ese numero no es de ninguna clinica nuestra. */
export function clinicaDelNumero(phoneNumberId: string): string | undefined {
  return mapaDeClinicas()[phoneNumberId]
}

/** El `phone_number_id` desde el que envia una clinica. Es el mismo por el que recibe. */
export function numeroDeLaClinica(clinicaId: string): string {
  const par = Object.entries(mapaDeClinicas()).find(([, id]) => id === clinicaId)
  if (!par) {
    throw new Error(
      `La clinica ${clinicaId} no tiene numero en WHATSAPP_CLINICAS, asi que no ` +
        'se le puede enviar nada. Mira .env.example.',
    )
  }
  return par[0]
}

/** Para las pruebas: obliga a releer el entorno. */
export function olvidarMapa(): void {
  cache = null
}
