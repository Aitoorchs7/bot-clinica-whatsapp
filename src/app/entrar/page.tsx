import { Formulario } from './formulario'

/**
 * La puerta.
 *
 * Aqui no se dice de que clinica es el panel ni cuantas hay: una pantalla de
 * entrada que enseña nombres antes de que nadie haya entrado es una lista de
 * clientes gratis para quien pase por delante.
 */
export const metadata = { title: 'Entrar · Panel de la clínica' }

export default async function Entrar({ searchParams }: PageProps<'/entrar'>) {
  const parametros = await searchParams
  const crudo = parametros.desde
  const pedido = Array.isArray(crudo) ? crudo[0] : crudo

  // El mismo cerrojo que en la Server Action, por el otro lado: solo rutas de
  // este panel. Un `?desde=` que acepte cualquier cosa es una redireccion
  // abierta con un enlace que parece nuestro.
  const desde = typeof pedido === 'string' && pedido.startsWith('/panel') && !pedido.startsWith('//')
    ? pedido
    : '/panel'

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl leading-tight tracking-tight">Panel de la clínica</h1>
        <p className="mb-8 mt-2 text-sm text-apagado">
          Agenda, avisos del asistente y lo que puede contarle a un paciente.
        </p>

        <div className="rounded-caja border border-linea bg-papel p-6">
          <Formulario desde={desde} />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-apagado">
          Si no puedes entrar, escribe a quien lleva la cuenta de la clínica. Las contraseñas no
          las vemos nosotros.
        </p>
      </div>
    </div>
  )
}
