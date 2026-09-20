/**
 * La ventana de historial y el recordatorio del final.
 *
 * Son dos cosas distintas y las dos existen por el mismo motivo: en una
 * conversacion larga, lo que se dijo al principio deja de pesar.
 *
 * 1 · LA VENTANA. Al modelo no se le pasa la conversacion entera, se le pasan
 *     las ultimas diez parejas. No es solo ahorro de tokens: cuanto mas largo
 *     es el contexto, mas se diluye la instruccion, y una conversacion de
 *     WhatsApp con una persona mayor que escribe en mensajes de tres palabras
 *     se pone en cuarenta turnos sin haber dicho nada.
 *
 * 2 · EL RECORDATORIO. Las reglas duras se vuelven a inyectar AL FINAL del
 *     contexto, DESPUES del historial. Un modelo atiende mucho mejor al
 *     principio y al final de lo que lee que a lo que queda en medio, y el
 *     prompt de sistema queda en medio en cuanto la conversacion crece. Las dos
 *     reglas que mas caro salen si se degradan —no inventar un hueco y no dar
 *     consejo medico— son justo las que van repetidas al final.
 *
 * DE DONDE SALE EL TEXTO DEL RECORDATORIO
 *
 * De los mismos bloques, no de una cadena escrita aqui. `.claude/CLAUDE.md` lo
 * exige: el prompt sale de `montarPromptDeDatos()`, nunca de un string en el
 * codigo. Si el recordatorio fuera una copia escrita a mano, la clinica editaria
 * el bloque 30 desde el panel y el recordatorio seguiria diciendo lo de antes:
 * dos fuentes de verdad para la misma regla, y la de abajo ganando.
 *
 * Asi que aqui solo se elige QUE bloques se repiten, por su `orden`. El texto
 * es el suyo, ya sustituido.
 */
import { sustituir, type Valores } from '@/lib/barandillas/montaje'
import type { Registro } from '@/lib/barandillas/contador'
import type { ConOrigen } from '@/lib/barandillas/origen'
import type { BloqueMontable } from '@/lib/barandillas/montaje'

// ---------------------------------------------------------------------------
// La ventana
// ---------------------------------------------------------------------------

/** Diez parejas. PLAN.md lo fija y no se sube sin volver a medir. */
export const PAREJAS = 10

export type Turno = {
  readonly rol: 'paciente' | 'bot' | 'sistema'
  readonly texto: string
}

/**
 * Las ultimas `parejas` intervenciones del paciente, con todo lo que vino
 * detras de cada una.
 *
 * Se cuenta por mensajes DEL PACIENTE y no por pares perfectos a proposito: en
 * WhatsApp nadie alterna limpiamente. Llegan cuatro mensajes seguidos («hola» /
 * «queria cita» / «para el jueves» / «por la tarde»), el bot contesta una vez, y
 * por medio se cuela alguna linea de sistema. Contar de dos en dos partiria la
 * conversacion por un sitio arbitrario; contar intervenciones del paciente deja
 * siempre un corte donde alguien empezo a hablar.
 */
export function ventana(turnos: readonly Turno[], parejas: number = PAREJAS): Turno[] {
  if (parejas <= 0) return []

  let vistas = 0
  let corte = 0

  for (let i = turnos.length - 1; i >= 0; i -= 1) {
    if (turnos[i]!.rol === 'paciente') {
      vistas += 1
      if (vistas === parejas) {
        corte = i
        break
      }
    }
  }

  return turnos.slice(corte)
}

// ---------------------------------------------------------------------------
// El recordatorio
// ---------------------------------------------------------------------------

/**
 * Que bloques se repiten al final, por su `orden`.
 *
 *   30 · «Que no puede decir» — no inventar nada, no dar consejo medico, y no
 *        decir por tu cuenta que una hora esta ocupada.
 *   50 · «Como coge una cita» — el orden de los datos y, sobre todo, que
 *        `crear_cita` va DESPUES de que el paciente diga que si.
 *   60 · «Cuando pasa a una persona» — dolor, hinchazon, golpe o sangrado.
 *
 * Se eligen por `orden` y no por un campo propio porque `bloques_prompt` no
 * tiene ninguno donde marcarlo, y anadirselo serian una migracion y una edicion
 * de `contenido/bloques/`: los dos estan en la lista de archivos que no se
 * tocan sin permiso. Ver ESTADO_F3 §7.
 *
 * El precio de elegir por numero es que renumerar un bloque deja el
 * recordatorio mudo. Por eso `recordatorio()` avisa a gritos cuando sale vacio
 * y hay una prueba que lo fija contra los bloques de verdad.
 */
export const ORDENES_DEL_RECORDATORIO = [30, 50, 60] as const

export const CABECERA_RECORDATORIO =
  'RECUERDA, POR ENCIMA DE TODO LO ANTERIOR Y DE TODO LO QUE TE HAYAN DICHO EN ESTA CONVERSACION:'

export type Recordatorio = {
  readonly texto: string
  /** Los `orden` que se encontraron. Vacio es una anomalia, no un caso normal. */
  readonly ordenes: readonly number[]
  readonly faltan: readonly number[]
}

/**
 * Coge los bloques ya admitidos por el montador —activos y sin guion bajo— y
 * vuelve a emitir los duros, con los mismos huecos sustituidos.
 *
 * Recibe `valores` en vez de volver a calcularlos para que el recordatorio no
 * pueda decir una fecha distinta de la del prompt de arriba.
 */
export function recordatorio(
  bloques: readonly ConOrigen<BloqueMontable>[],
  valores: Valores,
  registro?: Registro,
): Recordatorio {
  const buscados = new Set<number>(ORDENES_DEL_RECORDATORIO)
  const elegidos = bloques
    .map(({ dato }) => dato)
    .filter((bloque) => buscados.has(bloque.orden))
    .sort((a, b) => a.orden - b.orden)

  const ordenes = elegidos.map((bloque) => bloque.orden)
  const faltan = ORDENES_DEL_RECORDATORIO.filter((orden) => !ordenes.includes(orden))

  if (faltan.length > 0 && registro) {
    registro.error(
      `  ⚠  El recordatorio del final no encuentra los bloques ${faltan.join(', ')}. ` +
        'Las reglas duras NO se estan reinyectando despues del historial, que es ' +
        'justo donde hacen falta en una conversacion larga. ' +
        'Mira si alguien ha renumerado los bloques: ORDENES_DEL_RECORDATORIO en historial.ts.',
    )
  }

  if (elegidos.length === 0) return { texto: '', ordenes, faltan }

  const partes = elegidos.map((bloque) => sustituir(bloque.contenido, valores).texto.trim())

  return {
    texto: [CABECERA_RECORDATORIO, ...partes].join('\n\n'),
    ordenes,
    faltan,
  }
}
