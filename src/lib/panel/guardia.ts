/**
 * La RLS filtra; el codigo comprueba y avisa. Tambien en el panel.
 *
 * ESTA ES LA REGLA QUE SE DESCUBRIO CONSTRUYENDO, APLICADA AL PANEL
 *
 * Esta PROHIBIDO repetir en la consulta un predicado de seguridad que la RLS ya
 * aplica. Un `.eq('clinica_id', sesion.clinicaId)` «por prudencia» parece
 * defensa en profundidad y es lo contrario: el dia que una politica de
 * inquilino se rompa, ese `.eq` devolvera exactamente las mismas filas de
 * siempre y nadie se enterara de nada. La RLS decide que filas hay; esto
 * comprueba que las que llegaron son las que tenian que llegar, y grita si no.
 *
 * Es el mismo reparto que `src/lib/barandillas/filtro.ts` hace para el bot, y
 * lo vigila un guardian estatico propio:
 * `tests/panel/01-sin-filtro-en-el-panel.test.ts`.
 *
 * EL AVISO NO REPITE EL SECRETO
 *
 * Igual que en F2: se nombra la fila por su origen (`faq#uuid`), nunca su
 * contenido. Un aviso de fuga que copia lo que se ha fugado es otra fuga, y
 * ademas queda escrito en un sitio que la purga de 90 dias no mira.
 */
import { origenDe, type Origen } from '@/lib/barandillas/origen'

export type FilaDeClinica = { id: string | number; clinica_id: string }

export type Comprobado<T> = {
  /** Lo que se puede ensenar. */
  readonly filas: readonly T[]
  /** Cuantas llegaron en total, incluidas las que no eran de esta clinica. */
  readonly recibidas: number
  /** Origenes de lo que llego sin ser de esta clinica. Sin contenido. */
  readonly ajenas: readonly Origen[]
}

export type Registro = {
  error: (mensaje: string) => void
}

const REGISTRO_CONSOLA: Registro = { error: (mensaje) => console.error(mensaje) }

/**
 * El nucleo comprobable, separado de la consulta a proposito: simular una
 * politica de inquilino rota es pasarle una fila con otro `clinica_id`, sin
 * tocar la base de datos ni levantar un navegador.
 */
export function comprobarInquilino<T extends FilaDeClinica>(
  tabla: string,
  filas: readonly T[],
  clinicaId: string,
  registro: Registro = REGISTRO_CONSOLA,
): Comprobado<T> {
  const buenas: T[] = []
  const ajenas: Origen[] = []

  for (const fila of filas) {
    if (fila.clinica_id === clinicaId) buenas.push(fila)
    else ajenas.push(origenDe(tabla, fila.id))
  }

  if (ajenas.length > 0) {
    registro.error(
      `  ⚠  AISLAMIENTO ROTO en ${tabla}: ${ajenas.length} fila(s) de otra clinica han ` +
        `llegado al panel de ${clinicaId} y se han descartado aqui. ` +
        `Origenes: ${ajenas.join(', ')}. ` +
        'Revisa las politicas RLS de supabase/migrations antes de seguir.',
    )
  }

  return { filas: buenas, recibidas: filas.length, ajenas }
}

/**
 * Un error de PostgREST no se traga.
 *
 * Devolver una lista vacia seria peor que fallar: la agenda diria «hoy no hay
 * ninguna cita» con la misma cara con la que lo dice cuando es verdad, y
 * recepcion se iria a comer.
 */
export function exigirFilas<T>(
  que: string,
  data: T[] | null,
  error: { message: string } | null,
): T[] {
  if (error) throw new Error(`Leyendo ${que} para el panel: ${error.message}`)
  return data ?? []
}
