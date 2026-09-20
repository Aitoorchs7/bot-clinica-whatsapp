/**
 * proxy.ts — el guardian del panel. NUNCA `middleware.ts`.
 *
 * ============== LO QUE HACE HOY NEXT.JS 16.3.5, Y ESTA MEDIDO ==============
 *
 * `.claude/CLAUDE.md` dice que `middleware.ts` «se ignora en silencio y las
 * rutas quedan publicas». Se comprobo en F5 renombrando este archivo, y en
 * 16.3.5 todavia NO es asi. Lo que sale por la consola al compilar es:
 *
 *     ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
 *
 * Next avisa y LO SIGUE EJECUTANDO, asi que el panel no se quedo abierto. La
 * salida entera esta en ESTADO_F5 §5.1.
 *
 * LA REGLA SE MANTIENE, y con mas motivo que antes: el convenio esta
 * deprecado, y el dia que Next lo retire este guardian dejara de correr SIN
 * QUE FALLE NINGUNA COMPILACION. Por eso el archivo se llama `proxy.ts`, por
 * eso `tests/panel/02-proxy-en-su-sitio.test.ts` prohibe que exista un
 * `middleware.ts` —hoy es el unico que caza ese renombrado— y por eso la
 * prueba de navegador no se conforma con ver una redireccion.
 *
 * Y NO SE CONFORMA porque el panel se protege por DOS sitios: este archivo y
 * el `layout.tsx` del panel, que vuelve a exigir sesion. Los dos redirigen
 * igual, asi que una prueba que solo mirase la redireccion se quedaria verde
 * con este archivo borrado. Tambien medido: sin `proxy.ts`, «pedir /panel sin
 * sesion acaba en /entrar» SIGUE EN VERDE, y lo que se pone rojo son las diez
 * aserciones que exigen la cabecera de aqui abajo.
 *
 * Doc leida antes de escribir esto:
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *
 * ============================ QUE HACE ============================
 *
 *   1. Refresca la sesion de Supabase y ESCRIBE LAS COOKIES. Es lo que
 *      `servidor.ts` dice en su cabecera desde F1: desde un Server Component
 *      no se pueden escribir cabeceras, asi que las escribe este archivo.
 *   2. Sin sesion, toda peticion a /panel se va a /entrar.
 *   3. Con sesion, /entrar se va a /panel: no se ensena un formulario de
 *      entrada a quien ya ha entrado.
 *
 * ========================= QUE NO HACE =========================
 *
 * NO protege /api/whatsapp/webhook, y no debe: quien llama ahi es Meta, no una
 * sesion con cookie. Su autenticacion es la firma HMAC y vive dentro de la
 * propia ruta (F4). Por eso el `matcher` deja fuera /api entero.
 *
 * NO es la unica comprobacion. El propio doc de Next avisa de que las Server
 * Functions son POST a la ruta donde se usan, y de que un cambio de `matcher`
 * puede quitarles la cobertura del proxy sin que nadie lo note. Cada Server
 * Action vuelve a exigir sesion y rol por su cuenta (`sesion.ts`), y por
 * debajo de todo manda la RLS. Esconder un boton es comodidad; la garantia es
 * la base de datos.
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * La marca de que ESTE archivo ha corrido.
 *
 * No es telemetria ni decoracion: es lo que distingue «el proxy ha protegido
 * la ruta» de «la ruta se ha protegido sola en el layout». Las dos cosas
 * redirigen igual, y sin esta cabecera una prueba de redireccion seguiria
 * verde con el panel abierto de par en par.
 */
export const CABECERA_GUARDIA = 'x-panel-guardia'

/** A donde se manda a quien no ha entrado. */
export const RUTA_ENTRAR = '/entrar'

/** Lo que hay detras de la puerta. */
export const RUTA_PANEL = '/panel'

export async function proxy(peticion: NextRequest) {
  // NextResponse.next() con la peticion dentro: asi las cookies refrescadas
  // valen tanto para lo que se renderice despues como para el navegador.
  let respuesta = NextResponse.next({ request: peticion })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return peticion.cookies.getAll()
        },
        setAll(aGuardar) {
          for (const { name, value } of aGuardar) {
            peticion.cookies.set(name, value)
          }
          respuesta = NextResponse.next({ request: peticion })
          for (const { name, value, options } of aGuardar) {
            respuesta.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser() y NO getSession(): getSession se fia de la cookie tal cual
  // llego, que es un dato que manda el navegador. getUser pregunta al
  // servidor de Auth y valida el token. En un guardian, la diferencia es toda
  // la diferencia.
  const {
    data: { user: usuario },
  } = await supabase.auth.getUser()

  const ruta = peticion.nextUrl.pathname
  const enElPanel = ruta === RUTA_PANEL || ruta.startsWith(`${RUTA_PANEL}/`)
  const enLaEntrada = ruta === RUTA_ENTRAR

  if (enElPanel && !usuario) {
    const destino = peticion.nextUrl.clone()
    destino.pathname = RUTA_ENTRAR
    destino.search = ''
    // A donde queria ir, para devolverlo ahi despues de entrar. Solo la ruta,
    // nunca una URL completa: un `?desde=https://otro.sitio` seria una
    // redireccion abierta de manual.
    destino.searchParams.set('desde', ruta)
    return marcar(NextResponse.redirect(destino), respuesta)
  }

  if (enLaEntrada && usuario) {
    const destino = peticion.nextUrl.clone()
    destino.pathname = RUTA_PANEL
    destino.search = ''
    return marcar(NextResponse.redirect(destino), respuesta)
  }

  respuesta.headers.set(CABECERA_GUARDIA, 'proxy')
  return respuesta
}

/**
 * Pone la marca en la redireccion y se lleva consigo las cookies refrescadas.
 *
 * Sin el traspaso de cookies, una sesion que acaba de renovarse se perderia en
 * cada redireccion y el usuario tendria que volver a entrar cada hora.
 */
function marcar(destino: NextResponse, conCookies: NextResponse): NextResponse {
  for (const cookie of conCookies.cookies.getAll()) {
    destino.cookies.set(cookie)
  }
  destino.headers.set(CABECERA_GUARDIA, 'proxy')
  return destino
}

export const config = {
  /**
   * Todo menos los estaticos y /api.
   *
   * /api fuera a proposito: ahi vive el webhook de Meta, que se autentica con
   * la firma y no con una cookie. Si algun dia el panel necesita una ruta de
   * API propia, va con su propia comprobacion dentro, no confiando en esto.
   *
   * Los valores tienen que ser constantes para que Next los analice al
   * compilar: nada de variables aqui.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\.svg$).*)'],
}
