/**
 * Cliente de Supabase para EL BOT.
 *
 * Es el unico de los tres que hay que disenar, no copiar, y es donde se apoya
 * la promesa del producto: lo que el bot no debe decir no se le esconde, NO LE
 * LLEGA. Eso lo garantizan las politicas RLS de supabase/migrations, y las
 * politicas solo saben quien es el bot por el JWT que se firma aqui.
 *
 * NUNCA service_role. Con service_role la RLS no se aplica y el bot veria las
 * filas confidenciales de todas las clinicas a la vez. Hay un test que recorre
 * src/ y falla si aparece en cualquier archivo del camino del bot.
 */
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

import type { Database } from '@/tipos/bd'

/** Vida del token. Corto a proposito: uno filtrado caduca solo. */
const VIDA_SEGUNDOS = 300
/** Margen para no usar un token que caduca mientras vuela la peticion. */
const MARGEN_SEGUNDOS = 30

type TokenCacheado = { token: string; caducaEn: number }

/**
 * Forma de un uuid v4. El clinica_id acaba dentro del JWT y de ahi pasa, ya
 * firmado, al `where` implicito de todas las politicas RLS.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Sin esto, un clinica_id con cualquier otra forma se firma igual y revienta en
 * Postgres al castear a uuid, con un 22P02 que el bot no sabe interpretar y que
 * no distingue "no hay nada para esta clinica" de "esta peticion viene mal".
 * Aqui falla antes de firmar, con el nombre del problema escrito.
 */
function exigirUuid(clinicaId: string): string {
  if (!UUID.test(clinicaId)) {
    throw new Error(
      `clinica_id no es un uuid: ${JSON.stringify(clinicaId)}. ` +
        'No se firma un token para una identidad que no tiene forma de identidad.',
    )
  }
  return clinicaId
}

/**
 * Cache por proceso. Firmar en cada webhook es gasto inutil: una conversacion
 * de WhatsApp son varias consultas seguidas y todas valen con el mismo token.
 */
const cache = new Map<string, TokenCacheado>()

function exigir(clave: string): string {
  const valor = process.env[clave]
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${clave}. Mira .env.example.`)
  }
  return valor
}

/**
 * Firma el token con el que el bot habla con Postgres.
 *
 * Los claims no son decorativos: `role` es lo que mapea al rol de Postgres, y
 * `app_metadata` es lo unico que leen las politicas. Va ahi y no en la otra
 * rama de metadatos, la que edita el propio usuario: esa serviria para que
 * cualquiera se declarase de otra clinica.
 */
async function firmarToken(clinicaId: string): Promise<string> {
  exigirUuid(clinicaId)
  const secreto = new TextEncoder().encode(exigir('SUPABASE_JWT_SECRET'))
  const url = exigir('NEXT_PUBLIC_SUPABASE_URL')

  return new SignJWT({
    role: 'authenticated',
    app_metadata: { rol: 'bot', clinica_id: clinicaId },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(`${url}/auth/v1`)
    .setAudience('authenticated')
    // El bot no es una persona: su identidad ES la clinica a la que sirve.
    // Ninguna politica usa auth.uid(), asi que `sub` solo sirve para que el
    // token tenga la forma que espera PostgREST y para poder rastrearlo.
    .setSubject(clinicaId)
    .setIssuedAt()
    .setExpirationTime(`${VIDA_SEGUNDOS}s`)
    .sign(secreto)
}

async function tokenDelBot(clinicaId: string): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000)
  const guardado = cache.get(clinicaId)

  if (guardado && guardado.caducaEn - MARGEN_SEGUNDOS > ahora) {
    return guardado.token
  }

  const token = await firmarToken(clinicaId)
  cache.set(clinicaId, { token, caducaEn: ahora + VIDA_SEGUNDOS })
  return token
}

/**
 * Un cliente por clinica. El clinica_id va dentro del token, no en los WHERE
 * de las consultas: aunque una consulta se olvide de filtrar, la RLS no.
 */
export function crearClienteBot(clinicaId: string) {
  // Se comprueba aqui y no solo al firmar: el token va en cache, asi que con la
  // validacion unicamente dentro de firmarToken un id malo podria colarse en la
  // primera llamada y no volver a mirarse.
  exigirUuid(clinicaId)

  return createClient<Database>(
    exigir('NEXT_PUBLIC_SUPABASE_URL'),
    exigir('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      accessToken: async () => tokenDelBot(clinicaId),
      // Con `accessToken` presente, supabase-js sustituye todo el arbol `.auth`
      // por un proxy que lanza al tocarlo, y estas tres opciones no llegan a
      // leerse. Se dejan escritas porque describen lo que el bot NO hace:
      // ni guarda sesion, ni la refresca, ni lee tokens de una URL.
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

/** Para los tests: obliga a volver a firmar. */
export function vaciarCacheDeTokens() {
  cache.clear()
}
