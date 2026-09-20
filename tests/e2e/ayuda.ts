import { expect, type Page } from '@playwright/test'

import { clienteServicio } from '../ayuda/clientes'
import { CONTRASENA, USUARIOS } from '../ayuda/siembra'

/**
 * Lo comun a las pruebas de navegador.
 *
 * LOS IDENTIFICADORES SE PREGUNTAN A LA BASE, NO SE PASAN EN UN ARCHIVO
 *
 * `sembrar()` devuelve los uuid, pero corre en el proceso del globalSetup y las
 * pruebas corren en otro. En vez de escribir un JSON temporal y tener que
 * acordarse de borrarlo, cada spec vuelve a buscar sus filas por el slug de la
 * clinica. Es una consulta mas y una fuente de desincronizacion menos.
 */
export { CONTRASENA, USUARIOS }

export type Rol = keyof typeof USUARIOS

/**
 * Entra por la pantalla de verdad: formulario, contrasena y cookie.
 *
 * No se inyecta una sesion a mano en el navegador. Si se hiciera, la prueba
 * comprobaria que el panel funciona con una cookie que le hemos fabricado
 * nosotros, no que alguien pueda entrar.
 */
export async function entrarComo(page: Page, rol: Rol): Promise<void> {
  await page.goto('/entrar')
  await page.fill('input[name="correo"]', USUARIOS[rol].email)
  await page.fill('input[name="contrasena"]', CONTRASENA)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/panel/)
}

/** Las filas sembradas de una clinica, buscadas por su slug. */
export async function filasDe(slug: 'rls-prueba-a' | 'rls-prueba-b') {
  const db = clienteServicio()

  const { data: clinicas } = await db.from('clinicas').select('id, nombre').eq('slug', slug)
  const clinica = (clinicas ?? [])[0]
  if (!clinica) throw new Error(`No hay ninguna clinica sembrada con el slug ${slug}`)

  const { data: faq } = await db
    .from('faq')
    .select('id, pregunta, respuesta_aprobada, publico')
    .eq('clinica_id', clinica.id)

  const { data: pacientes } = await db
    .from('pacientes')
    .select('id, nombre, apellidos, telefono_e164')
    .eq('clinica_id', clinica.id)

  return {
    clinicaId: clinica.id as string,
    nombre: clinica.nombre as string,
    faq: (faq ?? []) as { id: string; pregunta: string; respuesta_aprobada: string; publico: boolean }[],
    pacientes: (pacientes ?? []) as {
      id: string
      nombre: string
      apellidos: string | null
      telefono_e164: string
    }[],
  }
}

/**
 * Deja una fila de `faq` como estaba, pase lo que pase con la prueba.
 *
 * Se usa `service_role` porque esto es recogida, no aserción: ninguna prueba
 * depende de que la limpieza tenga permiso. La leccion es de ESTADO_F1 §5.1
 * —la restauracion va atada a la misma orden que rompe algo— y de §5.2 —un test
 * que deja el fixture distinto de como lo encontro rompe al de al lado—.
 */
export async function devolverPublico(faqId: string, publico: boolean): Promise<void> {
  const db = clienteServicio()
  const { error } = await db.from('faq').update({ publico }).eq('id', faqId)
  expect(error, 'No se ha podido restaurar el interruptor de la FAQ').toBeNull()
}
