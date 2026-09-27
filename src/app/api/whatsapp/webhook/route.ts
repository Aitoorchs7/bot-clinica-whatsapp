/**
 * El webhook de WhatsApp. El unico punto de entrada del canal.
 *
 * EL ORDEN DE LOS CINCO PASOS DEL POST ES LA SEGURIDAD. NO SE TOCA.
 *
 *   1. cuerpo = await req.text()       CRUDO. Nunca req.json() antes.
 *   2. verificar la firma              si no cuadra: 401 y fuera.
 *   3. INSERT en eventos_webhook       si ya existia: 200 y fuera.
 *   4. responder 200                   ANTES de llamar al modelo.
 *   5. after() -> procesarMensaje()    el trabajo lento, ya contestado Meta.
 *
 * Cada paso impide una cosa concreta:
 *
 *   1 · Meta escapa los no-ASCII (`miércoles`) y firma ESOS bytes. Si se
 *       parsea y se re-serializa, `JSON.stringify` no vuelve a escapar y la
 *       firma no cuadra JAMAS con un acento por medio — o sea, siempre, en
 *       espanol. Detalle entero en `firma.ts`.
 *
 *   2 · Sin firma, cualquiera que conozca la URL le dicta mensajes al bot de
 *       una clinica. Es el unico cerrojo que hay en esta puerta.
 *
 *   3 · Meta reintenta durante 36 horas. Procesar dos veces el mismo evento
 *       crea DOS citas. La garantia es el indice unico de la base, no una
 *       comprobacion en memoria: dos invocaciones serverless no se ven.
 *
 *   4 · Una vuelta de herramientas con Gemini tarda segundos. Si se contesta
 *       despues, Meta da la entrega por fallida y reintenta — y entonces el
 *       paso 3 es lo unico que separa al paciente de una cita duplicada.
 *
 * POR QUE `proxy.ts` NO PROTEGE ESTA RUTA
 *
 * Porque no debe: quien llama es Meta, no una sesion con cookie. La
 * autenticacion de esta ruta ES la firma HMAC, y vive aqui dentro.
 */
import { after } from 'next/server'

import { anotarEvento, clienteDe, marcarProcesado } from '@/lib/whatsapp/almacen'
import { idDeEvento, leerCarga, type Entrante, type EstadoEntrante } from '@/lib/whatsapp/botones'
import { clinicaDelNumero, exigir } from '@/lib/whatsapp/config'
import { CABECERA_FIRMA, firmaValida, tokenValido } from '@/lib/whatsapp/firma'
import { procesarEstado, procesarMensaje } from '@/lib/whatsapp/procesar'

/**
 * El trabajo de `after()` incluye el debounce (8 s) mas la vuelta de
 * herramientas del modelo mas los envios. 60 s da margen de sobra y evita que
 * la plataforma corte a mitad de una conversacion.
 */
export const maxDuration = 60

const registro = {
  info: (texto: string) => console.log(texto),
  error: (texto: string) => console.error(texto),
}

// ---------------------------------------------------------------------------
// GET · la verificacion de Meta
// ---------------------------------------------------------------------------

/**
 * Meta llama una vez, al dar de alta el webhook, con `hub.mode=subscribe`.
 *
 * Se devuelve el `hub.challenge` TAL CUAL, en texto plano. Devolverlo envuelto
 * en JSON no vale: Meta compara el cuerpo literal.
 */
export function GET(req: Request): Response {
  const parametros = new URL(req.url).searchParams

  const modo = parametros.get('hub.mode')
  const token = parametros.get('hub.verify_token')
  const desafio = parametros.get('hub.challenge')

  if (modo !== 'subscribe' || !desafio) {
    return new Response('forbidden', { status: 403 })
  }

  // En tiempo constante: es un secreto compartido como cualquier otro.
  if (!tokenValido(token, process.env.WHATSAPP_VERIFY_TOKEN ?? '')) {
    registro.error('  ⚠  Verificacion del webhook con un verify_token que no cuadra.')
    return new Response('forbidden', { status: 403 })
  }

  return new Response(desafio, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

// ---------------------------------------------------------------------------
// POST · los mensajes
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  // 1 · EL CUERPO CRUDO. Este `req.text()` es lo primero que pasa, siempre.
  const cuerpo = await req.text()

  // 2 · La firma.
  let appSecret: string
  try {
    appSecret = exigir('META_APP_SECRET')
  } catch (fallo) {
    // Sin secreto no se puede verificar nada, y sin verificar no se procesa.
    // 500 y no 401: el problema es nuestro, no de quien llama.
    registro.error(`  ⚠  ${fallo instanceof Error ? fallo.message : String(fallo)}`)
    return new Response('misconfigured', { status: 500 })
  }

  if (!firmaValida(cuerpo, req.headers.get(CABECERA_FIRMA), appSecret)) {
    registro.error('  ⚠  Webhook con firma que no cuadra: 401.')
    return new Response('unauthorized', { status: 401 })
  }

  // Ya verificado: esto viene de Meta. A partir de aqui, cualquier fallo
  // nuestro se traga y se devuelve 200, porque un error haria que Meta
  // reintentara durante 36 horas algo que no vamos a saber atender mejor.
  let leido
  try {
    leido = leerCarga(JSON.parse(cuerpo))
  } catch {
    registro.error('  ⚠  Webhook con un cuerpo que no es JSON. Se acepta y se ignora.')
    return ok()
  }

  const trabajos: (Entrante | EstadoEntrante)[] = [...leido.mensajes, ...leido.estados]
  if (trabajos.length === 0) return ok()

  // 3 · Idempotencia, ANTES de contestar y antes de tocar el modelo.
  const pendientes: { trabajo: Entrante | EstadoEntrante; clinicaId: string; eventoId?: number }[] =
    []

  for (const trabajo of trabajos) {
    const clinicaId = clinicaDelNumero(trabajo.phoneNumberId)
    if (!clinicaId) {
      registro.error(`  ⚠  Webhook de un phone_number_id ajeno: ${trabajo.phoneNumberId}`)
      continue
    }

    try {
      const anotacion = await anotarEvento(
        clinicaId,
        idDeEvento(trabajo),
        // La carga cruda se guarda para depurar; la purga la vacia a los 7 dias
        // (migracion 007) porque lleva dentro lo que escribio el paciente.
        JSON.parse(cuerpo),
        clienteDe(clinicaId),
      )

      if (!anotacion.nuevo) {
        registro.info(`  reintento de Meta ya visto: ${idDeEvento(trabajo)}`)
        continue
      }

      pendientes.push({
        trabajo,
        clinicaId,
        ...(anotacion.id === undefined ? {} : { eventoId: anotacion.id }),
      })
    } catch (fallo) {
      registro.error(
        `  ⚠  No se ha podido anotar el evento: ${
          fallo instanceof Error ? fallo.message : String(fallo)
        }`,
      )
    }
  }

  if (pendientes.length === 0) return ok()

  // 5 · El trabajo lento, despues de la respuesta. `after()` lo mantiene vivo.
  after(async () => {
    for (const { trabajo, clinicaId, eventoId } of pendientes) {
      try {
        if ('clase' in trabajo) {
          await procesarMensaje(trabajo, { registro })
        } else {
          await procesarEstado(trabajo, { registro })
        }

        if (eventoId !== undefined) {
          await marcarProcesado(clinicaId, eventoId, clienteDe(clinicaId))
        }
      } catch (fallo) {
        // Un fallo aqui ya no puede cambiar la respuesta: Meta tiene su 200.
        // Se deja escrito y se sigue con el resto de los trabajos.
        registro.error(
          `  ⚠  Fallo procesando ${idDeEvento(trabajo)}: ${
            fallo instanceof Error ? `${fallo.message}\n${fallo.stack ?? ''}` : String(fallo)
          }`,
        )
      }
    }
  })

  // 4 · El 200 sale AQUI, antes de que `after()` haya corrido nada.
  return ok()
}

function ok(): Response {
  return new Response('EVENT_RECEIVED', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
