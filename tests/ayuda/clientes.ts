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

/** Un usuario real del panel, con sesion iniciada de verdad. */
export async function clienteUsuario(email: string, contrasena: string) {
  const cliente = createClient(URL_SUPABASE, CLAVE_ANON, sinSesion)
  const { error } = await cliente.auth.signInWithPassword({ email, password: contrasena })
  if (error) throw new Error(`No se pudo iniciar sesion como ${email}: ${error.message}`)
  return cliente
}
