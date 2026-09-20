import { expect, test } from '@playwright/test'

import { HAY_BASE_DE_DATOS, MARCADOR } from '../ayuda/entorno'

import { entrarComo, filasDe } from './ayuda'

/**
 * Un usuario de la clinica A no ve NI UNA fila de la B. Por ninguna pantalla.
 *
 * POR QUE ESTO SE PRUEBA OTRA VEZ AQUI, SI YA ESTA EN F1
 *
 * Las de F1 comprueban la RLS contra PostgREST. Estas comprueban LO QUE SALE EN
 * LA PANTALLA, que es donde una fuga se convierte en un problema de verdad: una
 * consulta nueva mal escrita, un `select('*')` que se lleva un embebido de mas,
 * o una pantalla que pinta algo que le llego en un sitio donde no mira nadie.
 *
 * El probador es un usuario `authenticated` de la otra clinica, no `anon`. Es
 * la leccion de ESTADO_F1 §5: a `anon` se le revocaron hasta los GRANT, asi que
 * una bateria escrita con `anon` de probador daria verde con la RLS apagada.
 */

test.skip(!HAY_BASE_DE_DATOS, 'Sin Supabase de desarrollo no hay panel que probar')

const PANTALLAS = [
  '/panel',
  '/panel?vista=semana',
  '/panel/escalados',
  '/panel/conversaciones',
  '/panel/fichas',
  '/panel/conocimiento',
  '/panel/observabilidad',
]

test.describe('el panel de B no ensena nada de A', () => {
  test('ni un dato de A en ninguna de las siete pantallas', async ({ page }) => {
    const a = await filasDe('rls-prueba-a')
    await entrarComo(page, 'bPropietario')

    for (const pantalla of PANTALLAS) {
      await page.goto(pantalla)
      const texto = (await page.locator('body').innerText()).toLowerCase()

      // El nombre de la clinica de al lado.
      expect(texto, `${pantalla} ensena el nombre de la clinica A`).not.toContain(
        'clinica de prueba a',
      )
      // Su paciente.
      expect(texto, `${pantalla} ensena un paciente de A`).not.toContain('+34600111222')
      // Su FAQ publica: que sea publica no la hace publica PARA OTRA CLINICA.
      expect(texto, `${pantalla} ensena la FAQ de A`).not.toContain('en la calle mayor 1')
      // Y el marcador de lo confidencial, que no debe salir en ningun sitio.
      expect(texto, `${pantalla} ensena el marcador de A`).not.toContain(MARCADOR.toLowerCase())
      // Ni su identificador, por si algo lo pintara en un atributo.
      const html = await page.content()
      expect(html, `${pantalla} lleva el id de la clinica A en el HTML`).not.toContain(a.clinicaId)
    }
  })

  test('y pedir una ficha de A por su URL no la ensena: da 404', async ({ page }) => {
    // El caso que no se ve navegando: alguien copia un enlace. La RLS no
    // devuelve la fila, `leerFicha` devuelve null y la pagina responde 404. No
    // se ensena «no tienes permiso», que ya seria confirmar que existe.
    const a = await filasDe('rls-prueba-a')
    const paciente = a.pacientes[0]!

    await entrarComo(page, 'bPropietario')
    const respuesta = await page.goto(`/panel/fichas/${paciente.id}`)

    expect(respuesta?.status()).toBe(404)
    await expect(page.locator('body')).not.toContainText(paciente.telefono_e164)
  })

  test('y el panel de A si ve lo suyo: la prueba de arriba no pasa por estar todo vacio', async ({
    page,
  }) => {
    // La pareja imprescindible. Sin esto, un panel que no ensenara nunca nada
    // —o que reventara al cargar— dejaria las dos pruebas de arriba en verde.
    await entrarComo(page, 'aPropietario')

    await page.goto('/panel/conocimiento')
    await expect(page.locator('body')).toContainText('En la calle Mayor 1.')

    await page.goto('/panel/fichas')
    await expect(page.locator('body')).toContainText('+34600111222')
  })

  test('A si ve SU fila confidencial: el panel no es el bot', async ({ page }) => {
    // El marcador NO debe llegarle nunca al modelo, y por eso existe la
    // barandilla 1. Pero la clinica tiene que verlo en su propio panel: si no,
    // no podria decidir si lo aprueba. Es exactamente la diferencia entre el
    // rol `clinica` y el rol `bot` en la RLS de F1, y conviene tenerla escrita
    // en una prueba para que nadie la «arregle».
    await entrarComo(page, 'aPropietario')
    await page.goto('/panel/conocimiento')

    await expect(page.locator('body')).toContainText(MARCADOR)
  })
})
