/**
 * El rastro: quien cambio que, y cuando.
 *
 * POR QUE AQUI NO SE COPIA NI UNA LINEA DE CONTENIDO
 *
 * Un apunte guarda `tabla`, `fila_id` y dos booleanos. No guarda la pregunta,
 * ni la respuesta aprobada, ni el valor de la clave de configuracion. Dos
 * motivos, y los dos vienen de fases anteriores:
 *
 *   1. `auditoria` NO la purga el job de los 90 dias —`purgar_historial` se
 *      lleva conversaciones, mensajes, cargas de webhook y eventos, y nada
 *      mas—. Lo que se escriba aqui se queda para siempre. Es el mismo motivo
 *      por el que el aviso al equipo de F4 no lleva el sintoma dentro.
 *
 *   2. Es la doctrina de `origen.ts` desde F2: se nombra la fila, no se repite
 *      lo que hay dentro. El contenido vive en su tabla, que es donde la
 *      clinica puede mirarlo y donde se borra si toca.
 *
 * EL ACTOR NO SE ELIGE
 *
 * `actor` es el uuid del usuario con sesion, y la politica
 * `auditoria_clinica_insert` (migracion 008) no admite otro valor: el WITH
 * CHECK exige `actor = auth.uid()::text`. Nadie puede firmar un cambio con el
 * nombre de otro, ni desde el panel ni desde fuera. Un registro que se puede
 * firmar por otro no es un registro: es una coartada.
 */
import { crearClienteServidor } from '@/lib/supabase/servidor'

import type { Sesion } from './sesion'

export const ACCIONES = [
  'publico_encendido',
  'publico_apagado',
  'cita_estado',
  'cita_movida',
  'contacto_editado',
  'escalado_estado',
] as const

export type Accion = (typeof ACCIONES)[number]

/** Como se lee cada accion en la pantalla de la clinica. */
export const NOMBRE_DE_LA_ACCION: Readonly<Record<Accion, string>> = {
  publico_encendido: 'Permitió que el asistente lo diga',
  publico_apagado: 'Lo dejó solo para el equipo',
  cita_estado: 'Cambió el estado de una cita',
  cita_movida: 'Movió una cita',
  contacto_editado: 'Editó datos de contacto',
  escalado_estado: 'Cambió el estado de un aviso',
}

export type Apuntado = { ok: true } | { ok: false; motivo: string }

/**
 * Escribe el apunte. No lanza: quien llama decide que hacer si falla, y en el
 * caso del interruptor `publico` lo que hace es DESHACER el cambio. Cambiar lo
 * que el bot puede decir sin que quede escrito quien fue no es media cosa
 * buena: es la que no se puede entregar.
 */
export async function apuntar(
  sesion: Sesion,
  apunte: {
    accion: Accion
    tabla: string
    filaId: string
    datos?: Record<string, string | number | boolean | null>
  },
): Promise<Apuntado> {
  const db = await crearClienteServidor()

  const { error } = await db.from('auditoria').insert({
    clinica_id: sesion.clinicaId,
    // El uuid, no el correo: el correo se puede cambiar, el uuid no, y la
    // politica compara contra auth.uid().
    actor: sesion.usuarioId,
    accion: apunte.accion,
    tabla: apunte.tabla,
    fila_id: apunte.filaId,
    datos: apunte.datos ?? {},
  })

  if (error) return { ok: false, motivo: error.message }
  return { ok: true }
}
