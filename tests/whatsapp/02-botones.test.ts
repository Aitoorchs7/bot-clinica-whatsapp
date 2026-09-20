/**
 * El switch del principio, con cargas como las que manda Meta.
 *
 * LO QUE ESTO FIJA, Y QUE SE ROMPERIA SIN ELLO
 *
 *   - Un boton de PLANTILLA llega en `button.payload`; uno INTERACTIVO en
 *     `interactive.button_reply.id`. Son dos sitios distintos y un bot que solo
 *     mire uno se queda mudo la mitad de las veces. Es el FALLO #4 del contrato.
 *   - Un webhook puede traer varias `entry`, varios `changes` y varios
 *     `messages`. Leer `[0]` pierde mensajes EN SILENCIO.
 *   - El `wa_event_id` sale del `wamid`, no de un hash del cuerpo, y los
 *     estados llevan el suyo en la clave: un mensaje genera hasta tres estados
 *     con el MISMO id.
 */
import { describe, expect, it } from 'vitest'

import {
  aE164,
  idDeEvento,
  leerCarga,
  paraMeta,
  textoDelEntrante,
  type Entrante,
} from '@/lib/whatsapp/botones'

const NUMERO = '111222333444555'

/** El sobre que envuelve todo lo que manda Meta. */
function sobre(valor: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '34910000001', phone_number_id: NUMERO }, ...valor },
          },
        ],
      },
    ],
  }
}

function mensaje(extra: Record<string, unknown>) {
  return sobre({
    contacts: [{ profile: { name: 'Ana' }, wa_id: '34600111222' }],
    messages: [{ from: '34600111222', id: 'wamid.AAA', timestamp: '1758276000', ...extra }],
  })
}

describe('el switch: de donde se saca lo que dijo el paciente', () => {
  it('texto -> text.body', () => {
    const { mensajes } = leerCarga(mensaje({ type: 'text', text: { body: 'hola, quiero cita' } }))
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0]).toMatchObject({ clase: 'texto', texto: 'hola, quiero cita' })
  })

  it('nota de voz -> audio.id, no un texto inventado', () => {
    const { mensajes } = leerCarga(
      mensaje({
        type: 'audio',
        audio: { id: 'media-777', mime_type: 'audio/ogg; codecs=opus', voice: true },
      }),
    )
    expect(mensajes[0]).toMatchObject({
      clase: 'audio',
      mediaId: 'media-777',
      mimeType: 'audio/ogg; codecs=opus',
    })
    // Lo que importa: NO hay texto. El contenido todavia no se conoce.
    expect(textoDelEntrante(mensajes[0]!)).toBeUndefined()
  })

  it('boton de PLANTILLA -> button.payload', () => {
    const { mensajes } = leerCarga(
      mensaje({ type: 'button', button: { payload: 'CONFIRMAR:cita-9', text: 'Confirmar' } }),
    )
    expect(mensajes[0]).toMatchObject({
      clase: 'boton',
      payload: 'CONFIRMAR:cita-9',
      etiqueta: 'Confirmar',
    })
  })

  it('boton INTERACTIVO -> interactive.button_reply.id, que es OTRO sitio', () => {
    const { mensajes } = leerCarga(
      mensaje({
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'CANCELAR:cita-9', title: 'Cancelar' } },
      }),
    )
    expect(mensajes[0]).toMatchObject({
      clase: 'boton',
      payload: 'CANCELAR:cita-9',
      etiqueta: 'Cancelar',
    })
  })

  it('una lista interactiva tambien es un boton', () => {
    const { mensajes } = leerCarga(
      mensaje({
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'hueco-2', title: 'Jueves 12:00' } },
      }),
    )
    expect(mensajes[0]).toMatchObject({ clase: 'boton', payload: 'hueco-2', etiqueta: 'Jueves 12:00' })
  })

  it.each(['image', 'document', 'location', 'contacts', 'sticker', 'unsupported'])(
    '%s se reconoce como sin soporte, no se ignora',
    (tipo) => {
      // Reconocerlo es lo que permite contestar «esto no lo leo, escribemelo»
      // en vez de callarse, que es lo que prohibe `.claude/CLAUDE.md`.
      const { mensajes } = leerCarga(mensaje({ type: tipo }))
      expect(mensajes[0]).toMatchObject({ clase: 'sin_soporte', tipo })
    },
  )

  it('un texto vacio no es un mensaje', () => {
    expect(leerCarga(mensaje({ type: 'text', text: { body: '' } })).mensajes).toEqual([])
  })

  it('el boton se le pasa al modelo por su ETIQUETA, no por el payload', () => {
    // Lo que el paciente cree que ha dicho es «Confirmar», no `CONFIRMAR:9f3a`.
    // Meter el identificador interno en el contexto del modelo no aporta nada.
    const entrante: Entrante = {
      waMessageId: 'wamid.X',
      phoneNumberId: NUMERO,
      telefono: '+34600111222',
      clase: 'boton',
      payload: 'CONFIRMAR:9f3a',
      etiqueta: 'Confirmar',
    }
    expect(textoDelEntrante(entrante)).toBe('Confirmar')
  })
})

describe('todo es una lista y hay que recorrerla', () => {
  it('varios mensajes en un solo webhook: salen TODOS', () => {
    const carga = sobre({
      contacts: [{ profile: { name: 'Ana' }, wa_id: '34600111222' }],
      messages: [
        { from: '34600111222', id: 'wamid.1', type: 'text', text: { body: 'hola' } },
        { from: '34600111222', id: 'wamid.2', type: 'text', text: { body: 'queria cita' } },
        { from: '34600111222', id: 'wamid.3', type: 'text', text: { body: 'para el jueves' } },
      ],
    })
    const { mensajes } = leerCarga(carga)
    expect(mensajes.map((m) => (m.clase === 'texto' ? m.texto : ''))).toEqual([
      'hola',
      'queria cita',
      'para el jueves',
    ])
  })

  it('varias entry y varios changes: tambien salen todos', () => {
    const carga = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              value: {
                metadata: { phone_number_id: NUMERO },
                messages: [{ from: '34600111222', id: 'wamid.1', type: 'text', text: { body: 'uno' } }],
              },
            },
            {
              value: {
                metadata: { phone_number_id: NUMERO },
                messages: [{ from: '34600333444', id: 'wamid.2', type: 'text', text: { body: 'dos' } }],
              },
            },
          ],
        },
        {
          id: 'waba-2',
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'otro-numero' },
                messages: [{ from: '34600555666', id: 'wamid.3', type: 'text', text: { body: 'tres' } }],
              },
            },
          ],
        },
      ],
    }
    const { mensajes } = leerCarga(carga)
    expect(mensajes).toHaveLength(3)
    // Y cada uno se lleva su phone_number_id, que es lo que decide la clinica.
    expect(mensajes.map((m) => m.phoneNumberId)).toEqual([NUMERO, NUMERO, 'otro-numero'])
  })
})

describe('los estados de entrega', () => {
  function estado(extra: Record<string, unknown>) {
    return sobre({ statuses: [{ id: 'wamid.SALIENTE', recipient_id: '34600111222', ...extra }] })
  }

  it.each(['sent', 'delivered', 'read', 'failed'])('%s se lee', (cual) => {
    const { estados, mensajes } = leerCarga(estado({ status: cual, timestamp: '1758276000' }))
    expect(mensajes).toEqual([])
    expect(estados[0]).toMatchObject({ waMessageId: 'wamid.SALIENTE', estado: cual })
  })

  it('un fallo trae su codigo de error', () => {
    const { estados } = leerCarga(
      estado({ status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] }),
    )
    expect(estados[0]).toMatchObject({ estado: 'failed', codigoError: 131047 })
  })

  it('cuando Meta dice cuando caduca la ventana, se recoge', () => {
    const { estados } = leerCarga(
      estado({
        status: 'sent',
        conversation: { id: 'c-1', expiration_timestamp: '1789898400', origin: { type: 'service' } },
      }),
    )
    expect(estados[0]?.expiraVentana).toBe('1789898400')
  })
})

describe('el id de evento, que es lo que hace idempotente al webhook', () => {
  const entrante: Entrante = {
    waMessageId: 'wamid.AAA',
    phoneNumberId: NUMERO,
    telefono: '+34600111222',
    clase: 'texto',
    texto: 'hola',
  }

  it('un mensaje: sale del wamid', () => {
    expect(idDeEvento(entrante)).toBe('msg:wamid.AAA')
  })

  it('el mismo mensaje da el mismo id aunque cambie el resto del cuerpo', () => {
    // Por esto no es un hash de la carga: Meta puede reenviar con un campo
    // accesorio distinto y un hash lo veria como un evento nuevo.
    expect(idDeEvento({ ...entrante, texto: 'otra cosa' })).toBe(idDeEvento(entrante))
  })

  it('los tres estados del MISMO mensaje dan tres ids distintos', () => {
    // Un saliente genera hasta tres webhooks con el mismo `id`. Sin el estado
    // en la clave, el `delivered` se tomaria por duplicado del `sent` y no se
    // guardaria nunca.
    const base = { waMessageId: 'wamid.SAL', phoneNumberId: NUMERO }
    const ids = ['sent', 'delivered', 'read'].map((estado) => idDeEvento({ ...base, estado }))
    expect(new Set(ids).size).toBe(3)
  })

  it('un mensaje y un estado con el mismo wamid no se confunden', () => {
    expect(idDeEvento(entrante)).not.toBe(
      idDeEvento({ waMessageId: 'wamid.AAA', phoneNumberId: NUMERO, estado: 'sent' }),
    )
  })
})

describe('el telefono', () => {
  it('Meta lo manda sin `+` y la base lo guarda con `+`', () => {
    // El CHECK de `pacientes.telefono_e164` exige el `+`. Sin normalizar, el
    // primer INSERT revienta.
    const { mensajes } = leerCarga(mensaje({ type: 'text', text: { body: 'hola' } }))
    expect(mensajes[0]?.telefono).toBe('+34600111222')
  })

  it('y al enviar se le quita otra vez', () => {
    expect(paraMeta('+34600111222')).toBe('34600111222')
  })

  it('ida y vuelta no cambia nada', () => {
    expect(aE164(paraMeta('+34600111222'))).toBe('+34600111222')
    expect(aE164('+34600111222')).toBe('+34600111222')
  })

  it('el nombre del perfil viaja en contacts, no en el mensaje', () => {
    const { mensajes } = leerCarga(mensaje({ type: 'text', text: { body: 'hola' } }))
    expect(mensajes[0]?.nombrePerfil).toBe('Ana')
  })
})

describe('una carga que no se entiende no revienta el webhook', () => {
  it.each([
    ['null', null],
    ['una cadena', 'hola'],
    ['un numero', 42],
    ['un array', []],
    ['un objeto vacio', {}],
    ['sin entry', { object: 'whatsapp_business_account' }],
    ['entry que no es lista', { entry: 'no' }],
    ['sin metadata', { entry: [{ changes: [{ value: { messages: [] } }] }] }],
  ])('%s devuelve listas vacias, no lanza', (_caso, carga) => {
    expect(() => leerCarga(carga)).not.toThrow()
    expect(leerCarga(carga)).toEqual({ mensajes: [], estados: [] })
  })

  it('un mensaje sin id se descarta, pero los demas siguen', () => {
    // Sin `id` no hay idempotencia posible, asi que no se atiende. Pero
    // descartarlo no puede llevarse por delante a los que si estan bien.
    const carga = sobre({
      messages: [
        { from: '34600111222', type: 'text', text: { body: 'sin id' } },
        { from: '34600111222', id: 'wamid.OK', type: 'text', text: { body: 'con id' } },
      ],
    })
    const { mensajes } = leerCarga(carga)
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0]?.waMessageId).toBe('wamid.OK')
  })
})
