/**
 * Siembra dos clinicas completas, A y B, con filas publicas y confidenciales.
 *
 * Las confidenciales llevan el MARCADOR. La regla que prueban todos los tests
 * de esta carpeta es la misma: el bot no debe ver NUNCA una fila con el
 * marcador, ni de su clinica ni de la otra.
 *
 * Se siembra con service_role, que salta la RLS. Es el unico uso que admite
 * .claude/CLAUDE.md: scripts de alta. Si sembraramos con el cliente del bot,
 * los tests probarian la RLS contra datos que la RLS misma dejo entrar, y no
 * probarian nada.
 */
// El mismo lector que usa `pnpm bloques`. Las pruebas no pueden sembrar un
// prompt distinto del que se siembra en produccion: seria comprobar otra cosa.
import { filasParaClinica } from '../../scripts/bloques-a-filas.mjs'

import { MARCADOR, URL_SUPABASE, exigirQueNoSeaProduccion } from './entorno'
import { clienteServicio } from './clientes'

export const CONTRASENA = 'prueba-rls-2026-Aa!'

export const USUARIOS = {
  aPropietario: { email: 'rls-a-propietario@ejemplo.test', rol: 'propietario' },
  aRecepcion: { email: 'rls-a-recepcion@ejemplo.test', rol: 'recepcion' },
  aLectura: { email: 'rls-a-lectura@ejemplo.test', rol: 'lectura' },
  bPropietario: { email: 'rls-b-propietario@ejemplo.test', rol: 'propietario' },
} as const

const SLUGS = ['rls-prueba-a', 'rls-prueba-b'] as const

/**
 * El `phone_number_id` de cada clinica dentro de la WABA.
 *
 * Lo necesita F4: es lo que dice de que clinica es cada webhook. La resolucion
 * arranca en `WHATSAPP_CLINICAS` (entorno) porque la RLS del rol `bot` exige
 * saber ya de que clinica eres, pero despues se COMPRUEBA contra esta columna,
 * y sin sembrarla la comprobacion falla siempre.
 *
 * Dos distintos a proposito: sirven para probar que un webhook de la clinica B
 * no se atiende con la identidad de la A.
 */
export const NUMERO_WA_A = '900000000000001'
export const NUMERO_WA_B = '900000000000002'

export type Sembrado = {
  clinicaA: string
  clinicaB: string
  /** El `phone_number_id` de cada una. Lo usa el canal de WhatsApp (F4). */
  numeroWaA: string
  numeroWaB: string
  gabineteA1: string
  gabineteA2: string
  gabineteB1: string
  tratamientoAPublico: string
  tratamientoAConfidencial: string
  tratamientoBPublico: string
  faqAPublica: string
  faqAConfidencial: string
  faqBPublica: string
  configAPublica: string
  configAPrivacidad: string
  configAConfidencial: string
  bloqueAActivo: string
  bloqueAInactivo: string
  /** Cuantos bloques reales se sembraron, y cuantos de ellos activos. */
  bloquesReales: number
  bloquesRealesActivos: number
  pacienteA: string
  pacienteB: string
  conversacionA: string
  conversacionB: string
  citaA: string
  mensajeA: number
  mensajeB: number
  escaladoA: string
  eventoWebhookA: number
  eventoA: number
  auditoriaA: number
}

type Cliente = ReturnType<typeof clienteServicio>

async function insertar<T extends Record<string, unknown>>(
  db: Cliente,
  tabla: string,
  fila: T,
): Promise<{ id: string }> {
  const { data, error } = await db.from(tabla).insert(fila).select('id').single()
  if (error) throw new Error(`Sembrando ${tabla}: ${error.message}`)
  return data as { id: string }
}

/**
 * Cerrojo antes de sembrar.
 *
 * La siembra usa service_role, crea cuatro usuarios con una contrasena que esta
 * escrita en este archivo y, al limpiar, borra clinicas en cascada. Apuntada al
 * proyecto equivocado es la operacion mas destructiva de todo el repositorio, y
 * lo unico que decide a que proyecto apunta es un `.env.local` que nadie mira.
 *
 * No se fia del nombre del proyecto: comprueba el contenido. Una base de datos
 * de desarrollo no tiene pacientes ni citas que no sean de las clinicas de
 * prueba. Si los tiene, esto es produccion, o es la base de otra persona.
 */
async function exigirBaseDeDesarrollo(db: Cliente): Promise<void> {
  if (process.env.SIEMBRA_FORZAR === '1') {
    console.warn('  ⚠  SIEMBRA_FORZAR=1: sembrando sin comprobar que la base sea de desarrollo.')
    return
  }

  const { data: dePrueba } = await db
    .from('clinicas')
    .select('id')
    .in('slug', SLUGS as unknown as string[])
  const ajenas = (dePrueba ?? []).map((c) => (c as { id: string }).id)

  const ajenos: string[] = []
  for (const tabla of ['pacientes', 'citas'] as const) {
    let consulta = db.from(tabla).select('id', { count: 'exact', head: true })
    if (ajenas.length > 0) {
      consulta = consulta.not('clinica_id', 'in', `(${ajenas.join(',')})`)
    }
    const { count, error } = await consulta
    // Un error aqui (tabla que no existe, migraciones sin aplicar) no es motivo
    // para bloquear: que falle mas adelante con su propio mensaje.
    if (error) continue
    if ((count ?? 0) > 0) ajenos.push(`${count} en ${tabla}`)
  }

  if (ajenos.length > 0) {
    throw new Error(
      [
        'La siembra se ha detenido: esta base de datos NO parece de desarrollo.',
        `Tiene filas que no son de las clinicas de prueba: ${ajenos.join(', ')}.`,
        '',
        'Sembrar aqui crearia usuarios con una contrasena publica y, al limpiar,',
        'borraria clinicas en cascada. Revisa NEXT_PUBLIC_SUPABASE_URL en .env.local.',
        '',
        'Si de verdad es la base correcta: SIEMBRA_FORZAR=1 pnpm test',
      ].join('\n'),
    )
  }
}

export async function limpiar(): Promise<void> {
  // Antes que nada: limpiar es borrar clinicas en cascada. El cerrojo va antes
  // de crear el cliente, para que contra produccion no salga ni una peticion.
  exigirQueNoSeaProduccion(URL_SUPABASE, 'La limpieza de las pruebas')
  const db = clienteServicio()

  // Borrar la clinica arrastra en cascada todo lo suyo.
  const { error } = await db.from('clinicas').delete().in('slug', SLUGS as unknown as string[])
  if (error) throw new Error(`Limpiando clinicas: ${error.message}`)

  const correos: string[] = Object.values(USUARIOS).map((u) => u.email)
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const usuario of data?.users ?? []) {
    if (usuario.email && correos.includes(usuario.email)) {
      await db.auth.admin.deleteUser(usuario.id)
    }
  }
}

export async function sembrar(): Promise<Sembrado> {
  // Dos cerrojos, y en este orden. El primero reconoce produccion por su nombre
  // y no manda nada; el segundo, por lo que tiene dentro. Una produccion recien
  // creada no tiene pacientes ni citas y solo la para el primero (ESTADO_F9 §1).
  exigirQueNoSeaProduccion(URL_SUPABASE, 'La siembra de las pruebas')
  const db = clienteServicio()
  await exigirBaseDeDesarrollo(db)
  await limpiar()

  // ---------------------------------------------------------------------------
  // Clinicas
  // ---------------------------------------------------------------------------
  const clinicaA = await insertar(db, 'clinicas', {
    nombre: 'Clinica de prueba A',
    slug: 'rls-prueba-a',
    wa_phone_number_id: NUMERO_WA_A,
    telefono_recepcion: '+34910000001',
    email_avisos: 'avisos-a@ejemplo.test',
    zona_horaria: 'Europe/Madrid',
  })
  const clinicaB = await insertar(db, 'clinicas', {
    nombre: 'Clinica de prueba B',
    slug: 'rls-prueba-b',
    wa_phone_number_id: NUMERO_WA_B,
    telefono_recepcion: '+34910000002',
    email_avisos: 'avisos-b@ejemplo.test',
    zona_horaria: 'Europe/Madrid',
  })

  // ---------------------------------------------------------------------------
  // Gabinetes y horarios
  // ---------------------------------------------------------------------------
  const gabineteA1 = await insertar(db, 'gabinetes', {
    clinica_id: clinicaA.id,
    nombre: 'Gabinete 1',
  })
  const gabineteA2 = await insertar(db, 'gabinetes', {
    clinica_id: clinicaA.id,
    nombre: 'Gabinete 2',
  })
  const gabineteB1 = await insertar(db, 'gabinetes', {
    clinica_id: clinicaB.id,
    nombre: 'Gabinete 1',
  })

  // Los dos tramos de V1: 9:00-14:00 y 15:30-20:00, de lunes a viernes.
  const horarios = []
  for (const clinica of [clinicaA.id, clinicaB.id]) {
    for (let dia = 1; dia <= 5; dia += 1) {
      horarios.push(
        { clinica_id: clinica, dia_semana: dia, hora_inicio: '09:00', hora_fin: '14:00' },
        { clinica_id: clinica, dia_semana: dia, hora_inicio: '15:30', hora_fin: '20:00' },
      )
    }
  }
  const errHorarios = (await db.from('horarios').insert(horarios)).error
  if (errHorarios) throw new Error(`Sembrando horarios: ${errHorarios.message}`)

  // ---------------------------------------------------------------------------
  // Conocimiento: una fila publica y una confidencial de cada cosa
  // ---------------------------------------------------------------------------
  const tratamientoAPublico = await insertar(db, 'tratamientos', {
    clinica_id: clinicaA.id,
    codigo: 'REV',
    nombre: 'Revision',
    duracion_min: 30,
    frase_bot: 'Una revision dura media hora.',
    publico: true,
  })
  const tratamientoAConfidencial = await insertar(db, 'tratamientos', {
    clinica_id: clinicaA.id,
    codigo: 'IMP',
    nombre: 'Implante',
    duracion_min: 60,
    frase_bot: `Margen interno ${MARCADOR}, no decir al paciente.`,
    publico: false,
  })
  const tratamientoBPublico = await insertar(db, 'tratamientos', {
    clinica_id: clinicaB.id,
    codigo: 'REV',
    nombre: 'Revision',
    duracion_min: 30,
    publico: true,
  })

  const faqAPublica = await insertar(db, 'faq', {
    clinica_id: clinicaA.id,
    pregunta: '¿Donde estais?',
    respuesta_aprobada: 'En la calle Mayor 1.',
    publico: true,
  })
  const faqAConfidencial = await insertar(db, 'faq', {
    clinica_id: clinicaA.id,
    pregunta: '¿Cual es el margen de un implante?',
    respuesta_aprobada: `El margen es ${MARCADOR}.`,
    publico: false,
  })
  const faqBPublica = await insertar(db, 'faq', {
    clinica_id: clinicaB.id,
    pregunta: '¿Donde estais?',
    respuesta_aprobada: 'En la plaza del Sol 2.',
    publico: true,
  })

  const configAPublica = await insertar(db, 'config', {
    clinica_id: clinicaA.id,
    clave: 'direccion',
    valor: 'Calle Mayor 1',
    publico: true,
  })
  // La usa el bloque «05 - Aviso inicial»: el enlace que el bot tiene que dar
  // en su primer mensaje sale de aqui, no del texto del prompt, para que la
  // clinica pueda cambiarlo sin tocar codigo.
  const configAPrivacidad = await insertar(db, 'config', {
    clinica_id: clinicaA.id,
    clave: 'politica_privacidad',
    valor: 'https://ejemplo.test/privacidad',
    publico: true,
  })
  const configAConfidencial = await insertar(db, 'config', {
    clinica_id: clinicaA.id,
    clave: 'margen_comercial',
    valor: MARCADOR,
    publico: false,
  })

  // Los bloques DE VERDAD, leidos de contenido/bloques/ por el mismo codigo que
  // usa el script de alta. La clinica A es la clinica de desarrollo: si el
  // prompt se monta aqui, se monta en produccion, porque es el mismo texto.
  const bloquesReales = filasParaClinica(clinicaA.id)
  const errBloques = (await db.from('bloques_prompt').insert(bloquesReales)).error
  if (errBloques) throw new Error(`Sembrando bloques_prompt: ${errBloques.message}`)

  // Y ademas, dos bloques de atrezo para las pruebas de RLS de F1. Van con
  // `orden` 900 y 910 para no chocar con los reales, y con el titulo empezando
  // por `_` para que el montador los descarte: asi la regla del guion bajo se
  // comprueba contra datos que existen de verdad, en vez de inventados.
  const bloqueAActivo = await insertar(db, 'bloques_prompt', {
    clinica_id: clinicaA.id,
    orden: 900,
    titulo: '_atrezo rls activo',
    contenido: 'Eres el asistente virtual de {{clinica}}.',
    activo: true,
  })
  const bloqueAInactivo = await insertar(db, 'bloques_prompt', {
    clinica_id: clinicaA.id,
    orden: 910,
    titulo: '_atrezo rls inactivo',
    contenido: `Borrador con ${MARCADOR}.`,
    activo: false,
  })

  // ---------------------------------------------------------------------------
  // Operacion
  // ---------------------------------------------------------------------------
  const pacienteA = await insertar(db, 'pacientes', {
    clinica_id: clinicaA.id,
    nombre: 'Ana',
    apellidos: 'Perez',
    telefono_e164: '+34600111222',
  })
  const pacienteB = await insertar(db, 'pacientes', {
    clinica_id: clinicaB.id,
    nombre: 'Luis',
    apellidos: 'Gomez',
    telefono_e164: '+34600333444',
  })

  const conversacionA = await insertar(db, 'conversaciones', {
    clinica_id: clinicaA.id,
    telefono_e164: '+34600111222',
    paciente_id: pacienteA.id,
  })
  const conversacionB = await insertar(db, 'conversaciones', {
    clinica_id: clinicaB.id,
    telefono_e164: '+34600333444',
    paciente_id: pacienteB.id,
  })

  // Manana a las 10:00 UTC. La hora exacta da igual: se inserta con
  // service_role, no por el RPC, y solo tiene que no chocar con nada.
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
  manana.setUTCHours(10, 0, 0, 0)
  const finCita = new Date(manana.getTime() + 30 * 60 * 1000)

  const citaA = await insertar(db, 'citas', {
    clinica_id: clinicaA.id,
    paciente_id: pacienteA.id,
    tratamiento_id: tratamientoAPublico.id,
    gabinete_id: gabineteA1.id,
    inicio: manana.toISOString(),
    fin: finCita.toISOString(),
    estado: 'confirmada',
    quien_reserva: 'bot',
    motivo_cerrado: 'revision',
    conversacion_id: conversacionA.id,
  })

  const mensajeA = await insertar(db, 'mensajes', {
    clinica_id: clinicaA.id,
    conversacion_id: conversacionA.id,
    rol: 'paciente',
    texto: 'Hola, queria pedir cita',
    wa_message_id: 'wamid.prueba.a.1',
  })
  const mensajeB = await insertar(db, 'mensajes', {
    clinica_id: clinicaB.id,
    conversacion_id: conversacionB.id,
    rol: 'paciente',
    texto: 'Buenas',
    wa_message_id: 'wamid.prueba.b.1',
  })

  // Ni una palabra de texto libre: `motivo` y `asunto` son enums, y el detalle
  // se sigue por el puntero al mensaje, que es lo que se purga a los 90 dias.
  const escaladoA = await insertar(db, 'escalados', {
    clinica_id: clinicaA.id,
    conversacion_id: conversacionA.id,
    mensaje_id: Number(mensajeA.id),
    motivo: 'pidio_persona',
    asunto: 'otro',
  })

  const eventoWebhookA = await insertar(db, 'eventos_webhook', {
    clinica_id: clinicaA.id,
    wa_event_id: 'evento.prueba.a.1',
    carga: { prueba: true },
  })

  const eventoA = await insertar(db, 'eventos', {
    clinica_id: clinicaA.id,
    tipo: 'contador_prompt',
    datos: { faq: { total: 2, publicas: 1 } },
  })

  const auditoriaA = await insertar(db, 'auditoria', {
    clinica_id: clinicaA.id,
    actor: 'siembra',
    accion: 'insert',
    tabla: 'faq',
    fila_id: faqAPublica.id,
  })

  // ---------------------------------------------------------------------------
  // Usuarios del panel. clinica_id y rol en app_metadata, NUNCA user_metadata.
  // ---------------------------------------------------------------------------
  for (const [clave, usuario] of Object.entries(USUARIOS)) {
    const clinicaId = clave.startsWith('a') ? clinicaA.id : clinicaB.id
    const { error } = await db.auth.admin.createUser({
      email: usuario.email,
      password: CONTRASENA,
      email_confirm: true,
      app_metadata: { rol: usuario.rol, clinica_id: clinicaId },
    })
    if (error) throw new Error(`Creando ${usuario.email}: ${error.message}`)
  }

  return {
    clinicaA: clinicaA.id,
    clinicaB: clinicaB.id,
    numeroWaA: NUMERO_WA_A,
    numeroWaB: NUMERO_WA_B,
    gabineteA1: gabineteA1.id,
    gabineteA2: gabineteA2.id,
    gabineteB1: gabineteB1.id,
    tratamientoAPublico: tratamientoAPublico.id,
    tratamientoAConfidencial: tratamientoAConfidencial.id,
    tratamientoBPublico: tratamientoBPublico.id,
    faqAPublica: faqAPublica.id,
    faqAConfidencial: faqAConfidencial.id,
    faqBPublica: faqBPublica.id,
    configAPublica: configAPublica.id,
    configAPrivacidad: configAPrivacidad.id,
    configAConfidencial: configAConfidencial.id,
    bloqueAActivo: bloqueAActivo.id,
    bloqueAInactivo: bloqueAInactivo.id,
    bloquesReales: bloquesReales.length,
    bloquesRealesActivos: bloquesReales.filter((b) => b.activo).length,
    pacienteA: pacienteA.id,
    pacienteB: pacienteB.id,
    conversacionA: conversacionA.id,
    conversacionB: conversacionB.id,
    citaA: citaA.id,
    mensajeA: Number(mensajeA.id),
    mensajeB: Number(mensajeB.id),
    escaladoA: escaladoA.id,
    eventoWebhookA: Number(eventoWebhookA.id),
    eventoA: Number(eventoA.id),
    auditoriaA: Number(auditoriaA.id),
  }
}
