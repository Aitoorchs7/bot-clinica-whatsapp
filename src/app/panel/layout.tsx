import { LogOut } from 'lucide-react'

import { Navegacion } from '@/componentes/panel/navegacion'
import { leerClinica } from '@/lib/panel/consultas'
import { salir } from '@/lib/panel/entrada'
import { NOMBRE_DEL_ROL, exigirSesion } from '@/lib/panel/sesion'

/**
 * El armazon del panel.
 *
 * AQUI HAY UNA SEGUNDA COMPROBACION DE SESION, Y ES A PROPOSITO
 *
 * `proxy.ts` ya manda a /entrar a quien no tiene sesion. Esto lo vuelve a
 * mirar, y no es desconfianza decorativa: el doc de Next avisa de que un
 * cambio de `matcher` puede dejar una ruta fuera del proxy sin que nadie se
 * entere, y de que las Server Functions se saltan esa cobertura con facilidad.
 * Dos cerrojos que fallan de formas distintas valen mas que uno bueno.
 *
 * Lo que NO hace esta doble comprobacion es demostrar que el proxy funciona:
 * como las dos redirigen igual, una prueba que solo mirase la redireccion
 * seguiria verde con el proxy borrado. No es una suposicion, esta medido: sin
 * `src/proxy.ts`, la prueba «pedir /panel sin sesion acaba en /entrar» se
 * queda VERDE gracias a estas cuatro lineas. Distinguir una cosa de la otra es
 * el trabajo de la cabecera `x-panel-guardia` (ESTADO_F5 §5.1).
 */
export default async function LayoutDelPanel({ children }: LayoutProps<'/panel'>) {
  const sesion = await exigirSesion()
  const clinica = await leerClinica(sesion)

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-6 py-8 lg:flex-row lg:px-10">
      <aside className="lg:w-60 lg:shrink-0">
        <div className="lg:sticky lg:top-8">
          <div className="mb-6">
            <p className="font-serif text-lg leading-tight">{clinica.nombre}</p>
            <p className="mt-0.5 text-xs text-apagado">
              {sesion.email} · {NOMBRE_DEL_ROL[sesion.rol]}
            </p>
          </div>

          <Navegacion />

          <form action={salir} className="mt-6 border-t border-linea pt-4">
            <button
              type="submit"
              className="flex items-center gap-2 text-xs text-apagado transition-colors hover:text-tinta"
            >
              <LogOut aria-hidden size={14} strokeWidth={1.75} />
              Salir
            </button>
          </form>

          {sesion.rol === 'lectura' ? (
            <p
              data-prueba="aviso-solo-lectura"
              className="mt-6 rounded-caja border border-linea bg-papel p-3 text-xs leading-relaxed text-apagado"
            >
              Tu usuario puede consultarlo todo, pero no cambiar nada. Por eso no verás botones
              para guardar.
            </p>
          ) : null}
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
