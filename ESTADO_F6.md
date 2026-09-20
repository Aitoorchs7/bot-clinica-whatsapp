# Estado de F6 · Los trabajos programados

> **Para quien retome F6**, en una conversación nueva o dentro de seis meses.
> Fecha: 20 de septiembre de 2026. Rama: `f1-base-de-datos-y-rls`.
>
> **F6 es la primera fase que manda mensajes sola**, sin que nadie escriba
> primero. Hasta aquí el bot solo contestaba. Un error en las fases anteriores
> se quedaba en una conversación que alguien había empezado; un error aquí le
> llega a un paciente real sin que lo haya pedido, y un recordatorio con los
> datos de otra clínica es lo peor que puede hacer un sistema multi-inquilino.
>
> Contexto previo: [PLAN.md](PLAN.md), [ESTADO_F5.md](ESTADO_F5.md),
> [ESTADO_F4.md](ESTADO_F4.md), [ESTADO_F3.md](ESTADO_F3.md),
> [ESTADO_F2.md](ESTADO_F2.md), [ESTADO_F1.md](ESTADO_F1.md).

---

## 0 · El contrato, escrito ANTES de tocar el primer archivo

`.claude/CLAUDE.md` lo exige y F1–F5 lo cumplieron. Se escribe entero aquí
arriba, antes del código, y al cerrar se ejecuta PRUEBA y se pega la salida
real. **No se reescribe el contrato para que encaje con lo que salió.**

### ENTREGA

**La migración 009, que solo AÑADE.** Pedida y confirmada por el usuario antes
de escribir una línea, como hizo F5 con la 008:

| Qué añade | Por qué |
|---|---|
| `public.recordatorios`, con RLS en la misma migración y `unique (clinica_id, cita_id)` | La marca de «este recordatorio ya salió», garantizada por la base y no por la memoria del proceso |
| `recordatorios_bot_insert` · `recordatorios_bot_select` · `recordatorios_clinica_select` | Sin `UPDATE` ni `DELETE` para nadie: la marca solo crece, como `auditoria` |
| `unique (id, clinica_id)` en `citas` | Punto de apoyo de la clave foránea compuesta de la 007 |
| `mantenimiento.liberar_provisionales()` + su job de `pg_cron` | El bot **no puede** cancelar una cita. Medido: `42501` |

No modifica, no reescribe y no relaja ninguna política anterior. No toca
`sin_solape`. Cero funciones `SECURITY DEFINER`.

**El código:**

| Archivo | Qué hace |
|---|---|
| `src/lib/trabajos/reloj.ts` | Fecha y hora **en la zona de la clínica**, no en la del servidor. **Puro** |
| `src/lib/trabajos/recordatorios.ts` | El trabajo: por clínica, reclamar, enviar, guardar |
| `src/lib/trabajos/retencion.ts` | Comprueba que la purga de 90 días hizo lo que dice, y lo deja donde la clínica lo ve |
| `src/app/api/cron/recordatorios/route.ts` | `CRON_SECRET`, como `/api/cron/salud` |
| `src/app/api/cron/retencion/route.ts` | Íd. |
| `vercel.json` | Los horarios. Hoy no existe |
| `src/lib/whatsapp/botones.ts` | `leerPayloadDeCita()`, **pura**: `CONFIRMAR:<id>` → `{accion, citaId}` |
| `src/lib/whatsapp/procesar.ts` | Atiende el botón **antes del motor**: una cita confirmada no es una conversación |

### PRUEBA

```
pnpm vitest run tests/trabajos       # sin red, sin base
pnpm vitest run tests/trabajos-vivo  # base real, Meta simulado
pnpm test                            # la suite entera, dos veces
pnpm test:e2e
pnpm typecheck
pnpm lint
```

Criterio de F1–F5, sin rebajarlo: **el mismo número dos veces seguidas**, y
haberla visto ponerse roja donde debe — al menos con la idempotencia rota, con
el hueco que no vuelve y con el cron sin secreto.

Las seis que el encargo exige por su nombre:

1. **Un recordatorio no se manda dos veces**, ni con dos invocaciones
   concurrentes. Contra Postgres de verdad, y con las dos mitades: la
   secuencial y la concurrente.
2. **Una provisional caducada se libera Y EL HUECO VUELVE A OFRECERSE.** Medido
   con `consultar_huecos`, no mirando la columna `estado`.
3. **El botón.** `CONFIRMAR:<id>` confirma esa cita y solo esa; el payload de
   otra clínica o de otra conversación no confirma nada. Y `CANCELAR` hace lo
   que se dijo que hace.
4. **La purga borra de verdad**, y `escalados` sobrevive con `conversacion_id`
   y `mensaje_id` en null.
5. **El cron sin `CRON_SECRET` → 401; con él → 200.** Y un 401 no ejecuta nada:
   exigido **contando filas**, no fiándose del código de estado.
6. **Aislamiento:** ningún recordatorio sale con los datos de otra clínica.

### LÍMITES

- **El panel (F5) es intocable.** Ni un archivo de `src/app/panel/`, de
  `src/lib/panel/` ni de `src/componentes/`.
- **El motor (F3) es intocable.** Ni un archivo de `src/lib/bot/`.
- Del canal (F4) se tocan **dos archivos y nada más**: `botones.ts` (una
  función pura nueva) y `procesar.ts` (atender el botón antes del motor).
- Ni una política RLS existente. Ni `sin_solape`. Ni un bloque de
  `contenido/bloques/`. Ni los tres clientes de Supabase.
- **Nada usa `service_role`** en el camino del bot. Solo la siembra de las
  pruebas.
- **`pnpm test` y `pnpm test:e2e` no llaman a Meta, ni a Gemini, ni a
  Deepgram.** Ni una petición.
- **Cancelar o mover citas por WhatsApp no se construye.** Está fuera del
  producto, no solo de esta fase.
- No entran F7 (barandilla 4 con modelo real), F8 (`alta-clinica`) ni F3b.
- **Un recordatorio que falle al enviarse no se reintenta.** La marca se coge
  antes de mandar, a propósito: se elige perder un recordatorio antes que
  mandar dos. El fallo se grita en el registro y queda en `eventos`.

### SUPUESTOS

1. **`WHATSAPP_CLINICAS` sirve para decir de qué clínica es un cron**, igual
   que dice de quién es un webhook (ESTADO_F4 §3), y después se COMPRUEBA
   contra `clinicas.wa_phone_number_id` con el mismo `exigirClinicaDelCanal()`.
2. Vercel Cron manda `Authorization: Bearer $CRON_SECRET`. Es lo que ya supone
   `/api/cron/salud`, que existe desde antes de esta fase.
3. `pg_cron` ejecuta sus jobs como `postgres`, que tiene `BYPASSRLS`, así que
   `liberar_provisionales` puede ser `SECURITY INVOKER` como `purgar_historial`.
4. Los recordatorios van a citas **confirmadas**. Una provisional es una
   retención de diez minutos: no llega viva a las veinticuatro horas.
5. Las plantillas hay que darlas de alta en el panel de Meta. F6 no las
   aprueba; solo las manda.

### FALLOS

Lo que se espera que salga mal, escrito antes de verlo:

1. **La idempotencia se comprueba consultando antes de insertar** y dos
   invocaciones del cron a la vez mandan dos recordatorios. Es el FALLO #2 de
   F4, medido en su §5.4: nueve de diez se creen nuevas y la prueba secuencial
   se queda verde.
2. **La marca se guarda en `citas`** y el bot no puede escribirla: el `UPDATE`
   devuelve **cero filas y ningún error**, así que cada invocación se cree la
   primera y el recordatorio sale una y otra vez.
3. **La hora se calcula en la zona del servidor.** Vercel corre en UTC; en
   verano la clínica está en +02:00 y el paciente recibe su cita de las 10:00
   como si fuera a las 08:00.
4. **La liberación se prueba mirando la columna `estado`** y no que el hueco
   vuelva a ofrecerse. Es el eco del interruptor de F5: comprobar que un
   `update` actualiza no prueba nada.
5. **`CONFIRMAR:<id>` confirma la cita de otro.** El payload viene de fuera: es
   entrada del usuario.
6. **El 401 devuelve 401 y ejecuta el trabajo igual.** Una prueba que mire solo
   el código de estado pasa.
7. **El recordatorio lleva el motivo de la visita dentro** y se queda fuera del
   alcance de la purga de 90 días para siempre (ESTADO_F4 §9).
8. **El botón «Cancelar» promete algo que no existe.**

---

## 1 · Qué hay construido

### La migración 009, que solo añade

`supabase/migrations/20260920100000_trabajos_programados.sql`. Aplicada con
`supabase db push` sin un solo error, y `db advisors --type security` sigue
diciendo **No issues found**. Tres cosas, y ninguna toca nada de antes:

| Qué | Por qué no cabía en lo que ya había |
|---|---|
| `public.recordatorios`, RLS en la misma migración, `unique (clinica_id, cita_id)` | `citas` no tiene columna para la marca y **no se le puede añadir**: el bot no puede escribir en una cita confirmada. `eventos` admite duplicados |
| `unique (id, clinica_id)` en `citas` | La 007 se la puso a las cinco tablas que entonces eran padre de alguien; `citas` no lo era y ahora sí |
| `mantenimiento.liberar_provisionales()` + job cada 5 min | El rol `bot` **no puede** cancelar una cita: `42501` |

Sigue habiendo **cero funciones `SECURITY DEFINER`** en todo el proyecto.

### Los módulos

| Archivo | Qué resuelve |
|---|---|
| `src/lib/trabajos/reloj.ts` | Fecha y hora en la zona de la clínica. **Puro** |
| `src/lib/trabajos/cerrojo.ts` | `CRON_SECRET`, en un solo sitio para las tres rutas |
| `src/lib/trabajos/recordatorios.ts` | Recorre las clínicas, reclama, manda, guarda |
| `src/lib/trabajos/retencion.ts` | Cuenta lo que la purga debería haberse llevado |
| `src/lib/whatsapp/confirmar.ts` | Atiende `CONFIRMAR:` y `CANCELAR:` contra la base |
| `src/app/api/cron/recordatorios/route.ts` y `.../retencion/route.ts` | Las dos rutas nuevas. La de retención alerta con el **código de estado**, no solo en el cuerpo: §5.4b |
| `vercel.json` | Los tres horarios. No existía |

### El orden que ejecuta `mandarRecordatorios()`

```
por cada clinica de WHATSAPP_CLINICAS:
  1 · numeroDeLaClinica()        el mapa dice cual es su numero
  2 · exigirClinicaDelCanal()    y la BASE lo confirma  <- el mismo de F4
  3 · citas confirmadas          dentro de la ventana, sin filtro de seguridad
  4 · RECLAMAR                   insert + 23505. La base decide, no el proceso
  5 · conversacion               la abierta de ese telefono, o una nueva
  6 · guardar el saliente        en `mensajes`, que SI se purga
  7 · enviar la PLANTILLA        la ventana de 24 h esta cerrada
```

El paso 4 va **antes** del 7 a propósito, y cuesta algo: ver §3.1.

---

## 2 · La pregunta de la fase: ¿de qué clínica es un cron?

Un trabajo programado no tiene sesión, no tiene cookie y no tiene
`phone_number_id`. Nadie le ha escrito. Y la respuesta no es una sola, porque
**los dos trabajos de esta fase no son la misma clase de cosa**:

### 2.1 · La liberación de provisionales no es de ninguna clínica

Es mantenimiento de la base, no camino del bot. Corre dentro de Postgres, en el
esquema privado `mantenimiento` que PostgREST no publica, ejecutada por
`pg_cron` como `postgres`, que ya tiene `BYPASSRLS`. No necesita identidad de
inquilino porque **no la usa**: barre todas las clínicas a la vez, igual que
`purgar_historial` desde F1.

Eso la deja **fuera del problema** en vez de resolverlo, que es mejor. Sin
`service_role`, sin `SECURITY DEFINER` y sin una política nueva.

### 2.2 · Los recordatorios son de todas, una detrás de otra

Estos sí tienen que mandar WhatsApp, así que corren en Node y necesitan leer la
agenda con la RLS puesta. Se resuelve como ESTADO_F4 §3 resolvió el webhook, y
**por el mismo motivo**: la RLS del rol `bot` exige que el `clinica_id` viaje ya
firmado dentro del JWT, así que para leer la fila de una clínica hay que saber
antes qué clínica eres.

`WHATSAPP_CLINICAS` dice qué clínicas hay; se firma un token por cada una; y
después se **comprueba** contra `clinicas.wa_phone_number_id` con el mismo
`exigirClinicaDelCanal()` del canal. Si el mapa estuviera mal puesto, esa
clínica no manda nada.

**Lo que cuesta, y hay que decirlo: agrava ESTADO_F4 §8.5.** Hasta ahora, una
clínica que faltara en `WHATSAPP_CLINICAS` se quedaba sin contestar a quien le
escribía — molesto, pero **lo nota el paciente**, que acaba llamando. Ahora
además se queda **sin mandar recordatorios**, y eso no lo nota nadie hasta que
alguien no se presenta a una cita. El bucle grita por cada clínica que se cae, y
hay una prueba de que grita; pero un grito en un registro solo sirve si alguien
lo lee.

No cambia la recomendación de F4 (con una o dos clínicas, tres pasos en el alta
cuestan menos que una función que se salta la RLS), pero sí **sube lo que está
en juego** cuando se llegue a diez.

---

## 3 · Las otras decisiones que no eran obvias

### 3.1 · Dónde se marca que un recordatorio ya salió

Las dos salidas que planteaba el encargo no eran equivalentes, y se decidió
**midiendo contra la base de desarrollo**, no razonando:

| Sitio | Medición | Veredicto |
|---|---|---|
| Una columna en `citas` | `UPDATE` de una cita confirmada por el rol `bot` → **filas=0, error=ninguno** | ❌ |
| `eventos` | Dos filas idénticas insertadas por el bot → **las dos se crean** | ❌ |
| Tabla nueva con `unique` | — | ✅ |

**El primero es el peligroso, y por eso está escrito en el contrato como
FALLO #2.** No falla: *no hace nada, en silencio*. Una marca que nunca se
escribe hace que cada invocación del cron se crea la primera, así que el
recordatorio saldría en cada pasada — cada hora, toda la noche. Y para que
funcionara habría que ensanchar `citas_bot_update`, que es precisamente la
política que hoy mantiene al bot lejos de las citas confirmadas.

El segundo simplemente no garantiza nada: sin índice único no hay idempotencia,
por mucho que el código pregunte antes.

`supabase/migrations/` está en la lista de «no tocar sin confirmación
explícita», **así que se pidió antes de escribir una línea** y se dio, con el
precedente de la 008 de F5 delante.

**Y la marca se coge ANTES de mandar.** Es deliberado y tiene un coste escrito
en los LÍMITES: si el envío falla después, ese recordatorio no sale y no se
reintenta. Los dos fallos no son iguales —dos recordatorios al mismo paciente
son una llamada a recepción preguntando cuál vale; uno perdido deja su cita
intacta en la agenda— y se elige el segundo. Lo que no se acepta es perderlo en
silencio: se grita, se marca el mensaje como `fallido` y queda en `eventos`.

### 3.2 · El botón «Cancelar», que no cancela

`recordatorio_cita` declara dos botones desde F4 y **nadie los atendía**:
`botones.ts` sabía leer el payload, pero `textoDelEntrante()` le pasa al modelo
la etiqueta («Confirmar»), no el identificador — y con razón, un uuid interno no
pinta nada en el contexto de un modelo. O sea que el payload se parseaba y se
tiraba.

Y encima **cancelar o mover citas por WhatsApp está fuera del producto**, no
solo fuera de esta fase.

Las dos salidas, y por qué se eligió la segunda:

| Salida | Coste |
|---|---|
| Quitar el botón de la plantilla | Hay que darla de alta en Meta con la forma nueva, y si ya estuviera aprobada con dos botones, cuesta una reaprobación. Y el paciente que quiera cancelar escribirá texto libre, que acaba escalando igual pero **más tarde** |
| **Escalar a recepción** ✅ | No depende de Meta. El equipo se entera **en el momento**, y al paciente se le dice la verdad |

Lo que hace `CANCELAR:<id>`: un escalado con `motivo = 'pidio_persona'` y
`asunto = 'otro'` —los dos enums, ni una columna de texto libre—, el aviso al
equipo por WhatsApp y correo, y un mensaje al paciente que dice que **su cita
sigue en pie** y que le van a llamar. La cita no se toca. Aunque quisiera no
podría: el rol `bot` se lleva un `42501`.

La idempotencia sale gratis: `escalados_uno_pendiente_idx` impide dos avisos
pendientes en la misma conversación. Pulsar cinco veces deja **uno**.

### 3.3 · De quién es la cita de un payload

`CONFIRMAR:<id>` **es entrada del usuario**. Que lo hayamos escrito nosotros al
montar la plantilla no lo convierte en dato de confianza cuando vuelve. Se
comprueba por dos sitios, y el primero no es código:

1. **La clínica la garantiza la RLS.** El cliente lleva el `clinica_id` firmado,
   así que `citas_bot_select` no devuelve la cita de otra clínica: para ese
   cliente la fila **no existe**. No hay ningún `.eq('clinica_id', …)`. Lo que
   sí hay es una comprobación posterior que **avisa**, por si la política cede.
2. **El paciente lo comprueba `confirmar.ts`:** el teléfono de la ficha de la
   cita tiene que ser el de la conversación por la que llegó el botón.

**Por qué el teléfono y no `citas.conversacion_id`**, que es lo que pedía el
encargo por su nombre: porque una cita que cogió recepción por teléfono tiene
`conversacion_id` en null, y comparar por ahí dejaría a esos pacientes sin poder
confirmar — callándose, además. El teléfono es la identidad de verdad del otro
lado de WhatsApp, y es la misma llave con la que `conversacionAbierta()` decide
de quién es un hilo. Es la misma pregunta, contestada donde sí se puede
contestar siempre.

Las dos defensas son distintas y **están medidas por separado**: ver §5.4.

### 3.4 · El botón se atiende antes del motor, y el modelo no se entera

En `procesar.ts`, paso **5b**: después de guardar el entrante —porque el
escalado de «Cancelar» necesita ese `mensaje_id`— y antes del debounce y del
cerebro.

Confirmar una cita no es una conversación: el mensaje trae el identificador
exacto, y pedirle a un modelo que adivine a cuál se refería «Confirmar» sería
inventarse una ambigüedad que no existe, pagarla en cuota del tier gratuito, y
además dejarle la escritura a su criterio. Saltarse el debounce es de paso lo
correcto: hacer esperar ocho segundos a quien pulsa un botón es cobrarle la
latencia de un problema que no tiene.

Hay una prueba que lo exige de la única forma que no se puede falsear: el modelo
que se le pasa a `procesarMensaje()` en `tests/trabajos-vivo/04-boton.test.ts`
**revienta si alguien lo llama**.

---

## 4 · La prueba de las dos tiradas

El criterio de F1–F5, sin rebajarlo. Salida real, pegada tal cual:

```
===== VITEST · TIRADA 1 =====        ===== VITEST · TIRADA 2 =====
 Test Files  39 passed | 1 skipped    Test Files  39 passed | 1 skipped (40)
      Tests  829 passed | 5 skipped        Tests  829 passed | 5 skipped (834)
   Duration  130.79s                    Duration  128.42s

===== PLAYWRIGHT · TIRADA 1 =====    ===== PLAYWRIGHT · TIRADA 2 =====
  31 passed (1.0m)                     31 passed (49.8s)
```

```
pnpm exec tsc --noEmit   -> exit 0
pnpm lint                -> exit 0
```

El archivo saltado y las 5 saltadas siguen siendo `tests/bot-contrato/`, que no
corre sin `GEMINI_VIVO=1`. Es lo que decidió ESTADO_F3 §1.

### Lo que aporta F6

| | Antes de F6 | F6 | Total |
|---|---|---|---|
| Vitest | 751 | **+78** | 829 |
| Playwright | 31 | — | 31 |

| Archivo | Pruebas | Necesita |
|---|---:|---|
| `tests/trabajos/01-reloj.test.ts` | 9 | nada |
| `tests/trabajos/02-payload.test.ts` | 15 | nada |
| `tests/cron/02-rutas.test.ts` | 10 | nada |
| `tests/trabajos-vivo/01-recordatorios.test.ts` | 14 | Supabase |
| `tests/trabajos-vivo/02-provisionales.test.ts` | 4 | Supabase + CLI |
| `tests/trabajos-vivo/03-purga.test.ts` | 6 | Supabase + CLI |
| `tests/trabajos-vivo/04-boton.test.ts` | 10 | Supabase |
| `tests/trabajos-vivo/05-retencion.test.ts` | 8 | Supabase |
| `tests/rls/00-rls-activada.test.ts` | +2 | nada |

**34 de las 78 corren en una máquina recién clonada**, así que el trabajo
`comprobaciones-estaticas` de CI las cubre sin credenciales de nada.

**`pnpm test` no hace ni una petición a Meta, ni a Gemini, ni a Deepgram.**
Playwright tampoco.

### Un rodeo para llegar a `mantenimiento`

`purgar_historial` y `liberar_provisionales` viven en un esquema que PostgREST
**no publica**, que es justo lo que impide que nadie las alcance desde la API.
O sea que `supabase-js` no puede llamarlas ni con `service_role`, y es correcto
que no pueda.

Las pruebas las ejecutan con `supabase db query --linked`
(`tests/ayuda/mantenimiento.ts`). No se hizo un envoltorio en `public` a
propósito: ensanchar la superficie de la API para poder probar que la superficie
es estrecha es lo que ESTADO_F2 §7 descartó para el contador y F5 §2 para la
auditoría.

Y de paso corre con la identidad buena: `select current_user` → **`postgres`**,
que es el rol con el que `pg_cron` ejecuta estos jobs. Un envoltorio en `public`
habría corrido como `authenticated` y habría demostrado otra cosa.

---

## 5 · La prueba de que la prueba sirve

Que la suite corra demuestra que corre. Solo verla ponerse roja donde debe
demuestra que mira. Cada garantía de F6, rota a propósito, con la restauración
atada a la misma orden (la lección de F1 §5.1).

### 5.1 · La idempotencia — y un primer intento que NO sirvió

**Lo primero que se probó fue cambiar `reclamar()` por consultar-y-luego-insertar**,
que es el FALLO #1 del contrato. Resultado:

```
      Tests  14 passed (14)
```

**No se puso roja.** Y el motivo es interesante: aquella versión seguía
mirando el `23505` del insert, así que la garantía **seguía estando donde tiene
que estar** —en la base— y el `select` de más era solo una consulta
desperdiciada. Consultar antes no es el fallo; el fallo es *no tener índice*.

Así que se rompió la garantía de verdad, quitando el `unique`:

```
alter table public.recordatorios drop constraint recordatorios_clinica_id_cita_id_key

 × SECUENCIAL: dos pasadas del cron -> UN solo recordatorio
 × CONCURRENTE: diez pasadas a la vez -> SIGUE SIENDO UNO
   AssertionError: Diez invocaciones a la vez han mandado 10 recordatorios.
   La idempotencia no la está garantizando la base: alguien consulta antes de
   insertar.: expected 10 to be 1
 × LA MARCA SE COGE ANTES DE MANDAR: si Meta falla, no se reintenta y se grita
      Tests  3 failed | 11 passed (14)
--- unique restaurado ---
```

**Diez de diez.** Diez plantillas por el cable al mismo paciente.

La lección, que vale más que el rojo: **la idempotencia de este trabajo no la
tiene el código, la tiene el índice.** Se puede reescribir `reclamar()` de
varias formas razonables sin romper nada; el día que alguien quite ese `unique`
—en una migración de «limpieza», por ejemplo— se rompe todo, y por eso la
prueba que muerde es la que ataca al índice y no a la función.

### 5.2 · El hueco que no vuelve

`liberar_provisionales` cambiada para poner `completada` en vez de `cancelada`.
Elegido a propósito porque es el fallo **plausible**: la cita deja de estar
provisional, el recuento de liberadas sale correcto, y `completada` **sigue
ocupando el sillón** según `consultar_huecos`.

```
 × LA PRUEBA DE LA FASE: el hueco se tapa, se libera, y VUELVE A OFRECERSE
   AssertionError: La cita se liberó pero el hueco NO ha vuelto a ofrecerse.
   Comprobar que un update actualiza no prueba nada: el paciente sigue sin
   poder coger esa hora.: expected false to be true
      Tests  1 failed | 3 passed (4)
--- funcion restaurada ---
```

**Lo que hay que mirar es lo que NO se puso rojo.** La función «funcionó»:
devolvió un número de liberadas mayor que cero y la columna `estado` cambió.
Una prueba escrita contra la columna —la obvia, la que cualquiera escribiría—
habría certificado un trabajo que deja la agenda igual de bloqueada. Es el eco
exacto del interruptor de F5.

### 5.3 · El cron sin secreto, por sus dos lados

**Lado 1: la puerta que se abre sola cuando falta la variable.** Es el fallo
cómodo: sin `CRON_SECRET`, dejar pasar a todo el mundo «para que funcione».

```
 × SIN CRON_SECRET EN EL ENTORNO NO SE ABRE LA PUERTA, se cierra del todo (recordatorios)
 × SIN CRON_SECRET EN EL ENTORNO NO SE ABRE LA PUERTA, se cierra del todo (retencion)
   AssertionError: expected 200 to be 401
      Tests  2 failed | 34 passed (36)
```

**Lado 2: el cerrojo que no cierra nunca.**

```
 × sin cabecera: 401, y NO se ejecuta nada                    (x2 rutas)
 × con el secreto de otro: 401, y tampoco se ejecuta nada     (x2 rutas)
 × con el secreto bien escrito pero sin «Bearer»: 401         (x2 rutas)
 × SIN CRON_SECRET EN EL ENTORNO NO SE ABRE LA PUERTA         (x2 rutas)
 × SIN CRON_SECRET la ruta no crea NI UNA FILA (contado, no supuesto)
 × sin el secreto: 401, y NO se le pregunta a Google
 × con un secreto equivocado tampoco
      Tests  11 failed | 25 passed (36)
--- cerrojo restaurado ---
```

Dos cosas que valen tanto como los rojos:

**1 · La que cuenta filas se pone roja.** «SIN CRON_SECRET la ruta no crea NI
UNA FILA» es la que exige el encargo por su nombre, y es la única que
distinguiría un 401 honrado de un 401 que devuelve 401 y manda el recordatorio
igual.

**2 · Las dos últimas son de `/api/cron/salud`**, que existía desde antes de
esta fase y cuyo cerrojo F6 sustituyó por el compartido. Que se pongan rojas
demuestra que `cerrojoDelCron()` está **enchufado de verdad en las tres rutas**,
no solo declarado.

### 5.4 · El botón: las dos defensas son distintas, y se prueban por separado

Quitada la comprobación del teléfono en `confirmar.ts`:

```
 × EL PAYLOAD DESDE OTRO NUMERO TAMPOCO
   AssertionError: expected { hecho: 'boton', …(2) } to match object { que: 'no_es_suya' }
      Tests  1 failed | 9 passed (10)
--- confirmar restaurado ---
```

**Y «EL PAYLOAD DE OTRA CLINICA NO CONFIRMA NADA» siguió VERDE.** Es lo
correcto y es el punto: esa la para la RLS, no esta comprobación. Cada defensa
tiene su prueba y ninguna tapa el hueco de la otra — si un día se mezclaran,
quitar una de las dos dejaría las dos pruebas en verde.

### 5.4b · La ruta de retención contestaba 200 con la base sucia

**Salió de una pregunta del usuario al cerrar**, no de la batería: «confirma
que tiene un test que demuestre que SÍ alerta cuando la purga no se ha
ejecutado, no solo que responde 200 cuando todo va bien». No lo tenía, y al ir
a escribirlo aparecieron **dos** defectos encadenados.

**El primero: la alarma no salía por donde se mira.** La ruta devolvía 200
siempre que hubiera podido comprobar, estuviera limpia o sucia; `alDia: false`
se quedaba en el cuerpo, en `console.error` y en `eventos`. Quien vigila un
cron mira el código de estado, así que la purga podía llevar semanas parada con
el panel de Vercel entero en verde. Ahora son tres respuestas —200 limpio, 500
sucio, 503 no he podido mirar—, con la misma taxonomía que `/api/cron/salud`.

**El segundo lo cazó la prueba de que las tres son distintas**, y es peor:

```
AssertionError: expected [ 200, 500, 200 ] to deeply equal [ 200, 500, 503 ]
```

Una clínica que estuviera en `WHATSAPP_CLINICAS` y **no en la base** salía con
los cuatro recuentos a **cero** y se informaba como «al día». La RLS no
devuelve filas para una clínica que no existe, y cero filas es indistinguible
de «no hay nada que purgar». O sea: la pantalla diría que su retención va
perfecta justo cuando no se está comprobando nada.

Es el falso verde de ESTADO_F1 §5.2 por tercera vez en este proyecto —una
aserción cuya única prueba es una lista vacía pasa igual si la fila no
existe— y aquí llevaba puesto el disfraz de una buena noticia. El arreglo es
el cerrojo que ya usaban el canal y los recordatorios: `exigirClinicaDelCanal()`
antes de contar nada.

**La lección, que es la de §5.3 otra vez por otro lado:** «no he podido
comprobarlo» no es «está todo bien», igual que un 404 de Google no es un fallo
de red. Las dos veces que este proyecto ha juntado esas dos cosas, lo que se
ha perdido es la alarma.

### 5.5 · Dos pruebas destructivas propias, y las dos del mismo tipo

**Las escribí yo, y rompieron once pruebas de otros archivos.**

`tests/trabajos-vivo/04-boton.test.ts` limpiaba así:

```ts
await db.from('conversaciones').delete().in('telefono_e164', [TELEFONO_A, …])
await db.from('escalados').delete().eq('clinica_id', …).eq('motivo', 'pidio_persona')
```

Las dos líneas son destructivas por el mismo motivo: **limpian por un valor que
el fixture también usa.** `TELEFONO_A` era el teléfono de `pacienteA`, o sea el
de la `conversacionA` que siembra F1; y el escalado sembrado tiene exactamente
ese `motivo`. Así que cada pasada se llevaba la conversación sembrada —y en
cascada sus mensajes— y el escalado de F1.

El resultado, en la primera tirada completa:

```
 Test Files  4 failed | 35 passed | 1 skipped (40)
      Tests  14 failed | 811 passed | 5 skipped (830)

 FAIL  tests/rls/03-operacion.test.ts          (7)
 FAIL  tests/panel-vivo/01-roles-y-aislamiento.test.ts
 FAIL  tests/bot-vivo/01-huecos-y-cita.test.ts (3)
 FAIL  tests/trabajos-vivo/05-retencion.test.ts (3)
```

**Ni uno solo de esos catorce fallos estaba en el archivo que tenía el
defecto.** Es ESTADO_F1 §5.2 otra vez, en su forma más pura: un test que deja el
fixture distinto de como lo encontró rompe a los que vienen detrás, y el daño
aparece en el archivo de al lado. Lo único que lo hizo visible fue correr la
suite entera; los cuatro archivos de F6 pasaban perfectamente por separado.

El arreglo: ese archivo se trae **su propio paciente** (`+34600777111`) y borra
los escalados **por conversación**, no por motivo. Todo lo que borra es suyo.

### 5.6 · Una ventana de 24 h que hacía la suite no determinista

Al escribir `01-recordatorios` la ventana de prueba era la de producción, 24 h.
Y la siembra de F1 deja una cita confirmada «mañana a las 10:00 UTC», así que
**esa cita entraba o no entraba en la ventana según la hora a la que se lanzara
la suite**: `yaEstaban` valía 1 por la mañana y 2 por la tarde.

```
AssertionError: expected 2 to be 1
```

Es el defecto A de ESTADO_F1 §3 por otro camino: una batería cuyo recuento
cambia entre dos ejecuciones no demuestra nada. Se cazó porque el número no
cuadró, no porque estuviera previsto.

El arreglo no es tocar el fixture sino **no depender de él**: las pruebas usan
una ventana de 3 h y ponen sus citas dentro. El ancho de verdad se comprueba
aparte, sin base de datos, en `tests/trabajos/01-reloj.test.ts`.

---

## 6 · Los dos guardianes estáticos, con el alcance MEDIDO

ESTADO_F5 §6 lo dejó pedido por escrito: si F6 escribe código que toca la base,
hay que decidir en cuál de los dos guardianes cae **y medirlo, no suponerlo**.
Se listaron los dos alcances:

```
CAMINO DEL BOT   (15):            CAMINO DEL PANEL (10):
   barandillas/contador.ts           panel/acciones.ts
   barandillas/filtro.ts             panel/auditoria.ts
   barandillas/montaje.ts            panel/consultas.ts
   barandillas/origen.ts             panel/entrada.ts
   bot/cerebro.ts                    panel/formato.ts
   bot/herramientas.ts               panel/guardia.ts
   bot/validacion.ts                 panel/publico.ts
   supabase/bot.ts                   panel/sesion.ts
   trabajos/recordatorios.ts   <-    supabase/navegador.ts
   trabajos/retencion.ts       <-    supabase/servidor.ts
   whatsapp/agrupar.ts
   whatsapp/almacen.ts
   whatsapp/confirmar.ts       <-
   whatsapp/procesar.ts
   whatsapp/ventana.ts

EN LOS DOS ALCANCES: ninguno
```

**Los tres archivos de F6 que tocan la base entraron solos**, por nombrar el
tipo `ClienteDelBot`. Era lo que ESTADO_F2 §3.2 prometió y F4 §6 verificó, y es
la tercera vez que se cumple sin que nadie toque el guardián.

`reloj.ts` y `cerrojo.ts` **no** entran, y es correcto: no tocan la base.

El camino del panel sigue en 10 y **no hay solape**. El recuento del 04 no se
movió: 16 antes, 16 después.

---

## 7 · Formas de que esto «funcione» sin servir

| Cómo se falsea | Qué lo impide |
|---|---|
| La idempotencia se comprueba en memoria o consultando antes | §5.1 · Diez invocaciones a la vez contra Postgres de verdad, y la prueba ataca al índice |
| La prueba de idempotencia es solo secuencial | Están las dos mitades, y la secuencial se queda verde con la concurrente rota |
| Se comprueba que la provisional cambió de `estado` | §5.2 · La aserción es sobre `consultar_huecos`, y con `completada` la columna cambia y el hueco NO vuelve |
| El hueco «vuelve» porque nunca estuvo ocupado | Se exige que estuviera libre ANTES y ocupado en medio: tres medidas, no una |
| Se libera todo, no solo lo caducado | Su pareja: una provisional viva y una confirmada, que no se tocan |
| El 401 devuelve 401 y ejecuta el trabajo | §5.3 · Se cuentan **filas** en vivo y **peticiones** en el nivel 1 |
| Sin `CRON_SECRET` la puerta se abre «para que funcione» | §5.3 · Prueba propia, y se ha visto roja |
| `CONFIRMAR` confirma la cita de otro | §5.4 · Dos defensas, dos pruebas, medidas por separado |
| El botón llega al modelo y se contesta con prosa | El modelo de esa batería **revienta si se le llama** |
| «Cancelar» promete una cancelación que no ocurre | Se comprueba que la cita sigue igual Y que el texto dice que sigue en pie |
| El recordatorio lleva el motivo de la visita | Se busca «revisión», «urgencia», «ortodoncia»… en lo que sale por el cable |
| El apunte de retención copia lo que escribió el paciente | Se siembra un marcador y se exige que no salga |
| La ruta de retención contesta 200 con la base sucia | §5.4b · Se exige 500, y que 200/500/503 sean **tres** respuestas distintas |
| Una clínica que no existe se informa como «al día» | §5.4b · `exigirClinicaDelCanal()` antes de contar: cero filas no es un buen resultado si no se ha podido mirar |
| La purga «borra» con un `delete` sin `where` | Su pareja: lo sembrado hoy tiene que SOBREVIVIR |
| La purga se comprueba leyendo el `.sql` | Se ejecuta de verdad, como `postgres`, y se cuentan filas antes y después |
| El job existe pero ya no está programado | Se lee `cron.job` y se exigen los dos, con su horario |
| Un recordatorio sale con los datos de otra clínica | §Aislamiento · número, teléfono, nombre e identificador, los cuatro cruzados |
| Una prueba deja el fixture tocado y rompe a las de al lado | §5.5 · Pasó de verdad, con catorce rojos en cuatro archivos ajenos |

---

## 8 · Lo que queda pendiente

> **Esta lista tiene dos copias: aquí y en [PLAN.md](PLAN.md) §11.** Es la regla
> de ESTADO_F3 §8, F4 §8 y F5 §8: con F1 casi se pierde un pendiente porque
> vivía solo en su `ESTADO_*.md`. **Si se toca una, se toca la otra.**

### 8.1 · La frase de `middleware.ts`: APLICADA, y había dos sitios más

**Era el pendiente §8.1 de F5 y está hecho.** La redacción es la que dejó
propuesta F5, palabra por palabra:

| Dónde | Estado |
|---|---|
| `PLAN.md` §6 | ✅ Ya lo corrigió F5 |
| `.claude/CLAUDE.md`, línea 56 | ✅ **Corregido en F6** |
| `src/lib/supabase/servidor.ts`, línea 40 | ✅ **Corregido en F6** |
| `ESTADO_F1.md`, líneas 80 y 477 | ⚪ No se retoca. Un registro cerrado se queda como está |

**Y el `grep` de F5 se había dejado dos.** Al repetirlo aparecieron otros dos
sitios vivos que repetían la afirmación falsa, y los dos importan:

- **`.claude/agents/revisor-codigo.md`**, que le decía al revisor de código que
  buscara un fallo que en 16.3.5 no existe. Un agente con una regla falsa dentro
  es peor que uno sin la regla.
- **`src/proxy.ts`**, que *citaba* a `.claude/CLAUDE.md` diciendo la frase. Al
  corregir el original, la cita quedaba desmintiendo a su fuente.

Los dos están corregidos. La lección: un `grep` es tan bueno como los términos
que se le den, y «cuatro sitios» eran seis.

### 8.2 · Los cuatro de `alta-clinica` (F8) siguen abiertos, y uno pesa más

Sin cambios respecto a ESTADO_F5 §8.4:

1. **`WHATSAPP_CLINICAS` + redespliegue.** ⚠️ **F6 lo agrava**: una clínica que
   falte en el mapa ahora tampoco manda recordatorios, y eso no lo nota nadie
   hasta que un paciente no se presenta. Ver §2.2.
2. **`mensaje_urgencia`** en `config`: sigue sin existir en el repositorio.
3. **`politica_privacidad`** en `config`: lo usa el bloque «05 - Aviso inicial».
4. **Los usuarios del panel**, con `rol` y `clinica_id` en `app_metadata`.

**F6 añade un quinto:** dar de alta una clínica tiene que incluir **aprobar sus
plantillas en el panel de Meta**. `recordatorio_cita` no se ha mandado nunca a
un número real, y sus parámetros son posicionales: si se aprueba con el cuerpo
en otro orden, el paciente recibe la fecha donde va su nombre **sin un solo
error**. No hay forma de comprobarlo desde aquí.

### 8.3 · F3b y la barandilla 4 siguen aparcados

Sin cambios respecto a ESTADO_F3 §8.1 y §8.2. F6 no los ha tocado.

### 8.4 · Los tres de infraestructura siguen abiertos

1. El CI no impide mezclar: falta marcar `comprobaciones-estaticas` como check
   obligatorio en Settings → Branches.
2. La mitad viva no corre en CI: faltan `RLS_VIVA=true` y los cuatro secretos
   `SUPABASE_*_DEV`.
3. Las pruebas de navegador tampoco corren en CI (F5 §8.6).

**F6 añade un cuarto, y es suyo:** `vercel.json` programa
`/api/cron/recordatorios` **cada hora**, y hay planes de Vercel que solo admiten
crons diarios. Si se despliega en uno de esos, hay que cambiar el horario a
diario **y poner `RECORDATORIO_HORAS_ANTES=48`**; si no, las citas de dentro de
entre 24 y 48 horas no reciben nada. Está escrito en `.env.example`, que es
donde alguien lo va a leer.

### Limitaciones conocidas

- **Un recordatorio que falla al enviarse no se reintenta.** Decisión escrita en
  los LÍMITES y comprobada: se prefiere perder uno a mandar dos. Queda en
  `eventos` y en `mensajes.estado_entrega`.
- **El recordatorio va a citas `confirmada` y solo a esas.** Una cita que
  recepción dejó en `provisional` a mano no recibe aviso — pero tampoco
  sobrevive: `liberar_provisionales` la cancela en cuanto caduque.
- **La liberación tarda hasta cinco minutos.** Es el horario del job. Una
  retención de diez minutos puede llegar a quince.
- **`recordatorios` no la purga nadie.** Como `auditoria`. Por eso no lleva
  dentro más que dos identificadores y una fecha. Crece una fila por cita
  recordada y para siempre; con una clínica pequeña son unas pocas miles al año.
- **Nadie comprueba que la plantilla aprobada en Meta tenga los parámetros en el
  orden que espera el código.** Heredado de ESTADO_F4, y ahora pesa más porque
  F6 es quien la manda.
- **La ruta de recordatorios espera a terminar** en vez de irse a `after()`. Es
  deliberado (su cabecera lo explica: el registro de Vercel Cron es lo único que
  dice si el trabajo sirvió), pero significa que `maxDuration = 60` tiene que
  cubrir todos los envíos de una pasada. Con muchas clínicas habría que partir
  el trabajo por lotes, y el `unique` hace que eso sea seguro.

---

## 9 · Lo que F6 cambió de F1–F5

**Ni una política RLS existente, ni `sin_solape`, ni un bloque de
`contenido/bloques/`, ni los tres clientes de Supabase en su comportamiento, ni
un archivo de `src/lib/bot/`, ni uno de `src/lib/panel/` o `src/app/panel/`.**
El motor y el panel están intactos.

| Archivo | Cambio | Por qué |
|---|---|---|
| `supabase/migrations/…_trabajos_programados.sql` | **Nueva.** Solo añade | §1 y §3.1. Pedida y confirmada antes de escribirla |
| `src/lib/whatsapp/botones.ts` | `leerPayloadDeCita()`, pura, e importa los dos prefijos de `plantillas.ts` | Quien lee el payload tiene que ser el mismo que lo escribió |
| `src/lib/whatsapp/procesar.ts` | Paso **5b** y un `hecho: 'boton'` nuevo | §3.4 |
| `src/app/api/cron/salud/route.ts` | Su cerrojo pasa a ser `cerrojoDelCron()` | Tres copias de un control de acceso se separan, y la que se queda vieja deja una ruta abierta |
| `.claude/CLAUDE.md` · `src/lib/supabase/servidor.ts` | La frase de `middleware.ts` | §8.1. Pendiente aprobado por el usuario |
| `.claude/agents/revisor-codigo.md` · `src/proxy.ts` | Íd. | §8.1. Los dos que el grep de F5 no encontró |
| `tests/rls/00-rls-activada.test.ts` | «ocho migraciones» → nueve, y 15 tablas → 16 | La lista es exacta a propósito |
| `tests/ayuda/mantenimiento.ts` | **Nuevo.** Llega al esquema privado por la CLI | §4 |
| `src/tipos/bd.ts` | Regenerado | Tabla nueva |
| `.env.example` · `package.json` · `vercel.json` | `RECORDATORIO_HORAS_ANTES`, dos scripts, los horarios | — |

### Una columna que se quitó antes de que existiera

`recordatorios` llegó a declarar `wa_message_id`. **No cabe:** la marca se coge
antes de mandar, así que en ese momento Meta todavía no ha devuelto ningún
wamid, y después no se puede escribir porque la tabla no tiene política de
`UPDATE` para nadie — a propósito.

Una columna que no se puede rellenar nunca es peor que no tenerla: el primero
que la lea creerá que el hueco significa algo. Se quitó del SQL y de la base, y
el wamid del recordatorio vive en `mensajes`, que es donde viven todos.

---

## 10 · Reglas del proyecto que siguen mandando

- **No tocar sin confirmación explícita:** las políticas RLS de
  `supabase/migrations/`, los bloques de `contenido/bloques/`, el constraint
  `sin_solape`, y los tres clientes de Supabase. **F6 pidió permiso para la
  única cosa que necesitaba —la migración 009— y no tocó nada más.**
- Nada del camino del bot usa `service_role`. Solo la siembra y la limpieza de
  las pruebas.
- **La RLS filtra; el código comprueba y avisa.** Ningún archivo nuevo repite en
  la consulta un predicado de seguridad (§6).
- **Cero funciones `SECURITY DEFINER`**, y van tres fases defendiéndolo.
- `escalados` no tiene ni una columna de texto libre, y lo que sale por WhatsApp
  o por correo tampoco lleva un síntoma dentro.
- El motivo de la visita es `enum`, nunca texto libre.
- `proxy.ts`, **nunca** `middleware.ts` (§8.1 para el motivo corregido).
- **Una sola tirada a la vez contra la base de desarrollo**, contando también
  Playwright.
- `pnpm`, nunca `npm` ni `yarn` (ESTADO_F1 §5.1).
- Todo lo que lee el paciente, en castellano de España; y lo que lee la clínica,
  con su vocabulario: publicar, valores secretos, preparar, lanzar.
