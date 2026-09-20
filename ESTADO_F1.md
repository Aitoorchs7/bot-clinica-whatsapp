# Estado de F1 · Base de datos y RLS

> **Para quien retome F1**, en una conversación nueva o dentro de seis meses.
> Fecha: 17 de septiembre de 2026. Rama: `f1-base-de-datos-y-rls`.
>
> **F1 está cerrada y verificada contra una base de datos real.** Las siete
> migraciones están aplicadas, las 262 pruebas corren en vivo sin ninguna
> saltada, y la batería ha demostrado que **mira**: se apagó a mano la RLS de
> una tabla y se puso roja en los sitios correctos. El apartado
> [§5 La prueba de que la prueba sirve](#5--la-prueba-de-que-la-prueba-sirve)
> es el que hay que leer si solo se va a leer uno.

---

## 1 · Qué hay construido

### Las siete migraciones, aplicadas

`supabase/migrations/`, 2.295 líneas de SQL. Marca de tiempo de 14 dígitos
porque `supabase db push` rechaza `001_…`; el orden se conserva.

| Archivo | Líneas | Qué hay |
|---|---:|---|
| `20260916100100_extensiones.sql` | 25 | `vector`, `btree_gist` en el esquema `extensions`; `pg_cron` |
| `20260916100200_tablas.sql` | 451 | 10 enums, 15 tablas, índices, `enable row level security` en las 15 |
| `20260916100300_solape.sql` | 47 | El constraint `sin_solape` (`EXCLUDE USING gist`) |
| `20260916100400_rls.sql` | 863 | Esquema privado `autorizacion` con 6 funciones auxiliares; **67 políticas**; revocación de privilegios a `anon` |
| `20260916100500_rpc.sql` | 356 | `consultar_huecos` y `crear_cita`, las dos `security invoker` |
| `20260916100600_retencion.sql` | 130 | Esquema privado `mantenimiento`, `purgar_historial`, job de `pg_cron` a las 03:15 |
| `20260916100700_integridad.sql` | 423 | Los arreglos de la auditoría (ver §7) |

`supabase db push` las aplicó las siete de una pasada, sin un solo error.
`supabase migration list --linked` confirma que local y remoto cuadran.

**Eso cerró el riesgo que abría el commit anterior:** las 39 pruebas estáticas
de la 007 demostraban que el SQL *decía* lo correcto; ninguna demostraba que
Postgres lo *aceptara*. Un `do $$` mal formado o un `format()` con los
argumentos cambiados habría pasado los 34 tests estáticos y reventado aquí.
No reventó.

### Invariantes, ahora comprobadas en vivo

- **15 tablas, 15 con RLS activada.** Y dos veces: junto a cada `create table`
  (lo exige `CLAUDE.md`) y otra vez de forma idempotente al principio de la 004.
- **67 políticas, ninguna `FOR ALL`, todas `TO authenticated`.** Todo `UPDATE`
  lleva su `WITH CHECK` y su política de `SELECT` — sin la segunda, la
  actualización devuelve cero filas en silencio y el panel diría «guardado»
  sin guardar.
- **Cero funciones `SECURITY DEFINER`.** No hizo falta ninguna: `pg_cron`
  ejecuta el job como `postgres`, que ya tiene `BYPASSRLS`.
- **Ni una aparición de `user_metadata`.** Solo `app_metadata`.
- La barandilla 1 está en el SQL, no en el prompt: las tres políticas del bot
  sobre `config`, `tratamientos` y `faq` llevan `and publico = true`.

### El patrón de política, literal

Es el que hay que copiar para cualquier tabla nueva:

```sql
create policy faq_bot_select on public.faq
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and publico = true          -- <- LA linea
  );
```

El `(select …)` **no es estilo**. Sin el subselect, la función se evalúa una vez
por fila en lugar de una vez por consulta.

### Los tres clientes

`src/lib/supabase/`, en la lista de «no tocar sin confirmación» de `CLAUDE.md`.
No se han tocado en toda esta fase.

- `navegador.ts` — `createBrowserClient`, clave anónima, para el panel.
- `servidor.ts` — `createServerClient` de `@supabase/ssr` con cookies. El
  `setAll` va en `try/catch` porque desde un Server Component no se pueden
  escribir cabeceras; las escribirá `proxy.ts` (**nunca** `middleware.ts`: en
  Next.js 16 se ignora en silencio y las rutas quedan públicas sin error).
- `bot.ts` — JWT propio firmado con `jose`, HS256, `app_metadata {rol:'bot',
  clinica_id}`, caducidad 5 minutos, caché por proceso. `service_role` no
  aparece aquí ni en ningún archivo del camino del bot, y hay un test que
  recorre `src/` para comprobarlo.

---

## 2 · Los cuatro comandos, con su salida real

```
supabase db push
  → Applying migration 20260916100100_extensiones.sql ... (las siete)
    {"upToDate":false,"migrations":[...7...],"message":"Finished supabase db push."}

pnpm tipos                        # = supabase gen types --project-id "$SUPABASE_PROJECT_REF"
  → src/tipos/bd.ts regenerado.    955 lineas: 15 tablas, 2 RPC, 9 enums

supabase db advisors --linked --type all --level info
  → Total de avisos: 53
    Por nivel: {"INFO":35,"WARN":18}
    SEGURIDAD (cualquier nivel): NINGUNO

pnpm vitest run tests/            (dos tiradas seguidas)
  → Test Files  8 passed (8)        Test Files  8 passed (8)
          Tests  262 passed (262)         Tests  262 passed (262)
       Duration  26.10s                Duration  27.11s
```

**Dos desviaciones de la letra de los comandos, ambas forzadas.** `gen types`
se lanza como `pnpm tipos` porque `$SUPABASE_PROJECT_REF` vive en `.env.local`
y el agente no lo lee; el script lo carga con Node y mantiene la referencia
fuera del historial de consola. Y `db advisors` **necesita `--linked`**: sin
esa bandera va a la base local y muere con `ECONNREFUSED 127.0.0.1:54322`.

### Sobre los avisos del asesor

Cero de seguridad. Ningún `rls_disabled_in_public`, ningún
`security_definer_view`, ningún `function_search_path_mutable`. Los 35 INFO son
`unused_index` sobre una base recién creada donde nada ha consultado todavía.

Los 18 WARN son todos `multiple_permissive_policies`, de categoría
**rendimiento**: dos políticas permisivas por tabla y acción, una del bot y una
de la clínica. **Es el diseño, a propósito, y no se van a fusionar.** Juntarlas
en una sola escondería la línea `and publico = true` dentro de una condición
compuesta, que es exactamente la línea que tiene que poder leerse de un vistazo
en una auditoría.

### Supuestos que caen confirmados

Los siete que quedaban abiertos, todos verificados por el `db push`:

1. **PostgreSQL 15 o superior** → es **17.6.1**. ✓
2. `btree_gist` soporta `uuid with =` → la 003 aplicó. ✓
3. `pg_cron` se activa desde una migración en el plan gratuito → la 006 aplicó. ✓
4. El secreto HS256 sigue firmando tokens que PostgREST acepta → los 15 tests
   de `el bot de la clinica B no ve NADA de la clinica A` pasan. ✓
5. `gen types --project-id` funciona sin Docker → 955 líneas. ✓
6. Revocar los `GRANT` de `anon` no rompe nada → los 17 tests de `anon` pasan. ✓
7. Las nueve claves foráneas compuestas no chocan → la 007 aplicó. ✓

---

## 3 · Los siete defectos que destapó la primera ejecución en vivo

Las 169 pruebas vivas llevaban desde su nacimiento saltadas. Al correr de
verdad por primera vez, **ninguna falló por la RLS**: el SQL aguantó entero.
Falló el andamiaje. Los siete, con su arreglo:

| # | Defecto | Dónde | Arreglo |
|---|---|---|---|
| A | **La suite no era determinista.** `clienteUsuario` iniciaba sesión en cada `it()`; los `it.each` de 04 solos hacían 26, y la tirada pasaba de 50 en 28 s. Supabase Auth corta con `Request rate limit reached` y **dos ejecuciones seguidas daban 34 y 36 fallos** | `tests/ayuda/clientes.ts` | Una sesión por usuario y proceso, cacheada en un `Map`. De ~50 inicios de sesión a 4. Se sigue iniciando sesión de verdad; se reutiliza el token, como un navegador con la pestaña abierta |
| B | **`clinicas` no tiene columna `clinica_id`** y el barrido de aislamiento se la pedía a las 15 tablas → `42703`. Esa comprobación **nunca había probado nada sobre `clinicas`** | `tests/rls/04-aislamiento.test.ts` | `TABLAS` gana un campo `columna`: `id` para `clinicas`, `clinica_id` para las otras catorce |
| C | **El uuid nulo no es un v4** y `bot.ts` lo rechaza antes de firmar, con razón. El test moría sin llegar a tocar la base | `tests/rls/04-aislamiento.test.ts` | `randomUUID()`. **`bot.ts` no se toca**: su severidad es correcta y está en la lista de no tocar |
| D | **Una limpieza que no limpiaba.** La hacía el cliente de recepción… y el test de doce líneas más abajo demuestra que recepción **no tiene DELETE**. No-op garantizado por diseño: la fila sobrevivía y el mismo `filaNueva` chocaba contra `unique (clinica_id, codigo)`. El insert devolvía null, el test descartaba el `error`, y el fallo salía como un `TypeError` sin relación | `tests/rls/01-conocimiento.test.ts` | Limpieza con `service_role` dentro de `onTestFinished`, buscando por `clinica_id` + la clave única (no por id: si el insert falla no hay id). Y los `insert` dejan de tragarse el `error` |
| E | **Falta `email_avisos`**, que es `not null` → `23502`. El test no llegaba a probar lo que decía probar | `tests/rls/06-integridad.test.ts` | Columna añadida |
| F | **Una clínica que nadie limpia.** El test de la baja crea `rls-prueba-baja` con paciente y cita, y solo la borra si todo va bien — pero `limpiar()` solo conoce los slugs `rls-prueba-a` y `-b`. Si falla a medias, la tirada siguiente muere en `exigirBaseDeDesarrollo` | `tests/rls/06-integridad.test.ts` | Red de `onTestFinished` que borra por slug. El borrado del final sigue siendo la **aserción** |
| — | **`tsc` en rojo** en cuanto `bd.ts` dejó de ser un marcador: dos `Record<string, unknown>` llegando a clientes tipados. Solo saltaban ahí porque el cliente del bot está tipado y el de `clienteUsuario` no | `01-conocimiento`, `huecos-y-citas` | Dos casts, con el porqué escrito al lado |

**Ninguna aserción de seguridad cambió de sentido.** Un solo `expect` desaparece
del diff y es el que se generalizó a `expect(fila[columna])`. `01-conocimiento`
*gana* dos: los errores de alta que antes se descartaban.

### Un error de diagnóstico que conviene no repetir

Durante el análisis se afirmó que había **filas huérfanas** en la base de dev de
tiradas anteriores. **Era falso.** `limpiar()` corre en el teardown de
`globalSetup` y borra las clínicas de prueba en cascada; la base estaba
completamente vacía. El duplicado nacía y moría dentro de la misma tirada. La
hipótesis se sostenía sola hasta que se leyó `siembra-global.ts`.

---

## 4 · La prueba de las dos tiradas

El criterio que cerró el defecto A no fue «que pase», fue **«que dé el mismo
número dos veces seguidas»**. Una batería de seguridad cuyo recuento de fallos
cambia entre dos ejecuciones no demuestra nada, ni cuando falla ni cuando pasa.

```
tirada 1                          tirada 2
 Test Files  8 passed (8)          Test Files  8 passed (8)
      Tests  262 passed (262)           Tests  262 passed (262)
   Duration  26.10s                  Duration  27.11s
codigo de salida: 0               codigo de salida: 0

saltadas: 0                       saltadas: 0
```

Y la base a cero clínicas y cero usuarios al terminar las dos.

---

## 5 · La prueba de que la prueba sirve

**Este es el apartado que justifica la fase entera.** 262 en verde demuestran
que la suite *corre*. Solo esto demuestra que *mira*.

Se apagó a mano la RLS de una tabla:

```sql
alter table public.faq disable row level security;
```

Y se relanzó `pnpm vitest run tests/rls`:

```
 Test Files  2 failed | 5 passed (7)
      Tests  13 failed | 235 passed (248)
```

**Los 13 fallos, todos de `faq`.** Lo que se rompió:

| Garantía caída | Evidencia en la salida |
|---|---|
| El bot vio la fila con `publico = false` | devolvió `47e0aa43…` donde esperaba `[]` |
| **El marcador salió** | `"El margen es ZZMARGEN-7f3a."` dentro de lo que lee el bot |
| El bot de B leyó la FAQ de A | el `clinica_id` de A dentro del JSON del bot de B |
| El bot pudo INSERT, UPDATE y DELETE | los tres sin `42501` |
| El `WITH CHECK` dejó escribir en la clínica de al lado | `error?.code` → `undefined` |
| El rol lectura pudo crear | `undefined` en vez de `42501` |
| Recepción pudo borrar | devolvió la fila |

Y tres observaciones que valen tanto como los fallos:

**1 · `config` y `tratamientos` siguieron enteros en verde.** El fallo quedó
confinado a la tabla que se apagó. La suite no dispara a bulto.

**2 · `faq: anon no lee nada` se quedó VERDE con la puerta abierta.** A `anon`
se le revocaron los `GRANT` en la 004, así que no ve nada tampoco sin RLS.
**Una batería escrita con `anon` de probador habría certificado una base
insegura.** Por eso el probador principal es un `authenticated` de la otra
clínica. Esto estaba escrito como advertencia en un comentario desde el primer
día; ahora está medido.

**3 · Las 55 pruebas estáticas de `00-rls-activada.test.ts` pasaron.** Leen los
`.sql`, y los `.sql` seguían diciendo `enable row level security`. **La mitad
estática no puede ver esto ni en principio.** Justifica sola la existencia de
la mitad viva.

Y el arreglo C se pagó solo: `un clinica_id inexistente no abre ninguna puerta`
fue uno de los 13 — un token de bot para una clínica inexistente leyó las tres
filas de `faq`. Con el uuid nulo, ese test moría antes de tocar la base y este
fallo se habría perdido.

### 5.1 · El incidente: la base se quedó abierta

La restauración se ejecutó así, a mano:

```
PS> npm exec supabase db query --linked "alter table public.faq enable row level security;"
npm warn Unknown cli config "--linked". This will stop working in the next major version of npm.
Connecting to local database...
failed to connect to postgres: ... 127.0.0.1:54322
```

**`npm` en vez de `pnpm`.** npm se comió el `--linked` como config desconocida,
la CLI se fue a la base **local** —que no existe, no hay Docker— y el `enable`
**nunca llegó al proyecto remoto**. La RLS de `faq` se quedó apagada.

Lo detectó `supabase db advisors --linked --type security`, que devolvió dos
ERROR: `rls_disabled_in_public` y `policy_exists_rls_disabled`, este último
listando las cinco políticas que seguían ahí sin aplicarse.

Tres cosas que aprender de esto:

- **La asimetría es lo peligroso.** El comando que *abre* fue al remoto (con
  `pnpm`) y el que *cierra* fue a localhost (con `npm`). El error parecía de
  infraestructura, no de «has escrito mal el comando».
- **Por esto `CLAUDE.md` dice pnpm y nunca npm.** No es preferencia de estilo.
- **Una prueba que apaga una barandilla va en una sola orden con la
  restauración atada**, nunca en pasos sueltos:

  ```bash
  volver() { pnpm exec supabase db query --linked "alter table public.faq enable row level security;"; }
  trap volver EXIT
  pnpm exec supabase db query --linked "alter table public.faq disable row level security;"
  pnpm vitest run tests/rls
  ```

  Si el paso de en medio revienta, la RLS vuelve igual. En pasos sueltos, no.

### 5.2 · El cabo suelto: un verde que no lo era

En la tirada roja, un test se quedó en verde **sin derecho a hacerlo**:

```
✓ faq -> clinica_update: el rol lectura no puede cambiar nada
```

Con la RLS de `faq` apagada, el rol lectura conserva el `GRANT` de `UPDATE`
—verificado: no hay revocación de columna ni de tabla en la 004— así que ese
`update` tenía que haber tocado la fila y devuelto `[{id}]`.

**El diagnóstico, medido, no razonado.** Se apuntó el mismo test al usuario de
recepción:

```
RECEPCION  data = [{"id":"307cecf3-..."}]   error = null
LECTURA    data = []                        error = null
SELECT recepcion = [{"id":"307cecf3-..."}]
SELECT lectura   = [{"id":"307cecf3-..."}]
```

El mecanismo del test es **correcto**: el `WHERE` afina, recepción pasa, lectura
queda bloqueada. Y como los dos son el mismo rol de Postgres (`authenticated`)
con idénticos `GRANT`, lo único que puede separarlos es `puede_escribir()`
dentro de una política. La RLS sí estaba haciendo su trabajo.

**La causa real estaba doce líneas más arriba.** Reconstruida de la propia
salida roja:

1. `faq: el bot no tiene DELETE` **falló** devolviendo `[{"id":"37099d49…"}]`.
   Con la RLS apagada, el bot **borró de verdad** la FAQ pública.
2. `el rol lectura no puede cambiar nada` actualiza esa misma fila. Ya no
   existía. Cero filas → `[]` → **verde por ausencia, no por permiso**.
3. Lo corrobora un tercer fallo: `un propietario de otra clinica no ve nada de
   esta` devolvió **solo** la fila confidencial en vez de las dos, porque la
   pública ya estaba borrada.

**El test no estaba roto: era destructivo y no lo sabía.** Con la RLS puesta
borra cero filas y no pasa nada. El día que la barandilla cede —justo cuando
más falta hace poder fiarse del resto— arrasa el fixture y convierte los tests
siguientes en falsos verdes.

**El arreglo es el principio general que faltaba:**

> Una aserción negativa cuya única prueba es una lista vacía pasa igual si la
> fila no existe. Hay que exigir que exista.

Se añadió `exigirQueExista(tabla, id)` en `01-conocimiento.test.ts`, que
comprueba la fila **con `service_role`** —a propósito: no puede depender del rol
que se está probando, o volvería a confundir «no existe» con «no puedes»— y se
aplicó en los tres sitios cuya evidencia era «cero filas»:

- `el bot no tiene UPDATE` → antes de intentar
- `el bot no tiene DELETE` → **después**, que es lo que prueba que no borró nada
- `el rol lectura no puede cambiar nada` → antes de intentar

Y se comprobó que la guarda **dispara**: con la fila puesta pasa, con una fila
inexistente revienta con su mensaje. Cambiar un falso verde por otro habría
sido peor que no tocar nada.

Tirada final, con la RLS restaurada y la guarda dentro:

```
pnpm exec supabase db advisors --linked --type security --level info
  → No issues found

pnpm vitest run tests/rls
  → Test Files  7 passed (7)
          Tests  248 passed (248)
       Duration  23.41s
```

---

## 6 · Formas de que esto «funcione» sin servir

Las cinco previstas antes de empezar, más las que aparecieron por el camino:

| # | Fallo | Veredicto |
|---|---|---|
| 1 | El bot lee con un cliente que no es `bot.ts` y lo ve todo | ✓ **No ocurre.** No hay más código que los tres clientes, y `05-sin-service-role` lo vigila |
| 2 | El contador dice «16 de 16» habiendo filas confidenciales | ✓ **Cerrado en F2.** `tests/barandillas/03-filtro-y-contador.test.ts` cuenta el total con `service_role` y falla si el bot ve tantas como hay. Ver §10 |
| 3 | `consultar_huecos` ofrece huecos que `crear_cita` rechaza (el bug de V1) | ✓ **Cerrado.** El test corre en vivo y pasa |
| 4 | Un `UPDATE` del panel dice «guardado» y no guarda | ✓ **Cerrado.** Comprobado en vivo, rol por rol |
| 5 | Los tests pasan en verde con la RLS desactivada | ✓ **Cerrado en §5.** Se apagó y se pusieron rojos, en los sitios correctos |
| 6 | El sistema se sale del Art. 9 por `eventos_webhook.carga` y `escalados.resumen` | ✓ **Cerrado en el SQL y aplicado en la base** |
| 7 | Las 39 pruebas de la 007 demuestran que el SQL *dice* lo correcto, no que Postgres lo *acepte* | ✓ **Cerrado.** `db push` aplicó las siete |
| 8 | **Un test destructivo arrasa el fixture y pone en verde a los de detrás** | ✓ **Cerrado en §5.2.** Es el hallazgo más fino de la fase, y solo apareció al apagar la RLS |
| 9 | La suite da un número distinto cada vez y nadie se fía | ✓ **Cerrado en §4.** Dos tiradas, mismo número |

---

## 7 · Qué se decidió, y sobre todo qué se descartó

### ❌ Descartado: meter `clinica_id` en el `EXCLUDE` de `sin_solape`

Hoy `sin_solape` es global por `gabinete_id`: dos citas no pueden solapar en el
mismo sillón, venga la cita de donde venga. Si se le añadiera `clinica_id`, una
cita de la clínica A alojada en un gabinete de la clínica B **dejaría de chocar
con las citas reales de B**. Se cambiaría un bloqueo ruidoso —molesto, visible,
denunciable— por una **doble reserva silenciosa en un sillón de verdad**, con
dos pacientes presentándose a la misma hora.

Lo correcto es impedir que la fila mala exista, que es lo que hace la clave
foránea compuesta. `sin_solape` está en la lista de «no tocar sin confirmación»:
**no se ha tocado**, y hay un test estático que se pone rojo si alguien le mete
`clinica_id`.

### ❌ Descartado: `RESTRICT` para las claves foráneas de `citas`

`RESTRICT` y `NO ACTION` impiden lo mismo, pero **`RESTRICT` comprueba de
inmediato y `NO ACTION` al final de la sentencia**. Al borrar una clínica, la
cascada de `clinica_id` borra a la vez tratamientos, gabinetes y citas; con
`RESTRICT` la comprobación de `citas → tratamientos` saltaría antes de que las
citas se hubieran ido y la baja fallaría **siempre** — y con ella la limpieza de
todos los tests vivos. Las tres claves van a `NO ACTION`, y hay un test que da
de baja una clínica con una cita dentro (ver defecto F).

### ❌ Descartado: purgar `escalados` a los 90 días

`escalados` sobrevive al borrado **a propósito**: recepción necesita el
historial de casos resueltos.

### ✅ Elegido: vocabulario cerrado + puntero

`escalados.resumen` (texto libre escrito por el modelo) desaparece. En su lugar
`asunto public.motivo_visita` —**el mismo enum que `citas.motivo_cerrado`**— y
`mensaje_id bigint` con `on delete set null`. El detalle clínico vive en **un
solo sitio, y ese sitio es el que se borra**: cuando la purga se lleva el
mensaje a los 90 días, el puntero queda en null y el escalado sobrevive sin una
palabra de salud dentro.

### ✅ Elegido: vaciar `eventos_webhook.carga`, no borrar la fila

La carga cruda de Meta se pone a `null` a los **7 días**; la fila entera se
borra a los 90. Un reintento de Meta meses después se sigue reconociendo como
duplicado —la idempotencia la da `wa_event_id`— sin guardar una palabra de lo
que escribió nadie.

### ⚪ Se deja: el bloque `auth: {…}` de `bot.ts`

Verificado contra `@supabase/supabase-js@2.116.0`: cuando se pasa `accessToken`,
la librería sustituye todo el árbol `.auth` por un `Proxy` que lanza al tocarlo.
Es código muerto. Se deja escrito, con un comentario que lo dice, porque
describe lo que el bot **no** hace: ni guarda sesión, ni la refresca, ni lee
tokens de una URL.

---

## 8 · Lo que queda pendiente

**Ninguno bloquea F2.**

1. **El CI no impide mezclar.** `.github/workflows/ci.yml` tiene los dos
   trabajos, pero el paso manual no está dado: GitHub → Settings → Branches →
   ruleset sobre `main` → «Require status checks to pass» → marcar
   `comprobaciones-estaticas`.
2. **La mitad viva no corre en CI.** Necesita la variable de repositorio
   `RLS_VIVA=true` y los cuatro secretos `SUPABASE_{URL,ANON_KEY,
   SERVICE_ROLE_KEY,JWT_SECRET}_DEV`. Se prefirió que el trabajo falte a que
   salga verde sin haber comprobado nada.
3. **`bot-clinica-prod` no existe.** Hoy solo hay `bot-clinica-dev`. El segundo
   proyecto es de F9, y hace falta para que los tests no corran nunca contra
   datos de pacientes reales — la siembra crea cuatro usuarios con una
   contraseña escrita en el repositorio y, al limpiar, borra clínicas en
   cascada. El cerrojo `exigirBaseDeDesarrollo` existe justo por eso: no se fía
   del nombre del proyecto, mira si hay pacientes o citas que no sean de las
   clínicas de prueba y se niega a sembrar si los hay.

### Limitaciones conocidas

- `alter default privileges` solo cubre los objetos que cree el rol que lo
  ejecuta. Si un día alguien crea una función en `public` con otro rol, no le
  aplica.
- Que el bot lea toda su clínica y no solo su conversación es una decisión
  aplazada a **F3**: hoy la necesita para `repasar_ficha`.
- Que la pertenencia a la clínica viva solo en el JWT es de **F5**.

---

## 9 · Reglas del proyecto que siguen mandando

De `.claude/CLAUDE.md`, para no tener que releerlo entero:

- **No tocar sin confirmación explícita:** las políticas RLS de
  `supabase/migrations/`, los bloques de prompt de `contenido/bloques/`, el
  constraint `sin_solape`, y los tres clientes de Supabase.
- Nunca leer `.env` ni `.env.local` directamente. Mantener `.env.example` al día.
- RLS obligatoria en toda tabla nueva, **en la misma migración que la crea**.
- `service_role` jamás sale del servidor ni entra en `NEXT_PUBLIC_*`. Solo en
  migraciones, scripts de alta y teardown de pruebas; nunca en el camino del bot.
- `app_metadata`, nunca `user_metadata`. `WITH CHECK` en todo `INSERT`/`UPDATE`.
- Toda vista con `WITH (security_invoker = true)`.
- `proxy.ts`, **nunca** `middleware.ts`.
- **`pnpm`, nunca `npm` ni `yarn`.** Ver §5.1 para qué pasa cuando se olvida.
- `CURSO AGUSTIN MEDINA\PAGO` y `Bot Clinica Demo V1` son **solo lectura**.
- Antes de tocar un archivo, el contrato de cinco campos: ENTREGA, PRUEBA,
  LÍMITES, SUPUESTOS, FALLOS. Al cerrar se ejecuta PRUEBA y se pega la salida
  real; el contrato no se reescribe para que encaje con lo que salió.

---

## 10 · Lo que F2 cambió de F1, y por qué

Se anota aquí porque F1 estaba cerrada: quien lea este documento dentro de seis
meses tiene que saber que dos aserciones se movieron y dónde está el motivo.
**Ninguna garantía de seguridad cambió de sentido.** El diff completo es de dos
archivos.

### `tests/ayuda/siembra.ts` — la clínica A pasa a llevar el prompt de verdad

Los dos bloques de atrezo de F1 (`orden` 10 y 20, títulos «Quien es» y
«Borrador sin aprobar») se movieron a `orden` 900 y 910 con los títulos
`_atrezo rls activo` y `_atrezo rls inactivo`, y en su sitio se siembran los
diez bloques reales de `contenido/bloques/`, leídos por el mismo código que usa
`pnpm bloques`.

El guion bajo de delante no es decorativo: es lo que hace que el montador de F2
los descarte. Así el atrezo de las pruebas de RLS no se cuela en el prompt, y de
paso la regla del guion bajo queda comprobada contra datos que existen de
verdad en lugar de inventados.

`Sembrado` gana `configAPrivacidad`, `bloquesReales` y `bloquesRealesActivos`.

### `tests/rls/02-estructura.test.ts` — dos aserciones

**Una.** El bot ya no ve un bloque, ve nueve:

```diff
-  it('bloques_prompt_bot_select: el bot ve el bloque activo', async () => {
+  it('bloques_prompt_bot_select: el bot ve los bloques activos y solo esos', async () => {
-    expect(data).toHaveLength(1)
-    expect((data as { id: string }[])[0]!.id).toBe(s.bloqueAActivo)
+    expect(data).toHaveLength(s.bloquesRealesActivos + 1)
+    expect((data as { id: string }[]).map((f) => f.id)).toContain(s.bloqueAActivo)
```

El recuento **sigue siendo exacto**, no un `toBeGreaterThan`: si un bloque
inactivo se colara, el test sigue poniéndose rojo. Lo único que cambia es el
número esperado.

**Dos.** La restauración del título escribía un nombre que la fila no tenía:

```diff
     const propietario = await clienteUsuario(USUARIOS.aPropietario.email, CONTRASENA)
-      .update({ titulo: 'Quien es' })
+      .update({ titulo: '_atrezo rls activo' })
```

Esto es §5.2 otra vez, por el otro lado. El test comprueba que el propietario
**puede** editar, y para eso tiene que escribir algo; pero escribir «Quien es»
le quitaba el guion bajo a la fila y la metía en el prompt de las pruebas de F2
a partir de ese momento. Un test que deja el fixture distinto de como lo
encontró es destructivo aunque pase, y el daño aparece en el archivo de al lado.

> **La regla, generalizada:** un test que escribe para demostrar que se puede
> escribir tiene que escribir **el valor que ya estaba**. Si no, no está
> comprobando un permiso: está cambiando el mundo para los que vienen detrás.

### Lo que NO se tocó

Ni una migración, ni una política RLS, ni `sin_solape`, ni los tres clientes de
Supabase. Sigue habiendo **cero funciones `SECURITY DEFINER`**: el contador de
la barandilla 2 se diseñó para no necesitar ninguna (ver `contador.ts`, la
cabecera explica qué significa exactamente cada número y por qué el total de
verdad se cuenta en la prueba y no en ejecución).

### Un guardián nuevo, hermano del de `service_role`

`tests/barandillas/04-sin-filtro-en-codigo.test.ts`, mismo patrón que
`tests/rls/05-sin-service-role.test.ts`: estático, sin base de datos, corre en
`comprobaciones-estaticas`.

Prohíbe que el camino del bot filtre por `publico` o por `clinica_id` **en la
consulta**. Existe porque ese cambio es el único que puede dejar ciegas a las
dos barandillas a la vez sin poner roja ni una prueba en vivo:

| | Con la RLS rota y SIN `.eq('publico', true)` | Con la RLS rota y CON él |
|---|---|---|
| `retenidas` | 1 → **salta la alarma** | 0 → silencio |
| Prueba obligatoria | pasa (la guardia hizo su trabajo) | pasa |
| ¿Alguien se entera? | **sí** | **no** |

El sistema seguiría siendo seguro por casualidad —nada confidencial llegaría al
prompt—, pero la barandilla 2 habría dejado de servir para lo único que sirve.
El síntoma que buscan las pruebas en vivo es justo el que ese `.eq` borra, así
que solo se puede cazar leyendo el código.

Comprobado que muerde: se le añadió el `.eq('publico', true)` a `filtro.ts` —con
la restauración atada en la misma orden, §5.1— y se puso rojo nombrando archivo
y hallazgo. Y tiene las dos mitades: prohíbe el filtro en la consulta **y exige
que sigan estando las tres comprobaciones en código**, porque una prueba que
solo prohíbe algo pasa igual con el archivo vacío.

Se extiende solo: considera «camino del bot» todo `src/lib/barandillas/` más
cualquier archivo de `src/` que use `crearClienteBot`. Las seis herramientas de
F3 entrarán en la lista el día que lo importen, sin que nadie tenga que
acordarse de venir aquí.
