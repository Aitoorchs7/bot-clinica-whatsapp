/**
 * Los claims de seguridad que NO pueden vivir en `user_metadata`, y como se
 * quitan de ahi de verdad.
 *
 * ===========================================================================
 * POR QUE ESTE ARCHIVO EXISTE
 * ===========================================================================
 *
 * `rol` y `clinica_id` van en `app_metadata`, que solo escribe el servidor con
 * `service_role`. En `user_metadata` los puede editar el propio usuario desde
 * el navegador: ahi dentro, `clinica_id` seria una forma de declararse de la
 * clinica de al lado. La RLS lee `app_metadata` y nada mas —lo comprueba
 * `tests/rls/00-rls-activada`—, asi que un `rol` en `user_metadata` no abre
 * nada por si solo; pero es una copia de un dato de seguridad que el usuario
 * controla, y el panel o un `select` mal escrito pueden acabar leyendola.
 * El acta de un alta se pone roja si aparece.
 *
 * Hasta F8 se detectaba y NO habia forma de quitarlo. Este archivo la pone.
 *
 * ===========================================================================
 * UN OBJETO VACIO NO BORRA NADA. MEDIDO, NO SUPUESTO.
 * ===========================================================================
 *
 * Lo intuitivo es «le mando el user_metadata que quiero que tenga»:
 *
 *     updateUserById(id, { user_metadata: {} })       // NO HACE NADA
 *
 * Supabase Auth **fusiona**, no reemplaza. Sonda contra el proyecto de
 * desarrollo, 22/09/2026:
 *
 *     al crear   : {"clinica_id":"de-mentira","rol":"propietario","tema":"oscuro", …}
 *     tras {}    : {"clinica_id":"de-mentira","rol":"propietario","tema":"oscuro", …}
 *     tras nulls : {"tema":"oscuro", …}        <- y "rol" ya no esta ni como null
 *
 * O sea: con `{}` la llamada devuelve 200, no da ningun error, y los claims
 * siguen exactamente donde estaban. Una limpieza que no limpia y que ademas
 * se informa como hecha — que es la forma que tiene este proyecto de perder
 * una garantia (`.claude/CLAUDE.md`, «un verde no es una garantia»).
 *
 * Para borrar una clave hay que mandarla **a null, una por una**. Lo que no se
 * nombra no se toca: `tema` sobrevive, y tiene que sobrevivir, porque las
 * preferencias del usuario no son cosa del alta.
 */

/** Los dos que no pueden estar ahi. Espejo de `app_metadata`. */
export const CLAIMS_DE_SEGURIDAD = ['rol', 'clinica_id']

/**
 * El parche que hay que mandarle a Supabase para quitarlos, o `null` si no hay
 * nada que quitar.
 *
 * Pura a proposito: es lo unico de esta historia que se puede comprobar sin
 * base de datos, y lo que se comprueba es justo lo que se hizo mal una vez —
 * que el parche lleve los claims **nombrados y a null**, y no un `{}` que
 * parece decir «dejalo vacio» y no dice nada.
 */
export function parcheParaBorrarClaims(userMetadata) {
  const dentro = userMetadata ?? {}
  const presentes = CLAIMS_DE_SEGURIDAD.filter((clave) => dentro[clave] !== undefined)
  if (presentes.length === 0) return null
  return Object.fromEntries(presentes.map((clave) => [clave, null]))
}

/**
 * Quita `rol` y `clinica_id` de `user_metadata` de un usuario, y COMPRUEBA que
 * se han ido.
 *
 * La relectura no es celo: es la diferencia entre esta funcion y el fallo que
 * la motivo. Que el `update` devuelva 200 no demuestra que haya borrado nada
 * —con `{}` devuelve 200 y no borra—, asi que se vuelve a leer el usuario y se
 * lanza si siguen ahi. Mejor un error ruidoso que un «limpiado» que no limpio.
 *
 * @param {{ auth: { admin: object } }} db  cliente con service_role
 * @param {{ id: string, email?: string, user_metadata?: object }} usuario
 * @returns {Promise<{ limpiado: boolean, claims: string[] }>}
 */
export async function limpiarClaimsDeUsuario(db, usuario) {
  const parche = parcheParaBorrarClaims(usuario.user_metadata)
  if (!parche) return { limpiado: false, claims: [] }

  const claims = Object.keys(parche)
  const quien = usuario.email ?? usuario.id

  const { error } = await db.auth.admin.updateUserById(usuario.id, { user_metadata: parche })
  if (error) {
    throw new Error(`Limpiando user_metadata de ${quien}: ${error.message}`)
  }

  const { data, error: errorLee } = await db.auth.admin.getUserById(usuario.id)
  if (errorLee) {
    throw new Error(`Releyendo ${quien} despues de limpiar: ${errorLee.message}`)
  }

  const despues = data?.user?.user_metadata ?? {}
  const quedan = CLAIMS_DE_SEGURIDAD.filter(
    (clave) => despues[clave] !== undefined && despues[clave] !== null,
  )
  if (quedan.length > 0) {
    throw new Error(
      `Se ha mandado el parche para borrar ${claims.join(' y ')} de user_metadata de ${quien}, ` +
        `Supabase no ha dado error, y ${quedan.join(' y ')} sigue(n) ahi. NO se ha limpiado: ` +
        'revisalo a mano en Supabase > Authentication antes de seguir.',
    )
  }

  return { limpiado: true, claims }
}
