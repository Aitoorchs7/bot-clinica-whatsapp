/**
 * El debounce: cuatro mensajes seguidos, una sola respuesta.
 *
 * EL PROBLEMA, QUE NO ES TEORICO
 *
 * En WhatsApp nadie escribe un parrafo. Escribe esto:
 *
 *     hola
 *     queria cita
 *     para el jueves
 *     por la tarde
 *
 * Cuatro webhooks en seis segundos. Sin agrupar, el bot contesta cuatro veces
 * —«¿en que puedo ayudarte?», «¿que necesitas?», «¿que dia?»...— porque cada
 * respuesta se monto sin los mensajes que venian detras. Y paga cuatro
 * llamadas al modelo para quedar peor que contestando una vez.
 *
 * LA REGLA
 *
 * Guarda el mensaje, espera 8 s, y procesa SOLO si sigue siendo el mas reciente
 * de esa conversacion. Si mientras tanto llego otro, esta rama se calla y
 * contesta la del ultimo, con los cuatro textos concatenados.
 *
 * «EL MAS RECIENTE» SE PREGUNTA A LA BASE, NO A UNA VARIABLE
 *
 * Esto es lo unico que hace que el patron funcione de verdad. En serverless
 * cada webhook puede caer en una instancia distinta, con su propia memoria
 * recien estrenada: un `Map` de modulo haria que las cuatro ramas se creyeran
 * la ultima y contestaran las cuatro, que es exactamente el fallo que se
 * queria evitar, pero ahora con ocho segundos de retraso.
 *
 * La base es el unico sitio donde las cuatro invocaciones se ven entre si.
 *
 * POR QUE OCHO SEGUNDOS
 *
 * Es el hueco tipico entre dos mensajes de la misma frase. Mas corto agrupa de
 * menos; mas largo y el paciente cree que el bot no le ha leido. Sale de
 * `WHATSAPP_DEBOUNCE_MS` para poder medirlo con una clinica de verdad sin
 * desplegar, y las pruebas lo ponen a cero.
 */
import type { ClienteDelBot } from './almacen'
import { clienteDe } from './almacen'

export const ESPERA_POR_DEFECTO_MS = 8_000

export function esperaMs(): number {
  const valor = Number(process.env.WHATSAPP_DEBOUNCE_MS ?? ESPERA_POR_DEFECTO_MS)
  return Number.isFinite(valor) && valor >= 0 ? valor : ESPERA_POR_DEFECTO_MS
}

const dormirDeVerdad = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms))

export type Agrupado = {
  /** `false` si llego otro mensaje despues: esta rama se calla. */
  readonly meToca: boolean
  /** Los textos del paciente sin contestar, del mas viejo al mas nuevo. */
  readonly textos: readonly string[]
  /** El id del ultimo, que es el que dispara y al que apunta un escalado. */
  readonly ultimoId: number
}

/**
 * Los mensajes del paciente que aun no ha contestado el bot.
 *
 * Se busca el ultimo mensaje del bot y se cogen los del paciente posteriores.
 * Asi, si el paciente escribe cuatro veces, se recogen los cuatro; y si escribe
 * uno, contesta el bot, y escribe otro, se recoge solo el ultimo.
 *
 * Las lineas de `sistema` (por ejemplo «nota de voz transcrita») se quedan
 * fuera: no las dijo el paciente, y `responder()` las filtraria igual antes de
 * mirar la confirmacion.
 */
export async function sinContestar(
  clinicaId: string,
  conversacionId: string,
  cliente?: ClienteDelBot,
): Promise<{ textos: string[]; ultimoId: number | null }> {
  const bot = clienteDe(clinicaId, cliente)

  const { data, error } = await bot
    .from('mensajes')
    .select('id, rol, texto')
    .eq('conversacion_id', conversacionId)
    .order('id', { ascending: false })
    .limit(30)

  if (error) throw new Error(`Buscando los mensajes sin contestar: ${error.message}`)

  const recientes = data ?? []
  const pendientes: { id: number; texto: string }[] = []

  for (const fila of recientes) {
    if (fila.rol === 'bot') break
    if (fila.rol === 'paciente') pendientes.push({ id: fila.id, texto: fila.texto })
  }

  pendientes.reverse()

  return {
    textos: pendientes.map((m) => m.texto),
    ultimoId: pendientes.length > 0 ? pendientes[pendientes.length - 1]!.id : null,
  }
}

/**
 * Espera, y luego decide si a esta rama le toca contestar.
 *
 * `mensajeId` es el que acaba de guardar quien llama. Si despues de la espera
 * el ultimo mensaje sin contestar es otro, esta rama devuelve `meToca: false` y
 * no hace nada mas: la rama de ese otro mensaje esta durmiendo tambien y
 * contestara por las dos.
 */
export async function agrupar(
  clinicaId: string,
  conversacionId: string,
  mensajeId: number,
  opciones: {
    cliente?: ClienteDelBot
    esperaMs?: number
    dormir?: (ms: number) => Promise<void>
    registro?: { info(t: string): void }
  } = {},
): Promise<Agrupado> {
  const dormir = opciones.dormir ?? dormirDeVerdad
  const espera = opciones.esperaMs ?? esperaMs()

  if (espera > 0) await dormir(espera)

  const { textos, ultimoId } = await sinContestar(clinicaId, conversacionId, opciones.cliente)

  // Nadie pendiente: otra rama ya contesto mientras dormiamos.
  if (ultimoId === null) {
    opciones.registro?.info(`  agrupar: ${mensajeId} ya lo contesto otra rama`)
    return { meToca: false, textos: [], ultimoId: mensajeId }
  }

  if (ultimoId !== mensajeId) {
    opciones.registro?.info(
      `  agrupar: ${mensajeId} se calla, contesta ${ultimoId} con ${textos.length} mensajes`,
    )
    return { meToca: false, textos, ultimoId }
  }

  if (textos.length > 1) {
    opciones.registro?.info(`  agrupar: ${textos.length} mensajes seguidos, una sola respuesta`)
  }

  return { meToca: true, textos, ultimoId }
}

/**
 * Los mensajes agrupados, como una sola intervencion.
 *
 * Se unen con salto de linea y no con espacio: «hola / queria cita» no es la
 * misma frase, y pegarlas produce un galimatias que el modelo lee peor que los
 * cuatro trozos puestos uno debajo de otro.
 */
export function concatenar(textos: readonly string[]): string {
  return textos.map((t) => t.trim()).filter((t) => t !== '').join('\n')
}
