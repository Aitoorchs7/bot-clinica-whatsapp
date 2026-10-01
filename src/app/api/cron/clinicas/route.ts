/**
 * `/api/cron/clinicas` — que clinicas conoce este despliegue, y si el bot
 * puede atender a cada una.
 *
 * Todo lo que decide esta en `src/lib/trabajos/clinicas.ts`; aqui solo estan
 * el cerrojo, el registro y el codigo HTTP.
 *
 * ================ POR QUE ES UN CRON ================
 *
 * Por dos motivos, y ninguno es la hora:
 *
 *   - Un cron registrado se puede lanzar a mano (`vercel crons run <ruta>`,
 *     documentado por Vercel), y `CRON_SECRET` es «sensitive»: no lo puede
 *     leer nadie para llamar a la ruta con curl. Que la llamada a mano lleve
 *     el secreto igual que la programada no lo dice la documentacion: se
 *     comprueba la primera vez que se use (ESTADO_F9 §10), y hasta entonces
 *     no se da por hecho.
 *   - Y pasando cada dia, el dia que Supabase deje de aceptar el secreto JWT
 *     heredado (ESTADO_F9 §3.4) esto se pone rojo antes de que un paciente
 *     escriba y no le conteste nadie.
 *
 * El resultado va al registro con `console`, linea a linea, y no solo en el
 * cuerpo: el registro de Vercel solo enseña lo que se escribe, y una peticion
 * que sale bien sin escribir nada es invisible (medido, ESTADO_F9 §7).
 */
import { cerrojoDelCron } from '@/lib/trabajos/cerrojo'
import { codigoHttpDeLaSalud, comprobarLasClinicas } from '@/lib/trabajos/clinicas'

export const maxDuration = 30

export async function GET(peticion: Request): Promise<Response> {
  const cerrojo = cerrojoDelCron(peticion)
  if (!cerrojo.pasa) return cerrojo.respuesta

  const salud = await comprobarLasClinicas({
    registro: { info: (t) => console.log(t), error: (t) => console.error(t) },
  })

  return Response.json(salud, { status: codigoHttpDeLaSalud(salud) })
}
