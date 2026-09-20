'use client'

import { useState, useTransition } from 'react'

import {
  cambiarEstadoDeCita,
  cambiarEstadoDeEscalado,
  guardarContacto,
  moverCita,
  type Resultado,
} from '@/lib/panel/acciones'

/**
 * Los controles que escriben, uno por pantalla.
 *
 * Todos siguen el mismo guion: se llama a la Server Action, se espera, y se
 * ensena LO QUE HA CONTESTADO, sea un «hecho» o un «la base no ha dejado». Lo
 * que no hacen es pintar el cambio antes de tiempo: una agenda que tacha la
 * cita y luego resulta que no se guardo es peor que una que tarda medio
 * segundo. Aqui no hay optimismo.
 *
 * Y ninguno se ensena al rol `lectura`. Repetido por si alguien llega leyendo
 * solo este archivo: eso es comodidad, no seguridad. La garantia es la RLS.
 */

function useAccion() {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [enCurso, empezar] = useTransition()

  function lanzar(hacer: () => Promise<Resultado>) {
    setResultado(null)
    empezar(async () => setResultado(await hacer()))
  }

  return { resultado, enCurso, lanzar }
}

function Respuesta({ resultado }: { resultado: Resultado | null }) {
  if (!resultado) return null
  return (
    <p
      role="status"
      data-prueba="respuesta-accion"
      className={`mt-2 text-xs ${resultado.ok ? 'text-apagado' : 'text-rojo-letra'}`}
    >
      {resultado.ok ? resultado.mensaje : resultado.motivo}
    </p>
  )
}

const BOTON = 'rounded border border-linea px-2.5 py-1 text-xs transition-colors hover:bg-hueso disabled:opacity-50'

// -----------------------------------------------------------------------------
// Citas
// -----------------------------------------------------------------------------

const CAMBIOS = [
  { estado: 'confirmada', rotulo: 'Confirmar' },
  { estado: 'completada', rotulo: 'Atendida' },
  { estado: 'no_presentada', rotulo: 'No vino' },
  { estado: 'cancelada', rotulo: 'Cancelar' },
] as const

export function AccionesDeCita({
  id,
  estado,
  inicioLocal,
}: {
  id: string
  estado: string
  inicioLocal: string
}) {
  const { resultado, enCurso, lanzar } = useAccion()
  const [moviendo, setMoviendo] = useState(false)
  const [cuando, setCuando] = useState(inicioLocal)

  return (
    <div data-prueba="acciones-cita">
      <div className="flex flex-wrap gap-1.5">
        {CAMBIOS.filter((cambio) => cambio.estado !== estado).map((cambio) => (
          <button
            key={cambio.estado}
            type="button"
            disabled={enCurso}
            className={BOTON}
            onClick={() => lanzar(() => cambiarEstadoDeCita({ id, estado: cambio.estado }))}
          >
            {cambio.rotulo}
          </button>
        ))}
        <button
          type="button"
          disabled={enCurso}
          className={BOTON}
          data-prueba="mover-cita"
          onClick={() => setMoviendo((antes) => !antes)}
        >
          Mover
        </button>
      </div>

      {moviendo ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-apagado">
            Nueva hora
            <input
              type="datetime-local"
              value={cuando}
              onChange={(evento) => setCuando(evento.target.value)}
              className="ml-2 rounded border border-linea bg-papel px-2 py-1 font-mono text-xs"
            />
          </label>
          <button
            type="button"
            disabled={enCurso}
            className={BOTON}
            onClick={() => lanzar(() => moverCita({ id, inicio: cuando }))}
          >
            {enCurso ? 'Moviendo…' : 'Guardar la hora'}
          </button>
          <span className="text-xs text-apagado">La cita dura lo mismo, solo cambia de hora.</span>
        </div>
      ) : null}

      <Respuesta resultado={resultado} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Escalados
// -----------------------------------------------------------------------------

export function AccionesDeEscalado({ id, estado }: { id: string; estado: string }) {
  const { resultado, enCurso, lanzar } = useAccion()

  return (
    <div data-prueba="acciones-escalado">
      <div className="flex flex-wrap gap-1.5">
        {estado !== 'en_curso' ? (
          <button
            type="button"
            disabled={enCurso}
            className={BOTON}
            onClick={() => lanzar(() => cambiarEstadoDeEscalado({ id, estado: 'en_curso' }))}
          >
            Me ocupo
          </button>
        ) : null}
        {estado !== 'resuelto' ? (
          <button
            type="button"
            disabled={enCurso}
            className={BOTON}
            onClick={() => lanzar(() => cambiarEstadoDeEscalado({ id, estado: 'resuelto' }))}
          >
            Resuelto
          </button>
        ) : (
          <button
            type="button"
            disabled={enCurso}
            className={BOTON}
            onClick={() => lanzar(() => cambiarEstadoDeEscalado({ id, estado: 'pendiente' }))}
          >
            Volver a abrir
          </button>
        )}
      </div>
      <Respuesta resultado={resultado} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Datos de contacto
// -----------------------------------------------------------------------------

/**
 * Lo unico editable de una ficha.
 *
 * El nombre, los apellidos y el historial no se tocan desde aqui: el nombre lo
 * escribe el paciente cuando lo dice, y una pantalla de recepcion no es sitio
 * para reescribir lo que alguien conto. Un movil nuevo y un correo mal
 * apuntado, si.
 */
export function ContactoDelPaciente({
  id,
  telefono,
  email,
}: {
  id: string
  telefono: string
  email: string
}) {
  const { resultado, enCurso, lanzar } = useAccion()
  const [tel, setTel] = useState(telefono)
  const [correo, setCorreo] = useState(email)

  return (
    <div data-prueba="contacto-editable">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-etiqueta uppercase text-apagado">
          Teléfono
          <input
            value={tel}
            onChange={(evento) => setTel(evento.target.value)}
            className="mt-1 block rounded border border-linea bg-papel px-2 py-1 font-mono text-sm normal-case tracking-normal text-tinta"
          />
        </label>
        <label className="text-etiqueta uppercase text-apagado">
          Correo
          <input
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            className="mt-1 block rounded border border-linea bg-papel px-2 py-1 text-sm normal-case tracking-normal text-tinta"
          />
        </label>
        <button
          type="button"
          disabled={enCurso}
          className={BOTON}
          onClick={() => lanzar(() => guardarContacto({ id, telefono: tel, email: correo }))}
        >
          {enCurso ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <Respuesta resultado={resultado} />
    </div>
  )
}
