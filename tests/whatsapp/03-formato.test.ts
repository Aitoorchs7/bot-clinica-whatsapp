/**
 * El formato de WhatsApp, que NO es markdown.
 *
 * POR QUE ESTO ES CODIGO Y NO SOLO UNA LINEA DEL PROMPT
 *
 * El bloque «20 - Como habla» se lo prohibe al modelo, y aun asi un modelo
 * entrenado con markdown produce `**negrita**` antes o despues. En WhatsApp eso
 * sale LITERAL, con los dos asteriscos a la vista, y el paciente ve un mensaje
 * que parece roto.
 *
 * Es la misma logica que la barandilla 1: no se le pide al modelo que se porte
 * bien, se hace que portarse mal no tenga efecto. La instruccion del prompt es
 * la intencion; esta funcion es la garantia, y corre SIEMPRE, justo antes del
 * `fetch`.
 */
import { describe, expect, it } from 'vitest'

import { LIMITE_CARACTERES, limpiarMarkdown, prepararTexto, recortar } from '@/lib/whatsapp/enviar'

describe('el markdown que WhatsApp no entiende', () => {
  it('**doble** pasa a *simple*, que es la negrita de verdad', () => {
    expect(limpiarMarkdown('Te espero el **jueves a las 12:00**.')).toBe(
      'Te espero el *jueves a las 12:00*.',
    )
  })

  it('el asterisco SIMPLE se respeta: ese si es negrita', () => {
    expect(limpiarMarkdown('Te espero el *jueves*.')).toBe('Te espero el *jueves*.')
  })

  it('__cursiva__ pasa a _cursiva_', () => {
    expect(limpiarMarkdown('__importante__')).toBe('_importante_')
  })

  it('los titulos pierden la almohadilla y se quedan con el texto', () => {
    expect(limpiarMarkdown('## Horarios\nDe 9 a 14.')).toBe('Horarios\nDe 9 a 14.')
    expect(limpiarMarkdown('###### Nota')).toBe('Nota')
  })

  it('las vinetas de markdown se convierten en puntos', () => {
    expect(limpiarMarkdown('- lunes\n- martes')).toBe('• lunes\n• martes')
    expect(limpiarMarkdown('* lunes\n+ martes')).toBe('• lunes\n• martes')
  })

  it('un enlace de markdown se deshace: WhatsApp no tiene enlaces con texto', () => {
    expect(limpiarMarkdown('Mira [nuestra web](https://clinica.test/citas).')).toBe(
      'Mira nuestra web: https://clinica.test/citas.',
    )
  })

  it('la cerca de codigo no deja el lenguaje escrito dentro del mensaje', () => {
    expect(limpiarMarkdown('```ts\nhola\n```')).not.toContain('ts')
  })

  it('las rayas horizontales se van', () => {
    expect(limpiarMarkdown('uno\n---\ndos')).toBe('uno\n\ndos')
  })

  it('tres saltos de linea o mas se quedan en dos', () => {
    expect(limpiarMarkdown('uno\n\n\n\n\ndos')).toBe('uno\n\ndos')
  })

  it('NO QUEDA NI UN `**` en un mensaje lleno de markdown', () => {
    // La asercion que de verdad protege al paciente: da igual como se haya
    // reformateado, lo que no puede pasar es que salga con asteriscos dobles.
    const delModelo = [
      '## Tus opciones',
      '',
      'Tengo hueco el **jueves**:',
      '- a las **9:00**',
      '- a las **17:00**',
      '',
      'Mas info en [la web](https://clinica.test).',
      '__Avisame__ cual prefieres.',
    ].join('\n')

    const limpio = limpiarMarkdown(delModelo)
    expect(limpio).not.toContain('**')
    expect(limpio).not.toContain('__')
    expect(limpio).not.toContain('##')
    expect(limpio).not.toContain('](')
    // Y lo que importaba sigue estando.
    expect(limpio).toContain('jueves')
    expect(limpio).toContain('9:00')
    expect(limpio).toContain('17:00')
  })

  it('un texto normal no se toca', () => {
    const normal = 'Hola Ana, tengo hueco el jueves a las 9:00 o a las 17:00. ¿Cuál te viene mejor?'
    expect(limpiarMarkdown(normal)).toBe(normal)
  })

  it('los acentos y la ñ sobreviven', () => {
    expect(limpiarMarkdown('**mañana** por la **tarde**')).toBe('*mañana* por la *tarde*')
  })
})

describe('el recorte', () => {
  it('un mensaje normal no se toca', () => {
    expect(recortar('Hola.')).toBe('Hola.')
  })

  it('el limite es el de WhatsApp', () => {
    expect(LIMITE_CARACTERES).toBe(4096)
  })

  it('corta por una frase, no a mitad de palabra', () => {
    const largo = `${'Frase de relleno bastante larga. '.repeat(200)}Y el final.`
    const corto = recortar(largo, 100)
    expect(corto.length).toBeLessThanOrEqual(100)
    // Acaba en punto: se corto por una frase entera.
    expect(corto.endsWith('.')).toBe(true)
  })

  it('si no hay ninguna frase donde cortar, corta igual sin pasarse', () => {
    const sinPuntos = 'a'.repeat(500)
    expect(recortar(sinPuntos, 100)).toHaveLength(100)
  })
})

describe('lo que de verdad sale por el cable', () => {
  it('limpia y recorta, en ese orden', () => {
    expect(prepararTexto('  **hola**  ')).toBe('*hola*')
  })
})
