# Estado de F5 · El panel de la clínica

> **Para quien retome F5**, en una conversación nueva o dentro de seis meses.
> Fecha: 19 de septiembre de 2026. Rama: `f1-base-de-datos-y-rls`.
>
> **F5 está cerrada y verificada contra una base de datos real.** El panel
> tiene sus siete pantallas, `proxy.ts` guarda la puerta, y las pruebas dan el
> mismo número dos veces seguidas: **739 en Vitest** y **31 en Playwright**, que
> entra en juego por primera vez en todo el proyecto. La batería ha demostrado
> que **mira**: se dejó el panel sin guardián, se le abrió la mano al rol
> `lectura` y se desconectó el interruptor, y cada cosa se puso roja donde
> debía.
>
> **Hay un hallazgo que corrige a `.claude/CLAUDE.md`** y conviene leerlo antes
> que nada: en Next.js 16.3.5, `middleware.ts` **no se ignora en silencio**.
> Está en [§5.1](#51--el-guardián-del-panel). La regla no cambia; el motivo por
> el que se sostiene, sí.
>
> El apartado [§5 La prueba de que la prueba sirve](#5--la-prueba-de-que-la-prueba-sirve)
> es el que hay que leer si solo se va a leer uno.
>
> El contrato de abajo se escribió ANTES de tocar el primer archivo y **no se ha
> tocado después**, que es lo que exige `.claude/CLAUDE.md`. Lo que salió
> distinto está contado en §5, no corregido ahí arriba.
>
> Contexto previo: [PLAN.md](PLAN.md), [ESTADO_F4.md](ESTADO_F4.md),
> [ESTADO_F3.md](ESTADO_F3.md), [ESTADO_F2.md](ESTADO_F2.md),
> [ESTADO_F1.md](ESTADO_F1.md).

---

## 0 · El contrato, escrito ANTES de tocar el primer archivo

### ENTREGA

**La pieza que manda sobre todo lo demás:**

| Archivo | Qué hace |
|---|---|
| `src/proxy.ts` | **NUNCA `middleware.ts`.** Refresca la cookie de sesión y redirige a `/entrar` toda petición a `/panel` sin sesión. Marca su redirección con una cabecera propia, que es lo que permite probar que **el archivo que protege es el que Next lee** |

**El panel:**

| Archivo | Qué hace |
|---|---|
| `src/lib/panel/sesion.ts` | Sesión, rol y clínica desde `app_metadata`. `exigirSesion()`, `exigirEscritura()` |
| `src/lib/panel/consultas.ts` | Las lecturas de cada pantalla. **Ni un `.eq('clinica_id', …)`** |
| `src/lib/panel/acciones.ts` | Server Actions: estado de cita, mover cita, datos de contacto, cola de escalados y el toggle |
| `src/lib/panel/auditoria.ts` | El apunte de quién cambió qué y cuándo |
| `src/app/entrar/page.tsx` | Entrar y salir |
| `src/app/panel/…` | Agenda · fichas · conocimiento · escalados · conversaciones · observabilidad |
| `src/componentes/…` | Las piezas compartidas, incluido el interruptor de `publico` |

**Una migración, y solo añade:**

`supabase/migrations/…_auditoria_panel.sql` añade `auditoria_clinica_insert`.
Hoy `auditoria` solo tiene `auditoria_bot_insert` y `auditoria_clinica_select`:
el panel **no puede** dejar rastro sin esto. No modifica ninguna política
existente. **Aprobado explícitamente por el usuario antes de escribirla**, que
es lo que exige la lista de archivos protegidos.

### PRUEBA

```
pnpm test            # vitest, dos tiradas seguidas, mismo número
pnpm test:e2e        # playwright: el panel de verdad, en un navegador
pnpm typecheck
pnpm lint
```

Las cinco que el encargo exige por su nombre:

1. `/panel` sin sesión → redirección. **Y con `proxy.ts` renombrado a
   `middleware.ts`, esa prueba se pone ROJA.**
2. Un usuario `lectura` no ve los controles de escritura **Y ADEMÁS** su intento
   de escribir falla en la base. Las dos mitades.
3. Un usuario de la clínica A no ve ni una fila de la B por ninguna pantalla.
4. **El toggle de verdad:** apagar `publico` en una FAQ desde el panel y
   comprobar, con el cliente del bot, que esa fila deja de llegar al prompt
   montado. No que la columna cambió: que el modelo deja de verla.
5. Playwright entra en juego: está en el stack desde F0 y no lo ha usado
   ninguna fase.

Criterio de F1–F4, sin rebajarlo: **el mismo número dos veces seguidas**, y
haberla visto ponerse roja donde debe — al menos con el proxy renombrado, con
`lectura` escribiendo y con el toggle sin efecto.

### LÍMITES

- **El motor del bot (F3) y el canal (F4) son intocables.** Ni un archivo de
  `src/lib/bot/` ni de `src/lib/whatsapp/`. **F5 no manda ni un mensaje de
  WhatsApp.**
- No se tocan los tres clientes de Supabase, ni los bloques de
  `contenido/bloques/`, ni `sin_solape`, ni **ninguna política RLS existente**.
  La migración nueva solo añade una.
- **Nada usa `service_role`** en el panel. Solo la siembra de las pruebas, que
  es el único uso que admite `.claude/CLAUDE.md`.
- **No hay bandeja de respuesta humana.** Las conversaciones se leen y no se
  contesta. Decidido por el usuario.
- El conocimiento se lee y se conmuta. Editar el texto de una FAQ desde el panel
  no entra en esta fase.
- No entran F6 (trabajos programados), F7 (barandilla 4 con modelo real), F8
  (`alta-clinica`) ni F3b.

### SUPUESTOS

1. `app_metadata.rol` y `app_metadata.clinica_id` ya viajan firmados en el JWT
   de Supabase Auth: así los siembra F1 y así los leen las políticas.
2. `crearClienteServidor()` sirve tal cual para Server Components y Server
   Actions. Quien refresca la cookie es `proxy.ts`, como dice su propia
   cabecera desde F1.
3. La RLS de F1 es la garantía. El panel no la repite: la comprueba y avisa.
4. Playwright puede levantar la app contra el Supabase de desarrollo. Chromium
   ya está descargado.
5. Una sola tirada a la vez contra la base de desarrollo (ESTADO_F3 §5.4),
   **ahora también contando Playwright**: siembra y limpia el mismo fixture.

### FALLOS

Lo que se espera que salga mal, escrito antes de verlo:

1. **`middleware.ts` en vez de `proxy.ts`.** Next.js 16 lo ignora en silencio:
   sin error, sin aviso y sin ninguna prueba roja. El panel queda público.
   Prueba obligatoria, y hay que verla ponerse roja con el archivo renombrado.
2. **Esconder el botón se toma por garantía.** El usuario `lectura` escribe por
   la ruta que no pasa por el botón. Las dos mitades, como ESTADO_F3 §5.2.
3. **El panel repite `.eq('clinica_id', …)` «por prudencia»** y tapa una
   política de inquilino rota, igual que el `.eq('publico', true)` de F2.
4. **El toggle cambia la columna y el bot sigue diciendo la fila.** Comprobar la
   columna no prueba nada: hay que montar el prompt y mirar si el texto está.
5. **Un `UPDATE` que la RLS deja en cero filas y el panel dice «guardado».** Es
   el fallo número 4 de ESTADO_F1 §6, ahora por el lado del panel.
6. **La confirmación al encender enseña un texto distinto** del que pasaría a
   decirse de verdad.
7. **Una Server Action sin comprobar la sesión.** El propio doc de Next avisa:
   las Server Functions son POST a la ruta donde se usan, y un cambio de
   `matcher` las deja fuera del proxy sin que nadie lo note.
8. **El apunte de auditoría se firma con el nombre de otro.**

---

## 1 · Qué hay construido

### El guardián

`src/proxy.ts`, 150 líneas. **`proxy.ts`, nunca `middleware.ts`.** Hace tres
cosas y las tres importan:

| # | Qué hace | Qué impide |
|---|---|---|
| 1 | Refresca la sesión de Supabase y **escribe las cookies** | Que la sesión caduque cada hora. Es lo que `servidor.ts` dice desde F1 que haría este archivo: desde un Server Component no se pueden escribir cabeceras |
| 2 | Sin sesión, todo `/panel` se va a `/entrar?desde=…` | Un panel público |
| 3 | Marca su respuesta con `x-panel-guardia: proxy` | Que una prueba de redirección se quede verde con el guardián apagado. Ver §5.1 |

`getUser()` y **no** `getSession()`: `getSession` se fía de la cookie tal y como
llegó del navegador, que es un dato que manda el cliente; `getUser` valida el
token contra el servidor de Auth. En un guardián, esa diferencia es toda la
diferencia.

El `matcher` deja fuera `/api`: ahí vive el webhook de Meta, que se autentica
con la firma HMAC y no con una cookie (F4). Hay una prueba de navegador que
comprueba que el webhook **no** pasa por aquí.

### El panel

`src/lib/panel/`, ocho módulos, y `src/app/panel/`, siete pantallas.

| Archivo | Qué resuelve |
|---|---|
| `sesion.ts` | Quién eres, de qué clínica y qué puedes hacer. Todo de `app_metadata` |
| `guardia.ts` | La RLS filtra; esto comprueba de quién es lo que llegó y **avisa** |
| `consultas.ts` | Las lecturas de las siete pantallas. Ni un filtro de seguridad en la consulta |
| `acciones.ts` | Las cinco Server Actions. Toda escritura mira lo que devolvió la base |
| `auditoria.ts` | El apunte: quién, qué y cuándo. Nunca el contenido |
| `publico.ts` | El vocabulario del interruptor y el texto exacto que diría el bot |
| `formato.ts` | Fechas y horas **en la zona de la clínica**, y los enums en castellano |
| `entrada.ts` | Entrar y salir |

| Pantalla | Qué enseña |
|---|---|
| `/panel` | Agenda del día y de la semana. Recepción confirma, cancela, cierra y mueve |
| `/panel/escalados` | La cola de avisos: pendiente → en curso → resuelto, con quien lo resolvió |
| `/panel/conversaciones` | **Solo lectura.** El hilo, con ancla por mensaje |
| `/panel/fichas` | Pacientes. Solo se editan teléfono y correo |
| `/panel/conocimiento` | Tratamientos, FAQ y datos, **cada fila con su interruptor** |
| `/panel/observabilidad` | Los apuntes del contador, al lado de lo que hay de verdad |

Y una cosa que la pantalla de observabilidad **no** hace: enseñar un cero
cuando lo que pasa es que un apunte no lo dice. Un recuento que falta sale como
un guion. «El asistente vio 0 preguntas» y «este apunte no anotó cuántas vio»
son cosas distintas, y mezclarlas en la pantalla que existe para no tener que
fiarse de nadie sería justo lo contrario de lo que se pretende. La distinción la
dejó pedida F4 en `.env.example`, a cuenta del coste por token.

### La octava migración, que solo añade

`supabase/migrations/20260919120000_auditoria_panel.sql`. Ver §2.

### Cómo se escribe en el panel, en tres pasos que no se saltan

Toda Server Action hace lo mismo, en este orden:

1. **Vuelve a exigir sesión y rol.** No se fía de `proxy.ts` —el doc de Next
   avisa de que una Server Function es un POST a la ruta donde vive y de que un
   cambio de `matcher` la deja fuera sin avisar— ni del botón escondido, que no
   impide nada.
2. **Valida con Zod** lo que llega del formulario.
3. **Escribe con `.select()` detrás y comprueba que volvió la fila.**

El paso 3 es el que no se puede saltar. Cuando la RLS bloquea un `UPDATE` por su
`USING`, PostgREST **no devuelve un error**: devuelve cero filas y un 200. Sin
ese `.select()`, el panel diría «guardado» sin haber guardado nada — el fallo
número 4 de la lista de ESTADO_F1 §6, que hasta ahora no tenía dónde ocurrir
porque no había panel. Hay un test estático que exige que cada `.update(` lleve
su `.select(`.

---

## 2 · La decisión que no era obvia: el rastro no cabía

F5 pone el interruptor `publico` en manos de la clínica, y un cambio así tiene
que dejar escrito quién lo hizo. **Y no cabía.** `auditoria` tenía dos
políticas:

```
auditoria_bot_insert      -> solo el rol `bot`
auditoria_clinica_select  -> el panel LEE el rastro... y no puede escribirlo
```

Un `insert` desde el panel lo rechaza la RLS con `42501`. Las tres salidas:

| Salida | Por qué no / sí |
|---|---|
| Una función `SECURITY DEFINER` | ❌ Hay **cero** en todo el proyecto. Abrir un agujero para poder medir que no hay agujeros es justo lo que ESTADO_F2 §7 descartó para el contador |
| `service_role` desde el panel | ❌ Prohibido sin excepciones |
| Una política nueva que **solo añade** | ✅ |

`supabase/migrations/` está en la lista de «no tocar sin confirmación
explícita», **así que se pidió la confirmación antes de escribir una línea** y
se dio. La migración 008 no modifica, no reescribe y no relaja ninguna política
anterior: añade `auditoria_clinica_insert` y nada más.

### La tercera línea del `WITH CHECK` es la que importa

```sql
with check (
      (select autorizacion.puede_escribir())
  and clinica_id = (select autorizacion.clinica_id())
  and actor = (select auth.uid())::text   -- <- esta
);
```

`actor` queda clavado al usuario que tiene la sesión. Sin esa línea, recepción
podría anotar que el implante lo hizo público el propietario. **Un registro de
auditoría que se puede firmar con el nombre de otro no es un registro: es una
coartada.** Hay una prueba viva que lo intenta y se lleva un `42501`.

Lo que sigue igual: `auditoria` no tiene `UPDATE` ni `DELETE` para nadie —la 004
se los revoca al rol `authenticated`— así que el rastro **solo puede crecer**. Y
`lectura` sigue sin poder escribir, porque la condición es `puede_escribir()`.

### Y por eso el apunte no lleva el contenido dentro

Un apunte guarda `tabla`, `fila_id` y dos booleanos. No guarda la pregunta, ni
la respuesta aprobada, ni el valor de la clave. Dos motivos, los dos heredados:

1. **`auditoria` no la purga nadie.** `purgar_historial` se lleva
   conversaciones, mensajes, cargas de webhook y eventos; `auditoria` no está en
   la lista. Lo que se escriba aquí se queda para siempre. Es el mismo motivo
   por el que el aviso al equipo de F4 no lleva el síntoma dentro.
2. **Es la doctrina de `origen.ts` desde F2:** se nombra la fila, no se repite
   lo que hay dentro.

Hay una prueba de navegador que lo exige: el apunte **no** puede contener ni el
texto de la FAQ ni el marcador.

---

## 3 · El interruptor, que es la pieza seria de la fase

No es un checkbox más: es la superficie de control de la barandilla 1. Quien lo
mueve decide lo que el asistente puede decirle a un paciente por WhatsApp.

### 3.1 · La palabra `publico` no sale en ninguna pantalla

Se dice **«El asistente puede decir esto»** y **«Solo para el equipo»**.
`publico` es el nombre de una columna nuestra; quien está en el mostrador no
tiene por qué aprendérselo, y una etiqueta que ponga `publico` invita a pensar
que va de una página web.

### 3.2 · Encender pregunta. Apagar no. Y no es simétrico a propósito

Apagar quita algo de la boca del asistente: en el peor caso deja de decir un
horario y alguien llama por teléfono. Encender **se lo pone en la boca**, y en
el peor caso le cuenta a un paciente el margen de un implante.

Pedir confirmación para las dos cosas enseña a darle a «aceptar» sin leer, y
entonces se pierde la que importa. Hay una prueba de navegador que exige que
apagar **no** pregunte: si algún día alguien «mejora» el flujo haciéndolo
simétrico, se pone roja.

### 3.3 · La confirmación enseña el texto exacto, palabra por palabra

Sale de la **misma columna** que lee el montador del prompt de F2
(`respuesta_aprobada` para la FAQ, `frase_bot` para un tratamiento, `valor` para
un dato). No un resumen, no las primeras palabras: si lo que se enseña no es lo
que se va a decir, la confirmación es un trámite. Hay una prueba que compara el
texto del cuadro con el de la base, carácter a carácter.

### 3.4 · El cambio no se queda sin rastro, y si no puede haberlo se deshace

Si el apunte de auditoría falla, la acción **revierte el cambio** y lo dice.
Cuesta una escritura más y es deliberado: cambiar lo que el bot puede decir sin
que quede escrito quién fue es exactamente lo que esta fase viene a impedir. Si
ni siquiera se puede deshacer, el mensaje lo dice con todas las letras en vez de
fingir que todo fue bien.

---

## 4 · La prueba de las dos tiradas

El criterio de F1, F2, F3 y F4, sin rebajarlo. Salida real, pegada tal cual:

```
===== VITEST · TIRADA 1 =====        ===== VITEST · TIRADA 2 =====
 Test Files  30 passed | 1 skipped   Test Files  30 passed | 1 skipped (31)
      Tests  739 passed | 5 skipped       Tests  739 passed | 5 skipped (744)
   Duration  67.86s                    Duration  67.48s

===== PLAYWRIGHT · TIRADA 1 =====    ===== PLAYWRIGHT · TIRADA 2 =====
  31 passed (48.8s)                    31 passed (49.5s)
```

El archivo saltado y las 5 pruebas saltadas siguen siendo `tests/bot-contrato/`,
que no corre sin `GEMINI_VIVO=1`. Es lo que decidió ESTADO_F3 §1.

```
pnpm exec tsc --noEmit   -> exit 0
pnpm lint                -> exit 0
pnpm build               -> exit 0, y la salida lista «ƒ Proxy (Middleware)»
```

### Lo que aporta F5

| | Antes de F5 | F5 | Total |
|---|---|---|---|
| Vitest | 707 | **+32** | 739 |
| Playwright | — | **+31** | 31 |

| Archivo nuevo | Pruebas | Necesita |
|---|---:|---|
| `tests/panel/01-sin-filtro-en-el-panel.test.ts` | 8 | nada |
| `tests/panel/02-proxy-en-su-sitio.test.ts` | 8 | nada |
| `tests/panel-vivo/01-roles-y-aislamiento.test.ts` | 16 | Supabase |
| `tests/e2e/01-proxy.spec.ts` | 13 | Supabase + navegador |
| `tests/e2e/02-roles.spec.ts` | 6 | Supabase + navegador |
| `tests/e2e/03-aislamiento.spec.ts` | 4 | Supabase + navegador |
| `tests/e2e/04-interruptor.spec.ts` | 6 | Supabase + navegador |
| `tests/e2e/05-escalados.spec.ts` | 2 | Supabase + navegador |

**16 de las 32 nuevas de Vitest corren en una máquina recién clonada**, así que
el trabajo `comprobaciones-estaticas` de CI las cubre sin credenciales de nada.

**`pnpm test` sigue sin llamar a Gemini, ni a Meta, ni a Deepgram.** Playwright
tampoco: levanta la aplicación y habla con Supabase, y nada más.

### Playwright, por fin

Está en el stack desde F0 y no lo había usado ninguna fase. Entra aquí porque
F5 trae dos cosas que **no se pueden comprobar de otra forma**: que el archivo
que protege el panel es el que Next lee de verdad, y que el interruptor llega
hasta el prompt del modelo pasando por la pantalla.

Se **compila y se arranca** (`next build && next start`), no se usa `next dev`:
lo que se prueba es el artefacto que se publica. Una prueba de autenticación que
solo vale «en desarrollo» no vale.

---

## 5 · La prueba de que la prueba sirve

Que la suite corra demuestra que corre. Solo verla ponerse roja donde debe
demuestra que mira. Las tres garantías que pedía el encargo, rotas a propósito,
con la restauración atada a la misma orden (la lección de F1 §5.1).

### 5.1 · El guardián del panel

**Aquí está el hallazgo de la fase, y no salió lo que se esperaba.**

El encargo decía: renombra `proxy.ts` a `middleware.ts` y la prueba tiene que
ponerse roja, porque «en Next.js 16 `middleware.ts` se ignora en silencio y las
rutas quedan públicas». Se hizo. **No se puso roja.** Esto es lo que salió:

```
[WebServer] ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
[WebServer] ✓ Compiled successfully in 1067ms
[WebServer] ƒ Proxy (Middleware)

  13 passed (17.8s)
```

En **Next.js 16.3.5**, el convenio viejo está **deprecado pero sigue
ejecutándose**, y además avisa por consola. El panel no se quedó abierto.

**La regla no cambia, y el motivo por el que se sostiene es más fuerte que
antes:** «deprecado» significa que Next lo va a retirar, y el día que lo haga el
guardián dejará de correr **sin romper ninguna compilación** y sin poner roja
ninguna prueba que mire solo la redirección. Eso sí sería silencioso.

Lo que hay que corregir es la frase, no la norma. Está anotado en §8.1, junto
con los dos sitios del repositorio que hoy la repiten.

**Qué sí se puso rojo con el renombrado.** `tests/panel/02-proxy-en-su-sitio`,
en cinco sitios, que es hoy el único que caza ese cambio:

```
 × src/proxy.ts existe
   AssertionError: Sin src/proxy.ts el panel se queda sin guardian: expected false to be true
 × no hay ningun src/middleware.ts
 × exporta una funcion `proxy`, que es el nombre que Next busca
 × protege /panel y deja fuera /api
 × pone su marca, que es lo que hace comprobable todo lo demas
      Tests  5 failed | 3 passed (8)
```

**Y la prueba de verdad: sin ningún guardián.** Se quitó `src/proxy.ts` entero:

```
  ok  1 › pedir /panel sin sesion acaba en /entrar (245ms)      <- VERDE
  ...
    Error: expect(received).toBe(expected)
    Expected: "proxy"
    Received: undefined
    > 72 |  expect(respuesta.headers()['x-panel-guardia']).toBe('proxy')

  10 failed | 3 passed
```

**Lo que hay que mirar es el primer renglón.** Con el panel sin guardián de
delante, «pedir /panel sin sesión acaba en /entrar» **siguió en verde**, porque
redirige el `layout.tsx` del panel. Una prueba escrita así —la obvia, la que
cualquiera escribiría— habría certificado un guardián que no existe. Las diez
que se pusieron rojas son las que exigen la cabecera `x-panel-guardia`.

Eso es exactamente para lo que existe esa cabecera, y es la respuesta al
encargo: la forma de saber que el archivo que protege es el que Next lee no es
mirar si redirige, es mirar **quién** redirigió.

### 5.2 · El rol `lectura`, por sus dos mitades

**Mitad de la pantalla.** Se le abrió la mano en `sesion.ts`
(`puedeEscribir()` pasa a incluir `lectura`) y se lanzaron las pruebas de roles:

```
  4 failed
  2 passed (1.1m)

  1) en la pantalla del interruptor no hay ni un boton
     Expected: 0   Received: 3
  2) en la agenda tampoco puede mover ni cancelar
     Expected: 0   Received: 1
  3) en la cola de avisos tampoco
  4) en una ficha ve los datos de contacto pero no puede editarlos
```

**Mitad de la base.** Es la que de verdad protege, y la que se comprueba sin
navegador. Se apuntó el probador al usuario de recepción, la misma técnica con
la que ESTADO_F1 §5.2 diagnosticó su falso verde:

```
 × LECTURA: apagar el interruptor de una FAQ no cambia nada
   AssertionError: expected [ Array(1) ] to deeply equal []
 × LECTURA: tampoco puede cambiar el estado de una cita
 × LECTURA: tampoco puede tocar la cola de avisos
 × LECTURA: tampoco puede dejar un apunte de auditoria
   AssertionError: expected undefined to be '42501'
      Tests  5 failed | 11 passed (16)
```

Recepción **sí** escribe y `lectura` **no**: el `[Array(1)]` contra `[]` es la
diferencia, y demuestra que esas aserciones distinguen un permiso y no una
ausencia. Es la trampa que F1 dejó documentada: una aserción negativa cuya única
prueba es una lista vacía pasa igual si la fila no existe.

### 5.3 · El interruptor sin efecto, por dos caminos

**Camino 1: la acción no escribe.** Se desconectó `cambiarPublico` (hace el
`select` y se salta el `update`):

```
  4 failed
  2 passed

  1) APAGAR UNA FAQ DESDE EL PANEL LA BORRA DEL PROMPT DEL BOT
     Expected: "no"   Received: "si"
```

**Camino 2, el que importa: la columna cambia y el modelo lo sigue viendo.**
Este es el escenario que el encargo describe —«si solo se comprueba que la
columna cambió, no se ha probado nada»— y para montarlo hay que tirar las dos
barandillas a la vez, acotadas a `faq`: la política deja de filtrar (cliente de
servicio solo para esa tabla) y la guardia en código deja de retener. Es la
CAPA 2 de ESTADO_F2 §5.1:

```
  1) APAGAR UNA FAQ DESDE EL PANEL LA BORRA DEL PROMPT DEL BOT

    Error: La columna habra cambiado, pero el texto sigue llegando al modelo:
           eso es tener el interruptor sin conectar a nada.

    expect(received).not.toContain(expected)
    Expected substring: not "En la calle Mayor 1."
    Received string:  "EL PRIMER MENSAJE DE CADA CONVERSACIÓN ...
```

La aserción que se pone roja es **la del prompt montado**, no la de la pantalla.
Eso es lo que demuestra que la prueba mide la cadena entera y no el `update`.

**Un intento anterior no sirvió, y conviene contarlo.** Al principio se simuló
la fuga dándole al bot un cliente de servicio para TODO, y lo que saltó fue
otra cosa:

```
Error: El bot de la clinica ed749fa5-... no ha recibido exactamente su clinica
y solo la suya (recibidas 2, suyas 1). Sin ese dato no se monta ningun prompt.
```

El cerrojo de inquilino de `filtro.ts` disparó antes de llegar a la FAQ —
exactamente lo que le pasó a F2 y está escrito en su §5.1. Por eso la simulación
buena está acotada a una sola tabla.

### 5.4 · Dos falsos verdes propios, y los dos del mismo tipo

**El primero, cazado al romper otra cosa.**

Mientras se veía la batería de roles en rojo (§5.2), **tres pruebas se pusieron
rojas y una se quedó verde sin derecho**: «en una ficha ve los datos de contacto
pero no puede editarlos».

Estaba comprobando que no había formulario de contacto… **en la lista de
pacientes**, donde no lo hay nunca. El `page.click()` sobre el enlace no
esperaba a la navegación, así que la aserción corría antes de llegar a la ficha.
Verde por ausencia, no por permiso: ESTADO_F1 §5.2 otra vez, ahora en un
navegador.

El arreglo es una línea —`await page.waitForURL(/\/panel\/fichas\/…/)` y exigir
que el teléfono esté a la vista antes de mirar nada— y con ella la prueba pasa a
ponerse roja cuando toca: de 3 fallos a 4.

**Esto salió solo porque se rompió algo a propósito.** Corriendo en verde no
había forma de distinguirla de una prueba buena.

**El segundo, cazado porque la prueba nació roja.** Al escribir la de la cola de
avisos, la espera después de pulsar «Resuelto» era:

```ts
await expect(page.locator('body')).toContainText('Resuelto')
```

y se cumplía **al instante**, porque «Resuelto» es también el rótulo del botón
que se acababa de pulsar. La espera no esperaba a nada, la lectura de la base
corría antes que la escritura, y el test falló:

```
  > 90 |       expect(fin.estado).toBe('resuelto')
  1 failed
```

Falló por suerte: si la Server Action hubiera ido un poco más rápida, habría
pasado y se habría quedado ahí para siempre, verde y sin comprobar nada. El
arreglo es esperar por algo que **solo existe cuando el cambio ya está hecho**
—el botón «Volver a abrir», que solo se pinta si el aviso está resuelto—.

**La regla, generalizada, que vale para toda prueba de navegador:** esperar por
un texto que ya estaba en la pantalla antes de la acción no es esperar. Hay que
esperar por algo que la acción crea.

---

## 6 · El guardián del panel, con el alcance medido

ESTADO_F4 §6 dejó dicho que el guardián estático de
`tests/barandillas/04-sin-filtro-en-codigo.test.ts` cubre todo archivo que
nombre `crearClienteBot` o el tipo `ClienteDelBot`. **El panel usa otros
clientes**, así que la pregunta era si entraba solo. Se listaron los dos
alcances en vez de suponerlo:

```
CAMINO DEL BOT   (12):            CAMINO DEL PANEL (10):
   barandillas/contador.ts           panel/acciones.ts
   barandillas/filtro.ts             panel/auditoria.ts
   barandillas/montaje.ts            panel/consultas.ts
   barandillas/origen.ts             panel/entrada.ts
   bot/cerebro.ts                    panel/formato.ts
   bot/herramientas.ts               panel/guardia.ts
   bot/validacion.ts                 panel/publico.ts
   supabase/bot.ts                   panel/sesion.ts
   whatsapp/agrupar.ts               supabase/navegador.ts
   whatsapp/almacen.ts               supabase/servidor.ts
   whatsapp/procesar.ts
   whatsapp/ventana.ts

EN LOS DOS ALCANCES: ninguno
```

**No entra solo, y no debía entrar.** Así que F5 trae un guardián hermano,
`tests/panel/01-sin-filtro-en-el-panel.test.ts`, con **su propio motivo**:

- **`clinica_id`** · Es el fallo de F2 por el lado del panel: si una consulta
  repite el inquilino, el día que esa política ceda el panel seguirá enseñando
  lo de siempre y nadie se enterará.
- **`publico`** · Aquí el motivo es distinto y es de producto: el panel **tiene**
  que ver las filas confidenciales, porque para decidir qué puede decir el bot
  hay que poder ver lo que hoy no dice. Una consulta que filtrara por `publico`
  le escondería a la clínica justo las filas que tiene que gobernar.

Y una prueba que **lista los dos alcances y exige que no se pisen**: si algún
día alguien amplía el 04 y el panel entra, se pone roja y avisa de que hay dos
guardianes opinando sobre el mismo archivo con motivos distintos.

El detector se sacó a `tests/ayuda/detector.ts` para que lo usen los dos. **No
se copió**: dos copias de un detector se separan a la primera mejora y la que se
quede vieja sigue dando verde sin que nadie note que ya no mira lo mismo. El
recuento del 04 no se movió: 16 antes, 16 después.

`service_role` no hizo falta comprobarlo aquí: `tests/rls/05` recorre `src/`
entero y cubre el panel desde el primer día.

---

## 7 · Formas de que esto «funcione» sin servir

| Cómo se falsea | Qué lo impide |
|---|---|
| El panel se protege con `middleware.ts` y se cree protegido | §5.1 · La cabecera `x-panel-guardia`, y un test estático que prohíbe que ese archivo exista |
| La prueba de acceso mira solo la redirección | §5.1 · Medido: sin guardián, esa prueba **sigue verde** porque redirige el layout |
| Esconder el botón se toma por garantía | §5.2 · Las dos mitades, y la de la base corre sin navegador |
| El toggle cambia la columna y el bot sigue diciendo la fila | §5.3 · La aserción final es sobre el **prompt montado**, no sobre la columna |
| La confirmación enseña un texto distinto del que se diría | Se compara con la columna de la base, carácter a carácter |
| Un `UPDATE` devuelve cero filas y el panel dice «guardado» | Todo `.update(` lleva su `.select(` y se comprueba. Hay un test estático que lo exige |
| El panel repite un predicado que ya aplica la RLS | §6 · Guardián propio, con su alcance medido |
| El apunte de auditoría se firma con el nombre de otro | §2 · `actor = auth.uid()` en el `WITH CHECK`, y una prueba que lo intenta |
| El rastro copia dentro lo que se ha cambiado | Solo `tabla`, `fila_id` y dos booleanos. Hay prueba de que ni el texto ni el marcador salen |
| El aislamiento se prueba con `anon` | El probador es un `authenticated` de la otra clínica (ESTADO_F1 §5) |
| Las pruebas de aislamiento pasan porque el panel no enseña nada | Su pareja: el panel de A **sí** ve lo suyo, y ve su fila confidencial |
| Una prueba de navegador se queda verde por no esperar a la navegación | §5.4 · Pasó de verdad, y se arregló |
| Una espera se cumple con un texto que ya estaba antes de la acción | §5.4 · Pasó otra vez, con el rótulo de un botón. Se espera por algo que la acción **crea** |
| El enlace del aviso lleva a la conversación pero no al mensaje | `tests/e2e/05` exige el ancla `#mensaje-<id>` y que el texto del paciente esté a la vista |
| `resuelto_por` se rellena con lo que diga el navegador | Sale de la sesión, y la prueba compara con el uuid del usuario que entró |

---

## 8 · Lo que queda pendiente

> **Esta lista tiene dos copias: aquí y en [PLAN.md](PLAN.md) §11.** Es la regla
> de ESTADO_F3 §8 y ESTADO_F4 §8: con F1 casi se pierde un pendiente porque
> vivía solo en su `ESTADO_*.md`. **Si se toca una, se toca la otra.**

### 8.1 · Hay que corregir la frase de `middleware.ts` en dos sitios

**Es nuevo de F5 y sale de §5.1.** La afirmación «en Next.js 16 `middleware.ts`
se ignora en silencio y las rutas quedan públicas sin ningún error» **no es
cierta en 16.3.5**: está deprecado, avisa y se sigue ejecutando.

La **regla no cambia** —`proxy.ts`, nunca `middleware.ts`—, pero la frase que la
justifica está escrita en cuatro sitios. Listados por `grep`, no de memoria:

| Dónde | Estado |
|---|---|
| `PLAN.md` §6 | ✅ **Corregido en F5**, con la medición y un puntero aquí |
| `.claude/CLAUDE.md`, línea 56 | ⏳ Son las reglas del proyecto, y el precedente de ESTADO_F3 §7.1 es pedirlas antes de tocarlas |
| `src/lib/supabase/servidor.ts`, línea 40 | ⏳ Es uno de los **tres clientes protegidos**: no se toca sin confirmación explícita |
| `ESTADO_F1.md`, líneas 80 y 477 | ⏳ **No se retoca.** Un `ESTADO_*` cerrado es el registro de lo que se sabía entonces; corregirlo por dentro borraría que aquello se creyó. Para eso está este apartado |

Redacción propuesta, para cuando se apruebe: «`proxy.ts`, **nunca**
`middleware.ts`: el convenio viejo está deprecado desde Next.js 16 y, cuando lo
retiren, el guardián dejará de ejecutarse sin romper ninguna compilación. Hoy
(16.3.5) todavía corre, con un aviso».

### 8.2 · El panel no tiene bandeja de respuesta humana, y es a propósito

Decidido por el usuario y repetido en cada fase. Las conversaciones se leen y no
se contesta. **No hay ni un botón apagado**: un botón que no hace nada promete
algo que no existe.

### 8.3 · Lo que el panel no deja editar todavía

El conocimiento **se lee y se conmuta**; el texto de una FAQ o de un tratamiento
no se edita desde el panel. Los bloques de prompt tampoco se ven. No entraba en
el encargo de F5 y no se ha improvisado; entra el día que una clínica lo pida.

### 8.4 · Los tres de `alta-clinica` (F8) siguen abiertos

Sin cambios respecto a ESTADO_F4 §8.1 y §8.5:

1. **`WHATSAPP_CLINICAS` + redespliegue.** Dar de alta una clínica no es solo
   insertar filas: hay que añadir el par `"<phone_number_id>": "<clinica_id>"` a
   la variable de entorno **y volver a publicar**. Es un coste operativo.
2. **`mensaje_urgencia`** en `config`: no existe en ninguna parte del
   repositorio, así que al escalar el paciente recibe el mensaje por defecto.
3. **`politica_privacidad`** en `config`: lo usa el bloque «05 - Aviso inicial».

**F5 añade un cuarto, y es suyo:** dar de alta una clínica tiene que crear
también **sus usuarios del panel**, con `rol` y `clinica_id` en `app_metadata`.
Hoy los únicos usuarios que existen los crea la siembra de las pruebas. Sin eso,
la clínica tiene panel y no tiene con qué entrar.

### 8.5 · F3b y la barandilla 4 siguen aparcados

Sin cambios respecto a ESTADO_F3 §8.1 y §8.2. F5 no los ha tocado.

### 8.6 · Los dos pendientes de infraestructura siguen abiertos

1. El CI no impide mezclar: falta marcar `comprobaciones-estaticas` como check
   obligatorio en Settings → Branches.
2. La mitad viva no corre en CI: faltan `RLS_VIVA=true` y los cuatro secretos
   `SUPABASE_*_DEV`.

**F5 añade un tercero:** las pruebas de navegador tampoco corren en CI. Cuando
se resuelva el punto 2, el trabajo `rls-viva` puede llevarlas con dos pasos más
(`pnpm exec playwright install --with-deps chromium` y `pnpm test:e2e`). No se
han añadido a ciegas: un paso de CI que nadie ha visto correr es otra forma de
creerse cubierto.

### Limitaciones conocidas

- **Una sola tirada a la vez contra la base de desarrollo.** La regla de
  ESTADO_F3 §5.4 ahora incluye Playwright, que siembra y limpia **el mismo
  fixture** que Vitest. Lanzar `pnpm test` y `pnpm test:e2e` a la vez hace que
  el que acabe primero le borre las clínicas al otro.
- **La agenda no pagina.** Con la semana de una clínica pequeña sobra; el día
  que una tenga cuatro gabinetes llenos habrá que medirlo.
- **Mover una cita conserva su duración y no deja elegir gabinete.** Si el
  hueco choca, la base lo rechaza con `sin_solape` y el panel lo dice en
  castellano. Elegir sillón es trabajo de otra pantalla.
- **El panel no enseña los bloques de prompt.** Se ven sus efectos en «Lo que ve
  el asistente», pero el texto no. Son contenido protegido y editarlos desde el
  panel es una decisión que no toca aquí.
- **«No cuadra» en observabilidad es informativo, no una alarma.** Casi siempre
  significa que la clínica ha cambiado algo después de la última vez que el
  asistente contestó. Se explica en la propia pantalla.
- **Playwright corre solo en Chromium.** Es el navegador del mostrador en la
  práctica; añadir Firefox y WebKit multiplicaría por tres una suite que hoy
  tarda 45 segundos, sin comprobar nada nuevo sobre la seguridad.

---

## 9 · Lo que F5 cambió de F1–F4

**Ni una política RLS existente, ni `sin_solape`, ni un bloque de
`contenido/bloques/`, ni los tres clientes de Supabase, ni un archivo de
`src/lib/bot/` ni de `src/lib/whatsapp/`.** El motor y el canal están intactos:
**F5 no manda ni un mensaje de WhatsApp.**

Lo que sí se tocó, y por qué:

| Archivo | Cambio | Por qué |
|---|---|---|
| `supabase/migrations/…_auditoria_panel.sql` | **Nuevo.** Solo añade `auditoria_clinica_insert` | §2. Pedido y confirmado antes de escribirlo |
| `tests/rls/00-rls-activada.test.ts` | «siete migraciones» → «ocho» | La lista es exacta a propósito: una migración nueva tiene que pasar por aquí |
| `tests/barandillas/04-sin-filtro-en-codigo.test.ts` | El detector y el alcance se leen de `tests/ayuda/detector.ts` | §6. Se mueven, no se copian. **16 pruebas antes y 16 después** |
| `tests/ayuda/detector.ts` | **Nuevo.** El detector y los dos alcances | §6 |
| `scripts/sembrar-bloques.mjs` | La lectura de la carpeta se va a `scripts/bloques-a-filas.mjs` y se reexporta | Ver abajo |
| `src/app/layout.tsx`, `page.tsx`, `globals.css`, `tailwind.config.ts` | El armazón de `create-next-app` pasa a ser el del panel | §10 |
| `package.json` | `test:panel`, `test:panel-vivo`, `test:e2e`, `test:e2e:ui` | — |
| `.env.example` | Dice que el panel **no necesita ninguna variable nueva** | Lo exige `.claude/CLAUDE.md` |

### El corte de `sembrar-bloques.mjs`, que no era cosmético

`sembrar-bloques.mjs` termina con un `if (import.meta.url === …)` para correr
solo cuando se ejecuta como script. Está bien ganado —el comentario de allí
cuenta el problema de Windows que lo motivó— pero **`import.meta` solo existe en
un módulo ESM**, y Playwright transpila a CJS lo que importan sus pruebas:

```
SyntaxError: Cannot use 'import.meta' outside a module
   at ..\ayuda\siembra.ts:15
```

La siembra del panel en navegador no podía arrancar. **La alternativa era
relajar esa guarda; no se hizo.** Se parte en dos: el script de alta sigue
siendo un script de alta, con su `service_role` y su guarda intacta, y la
lectura de la carpeta —que no necesita ninguna de las dos cosas— vive en
`scripts/bloques-a-filas.mjs` y la importan las pruebas. Comprobado después:
`pnpm bloques` sin argumentos sigue imprimiendo su uso y saliendo con 1.

### Y una cosa que se quitó porque era falsa

Las consultas del panel llevaban tres `as unknown as` con un comentario que
culpaba a las claves foráneas compuestas de la migración 007. **Se quitó el cast
para ver si hacía falta y no hacía falta:** el problema real era que las listas
de columnas estaban partidas con `+`, y `supabase-js` deduce la forma de la
respuesta del literal. Con la lista entera en una línea no queda **ni un cast**
en el archivo y el compilador comprueba de verdad lo que trae cada embebido.

Un comentario equivocado sobrevive mucho más que un cast, así que se cambió por
el motivo de verdad.

---

## 10 · El aspecto, y la skill que se eligió

Se usó **`minimalist-ui`**, una de las dos que ofrecía el encargo, **sin
mezclar** con `frontend-design`. El motivo: un panel de clínica es una
herramienta de trabajo que se mira ocho horas al día con un paciente esperando
delante. Ahí la legibilidad gana a la personalidad.

Lo que se sigue de la guía: monocromo cálido (hueso `#F7F6F3`, tinta `#111111`,
apagado `#787774`), **una sola línea de 1px** para todo, esquinas de 6-8 px,
cuatro pasteles muy lavados y solo con significado, cero degradados y cero
sombras. Tipografía con contraste: Newsreader para los títulos de pantalla,
Geist Sans para los datos y Geist Mono para horas, identificadores y recuentos,
que así se comparan en columna.

**Dos desviaciones, las dos deliberadas y las dos anotadas:**

1. **Los iconos son de Lucide**, que la guía desaconseja. Manda
   `.claude/CLAUDE.md`, que lo fija en el stack, y además ya estaba instalado:
   añadir otra familia por estética sería meter una dependencia para desobedecer
   al proyecto. Van todos con el mismo grosor de trazo.
2. **El aire es de herramienta, no de portada.** La guía pide `py-24`/`py-32`
   entre secciones; con eso, recepción tendría que hacer scroll para ver la
   segunda cita del día. Se mantiene el aire dentro de cada caja y se recorta
   entre ellas.

Un solo tema, claro. Sin modo oscuro: media pantalla en oscuro y media en claro
es peor que cualquiera de las dos enteras, y aquí no hay a quién preguntarle.

Y el idioma, en todas las pantallas: **castellano de España y el vocabulario del
cliente**. Dentro se llaman `escalados` y `eventos`; en la pantalla se llaman
«Avisos» y «Lo que ve el asistente». Nadie en un mostrador tiene por qué
aprenderse cómo llamamos nosotros a nuestras tablas.

---

## 11 · Reglas del proyecto que siguen mandando

- **No tocar sin confirmación explícita:** las políticas RLS de
  `supabase/migrations/`, los bloques de `contenido/bloques/`, el constraint
  `sin_solape`, y los tres clientes de Supabase. **F5 pidió permiso para la
  única cosa que necesitaba —una política nueva en `auditoria`— y no tocó nada
  más.**
- **`proxy.ts`, nunca `middleware.ts`.** Ver §5.1 para el motivo corregido.
- Nada del panel usa `service_role`. Solo la siembra de las pruebas.
- **La RLS filtra; el código comprueba y avisa.** Ninguna consulta del panel
  repite un predicado de seguridad (§6).
- `app_metadata`, nunca `user_metadata`.
- Toda escritura del panel mira lo que devolvió la base antes de decir
  «guardado».
- Una sola tirada a la vez contra la base de desarrollo, **contando también
  Playwright**.
- `pnpm`, nunca `npm` ni `yarn` (ESTADO_F1 §5.1).
- Todo lo que lee la clínica, en castellano de España y con su vocabulario:
  publicar, valores secretos, preparar, lanzar.
