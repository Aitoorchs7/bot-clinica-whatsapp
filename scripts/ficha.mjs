/**
 * La ficha de una clinica: leerla y VALIDARLA antes de tocar la base.
 *
 * Es la entrada de `pnpm alta`. Vive aparte del script que escribe —igual que
 * `bloques-a-filas.mjs` vive aparte de `sembrar-bloques.mjs`— por un motivo muy
 * concreto: esto es lo unico del alta que se puede comprobar sin base de datos
 * y sin red, asi que corre en la suite de siempre (`tests/alta/01-ficha.test.ts`)
 * y por tanto en CI. Lo demas necesita un Supabase delante.
 *
 * ===========================================================================
 * POR QUE VALIDA TANTO, Y POR QUE SE PARA EN VEZ DE RELLENAR HUECOS
 * ===========================================================================
 *
 * Un alta a medias no se ve. La clinica queda creada, el panel entra, la lista
 * de tratamientos se ve bien... y falta `mensaje_urgencia`, asi que el dia que
 * alguien escriba «me duele muchisimo» recibira el texto por defecto en vez del
 * de su clinica. Nadie se entera hasta que se entera un paciente.
 *
 * Por eso aqui no hay valores por defecto para nada que el bot vaya a DECIR:
 * si falta, se para y se dice que falta. Lo unico que tiene defecto son cosas
 * de infraestructura que no se pronuncian (`zona_horaria`, `trato`).
 *
 * Y por eso una clave de mas es un error y no un aviso: `horario` en vez de
 * `horarios` es un alta sin horarios, y una clinica sin horarios es un bot que
 * contesta «no tengo huecos» para siempre, con toda naturalidad.
 */

/**
 * El vocabulario cerrado de `motivo_visita`, copiado de la migracion 002.
 *
 * ESTA COPIA ES DELIBERADA Y TIENE UNA PRUEBA QUE LA VIGILA. El original es un
 * `enum` de Postgres y su espejo en TypeScript es `MOTIVOS` de
 * `src/lib/bot/validacion.ts`; este archivo es `.mjs` y no puede importarlo.
 * `tests/alta/01-ficha.test.ts` exige que las tres listas coincidan —la de
 * aqui, la de TypeScript y la del .sql—, asi que el dia que alguien anada un
 * motivo en una sola de ellas, se pone rojo.
 *
 * Si una clinica pide un motivo que no esta: se anade EN UNA MIGRACION, nunca
 * como texto libre. Es lo que mantiene el sistema fuera del Art. 9 del RGPD.
 */
export const MOTIVOS = ['revision', 'urgencia', 'estetica', 'ortodoncia', 'otro']

/** Los tres roles del panel. Espejo de `ROLES` en src/lib/panel/sesion.ts. */
export const ROLES = ['propietario', 'recepcion', 'lectura']

/**
 * Las dos claves de `config` sin las que el bot dice algo que no es de esta
 * clinica. No son opcionales y no tienen valor por defecto aqui:
 *
 *   politica_privacidad · el bloque «05 - Aviso inicial» la pide en el primer
 *     mensaje de cada conversacion. Sin ella el prompt dice, literalmente,
 *     «(esta clinica no ha configurado su politica de privacidad)».
 *   mensaje_urgencia · lo que recibe quien escribe con dolor. Sin ella sale el
 *     texto por defecto de `clasificador.ts`: correcto, pero no es suyo.
 */
export const CLAVES_OBLIGATORIAS = ['politica_privacidad', 'mensaje_urgencia']

/**
 * El codigo de tratamiento que usa el canario del acta de alta, y que por eso
 * ninguna clinica puede tener. Ver `tests/alta/02-acta.comprobacion.ts`.
 */
export const CODIGO_RESERVADO = 'CANARIO'

/** `dia_semana` de la migracion 002: 0 = domingo ... 6 = sabado. */
export const DIAS = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

const CLAVES_DE_FICHA = [
  'slug',
  'nombre',
  'telefono_recepcion',
  'email_avisos',
  'zona_horaria',
  'trato',
  'nombre_bot',
  'wa_phone_number_id',
  'wa_waba_id',
  'config',
  'gabinetes',
  'horarios',
  'tratamientos',
  'faq',
  'usuarios',
]

const E164 = /^\+[1-9][0-9]{7,14}$/
const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const CLAVE_CONFIG = /^[a-z][a-z0-9_]{1,40}$/
const CODIGO = /^[A-Z0-9_-]{1,12}$/
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const SOLO_DIGITOS = /^[0-9]{5,30}$/

function esObjeto(valor) {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : ''
}

/**
 * Comprueba la ficha entera y devuelve TODOS los fallos, no el primero.
 *
 * Quien esta dando de alta una clinica esta al telefono con ella: una lista
 * completa se resuelve en una llamada, y un fallo cada vez son cinco.
 */
export function validarFicha(ficha) {
  const errores = []
  const avisos = []
  const mal = (mensaje) => errores.push(mensaje)

  if (!esObjeto(ficha)) {
    return { errores: ['La ficha tiene que ser un objeto JSON.'], avisos }
  }

  // -------------------------------------------------------------------------
  // Claves de mas. Un `horario` por `horarios` es un alta sin horarios.
  // -------------------------------------------------------------------------
  for (const clave of Object.keys(ficha)) {
    if (!CLAVES_DE_FICHA.includes(clave)) {
      mal(
        `La ficha tiene una clave que no existe: "${clave}". Las que se admiten son: ` +
          `${CLAVES_DE_FICHA.join(', ')}. Se para aqui a proposito: una clave mal escrita ` +
          'seria una parte del alta que no se hace y que nadie echa de menos.',
      )
    }
  }

  // -------------------------------------------------------------------------
  // La clinica
  // -------------------------------------------------------------------------
  const slug = texto(ficha.slug)
  if (!SLUG.test(slug)) {
    mal('slug: minusculas, numeros y guiones, entre 3 y 40 caracteres. Ej: "sonrisa-viva".')
  }
  if (!texto(ficha.nombre)) mal('nombre: el nombre de la clinica, como lo dice ella.')
  if (!E164.test(texto(ficha.telefono_recepcion))) {
    mal(
      'telefono_recepcion: en formato internacional, ej. "+34912345678". Es el numero que ' +
        'da el bot cuando escala y el que sale en el mensaje de urgencia.',
    )
  }
  if (!CORREO.test(texto(ficha.email_avisos))) {
    mal('email_avisos: un correo valido. Es donde llega el aviso cuando el bot pasa a una persona.')
  }
  if (ficha.trato !== undefined && !['usted', 'tu'].includes(ficha.trato)) {
    mal('trato: "usted" o "tu". Sin valor, "usted".')
  }
  if (ficha.zona_horaria !== undefined && !texto(ficha.zona_horaria)) {
    mal('zona_horaria: vacia. Quitala para usar "Europe/Madrid" o pon una.')
  }
  if (ficha.nombre_bot !== undefined && !texto(ficha.nombre_bot)) {
    mal('nombre_bot: vacio. Quitalo para usar "Asistente" o pon el nombre que quiera la clinica.')
  }

  // -------------------------------------------------------------------------
  // El canal. Es el punto 1 de los cinco y el que mas caro sale si falta.
  // -------------------------------------------------------------------------
  if (!SOLO_DIGITOS.test(texto(ficha.wa_phone_number_id))) {
    mal(
      'wa_phone_number_id: el identificador del numero de la clinica dentro de la WABA ' +
        '(solo digitos, lo da el panel de Meta). Sin el, el canal rechaza sus mensajes Y ' +
        'ademas se queda sin mandar recordatorios, que es lo que no nota nadie hasta que ' +
        'alguien no se presenta a una cita.',
    )
  }
  if (ficha.wa_waba_id !== undefined && !SOLO_DIGITOS.test(texto(ficha.wa_waba_id))) {
    mal('wa_waba_id: solo digitos, o quitalo.')
  }

  // -------------------------------------------------------------------------
  // config
  // -------------------------------------------------------------------------
  if (!esObjeto(ficha.config)) {
    mal('config: un objeto {clave: {valor, publico}}.')
  } else {
    for (const [clave, fila] of Object.entries(ficha.config)) {
      if (!CLAVE_CONFIG.test(clave)) {
        mal(`config.${clave}: la clave va en minusculas con guiones bajos.`)
        continue
      }
      if (!esObjeto(fila)) {
        mal(`config.${clave}: tiene que ser {"valor": "...", "publico": true|false}.`)
        continue
      }
      if (!texto(fila.valor)) mal(`config.${clave}.valor: no puede estar vacio.`)
      if (typeof fila.publico !== 'boolean') {
        mal(
          `config.${clave}.publico: pon true o false a mano. No hay valor por defecto a ` +
            'proposito: "publico" decide si el bot lo ve, y eso no se adivina.',
        )
      }
      if (fila.comentario !== undefined && typeof fila.comentario !== 'string') {
        mal(`config.${clave}.comentario: texto, o quitalo.`)
      }
    }

    for (const clave of CLAVES_OBLIGATORIAS) {
      const fila = ficha.config[clave]
      if (!esObjeto(fila) || !texto(fila.valor)) {
        mal(
          `config.${clave}: falta. ${porqueHaceFalta(clave)} ` +
            'Es uno de los cinco puntos del alta; sin el, el alta esta a medias y no se ve.',
        )
        continue
      }
      // Esta es la trampa fina: la fila existe, pero el bot no la ve.
      // `montaje.ts` y `clasificador.ts` leen de las filas YA FILTRADAS por la
      // RLS, asi que una clave obligatoria con publico=false se comporta
      // exactamente igual que una clave que no existe.
      if (fila.publico !== true) {
        mal(
          `config.${clave}.publico: tiene que ser true. Con false la fila existe pero el bot ` +
            'no la recibe —la RLS no se la devuelve—, y el resultado es el mismo que si ' +
            'faltara, solo que mirando la base parece que esta puesta.',
        )
      }
    }
  }

  // -------------------------------------------------------------------------
  // gabinetes
  // -------------------------------------------------------------------------
  const gabinetes = Array.isArray(ficha.gabinetes) ? ficha.gabinetes.map(texto) : null
  if (!gabinetes || gabinetes.length === 0) {
    mal('gabinetes: al menos uno. Un gabinete es un sillon: lo que no se puede duplicar a la vez.')
  } else {
    if (gabinetes.some((g) => !g)) mal('gabinetes: hay uno sin nombre.')
    if (new Set(gabinetes).size !== gabinetes.length) mal('gabinetes: hay nombres repetidos.')
  }

  // -------------------------------------------------------------------------
  // horarios
  // -------------------------------------------------------------------------
  if (!Array.isArray(ficha.horarios) || ficha.horarios.length === 0) {
    mal(
      'horarios: al menos un tramo. Sin horarios, `consultar_huecos` no devuelve ni uno y el ' +
        'bot contesta que no hay citas libres para siempre, sin dar ningun error.',
    )
  } else {
    ficha.horarios.forEach((tramo, i) => {
      const donde = `horarios[${i}]`
      if (!esObjeto(tramo)) {
        mal(`${donde}: tiene que ser {"dia": "lunes", "de": "09:00", "a": "14:00"}.`)
        return
      }
      if (!(texto(tramo.dia) in DIAS)) {
        mal(`${donde}.dia: uno de ${Object.keys(DIAS).join(', ')} (sin acentos).`)
      }
      if (!HORA.test(texto(tramo.de))) mal(`${donde}.de: hora local en formato HH:MM.`)
      if (!HORA.test(texto(tramo.a))) mal(`${donde}.a: hora local en formato HH:MM.`)
      if (HORA.test(texto(tramo.de)) && HORA.test(texto(tramo.a)) && texto(tramo.de) >= texto(tramo.a)) {
        mal(`${donde}: "de" tiene que ser anterior a "a". Un descanso son DOS tramos, no uno.`)
      }
    })
  }

  // -------------------------------------------------------------------------
  // tratamientos
  // -------------------------------------------------------------------------
  if (!Array.isArray(ficha.tratamientos) || ficha.tratamientos.length === 0) {
    mal('tratamientos: al menos uno, o el bot no tiene nada que ofrecer.')
  } else {
    const codigos = new Set()
    let publicos = 0

    ficha.tratamientos.forEach((t, i) => {
      const donde = `tratamientos[${i}]`
      if (!esObjeto(t)) {
        mal(`${donde}: tiene que ser un objeto.`)
        return
      }
      const codigo = texto(t.codigo)
      if (!CODIGO.test(codigo)) {
        mal(`${donde}.codigo: mayusculas, numeros, guion o guion bajo. Ej: "REV", "ORTO".`)
      } else if (codigo === CODIGO_RESERVADO) {
        // El acta del alta siembra y borra un tratamiento con este codigo para
        // demostrar que la RLS filtra. Si una clinica lo usara, el barrido del
        // acta se llevaria por delante un tratamiento suyo.
        mal(
          `${donde}.codigo: "${CODIGO_RESERVADO}" esta reservado para el canario del acta de ` +
            'alta. Ponle otro.',
        )
      } else if (codigos.has(codigo)) {
        mal(`${donde}.codigo: "${codigo}" esta repetido. La base no admite dos iguales.`)
      } else {
        codigos.add(codigo)
      }

      if (!texto(t.nombre)) mal(`${donde}.nombre: el nombre del tratamiento.`)
      if (!Number.isInteger(t.duracion_min) || t.duracion_min < 5 || t.duracion_min > 480) {
        mal(`${donde}.duracion_min: un entero de minutos entre 5 y 480.`)
      }
      if (typeof t.publico !== 'boolean') {
        mal(`${donde}.publico: true o false a mano. Ante la duda, false.`)
      } else if (t.publico) {
        publicos += 1
      }
      if (t.frase_bot !== undefined && typeof t.frase_bot !== 'string') {
        mal(`${donde}.frase_bot: texto, o quitalo.`)
      }
      if (t.gabinete !== undefined) {
        const nombre = texto(t.gabinete)
        if (!nombre) mal(`${donde}.gabinete: vacio. Quitalo si sirve cualquier gabinete.`)
        else if (gabinetes && !gabinetes.includes(nombre)) {
          mal(`${donde}.gabinete: "${nombre}" no esta en la lista de gabinetes.`)
        }
      }

      // EL VOCABULARIO CERRADO. Aqui es donde se caza un motivo inventado.
      if (t.motivo !== undefined && !MOTIVOS.includes(t.motivo)) {
        mal(
          `${donde}.motivo: "${t.motivo}" no es uno de los motivos de visita. Los que hay son ` +
            `${MOTIVOS.join(', ')}. Un motivo nuevo NO se apana aqui con texto libre: se anade ` +
            'en una migracion al enum `motivo_visita`, que es lo que mantiene el sistema fuera ' +
            'del Art. 9 del RGPD.',
        )
      }

      for (const clave of Object.keys(t)) {
        if (!['codigo', 'nombre', 'duracion_min', 'gabinete', 'frase_bot', 'publico', 'motivo'].includes(clave)) {
          mal(`${donde}: clave desconocida "${clave}".`)
        }
      }
    })

    if (publicos === 0) {
      mal(
        'tratamientos: ninguno es publico. El bot no veria ni uno, asi que no podria ofrecer ' +
          'ninguna cita. Si es a proposito, di cual es publico antes de seguir.',
      )
    }
  }

  // -------------------------------------------------------------------------
  // faq
  // -------------------------------------------------------------------------
  if (ficha.faq !== undefined) {
    if (!Array.isArray(ficha.faq)) {
      mal('faq: una lista, aunque este vacia.')
    } else {
      ficha.faq.forEach((f, i) => {
        const donde = `faq[${i}]`
        if (!esObjeto(f)) {
          mal(`${donde}: {"pregunta": "...", "respuesta": "...", "publico": true|false}.`)
          return
        }
        if (!texto(f.pregunta)) mal(`${donde}.pregunta: no puede estar vacia.`)
        if (!texto(f.respuesta)) {
          mal(
            `${donde}.respuesta: la respuesta APROBADA, palabra por palabra. El bot la dice ` +
              'literal; no la reformula.',
          )
        }
        if (typeof f.publico !== 'boolean') {
          mal(`${donde}.publico: true o false a mano. Ante la duda, false.`)
        }
        if (f.categoria !== undefined && typeof f.categoria !== 'string') {
          mal(`${donde}.categoria: texto, o quitala.`)
        }
        for (const clave of Object.keys(f)) {
          if (!['pregunta', 'respuesta', 'publico', 'categoria'].includes(clave)) {
            mal(`${donde}: clave desconocida "${clave}".`)
          }
        }
      })
    }
  }

  // -------------------------------------------------------------------------
  // usuarios del panel · el punto 4 de los cinco
  // -------------------------------------------------------------------------
  if (!Array.isArray(ficha.usuarios) || ficha.usuarios.length === 0) {
    mal(
      'usuarios: al menos uno. Una clinica sin usuarios tiene panel y no tiene con que entrar, ' +
        'y eso no da ningun error: la pantalla de entrar funciona perfectamente.',
    )
  } else {
    const correos = new Set()
    let propietarios = 0
    ficha.usuarios.forEach((u, i) => {
      const donde = `usuarios[${i}]`
      if (!esObjeto(u)) {
        mal(`${donde}: {"email": "...", "rol": "propietario"}.`)
        return
      }
      const email = texto(u.email).toLowerCase()
      if (!CORREO.test(email)) mal(`${donde}.email: un correo valido.`)
      else if (correos.has(email)) mal(`${donde}.email: "${email}" esta repetido.`)
      else correos.add(email)

      if (!ROLES.includes(u.rol)) mal(`${donde}.rol: uno de ${ROLES.join(', ')}.`)
      if (u.rol === 'propietario') propietarios += 1

      for (const clave of Object.keys(u)) {
        if (!['email', 'rol'].includes(clave)) mal(`${donde}: clave desconocida "${clave}".`)
      }
    })
    if (propietarios === 0) {
      mal('usuarios: hace falta al menos un "propietario". Es el unico rol que puede borrar.')
    }
  }

  // -------------------------------------------------------------------------
  // Avisos: no paran el alta, pero se dicen
  // -------------------------------------------------------------------------
  if (Array.isArray(ficha.faq) && ficha.faq.length === 0) {
    avisos.push(
      'La clinica no trae ninguna pregunta frecuente. El bot podra coger citas, pero a ' +
        'cualquier pregunta contestara que se la pasa a una persona.',
    )
  }
  if (esObjeto(ficha.config)) {
    const confidenciales = Object.values(ficha.config).filter((f) => esObjeto(f) && f.publico === false)
    if (confidenciales.length === 0) {
      avisos.push(
        'No hay ni una fila confidencial (publico=false) en config. No es un fallo, pero ' +
          'conviene mirarlo dos veces: casi toda clinica tiene algo que el bot no debe decir, ' +
          'y si no hay nada marcado, puede ser que no se haya preguntado.',
      )
    }
  }

  return { errores, avisos }
}

function porqueHaceFalta(clave) {
  if (clave === 'politica_privacidad') {
    return (
      'La pide el bloque «05 - Aviso inicial»: el bot tiene que enlazarla en el primer ' +
      'mensaje de cada conversacion. Sin ella el prompt dice «(esta clinica no ha configurado ' +
      'su politica de privacidad)».'
    )
  }
  if (clave === 'mensaje_urgencia') {
    return (
      'Es lo que recibe quien escribe con dolor, hinchazon, un golpe o sangrado. Sin ella sale ' +
      'el texto por defecto: correcto y con su telefono, pero generico.'
    )
  }
  return ''
}

/** Lee el JSON y lo valida. Devuelve la ficha y la lista de fallos. */
export async function leerFicha(ruta) {
  const { readFile } = await import('node:fs/promises')
  let crudo
  try {
    crudo = await readFile(ruta, 'utf8')
  } catch {
    return { ficha: null, errores: [`No se ha podido leer "${ruta}".`], avisos: [] }
  }

  let ficha
  try {
    ficha = JSON.parse(crudo)
  } catch (fallo) {
    return {
      ficha: null,
      errores: [`"${ruta}" no es un JSON valido: ${fallo.message}`],
      avisos: [],
    }
  }

  return { ficha, ...validarFicha(ficha) }
}
