/**
 * Cliente de Supabase para el NAVEGADOR.
 *
 * Quien lo usa: el panel de la clinica, en componentes de cliente.
 * Con que credencial: la clave anonima, que se expone al navegador y solo
 * sirve porque hay RLS detras. Sin RLS, esta clave es una puerta abierta.
 *
 * Lo que este archivo NO hace, y es deliberado:
 *   - no toca la clave de servicio
 *   - no firma ningun JWT
 *   - no lee datos del bot
 *
 * Los tres clientes de src/lib/supabase/ estan en la lista de "no tocar sin
 * confirmacion explicita" de .claude/CLAUDE.md. Su separacion no es
 * organizacion: es el modelo de seguridad.
 */
import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/tipos/bd'

export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
