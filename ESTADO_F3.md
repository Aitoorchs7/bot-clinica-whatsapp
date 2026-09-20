# Estado de F3 · El motor del bot

> Cerebro, herramientas y clasificador. El canal de WhatsApp es F4 y no entra
> aquí. El panel y las notas de voz tampoco.

---

## 0 · El contrato, escrito ANTES de tocar el primer archivo

`.claude/CLAUDE.md` lo exige y F1 y F2 lo cumplieron. Se escribe entero aquí
arriba, antes del código, y al cerrar se ejecuta PRUEBA y se pega la salida
real. **No se reescribe el contrato para que encaje con lo que salió.**

### ENTREGA

`src/lib/bot/`, siete módulos:

| Archivo | Qué hace |
|---|---|
| `validacion.ts` | Zod: teléfono español, nombres, fechas, y el enum `motivo_cerrado` |
| `muestreo.ts` | La rejilla de 30-40 huecos del RPC → dos o cuatro opciones repartidas por el día. **Puro** |
| `herramientas.ts` | Las SEIS. Ni una más. Declaración de Gemini + Zod + ejecutor |
| `historial.ts` | La ventana de 10 parejas y el recordatorio de reglas duras del final |
| `gemini.ts` | La frontera con el SDK. Es la costura por la que se simula el modelo |
| `clasificador.ts` | `gemini-2.5-flash-lite`. Filtra ANTES del cerebro |
| `cerebro.ts` | `gemini-2.5-flash`. Bucle de herramientas, con el prompt de `montarPromptDeDatos()` |

> **Nota añadida al cerrar, sin tocar lo de arriba.** Los dos modelos de esta
> tabla —los que fijaban `PLAN.md` y `.claude/CLAUDE.md` cuando se escribió este
> contrato— **ya no se pueden llamar**: devuelven 404 a una clave nueva. Se
> descubrió ejecutando PRUEBA, que es para lo que está. Lo que corre de verdad y
> por qué, en §7.1; los dos documentos ya están actualizados. El contrato se
> queda como se escribió: reescribirlo para que encaje con lo que salió es
> exactamente lo que `.claude/CLAUDE.md` prohíbe.

### PRUEBA

```
pnpm vitest run tests/bot          # sin red, sin base: la mayoría
pnpm vitest run tests/bot-vivo     # base real, modelo simulado
GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato   # Gemini de verdad, a mano
pnpm typecheck
```

Criterio de F1 y F2, sin rebajarlo: **el mismo número dos veces seguidas**, y
haberla visto ponerse roja donde debe.

### LÍMITES

- No se toca `bot.ts`, ni `navegador.ts`, ni `servidor.ts`, ni ninguna
  migración, ni ningún bloque de `contenido/bloques/`. Son los cuatro grupos de
  archivos protegidos y F3 no necesita ninguno.
- No entra el webhook (F4), ni el panel (F5), ni las notas de voz (F4).
- No entra `recuperacion.ts` (FAQ por pgvector): PLAN.md lo condiciona a más de
  100 preguntas y la clínica piloto tiene 16.
- El estrechamiento de la RLS a la conversación **no entra**: decidido con el
  usuario, ver §7.

### SUPUESTOS

1. Los RPC `consultar_huecos` y `crear_cita` de la migración 005 se usan tal
   cual. F3 no los modifica ni los envuelve en SQL nuevo.
2. `crearClienteBot(clinicaId)` es la única puerta a la base. Ninguna
   herramienta ve `service_role`.
3. El teléfono de la conversación lo pone el canal (F4), nunca el modelo.
4. El tier gratuito de Gemini tiene un límite diario que no está garantizado.
   La suite por defecto no gasta ni una petición.

### FALLOS

Lo que se espera que salga mal, escrito antes de verlo:

1. **El muestreo ofrece un hueco que `crear_cita` rechaza.** Es el bug de V1.
   Prueba obligatoria.
2. **El modelo llama a una herramienta que no existe**, o a una de las seis con
   argumentos que no validan.
3. **El modelo llama a `crear_cita` sin confirmación del paciente.** Prueba
   obligatoria: sin confirmación no se escribe ni una fila.
4. **La suite se vuelve no determinista por el límite de Gemini.** Es el
   equivalente del incidente de F1 con Supabase Auth (50 logins en 28 s). Ver
   §1 abajo.
5. El recordatorio del final se queda vacío en silencio si alguien renumera los
   bloques.

---

## 1 · La estrategia de pruebas con el LLM, decidida antes del primer test

En F1 el hallazgo más serio no fue una política mal escrita: fue una suite **no
determinista**, porque cincuenta inicios de sesión en veintiocho segundos
agotaban el límite de Supabase Auth y la tirada fallaba en un sitio distinto
cada vez. Una batería de seguridad cuyo recuento cambia entre dos ejecuciones no
demuestra nada, ni cuando falla ni cuando pasa.

Aquí el riesgo equivalente es Gemini, y es peor por dos motivos: el límite del
tier gratuito es **diario**, así que una vez agotado la suite no vuelve a estar
verde hasta mañana; y el modelo **no es determinista entre dos tiradas**, así
que una aserción sobre lo que contesta puede pasar a las once y fallar a las
once y cinco sin que nadie haya tocado nada.

De ahí la regla que manda sobre todo lo demás en esta fase:

> **`pnpm test` no hace ni una sola llamada a Gemini.**

Tres niveles, y cada prueba va al más barato que la pueda comprobar:

### Nivel 1 · Sin red y sin base — `tests/bot/`

La mayoría. Corre en `comprobaciones-estaticas` de CI, en una máquina recién
clonada, sin credenciales de nada:

- validación de Zod, caso por caso, con la tabla de V1 (T4)
- que solo se puedan llamar las seis herramientas
- el muestreo: que toda opción ofrecida salga de la rejilla del RPC
- la ventana de 10 parejas y el recordatorio del final
- que sin confirmación explícita no se llame a `crear_cita`
- las reglas duras del clasificador, que son deterministas y no llaman a nadie

### Nivel 2 · Base real, modelo simulado — `tests/bot-vivo/`

Gated con `describeVivo`, igual que F1 y F2. Necesita Supabase, **no** necesita
Gemini:

- el bug de V1: ningún hueco ofrecido es rechazado por `crear_cita`
- que sin confirmación no aparece **ni una fila** en la base — comprobado
  contando con `service_role` desde fuera, no preguntándole al bot
- que las herramientas pasan por la RLS y no por `service_role`

### Nivel 3 · Gemini de verdad — `tests/bot-contrato/`, apagado por defecto

Se salta salvo que se pida a mano con `GEMINI_VIVO=1`. Son **pruebas de
contrato**, no de comportamiento: comprueban que el SDK sigue aceptando nuestras
declaraciones y que la respuesta tiene la forma que parseamos.

**Nunca afirman nada sobre la prosa del modelo.** Solo:

- la llamada no da error y el SDK admite las seis declaraciones
- si hay llamada a herramienta, el nombre es una de las seis
- los argumentos validan con el Zod de esa herramienta
- el clasificador devuelve un JSON que parsea

Así el nivel 3 es determinista **por construcción**: no depende de que el modelo
diga lo mismo dos veces, solo de que hable el mismo idioma.

### Dónde se simula, que es lo que decide si la prueba sirve

El doble **no** sustituye a nada que hayamos escrito nosotros. Se pincha en la
frontera del SDK (`gemini.ts`), un solo método, inyectado por parámetro. Todo lo
demás —el bucle de herramientas, la validación, la puerta de la confirmación, el
montaje del prompt— **corre de verdad** en los tres niveles.

Es el mismo principio que hizo comprobable `aplicarGuardia` en F2: se separa el
núcleo de la consulta para poder alimentarlo con filas inventadas. Simular una
RLS rota es pasarle una fila con `publico: false`; simular un modelo que se
inventa una herramienta es devolver una llamada a `borrar_agenda`.

Un doble que imitara el bucle de herramientas comprobaría el doble, no el bot.

---

## 2 · Qué hay construido

### Los siete módulos

| Archivo | Líneas | Qué resuelve |
|---|---|---|
| `validacion.ts` | ~250 | La tabla T4 de V1 en Zod. Teléfono, nombres, fechas y los dos enums |
| `muestreo.ts` | ~160 | 30-40 ranuras → dos o tres opciones. **Puro**: ni red ni reloj |
| `herramientas.ts` | ~1040 | Las seis, su catálogo, la puerta de la confirmación y el ejecutor |
| `historial.ts` | ~170 | La ventana de 10 parejas y el recordatorio del final |
| `gemini.ts` | ~180 | La frontera con `@google/genai`. Una función, `Modelo` |
| `clasificador.ts` | ~280 | Capa 1 (reglas duras) + capa 2 (flash-lite) + mensaje seguro |
| `cerebro.ts` | ~240 | El orden: datos → prompt → contar → clasificar → bucle |

### El orden que ejecuta `responder()`, que es el producto

```
1. cargarDatosDelPrompt()   la RLS decide qué llega          barandilla 1
2. montarPromptDeDatos()    los diez bloques, nunca un string
3. contar()                 SIEMPRE, también si se va a cortar  barandilla 2
4. clasificar()             ANTES del cerebro
   └─ urgencia → escalar + mensaje seguro. El cerebro NO se llama
5. bucle de herramientas    como mucho las seis              barandilla 3
```

### 2.1 · El muestreo de huecos: qué ve el modelo y qué no

`consultar_huecos` (el RPC) devuelve **la verdad completa y ordenada**, y eso no
se toca: la migración 005 lo dice en su cabecera, y el muestreo es decisión de
conversación, no de SQL. Cambiar de dos a tres opciones no puede exigir una
migración.

La reducción se hace en la capa de herramientas. **La rejilla cruda no sale de
`consultarHuecos()`**: lo único que se devuelve al modelo es `muestra.opciones`.
Medido con una agenda de verdad (jueves, 9-14 y 15:30-20, dos gabinetes):

```
Rejilla cruda del RPC : 72 filas
Horas distintas       : 36      (los dos gabinetes son la misma hora repetida)
SE OFRECEN            : 3
El bot dice           : «tengo hueco 09:00, o a las 12:00, o a las 17:00»
```

**El total tampoco se le pasa al modelo**, a propósito: `totalLibres` e
`instantesLibres` van al registro, no al resultado de la herramienta. «Hay
treinta y siete huecos» no es una frase que diga una recepcionista, y un dato
que no entra en el contexto no puede salir por la boca del bot — la misma lógica
que la barandilla 1, un piso más arriba.

Lo que lo fija, en `tests/bot/02-muestreo.test.ts` (18 en verde):

| Prueba | Qué caería si desapareciera |
|---|---|
| `un dia normal con un gabinete pasa de treinta ranuras` | el supuesto del que parte todo: sin muestreo esto sería una lista de 30-40 |
| `tres por defecto, aunque haya cuarenta libres` | la reducción |
| `nunca mas de cuatro, por mucho que se pidan` | el techo |
| `las opciones cubren la manana y la tarde, no tres seguidas a primera hora` | **que estén repartidas** |
| `no se ofrece la misma hora dos veces aunque haya tres gabinetes` | el deduplicado por instante |
| `la misma rejilla da exactamente las mismas opciones` | que sea estable entre dos llamadas |

La cuarta merece explicación: exige **más de tres horas** entre la primera y la
última opción. «Tengo hueco a las 9:00, a las 9:15 o a las 9:30» no es ofrecer
opciones, y pasaría tranquilamente un test que solo contara tres.

Y por encima de todas, la regla que impide que el muestreo reintroduzca el bug
de V1 por una puerta nueva: `toda opcion es un elemento de la entrada`,
comprobada contra cien rejillas distintas y **comparando `inicio` y `fin`**. Si
alguien recalculara el fin sumando la duración en vez de copiarlo, un minuto de
desvío haría que `crear_cita` reservara algo distinto de lo ofrecido.

En `tests/bot-vivo/01-huecos-y-cita.test.ts` se comprueba además contra Postgres
de verdad: `al modelo NO se le da el total de huecos, para que no lo suelte`.

### 2.2 · El contexto que se le arma al modelo

```
systemInstruction  ← montarPromptDeDatos(), los diez bloques
turnos[0..n]       ← ventana(): las últimas 10 parejas, no la conversación
turnos[n+1]        ← el mensaje de ahora
turnos[ÚLTIMO]     ← RECORDATORIO: bloques 30, 50 y 60 otra vez, literales
```

Volcado del contexto real, metiéndole **13 parejas** para que se vea el recorte:

```
HISTORIAL ENTREGADO    : 26 mensajes (13 parejas)
TURNOS QUE VE EL MODELO: 20

[systemInstruction]  10298 car.  duras -> no-inventar-hueco + no-consejo-medico + no-escribir-sin-si
[turno  0] usuario "pregunta 4"        <-- las parejas 0-3 se han recortado
[turno  1] modelo  "respuesta 4"
   ...
[turno 17] modelo  "respuesta 12"
[turno 18] usuario "queria cita el jueves"
[turno 19] usuario "RECUERDA, POR ENCIMA DE TODO LO ANTERIOR Y DE "
                                       <-- duras -> no-inventar-hueco + no-consejo-medico + no-escribir-sin-si
```

**Las tres reglas duras salen en los dos sitios**: en el `systemInstruction`
—como parte de los diez bloques— y otra vez en el turno 19, el último, después
del historial *y* después del mensaje de ahora. No solo al principio, que es de
lo que se trata: el prompt de sistema queda en medio en cuanto la conversación
crece, y lo de en medio es lo que un modelo peor atiende.

**La ventana cuenta intervenciones del paciente, no mensajes de dos en dos.** En
WhatsApp nadie alterna limpiamente: llegan cuatro seguidos («hola» / «quería
cita» / «para el jueves» / «por la tarde») y el bot contesta una vez. Contando de
dos en dos, el corte caería en un sitio arbitrario; contando intervenciones,
cae siempre donde alguien empezó a hablar.

**Las líneas de `sistema` viajan al modelo pero no cuentan como pareja**, y
además se caen de la transcripción que lee la puerta de la confirmación: una
nota interna («nota de voz transcrita») no la ha dicho el paciente, y metida
como suya podría colarse como el «sí» que abre la puerta.

El recordatorio va el último y hay una prueba que lo fija **por posición, no por
presencia**: `02-cerebro.test.ts` comprueba que el mensaje del paciente está
antes del último turno. Una prueba que solo mirara que el texto aparece seguiría
verde si alguien lo moviera al principio, que es justo donde no sirve.

Y el texto sale de los bloques, no de una cadena en el código: hay una prueba que
lo compara con el contenido literal del archivo de `contenido/bloques/`.

---

## 3 · Lo que se comprobó antes de escribir la primera consulta

ESTADO_F2 §3.2 avisaba de que el motivo no es obvio, y era verdad. Dos cosas
que cambiaron el código antes de existir:

### 3.1 · El guardián estático se extendió solo, como estaba escrito

En cuanto `herramientas.ts` importó `crearClienteBot`, entró en el alcance de
`tests/barandillas/04-sin-filtro-en-codigo.test.ts` sin que nadie tocara ese
archivo. Comprobado midiendo, no leyendo: se le añadió un `.eq('publico', true)`
a una consulta de `herramientas.ts` —con la restauración atada en la misma
orden, F1 §5.1— y se puso rojo nombrando el archivo:

```
× ningun archivo filtra por `publico`
+     "archivo": "src/lib/bot/herramientas.ts",
      Tests  1 failed | 15 passed (16)
--- restaurado ---
```

### 3.2 · Hay un `.eq` que SÍ está permitido, y la diferencia importa

`repasar_ficha` busca al paciente por `telefono_e164`. Parece lo prohibido y no
lo es:

| | `.eq('publico', true)` | `.eq('telefono_e164', …)` |
|---|---|---|
| ¿Lo filtra ya la RLS? | **Sí** | No |
| ¿Quién pone el valor? | el código | **el canal**, nunca el modelo |
| Si la RLS se rompe… | nadie se entera | la comprobación en código avisa |

La regla de F2, generalizada: **lo que está prohibido es duplicar un predicado
de seguridad que la RLS ya aplica**, porque el filtro en código tapa el fallo de
la política. Buscar una fila por su identidad no es eso. Aun así, lo que vuelve
se comprueba —`clinica_id` y teléfono— y lo que no debía llegar se cuenta y se
nombra por su origen, igual que en `filtro.ts`.

---

## 4 · La prueba de las dos tiradas

El criterio de F1 y F2, sin rebajarlo: no basta con que pase, tiene que dar el
**mismo número dos veces seguidas**. Salida real, pegada tal cual:

```
===== TIRADA 1 =====
 Test Files  19 passed | 1 skipped (20)
      Tests  528 passed | 5 skipped (533)
   Duration  55.88s

===== TIRADA 2 =====
 Test Files  19 passed | 1 skipped (20)
      Tests  528 passed | 5 skipped (533)
   Duration  57.47s
```

El archivo saltado y las 5 pruebas saltadas son `tests/bot-contrato/`, que no
corre sin `GEMINI_VIVO=1`. Es lo que se decidió en §1, no un descuido.

```
npx tsc --noEmit    -> exit 0
npx eslint          -> exit 0
```

### Lo que aporta F3

| | Antes de F3 | F3 | Total |
|---|---|---|---|
| Pruebas que pasan | 330 | **+198** | 528 |
| Nivel 1 · sin red ni base (`tests/bot/`) | — | 175 | |
| Nivel 2 · base real, modelo simulado (`tests/bot-vivo/`) | — | 23 | |
| Nivel 3 · Gemini de verdad (`tests/bot-contrato/`) | — | 5, apagadas | |

### El nivel 3, ejecutado a mano

```
GEMINI_VIVO=1 npx vitest run tests/bot-contrato/

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  109.79s
```

**La primera vez que se ejecutó, se puso roja**, y por eso existe: los cinco
fallaron con `404 · This model is no longer available to new users`. Ver §7.1.
Una prueba de contrato que nunca se ha ejecutado no es una prueba, es una
intención; esta cazó a las dos horas de vida lo único que ninguna otra podía
cazar.

---

## 5 · La prueba de que la prueba sirve

F1 lo dejó escrito: que la suite corra demuestra que corre. Solo verla ponerse
roja donde debe demuestra que mira. Cuatro barandillas de F3, cada una rota a
propósito.

### 5.1 · El guardián estático, contra el archivo nuevo

Ya está en §3.1: `.eq('publico', true)` metido en `herramientas.ts`, rojo
nombrando el archivo, y restaurado por el `trap` de la misma orden.

### 5.2 · La puerta de la confirmación, por los dos lados

Una prueba que solo dice «no se ha escrito nada» se queda **verde con
`crear_cita` rota del todo**. Si la herramienta lanzara en su primera línea, o
devolviera siempre un error, la tabla seguiría igual de vacía y la prueba seguiría
igual de verde. Por eso van las dos mitades, en el mismo archivo y una debajo de
la otra:

| Prueba | Qué fija |
|---|---|
| `SIN CONFIRMACION NO SE ESCRIBE NI UNA FILA` | la puerta está cerrada |
| `CON confirmacion SI se escribe: la puerta no esta rota, esta cerrada` | …y **abre** |

Es el mismo principio que F1 §5.2 —«una aserción negativa cuya única prueba es
una lista vacía pasa igual si la fila no existe»— aplicado a una escritura en
vez de a una lectura.

### 5.3 · El recordatorio mudo

FALLOS #5 anticipaba que renumerar un bloque dejaría el recordatorio vacío en
silencio. Se comprobó pasándole solo el bloque 30:

```
faltan → [50, 60]
⚠  El recordatorio del final no encuentra los bloques 50, 60. Las reglas duras
   NO se estan reinyectando despues del historial... ORDENES_DEL_RECORDATORIO
```

Y con la lista vacía devuelve `''`, no una cabecera suelta. Un
«RECUERDA POR ENCIMA DE TODO:» seguido de nada es peor que no decir nada.

### 5.4 · Dos suites a la vez se pisan, y me pasó

Lanzando `tests/bot` y `tests/bot-contrato` al mismo tiempo, la segunda tirada
se puso roja con siete fallos en `01-huecos-y-cita`. No había ningún defecto: el
`globalSetup` de Vitest siembra al arrancar y **borra las clínicas al terminar**,
así que la tirada que acababa primero se llevaba por delante el fixture de la
otra.

Las dos corren en verde por separado. Es el pariente del incidente de F1 §5.1
—el comando que abría fue a un sitio y el que cerraba a otro— y la lección es la
misma: **una sola tirada a la vez contra la base de desarrollo.** Si algún día se
quieren en paralelo, hace falta un esquema por tirada, no buena intención.

---

## 6 · Formas de que esto «funcione» sin servir

Las previstas antes de empezar, y lo que hay puesto contra cada una:

| Cómo se falsea | Qué lo impide |
|---|---|
| El muestreo redondea una hora «para que quede bonita» | `02-muestreo`: toda opción es un elemento de la entrada, con 100 rejillas |
| Se ofrece una sola hora: así nunca hay rechazo | `01-huecos-y-cita` reserva **todas** las ofrecidas, y además una NO ofrecida |
| `crear_cita` se rompe y «no escribe sin confirmación» pasa | §5.2: la mitad que exige que SÍ escriba |
| El modelo pone `confirmado: true` él solo | No existe ese argumento. La puerta mira el mensaje real del paciente |
| Un «sí» dicho a otra cosa cuela como confirmación | Tercera condición: la hora tiene que estar escrita en la conversación |
| El clasificador delega la urgencia en el modelo | Capa 1 sin red. Hay una prueba con el modelo reventando a propósito |
| El recordatorio se copia a mano en el código | Sale de los bloques; una prueba compara con el texto del archivo real |
| Se declara una herramienta de más | `NOMBRES` tiene 6 y hay prueba de la lista exacta |
| El doble del LLM simula también el bucle | El doble es una función de un método, en la frontera del SDK |

---

## 7 · Qué se decidió, y sobre todo qué se descartó

### 7.1 · ⚠️ Los modelos de PLAN.md ya no existen para una clave nueva

**Es el hallazgo más serio de la fase y hay que decidir sobre él.**

`PLAN.md` y `.claude/CLAUDE.md` fijan `gemini-2.5-flash` (cerebro) y
`gemini-2.5-flash-lite` (clasificador). Los dos devuelven **404**:

```
This model models/gemini-2.5-flash is no longer available to new users.
Please update your code to use models/gemini-3.6-flash
```

Se probaron diez candidatos uno a uno contra la API, el 18/09/2026:

| Modelo | Resultado |
|---|---|
| `gemini-2.5-flash` / `gemini-2.5-flash-lite` | **404** · no disponible para claves nuevas |
| `gemini-3.6-flash` | **OK** ← cerebro |
| `gemini-3.1-flash-lite` | **OK** ← clasificador |
| `gemini-3.5-flash` | OK |
| `gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-flash-latest` | 503 · alta demanda |
| `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` | 400 |

Puesto en `gemini.ts`: **`gemini-3.6-flash`** y **`gemini-3.1-flash-lite`**.

**Clavados a una versión, no a un alias.** `gemini-flash-latest` sería más
cómodo, pero un modelo que cambia solo invalida la auditoría de fuga
(barandilla 4) sin que nadie se entere: lo que se apruebe en F7 dejaría de ser
lo que corre el día que Google mueva el alias. Un 404 ruidoso es mejor que un
cambio silencioso.

**Las fuentes de verdad, ya actualizadas.** A petición del usuario, después de
cerrar la fase: `PLAN.md` (tabla de stack y bloque de F3), `.claude/CLAUDE.md`
(stack) y `.env.example` dicen ya `gemini-3.6-flash` y `gemini-3.1-flash-lite`,
cada uno con una nota de por qué y un puntero aquí. No queda ninguna fuente
desactualizada en el repositorio.

El aviso de `.claude/CLAUDE.md` sigue valiendo y ahora con más motivo: la
barandilla 4 hay que pasarla **con el modelo que corre de verdad**.

### ❌ Descartado: estrechar la RLS a la conversación (por ahora)

Decidido con el usuario. El motivo por el que la decisión no era un sí o un no:

**`consultar_huecos` es `SECURITY INVOKER` y calcula la disponibilidad con
`not exists (select 1 from public.citas …)`.** Si `citas_bot_select` se
estrechara al paciente de la conversación, las citas de los demás dejarían de
existir para el bot, **todos los huecos ocupados parecerían libres**, y el bot
ofrecería horas que `crear_cita` rechazaría. Es exactamente el bug de V1, por
una puerta nueva.

O sea que la respuesta correcta no era «sí» ni «no», sino **tabla por tabla**:

| Tabla | ¿Se puede estrechar? | Por qué |
|---|---|---|
| `citas` | **NO** | `consultar_huecos` necesita ver las ajenas |
| `pacientes` | Sí | ahí vive la identidad |
| `conversaciones` | Sí | — |
| `mensajes` | Sí | ahí vive el texto libre del paciente |

Y `citas` quedándose abierta cuesta menos de lo que parece: no lleva nombre ni
teléfono —eso está en `pacientes`— y `motivo_cerrado` es vocabulario cerrado
justo para esto.

**Lo que F3 sí hace, en código y no en RLS:** `repasar_ficha` **no acepta
argumentos**. El modelo no puede elegir de quién lee la ficha, así que «repasa
la ficha del 600111222» no tiene forma de expresarse. Eso es una intención, no
una garantía, y está escrito así en la cabecera de la herramienta. La garantía
es el paso F3b de §8.

### ✅ Elegido: la confirmación se mide en el mensaje del paciente, no en un argumento

Lo natural sería `crear_cita({ confirmado: true })`. Se descartó: es el modelo
vigilándose a sí mismo, que es lo que este proyecto no hace en ningún sitio —la
barandilla 1 existe precisamente porque un filtro de intención escrito en el
prompt no es un filtro—.

La puerta mira **el mensaje que llegó por WhatsApp**, y exige tres cosas:
borrador completo, afirmación del paciente, y que la hora estuviera escrita en
la conversación reciente. La tercera es la que impide que un «sí» dicho a
«¿es para usted?» reserve una cita.

### ✅ Elegido: el gabinete no se fija al reservar

`consultar_huecos` devuelve `gabinete_id` y sería fácil pasárselo a
`crear_cita`. No se hace: fijarlo convertiría «ese sillón se acaba de ocupar» en
un `ocupado` con los otros dos libres. Que elija el RPC.

### ⚪ Se deja: `escalar_a_recepcion` escribe sin confirmación

Es correcto y es deliberado: no reserva nada ni toca la ficha. Pedirle permiso
para avisar al equipo a alguien con la cara hinchada sería lo contrario de lo
que pide el bloque 60.

---

## 8 · Lo que queda pendiente

**Ninguno bloquea F4.**

> **Esta lista está copiada tal cual al prompt de F4, en `PLAN.md`.** No vive
> solo aquí a propósito: con F1 casi se pierde un pendiente porque estaba
> únicamente en su `ESTADO_*.md`, y eso depende de que alguien se acuerde de
> releerlo al empezar la sesión siguiente. Si se toca algo de aquí, hay que
> tocarlo también allí — son dos copias y lo saben las dos.
>
> De los cuatro, el único que es trabajo **de F4** es §8.4 (`mensajeId`).

### 8.1 · La barandilla 4, con el modelo que corre de verdad

Los documentos ya están al día (§7.1): `PLAN.md`, `.claude/CLAUDE.md` y
`.env.example` dicen `gemini-3.6-flash` y `gemini-3.1-flash-lite`.

Lo que **sigue pendiente** es lo que `.claude/CLAUDE.md` viene avisando desde el
principio: la auditoría de fuga (barandilla 4, F7) hay que pasarla con el modelo
que corre de verdad. Nunca se ha ejecutado contra ninguno de los dos, y el
cambio de familia de modelo no la hace menos necesaria, sino más.

Añadido: **`gemini-3.6-flash` y `gemini-3.1-flash-lite` pueden correr la misma
suerte.** Cuando les toque, quien lo note será `tests/bot-contrato`, que es para
lo que está, y el cambio se hace en `gemini.ts` y en los tres documentos.

### 8.2 · F3b: estrechar la RLS a la conversación

Decidido en §7: se hace, pero no aquí. Lo que hace falta, ya medido:

1. `bot.ts` — el JWT gana `telefono` en `app_metadata` *(archivo protegido)*
2. Migración nueva — `autorizacion.telefono()` y las políticas de `pacientes`,
   `conversaciones` y `mensajes`. **`citas` NO se toca** *(archivo protegido)*
3. `tests/rls/03-operacion.test.ts` — ~6 aserciones cambian de significado
4. Pruebas nuevas de que el estrechamiento muerde

Ninguna firma de herramienta cambia: `repasar_ficha` ya no acepta a quién leer.
Los dos archivos marcados están en la lista de «no tocar sin confirmación».

### 8.3 · `mensaje_urgencia` hay que sembrarla en el alta

Igual que `politica_privacidad` en ESTADO_F2 §8.3. El mensaje seguro de la
última capa de fallback sale de la clave `mensaje_urgencia` de `config`; si no
está, se usa el de por defecto, que es correcto pero genérico. **Entra en el
guion de `alta-clinica` (F8).** Hoy no hay nada que lo fuerce.

### 8.4 · `mensajeId` viaja vacío hasta F4

`escalar_a_recepcion` apunta `mensaje_id` al mensaje que disparó el escalado.
En F3 los mensajes todavía no se guardan —eso es el webhook—, así que el
contexto lo lleva opcional y el escalado se crea sin él. **Cuando F4 guarde
mensajes, hay que pasarlo**, o recepción se queda sin el hilo que leer.

### 8.5 · Los dos pendientes de F1 y F2 siguen abiertos

1. El CI no impide mezclar: falta marcar `comprobaciones-estaticas` como check
   obligatorio en Settings → Branches.
2. La mitad viva no corre en CI: faltan `RLS_VIVA=true` y los cuatro secretos
   `SUPABASE_*_DEV`.

Con F3 pesa más: de las 198 pruebas nuevas, **175 no necesitan credenciales de
nada** y se quedarían sin bloquear nada igual.

### Limitaciones conocidas

- El recordatorio elige bloques por su `orden` (30, 50, 60). Lo suyo sería una
  marca en el propio bloque, pero `bloques_prompt` no tiene columna donde
  ponerla y añadirla es migración + editar `contenido/bloques/`, los dos
  protegidos. Mientras tanto, renumerar un bloque duro deja el recordatorio
  corto y **hay una prueba que lo caza**.
- `esAfirmacion` es una lista cerrada y corta. Rechaza confirmaciones raras
  («dale», «palante»), y eso cuesta un mensaje de más. Al revés costaría una
  cita que nadie pidió.
- La ventana son 10 parejas fijas. No se corta por tokens: con diez bloques y
  una clínica pequeña sobra sitio.
- `recuperacion.ts` (FAQ por pgvector) no existe. Hace falta por encima de 100
  preguntas; la piloto tiene 16.
- El bucle son 6 vueltas como máximo. Al llegar al tope contesta con lo que
  haya, sin avisar al paciente de que se ha quedado a medias.

---

## 9 · Lo que F3 cambió de F1 y F2

**Ni una migración, ni una política RLS, ni `sin_solape`, ni los tres clientes
de Supabase, ni un bloque de `contenido/bloques/`.** Los cuatro grupos
protegidos siguen intactos.

Lo que sí se tocó, y por qué:

| Archivo | Cambio | Por qué |
|---|---|---|
| `tests/ayuda/entorno.ts` | `HAY_GEMINI`, `CLAVE_GEMINI`, `avisarSiNoHayGemini()` | El interruptor del nivel 3 |
| `tests/ayuda/vivo.ts` | `describeConGemini` | Hermano de `describeVivo` |
| `package.json` | `test:bot`, `test:bot-vivo`, `test:contrato` | — |
| `.env.example` | Los modelos reales y `GEMINI_VIVO` | `.claude/CLAUDE.md` exige mantenerlo al día |

Y `tests/barandillas/04-sin-filtro-en-codigo.test.ts` **no se tocó y aun así
cubre más**: `herramientas.ts` entró en su alcance solo, al importar
`crearClienteBot`. Es lo que ESTADO_F2 §3.2 prometió que pasaría.

---

## 10 · Reglas del proyecto que siguen mandando

- **No tocar sin confirmación explícita:** las políticas RLS de
  `supabase/migrations/`, los bloques de `contenido/bloques/`, el constraint
  `sin_solape`, y los tres clientes de Supabase.
- El prompt del bot sale de `montarPromptDeDatos()`, nunca de un string en el
  código. La única cadena de instrucciones que hay en `src/lib/bot/` es la del
  clasificador, que no le habla a ningún paciente y no lleva ni un dato de la
  clínica; está justificada en su propia cabecera.
- `contar()` corre en **cada** prompt montado, también cuando el clasificador va
  a cortar.
- El motivo de la visita es `enum`, nunca texto libre. Y `escalados` no tiene ni
  una columna de texto libre desde la migración 007: si alguien añade un
  `resumen` «para dar contexto a recepción», reabre el agujero del artículo 9.
- Una sola tirada de Vitest a la vez contra la base de desarrollo (§5.4).
