import Link from 'next/link'

import { Etiqueta } from '@/componentes/panel/etiqueta'
import { AvisoDeAislamiento, Cabecera, Caja, Vacio } from '@/componentes/panel/piezas'
import { leerClinica, leerConversaciones } from '@/lib/panel/consultas'
import { ESTADO_CONVERSACION, fechaYHora } from '@/lib/panel/formato'
import { exigirSesion } from '@/lib/panel/sesion'

export const metadata = { title: 'Conversaciones · Panel de la clínica' }

/**
 * Las conversaciones, SOLO LECTURA.
 *
 * NO HAY BANDEJA DE RESPUESTA HUMANA, y no es que falte: esta fuera de alcance
 * en esta version, decidido por el usuario. Desde aqui se lee lo que se dijo;
 * para contestar se usa WhatsApp, con el telefono de siempre. Tampoco hay un
 * boton de «responder» apagado: un boton que no hace nada es peor que ninguno,
 * porque promete algo que no existe.
 */
export default async function Conversaciones() {
  const sesion = await exigirSesion()
  const clinica = await leerClinica(sesion)
  const conversaciones = await leerConversaciones(sesion)

  return (
    <>
      <Cabecera
        titulo="Conversaciones"
        explicacion="Lo que ha hablado el asistente con cada paciente. Solo para leer: desde aquí no se contesta."
      />

      <AvisoDeAislamiento ajenas={conversaciones.ajenas} />

      <Caja>
        {conversaciones.filas.length === 0 ? (
          <Vacio>Todavía no ha escrito nadie.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Quién</th>
                <th className="w-44">Última vez</th>
                <th className="w-32">Estado</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {conversaciones.filas.map((fila) => (
                <tr key={fila.id}>
                  <td>
                    {fila.paciente ? (
                      <Link
                        href={`/panel/fichas/${fila.paciente_id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {`${fila.paciente.nombre} ${fila.paciente.apellidos ?? ''}`.trim()}
                      </Link>
                    ) : (
                      <span className="text-apagado">Sin ficha todavía</span>
                    )}
                    <div className="font-mono text-xs text-apagado">{fila.telefono_e164}</div>
                  </td>
                  <td className="font-mono text-xs">
                    {fechaYHora(fila.ultima_actividad, clinica.zona_horaria)}
                  </td>
                  <td>
                    <Etiqueta
                      tono={
                        fila.estado === 'escalada'
                          ? 'rojo'
                          : fila.estado === 'abierta'
                            ? 'azul'
                            : 'neutro'
                      }
                    >
                      {ESTADO_CONVERSACION[fila.estado]}
                    </Etiqueta>
                  </td>
                  <td className="text-sm">
                    <Link
                      href={`/panel/conversaciones/${fila.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      Leer la conversación
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Caja>
    </>
  )
}
