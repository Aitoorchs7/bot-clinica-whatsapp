import { expect, test } from '@playwright/test'

import { cargarDatosDelPrompt } from '@/lib/barandillas/filtro'
import { montarPromptDeDatos } from '@/lib/barandillas/montaje'

import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { HAY_BASE_DE_DATOS, MARCADOR } from '../ayuda/entorno'

import { devolverPublico, entrarComo, filasDe } from './ayuda'

/**
 * EL TOGGLE DE VERDAD. La barandilla 1, medida de punta a punta.
 *
 * ================== QUE SE COMPRUEBA Y QUE NO SERVIRIA ==================
 *
 * Comprobar que la columna `publico` cambia de valor NO ES PROBAR NADA: eso es
 * comprobar que un `update` actualiza. Lo que tiene que quedar demostrado es la
 * cadena entera:
 *
 *   una persona de recepcion pulsa un boton en una pantalla
 *        -> la fila deja de existir PARA EL ROL DEL BOT
 *             -> y el texto desaparece DEL PROMPT MONTADO que ve el modelo
 *
 * Por eso el final de cada prueba no mira la base: monta el prompt con el
 * cliente del bot —el mismo de produccion, `bot.ts`, con su JWT firmado— y
 * busca el texto dentro. Si la RLS cediera, el texto seguiria ahi y esto se
 * pondria rojo aunque la columna dijera `false`.
 *
 * Comprobado tambien por el otro lado: se dejo el interruptor sin efecto sobre
 * la consulta del bot y esta prueba se puso roja. La salida esta pegada en
 * ESTADO_F5 §5.3.
 */

test.skip(!HAY_BASE_DE_DATOS, 'Sin Supabase de desarrollo no hay panel que probar')

/** El prompt tal y como lo vera el modelo, montado ahora mismo. */
async function promptDelBot(clinicaId: string): Promise<string> {
  const datos = await cargarDatosDelPrompt(clinicaId, clienteBot(clinicaId))
  return montarPromptDeDatos(datos).texto
}

test.describe('apagar el interruptor', () => {
  test('APAGAR UNA FAQ DESDE EL PANEL LA BORRA DEL PROMPT DEL BOT', async ({ page }) => {
    const a = await filasDe('rls-prueba-a')
    const publica = a.faq.find((f) => f.pregunta === '¿Donde estais?')!

    // Restauracion atada al `finally`, como manda ESTADO_F1 §5.1: si la prueba
    // revienta por la mitad, el interruptor vuelve a su sitio igual.
    try {
      // 1 · De partida, el asistente lo dice.
      expect(
        await promptDelBot(a.clinicaId),
        'El fixture no arranca como esta prueba da por hecho',
      ).toContain('En la calle Mayor 1.')

      // 2 · Recepcion lo apaga desde la pantalla. Un clic, como la clinica.
      await entrarComo(page, 'aRecepcion')
      await page.goto('/panel/conocimiento')

      const fila = page.locator('li', { hasText: '¿Donde estais?' }).first()
      await expect(fila.locator('[data-prueba="estado-publico"]')).toHaveAttribute(
        'data-publico',
        'si',
      )
      await fila.locator('[data-prueba="apagar-publico"]').click()

      // 3 · La pantalla lo confirma con sus palabras, no con las nuestras.
      await expect(fila.locator('[data-prueba="estado-publico"]')).toHaveAttribute(
        'data-publico',
        'no',
        { timeout: 15_000 },
      )
      await expect(fila).toContainText('Solo para el equipo')

      // 4 · Y AQUI ESTA LA PRUEBA: el prompt del modelo, montado de nuevo.
      const despues = await promptDelBot(a.clinicaId)
      expect(
        despues,
        'La columna habra cambiado, pero el texto sigue llegando al modelo: eso es tener el ' +
          'interruptor sin conectar a nada.',
      ).not.toContain('En la calle Mayor 1.')
    } finally {
      await devolverPublico(publica.id, true)
    }
  })

  test('y el asistente vuelve a decirlo en cuanto se enciende', async ({ page }) => {
    // La otra mitad del par. Sin ella, la prueba de arriba seguiria verde con
    // un montador que devolviera siempre una cadena vacia, o con la FAQ
    // borrada del fixture.
    const a = await filasDe('rls-prueba-a')
    const publica = a.faq.find((f) => f.pregunta === '¿Donde estais?')!

    try {
      await devolverPublico(publica.id, false)
      expect(await promptDelBot(a.clinicaId)).not.toContain('En la calle Mayor 1.')

      await entrarComo(page, 'aRecepcion')
      await page.goto('/panel/conocimiento')

      const fila = page.locator('li', { hasText: '¿Donde estais?' }).first()
      await fila.locator('[data-prueba="encender-publico"]').click()
      await fila.locator('[data-prueba="confirmar-si"]').click()

      await expect(fila.locator('[data-prueba="estado-publico"]')).toHaveAttribute(
        'data-publico',
        'si',
        { timeout: 15_000 },
      )

      expect(await promptDelBot(a.clinicaId)).toContain('En la calle Mayor 1.')
    } finally {
      await devolverPublico(publica.id, true)
    }
  })
})

test.describe('encender es la accion peligrosa, y se pregunta', () => {
  test('LA CONFIRMACION ENSENA EL TEXTO EXACTO, palabra por palabra', async ({ page }) => {
    const a = await filasDe('rls-prueba-a')
    const confidencial = a.faq.find((f) => f.respuesta_aprobada.includes(MARCADOR))!

    await entrarComo(page, 'aRecepcion')
    await page.goto('/panel/conocimiento')

    const fila = page.locator('li', { hasText: confidencial.pregunta }).first()
    await fila.locator('[data-prueba="encender-publico"]').click()

    const aviso = fila.locator('[data-prueba="confirmar-encender"]')
    await expect(aviso).toBeVisible()

    // El texto que se ensena es EL DE LA BASE, caracter a caracter. Un resumen
    // o un recorte convertirian la confirmacion en un tramite: se aprobaria
    // una cosa y se diria otra.
    await expect(aviso.locator('[data-prueba="texto-exacto"]')).toHaveText(
      confidencial.respuesta_aprobada,
    )
    await expect(aviso).toContainText('¿Seguro que quieres que el asistente pueda decirle esto')
  })

  test('decir «ahora no» no cambia nada, ni en la base ni en el prompt', async ({ page }) => {
    const a = await filasDe('rls-prueba-a')
    const confidencial = a.faq.find((f) => f.respuesta_aprobada.includes(MARCADOR))!

    await entrarComo(page, 'aRecepcion')
    await page.goto('/panel/conocimiento')

    const fila = page.locator('li', { hasText: confidencial.pregunta }).first()
    await fila.locator('[data-prueba="encender-publico"]').click()
    await fila.locator('[data-prueba="confirmar-no"]').click()

    await expect(fila.locator('[data-prueba="confirmar-encender"]')).toHaveCount(0)
    await expect(fila.locator('[data-prueba="estado-publico"]')).toHaveAttribute(
      'data-publico',
      'no',
    )

    // Y el marcador sigue sin llegarle al modelo, que es lo que importa.
    expect(await promptDelBot(a.clinicaId)).not.toContain(MARCADOR)
  })

  test('apagar NO pregunta: no es simetrico a proposito', async ({ page }) => {
    // Apagar quita algo de la boca del asistente; encender se lo pone. Pedir
    // confirmacion para las dos cosas ensena a darle a «aceptar» sin leer, y
    // entonces se pierde la que de verdad importa.
    const a = await filasDe('rls-prueba-a')
    const publica = a.faq.find((f) => f.pregunta === '¿Donde estais?')!

    try {
      await entrarComo(page, 'aRecepcion')
      await page.goto('/panel/conocimiento')

      const fila = page.locator('li', { hasText: '¿Donde estais?' }).first()
      await fila.locator('[data-prueba="apagar-publico"]').click()

      await expect(fila.locator('[data-prueba="confirmar-encender"]')).toHaveCount(0)
      await expect(fila.locator('[data-prueba="estado-publico"]')).toHaveAttribute(
        'data-publico',
        'no',
        { timeout: 15_000 },
      )
    } finally {
      await devolverPublico(publica.id, true)
    }
  })
})

test.describe('el rastro', () => {
  test('queda escrito quien lo movio, cuando, y SIN copiar el contenido', async ({ page }) => {
    const a = await filasDe('rls-prueba-a')
    const publica = a.faq.find((f) => f.pregunta === '¿Donde estais?')!
    const db = clienteServicio()

    try {
      const antes = new Date().toISOString()

      await entrarComo(page, 'aRecepcion')
      await page.goto('/panel/conocimiento')
      const fila = page.locator('li', { hasText: '¿Donde estais?' }).first()
      await fila.locator('[data-prueba="apagar-publico"]').click()
      await expect(fila.locator('[data-prueba="estado-publico"]')).toHaveAttribute(
        'data-publico',
        'no',
        { timeout: 15_000 },
      )

      const { data } = await db
        .from('auditoria')
        .select('*')
        .eq('fila_id', publica.id)
        .gte('creado_en', antes)

      const apuntes = data ?? []
      expect(apuntes, 'No ha quedado rastro de un cambio en lo que el bot puede decir').toHaveLength(
        1,
      )

      const apunte = apuntes[0] as {
        actor: string
        accion: string
        tabla: string
        datos: unknown
      }
      expect(apunte.accion).toBe('publico_apagado')
      expect(apunte.tabla).toBe('faq')
      expect(apunte.datos).toEqual({ antes: true, despues: false })

      // El actor es el uuid del usuario con sesion, y lo clava el WITH CHECK
      // de la migracion 008: nadie puede firmar un cambio con el nombre de
      // otro.
      const usuarios = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const recepcion = usuarios.data.users.find(
        (u) => u.email === 'rls-a-recepcion@ejemplo.test',
      )!
      expect(apunte.actor).toBe(recepcion.id)

      // Y NO lleva el contenido dentro. `auditoria` no la purga el job de los
      // 90 dias: lo que se escriba aqui se queda para siempre, asi que se
      // nombra la fila y no se copia lo que dice.
      const entero = JSON.stringify(apunte)
      expect(entero).not.toContain('En la calle Mayor 1.')
      expect(entero).not.toContain(MARCADOR)
    } finally {
      await devolverPublico(publica.id, true)
    }
  })
})
