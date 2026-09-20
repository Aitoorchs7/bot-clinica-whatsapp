import Link from 'next/link'

import { AccionesDeCita } from '@/componentes/panel/acciones-de-fila'
import { Etiqueta } from '@/componentes/panel/etiqueta'
import { AvisoDeAislamiento, Cabecera, Caja, Vacio } from '@/componentes/panel/piezas'
import { leerAgenda, leerClinica, type CitaDeAgenda } from '@/lib/panel/consultas'
import {
  ESTADO_CITA,
  MOTIVO_VISITA,
  QUIEN_RESERVA,
  TONO_CITA,
  diaLargo,
  hora,
  paraFormulario,
  rangoDelDia,
  rangoDeLaSemana,
} from '@/lib/panel/formato'
import { exigirSesion, puedeEscribir } from '@/lib/panel/sesion'

export const metadata = { title: 'Agenda · Panel de la clínica' }

/**
 * La agenda.
 *
 * El dia y la semana se calculan en la ZONA HORARIA DE LA CLINICA, no en la
 * del servidor de Vercel ni en la del navegador. Una agenda que se corre una
 * hora en marzo no es un detalle estetico: es una cita a la que no va nadie.
 */
export default async function Agenda({ searchParams }: PageProps<'/panel'>) {
  const sesion = await exigirSesion()
  const clinica = await leerClinica(sesion)

  const parametros = await searchParams
  const pedido = Array.isArray(parametros.vista) ? parametros.vista[0] : parametros.vista
  const vista = pedido === 'semana' ? 'semana' : 'dia'

  const ahora = new Date()
  const rango =
    vista === 'semana'
      ? rangoDeLaSemana(ahora, clinica.zona_horaria)
      : rangoDelDia(ahora, clinica.zona_horaria)

  const citas = await leerAgenda(sesion, rango)
  const puedeTocar = puedeEscribir(sesion.rol)

  const porDia = new Map<string, CitaDeAgenda[]>()
  for (const cita of citas.filas) {
    const dia = diaLargo(cita.inicio, clinica.zona_horaria)
    porDia.set(dia, [...(porDia.get(dia) ?? []), cita])
  }

  return (
    <>
      <Cabecera
        titulo="Agenda"
        explicacion={
          vista === 'semana'
            ? 'Toda la semana, de lunes a domingo, en la hora de la clínica.'
            : `Citas de hoy, ${diaLargo(rango.desde, clinica.zona_horaria)}.`
        }
        acciones={<Pestanas vista={vista} />}
      />

      <AvisoDeAislamiento ajenas={citas.ajenas} />

      {citas.filas.length === 0 ? (
        <Caja>
          <Vacio>
            {vista === 'semana'
              ? 'Esta semana no hay ninguna cita apuntada.'
              : 'Hoy no hay ninguna cita apuntada.'}
          </Vacio>
        </Caja>
      ) : (
        <div className="space-y-6">
          {[...porDia.entries()].map(([dia, delDia]) => (
            <Caja key={dia} titulo={dia}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th className="w-24">Hora</th>
                    <th>Paciente</th>
                    <th>Motivo</th>
                    <th className="w-32">Gabinete</th>
                    <th className="w-36">Estado</th>
                    {puedeTocar ? <th className="w-72">Cambios</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {delDia.map((cita) => (
                    <tr key={cita.id}>
                      <td className="font-mono text-xs">
                        {hora(cita.inicio, clinica.zona_horaria)}
                        <span className="text-apagado">
                          {' – '}
                          {hora(cita.fin, clinica.zona_horaria)}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/panel/fichas/${cita.paciente_id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {cita.paciente
                            ? `${cita.paciente.nombre} ${cita.paciente.apellidos ?? ''}`.trim()
                            : 'Sin ficha'}
                        </Link>
                        <div className="font-mono text-xs text-apagado">
                          {cita.paciente?.telefono_e164 ?? ''}
                        </div>
                      </td>
                      <td>
                        {cita.tratamiento?.nombre ?? MOTIVO_VISITA[cita.motivo_cerrado]}
                        <div className="text-xs text-apagado">
                          La pidió: {QUIEN_RESERVA[cita.quien_reserva]}
                        </div>
                      </td>
                      <td className="text-sm">{cita.gabinete?.nombre ?? '—'}</td>
                      <td>
                        <Etiqueta tono={TONO_CITA[cita.estado]}>{ESTADO_CITA[cita.estado]}</Etiqueta>
                      </td>
                      {puedeTocar ? (
                        <td>
                          <AccionesDeCita
                            id={cita.id}
                            estado={cita.estado}
                            inicioLocal={paraFormulario(cita.inicio, clinica.zona_horaria)}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Caja>
          ))}
        </div>
      )}
    </>
  )
}

function Pestanas({ vista }: { vista: 'dia' | 'semana' }) {
  const clase = (activa: boolean) =>
    `rounded border px-3 py-1 text-xs transition-colors ${
      activa ? 'border-tinta bg-tinta text-papel' : 'border-linea bg-papel hover:bg-hueso'
    }`

  return (
    <div className="flex gap-1.5">
      <Link href="/panel?vista=dia" className={clase(vista === 'dia')}>
        Hoy
      </Link>
      <Link href="/panel?vista=semana" className={clase(vista === 'semana')}>
        Esta semana
      </Link>
    </div>
  )
}
