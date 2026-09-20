import { InterruptorPublico } from '@/componentes/panel/interruptor-publico'
import { AvisoDeAislamiento, Cabecera, Caja, Vacio } from '@/componentes/panel/piezas'
import { leerConocimiento } from '@/lib/panel/consultas'
import { textoQueDiria } from '@/lib/panel/publico'
import { exigirSesion, puedeEscribir } from '@/lib/panel/sesion'

export const metadata = { title: 'Lo que puede decir · Panel de la clínica' }

/**
 * La pantalla del interruptor.
 *
 * AQUI SE VE TODO, TAMBIEN LO QUE EL ASISTENTE NO PUEDE DECIR
 *
 * Y es a proposito: esa es exactamente la diferencia entre el rol de la clinica
 * y el del asistente en la RLS. Para decidir que puede decir hay que poder ver
 * lo que hoy no dice. El asistente, en cambio, no recibe estas filas: no es que
 * se las escondamos en la pantalla, es que su consulta no las devuelve.
 *
 * El recuento de arriba se cuenta AQUI, sobre las filas que devolvio la RLS. No
 * con un filtro en la consulta —eso esta prohibido y lo vigila un test— sino
 * contando lo que hay. Es el mismo numero que la clinica puede comparar en «Lo
 * que ve el asistente».
 */
export default async function Conocimiento() {
  const sesion = await exigirSesion()
  const { tratamientos, faq, config } = await leerConocimiento(sesion)
  const puedeTocar = puedeEscribir(sesion.rol)

  const filas = [...tratamientos.filas, ...faq.filas, ...config.filas]
  const publicas = filas.filter((fila) => fila.publico).length

  return (
    <>
      <Cabecera
        titulo="Lo que puede decir"
        explicacion={
          'De todo lo que hay aquí, el asistente solo usa lo que esté marcado como «el asistente ' +
          'puede decir esto». Lo demás no le llega: ni lo lee, ni lo resume, ni lo sabe.'
        }
      />

      <AvisoDeAislamiento
        ajenas={[...tratamientos.ajenas, ...faq.ajenas, ...config.ajenas]}
      />

      <p className="mb-8 text-sm text-apagado">
        <span className="font-mono text-tinta">{publicas}</span> de{' '}
        <span className="font-mono text-tinta">{filas.length}</span> cosas están aprobadas para que
        el asistente las diga.
      </p>

      <div className="space-y-8">
        <Caja titulo="Preguntas frecuentes">
          {faq.filas.length === 0 ? (
            <Vacio>Todavía no hay ninguna pregunta frecuente escrita.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {faq.filas.map((fila) => (
                <li key={fila.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{fila.pregunta}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-apagado">
                      {fila.respuesta_aprobada}
                    </p>
                    <p className="mt-1 text-xs text-apagado">
                      El asistente contesta esto palabra por palabra, sin cambiar nada.
                    </p>
                  </div>
                  <InterruptorPublico
                    tabla="faq"
                    id={fila.id}
                    publico={fila.publico}
                    texto={textoQueDiria('faq', fila)}
                    puedeEscribir={puedeTocar}
                  />
                </li>
              ))}
            </ul>
          )}
        </Caja>

        <Caja titulo="Tratamientos">
          {tratamientos.filas.length === 0 ? (
            <Vacio>Todavía no hay ningún tratamiento en el catálogo.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {tratamientos.filas.map((fila) => (
                <li key={fila.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">
                      {fila.nombre}{' '}
                      <span className="font-mono text-xs text-apagado">
                        {fila.codigo} · {fila.duracion_min} min
                        {fila.activo ? '' : ' · retirado del catálogo'}
                      </span>
                    </p>
                    {fila.frase_bot ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-apagado">
                        {fila.frase_bot}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-apagado">
                        Sin frase escrita: el asistente solo diría el nombre y lo que dura.
                      </p>
                    )}
                  </div>
                  <InterruptorPublico
                    tabla="tratamientos"
                    id={fila.id}
                    publico={fila.publico}
                    texto={textoQueDiria('tratamientos', fila)}
                    puedeEscribir={puedeTocar}
                  />
                </li>
              ))}
            </ul>
          )}
        </Caja>

        <Caja
          titulo="Datos de la clínica"
          pie="Dirección, parking, formas de pago, enlace a la política de privacidad… Lo que el asistente puede dar cuando se lo preguntan."
        >
          {config.filas.length === 0 ? (
            <Vacio>Todavía no hay ningún dato guardado.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {config.filas.map((fila) => (
                <li key={fila.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wide text-apagado">
                      {fila.clave}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{fila.valor}</p>
                    {fila.comentario ? (
                      <p className="mt-1 text-xs text-apagado">{fila.comentario}</p>
                    ) : null}
                  </div>
                  <InterruptorPublico
                    tabla="config"
                    id={fila.id}
                    publico={fila.publico}
                    texto={textoQueDiria('config', fila)}
                    puedeEscribir={puedeTocar}
                  />
                </li>
              ))}
            </ul>
          )}
        </Caja>
      </div>
    </>
  )
}
