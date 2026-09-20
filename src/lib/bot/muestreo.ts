/**
 * De la rejilla del RPC a las dos o tres opciones que se ofrecen.
 *
 * `consultar_huecos` devuelve la verdad completa y ordenada: un jueves con la
 * agenda vacia son treinta o cuarenta ranuras, y con dos gabinetes, ochenta.
 * Eso no se le lee a nadie por WhatsApp. El bot dice «tengo hueco a las 10, a
 * las 12 o a las 17».
 *
 * El muestreo vive AQUI y no en SQL, y la migracion 005 lo dice en su cabecera:
 * cual es la verdad es cosa de la base de datos, cuantas opciones se ofrecen es
 * cosa de la conversacion. Cambiar de dos a tres opciones no puede exigir una
 * migracion.
 *
 * LA REGLA QUE HACE QUE ESTO NO REPITA EL BUG DE V1
 *
 * Toda opcion que sale de aqui es un elemento de la lista que entro. No se
 * redondea una hora, no se suma un cuarto de hora para que quede mas bonito, no
 * se construye un instante nuevo. Si el RPC no lo dio, no se ofrece.
 *
 * V1 fusiono la rejilla con la que se OFRECEN huecos y la restriccion con la
 * que se RESERVAN, y el resultado fue un bot que rechazaba «las cinco y veinte»
 * con la agenda vacia diciendo que se lo acababan de coger. Aqui la rejilla es
 * solo una muestra de lo que hay: que una hora no salga ofrecida no significa
 * que este cogida, y el bloque 30 se lo dice al modelo con todas las letras.
 *
 * Por eso la prueba obligatoria de esta fase compara las dos puntas: ningun
 * hueco ofrecido puede ser rechazado por `crear_cita`.
 *
 * EL GABINETE NO SE OFRECE Y NO SE RESERVA
 *
 * La rejilla trae `gabinete_id` porque el RPC calcula sillon por sillon, y una
 * misma hora puede venir repetida una vez por sillon libre. Al paciente le da
 * igual el sillon, asi que se ofrece el instante una sola vez. Y al reservar
 * NO se pasa el gabinete: fijarlo convertiria «ese sillon se acaba de ocupar»
 * en un «ocupado» con los otros dos libres. Que elija `crear_cita`.
 */
import { es } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'

/** Una fila de `public.hueco`, tal y como la devuelve el RPC. */
export type Hueco = {
  readonly inicio: string
  readonly fin: string
  readonly gabinete_id: string
}

/** Lo que se le ofrece al paciente. Siempre sale de un `Hueco` que existio. */
export type Opcion = {
  readonly inicio: string
  readonly fin: string
  /** Solo para el registro: no viaja a `crear_cita`. Ver la cabecera. */
  readonly gabinete_id: string
  /** `jueves 24, 10:00`, en la hora de la clinica. Para que lo diga el modelo. */
  readonly cuando: string
}

/** Tres es lo normal. Dos cuando hay poco, cuatro como mucho. */
export const OPCIONES_POR_DEFECTO = 3
export const OPCIONES_MAXIMAS = 4

/**
 * Una hora por instante.
 *
 * Se queda con el primer gabinete de cada instante. El RPC ya viene ordenado
 * por `inicio, gabinete_id`, asi que «el primero» es estable entre dos
 * llamadas: un bot que ofrece las mismas horas en distinto orden cada vez es
 * imposible de depurar.
 */
export function porInstante(huecos: readonly Hueco[]): Hueco[] {
  const vistos = new Set<string>()
  const salida: Hueco[] = []

  for (const hueco of huecos) {
    if (vistos.has(hueco.inicio)) continue
    vistos.add(hueco.inicio)
    salida.push(hueco)
  }

  return salida.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
}

/**
 * `jueves 24, 10:00`, en la hora de la clinica y en castellano.
 *
 * El ano no se dice: nadie pide cita para 2031, y el RPC no ofrece nada mas
 * alla de `dias_maximos_antelacion`. El mes tampoco, salvo que haga falta, por
 * lo mismo que el bloque 20 pide frases cortas.
 */
export function comoSeDiceEs(inicio: string, zonaHoraria: string): string {
  return formatInTimeZone(new Date(inicio), zonaHoraria, "EEEE d 'de' MMMM',' HH:mm", {
    locale: es,
  })
}

/**
 * Reparte `n` elecciones a lo largo de la lista.
 *
 * Trozos contiguos del mismo tamano y una eleccion por trozo. Asi funciona
 * igual de bien si la lista es un jueves entero (sale manana, mediodia y tarde)
 * que si es solo «el jueves por la tarde» (salen tres horas repartidas por la
 * tarde), sin tener que saber cual de los dos casos es.
 *
 * Dentro de cada trozo se prefiere una hora en punto si la hay, porque es la
 * que una persona recuerda sin apuntarla. Si no la hay, la primera del trozo.
 */
export function repartir(
  huecos: readonly Hueco[],
  cuantas: number,
  zonaHoraria: string,
): Hueco[] {
  if (huecos.length === 0 || cuantas <= 0) return []
  if (huecos.length <= cuantas) return [...huecos]

  const elegidos: Hueco[] = []
  const tamano = huecos.length / cuantas

  for (let i = 0; i < cuantas; i += 1) {
    const desde = Math.floor(i * tamano)
    const hasta = Math.floor((i + 1) * tamano)
    const trozo = huecos.slice(desde, Math.max(hasta, desde + 1))

    const enPunto = trozo.find(
      (hueco) => formatInTimeZone(new Date(hueco.inicio), zonaHoraria, 'mm') === '00',
    )
    const elegido = enPunto ?? trozo[0]
    // Un trozo vacio no puede pasar —`hasta` nunca baja de `desde + 1`— pero si
    // pasara, saltarselo es mejor que ofrecer `undefined`.
    if (elegido) elegidos.push(elegido)
  }

  return elegidos
}

export type Muestra = {
  /** Lo que se le ofrece. Subconjunto de lo que entro, siempre. */
  readonly opciones: readonly Opcion[]
  /** Cuantas ranuras habia de verdad. Para el registro, no para el paciente. */
  readonly totalLibres: number
  /** Cuantos instantes distintos, quitando los sillones repetidos. */
  readonly instantesLibres: number
}

/**
 * La rejilla completa -> las opciones que se dicen en voz alta.
 *
 * `ahora` no entra: filtrar el pasado es cosa del RPC, que ya lo hace con
 * `greatest(p_desde, now())`. Volver a filtrarlo aqui seria el doble filtrado
 * que F2 prohibio, por el otro lado: taparia un fallo del RPC en vez de
 * delatarlo.
 */
export function muestrear(
  huecos: readonly Hueco[],
  zonaHoraria: string,
  cuantas: number = OPCIONES_POR_DEFECTO,
): Muestra {
  const pedidas = Math.min(Math.max(1, Math.trunc(cuantas)), OPCIONES_MAXIMAS)
  const unicos = porInstante(huecos)

  const opciones = repartir(unicos, pedidas, zonaHoraria).map((hueco) => ({
    inicio: hueco.inicio,
    fin: hueco.fin,
    gabinete_id: hueco.gabinete_id,
    cuando: comoSeDiceEs(hueco.inicio, zonaHoraria),
  }))

  return {
    opciones,
    totalLibres: huecos.length,
    instantesLibres: unicos.length,
  }
}
