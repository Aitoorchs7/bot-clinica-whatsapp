'use client'

import { Bell, BookOpen, CalendarDays, Eye, MessageSquare, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * La navegacion del panel.
 *
 * LOS ROTULOS ESTAN EN EL IDIOMA DE LA CLINICA, NO EN EL NUESTRO
 *
 * Dentro se llaman `escalados` y `eventos`; en la pantalla se llaman «Avisos» y
 * «Lo que ve el asistente». Nadie en un mostrador tiene por que aprenderse como
 * llamamos nosotros a nuestras tablas, y la que peor sonaba era
 * «observabilidad», que ademas no dice lo que hace: esa pantalla sirve para
 * comprobar que el asistente solo ve lo aprobado.
 *
 * Los iconos son de Lucide porque es lo que fija el stack del proyecto en
 * `.claude/CLAUDE.md`. La guia de estilo que se ha seguido para el resto
 * preferiria otra familia; manda el proyecto. Van todos con el mismo grosor de
 * trazo, que es lo que de verdad se nota cuando estan en columna.
 */
const SITIOS = [
  { href: '/panel', rotulo: 'Agenda', Icono: CalendarDays },
  { href: '/panel/escalados', rotulo: 'Avisos', Icono: Bell },
  { href: '/panel/conversaciones', rotulo: 'Conversaciones', Icono: MessageSquare },
  { href: '/panel/fichas', rotulo: 'Pacientes', Icono: Users },
  { href: '/panel/conocimiento', rotulo: 'Lo que puede decir', Icono: BookOpen },
  { href: '/panel/observabilidad', rotulo: 'Lo que ve el asistente', Icono: Eye },
] as const

export function Navegacion() {
  const ruta = usePathname()

  return (
    <nav aria-label="Secciones del panel" className="flex flex-col gap-0.5">
      {SITIOS.map(({ href, rotulo, Icono }) => {
        const aqui = href === '/panel' ? ruta === '/panel' : ruta.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={aqui ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm transition-colors ${
              aqui ? 'bg-papel font-medium text-tinta' : 'text-apagado hover:bg-papel/60'
            }`}
          >
            <Icono aria-hidden size={16} strokeWidth={1.75} />
            {rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
