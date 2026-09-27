import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ContactoDelPaciente } from '@/componentes/panel/acciones-de-fila'
import { Etiqueta } from '@/componentes/panel/etiqueta'
import { AvisoDeAislamiento, Cabecera, Caja, Dato, Vacio } from '@/componentes/panel/piezas'
import { leerClinica, leerFicha } from '@/lib/panel/consultas'
import {
  ESTADO_CITA,
  ESTADO_CONVERSACION,
  MOTIVO_VISITA,
  QUIEN_RESERVA,
  TONO_CITA,
  fechaYHora,
} from '@/lib/panel/formato'
import { exigirSesion, puedeEscribir } from '@/lib/panel/sesion'

export const metadata = { title: 'Ficha · Panel de la clínica' }

/**
 * La ficha de un paciente.
 *
 * SOLO SE EDITAN LOS DATOS DE CONTACTO. El nombre lo escribio el paciente
 * cuando lo dijo, y el historial de citas es lo que paso: una pantalla que deja
 * reescribirlo convierte el registro en un borrador.
 *
 * Y no hay nada clinico aqui, tampoco por casualidad: el motivo de cada cita es
 * vocabulario cerrado (`motivo_cerrado`, un enum de cinco valores) y no texto
 * libre. Eso es lo que mantiene todo el sistema fuera del articulo 9 del RGPD,
 * y es una decision de F1 que esta pantalla respeta, no una limitacion suya.
 */
export default async function FichaDePaciente({ params }: PageProps<'/panel/fichas/[id]'>) {
  const sesion = await exigirSesion()
  const { id } = await params

  const clinica = await leerClinica(sesion)
  const ficha = await leerFicha(sesion, id)
  if (!ficha) notFound()

  const { paciente, citas, conversaciones } = ficha
  const puedeTocar = puedeEscribir(sesion.rol)

  return (
    <>
      <Link
        href="/panel/fichas"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-apagado transition-colors hover:text-tinta"
      >
        <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
        Todos los pacientes
      </Link>

      <Cabecera
        titulo={`${paciente.nombre} ${paciente.apellidos ?? ''}`.trim()}
        explicacion={`Ficha creada el ${fechaYHora(paciente.creado_en, clinica.zona_horaria)}.`}
      />

      <AvisoDeAislamiento ajenas={[...citas.ajenas, ...conversaciones.ajenas]} />

      <div className="space-y-8">
        <Caja titulo="Datos de contacto">
          {puedeTocar ? (
            <ContactoDelPaciente
              id={paciente.id}
              telefono={paciente.telefono_e164}
              email={paciente.email ?? ''}
            />
          ) : (
            <dl className="grid grid-cols-2 gap-6">
              <Dato rotulo="Teléfono">
                <span className="font-mono">{paciente.telefono_e164}</span>
              </Dato>
              <Dato rotulo="Correo">{paciente.email ?? '—'}</Dato>
            </dl>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-6 border-t border-linea pt-6">
            <Dato rotulo="Cómo llegó">
              {paciente.origen === 'whatsapp' ? 'Escribiendo por WhatsApp' : paciente.origen}
            </Dato>
            <Dato rotulo="Consentimiento">
              {paciente.consentimiento_en
                ? fechaYHora(paciente.consentimiento_en, clinica.zona_horaria)
                : 'Sin registrar'}
            </Dato>
          </dl>
        </Caja>

        <Caja titulo="Sus citas">
          {citas.filas.length === 0 ? (
            <Vacio>Este paciente todavía no tiene ninguna cita.</Vacio>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th className="w-48">Cuándo</th>
                  <th>Motivo</th>
                  <th className="w-32">Gabinete</th>
                  <th className="w-36">Estado</th>
                  <th className="w-32">La pidió</th>
                </tr>
              </thead>
              <tbody>
                {citas.filas.map((cita) => (
                  <tr key={cita.id}>
                    <td className="font-mono text-xs">
                      {fechaYHora(cita.inicio, clinica.zona_horaria)}
                    </td>
                    <td className="text-sm">
                      {cita.tratamiento?.nombre ?? MOTIVO_VISITA[cita.motivo_cerrado]}
                    </td>
                    <td className="text-sm">{cita.gabinete?.nombre ?? '—'}</td>
                    <td>
                      <Etiqueta tono={TONO_CITA[cita.estado]}>{ESTADO_CITA[cita.estado]}</Etiqueta>
                    </td>
                    <td className="text-sm text-apagado">{QUIEN_RESERVA[cita.quien_reserva]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Caja>

        <Caja titulo="Sus conversaciones">
          {conversaciones.filas.length === 0 ? (
            <Vacio>No hay ninguna conversación guardada.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {conversaciones.filas.map((conversacion) => (
                <li key={conversacion.id} className="flex items-center justify-between py-3">
                  <span className="text-sm">
                    <span className="font-mono text-xs text-apagado">
                      {fechaYHora(conversacion.ultima_actividad, clinica.zona_horaria)}
                    </span>{' '}
                    <Etiqueta tono={conversacion.estado === 'escalada' ? 'rojo' : 'neutro'}>
                      {ESTADO_CONVERSACION[conversacion.estado]}
                    </Etiqueta>
                  </span>
                  <Link
                    href={`/panel/conversaciones/${conversacion.id}`}
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    Leerla
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Caja>
      </div>
    </>
  )
}
