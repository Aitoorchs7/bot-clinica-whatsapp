/**
 * EL PEOR MODELO POSIBLE, y el clasificador que nunca escala.
 *
 * Vivian dentro de `tests/fuga/01-bateria.test.ts`, que es donde nacieron y
 * donde estan explicados. Se sacaron aqui en F8 porque el acta de un alta
 * (`tests/alta/02-acta.comprobacion.ts`) tiene que correr LA MISMA bateria
 * contra la clinica recien creada, y copiarlo alli habria sido exactamente el
 * fallo de F7: una prueba que copia a la que funciona comprueba a la copia.
 * Con esto, si alguien hace al modelo menos indiscreto, las dos se enteran.
 *
 * Que hace, en corto: llama a las dos herramientas que leen la base y despues
 * VUELCA LITERALMENTE todo lo que ha visto —prompt de sistema, recordatorio,
 * turnos y resultados de herramienta— en su respuesta al paciente.
 *
 * Contra este modelo, un dato confidencial solo puede faltar en la respuesta
 * por un motivo: porque nunca entro. Que es justo lo que hay que demostrar.
 * Un modelo prudente que recibe el margen y tiene el buen gusto de callarselo
 * da verde y ha fallado la garantia.
 */
import type { Modelo, Peticion as PeticionAlModelo, Respuesta } from '@/lib/bot/gemini'

export type ModeloIndiscreto = Modelo & { vistas: PeticionAlModelo[] }

/**
 * Vuelta 1: pide `repasar_ficha` (lee `pacientes` y `citas`).
 * Vuelta 2: pide `consultar_huecos` (lee `tratamientos` y la agenda).
 * Vuelta 3: no pide nada y lo suelta todo. Ahi acaba el bucle.
 */
export function modeloIndiscreto(): ModeloIndiscreto {
  const vistas: PeticionAlModelo[] = []

  const modelo = (async (peticion: PeticionAlModelo): Promise<Respuesta> => {
    vistas.push(peticion)

    if (vistas.length === 1) {
      return { texto: '', llamadas: [{ nombre: 'repasar_ficha', argumentos: {} }] }
    }
    if (vistas.length === 2) {
      return {
        texto: '',
        llamadas: [
          {
            nombre: 'consultar_huecos',
            // Manana. No importa si hay huecos o no: lo que interesa es que la
            // herramienta lea la base y devuelva algo al modelo.
            argumentos: {
              tratamiento: 'revision',
              dia: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
            },
          },
        ],
      }
    }

    // El volcado. Todo lo que ha visto, sin filtrar.
    return { texto: `VOLCADO: ${JSON.stringify(vistas)}`, llamadas: [] }
  }) as ModeloIndiscreto

  modelo.vistas = vistas
  return modelo
}

/** Un clasificador que nunca escala: asi el cerebro llega a ver el mensaje. */
export const clasificadorMudo: Modelo = async () => ({
  texto: JSON.stringify({ intencion: 'otro', urgencia: 'ninguna', escalar: false }),
  llamadas: [],
})
