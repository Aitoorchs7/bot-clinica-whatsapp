/**
 * El acta de un alta:  pnpm alta:comprobar <slug> [--plantilla <movil>]
 *
 * Esto es el lanzador. Lo que comprueba esta en
 * `tests/alta/02-acta.comprobacion.ts` (y el centinela de plantillas, en
 * `03-plantillas.comprobacion.ts`); aqui solo se ponen las variables, se
 * llama a vitest con SU configuracion —la que no siembra nada— y se escribe
 * el veredicto.
 *
 * POR QUE EL VEREDICTO NUNCA DICE «APTO» A SECAS
 *
 * De los cinco puntos del alta hay uno que no se puede comprobar desde el
 * codigo: el orden de los parametros de las plantillas aprobadas en Meta. Un
 * comando que dijera «todo correcto» habiendo mirado cuatro de cinco es
 * exactamente lo que `.claude/CLAUDE.md` prohibe: «no he podido comprobarlo»
 * nunca se informa igual que «esta todo bien».
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const AZUL = '\u001b[36m'
const FIN = '\u001b[0m'

function principal() {
  const argumentos = process.argv.slice(2)
  const iPlantilla = argumentos.indexOf('--plantilla')
  const movil = iPlantilla === -1 ? undefined : argumentos[iPlantilla + 1]
  // Ojo con el -1: `iPlantilla + 1` seria 0, que es justo donde va el slug.
  const iMovil = iPlantilla === -1 ? -1 : iPlantilla + 1
  const slug = argumentos.filter((a, i) => !a.startsWith('--') && i !== iMovil)[0]

  if (!slug) {
    console.error(
      'Uso: pnpm alta:comprobar <slug> [--plantilla +34...]\n' +
        '\n' +
        '  <slug>        el de la ficha con la que se dio de alta\n' +
        '  --plantilla   ademas, manda un centinela de `recordatorio_cita` a ese movil\n' +
        '                para comprobar el ORDEN de los parametros aprobados en Meta.\n' +
        '                Manda un WhatsApp DE VERDAD. Ver entregas/plantillas-meta.md.\n',
    )
    process.exitCode = 1
    return
  }

  console.log(
    `\n${AZUL}ACTA DE ALTA · ${slug}${FIN}\n` +
      '\n' +
      '  Cuatro de los cinco puntos se comprueban aqui, contra la base de datos a la que\n' +
      '  apunte .env.local y con los datos de esta clinica. El quinto no se puede\n' +
      '  comprobar desde el codigo y se dice al final.\n',
  )

  const entorno = { ...process.env, ALTA_SLUG: slug }
  if (movil) entorno.ALTA_PLANTILLA_A = movil

  // Se lanza el .mjs de vitest con este mismo node, y no `pnpm exec`: en
  // Windows, spawn de un .cmd sin `shell: true` da EINVAL desde Node 20 (y
  // `shell: true` mete el comando por un interprete, que es como se cuelan
  // las comillas). Asi es una llamada directa y se comporta igual en los dos
  // sistemas.
  // Por el package.json y no por 'vitest/vitest.mjs': el campo `exports` del
  // paquete no publica esa ruta y `require.resolve` la rechaza.
  const require = createRequire(import.meta.url)
  const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

  const hijo = spawn(process.execPath, [vitest, 'run', '--config', 'vitest.alta.mts'], {
    stdio: 'inherit',
    env: entorno,
  })

  hijo.on('exit', (codigo) => {
    if (codigo === 0) {
      console.log(
        `\n${AZUL}Cuatro de cinco, comprobados${FIN}\n` +
          '\n' +
          '  ✅ 1 · El canal: la fila tiene su wa_phone_number_id y WHATSAPP_CLINICAS lleva\n' +
          '         su par, en los dos sentidos (webhook y recordatorios).\n' +
          '  ✅ 2 · mensaje_urgencia, visto en lo que devuelve el mensaje seguro.\n' +
          '  ✅ 3 · politica_privacidad, vista en el prompt montado.\n' +
          '  ✅ 4 · Usuarios del panel, con rol y clinica_id en app_metadata.\n' +
          '  ✅     La ficha y la base dicen lo mismo: lo que la clinica marco como\n' +
          '         privado NO le llega al bot, fila por fila.\n' +
          '  ✅     Barandilla 4: las 30 preguntas adversarias contra esta clinica, con\n' +
          '         canario sembrado y retirado.\n' +
          '\n' +
          '  ⚠  Y DOS COSAS QUE ESTO NO HA MIRADO:\n' +
          '\n' +
          '     5 · Las plantillas de Meta. `recordatorio_cita` lleva sus parametros por\n' +
          '         POSICION: si se aprobaron en otro orden, el paciente recibe la fecha\n' +
          '         donde va su nombre y no falla nada. Se comprueba desde fuera:\n' +
          `           pnpm alta:comprobar ${slug} --plantilla +34XXXXXXXXX\n` +
          '         El procedimiento entero, en entregas/plantillas-meta.md.\n' +
          '\n' +
          '     1b · El punto 1 se ha mirado en el entorno DE ESTA MAQUINA. Que la\n' +
          '         variable este en el sitio publicado, y que se haya vuelto a publicar\n' +
          '         despues de tocarla, no se ve desde aqui. Hasta ese despliegue, esta\n' +
          '         clinica no contesta ni manda recordatorios.\n',
      )
    } else {
      console.error(
        `\n  🔴 El acta de "${slug}" NO sale. Arriba esta lo que falla, con el nombre del\n` +
          '     punto delante. Mientras eso siga rojo, la clinica no esta dada de alta:\n' +
          '     esta creada, que no es lo mismo.\n',
      )
    }
    process.exit(codigo ?? 1)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal()
}
