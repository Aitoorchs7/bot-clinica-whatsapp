import { after } from 'next/server'

import {
  MODELO_CEREBRO,
  MODELO_CLASIFICADOR,
  modeloDeGoogle,
  type Modelo,
} from '@/lib/bot/gemini'
import { cerrojoDelCron } from '@/lib/trabajos/cerrojo'

/**
 * La comprobacion de salud del modelo.
 *
 * ========================= POR QUE EXISTE ESTA RUTA =========================
 *
 * El 18/09/2026, `gemini-2.5-flash` y `gemini-2.5-flash-lite` dejaron de estar
 * disponibles para claves nuevas y empezaron a devolver 404 con este cuerpo:
 *
 *   «This model models/gemini-2.5-flash is no longer available to new users.
 *    Please update your code to use models/gemini-3.6-flash»
 *
 * Lo cazo `tests/bot-contrato`, que solo corre a mano con GEMINI_VIVO=1
 * (ESTADO_F3 §7.1). En produccion no hay nadie corriendo esa suite: el dia que
 * le toque a `gemini-3.6-flash`, el primero en enterarse seria un paciente que
 * escribe y no recibe respuesta. Esto es lo que se entera antes.
 *
 * ================= LO QUE NO PUEDE HACER, Y ES EL PUNTO ENTERO =================
 *
 * NO puede meter un 404 y un fallo de red en el mismo saco. Significan cosas
 * opuestas:
 *
 *   404 / 401 / 403 -> PERMANENTE. El bot esta muerto y seguira muerto manana.
 *                      No se arregla esperando: hay que cambiar `gemini.ts` y
 *                      volver a publicar. Esto se grita.
 *   red / 429 / 5xx -> TEMPORAL. En cinco minutos vuelve solo. Gritar aqui
 *                      ensena a la gente a ignorar la alarma, y entonces la
 *                      alarma deja de servir para la unica vez que importa.
 *
 * Un `try { ... } catch { return caido }` los junta. Por eso la clasificacion
 * es una funcion aparte, pura, y hay una prueba que exige que las dos
 * respuestas SEAN DISTINTAS.
 *
 * Que el 404 llegue como excepcion y no como respuesta no es una suposicion:
 * el SDK lo convierte en `ApiError` con `.status` (`throwErrorIfNotOK`), y un
 * fallo de red propaga el error crudo, sin `.status`. Verificado en
 * `node_modules/@google/genai` 2.22.0. Si algun dia eso cambia, lo que se rompe
 * es `clasificarFallo` y nada mas.
 */

export const maxDuration = 30

/** Que le pasa al modelo, en orden de gravedad. */
export type Clase = 'ok' | 'retirado' | 'credencial' | 'inestable'

export type Diagnostico = {
  readonly id: string
  readonly clase: Clase
  /** El codigo HTTP, o null si no llego a haber respuesta. */
  readonly http: number | null
  readonly detalle?: string
}

/** Un permanente no mejora esperando; un temporal si. */
const PERMANENTE: Record<number, Clase> = {
  400: 'retirado', // Google devuelve 400 para algunos modelos no soportados
  401: 'credencial',
  403: 'credencial',
  404: 'retirado',
}

function httpDelFallo(fallo: unknown): number | null {
  if (typeof fallo !== 'object' || fallo === null) return null
  const estado = (fallo as { status?: unknown }).status
  return typeof estado === 'number' ? estado : null
}

/**
 * El nucleo comprobable, separado de la red a proposito.
 *
 * Se le puede pasar un `ApiError` inventado sin levantar nada, igual que
 * `aplicarGuardia` en F2 se come una fila inventada.
 */
export function clasificarFallo(fallo: unknown): { clase: Clase; http: number | null } {
  const http = httpDelFallo(fallo)
  if (http === null) return { clase: 'inestable', http: null }
  return { clase: PERMANENTE[http] ?? 'inestable', http }
}

/** El mensaje de Google, recortado. No lleva nada de ningun paciente. */
function detalleDe(fallo: unknown): string | undefined {
  const mensaje = fallo instanceof Error ? fallo.message : String(fallo)
  return mensaje.slice(0, 300)
}

async function probar(modelo: Modelo, id: string): Promise<Diagnostico> {
  try {
    // La pregunta mas barata posible: lo que se comprueba es que el modelo
    // EXISTE y acepta la clave, no lo que contesta.
    await modelo({
      modelo: id,
      turnos: [{ rol: 'usuario', partes: [{ tipo: 'texto', texto: 'ping' }] }],
    })
    return { id, clase: 'ok', http: null }
  } catch (fallo) {
    const { clase, http } = clasificarFallo(fallo)
    return { id, clase, http, detalle: detalleDe(fallo) }
  }
}

/** 200 solo si los dos modelos responden. */
function codigoHttp(diagnosticos: readonly Diagnostico[]): number {
  if (diagnosticos.every((d) => d.clase === 'ok')) return 200
  // 503 es «vuelve luego»; 500 es «esto no se arregla solo». Vercel Cron marca
  // las dos como fallo, pero quien lee el registro tiene que poder distinguir
  // una noche de 503 de un 500 que lleva ahi desde el martes.
  return diagnosticos.some((d) => d.clase === 'retirado' || d.clase === 'credencial') ? 500 : 503
}

export async function GET(peticion: Request): Promise<Response> {
  // El mismo cerrojo que el resto de los trabajos programados. `proxy.ts` deja
  // /api fuera a proposito, asi que esta ruta se autentica sola. La
  // comprobacion vive en un solo sitio desde F6: tres copias de un control de
  // acceso se separan, y la que se queda vieja deja una ruta abierta.
  const cerrojo = cerrojoDelCron(peticion)
  if (!cerrojo.pasa) return cerrojo.respuesta

  const modelo = modeloDeGoogle()
  const diagnosticos = await Promise.all([
    probar(modelo, MODELO_CEREBRO),
    probar(modelo, MODELO_CLASIFICADOR),
  ])

  const roto = diagnosticos.find((d) => d.clase !== 'ok')
  const estado: Clase = roto?.clase ?? 'ok'

  if (estado === 'retirado' || estado === 'credencial') {
    after(() => {
      console.error(
        `  ⚠  EL MODELO NO RESPONDE Y NO SE ARREGLA SOLO: ${diagnosticos
          .filter((d) => d.clase !== 'ok')
          .map((d) => `${d.id} -> ${d.clase} (HTTP ${d.http})`)
          .join(', ')}. Hay que cambiar src/lib/bot/gemini.ts y volver a publicar.`,
      )
    })
  }

  return Response.json({ estado, modelos: diagnosticos }, { status: codigoHttp(diagnosticos) })
}
