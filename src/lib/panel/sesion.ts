/**
 * Quien eres, de que clinica y que puedes hacer.
 *
 * LOS TRES DATOS SALEN DE `app_metadata`, NUNCA DE `user_metadata`
 *
 * `user_metadata` lo edita el propio usuario desde el navegador: serviria para
 * declararse propietario de la clinica de al lado. `app_metadata` solo lo
 * escribe el servidor con `service_role`, y es lo que leen las politicas RLS de
 * F1. Si algun dia estas dos cosas dejan de coincidir —lo que dice el panel y
 * lo que lee la RLS—, manda la RLS y el panel se queda sin datos, que es el
 * modo bueno de fallar.
 *
 * ESTO NO ES UNA GARANTIA. ES UNA COMODIDAD.
 *
 * Esconder un boton no impide nada: quien sepa hacer un POST no pasa por el
 * boton. La garantia es la RLS, y esta probada desde el panel en
 * `tests/panel-vivo/`. Lo de aqui sirve para que el panel no le ofrezca a
 * nadie una accion que la base le va a negar, que es una forma fea de
 * enterarse.
 *
 * Aun asi, cada Server Action vuelve a llamar a `exigirSesion()`: el propio doc
 * de Next avisa de que las Server Functions son POST a la ruta donde viven y de
 * que un cambio de `matcher` en proxy.ts puede dejarlas fuera del guardian sin
 * que salte nada.
 */
import { redirect } from 'next/navigation'

import { crearClienteServidor } from '@/lib/supabase/servidor'

export const ROLES = ['propietario', 'recepcion', 'lectura'] as const
export type Rol = (typeof ROLES)[number]

export type Sesion = {
  readonly usuarioId: string
  readonly email: string
  readonly rol: Rol
  readonly clinicaId: string
}

/** Los dos que escriben. `lectura` nunca aparece en un WITH CHECK de la RLS. */
export function puedeEscribir(rol: Rol): boolean {
  return rol === 'propietario' || rol === 'recepcion'
}

/** Solo el propietario borra, y en el panel casi nada se borra. */
export function esPropietario(rol: Rol): boolean {
  return rol === 'propietario'
}

function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor)
}

/**
 * La sesion, o null.
 *
 * `getUser()` y no `getSession()`: getSession se fia de la cookie tal cual
 * llego del navegador, que es un dato que manda el cliente. getUser valida el
 * token contra el servidor de Auth. En una pantalla que decide lo que se
 * ensena, esa diferencia es toda la diferencia.
 */
export async function sesionDelPanel(): Promise<Sesion | null> {
  const db = await crearClienteServidor()
  const {
    data: { user: usuario },
  } = await db.auth.getUser()

  if (!usuario) return null

  const rol = usuario.app_metadata?.rol
  const clinicaId = usuario.app_metadata?.clinica_id

  // Un usuario sin rol o sin clinica en app_metadata no es un usuario del
  // panel: es un alta a medias. No se le inventa un rol por defecto —el
  // "por si acaso, lectura" acaba siendo "por si acaso, recepcion"— y no se
  // le ensena nada.
  if (!esRol(rol) || typeof clinicaId !== 'string' || clinicaId === '') return null

  return {
    usuarioId: usuario.id,
    email: usuario.email ?? '',
    rol,
    clinicaId,
  }
}

/** Para las paginas: sin sesion, a la entrada. */
export async function exigirSesion(): Promise<Sesion> {
  const sesion = await sesionDelPanel()
  if (!sesion) redirect('/entrar')
  return sesion
}

/**
 * Para las acciones que escriben.
 *
 * Devuelve la sesion o `null` en vez de lanzar: quien llama tiene que poder
 * contestar en castellano y sin trazas de pila. Un panel que ensena un error
 * de programador cuando lo que pasa es "no tienes permiso" es un panel que
 * asusta a quien solo queria mover una cita.
 */
export async function sesionQuePuedeEscribir(): Promise<Sesion | null> {
  const sesion = await sesionDelPanel()
  if (!sesion || !puedeEscribir(sesion.rol)) return null
  return sesion
}

/** Como se llama cada rol de cara a la clinica. */
export const NOMBRE_DEL_ROL: Readonly<Record<Rol, string>> = {
  propietario: 'Propietario',
  recepcion: 'Recepción',
  lectura: 'Solo lectura',
}
