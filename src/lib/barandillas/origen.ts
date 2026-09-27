/**
 * Barandilla 4, la mitad que se puede medir: cada dato inyectado en el prompt
 * lleva escrito de donde salio, en la forma `tabla#id`.
 *
 * Por que existe este archivo:
 *
 * 1. Cuando la bateria adversaria encuentra el MARCADOR en una respuesta, la
 *    pregunta siguiente es siempre «¿por que fila entro?». Sin origenes hay
 *    que reconstruirlo a mano comparando textos; con ellos es una linea del
 *    registro.
 *
 * 2. Cuando `filtro.ts` recibe una fila que NO deberia haberle llegado, hay
 *    que dar la alarma sin repetir el secreto. Un origen nombra la fila sin
 *    decir lo que hay dentro: `faq#47e0aa43-...` se puede escribir en un log,
 *    en `eventos` y en un aviso al equipo. `respuesta_aprobada` no.
 *
 * Un origen NUNCA contiene contenido. Solo tabla e identificador.
 */

/** `tabla#id`. Se lee de un vistazo y se busca con un `where id = ...`. */
export type Origen = `${string}#${string}`

/** Un dato cualquiera con la fila de la que salio pegada al lado. */
export type ConOrigen<T> = {
  readonly dato: T
  readonly origen: Origen
}

/** Lo minimo que se le pide a una fila para poder citarla. */
export type FilaConId = { id: string | number }

/**
 * El separador va dentro del identificador solo si alguien lo ha metido a mano
 * en un nombre de tabla. Se comprueba porque un origen partido en dos apunta a
 * una fila que no existe, y eso es peor que no tener origen: parece una pista.
 */
const SEPARADOR = '#'

export function origenDe(tabla: string, id: string | number): Origen {
  const nombre = tabla.trim()
  if (nombre === '' || nombre.includes(SEPARADOR)) {
    throw new Error(
      `Nombre de tabla invalido para un origen: ${JSON.stringify(tabla)}. ` +
        'No puede estar vacio ni contener "#".',
    )
  }

  const identificador = String(id).trim()
  if (identificador === '') {
    throw new Error(`Fila sin id en ${nombre}: un origen sin id no apunta a nada.`)
  }

  return `${nombre}${SEPARADOR}${identificador}`
}

/** Pega el origen a una fila que ya trae su `id`. */
export function conOrigen<T extends FilaConId>(tabla: string, fila: T): ConOrigen<T> {
  return { dato: fila, origen: origenDe(tabla, fila.id) }
}

/** Lo mismo para una consulta entera. */
export function conOrigenes<T extends FilaConId>(tabla: string, filas: T[]): ConOrigen<T>[] {
  return filas.map((fila) => conOrigen(tabla, fila))
}

/** La tabla de un origen. Para agrupar en el registro. */
export function tablaDe(origen: Origen): string {
  return origen.slice(0, origen.indexOf(SEPARADOR))
}

/** El id de un origen. Para el `where` cuando toca ir a mirar la fila. */
export function idDe(origen: Origen): string {
  return origen.slice(origen.indexOf(SEPARADOR) + 1)
}

/**
 * Que hueco del prompt se llevo que filas.
 *
 * `{{faq}}` no sale de una fila, sale de catorce. Cuando el marcador aparece en
 * el prompt montado, esto es lo que dice cuales mirar.
 */
export type RegistroDeOrigenes = Readonly<Record<string, readonly Origen[]>>

/** Solo los origenes, sin los datos. Es lo unico que se puede registrar. */
export function soloOrigenes<T>(conOrigen: readonly ConOrigen<T>[]): Origen[] {
  return conOrigen.map((c) => c.origen)
}
