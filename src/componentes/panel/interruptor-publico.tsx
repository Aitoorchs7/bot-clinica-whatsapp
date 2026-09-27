'use client'

import { useState, useTransition } from 'react'

import { cambiarPublico } from '@/lib/panel/acciones'
import {
  AL_APAGAR,
  PREGUNTA_AL_ENCENDER,
  PUEDE_DECIRLO,
  SOLO_EQUIPO,
  type TablaConPublico,
} from '@/lib/panel/publico'

/**
 * El interruptor. La pieza seria de F5.
 *
 * QUE ES ESTO DE VERDAD
 *
 * Es la superficie de control de la barandilla 1. Lo que hay detras no es una
 * columna booleana: es la decision de si el asistente puede decirle una frase
 * concreta a un paciente por WhatsApp. La barandilla es RLS —para el bot, la
 * fila apagada NO EXISTE— y esto es la mano que la mueve.
 *
 * LAS CUATRO DECISIONES DE DISENO, Y SU MOTIVO
 *
 *   1. NO SE DICE `publico` EN NINGUN SITIO. Se dice «el asistente puede decir
 *      esto» y «solo para el equipo». Ver `publico.ts`.
 *
 *   2. ENCENDER PIDE CONFIRMACION; APAGAR NO. No es simetrico a proposito.
 *      Apagar quita algo de la boca del bot: en el peor caso el bot deja de
 *      decir un horario y alguien llama por telefono. Encender se lo pone en
 *      la boca, y en el peor caso le cuenta a un paciente el margen de un
 *      implante. Pedir confirmacion para las dos cosas ensenaria a darle a
 *      «aceptar» sin leer, que es como se pierde la que importa.
 *
 *   3. LA CONFIRMACION ENSENA EL TEXTO EXACTO. Palabra por palabra, el mismo
 *      que leeria el montador del prompt. No un resumen ni las primeras
 *      palabras: si lo que se ensena no es lo que se va a decir, la
 *      confirmacion es un tramite.
 *
 *   4. AL ROL `lectura` NO SE LE ENSENA NINGUN BOTON. Y eso NO es la garantia:
 *      es comodidad, para no ofrecerle algo que la base le va a negar. La
 *      garantia es la RLS, y esta probada aparte en `tests/panel-vivo/`.
 */
export function InterruptorPublico({
  tabla,
  id,
  publico,
  texto,
  puedeEscribir,
}: {
  tabla: TablaConPublico
  id: string
  publico: boolean
  texto: string
  puedeEscribir: boolean
}) {
  const [preguntando, setPreguntando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enCurso, empezar] = useTransition()

  function mover(encender: boolean) {
    setAviso(null)
    empezar(async () => {
      const resultado = await cambiarPublico({ tabla, id, encender })
      setPreguntando(false)
      setAviso(resultado.ok ? resultado.mensaje : resultado.motivo)
    })
  }

  const estado = (
    <span
      data-prueba="estado-publico"
      data-publico={publico ? 'si' : 'no'}
      className={`inline-flex items-center gap-2 text-sm ${publico ? 'text-verde-letra' : 'text-apagado'}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${publico ? 'bg-verde-letra' : 'bg-apagado'}`}
      />
      {publico ? PUEDE_DECIRLO : SOLO_EQUIPO}
    </span>
  )

  // Sin permiso de escritura no hay boton, solo el estado. Un boton apagado
  // sigue siendo un boton: invita a preguntar por que no funciona.
  if (!puedeEscribir) return estado

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {estado}
        {publico ? (
          <button
            type="button"
            data-prueba="apagar-publico"
            disabled={enCurso}
            onClick={() => mover(false)}
            className="rounded border border-linea px-2.5 py-1 text-xs transition-colors hover:bg-hueso disabled:opacity-50"
          >
            Dejar solo para el equipo
          </button>
        ) : (
          <button
            type="button"
            data-prueba="encender-publico"
            disabled={enCurso}
            onClick={() => setPreguntando(true)}
            className="rounded border border-linea px-2.5 py-1 text-xs transition-colors hover:bg-hueso disabled:opacity-50"
          >
            Que el asistente pueda decirlo
          </button>
        )}
      </div>

      {preguntando ? (
        <div
          data-prueba="confirmar-encender"
          role="group"
          aria-label="Confirmar que el asistente puede decir esto"
          className="w-full rounded-caja border border-amarillo-letra/30 bg-amarillo-fondo p-4"
        >
          <p className="text-sm font-medium text-amarillo-letra">{PREGUNTA_AL_ENCENDER}</p>
          <p className="mt-3 text-etiqueta uppercase text-amarillo-letra/80">
            Esto es lo que pasaría a decir, palabra por palabra
          </p>
          <blockquote
            data-prueba="texto-exacto"
            className="mt-1 whitespace-pre-wrap border-l-2 border-amarillo-letra/40 bg-papel/70 px-3 py-2 font-mono text-xs leading-relaxed"
          >
            {texto}
          </blockquote>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              data-prueba="confirmar-si"
              disabled={enCurso}
              onClick={() => mover(true)}
              className="rounded bg-tinta px-3 py-1.5 text-xs text-papel transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {enCurso ? 'Guardando…' : 'Sí, que pueda decirlo'}
            </button>
            <button
              type="button"
              data-prueba="confirmar-no"
              disabled={enCurso}
              onClick={() => setPreguntando(false)}
              className="rounded border border-amarillo-letra/30 px-3 py-1.5 text-xs transition-colors hover:bg-papel/60"
            >
              Ahora no
            </button>
          </div>
        </div>
      ) : null}

      {aviso ? (
        <p data-prueba="aviso-interruptor" role="status" className="text-xs text-apagado">
          {aviso}
        </p>
      ) : null}

      {!publico && !preguntando ? (
        <p className="sr-only">{AL_APAGAR}</p>
      ) : null}
    </div>
  )
}
