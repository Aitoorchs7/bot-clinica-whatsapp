/**
 * El clasificador, sin gastar ni una peticion de Gemini.
 *
 * La capa 1 son reglas deterministas, asi que se comprueba entera en seco. Y lo
 * que se comprueba de la capa 2 no es lo que contesta el modelo —eso cambia
 * entre dos tiradas—, sino que el clasificador NO LLEGA A LLAMARLO cuando la
 * capa 1 ya ha decidido. Para eso el modelo de mentira revienta si alguien lo
 * toca.
 */
import { describe, expect, it } from 'vitest'

import {
  CLAVE_MENSAJE_URGENCIA,
  clasificar,
  estaNegado,
  mensajeDeUrgenciaPorDefecto,
  mensajeSeguro,
  reglasDuras,
} from '@/lib/bot/clasificador'
import type { Modelo } from '@/lib/bot/gemini'
import type { DatosDelPrompt } from '@/lib/barandillas/filtro'

/** Si el clasificador lo llama cuando no debe, el test explota nombrandolo. */
const modeloQueExplota: Modelo = async () => {
  throw new Error('El clasificador ha llamado al modelo cuando NO debia.')
}

function modeloQueDice(respuesta: unknown): Modelo {
  return async () => ({ texto: JSON.stringify(respuesta), llamadas: [] })
}

describe('capa 1 · las cuatro urgencias de CLAUDE.md', () => {
  it.each([
    'me duele mucho la muela',
    'tengo un dolor horrible',
    'me duelen las encias',
    'tengo la cara hinchada',
    'se me ha hinchado el carrillo',
    'creo que tengo un flemon',
    'me sangra la encia',
    'tengo sangrado al cepillarme',
    'me he dado un golpe en un diente',
    'se me ha roto un diente',
    'no puedo dormir del dolor',
    'es urgente',
  ])('«%s» es urgencia', (mensaje) => {
    expect(reglasDuras(mensaje).urgente).toBe(true)
  })

  it.each([
    'quiero una cita para una revision',
    'a que hora abris',
    'cuanto cuesta un blanqueamiento',
    'hola buenas',
    'me va bien el jueves por la tarde',
  ])('«%s» NO es urgencia', (mensaje) => {
    expect(reglasDuras(mensaje).urgente).toBe(false)
  })

  it('una negacion delante desactiva el termino', () => {
    // «No me duele nada» no puede mandar a recepcion a alguien que solo quiere
    // una revision.
    expect(reglasDuras('no me duele nada, es solo una revision').urgente).toBe(false)
    expect(reglasDuras('ya no me duele').urgente).toBe(false)
    expect(reglasDuras('vengo sin dolor').urgente).toBe(false)
  })

  it('pero una negacion lejos NO lo desactiva', () => {
    // «No sé si es normal, me duele mucho» es una urgencia, y perderla por un
    // «no» al principio de la frase seria el fallo caro de los dos.
    expect(reglasDuras('no se si es normal pero me duele mucho').urgente).toBe(true)
  })

  it('estaNegado solo mira las cuatro palabras de delante', () => {
    expect(estaNegado('no me duele', 'no me '.length)).toBe(true)
    expect(estaNegado('no se si esto es normal pero duele', 'no se si esto es normal pero '.length)).toBe(
      false,
    )
  })

  it('funciona con tildes, sin tildes y en mayusculas', () => {
    // Una nota de voz transcrita y un teclado sin tildes tienen que dar igual.
    for (const forma of ['ME DUELE', 'me duele', 'Me Duele']) {
      expect(reglasDuras(forma).urgente).toBe(true)
    }
    expect(reglasDuras('tengo la cara hinchadísima').urgente).toBe(true)
  })
})

describe('capa 1 · pedir hablar con una persona', () => {
  it.each([
    'quiero hablar con una persona',
    'puedo hablar con alguien',
    'me pasas con recepcion',
    'no quiero hablar con un bot',
    'que me llame alguien por favor',
  ])('«%s» escala', (mensaje) => {
    expect(reglasDuras(mensaje).pidePersona).toBe(true)
  })
})

describe('una urgencia NO llega al modelo, y por tanto tampoco al cerebro', () => {
  it('con dolor, el clasificador ni siquiera pregunta', async () => {
    const clasificacion = await clasificar('me duele mucho', modeloQueExplota)

    expect(clasificacion.porRegla).toBe(true)
    expect(clasificacion.urgencia).toBe('alta')
    expect(clasificacion.escalar).toBe(true)
    expect(clasificacion.motivoEscalado).toBe('urgencia_grave')
  })

  it('pidiendo una persona, tampoco', async () => {
    const clasificacion = await clasificar('quiero hablar con una persona', modeloQueExplota)

    expect(clasificacion.porRegla).toBe(true)
    expect(clasificacion.escalar).toBe(true)
    expect(clasificacion.motivoEscalado).toBe('pidio_persona')
  })

  it('esto funciona con Google entero caido, que es cuando hace falta', async () => {
    // La capa 1 no tiene dependencias de red. Alguien que escribe un domingo
    // por la noche con la cara hinchada recibe el telefono igual.
    const caido: Modelo = async () => {
      throw new Error('503 Service Unavailable')
    }
    const clasificacion = await clasificar('tengo la cara hinchada', caido)
    expect(clasificacion.escalar).toBe(true)
  })
})

describe('capa 2 · el modelo, simulado', () => {
  it('un mensaje normal si llega al modelo', async () => {
    const clasificacion = await clasificar(
      'queria pedir cita para una revision',
      modeloQueDice({ intencion: 'cita', urgencia: 'ninguna', escalar: false }),
    )

    expect(clasificacion.porRegla).toBe(false)
    expect(clasificacion.intencion).toBe('cita')
    expect(clasificacion.escalar).toBe(false)
  })

  it('si el modelo dice urgencia alta, se escala aunque diga escalar false', async () => {
    const clasificacion = await clasificar(
      'no me encuentro bien de la boca',
      modeloQueDice({ intencion: 'pregunta', urgencia: 'alta', escalar: false }),
    )
    expect(clasificacion.escalar).toBe(true)
    expect(clasificacion.motivoEscalado).toBe('urgencia_grave')
  })

  it('un JSON roto no tumba la conversacion', async () => {
    const roto: Modelo = async () => ({ texto: 'lo siento, no puedo', llamadas: [] })
    const avisos: string[] = []

    const clasificacion = await clasificar('hola', roto, {
      registro: { info: () => {}, error: (m) => avisos.push(m) },
    })

    expect(clasificacion.escalar).toBe(false)
    expect(avisos[0]).toContain('no ha podido leer la respuesta')
  })

  it('un campo con un valor que no existe cae al valor seguro', async () => {
    const clasificacion = await clasificar(
      'hola',
      modeloQueDice({ intencion: 'inventada', urgencia: 'altisima', escalar: 'puede' }),
    )
    expect(clasificacion.intencion).toBe('otro')
    expect(clasificacion.urgencia).toBe('ninguna')
    expect(clasificacion.escalar).toBe(false)
  })

  it('sin modelo no se escala nada que las reglas no hayan visto', async () => {
    const clasificacion = await clasificar('hola buenas')
    expect(clasificacion.escalar).toBe(false)
    expect(clasificacion.porRegla).toBe(true)
  })
})

describe('el mensaje seguro de la ultima capa de fallback', () => {
  function datos(config: { clave: string; valor: string }[] = []): DatosDelPrompt {
    return {
      clinicaId: 'c',
      clinica: {
        dato: {
          id: 'c',
          nombre: 'Clinica Ejemplo',
          nombre_bot: 'Marta',
          trato: 'usted',
          zona_horaria: 'Europe/Madrid',
          telefono_recepcion: '912345678',
        },
        origen: 'clinicas#c',
      },
      config: {
        filas: config.map((fila, i) => ({
          dato: { id: `f${i}`, clinica_id: 'c', publico: true, ...fila },
          origen: `config#f${i}` as const,
        })),
        recuento: { total: config.length, publicas: config.length, retenidas: 0 },
        retenidos: [],
      },
    } as unknown as DatosDelPrompt
  }

  it('lleva el telefono de recepcion', () => {
    expect(mensajeSeguro(datos())).toContain('912345678')
  })

  it('NO dice ni una palabra sobre el sintoma', () => {
    const mensaje = mensajeSeguro(datos()).toLowerCase()
    for (const palabra of ['dolor', 'duele', 'hinchaz', 'sangr', 'golpe', 'muela', 'diente']) {
      expect(mensaje).not.toContain(palabra)
    }
  })

  it('no da consejo, ni diagnostico, ni pregunta nada', () => {
    const mensaje = mensajeSeguro(datos())
    expect(mensaje).not.toContain('?')
    expect(mensaje.toLowerCase()).not.toContain('entiendo que')
    expect(mensaje.toLowerCase()).not.toContain('deberia')
  })

  it('la clinica puede escribir el suyo, y manda sobre el de por defecto', () => {
    const propio = 'Le llamamos ahora mismo. Si lo prefiere, marque el 900 000 000.'
    expect(mensajeSeguro(datos([{ clave: CLAVE_MENSAJE_URGENCIA, valor: propio }]))).toBe(propio)
  })

  it('si la clinica lo deja en blanco, se usa el de por defecto', () => {
    expect(mensajeSeguro(datos([{ clave: CLAVE_MENSAJE_URGENCIA, valor: '   ' }]))).toBe(
      mensajeDeUrgenciaPorDefecto('912345678'),
    )
  })
})
