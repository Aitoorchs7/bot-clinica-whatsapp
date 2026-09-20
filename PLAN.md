# PLAN · Bot de WhatsApp para clínicas dentales (V2)

> ## ⚠️ Sobre la procedencia de este archivo
>
> **Reconstruido el 19 de septiembre de 2026, al cerrar F4.** El `PLAN.md`
> original nunca llegó a existir en el repositorio: `ESTADO_F3` lo cita siete
> veces y `ESTADO_F3 §8` da por hecho que la lista de pendientes vive aquí
> además de allí, pero el archivo no estaba ni en el árbol ni en el historial
> de git. Esto lo arregla.
>
> **Qué es cita y qué es reconstrucción**, para que nadie confunda las dos:
>
> | Parte | Procedencia |
> |---|---|
> | §2 Stack, §3 Barandillas, §4 Herramientas, §5 Conversación, §6 Seguridad, §9 Protegidos, §10 Fuera de alcance | `.claude/CLAUDE.md`, literal o casi |
> | Las siete afirmaciones marcadas «📌 citado» | El código y los `ESTADO_*` que las citan por su nombre |
> | §7 Las fases | Deducidas de `ESTADO_F1`–`F4`, del historial de git y de las referencias cruzadas («el panel es F5», «alta-clinica (F8)») |
> | §8 Contrato y niveles de prueba | `.claude/CLAUDE.md` + `ESTADO_F3 §1` |
> | §11 Pendientes vivos | Copia de `ESTADO_F4 §8` |
>
> **Lo que NO se ha podido recuperar** y hay que revisar antes de fiarse: los
> plazos, el presupuesto, las cifras comerciales, y cualquier decisión que el
> plan original tomara y que ninguna fase posterior haya citado. Si existe una
> copia del original, **gana ella**: sustitúyase este archivo y compárese con
> `ESTADO_F1`–`F4` por si alguna fase se desvió sin que nadie lo notara.

---

## 1 · Qué se construye

Un asistente de WhatsApp para clínicas dentales que **coge citas**, contesta
preguntas frecuentes con respuestas aprobadas, y pasa a una persona cuando toca.
Multi-clínica desde el primer día.

El requisito que manda sobre todo lo demás:

> **Lo que el bot no debe decir no le llega.** No es un filtro de intención
> escrito en el prompt: es RLS. Para el rol `bot`, la fila confidencial no
> existe.

### De V1 a V2

| | V1 (`Bot Clinica Demo V1`, **solo lectura**) | V2 (este proyecto) |
|---|---|---|
| Canal | Teléfono | WhatsApp Business Cloud API |
| Lenguaje | Python | TypeScript |
| Datos | Google Sheets | Supabase (PostgreSQL + RLS) |
| Clínicas | Una | Multi-inquilino |
| Modelo | Claude | Gemini (tier gratuito) para la primera clínica |

De V1 se copia lo que haga falta —los bloques de prompt de `4 Agente/*.md`, la
documentación comercial— **sin modificarla en origen**.

Lo que V1 dejó medido y que V2 no puede volver a aprender a golpes:

- **El bug de V1:** se ofrecían huecos que la reserva luego rechazaba.
- **El escalado sin idempotencia:** el 11/09 el modelo escaló cuatro veces la
  misma conversación y la llamada se cayó.
- 📌 **No meterlo todo en un agente.** A un modelo al que se le pide saludar,
  calificar, consultar, reservar, confirmar y registrar en un solo paso **empieza
  a abandonar tareas por la quinta o la sexta**, y llega a asegurar que ha hecho
  algo que no hizo. *(Citado en `src/lib/bot/cerebro.ts`.)*

---

## 2 · Stack tecnológico

- Next.js 16 (App Router), TypeScript estricto, React 19
- Tailwind v3.4.17, Lucide React
- Supabase (PostgreSQL, Auth, RLS) — región EU (Frankfurt), por RGPD
- Gemini API (`@google/genai`), tier gratuito de Google AI Studio:
  - `gemini-3.6-flash` — cerebro del bot, seis herramientas
  - `gemini-3.1-flash-lite` — clasificador de urgencia/escalado
  - `gemini-embedding-001` truncado a 768 dims — embeddings de la FAQ
  - Una sola `GOOGLE_AI_API_KEY` cubre las tres cosas
- Deepgram (`nova-3`, es) para notas de voz, con vocabulario dental propio
- WhatsApp Business Cloud API (Meta, oficial) — **nunca** Baileys ni
  whatsapp-web.js en producción
- Zod para validación · Vitest + Playwright para pruebas
- Vercel para despliegue; Vercel Cron + `pg_cron` para trabajos programados
- pnpm como gestor de paquetes

### ⚠️ Los modelos cambiaron, y el porqué importa

Este plan fijaba originalmente `gemini-2.5-flash` y `gemini-2.5-flash-lite`.
**Los dos devuelven 404 a una clave nueva** («no longer available to new
users»). Lo cazó `tests/bot-contrato` el 18/09/2026, a las dos horas de existir,
que es exactamente para lo que está. Se probaron diez candidatos uno a uno; el
detalle, en `ESTADO_F3 §7.1`.

**Van clavados a una versión, no a un alias.** `gemini-flash-latest` sería más
cómodo, pero un modelo que cambia solo invalida la auditoría de fuga
(barandilla 4) sin que nadie se entere: lo que se apruebe en F7 dejaría de ser
lo que corre el día que Google mueva el alias. Un 404 ruidoso es mejor que un
cambio silencioso.

Lo mismo se aplicó en F4 a la versión de la Graph API de Meta: clavada
(`v25.0`), no a un alias.

📌 **Los nombres de parámetro del SDK de Google cambian más a menudo que los de
Anthropic.** Hay que verificarlos contra `node_modules/@google/genai`, no
recordarlos. *(Citado en `src/lib/bot/gemini.ts` y en
`tests/bot-contrato/01-gemini.test.ts`.)*

---

## 3 · Las cuatro barandillas del bot

1. **Filtro de entrada = RLS.** Lo confidencial no llega al prompt porque la
   consulta no lo devuelve.
2. **El contador.** Cada prompt montado registra en log y en `eventos` cuántas
   filas vio el bot frente al total. Test obligatorio: si coinciden habiendo
   alguna fila confidencial, el test falla.
3. **Herramientas, no memoria.** El modelo nunca inventa horarios ni precios;
   usa las seis herramientas contra la base de datos real.
4. **Auditoría de fuga.** Batería de 30 preguntas adversarias contra datos
   sembrados con un marcador único. Si el marcador aparece en cualquier
   respuesta o en el prompt montado, la prueba bloquea el merge.

⚠️ La barandilla 4 hay que pasarla **con el modelo que corre de verdad**. Nunca
se ha ejecutado contra Gemini. Es F7 y sigue pendiente.

---

## 4 · Las seis herramientas. Ni una más

`anotar` · `repasar_ficha` · `consultar_huecos` · `crear_cita` ·
`no_te_entiendo` · `escalar_a_recepcion`

Cada una hace una cosa. El clasificador filtra **antes** del cerebro, y al
cerebro le llegan como mucho estas seis.

**El muestreo de huecos.** `consultar_huecos` (el RPC) devuelve la verdad
completa y ordenada; la reducción a dos o tres opciones repartidas por el día se
hace en la capa de herramientas, no en SQL. Al modelo **no se le pasa el total**
de huecos libres: «hay treinta y siete huecos» no es una frase que diga una
recepcionista, y un dato que no entra en el contexto no puede salir por la boca
del bot.

**La confirmación se mide en el mensaje del paciente, no en un argumento.**
`crear_cita({confirmado: true})` sería el modelo vigilándose a sí mismo, que es
lo que este proyecto no hace en ningún sitio.

📌 **La ventana de historial son diez parejas, y no se sube sin volver a
medir.** *(Citado en `src/lib/bot/historial.ts`.)*

📌 **`recuperacion.ts` (FAQ por pgvector) se condiciona a más de 100
preguntas.** La clínica piloto tiene 16 y van todas en el prompt. *(Citado en
`ESTADO_F3 §LÍMITES`.)*

---

## 5 · Reglas de conversación que no se negocian

- El modelo **NUNCA** inventa un hueco de cita. Solo dice lo que devuelve
  `consultar_huecos`.
- Las respuestas de FAQ se dicen **PALABRA POR PALABRA**, no se reformulan.
- No se escribe nada en la base de datos sin confirmación explícita del
  paciente.
- Prohibido dar consejo médico, diagnóstico, pronóstico u opinión sobre un
  síntoma. Ante dolor, hinchazón, golpe o sangrado: mensaje seguro + teléfono +
  aviso al equipo, saltando directo a la última capa de fallback.
- El motivo de la visita es vocabulario cerrado (`enum`), nunca texto libre — es
  lo que mantiene el sistema fuera del Art. 9 del RGPD.
- El bot se identifica como asistente virtual en su primer mensaje de cada
  conversación. No finge ser una persona ni imita erratas para pasar por humana
  (art. 50 del Reglamento europeo de IA).
- Copy prohibido: «No te entiendo», «Reformula tu pregunta», «Lo siento, no
  puedo ayudarte con eso» a secas. Toda negativa va seguida de lo que **sí**
  puede hacer. Una sola ronda de aclaración, nunca bucles.

### Formato de WhatsApp

El asterisco **simple** es negrita. `**doble**` sale literal, con los asteriscos
a la vista. El prompt prohíbe el markdown (`**`, `__`, `##`) **y además** se
limpia en código antes de enviar: una instrucción en el prompt es una intención;
un `replace` antes del `fetch` es una garantía.

---

## 6 · Seguridad — no negociable

- Toda credencial o secreto siempre en `.env.local`. Nunca leer `.env` ni
  `.env.local` directamente. Mantener `.env.example` al día, con las claves
  vacías y comentadas.
- RLS obligatoria en toda tabla nueva, sin excepción, activada en la misma
  migración que crea la tabla.
- La clave `service_role` **jamás** sale del servidor ni entra en
  `NEXT_PUBLIC_*`. Solo en migraciones y scripts de alta — nunca en el camino
  del bot, nunca en el navegador.
- El bot solo lee filas con `publico = true`. Eso lo garantiza la RLS, no el
  prompt.
- `app_metadata`, nunca `user_metadata`, para `clinica_id` y `rol`.
- `WITH CHECK` en todo `INSERT`/`UPDATE`.
- Toda vista se crea con `WITH (security_invoker = true)`.
- Ninguna función `SECURITY DEFINER` en un esquema expuesto sin justificación
  escrita en un `COMMENT` del propio SQL.
- **`proxy.ts`, NUNCA `middleware.ts`** — el convenio viejo está **deprecado**
  desde Next.js 16, y el día que lo retiren el guardián del panel dejará de
  ejecutarse **sin romper ninguna compilación y sin poner roja ninguna prueba
  que mire solo la redirección**.
  > ⚠️ **Corregido en F5, midiendo.** Este plan decía «se ignora en silencio y
  > las rutas quedan públicas». En **16.3.5 no es así todavía**: `middleware.ts`
  > avisa (`⚠ The "middleware" file convention is deprecated`) y **se sigue
  > ejecutando**, así que renombrar el archivo no dejó el panel abierto. La
  > regla no cambia —el motivo de arriba la sostiene igual— pero la frase era
  > falsa. Ver `ESTADO_F5 §5.1`. La misma frase sigue en `.claude/CLAUDE.md` y
  > en `src/lib/supabase/servidor.ts`, que no se tocan sin confirmación:
  > `ESTADO_F5 §8.1`.

### La regla que se descubrió construyendo

**Está prohibido duplicar en la consulta un predicado de seguridad que la RLS ya
aplica.** Un `.eq('publico', true)` de más deja ciega a la barandilla 2: con la
política rota, `retenidas` seguiría siendo 0 y nadie se enteraría. La RLS
filtra; el código comprueba y avisa. Lo vigila
`tests/barandillas/04-sin-filtro-en-codigo.test.ts`, cuyo alcance se extiende
solo a todo archivo que use el cliente del bot.

---

## 7 · Las fases

| Fase | Qué entrega | Estado |
|---|---|---|
| **F0** | Esqueleto del proyecto y reglas del agente | ✅ Cerrada |
| **F1** | Base de datos multi-clínica, RLS y los tres clientes de Supabase | ✅ Cerrada |
| **F2** | Los diez bloques de prompt y las barandillas 1 y 2 | ✅ Cerrada |
| **F3** | El motor del bot: cerebro, seis herramientas y clasificador | ✅ Cerrada |
| **F3b** | Estrechar la RLS a la conversación (`pacientes`, `conversaciones`, `mensajes`) | ⏸ Aparcada |
| **F4** | El canal de WhatsApp: webhook, envío, plantillas, audio, debounce | ✅ Cerrada |
| **F5** | El panel de la clínica | ✅ Cerrada |
| **F6** | Trabajos programados: recordatorios, purga, provisionales caducadas | ✅ Cerrada |
| **F7** | La barandilla 4 con el modelo real | ▶ Siguiente |
| **F8** | `alta-clinica` y la entrega al cliente | ⏳ |

### F1 · Base de datos y RLS

Quince tablas, todas con RLS activada en la misma migración que las crea. Tres
roles que salen de `app_metadata`: `bot`, `clinica` (propietario / recepción /
lectura) y `nadie` (`anon`, sin políticas **y** sin grants — dos cerrojos).
Constraint `sin_solape` en `citas`. RPC `consultar_huecos` y `crear_cita`.
Retención a 90 días por `pg_cron`.

Constantes de negocio heredadas de V1: no se dan citas más allá de **120 días**,
y la rejilla de huecos es de **15 minutos**.

### F2 · Bloques de prompt y barandillas 1 y 2

El prompt del bot sale de `montarPromptDeDatos()`, **nunca** de un string en el
código: los diez bloques viven en `contenido/bloques/` y se siembran en
`bloques_prompt`. `filtro.ts` carga, `montaje.ts` monta, `contador.ts` cuenta y
`origen.ts` registra de qué fila salió cada dato inyectado.

### F3 · El motor

Siete módulos en `src/lib/bot/`. El orden que ejecuta `responder()` **es el
producto**:

```
1. cargarDatosDelPrompt()   la RLS decide qué llega          barandilla 1
2. montarPromptDeDatos()    los diez bloques, nunca un string
3. contar()                 SIEMPRE, también si se va a cortar  barandilla 2
4. clasificar()             ANTES del cerebro
   └─ urgencia → escalar + mensaje seguro. El cerebro NO se llama
5. bucle de herramientas    como mucho las seis              barandilla 3
```

El recordatorio de las reglas duras se reinyecta **al final** del contexto,
después del historial: un modelo atiende al principio y al final, y el prompt de
sistema queda en medio en cuanto la conversación crece.

### F4 · El canal de WhatsApp

El webhook responde en cinco pasos y **el orden es la seguridad**: cuerpo crudo
→ firma HMAC → idempotencia en la base → 200 → `after()`. Doce módulos en
`src/lib/whatsapp/`. Debounce de 8 s decidido **contra la base**, no en memoria.
Todo mensaje, entrante y saliente, se guarda con `wa_message_id`, estado de
entrega, tokens y coste.

**Una clínica = un `phone_number_id`**, y el mapa vive en `WHATSAPP_CLINICAS`
(entorno) porque la RLS del rol `bot` exige saber ya de qué clínica eres antes
de poder leer nada. Se **comprueba** después contra
`clinicas.wa_phone_number_id`. Ver `ESTADO_F4 §3`.

### F5 · El panel

Para la clínica, no para nosotros: agenda, fichas, FAQ y tratamientos con su
`publico`, cola de escalados, y las conversaciones en modo lectura. **No hay
bandeja de respuesta humana en esta versión.**

Siete pantallas y `src/proxy.ts`, que es quien guarda la puerta. Lo que manda
en la fase:

- **El interruptor `publico` es la superficie de control de la barandilla 1.**
  Se etiqueta en el idioma del cliente («el asistente puede decir esto» / «solo
  para el equipo»), encender pide confirmación enseñando el texto exacto, y el
  cambio deja rastro en `auditoria`.
- **Ninguna consulta del panel repite un predicado que ya aplica la RLS.** Lo
  vigila un guardián propio, hermano del del camino del bot.
- **Playwright entra en juego por primera vez**, y por un motivo que no se
  podía cubrir de otra forma: que el archivo que protege el panel sea el que
  Next lee, y que el interruptor llegue hasta el prompt del modelo.

La migración **008** es de aquí, y es la única que F5 añadió: el panel no podía
dejar rastro en `auditoria` porque no tenía política de `INSERT`. Solo añade.

### F6 · Trabajos programados

Recordatorios de cita (plantilla `recordatorio_cita`), liberación de
provisionales caducadas, y la comprobación de que la purga de 90 días —que ya
existía desde F1— está limpiando de verdad. Vercel Cron + `pg_cron`.

**Es la primera fase que manda mensajes sola**, y eso cambia el criterio: un
error aquí le llega a un paciente que no ha pedido nada.

- **¿De qué clínica es un cron?** No hay una sola respuesta. La liberación de
  provisionales **no es de ninguna**: es mantenimiento de la base, lo ejecuta
  `pg_cron` como `postgres` y no necesita identidad de inquilino. Los
  recordatorios son **de todas, una detrás de otra**, con `WHATSAPP_CLINICAS` y
  la misma comprobación contra la base que el webhook. Sigue sin haber
  `service_role` ni una sola función `SECURITY DEFINER`.
- **La idempotencia la garantiza la base**, no el proceso: la migración 009 añade
  `recordatorios` con `unique (clinica_id, cita_id)`. Medido con diez
  invocaciones concurrentes; sin el índice salen diez recordatorios.
- **La hora se calcula en la zona horaria de la clínica**, no en la del servidor.
- **`CANCELAR` no cancela.** Cancelar por WhatsApp está fuera del producto, así
  que el botón escala a recepción y al paciente se le dice que su cita sigue en
  pie. Un botón que promete lo que no hace es peor que no tenerlo.

La migración **009** es de aquí, es la única que F6 añadió, y **solo añade**.

### F7 · La barandilla 4

Las 30 preguntas adversarias, contra el modelo que corre de verdad.

### F8 · Alta de clínica y entrega

El guion que entrevista a una clínica nueva y genera su seed. Ver §11: hay tres
cosas que hoy no se siembran y tienen que entrar aquí.

---

## 8 · Cómo se trabaja

### El contrato de cinco campos, antes de tocar un archivo

**ENTREGA · PRUEBA · LÍMITES · SUPUESTOS · FALLOS.** Al cerrar se ejecuta PRUEBA
y se pega la salida real. **No se reescribe el contrato para que encaje con lo
que salió.**

### El criterio de cierre de una fase

1. La suite da **el mismo número dos veces seguidas**. Una batería cuyo recuento
   cambia entre dos ejecuciones no demuestra nada, ni cuando falla ni cuando
   pasa.
2. **Se ha visto ponerse roja donde debe.** Que la suite corra demuestra que
   corre; solo verla en rojo demuestra que mira. Cada garantía se rompe a
   propósito y se pega la salida.
3. `tsc --noEmit` y `eslint` en 0.
4. Se escribe `ESTADO_F<n>.md` con lo que se decidió **y lo que se descartó**.

### Los tres niveles de prueba

> **`pnpm test` no hace ni una llamada a Gemini, ni a Meta, ni a Deepgram.**

| Nivel | Dónde | Necesita |
|---|---|---|
| 1 | `tests/bot/`, `tests/whatsapp/`, `tests/barandillas/` | Nada. Corre en una máquina recién clonada |
| 2 | `tests/bot-vivo/`, `tests/whatsapp-vivo/`, `tests/rls/` | Supabase de desarrollo |
| 3 | `tests/bot-contrato/` | Gemini de verdad. **Apagado** salvo `GEMINI_VIVO=1` |

El nivel 3 son pruebas **de contrato**, no de comportamiento: nunca afirman nada
sobre la prosa del modelo, solo que el SDK sigue aceptando nuestras
declaraciones y que lo que vuelve tiene la forma que parseamos. Así es
determinista por construcción.

**Dónde se simula decide si la prueba sirve.** El doble se pincha en la frontera
del SDK o del `fetch` —la última línea antes del HTTP—, nunca sustituyendo algo
que hayamos escrito nosotros. Un doble que imitara el bucle de herramientas
comprobaría el doble, no el bot.

**Una sola tirada de Vitest a la vez contra la base de desarrollo.** El
`globalSetup` siembra al arrancar y borra al terminar; dos tiradas a la vez se
pisan el fixture.

### Skills según la fase

`supabase` y `supabase-postgres-best-practices` (base de datos y RLS) ·
`chatbot-flow-design` (intents, fallbacks, escalado, métricas) ·
`ai-agent-builder` (prompt de sistema, tool use, guardrails) · `whatsapp-cloud`
(webhook, firma, plantillas, ventana de 24 h) · `frontend-design` o
`minimalist-ui` (panel — **elegir una, no mezclar**).

### Al hablar con el cliente

Usa: publicar, carpeta de código, valores secretos, preparar, lanzar, conectar.
Nunca: deployment, repository, environment variables, refactor, build, pipeline.

---

## 9 · No tocar sin confirmación explícita

- Las políticas RLS de `supabase/migrations/`
- Los bloques de prompt de `contenido/bloques/`
- El constraint `sin_solape` de la tabla `citas`
- Los tres clientes de Supabase (`navegador.ts`, `servidor.ts`, `bot.ts`) y su
  separación de roles

---

## 10 · Fuera de alcance en esta versión

No lo construyas aunque parezca buena idea. Solo entra si una clínica que paga
lo pide **dos veces**:

- Bandeja de respuesta humana en el panel
- Cancelar o mover citas por WhatsApp
- Integración con software de gestión dental (Gesden, Dentalink)
- Multi-sede dentro de una misma clínica
- Mensajes salientes de captación
- Memoria entre conversaciones distintas

---

## 11 · Pendientes vivos

> **Esta lista tiene dos copias: aquí y en `ESTADO_F6 §8`.** Es deliberado: con
> F1 casi se pierde un pendiente porque vivía solo en su `ESTADO_*.md`, y eso
> depende de que alguien se acuerde de releerlo. **Si se toca una, se toca la
> otra.**

### Cerrado en F6 · La frase de `middleware.ts`, y eran seis sitios

La afirmación «en Next.js 16 `middleware.ts` se ignora en silencio y las rutas
quedan públicas» **no es cierta en 16.3.5**: está deprecado, avisa y se sigue
ejecutando. Se midió renombrando el archivo (`ESTADO_F5 §5.1`).

**La regla no cambia** —`proxy.ts`, nunca `middleware.ts`—, y la frase ya está
corregida con la redacción que dejó propuesta `ESTADO_F5 §8.1`:

| Dónde | Estado |
|---|---|
| §6 de este plan | ✅ F5 |
| `.claude/CLAUDE.md` línea 56 · `src/lib/supabase/servidor.ts` línea 40 | ✅ **F6** |
| `.claude/agents/revisor-codigo.md` · `src/proxy.ts` | ✅ **F6**, y no estaban en la lista |
| `ESTADO_F1.md` líneas 80 y 477 | ⚪ No se retoca: un registro cerrado se queda como está |

**Los dos últimos son el aviso que deja este pendiente al morir.** El `grep` de
F5 dijo «cuatro sitios» y eran seis: se había dejado fuera el archivo que le da
instrucciones al agente revisor de código —que por tanto buscaba un fallo que ya
no existe— y la cabecera de `src/proxy.ts`, que *citaba* a `.claude/CLAUDE.md`
diciendo la frase y se quedaba desmintiendo a su fuente en cuanto se corrigió el
original. Un `grep` es tan bueno como los términos que se le den.

### Para F8 · `alta-clinica`

Dar de alta una clínica nueva **no es solo insertar filas**. Hoy hacen falta
**cinco** cosas y ninguna está automatizada:

1. **`WHATSAPP_CLINICAS` + redespliegue.** Hay que añadir el par
   `"<phone_number_id>": "<clinica_id>"` a la variable de entorno **y volver a
   desplegar**, además de poner el `wa_phone_number_id` en la fila de
   `clinicas`. Si solo se hace una de las dos, el canal rechaza sus mensajes.
   **Es un coste operativo, no un detalle de configuración.**
   > ⚠️ **F6 lo agrava.** Hasta ahora, una clínica que faltara en el mapa se
   > quedaba sin contestar a quien le escribía: molesto, pero **lo nota el
   > paciente**, que acaba llamando. Ahora además se queda **sin mandar
   > recordatorios**, y eso no lo nota nadie hasta que alguien no se presenta a
   > una cita. Ver `ESTADO_F6 §2.2`.
2. **`mensaje_urgencia`** en `config`. Hoy no existe en ninguna parte del
   repositorio, así que al escalar el paciente recibe el mensaje por defecto:
   correcto y con el teléfono de la clínica, pero genérico.
3. **`politica_privacidad`** en `config`. Lo usa el bloque «05 - Aviso inicial».
4. **Los usuarios del panel.** *(Nuevo en F5.)* Hay que crearlos en Supabase
   Auth con `rol` y `clinica_id` en `app_metadata` —nunca en `user_metadata`—.
   Hoy los únicos que existen los crea la siembra de las pruebas, así que una
   clínica recién dada de alta tiene panel y no tiene con qué entrar.
5. **Aprobar sus plantillas en el panel de Meta.** *(Nuevo en F6.)*
   `recordatorio_cita` no se ha mandado nunca a un número real, y **sus
   parámetros son posicionales**: si se aprueba con el cuerpo en otro orden, el
   paciente recibe la fecha donde va su nombre **sin un solo error**. No hay
   forma de comprobarlo desde el código.

### Aparcados

- **F3b**, estrechar la RLS a `pacientes` / `conversaciones` / `mensajes`.
  `citas` **NO** se toca: `consultar_huecos` necesita ver las ajenas para
  calcular disponibilidad, y estrecharla reintroduciría el bug de V1 por una
  puerta nueva.
- **F7**, la barandilla 4 con el modelo real.
- ~~**Los botones de `recordatorio_cita`** no tienen quien los atienda.~~
  ✅ **Cerrado en F6.** `CONFIRMAR:<id>` confirma la cita —comprobando que es de
  esa clínica (RLS) y de ese paciente (teléfono)— y `CANCELAR:<id>` **no
  cancela**: escala a recepción y le dice al paciente que su cita sigue en pie.
  Cancelar por WhatsApp está fuera del producto. Ver `ESTADO_F6 §3.2` y §3.3.

### Infraestructura

1. El CI no impide mezclar: falta marcar `comprobaciones-estaticas` como check
   obligatorio en Settings → Branches.
2. La mitad viva no corre en CI: faltan `RLS_VIVA=true` y los cuatro secretos
   `SUPABASE_*_DEV`.
3. **Las pruebas de navegador tampoco corren en CI.** *(Nuevo en F5.)* Cuando se
   resuelva el punto 2, el trabajo `rls-viva` puede llevarlas con dos pasos más:
   `pnpm exec playwright install --with-deps chromium` y `pnpm test:e2e`. No se
   han añadido a ciegas: un paso de CI que nadie ha visto correr es otra forma
   de creerse cubierto.
4. **El horario del cron depende del plan de Vercel.** *(Nuevo en F6.)*
   `vercel.json` dispara `/api/cron/recordatorios` **cada hora**, y hay planes
   que solo admiten crons diarios. Si se publica en uno de esos hay que cambiar
   el horario a diario **y poner `RECORDATORIO_HORAS_ANTES=48`**; si no, las
   citas de dentro de entre 24 y 48 horas no reciben aviso. Está explicado en
   `.env.example`, que es donde alguien lo va a leer.

### Una regla de operación que F5 amplía

**Una sola tirada a la vez contra la base de desarrollo** (ESTADO_F3 §5.4),
ahora contando también Playwright: siembra y limpia **el mismo fixture** que
Vitest. `pnpm test` y `pnpm test:e2e` a la vez se pisan.
