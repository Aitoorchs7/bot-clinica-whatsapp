/**
 * Cliente de Supabase para el SERVIDOR con sesion de usuario.
 *
 * Quien lo usa: Server Components, Server Actions y Route Handlers del panel.
 * Con que credencial: la clave anonima mas la cookie de sesion del usuario que
 * ha iniciado sesion. Su clinica_id y su rol viajan en app_metadata del JWT que
 * emite Supabase Auth, y de ahi los leen las politicas RLS.
 *
 * Este cliente NO es el del bot. El bot tiene el suyo (bot.ts) y firma su
 * propio token. Usar este en el camino del webhook daria al bot los permisos
 * del ultimo usuario que hubiera iniciado sesion, o ninguno.
 *
 * Tampoco toca la clave de servicio. Nunca.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from '@/tipos/bd'

export async function crearClienteServidor() {
  const almacen = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll()
        },
        setAll(aGuardar) {
          try {
            for (const { name, value, options } of aGuardar) {
              almacen.set(name, value, options)
            }
          } catch {
            // Desde un Server Component no se pueden escribir cabeceras. No es
            // un error: las cookies refrescadas las escribe proxy.ts en cada
            // peticion. (proxy.ts, NUNCA middleware.ts: en Next.js 16
            // middleware.ts se ignora en silencio y las rutas quedan publicas
            // sin dar ningun error.)
          }
        },
      },
    },
  )
}
