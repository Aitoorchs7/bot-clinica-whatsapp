/**
 * Avisar al equipo cuando el bot escala.
 *
 * Lo decidio el usuario y son tres cosas, ni una mas:
 *
 *   1. Al paciente: el mensaje seguro aprobado + el telefono de la clinica.
 *      Eso lo hace `responder()` de F3 y lo manda `procesar.ts`; aqui no.
 *   2. La fila en `escalados`, con `mensaje_id` apuntando al mensaje que lo
 *      disparo. La escribe la herramienta de F3; F4 solo le pasa el id.
 *   3. Avisar al equipo: por WhatsApp (plantilla) y por email. Eso es esto.
 *
 * NO HAY BANDEJA DE RESPUESTA HUMANA EN ESTA VERSION. El aviso dice que hay
 * algo que mirar y donde; contestar es cosa de recepcion, por su canal.
 *
 * NI UNA PALABRA DE LO QUE ESCRIBIO EL PACIENTE SALE DE AQUI
 *
 * Es la misma regla que hizo desaparecer `escalados.resumen` en la migracion
 * 007. El aviso lleva el motivo y el asunto —los dos enums— y el telefono del
 * paciente. El detalle se lee abriendo la conversacion, que es lo unico que la
 * purga de 90 dias se lleva. Un sintoma metido en un WhatsApp o en un correo se
 * queda en el movil de recepcion y en un servidor de correo para siempre, fuera
 * del alcance de cualquier borrado que podamos prometer.
 *
 * UN AVISO QUE FALLA NO TUMBA LA CONVERSACION
 *
 * El paciente ya tiene su mensaje seguro y su telefono, que es lo urgente. Si
 * el aviso al equipo se cae, se registra ruidosamente y se sigue. Devolver un
 * error aqui haria que Meta reintentara el webhook entero y el paciente
 * recibiria el mensaje dos veces.
 */
import { opcional } from './config'
import { enviarPlantilla, type Destino, type OpcionesDeEnvio } from './enviar'
import { avisoEscalado } from './plantillas'
import type { Fetch } from './meta'

/** Como se le dice a una persona cada motivo del enum. */
const MOTIVOS: Readonly<Record<string, string>> = {
  pregunta_fuera_de_faq: 'una pregunta que no está en las respuestas aprobadas',
  pidio_persona: 'ha pedido hablar con una persona',
  datos_incompletos: 'faltan datos para poder darle cita',
  urgencia_grave: 'posible urgencia',
  no_entendido: 'no se ha conseguido entender qué necesita',
}

const ASUNTOS: Readonly<Record<string, string>> = {
  revision: 'revisión',
  urgencia: 'urgencia',
  estetica: 'estética',
  ortodoncia: 'ortodoncia',
  otro: 'otro',
}

export function enPalabras(motivo: string): string {
  return MOTIVOS[motivo] ?? motivo
}

export function asuntoEnPalabras(asunto: string): string {
  return ASUNTOS[asunto] ?? asunto
}

export type AvisoAlEquipo = {
  readonly clinicaId: string
  readonly nombreClinica: string
  readonly telefonoRecepcion: string
  readonly emailAvisos: string
  readonly phoneNumberId: string
  readonly telefonoPaciente: string
  readonly motivo: string
  readonly asunto: string
}

export type ResultadoDelAviso = {
  readonly porWhatsapp: boolean
  readonly porEmail: boolean
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * El correo se manda por HTTP, sin dependencia nueva.
 *
 * No habia proveedor de email decidido en ninguna parte del proyecto y el
 * encargo pide avisar por correo, asi que se elige uno: Resend, que tiene API
 * HTTP y no obliga a instalar nada. Todo lo especifico del proveedor esta en
 * esta funcion: cambiarlo es reescribir estas veinte lineas.
 *
 * Sin `RESEND_API_KEY` no se manda y se avisa en el registro. Un entorno de
 * desarrollo sin correo configurado no puede romper el canal.
 */
async function enviarEmail(
  aviso: AvisoAlEquipo,
  opciones: { fetch?: Fetch; registro?: { info(t: string): void; error(t: string): void } },
): Promise<boolean> {
  const clave = opcional('RESEND_API_KEY')
  const remitente = opcional('EMAIL_REMITENTE')

  if (!clave || !remitente) {
    opciones.registro?.error(
      '  ⚠  No hay RESEND_API_KEY / EMAIL_REMITENTE: el aviso por email no sale.',
    )
    return false
  }

  const hacer = opciones.fetch ?? fetch

  try {
    const respuesta = await hacer('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${clave}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: remitente,
        to: [aviso.emailAvisos],
        subject: `Hay una conversación que necesita a una persona · ${aviso.nombreClinica}`,
        text: [
          `Un paciente de ${aviso.nombreClinica} necesita que le atienda alguien del equipo.`,
          '',
          `Motivo: ${enPalabras(aviso.motivo)}`,
          `Asunto: ${asuntoEnPalabras(aviso.asunto)}`,
          `Teléfono del paciente: ${aviso.telefonoPaciente}`,
          '',
          'La conversación completa está en el panel. Este correo no la incluye a',
          'propósito: lo que el paciente haya contado se borra a los 90 días y solo',
          'vive en un sitio.',
        ].join('\n'),
      }),
    })

    if (!respuesta.ok) {
      opciones.registro?.error(`  ⚠  El aviso por email ha fallado: ${respuesta.status}`)
      return false
    }
    return true
  } catch (fallo) {
    opciones.registro?.error(
      `  ⚠  El aviso por email ha fallado: ${fallo instanceof Error ? fallo.message : String(fallo)}`,
    )
    return false
  }
}

// ---------------------------------------------------------------------------
// El aviso completo
// ---------------------------------------------------------------------------

/**
 * Los dos avisos, en paralelo y sin que uno se lleve al otro por delante.
 *
 * `allSettled` y no `all`: si el WhatsApp falla, el email tiene que salir
 * igual. Son dos caminos a proposito, justo para que un fallo de Meta no deje
 * al equipo sin enterarse.
 */
export async function avisarAlEquipo(
  aviso: AvisoAlEquipo,
  opciones: OpcionesDeEnvio & {
    fetchEmail?: Fetch
    registro?: { info(t: string): void; error(t: string): void }
  } = {},
): Promise<ResultadoDelAviso> {
  const destino: Destino = {
    phoneNumberId: aviso.phoneNumberId,
    telefono: aviso.telefonoRecepcion,
  }

  const plantilla = avisoEscalado({
    clinica: aviso.nombreClinica,
    motivo: enPalabras(aviso.motivo),
    asunto: asuntoEnPalabras(aviso.asunto),
    telefonoPaciente: aviso.telefonoPaciente,
  })

  const [porWhatsapp, porEmail] = await Promise.allSettled([
    enviarPlantilla(destino, plantilla, opciones),
    enviarEmail(aviso, {
      ...(opciones.fetchEmail ? { fetch: opciones.fetchEmail } : {}),
      ...(opciones.registro ? { registro: opciones.registro } : {}),
    }),
  ])

  if (porWhatsapp.status === 'rejected') {
    opciones.registro?.error(
      `  ⚠  El aviso al equipo por WhatsApp ha fallado: ${String(porWhatsapp.reason)}`,
    )
  }

  const whatsappOk = porWhatsapp.status === 'fulfilled'
  const emailOk = porEmail.status === 'fulfilled' && porEmail.value

  if (!whatsappOk && !emailOk) {
    opciones.registro?.error(
      '  ⚠  EL EQUIPO NO SE HA ENTERADO DEL ESCALADO POR NINGUNA VIA. La fila de ' +
        '`escalados` esta escrita, asi que aparecera en el panel, pero nadie ha recibido aviso.',
    )
  }

  return { porWhatsapp: whatsappOk, porEmail: emailOk }
}
