# Estado de F1 · Base de datos y RLS

> **Para quien retome F1**, en una conversación nueva o dentro de seis meses.
> Fecha: 16 de septiembre de 2026. Rama: `f1-base-de-datos-y-rls`.
>
> **F1 no está terminada.** El SQL está escrito y las comprobaciones que no
> necesitan base de datos están en verde, pero **ningún Postgres ha leído
> todavía una sola línea de estas migraciones**. La sección [Lo que falta por
> correr en vivo](#lo-que-falta-por-correr-en-vivo) tiene los comandos exactos.

---

## 1 · Qué se ha hecho

### Las siete migraciones

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
| `20260916100700_integridad.sql` | 423 | Los arreglos de la segunda auditoría (ver §3) |

Invariantes que se cumplen hoy, todas comprobadas por un test estático:

- **15 tablas, 15 con RLS activada.** Y dos veces: junto a cada `create table`
  (lo exige `CLAUDE.md`) y otra vez de forma idempotente al principio de la 004
  (lo pedía el encargo). Activarla dos veces no da error.
- **67 políticas, ninguna `FOR ALL`, todas `TO authenticated`.** Una por tabla y
  comando. Todo `UPDATE` lleva su `WITH CHECK` y su política de `SELECT`
  correspondiente — sin la segunda, la actualización devuelve cero filas en
  silencio y el panel diría «guardado» sin guardar.
- **Cero funciones `SECURITY DEFINER` en todo el proyecto.** No hizo falta
  ninguna: `pg_cron` ejecuta el job como `postgres`, que ya tiene `BYPASSRLS`.
- **Ni una aparición de `user_metadata`.** Solo `app_metadata`, que el usuario
  no puede editar.
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

Y para escribir, `USING` y `WITH CHECK` con el mismo cuerpo:

```sql
create policy faq_clinica_update on public.faq
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );
```

El `(select …)` **no es estilo**. Sin el subselect, la función se evalúa una vez
por fila en lugar de una vez por consulta.

### Los tres clientes

`src/lib/supabase/`, en la lista de «no tocar sin confirmación» de `CLAUDE.md`.

- `navegador.ts` — `createBrowserClient`, clave anónima, para el panel.
- `servidor.ts` — `createServerClient` de `@supabase/ssr` con cookies, para
  Server Components. El `setAll` va en `try/catch` porque desde un Server
  Component no se pueden escribir cabeceras; las escribirá `proxy.ts`
  (**nunca** `middleware.ts`: en Next.js 16 se ignora en silencio y las rutas
  quedan públicas sin error).
- `bot.ts` — JWT propio firmado con `jose`, HS256, `app_metadata {rol:'bot',
  clinica_id}`, caducidad 5 minutos, caché por proceso con 30 s de margen.
  `service_role` no aparece aquí ni en ningún archivo del camino del bot, y hay
  un test que recorre `src/` para comprobarlo.

### Las pruebas

`tests/`, Vitest, **262 pruebas** en 8 archivos. Tienen dos mitades y solo una
necesita base de datos:

- **Estática** (93 pruebas, corren siempre): leen los `.sql` y comprueban que
  ninguna tabla se quedó sin RLS, que ninguna política es `FOR ALL`, que todo
  `UPDATE` lleva `WITH CHECK`, que `escalados` no tiene columnas de texto libre,
  que `service_role` no está en el camino del bot.
- **Viva** (169 pruebas, hoy saltadas): se conectan como cada rol y comprueban,
  tabla por tabla, qué ve y qué no.

Detalle que importa y que es fácil estropear: **el probador principal de los
tests vivos es un cliente `authenticated` de la otra clínica, no `anon`.** A
`anon` se le han revocado los `GRANT`, así que un test hecho con `anon` seguiría
en verde con la RLS apagada — pasaría por el motivo equivocado.

### CI

`.github/workflows/ci.yml`, dos trabajos:

- `comprobaciones-estaticas` — siempre: lint, `tsc --noEmit`, vitest, build.
- `rls-viva` — solo si existe la variable de repositorio `RLS_VIVA=true` y los
  cuatro secretos `SUPABASE_{URL,ANON_KEY,SERVICE_ROLE_KEY,JWT_SECRET}_DEV`.
  Preferimos que el trabajo falte a que salga verde sin haber comprobado nada.

**Que esto impida mezclar una rama es un paso manual que no está dado:**
Settings → Branches → ruleset sobre `main` → «Require status checks to pass» →
marcar `comprobaciones-estaticas`.

> **La primera ejecución ya sirvió para algo.** Falló con
> `TS2304: Cannot find name 'LayoutProps'`. Ese tipo lo genera Next en
> `.next/types`, que en una máquina de desarrollo ya existe de un build
> anterior: `tsc` pasaba en local y fallaba en un clon recién hecho.
> Reproducido borrando `.next`. Arreglado con un paso `next typegen` antes de
> `tsc`. Es justo la clase de fallo que ningún test estático puede encontrar.

---

## 2 · Primera ronda: revisión propia

Durante la construcción, tres guardas se dispararon contra mi propia prosa, y
en los tres casos **se reescribió el texto en vez de ablandar el test**:

1. `SECURITY DEFINER` aparecía dentro del literal de un `COMMENT ON SCHEMA`.
2. `SERVICE_ROLE` aparecía en las cabeceras de `navegador.ts` y `servidor.ts`.
3. `user_metadata` aparecía en un comentario de `bot.ts`.

Además se resolvieron dos contradicciones entre el encargo y `CLAUDE.md`
(dónde va `enable row level security`, y que `clinicas` es la única tabla sin
`clinica_id` porque **es** la raíz del inquilino), y se descubrió que
`001_extensiones.sql` no es un nombre válido para `supabase db push`.

Hallazgos de fondo de esta ronda: la debilidad de las claves foráneas entre
inquilinos, y que cuatro comentarios afirmaban «esto bloquea el merge en CI»
cuando **no existía ningún CI** — comprobado: no había `.github/`.

---

## 3 · Segunda ronda: auditoría de seguridad

Lanzada como agente aparte con el encargo de comprobar, tabla por tabla, que
ninguna se hubiera quedado sin RLS.

> **Nota sobre el agente.** `revisor-seguridad` no está registrado como tipo de
> agente en esta sesión (el directorio de trabajo no tiene el `.claude/agents/`
> del proyecto). Su encargo se pasó literal a un agente `general-purpose`.

**Veredicto: NO APTO.** Ningún hallazgo 🔴 crítico.

El censo salió limpio: 15/15 tablas con RLS, 67 políticas, ninguna `FOR ALL`,
todas `TO authenticated`, ningún `UPDATE` sin su `SELECT`, cero `user_metadata`,
cero `SECURITY DEFINER`, y los dos RPC no sirven para cruzar clínicas. También
confirmó que al JWT del bot no le falta ningún claim para PostgREST.

El «no apto» vino de otro sitio:

| # | Sev. | Hallazgo | Estado |
|---|---|---|---|
| A-1 | 🟠 | `eventos_webhook.carga` guarda el cuerpo crudo de Meta, con el texto del paciente dentro, y la purga no lo tocaba nunca | **Arreglado** (007 §4) |
| A-2 | 🟠 | `escalados.resumen` era texto libre escrito por el modelo, y `escalados` sobrevive al borrado a propósito | **Arreglado** (007 §1) |
| A-3 | 🟠 | Integridad entre inquilinos: una cita podía apuntar al gabinete de otra clínica | **Arreglado** (007 §3) |
| A-4 | 🟠 | Los tests dan verde y código 0 sin base de datos, y no hay CI | **CI montado; la mitad viva sigue sin correr** |
| — | 🟡 | Borrar un paciente arrastraba sus citas en cascada, saltándose los dos cerrojos que impiden borrar citas | **Arreglado** (007 §3) |
| — | 🟡 | `alter default privileges … revoke all on functions from anon` no quita lo que `anon` hereda de `PUBLIC` | **Arreglado** (007 §5) |
| — | 🔵 | `crearClienteBot` firmaba sin validar que el `clinica_id` fuera un uuid | **Arreglado** (`bot.ts`) |
| — | 🔵 | La siembra creaba cuatro usuarios con contraseña conocida contra el proyecto al que apuntara `.env.local` | **Arreglado** (`siembra.ts`) |
| B-1 | ⚪ | El bloque `auth: {…}` de `bot.ts` es código muerto | **Verificado, se deja** (ver §4) |

**A-1 y A-2 eran el hallazgo grave de verdad.** La cabecera de la migración 006
afirmaba que el historial desaparece a los 90 días y que por eso el sistema no
trata datos de salud. Era falso por dos sitios. «Le duele el 26 y tiene la cara
hinchada» es Art. 9 del RGPD, y con `urgencia_grave` entre los motivos de
escalado ese texto se quedaba para siempre.

Aplazados por fase, no por desacuerdo:

- Que el bot lea toda su clínica y no solo su conversación es una decisión de
  **F3**: hoy la necesita para `repasar_ficha`.
- Que la pertenencia a la clínica viva solo en el JWT es de **F5**.

---

## 4 · Qué se decidió, y sobre todo qué se descartó

### ❌ Descartado: meter `clinica_id` en el `EXCLUDE` de `sin_solape`

**Era la propuesta de la auditoría para A-3, y es peor que el problema.**

Hoy `sin_solape` es global por `gabinete_id`: dos citas no pueden solapar en el
mismo sillón, venga la cita de donde venga. Si se le añadiera `clinica_id`, una
cita de la clínica A alojada en un gabinete de la clínica B **dejaría de chocar
con las citas reales de B**. Se cambiaría un bloqueo ruidoso —molesto, visible,
denunciable— por una **doble reserva silenciosa en un sillón de verdad**, con
dos pacientes presentándose a la misma hora.

Lo correcto es impedir que la fila mala exista, que es lo que hace la clave
foránea compuesta. Una vez puesta, `clinica_id` sobra en el `EXCLUDE`.

`sin_solape` está además en la lista de «no tocar sin confirmación explícita» de
`CLAUDE.md`. **No se ha tocado**, y hay un test estático que se pone rojo si
alguien le mete `clinica_id`.

### ❌ Descartado: `RESTRICT` para las claves foráneas de `citas`

La corrección de A-3 y del 🟡 del cascade pedía impedir que borrar un padre se
llevara las citas. La opción obvia era `ON DELETE RESTRICT`. **Habría roto dar
de baja una clínica.**

`RESTRICT` y `NO ACTION` impiden lo mismo, pero **`RESTRICT` comprueba de
inmediato y `NO ACTION` al final de la sentencia**. Al borrar una clínica, la
cascada de `clinica_id` borra a la vez tratamientos, gabinetes y citas; con
`RESTRICT` la comprobación de `citas → tratamientos` saltaría antes de que las
citas se hubieran ido y la baja fallaría **siempre** — y con ella la limpieza de
todos los tests vivos. Con `NO ACTION`, al final de la sentencia ya no queda
ninguna cita apuntando y pasa.

Las tres claves de `citas` (`paciente_id`, `tratamiento_id`, `gabinete_id`) van
a `NO ACTION`. Hay un test que da de baja una clínica con una cita dentro.

### ❌ Descartado: purgar `escalados` a los 90 días

Era la otra salida para A-2. No vale: `escalados` sobrevive al borrado **a
propósito**, porque recepción necesita el historial de casos resueltos, y
durante esa ventana el dato de salud seguiría viviendo fuera de `mensajes` sin
necesidad.

### ✅ Elegido: vocabulario cerrado + puntero

`escalados.resumen` (texto libre) desaparece. En su lugar:

- `asunto public.motivo_visita` — **el mismo enum que `citas.motivo_cerrado`**,
  no uno nuevo. `motivo` sigue diciendo *por qué* hubo que avisar al equipo;
  `asunto` dice *de qué* iba.
- `mensaje_id bigint` con `on delete set null` — un puntero al mensaje que
  disparó el escalado. Recepción lo abre y lee la conversación entera mientras
  exista; cuando la purga se lleva el mensaje a los 90 días, el puntero queda en
  null y el escalado sobrevive sin una palabra de salud dentro.

El detalle clínico pasa a vivir en **un solo sitio, y ese sitio es el que se
borra**. Tras esto, la afirmación de la migración 006 se sostiene.

### ✅ Elegido: vaciar `eventos_webhook.carga`, no borrar la fila

La carga cruda de Meta se pone a `null` a los **7 días**; la fila entera se
borra a los 90. Así un reintento de Meta meses después sigue reconociéndose como
duplicado —la idempotencia la da `wa_event_id`, que se conserva— sin guardar una
palabra de lo que escribió nadie.

### ✅ Elegido: migración nueva, no reescribir las seis

`20260916100700_integridad.sql`. El historial de migraciones aplicadas queda
limpio y es más fácil de auditar que reescribir las anteriores.

### ⚪ Se deja: el bloque `auth: {…}` de `bot.ts`

Verificado contra el código de `@supabase/supabase-js@2.116.0`: cuando se pasa
`accessToken`, la librería sustituye todo el árbol `.auth` por un `Proxy` que
lanza al tocarlo, y esas tres opciones no llegan a leerse. Es código muerto.

Se deja escrito, con un comentario que lo dice, porque describe lo que el bot
**no** hace: ni guarda sesión, ni la refresca, ni lee tokens de una URL. Además
`bot.ts` está en la lista de «no tocar sin confirmación».

---

## 5 · Lo que falta por correr en vivo

**Ninguno de estos comandos se ha ejecutado.** Salida real del intento:

```
supabase link        → LegacyPlatformAuthRequiredError: Access token not provided.
                        Supply an access token by running `supabase login` [...]
supabase db push     → LegacyProjectNotLinkedError: Cannot find project ref.
                        Have you run supabase link?
supabase db advisors → LegacyDbConnectError: failed to connect to postgres:
                        dial error ECONNREFUSED 127.0.0.1:54322
```

No hay `.env.local`, ni `SUPABASE_ACCESS_TOKEN`, ni Docker, ni `psql` en la
máquina. `supabase login` abre el navegador y espera un token: es interactivo.

### Paso 0 · A mano, una vez

1. Crear el proyecto en el panel de Supabase, **región EU (Fráncfort)** — por
   RGPD, no es opcional. Recomendación: dos proyectos, `bot-clinica-dev` ahora y
   `bot-clinica-prod` en F9, para que los tests nunca corran contra datos de
   pacientes reales.
2. Crear `.env.local` en la raíz con estas cuatro claves (están vacías y
   comentadas en `.env.example`):

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   SUPABASE_JWT_SECRET=
   SUPABASE_PROJECT_REF=
   ```

   `SUPABASE_JWT_SECRET` está en Settings → API → JWT Settings. **Nunca** en un
   `NEXT_PUBLIC_*`.

### Paso 1 · Los cinco comandos

```bash
cd "C:\Users\chica\Desktop\Bot Clinica WhatsApp"

# 1 · Enlazar (interactivo: pide la contraseña de la base de datos)
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref>

# 2 · Aplicar las siete migraciones
pnpm exec supabase db push
pnpm exec supabase migration list        # las siete, marcadas como aplicadas

# 3 · Generar los tipos (src/tipos/bd.ts es hoy un MARCADOR, no tipos reales)
pnpm tipos
pnpm exec tsc --noEmit

# 4 · Asesor de seguridad: no debe quedar ninguna alerta de RLS
pnpm exec supabase db advisors

# 5 · Las 262 pruebas corriendo de verdad, ninguna saltada
pnpm vitest run tests/
```

### Paso 2 · La prueba de que la prueba sirve

```sql
alter table public.faq disable row level security;
```

Volver a lanzar `pnpm vitest run tests/rls`: **tiene que ponerse rojo.**
Después revertir con `enable`. Sin este paso no sabemos si los tests vivos
comprueban algo.

### Paso 3 · Que el CI signifique lo que dice

En GitHub: Settings → Branches → nuevo ruleset sobre `main` → «Require status
checks to pass» → marcar `comprobaciones-estaticas`. Opcionalmente, variable
`RLS_VIVA=true` y los cuatro secretos `*_DEV` para que corra también la mitad
viva.

---

## 6 · Supuestos sin verificar

Todos caen o se confirman en el primer `db push`. Están numerados para poder
tacharlos:

1. El proyecto es **PostgreSQL 15 o superior** — hace falta para
   `on delete set null (columna)`. La migración 007 lo comprueba y aborta con un
   mensaje legible si no.
2. `btree_gist` soporta `uuid with =` (lo necesita `sin_solape`).
3. `pg_cron` se puede activar desde una migración en el plan gratuito.
4. El secreto HS256 sigue firmando tokens que PostgREST acepta, pese a que
   Supabase ya recomiende claves asimétricas.
5. `supabase gen types --project-id` funciona sin Docker (va por la Management
   API; la variante `--local` sí lo exige).
6. Revocar los `GRANT` de `anon` y el `EXECUTE` de `PUBLIC` no rompe nada.
7. Las nueve claves foráneas compuestas no chocan con ninguna fila existente.
   Contra una base vacía es trivial; contra una con datos, no.

**Limitación conocida:** `alter default privileges` solo cubre los objetos que
cree el rol que lo ejecuta. Si un día alguien crea una función en `public` con
otro rol, no le aplica. La migración 004 ya tenía esa misma forma para `anon`.

---

## 7 · Formas de que esto «funcione» sin servir

Las cinco previstas antes de empezar, con veredicto de hoy:

| # | Fallo | Veredicto |
|---|---|---|
| 1 | El bot lee con un cliente que no es `bot.ts` y lo ve todo | ✓ **No ocurre.** No hay más código que los tres clientes, y `05-sin-service-role` lo vigila |
| 2 | El contador dice «16 de 16» habiendo filas confidenciales | — **No evaluable**, el contador es F2 |
| 3 | `consultar_huecos` ofrece huecos que `crear_cita` rechaza (el bug de V1) | ✗ **Sin demostrar.** El test existe y está entre los saltados |
| 4 | Un `UPDATE` del panel dice «guardado» y no guarda | ✗ **Sin demostrar en vivo.** El test estático pasa; el comportamiento no se ha probado |
| 5 | Los tests pasan en verde con la RLS desactivada | ✗ **SIGUE OCURRIENDO.** 169 de 262 saltadas |

Y dos más, aparecidos después:

| # | Fallo | Veredicto |
|---|---|---|
| 6 | El sistema se sale del Art. 9 por `eventos_webhook.carga` y `escalados.resumen` | ✓ **Cerrado en el SQL**, sin comprobar en la base |
| 7 | Las 39 pruebas de la 007 demuestran que el SQL **dice** lo correcto; ninguna demuestra que Postgres lo **acepte**. Un `do $$` mal formado o un `format()` con los argumentos cambiados pasa los 34 tests estáticos y revienta en el `db push` | ⚠ **Abierto.** Es el riesgo principal de este commit |

---

## 8 · Última salida real de las comprobaciones

```
pnpm lint              → $ eslint            (sin hallazgos)
pnpm exec tsc --noEmit → (sin salida)
pnpm vitest run        → Test Files  3 passed | 5 skipped (8)
                          Tests  93 passed | 169 skipped (262)
pnpm build             → ✓ Compiled successfully in 914ms
```

Y en CI, sobre un clon limpio (run 35139838028):

```
✓ comprobaciones-estaticas in 56s
  ✓ Estilo · ✓ Tipos de las rutas · ✓ Tipos · ✓ Pruebas · ✓ Compilacion
- rls-viva in 0s          (saltado: falta la variable RLS_VIVA)
```

---

## 9 · Reglas del proyecto que siguen mandando

De `.claude/CLAUDE.md`, para no tener que releerlo entero:

- **No tocar sin confirmación explícita:** las políticas RLS de
  `supabase/migrations/`, los bloques de prompt de `contenido/bloques/`, el
  constraint `sin_solape`, y los tres clientes de Supabase con su separación de
  roles.
- Nunca leer `.env` ni `.env.local` directamente. Mantener `.env.example` al día
  con las claves vacías.
- RLS obligatoria en toda tabla nueva, **en la misma migración que la crea**.
- `service_role` jamás sale del servidor ni entra en `NEXT_PUBLIC_*`. Solo en
  migraciones y scripts de alta; nunca en el camino del bot.
- `app_metadata`, nunca `user_metadata`. `WITH CHECK` en todo `INSERT`/`UPDATE`.
- Toda vista con `WITH (security_invoker = true)`.
- `proxy.ts`, **nunca** `middleware.ts`.
- `pnpm`, nunca `npm` ni `yarn`.
- `CURSO AGUSTIN MEDINA\PAGO` y `Bot Clinica Demo V1` son **solo lectura**.
- Antes de tocar un archivo, el contrato de cinco campos: ENTREGA, PRUEBA,
  LÍMITES, SUPUESTOS, FALLOS. Al cerrar se ejecuta PRUEBA y se pega la salida
  real; el contrato no se reescribe para que encaje con lo que salió.
