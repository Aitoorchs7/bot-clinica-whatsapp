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

⚠️ **Ejecutada contra Gemini de verdad el 21/09/2026** (F7). Resultado: cero
fugas y cero `AssertionError` en las treinta. Las dieciseis que fallaron se
cayeron por infraestructura —ocho por cuota, una por un 503, y una por el fallo
del `thought_signature`—, ninguna por decir lo que no debia. El limite del tier
gratuito son **20 peticiones al dia por modelo**, asi que esa mitad se corre a
trozos y **la que bloquea el merge es la determinista**. Ver `ESTADO_F7` §5.

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
| **F7** | La suite de conjunto: barandilla 4, quince guiones y CI | ✅ Cerrada |
| **F8** | `alta-clinica` y la entrega al cliente | ✅ Cerrada |
| **F9** | Publicación: esquema, secreto y canal en producción, y el CI entero | 🔄 En curso |

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

### F7 · La suite de conjunto

Las 30 preguntas adversarias, quince guiones de conversacion de referencia, el
hueco de RLS que dejo F6 (`recordatorios`) y un CI de tres trabajos.

**La barandilla 4 tiene dos mitades, y la que bloquea no llama a Gemini.** El
modelo de `tests/fuga/01-bateria.test.ts` es el PEOR posible: vuelca
literalmente todo lo que ve. Contra el, el marcador solo puede faltar porque
nunca entro — que es la garantia que vende el producto, y no la prudencia del
modelo. La mitad con Gemini de verdad esta en `02-con-gemini.test.ts`, ya se ha
ejecutado (ninguna fuga en treinta) y **no cabe entera en un dia**: el tier
gratuito da 20 peticiones diarias por modelo. Ver `ESTADO_F7` §3.1 y §5.

**Y encontro tres fallos que no son suyos**, los tres en §8 de abajo: el bucle
de herramientas devuelve 400 contra `gemini-3.6-flash` por el
`thought_signature`, el canal no le pasa al motor ni el borrador ni las rondas
de aclaracion, y un clic del interruptor deja dos apuntes en `auditoria`.

### F8 · Alta de clínica y entrega

**Dar de alta una clínica pasa a ser UN procedimiento**, y está escrito en
`entregas/alta-de-una-clinica.md`: la entrevista (`/alta-clinica`) escribe una
ficha, `pnpm alta` la ejecuta entera —incluidos los usuarios del panel, que no
se pueden crear con un INSERT— y `pnpm alta:comprobar` levanta el acta contra la
base de verdad.

**El acta no dice «apto».** Dice cuatro de cinco, porque el quinto —el orden de
los parámetros de las plantillas aprobadas en Meta— no se puede comprobar desde
el código: Meta devuelve 200 igual y el paciente recibe la fecha donde iba su
nombre. Ese se comprueba con un centinela numerado y un móvil delante
(`entregas/plantillas-meta.md`).

Lo que el acta mira que antes no miraba nadie: que `politica_privacidad` y
`mensaje_urgencia` lleguen **al prompt montado** y no solo existan como fila
—con `publico = false` existen y el bot no las recibe—, y que **lo que la ficha
marcó como privado no lo vea el bot**, fila por fila. Y pasa la barandilla 4 con
los datos de esa clínica, con un canario sembrado y retirado en la misma orden.

Ver `ESTADO_F8`.

### F9 · Publicación

El panel se publicó con el merge de F1–F8 (`79fd601`, 27/09/2026). **Publicar
el panel no es publicar el bot**: F9 termina cuando un mensaje de WhatsApp real
recibe respuesta en producción, con cada pieza comprobada por separado y en
orden. Son seis puntos: el esquema de la base de producción (las diez
migraciones, la 010 la primera que importa), el secreto JWT con el que firma el
bot, el canal de punta a punta, el hueco del CI (`pruebas-vivas`), las
decisiones de producto que quedan (credenciales sin uso, correo, cuota de
Gemini) y una ruta de salud que diga qué clínicas conoce el despliegue.

Dos reglas que nacen aquí:

- **A producción se llega con `--db-url`, nunca con `supabase link`.** Las
  pruebas lanzan SQL como `postgres` contra el proyecto vinculado; vincular
  producción «para mirar» dejaría `pnpm test` purgando su historial.
- **Cada paso que toca producción espera un «sí» explícito**: la base, las
  variables de Vercel, Meta, y fusionar en `main`, que publica.

Ver `ESTADO_F9`.

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

> **Esta lista tiene dos copias: aquí y en el `ESTADO_*.md` de la fase en
> curso, hoy `ESTADO_F9 §8`.** Es deliberado: con F1 casi se pierde un
> pendiente porque vivía solo en su `ESTADO_*.md`, y eso depende de que alguien
> se acuerde de releerlo. **Si se toca una, se toca la otra.**

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

### Cerrado en F8 · Los cinco de `alta-clinica`

Dar de alta una clínica nueva **no es solo insertar filas**: eran **cinco** cosas
y ninguna estaba automatizada. Hoy son **un procedimiento de tres comandos**
(`entregas/alta-de-una-clinica.md`) y **un paso manual con su comprobación**.

| # | Qué era | Cómo queda |
|---|---|---|
| 1 | `WHATSAPP_CLINICAS` + redespliegue, y `wa_phone_number_id` en la fila | ⚠️ **Medio cerrado.** El alta escribe la fila e imprime el par exacto; el acta comprueba los **dos sentidos** (webhook, y recordatorios/purga). Añadir la variable y **volver a publicar** sigue siendo manual, y el acta dice en voz alta que mira el entorno de *esta* máquina |
| 2 | `mensaje_urgencia` en `config` | ✅ Obligatoria en la ficha, y el acta la mira **en lo que devuelve `mensajeSeguro()`**, no en la fila |
| 3 | `politica_privacidad` en `config` | ✅ Obligatoria en la ficha, y el acta la mira **en el prompt montado** |
| 4 | Los usuarios del panel, con `app_metadata` | ✅ Los crea el alta, **inicia sesión una vez de verdad** para comprobar que entran y que el token lleva sus permisos, y devuelve un enlace de recuperación. El acta exige además que **ninguno** lleve `rol` ni `clinica_id` en `user_metadata` |
| 5 | Aprobar las plantillas en Meta | ⚪ **No se puede comprobar desde el código, y no se finge que sí.** Procedimiento escrito en `entregas/plantillas-meta.md` y centinela numerado: `pnpm alta:comprobar <slug> --plantilla <móvil>` |

**La trampa que el acta cierra y que no estaba en la lista de cinco:** una clave
obligatoria con `publico = false` **existe en la base y no le llega al bot**, así
que se comporta igual que si faltara — con la diferencia de que mirando la base
parece que está puesta. Y, del mismo modo, una FAQ interna publicada por error es
indistinguible de una pública si solo se mira la base: el acta compara **fila por
fila contra la ficha**, que es donde consta lo que la clínica dijo.

### Aparcados

- **F3b**, estrechar la RLS a `pacientes` / `conversaciones` / `mensajes`.
  `citas` **NO** se toca: `consultar_huecos` necesita ver las ajenas para
  calcular disponibilidad, y estrecharla reintroduciría el bug de V1 por una
  puerta nueva.
- ~~**Los botones de `recordatorio_cita`** no tienen quien los atienda.~~
  ✅ **Cerrado en F6.** `CONFIRMAR:<id>` confirma la cita —comprobando que es de
  esa clínica (RLS) y de ese paciente (teléfono)— y `CANCELAR:<id>` **no
  cancela**: escala a recepción y le dice al paciente que su cita sigue en pie.
  Cancelar por WhatsApp está fuera del producto. Ver `ESTADO_F6 §3.2` y §3.3.

### Nuevo en F7 · Tres fallos que encontro la suite, y el merge que no bloquea

> Copia de `ESTADO_F7` §8. **Si se toca una, se toca la otra.**

1. ~~**🔴 Confirmar contra Gemini el arreglo del `thought_signature`.**~~
   **✅ CERRADO el 22/09/2026.** Ver `ESTADO_F8` §7.1.
   El fallo: el bucle devolvia `400 INVALID_ARGUMENT` contra
   `gemini-3.6-flash` en la SEGUNDA vuelta porque `gemini.ts` no arrastraba el
   `thoughtSignature` que Gemini 3 pone en cada `functionCall`. Vivia al lado
   del `functionCall`, en la Part, y `respuesta.functionCalls` —el atajo del
   SDK— lo tiraba. No lo cazaba nadie porque `bot-contrato` hacia todas sus
   llamadas de UNA vuelta.
   **✅ Arreglado en F7**, con contrato y con cinco pruebas vistas en rojo
   (`tests/bot/06-firma-de-pensamiento.test.ts`).
   **✅ Y visto aceptar por Gemini el 22/09/2026**, con la cuota reseteada:
   `1 passed` dos veces (15:39 y 15:40) contra `gemini-3.6-flash`, y en rojo
   con la firma quitada, en la misma orden que la restaura.
   ⚠️ **El primer intento salio rojo y NO era el codigo:** la prueba de
   contrato armaba la vuelta 2 a mano y el arreglo de F7 habia entrado en el
   bucle de `cerebro.ts`, no en esa copia. Llevaba desde F7 diciendo que el bot
   estaba roto sin estarlo. De ahi sale `turnoConLasLlamadas()` en `gemini.ts`,
   que llaman el bucle y la prueba —la misma funcion, no una igual— y cuatro
   pruebas nuevas en `06-firma-de-pensamiento`.
   **Gate de F9 levantado.**
2. **🔴 El merge NO esta bloqueado, y no es una casilla sin marcar.** El
   repositorio es privado en plan gratuito y ahi GitHub no ofrece rulesets ni
   proteccion de rama: `GET /rulesets` devuelve `403 · "Upgrade to GitHub Pro
   or make this repository public"`. O publico, o de pago, o se borra la frase
   «bloquea el merge» de donde este. Decision de producto. Ver `ESTADO_F7` §6.1.
3. ~~**🔴 El canal no le pasa al motor `borrador` ni `rondasDeAclaracion`.**~~
   ✅ **Cerrado en F7 con la migracion 010**, que SOLO ANADE `borrador jsonb` y
   `rondas_aclaracion smallint` a `conversaciones`. Antes NO SE COGIAN CITAS:
   `procesar.ts` llamaba a `responder()` sin el borrador, cada mensaje
   empezaba de cero y `crear_cita` moria en `faltan_datos`. Y no se podia
   arreglar en el prompt, porque el bloque 50 PROHIBE volver a anotar lo que
   el paciente no acabe de decir. Ahora cuatro mensajes de WhatsApp dejan una
   cita en la base, y se ha visto en rojo quitando el cableado.
   ⚠️ **La 010 esta aplicada en desarrollo y no en produccion** (no hay
   produccion todavia). Cuando la haya, es la primera que sube.
   ✅ **Cerrado el 28/09/2026:** producción tiene las diez migraciones, en el
   historial y en los objetos, y `db push --dry-run` no tiene nada que aplicar.
   Ver `ESTADO_F9 §6`.
4. **🟡 Un clic del interruptor deja DOS apuntes en `auditoria`.**
   `tests/e2e/04-interruptor.spec.ts:189` lo caza. Los dos con `antes: true`,
   a 2,1 s: apunta a dos envios concurrentes de la accion. **Es anterior a F7**
   —comprobado con todo el trabajo de la fase en `git stash`— y no es clock
   skew, que se midio.
   ⚠️ **El 22/09/2026 paso en verde tres veces seguidas (31 de 31) sin que
   nadie lo tocara.** No se da por arreglado: ese dia solo se tocaron
   `gemini.ts`, `cerebro.ts` y pruebas, nada del panel. Un verde que aparece
   solo y sin explicacion es la forma exacta de los tres falsos verdes de
   `.claude/CLAUDE.md`. Queda abierto. Ver `ESTADO_F8` §6.3.
5. **La cuota de Gemini son 20 peticiones al DIA por modelo.** Si la primera
   clinica sale a produccion con esta clave, eso no es un limite de pruebas:
   es un limite de producto.

### Nuevo en F8

> La copia viva de esta lista pasa a `ESTADO_F8` §8. **Si se toca una, se toca
> la otra.**

1. **⚠️ El punto 1 del alta sigue siendo medio manual.** Añadir el par a
   `WHATSAPP_CLINICAS` y **volver a publicar** no se puede hacer ni comprobar
   desde aquí: el acta mira el entorno de la máquina donde corre, y lo dice.
   **Lo que F9 puede cerrar:** una ruta de salud que diga **qué clínicas conoce
   el despliegue**, y entonces el acta se lo pregunta al sitio publicado en vez
   de a esta máquina.
2. **⚠️ `WHATSAPP_CLINICAS` no está en `.env.local`.** Hallazgo de F8: la
   variable no existe en el entorno de desarrollo y nadie se había enterado
   porque las pruebas del canal se la ponen ellas mismas en memoria. No rompe
   nada hoy; es el mismo agujero del punto 1 en pequeño.
3. **El `README.md` sigue siendo el de `create-next-app`.** Ocho fases después,
   es la primera página que ve quien abre la carpeta de código. Candidato para
   F9, que es cuando la va a abrir alguien de fuera.

### Nuevo en F9

> La copia viva de esta lista pasa a `ESTADO_F9` §8. **Si se toca una, se toca
> la otra.**

1. **🔴 `pruebas-vivas` en rojo por `--linked`.** 13 rojos en el CI del merge
   (run 36334234453): nueve pruebas no pueden lanzar SQL («Cannot find project
   ref») y cuatro son daño colateral del mensaje de hace 120 días que `03-purga`
   deja sembrado cuando la purga no corre. Punto 4 de F9.
   ✅ **Cerrado el 28/09** (`--db-url`, guarda de proyecto, cerrojo de
   producción, y `03-purga` que borra lo suyo por id —había DOS filas sin
   apuntar, no una—). Los 13 rojos, reproducidos con el orden de los archivos
   fijado. Y el CI destapó un tercer fallo que en local no se veía: la CLI
   contestaba en JSON solo cuando la lanzaba un agente. `pruebas-vivas`, verde
   por primera vez: `1074 passed`. `ESTADO_F9 §9`.
2. **⚠️ El bot depende del secreto JWT heredado y de la clave `anon`.** Supabase
   retira las claves `anon` y `service_role` a finales de 2026 y tiene el
   secreto heredado como «no recomendado, por compatibilidad». Fuera de F9: toca
   `bot.ts`. Ver `ESTADO_F9 §3.4`.
3. **⚠️ Las funciones de Vercel corren en `iad1` (Washington)**, con Supabase en
   Frankfurt: los mensajes de los pacientes se procesan en Estados Unidos y cada
   consulta cruza el Atlántico. Decisión del punto 5 de F9.
   🟡 Decidido el 29/09: Frankfurt (`"regions": ["fra1"]` en `vercel.json`,
   PR #2). Se cierra al verlo en `X-Vercel-Id` después de publicar. Y
   `SUPABASE_SERVICE_ROLE_KEY`, quitada de Vercel por una persona.
   ✅ **Cerrado el 01/10/2026**, con la fusión del PR #2 (`aaefe04`):
   `cdg1::fra1` en la cabecera de dos rutas de función, y el despliegue que
   sirve es posterior al borrado de `SUPABASE_SERVICE_ROLE_KEY`. Y el
   proyecto, también en `fra1` desde el 01/10 (antes decía `iad1`): ya no
   depende solo de `vercel.json`. `ESTADO_F9 §11`.
4. **⚠️ El registro de usuarios de Auth en producción está abierto** (mirado el
   28/09). Decisión del punto 5 de F9. 🟡 **Decidido el 02/10: apagarlo.** Lo
   hace una persona en el panel de Supabase. `ESTADO_F9 §12`. ✅ **Cerrado el
   02/10**: leído en producción, `disable_signup: true` (antes, `false`).
5. ~~**🔴 En Meta no hay ningún webhook configurado**~~ ✅ Configurado y
   verificado el 28/09. Pero **la app de Meta no está publicada**, y hasta que
   lo esté Meta no entrega ningún mensaje real, ni de sus administradores.
   Punto 3 de F9, `ESTADO_F9 §7.2`.
6. **🟡 El guardián tira el error de `getUser()`.** Un «no» pasajero de Auth
   con un token válido (la misma cookie, rechazada y aceptada 0,2 s después)
   echó a una prueba a la Agenda y puso rojo el CI de `main` (run
   36904109929, `04-interruptor.spec.ts:87`). Falla cerrado; en producción
   sacaría a recepción a la Agenda. Fuera de F9, sin arreglar.
   `ESTADO_F9 §11.5`.
7. **🔴 El sitio publicado habla con la Supabase de desarrollo.** La ruta de
   salud, lanzada en producción el 01/10, dice `ggalkkeobyxpodbzlwzj`
   (desarrollo) y `ninguna_clinica`. `NEXT_PUBLIC_SUPABASE_URL` la usan el bot,
   el panel y el guardián. Nada escrito en desarrollo por producción (mapa
   vacío) y ningún paciente afectado. Arreglo: las cuatro variables de
   Supabase de Vercel con los valores de producción, y volver a publicar.
   Bloquea los puntos 2 y 3 de F9. `ESTADO_F9 §11.6`.
   ✅ **Arreglado el 01/10/2026**: variables cambiadas por una persona,
   publicado `dpl_H1oZ…`, y la ruta de salud dice `hzanffqxlpcorrucanxd`. La
   clave `anon` y el secreto se comprueban con el punto 2. `ESTADO_F9 §11.7`.
   ✅ Comprobados el 02/10: con la clínica de prueba, `al_dia` (`ESTADO_F9 §11.9`).
8. **🟡 La escucha en vivo de Vercel pierde líneas.** De las dos que escribe la
   ruta de salud de seguido llega una, y su `rowId` es la marca de tiempo en
   milisegundos. Lo más probable es que choquen. Una línea que no aparece no
   demuestra nada. Arreglo posible, sin hacer: una sola línea por resultado.
   `ESTADO_F9 §11.9`. Y del procesamiento del bot, en `after()`, no llegó
   ninguna con la escucha viva: para el bot manda la base. `ESTADO_F9 §11.10`.
9. **🟡 El CI no impide dos tiradas a la vez contra desarrollo entre ramas.**
   `concurrency.group` va por rama; fusionar con el CI del PR en marcha lanza el
   de `main` encima. Pasó el 02/10 con el PR #3 (tres rojos, ninguno del
   código; `main`, verde). Arreglo, sin hacer: un grupo común para
   `auditoria-de-fuga` y `pruebas-vivas`. Hasta entonces, se fusiona solo con
   el CI del PR terminado. `ESTADO_F9 §11.11`. 🟡 Hecho el 02/10 (grupo
   `base-de-desarrollo`, `queue: max`). GitHub lo acepta; falta ver que dos
   tiradas se esperan.

### Infraestructura

1. ~~El CI no impide mezclar: falta marcar el check obligatorio.~~
   ⚠️ **Reabierto y agravado en F7.** No falta marcarlo: en un repositorio
   privado con plan gratuito **no se puede marcar**. Ver el punto 2 de arriba.
2. La mitad viva no corre en CI: faltan `RLS_VIVA=true` y los cuatro secretos
   `SUPABASE_*_DEV`. **No hay ninguno configurado**, así que `auditoria-de-fuga`
   se pone roja — que es su diseño: no puede comprobar, luego no dice que todo
   esté bien.
   ✅ **F2 a F6 ya están empujados y el CI ha corrido**: `comprobaciones-estaticas`
   en verde (562 pasadas, `tsc`, `eslint` y `next build`), el primero desde F1.
   De paso cazó que la suite se ponía **roja por no tener entorno** en un clon
   nuevo, arreglado en el mismo empujón. Ver `ESTADO_F7` §7.4.
   ⚠️ **F8 no los ha puesto, y no por olvido:** los cuatro valores están en
   `.env.local`, que no se lee. Ponerlos exige teclearlos, y eso lo hace una
   persona. El procedimiento exacto (`gh secret set …`), en `ESTADO_F8` §7.2.
   ✅ **Puestos por una persona el 22/09 y el 27/09/2026**, y funcionando:
   `auditoria-de-fuga` sale verde con `FUGA_EXIGIDA=1`. `pruebas-vivas` ya
   corre, y se pone roja por otra causa: el SQL de mantenimiento pide un
   proyecto vinculado que el CI no tiene («Nuevo en F9», punto 1).
3. ~~**Las pruebas de navegador tampoco corren en CI.**~~ ✅ **Cerrado en F7.**
   `pruebas-vivas` las lleva, con `playwright install --with-deps chromium`,
   `pnpm test:e2e` y subida de trazas al fallar. No se añadieron a ciegas: se
   han visto correr (30 de 31, con el fallo del punto 4 de arriba).
4. **El horario del cron depende del plan de Vercel.** *(Nuevo en F6.)*
   `vercel.json` dispara `/api/cron/recordatorios` **cada hora**, y hay planes
   que solo admiten crons diarios. Si se publica en uno de esos hay que cambiar
   el horario a diario **y poner `RECORDATORIO_HORAS_ANTES=48`**; si no, las
   citas de dentro de entre 24 y 48 horas no reciben aviso. Está explicado en
   `.env.example`, que es donde alguien lo va a leer.
   ⚪ **Según el traspaso de F9, la cuenta es Pro y el cron de cada hora está
   registrado.** Pendiente de comprobarlo con el token de Vercel
   (`ESTADO_F9 §0`).
   🟡 **01/10/2026:** registrado y activo con `0 * * * *` en el despliegue que
   sirve (`ESTADO_F9 §11.3`). Que corra cada hora lo dirá una pasada vista en
   el registro.

### Una regla de operación que F5 amplía

**Una sola tirada a la vez contra la base de desarrollo** (ESTADO_F3 §5.4),
ahora contando también Playwright: siembra y limpia **el mismo fixture** que
Vitest. `pnpm test` y `pnpm test:e2e` a la vez se pisan.
