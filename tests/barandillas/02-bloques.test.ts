/**
 * Los bloques de contenido/bloques/, leidos como los lee el script de alta.
 *
 * Sin base de datos: esto corre en CI en `comprobaciones-estaticas`. Lo que
 * vigila es que el prompt que se va a sembrar sea montable —ordenes unicos,
 * huecos que existen— y que los dos bloques que son el nucleo del producto
 * sigan diciendo lo que decian en la V1.
 */
import { describe, expect, it } from 'vitest'

import { leerBloques } from '../../scripts/bloques-a-filas.mjs'
import { HUECOS_CONOCIDOS } from '@/lib/barandillas/montaje'

const bloques = leerBloques()
const porTitulo = (titulo: string) => {
  const encontrado = bloques.find((b) => b.titulo === titulo)
  if (!encontrado) throw new Error(`No existe el bloque "${titulo}" en contenido/bloques/.`)
  return encontrado
}

const HUECO = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

describe('la carpeta de bloques', () => {
  it('tiene los diez bloques: los nueve de la V1 mas el aviso inicial', () => {
    expect(bloques.map((b) => b.titulo)).toEqual([
      '00 - LEEME primero',
      '05 - Aviso inicial',
      '10 - Quien es',
      '20 - Como habla',
      '25 - No interpretes de mas',
      '30 - Que no puede decir',
      '40 - Cuando cuesta entenderse',
      '50 - Como coge una cita',
      '60 - Cuando pasa a una persona',
      '90 - Lo que sabe',
    ])
  })

  it('ningun `orden` se repite', () => {
    // `bloques_prompt` tiene `unique (clinica_id, orden)`: dos iguales no
    // fallarian al montar, fallarian al sembrar, que es mucho mas tarde.
    const ordenes = bloques.map((b) => b.orden)
    expect(new Set(ordenes).size).toBe(ordenes.length)
  })

  it('el LEEME no entra en el prompt', () => {
    expect(porTitulo('00 - LEEME primero').activo).toBe(false)
  })

  it('todos los demas estan activos', () => {
    const inactivos = bloques.filter((b) => !b.activo).map((b) => b.titulo)
    expect(inactivos).toEqual(['00 - LEEME primero'])
  })

  it('no usan ningun hueco que el montador no sepa rellenar', () => {
    // Esta es la que de verdad paga su sitio. Un `{{horarios}}` en plural
    // escrito un martes por la tarde no rompe nada: se queda literal en el
    // prompt y el bot le enseña las llaves a un paciente. Aqui sale antes.
    const usados = new Set<string>()
    for (const b of bloques) {
      if (!b.activo) continue
      for (const [, nombre] of b.contenido.matchAll(HUECO)) usados.add(nombre)
    }
    const desconocidos = [...usados].filter(
      (nombre) => !(HUECOS_CONOCIDOS as readonly string[]).includes(nombre),
    )
    expect(desconocidos).toEqual([])
  })
})

describe('lo que NO se toca al pasar de voz a texto', () => {
  it('«25 - No interpretes de mas» conserva sus frases', () => {
    const texto = porTitulo('25 - No interpretes de mas').contenido
    expect(texto).toContain('NO INTERPRETES LO QUE NO TE HAN DICHO')
    expect(texto).toContain('No supongas emociones')
    expect(texto).toContain('Preguntar es siempre mejor que adivinar')
    expect(texto).toContain('No compadezcas, no consueles')
  })

  it('«30 - Que no puede decir» conserva las suyas', () => {
    const texto = porTitulo('30 - Que no puede decir').contenido
    expect(texto).toContain('NO TE INVENTES NADA')
    expect(texto).toContain('NUNCA DIGAS QUE UNA HORA ESTÁ OCUPADA POR TU CUENTA')
    expect(texto).toContain('Jamás inventes un hueco')
    expect(texto).toContain('Nunca des consejo médico')
    expect(texto).toContain('consultar_huecos')
  })
})

describe('lo que SI cambia al pasar de voz a texto', () => {
  const comoHabla = () => porTitulo('20 - Como habla').contenido

  it('«20 - Como habla» ya no manda decir los numeros en palabras', () => {
    expect(comoHabla()).not.toContain('Los números, en palabras')
  })

  it('«20 - Como habla» ya no prohibe emojis ni listas', () => {
    expect(comoHabla()).not.toContain('Nada de emojis')
    expect(comoHabla()).toContain('Emojis y listas valen, con mucha moderación')
  })

  it('«20 - Como habla» ya no dice que esto es una llamada', () => {
    expect(comoHabla()).not.toContain('Esto es una llamada')
    expect(comoHabla()).not.toContain('se convierte en voz')
  })

  it('«20 - Como habla» mantiene lo que no dependia del canal', () => {
    expect(comoHabla()).toContain('Una o dos frases')
    expect(comoHabla()).toContain('Una sola pregunta cada vez')
    expect(comoHabla()).toContain('Ve al grano')
  })

  it('«40 - Cuando cuesta entenderse» habla de escribir, no de dicción', () => {
    const texto = porTitulo('40 - Cuando cuesta entenderse').contenido
    expect(texto).toContain('falta de ortografía')
    expect(texto).toContain('notas de voz')
    expect(texto).toContain('Los mensajes llegan a trozos')
    expect(texto).toContain('no_te_entiendo')
    // Lo del teléfono dígito a dígito no tiene sentido cuando viene escrito.
    expect(texto).not.toContain('de uno en uno')
    expect(texto).toContain('Una sola ronda de aclaración')
  })
})

describe('«05 - Aviso inicial», el bloque nuevo', () => {
  const aviso = () => porTitulo('05 - Aviso inicial')

  it('va antes que la identidad, para que sea lo primero que lee el modelo', () => {
    expect(aviso().orden).toBe(5)
    expect(aviso().orden).toBeLessThan(porTitulo('10 - Quien es').orden)
  })

  it('obliga a identificarse como asistente virtual', () => {
    const texto = aviso().contenido
    expect(texto).toContain('asistente virtual')
    expect(texto).toContain('no una persona')
    expect(texto).toContain('artículo 50')
  })

  it('el enlace entra por su hueco propio, no por {{datos}}', () => {
    const texto = aviso().contenido
    expect(texto).toContain('{{privacidad}}')
    // Que sea el unico bloque que lo usa no es casual: el aviso legal se da en
    // un sitio y se comprueba en un sitio.
    const losQueLoUsan = bloques.filter((b) => b.activo && b.contenido.includes('{{privacidad}}'))
    expect(losQueLoUsan.map((b) => b.titulo)).toEqual(['05 - Aviso inicial'])
  })

  it('obliga a copiar el enlace sin tocarlo', () => {
    const texto = aviso().contenido
    expect(texto).toContain('Cópialo tal cual, carácter a carácter')
    expect(texto).toContain('No lo acortes, no lo reescribas')
    // Y a no inventarse el enlace si la clinica no lo ha configurado.
    expect(texto).toContain('no te lo inventes')
  })

  it('se dice una vez por conversacion, no en cada mensaje', () => {
    expect(aviso().contenido).toContain('no repitas el aviso')
  })
})
