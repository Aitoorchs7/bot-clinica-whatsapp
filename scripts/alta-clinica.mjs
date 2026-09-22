/**
 * Dar de alta una clinica. TODO lo que se puede escribir, en un solo comando.
 *
 *   pnpm alta fichas/<slug>.json [--continuar]
 *
 * ===========================================================================
 * POR QUE EXISTE ESTE ARCHIVO
 * ===========================================================================
 *
 * Hasta F8, dar de alta una clinica eran CINCO cosas sueltas que alguien tenia
 * que recordar (PLAN.md §11). Cuatro de ellas no dan ningun error cuando
 * faltan: la clinica queda creada, el panel se ve, la lista de tratamientos
 * esta bien... y el bot dice el mensaje de urgencia de otro, o no manda
 * recordatorios, o nadie puede entrar al panel. Un alta a medias no se ve.
 *
 * Este script hace las que se pueden hacer desde aqui (1a, 2, 3 y 4) y DEJA
 * ESCRITO lo que no (1b y 5), con el comando que lo comprueba. No dice «alta
 * completada» nunca: dice lo que falta.
 *
 * ===========================================================================
 * SERVICE_ROLE, Y POR QUE AQUI SI
 * ===========================================================================
 *
 * `.claude/CLAUDE.md`: «La clave service_role jamas sale del servidor ni entra
 * en NEXT_PUBLIC_*. Solo en migraciones y scripts de alta». Esto es un script
 * de alta —el otro es `sembrar-bloques.mjs`, y la siembra de las pruebas—, y
 * es el unico sitio del repositorio donde crear usuarios y escribir filas de
 * una clinica que todavia no existe tiene sentido: no hay ninguna identidad de
 * inquilino que usar cuando el inquilino no esta creado.
 *
 * Lo que NO hace este script: no toca el camino del bot, no escribe secretos y
 * no deja la clave en ningun archivo. Lee `.env.local`, como los demas.
 *
 * ===========================================================================
 * NO BORRA NADA. NUNCA.
 * ===========================================================================
 *
 * Sin `--continuar` se para si la clinica ya existe. Con `--continuar` anade
 * lo que falta y no pisa nada de lo que ya hay: una clinica que lleve meses
 * afinando sus respuestas desde el panel no puede perderlas porque alguien
 * relance el alta. Lo que diverge se INFORMA, no se corrige.
 */
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

import { leerFicha, CLAVES_OBLIGATORIAS, DIAS } from './ficha.mjs'
import { filasParaClinica } from './bloques-a-filas.mjs'
import { limpiarClaimsDeUsuario } from './usuarios.mjs'

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const hecho = []
const pendiente = []
const problemas = []

function titulo(texto) {
  console.log(`\n${texto}\n${'-'.repeat(texto.length)}`)
}

function ok(texto) {
  hecho.push(texto)
  console.log(`  ok  ${texto}`)
}

function aviso(texto) {
  console.log(`  ⚠   ${texto}`)
}

function problema(texto) {
  problemas.push(texto)
  console.error(`  🔴  ${texto}`)
}

// ---------------------------------------------------------------------------

function contrasenaDeUnSoloUso() {
  // Nunca se imprime ni se guarda. Sirve para UNA cosa: iniciar sesion una vez
  // desde aqui y comprobar que la cuenta entra de verdad y que sus permisos
  // viajan en el token. Despues, el usuario pone la suya con el enlace de
  // recuperacion.
  //
  // Un uuid v4 y tres caracteres para cubrir mayuscula, digito y simbolo. Dos
  // uuids pasaban de 72 caracteres y Supabase Auth los rechaza (medido).
  return `${randomUUID()}Aa9!`
}

/** El payload de un JWT, sin dependencias: solo para mirar lo que lleva. */
function cuerpoDelToken(token) {
  try {
    const trozo = token.split('.')[1]
    return JSON.parse(Buffer.from(trozo.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
  } catch {
    return null
  }
}

async function principal() {
  const { createClient } = await import('@supabase/supabase-js')
  const { existsSync } = await import('node:fs')
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')

  const argumentos = process.argv.slice(2)
  const continuar = argumentos.includes('--continuar')
  const ruta = argumentos.find((a) => !a.startsWith('--'))

  if (!ruta) {
    console.error(
      'Uso: pnpm alta <ficha.json> [--continuar]\n' +
        '\n' +
        'La ficha la genera la entrevista de /alta-clinica. Hay un ejemplo comentado en\n' +
        'fichas/ejemplo.json.',
    )
    process.exitCode = 1
    return
  }

  // -------------------------------------------------------------------------
  // 1 · La ficha, antes de tocar la base
  // -------------------------------------------------------------------------
  titulo('La ficha')
  const { ficha, errores, avisos } = await leerFicha(ruta)
  for (const a of avisos) aviso(a)
  if (errores.length > 0) {
    console.error(`\n  La ficha tiene ${errores.length} cosa(s) que arreglar:\n`)
    for (const e of errores) console.error(`  🔴  ${e}`)
    console.error('\n  No se ha tocado la base de datos.\n')
    process.exitCode = 1
    return
  }
  ok(`"${ficha.nombre}" (${ficha.slug}) leida y validada`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !clave || !anon) {
    console.error(
      '\n  Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o\n' +
        '  SUPABASE_SERVICE_ROLE_KEY en .env.local. La plantilla esta en .env.example.\n',
    )
    process.exitCode = 1
    return
  }

  const db = createClient(url, clave, { auth: { persistSession: false } })

  // -------------------------------------------------------------------------
  // 2 · La clinica
  // -------------------------------------------------------------------------
  titulo('La clinica')

  const { data: existente, error: errorBusca } = await db
    .from('clinicas')
    .select('id, nombre, wa_phone_number_id, activa')
    .eq('slug', ficha.slug)
    .maybeSingle()

  if (errorBusca) {
    problema(`No se ha podido consultar la tabla clinicas: ${errorBusca.message}`)
    process.exitCode = 1
    return
  }

  if (existente && !continuar) {
    console.error(
      `\n  🔴  Ya hay una clinica con el slug "${ficha.slug}" (${existente.nombre}).\n\n` +
        '  No se toca nada. Si el alta se quedo a medias y quieres COMPLETAR lo que falte\n' +
        '  sin pisar lo que ya hay:\n\n' +
        `      pnpm alta ${ruta} --continuar\n\n` +
        '  Y si lo que quieres es ver que le falta:\n\n' +
        `      pnpm alta:comprobar ${ficha.slug}\n`,
    )
    process.exitCode = 1
    return
  }

  let clinicaId
  if (existente) {
    clinicaId = existente.id
    aviso(`--continuar: se completa la clinica que ya existe (${clinicaId}).`)

    if (!existente.wa_phone_number_id) {
      const { error } = await db
        .from('clinicas')
        .update({ wa_phone_number_id: ficha.wa_phone_number_id })
        .eq('id', clinicaId)
      if (error) problema(`No se ha podido poner wa_phone_number_id: ${error.message}`)
      else ok(`wa_phone_number_id puesto (${ficha.wa_phone_number_id}), estaba vacio`)
    } else if (existente.wa_phone_number_id !== ficha.wa_phone_number_id) {
      problema(
        `La clinica tiene wa_phone_number_id ${existente.wa_phone_number_id} y la ficha dice ` +
          `${ficha.wa_phone_number_id}. No se pisa: decide cual es el bueno y cambialo a mano.`,
      )
    }
  } else {
    const { data, error } = await db
      .from('clinicas')
      .insert({
        nombre: ficha.nombre,
        slug: ficha.slug,
        wa_phone_number_id: ficha.wa_phone_number_id,
        wa_waba_id: ficha.wa_waba_id ?? null,
        zona_horaria: ficha.zona_horaria ?? 'Europe/Madrid',
        trato: ficha.trato ?? 'usted',
        nombre_bot: ficha.nombre_bot ?? 'Asistente',
        telefono_recepcion: ficha.telefono_recepcion,
        email_avisos: ficha.email_avisos,
      })
      .select('id')
      .single()
    if (error) {
      problema(`Creando la clinica: ${error.message}`)
      process.exitCode = 1
      return
    }
    clinicaId = data.id
    ok(`creada · clinica_id ${clinicaId}`)
  }

  // -------------------------------------------------------------------------
  // 3 · Gabinetes, horarios, tratamientos, faq, config
  // -------------------------------------------------------------------------
  titulo('Lo que sabe la clinica')

  // --- gabinetes -------------------------------------------------------------
  const { data: gabExistentes } = await db
    .from('gabinetes')
    .select('id, nombre')
    .eq('clinica_id', clinicaId)
  const porNombre = new Map((gabExistentes ?? []).map((g) => [g.nombre, g.id]))

  for (const nombre of ficha.gabinetes) {
    if (porNombre.has(nombre)) continue
    const { data, error } = await db
      .from('gabinetes')
      .insert({ clinica_id: clinicaId, nombre })
      .select('id')
      .single()
    if (error) problema(`Creando el gabinete "${nombre}": ${error.message}`)
    else porNombre.set(nombre, data.id)
  }
  ok(`${porNombre.size} gabinete(s)`)

  // --- horarios --------------------------------------------------------------
  const { data: horExistentes } = await db
    .from('horarios')
    .select('dia_semana, hora_inicio')
    .eq('clinica_id', clinicaId)
  const yaHay = new Set((horExistentes ?? []).map((h) => `${h.dia_semana}@${h.hora_inicio.slice(0, 5)}`))

  const nuevosHorarios = ficha.horarios
    .map((t) => ({
      clinica_id: clinicaId,
      dia_semana: DIAS[t.dia.trim()],
      hora_inicio: t.de,
      hora_fin: t.a,
    }))
    .filter((h) => !yaHay.has(`${h.dia_semana}@${h.hora_inicio}`))

  if (nuevosHorarios.length > 0) {
    const { error } = await db.from('horarios').insert(nuevosHorarios)
    if (error) problema(`Sembrando horarios: ${error.message}`)
  }
  ok(`${(horExistentes?.length ?? 0) + nuevosHorarios.length} tramo(s) de horario`)

  // --- tratamientos ----------------------------------------------------------
  const { data: tratExistentes } = await db
    .from('tratamientos')
    .select('codigo, publico')
    .eq('clinica_id', clinicaId)
  const tratPorCodigo = new Map((tratExistentes ?? []).map((t) => [t.codigo, t]))

  let tratNuevos = 0
  for (const t of ficha.tratamientos) {
    const previo = tratPorCodigo.get(t.codigo)
    if (previo) {
      if (previo.publico !== t.publico) {
        aviso(
          `El tratamiento "${t.codigo}" ya existe con publico=${previo.publico} y la ficha dice ` +
            `${t.publico}. No se pisa: lo que hay en la base manda, porque se edita desde el panel.`,
        )
      }
      continue
    }
    const { error } = await db.from('tratamientos').insert({
      clinica_id: clinicaId,
      codigo: t.codigo,
      nombre: t.nombre,
      duracion_min: t.duracion_min,
      gabinete_id: t.gabinete ? (porNombre.get(t.gabinete.trim()) ?? null) : null,
      frase_bot: t.frase_bot ?? null,
      publico: t.publico,
    })
    if (error) problema(`Creando el tratamiento "${t.codigo}": ${error.message}`)
    else tratNuevos += 1
  }
  ok(`${tratPorCodigo.size + tratNuevos} tratamiento(s)`)

  // --- faq -------------------------------------------------------------------
  // No hay clave natural, asi que se compara por la pregunta. Dos preguntas
  // iguales con respuestas distintas serian un problema de la clinica, no del
  // script: se avisa y no se duplica.
  const listaFaq = ficha.faq ?? []
  const { data: faqExistentes } = await db.from('faq').select('pregunta').eq('clinica_id', clinicaId)
  const preguntas = new Set((faqExistentes ?? []).map((f) => f.pregunta.trim()))

  const nuevasFaq = listaFaq
    .filter((f) => !preguntas.has(f.pregunta.trim()))
    .map((f) => ({
      clinica_id: clinicaId,
      pregunta: f.pregunta.trim(),
      respuesta_aprobada: f.respuesta.trim(),
      categoria: f.categoria ?? null,
      publico: f.publico,
    }))

  if (nuevasFaq.length > 0) {
    const { error } = await db.from('faq').insert(nuevasFaq)
    if (error) problema(`Sembrando la FAQ: ${error.message}`)
  }
  ok(
    `${preguntas.size + nuevasFaq.length} pregunta(s) frecuentes ` +
      `(${listaFaq.filter((f) => f.publico).length} publicas en la ficha)`,
  )
  // El `embedding` se queda a null a proposito: hoy la FAQ entra ENTERA en el
  // prompt y no hay recuperacion por similitud (migracion 002, el indice hnsw
  // esta escrito y comentado). Si algun dia se enciende, se rellena entonces.

  // --- config ----------------------------------------------------------------
  const { data: cfgExistentes } = await db
    .from('config')
    .select('clave, valor, publico')
    .eq('clinica_id', clinicaId)
  const cfgPorClave = new Map((cfgExistentes ?? []).map((c) => [c.clave, c]))

  let cfgNuevas = 0
  for (const [clave, fila] of Object.entries(ficha.config)) {
    const previa = cfgPorClave.get(clave)
    if (previa) {
      if (CLAVES_OBLIGATORIAS.includes(clave) && previa.publico !== true) {
        problema(
          `config.${clave} ya existe con publico=false. La fila esta, pero el bot NO la recibe ` +
            '—la RLS no se la devuelve—, asi que se comporta igual que si faltara. Ponla ' +
            'publica desde el panel, o borra la fila y vuelve a lanzar el alta.',
        )
      } else if (previa.valor !== String(fila.valor)) {
        aviso(`config.${clave} ya existe con otro valor. No se pisa.`)
      }
      continue
    }
    const { error } = await db.from('config').insert({
      clinica_id: clinicaId,
      clave,
      valor: String(fila.valor),
      publico: fila.publico,
      comentario: fila.comentario ?? null,
    })
    if (error) problema(`Creando config.${clave}: ${error.message}`)
    else cfgNuevas += 1
  }
  ok(`${cfgPorClave.size + cfgNuevas} fila(s) de config, con las dos obligatorias`)

  // --- bloques de prompt -----------------------------------------------------
  // Se delega en el mismo lector que usa `pnpm bloques` y que usa la siembra de
  // las pruebas. Tres copias del prompt serian tres prompts distintos.
  const { count: cuantosBloques } = await db
    .from('bloques_prompt')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)

  if ((cuantosBloques ?? 0) > 0) {
    aviso(`Ya tiene ${cuantosBloques} bloques de prompt. No se tocan (se editan desde el panel).`)
  } else {
    const filas = filasParaClinica(clinicaId)
    const { error } = await db.from('bloques_prompt').insert(filas)
    if (error) problema(`Sembrando los bloques de prompt: ${error.message}`)
    else ok(`${filas.length} bloques de prompt (${filas.filter((f) => f.activo).length} activos)`)
  }

  // -------------------------------------------------------------------------
  // 4 · Los usuarios del panel · punto 4 de los cinco
  // -------------------------------------------------------------------------
  titulo('Quien entra al panel')

  const { data: listado } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const usuariosDeAuth = new Map((listado?.users ?? []).map((u) => [(u.email ?? '').toLowerCase(), u]))
  const enlaces = []

  for (const usuario of ficha.usuarios) {
    const email = usuario.email.trim().toLowerCase()
    const previo = usuariosDeAuth.get(email)

    if (previo) {
      const suyo = previo.app_metadata?.clinica_id
      if (suyo && suyo !== clinicaId) {
        problema(
          `${email} ya existe y pertenece a OTRA clinica (${suyo}). No se toca: cambiarle el ` +
            'clinica_id le daria acceso a los datos de esta y le quitaria los de la suya.',
        )
      } else if (!suyo || !previo.app_metadata?.rol) {
        problema(
          `${email} ya existe pero no tiene rol y clinica_id en app_metadata. Tal y como esta, ` +
            'entra al panel y no ve nada (o peor). Revisalo en Supabase > Authentication.',
        )
      } else {
        ok(`${email} ya existe con rol ${previo.app_metadata.rol}`)
      }

      // LO UNICO QUE ESTE SCRIPT TOCA DE UN USUARIO QUE YA EXISTE, Y ES A
      // PROPOSITO: `rol` y `clinica_id` dentro de `user_metadata`, que el
      // propio usuario puede editar desde el navegador. Sus preferencias no
      // se tocan; esas dos claves, si, porque son una copia de un dato de
      // seguridad en un sitio donde no manda el servidor. El acta se pone
      // roja si las encuentra, y hasta F8 no habia forma de quitarlas.
      //
      // Se borran mandandolas A NULL, una por una. Un `user_metadata: {}`
      // devuelve 200 y no borra nada: Supabase fusiona. Ver usuarios.mjs.
      try {
        const { limpiado, claims } = await limpiarClaimsDeUsuario(db, previo)
        if (limpiado) {
          aviso(
            `${email} llevaba ${claims.join(' y ')} en user_metadata —donde lo edita el propio ` +
              'usuario— y se ha quitado de ahi. En app_metadata sigue igual.',
          )
        }
      } catch (fallo) {
        problema(fallo instanceof Error ? fallo.message : String(fallo))
      }
      continue
    }

    const contrasena = contrasenaDeUnSoloUso()
    const { error } = await db.auth.admin.createUser({
      email,
      password: contrasena,
      email_confirm: true,
      // app_metadata, NUNCA user_metadata: user_metadata lo puede cambiar el
      // propio usuario, y ahi dentro va el clinica_id del que depende la RLS
      // entera. Un usuario que se edita su clinica_id es un usuario que lee la
      // clinica de al lado.
      app_metadata: { rol: usuario.rol, clinica_id: clinicaId },
    })
    if (error) {
      problema(`Creando ${email}: ${error.message}`)
      continue
    }

    // ---------------------------------------------------------------------
    // Y AHORA SE COMPRUEBA QUE ENTRA DE VERDAD
    // ---------------------------------------------------------------------
    // Crear el usuario sin error no demuestra que pueda entrar, y sobre todo
    // no demuestra que sus permisos viajen dentro del token —que es de lo que
    // depende la RLS—. Asi que se inicia sesion una vez, de verdad, con la
    // clave anonima (el mismo camino que la pantalla de entrar) y se mira el
    // JWT emitido. La contrasena de un solo uso no se imprime en ningun sitio.
    const comoUsuario = createClient(url, anon, { auth: { persistSession: false } })
    const { data: sesion, error: errorSesion } = await comoUsuario.auth.signInWithPassword({
      email,
      password: contrasena,
    })

    if (errorSesion || !sesion?.session) {
      problema(`${email} se ha creado pero NO ha podido entrar: ${errorSesion?.message ?? 'sin sesion'}`)
      continue
    }

    const cuerpo = cuerpoDelToken(sesion.session.access_token)
    const enToken = cuerpo?.app_metadata ?? {}
    if (enToken.clinica_id !== clinicaId || enToken.rol !== usuario.rol) {
      problema(
        `${email} entra, pero su token no lleva los permisos esperados ` +
          `(rol=${enToken.rol}, clinica_id=${enToken.clinica_id}). La RLS no le dejaria ver lo suyo.`,
      )
      continue
    }
    if (cuerpo?.user_metadata?.clinica_id || cuerpo?.user_metadata?.rol) {
      problema(`${email} lleva rol o clinica_id en user_metadata. Eso lo puede cambiar el usuario.`)
      continue
    }
    await comoUsuario.auth.signOut()

    const { data: enlace, error: errorEnlace } = await db.auth.admin.generateLink({
      type: 'recovery',
      email,
    })
    if (errorEnlace) {
      aviso(
        `${email}: creado y comprobado, pero no se ha podido generar el enlace para que ponga ` +
          `su contrasena (${errorEnlace.message}). Mandale un correo de recuperacion desde ` +
          'Supabase > Authentication > Users.',
      )
    } else {
      enlaces.push([email, enlace.properties?.action_link ?? '(sin enlace)'])
    }

    ok(`${email} · rol ${usuario.rol} · creado y comprobado entrando de verdad`)
  }

  // -------------------------------------------------------------------------
  // 5 · Lo que no se puede hacer desde aqui
  // -------------------------------------------------------------------------
  pendiente.push(
    `Anadir el par a WHATSAPP_CLINICAS **y volver a publicar**:\n` +
      `        "${ficha.wa_phone_number_id}": "${clinicaId}"\n` +
      '        Van las dos cosas o ninguna: la variable sola no llega a produccion hasta que\n' +
      '        se vuelve a publicar, y hasta entonces el canal rechaza sus mensajes Y no\n' +
      '        manda recordatorios, que es lo que no nota nadie.',
  )
  pendiente.push(
    'Aprobar sus plantillas en el panel de Meta y comprobar el ORDEN de los parametros:\n' +
      '        pnpm alta:comprobar <slug> --plantilla <movil>   (manda un centinela de verdad)\n' +
      '        Ver `entregas/plantillas-meta.md`. Esto no se puede comprobar desde el codigo.',
  )

  titulo('El alta NO esta terminada')
  console.log(
    '  Lo de arriba es lo que se puede escribir desde aqui. Quedan dos cosas que no, y\n' +
      '  ninguna de las dos da error cuando falta:\n',
  )
  pendiente.forEach((p, i) => console.log(`   ${i + 1}. ${p}\n`))

  if (enlaces.length > 0) {
    titulo('Enlaces para que cada uno ponga su contrasena')
    console.log('  Caducan y son de un solo uso. Mandaselos por un canal privado, uno a uno.\n')
    for (const [email, url] of enlaces) console.log(`   ${email}\n     ${url}\n`)
  }

  titulo('Y despues, el acta')
  console.log(
    `  pnpm alta:comprobar ${ficha.slug}\n\n` +
      '  Comprueba los cinco puntos contra la base de verdad, con SUS datos, y pasa la\n' +
      '  barandilla 4 contra esta clinica. Mientras no salga, el alta no esta comprobada:\n' +
      '  "no he podido comprobarlo" no es lo mismo que "esta todo bien".\n',
  )

  if (problemas.length > 0) {
    console.error(`\n  🔴  ${problemas.length} cosa(s) han salido mal. Repasalas antes de seguir.\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal()
}
