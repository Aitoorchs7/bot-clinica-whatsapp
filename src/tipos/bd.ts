/**
 * ARCHIVO GENERADO. No se edita a mano.
 *
 *   pnpm tipos
 *   # = supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF"
 *   #     --schema public > src/tipos/bd.ts
 *
 * -----------------------------------------------------------------------------
 * MARCADOR DE POSICION
 * -----------------------------------------------------------------------------
 * Lo que hay debajo NO son los tipos reales del esquema: es la forma minima que
 * necesita supabase-js para que los tres clientes compilen mientras no exista
 * todavia el proyecto de Supabase.
 *
 * En cuanto se ejecute `pnpm tipos` contra el proyecto real, este archivo se
 * sobrescribe entero con las 15 tablas, los 10 enums y los dos tipos compuestos
 * (`hueco` y `resultado_cita`). A partir de ahi, `Database['public']['Enums']`
 * es la fuente de verdad del vocabulario cerrado: los motivos de visita, los
 * estados de cita y los cinco motivos de escalado no se vuelven a escribir a
 * mano en ninguna parte.
 *
 * Si ves este comentario en una revision de codigo, es que el paso de
 * generacion no se ha ejecutado.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [clave: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      [nombre: string]: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
    }
    Views: {
      [nombre: string]: {
        Row: Record<string, unknown>
        Relationships: []
      }
    }
    Functions: {
      [nombre: string]: {
        Args: Record<string, unknown>
        Returns: unknown
      }
    }
    Enums: {
      [nombre: string]: string
    }
    CompositeTypes: {
      [nombre: string]: Record<string, unknown>
    }
  }
}
