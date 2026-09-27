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
 * ============== EL CODIGO DE ESTADO ES LA ALARMA ==============
 *
 * Tres respuestas distintas, con la misma taxonomia que `/api/cron/salud`:
 *
 *   200 · todo limpio.
 *   500 · SE HA MIRADO Y HAY SUCIEDAD. No se arregla esperando: el job de
 *         `pg_cron` no esta corriendo y alguien tiene que ir a mirarlo.
 *   503 · no se ha podido comprobar alguna clinica. Vuelve luego.
 *
 * La primera version devolvia 200 tambien con la base sucia, y dejaba la
 * alarma solo en el cuerpo, en `console.error` y en `eventos`. Es un fallo de
 * los que no se notan: quien vigila un cron mira el codigo de estado, asi que
 * la purga podia llevar semanas parada con el panel de Vercel todo en verde.
 * «Esta sucio» no es «todo bien con un matiz».
 *
 * Y «esta sucio» tampoco es «no he podido mirar», igual que en
 * `/api/cron/salud` un 404 no es un fallo de red: lo primero exige tocar la
 * base, lo segundo se arregla solo. Hay pruebas de que las tres respuestas
 * son distintas.
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
  if (sinComprobar) return Response.json(resumen, { status: 503 })

  // Se ha mirado. Si queda algo por purgar, esto NO es un 200: ver la cabecera.
  return Response.json(resumen, { status: resumen.alDia ? 200 : 500 })
}
