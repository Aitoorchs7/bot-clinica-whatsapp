/**
 * La salud de las clinicas contra Supabase DE VERDAD (desarrollo).
 *
 * Nivel 2. Lo que el nivel 1 (`tests/cron/03-clinicas`) no puede saber:
 *
 *   - Que contesta Supabase HOY a un token firmado con un secreto equivocado.
 *     Es el punto 2 de F9 en pequeño: el mismo camino que, en produccion, dira
 *     si el `SUPABASE_JWT_SECRET` de Vercel es el bueno.
 *   - Que la ruta entera —cerrojo, mapa del entorno, cliente del bot, y
 *     `exigirClinicaDelCanal`— dice «al dia» cuando lo esta.
 *
 * No escribe nada: solo lee, con el cliente del bot. Romper el secreto y
 * restaurarlo va en la misma prueba (`vi.stubEnv` y `afterEach`), y la cache de
 * tokens se vacia en los dos sentidos: con un token bueno guardado, el secreto
 * malo no llegaria a usarse y la prueba saldria verde por no haber mirado.
 */
import { randomUUID } from 'node:crypto'

import { afterEach, beforeAll, expect, it, vi } from 'vitest'

import { vaciarCacheDeTokens } from '@/lib/supabase/bot'
import { codigoHttpDeLaSalud, comprobarLasClinicas } from '@/lib/trabajos/clinicas'
import { olvidarMapa } from '@/lib/whatsapp/config'

import { describeVivo, sembrado } from '../ayuda/vivo'
import type { Sembrado } from '../ayuda/siembra'

describeVivo('la salud de las clinicas, contra Supabase', () => {
  let s: Sembrado

  beforeAll(() => {
    s = sembrado()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vaciarCacheDeTokens()
    olvidarMapa()
  })

  it('la clinica A con su numero: atiende, y el token del bot queda ACEPTADO', async () => {
    const salud = await comprobarLasClinicas({ mapa: () => ({ [s.numeroWaA]: s.clinicaA }) })

    expect(salud.clinicas).toEqual([
      { phoneNumberId: s.numeroWaA, clinicaId: s.clinicaA, veredicto: 'atiende' },
    ])
    expect(salud.estado).toBe('al_dia')
    expect(codigoHttpDeLaSalud(salud)).toBe(200)
  })

  it('con un secreto JWT equivocado: token_rechazado, HTTP 401', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', 'un-secreto-que-no-es-el-del-proyecto-de-desarrollo-f9')
    vaciarCacheDeTokens()

    const salud = await comprobarLasClinicas({ mapa: () => ({ [s.numeroWaA]: s.clinicaA }) })

    expect(salud.clinicas[0]).toMatchObject({ veredicto: 'token_rechazado', http: 401 })
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
    // Lo que dice Supabase hoy, escrito, para que el dia que cambie se note.
    console.info(`  Supabase, a un token firmado con otro secreto: ${salud.clinicas[0]?.detalle}`)
  })

  it('sin secreto JWT: mal_configurado, y no «inestable» aunque supabase-js diga status 0', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', '')
    vaciarCacheDeTokens()

    const salud = await comprobarLasClinicas({ mapa: () => ({ [s.numeroWaA]: s.clinicaA }) })

    expect(salud.clinicas[0]?.veredicto).toBe('mal_configurado')
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
  })

  it('LA CLINICA FANTASMA: un clinica_id que no existe. Token valido, cero filas, y rojo', async () => {
    const salud = await comprobarLasClinicas({ mapa: () => ({ [s.numeroWaA]: randomUUID() }) })

    expect(salud.clinicas[0]?.veredicto).toBe('no_atiende')
    expect(salud.clinicas[0]?.detalle).toMatch(/ha visto 0 clinicas/)
    expect(salud.estado).toBe('roto')
  })

  it('el numero de la B con la identidad de la A: no atiende', async () => {
    const salud = await comprobarLasClinicas({ mapa: () => ({ [s.numeroWaB]: s.clinicaA }) })

    expect(salud.clinicas[0]?.veredicto).toBe('no_atiende')
    expect(salud.clinicas[0]?.detalle).toContain(`wa_phone_number_id es ${s.numeroWaA}`)
  })

  it('LA RUTA ENTERA: cerrojo, WHATSAPP_CLINICAS del entorno y cliente del bot -> 200 y al_dia', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-de-cron-de-prueba-f9')
    vi.stubEnv('WHATSAPP_CLINICAS', JSON.stringify({ [s.numeroWaA]: s.clinicaA }))
    olvidarMapa()

    const { GET } = await import('@/app/api/cron/clinicas/route')
    const respuesta = await GET(
      new Request('https://ejemplo.test/api/cron/clinicas', {
        headers: { authorization: 'Bearer secreto-de-cron-de-prueba-f9' },
      }),
    )
    const cuerpo = (await respuesta.json()) as { estado: string; supabase: string }

    expect(respuesta.status).toBe(200)
    expect(cuerpo.estado).toBe('al_dia')
    // A que Supabase apunta el despliegue. En produccion es la pregunta que
    // desde fuera no se puede contestar (ESTADO_F9 §3.5).
    expect(cuerpo.supabase).toBe(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname)
  })
})
