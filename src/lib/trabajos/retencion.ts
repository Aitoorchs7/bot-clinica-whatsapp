/**
 * Comprobar que la purga de 90 dias hace lo que dice.
 *
 * ================ ESTO NO ES LA PURGA. LA PURGA YA EXISTE ================
 *
 * `mantenimiento.purgar_historial()` es de F1 (migracion 006, reescrita en la
 * 007) y corre en `pg_cron` todos los dias a las 03:15. Este archivo NO la
 * vuelve a construir y no la llama: no podria, porque el esquema
 * `mantenimiento` no lo publica PostgREST, que es justo lo que impide que
 * nadie la alcance desde la API.
 *
 * Lo que hace es lo que faltaba: MIRAR SI SIRVIO.
 *
 * ================ POR QUE HACIA FALTA ================
 *
 * Hasta hoy, lo unico que comprobaba la purga era estatico: `tests/rls/06`
 * lee el `.sql` y comprueba que DICE `update public.eventos_webhook set carga
 * = null`. Eso demuestra que la migracion esta escrita, no que el job siga
 * programado ni que se este ejecutando. Es exactamente la distincion que dejo
 * medida ESTADO_F1 §5: «la mitad estatica no puede ver esto ni en principio».
 *
 * Un job de `pg_cron` puede desaparecer sin que se rompa nada visible: alguien
 * lo desprograma, una restauracion de la base se lleva la tabla `cron.job`, o
 * la funcion empieza a morir por `statement_timeout` y nadie lee los logs de
 * Postgres. El sistema sigue funcionando perfectamente; lo unico que pasa es
 * que las conversaciones de los pacientes dejan de borrarse. Y eso no es una
 * molestia: es lo que sostiene por escrito que este sistema no trata datos de
 * salud.
 *
 * ================ COMO LO MIDE ================
 *
 * Contando lo que NO deberia quedar. Si la purga corre, todos estos numeros
 * son cero; si alguno crece dia tras dia, el job no se esta ejecutando.
 *
 * No se cuenta con `service_role` sino con el cliente del bot, clinica por
 * clinica, y eso tiene una consecuencia buena: cada clinica ve el estado de su
 * propia retencion y de ninguna otra. El apunte va a `eventos`, que es lo que
 * la pantalla de observabilidad del panel ya sabe leer (F5).
 *
 * El apunte lleva NUMEROS, no filas. Ni un texto de paciente, ni un
 * identificador de conversacion: es un recuento de lo que sobra.
 */
import type { Registro } from '@/lib/barandillas/contador'
import { anotarEnEventos, clienteDe, type ClienteDelBot } from '@/lib/whatsapp/almacen'
import { mapaDeClinicas } from '@/lib/whatsapp/config'

/** Los mismos plazos que la migracion 007. Si alli cambian, aqui tambien. */
export const DIAS_DE_RETENCION = 90
export const DIAS_DE_LA_CARGA = 7

export type OpcionesDeRetencion = {
  readonly cliente?: (clinicaId: string) => ClienteDelBot
  readonly ahora?: Date
  readonly registro?: Registro
}

/**
 * Lo que sobra. Con la purga corriendo, los cuatro son 0.
 */
export type Sobrante = {
  readonly mensajes: number
  readonly conversaciones: number
  /** Cargas crudas de Meta que deberian estar vacias a los 7 dias. */
  readonly cargas: number
  /** Filas de `eventos_webhook` que deberian haber desaparecido a los 90. */
  readonly eventos: number
}

export type RetencionDeUnaClinica = {
  readonly clinicaId: string
  readonly sobrante: Sobrante
  readonly alDia: boolean
  readonly error?: string
}

export type ResumenDeRetencion = {
  readonly clinicas: number
  readonly alDia: boolean
  readonly porClinica: readonly RetencionDeUnaClinica[]
}

function menos(ahora: Date, dias: number): string {
  return new Date(ahora.getTime() - dias * 24 * 3600_000).toISOString()
}

/**
 * Cuenta sin traerse las filas.
 *
 * `head: true` es lo que hace que esto sea un `count(*)` y no una descarga del
 * historial entero de la clinica a la memoria del proceso. Importa: la tabla
 * que mas crece es justo la que se cuenta.
 */
async function contar(
  bot: ClienteDelBot,
  tabla: 'mensajes' | 'conversaciones' | 'eventos_webhook',
  columna: string,
  antesDe: string,
  soloConCarga = false,
): Promise<number> {
  let consulta = bot
    .from(tabla)
    .select('id', { count: 'exact', head: true })
    .lt(columna, antesDe)

  // `carga` no es un predicado de seguridad: es la pregunta. La RLS de estas
  // tres tablas acota por `clinica_id`, y eso NO se repite aqui.
  if (soloConCarga) consulta = consulta.not('carga', 'is', null)

  const { count, error } = await consulta
  if (error) throw new Error(`Contando ${tabla}: ${error.message}`)
  return count ?? 0
}

export async function comprobarLaRetencion(
  opciones: OpcionesDeRetencion = {},
): Promise<ResumenDeRetencion> {
  const { registro } = opciones
  const ahora = opciones.ahora ?? new Date()
  const corte = menos(ahora, DIAS_DE_RETENCION)
  const corteCargas = menos(ahora, DIAS_DE_LA_CARGA)

  const porClinica: RetencionDeUnaClinica[] = []

  for (const clinicaId of Object.values(mapaDeClinicas())) {
    const bot = opciones.cliente ? opciones.cliente(clinicaId) : clienteDe(clinicaId)

    try {
      const sobrante: Sobrante = {
        mensajes: await contar(bot, 'mensajes', 'creado_en', corte),
        conversaciones: await contar(bot, 'conversaciones', 'ultima_actividad', corte),
        cargas: await contar(bot, 'eventos_webhook', 'recibido_en', corteCargas, true),
        eventos: await contar(bot, 'eventos_webhook', 'recibido_en', corte),
      }

      const alDia =
        sobrante.mensajes === 0 &&
        sobrante.conversaciones === 0 &&
        sobrante.cargas === 0 &&
        sobrante.eventos === 0

      // El apunte se deja SIEMPRE, este al dia o no. Un registro que solo
      // aparece cuando algo va mal no distingue «todo bien» de «esto no se ha
      // comprobado nunca», y esa es justo la distincion que la pantalla de
      // observabilidad de F5 existe para no tener que adivinar.
      await anotarEnEventos(
        clinicaId,
        'retencion',
        { al_dia: alDia, dias: DIAS_DE_RETENCION, sobrante },
        bot,
        registro,
      )

      if (!alDia) {
        registro?.error(
          `  ⚠  LA PURGA DE ${DIAS_DE_RETENCION} DIAS NO ESTA LIMPIANDO en la clinica ` +
            `${clinicaId}: quedan ${sobrante.mensajes} mensajes y ` +
            `${sobrante.conversaciones} conversaciones por encima del plazo, ` +
            `${sobrante.cargas} cargas de webhook sin vaciar y ${sobrante.eventos} ` +
            'eventos por borrar. Revisa que el job `purgar-historial-90-dias` siga ' +
            'programado en pg_cron.',
        )
      }

      porClinica.push({ clinicaId, sobrante, alDia })
    } catch (fallo) {
      const error = fallo instanceof Error ? fallo.message : String(fallo)
      registro?.error(`  ⚠  No se ha podido comprobar la retencion de ${clinicaId}: ${error}`)
      porClinica.push({
        clinicaId,
        sobrante: { mensajes: 0, conversaciones: 0, cargas: 0, eventos: 0 },
        alDia: false,
        error,
      })
    }
  }

  return {
    clinicas: porClinica.length,
    alDia: porClinica.every((c) => c.alDia),
    porClinica,
  }
}
