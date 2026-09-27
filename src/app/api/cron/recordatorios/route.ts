/**
 * `/api/cron/recordatorios` — la ruta que manda los recordatorios de cita.
 *
 * Es la primera ruta de este sistema que le escribe a un paciente sin que el
 * paciente haya escrito primero. Todo lo que decide a quien y que se le manda
 * esta en `src/lib/trabajos/recordatorios.ts`; aqui solo esta el cerrojo y la
 * forma de la respuesta.
 *
 * ================ POR QUE NO SE USA `after()` AQUI ================
 *
 * El webhook de Meta contesta 200 y se va a `after()` porque al otro lado hay
 * alguien esperando: si tardamos, Meta da la entrega por fallida y reintenta,
 * y un reintento es una cita duplicada (F4).
 *
 * Un cron no tiene esa prisa y tiene la necesidad contraria: quien llama es
 * Vercel Cron, y lo unico que hace con la respuesta es escribirla en un
 * registro. Si el trabajo se fuera a `after()`, la respuesta diria «0
 * recordatorios» siempre, pasara lo que pasara, y el registro que existe para
 * saber si el trabajo funciona no diria nada. Aqui se espera y se cuenta.
 *
 * `maxDuration` da margen para varias clinicas con sus envios. Si algun dia una
 * pasada no cupiera, lo correcto NO es subirlo sin mirar: es que el trabajo
 * lleve un limite por pasada, porque el `unique (clinica_id, cita_id)` hace que
 * dejarse citas para la siguiente invocacion sea seguro por construccion.
 */
import { mandarRecordatorios } from '@/lib/trabajos/recordatorios'
import { cerrojoDelCron } from '@/lib/trabajos/cerrojo'

export const maxDuration = 60

export async function GET(peticion: Request): Promise<Response> {
  const cerrojo = cerrojoDelCron(peticion)
  if (!cerrojo.pasa) return cerrojo.respuesta

  const resumen = await mandarRecordatorios({
    registro: { info: (t) => console.log(t), error: (t) => console.error(t) },
  })

  // 200 aunque alguno haya fallado: el trabajo se ha ejecutado y el detalle
  // esta en el cuerpo. Un 500 haria que Vercel lo marcara como caido y que
  // nadie distinguiera «no pude ni empezar» de «tres de cuarenta no salieron».
  // Lo que no se hace es fingir que todo fue bien: `fallidos` va en la
  // respuesta y cada fallo queda ademas en `eventos`.
  return Response.json(resumen, { status: 200 })
}
