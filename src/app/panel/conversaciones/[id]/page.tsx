import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Etiqueta } from '@/componentes/panel/etiqueta'
import { AvisoDeAislamiento, Cabecera, Caja, Vacio } from '@/componentes/panel/piezas'
import { leerClinica, leerHilo } from '@/lib/panel/consultas'
import { ESTADO_ENTREGA, fechaYHora, hora } from '@/lib/panel/formato'
import { exigirSesion } from '@/lib/panel/sesion'

export const metadata = { title: 'Conversación · Panel de la clínica' }

/**
 * El hilo, tal cual se dijo.
 *
 * Cada mensaje lleva su ancla `#mensaje-<id>`: es a donde apunta el enlace
 * desde un aviso, para caer directamente en lo que el paciente escribio y no en
 * el principio de la conversacion.
 *
 * Las lineas de `sistema` se ensenan en gris y con todas las letras («nota de
 * voz transcrita»). No las ha dicho el paciente y no las ha dicho el asistente:
 * esconderlas dejaria huecos raros en la conversacion, y pintarlas como si las
 * hubiera dicho alguien seria mentir sobre quien dijo que.
 */
export default async function Conversacion({ params }: PageProps<'/panel/conversaciones/[id]'>) {
  const sesion = await exigirSesion()
  const { id } = await params

  const clinica = await leerClinica(sesion)
  const hilo = await leerHilo(sesion, id)
  if (!hilo) notFound()

  const { conversacion, mensajes } = hilo
  const quien = conversacion.paciente
    ? `${conversacion.paciente.nombre} ${conversacion.paciente.apellidos ?? ''}`.trim()
    : conversacion.telefono_e164

  return (
    <>
      <Link
        href="/panel/conversaciones"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-apagado transition-colors hover:text-tinta"
      >
        <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
        Todas las conversaciones
      </Link>

      <Cabecera
        titulo={quien}
        explicacion={`Empezó el ${fechaYHora(conversacion.iniciada_en, clinica.zona_horaria)}. Desde aquí no se contesta.`}
        acciones={
          conversacion.paciente_id ? (
            <Link
              href={`/panel/fichas/${conversacion.paciente_id}`}
              className="rounded border border-linea bg-papel px-3 py-1 text-xs transition-colors hover:bg-hueso"
            >
              Ver la ficha
            </Link>
          ) : null
        }
      />

      <AvisoDeAislamiento ajenas={mensajes.ajenas} />

      <Caja>
        {mensajes.filas.length === 0 ? (
          <Vacio>Esta conversación ya no tiene mensajes: se borran a los 90 días.</Vacio>
        ) : (
          <ol className="space-y-4">
            {mensajes.filas.map((mensaje) => {
              const delPaciente = mensaje.rol === 'paciente'
              const delSistema = mensaje.rol === 'sistema'
              return (
                <li
                  key={mensaje.id}
                  id={`mensaje-${mensaje.id}`}
                  data-prueba="mensaje"
                  className={`flex flex-col ${delPaciente ? 'items-start' : 'items-end'} target:rounded-caja target:bg-amarillo-fondo target:p-2`}
                >
                  <div
                    className={`max-w-[42rem] rounded-caja border px-4 py-3 text-sm leading-relaxed ${
                      delSistema
                        ? 'border-dashed border-linea bg-hueso italic text-apagado'
                        : delPaciente
                          ? 'border-linea bg-papel'
                          : 'border-linea bg-hueso'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{mensaje.texto}</p>
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-xs text-apagado">
                    <span>
                      {delSistema ? 'Nota interna' : delPaciente ? quien : 'Asistente'} ·{' '}
                      <span className="font-mono">
                        {hora(mensaje.creado_en, clinica.zona_horaria)}
                      </span>
                    </span>
                    {!delPaciente && !delSistema ? (
                      <Etiqueta tono={mensaje.estado_entrega === 'fallido' ? 'rojo' : 'neutro'}>
                        {ESTADO_ENTREGA[mensaje.estado_entrega]}
                      </Etiqueta>
                    ) : null}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </Caja>
    </>
  )
}
