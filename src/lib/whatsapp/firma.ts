/**
 * La firma del webhook. Es el unico cerrojo entre el bot y cualquiera que
 * conozca la URL.
 *
 * SE FIRMA EL CUERPO CRUDO. NO HAY OTRA FORMA.
 *
 * Meta escapa los caracteres no ASCII antes de mandar el JSON: «miercoles»
 * viaja como `miércoles`. La firma se calcula sobre ESOS bytes. Si alguien
 * hace `await req.json()` y luego `JSON.stringify()` para verificar,
 * `JSON.stringify` NO vuelve a escapar, el cuerpo reconstruido no es el que
 * firmo Meta, y la firma no cuadra.
 *
 * Lo traicionero es que «hola» pasa y «quiero cita el miercoles» no. Un webhook
 * roto asi funciona en las pruebas de humo y se cae con el primer paciente
 * espanol que escribe bien. Por eso `route.ts` lee con `req.text()` y por eso
 * hay una prueba con acentos.
 *
 * COMPARACION EN TIEMPO CONSTANTE
 *
 * `timingSafeEqual` lanza si los dos buffers miden distinto, asi que la
 * longitud se comprueba antes. Y todo el camino devuelve `false` en vez de
 * lanzar: una excepcion aqui se convierte en un 500, y un 500 le dice a Meta
 * «reintentalo». A una peticion falsificada no se le da esa cortesia.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const CABECERA_FIRMA = 'x-hub-signature-256'
const PREFIJO = 'sha256='

/** La firma que Meta deberia haber mandado para este cuerpo. */
export function firmar(cuerpoCrudo: string, appSecret: string): string {
  return PREFIJO + createHmac('sha256', appSecret).update(cuerpoCrudo, 'utf8').digest('hex')
}

/**
 * `cuerpoCrudo` es lo que devolvio `await req.text()`, sin tocar.
 *
 * Nunca lanza. Un `false` es «no lo he podido confirmar», y eso es un 401.
 */
export function firmaValida(
  cuerpoCrudo: string,
  cabecera: string | null | undefined,
  appSecret: string,
): boolean {
  if (!cabecera || !appSecret) return false
  if (!cabecera.startsWith(PREFIJO)) return false

  const esperada = Buffer.from(firmar(cuerpoCrudo, appSecret), 'utf8')
  const recibida = Buffer.from(cabecera, 'utf8')

  // timingSafeEqual lanza con longitudes distintas. Distinta longitud ya es
  // distinta firma, asi que no se pierde nada comprobandolo antes.
  if (esperada.length !== recibida.length) return false

  try {
    return timingSafeEqual(esperada, recibida)
  } catch {
    return false
  }
}

/**
 * El token de verificacion del GET, comparado en tiempo constante.
 *
 * Es un secreto compartido como cualquier otro: un `===` sobre una cadena filtra
 * por el tiempo de comparacion en que caracter deja de coincidir. Cuesta tres
 * lineas hacerlo bien.
 */
export function tokenValido(recibido: string | null | undefined, esperado: string): boolean {
  if (!recibido || !esperado) return false

  const a = Buffer.from(recibido, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  if (a.length !== b.length) return false

  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
