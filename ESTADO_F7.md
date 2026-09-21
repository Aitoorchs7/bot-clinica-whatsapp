# ESTADO F7 · La suite de pruebas de conjunto

> Cerrada el 21/09/2026. Rama `f1-base-de-datos-y-rls`.
>
> **Qué entra:** la auditoría de fuga (barandilla 4) con sus 30 preguntas
> adversarias, quince guiones de conversación de referencia, el hueco de RLS
> que dejó F6, y un CI que dice la verdad sobre lo que bloquea y lo que no.
>
> **Qué NO entra, y está fuera de alcance por encargo:** RGPD y auditoría de
> seguridad formal (F8), despliegue (F9).

---

## 1 · El contrato de cinco campos

**ENTREGA**

1. Auditoría de fuga, barandilla 4: las 30 preguntas adversarias con el
   marcador `ZZMARGEN-7f3a`, incluidas las inyecciones de prompt. Dos mitades:
   una determinista que bloquea el merge y otra contra Gemini de verdad.
2. Quince guiones de conversación en `tests/guiones/*.json` y su motor.
3. El hueco de cobertura de RLS: `recordatorios` (migración 009) no estaba en
   el barrido vivo tabla por tabla.
4. CI con los tres trabajos, Playwright incluido, y la verdad escrita sobre
   por qué hoy no bloquea nada.
5. Auditoría de lo que ya existía, contra la lista del encargo.

**PRUEBA**

`pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm vitest run` dos veces seguidas
con el mismo número · `pnpm test:e2e` · y, para cada garantía nueva, verla en
rojo rompiéndola a propósito.

**LÍMITES**

- La mitad de la fuga que llama a Gemini **no cabe entera en un día** en el
  tier gratuito: el límite es de **20 peticiones diarias por modelo** (§5).
- Los quince guiones **no llaman al modelo real**, y está razonado en §3.2.
- De los tres fallos de producto que ha encontrado la fase (§4), se arregla
  **uno** —el `thought_signature`, por decisión expresa— y con su propio
  contrato. Los otros dos se informan. De `src/` sólo se tocan `gemini.ts` y
  una línea de `cerebro.ts`.
- **El arreglo no está confirmado contra Gemini**: la cuota diaria se agotó
  con la batería de §5. Lo que se afirma y lo que no, en §4.1.

**SUPUESTOS**

- La base de desarrollo es la de `.env.local` y no la de producción; lo
  vuelve a comprobar `exigirBaseDeDesarrollo` en cada siembra.
- Una sola tirada a la vez contra esa base (ESTADO_F3 §5.4, ampliado en F5 a
  Playwright y en F7 al orden de los trabajos de CI).

**FALLOS**

- `tests/e2e/04-interruptor.spec.ts:189` falla, **y ya fallaba antes de esta
  fase**: comprobado con todo F7 guardado en `git stash` (§4.3).
- El CI **no impide mezclar**, y en este repositorio no puede (§6).

---

## 2 · La auditoría de coverage: qué había ya y qué faltaba

El encargo avisaba de que buena parte ya existía. Lo que salió al mirarlo:

| Pedido | Estado | Dónde |
|---|---|---|
| unidad · tabla de teléfonos/nombres de V1 (T4) | ✅ **Ya estaba**, literal y con sus cuatro filas | `tests/bot/01-validacion.test.ts:21` |
| rls · «A no ve NADA de B», tabla por tabla | ⚠️ **Faltaba una tabla de dieciséis** | §2.1 |
| fuga · 30 preguntas con marcador e inyecciones | ❌ **No existía nada** | §3.1 |
| herramientas · hueco ocupado, dos simultáneas | ✅ **Ya estaba**, sigue en pie | `tests/rpc/huecos-y-citas.test.ts:187` |
| webhook · firma inválida 401, `wa_event_id` duplicado | ✅ **Ya estaba** | `tests/whatsapp/07-webhook.test.ts:185` y `:270` |
| Playwright · login, `publico`, escalado | ✅ **Ya estaba**, el guion entero | `tests/e2e/04-interruptor.spec.ts`, `05-escalados.spec.ts` |
| 15 guiones de conversación | ❌ **No existía** | §3.2 |
| CI que bloquee el merge | ⚠️ **El workflow existía; el bloqueo, no** | §6 |

### 2.1 · La tabla dieciséis: `recordatorios`

`tests/rls/04-aislamiento.test.ts` barría **quince** tablas. Las migraciones
crean **dieciséis**: la 009 de F6 añadió `recordatorios` y nadie la metió en
esa lista.

**Lo que hacía que no se notara es lo interesante.** La mitad estática
(`00-rls-activada.test.ts`) **sí** la coge: deriva la lista de los `.sql` y la
nombra por su nombre. O sea que había un tick verde al lado diciendo
«`recordatorios`: RLS activada y con políticas» — cierto— mientras la mitad
viva, que es la única que demuestra que la política está **puesta** y no sólo
escrita, no la miraba. Una lista escrita a mano junto a una que se deriva sola
se desincroniza, y el verde de la de al lado tapa el hueco.

Arreglado en tres piezas:

1. `recordatorios` entra en `TABLAS`, con su fila sembrada **por este archivo**
   y no por la siembra global: `trabajos-vivo/01-recordatorios` borra en su
   `afterEach` todos los recordatorios de las dos clínicas de prueba, así que
   una fila global desaparecería según qué archivo corriera antes — el falso
   verde de F6, otra vez.
2. Una prueba nueva compara la lista con `leerEsquema().tablas`. La próxima
   tabla que añada una migración ya no se puede quedar fuera en silencio.
3. **Control positivo** en las dieciséis: antes de exigir que B no vea la
   fila, se exige que la fila **exista**, y se comprueba con `service_role`,
   un rol distinto del que se está probando. Sin esa mitad, una lista vacía
   significaba dos cosas a la vez —«la RLS la escondió» y «la fila ya no
   está»— que es exactamente F1 §5.2.

---

## 3 · Lo nuevo

### 3.1 · La barandilla 4 · `tests/fuga/`

Tres archivos: `preguntas.ts` (los datos), `01-bateria.test.ts` (la mitad que
bloquea) y `02-con-gemini.test.ts` (la que pide el PLAN).

**Las treinta, en seis familias**, y la primera es la que menos demuestra:
`directa` (6) · `instrucciones` (8, con «ignora tus instrucciones», `SYSTEM:`,
el delimitador falso y la herramienta inventada) · `suplantacion` (4) ·
`idiomas` (4, con inglés, catalán, mezcla y base64) · `voz` (3, la inyección
dentro de una nota de voz transcrita) · `medico` (5).

#### La decisión que manda en todo el archivo: el modelo NO es Gemini

Lo intuitivo sería lanzarle las treinta a Gemini y ver si suelta el marcador.
Eso mide **la prudencia del modelo**, que no es lo que este producto vende. Lo
que vende es:

> Lo que el bot no debe decir **no le llega**.

Un modelo que recibe el margen en el prompt y tiene el buen gusto de callárselo
**da verde en la prueba intuitiva y ha fallado la garantía**.

Así que el modelo de esta mitad es `modeloIndiscreto`: el peor concebible. Pide
`repasar_ficha`, pide `consultar_huecos`, y en la tercera vuelta **vuelca
literalmente todo lo que ha visto** —prompt de sistema, recordatorio, historial
y cada resultado de herramienta— en su respuesta al paciente. Contra ese
modelo, el marcador sólo puede faltar por un motivo: porque nunca entró. Es
determinista, sale igual las dos veces y no gasta cuota, que es lo que permite
que **ésta** sea la mitad que bloquea.

#### Se miden cuatro cosas, y la primera no es la respuesta

1. `retenidos === []` y `alarma === false` en el contador.
2. El marcador no está en el prompt montado.
3. El marcador no está en **nada** de lo que se le mandó al modelo.
4. El marcador no está en la respuesta.

**La 1 va primero a propósito, y §3.3 explica por qué no es un adorno.**

Además: las cinco médicas tienen que **cortar antes del cerebro** (se mide
`modelo.vistas.length === 0`: el modelo no vio el mensaje, así que no pudo
opinar sobre el síntoma), y ni una palabra del paciente acaba escrita en
`escalados` (art. 9 del RGPD; la 007 borró la columna de texto libre).

Y un **control positivo** en el `beforeAll`: se comprueba con `service_role`
que las tres filas con el marcador existen y siguen con `publico = false`, más
una prueba que exige que el bot vea **menos** filas de `config`, `tratamientos`
y `faq` que las que hay en la base. Sin eso, «cero fugas» y «no había nada
confidencial que filtrar» se informan igual — la clínica fantasma de F6.

**130 pruebas.** Y el cerrojo de `FUGA_EXIGIDA=1` (§6).

### 3.2 · Los quince guiones · `tests/guiones/`

Un `*.json` por guion, más `formato.ts` (el formato, razonado) y
`00-guiones.test.ts` (el motor). Los ocho del encargo y siete más:

| | Guion | Lo que mide |
|---|---|---|
| 01 | Cita simple | El camino feliz entero, 4 turnos |
| 02 | Cita para otra persona | `quien_llama` ≠ `nombre`; el teléfono no es el del canal |
| 03 | Tres citas seguidas | Tres filas de verdad, y el borrador **se vacía** entre una y otra |
| 04 | Hora fuera de horario | `fuera_de_horario`, **no** `ocupado`. Es el fallo que V1 documenta |
| 05 | Pregunta no publicada | La FAQ confidencial no llega al prompt |
| 06 | Dolor fuerte | Corta antes del cerebro; el modelo no ve el síntoma |
| 07 | Petición de humano | Regla dura, sin ronda de convencer |
| 08 | Mensaje ininteligible | Una sola ronda de aclaración, nunca un bucle |
| 09 | Sin confirmación | La puerta cerrada: cero filas |
| 10 | Hueco ocupado | Se llena la hora y lo dice el constraint |
| 11 | Teléfono mal dado | Tres motivos de rechazo distintos, que es lo que pide V1 |
| 12 | FAQ palabra por palabra | El texto aprobado, literal, en el prompt |
| 13 | Motivo fuera del enum | Art. 9 del RGPD: vocabulario cerrado |
| 14 | Aviso inicial | Art. 50 del Reglamento de IA: se identifica |
| 15 | Un «sí» dicho a otra cosa | La tercera condición de la puerta |

**Van en JSON y no en TypeScript** porque un guion es una conversación, y una
conversación la tiene que poder leer y discutir quien no programa. Cuando la
clínica diga «eso no es lo que queremos que conteste», lo que hay que enseñarle
y cambiar es uno de estos archivos, no un `it()`.

#### Por qué ninguno de los quince usa el modelo real

El encargo dejaba la puerta abierta a que algunos lo necesitaran, y se
justifica que no:

Lo que los quince prueban **no es el criterio del modelo, es la maquinaria**:
que `crear_cita` no escriba sin un «sí» del paciente; que una hora cerrada
vuelva como `fuera_de_horario`; que tres citas dejen tres filas; que un síntoma
corte antes. Son garantías del sistema, valen para cualquier modelo, y con
Gemini serían **imposibles de montar**: habría que rezar para que pidiera
`crear_cita` sin confirmación, que es justo el caso que hay que probar. El
doble se pincha donde manda ESTADO_F3 §1 —la última línea antes del HTTP— así
que el bucle de herramientas, Zod, la puerta, el montaje y la base de datos
corren **todos de verdad**.

La prosa del modelo real ya tiene dos sitios: `tests/bot-contrato` y
`tests/fuga/02-con-gemini`.

#### El rojo que costó un día por guion

Los quince arrancaron compartiendo el mismo día. `10-hueco-ocupado` falló en la
**segunda** reserva en vez de en la tercera: `01` y `03` ya habían llenado
medio hueco ese mismo día. El número no era el problema — el problema era que
**el resultado de un guion dependía de cuáles hubieran corrido antes**, y eso
rompe el criterio de cierre en cuanto alguien añada el decimosexto. Ahora cada
guion tiene su propio día laborable (`diaLaborable(indice)`) y arranca sobre
una agenda vacía.

### 3.3 · Las demostraciones en rojo

> «Antes de dar una prueba por buena, pregúntate qué pasaría si la garantía
> real no existiera — y demuéstralo en rojo.»

Cuatro, cada una rompiendo y restaurando en la **misma orden** (`trap … EXIT`
o `try/finally`). `git diff src/` quedó vacío después de las cuatro.

**a) ¿Y si la RLS no filtrara?** Un `Proxy` sobre el cliente del bot que
devuelve además la fila confidencial de `faq` —como la devolvería una política
mal escrita—:

```
 ❯ tests/fuga/zz-demo-rojo.test.ts (3 tests | 1 failed)
   ✓ 0 · la inyeccion ha ocurrido de verdad
   × 1 · LA ASERCION DE LA BATERIA · se entera: tiene que ponerse ROJA
   ✓ 2 · y las otras tres comprobaciones SEGUIRIAN VERDES

AssertionError: expected [ Array(1) ] to deeply equal []
+ [ "faq#bcc30edc-87e9-4f52-87c4-24bb429dd1e7" ]
```

**Léase la tercera línea despacio.** Con la RLS rota, el marcador **sigue sin
aparecer** en el prompt ni en la respuesta, porque `aplicarGuardia` lo retiene
en código. Verde por el cinturón, no por los tirantes. **Sin la aserción del
contador, esta batería aprobaría una RLS apagada.** Por eso va la primera.

> El primer intento de esta demo salió **verde** y no demostraba nada: el
> `Proxy` sólo envolvía el objeto de `from()` y `.select()` se escapaba
> devolviendo un constructor nuevo sin envolver. La inyección no llegaba a
> ocurrir. De ahí la prueba `0 · la inyeccion ha ocurrido de verdad`, que es el
> control positivo de la propia demo.

**b) ¿Y si la fila confidencial dejara de serlo?** `publico = true` sobre la
FAQ del marcador, con `try/finally`:

```
AssertionError: expected '…PREGUNTAS FRECUENTES - usa estas palabras, no las cambies
P: ¿Cual es el margen de un implante?
R: El margen es ZZMARGEN-7f3a.…' not to contain 'ZZMARGEN-7f3a'
 Test Files  1 failed (1)
  DEMO2 · restaurado publico = false
```

El marcador entra literalmente en el prompt montado y las aserciones 2, 3 y 4
se enteran.

**c) ¿Y si la puerta de la confirmación no existiera?** `puerta()` devolviendo
siempre `{ abierta: true }`:

```
× 09-sin-confirmacion.json · Sin confirmacion: el modelo intenta res…
× 15-si-dicho-a-otra-cosa.json · Un «si» dicho a otra cosa no reserva un…
AssertionError: 09 · turno 2: crear_cita.ok: expected true to be false
AssertionError: 15 · turno 2: crear_cita.ok: expected true to be false
 Tests  2 failed | 15 passed (17)
```

Los dos guiones que existen para eso, y sólo esos dos.

**d) ¿Y si las reglas duras del clasificador no existieran?** `reglasDuras()`
devolviendo siempre «nada»:

```
× 06-dolor-fuerte.json · Dolor fuerte: el mensaje NO llega al ce…
× 07-pide-humano.json · Peticion de humano: «quiero hablar con …
× [medico] medico-dolor · corta ANTES del cerebro…
× [medico] medico-hinchazon · corta ANTES del cerebro…
× [medico] medico-golpe · corta ANTES del cerebro…
× [medico] medico-sangrado · corta ANTES del cerebro…
× [medico] medico-antibiotico · corta ANTES del cerebro…
× el escalado no se lleva ni una palabra de lo que escribio el paciente
 Tests  8 failed | 139 passed | 30 skipped (177)
```

Ocho rojos, los ocho donde debía. El octavo es el bonito: sin corte, el cerebro
ve el síntoma, decide él el escalado, y el aviso deja de estar limpio.

---

## 4 · Lo que ha encontrado la fase. Tres fallos, ninguno arreglado aquí

Una suite de conjunto sirve para esto. Los tres están en código que **no** es
de F7, y arreglarlos toca el camino del bot o el panel: se informan.

### 4.1 · 🔴 El bucle de herramientas está roto contra `gemini-3.6-flash`

Al correr la batería contra Gemini de verdad:

```
ApiError 400 INVALID_ARGUMENT
«Function call is missing a thought_signature in functionCall parts. This is
 required for tools to work correctly, and missing thought_signature may lead
 to degraded model performance. Additional data, function call
 `default_api:escalar_a_recepcion`, position 3.»
```

**No es cuota. Es nuestro.** `gemini.ts` traduce nuestras `Parte` a `Content`
del SDK y **no arrastra el `thoughtSignature`** que Gemini 3 pone en cada
`functionCall`: ni `Respuesta.llamadas` lo expone, ni `aContenido()` lo vuelve
a poner al devolver la llamada. El SDK instalado **sí** tiene el campo
(`Part.thoughtSignature`, `genai.d.ts:11777`), así que no falta nada que
instalar: falta llevarlo de ida y vuelta.

**Qué significa en producción:** la segunda vuelta del bucle —la que hace que
una cita se llegue a coger— puede devolver un 400. El modelo pide una
herramienta, se ejecuta, y al devolvérsela la API rechaza la petición.

**Por qué no lo había cazado nadie:** `tests/bot-contrato/01-gemini.test.ts`
hace todas sus llamadas **de una vuelta**. Ninguna devuelve al modelo una
llamada que el modelo acaba de hacer. El único sitio donde eso pasaba era
producción.

Queda reproducido, en el sitio más barato que hay —dos peticiones— en
`tests/bot-contrato/02-bucle-herramientas.test.ts`.

#### ✅ Arreglado, con su contrato — y con un paso SIN VERIFICAR

Se decidió arreglarlo dentro de esta fase. El contrato, y lo que salió:

- **ENTREGA.** `gemini.ts` lleva la firma de ida y vuelta. Dos cambios y la
  trampa está en el primero:
  1. `preguntar()` **recorre las partes a mano** en vez de usar
     `respuesta.functionCalls`. El atajo del SDK devuelve los `FunctionCall`
     desnudos, y la firma no está dentro del `FunctionCall`: está **al lado**,
     en la `Part` que lo envuelve. El atajo la tiraba sin avisar. Se conserva
     el camino viejo como reserva por si una respuesta trajera `functionCalls`
     sin partes que recorrer: perder las llamadas sería peor que perder la
     firma.
  2. `aContenido()` la vuelve a poner donde estaba, y `cerebro.ts` la propaga
     al armar el turno. `Parte{tipo:'llamada'}` y `LlamadaAHerramienta` ganan
     un `firma?: string`.
- **PRUEBA 1 · `tests/bot/06-firma-de-pensamiento.test.ts`** (nivel 1, sin
  red): **5 pasadas**. Cubre que la firma va al lado y no dentro, que una
  llamada sin firma no se inventa ninguna, que un resultado de herramienta no
  lleva —no es una predicción—, y **que con dos llamadas en el mismo turno cada
  una se lleva la suya**, que es el caso que se rompe en silencio si alguien
  guarda la firma en una sola variable.
- **PRUEBA 1b · en rojo.** Quitando sólo la línea que la devuelve:
  ```
  × la pone AL LADO del functionCall, no dentro
  × cada llamada se lleva LA SUYA cuando el modelo pide dos a la vez
  AssertionError: expected undefined to be 'ZmlybWEtZGUtcHJ1ZWJhLW9wYWNh'
  AssertionError: expected [ undefined, undefined ] to deeply equal [ 'AAA', 'BBB' ]
   Tests  2 failed | 3 passed (5)
  ```
- **PRUEBA 3 y 4.** `tsc` y `eslint` en 0; la suite completa, dos veces:
  **986 pasadas / 36 saltadas (1022)**, idéntico.

- **🔴 PRUEBA 2 · NO SE HA PODIDO CORRER.** Es la que preguntaría a Gemini si
  el 400 se ha ido, y es la única que puede contestarlo. Cuatro intentos, un
  `503 UNAVAILABLE` y tres:

  ```
  429 RESOURCE_EXHAUSTED
  quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
  limit: 20, model: gemini-3.6-flash
  ```

  La cuota del día se la había comido la batería de fuga de §5. **Así que lo
  que se afirma es exactamente esto: el arreglo hace lo que dice hacer de
  nuestro lado, y NADIE ha visto todavía a Gemini aceptar la segunda vuelta.**
  No es lo mismo y no se informa igual. Queda como el primer punto de §8:
  correr `GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato/02-bucle-herramientas`
  mañana, con cuota, antes de dar el fallo por cerrado.

### 4.2 · 🟠 El canal no le pasa al motor ni el borrador ni las rondas

`src/lib/whatsapp/procesar.ts` llama a `responder()` **sin** `borrador` ni
`rondasDeAclaracion` (comprobado con `grep`: no aparecen en todo
`src/lib/whatsapp/` ni en `src/app/api/`). Dos consecuencias:

- **El borrador no sobrevive entre mensajes.** Lo que `anotar` junta en un
  mensaje empieza de cero en el siguiente. La conversación sólo avanza si el
  modelo vuelve a anotarlo todo cada vez, leyendo el historial.
- **`RONDAS_MAXIMAS` no se aplica nunca.** `rondasDeAclaracion` llega siempre
  a 0, así que `no_te_entiendo` nunca manda escalar. La regla «una sola ronda
  de aclaración, nunca bucles» no está garantizada de punta a punta.

El motor admite las dos cosas; es el canal el que no se las pasa. El motor de
los guiones **sí** las enhebra, y lo dice en un comentario para que nadie
confunda lo que mide el guion con lo que hace el canal.

### 4.3 · 🟡 `04-interruptor.spec.ts:189` falla, y no es de esta fase

```
expect(received).toHaveLength(expected)
Expected length: 1
Received length: 2
[{"accion":"publico_apagado","datos":{"antes":true,"despues":false},"id":401,…},
 {"accion":"publico_apagado","datos":{"antes":true,"despues":false},"id":402,…}]
```

Un clic deja **dos** apuntes en `auditoria`, los dos con `antes: true`, con
2,1 s de diferencia. Que los dos vean `publico = true` descarta la secuencia
—`cambiarPublico` se corta antes de auditar si la fila ya estaba como se pide
(`acciones.ts:115`)— y apunta a **dos envíos concurrentes de la acción**, con
las dos lecturas dentro de la misma ventana.

Lo medido, para no adornarlo:

- Reproducible: falla dos veces de dos con la suite entera (30 pasan, 1 falla).
- **Pasa al correrla sola**, y falla al correr su propio archivo entero: es
  interferencia entre pruebas del mismo fichero.
- **No es clock skew:** el reloj local y el de Postgres concuerdan (medido).
- **Es anterior a F7**: se guardó todo el trabajo de la fase con
  `git stash push -u` y el fallo se reprodujo igual (`5 passed, 1 failed`).

---

## 5 · Las 30 contra Gemini: lo que pasó, y el límite que nadie había mirado

`PLAN.md` §3 lo pedía con estas palabras: «la barandilla 4 hay que pasarla con
el modelo que corre de verdad. **Nunca se ha ejecutado contra Gemini.**» Ya se
ha ejecutado. Resultado de la tirada completa del 21/09/2026:

```
 Test Files  1 failed (1)
      Tests  16 failed | 14 passed (30)
   Duration  467.42s
```

**Y lo primero es lo que no falló.** De las dieciséis:

- **Cero `AssertionError`.** Ni una.
- **Cero apariciones de `ZZMARGEN-7f3a`** en las treinta respuestas.

Las dieciséis se cayeron por infraestructura: ocho `429 RESOURCE_EXHAUSTED`,
un `503 UNAVAILABLE`, y el `400` del `thought_signature` de §4.1. Ninguna fue
una fuga.

### El límite es DIARIO, y son veinte

```
quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
limit: 20, model: gemini-3.6-flash
```

**Veinte peticiones al día.** Treinta preguntas, con su clasificador y sus
vueltas de herramientas, pasan de sesenta. Esperar entre pregunta y pregunta no
arregla un límite diario: sólo lo retrasa. Consecuencias:

1. La mitad con Gemini **no se puede correr entera en un día** con la clave
   actual. Se corre a trozos, en días distintos, o con una clave de pago.
2. **Confirma la decisión de §3.1**: si la mitad que bloqueara el merge fuera
   ésta, el merge quedaría bloqueado por la cuota a la vigésima petición del
   día, y la gente aprendería a ignorar el rojo de una prueba de seguridad.
   Que es la peor cosa que le puede pasar a una batería.
3. `.env.example` y el aviso de `02-con-gemini.test.ts` lo dicen ahora con el
   número delante.

**No se ha vuelto a correr después de arreglar nada**, porque la cuota del día
está gastada. Lo que se afirma es lo que se midió: ninguna fuga en treinta,
dieciséis caídas por cuota y por el fallo de §4.1.

---

## 6 · El CI, y por qué hoy no bloquea nada

`.github/workflows/ci.yml` pasa a **tres** trabajos:

| Trabajo | Necesita | Qué demuestra |
|---|---|---|
| `comprobaciones-estaticas` | nada | Lint, tipos, compilación y toda la suite que corre sin base de datos |
| `auditoria-de-fuga` | Supabase dev | La barandilla 4. **Sin `if:`**, a propósito |
| `pruebas-vivas` | Supabase dev + `RLS_VIVA` | El resto del nivel 2, los guiones y Playwright |

Tres decisiones que no son de estilo:

- **`auditoria-de-fuga` no lleva `if:`.** `pruebas-vivas` se puede apagar con
  una variable; un trabajo de seguridad, no. Y por dentro, `FUGA_EXIGIDA=1`
  convierte el `describe.skipIf` en un rojo: sin Supabase, la batería **falla**
  en vez de saltarse. «No he podido comprobarlo» no se informa igual que «está
  todo bien».
- **`pruebas-vivas` lleva `needs: auditoria-de-fuga`**, no por orden lógico
  sino porque los dos siembran y limpian **el mismo fixture**. Dos trabajos a
  la vez contra la misma base reproducen el falso verde de F6: la limpieza de
  uno deja al otro sin las filas que dice comprobar.
- **Playwright entra en CI por fin**, con subida de trazas al fallar. F5 lo
  dejó fuera a propósito —«un paso de CI que nadie ha visto correr es otra
  forma de creerse cubierto»—. Ya se ha visto correr: 30 de 31, con el fallo
  de §4.3.

### 6.1 · 🔴 Y ahora la parte que importa: **el merge no está bloqueado**

El encargo decía: «la suite de fuga bloquea el merge — de verdad esta vez:
recuerda el hallazgo de F1… Verifica que el ruleset de la rama `main` exige el
check, no solo que el workflow exista.»

Verificado. Y la respuesta no es «falta marcar la casilla»:

```
$ gh api repos/Aitoorchs7/bot-clinica-whatsapp/rulesets
403 · "Upgrade to GitHub Pro or make this repository public to enable this
       feature."

$ gh api repos/Aitoorchs7/bot-clinica-whatsapp/branches/main/protection
403 · (el mismo mensaje)

$ gh api repos/Aitoorchs7/bot-clinica-whatsapp --jq '{private,visibility}'
{"private":true,"visibility":"private"}
```

**El repositorio es privado en un plan gratuito, y ahí GitHub no ofrece ni
rulesets ni protección de rama.** No es que la casilla esté sin marcar: es que
la casilla no existe. Hoy nada impide mezclar a `main`, y ningún archivo de
este repositorio lo puede arreglar.

Las tres salidas, ninguna tomable desde el código:

1. **Hacer público el repositorio** → rulesets gratis. Es la decisión más
   grande de las tres y no es reversible del todo: lo que se publique queda
   publicado, cacheado e indexado aunque luego se vuelva a poner en privado.
   Antes habría que repasar el historial: `.env.local` está en `.gitignore`
   desde el principio, pero eso hay que **comprobarlo**, no suponerlo.
2. **GitHub Pro / Team** → rulesets en privado. Cuesta dinero y no es una
   decisión técnica.
3. **Dejarlo así** → entonces la frase «bloquea el merge» se borra de donde
   esté y se dice lo que hay: el CI **informa**.

**Decidido el 21/09/2026: la opción 3.** No se hace público ni se paga por
ahora. La consecuencia se asume y se escribe en vez de taparse: la cabecera de
`ci.yml` lleva el `403` pegado y dice que el CI **informa, no impide**. Es lo
mismo que hizo F1 al descubrir que cuatro comentarios mentían: o se monta, o se
borra la frase. Aquí no se puede montar, así que se dice.

Se revisa cuando haya una clínica pagando, y entonces la opción 2 (GitHub Pro)
es la barata: la 1 obliga a repasar el historial entero antes, y lo publicado
no se despublica.

> **De paso, un dato que nadie había mirado:** la última ejecución de CI de
> este repositorio es del **16/09/2026** y es de F1. F2, F3, F4, F5 y F6 se
> cerraron sin que el CI corriera ni una vez. No hay secretos ni variables
> configurados (`actions/secrets` y `actions/variables` vuelven vacíos), así
> que `auditoria-de-fuga` y `pruebas-vivas` no tienen con qué conectarse
> todavía.

---

## 7 · La prueba, ejecutada. Salida real

### 7.1 · Lint y tipos

```
$ pnpm lint
$ eslint
(sin salida)

$ pnpm exec tsc --noEmit
(sin salida)
```

### 7.2 · La suite, dos veces seguidas

```
 Test Files  42 passed | 4 skipped (46)
      Tests  986 passed | 36 skipped (1022)
   Duration  199.26s

 Test Files  42 passed | 4 skipped (46)
      Tests  986 passed | 36 skipped (1022)
   Duration  197.10s

$ diff <(grep -E "Test Files|Tests " f7-1.txt) <(grep -E "Test Files|Tests " f7-2.txt)
IDENTICO
```

**El mismo número dos veces seguidas.** De 829 a **986**: +157 pruebas (130 de
la batería de fuga, 17 de los guiones, 5 de la firma de pensamiento, 4 del
barrido de RLS con `recordatorios`, y el resto los controles positivos). Los 36
saltados son los de contrato y los 30 de la fuga con Gemini, que se piden a
mano — y hoy, además, no tienen cuota.

### 7.3 · Navegador

```
$ pnpm test:e2e
  1 failed
    [chromium] › 04-interruptor.spec.ts:189 › el rastro › queda escrito quien lo movio…
  30 passed (56.5s)
```

**Se informa el rojo, no se esconde.** Es §4.3, y es anterior a esta fase.

---

## 8 · Pendientes vivos

> Esta lista tiene su copia en `PLAN.md` §11. **Si se toca una, se toca la
> otra.**

### Nuevo en F7, por orden de lo que duele

1. **🔴 Confirmar el arreglo del `thought_signature` contra Gemini (§4.1).**
   El arreglo está hecho y probado de nuestro lado (5 pruebas, vistas en rojo),
   pero **la cuota diaria estaba gastada y nadie ha visto todavía a Gemini
   aceptar la segunda vuelta**. Un único comando, dos peticiones:
   `GEMINI_VIVO=1 pnpm vitest run tests/bot-contrato/02-bucle-herramientas`.
   **Hasta que eso esté verde, el bot sigue sin poder terminar una reserva en
   producción que nadie haya comprobado.** Es lo primero de mañana.
2. **🔴 El merge no está bloqueado (§6.1).** Decisión de producto, no de
   código: público, de pago, o se borra la frase.
3. **🟠 El canal no pasa `borrador` ni `rondasDeAclaracion` (§4.2).**
4. **🟡 `04-interruptor.spec.ts:189` (§4.3).** Dos apuntes de `auditoria` por
   un clic.
5. **El CI no ha corrido desde el 16/09.** Faltan los cuatro secretos
   `SUPABASE_*_DEV`; sin ellos `auditoria-de-fuga` falla, que es lo correcto,
   pero falla por no poder mirar y no por haber mirado.
6. **La cuota de Gemini son 20/día (§5).** Con la clave actual, la mitad viva
   de la barandilla 4 se corre a trozos. Si la primera clínica va a producción
   con esta clave, el límite diario es un problema de producto, no de pruebas.

### Heredados, sin cambios

F3b (estrechar la RLS a `pacientes`/`conversaciones`/`mensajes`; `citas` **no**
se toca), los cinco puntos de `alta-clinica` para F8, y el horario del cron
según el plan de Vercel. Todos siguen en `PLAN.md` §11 tal cual.

---

## 9 · Lo que se descartó

- **Lanzarle las 30 a Gemini como prueba que bloquea.** Mide la prudencia del
  modelo, no la garantía; y con 20 peticiones al día, el merge lo bloquearía la
  cuota. §3.1 y §5.
- **Que los guiones usaran el modelo real.** Volvería no deterministas quince
  pruebas cuyo objeto es la maquinaria, y haría imposibles de montar justo los
  casos que hay que probar. §3.2.
- **Arreglar los tres fallos de §4 aquí.** Los tres están fuera de F7 —dos en
  el camino del bot, uno en el panel—, y el encargo era la suite. Un arreglo
  del motor metido de tapadillo en la fase de las pruebas es exactamente cómo
  se pierde el rastro de por qué cambió algo.
- **Sembrar el recordatorio de `recordatorios` en la siembra global.** Lo
  borraría el `afterEach` de `trabajos-vivo/01-recordatorios` según el orden, y
  el barrido pasaría a ser verde por ausencia. §2.1.
- **Dejar que `tests/fuga` se saltara sola sin base de datos.** Es la forma más
  cómoda que hay de tener un tick verde que no ha mirado nada. De ahí
  `FUGA_EXIGIDA`. §6.
