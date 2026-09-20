/**
 * Un cliente por rol, igual que en produccion.
 *
 * El del bot NO se construye aqui: se importa el de src/lib/supabase/bot.ts,
 * el mismo que usara el webhook. Si un dia alguien cambia como se firma el
 * token, estos tests se enteran.
 */
import { createClient } from '@supabase/supabase-js'

import { crearClienteBot } from '@/lib/supabase/bot'

import { CLAVE_ANON, CLAVE_SERVICIO, URL_SUPABASE } from './entorno'

const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } }

/**
 * service_role. Salta la RLS por completo.
 * Permitido AQUI porque sembrar es un script de alta, exactamente el unico uso
 * que admite .claude/CLAUDE.md. Nunca en el camino del bot.
 */
export function clienteServicio() {
  return createClient(URL_SUPABASE, CLAVE_SERVICIO, sinSesion)
}

/** El rol 'nadie'. Sin sesion y sin privilegios. */
export function clienteAnon() {
  return createClient(URL_SUPABASE, CLAVE_ANON, sinSesion)
}

/** El bot de una clinica concreta. */
export function clienteBot(clinicaId: string) {
  return crearClienteBot(clinicaId)
}

/**
 * El tipo se infiere de una llamada de verdad, no de `typeof createClient`:
 * asi cogeria los genericos por defecto (`never`) en vez de los de esta
 * llamada, y el cliente dejaria de aceptar ningun `insert` ni `update`.
 */
type ClienteUsuario = ReturnType<typeof clienteAnon>

/**
 * Una sesion por usuario y proceso.
 *
 * Antes se iniciaba sesion en cada `it()`. Los `it.each` de 04-aislamiento
 * solos ya hacian 26, y la suite entera pasaba de cincuenta en menos de treinta
 * segundos: Supabase Auth corta con "Request rate limit reached" y la tirada
 * empieza a fallar en sitios distintos cada vez. Una bateria de seguridad cuyo
 * numero de fallos cambia entre dos ejecuciones seguidas no demuestra nada, ni
 * cuando falla ni cuando pasa.
 *
 * Se sigue iniciando sesion DE VERDAD, con contrasena y contra Auth. Lo que se
 * reutiliza es el token ya emitido, que es lo mismo que hace un navegador con
 * una pestana abierta. La RLS no se entera: el JWT viaja en cada peticion y se
 * evalua en cada peticion.
 */
const sesiones = new Map<string, Promise<ClienteUsuario>>()

/** Un usuario real del panel, con sesion iniciada de verdad. */
export function clienteUsuario(email: string, contrasena: string): Promise<ClienteUsuario> {
  const abierta = sesiones.get(email)
  if (abierta) return abierta

  const sesion = (async () => {
    const cliente = createClient(URL_SUPABASE, CLAVE_ANON, sinSesion)
    const { error } = await cliente.auth.signInWithPassword({ email, password: contrasena })
    if (error) throw new Error(`No se pudo iniciar sesion como ${email}: ${error.message}`)
    return cliente
  })()

  sesiones.set(email, sesion)
  // Un fallo no se queda cacheado: si el login se cae una vez, el siguiente
  // test lo reintenta en vez de heredar el error de otro.
  void sesion.catch(() => sesiones.delete(email))
  return sesion
}
