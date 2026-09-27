/**
 * Quitar `rol` y `clinica_id` de `user_metadata`, y que se vayan de verdad.
 *
 * ===========================================================================
 * EL FALLO QUE ESTA PRUEBA EXISTE PARA IMPEDIR
 * ===========================================================================
 *
 * Lo intuitivo para dejar `user_metadata` sin esas dos claves es mandarle a
 * Supabase el objeto que uno quiere que tenga:
 *
 *     updateUserById(id, { user_metadata: {} })
 *
 * **Eso no borra nada.** Supabase Auth FUSIONA `user_metadata`, no lo
 * reemplaza: la llamada devuelve 200, no hay error, y los claims siguen
 * exactamente donde estaban. Una limpieza que no limpia, informada como hecha.
 *
 * Paso en F8, en el guion de las demostraciones en rojo: la «restauracion» de
 * uno de los rojos usaba `{}`, dejo al usuario roto, y lo unico que lo cazo fue
 * volver a correr el acta al final (`ESTADO_F8` §5.1). De ahi salen las dos
 * mitades de este archivo.
 *
 * ===========================================================================
 * POR QUE LA MITAD QUE IMPORTA NECESITA SUPABASE
 * ===========================================================================
 *
 * La mitad pura comprueba que el parche lleva los claims NOMBRADOS Y A NULL, y
 * no un `{}`. Esta bien, y es lo que corre sin credenciales — pero comprueba
 * nuestra funcion, no a Supabase. La afirmacion de la que va todo esto —«un
 * objeto vacio no borra»— es sobre el comportamiento de OTRO, y medirla con un
 * doble seria medir el doble (la leccion de F7: una prueba que copia al
 * llamante comprueba a la copia).
 *
 * Asi que la mitad viva manda las dos cosas al Supabase de verdad y lee lo que
 * queda. Si algun dia Supabase cambiara y `{}` pasara a borrar, la primera
 * aserccion se pone roja y nos enteramos; hoy dice lo que hace hoy.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

import { clienteServicio } from '../ayuda/clientes'
import { describeVivo } from '../ayuda/vivo'

import {
  CLAIMS_DE_SEGURIDAD,
  limpiarClaimsDeUsuario,
  parcheParaBorrarClaims,
} from '../../scripts/usuarios.mjs'

// ---------------------------------------------------------------------------
// La mitad pura. Corre en una maquina recien clonada.
// ---------------------------------------------------------------------------

describe('el parche para borrar claims de user_metadata', () => {
  it('nombra cada claim y lo manda a null — nunca un objeto vacio', () => {
    const parche = parcheParaBorrarClaims({ rol: 'propietario', clinica_id: 'abc' })

    // Lo que se comprueba aqui es literalmente el fallo: `{}` seria una
    // limpieza que devuelve 200 y no limpia.
    expect(parche, 'Un parche vacio no borra nada: Supabase fusiona').not.toEqual({})
    expect(parche).toEqual({ rol: null, clinica_id: null })
  })

  it('solo nombra los que estan', () => {
    expect(parcheParaBorrarClaims({ rol: 'recepcion' })).toEqual({ rol: null })
    expect(parcheParaBorrarClaims({ clinica_id: 'abc' })).toEqual({ clinica_id: null })
  })

  it('no toca lo que no es suyo: las preferencias del usuario se quedan', () => {
    const parche = parcheParaBorrarClaims({ rol: 'lectura', tema: 'oscuro', idioma: 'es' })
    expect(Object.keys(parche!).sort()).toEqual(['rol'])
  })

  it('sin nada que borrar devuelve null, y entonces no se llama a Supabase', () => {
    expect(parcheParaBorrarClaims({ tema: 'oscuro' })).toBeNull()
    expect(parcheParaBorrarClaims({})).toBeNull()
    expect(parcheParaBorrarClaims(undefined)).toBeNull()
  })

  it('los claims vigilados son los dos de app_metadata', () => {
    expect([...CLAIMS_DE_SEGURIDAD].sort()).toEqual(['clinica_id', 'rol'])
  })
})

// ---------------------------------------------------------------------------
// La mitad viva. Es la que demuestra la afirmacion.
// ---------------------------------------------------------------------------

describeVivo('contra Supabase de verdad', () => {
  const email = `alta-usuarios-${randomUUID().slice(0, 8)}@ejemplo.test`
  let id = ''

  /** Un usuario de un solo uso, con basura en user_metadata a proposito. */
  async function sembrarUsuario() {
    const db = clienteServicio()
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: `${randomUUID()}Aa9!`,
      email_confirm: true,
      app_metadata: { rol: 'propietario', clinica_id: 'clinica-de-la-prueba' },
      user_metadata: { rol: 'propietario', clinica_id: 'clinica-de-la-prueba', tema: 'oscuro' },
    })
    if (error) throw new Error(`Sembrando el usuario de la prueba: ${error.message}`)
    id = data.user.id
    return data.user
  }

  async function leer() {
    const { data, error } = await clienteServicio().auth.admin.getUserById(id)
    if (error) throw new Error(`Releyendo el usuario de la prueba: ${error.message}`)
    return data.user
  }

  // Por id, nunca por un patron de correo: es el fallo de F6. Aqui solo se
  // borra el usuario que ha creado ESTE archivo.
  afterAll(async () => {
    if (!id) return
    await clienteServicio().auth.admin.deleteUser(id)
  })

  it('un objeto vacio NO borra nada, y no da ningun error', async () => {
    // El control positivo de todo el archivo. Sin esto, la prueba de abajo
    // podria estar verde porque no habia nada que borrar.
    const usuario = await sembrarUsuario()
    expect(usuario.user_metadata?.rol, 'El usuario no ha nacido con basura dentro').toBe(
      'propietario',
    )

    const { error } = await clienteServicio().auth.admin.updateUserById(id, { user_metadata: {} })
    expect(error, 'Y encima no falla: por eso el fallo pasa desapercibido').toBeNull()

    const despues = await leer()
    expect(
      despues.user_metadata?.rol,
      'Si esto se pone rojo, Supabase ha cambiado y `{}` ya borra. Buena noticia, pero hay ' +
        'que releer usuarios.mjs y este archivo antes de fiarse.',
    ).toBe('propietario')
    expect(despues.user_metadata?.clinica_id).toBe('clinica-de-la-prueba')
  })

  it('nombrarlos y mandarlos a null SI los borra', async () => {
    const { limpiado, claims } = await limpiarClaimsDeUsuario(clienteServicio(), await leer())

    expect(limpiado).toBe(true)
    expect([...claims].sort()).toEqual(['clinica_id', 'rol'])

    // Se relee de la base, no se mira lo que devolvio la llamada.
    const despues = await leer()
    expect(despues.user_metadata?.rol).toBeUndefined()
    expect(despues.user_metadata?.clinica_id).toBeUndefined()
  })

  it('y no se lleva por delante ni las preferencias ni app_metadata', async () => {
    const despues = await leer()

    // `tema` es del usuario y no es cosa del alta.
    expect(despues.user_metadata?.tema).toBe('oscuro')

    // Y lo que de verdad usa la RLS sigue intacto: se quita la COPIA, no el
    // original.
    expect(despues.app_metadata?.rol).toBe('propietario')
    expect(despues.app_metadata?.clinica_id).toBe('clinica-de-la-prueba')
  })

  it('llamarlo otra vez no hace nada y lo dice', async () => {
    const { limpiado, claims } = await limpiarClaimsDeUsuario(clienteServicio(), await leer())
    expect(limpiado).toBe(false)
    expect(claims).toEqual([])
  })
})
