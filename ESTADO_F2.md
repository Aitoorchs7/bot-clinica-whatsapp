# Estado de F2 · Los bloques de prompt y las barandillas 1 y 2

> **Para quien retome F2**, en una conversación nueva o dentro de seis meses.
> Fecha: 18 de septiembre de 2026. Rama: `f1-base-de-datos-y-rls`.
>
> **F2 está cerrada y verificada contra una base de datos real.** Los diez
> bloques están escritos y sembrados, los cuatro módulos de `barandillas/`
> montan el prompt de punta a punta, y las 330 pruebas corren en vivo sin
> ninguna saltada. La batería ha demostrado que **mira**: se simuló la RLS
> caída y se puso roja en los dos sitios correctos, y se intentó el cambio que
> deja ciego al contador y lo bloqueó un test estático. El apartado
> [§5 La prueba de que la prueba sirve](#5--la-prueba-de-que-la-prueba-sirve)
> es el que hay que leer si solo se va a leer uno.
>
> Contexto previo: [ESTADO_F1.md](ESTADO_F1.md), y en particular su **§10**,
> que es lo que F2 cambió de F1.

---

## 1 · Qué hay construido

### Los diez bloques de prompt

`contenido/bloques/`, 13.726 caracteres. Nueve vienen de la V1 telefónica
(`Bot Clinica Demo V1/4 Agente/`, **solo lectura**, intacta: mismas marcas de
tiempo que antes de empezar) y uno es nuevo.

| Archivo | orden | activo | car. | Qué pasó al pasar de voz a texto |
|---|---:|---|---:|---|
| `00 - LEEME primero` | 0 | **no** | 3.749 | Reescrito para V2: Supabase en vez de hoja de cálculo, `pnpm bloques`, la tabla de los nueve huecos |
| `05 - Aviso inicial` | 5 | sí | 1.385 | **NUEVO.** Asistente virtual + política de privacidad en el primer mensaje |
| `10 - Quien es` | 10 | sí | 208 | «asistente telefónico» → «asistente virtual»; «hablas por teléfono» → «escribes por WhatsApp» |
| `20 - Como habla` | 20 | sí | 1.484 | Fuera los números en palabras, fuera la prohibición de emojis y listas, fuera «esto es una llamada» |
| `25 - No interpretes de mas` | 25 | sí | 650 | **Palabra por palabra.** `diff` limpio contra V1 |
| `30 - Que no puede decir` | 30 | sí | 1.522 | **Palabra por palabra.** `diff` limpio contra V1 |
| `40 - Cuando cuesta entenderse` | 40 | sí | 2.611 | Reescrito entero: faltas de ortografía, notas de voz transcritas, mensajes a trozos |
| `50 - Como coge una cita` | 50 | sí | 1.465 | El teléfono ya viene del canal; el resumen final es la lista que sí vale |
| `60 - Cuando pasa a una persona` | 60 | sí | 505 | Añadido el teléfono de la clínica y el mensaje seguro que va primero y va solo |
| `90 - Lo que sabe` | 90 | sí | 147 | Palabra por palabra |

**`25` y `30` no se tocaron porque son el núcleo del producto**, y el canal no
los afecta: no interpretar de más y no inventarse nada se dicen igual por
teléfono que por escrito. Hay una prueba que exige sus frases literales.

El `00` lleva `activo: no` y por eso no entra en el prompt — y como la política
del bot filtra `activo = true`, **ni siquiera le llega**.

### Los cuatro módulos

`src/lib/barandillas/`, 889 líneas.

| Archivo | Líneas | Qué hace |
|---|---:|---|
| `origen.ts` | 87 | `tabla#id` para cada dato inyectado. **Nunca contenido**: es lo que permite avisar de una fuga sin repetir el secreto |
| `filtro.ts` | 252 | Carga con el cliente del bot y devuelve `{filas, recuento: {total, publicas, retenidas}}` |
| `contador.ts` | 147 | Escribe `faq: 14 de 14 (0 confidenciales)` en el log y en `eventos` |
| `montaje.ts` | 403 | Ordena, descarta y rellena los nueve huecos |

### El script de alta

`scripts/sembrar-bloques.mjs`, 205 líneas. `pnpm bloques <slug> [--forzar]`.

Lleva la carpeta a la tabla `bloques_prompt`. Usa `service_role` porque es un
script de alta, que es el único uso que admite `.claude/CLAUDE.md`. **Se niega a
sembrar si la clínica ya tiene bloques**: son editables desde el panel, y una
clínica que lleve seis meses afinando su prompt no puede perderlo porque
alguien relance el alta.

`bloques_prompt.clinica_id` es NOT NULL desde F1, así que **no hay bloques
globales**: cada clínica se lleva su juego completo. Un NULL dentro de una
política RLS es la fuente número uno de fugas entre inquilinos.

El `titulo` que va a la base es **el nombre del archivo sin el `.md`**, no el
del frontmatter. Un solo nombre: único, ordena solo, y es el que lleva la
convención del guion bajo.

### Los nueve huecos

| Hueco | De dónde sale |
|---|---|
| `{{clinica}}` `{{bot}}` `{{trato}}` | La fila de `clinicas` |
| `{{privacidad}}` | La clave `politica_privacidad` de `config`. **Hueco propio, ver §3.1** |
| `{{fecha_hoy}}` | El reloj, en la zona horaria de la clínica |
| `{{datos}}` | Teléfono de recepción + las filas **públicas** de `config` |
| `{{tratamientos}}` `{{faq}}` `{{horario}}` | Las filas **públicas** de cada tabla |

Un hueco que no esté en esa lista se avisa en el registro y **se deja escrito
tal cual**. No revienta el montaje: si una clínica escribe `{{horarios}}` en
plural un martes por la tarde, el bot sigue atendiendo. Y hay una prueba
estática que caza ese plural antes de que llegue a nadie.

Que ponga «públicas» no es un filtro del montador: **es la RLS**. Ver §7.

---

## 2 · Los comandos, con su salida real

```
pnpm lint          → (sin salida: limpio)
pnpm typecheck     → (sin salida: limpio)

pnpm vitest run tests/            (dos tiradas seguidas)
  → Test Files  12 passed (12)      Test Files  12 passed (12)
            Tests  330 passed (330)       Tests  330 passed (330)
         Duration  36.77s               Duration  36.47s
    codigo de salida: 0              codigo de salida: 0
    saltadas: 0

base al terminar: clinicas: 0 | usuarios: 0
```

De **262 a 330: 68 pruebas nuevas**, ninguna saltada.

| Archivo nuevo | Pruebas | Necesita base de datos |
|---|---:|---|
| `tests/barandillas/01-montaje.test.ts` | 21 | no |
| `tests/barandillas/02-bloques.test.ts` | 17 | no |
| `tests/barandillas/03-filtro-y-contador.test.ts` | 14 | **sí** |
| `tests/barandillas/04-sin-filtro-en-codigo.test.ts` | 16 | no |

Tres de los cuatro archivos corren en una máquina recién clonada, así que el
trabajo `comprobaciones-estaticas` de CI cubre 54 de las 68 sin credenciales.

### El script de alta, probado de punta a punta

Contra una clínica temporal, creada y borrada para esto:

```
pnpm bloques f2-prueba-bloques
  → 10 bloques sembrados en "Clinica F2 de prueba" (9 activos, 1 no).   codigo: 0

pnpm bloques f2-prueba-bloques            (otra vez, sin --forzar)
  → "Clinica F2 de prueba" ya tiene 10 bloques. Se han editado desde el panel y
    volver a sembrar los borraria. Si de verdad quieres reemplazarlos:
      pnpm bloques f2-prueba-bloques --forzar                            codigo: 1

pnpm bloques f2-prueba-bloques --forzar
  → ⚠  --forzar: se reemplazan los 10 bloques de "Clinica F2 de prueba".
    10 bloques sembrados en "Clinica F2 de prueba" (9 activos, 1 no).    codigo: 0
```

Y el prompt montado sobre esa clínica —sembrada por el script, no por el
andamiaje de pruebas— con el cliente del bot de verdad:

```
config: 0 de 0 (0 confidenciales)      huecos sin rellenar: []
faq:    0 de 0 (0 confidenciales)      ¿lleva "{{" ?  false
bloques: 9 de 9 (0 confidenciales)
```

Los cuatro estados vacíos salieron escritos con todas las letras —«(esta
clinica no tiene ninguna pregunta frecuente aprobada)»— y no en blanco. **Un
hueco vacío invita a rellenarlo, y lo que rellena un modelo cuando no tiene el
dato es exactamente lo que este producto no hace.**

---

## 3 · Las dos condiciones que se pusieron antes de aprobar el contrato

### 3.1 · El enlace de privacidad pasa a hueco propio

Al principio `05 - Aviso inicial` sacaba el enlace de `{{datos}}`, es decir, de
una línea `politica_privacidad: https://…` dentro de una lista de pares
clave/valor. Se cambió a un hueco dedicado, `{{privacidad}}`.

El motivo no es de estilo: **identificarse y enlazar la política de privacidad
es una obligación legal** (art. 50 del Reglamento europeo de IA, art. 13 del
RGPD) y no puede depender de que el modelo redacte bien una URL que ha leído en
una lista. Ahora entra sola, literal, y el bloque manda copiarla tal cual.

Y **deja de aparecer dentro de `{{datos}}`**. Dos copias del mismo enlace, una
presentada como «dato» y otra como texto literal, es una invitación a
parafrasear la primera. Hay una prueba que lo exige:

```ts
expect(montado.texto).not.toContain('politica_privacidad:')
```

Montado, sale así:

```
Y dónde está la política de privacidad. El enlace es exactamente este:

https://ejemplo.test/privacidad

Cópialo tal cual, carácter a carácter. No lo acortes, no lo reescribas...
Si en lugar de un enlace ves que esta clínica no ha configurado su política
de privacidad, no te lo inventes: di que recepción se la envía enseguida.
```

Sin configurar devuelve texto explícito, nunca algo que se parezca a una
dirección: hay una prueba de que la salida **no contiene `http`**.

### 3.2 · El filtro en código, prohibido por un test estático

`tests/barandillas/04-sin-filtro-en-codigo.test.ts`, mismo patrón que
`tests/rls/05-sin-service-role.test.ts` de F1: estático, sin base de datos.

Prohíbe que el camino del bot filtre por `publico` o por `clinica_id` **en la
consulta**. Nació porque ese cambio era el único riesgo vivo que quedaba, y no
lo caza ninguna prueba en vivo:

| Con la RLS rota… | sin `.eq('publico', true)` | con él |
|---|---|---|
| `retenidas` | 1 → **salta la alarma** | 0 → silencio |
| La prueba obligatoria | pasa (la guardia hizo su trabajo) | pasa |
| ¿Alguien se entera? | **sí** | **no** |

El sistema seguiría siendo seguro por casualidad —nada confidencial llegaría al
prompt—, pero la barandilla 2 habría dejado de servir para lo único que sirve.
El síntoma que buscan las pruebas en vivo es justo el que ese `.eq` borra.

Cuatro detalles del guardián:

- **Cubre también `clinica_id`.** Es el mismo fallo por el otro lado: filtrar el
  inquilino en la consulta taparía una fuga entre clínicas.
- **Tiene las dos mitades.** Prohíbe el filtro *y* exige que sigan estando las
  tres comprobaciones en código (`publico === true`). Una prueba que solo
  prohíbe algo pasa igual con el archivo vacío (ESTADO_F1 §5.2).
- **`activo` sí se puede filtrar**, y hay una prueba que lo fija: es negocio, no
  seguridad. Un tratamiento retirado del catálogo no se ofrece, y que llegue no
  es ninguna fuga.
- **Ignora comentarios respetando comillas.** Hace falta de verdad: la cabecera
  de `filtro.ts` contiene literalmente `.eq('publico', true)` para explicar por
  qué no está. Un buscador ingenuo lo denunciaría, el test se volvería ruido, y
  el siguiente que pasara por aquí lo relajaría hasta que dejara de servir.

**Se extiende solo.** Considera «camino del bot» todo `src/lib/barandillas/` más
cualquier archivo de `src/` que use `crearClienteBot`. Las seis herramientas de
F3 entrarán en la lista el día que lo importen, sin que nadie tenga que
acordarse de venir aquí.

---

## 4 · La prueba de las dos tiradas

El criterio de F1 se mantiene: no basta con que pase, tiene que **dar el mismo
número dos veces seguidas**. Una batería de seguridad cuyo recuento cambia entre
dos ejecuciones no demuestra nada, ni cuando falla ni cuando pasa.

```
tirada 1                          tirada 2
 Test Files  12 passed (12)        Test Files  12 passed (12)
      Tests  330 passed (330)           Tests  330 passed (330)
   Duration  36.77s                  Duration  36.47s
codigo de salida: 0               codigo de salida: 0
saltadas: 0                       saltadas: 0
```

Y la base a cero clínicas y cero usuarios al terminar las dos.

---

## 5 · La prueba de que la prueba sirve

**Este es el apartado que justifica la fase entera.** 330 en verde demuestran
que la suite *corre*. Solo esto demuestra que *mira*.

### 5.1 · La barandilla 1 caída, en dos capas

Se simuló inyectando un cliente `service_role` en `filtro.ts`, que es
exactamente «las políticas han dejado de filtrar».

**CAPA 1 — solo la RLS de `faq` caída.** Las filas confidenciales llegan al
proceso del bot y la guardia en código las caza:

```
prompt montado · clinica d9bfd6b5-...
  config: 2 de 2 (0 confidenciales)
  tratamientos: 1 de 1 (0 confidenciales)
  faq: 1 de 2 (1 confidenciales)          <- la linea, con el formato de CLAUDE.md
  horarios: 10 de 10 (0 confidenciales)
  bloques: 10 de 10 (0 confidenciales)
  ⚠  BARANDILLA 1 CAIDA: 1 fila(s) han llegado al bot sin derecho a hacerlo y se
     han descartado aqui. Origenes: faq#5a128962-9ff2-450a-82b6-4d5080f6881c.

  → AssertionError: expected 1 to be +0        (la asercion `retenidas === 0`)
```

**El aviso nombra la fila y no dice lo que hay dentro.** Hay una prueba que
exige que el marcador `ZZMARGEN-7f3a` no aparezca en el log: un aviso de fuga
que copie el secreto es otra fuga. Para eso existe `origen.ts`.

**CAPA 2 — la RLS caída *y* la guardia anulada.** Es el escenario que describe
la prueba obligatoria del encargo:

```
--- SIN NINGUNA BARANDILLA: el bot ve 2 de 2, y COINCIDEN ---
--- ¿sale el marcador? true ---

  → AssertionError: expected 2 to be less than 2
```

Un hallazgo que conviene recordar: en un primer intento se inyectó el cliente
`service_role` **entero**, y no llegó a evaluarse nada de `faq` porque
`cargarDatosDelPrompt` se paró antes:

```
Error: El bot de la clinica fab3255c-... no ha recibido exactamente su clinica
y solo la suya (recibidas 2, suyas 1). Sin ese dato no se monta ningun prompt.
```

Es el cerrojo de inquilino disparando primero. Se pide `clinicas` sin
`.single()` justamente por esto: con `.single()`, una RLS rota que devolviera
también la clínica de al lado habría reventado con un error de PostgREST que no
distingue «no hay ninguna» de «hay dos», y se habría perdido el único síntoma
útil.

### 5.2 · El guardián estático, comprobado

Se le añadió el `.eq('publico', true)` a `filtro.ts` —con la restauración atada
en la misma orden, como manda ESTADO_F1 §5.1— y se puso rojo:

```
FAIL > ningun archivo filtra por `publico`
AssertionError: Filtrar por `publico` en la consulta deja ciega a la barandilla 2:
con la RLS rota, `retenidas` seguiria siendo 0 y nadie se enteraria. La RLS
filtra; el codigo comprueba y avisa. Lee la cabecera de filtro.ts.
+ [ { "archivo": "src/lib/barandillas/filtro.ts", "hallazgos": [".eq('publico'"] } ]
```

Nombra el archivo, el hallazgo y el porqué. Y el detector tiene sus propias
pruebas —ocho formas de filtrar que tiene que cazar, cuatro que no debe
confundir— porque **un guardián que no se ha visto nunca saltar es un guardián
sin comprobar**.

### 5.3 · `supabase db query` ya no existe

Nota operativa que corrige a ESTADO_F1 §5.1. Para apagar la RLS de verdad,
aquel apartado usa:

```
supabase db query --linked "alter table public.faq disable row level security;"
```

**Ese subcomando no está en la CLI instalada.** `supabase db --help` lista
`diff`, `dump`, `push`, `pull` y `reset`, y ninguno ejecuta SQL suelto. Por eso
F2 simuló la caída inyectando el cliente en vez de apagar la RLS: es más seguro
—no toca la seguridad del proyecto— y además es lo único disponible.

Si algún día hace falta apagarla de verdad, hay que resolver antes por dónde se
manda el SQL. Y sigue valiendo la lección de §5.1: **la restauración va atada en
la misma orden**, nunca en pasos sueltos.

---

## 6 · Formas de que esto «funcione» sin servir

| # | Fallo | Veredicto |
|---|---|---|
| 1 | El contador dice «lo he visto todo» y es una tautología | ⚠ **Vivo, y es una decisión.** Ver §7 y §8.1 |
| 2 | Un hueco desconocido rompe el montaje o desaparece sin dejar rastro | ✓ **Cerrado.** Se deja literal y se avisa; y una prueba estática caza los huecos inventados en la carpeta |
| 3 | La siembra de los bloques reales invalida las aserciones RLS de F1 | ✓ **Cerrado.** Dos aserciones ajustadas, ninguna debilitada. ESTADO_F1 §10 |
| 4 | El aviso de fuga repite el secreto en el log | ✓ **Cerrado.** Se registra el origen, nunca el contenido, y hay prueba |
| 5 | Alguien «optimiza» `filtro.ts` con `.eq('publico', true)` y deja ciegas a las dos barandillas | ✓ **Cerrado en §3.2.** Rompe el build |
| 6 | El bloque 05 se salta y el bot no se identifica | ✓ **Parcial.** Hay prueba de que el bloque existe, está activo, va el primero y exige el aviso. Que el modelo lo **obedezca** es la barandilla 4, en F7 |
| 7 | El modelo parafrasea el enlace de la política de privacidad | ✓ **Cerrado en §3.1.** Entra solo y literal, y no hay segunda copia que parafrasear |
| 8 | Un bloque de atrezo de las pruebas se cuela en el prompt | ✓ **Cerrado.** Llevan `_` delante y el montador los descarta; hay prueba de que no salen |
| 9 | La suite da un número distinto cada vez | ✓ **Cerrado en §4.** Dos tiradas, mismo número |

---

## 7 · Qué se decidió, y sobre todo qué se descartó

### ❌ Descartado: una función `security definer` que devuelva los totales

Es la única forma de que el contador diga «14 de **16**» en ejecución: el bot no
puede saber cuántas filas hay, porque las que no debe ver **no existen para él**
— ese es el producto. Habría sido una función en `public`, `security definer`,
que devolviera solo enteros.

Se descartó a propósito: **el precio era abrir un agujero para poder medir que
no hay agujeros.** F1 cerró con cero funciones `SECURITY DEFINER` y F2 lo
mantiene. El total de verdad se cuenta en la prueba, con `service_role`, desde
fuera. Ver §8.1 para lo que eso cuesta.

### ❌ Descartado: `.eq('publico', true)` en las consultas

Parece una mejora —menos filas por el cable, la intención más explícita— y es el
cambio que deja ciegas a las dos barandillas a la vez. Está prohibido por un
test (§3.2) y explicado en la cabecera de `filtro.ts`.

**La regla, generalizada:** filtrar en código lo que ya filtra la RLS no es
defensa en profundidad, es taparle la boca al detector. La RLS filtra; el código
comprueba y avisa.

### ❌ Descartado: el enlace de privacidad como una línea más de `{{datos}}`

Ver §3.1.

### ✅ Elegido: `titulo` = el nombre del archivo

Y no el `titulo:` del frontmatter, que se queda como etiqueta heredada de V1 y
no viaja a la base. Un solo nombre, único, que ordena solo y lleva la convención
del guion bajo.

### ✅ Elegido: el atrezo de las pruebas lleva `_` delante

Los dos bloques de atrezo de F1 se renombraron a `_atrezo rls activo` y
`_atrezo rls inactivo`, en `orden` 900 y 910. Así no se cuelan en el prompt **y
de paso la regla del guion bajo queda comprobada contra datos que existen de
verdad** en lugar de inventados. ESTADO_F1 §10.

### ⚪ Se deja: el montador vuelve a comprobar `activo`

La política del bot ya filtra `activo = true`, así que para el bot es
redundante. No lo es para el panel, que lee con el cliente de la clínica y **sí**
ve los borradores: sin esa comprobación, la vista previa enseñaría un prompt que
el bot nunca tendrá. No es el doble filtrado que `filtro.ts` evita, porque aquí
no hay ningún fallo que tapar.

---

## 8 · Lo que queda pendiente

**Ninguno bloquea F3.**

### 8.1 · En ejecución, el contador no puede decir «de 16»

Es la consecuencia aceptada de §7. En producción la línea dirá
`faq: 14 de 14 (0 confidenciales)` mientras todo funcione, y el segundo número
solo se separará del primero si una fila llega sin derecho.

**La barandilla 2 es, por tanto, garantía de prueba en cuanto al total, y
garantía de ejecución en cuanto a lo retenido.** Está escrito en la cabecera de
`contador.ts` y no debe «arreglarse» sin volver a discutir §7.

### 8.2 · La clínica de desarrollo solo existe durante la tirada

No hay ninguna clínica persistente en la base: `rls-prueba-a` la crea
`globalSetup` y la borra el teardown. Los bloques se siembran ahí en cada
ejecución, con el mismo código que usa `pnpm bloques`.

Para trastear a mano hay que crear una clínica y sembrarla, como se hizo en §2.

### 8.3 · `politica_privacidad` hay que sembrarla en el alta

El bloque 05 depende de la clave `politica_privacidad` de `config`, con
`publico = true`. Si no está, el bot dice que recepción enviará la política —lo
correcto— pero **la clínica estaría sin cumplir el art. 13 del RGPD**.

**Entra en el guion de la skill `alta-clinica` (F8): hay que preguntarla y
negarse a dar de alta sin ella.** Hoy no hay nada que lo fuerce.

### 8.4 · Los dos pendientes de F1 siguen abiertos

1. El CI no impide mezclar: falta marcar `comprobaciones-estaticas` como check
   obligatorio en Settings > Branches.
2. La mitad viva no corre en CI: faltan la variable `RLS_VIVA=true` y los cuatro
   secretos `SUPABASE_*_DEV`.

Con F2 esto pesa más que antes: de las 68 pruebas nuevas, 54 no necesitan
credenciales y se quedarían sin bloquear nada igual.

### Limitaciones conocidas

- La clínica B no tiene bloques sembrados, a propósito: es lo que hace
  comprobable que el bot de B no ve el prompt de A.
- `montarPrompt` no corta por longitud. Con diez bloques y una clínica pequeña
  sobra sitio; el día que una clínica tenga cien preguntas frecuentes habrá que
  recuperar por similitud, que es lo que anticipa el índice vectorial que la
  migración 002 deja escrito y sin crear.
- El separador de frontmatter no es YAML de verdad: `clave: valor`, una por
  línea. Si algún día hace falta YAML, el sitio está marcado en
  `separarFrontmatter`.

---

## 9 · Lo que F2 cambió de F1

Dos archivos, y está contado con sus diffs en **[ESTADO_F1.md §10](ESTADO_F1.md)**:
`tests/ayuda/siembra.ts` (la clínica A pasa a llevar el prompt de verdad) y
`tests/rls/02-estructura.test.ts` (dos aserciones, ninguna debilitada).

De ahí salió una regla que vale para toda la suite:

> Un test que escribe para demostrar que se puede escribir tiene que escribir
> **el valor que ya estaba**. Si no, no está comprobando un permiso: está
> cambiando el mundo para los que vienen detrás.

No se tocó ninguna migración, ninguna política RLS, `sin_solape` ni los tres
clientes de Supabase.

---

## 10 · Reglas del proyecto que siguen mandando

Las mismas de ESTADO_F1 §9, más las que añade F2:

- **No tocar sin confirmación explícita:** las políticas RLS de
  `supabase/migrations/`, **los bloques de prompt de `contenido/bloques/`**, el
  constraint `sin_solape`, y los tres clientes de Supabase.
- **No filtrar por `publico` ni por `clinica_id` en la consulta**, en ningún
  archivo del camino del bot. Rompe el build.
- El prompt de sistema sale de `montarPromptDeDatos()`, nunca de un string en el
  código.
- El contador corre en cada prompt montado. No es opcional.
- `pnpm`, nunca `npm` ni `yarn`. Ver ESTADO_F1 §5.1.
- `CURSO AGUSTIN MEDINA\PAGO` y `Bot Clinica Demo V1` son **solo lectura**.
- Antes de tocar un archivo, el contrato de cinco campos: ENTREGA, PRUEBA,
  LÍMITES, SUPUESTOS, FALLOS. Al cerrar se ejecuta PRUEBA y se pega la salida
  real; el contrato no se reescribe para que encaje con lo que salió.
