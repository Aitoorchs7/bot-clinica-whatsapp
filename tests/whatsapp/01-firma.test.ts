/**
 * La firma del webhook. Es el unico cerrojo de esa puerta.
 *
 * LA PRUEBA QUE DE VERDAD IMPORTA ES LA DE LOS ACENTOS
 *
 * Meta escapa los no-ASCII antes de firmar: «miercoles» viaja como
 * `miércoles`. Quien verifique sobre `JSON.stringify(await req.json())`
 * reconstruye un cuerpo distinto —`JSON.stringify` no vuelve a escapar— y la
 * firma no cuadra.
 *
 * Lo traicionero es que un webhook roto asi PASA todas las pruebas que solo
 * manden ASCII. Por eso aqui se firma un cuerpo escapado como lo manda Meta, y
 * ademas hay una prueba que demuestra que el camino ingenuo falla: sin esa
 * segunda mitad, esto podria quedarse verde con el bug dentro.
 */
import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { CABECERA_FIRMA, firmar, firmaValida, tokenValido } from '@/lib/whatsapp/firma'

const SECRETO = 'un-app-secret-de-prueba'

/** Como lo manda Meta: los no-ASCII escapados. */
const CUERPO_DE_META =
  '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"text":{"body":"quiero cita el mi\\u00e9rcoles por la ma\\u00f1ana"}}]}}]}]}'

describe('la firma del webhook', () => {
  it('la cabecera es la que dice Meta, en minusculas', () => {
    // `Headers.get()` no distingue mayusculas, pero el nombre se escribe una
    // vez y en un solo sitio para que no haya dos formas de escribirlo.
    expect(CABECERA_FIRMA).toBe('x-hub-signature-256')
  })

  it('una firma bien hecha vale', () => {
    expect(firmaValida(CUERPO_DE_META, firmar(CUERPO_DE_META, SECRETO), SECRETO)).toBe(true)
  })

  it('tiene el formato que manda Meta: sha256=<hex>', () => {
    expect(firmar(CUERPO_DE_META, SECRETO)).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('con otro secreto, no vale', () => {
    expect(firmaValida(CUERPO_DE_META, firmar(CUERPO_DE_META, 'otro'), SECRETO)).toBe(false)
  })

  it('si cambia UN byte del cuerpo, no vale', () => {
    const firma = firmar(CUERPO_DE_META, SECRETO)
    expect(firmaValida(`${CUERPO_DE_META} `, firma, SECRETO)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // El bug de los acentos, por los dos lados
  // -------------------------------------------------------------------------

  it('ACENTOS: el cuerpo CRUDO de Meta verifica bien', () => {
    expect(CUERPO_DE_META).toContain('\\u00e9')
    expect(firmaValida(CUERPO_DE_META, firmar(CUERPO_DE_META, SECRETO), SECRETO)).toBe(true)
  })

  it('ACENTOS: re-serializar el JSON ROMPE la firma, que es por lo que se lee crudo', () => {
    // Esta es la prueba de que la de arriba sirve. Si un dia alguien cambiara
    // `req.text()` por `req.json()` en la ruta, ESTE es el comportamiento que
    // tendria, y se ve aqui escrito: la firma deja de cuadrar.
    const firmaDeMeta = firmar(CUERPO_DE_META, SECRETO)
    const reserializado = JSON.stringify(JSON.parse(CUERPO_DE_META))

    // El JSON reconstruido lleva el acento sin escapar: ya no son los mismos bytes.
    expect(reserializado).toContain('miércoles')
    expect(reserializado).not.toBe(CUERPO_DE_META)
    expect(firmaValida(reserializado, firmaDeMeta, SECRETO)).toBe(false)
  })

  it('sin acentos el atajo colaria, que es lo que lo hace peligroso', () => {
    // «hola» pasa por los dos caminos. Un webhook roto funciona en las pruebas
    // de humo y se cae con el primer paciente espanol que escribe bien.
    const soloAscii = '{"texto":"hola"}'
    expect(JSON.stringify(JSON.parse(soloAscii))).toBe(soloAscii)
  })

  // -------------------------------------------------------------------------
  // Nunca lanza: un 500 le diria a Meta «reintentalo»
  // -------------------------------------------------------------------------

  it.each([
    ['sin cabecera', null],
    ['cabecera vacia', ''],
    ['sin el prefijo sha256=', 'a'.repeat(64)],
    ['mas corta', 'sha256=abc'],
    ['mas larga', `sha256=${'a'.repeat(128)}`],
    ['que no es hex', `sha256=${'z'.repeat(64)}`],
  ])('devuelve false, no lanza: %s', (_caso, cabecera) => {
    expect(() => firmaValida(CUERPO_DE_META, cabecera, SECRETO)).not.toThrow()
    expect(firmaValida(CUERPO_DE_META, cabecera, SECRETO)).toBe(false)
  })

  it('sin secreto configurado, nada vale', () => {
    // Sin secreto no se puede verificar, y «no puedo verificar» es «no pasa».
    expect(firmaValida(CUERPO_DE_META, firmar(CUERPO_DE_META, SECRETO), '')).toBe(false)
  })

  it('un cuerpo vacio tambien se firma y se verifica', () => {
    expect(firmaValida('', firmar('', SECRETO), SECRETO)).toBe(true)
  })

  it('es el HMAC-SHA256 estandar, no una version nuestra', () => {
    // Fijado contra `node:crypto` directamente: si alguien cambiara el
    // algoritmo o la codificacion, Meta dejaria de cuadrar y esto lo caza
    // antes de desplegar.
    const aMano = `sha256=${createHmac('sha256', SECRETO).update(CUERPO_DE_META, 'utf8').digest('hex')}`
    expect(firmar(CUERPO_DE_META, SECRETO)).toBe(aMano)
  })
})

describe('el verify_token del GET', () => {
  it('cuadra cuando es el mismo', () => {
    expect(tokenValido('secreto-de-alta', 'secreto-de-alta')).toBe(true)
  })

  it.each([
    ['otro', 'secreto-de-alta'],
    ['secreto-de-alt', 'secreto-de-alta'],
    ['secreto-de-altaa', 'secreto-de-alta'],
  ])('no cuadra: %s', (recibido, esperado) => {
    expect(tokenValido(recibido, esperado)).toBe(false)
  })

  it.each([null, undefined, ''])('no cuadra con %s', (recibido) => {
    expect(tokenValido(recibido, 'secreto-de-alta')).toBe(false)
  })

  it('sin token configurado, nada cuadra', () => {
    // Un `.env` sin WHATSAPP_VERIFY_TOKEN no puede dejar la puerta abierta a
    // quien mande la cadena vacia.
    expect(tokenValido('', '')).toBe(false)
    expect(tokenValido('lo-que-sea', '')).toBe(false)
  })
})
