import { expect, test } from '@playwright/test'

import { HAY_BASE_DE_DATOS } from '../ayuda/entorno'

import { entrarComo } from './ayuda'

/**
 * El rol `lectura`, por el lado de la pantalla.
 *
 * ESTA ES SOLO UNA MITAD, Y HAY QUE DECIRLO EN VOZ ALTA
 *
 * Lo de aqui comprueba que a `lectura` no se le ensenan los controles de
 * escritura. Eso es COMODIDAD: sirve para no ofrecerle algo que la base le va a
 * negar. No es ninguna garantia, porque quien sepa mandar un POST no pasa por
 * el boton.
 *
 * La otra mitad —que la base de datos le dice que no— vive en
 * `tests/panel-vivo/01-roles-y-aislamiento.test.ts`, corre sin navegador y es
 * la que de verdad protege. Las dos juntas son el mismo par que ESTADO_F3 §5.2:
 * una prueba que solo dice «no se ve el boton» se quedaria verde con la RLS
 * abierta de par en par.
 */

test.skip(!HAY_BASE_DE_DATOS, 'Sin Supabase de desarrollo no hay panel que probar')

test.describe('el rol lectura no ve ningun control de escritura', () => {
  test('en la pantalla del interruptor no hay ni un boton', async ({ page }) => {
    await entrarComo(page, 'aLectura')
    await page.goto('/panel/conocimiento')

    // Ve el estado de cada fila...
    await expect(page.locator('[data-prueba="estado-publico"]').first()).toBeVisible()

    // ...y ni un solo control para moverlo.
    await expect(page.locator('[data-prueba="encender-publico"]')).toHaveCount(0)
    await expect(page.locator('[data-prueba="apagar-publico"]')).toHaveCount(0)

    // Y se le dice por que, en vez de dejarle buscando el boton.
    await expect(page.locator('[data-prueba="aviso-solo-lectura"]')).toBeVisible()
  })

  test('en la agenda tampoco puede mover ni cancelar', async ({ page }) => {
    await entrarComo(page, 'aLectura')
    await page.goto('/panel?vista=semana')

    await expect(page.locator('[data-prueba="acciones-cita"]')).toHaveCount(0)
    await expect(page.locator('[data-prueba="mover-cita"]')).toHaveCount(0)
  })

  test('en la cola de avisos tampoco', async ({ page }) => {
    await entrarComo(page, 'aLectura')
    await page.goto('/panel/escalados')

    await expect(page.locator('[data-prueba="acciones-escalado"]')).toHaveCount(0)
  })

  test('en una ficha ve los datos de contacto pero no puede editarlos', async ({ page }) => {
    await entrarComo(page, 'aLectura')
    await page.goto('/panel/fichas')
    await page.click('table a >> nth=0')

    // ESPERAR A LA FICHA ANTES DE MIRAR NADA.
    //
    // Sin esta linea, esta prueba era un falso verde y se pillo midiendo: al
    // abrirle la mano al rol `lectura` a proposito —para ver la bateria en
    // rojo— las otras tres se pusieron rojas y esta siguio en verde. Estaba
    // comprobando que no habia formulario de contacto... en la LISTA de
    // pacientes, donde no lo hay nunca, porque la aserción corria antes de que
    // terminara la navegacion. Es la trampa de ESTADO_F1 §5.2 otra vez: verde
    // por ausencia, no por permiso.
    await page.waitForURL(/\/panel\/fichas\/[0-9a-f-]{36}/)
    await expect(page.locator('body')).toContainText('+34600111222')

    await expect(page.locator('[data-prueba="contacto-editable"]')).toHaveCount(0)
  })

  test('pero SI lo ve todo: no es un panel recortado, es un panel sin botones', async ({
    page,
  }) => {
    // Sin esta prueba, las cuatro de arriba seguirian verdes con un panel que
    // no ensenara nada, o que se cayera con el rol `lectura`. Lo que se le
    // quita son los botones, no la informacion.
    await entrarComo(page, 'aLectura')

    await page.goto('/panel/conocimiento')
    await expect(page.locator('body')).toContainText('¿Donde estais?')
    await expect(page.locator('body')).toContainText('En la calle Mayor 1.')

    await page.goto('/panel/observabilidad')
    await expect(page.locator('body')).toContainText('Lo que ve el asistente')
  })
})

test.describe('recepcion si los ve', () => {
  test('la misma pantalla, con los controles puestos', async ({ page }) => {
    // La pareja de todo lo de arriba. Si el panel no ensenara NUNCA los
    // controles —por un fallo tonto en el componente, por ejemplo— las cinco
    // pruebas anteriores seguirian verdes y no habrian comprobado nada.
    await entrarComo(page, 'aRecepcion')
    await page.goto('/panel/conocimiento')

    const controles = page.locator(
      '[data-prueba="encender-publico"], [data-prueba="apagar-publico"]',
    )
    expect(await controles.count()).toBeGreaterThan(0)
    await expect(page.locator('[data-prueba="aviso-solo-lectura"]')).toHaveCount(0)
  })
})
