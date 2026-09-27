/**
 * De `contenido/bloques/*.md` a las filas de `bloques_prompt`. Nada mas.
 *
 * NO TOCA LA BASE DE DATOS, no lee el entorno y no tiene CLI: es la mitad pura
 * del script de alta, y por eso puede importarla cualquiera.
 *
 * SE SEPARO EN F5, Y POR UN MOTIVO CONCRETO
 *
 * `sembrar-bloques.mjs` termina con un `if (import.meta.url === ...)` para
 * correr solo cuando se ejecuta como script. Eso es correcto y esta bien
 * ganado —el comentario de alli cuenta el problema de Windows que lo motivo—,
 * pero `import.meta` solo existe en un modulo ESM: Playwright transpila a CJS
 * lo que importan sus pruebas, y al llegar a esa linea reventaba con
 * "Cannot use import.meta outside a module", asi que la siembra del panel en
 * navegador no podia arrancar.
 *
 * La alternativa era relajar esa guarda. No se hizo: se parte en dos. El
 * script de alta sigue siendo un script de alta —con su service_role y su
 * guarda intacta— y la lectura de la carpeta, que no necesita ninguna de las
 * dos cosas, vive aqui y la importan las pruebas.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CARPETA = join(process.cwd(), 'contenido', 'bloques')

/**
 * @typedef {object} BloqueDeArchivo
 * @property {string} archivo   Nombre del .md, tal cual
 * @property {string} titulo    El nombre del archivo sin extension. Es lo que
 *                              va a la columna `titulo` y lo que lleva la
 *                              convencion del guion bajo
 * @property {number} orden
 * @property {boolean} activo
 * @property {string} contenido El cuerpo, ya sin frontmatter
 */

/** `si`/`no` de V1. Cualquier otra cosa se considera "no". */
function comoBooleano(valor) {
  return /^(si|sí|true|yes)$/i.test(String(valor ?? '').trim())
}

/**
 * Frontmatter minimo: `clave: valor`, una por linea, entre dos `---`.
 * No es YAML y no pretende serlo; si algun dia hace falta YAML de verdad, este
 * es el sitio donde cambiarlo.
 * @param {string} texto
 */
export function separarFrontmatter(texto) {
  // U+FEFF, la marca de orden de bytes que deja algun editor de Windows al
  // guardar. Se escribe por codigo y no como caracter: dentro del fuente seria
  // invisible, y un invisible que decide si el frontmatter se reconoce o no es
  // exactamente el tipo de cosa que nadie encuentra leyendo.
  const BOM = String.fromCharCode(0xfeff)
  const sinBom = texto.startsWith(BOM) ? texto.slice(BOM.length) : texto
  const encontrado = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(sinBom)
  if (!encontrado) return { campos: {}, cuerpo: sinBom.trim() }

  /** @type {Record<string, string>} */
  const campos = {}
  for (const linea of encontrado[1].split(/\r?\n/)) {
    const dosPuntos = linea.indexOf(':')
    if (dosPuntos === -1) continue
    campos[linea.slice(0, dosPuntos).trim()] = linea.slice(dosPuntos + 1).trim()
  }

  return { campos, cuerpo: sinBom.slice(encontrado[0].length).trim() }
}

/**
 * Lee la carpeta entera, en orden de archivo.
 *
 * Los que empiezan por `_` no se leen siquiera: son apuntes de trabajo y no
 * tienen por que existir en la base de datos. El montador vuelve a comprobarlo
 * sobre el titulo, por si alguien crea uno desde el panel.
 * @returns {BloqueDeArchivo[]}
 */
export function leerBloques(carpeta = CARPETA) {
  const archivos = readdirSync(carpeta)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()

  return archivos.map((archivo) => {
    const { campos, cuerpo } = separarFrontmatter(readFileSync(join(carpeta, archivo), 'utf8'))
    const orden = Number(campos.orden)

    if (!Number.isInteger(orden)) {
      throw new Error(
        `"${archivo}" no tiene un campo \`orden\` entero en su frontmatter. ` +
          'Sin orden no se sabe donde va dentro del prompt.',
      )
    }
    if (cuerpo === '') {
      throw new Error(`"${archivo}" se queda vacio al quitarle el frontmatter.`)
    }

    return {
      archivo,
      titulo: archivo.replace(/\.md$/, ''),
      orden,
      activo: comoBooleano(campos.activo),
      contenido: cuerpo,
    }
  })
}

/** Las filas tal y como entran en `bloques_prompt`. */
export function filasParaClinica(clinicaId, bloques = leerBloques()) {
  return bloques.map((b) => ({
    clinica_id: clinicaId,
    orden: b.orden,
    titulo: b.titulo,
    contenido: b.contenido,
    activo: b.activo,
  }))
}

