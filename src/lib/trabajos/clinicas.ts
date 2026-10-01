/**
 * Que clinicas conoce este despliegue, y si el bot puede atender a cada una.
 *
 * ================ POR QUE EXISTE (F9) ================
 *
 * `WHATSAPP_CLINICAS` vive en el entorno del sitio publicado, y ese entorno no
 * se puede leer: en Vercel las variables son «sensitive». Hasta F9, lo unico
 * que miraba el mapa era el acta del alta, y el acta mira el entorno DE LA
 * MAQUINA DONDE CORRE, y lo dice (ESTADO_F8 §8, punto 5). Del sitio publicado
 * no sabia nadie nada.
 *
 * Y habia una segunda pregunta sin contestar, la del punto 2 de F9: el bot
 * firma su propio token con `SUPABASE_JWT_SECRET`, y un valor equivocado hace
 * que Supabase rechace cada consulta. En CI paso, con «No suitable key or wrong
 * key type», y ese mensaje no distingue un secreto equivocado de un proyecto
 * que ya no acepta el secreto heredado (ESTADO_F9 §3.4). Solo lo contesta el
 * propio despliegue, firmando y preguntando.
 *
 * ================ LO QUE MIRA, Y POR DONDE ================
 *
 * Por cada par del mapa, con el cliente del bot de esa clinica:
 *
 *   1 · EL TOKEN. Una consulta minima. Si Supabase contesta 401 (o un
 *       PGRST30x, que son los suyos de JWT), el token no vale.
 *   2 · EL CANAL. `exigirClinicaDelCanal()`, LA MISMA funcion que usan el
 *       webhook y los recordatorios, no una igual: que la fila exista, que su
 *       `wa_phone_number_id` sea el del mapa y que la clinica este activa.
 *       Asi «atiende» significa exactamente «el webhook atenderia a esta
 *       clinica». Es la leccion de F7: una prueba que copia al llamante
 *       comprueba a la copia.
 *
 * ================ LO QUE NO ES VERDE ================
 *
 * Tres formas de «no hay nada malo» que en este proyecto ya han sido falsos
 * verdes, y aqui son rojos:
 *
 *   - El mapa vacio. Cero clinicas no es «todo bien»: es un despliegue que no
 *     atiende a nadie, y el cron de recordatorios lo daba por bueno sin un
 *     solo error (ESTADO_F9 §3.6).
 *   - La clinica fantasma: en el mapa y no en la base. La RLS devuelve cero
 *     filas y el token es valido, asi que la consulta 1 sale limpia. La pilla
 *     la 2 (F6).
 *   - Una clinica mala entre buenas. El estado es el de la peor.
 *
 * ================ LO QUE NO HACE ================
 *
 * No escribe nada. No llama a Gemini: la cuota gratuita son 20 peticiones al
 * dia por modelo, y una comprobacion que se lanza a mano no puede gastarlas.
 * No usa `service_role`: el cliente del bot y nada mas, como el canal.
 */
import type { Registro } from '@/lib/barandillas/contador'
import { clienteDe, exigirClinicaDelCanal, type ClienteDelBot } from '@/lib/whatsapp/almacen'
import { mapaDeClinicas, type MapaDeClinicas } from '@/lib/whatsapp/config'

/** Lo que le pasa a una clinica, en orden de gravedad creciente. */
export type Veredicto =
  | 'atiende'
  | 'inestable'
  | 'no_atiende'
  | 'token_rechazado'
  | 'mal_configurado'

export type SaludDeUnaClinica = {
  readonly phoneNumberId: string
  readonly clinicaId: string
  readonly veredicto: Veredicto
  /** El codigo HTTP de Supabase, si lo hubo. */
  readonly http?: number | null
  readonly detalle?: string
}

export type EstadoDeLaSalud = 'al_dia' | 'inestable' | 'roto' | 'ninguna_clinica' | 'sin_mapa'

export type SaludDeLasClinicas = {
  readonly estado: EstadoDeLaSalud
  /** El host de Supabase al que apunta este despliegue. No es un secreto. */
  readonly supabase: string | null
  readonly clinicas: readonly SaludDeUnaClinica[]
  readonly detalle?: string
}

export type OpcionesDeLaSalud = {
  readonly cliente?: (clinicaId: string) => ClienteDelBot
  readonly mapa?: () => MapaDeClinicas
  readonly registro?: Registro
}

function mensajeDe(fallo: unknown): string {
  return (fallo instanceof Error ? fallo.message : String(fallo)).slice(0, 300)
}

/**
 * Por que no se ha podido leer, a partir de lo que contesta Supabase.
 *
 * Pura, y separada de la red para poder probarla con respuestas inventadas.
 * Lo que devuelve Supabase de verdad lo fija `tests/trabajos-vivo/06`, con un
 * secreto equivocado contra la base de desarrollo.
 */
export function clasificarRechazo(
  http: number | null,
  codigo: string | undefined,
  mensaje: string,
): Veredicto {
  // `bot.ts` lanza esto al firmar si falta el secreto, y supabase-js lo
  // devuelve como un fallo de red (status 0). No es de red: no se arregla solo.
  if (mensaje.includes('Falta la variable de entorno')) return 'mal_configurado'
  if (http === 401 || (codigo ?? '').startsWith('PGRST30')) return 'token_rechazado'
  if (http === null || http === 0 || http >= 500) return 'inestable'
  return 'no_atiende'
}

/** El estado es el de la peor clinica: una buena no tapa a una mala. */
export function estadoDeLaSalud(clinicas: readonly SaludDeUnaClinica[]): EstadoDeLaSalud {
  if (clinicas.length === 0) return 'ninguna_clinica'
  if (clinicas.every((c) => c.veredicto === 'atiende')) return 'al_dia'
  if (clinicas.every((c) => c.veredicto === 'atiende' || c.veredicto === 'inestable')) {
    return 'inestable'
  }
  return 'roto'
}

/**
 * 200 solo si todas atienden. 503 es «vuelve a mirar luego»; 500 es «esto no
 * se arregla solo». Vercel Cron marca los dos como fallo, pero quien lee el
 * registro tiene que poder distinguirlos, igual que en `/api/cron/salud`.
 */
export function codigoHttpDeLaSalud(salud: SaludDeLasClinicas): number {
  if (salud.estado === 'al_dia') return 200
  if (salud.estado === 'inestable') return 503
  return 500
}

function hostDeSupabase(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname || null
  } catch {
    return null
  }
}

async function unaClinica(
  phoneNumberId: string,
  clinicaId: string,
  cliente: (clinicaId: string) => ClienteDelBot,
): Promise<SaludDeUnaClinica> {
  const base = { phoneNumberId, clinicaId }

  let bot: ClienteDelBot
  try {
    // Lanza aqui un clinica_id que no es un uuid, o un despliegue sin la URL o
    // sin la clave anonima de Supabase.
    bot = cliente(clinicaId)
  } catch (fallo) {
    return { ...base, veredicto: 'mal_configurado', detalle: mensajeDe(fallo) }
  }

  // 1 · El token. Sin filtros: lo que se pregunta es si Supabase lo acepta,
  // no que devuelve.
  const { error, status } = await bot.from('clinicas').select('id').limit(1)
  if (error) {
    const http = status || null
    return {
      ...base,
      veredicto: clasificarRechazo(http, error.code, error.message),
      http,
      detalle: error.message.slice(0, 300),
    }
  }

  // 2 · El canal, con la misma funcion que el webhook.
  try {
    await exigirClinicaDelCanal(clinicaId, phoneNumberId, bot)
    return { ...base, veredicto: 'atiende' }
  } catch (fallo) {
    return { ...base, veredicto: 'no_atiende', detalle: mensajeDe(fallo) }
  }
}

function anotar(salud: SaludDeLasClinicas, registro: Registro | undefined): SaludDeLasClinicas {
  if (!registro) return salud
  const escribir = salud.estado === 'al_dia' ? registro.info : registro.error

  escribir(
    `  salud de las clinicas · ${salud.estado} · supabase ${salud.supabase ?? '(sin URL)'} · ` +
      `${salud.clinicas.length} clinica(s)${salud.detalle ? ` · ${salud.detalle}` : ''}`,
  )
  for (const c of salud.clinicas) {
    escribir(
      `    ${c.phoneNumberId} -> ${c.clinicaId} · ${c.veredicto}` +
        `${c.http ? ` (HTTP ${c.http})` : ''}${c.detalle ? ` · ${c.detalle}` : ''}`,
    )
  }
  return salud
}

export async function comprobarLasClinicas(
  opciones: OpcionesDeLaSalud = {},
): Promise<SaludDeLasClinicas> {
  const leerMapa = opciones.mapa ?? mapaDeClinicas
  const cliente = opciones.cliente ?? ((clinicaId: string) => clienteDe(clinicaId))
  const supabase = hostDeSupabase()

  let mapa: MapaDeClinicas
  try {
    mapa = leerMapa()
  } catch (fallo) {
    return anotar({ estado: 'sin_mapa', supabase, clinicas: [], detalle: mensajeDe(fallo) }, opciones.registro)
  }

  const pares = Object.entries(mapa)
  if (pares.length === 0) {
    return anotar(
      {
        estado: 'ninguna_clinica',
        supabase,
        clinicas: [],
        detalle: 'WHATSAPP_CLINICAS esta vacio: este despliegue no atiende a ninguna clinica.',
      },
      opciones.registro,
    )
  }

  // Una detras de otra, como los recordatorios: son pocas y asi el registro
  // sale en orden.
  const clinicas: SaludDeUnaClinica[] = []
  for (const [phoneNumberId, clinicaId] of pares) {
    clinicas.push(await unaClinica(phoneNumberId, clinicaId, cliente))
  }

  return anotar({ estado: estadoDeLaSalud(clinicas), supabase, clinicas }, opciones.registro)
}
