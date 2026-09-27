'use server'

/**
 * Todo lo que el panel ESCRIBE. Cinco acciones y ni una mas.
 *
 * LAS TRES COSAS QUE HACE CADA UNA DE ESTAS FUNCIONES, EN ORDEN
 *
 *   1. Vuelve a exigir sesion y rol. No se fia de proxy.ts: el propio doc de
 *      Next avisa de que una Server Function es un POST a la ruta donde se usa
 *      y de que un cambio de `matcher` puede dejarla fuera del guardian sin
 *      que salte nada. Y no se fia del boton escondido: quien sabe hacer un
 *      POST no pasa por el boton.
 *   2. Valida con Zod lo que llega del formulario.
 *   3. Escribe con `.select()` DETRAS, y comprueba que volvio la fila.
 *
 * EL PUNTO 3 ES EL QUE NO SE PUEDE SALTAR
 *
 * Cuando la RLS no deja pasar un UPDATE por su USING, PostgREST no devuelve un
 * error: devuelve CERO FILAS y un 200. Sin el `.select()`, el panel diria
 * «guardado» y no habria guardado nada. Es el fallo numero 4 de la lista de
 * ESTADO_F1 §6, y aqui es donde tocaba cerrarlo por el lado del panel. Un rol
 * `lectura` que intenta escribir cae exactamente por ahi.
 *
 * NADA DE ESTO ES LA GARANTIA. La garantia es la RLS, y esta probada contra la
 * base en `tests/panel-vivo/`. Esto es lo que hace que el panel se entere.
 */
import { refresh } from 'next/cache'

import { zTelefono, zUuid } from '@/lib/bot/validacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { z } from 'zod'

import { apuntar } from './auditoria'
import { desdeFormulario } from './formato'
import { comprobarInquilino, exigirFilas } from './guardia'
import { TABLAS_CON_PUBLICO, type TablaConPublico } from './publico'
import { sesionQuePuedeEscribir } from './sesion'

export type Resultado = { ok: true; mensaje: string } | { ok: false; motivo: string }

const SIN_PERMISO =
  'Tu usuario puede consultar el panel, pero no cambiar nada. Si necesitas ' +
  'hacerlo, pídeselo a quien lleva la cuenta de la clínica.'

const LA_BASE_DICE_QUE_NO =
  'La base de datos no ha dejado hacer ese cambio, así que no se ha guardado ' +
  'nada. Suele ser que tu usuario no tiene permiso para esa fila.'

/**
 * Traduce un error de Postgres a algo que se pueda leer en un mostrador.
 *
 * `23P01` es el constraint `sin_solape`: dos citas en el mismo sillón a la
 * misma hora. Es la unica forma en que esta pantalla puede chocar contra una
 * regla de negocio de la base, y decir «error 23P01» seria no decir nada.
 */
function enCastellano(error: { code?: string; message: string }): string {
  if (error.code === '23P01') {
    return 'Ese gabinete ya tiene una cita a esa hora. Elige otra hora u otro hueco.'
  }
  if (error.code === '42501') return LA_BASE_DICE_QUE_NO
  if (error.code === '23505') return 'Ya existe otra ficha con ese teléfono.'
  return `No se ha podido guardar: ${error.message}`
}

// -----------------------------------------------------------------------------
// El interruptor de `publico`  ·  LA PIEZA SERIA DE ESTA FASE
// -----------------------------------------------------------------------------

const zInterruptor = z.object({
  tabla: z.enum(TABLAS_CON_PUBLICO),
  id: zUuid,
  encender: z.boolean(),
})

/**
 * Enciende o apaga lo que el bot puede decir de una fila.
 *
 * ESTO NO ES UN CHECKBOX MAS. Es la superficie de control de la barandilla 1:
 * quien lo mueve decide lo que el asistente puede decirle a un paciente. Por
 * eso:
 *
 *   · ENCENDER es la accion peligrosa, no apagar. Apagar quita algo de la boca
 *     del bot; encender se lo pone. La confirmacion, con el texto exacto
 *     delante, la pide el componente antes de llamar aqui.
 *
 *   · El cambio NO SE QUEDA SIN RASTRO. Si el apunte de auditoria falla, se
 *     deshace el cambio. Es deliberado y cuesta una escritura mas: cambiar lo
 *     que el bot puede decir sin que quede escrito quien fue es justo lo que
 *     esta fase viene a impedir.
 */
export async function cambiarPublico(entrada: {
  tabla: TablaConPublico
  id: string
  encender: boolean
}): Promise<Resultado> {
  const sesion = await sesionQuePuedeEscribir()
  if (!sesion) return { ok: false, motivo: SIN_PERMISO }

  const valida = zInterruptor.safeParse(entrada)
  if (!valida.success) {
    return { ok: false, motivo: 'Esa fila no se puede cambiar desde aquí.' }
  }
  const { tabla, id, encender } = valida.data

  const db = await crearClienteServidor()

  // Como estaba antes, para poder deshacerlo si el rastro no se puede escribir.
  const previa = await db.from(tabla).select('id, clinica_id, publico').eq('id', id)
  const antes = comprobarInquilino(
    tabla,
    exigirFilas(`la fila de ${tabla}`, previa.data, previa.error),
    sesion.clinicaId,
  ).filas[0]
  if (!antes) return { ok: false, motivo: LA_BASE_DICE_QUE_NO }
  if (antes.publico === encender) {
    return { ok: true, mensaje: 'Ya estaba así. No se ha cambiado nada.' }
  }

  const { data, error } = await db
    .from(tabla)
    .update({ publico: encender })
    .eq('id', id)
    .select('id, clinica_id, publico')

  if (error) return { ok: false, motivo: enCastellano(error) }
  const cambiada = comprobarInquilino(tabla, data ?? [], sesion.clinicaId).filas[0]
  if (!cambiada) return { ok: false, motivo: LA_BASE_DICE_QUE_NO }

  const rastro = await apuntar(sesion, {
    accion: encender ? 'publico_encendido' : 'publico_apagado',
    tabla,
    filaId: id,
    // Dos booleanos. Ni una palabra del contenido: ver la cabecera de
    // auditoria.ts.
    datos: { antes: antes.publico, despues: encender },
  })

  if (!rastro.ok) {
    const vuelta = await db
      .from(tabla)
      .update({ publico: antes.publico })
      .eq('id', id)
      .select('id')

    if (vuelta.error || (vuelta.data ?? []).length === 0) {
      return {
        ok: false,
        motivo:
          'El cambio se ha hecho pero NO se ha podido dejar rastro de quién lo hizo, y ' +
          'tampoco se ha podido deshacer. Avisa a quien lleva el sistema antes de seguir.',
      }
    }
    return {
      ok: false,
      motivo:
        'No se ha podido dejar rastro de quién hacía el cambio, así que se ha deshecho. ' +
        'Nada ha cambiado. Vuelve a intentarlo dentro de un momento.',
    }
  }

  refresh()
  return {
    ok: true,
    mensaje: encender
      ? 'Hecho. El asistente ya puede decir esto.'
      : 'Hecho. Esto vuelve a ser solo para el equipo.',
  }
}

// -----------------------------------------------------------------------------
// Agenda
// -----------------------------------------------------------------------------

/**
 * `provisional` no esta en la lista a proposito.
 *
 * La tabla tiene un check: una cita provisional necesita `expira_en`, porque es
 * un hueco que el bot reserva mientras el paciente contesta. Devolver una cita
 * a provisional desde el panel no significa nada —no hay nadie esperando— y
 * ademas reventaria el check. Recepcion confirma, cancela o cierra.
 */
const ESTADOS_DE_RECEPCION = ['confirmada', 'cancelada', 'completada', 'no_presentada'] as const

const zEstadoDeCita = z.object({ id: zUuid, estado: z.enum(ESTADOS_DE_RECEPCION) })

/**
 * Recepcion cancela con el ESTADO, nunca borrando.
 *
 * La RLS de F1 ya se lo impone —no hay ninguna politica de DELETE sobre `citas`
 * para el rol clinica— y ademas es lo correcto: una cita cancelada sigue
 * contando para saber cuantas se caen, y una fila borrada no cuenta nada.
 */
export async function cambiarEstadoDeCita(entrada: {
  id: string
  estado: (typeof ESTADOS_DE_RECEPCION)[number]
}): Promise<Resultado> {
  const sesion = await sesionQuePuedeEscribir()
  if (!sesion) return { ok: false, motivo: SIN_PERMISO }

  const valida = zEstadoDeCita.safeParse(entrada)
  if (!valida.success) return { ok: false, motivo: 'Ese estado no existe.' }
  const { id, estado } = valida.data

  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('citas')
    .update({ estado, actualizada_en: new Date().toISOString() })
    .eq('id', id)
    .select('id, clinica_id')

  if (error) return { ok: false, motivo: enCastellano(error) }
  if (comprobarInquilino('citas', data ?? [], sesion.clinicaId).filas.length === 0) {
    return { ok: false, motivo: LA_BASE_DICE_QUE_NO }
  }

  await apuntar(sesion, { accion: 'cita_estado', tabla: 'citas', filaId: id, datos: { estado } })

  refresh()
  return { ok: true, mensaje: 'Cita actualizada.' }
}

const zMover = z.object({ id: zUuid, inicio: z.string().min(1) })

/**
 * Mueve una cita conservando lo que dura.
 *
 * El `fin` no se pide en el formulario: se calcula con la duracion que ya tenia
 * la cita. Pedir las dos horas invita a dejar un fin anterior al inicio, y el
 * check de la tabla lo rechazaria con un error que no dice nada.
 */
export async function moverCita(entrada: { id: string; inicio: string }): Promise<Resultado> {
  const sesion = await sesionQuePuedeEscribir()
  if (!sesion) return { ok: false, motivo: SIN_PERMISO }

  const valida = zMover.safeParse(entrada)
  if (!valida.success) return { ok: false, motivo: 'Esa hora no se entiende.' }
  const { id, inicio } = valida.data

  const db = await crearClienteServidor()

  const previa = await db.from('citas').select('id, clinica_id, inicio, fin').eq('id', id)
  const cita = comprobarInquilino(
    'citas',
    exigirFilas('la cita', previa.data, previa.error),
    sesion.clinicaId,
  ).filas[0]
  if (!cita) return { ok: false, motivo: LA_BASE_DICE_QUE_NO }

  // La zona horaria es la de la clinica, no la del navegador de quien mueve la
  // cita. Ver la cabecera de formato.ts.
  const clinicas = await db.from('clinicas').select('id, zona_horaria')
  const zona =
    comprobarInquilino('clinicas', mapaDeClinicas(clinicas.data), sesion.clinicaId).filas[0]
      ?.zona_horaria ?? 'Europe/Madrid'

  const dura = new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()
  const nuevoInicio = desdeFormulario(inicio, zona)
  if (Number.isNaN(nuevoInicio.getTime())) return { ok: false, motivo: 'Esa hora no se entiende.' }
  const nuevoFin = new Date(nuevoInicio.getTime() + dura)

  const { data, error } = await db
    .from('citas')
    .update({
      inicio: nuevoInicio.toISOString(),
      fin: nuevoFin.toISOString(),
      actualizada_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, clinica_id')

  if (error) return { ok: false, motivo: enCastellano(error) }
  if (comprobarInquilino('citas', data ?? [], sesion.clinicaId).filas.length === 0) {
    return { ok: false, motivo: LA_BASE_DICE_QUE_NO }
  }

  await apuntar(sesion, {
    accion: 'cita_movida',
    tabla: 'citas',
    filaId: id,
    datos: { de: cita.inicio, a: nuevoInicio.toISOString() },
  })

  refresh()
  return { ok: true, mensaje: 'Cita movida.' }
}

/** `clinicas` no tiene columna `clinica_id`: su inquilino es su propio `id`. */
function mapaDeClinicas(
  filas: { id: string; zona_horaria: string }[] | null,
): { id: string; clinica_id: string; zona_horaria: string }[] {
  return (filas ?? []).map((fila) => ({ ...fila, clinica_id: fila.id }))
}

// -----------------------------------------------------------------------------
// Fichas  ·  solo los datos de contacto
// -----------------------------------------------------------------------------

const zContacto = z.object({
  id: zUuid,
  telefono: zTelefono,
  email: z.union([z.literal(''), z.email('ese correo no se entiende')]),
})

/**
 * De la ficha solo se tocan el telefono y el correo.
 *
 * El nombre no: el bot lo escribe cuando el paciente lo dice, y el historial
 * clinico no se edita desde una pantalla de recepcion. Lo que hay aqui son los
 * dos datos que cambian de verdad —un movil nuevo, un correo mal apuntado— y
 * que recepcion necesita poder arreglar sin llamar a nadie.
 */
export async function guardarContacto(entrada: {
  id: string
  telefono: string
  email: string
}): Promise<Resultado> {
  const sesion = await sesionQuePuedeEscribir()
  if (!sesion) return { ok: false, motivo: SIN_PERMISO }

  const valida = zContacto.safeParse(entrada)
  if (!valida.success) {
    return { ok: false, motivo: valida.error.issues[0]?.message ?? 'Esos datos no valen.' }
  }
  const { id, telefono, email } = valida.data

  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('pacientes')
    .update({
      telefono_e164: telefono,
      email: email === '' ? null : email,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, clinica_id')

  if (error) return { ok: false, motivo: enCastellano(error) }
  if (comprobarInquilino('pacientes', data ?? [], sesion.clinicaId).filas.length === 0) {
    return { ok: false, motivo: LA_BASE_DICE_QUE_NO }
  }

  // Ni el telefono ni el correo entran en el apunte: son datos personales y
  // `auditoria` no la purga nadie. Queda escrito QUE se tocaron, no cuales.
  await apuntar(sesion, { accion: 'contacto_editado', tabla: 'pacientes', filaId: id })

  refresh()
  return { ok: true, mensaje: 'Datos de contacto guardados.' }
}

// -----------------------------------------------------------------------------
// Cola de escalados
// -----------------------------------------------------------------------------

const ESTADOS_DE_ESCALADO = ['pendiente', 'en_curso', 'resuelto'] as const
const zEscalado = z.object({ id: zUuid, estado: z.enum(ESTADOS_DE_ESCALADO) })

/**
 * pendiente -> en_curso -> resuelto, con quien lo resolvio.
 *
 * `resuelto_por` se pone con el uuid de quien tiene la sesion, nunca con algo
 * que venga del formulario: si viniera de fuera, la cola diria que lo resolvio
 * quien dijera el navegador.
 */
export async function cambiarEstadoDeEscalado(entrada: {
  id: string
  estado: (typeof ESTADOS_DE_ESCALADO)[number]
}): Promise<Resultado> {
  const sesion = await sesionQuePuedeEscribir()
  if (!sesion) return { ok: false, motivo: SIN_PERMISO }

  const valida = zEscalado.safeParse(entrada)
  if (!valida.success) return { ok: false, motivo: 'Ese estado no existe.' }
  const { id, estado } = valida.data

  const resuelto = estado === 'resuelto'
  const db = await crearClienteServidor()
  const { data, error } = await db
    .from('escalados')
    .update({
      estado,
      resuelto_por: resuelto ? sesion.usuarioId : null,
      resuelto_en: resuelto ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('id, clinica_id')

  if (error) return { ok: false, motivo: enCastellano(error) }
  if (comprobarInquilino('escalados', data ?? [], sesion.clinicaId).filas.length === 0) {
    return { ok: false, motivo: LA_BASE_DICE_QUE_NO }
  }

  await apuntar(sesion, {
    accion: 'escalado_estado',
    tabla: 'escalados',
    filaId: id,
    datos: { estado },
  })

  refresh()
  return { ok: true, mensaje: resuelto ? 'Aviso cerrado.' : 'Aviso actualizado.' }
}
