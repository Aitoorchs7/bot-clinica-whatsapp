---
name: whatsapp-cloud
description: "Canal de WhatsApp Business Cloud API (Meta, oficial). Úsala para el webhook (verificación GET, firma X-Hub-Signature-256 sobre el cuerpo CRUDO, idempotencia por wa_event_id), el envío (texto libre vs. plantilla, ventana de 24 h, reintentos), plantillas (utility/marketing/authentication y sus botones), media (notas de voz: media id -> URL -> descarga con Bearer), estados de entrega y códigos de error. Dispara con: webhook de Meta, X-Hub-Signature-256, hub.challenge, ventana de 24 horas, plantilla aprobada, quick_reply, media id, nota de voz, wa_message_id, error 131047, 130429. NUNCA Baileys ni whatsapp-web.js en producción."
metadata:
  author: proyecto
  version: "1.0.0"
  verificado: "2026-09-19 contra developers.facebook.com"
---

# WhatsApp Business Cloud API

El canal oficial de Meta. En este proyecto **no se usa ninguna librería no
oficial** (Baileys, whatsapp-web.js): son puentes sobre WhatsApp Web, violan los
términos, y una clínica dental con datos de pacientes no se juega el canal a que
Meta cierre la cuenta.

> **Las fechas y los números de este documento se verificaron el 19/09/2026.**
> Meta cambia precios, categorías de plantilla y versiones de la Graph API con
> frecuencia. Antes de dar por bueno un límite o un precio, vuelve a mirarlo:
> responder de memoria sobre esto es exactamente cómo se cuelan los errores que
> solo aparecen en producción.

---

## 1 · El webhook, en el orden exacto

Cinco pasos y el orden **es** la seguridad. Cambiarlo rompe algo concreto en
cada caso.

```
1. cuerpo = await req.text()      ← CRUDO. Nunca req.json() antes
2. verificar X-Hub-Signature-256  ← si no cuadra: 401 y fuera
3. INSERT en eventos_webhook      ← si ya existía: 200 y fuera
4. responder 200                  ← ANTES de llamar al modelo
5. after(() => procesar())        ← el trabajo lento, ya con la respuesta enviada
```

### 1.1 · Por qué el cuerpo crudo

Meta **escapa los caracteres no ASCII** en el JSON que manda
(`"cita el miércoles"` viaja como `é`). La firma se calcula sobre esos
bytes. Si haces `await req.json()` y luego `JSON.stringify(...)` para verificar,
`JSON.stringify` **no** vuelve a escapar, el cuerpo reconstruido difiere del
original, y la firma no cuadra nunca — con acentos, que en español es siempre.

El fallo es traicionero porque «hola» pasa y «cita el miércoles» no. Una batería
de pruebas que solo mande ASCII se queda verde con este bug dentro.

```ts
// BIEN
const cuerpo = await req.text()
verificarFirma(cuerpo, req.headers.get('x-hub-signature-256'))
const carga = JSON.parse(cuerpo)

// MAL: la firma no cuadrará en cuanto alguien escriba un acento
const carga = await req.json()
verificarFirma(JSON.stringify(carga), ...)
```

### 1.2 · La firma

`X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 del cuerpo crudo con el
**App Secret** de la app de Meta (`META_APP_SECRET`), no con el token de envío.

Se compara con `crypto.timingSafeEqual`, no con `===`. `timingSafeEqual` **lanza
si los buffers miden distinto**, así que compara la longitud antes, y hazlo de
forma que un header ausente o con otro formato acabe en `false`, no en una
excepción que el runtime convierta en 500. Un 500 aquí le dice a Meta
«reinténtalo», que es justo lo que no quieres para una petición falsificada.

### 1.3 · Verificación GET

Al dar de alta el webhook, Meta hace un GET con:

| Parámetro | Valor |
|---|---|
| `hub.mode` | `subscribe` |
| `hub.verify_token` | la cadena que pusiste en el panel de Meta |
| `hub.challenge` | un entero |

Si `hub.mode === 'subscribe'` y el token coincide (**comparación en tiempo
constante**, es un secreto), responde **el challenge tal cual, en texto plano**,
con 200. Cualquier otra cosa: 403. No devuelvas JSON: Meta espera el cuerpo
literal.

### 1.4 · Idempotencia

Meta reintenta: «If any update sent to your server fails, we will retry
immediately, then try a few more times with decreasing frequency over the next
36 hours». También reintenta si tardas demasiado en contestar, aunque hayas
procesado el mensaje.

Sin idempotencia, un reintento crea **una segunda cita**. La garantía tiene que
estar en la base de datos, no en una comprobación en memoria: dos invocaciones
serverless concurrentes no comparten memoria.

En este proyecto: `eventos_webhook (clinica_id, wa_event_id)` con índice único.
El INSERT que devuelve `23505` **es** la detección del duplicado; no se consulta
antes y se inserta después, porque entre las dos operaciones cabe el reintento.

El `wa_event_id` sale del `id` del mensaje o del estado, no de un hash del
cuerpo: Meta puede reenviar el mismo mensaje con un cuerpo ligeramente distinto.

### 1.5 · Responder 200 antes del modelo

Meta espera un 200 rápido. Una llamada a Gemini con seis vueltas de herramientas
tarda segundos; si contestas después, Meta te reintenta y procesas dos veces.

En Next.js 16 esto es `after()` de `next/server` (estable desde 15.1). En Vercel
se apoya en `waitUntil`, así que el trabajo sigue vivo después de la respuesta.
Hay que poner `export const maxDuration` acorde con lo que tarde el trabajo de
`after()`, **incluido el debounce**.

---

## 2 · La ventana de 24 horas

Cuando un usuario escribe, se abre una ventana de **24 h** durante la cual el
negocio puede responder con mensajes de servicio (texto libre). Fuera de esa
ventana, **solo plantillas aprobadas**.

- El reloj se reinicia con **cada mensaje entrante** del usuario.
- Intentar texto libre con la ventana cerrada devuelve **131047**
  («More than 24 hours have passed since recipient last replied»). Es un fallo
  **permanente**: no lo reintentes, cambia a plantilla.
- El webhook de estado trae `conversation.expiration_timestamp` cuando aplica.
  Es más fiable que calcular `entrante + 24 h`, pero no llega siempre: usa el
  cálculo local como base y el valor de Meta cuando venga.

> **Precios (verificado 19/09/2026, cambia a menudo):** desde el **1 de octubre
> de 2026** Meta cobra **por mensaje** los mensajes de servicio y los de
> utilidad enviados dentro de una ventana abierta, con un tramo gratuito
> mensual de **1.000 mensajes de servicio entregados** por número. Antes de
> prometerle un coste a una clínica, vuelve a mirar la tabla de tarifas de su
> mercado.

---

## 3 · Enviar

```
POST https://graph.facebook.com/<VERSION>/<PHONE_NUMBER_ID>/messages
Authorization: Bearer <WHATSAPP_TOKEN>
Content-Type: application/json
```

Texto libre (solo con la ventana abierta):

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "34600111222",
  "type": "text",
  "text": { "body": "...", "preview_url": false }
}
```

Plantilla:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "34600111222",
  "type": "template",
  "template": {
    "name": "recordatorio_cita",
    "language": { "code": "es_ES" },
    "components": [
      { "type": "body", "parameters": [{ "type": "text", "text": "Ana" }] },
      { "type": "button", "sub_type": "quick_reply", "index": 0,
        "parameters": [{ "type": "payload", "payload": "CONFIRMAR:<id>" }] }
    ]
  }
}
```

Respuesta: `{ messages: [{ id: "wamid...." }], contacts: [{ wa_id }] }`.
**Ese `id` es el `wa_message_id` que hay que guardar**: es lo único que une tu
fila de `mensajes` con los webhooks de estado que llegarán después.

### 3.1 · El `to` no lleva `+`

Meta acepta el número en E.164 **sin** el `+` inicial. Si tu base guarda
`+34600111222` (como aquí, por el `check` de la columna), quita el `+` al
enviar y vuelve a ponerlo al recibir. El `from` del webhook llega **sin** `+`.

### 3.2 · Reintentos

| Reintentar | Código |
|---|---|
| Sí, con backoff | `4`, `80007`, `130429`, `131056`, `133016` (límites), `2`, `131016`, `131057`, `133004` (caído), `131000` (desconocido) |
| No | `131047` (ventana cerrada → plantilla), `131050` (rechazó marketing), `100`/`131008`/`131009` (parámetros), `132001`/`132007` (plantilla), `0`/`3`/`10`/`190`/`200` (token), `368` (cuenta restringida) |

Backoff exponencial con *jitter*. Sin jitter, cien conversaciones que chocan con
el mismo límite reintentan todas a la vez y vuelven a chocar.

Un 5xx de Meta o un fallo de red también se reintentan; un 4xx que no esté en la
lista de arriba, no.

---

## 4 · Recibir: el switch del principio

`messages[0].type` decide. Lo que hay que mirar **no está siempre en el mismo
sitio**, y esta es la fuente número uno de bots que «no entienden» un botón:

| Tipo | Dónde está el contenido |
|---|---|
| `text` | `messages[0].text.body` |
| `audio` | `messages[0].audio.id` (+ `mime_type`, `voice: true` si es nota de voz) |
| `button` | `messages[0].button.payload` — **respuesta a un botón de PLANTILLA** |
| `interactive` | `messages[0].interactive.button_reply.id` / `.list_reply.id` |
| `image`, `document`, … | fuera de alcance: se pide por escrito |

Los dos casos de botón son distintos de verdad: el de plantilla llega como
`button` con `payload`; el de un mensaje interactivo enviado por la API llega
como `interactive` con `button_reply`. Un bot que solo mire uno de los dos se
queda mudo la mitad de las veces.

Estructura completa:

```
body.entry[0].id                                   ← WABA id
body.entry[0].changes[0].value.metadata.phone_number_id   ← QUÉ CLÍNICA
body.entry[0].changes[0].value.contacts[0].profile.name
body.entry[0].changes[0].value.contacts[0].wa_id
body.entry[0].changes[0].value.messages[0].{id,from,timestamp,type,context}
body.entry[0].changes[0].value.statuses[0].{id,status,recipient_id,errors}
```

**Un webhook puede traer varias `entry`, varios `changes` y varios `messages`.**
Recorre las listas; no leas `[0]` y te vayas.

Y un webhook trae `messages` **o** `statuses`, no las dos. Los `statuses`
(`sent` / `delivered` / `read` / `failed`) actualizan `mensajes.estado_entrega`
por `wa_message_id`; no se contestan.

---

## 5 · Notas de voz

Dos peticiones, y las dos con el token:

```
1. GET https://graph.facebook.com/<VERSION>/<MEDIA_ID>
   Authorization: Bearer <WHATSAPP_TOKEN>
   → { url, mime_type, sha256, file_size, id }

2. GET <url>
   Authorization: Bearer <WHATSAPP_TOKEN>    ← SIN ESTO FALLA
   → los bytes
```

- La `url` del paso 1 **caduca a los 5 minutos**. No la guardes.
- El `MEDIA_ID` deja de servir a los **7 días**.
- Audio: hasta **16 MB**. `audio/ogg` (OPUS, mono), `audio/aac`, `audio/amr`,
  `audio/mpeg`, `audio/mp4`. Las notas de voz de WhatsApp son `audio/ogg`.
- El paso 2 va a un dominio de CDN de Meta, no a `graph.facebook.com`.

Luego, Deepgram:

```
POST https://api.deepgram.com/v1/listen?model=nova-3&language=es&keyterm=...&keyterm=...
Authorization: Token <DEEPGRAM_API_KEY>
Content-Type: <el mime_type del audio>
<los bytes>

→ results.channels[0].alternatives[0].{transcript,confidence}
```

- `nova-3` soporta español (`es`). El realce de vocabulario en nova-3 es
  **`keyterm`** (repetido, uno por término), no `keywords`, que es de nova-2.
  Límite: 500 tokens por petición.
- El vocabulario dental propio va aquí: «endodoncia», «ortodoncia»,
  «periodontitis», «implante», «empaste»… Sin él, «endodoncia» sale
  transcrita como cualquier cosa.

**Si la transcripción falla o vuelve vacía, se pide por escrito.** Nunca se
adivina lo que dijo el paciente: un audio mal entendido que acabe en una cita
es peor que un mensaje de más.

---

## 6 · Plantillas

Categorías: **utility**, **marketing**, **authentication** (y *service* para el
texto libre dentro de ventana). La categoría la aprueba Meta y determina el
precio; una plantilla de recordatorio que se redacte como publicidad puede
recategorizarse a marketing y encarecerse.

- `recordatorio_cita` → **utility**, con botones quick reply
  Confirmar / Cancelar.
- `confirmacion_cita` → **utility**.

Los parámetros son posicionales (`{{1}}`, `{{2}}`) y el orden **tiene que
coincidir** con el de la plantilla aprobada. Si alguien reordena la plantilla en
el panel de Meta sin tocar el código, los datos salen cambiados de sitio sin un
solo error.

El `language.code` es el de la plantilla aprobada (`es_ES`, no `es`), y no
coincidir da **132001**.

---

## 7 · Formato del texto: WhatsApp NO es markdown

| Se quiere | Se escribe |
|---|---|
| **negrita** | `*así*` — UN asterisco |
| _cursiva_ | `_así_` |
| ~~tachado~~ | `~así~` |
| `monoespaciado` | ` ```así``` ` |

`**doble asterisco**` sale **literal, con los asteriscos a la vista**. `##` y
`__` también. Un modelo entrenado con markdown los produce por defecto, así que
**el prompt tiene que prohibirlos explícitamente** y conviene limpiarlos antes
de enviar: una instrucción en el prompt es una intención, un `replace` antes del
`fetch` es una garantía.

Nada de listas largas ni de tablas: en un móvil se leen fatal.

---

## 8 · Agrupar mensajes (debounce)

En WhatsApp la gente manda cuatro mensajes seguidos:

```
hola
quería cita
para el jueves
por la tarde
```

Sin agrupar, el bot contesta cuatro veces, paga cuatro llamadas al modelo, y las
cuatro respuestas se pisan porque cada una se montó sin las siguientes.

El patrón: guarda el mensaje, **espera unos segundos**, y procesa solo si sigue
siendo el más reciente de esa conversación. Si llegó otro, esta rama se descarta
y contesta la última, con **los cuatro textos concatenados**.

«El más reciente» se decide **consultando la base de datos**, no una variable en
memoria: en serverless cada mensaje puede caer en una instancia distinta.

---

## 9 · Formas de que esto «funcione» sin servir

| Cómo se falsea | Qué lo impide |
|---|---|
| Verificar la firma sobre `JSON.stringify(await req.json())` | Una prueba con acentos en el cuerpo |
| La idempotencia se comprueba en una variable del módulo | Dos invocaciones concurrentes; el índice único en la base |
| Se contesta 200 después de llamar al modelo | Medir: el 200 sale antes de que exista la respuesta |
| El debounce se guarda en memoria | Se decide con una consulta, y hay prueba de cuatro mensajes seguidos |
| El bot solo mira `text.body` | Un botón de plantilla llega en `button.payload` |
| Se manda `**negrita**` | Limpieza antes del envío + prueba de que no quedan `**` |
| Se adivina lo que decía un audio que no se pudo transcribir | Prueba: Deepgram caído → se pide por escrito, no se inventa |

---

## 10 · Variables de entorno

| Variable | Qué es |
|---|---|
| `WHATSAPP_TOKEN` | Token permanente del System User. **Envío y descarga de media.** |
| `WHATSAPP_PHONE_NUMBER_ID` | El número de la clínica dentro de la WABA. |
| `WHATSAPP_VERIFY_TOKEN` | Cadena que inventamos; Meta la devuelve en el GET. |
| `META_APP_SECRET` | Secreto de la app. **Solo** para la firma. No es el token. |

`META_APP_SECRET` y `WHATSAPP_TOKEN` se confunden a menudo y el síntoma es
distinto en cada dirección: firmar con el token da 401 en todos los webhooks;
enviar con el app secret da 190.

---

## 11 · Fuentes

Verificado el 19/09/2026. Si han pasado meses, vuelve a mirar.

- Webhooks (verificación GET, firma, reintentos de 36 h):
  <https://developers.facebook.com/docs/graph-api/webhooks/getting-started>
- Referencia del webhook `messages`:
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages>
- Media (dos pasos, 5 min, 7 días, tipos y tamaños):
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media>
- Precios y ventana de 24 h / FEP de 72 h:
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing>
- Códigos de error:
  <https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/>
- Versiones de la Graph API (v26.0 desde el 29/07/2026):
  <https://developers.facebook.com/docs/graph-api/changelog/versions/>
- Deepgram nova-3 e idiomas:
  <https://developers.deepgram.com/docs/models-languages-overview>
- Deepgram Keyterm Prompting:
  <https://developers.deepgram.com/docs/keyterm>
