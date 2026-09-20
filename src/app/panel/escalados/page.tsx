import Link from 'next/link'

import { AccionesDeEscalado } from '@/componentes/panel/acciones-de-fila'
import { Etiqueta } from '@/componentes/panel/etiqueta'
import { AvisoDeAislamiento, Cabecera, Caja, Vacio } from '@/componentes/panel/piezas'
import { conversacionesDeMensajes, leerClinica, leerEscalados } from '@/lib/panel/consultas'
import {
  ESTADO_ESCALADO,
  MOTIVO_ESCALADO,
  MOTIVO_VISITA,
  TONO_ESCALADO,
  fechaYHora,
} from '@/lib/panel/formato'
import { exigirSesion, puedeEscribir } from '@/lib/panel/sesion'

export const metadata = { title: 'Avisos · Panel de la clínica' }

/**
 * La cola de avisos: pendiente -> en curso -> resuelto.
 *
 * EL ENLACE A LA CONVERSACION SIGUE `mensaje_id`, NO `conversacion_id`
 *
 * Los dos apuntan al mismo sitio casi siempre, pero `mensaje_id` apunta al
 * MENSAJE EXACTO que disparo el aviso, y eso es lo que hace falta: quien abre
 * un aviso quiere leer lo que escribio el paciente, no los cuarenta mensajes
 * del hilo. Ese puntero lo puso F4 y su prueba exige que apunte al mensaje
 * correcto, no simplemente que no sea nulo (ESTADO_F4 §5.1).
 *
 * Si el mensaje ya no esta —a los 90 dias la purga se lo lleva y el puntero
 * queda en null— se cae a `conversacion_id`, y si tampoco, no hay enlace. Es
 * correcto: el aviso sobrevive a proposito, el contenido no.
 */
export default async function Escalados() {
  const sesion = await exigirSesion()
  const clinica = await leerClinica(sesion)
  const escalados = await leerEscalados(sesion)
  const puedeTocar = puedeEscribir(sesion.rol)

  const conversaciones = await conversacionesDeMensajes(
    sesion,
    escalados.filas.flatMap((fila) => (fila.mensaje_id === null ? [] : [fila.mensaje_id])),
  )

  const abiertos = escalados.filas.filter((fila) => fila.estado !== 'resuelto')
  const cerrados = escalados.filas.filter((fila) => fila.estado === 'resuelto')

  return (
    <>
      <Cabecera
        titulo="Avisos del asistente"
        explicacion={
          'Cuando el asistente no puede seguir solo —una urgencia, algo que no está aprobado, o ' +
          'alguien que pide hablar con una persona— deja un aviso aquí y se lo dice al paciente.'
        }
      />

      <AvisoDeAislamiento ajenas={escalados.ajenas} />

      <div className="space-y-8">
        <Caja titulo={`Sin cerrar (${abiertos.length})`}>
          {abiertos.length === 0 ? (
            <Vacio>No hay ningún aviso pendiente. El asistente se está apañando solo.</Vacio>
          ) : (
            <Lista
              filas={abiertos}
              conversaciones={conversaciones}
              zona={clinica.zona_horaria}
              puedeTocar={puedeTocar}
            />
          )}
        </Caja>

        {cerrados.length > 0 ? (
          <Caja titulo={`Cerrados (${cerrados.length})`}>
            <Lista
              filas={cerrados}
              conversaciones={conversaciones}
              zona={clinica.zona_horaria}
              puedeTocar={puedeTocar}
            />
          </Caja>
        ) : null}
      </div>
    </>
  )
}

type FilaDeAviso = Awaited<ReturnType<typeof leerEscalados>>['filas'][number]

function Lista({
  filas,
  conversaciones,
  zona,
  puedeTocar,
}: {
  filas: readonly FilaDeAviso[]
  conversaciones: Map<number, string>
  zona: string
  puedeTocar: boolean
}) {
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th className="w-44">Cuándo</th>
          <th>Por qué</th>
          <th className="w-32">Sobre</th>
          <th className="w-28">Estado</th>
          <th className="w-40">La conversación</th>
          {puedeTocar ? <th className="w-56">Cambios</th> : null}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => {
          const conversacionId =
            (fila.mensaje_id === null ? null : conversaciones.get(fila.mensaje_id)) ??
            fila.conversacion_id
          return (
            <tr key={fila.id}>
              <td className="font-mono text-xs">{fechaYHora(fila.creado_en, zona)}</td>
              <td className="text-sm">{MOTIVO_ESCALADO[fila.motivo]}</td>
              <td className="text-sm">{MOTIVO_VISITA[fila.asunto]}</td>
              <td>
                <Etiqueta tono={TONO_ESCALADO[fila.estado]}>{ESTADO_ESCALADO[fila.estado]}</Etiqueta>
                {fila.resuelto_en ? (
                  <div className="mt-1 text-xs text-apagado">{fechaYHora(fila.resuelto_en, zona)}</div>
                ) : null}
              </td>
              <td className="text-sm">
                {conversacionId ? (
                  <Link
                    data-prueba="abrir-conversacion"
                    href={`/panel/conversaciones/${conversacionId}${
                      fila.mensaje_id === null ? '' : `#mensaje-${fila.mensaje_id}`
                    }`}
                    className="underline-offset-4 hover:underline"
                  >
                    Abrir lo que escribió
                  </Link>
                ) : (
                  <span className="text-xs text-apagado">
                    Ya no está: se borró a los 90 días.
                  </span>
                )}
              </td>
              {puedeTocar ? (
                <td>
                  <AccionesDeEscalado id={fila.id} estado={fila.estado} />
                </td>
              ) : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
