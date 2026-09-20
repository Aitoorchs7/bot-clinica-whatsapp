'use server'

/**
 * Entrar y salir.
 *
 * DOS DETALLES QUE NO SON DETALLES
 *
 *   1. El mensaje de error es el MISMO tanto si el correo no existe como si la
 *      contrasena esta mal. Decir «ese correo no existe» le confirma a quien
 *      prueba de todo cuales de sus correos son buenos.
 *
 *   2. El `desde` de la URL se comprueba antes de usarlo. Un `?desde=` que
 *      acepte cualquier cosa es una redireccion abierta: se manda un enlace
 *      que parece del panel y acaba en otro sitio con el mismo aspecto. Solo
 *      se admiten rutas de este panel.
 */
import { redirect } from 'next/navigation'

import { crearClienteServidor } from '@/lib/supabase/servidor'

export type EstadoEntrada = { error: string | null }

const NO_CUADRA = 'El correo o la contraseña no son correctos.'

/** Solo rutas internas del panel. Nada de `//otro.sitio` ni de `http://…`. */
function aDondeIr(desde: FormDataEntryValue | null): string {
  if (typeof desde !== 'string') return '/panel'
  if (!desde.startsWith('/panel')) return '/panel'
  if (desde.startsWith('//')) return '/panel'
  return desde
}

export async function entrar(
  _anterior: EstadoEntrada,
  formulario: FormData,
): Promise<EstadoEntrada> {
  const correo = String(formulario.get('correo') ?? '').trim()
  const contrasena = String(formulario.get('contrasena') ?? '')

  if (correo === '' || contrasena === '') {
    return { error: 'Escribe tu correo y tu contraseña.' }
  }

  const db = await crearClienteServidor()
  const { error } = await db.auth.signInWithPassword({ email: correo, password: contrasena })

  if (error) return { error: NO_CUADRA }

  // Desde una Server Action SI se pueden escribir cookies, asi que la sesion
  // queda guardada aqui. A partir de la siguiente peticion la refresca
  // proxy.ts, como dice la cabecera de servidor.ts desde F1.
  redirect(aDondeIr(formulario.get('desde')))
}

export async function salir(): Promise<void> {
  const db = await crearClienteServidor()
  await db.auth.signOut()
  redirect('/entrar')
}
