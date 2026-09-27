import { expect, test } from '@playwright/test'

import { clienteServicio } from '../ayuda/clientes'
import { HAY_BASE_DE_DATOS } from '../ayuda/entorno'

import { entrarComo, filasDe } from './ayuda'

/**
 * La cola de avisos, de punta a punta.
 *
 * LO QUE SE COMPRUEBA AQUI Y NO SE COMPRUEBA EN NINGUN OTRO SITIO
 *
 * 1. Que el enlace del aviso ABRE LA CONVERSACION QUE LO DISPARO, siguiendo
 *    `mensaje_id`. Ese puntero lo puso F4 y su prueba exige que apunte al
 *    mensaje correcto, no simplemente que no sea nulo (ESTADO_F4 §5.1). Aqui se
 *    comprueba lo que hace con el la persona que abre el panel: que llega al
 *    hilo y que el mensaje esta ahi.
 *
 * 2. Que resolver un aviso deja escrito QUIEN lo resolvio. `resuelto_por` sale
 *    de la sesion, nunca del formulario: si viniera de fuera, la cola diria que
 *    lo resolvio quien dijera el navegador.
 */

test.skip(!HAY_BASE_DE_DATOS, 'Sin Supabase de desarrollo no hay panel que probar')

test.describe('desde el aviso se llega a lo que escribio el paciente', () => {
  test('el enlace abre la conversacion y cae en el mensaje que lo disparo', async ({ page }) => {
    const db = clienteServicio()
    const a = await filasDe('rls-prueba-a')

    const { data } = await db
      .from('escalados')
      .select('id, mensaje_id, conversacion_id')
      .eq('clinica_id', a.clinicaId)
    const aviso = (data ?? [])[0] as { mensaje_id: number; conversacion_id: string }

    expect(aviso, 'El fixture no tiene ningun aviso sembrado').toBeTruthy()
    expect(
      aviso.mensaje_id,
      'El aviso sembrado no apunta a ningun mensaje: sin eso esta prueba no comprueba nada',
    ).not.toBeNull()

    await entrarComo(page, 'aRecepcion')
    await page.goto('/panel/escalados')
    await page.locator('[data-prueba="abrir-conversacion"]').first().click()

    // Cae en la conversacion correcta...
    await page.waitForURL(new RegExp(`/panel/conversaciones/${aviso.conversacion_id}`))
    // ...y con el ancla del mensaje exacto, no al principio del hilo.
    expect(page.url()).toContain(`#mensaje-${aviso.mensaje_id}`)

    // Y el mensaje del paciente esta ahi, con su texto.
    await expect(page.locator(`#mensaje-${aviso.mensaje_id}`)).toBeVisible()
    await expect(page.locator(`#mensaje-${aviso.mensaje_id}`)).toContainText(
      'Hola, queria pedir cita',
    )
  })
})

test.describe('pendiente -> en curso -> resuelto', () => {
  test('y queda escrito QUIEN lo resolvio', async ({ page }) => {
    const db = clienteServicio()
    const a = await filasDe('rls-prueba-a')

    const { data } = await db.from('escalados').select('id, estado').eq('clinica_id', a.clinicaId)
    const aviso = (data ?? [])[0] as { id: string; estado: string }

    try {
      await entrarComo(page, 'aRecepcion')
      await page.goto('/panel/escalados')

      const fila = page.locator('tr', { hasText: 'Pidió hablar con una persona' }).first()
      await fila.getByRole('button', { name: 'Me ocupo' }).click()
      await expect(fila).toContainText('En curso', { timeout: 15_000 })

      await fila.getByRole('button', { name: 'Resuelto' }).click()

      // ESPERAR A ALGO QUE SOLO EXISTE CUANDO EL CAMBIO YA ESTA HECHO.
      //
      // Aqui habia un `toContainText('Resuelto')` sobre el cuerpo de la
      // pagina, y pasaba al instante: «Resuelto» es tambien el rotulo del
      // boton que se acababa de pulsar, asi que la espera se cumplia sin que
      // hubiera pasado nada y la lectura de la base corria antes que la
      // escritura. El boton «Volver a abrir» solo se pinta cuando el aviso ya
      // esta resuelto, asi que esperar por el si significa algo.
      await expect(page.getByRole('button', { name: 'Volver a abrir' })).toBeVisible({
        timeout: 15_000,
      })

      const despues = await db
        .from('escalados')
        .select('estado, resuelto_por, resuelto_en')
        .eq('id', aviso.id)
        .single()

      const fin = despues.data as {
        estado: string
        resuelto_por: string | null
        resuelto_en: string | null
      }
      expect(fin.estado).toBe('resuelto')
      expect(fin.resuelto_en).not.toBeNull()

      // El uuid de quien tenia la sesion, no uno cualquiera: si `resuelto_por`
      // viniera del formulario, la cola podria decir que lo cerro otra persona.
      const usuarios = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const recepcion = usuarios.data.users.find((u) => u.email === 'rls-a-recepcion@ejemplo.test')!
      expect(fin.resuelto_por).toBe(recepcion.id)
    } finally {
      // Restauracion atada, como manda ESTADO_F1 §5.1.
      await db
        .from('escalados')
        .update({ estado: aviso.estado, resuelto_por: null, resuelto_en: null })
        .eq('id', aviso.id)
    }
  })
})
