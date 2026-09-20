import { ShieldCheck, TriangleAlert } from 'lucide-react'

import { Etiqueta } from '@/componentes/panel/etiqueta'
import { Aviso, AvisoDeAislamiento, Cabecera, Caja, Vacio } from '@/componentes/panel/piezas'
import { leerAuditoria, leerClinica, leerConocimiento, leerObservabilidad } from '@/lib/panel/consultas'
import { NOMBRE_DE_LA_ACCION, type Accion } from '@/lib/panel/auditoria'
import { fechaYHora } from '@/lib/panel/formato'
import { exigirSesion } from '@/lib/panel/sesion'

export const metadata = { title: 'Lo que ve el asistente · Panel de la clínica' }

const NOMBRE_TABLA: Readonly<Record<string, string>> = {
  config: 'Datos de la clínica',
  tratamientos: 'Tratamientos',
  faq: 'Preguntas frecuentes',
  horarios: 'Horarios',
  bloques: 'Instrucciones',
}

/**
 * La barandilla 2, puesta delante de quien paga.
 *
 * POR QUE ESTA PANTALLA EXISTE
 *
 * Cada vez que el asistente prepara una respuesta, apunta cuantas filas ha
 * podido leer de cada sitio. Ese apunte lo escribe el, en `eventos`, y no puede
 * borrarlo ni cambiarlo: la migracion 004 le revoca UPDATE y DELETE. Aqui se
 * lee.
 *
 * LO QUE HACE QUE ESTO SIRVA DE ALGO es la columna de al lado. El asistente no
 * puede decir «he visto 14 de 16», porque las dos que no debe ver NO EXISTEN
 * para el —ese es el producto, no una limitacion—. La clinica si las ve, y este
 * panel las cuenta. Poner los dos numeros juntos es lo que permite comprobarlo
 * sin fiarse de nuestra palabra: si el asistente hubiera leido mas filas de las
 * aprobadas, se veria aqui.
 */
export default async function Observabilidad() {
  const sesion = await exigirSesion()
  const clinica = await leerClinica(sesion)
  const conocimiento = await leerConocimiento(sesion)
  const { apuntes, ajenas, loQueHay } = await leerObservabilidad(sesion, conocimiento)
  const rastro = await leerAuditoria(sesion, 25)

  const ultimo = apuntes[0]
  const conAlarma = apuntes.filter((apunte) => apunte.alarma)

  // `vistas` en null significa «este apunte no lo dice», y se ensena como un
  // guion, no como un cero: son cosas distintas y la pantalla no las mezcla.
  const comparacion = loQueHay.map((fila) => {
    const recuento = ultimo ? ultimo[fila.tabla as 'config' | 'tratamientos' | 'faq'] : null
    const vistas = recuento === null ? null : recuento.total
    return { ...fila, vistas, cuadra: vistas === null ? null : vistas === fila.publicas }
  })

  return (
    <>
      <Cabecera
        titulo="Lo que ve el asistente"
        explicacion={
          'Cada vez que contesta a alguien, el asistente deja apuntado cuántas cosas ha podido ' +
          'leer. Aquí se comparan con las que tenéis aprobadas. No es una promesa nuestra: son ' +
          'sus propios apuntes, y él no puede borrarlos ni cambiarlos.'
        }
      />

      <AvisoDeAislamiento ajenas={ajenas} />

      {conAlarma.length > 0 ? (
        <Aviso grave>
          <span className="flex items-start gap-2">
            <TriangleAlert aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-medium">
                En {conAlarma.length} de los últimos apuntes llegó alguna fila que no debía llegar.
              </strong>{' '}
              El asistente la descartó antes de usarla —por eso queda apuntada— pero que haya
              llegado significa que algo no está bien en los permisos. Avisa a quien lleva el
              sistema.
            </span>
          </span>
        </Aviso>
      ) : null}

      <div className="space-y-8">
        <Caja
          titulo="Lo aprobado y lo que vio"
          pie={
            ultimo
              ? `Último apunte: ${fechaYHora(ultimo.creado_en, clinica.zona_horaria)}.`
              : undefined
          }
        >
          {!ultimo ? (
            <Vacio>
              El asistente todavía no ha contestado a nadie, así que no hay ningún apunte.
            </Vacio>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Dónde</th>
                  <th className="w-32">Tenéis</th>
                  <th className="w-40">Aprobado para él</th>
                  <th className="w-40">Vio la última vez</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {comparacion.map((fila) => (
                  <tr key={fila.tabla}>
                    <td className="text-sm">{NOMBRE_TABLA[fila.tabla] ?? fila.tabla}</td>
                    <td className="font-mono text-sm">{fila.total}</td>
                    <td className="font-mono text-sm">{fila.publicas}</td>
                    <td className="font-mono text-sm">{fila.vistas ?? '—'}</td>
                    <td>
                      {fila.cuadra === null ? null : fila.cuadra ? (
                        <Etiqueta tono="verde">Cuadra</Etiqueta>
                      ) : (
                        <Etiqueta tono="amarillo">No cuadra</Etiqueta>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-apagado">
            <ShieldCheck aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>
              «No cuadra» casi siempre quiere decir que habéis cambiado algo después de la última
              vez que el asistente contestó, y se arregla solo en cuanto vuelva a hacerlo. Si
              siguiera sin cuadrar con el asistente trabajando, hay que mirarlo. Un guion quiere
              decir otra cosa: que ese apunte no llegó a anotarlo, no que viera cero.
            </span>
          </p>
        </Caja>

        <Caja titulo="Los últimos apuntes">
          {apuntes.length === 0 ? (
            <Vacio>Todavía no hay ningún apunte.</Vacio>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th className="w-44">Cuándo</th>
                  <th>Lo que pudo leer</th>
                  <th className="w-32">Descartado</th>
                </tr>
              </thead>
              <tbody>
                {apuntes.map((apunte) => {
                  const TABLAS = ['config', 'tratamientos', 'faq', 'horarios', 'bloques'] as const
                  const descartadas = TABLAS.reduce(
                    (suma, tabla) => suma + (apunte[tabla]?.retenidas ?? 0),
                    0,
                  )
                  return (
                    <tr key={apunte.id}>
                      <td className="font-mono text-xs">
                        {fechaYHora(apunte.creado_en, clinica.zona_horaria)}
                      </td>
                      <td className="font-mono text-xs text-apagado">
                        {TABLAS.map((tabla) => {
                          const recuento = apunte[tabla]
                          return recuento === null
                            ? `${tabla} —`
                            : `${tabla} ${recuento.publicas}/${recuento.total}`
                        }).join(' · ')}
                      </td>
                      <td>
                        {descartadas === 0 ? (
                          <span className="text-xs text-apagado">Nada</span>
                        ) : (
                          <Etiqueta tono="rojo">{descartadas} fila(s)</Etiqueta>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Caja>

        <Caja
          titulo="Quién ha cambiado qué"
          pie="Queda apuntado quién mueve cada interruptor y cuándo. No se puede borrar ni editar, tampoco por nosotros."
        >
          {rastro.filas.length === 0 ? (
            <Vacio>Todavía no ha cambiado nada nadie.</Vacio>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th className="w-44">Cuándo</th>
                  <th>Qué</th>
                  <th className="w-32">Dónde</th>
                  <th className="w-64">Quién</th>
                </tr>
              </thead>
              <tbody>
                {rastro.filas.map((apunte) => (
                  <tr key={apunte.id}>
                    <td className="font-mono text-xs">
                      {fechaYHora(apunte.creado_en, clinica.zona_horaria)}
                    </td>
                    <td className="text-sm">
                      {NOMBRE_DE_LA_ACCION[apunte.accion as Accion] ?? apunte.accion}
                    </td>
                    <td className="text-sm text-apagado">
                      {NOMBRE_TABLA[apunte.tabla] ?? apunte.tabla}
                    </td>
                    <td className="font-mono text-xs text-apagado">{apunte.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Caja>
      </div>
    </>
  )
}
