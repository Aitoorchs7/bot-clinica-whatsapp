# Estado de F4 · El canal de WhatsApp

> **Para quien retome F4**, en una conversación nueva o dentro de seis meses.
> Fecha: 19 de septiembre de 2026. Rama: `f1-base-de-datos-y-rls`.
>
> **F4 está cerrada y verificada contra una base de datos real.** El webhook
> hace los cinco pasos en orden, los doce módulos de `src/lib/whatsapp/` llevan
> un mensaje de Meta al motor de F3 y su respuesta de vuelta, y las 707 pruebas
> dan el mismo número dos veces seguidas. La batería ha demostrado que
> **mira**: se rompieron a propósito las cinco garantías de la fase —el cable
> de `mensajeId`, la firma sobre el JSON re-serializado, el 200 antes del
> modelo, la idempotencia y el debounce— y cada una se puso roja donde debía.
> El apartado [§5 La prueba de que la prueba sirve](#5--la-prueba-de-que-la-prueba-sirve)
> es el que hay que leer si solo se va a leer uno.
>
> El motor del bot es F3 y aquí es **intocable**: F4 solo le da de comer lo que
> llega de Meta y manda lo que devuelve. El panel es F5 y los trabajos
> programados F6; no entran.
>
> Contexto previo: [PLAN.md](PLAN.md), [ESTADO_F3.md](ESTADO_F3.md) —y en
> particular su **§8**, que es la lista de pendientes que esta fase tenía que
> recoger—, [ESTADO_F2.md](ESTADO_F2.md) y [ESTADO_F1.md](ESTADO_F1.md).

---

## 0 · El contrato, escrito ANTES de tocar el primer archivo

`.claude/CLAUDE.md` lo exige y F1, F2 y F3 lo cumplieron. Se escribe entero aquí
arriba, antes del código, y al cerrar se ejecuta PRUEBA y se pega la salida
real. **No se reescribe el contrato para que encaje con lo que salió.**

### ENTREGA

`src/app/api/whatsapp/webhook/route.ts` — el único punto de entrada:

| Método | Qué hace |
|---|---|
| `GET` | La verificación de Meta: `hub.mode`, `hub.verify_token`, `hub.challenge` |
| `POST` | Los cinco pasos en el orden exacto: crudo → firma → idempotencia → 200 → `after()` |

`src/lib/whatsapp/`, doce módulos:

| Archivo | Qué hace |
|---|---|
| `config.ts` | Entorno, versión de la Graph API, y el mapa `phone_number_id` ↔ `clinica_id` |
| `firma.ts` | HMAC-SHA256 sobre el cuerpo crudo con `timingSafeEqual`. **Puro** |
| `botones.ts` | El switch del principio: texto / audio / botón, sobre la carga de Meta. **Puro** |
| `meta.ts` | La frontera HTTP con Graph. Reintentos con backoff y clasificación de errores |
| `plantillas.ts` | `recordatorio_cita` y `confirmacion_cita` (utility, con botones), y el aviso al equipo |
| `ventana.ts` | Calcula y guarda `conversaciones.ventana_24h_expira` |
| `enviar.ts` | Texto libre si la ventana está abierta; plantilla si no. Limpia el markdown |
| `audio.ts` | `audio.id` → URL de Meta → descarga con Bearer → Deepgram `nova-3` en español |
| `agrupar.ts` | El debounce de 8 s, decidido **contra la base**, no en memoria |
| `almacen.ts` | Conversación, paciente, historial, y el guardado de **todo** mensaje con tokens y coste |
| `escalado.ts` | Aviso al equipo por WhatsApp (plantilla) y por email |
| `procesar.ts` | `procesarMensaje()`: el orquestador que llama `after()` |

Y **una línea** en `src/lib/bot/cerebro.ts`: `mensajeId` viaja de `Peticion` a
`Contexto`. Es el pendiente §8.4 de ESTADO_F3, que dice literalmente «cuando F4
guarde mensajes, hay que pasarlo». `Contexto.mensajeId` y el `escalar()` que lo
escribe **ya existen desde F3**: lo único que falta es el cable.

### PRUEBA

```
pnpm vitest run tests/whatsapp        # sin red, sin base: la mayoría
pnpm vitest run tests/whatsapp-vivo   # base real, Meta y Gemini simulados
pnpm test                             # la suite entera, dos veces
pnpm typecheck
pnpm lint
```

Criterio de F1, F2 y F3, sin rebajarlo: **el mismo número dos veces seguidas**,
y haberla visto ponerse roja donde debe.

Las cuatro que el encargo exige por su nombre:

1. Firma inválida → 401. Firma válida → 200.
2. El mismo `wa_event_id` dos veces → **una** fila en cada tabla que solo
   debiera escribirse una vez.
3. Cuatro mensajes seguidos y rápidos → **una** respuesta, que tiene en cuenta
   los cuatro.
4. Una escalación real deja `escalados.mensaje_id` apuntando al mensaje
   correcto, **no null**.

### LÍMITES

- **El motor de F3 no se toca**, salvo el cable de `mensajeId`, que ESTADO_F3
  §8.4 encarga explícitamente a esta fase. Ni una herramienta nueva, ni una
  línea de `herramientas.ts`, `clasificador.ts`, `gemini.ts`, `muestreo.ts`,
  `historial.ts` ni `validacion.ts`.
- Ni una migración. Ni una política RLS. Ni un bloque de `contenido/bloques/`.
  Ni `sin_solape`. Ni los tres clientes de Supabase.
- **Nada usa `service_role`.** `crearClienteBot` para todo lo que toque la base
  en el camino del bot.
- No entra F3b (estrechar la RLS a `pacientes` / `conversaciones` / `mensajes`),
  ni la barandilla 4 con modelo real. Quedaron aparcados y siguen aparcados.
- No entra el panel (F5) ni los trabajos programados (F6). En particular: **no
  hay bandeja de respuesta humana**, decidido por el usuario.
- Cancelar o mover citas por WhatsApp está fuera de alcance del producto. Los
  botones de `recordatorio_cita` se declaran, pero el flujo que los atiende es
  F6.

### SUPUESTOS

1. Una clínica = un `phone_number_id`. El mapa vive en el entorno porque **no
   hay forma de resolverlo contra la base sin `service_role`**: la RLS del rol
   `bot` exige saber ya qué clínica eres. Ver §3.
2. `responder()` de F3 se usa tal cual. F4 no envuelve el bucle de
   herramientas ni lo repite.
3. El teléfono de la conversación lo pone el canal, nunca el modelo — es el
   supuesto 3 de F3 y esta fase es quien lo cumple.
4. El tier gratuito de Gemini no se gasta en la suite por defecto: F4 hereda la
   regla de ESTADO_F3 §1 y **`pnpm test` no llama ni a Gemini ni a Meta ni a
   Deepgram**.
5. Deepgram y el proveedor de email pueden no estar configurados en desarrollo.
   Su ausencia degrada, no rompe.

### FALLOS

Lo que se espera que salga mal, escrito antes de verlo:

1. **La firma se verifica sobre un JSON re-serializado** y deja de cuadrar en
   cuanto alguien escribe un acento. Es el fallo clásico de este webhook y en
   español es *siempre*. Prueba obligatoria con acentos.
2. **La idempotencia se comprueba en memoria** y dos invocaciones concurrentes
   crean dos citas. Tiene que ser el índice único de la base.
3. **El debounce se guarda en memoria** y en serverless cada mensaje cae en una
   instancia distinta: las cuatro ramas se creen la última y contestan cuatro
   veces.
4. **El bot solo mira `text.body`** y se queda mudo ante un botón de plantilla,
   que llega en `button.payload`.
5. **`mensajeId` se queda en `undefined`** y el escalado sigue naciendo sin
   hilo que leer, exactamente igual que en F3. El test tiene que exigir el id
   **correcto**, no «no nulo»: apuntar al mensaje equivocado pasaría igual.
6. **Se contesta 200 después de llamar al modelo** porque `after()` se usa mal,
   y Meta reintenta.
7. **El markdown del modelo llega al paciente** con los asteriscos a la vista.
8. Una nota de voz que no se puede transcribir **se adivina**.

---

## 1 · Qué hay construido

### La ruta

`src/app/api/whatsapp/webhook/route.ts`, `maxDuration = 60`. Los cinco pasos y
lo que impide cada uno:

| # | Paso | Qué impide |
|---|---|---|
| 1 | `await req.text()` | Que la firma no cuadre nunca con un acento por medio |
| 2 | HMAC + `timingSafeEqual` | Que cualquiera con la URL le dicte mensajes al bot |
| 3 | `INSERT` en `eventos_webhook` | Que un reintento de Meta cree una segunda cita |
| 4 | `200` | Que Meta dé la entrega por fallida y reintente |
| 5 | `after()` | — es donde vive todo lo lento |

`proxy.ts` no protege esta ruta **y no debe**: quien llama es Meta, no una
sesión con cookie. La autenticación de esta ruta es la firma, y vive dentro.

### Los doce módulos

| Archivo | Qué resuelve |
|---|---|
| `config.ts` | Entorno, versión de Graph clavada, y el mapa número ↔ clínica |
| `firma.ts` | HMAC sobre el cuerpo crudo. **Pura**, y nunca lanza |
| `botones.ts` | El switch, sobre la carga de Meta leída a la defensiva. **Pura** |
| `meta.ts` | Reintentos, backoff con jitter, y qué error es temporal |
| `plantillas.ts` | Las tres, con sus parámetros posicionales |
| `ventana.ts` | El cálculo (puro) y la única escritura |
| `enviar.ts` | Texto o plantilla, y la limpieza del markdown |
| `audio.ts` | Media de Meta → Deepgram → texto, o `undefined` |
| `agrupar.ts` | El debounce, contra la base |
| `almacen.ts` | Conversación, mensajes, historial, coste, idempotencia |
| `escalado.ts` | Aviso al equipo por dos vías |
| `procesar.ts` | Los once pasos, en orden |

### El orden que ejecuta `procesarMensaje()`

```
 1 · de qué clínica es       config lo dice, la base lo CONFIRMA
 2 · conversación abierta    una por número (índice único parcial)
 3 · el switch               texto / audio / botón / lo que no se lee
 4 · GUARDAR el entrante     ← aquí nace el mensaje_id del escalado
 5 · ventana de 24 h         se reinicia con cada entrante
 6 · DEBOUNCE                8 s; si llegó otro, esta rama se calla
 7 · historial               de la base
 8 · responder()             el motor de F3, con mensajeId puesto
 9 · enviar
10 · GUARDAR el saliente     con wa_message_id, tokens y coste
11 · si escaló               avisar al equipo (WhatsApp + email)
```

El entrante se guarda **antes** del debounce a propósito: el debounce se decide
preguntando a la base cuál es el último mensaje, y si se guardara después las
cuatro ramas dormirían sin verse y contestarían las cuatro.

---

## 2 · Lo único que se tocó del motor de F3

**Una cosa, y la encargaba ESTADO_F3 §8.4 por escrito.** `Peticion` gana
`mensajeId?: number` y `responder()` lo pasa a `Contexto`. `Contexto.mensajeId`
y el `escalar()` que lo escribe **ya existían desde F3**; lo que faltaba era el
cable. Sigue siendo opcional, así que las pruebas del motor que no guardan
mensajes funcionan exactamente igual que antes.

Ni una herramienta nueva. Ni una línea de `herramientas.ts`, `clasificador.ts`,
`gemini.ts`, `muestreo.ts`, `historial.ts` ni `validacion.ts`. Ni una migración,
ni una política RLS, ni `sin_solape`, ni un bloque de `contenido/bloques/`, ni
los tres clientes de Supabase.

### Los tokens se cuentan SIN tocar el motor

`RespuestaDelBot` no expone los tokens, y no hacía falta: F3 no guarda mensajes.
Guardarlos es trabajo de F4 — y F4 es quien construye el `Modelo` que le pasa a
`responder()`, así que cuenta por fuera, envolviéndolo (`modeloContado`). Suma
cerebro y clasificador, porque los dos se gastan para producir una sola
respuesta y es esa respuesta la que lleva el coste.

---

## 3 · La decisión que no era obvia: de qué clínica es un webhook

`clinicas.wa_phone_number_id` existe y es único, así que lo natural sería
resolverlo con una consulta. **No se puede**, y el motivo es la promesa del
producto: la RLS del rol `bot` exige que el `clinica_id` viaje ya firmado dentro
del JWT. Para leer la fila de una clínica hay que saber antes qué clínica eres.
Una consulta «dame la clínica cuyo `phone_number_id` es X» tendría que correr
sin identidad de inquilino, y la única llave que abre eso es `service_role`.

Las tres salidas y por qué se eligió la tercera:

| Salida | Por qué no / sí |
|---|---|
| `service_role` en el webhook | ❌ Prohibida en el camino del bot, sin excepciones |
| Función `SECURITY DEFINER` | ❌ Exige justificación escrita en un `COMMENT` y una migración nueva; F4 no toca migraciones |
| Mapa en el entorno + **comprobación** contra la base | ✅ |

Lo elegido son **dos pasos**: `WHATSAPP_CLINICAS` dice qué clínica es, y después
—ya con el token firmado— se lee su propia fila y se exige que su
`wa_phone_number_id` sea el que vino en el webhook. Si el mapa estuviera mal
puesto, no se atiende el mensaje: contestarle a un paciente con los datos de
otra clínica es la peor cosa que puede hacer un sistema multi-inquilino.

De paso, esa misma lectura comprueba que el bot ve **exactamente una** clínica.
Dos serían una política que no acota por inquilino, y eso no pasa en silencio.

### Otras decisiones

**✅ La versión de la Graph API va clavada, no a un alias.** `v25.0`
(18/02/2026, caduca el 29/07/2028). La más nueva el 19/09/2026 es `v26.0`, de
julio; se elige la anterior porque una versión de dos meses todavía se mueve.
Mismo criterio que los modelos de Gemini en `gemini.ts`: un cambio silencioso es
peor que un fallo ruidoso. Se puede forzar con `GRAPH_API_VERSION`.

**✅ El correo se manda por HTTP, sin dependencia nueva.** No había proveedor
decidido en ninguna parte del proyecto y el encargo pide avisar por email, así
que se elige uno: Resend, con `fetch`. Todo lo específico del proveedor está en
una función de veinte líneas. Sin `RESEND_API_KEY` no se manda, se avisa en el
registro, y **el aviso por WhatsApp sale igual**: los dos van con
`allSettled`, para que un fallo de Meta no deje al equipo sin enterarse.

**✅ El aviso al equipo va por plantilla, no por texto libre.** Recepción puede
llevar horas sin escribirle al bot, así que su ventana de 24 h no tiene por qué
estar abierta.

**⚪ Se deja: `citas` sin estrechar.** Es F3b y sigue aparcado.

---

## 4 · La prueba de las dos tiradas

Criterio de F1, F2 y F3, sin rebajarlo. Salida real, pegada tal cual:

```
===== TIRADA 1 =====
 Test Files  27 passed | 1 skipped (28)
      Tests  707 passed | 5 skipped (712)
   Duration  64.11s

===== TIRADA 2 =====
 Test Files  27 passed | 1 skipped (28)
      Tests  707 passed | 5 skipped (712)
   Duration  60.92s
```

El archivo saltado y las 5 pruebas saltadas siguen siendo `tests/bot-contrato/`,
que no corre sin `GEMINI_VIVO=1`. Es lo que decidió ESTADO_F3 §1.

```
npx tsc --noEmit    -> exit 0
npx eslint          -> exit 0
```

### Lo que aporta F4

| | Antes de F4 | F4 | Total |
|---|---|---|---|
| Pruebas que pasan | 528 | **+179** | 707 |
| Nivel 1 · sin red ni base (`tests/whatsapp/`) | — | 166 | |
| Nivel 2 · base real, Meta y Gemini simulados (`tests/whatsapp-vivo/`) | — | 13 | |

**`pnpm test` no hace ni una petición a Meta, ni a Deepgram, ni a Gemini.** Es
la regla de ESTADO_F3 §1, heredada entera.

---

## 5 · La prueba de que la prueba sirve

Que la suite corra demuestra que corre. Solo verla ponerse roja donde debe
demuestra que mira. Cinco garantías de F4, rotas a propósito, con la
restauración atada a la misma orden (la lección de F1 §5.1).

### 5.1 · El cable de `mensajeId`

Quitada la línea de `cerebro.ts`:

```
× UNA ESCALACION DEJA `escalados.mensaje_id` APUNTANDO AL MENSAJE CORRECTO
  AssertionError: expected null to be 265
  Tests  1 failed | 12 skipped (13)
--- restaurado ---
```

`expected null to be 265` es exactamente el estado en que F3 dejó las cosas. Y
la aserción es **el id correcto**, no «no es null»: apuntar al mensaje
equivocado pasaría igual una aserción de no-nulo, y es el FALLO #5 del contrato.

### 5.2 · La firma sobre el JSON re-serializado

El bug clásico, metido en la ruta:

```
× ACENTOS: una carga con acentos y firma valida -> 200
× un cuerpo que no es JSON, con firma valida: 200 y nada mas
  Tests  2 failed | 21 passed (23)
--- restaurado ---
```

**Lo que hay que mirar es lo que siguió verde.** «Firma válida → 200» con el
cuerpo `hola` pasó sin despeinarse. Un webhook roto así funciona en las pruebas
de humo y se cae con el primer paciente español que escribe bien. Por eso la
prueba de los acentos existe, y por eso hay otra al lado que demuestra que el
camino ingenuo produce bytes distintos.

### 5.3 · El 200 después del modelo

`after(...)` cambiado por un `await` en línea:

```
× cuando POST devuelve, procesarMensaje TODAVIA no ha corrido
× ...y luego SI corre: la prueba de arriba no pasa por no hacer nada
× un fallo del procesado no cambia el 200 que ya se dio
× EL MISMO wa_event_id DOS VECES: la segunda no procesa nada
× el evento se marca como procesado al terminar
× un webhook de estado se anota y NO se contesta
  Tests  6 failed | 17 passed (23)
--- restaurado ---
```

Las dos primeras van en pareja a propósito, igual que la puerta de la
confirmación en ESTADO_F3 §5.2: una prueba que solo dijera «todavía no ha
corrido» **se quedaría verde con un webhook que no procesara nada nunca**.

### 5.4 · La idempotencia por consultar-y-luego-insertar

`anotarEvento` cambiado a `select` y después `insert`, que es la carrera
clásica:

```
× LO GARANTIZA LA BASE: diez a la vez y sigue habiendo una
  AssertionError: expected [ { nuevo: true, id: 146 }, …(8) ] to have a length of 1 but got 9
  Tests  1 failed | 12 skipped (13)
--- restaurado ---
```

Nueve de diez se creyeron nuevas: nueve citas duplicadas. Y **la prueba
secuencial —el mismo id dos veces seguidas— siguió verde**, que es justo por lo
que hay dos: consultar-y-luego-insertar funciona perfectamente mientras nadie
corra a la vez, y Meta reintenta a la vez.

### 5.5 · El debounce decidido en memoria

Cada rama creyéndose la última, que es lo que pasa cuando «el más reciente» vive
en la memoria del proceso:

```
× CUATRO MENSAJES SEGUIDOS -> UNA respuesta, que tiene en cuenta los cuatro
  AssertionError: expected [ { hecho: 'contestado', …(3) } ] to have a length of 1 but got 4
  Tests  1 failed | 12 skipped (13)
--- restaurado ---
```

Cuatro respuestas y cuatro llamadas al modelo pagadas, que es exactamente el
problema que el debounce viene a resolver.

---

## 6 · El guardián estático se amplió, y se comprobó midiendo

`tests/barandillas/04-sin-filtro-en-codigo.test.ts` define «el camino del bot»
como todo lo de `barandillas/` más cualquier archivo que contenga
`crearClienteBot`. ESTADO_F2 §3.2 prometía que se extendería solo, y con F3 se
cumplió.

**Con F4 no bastaba.** Se listó el alcance en vez de suponerlo:

```
antes:  4 de barandillas + herramientas.ts + validacion.ts + bot.ts
        + almacen.ts                                                  (8)
```

`ventana.ts`, `agrupar.ts` y `procesar.ts` **consultan la base con el cliente
del bot y quedaban fuera**, porque lo reciben ya construido y no nombran
`crearClienteBot`. Podían meter un `.eq('clinica_id', ...)` sin que nadie se
enterara.

Ahora también entra quien nombre el **tipo** `ClienteDelBot`, que es como viaja
el cliente entre módulos:

```
después: los 8 de antes + cerebro.ts + ventana.ts + agrupar.ts
         + procesar.ts                                                (12)
```

Y mordió de verdad durante la fase: `guardarVentana()` se escribió con un
`.eq('clinica_id', clinicaId)` —parecía prudencia— y el guardián lo señaló. Está
quitado, con el porqué escrito en la cabecera de la función.

---

## 7 · Formas de que esto «funcione» sin servir

| Cómo se falsea | Qué lo impide |
|---|---|
| Verificar la firma sobre `JSON.stringify(await req.json())` | §5.2: prueba con acentos, y otra que demuestra que los bytes cambian |
| La idempotencia se comprueba en memoria | §5.4: diez a la vez contra Postgres de verdad |
| El 200 sale después del modelo | §5.3, y su pareja que exige que el trabajo SÍ corra |
| El debounce se guarda en memoria | §5.5: cuatro mensajes concurrentes |
| El test del escalado solo exige «mensaje_id no es null» | Exige el id **correcto**, y que el mensaje apuntado sea del paciente |
| Se prohíbe el markdown solo en el prompt | `limpiarMarkdown()` corre antes del `fetch`, y se mide lo que sale por el cable |
| El bot solo mira `text.body` | Prueba de los dos sitios del botón, plantilla e interactivo |
| Se adivina un audio que no se pudo transcribir | Ocho pruebas de que devuelve `undefined`, y ninguna rama que rellene |
| El aviso del escalado lleva el síntoma | Se comprueba que «muela» no sale ni en el WhatsApp ni en el correo |
| Una prueba se queda verde porque el envío falló en silencio | El registro de las pruebas vivas **guarda** los errores y se exige que no haya |

---

## 8 · Lo que queda pendiente

> ### ⚠️ Al cerrar F5, la lista viva se movió
>
> **Las dos copias al día son ahora [ESTADO_F5.md](ESTADO_F5.md) §8 y
> [PLAN.md](PLAN.md) §11.** Lo de aquí abajo es lo que estaba pendiente cuando
> se cerró F4, y se deja tal cual porque es el registro de esa fase: F5 añadió
> dos pendientes nuevos y corrigió, midiendo, una afirmación sobre
> `middleware.ts` que este documento no repite pero que sí está en
> `ESTADO_F1 §1` y en `.claude/CLAUDE.md` (ver `ESTADO_F5 §5.1` y §8.1). No se
> edita un `ESTADO_*` cerrado; se dice dónde mirar.
>
> **Esta lista tiene dos copias: aquí y en [PLAN.md](PLAN.md) §11.** Es la regla
> que dejó escrita ESTADO_F3 §8 y que F4 ha podido cumplir por fin, porque
> `PLAN.md` no existía hasta ahora. No vive en un solo sitio a propósito: con F1
> casi se pierde un pendiente porque estaba únicamente en su `ESTADO_*.md`, y
> eso depende de que alguien se acuerde de releerlo al empezar la sesión
> siguiente. **Si se toca algo de aquí, hay que tocarlo también allí — son dos
> copias y lo saben las dos.**
>
> De todos ellos, los tres de `alta-clinica` (§8.1 y §8.5) son los únicos que
> bloquean dar de alta una clínica de verdad.

### 8.1 · `mensaje_urgencia` sigue sin sembrarse — Y SE TOCÓ EL HUECO

ESTADO_F3 §8.3 lo dejó anotado y F4 se lo encontró vacío, como estaba previsto:
**no hay ni una fila `mensaje_urgencia` en `config`** en todo el repositorio
(comprobado con `grep` sobre `tests/`, `scripts/`, `contenido/` y `src/`: solo
aparece el nombre de la clave, en `clasificador.ts`).

O sea que al escalar, el paciente recibe hoy el mensaje **por defecto**, que es
correcto y lleva el teléfono de la clínica —la prueba viva lo comprueba— pero es
genérico. **No bloquea F4 y no se ha tapado aquí**: rellenarlo es el guion de
`alta-clinica` (F8), igual que `politica_privacidad`.

**Decisión del usuario, confirmada al cerrar la fase:** se deja señalado en vez
de improvisar aquí una fila que no está en ninguna parte. Inventar el texto de
un mensaje de urgencia —lo que el bot le dice a alguien con la cara hinchada—
es decisión de la clínica, no del que escribe el código, y una fila sembrada
«de momento» se queda para siempre porque deja de dar guerra. Queda en la lista
de pendientes de `alta-clinica`, **no resuelto en F4**.

### 8.2 · F3b y la barandilla 4 siguen aparcados

Sin cambios respecto a ESTADO_F3 §8.1 y §8.2. F4 no los ha tocado, como decían
los LÍMITES. Lo que sí añade F4 es más motivo para F3b: ahora `mensajes` tiene
dentro el texto libre de los pacientes de verdad.

### 8.3 · Los botones de `recordatorio_cita` no tienen quien los atienda

La plantilla los declara y `botones.ts` sabe leerlos, pero **cancelar o mover
citas por WhatsApp está fuera de alcance del producto** y el trabajo que manda
los recordatorios es F6. Hoy un `CONFIRMAR:<id>` llega al modelo como el texto
«Confirmar» y se trata como una frase más. Cuando F6 mande recordatorios, hay
que decidir qué hace ese payload **antes** de mandar la primera plantilla.

### 8.4 · Los dos pendientes de F1 y F2 siguen abiertos

1. El CI no impide mezclar: falta marcar `comprobaciones-estaticas` como check
   obligatorio en Settings → Branches.
2. La mitad viva no corre en CI: faltan `RLS_VIVA=true` y los cuatro secretos
   `SUPABASE_*_DEV`.

Con F4 pesa todavía más: de las 179 pruebas nuevas, **166 no necesitan
credenciales de nada**.

### 8.5 · Dar de alta una clínica exige tocar el entorno Y REDESPLEGAR

**Requisito explícito para la futura skill `alta-clinica` (F8). No es un detalle
de configuración: es un coste operativo, y hay que decirlo así.**

El usuario aprobó el diseño de §3 —`WHATSAPP_CLINICAS` por entorno más
comprobación contra `clinicas.wa_phone_number_id`— con esta consecuencia
anotada. Dar de alta una clínica nueva **no es solo insertar filas en la base**.
Son tres pasos, y los tres tienen que estar en el guion:

| # | Paso | Dónde |
|---|---|---|
| 1 | Insertar la clínica con su `wa_phone_number_id` | Base de datos |
| 2 | Añadir `"<phone_number_id>": "<clinica_id>"` a `WHATSAPP_CLINICAS` | **Entorno de Vercel** |
| 3 | **Volver a desplegar** para que el proceso lea la variable nueva | **Vercel** |

**Por qué el paso 3 no se puede saltar.** `mapaDeClinicas()` cachea el JSON en
memoria del proceso la primera vez que se lee. Una variable de entorno cambiada
en el panel de Vercel **no llega a un proceso que ya está vivo**: hace falta un
despliegue nuevo. Hasta entonces, el canal rechaza los mensajes de la clínica
recién dada de alta.

**Y si solo se hace uno de los dos primeros, tampoco funciona**, aunque falla de
formas distintas:

- Sin el paso 2, `clinicaDelNumero()` no la encuentra: el webhook devuelve 200 y
  **no hace nada**, con un aviso en el registro. El paciente no recibe respuesta
  y nadie se entera salvo que alguien mire los logs.
- Sin el paso 1, `exigirClinicaDelCanal()` lanza nombrando los dos valores que
  no cuadran. Este falla ruidosamente, que es el modo bueno de fallar.

**Lo que hay que decirle al cliente**, en sus palabras: dar de alta una clínica
nueva no es automático; hay que añadir su número a los valores secretos y
volver a publicar. Cuesta minutos, pero **alguien tiene que hacerlo** y no puede
ser la propia clínica desde el panel.

**Cuándo dejaría de hacer falta:** el día que resolver
`phone_number_id → clinica_id` se pueda hacer contra la base sin `service_role`.
Eso es una función `SECURITY DEFINER` con su justificación escrita en un
`COMMENT`, más una migración. No se hizo en F4 porque la fase no tocaba
migraciones; **si el producto llega a diez clínicas, merece la pena volver
aquí**. Con una o dos, el coste de tres pasos en un alta es menor que el de una
función que se salta la RLS.

### Limitaciones conocidas

- **El debounce cuesta 8 s de latencia siempre**, también cuando el paciente
  manda un solo mensaje. Se puede bajar con `WHATSAPP_DEBOUNCE_MS` después de
  medirlo con una clínica de verdad.
- **`after()` depende de la plataforma.** En Vercel se apoya en `waitUntil`;
  `maxDuration = 60` cubre debounce + modelo + envíos, pero una clínica con
  conversaciones muy largas habría que volver a medirla.
- **El nombre del perfil de WhatsApp no se usa como nombre de la ficha.** Llega
  y se guarda en el entrante, pero el nombre del paciente sigue saliendo de
  `anotar`, donde el paciente lo dice. El del perfil lo elige él y puede ser
  «Papá» o un emoji.
- **Las plantillas hay que darlas de alta en el panel de Meta**, y sus
  parámetros son posicionales: si alguien las reordena allí sin tocar el código,
  los datos salen cambiados de sitio **sin un solo error**. No hay forma de
  comprobarlo desde aquí.
- **Los estados `played`** (que Meta empezó a mandar para notas de voz en marzo
  de 2026) se reconocen y se ignoran: no hay columna donde ponerlos.
- **Un `sin_soporte` contesta siempre lo mismo.** Una imagen de una radiografía
  y una ubicación reciben el mismo «escríbemelo».

---

## 9 · Reglas del proyecto que siguen mandando

- **No tocar sin confirmación explícita:** las políticas RLS de
  `supabase/migrations/`, los bloques de `contenido/bloques/`, el constraint
  `sin_solape`, y los tres clientes de Supabase. **F4 no ha tocado ninguno.**
- Nada del camino del bot usa `service_role`. `crearClienteBot` para todo.
- La RLS filtra; el código comprueba y avisa. Ningún archivo del camino del bot
  repite en la consulta un predicado de seguridad (§6).
- `escalados` no tiene ni una columna de texto libre, y **el aviso al equipo
  tampoco lleva ninguna**: si el síntoma saliera en un WhatsApp o en un correo,
  se quedaría fuera del alcance de la purga de 90 días para siempre.
- Una sola tirada de Vitest a la vez contra la base de desarrollo
  (ESTADO_F3 §5.4).
