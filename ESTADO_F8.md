# ESTADO F8 · `alta-clinica` y la entrega

> **Lo que entrega esta fase en una frase:** dar de alta una clínica pasa de ser
> cinco cosas que alguien tiene que recordar a ser **un procedimiento de tres
> comandos y un paso manual con su comprobación**, y el acta que lo cierra **no
> dice «apto»**: dice cuatro de cinco y cuál falta.

Fecha: 21/09/2026, cerrada el 22/09/2026 · Rama `f1-base-de-datos-y-rls`

---

## ✅ VERIFICADO · el `thought_signature` contra Gemini de verdad

**22/09/2026, 15:39.** La cuota reseteó y la llamada real se hizo. El arreglo
de F7 (`ESTADO_F7` §4.1) **está confirmado contra `gemini-3.6-flash`**, sin
doble y sin caché. Cómo se llegó hasta aquí, y lo que se encontró por el
camino, en §7.1 — que ya no es un pendiente sino el relato del arreglo.

    GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato/02-bucle-herramientas

     Test Files  1 passed (1)
          Tests  1 passed (1)
       Start at  15:39:27
       Duration  25.83s (tests 90%, import 9%)

Verde **dos veces seguidas** (15:39:27 y 15:40:52), y visto en **rojo** con la
firma quitada, en la misma orden que lo restaura.

⚠ **Pero el primer intento salió rojo, y no por el código.** La prueba de
contrato armaba la vuelta 2 **a mano**: el arreglo de F7 había entrado en el
bucle de `cerebro.ts` y no en esa copia, así que la prueba llevaba desde F7
diciendo que el bot estaba roto cuando no lo estaba. Es la lección de F7 al
derecho —una prueba que copia al llamante comprueba a la copia— y de ahí sale
el único cambio de código de esta sesión: `turnoConLasLlamadas()`. §7.1.

**Gate de F9 levantado.** El bucle de herramientas contra Gemini 3 funciona: la
segunda vuelta —la que hace que una cita se llegue a coger— entra.

---

## 1 · El contrato de cinco campos

**ENTREGA**

| Archivo | Qué es |
|---|---|
| `scripts/ficha.mjs` | Lee y **valida** la ficha del alta. Puro: ni red ni base. Es lo único del alta que corre en CI |
| `scripts/alta-clinica.mjs` · `pnpm alta` | El alta entera: clínica, gabinetes, horarios, tratamientos, FAQ, `config`, bloques de prompt y **usuarios del panel** |
| `scripts/comprobar-alta.mjs` · `pnpm alta:comprobar` | El lanzador del acta y su veredicto |
| `scripts/usuarios.mjs` | Quitar `rol` y `clinica_id` de `user_metadata` **de verdad** (§5.1). Lo usa el alta |
| `tests/alta/04-usuarios-del-panel.test.ts` | 9 pruebas de lo anterior: 5 puras y 4 contra Supabase. Van en `pnpm test` |
| `vitest.alta.mts` | La configuración del acta. **Sin `globalSetup`**, que es la razón de que exista |
| `tests/alta/01-ficha.test.ts` | 29 pruebas del validador. Van en `pnpm test` |
| `tests/alta/02-acta.comprobacion.ts` | El acta: los cuatro puntos comprobables + la barandilla 4 con los datos de esa clínica |
| `tests/alta/03-plantillas.comprobacion.ts` | El punto 5: el orden de los parámetros, y el centinela que se manda de verdad |
| `tests/ayuda/indiscreto.ts` | El peor modelo posible, sacado de `tests/fuga/` para que el acta use **el mismo**, no una copia |
| `fichas/ejemplo.json` | La plantilla de la ficha, con filas confidenciales de muestra |
| `entregas/alta-de-una-clinica.md` | El procedimiento. Es **el** documento de la fase |
| `entregas/plantillas-meta.md` | El punto 5, que no se puede comprobar desde el código |
| `.claude/commands/alta-clinica.md` · `entregar.md` | Auditados y actualizados (§2) |

**PRUEBA**

1. `pnpm alta fichas/alta-demo.json` contra la base de desarrollo, con una
   clínica **que no existía** — que es el único caso que demuestra algo.
2. `pnpm alta:comprobar alta-demo` en verde, dos veces seguidas con el mismo
   número.
3. **Dieciséis demostraciones en rojo**, cada rotura con su restauración en la
   misma orden (`trap … EXIT`).
4. `pnpm lint`, `pnpm exec tsc --noEmit`, la suite entera dos veces y
   `pnpm test:e2e`.

Salida real en §6.

**LÍMITES**

- No se despliega nada: eso es F9. El acta comprueba `WHATSAPP_CLINICAS` **en el
  entorno de la máquina donde corre**, y lo dice con todas las letras.
- El punto 5 (plantillas de Meta) **no se puede comprobar desde el código**. Se
  entrega como procedimiento manual con un centinela que lo hace imposible de
  pasar por alto.
- No se toca ninguna migración, ningún bloque de prompt, ni los tres clientes de
  Supabase, ni `sin_solape`.

**SUPUESTOS**

- `.env.local` apunta al proyecto de **desarrollo**. Los dos scripts usan
  `service_role`, que es el único uso que admite `.claude/CLAUDE.md`: scripts de
  alta.
- La ficha de una clínica real no se sube al repositorio (`.gitignore`).

**FALLOS** — lo que se encontró por el camino, en §5 y §7. El más instructivo
nació fuera del código entregado —**una restauración que no restauraba**, cazada
solo por volver a correr el acta al final—, y acabó dentro: el hueco que lo hacía
inevitable era que nada en el repositorio sabía quitar esos claims. Ahora sí, con
su prueba vista en rojo. §5.1.

---

## 2 · Lo que ya había, auditado antes de escribir

El encargo pedía auditar `.claude/commands/alta-clinica.md` y `entregar.md`
**antes** de tocar nada. Esto es lo que cubrían y lo que no.

### `alta-clinica.md` · la entrevista

**Lo que estaba bien y se ha conservado tal cual:** preguntar de una en una y en
lenguaje de cliente; la lista de datos de la clínica; el `publico` fila por fila
con «ante la duda, `false`»; y el cierre enseñándole a la clínica qué podrá
decir el bot y qué no, pidiendo confirmación antes de ejecutar nada.

**Lo que faltaba** — cuatro de los cinco puntos:

- El `wa_phone_number_id`. No se preguntaba.
- `politica_privacidad`. No se preguntaba.
- `mensaje_urgencia`. No se preguntaba.
- Los usuarios del panel. No se preguntaban.

**Lo que decía y no era verdad:**

1. «Un archivo SQL en `supabase/seeds/<slug>.sql`». **Esa carpeta no existe** en
   el repositorio, y el formato no puede funcionar: los usuarios del panel viven
   en Supabase Auth y **no se crean con un INSERT**. Un alta en SQL es un alta
   que se deja fuera el punto 4 por construcción.
2. «Los embeddings de la FAQ se generan después con el script del proyecto».
   **Ese script no existe** (`grep -rn embedding src/ scripts/` devuelve una
   sola línea, y es un comentario). Hoy la FAQ entra **entera** en el prompt y no
   hay recuperación por similitud: la migración 002 deja el índice `hnsw`
   escrito y comentado a propósito. La ficha ya no promete embeddings.
3. «Si existe la skill `alta-clinica`, úsala». La «skill» **es este mismo
   comando**: la instrucción se mandaba a sí misma.

### `entregar.md` · la entrega

**Lo que estaba bien:** los dos filtros de seguridad antes que nada, las
comprobaciones técnicas, y el documento corto para la clínica sin tecnicismos.

**Lo que faltaba:** que **publicar no es dar de alta**. No mencionaba ninguno de
los cinco puntos, ni el par de `WHATSAPP_CLINICAS`, ni que la migración 010 tiene
que subir antes que el código, ni el horario del cron según el plan de Vercel
(dos pendientes vivos que ya estaban escritos en `PLAN.md`). Ahora tiene un
apartado 3 propio —«La clínica, dada de alta»— y el resto se ha respetado.

---

## 3 · Lo nuevo, y la decisión que manda en cada pieza

### 3.1 · La ficha, y por qué el alta se para en vez de rellenar huecos

Una ficha JSON, validada antes de tocar la base, con **todos** los fallos de una
vez y no el primero: quien da de alta una clínica está al teléfono con ella, y
una lista completa se resuelve en una llamada.

**No hay valor por defecto para nada que el bot vaya a decir.** Lo único con
defecto es lo que no se pronuncia (`zona_horaria`, `trato`, `nombre_bot`).

Tres reglas que la validación impone y que no son de forma:

1. **`publico` se escribe a mano en cada fila.** Un defecto aquí sería decidir
   por la clínica si algo suyo es público.
2. **Las dos claves obligatorias van con `publico: true`.** Esta es la trampa
   fina de toda la fase: una clave obligatoria con `publico: false` **existe en
   la base y no le llega al bot** —la RLS no se la devuelve—, así que se comporta
   exactamente igual que si faltara, con la diferencia de que mirando la base
   parece que está puesta.
3. **Una clave de más es un error, no un aviso.** `horario` por `horarios` es un
   alta sin horarios, y una clínica sin horarios es un bot que contesta «no
   tengo huecos» para siempre, con toda naturalidad y sin un solo error.

Y el vocabulario cerrado: un `motivo` que no esté en el enum se rechaza con el
mensaje que hace falta —**se añade en una migración, nunca como texto libre**—,
porque es lo que mantiene el sistema fuera del artículo 9 del RGPD.

> `ficha.mjs` es JavaScript y no puede importar el TypeScript de `src/`, así que
> **repite dos listas** (los motivos y los roles). Repetir una lista es
> exactamente como se pierde de vista: `01-ficha.test.ts` exige que coincidan
> con su original **y con el `.sql`**, que es la única fuente de verdad de las
> dos. Si alguien añade un motivo en un solo sitio, se pone rojo.

### 3.2 · El alta, y la comprobación que no se puede hacer creando el usuario

`pnpm alta` escribe todo lo que se puede escribir. Dos cosas que no son obvias:

**Los bloques de prompt se delegan** en `filasParaClinica()`, el mismo lector que
usa `pnpm bloques` y la siembra de las pruebas. Tres copias del prompt serían
tres prompts distintos.

**Los usuarios del panel se comprueban entrando.** Crear un usuario sin error no
demuestra que pueda entrar, y sobre todo no demuestra que sus permisos viajen
**dentro del token**, que es de lo que depende la RLS entera. Así que el alta:

1. Lo crea con `app_metadata: { rol, clinica_id }` y una contraseña de un solo
   uso que **no se imprime en ningún sitio**.
2. **Inicia sesión de verdad** con la clave anónima —el mismo camino que la
   pantalla de entrar— y mira el JWT emitido: exige `rol` y `clinica_id` en
   `app_metadata` y exige que **no** estén en `user_metadata`.
3. Genera un **enlace de recuperación** para que esa persona ponga su
   contraseña, y tira la de un solo uso.

**`--continuar` no pisa nada.** Una clínica que lleve meses afinando sus
respuestas desde el panel no puede perderlas porque alguien relance el alta. Lo
que diverge se informa; no se corrige solo. Sin `--continuar`, si la clínica ya
existe, el comando se para.

Y **no dice «alta completada» nunca**: termina imprimiendo el par exacto de
`WHATSAPP_CLINICAS`, el aviso de que hay que volver a publicar, y el comando del
acta.

### 3.3 · El acta, y por qué NO es un test de la suite

`pnpm test` tiene un `globalSetup` que **siembra dos clínicas de prueba y las
borra en cascada** al terminar. Para la suite es lo correcto. Para el acta sería
inadmisible: el acta se corre contra la base donde acaba de nacer una clínica de
verdad, **que un día será producción**. Una comprobación que siembra clínicas de
prueba y borra en cascada no se acerca a producción.

De ahí las dos mitades de la separación, que tienen que ir juntas:

- Los archivos del acta se llaman `*.comprobacion.ts`, que el `include` de
  `vitest.config.mts` (`tests/**/*.test.ts`) **no coge**.
- `vitest.alta.mts` los incluye **y no tiene `globalSetup`**.

Así ni el acta siembra, ni `pnpm test` arrastra el acta (el recuento de la suite
solo sube por las 28 pruebas del validador, que son puras).

**Lo que mira el acta, y por dónde entra:**

| Punto | Dónde se mira | Por qué ahí y no en la fila |
|---|---|---|
| 1 · canal | `clinicaDelNumero()` y `numeroDeLaClinica()`, los módulos de verdad | El de ida lo usa el webhook; **el de vuelta lo usan los recordatorios y la purga**, que recorren el mapa: una clínica que no esté, no se visita (F6) |
| 2 · urgencia | Lo que devuelve **`mensajeSeguro()`** | La fila puede estar y el bot usar el texto por defecto |
| 3 · privacidad | El **prompt montado** | Igual: con `publico = false` la fila está y el bot no la recibe |
| 4 · usuarios | `app_metadata`, y que **no** haya nada en `user_metadata` | `user_metadata` lo edita el propio usuario desde el navegador |
| la ficha | **Fila por fila contra la ficha** del alta | §3.4. No es uno de los cinco: es el que cierra el agujero que ninguno de los cinco veía |

(La numeración es la de `PLAN.md` §11, para que el acta, el resumen del comando
y el plan digan los mismos números.)

Y la barandilla 4 con los datos de esa clínica: **las mismas 30 preguntas** de
`tests/fuga/preguntas.ts`, con **el mismo** modelo indiscreto —sacado a
`tests/ayuda/indiscreto.ts` para no copiarlo, que es la lección de F7— entrando
por `responder()`, que es por donde entra un mensaje de verdad.

**El canario.** Antes de preguntar nada, el acta siembra tres filas
confidenciales de verdad (una en `config`, una en `tratamientos`, una en `faq`)
con una marca única, **comprueba con `service_role` que existen** y las borra al
terminar, comprobando también que se han ido. Sin el canario, «el bot no ve nada
confidencial» podría ser cierto simplemente porque no hay nada confidencial que
ver: es el verde por ausencia de F1 y la clínica fantasma de F6, otra vez.

**Y si el slug no existe, el acta se para.** No informa de «todo a cero»: contra
una clínica que no está, la RLS no devuelve nada, y cero filas es indistinguible
de «no hay nada que mirar».

### 3.4 · La comprobación que pedía el encargo: una FAQ confidencial visible

> «Si un alta puede dejar una FAQ confidencial visible al bot, eso se caza aquí
> o no se caza.»

Las dos comprobaciones anteriores salen **verdes** con una FAQ interna publicada
por error, y no es un descuido: el bot ve una fila con `publico = true`, la RLS
funciona, el contador no tiene nada que retener y el marcador no aparece en
ninguna parte. Desde dentro de la base, una FAQ interna publicada por error es
**indistinguible** de una pública.

Lo único que sabe la diferencia es lo que dijo la clínica, y eso está en la
ficha. Así que el acta la lee y compara fila por fila: lo que la ficha declaró
público tiene que llegarle al bot, y **lo que declaró privado, no**. Tres reglas
que salen de ahí:

- La ficha **no es opcional**. Si no está, esa comprobación no se ha hecho, y no
  se informa igual que si hubiera salido bien: se pone roja diciendo dónde
  ponerla.
- Se valida al leerla: una ficha que ya no cumple sus propias reglas no sirve
  para comparar.
- Y se exige que sea **la de esta clínica** (`slug`), no otra que estuviera al
  lado.

### 3.5 · El punto 5, con centinelas numerados

`recordatorio_cita` lleva sus parámetros por posición. Si en Meta se aprobó el
cuerpo en otro orden: Meta devuelve **200**, el mensaje **llega**, no hay ningún
error en ningún registro, y el paciente lee **la fecha donde iba su nombre**.

No hay forma de verlo desde el código, así que hay dos cosas:

- **Siempre**: una prueba que fija el orden que monta el código y exige que el
  cuerpo documentado en `plantillas.ts` siga siendo literalmente el mismo que el
  del procedimiento. Si alguien reordena la plantilla, **las instrucciones que
  se le dan a quien mira el móvil se quedarían mintiendo**, y eso sí se caza.
- **Con `--plantilla <móvil>`**: se manda de verdad, por `enviarPlantilla()` —la
  misma función que usa el trabajo de los recordatorios, no un POST montado a
  mano aquí— con valores centinela: `UNO-NOMBRE`, `DOS-CLINICA`, `TRES-FECHA`,
  `CUATRO-HORA`.

**Por qué centinelas y no datos plausibles:** «Hola Ana, te recordamos tu cita en
Sonrisa Viva el martes a las 10:00» con el orden cambiado se lee como una frase
rara que cualquiera da por buena a las ocho de la tarde. «Te recordamos tu cita
en UNO-NOMBRE» está mal y se ve desde el otro lado de la habitación.

---

## 4 · La `service_role`, y dónde está exactamente

`.claude/CLAUDE.md`: «Solo en migraciones y scripts de alta — nunca en el camino
del bot, nunca en el navegador». En esta fase la usan tres sitios y los tres son
lo que dice la regla:

| Dónde | Para qué |
|---|---|
| `scripts/alta-clinica.mjs` | Crear una clínica que todavía no existe. No hay identidad de inquilino que usar cuando el inquilino no está creado |
| `tests/alta/02-acta.comprobacion.ts` | Sembrar y retirar el canario, y **contar lo que el bot no ve** (que es el único modo de saber que ve menos) |
| `tests/ayuda/clientes.ts` | Ya estaba: la siembra de las pruebas |

Ni una línea nueva en `src/`. El acta lee **como el bot** (`clienteBot`, con su
JWT firmado) todo lo que afirma sobre lo que el bot ve; `service_role` solo
aparece para poner delante lo que el bot **no** tiene que ver.

---

## 5 · Las dieciséis demostraciones en rojo

> «Antes de dar una prueba por buena, pregúntate qué pasaría si la garantía real
> no existiera — y demuéstralo en rojo.»

Cada rotura y su restauración, en la **misma orden**, con `trap … EXIT`. El
guion completo está en el scratchpad de la sesión; esto es la salida.

Se corrieron **dos veces**: una a mitad de fase y otra entera contra el código
final, después de renumerar los puntos del acta. Un rojo demostrado contra una
versión anterior del archivo no demuestra nada sobre la que se entrega.

| # | Lo que se rompe | Lo que se pone rojo |
|---|---|---|
| 1 | `politica_privacidad` con `publico = false` | punto 3 (los dos `it`) y la ficha · **3 rojos** |
| 2 | `mensaje_urgencia` con `publico = false` | punto 2 y la ficha · **2 rojos** |
| 3 | La FAQ interna, publicada por error | la ficha · «⚠ FUGA DE ALTA: «¿Cuánto nos cuesta un implante a nosotros?» es privada en la ficha y el bot SÍ la recibe» |
| 4 | El margen comercial, publicado por error | la ficha · lo mismo, en `config` |
| 5 | `clinicas.wa_phone_number_id` a `null` | punto 1, **los tres** `it` |
| 6 | `WHATSAPP_CLINICAS` sin el par | punto 1, ida **y vuelta** · «no tiene número en WHATSAPP_CLINICAS, así que no se le puede enviar nada» |
| 7 | `clinica_id` y `rol` en `user_metadata` | punto 4 |
| 8 | El slug de una clínica que no existe | El acta **se para**: 143 pruebas saltadas y un error que dice por qué. No sale verde ni «todo a cero» |
| 9 | Sin la ficha del alta | la ficha · «No se ha podido leer…». La comparación **no se da por hecha** |
| 10 | El validador deja de mirar el vocabulario cerrado | `01-ficha.test.ts` · 1 rojo, y verde otra vez al restaurar |
| 11 | Una ficha sin `mensaje_urgencia` | `pnpm alta` se niega **y no toca la base**: `clinicas con ese slug: 0` |
| 12 | Relanzar el alta sobre una clínica que existe | Se para y explica `--continuar` |
| 13 | Un rol que no existe en `app_metadata` (`administrador`) | punto 4 · **2 rojos**: el rol inválido y «hay al menos un propietario» |
| 14 | `parcheParaBorrarClaims` vuelve a devolver `{}` | `04-usuarios-del-panel` · **5 rojos**, uno de ellos contra Supabase de verdad (§5.1) |
| 15 | `turnoConLasLlamadas()` deja de devolver la firma | `02-bucle-herramientas` **contra Gemini de verdad** · el mismo `400 · thought_signature, default_api:repasar_ficha, position 2` (§7.1) |
| 16 | Lo mismo, sin gastar cuota | `06-firma-de-pensamiento` · **3 rojos de 4**. La cuarta afirma una ausencia y no se mueve; se informa así y no se cuenta como demostrada |

Salida literal de tres de ellos:

```
ROJO 3 · una FAQ interna publicada por error (publico=true)
  [romper] faq «¿Cuánto nos cuesta un implante a nosotros?».publico = true
 FAIL  tests/alta/02-acta.comprobacion.ts > la ficha · lo que la clinica marco es lo que ve el bot > cada pregunta publica llega al bot, y ninguna privada
AssertionError: ⚠ FUGA DE ALTA: «¿Cuánto nos cuesta un implante a nosotros?» es privada en la ficha y el bot SI la recibe.: expected true to be false
      Tests  1 failed | 145 passed | 1 skipped (147)
  [romper] faq «¿Cuánto nos cuesta un implante a nosotros?».publico = false

ROJO 8 · una clinica que NO existe: ni verde ni 'todo a cero'
 FAIL  tests/alta/02-acta.comprobacion.ts [ tests/alta/02-acta.comprobacion.ts ]
Error: No hay ninguna clinica con el slug "clinica-que-no-existe" en esta base de datos.
El acta se para aqui: contra una clinica que no existe, TODO sale a cero y cero es
indistinguible de «esta todo bien».
      Tests  4 passed | 143 skipped (147)

ROJO 11 · una ficha sin mensaje_urgencia: el alta se niega y NO toca la base
  🔴  config.mensaje_urgencia: falta. Es lo que recibe quien escribe con dolor,
      hinchazon, un golpe o sangrado. […]
  No se ha tocado la base de datos.
-- y no ha creado nada:
   clinicas con ese slug: 0
```

### 5.1 · 🔴 La restauración que no restauraba, y qué la cazó

En la primera tirada de los doce rojos, el ROJO 7 **dejó el mundo roto**:
`updateUserById(id, { user_metadata: {} })` **no borra nada** — Supabase fusiona
los metadatos, no los reemplaza—, así que `rol` y `clinica_id` se quedaron dentro
de `user_metadata` y el usuario siguió mal después de la «restauración». Para
quitar una clave hay que mandarla a `null`.

Lo que lo cazó no fue ninguna de las doce demostraciones: fue el último paso del
guion, **volver a correr el acta al final**, que salió roja en un punto que nadie
estaba rompiendo ya. Sin ese paso, la fase habría terminado con un usuario de
prueba roto y con doce rojos «demostrados» de los cuales el séptimo no se había
restaurado.

Es exactamente la forma del tercer falso verde de `.claude/CLAUDE.md`, pero al
revés: no un verde que no mira, sino **una restauración que no restaura**. La
regla que lo evita es la que ya estaba escrita —romper y restaurar en la misma
orden— más una que esta fase añade: **después de todas las roturas, el verde
tiene que volver, y hay que verlo**.

#### ✅ Y arreglado en el código, no solo contado

Primero, lo que no era: el fallo estaba en el guion de las demostraciones, que
vive en el scratchpad de la sesión. **El repositorio no escribía `user_metadata`
en ningún sitio** (`grep -rn user_metadata src/ scripts/ tests/`), así que no
había ninguna línea entregada con el fallo dentro.

Lo que sí había era el hueco que lo hacía inevitable: el acta **detecta** los
claims en `user_metadata` y se pone roja, y **no había forma de quitarlos**. El
siguiente que lo necesitara iba a escribir `{}`, que es lo que escribe
cualquiera. Así que:

- **`scripts/usuarios.mjs`** · `parcheParaBorrarClaims()` (pura) los **nombra y
  los manda a `null`**, uno por uno, y `limpiarClaimsDeUsuario()` los aplica **y
  vuelve a leer al usuario** para comprobar que se han ido. Que el `update`
  devuelva 200 no demuestra nada: con `{}` devuelve 200 y no borra.
- **`pnpm alta`** lo llama para cada usuario que ya existía. Es lo único que
  toca de un usuario ajeno, y lo dice en voz alta.
- **`tests/alta/04-usuarios-del-panel.test.ts`** · 9 pruebas. La mitad pura
  exige que el parche **no sea `{}`**; la mitad viva lo manda a Supabase de
  verdad, porque la afirmación es sobre el comportamiento de otro y medirla con
  un doble sería medir el doble (la lección de F7).

Sonda contra el proyecto de desarrollo, 22/09/2026, que es de donde sale todo lo
anterior:

```
al crear      : {"clinica_id":"de-mentira","email_verified":true,"rol":"propietario","tema":"oscuro"}
tras {}       : {"clinica_id":"de-mentira","email_verified":true,"rol":"propietario","tema":"oscuro"}
tras nulls    : {"email_verified":true,"tema":"oscuro"}
  "rol" in md : false
  md.tema     : "oscuro" (lo que NO se tocaba)
```

**Visto en rojo antes del arreglo** (ROJO 14 de la tabla): volviendo a poner
`return {}` en `parcheParaBorrarClaims`, **cinco rojos**, y el más importante es
el de la mitad viva, donde Supabase **no da error** y los claims siguen ahí:

```
 FAIL  … > nombra cada claim y lo manda a null — nunca un objeto vacio
AssertionError: Un parche vacio no borra nada: Supabase fusiona: expected {} to not deeply equal {}
 FAIL  … > contra Supabase de verdad > nombrarlos y mandarlos a null SI los borra
Error: Se ha mandado el parche para borrar  de user_metadata de alta-usuarios-87e17225@ejemplo.test,
Supabase no ha dado error, y rol y clinica_id sigue(n) ahi. NO se ha limpiado.
      Tests  5 failed | 4 passed (9)
```

Restaurado en la misma orden (`trap … EXIT`), **9 passed dos veces seguidas**, y
`git diff --stat scripts/usuarios.mjs` sin una sola línea: el archivo volvió
byte a byte.

Y por donde se usa de verdad, que es lo que cuenta — con la clínica de
demostración levantada, ensuciando a la propietaria a mano:

```
== 2 · alguien se mete rol y clinica_id en user_metadata
   el acta lo caza:
 FAIL  … > punto 4 · … > y NINGUNO lleva rol ni clinica_id en user_metadata
      Tests  1 failed | 145 passed | 1 skipped (147)

== 3 · pnpm alta --continuar, que es quien tiene que limpiarlo
  ⚠   alta-demo-propietaria@ejemplo.test llevaba rol y clinica_id en user_metadata
      —donde lo edita el propio usuario— y se ha quitado de ahi. En app_metadata
      sigue igual.

== 4 · y el acta vuelve a salir, sin tocar nada a mano
      Tests  146 passed | 1 skipped (147)
```

---

## 6 · La prueba, ejecutada. Salida real

### 6.1 · El alta de una clínica que no existía

```
$ pnpm alta fichas/alta-demo.json

La ficha
--------
  ok  "Clinica Demo de Alta (F8)" (alta-demo) leida y validada

La clinica
----------
  ok  creada · clinica_id c1d445a0-c505-4c9f-9fb8-d7c166302b07

Lo que sabe la clinica
----------------------
  ok  2 gabinete(s)
  ok  9 tramo(s) de horario
  ok  4 tratamiento(s)
  ok  4 pregunta(s) frecuentes (3 publicas en la ficha)
  ok  6 fila(s) de config, con las dos obligatorias
  ok  10 bloques de prompt (9 activos)

Quien entra al panel
--------------------
  ok  alta-demo-propietaria@ejemplo.test · rol propietario · creado y comprobado entrando de verdad
  ok  alta-demo-recepcion@ejemplo.test · rol recepcion · creado y comprobado entrando de verdad
```

Y relanzándolo con `--continuar`, no duplica nada: «Ya tiene 10 bloques de
prompt. No se tocan», «ya existe con rol propietario».

### 6.2 · El acta

```
$ pnpm alta:comprobar alta-demo

 Test Files  2 passed (2)
      Tests  146 passed | 1 skipped (147)

Cuatro de cinco, comprobados
  ✅ 1 · El canal: la fila tiene su wa_phone_number_id y WHATSAPP_CLINICAS lleva
         su par, en los dos sentidos (webhook y recordatorios).
  ✅ 2 · politica_privacidad, vista en el prompt montado.
  ✅ 3 · mensaje_urgencia, visto en lo que devuelve el mensaje seguro.
  ✅ 4 · Usuarios del panel, con rol y clinica_id en app_metadata.
  ✅     Barandilla 4: las 30 preguntas adversarias contra esta clinica, con
         canario sembrado y retirado.

  ⚠  Y DOS COSAS QUE ESTO NO HA MIRADO:
     5 · Las plantillas de Meta […]
     1b · El punto 1 se ha mirado en el entorno DE ESTA MAQUINA […]
```

El saltado es el envío real del centinela, que solo corre con `--plantilla`.

Dos veces seguidas, el mismo número: `146 passed | 1 skipped (147)`.

### 6.3 · Lint, tipos y la suite

```
$ pnpm lint               → sin salida
$ pnpm exec tsc --noEmit  → sin salida
```

La suite entera, **dos veces seguidas y el mismo número**:

```
$ pnpm test
 Test Files  45 passed | 3 skipped (48)
      Tests  1031 passed | 36 skipped (1067)
   Duration  212.97s

$ pnpm test
 Test Files  45 passed | 3 skipped (48)
      Tests  1031 passed | 36 skipped (1067)
   Duration  210.44s
```

Venía de **989 passed | 36 skipped (1025)** en F7. Las 42 nuevas son las 29 del
validador de la ficha, las 9 de la limpieza de `user_metadata` (§5.1) y las 4 de
`turnoConLasLlamadas()` (§7.1). El
**acta no entra en `pnpm test`** a propósito (§3.3), así que el recuento de la
suite no depende de que haya una clínica dada de alta por ahí.

Navegador:

```
$ pnpm test:e2e
  1 failed
    [chromium] › tests\e2e\04-interruptor.spec.ts:189:7 › el rastro › queda escrito
                 quien lo movio, cuando, y SIN copiar el contenido
  30 passed (52.1s)
```

**30 de 31, y el rojo es el conocido**: el clic del interruptor que deja dos
apuntes en `auditoria`, anterior a F7 y diagnosticado en `ESTADO_F7 §4.3`. No es
de esta fase y no se ha tocado.

⚠️ **Al día siguiente (22/09) salió 31 de 31, tres veces seguidas** — y eso NO
quiere decir que esté arreglado:

```
$ pnpm test:e2e     31 passed (56.5s)
$ pnpm test:e2e     31 passed (1.0m)
$ pnpm test:e2e     31 passed (54.3s)
```

**Nadie lo ha arreglado.** Lo único que se tocó ese día fue `gemini.ts`,
`cerebro.ts` y pruebas — nada del panel, del interruptor ni de `auditoria`
(`git diff --stat`). Un verde que aparece solo y sin explicación **no es una
garantía**: es la misma forma que tenían los tres falsos verdes de
`.claude/CLAUDE.md`. Lo más probable es que dependa del estado de `auditoria` en
la base de desarrollo —filas de una tirada anterior—, que es justo lo que el
diagnóstico de `ESTADO_F7 §4.3` apuntaba. **Sigue en la lista de pendientes**
hasta que alguien explique por qué contaba dos apuntes y ahora cuenta uno.

---

## 7 · Lo que esta fase NO ha podido comprobar

Dos cosas, y ninguna se informa como si estuviera bien. La tercera —el
`thought_signature`— **sí se pudo comprobar**, al día siguiente, y su relato se
queda aquí en §7.1 porque es donde lo buscará quien lea la fase.

### 7.1 · ✅ El `thought_signature`, aceptado por Gemini — y la prueba que mentía

**21/09, cinco intentos, ninguno llegó al modelo:**

```
17:32  503 · "This model is currently experiencing high demand"
17:33  429 · quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier,
             quotaValue 20, model gemini-3.6-flash
17:35  429 · lo mismo
17:39  429 · lo mismo
17:41  429 · lo mismo
```

**22/09, con la cuota reseteada, la llamada salió — y salió roja:**

```
FAIL  tests/bot-contrato/02-bucle-herramientas.test.ts
ApiError: {"error":{"code":400,"message":"Function call is missing a
thought_signature in functionCall parts. This is required for tools to work
correctly, and missing thought_signature may lead to degraded model
performance. Additional data, function call `default_api:repasar_ficha` ,
position 2. ...","status":"INVALID_ARGUMENT"}}
 ❯ preguntar src/lib/bot/gemini.ts:209:23
 ❯ tests/bot-contrato/02-bucle-herramientas.test.ts:102:23
```

Ese rojo ya dice dos cosas ciertas antes de mirar nada: **hay cuota** (la vuelta
1 pasó; un 400 no es un 429) y **Gemini exige la firma de verdad**, hoy, contra
`gemini-3.6-flash`.

**Pero no decía lo que parecía decir.** La prueba había nacido en F7 para
REPRODUCIR el 400, así que armaba la vuelta 2 a mano:

```ts
{ tipo: 'llamada', nombre: llamada.nombre, argumentos: llamada.argumentos }
//                                        ^ y la firma se queda fuera
```

El arreglo de F7 entró en el bucle de `cerebro.ts` —`...(llamada.firma ===
undefined ? {} : { firma: llamada.firma })`— y **no en la copia de la prueba**.
Resultado: una prueba de contrato llevaba desde F7 afirmando que el bot estaba
roto **cuando el bot no lo estaba**. Es la lección de F7 al derecho, y esta vez
con el daño al otro lado: una prueba que copia al llamante comprueba a la copia,
y la copia puede quedarse tanto en un falso verde como en un falso rojo.

**El arreglo (único cambio de código de esta sesión):** `turnoConLasLlamadas()`
en `gemini.ts`, exportada. La llaman el bucle y la prueba, **la misma función,
no una igual**. Si alguien le quita la firma, se enteran los dos sitios.

**Y entonces, la llamada real:**

```
$ GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato/02-bucle-herramientas

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  15:39:27
   Duration  25.83s (tests 90%, import 9%)
```

Otra vez a las 15:40:52, mismo resultado. **La segunda vuelta del bucle de
herramientas entra en Gemini 3.** Gate de F9 levantado.

**Qué mira ahora la prueba, y por qué son tres peticiones y no una:**

| | Qué | Por qué está |
|---|---|---|
| 1 | `llamada.firma` es un `string` | Si `preguntar()` volviera al atajo `respuesta.functionCalls`, la firma llegaría vacía y el punto 3 saldría **verde por ausencia** |
| 2 | **Sin** la firma, Gemini corta con `400 thought_signature` | El control negativo. Sin él, un verde podría significar «Gemini ya no la pide» y nadie se enteraría de que el bot dejó de mandarla |
| 3 | **Con** ella, vía `turnoConLasLlamadas()`, la vuelta 2 entra | Lo que se quería saber, por donde pasa de verdad |

**Visto en rojo** (`trap … EXIT`, rotura y restauración en la misma orden):
quitando la firma de `turnoConLasLlamadas()`, el punto 3 muere en el mismo
`400 · default_api:repasar_ficha, position 2`. Y sin gastar cuota, las cuatro
pruebas nuevas de `tests/bot/06-firma-de-pensamiento` —3 rojas de 4; la cuarta
es la que afirma una ausencia y no se mueve, y así se informa—.

### 7.2 · 🟡 Los cuatro secretos `SUPABASE_*_DEV` del CI: no los he puesto

Y no por olvido: **los cuatro valores están en `.env.local`, que no se lee**
(`.claude/CLAUDE.md`, primera línea de seguridad). Ponerlos exige leer el archivo
o teclear las claves, y las dos cosas las tiene que hacer una persona. El
procedimiento, desde la carpeta del proyecto:

```sh
gh secret set SUPABASE_URL_DEV               # pega el valor cuando lo pida
gh secret set SUPABASE_ANON_KEY_DEV
gh secret set SUPABASE_SERVICE_ROLE_KEY_DEV
gh secret set SUPABASE_JWT_SECRET_DEV
gh variable set RLS_VIVA --body true         # además, para `pruebas-vivas`
```

⚠️ **El primer cerrojo es no poner ahí el secreto de producción**, como ya avisa
`ci.yml`: `pruebas-vivas` siembra usuarios con una contraseña escrita en el
repositorio y borra clínicas en cascada.

Mientras no estén, `auditoria-de-fuga` sale **roja por no poder comprobar**, que
es su diseño y no un fallo.

### 7.3 · ⚠️ `WHATSAPP_CLINICAS` no está en `.env.local`

Hallazgo de esta fase, al correr el acta por primera vez: la variable **no existe
en el entorno de desarrollo** (`Falta WHATSAPP_CLINICAS`). Las pruebas del canal
se la ponen ellas mismas en memoria, así que nadie se había enterado. No rompe
nada hoy, pero es el mismo agujero del punto 1 en pequeño: el mapa vive en un
sitio donde nadie lo mira hasta que falla.

Para correr el acta de una clínica hay que tenerla, y basta con el par de esa
clínica. Medido de paso: **`process.loadEnvFile()` no pisa una variable que ya
esté en el entorno**, así que `WHATSAPP_CLINICAS=… pnpm alta:comprobar …` gana
sobre `.env.local` — útil para probar sin tocar el archivo.

---

## 8 · Pendientes vivos

> Esta lista tiene su copia en `PLAN.md` §11. **Si se toca una, se toca la
> otra.** (La copia viva pasa de `ESTADO_F7 §8` a este archivo; aquel se queda
> como registro cerrado de su fase.)

1. ~~**🔴 Confirmar el `thought_signature` contra Gemini.**~~ **✅ Cerrado el
   22/09/2026**, §7.1. Verde contra `gemini-3.6-flash` dos veces, con su rojo
   demostrado. El gate de F9 queda levantado.
2. **🔴 El merge no está bloqueado.** Sin cambios desde F7: el repositorio es
   privado en plan gratuito y ahí GitHub no ofrece rulesets
   (`403 · Upgrade to GitHub Pro or make this repository public`). Público, de
   pago, o se borra la frase «bloquea el merge» de donde esté. Decisión de
   producto.
3. **🟡 Los cuatro secretos `SUPABASE_*_DEV`.** §7.2. Los pone una persona.
4. **🟡 `04-interruptor.spec.ts:189`.** Un clic del interruptor deja dos apuntes
   en `auditoria`. Anterior a F7, diagnosticado en `ESTADO_F7 §4.3`.
   ⚠️ **El 22/09 pasó en verde tres veces seguidas sin que nadie lo tocara**
   (§6.3). No se da por arreglado: un verde sin explicación no es una garantía.
   Queda abierto hasta que se sepa por qué contaba dos apuntes y ahora uno.
5. **⚠️ El punto 1 del alta sigue siendo medio manual.** Añadir el par a
   `WHATSAPP_CLINICAS` y **volver a publicar** no se puede hacer ni comprobar
   desde aquí. Lo que F9 puede cerrar: una ruta de salud que diga **qué clínicas
   conoce el despliegue**, y entonces el acta podría preguntárselo al sitio
   publicado en vez de a esta máquina.
6. **⚠️ La migración 010 no está en producción** (no hay producción todavía).
   Cuando la haya, es la primera que sube: sin ella el canal lee dos columnas que
   no existen y no contesta a nadie.
7. **La cuota de Gemini son 20 peticiones al día por modelo.** Si la primera
   clínica sale a producción con esta clave, eso es un límite de **producto**.
8. **El horario del cron depende del plan de Vercel.** Si solo admite crons
   diarios: `RECORDATORIO_HORAS_ANTES=48`, o las citas de entre 24 y 48 horas no
   reciben aviso.
9. **F3b**, aparcada, sin cambios: estrechar la RLS a `pacientes` /
   `conversaciones` / `mensajes`. `citas` **no** se toca.
10. **El `README.md` sigue siendo el de `create-next-app`**, ocho fases después.
    No se ha tocado aquí porque no es de esta fase, pero es la primera página que
    ve quien abra la carpeta de código y no dice ni qué es esto ni cuáles son los
    comandos. Candidato claro para F9, que es cuando alguien de fuera va a mirar.

---

## 9 · Lo que se descartó

- **El seed en SQL** que proponía el comando anterior. No puede crear los
  usuarios del panel —viven en Auth— así que un alta en SQL se deja fuera el
  punto 4 por construcción, y además hay que acordarse de ejecutarlo.
- **Que el acta fuera un `.test.ts` más de la suite.** `pnpm test` siembra dos
  clínicas de prueba y borra en cascada al terminar; apuntar eso a la base de una
  clínica de verdad es la operación más destructiva del repositorio. La
  separación por nombre de archivo **y** por configuración es lo que lo impide.
- **Correr el acta contra un fixture.** Un alta que «funciona» contra una base
  que ya tenía las filas no demuestra nada: el caso que hay que probar es la
  clínica que **no existe todavía**, y así se ha probado.
- **Copiar el modelo indiscreto al acta.** Es la lección de F7 —una prueba que
  copia al llamante comprueba a la copia—, así que se sacó a `tests/ayuda/` y lo
  usan los dos. Si alguien lo hace menos indiscreto, se enteran los dos.
- **Que el acta dijera «APTO».** Habiendo mirado cuatro de cinco, un «todo
  correcto» es justo lo que prohíbe `.claude/CLAUDE.md`: «no he podido
  comprobarlo» nunca se informa igual que «está todo bien».
- **Mandar el centinela de Meta con datos plausibles.** Un orden cambiado se leería
  como una frase rara y pasaría. §3.5.
- **Saltarse la comparación con la ficha cuando la ficha no está.** Es la forma
  más cómoda que hay de tener un tick verde que no ha mirado nada, y ya ha pasado
  tres veces en este proyecto.
- **Borrar la clínica de demostración desde el propio comando** (`pnpm alta
  --borrar`). Un script de alta que sabe borrar clínicas en cascada es un
  accidente esperando a que alguien se equivoque de `.env.local`. La limpieza de
  `alta-demo` se hizo a mano y está en §10.

---

## 10 · La clínica de demostración

`alta-demo` se creó **en la base de desarrollo** para probar la fase entera
contra una clínica que no existía, y se ha borrado al terminar. Para volver a
montarla:

```sh
cp fichas/ejemplo.json fichas/alta-demo.json
#   cambia slug, nombre, wa_phone_number_id y los correos de usuarios
pnpm alta fichas/alta-demo.json
WHATSAPP_CLINICAS='{"<su numero>":"<su clinica_id>"}' pnpm alta:comprobar alta-demo
```

El borrado se hizo mirando primero lo que se llevaba por delante:

```
Se va a borrar "Clinica Demo de Alta (F8)" (2b02640f-…) y, en cascada:
   gabinetes: 2
   horarios: 9
   tratamientos: 4
   faq: 4
   config: 6
   bloques_prompt: 10
   eventos: 150
   -> clinica borrada
   -> alta-demo-recepcion@ejemplo.test borrado
   -> alta-demo-propietaria@ejemplo.test borrado

Clinicas con slug "alta-demo" despues de borrar: 0
```

**Ni un paciente y ni una cita**, en ningún momento: el acta abre una
conversación de un solo uso y la borra, y no crea fichas. Por eso el cerrojo
`exigirBaseDeDesarrollo()` de la siembra de las pruebas nunca estuvo en juego.
Los 150 apuntes de `eventos` son los del contador —uno por prompt montado, 30 por
cada vez que se corrió el acta, y en esa última vuelta se corrió cinco veces—,
que es lo que la barandilla 2 escribe también en producción.

Y, borrada la clínica, el acta vuelve a negarse a dar nada por bueno:

```
$ pnpm alta:comprobar alta-demo
Error: No hay ninguna clinica con el slug "alta-demo" en esta base de datos.
      Tests  4 passed | 143 skipped (147)
  🔴 El acta de "alta-demo" NO sale.
```
