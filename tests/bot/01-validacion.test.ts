/**
 * Nivel 1 de ESTADO_F3 §1: sin red, sin base de datos, sin modelo.
 *
 * La tabla de casos de V1 (T4) va literal, con sus cuatro filas, porque es la
 * que se enseña a un cliente para demostrar que el bot no apunta un telefono a
 * medias. Si alguna vez deja de pasar, lo que se ha roto es una promesa
 * comercial, no un detalle de implementacion.
 */
import { describe, expect, it } from 'vitest'

import {
  MOTIVOS,
  validarFecha,
  validarNombre,
  validarTelefono,
  zMotivo,
  zNombre,
  zTelefono,
} from '@/lib/bot/validacion'

describe('telefono · la tabla de V1 (T4), literal', () => {
  it.each([
    ['610 22 45 71', true, '+34610224571'],
    ['+34 610224571', true, '+34610224571'],
    ['61022457', false, undefined],
    ['310224571', false, undefined],
  ])('%s', (entrada, aceptado, e164) => {
    const resultado = validarTelefono(entrada)
    expect(resultado.ok).toBe(aceptado)
    if (resultado.ok) expect(resultado.e164).toBe(e164)
  })
})

describe('telefono · lo que escribe la gente de verdad', () => {
  it.each([
    ['600111222', '+34600111222'],
    ['600-11-12-22', '+34600111222'],
    ['600.11.12.22', '+34600111222'],
    ['(600) 111 222', '+34600111222'],
    ['0034600111222', '+34600111222'],
    ['+34600111222', '+34600111222'],
    ['  700111222  ', '+34700111222'],
    ['900111222', '+34900111222'],
  ])('%s se normaliza a %s', (entrada, esperado) => {
    const resultado = validarTelefono(entrada)
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.e164).toBe(esperado)
  })

  it('el motivo del rechazo distingue que ha pasado', () => {
    // No es cosmetico: es lo que el modelo le repite al paciente para que
    // corrija. «Faltan digitos» y «no empieza por 6-9» se arreglan distinto.
    expect(validarTelefono('61022457')).toMatchObject({ motivo: 'faltan_digitos' })
    expect(validarTelefono('6102245711')).toMatchObject({ motivo: 'sobran_digitos' })
    expect(validarTelefono('310224571')).toMatchObject({ motivo: 'no_empieza_bien' })
    expect(validarTelefono('6102245A1')).toMatchObject({ motivo: 'tiene_letras' })
    expect(validarTelefono('')).toMatchObject({ motivo: 'vacio' })
    expect(validarTelefono('+33610224571')).toMatchObject({ motivo: 'prefijo_no_espanol' })
  })

  it('todo rechazo trae una frase que se le puede leer al paciente', () => {
    for (const malo of ['', '61022457', '310224571', '+33610224571', '6102245A1']) {
      const resultado = validarTelefono(malo)
      expect(resultado.ok).toBe(false)
      if (!resultado.ok) {
        expect(resultado.porque.length).toBeGreaterThan(5)
        // El copy prohibido de .claude/CLAUDE.md no aparece por ningun lado.
        expect(resultado.porque.toLowerCase()).not.toContain('no te entiendo')
      }
    }
  })
})

describe('nombres · se aceptan los apellidos espanoles de verdad', () => {
  it.each([
    "O'Donnell",
    'D’Angelo',
    'Sainz-Pardo',
    'Mari Carmen',
    'Núñez',
    'Ángela',
    'Sanz Vinuesa',
    'Muñoz de la Peña',
  ])('%s vale', (nombre) => {
    expect(validarNombre(nombre).ok).toBe(true)
  })

  it('un apellido con dos apostrofos distintos es el mismo apellido', () => {
    // El teclado del movil pone el tipografico sin avisar. Rechazar uno de los
    // dos manda a recepcion a gente que ha escrito su apellido bien.
    expect(validarNombre("O'Donnell").ok).toBe(true)
    expect(validarNombre('O’Donnell').ok).toBe(true)
  })

  it.each([
    ['', 'vacio'],
    ['Ana2', 'tiene_numeros'],
    ['600111222', 'tiene_numeros'],
    ['A', 'muy_corto'],
    ['<script>', 'caracteres_raros'],
    ['Ana@ejemplo.test', 'caracteres_raros'],
  ])('%s se rechaza por %s', (entrada, motivo) => {
    expect(validarNombre(entrada)).toMatchObject({ ok: false, motivo })
  })

  it('los espacios de sobra se colapsan, no se rechazan', () => {
    expect(validarNombre('  Ana   Maria  ')).toMatchObject({ ok: true, valor: 'Ana Maria' })
  })

  it('un nombre absurdamente largo no entra', () => {
    expect(validarNombre('a'.repeat(61))).toMatchObject({ ok: false, motivo: 'muy_largo' })
  })
})

describe('fechas', () => {
  it('acepta un dia que existe', () => {
    expect(validarFecha('2026-09-24')).toMatchObject({ ok: true, valor: '2026-09-24' })
  })

  it.each(['24/09/2026', '2026-9-24', 'jueves', '2026-09', ''])('rechaza %s', (malo) => {
    expect(validarFecha(malo)).toMatchObject({ ok: false, motivo: 'formato' })
  })

  it('rechaza un dia que encaja con el formato pero no existe', () => {
    // Es el caso que una expresion regular sola no caza, y el modelo los
    // produce: «el 31 de febrero» sale de calcular mal un «dentro de un mes».
    expect(validarFecha('2026-02-31')).toMatchObject({ ok: false, motivo: 'no_existe' })
    expect(validarFecha('2026-13-01')).toMatchObject({ ok: false, motivo: 'no_existe' })
    expect(validarFecha('2026-04-31')).toMatchObject({ ok: false, motivo: 'no_existe' })
  })

  it('el 29 de febrero existe si el ano es bisiesto y no si no lo es', () => {
    expect(validarFecha('2028-02-29').ok).toBe(true)
    expect(validarFecha('2026-02-29').ok).toBe(false)
  })
})

describe('motivo de la visita · vocabulario cerrado, articulo 9 del RGPD', () => {
  it('son exactamente los cinco del enum de la migracion 002', () => {
    expect([...MOTIVOS]).toEqual(['revision', 'urgencia', 'estetica', 'ortodoncia', 'otro'])
  })

  it('no deja pasar texto libre, que es justo lo que lo mantiene fuera del art. 9', () => {
    // Si esto dejara de fallar, el sistema pasaria a tratar datos de salud y
    // cambiaria su regimen legal entero. No es una validacion de formato.
    expect(zMotivo.safeParse('me duele la muela desde el martes').success).toBe(false)
    expect(zMotivo.safeParse('flemón').success).toBe(false)
    expect(zMotivo.safeParse('revision').success).toBe(true)
  })
})

describe('los esquemas de Zod rechazan lo mismo que los validadores', () => {
  it('telefono', () => {
    expect(zTelefono.safeParse('610 22 45 71').success).toBe(true)
    expect(zTelefono.safeParse('61022457').success).toBe(false)
  })

  it('nombre', () => {
    expect(zNombre.safeParse('Ana Pérez').success).toBe(true)
    expect(zNombre.safeParse('Ana2').success).toBe(false)
  })

  it('y el mensaje del rechazo viaja hasta el issue de Zod', () => {
    const fallo = zTelefono.safeParse('61022457')
    expect(fallo.success).toBe(false)
    if (!fallo.success) {
      expect(fallo.error.issues[0]?.message).toContain('nueve')
    }
  })
})
