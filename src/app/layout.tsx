import type { Metadata } from 'next'
import { Geist, Geist_Mono, Newsreader } from 'next/font/google'

import './globals.css'

/**
 * Tres tipografias y cada una con su trabajo:
 *
 *   Geist Sans  · la interfaz y los datos. Geometrica y estrecha, que es lo que
 *                 hace falta cuando en una fila caben nombre, hora y estado.
 *   Newsreader  · los titulos de pantalla. El contraste entre una serif de
 *                 titular y una sans de datos es lo que separa esto de un
 *                 panel de administracion cualquiera.
 *   Geist Mono  · horas, identificadores y recuentos. Las cifras se alinean en
 *                 columna y se comparan de un vistazo.
 */
const sans = Geist({ variable: '--tipo-sans', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--tipo-mono', subsets: ['latin'] })
const serif = Newsreader({
  variable: '--tipo-serif',
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'Panel de la clínica',
  description: 'Agenda, fichas y avisos del asistente de WhatsApp.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es"
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-hueso font-sans text-tinta">{children}</body>
    </html>
  )
}
