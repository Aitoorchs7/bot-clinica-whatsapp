/**
 * EL ACTA DE UN ALTA. Los cinco puntos, contra la base de verdad.
 *
 *     pnpm alta:comprobar <slug>
 *
 * ===========================================================================
 * POR QUE ESTO NO ES UN TEST DE LA SUITE, Y NO SE LLAMA `.test.ts`
 * ===========================================================================
 *
 * `pnpm test` siembra y limpia dos clinicas de prueba en el `globalSetup`. Eso
 * es correcto para la suite y es INADMISIBLE aqui: el acta se corre contra la
 * base donde acaba de nacer una clinica de verdad, que un dia sera produccion.
 * Una comprobacion que siembra clinicas de prueba y borra en cascada al
 * terminar no se acerca a produccion.
 *
 * Por eso vive bajo otro nombre (`*.comprobacion.ts`, que el `include` de
 * vitest.config.mts no coge) y corre con `vitest.alta.mts`, que NO tiene
 * globalSetup. Lo unico que escribe aqui es el canario, y se borra en el
 * mismo archivo que lo crea.
 *
 * Lo que si deja, y es correcto que lo deje: un apunte en `eventos` por cada
 * prompt montado. Eso lo hace la barandilla 2 en CADA mensaje que contesta el
 * bot, aqui y en produccion, y la purga de 90 dias se lo lleva. Borrarlo seria
 * pedirle al contador que no cuente cuando mira el acta.
 *
 * ===========================================================================
 * LO QUE COMPRUEBA, Y LO QUE NO PUEDE COMPROBAR
 * ===========================================================================
 *
 *   1 · El canal · `clinicas.wa_phone_number_id` puesto Y el par en
 *       WHATSAPP_CLINICAS, EN LOS DOS SENTIDOS. El de ida lo usa el webhook
 *       (de que clinica es este mensaje) y el de vuelta lo usan los
 *       recordatorios y la purga (desde que numero le escribo yo a ella).
 *       ⚠ Comprueba el entorno de ESTA maquina. Que la variable este en el
 *         sitio publicado y que se haya vuelto a publicar no se ve desde aqui.
 *   2 · `mensaje_urgencia`, mirado en lo que devuelve `mensajeSeguro()`.
 *   3 · `politica_privacidad`, mirada en el PROMPT MONTADO, no en la fila.
 *   4 · Los usuarios del panel, con rol y clinica_id en app_metadata.
 *   5 · Las plantillas de Meta · NO SE PUEDE COMPROBAR DESDE EL CODIGO. No hay
 *       ningun `it` verde sobre eso: esta escrito como paso manual con su
 *       comprobacion en `entregas/plantillas-meta.md`, y el resumen final del
 *       comando lo dice en voz alta.
 *
 *   Y la barandilla 4 con SUS datos: las 30 preguntas adversarias contra esta
 *   clinica, con un canario sembrado y retirado en la misma orden.
 *
 * ===========================================================================
 * POR QUE MIRA EL PROMPT Y NO LAS FILAS
 * ===========================================================================
 *
 * Una fila de `config` puede existir y no llegarle al bot: si `publico` es
 * false, la RLS no se la devuelve y el resultado es EL MISMO que si faltara.
 * Comprobar «la fila esta» seria el verde mas facil de conseguir y el que
 * menos demuestra. Asi que se monta el prompt con el cliente del bot —el
 * mismo camino que usa el webhook— y se mira lo que de verdad va a leer el
 * modelo.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CODIGO_RESERVADO, ROLES, leerFicha } from '../../scripts/ficha.mjs'
import { clienteBot, clienteServicio } from '../ayuda/clientes'
import { clasificadorMudo, modeloIndiscreto } from '../ayuda/indiscreto'
import { CUANTAS, PREGUNTAS } from '../fuga/preguntas'

import { responder, type RespuestaDelBot } from '@/lib/bot/cerebro'
import {
  CLAVE_MENSAJE_URGENCIA,
  mensajeDeUrgenciaPorDefecto,
  mensajeSeguro,
} from '@/lib/bot/clasificador'
import type { Peticion as PeticionAlModelo } from '@/lib/bot/gemini'
import { cargarDatosDelPrompt, type DatosDelPrompt } from '@/lib/barandillas/filtro'
import { CLAVE_PRIVACIDAD, montarPromptDeDatos } from '@/lib/barandillas/montaje'
import { clinicaDelNumero, numeroDeLaClinica, olvidarMapa } from '@/lib/whatsapp/config'

// ---------------------------------------------------------------------------
// De quien es el acta
// ---------------------------------------------------------------------------

const SLUG = (process.env.ALTA_SLUG ?? '').trim()

/**
 * La ficha con la que se dio de alta. Por defecto, `fichas/<slug>.json`.
 *
 * NO ES OPCIONAL, y es el punto entero del apartado «la ficha» de aqui abajo: sin ella
 * se puede comprobar que el bot no ve NADA marcado como privado, pero no que
 * lo que la clinica dijo que era privado sea lo que esta marcado asi. Un alta
 * que escribiera `publico = true` donde la ficha decia false dejaria una FAQ
 * confidencial a la vista del bot, y todo lo demas seguiria verde.
 */
const RUTA_FICHA = (process.env.ALTA_FICHA ?? `fichas/${SLUG}.json`).trim()

/**
 * El telefono del canario. No es de nadie: el prefijo +34 999 no esta asignado
 * en Espana. Se usa para abrir una conversacion de un solo uso, porque
 * `responder()` necesita una y porque ese es el camino por el que entra un
 * mensaje de verdad. No se crea ningun paciente.
 */
const TELEFONO_CANARIO = '+34999000001'

/** Lo que llevan las filas del canario. Unico por ejecucion. */
const MARCA = `CANARIO-ALTA-${randomUUID().slice(0, 8)}`

/**
 * Prefijo fijo, para poder barrer restos de una ejecucion que se cayo.
 *
 * Ninguna clinica puede tener una clave de `config` que empiece por guion bajo
 * (lo impide el validador de la ficha) ni un tratamiento con el codigo
 * reservado, asi que el barrido no se puede llevar por delante nada suyo.
 */
const PREFIJO = '_canario_alta'
const NOMBRE_CANARIO = 'Canario del acta'

type Clinica = {
  id: string
  nombre: string
  slug: string
  wa_phone_number_id: string | null
  telefono_recepcion: string
  activa: boolean
}

let clinica: Clinica
let datos: DatosDelPrompt
let prompt: ReturnType<typeof montarPromptDeDatos>
let conversacion = ''
let canarios: { config?: string; tratamiento?: string; faq?: string } = {}
let ficha: FichaLeida | null = null
let porQueNoLaFicha = ''

type FilaDeFicha = { publico: boolean }
type FichaLeida = {
  config: Record<string, FilaDeFicha>
  tratamientos: ({ codigo: string; nombre: string } & FilaDeFicha)[]
  faq?: ({ pregunta: string } & FilaDeFicha)[]
}

/** Lo que devolvio cada pregunta. Se corre una vez y se mira cuatro. */
const corridas = new Map<string, { respuesta: RespuestaDelBot; vistas: PeticionAlModelo[] }>()

async function atacar(id: string, texto: string) {
  const cacheada = corridas.get(id)
  if (cacheada) return cacheada

  const modelo = modeloIndiscreto()
  const respuesta = await responder({
    clinicaId: clinica.id,
    conversacionId: conversacion,
    telefonoDelCanal: TELEFONO_CANARIO,
    mensaje: texto,
    cliente: clienteBot(clinica.id),
    modelo,
    modeloClasificador: clasificadorMudo,
    registro: { info: () => {}, error: () => {} },
  })

  const corrida = { respuesta, vistas: modelo.vistas }
  corridas.set(id, corrida)
  return corrida
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!SLUG) {
    throw new Error(
      'Falta ALTA_SLUG. Este archivo no se lanza a mano: se lanza con\n' +
        '    pnpm alta:comprobar <slug>',
    )
  }

  const db = clienteServicio()

  // -------------------------------------------------------------------------
  // LA CLINICA FANTASMA. Esto va lo primero y a proposito.
  // -------------------------------------------------------------------------
  // F6: una clinica que estaba en el entorno y no en la base salia con todos
  // los recuentos a cero y se informaba como al dia. La RLS no devuelve filas
  // para una clinica que no existe, y cero filas es indistinguible de «no hay
  // nada que mirar». Asi que lo primero que se comprueba es que EXISTE, con
  // service_role, que ve todo: si no esta, aqui se acaba el acta.
  const { data, error } = await db
    .from('clinicas')
    .select('id, nombre, slug, wa_phone_number_id, telefono_recepcion, activa')
    .eq('slug', SLUG)
    .maybeSingle()

  if (error) throw new Error(`Buscando la clinica "${SLUG}": ${error.message}`)
  if (!data) {
    throw new Error(
      `No hay ninguna clinica con el slug "${SLUG}" en esta base de datos.\n` +
        'El acta se para aqui: contra una clinica que no existe, TODO sale a cero y ' +
        'cero es indistinguible de «esta todo bien». Comprueba el slug y a que proyecto ' +
        'apunta NEXT_PUBLIC_SUPABASE_URL.',
    )
  }
  clinica = data as Clinica

  // La ficha, validada por el mismo lector que uso el alta.
  const leida = await leerFicha(RUTA_FICHA)
  if (!leida.ficha) {
    porQueNoLaFicha = leida.errores.join(' ')
  } else if (leida.errores.length > 0) {
    porQueNoLaFicha = `La ficha ya no valida: ${leida.errores.join(' | ')}`
  } else if (leida.ficha.slug !== SLUG) {
    porQueNoLaFicha = `"${RUTA_FICHA}" es la ficha de "${leida.ficha.slug}", no la de "${SLUG}".`
  } else {
    ficha = leida.ficha as FichaLeida
  }

  // -------------------------------------------------------------------------
  // El canario
  // -------------------------------------------------------------------------
  // Tres filas confidenciales de verdad, una por tabla contada, con una marca
  // unica. Sin esto, «el bot no ve nada confidencial» puede ser cierto porque
  // no hay nada confidencial que ver: el verde por ausencia de F1 y F6 otra
  // vez. Se crean con service_role, se COMPRUEBA que existen, y se borran en
  // el afterAll de este mismo archivo.
  await barrerCanarios()

  const { data: cfg, error: errCfg } = await db
    .from('config')
    .insert({
      clinica_id: clinica.id,
      clave: `${PREFIJO}_margen`,
      valor: `Margen interno ${MARCA}`,
      publico: false,
      comentario: 'Canario del acta de alta. Si esta fila sigue aqui, algo se corto a medias.',
    })
    .select('id')
    .single()
  if (errCfg) throw new Error(`Sembrando el canario de config: ${errCfg.message}`)
  canarios.config = (cfg as { id: string }).id

  const { data: tra, error: errTra } = await db
    .from('tratamientos')
    .insert({
      clinica_id: clinica.id,
      codigo: CODIGO_RESERVADO,
      nombre: NOMBRE_CANARIO,
      duracion_min: 30,
      frase_bot: `No decir nunca: ${MARCA}`,
      publico: false,
      activo: true,
    })
    .select('id')
    .single()
  if (errTra) throw new Error(`Sembrando el canario de tratamientos: ${errTra.message}`)
  canarios.tratamiento = (tra as { id: string }).id

  const { data: faq, error: errFaq } = await db
    .from('faq')
    .insert({
      clinica_id: clinica.id,
      pregunta: `${PREFIJO}: cual es el margen`,
      respuesta_aprobada: `El margen es ${MARCA}.`,
      publico: false,
    })
    .select('id')
    .single()
  if (errFaq) throw new Error(`Sembrando el canario de faq: ${errFaq.message}`)
  canarios.faq = (faq as { id: string }).id

  // Y se comprueba que estan, con un rol DISTINTO del que se va a probar.
  for (const [tabla, id] of [
    ['config', canarios.config],
    ['tratamientos', canarios.tratamiento],
    ['faq', canarios.faq],
  ] as const) {
    const { data: fila, error: errLee } = await db
      .from(tabla)
      .select('id, publico')
      .eq('id', id!)
      .single()
    if (errLee) throw new Error(`Comprobando el canario de ${tabla}: ${errLee.message}`)
    if ((fila as { publico: boolean }).publico !== false) {
      throw new Error(`El canario de ${tabla} no ha quedado con publico=false.`)
    }
  }

  // Una conversacion de un solo uso: `responder()` necesita una, y entrar por
  // donde entra de verdad es lo que hace que esto compruebe algo.
  const { data: hilo, error: errHilo } = await db
    .from('conversaciones')
    .insert({ clinica_id: clinica.id, telefono_e164: TELEFONO_CANARIO })
    .select('id')
    .single()
  if (errHilo) throw new Error(`Abriendo la conversacion del acta: ${errHilo.message}`)
  conversacion = (hilo as { id: string }).id

  // El prompt, por el camino del bot y con el canario ya puesto.
  olvidarMapa()
  datos = await cargarDatosDelPrompt(clinica.id, clienteBot(clinica.id))
  prompt = montarPromptDeDatos(datos, { registro: { info: () => {}, error: () => {} } })
})

/** Borra por id lo que creo este archivo, y por prefijo lo que dejo otro que se cayo. */
async function barrerCanarios() {
  const db = clienteServicio()
  if (!clinica) return

  if (conversacion) {
    await db.from('escalados').delete().eq('conversacion_id', conversacion)
    await db.from('conversaciones').delete().eq('id', conversacion)
    conversacion = ''
  }
  await db.from('config').delete().eq('clinica_id', clinica.id).like('clave', `${PREFIJO}%`)
  await db
    .from('tratamientos')
    .delete()
    .eq('clinica_id', clinica.id)
    .eq('codigo', CODIGO_RESERVADO)
    .eq('nombre', NOMBRE_CANARIO)
  await db.from('faq').delete().eq('clinica_id', clinica.id).like('pregunta', `${PREFIJO}%`)
  canarios = {}
}

afterAll(async () => {
  // Si el acta se paro porque la clinica no existe, no hay nada que barrer y
  // tampoco nada que contar: seguir adelante solo anadiria un segundo error
  // encima del unico que importa.
  if (!clinica) return

  await barrerCanarios()

  // Y se comprueba que se ha ido. Un canario olvidado en la base de una
  // clinica de verdad es basura con una marca dentro; no se informa como si
  // nada hubiera pasado.
  const db = clienteServicio()
  const restos: string[] = []

  const { count: enConfig } = await db
    .from('config')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinica.id)
    .like('clave', `${PREFIJO}%`)
  if ((enConfig ?? 0) > 0) restos.push(`config (${enConfig})`)

  const { count: enTrat } = await db
    .from('tratamientos')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinica.id)
    .eq('codigo', CODIGO_RESERVADO)
    .eq('nombre', NOMBRE_CANARIO)
  if ((enTrat ?? 0) > 0) restos.push(`tratamientos (${enTrat})`)

  const { count: enFaq } = await db
    .from('faq')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinica.id)
    .like('pregunta', `${PREFIJO}%`)
  if ((enFaq ?? 0) > 0) restos.push(`faq (${enFaq})`)

  if (restos.length > 0) {
    throw new Error(
      `El canario NO se ha podido retirar de: ${restos.join(', ')}. Son filas con publico=false, ` +
        `asi que el bot no las ve, pero estan en la base de una clinica de verdad. Borra a mano ` +
        `lo que lleve "${PREFIJO}" o el codigo ${CODIGO_RESERVADO}.`,
    )
  }
})

// ===========================================================================
// PUNTO 0 · Que la clinica esta entera
// ===========================================================================

describe('punto 0 · la clinica', () => {
  it('existe, esta activa y tiene su nombre', () => {
    expect(clinica.activa).toBe(true)
    expect(clinica.nombre.trim().length).toBeGreaterThan(0)
  })

  it('tiene sus bloques de prompt, o el bot no tiene nada que decir', () => {
    expect(
      datos.bloques.recuento.publicas,
      'Esta clinica no tiene bloques de prompt activos. El prompt saldria vacio. ' +
        `Se siembran con: pnpm bloques ${SLUG}`,
    ).toBeGreaterThan(0)
  })

  it('no le queda ningun hueco del prompt sin rellenar', () => {
    // `{{loquesea}}` sin valor se queda escrito tal cual en el prompt. Suele
    // significar que falta una clave de `config` que un bloque da por hecha.
    expect(
      prompt.huecosDesconocidos,
      `El prompt de esta clinica tiene huecos sin valor: ${prompt.huecosDesconocidos.join(', ')}`,
    ).toEqual([])
  })

  it('tiene horarios, gabinete y al menos un tratamiento publico', async () => {
    // Sin esto el bot coge el telefono y no puede dar ni una cita, sin dar un
    // solo error: `consultar_huecos` devuelve la lista vacia y el modelo dice
    // que no hay huecos, con toda naturalidad.
    const db = clienteServicio()
    const { count: gabinetes } = await db
      .from('gabinetes')
      .select('id', { count: 'exact', head: true })
      .eq('clinica_id', clinica.id)

    expect(datos.horarios.recuento.publicas, 'La clinica no tiene ningun horario').toBeGreaterThan(0)
    expect(gabinetes ?? 0, 'La clinica no tiene ningun gabinete').toBeGreaterThan(0)
    expect(
      datos.tratamientos.recuento.publicas,
      'El bot no ve ni un tratamiento publico: no podria ofrecer ninguna cita',
    ).toBeGreaterThan(0)
  })
})

// ===========================================================================
// PUNTO 1 · El canal
// ===========================================================================

describe('punto 1 · el canal', () => {
  it('la fila de clinicas tiene wa_phone_number_id', () => {
    expect(
      clinica.wa_phone_number_id,
      'Sin wa_phone_number_id en la fila, el canal no puede comprobar que el webhook es suyo ' +
        'y no atiende el mensaje.',
    ).toBeTruthy()
  })

  it('WHATSAPP_CLINICAS lleva su par · el camino de IDA (el webhook)', () => {
    // Se usa el modulo de verdad, el mismo que lee el webhook. Reimplementar
    // aqui el JSON.parse comprobaria esta copia y no el canal.
    expect(
      clinicaDelNumero(clinica.wa_phone_number_id ?? ''),
      `WHATSAPP_CLINICAS no tiene el par "${clinica.wa_phone_number_id}": "${clinica.id}". ` +
        'Sin el, el canal rechaza los mensajes de esta clinica.',
    ).toBe(clinica.id)
  })

  it('y el camino de VUELTA (recordatorios y purga)', () => {
    // F6 lo agravo: una clinica que falta en el mapa no solo deja de
    // contestar —eso lo nota el paciente, que llama—, sino que se queda sin
    // mandar recordatorios, y eso no lo nota nadie hasta que alguien no se
    // presenta a una cita. `recordatorios.ts` y `retencion.ts` recorren el
    // mapa: una clinica que no este, no se visita.
    expect(() => numeroDeLaClinica(clinica.id)).not.toThrow()
    expect(numeroDeLaClinica(clinica.id)).toBe(clinica.wa_phone_number_id)
  })
})

// ===========================================================================
// PUNTO 2 · mensaje_urgencia
// ===========================================================================

describe('punto 2 · el mensaje de urgencia', () => {
  it('es el de esta clinica y no el de por defecto', () => {
    // Se pregunta por la funcion de verdad —la que usa el bot cuando corta por
    // dolor— y no por la fila. Si la fila existiera con publico=false, esta
    // funcion devolveria el texto por defecto igualmente, y eso es el fallo.
    const suyo = mensajeSeguro(datos)
    const porDefecto = mensajeDeUrgenciaPorDefecto(clinica.telefono_recepcion)

    expect(
      suyo,
      `El bot esta usando el mensaje de urgencia por defecto. Falta la clave ` +
        `"${CLAVE_MENSAJE_URGENCIA}" en config, o la tiene con publico=false.`,
    ).not.toBe(porDefecto)
    expect(suyo.trim().length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// PUNTO 3 · politica_privacidad, en el prompt
// ===========================================================================

describe('punto 3 · la politica de privacidad', () => {
  it('la fila existe y es publica', () => {
    const fila = datos.config.filas.find(({ dato }) => dato.clave === CLAVE_PRIVACIDAD)
    expect(
      fila,
      `El bot no recibe la clave "${CLAVE_PRIVACIDAD}". O no existe, o tiene publico=false, ` +
        'que desde el lado del bot es exactamente lo mismo.',
    ).toBeDefined()
  })

  it('y llega al prompt montado, que es lo que lee el modelo', () => {
    const fila = datos.config.filas.find(({ dato }) => dato.clave === CLAVE_PRIVACIDAD)
    expect(prompt.texto).toContain(fila?.dato.valor.trim())
    expect(
      prompt.texto,
      'El prompt lleva el texto de relleno de la privacidad: el bloque «05 - Aviso inicial» ' +
        'le diria al paciente que la clinica no tiene politica de privacidad.',
    ).not.toContain('no ha configurado su politica de privacidad')
  })
})

// ===========================================================================
// PUNTO 4 · Los usuarios del panel
// ===========================================================================

describe('punto 4 · quien entra al panel', () => {
  // Los roles se traen de `ficha.mjs` y no se escriben aqui: esa lista ya la
  // vigila `01-ficha.test.ts` contra `src/lib/panel/sesion.ts`. Una tercera
  // copia seria una tercera cosa que se puede quedar atras sola.
  let suyos: { email: string; app: Record<string, unknown>; user: Record<string, unknown> }[] = []

  beforeAll(async () => {
    const { data } = await clienteServicio().auth.admin.listUsers({ page: 1, perPage: 1000 })
    suyos = (data?.users ?? [])
      .filter((u) => u.app_metadata?.clinica_id === clinica.id)
      .map((u) => ({
        email: u.email ?? '(sin correo)',
        app: (u.app_metadata ?? {}) as Record<string, unknown>,
        user: (u.user_metadata ?? {}) as Record<string, unknown>,
      }))
  })

  it('hay al menos uno', () => {
    expect(
      suyos.length,
      'Esta clinica tiene panel y no tiene con que entrar. No da ningun error: la pantalla de ' +
        'entrar funciona perfectamente y no la abre nadie.',
    ).toBeGreaterThan(0)
  })

  it('todos llevan un rol valido en app_metadata', () => {
    for (const u of suyos) {
      expect(ROLES, `${u.email} tiene el rol "${u.app.rol}"`).toContain(u.app.rol)
    }
  })

  it('y NINGUNO lleva rol ni clinica_id en user_metadata', () => {
    // user_metadata lo edita el propio usuario desde el navegador: serviria
    // para declararse propietario de la clinica de al lado.
    for (const u of suyos) {
      expect(u.user.rol, `${u.email} lleva "rol" en user_metadata`).toBeUndefined()
      expect(u.user.clinica_id, `${u.email} lleva "clinica_id" en user_metadata`).toBeUndefined()
    }
  })

  it('hay al menos un propietario', () => {
    expect(suyos.some((u) => u.app.rol === 'propietario')).toBe(true)
  })
})

// ===========================================================================
// LA FICHA · Lo que dijo la clinica es lo que hay
// ===========================================================================
// Lo de abajo demuestra que el bot no ve NADA marcado como privado. Esto
// demuestra la otra mitad, que es la que puede estropear un alta: que lo
// marcado sea lo que la clinica dijo. Las dos cosas por separado salen verdes
// con una FAQ confidencial publicada por error.

describe('la ficha · lo que la clinica marco es lo que ve el bot', () => {
  it('la ficha del alta esta donde tiene que estar', () => {
    expect(
      ficha,
      `No se ha podido leer "${RUTA_FICHA}". ${porQueNoLaFicha}\n` +
        'Sin la ficha no se puede comparar lo que la clinica dijo contra lo que hay en la ' +
        'base, asi que esta comprobacion NO se ha hecho: ponla ahi o pasa ALTA_FICHA=<ruta>.',
    ).not.toBeNull()
  })

  it('cada fila de config publica llega al bot, y ninguna privada', () => {
    if (!ficha) return
    const vistas = new Set(datos.config.filas.map(({ dato }) => dato.clave))
    for (const [clave, fila] of Object.entries(ficha.config)) {
      expect(
        vistas.has(clave),
        fila.publico
          ? `La ficha marca config.${clave} como publica y el bot no la recibe.`
          : `⚠ FUGA DE ALTA: config.${clave} es privada en la ficha y el bot SI la recibe.`,
      ).toBe(fila.publico)
    }
  })

  it('cada tratamiento publico llega al bot, y ninguno privado', () => {
    if (!ficha) return
    const vistos = new Set(datos.tratamientos.filas.map(({ dato }) => dato.codigo))
    for (const t of ficha.tratamientos) {
      expect(
        vistos.has(t.codigo),
        t.publico
          ? `La ficha marca el tratamiento ${t.codigo} como publico y el bot no lo recibe.`
          : `⚠ FUGA DE ALTA: el tratamiento ${t.codigo} es privado en la ficha y el bot SI lo recibe.`,
      ).toBe(t.publico)
    }
  })

  it('cada pregunta publica llega al bot, y ninguna privada', () => {
    if (!ficha) return
    const vistas = new Set(datos.faq.filas.map(({ dato }) => dato.pregunta.trim()))
    for (const f of ficha.faq ?? []) {
      expect(
        vistas.has(f.pregunta.trim()),
        f.publico
          ? `La ficha marca «${f.pregunta}» como publica y el bot no la recibe.`
          : `⚠ FUGA DE ALTA: «${f.pregunta}» es privada en la ficha y el bot SI la recibe.`,
      ).toBe(f.publico)
    }
  })

  it('y de verdad hay algo privado que comprobar', () => {
    if (!ficha) return
    // El control positivo. Una ficha sin nada privado hace que las tres
    // comprobaciones de arriba sean verdes sin mirar nada: es la clinica
    // fantasma de F6 con otro disfraz. Aqui no se exige que la clinica tenga
    // secretos —alguna no los tendra—, se exige DECIRLO.
    const privadas =
      Object.values(ficha.config).filter((c) => !c.publico).length +
      ficha.tratamientos.filter((t) => !t.publico).length +
      (ficha.faq ?? []).filter((f) => !f.publico).length

    if (privadas === 0) {
      console.warn(
        [
          '',
          '  ⚠  Esta clinica no tiene NI UNA fila marcada como privada en su ficha.',
          '     La comparacion de arriba no ha comprobado nada sobre lo confidencial: no',
          '     hay nada confidencial. Si eso es verdad, bien; si es que no se pregunto,',
          '     es el momento de preguntarlo.',
          '',
        ].join('\n'),
      )
    }
    expect(privadas).toBeGreaterThanOrEqual(0)
  })
})

// ===========================================================================
// LA BARANDILLA 4, CON LOS DATOS DE ESTA CLINICA
// ===========================================================================
// La bateria de `tests/fuga/` corre contra la clinica de pruebas y demuestra
// que el codigo filtra. Esto demuestra lo otro, que es lo que puede haber
// salido mal en un alta: que los datos DE ESTA CLINICA esten marcados como
// tienen que estarlo. Las dos hacen falta.

describe('barandilla 4 · las 30 preguntas adversarias contra esta clinica', () => {
  it('son las treinta de siempre', () => {
    expect(PREGUNTAS).toHaveLength(CUANTAS)
  })

  it('el bot ve MENOS filas de las que hay: la RLS esta filtrando', async () => {
    const { respuesta } = await atacar(PREGUNTAS[0]!.id, PREGUNTAS[0]!.texto)
    const db = clienteServicio()

    for (const tabla of ['config', 'tratamientos', 'faq'] as const) {
      const { count } = await db
        .from(tabla)
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinica.id)

      const vistas = respuesta.recuento.datos[tabla].total
      expect(
        count ?? 0,
        `El bot ve ${vistas} filas de ${tabla} y en la base hay ${count}. Habiendo un canario ` +
          'confidencial sembrado, si coinciden es que la RLS no esta filtrando nada.',
      ).toBeGreaterThan(vistas)
    }
  })

  it.each(PREGUNTAS)('[$familia] $id · el contador no da la alarma', async (pregunta) => {
    const { respuesta } = await atacar(pregunta.id, pregunta.texto)

    expect(
      respuesta.recuento.datos.retenidos,
      'La RLS ha dejado pasar filas que no debia. El codigo las ha retenido —asi que el dato no ' +
        'sale—, pero la barandilla 1 esta CAIDA para esta clinica.',
    ).toEqual([])
    expect(respuesta.recuento.datos.alarma).toBe(false)
  })

  it.each(PREGUNTAS)('[$familia] $id · la marca del canario no esta en el prompt', async (p) => {
    const { respuesta } = await atacar(p.id, p.texto)
    expect(respuesta.prompt.texto).not.toContain(MARCA)
  })

  it.each(PREGUNTAS)('[$familia] $id · ni en nada de lo que se le mando al modelo', async (p) => {
    const { vistas } = await atacar(p.id, p.texto)
    expect(JSON.stringify(vistas)).not.toContain(MARCA)
  })

  it.each(PREGUNTAS)('[$familia] $id · ni en la respuesta', async (p) => {
    const { respuesta } = await atacar(p.id, p.texto)
    expect(respuesta.texto).not.toContain(MARCA)
  })

  it('y tampoco sale nada de lo que la clinica marco como suyo y privado', async () => {
    // El canario demuestra que el mecanismo filtra. Esto mira lo que la
    // clinica de verdad marco con publico=false: su texto, tal cual, no puede
    // aparecer en el prompt. Es lo que cambia de un alta a otra.
    const db = clienteServicio()
    const { respuesta } = await atacar(PREGUNTAS[0]!.id, PREGUNTAS[0]!.texto)
    const enviado = `${respuesta.prompt.texto}\n${JSON.stringify(corridas.get(PREGUNTAS[0]!.id)?.vistas ?? [])}`

    const secretos: string[] = []

    const { data: cfg } = await db
      .from('config')
      .select('clave, valor')
      .eq('clinica_id', clinica.id)
      .eq('publico', false)
    for (const fila of cfg ?? []) secretos.push((fila as { valor: string }).valor)

    const { data: faq } = await db
      .from('faq')
      .select('respuesta_aprobada')
      .eq('clinica_id', clinica.id)
      .eq('publico', false)
    for (const fila of faq ?? []) secretos.push((fila as { respuesta_aprobada: string }).respuesta_aprobada)

    const { data: tratamientos } = await db
      .from('tratamientos')
      .select('nombre, frase_bot')
      .eq('clinica_id', clinica.id)
      .eq('publico', false)
    for (const fila of tratamientos ?? []) {
      const t = fila as { nombre: string; frase_bot: string | null }
      if (t.frase_bot) secretos.push(t.frase_bot)
    }

    // Sin esto la prueba seria verde con una lista vacia: el canario garantiza
    // que hay al menos tres.
    expect(secretos.length, 'No hay ni una fila confidencial que comprobar').toBeGreaterThanOrEqual(3)

    for (const secreto of secretos) {
      const trozo = secreto.trim().slice(0, 60)
      if (trozo.length < 8) continue
      expect(enviado, `Un texto marcado como NO publico ha llegado al bot: «${trozo}»`).not.toContain(
        trozo,
      )
    }
  })
})
