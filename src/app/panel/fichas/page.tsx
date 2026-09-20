import Link from 'next/link'

import { AvisoDeAislamiento, Cabecera, Caja, Vacio } from '@/componentes/panel/piezas'
import { leerClinica, leerPacientes } from '@/lib/panel/consultas'
import { fechaYHora } from '@/lib/panel/formato'
import { exigirSesion } from '@/lib/panel/sesion'

export const metadata = { title: 'Pacientes · Panel de la clínica' }

export default async function Fichas() {
  const sesion = await exigirSesion()
  const clinica = await leerClinica(sesion)
  const pacientes = await leerPacientes(sesion)

  return (
    <>
      <Cabecera
        titulo="Pacientes"
        explicacion="Las fichas que ha ido creando el asistente cuando alguien pide cita por WhatsApp."
      />

      <AvisoDeAislamiento ajenas={pacientes.ajenas} />

      <Caja>
        {pacientes.filas.length === 0 ? (
          <Vacio>Todavía no hay ninguna ficha.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th className="w-40">Teléfono</th>
                <th>Correo</th>
                <th className="w-44">Ficha creada</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.filas.map((paciente) => (
                <tr key={paciente.id}>
                  <td>
                    <Link
                      href={`/panel/fichas/${paciente.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {`${paciente.nombre} ${paciente.apellidos ?? ''}`.trim()}
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{paciente.telefono_e164}</td>
                  <td className="text-sm text-apagado">{paciente.email ?? '—'}</td>
                  <td className="font-mono text-xs text-apagado">
                    {fechaYHora(paciente.creado_en, clinica.zona_horaria)}
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
