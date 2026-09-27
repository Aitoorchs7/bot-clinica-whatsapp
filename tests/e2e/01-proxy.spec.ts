import { expect, test } from '@playwright/test'

import { HAY_BASE_DE_DATOS } from '../ayuda/entorno'

import { entrarComo } from './ayuda'

/**
 * LA PRUEBA QUE IMPIDE QUE ESTA FASE ENTREGUE UN PANEL PUBLICO.
 *
 * ========================= POR QUE NO BASTA CON MIRAR LA REDIRECCION =========
 *
 * El panel se protege por dos sitios: `proxy.ts` y, ademas, el propio
 * `layout.tsx` del panel, que vuelve a exigir sesion. Eso esta bien —el doc de
 * Next recomienda no fiarlo todo al proxy— pero tiene una consecuencia
 * incomoda para esta prueba: LAS DOS REDIRIGEN IGUAL. Una prueba que solo
 * comprobara «pedir /panel sin sesion acaba en /entrar» seguiria verde con
 * `proxy.ts` renombrado a `middleware.ts`, es decir, con el guardian apagado.
 *
 * Por eso la aserción que de verdad manda es la de la CABECERA
 * `x-panel-guardia`, que solo puede poner `proxy.ts`.
 *
 * ================ SE MIDIO, Y NO SALIO LO QUE SE ESPERABA ================
 *
 * El encargo de F5 pedia comprobar que renombrando `proxy.ts` a
 * `middleware.ts` esto se ponia rojo. Se hizo, y NO se puso: en Next.js 16.3.5
 * el convenio viejo esta deprecado pero SIGUE EJECUTANDOSE, con un aviso en el
 * arranque. Quien caza ese renombrado hoy es
 * `tests/panel/02-proxy-en-su-sitio.test.ts`, que se pone rojo en cinco sitios.
 *
 * Lo que si quedo medido aqui es lo que de verdad importa: SIN NINGUN
 * GUARDIAN, diez de estas trece pruebas se ponen rojas... y la primera,
 * «pedir /panel sin sesion acaba en /entrar», SE QUEDA VERDE, porque redirige
 * el layout. Eso es exactamente lo que la cabecera viene a distinguir, y es la
 * razon por la que esta prueba no se escribio mirando solo la redireccion.
 *
 * Las dos salidas, en ESTADO_F5 §5.1.
 */

test.skip(!HAY_BASE_DE_DATOS, 'Sin Supabase de desarrollo no hay panel que probar')

const RUTAS_DEL_PANEL = [
  '/panel',
  '/panel/escalados',
  '/panel/conversaciones',
  '/panel/fichas',
  '/panel/conocimiento',
  '/panel/observabilidad',
]

test.describe('sin sesion no se entra al panel', () => {
  test('pedir /panel sin sesion acaba en /entrar', async ({ page }) => {
    await page.goto('/panel')

    await expect(page).toHaveURL(/\/entrar/)
    await expect(page.locator('input[name="correo"]')).toBeVisible()

    // Y no se ha colado nada del panel por el camino. El nombre de la clinica
    // es el primer dato que sale en su armazon.
    await expect(page.locator('body')).not.toContainText('Clinica de prueba A')
  })

  test('LA MARCA: la redireccion la hace proxy.ts, no el layout', async ({ request }) => {
    const respuesta = await request.get('/panel', { maxRedirects: 0 })

    expect(respuesta.status(), 'tiene que ser una redireccion, no un 200').toBe(307)
    expect(respuesta.headers()['location']).toContain('/entrar')

    expect(
      respuesta.headers()['x-panel-guardia'],
      'Esta cabecera solo la pone src/proxy.ts. Si falta, quien ha redirigido es el layout del ' +
        'panel y el guardian de delante NO esta corriendo: comprueba que src/proxy.ts existe, ' +
        'que exporta una funcion llamada `proxy` y que su matcher coge /panel.',
    ).toBe('proxy')
  })

  test.describe('y no hay ninguna puerta de atras', () => {
    for (const ruta of RUTAS_DEL_PANEL) {
      test(`${ruta} redirige y lleva la marca del proxy`, async ({ request }) => {
        const respuesta = await request.get(ruta, { maxRedirects: 0 })
        expect(respuesta.status()).toBe(307)
        expect(respuesta.headers()['location']).toContain('/entrar')
        expect(respuesta.headers()['x-panel-guardia']).toBe('proxy')
      })
    }
  })

  test('se recuerda a donde iba, y solo si es del panel', async ({ request }) => {
    const dentro = await request.get('/panel/escalados', { maxRedirects: 0 })
    expect(dentro.headers()['location']).toContain('desde=%2Fpanel%2Fescalados')
  })
})

test.describe('con sesion', () => {
  test('el proxy sigue corriendo, y ahora deja pasar', async ({ page }) => {
    await entrarComo(page, 'aPropietario')

    // La misma cabecera en una respuesta que SI pasa. Es la pareja de la
    // prueba de arriba: sin esta, «la cabecera esta en la redireccion»
    // seguiria verde con un proxy que redirigiera absolutamente todo.
    const respuesta = await page.request.get('/panel', { maxRedirects: 0 })
    expect(respuesta.status()).toBe(200)
    expect(respuesta.headers()['x-panel-guardia']).toBe('proxy')

    await expect(page.locator('body')).toContainText('Clinica de prueba A')
  })

  test('/entrar con sesion no ensena el formulario otra vez', async ({ page }) => {
    await entrarComo(page, 'aPropietario')
    await page.goto('/entrar')
    await expect(page).toHaveURL(/\/panel/)
  })

  test('salir devuelve a la puerta, y el panel vuelve a estar cerrado', async ({ page }) => {
    await entrarComo(page, 'aRecepcion')
    await page.click('button:has-text("Salir")')
    await expect(page).toHaveURL(/\/entrar/)

    await page.goto('/panel')
    await expect(page).toHaveURL(/\/entrar/)
  })
})

test.describe('lo que el proxy NO debe tocar', () => {
  test('el webhook de Meta no pasa por el guardian', async ({ request }) => {
    // Quien llama ahi es Meta, no una sesion con cookie: su autenticacion es la
    // firma HMAC y vive dentro de la ruta (F4). Si el proxy lo protegiera, el
    // canal se caeria entero y ademas fallaria de la peor forma: Meta
    // reintentando contra una redireccion.
    const respuesta = await request.get('/api/whatsapp/webhook', { maxRedirects: 0 })

    expect(respuesta.status()).not.toBe(307)
    expect(respuesta.headers()['x-panel-guardia']).toBeUndefined()
  })
})
