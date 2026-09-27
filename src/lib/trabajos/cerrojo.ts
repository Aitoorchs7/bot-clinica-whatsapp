/**
 * Quien puede disparar un trabajo programado.
 *
 * ================ POR QUE ESTA RUTA SE AUTENTICA SOLA ================
 *
 * `src/proxy.ts` deja `/api` fuera de su `matcher` a proposito (F4): ahi vive
 * el webhook de Meta, al que llama Meta y no un navegador con cookie. Los
 * trabajos programados estan en el mismo caso: quien llama es Vercel Cron.
 *
 * Asi que estas rutas no tienen guardian delante y tienen que traer el suyo,
 * igual que el webhook trae la firma HMAC. La diferencia es el mecanismo, no
 * la exigencia.
 *
 * ================ UNA COPIA, NO TRES ================
 *
 * Hay tres rutas de cron y las tres necesitan lo mismo. Vive aqui y no copiado
 * en cada una por el motivo que dejo escrito ESTADO_F5 §6 sobre el detector de
 * los guardianes: dos copias de una comprobacion se separan a la primera
 * mejora, y la que se quede vieja sigue dando verde sin que nadie note que ya
 * no mira lo mismo. En una comprobacion de autenticacion eso significa una
 * ruta abierta.
 *
 * ================ SIN SECRETO NO SE PASA ================
 *
 * Si `CRON_SECRET` no esta puesta, esto responde 401 a todo el mundo en vez de
 * dejar pasar a todo el mundo. Es la diferencia entre un despliegue mal
 * configurado que no manda recordatorios —y se nota— y uno en el que cualquiera
 * con la URL puede dispararlos —y no se nota—.
 *
 * `Bearer <secreto>` es el formato que manda Vercel Cron cuando la variable
 * `CRON_SECRET` existe en el entorno del proyecto.
 */

export type Veredicto = { readonly pasa: true } | { readonly pasa: false; readonly respuesta: Response }

export function cerrojoDelCron(peticion: Request): Veredicto {
  const secreto = process.env.CRON_SECRET
  const cabecera = peticion.headers.get('authorization')

  if (!secreto || cabecera !== `Bearer ${secreto}`) {
    return {
      pasa: false,
      respuesta: Response.json({ estado: 'no autorizado' }, { status: 401 }),
    }
  }

  return { pasa: true }
}
