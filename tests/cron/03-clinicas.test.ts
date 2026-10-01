/**
 * La salud de las clinicas: que conoce el despliegue y si el bot atiende.
 *
 * Nivel 1: sin red y sin base. Corre en `comprobaciones-estaticas`.
 *
 * El doble va en la FRONTERA del SDK: sustituye al cliente de Supabase, que no
 * es nuestro. `exigirClinicaDelCanal()`, que si es nuestro y es lo que decide
 * «atiende», corre de verdad. Lo que Supabase contesta de verdad a un token
 * malo lo fija el nivel 2 (`tests/trabajos-vivo/06-clinicas`).
 *
 * Casi todo lo de aqui son formas de «no hay nada malo» que en este proyecto ya
 * han sido falsos verdes, y aqui tienen que ser rojos.
 */
import { describe, expect, it } from 'vitest'

import {
  clasificarRechazo,
  codigoHttpDeLaSalud,
  comprobarLasClinicas,
  type OpcionesDeLaSalud,
} from '@/lib/trabajos/clinicas'
import type { ClienteDelBot } from '@/lib/whatsapp/almacen'

const CLINICA = '11111111-1111-4111-8111-111111111111'
const OTRA = '22222222-2222-4222-8222-222222222222'
const NUMERO = '900000000000001'
const OTRO_NUMERO = '900000000000002'

type Respuesta = {
  data: unknown
  error: { message: string; code?: string } | null
  status: number
}

const ACEPTADO: Respuesta = { data: [], error: null, status: 200 }

function fila(id: string, numero: string | null, activa = true) {
  return {
    id,
    nombre: 'Clinica',
    telefono_recepcion: '+34910000000',
    email_avisos: 'avisos@ejemplo.test',
    zona_horaria: 'Europe/Madrid',
    wa_phone_number_id: numero,
    activa,
  }
}

/**
 * Un cliente que contesta `token` a la consulta minima (`select('id')`) y
 * `filas` a la de `exigirClinicaDelCanal`. Cuenta cuantas veces se pregunta
 * por el canal, para poder exigir que con el token rechazado ni se intente.
 */
function clienteFalso(token: Respuesta, filas: unknown[] = []) {
  const cuenta = { canal: 0 }
  const cliente = {
    from: () => ({
      select: (columnas: string) => ({
        limit: async () => {
          if (columnas === 'id') return token
          cuenta.canal += 1
          return { data: filas, error: null, status: 200 }
        },
      }),
    }),
  } as unknown as ClienteDelBot
  return { cliente, cuenta }
}

function con(mapa: Record<string, string>, clientes: Record<string, ClienteDelBot>, extra: Partial<OpcionesDeLaSalud> = {}) {
  return comprobarLasClinicas({
    mapa: () => mapa,
    cliente: (clinicaId) => {
      const c = clientes[clinicaId]
      if (!c) throw new Error(`clinica_id no es un uuid: ${JSON.stringify(clinicaId)}.`)
      return c
    },
    ...extra,
  })
}

describe('lo que no es verde aunque no haya ni un error', () => {
  it('EL MAPA VACIO: cero clinicas es un despliegue que no atiende a nadie, 500', async () => {
    const salud = await con({}, {})

    expect(salud.estado).toBe('ninguna_clinica')
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
    expect(salud.detalle).toMatch(/no atiende a ninguna clinica/)
  })

  it('LA CLINICA FANTASMA: en el mapa y no en la base. El token vale, y aun asi es rojo', async () => {
    // La RLS devuelve cero filas y la consulta 1 sale limpia. La pilla la 2.
    const { cliente } = clienteFalso(ACEPTADO, [])
    const salud = await con({ [NUMERO]: CLINICA }, { [CLINICA]: cliente })

    expect(salud.clinicas[0]?.veredicto).toBe('no_atiende')
    expect(salud.clinicas[0]?.detalle).toMatch(/ha visto 0 clinicas/)
    expect(salud.estado).toBe('roto')
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
  })

  it('UNA MALA ENTRE BUENAS: el estado es el de la peor, y la buena sigue diciendo que atiende', async () => {
    const buena = clienteFalso(ACEPTADO, [fila(CLINICA, NUMERO)])
    const fantasma = clienteFalso(ACEPTADO, [])
    const salud = await con(
      { [NUMERO]: CLINICA, [OTRO_NUMERO]: OTRA },
      { [CLINICA]: buena.cliente, [OTRA]: fantasma.cliente },
    )

    expect(salud.clinicas.map((c) => c.veredicto)).toEqual(['atiende', 'no_atiende'])
    expect(salud.estado).toBe('roto')
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
  })
})

describe('cada clinica', () => {
  it('LA PAREJA: fila, numero y clinica activa -> atiende, y 200', async () => {
    // Sin esta, una comprobacion que dijera «roto» siempre pasaria todo lo
    // de arriba.
    const { cliente } = clienteFalso(ACEPTADO, [fila(CLINICA, NUMERO)])
    const salud = await con({ [NUMERO]: CLINICA }, { [CLINICA]: cliente })

    expect(salud.clinicas).toEqual([{ phoneNumberId: NUMERO, clinicaId: CLINICA, veredicto: 'atiende' }])
    expect(salud.estado).toBe('al_dia')
    expect(codigoHttpDeLaSalud(salud)).toBe(200)
  })

  it('token rechazado (401 · PGRST301): se dice asi, y el canal ni se intenta', async () => {
    const { cliente, cuenta } = clienteFalso({
      data: null,
      error: { message: 'No suitable key or wrong key type', code: 'PGRST301' },
      status: 401,
    })
    const salud = await con({ [NUMERO]: CLINICA }, { [CLINICA]: cliente })

    expect(salud.clinicas[0]).toMatchObject({
      veredicto: 'token_rechazado',
      http: 401,
      detalle: 'No suitable key or wrong key type',
    })
    expect(cuenta.canal).toBe(0)
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
  })

  it('el numero del mapa no es el de la fila: no atiende, y dice cual es cual', async () => {
    const { cliente } = clienteFalso(ACEPTADO, [fila(CLINICA, OTRO_NUMERO)])
    const salud = await con({ [NUMERO]: CLINICA }, { [CLINICA]: cliente })

    expect(salud.clinicas[0]?.veredicto).toBe('no_atiende')
    expect(salud.clinicas[0]?.detalle).toContain(`wa_phone_number_id es ${OTRO_NUMERO}`)
  })

  it('una clinica dada de baja: no atiende', async () => {
    const { cliente } = clienteFalso(ACEPTADO, [fila(CLINICA, NUMERO, false)])
    const salud = await con({ [NUMERO]: CLINICA }, { [CLINICA]: cliente })

    expect(salud.clinicas[0]?.veredicto).toBe('no_atiende')
  })

  it('la red caida es «inestable» y 503: vuelve a mirar luego', async () => {
    const { cliente } = clienteFalso({
      data: null,
      error: { message: 'TypeError: fetch failed', code: '' },
      status: 0,
    })
    const salud = await con({ [NUMERO]: CLINICA }, { [CLINICA]: cliente })

    expect(salud.clinicas[0]?.veredicto).toBe('inestable')
    expect(salud.estado).toBe('inestable')
    expect(codigoHttpDeLaSalud(salud)).toBe(503)
  })

  it('SIN SECRETO NO ES RED: supabase-js lo devuelve como status 0, y aun asi es mal_configurado y 500', async () => {
    // Es la trampa de la fila de arriba: el mismo status 0 significa «vuelve
    // luego» o «esto no se arregla nunca», segun el mensaje.
    const { cliente } = clienteFalso({
      data: null,
      error: {
        message: 'Error: Falta la variable de entorno SUPABASE_JWT_SECRET. Mira .env.example.',
        code: '',
      },
      status: 0,
    })
    const salud = await con({ [NUMERO]: CLINICA }, { [CLINICA]: cliente })

    expect(salud.clinicas[0]?.veredicto).toBe('mal_configurado')
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
  })

  it('un clinica_id que no es un uuid: mal_configurado, sin llegar a Supabase', async () => {
    const salud = await con({ [NUMERO]: 'no-es-un-uuid' }, {})

    expect(salud.clinicas[0]?.veredicto).toBe('mal_configurado')
    expect(salud.clinicas[0]?.detalle).toMatch(/no es un uuid/)
  })

  it('sin WHATSAPP_CLINICAS (o roto): sin_mapa y 500, con el porque', async () => {
    const salud = await comprobarLasClinicas({
      mapa: () => {
        throw new Error('Falta WHATSAPP_CLINICAS.')
      },
    })

    expect(salud.estado).toBe('sin_mapa')
    expect(salud.detalle).toBe('Falta WHATSAPP_CLINICAS.')
    expect(codigoHttpDeLaSalud(salud)).toBe(500)
  })
})

describe('el registro', () => {
  it('lo roto sale por error, y lo que esta al dia por info: en Vercel solo se ve lo que se escribe', async () => {
    const info: string[] = []
    const error: string[] = []
    const registro = { info: (t: string) => info.push(t), error: (t: string) => error.push(t) }

    const buena = clienteFalso(ACEPTADO, [fila(CLINICA, NUMERO)])
    await con({ [NUMERO]: CLINICA }, { [CLINICA]: buena.cliente }, { registro })
    expect(error).toEqual([])
    expect(info.join('\n')).toMatch(/al_dia[\s\S]*atiende/)

    const fantasma = clienteFalso(ACEPTADO, [])
    await con({ [NUMERO]: CLINICA }, { [CLINICA]: fantasma.cliente }, { registro })
    expect(error.join('\n')).toMatch(/roto[\s\S]*no_atiende/)
  })
})

describe('clasificarRechazo', () => {
  it('los PGRST30x son del token aunque no vengan con 401', () => {
    expect(clasificarRechazo(400, 'PGRST303', 'JWT expired')).toBe('token_rechazado')
  })

  it('un 5xx es inestable; un 404 de una tabla que no existe, no atiende', () => {
    expect(clasificarRechazo(503, '', 'upstream')).toBe('inestable')
    expect(clasificarRechazo(404, 'PGRST205', "Could not find the table 'public.clinicas'")).toBe(
      'no_atiende',
    )
  })
})
