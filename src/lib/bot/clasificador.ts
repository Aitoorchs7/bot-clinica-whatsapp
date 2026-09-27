/**
 * El clasificador. Corre ANTES del cerebro y puede cortar sin llegar a el.
 *
 * Dos capas, y el orden importa mas que las dos:
 *
 *   1 · REGLAS DURAS. Deterministas, sin red, sin modelo. Dolor, hinchazon,
 *       golpe, sangrado, o «quiero hablar con una persona».
 *   2 · `gemini-3.1-flash-lite`, solo para lo que la capa 1 no ha resuelto.
 *
 * POR QUE LAS REGLAS VAN PRIMERO Y NO LAS DECIDE EL MODELO
 *
 * Porque la capa 1 tiene que funcionar con Google caido, con la cuota diaria
 * agotada y con el modelo devolviendo un JSON roto. Alguien que escribe a una
 * clinica un domingo por la noche con la cara hinchada recibe el telefono de
 * urgencias aunque no haya ni un modelo disponible en el planeta. Si eso
 * dependiera de una llamada HTTP, seria la peor de las dependencias: la que
 * falla justo el dia que hace falta.
 *
 * Y una segunda razon, de producto: ante dolor, el mensaje va el primero y va
 * SOLO —el bloque 60 lo dice literal—, sin una palabra sobre lo que la persona
 * pueda tener. Eso no se le pide a un modelo por prompt, se hace sin el:
 * saltando directo a la ultima capa de fallback. El cerebro no llega a ver el
 * mensaje, asi que no puede opinar sobre un sintoma ni aunque quiera.
 */
import { z } from 'zod'

import type { DatosDelPrompt } from '@/lib/barandillas/filtro'
import type { Registro } from '@/lib/barandillas/contador'

import { MODELO_CLASIFICADOR, SIN_PENSAR, type Modelo } from './gemini'
import { normalizar, type MotivoEscalado } from './validacion'

export const INTENCIONES = [
  'saludo',
  'cita',
  'pregunta',
  'urgencia',
  'persona',
  'otro',
] as const
export type Intencion = (typeof INTENCIONES)[number]

export type Clasificacion = {
  readonly intencion: Intencion
  readonly urgencia: 'ninguna' | 'alta'
  readonly escalar: boolean
  readonly motivoEscalado?: MotivoEscalado
  /** true si lo decidio la capa 1. Es lo que se mira para saber si hubo modelo. */
  readonly porRegla: boolean
}

// ---------------------------------------------------------------------------
// Capa 1 · las reglas duras
// ---------------------------------------------------------------------------

/**
 * Las cuatro de `.claude/CLAUDE.md`: dolor, hinchazon, golpe, sangrado.
 *
 * Escritas como raices y no como palabras enteras porque la gente escribe
 * «duele», «dolia», «me duelen», y una nota de voz transcrita trae cualquiera
 * de las tres. Se comparan sobre el texto normalizado, sin tildes.
 */
const URGENCIA = [
  'dolor',
  'duele',
  'duelen',
  'dolia',
  'dolien',
  'molestia muy',
  'hinchad',
  'hinchazon',
  'inflamad',
  'flemon',
  'absceso',
  'sangra',
  'sangrado',
  'sangre',
  'golpe',
  'golpead',
  'me di un',
  'se me ha roto',
  'se me rompio',
  'partido un diente',
  'roto un diente',
  'no puedo dormir',
  'no aguanto',
  'urgencia',
  'urgente',
]

/** «Quiero hablar con una persona», en las formas en que se dice de verdad. */
const PIDE_PERSONA = [
  'hablar con una persona',
  'hablar con alguien',
  'con una persona',
  'persona real',
  'operador',
  'humano',
  'no quiero hablar con un bot',
  'quiero que me llamen',
  'que me llame alguien',
  // «Me pasas con recepcion» es como se pide de verdad, mucho mas que
  // «quisiera hablar con un agente humano».
  'con recepcion',
  'pasame con',
  'pasas con',
  'me pases con',
]

/**
 * Una negacion justo delante desactiva el termino: «no me duele nada» no es una
 * urgencia. La ventana es corta —cuatro palabras— porque «no» y el sintoma
 * lejos en la frase suelen ser dos cosas distintas: «no se si es normal, me
 * duele mucho» es una urgencia y no puede caerse por un «no» al principio.
 */
const NEGACIONES = ['no', 'ni', 'ya no', 'sin', 'nada de', 'tampoco']

export function estaNegado(texto: string, posicion: number): boolean {
  const antes = texto.slice(0, posicion).trim().split(' ').slice(-4)
  return NEGACIONES.some((negacion) => antes.includes(negacion))
}

export type Regla = {
  readonly urgente: boolean
  readonly pidePersona: boolean
  /** El termino que disparo, para el registro. Nunca se le ensena al paciente. */
  readonly termino?: string
}

/** Capa 1, entera. Pura: ni red, ni base de datos, ni modelo. */
export function reglasDuras(texto: string): Regla {
  const limpio = normalizar(texto)

  for (const termino of URGENCIA) {
    const posicion = limpio.indexOf(termino)
    if (posicion >= 0 && !estaNegado(limpio, posicion)) {
      return { urgente: true, pidePersona: false, termino }
    }
  }

  for (const termino of PIDE_PERSONA) {
    if (limpio.includes(termino)) {
      return { urgente: false, pidePersona: true, termino }
    }
  }

  return { urgente: false, pidePersona: false }
}

// ---------------------------------------------------------------------------
// Capa 2 · el modelo
// ---------------------------------------------------------------------------

const esquemaRespuesta = z.object({
  intencion: z.enum(INTENCIONES).catch('otro'),
  urgencia: z.enum(['ninguna', 'alta']).catch('ninguna'),
  escalar: z.boolean().catch(false),
})

/**
 * El unico prompt escrito en codigo de todo el proyecto, y se explica.
 *
 * `.claude/CLAUDE.md` exige que el prompt DEL BOT salga de
 * `montarPromptDeDatos()`, porque es lo que la clinica edita desde el panel: su
 * forma de hablar, sus limites, sus datos. Esto no es eso. El clasificador no
 * le habla a nadie: mira un mensaje y devuelve tres campos. No contiene ni un
 * dato de la clinica, no llega a ningun paciente, y darle a una clinica un
 * campo de texto para editar como se enruta una urgencia seria un fallo de
 * diseno, no una funcionalidad.
 */
const INSTRUCCION = [
  'Clasificas mensajes que llegan al WhatsApp de una clinica dental.',
  'No contestas al paciente. No das consejo. Solo devuelves JSON.',
  '',
  'Campos:',
  '  intencion: saludo | cita | pregunta | urgencia | persona | otro',
  '  urgencia:  alta si menciona dolor, hinchazon, un golpe o sangrado. ninguna en el resto.',
  '  escalar:   true si pide hablar con una persona, si se ha enfadado,',
  '             o si la urgencia es alta.',
  '',
  'Ante la duda, urgencia "ninguna" y escalar false: de lo contrario se pasa a',
  'recepcion gente que solo queria pedir hora.',
].join('\n')

/**
 * Clasifica. Las reglas primero; el modelo solo si hace falta.
 *
 * Si el modelo falla —cuota agotada, red caida, JSON roto— NO se tumba la
 * conversacion: se sigue como si no hubiera escalado y el cerebro decide, que
 * para eso tiene los bloques 30 y 60. Lo que no se pierde nunca es la capa 1,
 * porque ya ha corrido.
 */
export async function clasificar(
  texto: string,
  modelo?: Modelo,
  opciones: { registro?: Registro } = {},
): Promise<Clasificacion> {
  const regla = reglasDuras(texto)

  if (regla.urgente) {
    opciones.registro?.info(`  clasificador: urgencia por regla dura («${regla.termino}»)`)
    return {
      intencion: 'urgencia',
      urgencia: 'alta',
      escalar: true,
      motivoEscalado: 'urgencia_grave',
      porRegla: true,
    }
  }

  if (regla.pidePersona) {
    opciones.registro?.info(`  clasificador: pide persona por regla dura («${regla.termino}»)`)
    return {
      intencion: 'persona',
      urgencia: 'ninguna',
      escalar: true,
      motivoEscalado: 'pidio_persona',
      porRegla: true,
    }
  }

  if (!modelo) {
    return { intencion: 'otro', urgencia: 'ninguna', escalar: false, porRegla: true }
  }

  try {
    const respuesta = await modelo({
      modelo: MODELO_CLASIFICADOR,
      sistema: INSTRUCCION,
      turnos: [{ rol: 'usuario', partes: [{ tipo: 'texto', texto }] }],
      presupuestoPensamiento: SIN_PENSAR,
      temperatura: 0,
      soloJson: true,
    })

    const leido = esquemaRespuesta.parse(JSON.parse(respuesta.texto))

    return {
      intencion: leido.intencion,
      urgencia: leido.urgencia,
      escalar: leido.escalar || leido.urgencia === 'alta',
      motivoEscalado:
        leido.urgencia === 'alta'
          ? 'urgencia_grave'
          : leido.intencion === 'persona'
            ? 'pidio_persona'
            : leido.escalar
              ? 'pregunta_fuera_de_faq'
              : undefined,
      porRegla: false,
    }
  } catch (fallo) {
    opciones.registro?.error(
      `  ⚠  El clasificador no ha podido leer la respuesta del modelo: ` +
        `${fallo instanceof Error ? fallo.message : String(fallo)}. ` +
        'Se sigue sin escalar; las reglas duras ya han corrido.',
    )
    return { intencion: 'otro', urgencia: 'ninguna', escalar: false, porRegla: true }
  }
}

// ---------------------------------------------------------------------------
// La ultima capa de fallback
// ---------------------------------------------------------------------------

/**
 * La clave de `config` con el mensaje de urgencia de la clinica.
 *
 * Igual que `politica_privacidad`, vive en `config` y no en el codigo porque es
 * de la clinica: unas dicen «llame al 900...», otras «pase por la clinica, hay
 * un hueco de urgencias todas las mananas». Si no esta, se usa el texto de
 * abajo, que es el de V1 y no dice nada que una clinica no pueda firmar.
 *
 * ENTRA EN EL GUION DE `alta-clinica` (F8), como `politica_privacidad`.
 */
export const CLAVE_MENSAJE_URGENCIA = 'mensaje_urgencia'

/**
 * El texto por defecto. Tres cosas y ninguna mas: que avisan al equipo, el
 * telefono, y que llame si no puede esperar.
 *
 * Lo que NO lleva, y es lo importante: ni una palabra sobre el sintoma, ninguna
 * pregunta, ningun «entiendo que le duela». El bloque 60 lo exige y aqui no hay
 * modelo que lo pueda estropear, porque este mensaje no pasa por ninguno.
 */
export function mensajeDeUrgenciaPorDefecto(telefono: string): string {
  return (
    'Aviso ahora mismo al equipo de la clinica para que le atiendan cuanto antes. ' +
    `Si prefiere, puede llamar directamente al ${telefono}.`
  )
}

/**
 * El mensaje seguro, con el telefono de recepcion.
 *
 * Se lee de los datos ya cargados —que vienen del cliente del bot, con la RLS
 * puesta— y no se vuelve a consultar nada.
 */
export function mensajeSeguro(datos: DatosDelPrompt): string {
  const telefono = datos.clinica.dato.telefono_recepcion
  const escrito = datos.config.filas.find(
    ({ dato }) => dato.clave === CLAVE_MENSAJE_URGENCIA,
  )?.dato.valor

  const texto = escrito?.trim()
  return texto && texto !== '' ? texto : mensajeDeUrgenciaPorDefecto(telefono)
}
