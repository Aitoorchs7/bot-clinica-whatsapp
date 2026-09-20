/**
 * `/api/cron/retencion` — ¿la purga de 90 dias está limpiando de verdad?
 *
 * NO BORRA NADA. La purga es `mantenimiento.purgar_historial()`, de F1, y corre
 * sola en `pg_cron` a las 03:15. Esta ruta solo cuenta lo que no deberia
 * quedar y lo deja escrito en `eventos`, que es donde la clinica lo ve.
 *
 * El motivo esta en la cabecera de `src/lib/trabajos/retencion.ts`: un job de
 * `pg_cron` puede dejar de existir sin romper nada visible, y lo unico que pasa
 * entonces es que las conversaciones de los pacientes dejan de borrarse. Eso
 * no es una molestia de mantenimiento: es lo que sostiene por escrito que este
 * sistema no trata datos de salud.
 *
 * Devuelve 200 cuando la comprobacion se ha podido hacer, diga lo que diga el
 * resultado, y 503 cuando alguna clinica no se ha podido comprobar. «Esta
 * sucio» y «no he podido mirar» son cosas distintas, igual que en
 * `/api/cron/salud` lo son un 404 y un fallo de red.
 */
import { comprobarLaRetencion } from '@/lib/trabajos/retencion'
import { cerrojoDelCron } from '@/lib/trabajos/cerrojo'

export const maxDuration = 60

export async function GET(peticion: Request): Promise<Response> {
  const cerrojo = cerrojoDelCron(peticion)
  if (!cerrojo.pasa) return cerrojo.respuesta

  const resumen = await comprobarLaRetencion({
    registro: { info: (t) => console.log(t), error: (t) => console.error(t) },
  })

  const sinComprobar = resumen.porClinica.some((c) => c.error !== undefined)
  return Response.json(resumen, { status: sinComprobar ? 503 : 200 })
}
