import Link from 'next/link'

/**
 * Las piezas sueltas de las que estan hechas todas las pantallas.
 *
 * Viven juntas porque son cuatro cosas de diez lineas y repartirlas en cuatro
 * archivos solo aniade sitios donde buscar. Ninguna tiene estado: se les pasa
 * lo que tienen que ensenar.
 */

/** La cabecera de cada pantalla: titulo en serif y una linea que lo explica. */
export function Cabecera({
  titulo,
  explicacion,
  acciones,
}: {
  titulo: string
  explicacion?: string
  acciones?: React.ReactNode
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-linea pb-6">
      <div>
        <h1 className="font-serif text-3xl leading-tight tracking-tight">{titulo}</h1>
        {explicacion ? <p className="mt-2 max-w-2xl text-sm text-apagado">{explicacion}</p> : null}
      </div>
      {acciones ? <div className="flex items-center gap-2">{acciones}</div> : null}
    </header>
  )
}

/** Una caja: 1px de linea, esquinas de 8px y aire dentro. */
export function Caja({
  titulo,
  pie,
  children,
  className = '',
}: {
  titulo?: string
  pie?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-caja border border-linea bg-papel ${className}`}>
      {titulo ? (
        <h2 className="border-b border-linea px-5 py-3 text-etiqueta font-medium uppercase text-apagado">
          {titulo}
        </h2>
      ) : null}
      <div className="p-5">{children}</div>
      {pie ? <div className="border-t border-linea px-5 py-3 text-sm text-apagado">{pie}</div> : null}
    </section>
  )
}

/**
 * El estado vacio, siempre con todas las letras.
 *
 * Es la misma regla que F2 aplico al prompt: un hueco en blanco invita a
 * rellenarlo. «Hoy no hay ninguna cita» y «no se han podido cargar las citas»
 * se parecen mucho cuando los dos son un espacio vacio.
 */
export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-apagado">{children}</p>
}

/**
 * El aviso de que algo no cuadra.
 *
 * `grave` se reserva para lo que significa que una barandilla ha cedido: filas
 * de otra clinica llegando al panel, o un apunte del contador con alarma. No se
 * usa para «no se ha podido guardar»: si todo grita, nada grita.
 */
export function Aviso({
  grave = false,
  children,
}: {
  grave?: boolean
  children: React.ReactNode
}) {
  const color = grave
    ? 'border-rojo-letra/30 bg-rojo-fondo text-rojo-letra'
    : 'border-amarillo-letra/30 bg-amarillo-fondo text-amarillo-letra'
  return (
    <div className={`mb-6 rounded-caja border px-4 py-3 text-sm ${color}`}>{children}</div>
  )
}

/**
 * El aviso de aislamiento, que es el que no deberia salir nunca.
 *
 * Si sale, hay filas de otra clinica llegando a este panel y eso solo puede ser
 * una politica RLS rota. Nombra la fila por su origen (`tabla#id`) y NO ensena
 * su contenido: un aviso de fuga que copia lo que se ha fugado es otra fuga.
 */
export function AvisoDeAislamiento({ ajenas }: { ajenas: readonly string[] }) {
  if (ajenas.length === 0) return null
  return (
    <Aviso grave>
      <strong className="font-medium">Han llegado datos que no son de esta clínica.</strong> Se han
      descartado y no se enseñan aquí, pero esto no debería pasar nunca: avisa a quien lleva el
      sistema. Filas: <span className="font-mono text-xs">{ajenas.join(', ')}</span>
    </Aviso>
  )
}

/** Un enlace discreto, subrayado solo al pasar por encima. */
export function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}

/** Dato y rotulo, para las rejillas de una ficha. */
export function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-etiqueta uppercase text-apagado">{rotulo}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  )
}
